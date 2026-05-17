import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { WebSocket } from 'ws';
import { SystemConfig } from '../config/SystemConfig';

export type DesignAssistantSelectionKind = 'element' | 'region';
export type DesignAssistantRequestStatus = 'pending' | 'claimed' | 'responded' | 'applied' | 'cancelled';

export interface DesignAssistantCapture {
    id: string;
    tabId: number | null;
    url: string;
    title: string;
    viewport: Record<string, unknown>;
    screenshotPath: string | null;
    screenshotUri: string | null;
    screenshotMime: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface DesignAssistantSelection {
    id: string;
    captureId: string | null;
    tabId: number | null;
    url: string;
    kind: DesignAssistantSelectionKind;
    selector: string;
    label: string;
    role: string;
    text: string;
    bounds: Record<string, unknown>;
    computedStyles: Record<string, unknown>;
    structure: Record<string, unknown>;
    screenshotCropPath: string | null;
    screenshotCropUri: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface DesignAssistantRequest {
    id: string;
    captureId: string | null;
    selectionId: string | null;
    status: DesignAssistantRequestStatus;
    instruction: string;
    constraints: string[];
    targetProjectRoot: string;
    designSourceIds: string[];
    payload: Record<string, unknown>;
    claimedBy: string | null;
    claimedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface DesignAssistantResponse {
    id: string;
    requestId: string;
    source: string;
    status: string;
    message: string;
    artifacts: unknown[];
    createdAt: string;
}

export interface DesignAssistantBridgeOptions {
    artifactRoot?: string;
}

type CaptureRow = {
    id: string;
    tab_id: number | null;
    url: string;
    title: string | null;
    viewport_json: string;
    screenshot_path: string | null;
    screenshot_uri: string | null;
    screenshot_mime: string | null;
    metadata_json: string;
    created_at: string;
};

type SelectionRow = {
    id: string;
    capture_id: string | null;
    tab_id: number | null;
    url: string;
    kind: DesignAssistantSelectionKind;
    selector: string | null;
    label: string | null;
    role: string | null;
    text: string | null;
    bounds_json: string;
    computed_styles_json: string;
    structure_json: string;
    screenshot_crop_path: string | null;
    screenshot_crop_uri: string | null;
    metadata_json: string;
    created_at: string;
};

type RequestRow = {
    id: string;
    capture_id: string | null;
    selection_id: string | null;
    status: DesignAssistantRequestStatus;
    instruction: string;
    constraints_json: string;
    target_project_root: string | null;
    design_source_ids_json: string;
    payload_json: string;
    claimed_by: string | null;
    claimed_at: string | null;
    created_at: string;
    updated_at: string;
};

type ResponseRow = {
    id: string;
    request_id: string;
    source: string;
    status: string;
    message: string;
    artifacts_json: string;
    created_at: string;
};

const DEFAULT_ARTIFACT_ROOT = 'backend/data/design-assistant';
const VALID_SELECTION_KINDS = new Set(['element', 'region']);
const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/;

export class DesignAssistantBridgeService {
    private readonly db: Database.Database;
    private readonly artifactRoot: string;
    private readonly clients = new Set<WebSocket>();

    constructor(db: Database.Database, options: DesignAssistantBridgeOptions = {}) {
        this.db = db;
        this.artifactRoot = SystemConfig.resolve(options.artifactRoot || DEFAULT_ARTIFACT_ROOT);
        fs.mkdirSync(this.artifactRoot, { recursive: true });
        fs.mkdirSync(path.join(this.artifactRoot, 'captures'), { recursive: true });
        fs.mkdirSync(path.join(this.artifactRoot, 'selections'), { recursive: true });
        this.db.pragma('foreign_keys = ON');
        this.ensureSchema();
    }

    saveCapture(input: {
        tabId?: number | null;
        url?: string;
        title?: string;
        viewport?: Record<string, unknown>;
        screenshotDataUrl?: string;
        metadata?: Record<string, unknown>;
    }): DesignAssistantCapture {
        const id = idFor('dac');
        const screenshot = this.persistDataUrl(input.screenshotDataUrl, 'captures', id);
        const row = this.db.prepare(`
            INSERT INTO design_assistant_captures (
                id, tab_id, url, title, viewport_json, screenshot_path, screenshot_uri, screenshot_mime, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            id,
            normalizeTabId(input.tabId),
            cleanString(input.url),
            cleanString(input.title),
            JSON.stringify(input.viewport || {}),
            screenshot?.relativePath || null,
            screenshot?.uri || null,
            screenshot?.mime || null,
            JSON.stringify(input.metadata || {})
        ) as CaptureRow;

        this.setState('active_tab', {
            tabId: normalizeTabId(input.tabId),
            url: cleanString(input.url),
            title: cleanString(input.title),
            captureId: id,
            viewport: input.viewport || {},
            updatedAt: new Date().toISOString()
        });

        const capture = mapCapture(row);
        this.broadcast('capture.created', { capture });
        return capture;
    }

    saveSelection(input: {
        captureId?: string | null;
        tabId?: number | null;
        url?: string;
        kind: DesignAssistantSelectionKind;
        selector?: string;
        label?: string;
        role?: string;
        text?: string;
        bounds?: Record<string, unknown>;
        computedStyles?: Record<string, unknown>;
        structure?: Record<string, unknown>;
        screenshotCropDataUrl?: string;
        metadata?: Record<string, unknown>;
    }): DesignAssistantSelection {
        if (input.captureId) this.assertCapture(input.captureId);
        const kind = assertSelectionKind(input.kind);
        const id = idFor('das');
        const crop = this.persistDataUrl(input.screenshotCropDataUrl, 'selections', id);
        const row = this.db.prepare(`
            INSERT INTO design_assistant_selections (
                id, capture_id, tab_id, url, kind, selector, label, role, text,
                bounds_json, computed_styles_json, structure_json,
                screenshot_crop_path, screenshot_crop_uri, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            id,
            input.captureId || null,
            normalizeTabId(input.tabId),
            cleanString(input.url),
            kind,
            cleanString(input.selector),
            cleanString(input.label, `${kind} selection`),
            cleanString(input.role),
            cleanString(input.text),
            JSON.stringify(input.bounds || {}),
            JSON.stringify(input.computedStyles || {}),
            JSON.stringify(input.structure || {}),
            crop?.relativePath || null,
            crop?.uri || null,
            JSON.stringify(input.metadata || {})
        ) as SelectionRow;

        this.setState('latest_selection', { selectionId: id, updatedAt: new Date().toISOString() });

        const selection = mapSelection(row);
        this.broadcast('selection.created', { selection });
        return selection;
    }

    createDesignRequest(input: {
        captureId?: string | null;
        selectionId?: string | null;
        instruction?: string;
        constraints?: unknown[];
        targetProjectRoot?: string;
        designSourceIds?: unknown[];
        payload?: Record<string, unknown>;
    }): DesignAssistantRequest {
        if (input.captureId) this.assertCapture(input.captureId);
        if (input.selectionId) this.assertSelection(input.selectionId);
        const instruction = cleanString(input.instruction);
        if (!instruction) throw new Error('instruction is required');

        const id = idFor('dar');
        const row = this.db.prepare(`
            INSERT INTO design_assistant_requests (
                id, capture_id, selection_id, status, instruction, constraints_json,
                target_project_root, design_source_ids_json, payload_json
            ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            id,
            input.captureId || null,
            input.selectionId || null,
            instruction,
            JSON.stringify(uniqueStrings(input.constraints || [])),
            cleanString(input.targetProjectRoot),
            JSON.stringify(uniqueStrings(input.designSourceIds || [])),
            JSON.stringify(input.payload || {})
        ) as RequestRow;

        const request = mapRequest(row);
        this.broadcast('request.created', { request });
        return request;
    }

    listPendingRequests(limit = 20): DesignAssistantRequest[] {
        return (this.db.prepare(`
            SELECT * FROM design_assistant_requests
            WHERE status='pending'
            ORDER BY created_at ASC
            LIMIT ?
        `).all(limit) as RequestRow[]).map(mapRequest);
    }

    claimNextRequest(claimedBy = 'codex'): DesignAssistantRequest | null {
        const claim = this.db.transaction(() => {
            const pending = this.db.prepare(`
                SELECT * FROM design_assistant_requests
                WHERE status='pending'
                ORDER BY created_at ASC
                LIMIT 1
            `).get() as RequestRow | undefined;
            if (!pending) return null;

            this.db.prepare(`
                UPDATE design_assistant_requests
                SET status='claimed', claimed_by=?, claimed_at=datetime('now'), updated_at=datetime('now')
                WHERE id=? AND status='pending'
            `).run(cleanString(claimedBy, 'codex'), pending.id);

            return this.getRequest(pending.id);
        });

        const request = claim();
        if (request) this.broadcast('request.claimed', { request });
        return request;
    }

    getRequest(requestId: string): DesignAssistantRequest | null {
        const row = this.db.prepare('SELECT * FROM design_assistant_requests WHERE id=?').get(requestId) as RequestRow | undefined;
        return row ? mapRequest(row) : null;
    }

    getRequestPacket(requestId: string): Record<string, unknown> | null {
        const request = this.getRequest(requestId);
        if (!request) return null;
        const capture = request.captureId ? this.getCapture(request.captureId) : null;
        const selection = request.selectionId ? this.getSelection(request.selectionId) : null;
        const responses = this.listResponses(request.id);
        return {
            schema: 'design-assistant.codex-work-packet.v1',
            request,
            capture,
            selection,
            responses,
            codexInstruction: [
                'Use this browser-side visual evidence as the input for repo-aware implementation work.',
                request.targetProjectRoot ? `Target project root: ${request.targetProjectRoot}` : 'Target project root: infer from active Codex workspace.',
                request.instruction,
                'The Chrome extension never mutates source files. Codex owns implementation, verification, and response posting.'
            ].join('\n')
        };
    }

    postResponse(input: {
        requestId: string;
        source?: string;
        status?: string;
        message?: string;
        artifacts?: unknown[];
    }): DesignAssistantResponse {
        const request = this.getRequest(input.requestId);
        if (!request) throw new Error('request not found');
        const id = idFor('dares');
        const row = this.db.prepare(`
            INSERT INTO design_assistant_responses (id, request_id, source, status, message, artifacts_json)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            id,
            request.id,
            cleanString(input.source, 'codex'),
            cleanString(input.status, 'ok'),
            cleanString(input.message),
            JSON.stringify(Array.isArray(input.artifacts) ? input.artifacts : [])
        ) as ResponseRow;

        if (request.status !== 'applied') {
            this.db.prepare(`
                UPDATE design_assistant_requests SET status='responded', updated_at=datetime('now') WHERE id=?
            `).run(request.id);
        }

        const response = mapResponse(row);
        this.broadcast('response.created', { response, request: this.getRequest(request.id) });
        return response;
    }

    markApplied(requestId: string, notes = ''): DesignAssistantRequest {
        const request = this.getRequest(requestId);
        if (!request) throw new Error('request not found');
        this.db.prepare(`
            UPDATE design_assistant_requests SET status='applied', updated_at=datetime('now') WHERE id=?
        `).run(request.id);
        this.postResponse({
            requestId: request.id,
            source: 'codex',
            status: 'applied',
            message: notes || 'Marked applied.',
            artifacts: []
        });
        const updated = this.getRequest(request.id);
        if (!updated) throw new Error('request not found');
        this.broadcast('request.applied', { request: updated });
        return updated;
    }

    getActiveTab(): Record<string, unknown> | null {
        const state = this.getState('active_tab');
        if (state) return state;
        const capture = this.db.prepare(`
            SELECT * FROM design_assistant_captures ORDER BY created_at DESC LIMIT 1
        `).get() as CaptureRow | undefined;
        return capture ? { tabId: capture.tab_id, url: capture.url, title: capture.title || '', captureId: capture.id } : null;
    }

    getLatestSelection(): DesignAssistantSelection | null {
        const row = this.db.prepare(`
            SELECT * FROM design_assistant_selections ORDER BY created_at DESC LIMIT 1
        `).get() as SelectionRow | undefined;
        return row ? mapSelection(row) : null;
    }

    getCapture(captureId: string): DesignAssistantCapture | null {
        const row = this.db.prepare('SELECT * FROM design_assistant_captures WHERE id=?').get(captureId) as CaptureRow | undefined;
        return row ? mapCapture(row) : null;
    }

    getSelection(selectionId: string): DesignAssistantSelection | null {
        const row = this.db.prepare('SELECT * FROM design_assistant_selections WHERE id=?').get(selectionId) as SelectionRow | undefined;
        return row ? mapSelection(row) : null;
    }

    listResponses(requestId: string): DesignAssistantResponse[] {
        return (this.db.prepare(`
            SELECT * FROM design_assistant_responses WHERE request_id=? ORDER BY created_at ASC
        `).all(requestId) as ResponseRow[]).map(mapResponse);
    }

    listMcpResources(): Array<{ uri: string; name: string; mimeType: string; description: string }> {
        const captures = this.db.prepare(`
            SELECT id, title, url FROM design_assistant_captures ORDER BY created_at DESC LIMIT 20
        `).all() as Array<{ id: string; title: string | null; url: string }>;
        return [
            {
                uri: 'design-assistant://active-tab',
                name: 'Active browser tab',
                mimeType: 'application/json',
                description: 'Latest tab metadata observed by the Chrome Design Assistant.'
            },
            {
                uri: 'design-assistant://latest-selection',
                name: 'Latest browser selection',
                mimeType: 'application/json',
                description: 'Most recent selected element or region.'
            },
            {
                uri: 'design-assistant://requests/pending',
                name: 'Pending design requests',
                mimeType: 'application/json',
                description: 'Unclaimed browser-originated design work queue.'
            },
            ...captures.map((capture) => ({
                uri: `design-assistant://captures/${capture.id}`,
                name: capture.title || capture.url || capture.id,
                mimeType: 'application/json',
                description: 'Screenshot capture and viewport evidence.'
            }))
        ];
    }

    readMcpResource(uri: string): unknown {
        if (uri === 'design-assistant://active-tab') return this.getActiveTab();
        if (uri === 'design-assistant://latest-selection') return this.getLatestSelection();
        if (uri === 'design-assistant://requests/pending') return this.listPendingRequests();
        const captureMatch = uri.match(/^design-assistant:\/\/captures\/([^/]+)$/);
        if (captureMatch) return this.getCapture(captureMatch[1]);
        throw new Error(`unsupported resource: ${uri}`);
    }

    searchHistory(query: string, limit = 20): {
        requests: DesignAssistantRequest[];
        responses: DesignAssistantResponse[];
    } {
        const pattern = `%${cleanString(query).replace(/[%_]/g, '\\$&')}%`;
        const requests = (this.db.prepare(`
            SELECT * FROM design_assistant_requests
            WHERE instruction LIKE ? ESCAPE '\\' OR payload_json LIKE ? ESCAPE '\\'
            ORDER BY updated_at DESC
            LIMIT ?
        `).all(pattern, pattern, limit) as RequestRow[]).map(mapRequest);
        const responses = (this.db.prepare(`
            SELECT * FROM design_assistant_responses
            WHERE message LIKE ? ESCAPE '\\' OR artifacts_json LIKE ? ESCAPE '\\'
            ORDER BY created_at DESC
            LIMIT ?
        `).all(pattern, pattern, limit) as ResponseRow[]).map(mapResponse);
        return { requests, responses };
    }

    handleWebSocketConnection(ws: WebSocket): void {
        this.clients.add(ws);
        ws.send(JSON.stringify({
            type: 'design-assistant.connected',
            payload: {
                activeTab: this.getActiveTab(),
                latestSelection: this.getLatestSelection(),
                pendingRequests: this.listPendingRequests()
            }
        }));
        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));
    }

    broadcast(type: string, payload: Record<string, unknown>): void {
        const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }

    private assertCapture(captureId: string): DesignAssistantCapture {
        const capture = this.getCapture(captureId);
        if (!capture) throw new Error('capture not found');
        return capture;
    }

    private assertSelection(selectionId: string): DesignAssistantSelection {
        const selection = this.getSelection(selectionId);
        if (!selection) throw new Error('selection not found');
        return selection;
    }

    private persistDataUrl(dataUrl: string | undefined, folder: 'captures' | 'selections', id: string): { relativePath: string; uri: string; mime: string } | null {
        if (!dataUrl) return null;
        const match = dataUrl.match(DATA_URL_PATTERN);
        if (!match) throw new Error('screenshot data URL must be base64 encoded');
        const mime = match[1];
        const ext = extensionForMime(mime);
        const fileName = `${id}.${ext}`;
        const absolutePath = path.join(this.artifactRoot, folder, fileName);
        fs.writeFileSync(absolutePath, Buffer.from(match[2], 'base64'));
        const relativePath = path.relative(SystemConfig.ROOT, absolutePath);
        const publicRelative = path.relative(this.artifactRoot, absolutePath).split(path.sep).join('/');
        return {
            relativePath,
            uri: `/api/design-assistant/files/${publicRelative}`,
            mime
        };
    }

    private setState(key: string, value: Record<string, unknown>): void {
        this.db.prepare(`
            INSERT INTO design_assistant_state (key, value_json, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=datetime('now')
        `).run(key, JSON.stringify(value));
    }

    private getState(key: string): Record<string, unknown> | null {
        const row = this.db.prepare('SELECT value_json FROM design_assistant_state WHERE key=?').get(key) as { value_json: string } | undefined;
        return row ? parseJsonObject(row.value_json) : null;
    }

    private ensureSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS design_assistant_state (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_assistant_captures (
                id TEXT PRIMARY KEY,
                tab_id INTEGER,
                url TEXT NOT NULL,
                title TEXT DEFAULT '',
                viewport_json TEXT NOT NULL DEFAULT '{}',
                screenshot_path TEXT,
                screenshot_uri TEXT,
                screenshot_mime TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_assistant_selections (
                id TEXT PRIMARY KEY,
                capture_id TEXT REFERENCES design_assistant_captures(id) ON DELETE SET NULL,
                tab_id INTEGER,
                url TEXT NOT NULL,
                kind TEXT NOT NULL,
                selector TEXT DEFAULT '',
                label TEXT DEFAULT '',
                role TEXT DEFAULT '',
                text TEXT DEFAULT '',
                bounds_json TEXT NOT NULL DEFAULT '{}',
                computed_styles_json TEXT NOT NULL DEFAULT '{}',
                structure_json TEXT NOT NULL DEFAULT '{}',
                screenshot_crop_path TEXT,
                screenshot_crop_uri TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_assistant_requests (
                id TEXT PRIMARY KEY,
                capture_id TEXT REFERENCES design_assistant_captures(id) ON DELETE SET NULL,
                selection_id TEXT REFERENCES design_assistant_selections(id) ON DELETE SET NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                instruction TEXT NOT NULL,
                constraints_json TEXT NOT NULL DEFAULT '[]',
                target_project_root TEXT DEFAULT '',
                design_source_ids_json TEXT NOT NULL DEFAULT '[]',
                payload_json TEXT NOT NULL DEFAULT '{}',
                claimed_by TEXT,
                claimed_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_assistant_responses (
                id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL REFERENCES design_assistant_requests(id) ON DELETE CASCADE,
                source TEXT NOT NULL DEFAULT 'codex',
                status TEXT NOT NULL DEFAULT 'ok',
                message TEXT NOT NULL DEFAULT '',
                artifacts_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_design_assistant_captures_created ON design_assistant_captures(created_at);
            CREATE INDEX IF NOT EXISTS idx_design_assistant_selections_capture ON design_assistant_selections(capture_id);
            CREATE INDEX IF NOT EXISTS idx_design_assistant_requests_status_created ON design_assistant_requests(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_design_assistant_responses_request ON design_assistant_responses(request_id);
        `);
    }
}

function idFor(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function cleanString(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeTabId(tabId: unknown): number | null {
    return Number.isInteger(tabId) ? tabId as number : null;
}

function uniqueStrings(values: unknown[]): string[] {
    return [...new Set(values.map((value) => cleanString(value)).filter(Boolean))];
}

function assertSelectionKind(value: unknown): DesignAssistantSelectionKind {
    const kind = cleanString(value);
    if (VALID_SELECTION_KINDS.has(kind)) return kind as DesignAssistantSelectionKind;
    throw new Error(`unsupported selection kind: ${kind}`);
}

function parseJsonObject(value: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function parseJsonArray(value: string): string[] {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? uniqueStrings(parsed) : [];
    } catch {
        return [];
    }
}

function parseJsonUnknownArray(value: string): unknown[] {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function extensionForMime(mime: string): string {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    return 'png';
}

function mapCapture(row: CaptureRow): DesignAssistantCapture {
    return {
        id: row.id,
        tabId: row.tab_id,
        url: row.url,
        title: row.title || '',
        viewport: parseJsonObject(row.viewport_json),
        screenshotPath: row.screenshot_path,
        screenshotUri: row.screenshot_uri,
        screenshotMime: row.screenshot_mime,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at
    };
}

function mapSelection(row: SelectionRow): DesignAssistantSelection {
    return {
        id: row.id,
        captureId: row.capture_id,
        tabId: row.tab_id,
        url: row.url,
        kind: row.kind,
        selector: row.selector || '',
        label: row.label || '',
        role: row.role || '',
        text: row.text || '',
        bounds: parseJsonObject(row.bounds_json),
        computedStyles: parseJsonObject(row.computed_styles_json),
        structure: parseJsonObject(row.structure_json),
        screenshotCropPath: row.screenshot_crop_path,
        screenshotCropUri: row.screenshot_crop_uri,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at
    };
}

function mapRequest(row: RequestRow): DesignAssistantRequest {
    return {
        id: row.id,
        captureId: row.capture_id,
        selectionId: row.selection_id,
        status: row.status,
        instruction: row.instruction,
        constraints: parseJsonArray(row.constraints_json),
        targetProjectRoot: row.target_project_root || '',
        designSourceIds: parseJsonArray(row.design_source_ids_json),
        payload: parseJsonObject(row.payload_json),
        claimedBy: row.claimed_by,
        claimedAt: row.claimed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapResponse(row: ResponseRow): DesignAssistantResponse {
    return {
        id: row.id,
        requestId: row.request_id,
        source: row.source,
        status: row.status,
        message: row.message,
        artifacts: parseJsonUnknownArray(row.artifacts_json),
        createdAt: row.created_at
    };
}
