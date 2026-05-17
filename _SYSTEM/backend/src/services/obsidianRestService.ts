import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import https from 'https';
import path from 'path';
import tls from 'tls';
import dotenv from 'dotenv';
import { SystemConfig } from '../config/SystemConfig';

dotenv.config();

type ObsidianConnectorState =
    | 'initializing'
    | 'connected'
    | 'offline'
    | 'cert_untrusted'
    | 'missing_api_key';

type ConnectorFailure = {
    code: string | null;
    message: string;
    state: Exclude<ObsidianConnectorState, 'connected' | 'initializing'>;
    url: string;
};

type ObsidianWorkspaceSnapshot = {
    active?: string;
    lastOpenFiles?: unknown[];
    main?: unknown;
};

type ActiveFileDescriptor = {
    path: string;
    mode: 'rest' | 'file';
    source: 'rest' | 'workspace_active' | 'workspace_recent';
};

const TLS_ERROR_CODES = new Set([
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID'
]);

function splitPemCertificates(content: string): string[] {
    const matches = content.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    return matches ? matches.map((entry) => entry.trim()).filter(Boolean) : [];
}

function dedupeCertificates(certificates: string[]): string[] {
    return [...new Set(certificates.map((entry) => entry.trim()).filter(Boolean))];
}

/**
 * ObsidianRestService
 * Interfaces with the 'Obsidian Local REST API' plugin.
 * Provides advanced vault control beyond simple file-system access.
 */
export class ObsidianRestService {
    private client: AxiosInstance;
    private apiKey: string;
    private baseUrl: string;
    private lastPingTime: number = 0;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private state: ObsidianConnectorState = 'initializing';
    private lastErrorCode: string | null = null;
    private lastErrorMessage: string | null = null;
    private lastFailureUrl: string | null = null;
    private lastFailureAt: string | null = null;
    private readonly cacheTtl = 15000;
    private readonly allowInsecureTls = process.env.OBSIDIAN_REST_ALLOW_INSECURE_TLS === 'true';
    private readonly explicitCaBundlePath = (process.env.OBSIDIAN_REST_CA_BUNDLE_PATH || process.env.OBSIDIAN_REST_CA_FILE || '').trim();
    private readonly caBundlePath: string | null;
    private readonly trustSource: string;
    private readonly trustedCaCertificates: string[] | null;
    private readonly workspaceCandidatePaths: string[];

    constructor() {
        this.apiKey = process.env.OBSIDIAN_REST_API_KEY || '';
        const port = process.env.OBSIDIAN_REST_API_PORT || '27124';
        this.baseUrl = `https://127.0.0.1:${port}`;
        this.workspaceCandidatePaths = [
            SystemConfig.resolve('.obsidian/workspace.json')
        ];

        const trustConfig = this.resolveTrustConfiguration(port);
        this.trustedCaCertificates = trustConfig.certificates;
        this.caBundlePath = trustConfig.bundlePath;
        this.trustSource = trustConfig.source;
        
        // Initial placeholder client
        this.client = this.buildClient(this.baseUrl, 2000);

        if (!this.apiKey) {
            this.state = 'missing_api_key';
            console.warn('⬡ OBSIDIAN_REST_API_KEY is missing in .env');
        } else {
            void this.initClient().then(success => {
                if (!success) {
                    console.warn('⬡ OBSIDIAN_REST_API :: Exhausted all protocols. Still offline.');
                }
            });
        }

        if (this.allowInsecureTls) {
            console.warn('⬡ OBSIDIAN_REST_API :: Insecure TLS validation enabled for local development.');
        } else if (this.trustSource !== 'default') {
            console.log(`⬡ OBSIDIAN_REST_API :: Trust source ${this.trustSource}${this.caBundlePath ? ` (${this.caBundlePath})` : ''}`);
        }
    }

    private buildClient(url: string, timeout: number): AxiosInstance {
        const httpsOptions: https.AgentOptions = {
            rejectUnauthorized: !this.allowInsecureTls
        };

        if (!this.allowInsecureTls && this.trustedCaCertificates && this.trustedCaCertificates.length > 0) {
            httpsOptions.ca = this.trustedCaCertificates;
        }

        return axios.create({
            baseURL: url,
            timeout,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            httpsAgent: new https.Agent(httpsOptions)
        });
    }

    private resolveTrustConfiguration(port: string) {
        const defaultCertificates = Array.isArray(tls.rootCertificates) ? tls.rootCertificates : [];
        const systemCertificates = typeof tls.getCACertificates === 'function'
            ? tls.getCACertificates('system')
            : [];

        const pluginCertificate = this.extractPluginCertificate(port);

        let bundlePath: string | null = null;
        let source = systemCertificates.length > 0 ? 'default+system' : 'default';
        const certificates = [...defaultCertificates, ...systemCertificates];

        if (this.explicitCaBundlePath) {
            const fileCertificates = this.readCertificateFile(this.explicitCaBundlePath);
            if (fileCertificates.length > 0) {
                bundlePath = this.explicitCaBundlePath;
                source = systemCertificates.length > 0 ? 'bundle+default+system' : 'bundle+default';
                certificates.push(...fileCertificates);
            } else {
                console.warn(`⬡ OBSIDIAN_REST_API :: Configured CA bundle not found or invalid at ${this.explicitCaBundlePath}`);
            }
        } else if (pluginCertificate) {
            bundlePath = pluginCertificate.sourcePath;
            source = systemCertificates.length > 0 ? 'plugin-data+default+system' : 'plugin-data+default';
            certificates.push(pluginCertificate.cert);
        }

        const deduped = dedupeCertificates(certificates);
        return {
            certificates: deduped.length > 0 ? deduped : null,
            bundlePath,
            source
        };
    }

    private readCertificateFile(filePath: string): string[] {
        try {
            if (!fs.existsSync(filePath)) return [];
            const content = fs.readFileSync(filePath, 'utf8');
            return splitPemCertificates(content);
        } catch {
            return [];
        }
    }

    private extractPluginCertificate(port: string) {
        const candidatePaths = [
            SystemConfig.resolve('.obsidian/plugins/obsidian-local-rest-api/data.json')
        ];

        for (const candidatePath of candidatePaths) {
            try {
                if (!fs.existsSync(candidatePath)) continue;

                const raw = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as {
                    port?: number;
                    apiKey?: string;
                    crypto?: { cert?: string };
                };

                const portMatches = String(raw.port || '') === String(port);
                const keyMatches = Boolean(raw.apiKey && this.apiKey && raw.apiKey === this.apiKey);
                const cert = raw.crypto?.cert?.trim();

                if (!cert || (!portMatches && !keyMatches)) continue;

                return {
                    cert,
                    sourcePath: candidatePath
                };
            } catch {
                // Ignore malformed plugin config and continue discovery.
            }
        }

        return null;
    }

    private readJsonFile<T>(filePath: string): T | null {
        try {
            if (!fs.existsSync(filePath)) return null;
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    private loadWorkspaceSnapshot(): ObsidianWorkspaceSnapshot | null {
        for (const candidatePath of this.workspaceCandidatePaths) {
            const snapshot = this.readJsonFile<ObsidianWorkspaceSnapshot>(candidatePath);
            if (snapshot) return snapshot;
        }
        return null;
    }

    private findWorkspaceFileById(node: unknown, targetId: string): string | null {
        if (!node || typeof node !== 'object') return null;

        if (Array.isArray(node)) {
            for (const entry of node) {
                const match = this.findWorkspaceFileById(entry, targetId);
                if (match) return match;
            }
            return null;
        }

        const record = node as Record<string, unknown>;
        if (record.id === targetId) {
            const state = record.state as Record<string, unknown> | undefined;
            const nestedState = state?.state as Record<string, unknown> | undefined;
            const file = nestedState?.file;
            if (typeof file === 'string' && file.trim()) {
                return file.trim().replace(/\\/g, '/');
            }
        }

        for (const value of Object.values(record)) {
            const match = this.findWorkspaceFileById(value, targetId);
            if (match) return match;
        }

        return null;
    }

    private resolveWorkspaceActiveFile(): ActiveFileDescriptor | null {
        const snapshot = this.loadWorkspaceSnapshot();
        if (!snapshot) return null;

        const activeId = typeof snapshot.active === 'string' ? snapshot.active : '';
        if (activeId) {
            const activePath = this.findWorkspaceFileById(snapshot.main, activeId);
            if (activePath) {
                return {
                    path: activePath,
                    mode: 'file',
                    source: 'workspace_active'
                };
            }
        }

        if (Array.isArray(snapshot.lastOpenFiles)) {
            for (const candidate of snapshot.lastOpenFiles) {
                if (typeof candidate !== 'string') continue;
                const normalized = candidate.trim().replace(/\\/g, '/');
                if (normalized.endsWith('.md')) {
                    return {
                        path: normalized,
                        mode: 'file',
                        source: 'workspace_recent'
                    };
                }
            }
        }

        return null;
    }

    private async resolveRestActiveFile(): Promise<ActiveFileDescriptor | null> {
        try {
            const response = await this.client.get('/active/');
            const data = response.data as { path?: string };
            if (typeof data?.path === 'string' && data.path.trim()) {
                return {
                    path: data.path.trim().replace(/\\/g, '/'),
                    mode: 'rest',
                    source: 'rest'
                };
            }
        } catch {
            // Fall through to file-backed workspace recovery.
        }

        return this.resolveWorkspaceActiveFile();
    }

    private normalizeFailure(error: any, url: string): ConnectorFailure {
        const code = typeof error?.code === 'string' ? error.code : null;
        const message = typeof error?.message === 'string' ? error.message : 'UNKNOWN_OBSIDIAN_ERROR';
        const lowerMessage = message.toLowerCase();
        const isTlsTrustError = TLS_ERROR_CODES.has(code || '')
            || lowerMessage.includes('self-signed certificate')
            || lowerMessage.includes('unable to verify')
            || lowerMessage.includes('certificate');

        if (!this.apiKey) {
            return {
                code,
                message,
                state: 'missing_api_key',
                url
            };
        }

        return {
            code,
            message,
            state: isTlsTrustError ? 'cert_untrusted' : 'offline',
            url
        };
    }

    private applyFailure(failure: ConnectorFailure) {
        this.isConnected = false;
        this.state = failure.state;
        this.lastErrorCode = failure.code;
        this.lastErrorMessage = failure.message;
        this.lastFailureUrl = failure.url;
        this.lastFailureAt = new Date().toISOString();
    }

    private markConnected(url: string) {
        this.baseUrl = url;
        this.isConnected = true;
        this.state = 'connected';
        this.lastErrorCode = null;
        this.lastErrorMessage = null;
        this.lastFailureUrl = null;
        this.lastFailureAt = null;
        this.reconnectAttempts = 0;
    }

    private async initClient() {
        if (!this.apiKey) {
            this.state = 'missing_api_key';
            return false;
        }

        const ports = [process.env.OBSIDIAN_REST_API_PORT || '27124', '27123'];
        const protocols = ['https', 'http'];
        let trustFailure: ConnectorFailure | null = null;
        let lastFailure: ConnectorFailure | null = null;
        
        for (const port of ports) {
            for (const protocol of protocols) {
                const url = `${protocol}://127.0.0.1:${port}`;
                const testClient = this.buildClient(url, 2000);

                try {
                    await testClient.get('/');
                    this.client = testClient;
                    this.markConnected(url);
                    console.log(`⬡ OBSIDIAN_CONNECTOR :: Bound to ${url}`);
                    return true;
                } catch (error) {
                    const failure = this.normalizeFailure(error, url);
                    lastFailure = failure;
                    if (failure.state === 'cert_untrusted' && !trustFailure) {
                        trustFailure = failure;
                    }
                }
            }
        }

        if (trustFailure) {
            this.applyFailure(trustFailure);
        } else if (lastFailure) {
            this.applyFailure(lastFailure);
        }

        return false;
    }

    public async reconnect(): Promise<boolean> {
        return this.initClient();
    }

    public async reconnectWithBackoff(maxAttempts: number = 5, initialDelayMs: number = 1000): Promise<boolean> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            this.reconnectAttempts = attempt;
            if (await this.initClient()) {
                return true;
            }

            const backoffMs = initialDelayMs * Math.pow(2, attempt - 1);
            console.warn(`⬡ OBSIDIAN_RECONNECT :: Attempt ${attempt}/${maxAttempts} failed, retrying in ${backoffMs}ms`);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }

        return false;
    }

    public getStatus() {
        const workspaceActiveFile = this.resolveWorkspaceActiveFile();
        const mode = this.isConnected ? 'rest' : (workspaceActiveFile ? 'file' : 'offline');
        return {
            state: this.state,
            connected: this.isConnected,
            mode,
            baseUrl: this.baseUrl,
            reconnectAttempts: this.reconnectAttempts,
            allowInsecureTls: this.allowInsecureTls,
            trustSource: this.trustSource,
            caBundlePath: this.caBundlePath,
            lastErrorCode: this.lastErrorCode,
            lastErrorMessage: this.lastErrorMessage,
            lastFailureUrl: this.lastFailureUrl,
            lastFailureAt: this.lastFailureAt,
            apiKeyConfigured: Boolean(this.apiKey),
            workspaceFallbackAvailable: Boolean(workspaceActiveFile),
            workspaceActiveFile: workspaceActiveFile?.path || null
        };
    }

    /**
     * Check if the API is reachable with sliding cache to prevent flickering
     */
    async ping(): Promise<boolean> {
        const now = Date.now();
        if (this.isConnected && (now - this.lastPingTime < this.cacheTtl)) {
            return true;
        }

        try {
            await this.client.get('/', { timeout: 2000 });
            this.isConnected = true;
            this.state = 'connected';
            this.lastPingTime = now;
            this.lastErrorCode = null;
            this.lastErrorMessage = null;
            this.lastFailureUrl = null;
            this.lastFailureAt = null;
            return true;
        } catch (error) {
            const failure = this.normalizeFailure(error, this.baseUrl);
            this.applyFailure(failure);
            if (!this.resolveWorkspaceActiveFile()) {
                console.error(`⬡ OBSIDIAN_REST_${failure.state.toUpperCase()} [${this.baseUrl}] ::`, failure.message);
            }
            return false;
        }
    }


    /**
     * Get the active file in the Obsidian UI
     */
    async getActiveFile(): Promise<any> {
        if (!this.isConnected && this.resolveWorkspaceActiveFile()) {
            const fallback = this.resolveWorkspaceActiveFile();
            if (fallback) {
                return {
                    path: fallback.path,
                    mode: fallback.mode,
                    source: fallback.source,
                    title: path.basename(fallback.path, path.extname(fallback.path)) || path.basename(fallback.path)
                };
            }
        }

        const activeFile = await this.resolveRestActiveFile();
        if (activeFile) {
            return {
                path: activeFile.path,
                mode: activeFile.mode,
                source: activeFile.source,
                title: path.basename(activeFile.path, path.extname(activeFile.path)) || path.basename(activeFile.path)
            };
        }

        return null;
    }

    /**
     * Open a file in the Obsidian UI
     */
    async openFile(path: string): Promise<void> {
        if (!(this.isConnected || await this.ping())) {
            console.warn(`⬡ OBSIDIAN_OPEN_FILE_SKIPPED :: REST offline, cannot open ${path}`);
            return;
        }

        await this.client.post(`/open/${encodeURIComponent(path)}`);
    }

    /**
     * Execute an Obsidian command by ID
     */
    async executeCommand(commandId: string): Promise<void> {
        if (!(this.isConnected || await this.ping())) {
            console.warn(`⬡ OBSIDIAN_COMMAND_SKIPPED :: REST offline, cannot execute ${commandId}`);
            return;
        }

        await this.client.post(`/commands/${encodeURIComponent(commandId)}/`);
    }

    /**
     * List all available commands
     */
    async listCommands(): Promise<any[]> {
        if (!(this.isConnected || await this.ping())) {
            return [];
        }

        const response = await this.client.get('/commands/');
        return response.data.commands;
    }

    /**
     * List vault roots that are available to the bridge.
     */
    async listVaults(): Promise<Array<{ path: string; label: string; mode: string }>> {
        const status = this.getStatus();
        return [
            {
                path: SystemConfig.ROOT,
                label: 'NUDIMMUD',
                mode: status.mode
            }
        ];
    }

    /**
     * Restart sync hooks or reconnect the REST bridge when necessary.
     */
    async restartSync(): Promise<{ success: boolean; mode: string }> {
        const status = this.getStatus();
        if (status.mode !== 'offline') {
            return { success: true, mode: status.mode };
        }

        const success = await this.reconnectWithBackoff(2, 500);
        return { success, mode: this.getStatus().mode };
    }

    /**
     * Compatibility probe for UI routes.
     */
    async testConnection(): Promise<{ connected: boolean; mode: string; fallback: boolean }> {
        const pingOk = await this.ping();
        const status = this.getStatus();
        return {
            connected: pingOk || status.mode !== 'offline',
            mode: status.mode,
            fallback: Boolean(status.workspaceFallbackAvailable)
        };
    }

    /**
     * Run a Dataview DQL query
     */
    async queryDataview(dql: string): Promise<any> {
        if (!(this.isConnected || await this.ping())) {
            return [];
        }

        const response = await this.client.post('/search/', dql, {
            headers: {
                'Content-Type': 'application/vnd.olrapi.dataview.dql+txt'
            }
        });
        return response.data;
    }

    /**
     * Read a note with full metadata
     */
    async readNote(path: string): Promise<string> {
        if (!this.isConnected && this.resolveWorkspaceActiveFile()) {
            const resolvedPath = SystemConfig.resolve(path);
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`VAULT_FILE_NOT_FOUND: ${path}`);
            }

            return fs.readFileSync(resolvedPath, 'utf8');
        }

        try {
            if (this.isConnected || await this.ping()) {
                const response = await this.client.get(`/vault/${encodeURIComponent(path)}`);
                return response.data;
            }
        } catch {
            // Fall back to disk-backed vault access.
        }

        const resolvedPath = SystemConfig.resolve(path);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`VAULT_FILE_NOT_FOUND: ${path}`);
        }

        return fs.readFileSync(resolvedPath, 'utf8');
    }

    /**
     * Patch a note (append/prepend/replace sections)
     */
    async patchNote(path: string, options: {
        operation: 'append' | 'prepend' | 'replace',
        targetType: 'heading' | 'block' | 'frontmatter',
        target: string,
        content: string
    }): Promise<void> {
        if (!(this.isConnected || await this.ping())) {
            throw new Error(`OBSIDIAN_REST_OFFLINE: cannot patch ${path}`);
        }

        await this.client.patch(`/vault/${encodeURIComponent(path)}`, options.content, {
            headers: {
                'Operation': options.operation,
                'Target-Type': options.targetType,
                'Target': options.target,
                'Content-Type': 'text/plain'
            }
        });
    }
}

export const obsidianRest = new ObsidianRestService();
