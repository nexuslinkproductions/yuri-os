import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import express from 'express';
import { WebSocketServer } from 'ws';
import cors, { CorsOptions } from 'cors';
import http from 'http';
import net from 'net';
import { URL } from 'url';
import { SystemConfig } from './config/SystemConfig';
import { authMiddleware, getRuntimeApiKey } from './middleware/auth';
import { initDatabase, LATEST_SCHEMA_VERSION } from './models/database';
import {
    getAllAgents,
    recordTelemetry,
    logEvent,
    getRecentEvents,
    clearRecentEvents
} from './models/queries';
import {
    runVaultIngestion,
    getIngestionStats,
    getVaultIngestionStatus
} from './services/vaultIngestion';
import { initVaultWatcher, VaultWatcherController } from './services/vaultWatcher';
import { syncOutlookIcs } from './services/outlookIcs';
import { getTokenMetrics } from './services/metrics';
import { initApiRoutes } from './routes/api';
import { obsidianRest } from './services/obsidianRestService';
import { neuralForge } from './services/neuralForgeService';
import { StabilityGuard } from './services/stabilityGuard';
import { EventBus } from './conclave/EventBus';
import { SessionRuntimeService } from './services/sessionRuntimeService';
import { DesignAssistantBridgeService } from './services/designAssistantBridgeService';
import { initColdAcquisitionCrmRoutes } from './routes/coldAcquisitionCrmRoutes';

dotenv.config();

function isTruthy(v: string | undefined): boolean {
    return v === '1' || v === 'true';
}

const isTestMode = isTruthy(process.env.YURI_TEST_MODE);
const suppressWatchers = isTestMode || isTruthy(process.env.YURI_DISABLE_WATCHERS);
const suppressIntervals = isTestMode || isTruthy(process.env.YURI_DISABLE_INTERVALS);
const suppressSwarm = isTestMode || isTruthy(process.env.YURI_DISABLE_SWARM_ORCHESTRATOR);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const PUBLIC_CORS_ORIGINS = new Set(
    String(process.env.COLD_ACQ_ALLOWED_ORIGINS || process.env.COLD_ACQ_PUBLIC_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
);
const HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.PORT || 3004);
const MAX_PORT = DEFAULT_PORT + 10;
const GITNEXUS_MCP_CHECK_SCRIPT = path.resolve(__dirname, '../..', 'Scripts/gitnexus-mcp-check.mjs');
const GITNEXUS_MCP_CHECK_TIMEOUT_MS = 5000;
const DB_RECOVERY_DIR = path.resolve(__dirname, '../..', '_SYSTEM/recovery/backend-db');
const PORT_CANDIDATES = [
    DEFAULT_PORT,
    DEFAULT_PORT + 1,
    DEFAULT_PORT - 1,
    ...Array.from({ length: Math.max(0, MAX_PORT - DEFAULT_PORT - 1) }, (_, index) => DEFAULT_PORT + index + 2)
].filter((port, index, ports) => port > 0 && ports.indexOf(port) === index);
const LOG_DIR = SystemConfig.resolve(SystemConfig.SYSTEM.LOGS);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const bootLog = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(path.join(LOG_DIR, 'boot.log'), entry);
    } catch {
        // Ignore log file write errors and continue with console logging.
    }
    console.log(msg);
};

process.on('uncaughtException', (err) => {
    bootLog(`⬡ FATAL_UNCAUGHT_EXCEPTION: ${err.message}\n${err.stack}`);
    void gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    bootLog(`⬡ FATAL_UNHANDLED_REJECTION: ${reason}`);
    void gracefulShutdown('unhandledRejection');
});

bootLog('⬡ YURI_SERVER_IGNITING...');
bootLog('⬡ AUTH_RUNTIME_READY :: Local bootstrap token initialized');

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
let wss: WebSocketServer | null = null;
const db = initDatabase();
const guard = new StabilityGuard(db);
const sessionRuntime = new SessionRuntimeService(db);
const designAssistantBridge = new DesignAssistantBridgeService(db);

let shuttingDown = false;
let currentPort = DEFAULT_PORT;
let vaultWatcherController: VaultWatcherController | null = null;
let backgroundServicesStarted = false;

const trackedTimeouts = new Set<NodeJS.Timeout>();
const trackedIntervals = new Set<NodeJS.Timeout>();
const runtimeMetrics = {
    requestCount: 0,
    errorCount: 0,
    latencyTotalMs: 0,
    maxLatencyMs: 0,
    lastStatusCode: null as number | null,
    lastRequestAt: null as string | null,
    lastErrorAt: null as string | null,
    statusCodes: {} as Record<string, number>
};

function trackTimeout(handle: NodeJS.Timeout) {
    trackedTimeouts.add(handle);
    return handle;
}

function trackInterval(handle: NodeJS.Timeout) {
    trackedIntervals.add(handle);
    return handle;
}

function clearTrackedTimers() {
    for (const timeout of trackedTimeouts) clearTimeout(timeout);
    for (const interval of trackedIntervals) clearInterval(interval);
    trackedTimeouts.clear();
    trackedIntervals.clear();
}

function isRecoverableListenError(error: unknown): error is NodeJS.ErrnoException {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['EADDRINUSE', 'EPERM', 'EACCES'].includes(String((error as NodeJS.ErrnoException).code))
    );
}

function canBindPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = net.createServer();

        const cleanup = () => {
            probe.removeAllListeners('error');
            probe.removeAllListeners('listening');
        };

        probe.once('error', () => {
            cleanup();
            resolve(false);
        });

        probe.once('listening', () => {
            cleanup();
            probe.close(() => resolve(true));
        });

        try {
            probe.listen(port, HOST);
        } catch {
            cleanup();
            resolve(false);
        }
    });
}

function listenOnPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const handleError = (error: NodeJS.ErrnoException) => {
            server.off('listening', handleListening);
            reject(error);
        };

        const handleListening = () => {
            server.off('error', handleError);
            resolve();
        };

        server.once('error', handleError);
        server.once('listening', handleListening);

        try {
            server.listen(port, HOST);
        } catch (error) {
            server.off('error', handleError);
            server.off('listening', handleListening);
            reject(error);
        }
    });
}

function isAllowedCorsOrigin(origin: string, req?: express.Request) {
    try {
        const parsed = new URL(origin);
        if (parsed.protocol === 'chrome-extension:') return true;
        if (PUBLIC_CORS_ORIGINS.has(origin)) return true;
        if (isTruthy(process.env.COLD_ACQ_ALLOW_TRYCLOUDFLARE) && parsed.hostname.endsWith('.trycloudflare.com')) return true;
        if (req) {
            const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
            const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').split(',')[0].trim();
            if (host && parsed.host === host && (!proto || parsed.protocol === `${proto}:`)) return true;
        }
        return LOOPBACK_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}

const corsOptionsDelegate = (req: express.Request, callback: (error: Error | null, options?: CorsOptions) => void) => {
    callback(null, {
        origin(origin, originCallback) {
            if (!origin || isAllowedCorsOrigin(origin, req)) {
                originCallback(null, true);
                return;
            }

            const error = new Error('CORS_BLOCKED') as Error & { code: string; statusCode: number };
            error.code = 'CORS_BLOCKED';
            error.statusCode = 403;
            originCallback(error);
        }
    });
};

app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
        const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const finishedAt = new Date().toISOString();
        const statusCode = res.statusCode;
        const statusKey = String(statusCode);

        runtimeMetrics.requestCount += 1;
        runtimeMetrics.latencyTotalMs += latencyMs;
        runtimeMetrics.maxLatencyMs = Math.max(runtimeMetrics.maxLatencyMs, latencyMs);
        runtimeMetrics.lastStatusCode = statusCode;
        runtimeMetrics.lastRequestAt = finishedAt;
        runtimeMetrics.statusCodes[statusKey] = (runtimeMetrics.statusCodes[statusKey] || 0) + 1;

        if (statusCode >= 400) {
            runtimeMetrics.errorCount += 1;
            runtimeMetrics.lastErrorAt = finishedAt;
        }
    });

    next();
});

app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: '25mb' }));

clearRecentEvents(db);
bootLog('⬡ NEURAL_REGISTRY_PURGED');
bootLog('⬡ CORE_READY :: PROVISIONING_BACKGROUND_PROCESSES');

let obsidianFailCount = 0;
const FAIL_THRESHOLD = 3;

type DatabaseReadiness = {
    available: boolean;
    ready: boolean;
    quickCheck: string;
    foreignKeyViolations: number;
    schemaVersion: number;
    latestSchemaVersion: number;
    migrationsReady: boolean;
    lastIntegrityCheckAt: string;
    lastBackupAt: string | null;
    error: string | null;
};

let _dbIntegrityCache: { value: DatabaseReadiness; expiresAt: number } | null = null;
const DB_INTEGRITY_TTL_MS = 5 * 60 * 1000;

// O(1) live check — used by health endpoint for the healthy flag
function checkDatabaseAvailable(): boolean {
    try {
        db.prepare('SELECT 1').get();
        return true;
    } catch {
        return false;
    }
}

function getLatestDbBackupAt(): string | null {
    try {
        if (!fs.existsSync(DB_RECOVERY_DIR)) return null;
        const manifests: string[] = [];
        const pending = [DB_RECOVERY_DIR];

        while (pending.length > 0 && manifests.length < 100) {
            const current = pending.pop()!;
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const entryPath = path.join(current, entry.name);
                if (entry.isDirectory()) pending.push(entryPath);
                else if (entry.name === 'manifest.json') manifests.push(entryPath);
            }
        }

        const timestamps = manifests
            .map((manifestPath) => {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    return typeof manifest.createdAt === 'string' ? manifest.createdAt : null;
                } catch {
                    return null;
                }
            })
            .filter((createdAt): createdAt is string => Boolean(createdAt))
            .sort();

        return timestamps.at(-1) || null;
    } catch {
        return null;
    }
}

// O(n) integrity check — cached for 5 minutes; used by readiness and payload detail
function buildDatabaseReadiness(): DatabaseReadiness {
    const now = Date.now();
    if (_dbIntegrityCache && now < _dbIntegrityCache.expiresAt) {
        return _dbIntegrityCache.value;
    }
    const lastIntegrityCheckAt = new Date(now).toISOString();
    const lastBackupAt = getLatestDbBackupAt();
    try {
        db.prepare('SELECT 1').get();
        const quickCheck = String(db.pragma('quick_check', { simple: true }) || 'unknown');
        const foreignKeyViolations = (db.pragma('foreign_key_check') as unknown[]).length;
        const schemaVersion = Number(db.pragma('user_version', { simple: true })) || 0;
        const migrationsReady = schemaVersion === LATEST_SCHEMA_VERSION;
        const result: DatabaseReadiness = {
            available: true,
            ready: quickCheck === 'ok' && foreignKeyViolations === 0 && migrationsReady,
            quickCheck,
            foreignKeyViolations,
            schemaVersion,
            latestSchemaVersion: LATEST_SCHEMA_VERSION,
            migrationsReady,
            lastIntegrityCheckAt,
            lastBackupAt,
            error: null
        };
        _dbIntegrityCache = { value: result, expiresAt: now + DB_INTEGRITY_TTL_MS };
        return result;
    } catch (error: any) {
        return {
            available: false,
            ready: false,
            quickCheck: 'unavailable',
            foreignKeyViolations: -1,
            schemaVersion: -1,
            latestSchemaVersion: LATEST_SCHEMA_VERSION,
            migrationsReady: false,
            lastIntegrityCheckAt,
            lastBackupAt,
            error: error?.message || 'database_unavailable'
        };
    }
}

function checkDatabaseHealth() {
    return buildDatabaseReadiness().ready;
}

async function buildHealthPayload() {
    const dbAvailable = checkDatabaseAvailable(); // O(1) live check
    const database = buildDatabaseReadiness();     // cached integrity detail
    const obsidianState = obsidianRest.getStatus();
    const obsidianOnline = obsidianState.mode !== 'offline';
    const watcherStatus = vaultWatcherController?.getStatus() || {
        running: false,
        lastEvent: null,
        pendingRun: false
    };
    const guardStatus = guard.getStatus();
    const ingestionStatus = getVaultIngestionStatus();
    const healthy = database.ready && guardStatus.running;

    return {
        healthy,
        status: healthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        services: {
            database: dbAvailable ? (database.ready ? 'online' : 'degraded') : 'offline',
            obsidian: obsidianOnline ? 'online' : 'offline',
            vaultWatcher: watcherStatus.running ? 'online' : 'offline',
            stabilityGuard: guardStatus.running ? 'online' : 'offline'
        },
        database,
        ingestion: ingestionStatus,
        watcher: watcherStatus,
        obsidian: obsidianRest.getStatus(),
        memory: {
            rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        }
    };
}

function buildLivenessPayload() {
    return {
        alive: !shuttingDown,
        status: shuttingDown ? 'shutting_down' : 'alive',
        timestamp: new Date().toISOString()
    };
}

async function buildReadinessPayload() {
    const database = buildDatabaseReadiness();
    const ingestionStatus = getVaultIngestionStatus();
    const initialIngestionSettled = Boolean(ingestionStatus.lastResult || ingestionStatus.lastError);

    let reason = 'ready';
    if (shuttingDown) reason = 'shutting_down';
    else if (!database.available) reason = 'database_unavailable';
    else if (!database.ready) reason = 'database_integrity_failed';
    else if (!backgroundServicesStarted) reason = 'background_services_starting';
    else if (!initialIngestionSettled) reason = 'initial_ingestion_in_progress';

    const ready = reason === 'ready';

    return {
        ready,
        status: ready ? 'ready' : 'not_ready',
        reason,
        timestamp: new Date().toISOString(),
        authRuntimeReady: Boolean(getRuntimeApiKey()),
        database,
        ingestion: ingestionStatus
    };
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

async function computeTelemetry() {
    const agents = getAllAgents(db);
    const activeCount = agents.filter((agent) => agent.status === 'ACTIVE' || agent.status === 'SYNCING').length;
    const { total: knowledgeTotal } = getIngestionStats(db);
    const metrics = await getTokenMetrics();
    const tokenLoad = metrics.currentSession ? (metrics.currentSession.tokens / 200000) * 100 : 0;
    const agentSync = agents.length > 0 ? (activeCount / agents.length) * 100 : 0;
    const ingestionPressure = knowledgeTotal > 0 ? (knowledgeTotal / 1000) * 100 : 0;
    const database = buildDatabaseReadiness();
    const sealStability = database.ready ? 100 : (database.available ? 50 : 0);
    const systemCpu = metrics.systemLoad?.cpu || 0;
    const systemMem = metrics.systemLoad?.mem || 0;
    const systemPressure = (systemCpu + systemMem) / 2;

    const snapshot = {
        neural_density: clamp(tokenLoad),
        swarm_sync: clamp(agentSync),
        ingestion_pressure: clamp(ingestionPressure),
        seal_stability: clamp(sealStability),
        logic_throughput: clamp(100 - systemPressure),
        active_agent_count: activeCount
    };

    recordTelemetry(db, snapshot);
    return { snapshot, metrics };
}

async function buildStatusPayload() {
    const { snapshot, metrics } = await computeTelemetry();
    const agents = getAllAgents(db).filter((agent) => agent.status !== 'IDLE').map((agent) => agent.name);
    const { total: knowledgeTotal, byDomain } = getIngestionStats(db);
    const recentEvents = getRecentEvents(db, 15);
    const obsidianState = obsidianRest.getStatus();
    const obsidianOnline = obsidianState.mode !== 'offline';

    let activeFile = null;
    if (obsidianOnline) {
        try {
            const active = await obsidianRest.getActiveFile();
            activeFile = active?.path || obsidianState.workspaceActiveFile || null;
        } catch {
            activeFile = obsidianState.workspaceActiveFile || null;
        }
    }

    return {
        timestamp: new Date().toISOString(),
        stage: 'RUBEDO',
        cognitiveLoad: {
            neuralDensity: snapshot.neural_density,
            swarmSync: snapshot.swarm_sync,
            ingestionPressure: snapshot.ingestion_pressure,
            sealStability: snapshot.seal_stability,
            logicThroughput: snapshot.logic_throughput
        },
        systemLoad: metrics.systemLoad,
        activeAgents: agents,
        metrics: {
            tokensUsed: metrics.currentSession?.tokens || 0,
            sessionDuration: metrics.currentSession?.durationMinutes || 0,
            knowledgeNodes: knowledgeTotal,
            lastRuntime: metrics.routing?.latest?.runtime || null,
            lastModel: metrics.routing?.latest?.model || null,
            lastCompressionRatio: metrics.routing?.latest?.compressionRatio || null,
            runtime: buildRuntimeMetricsPayload()
        },
        routing: metrics.routing,
        knowledgeStats: { total: knowledgeTotal, byDomain },
        events: recentEvents,
        obsidian: {
            status: obsidianOnline ? 'ONLINE' : 'OFFLINE',
            mode: obsidianState.mode,
            activeFile,
            workspaceActiveFile: obsidianState.workspaceActiveFile || null
        }
    };
}

function buildRuntimeMetricsPayload() {
    const requestCount = runtimeMetrics.requestCount;
    const averageLatencyMs = requestCount > 0 ? runtimeMetrics.latencyTotalMs / requestCount : 0;

    return {
        requestCount,
        errorCount: runtimeMetrics.errorCount,
        latencyTotalMs: Number(runtimeMetrics.latencyTotalMs.toFixed(3)),
        averageLatencyMs: Number(averageLatencyMs.toFixed(3)),
        maxLatencyMs: Number(runtimeMetrics.maxLatencyMs.toFixed(3)),
        lastStatusCode: runtimeMetrics.lastStatusCode,
        lastRequestAt: runtimeMetrics.lastRequestAt,
        lastErrorAt: runtimeMetrics.lastErrorAt,
        statusCodes: { ...runtimeMetrics.statusCodes }
    };
}

type IntegrationStatus = 'CONNECTED' | 'OFFLINE' | 'DEGRADED';

function probeGitNexusMcpStatus(): Promise<IntegrationStatus> {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [GITNEXUS_MCP_CHECK_SCRIPT], {
            cwd: path.resolve(__dirname, '../..'),
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let settled = false;
        let timeout: NodeJS.Timeout;

        const settle = (status: IntegrationStatus) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(status);
        };

        timeout = setTimeout(() => {
            child.kill('SIGTERM');
            settle('DEGRADED');
        }, GITNEXUS_MCP_CHECK_TIMEOUT_MS);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });

        child.on('error', () => {
            settle('OFFLINE');
        });

        child.on('exit', (code) => {
            if (code === 0 && /GITNEXUS_MCP_CHECK_PASS\s+tools=\d+/.test(stdout)) {
                settle('CONNECTED');
                return;
            }

            settle(code === 0 ? 'DEGRADED' : 'OFFLINE');
        });
    });
}

async function checkIntegrations() {
    if (shuttingDown) return;

    try {
        const obsidianState = obsidianRest.getStatus();
        const isPingOk = obsidianState.mode === 'rest'
            ? await Promise.race([
                obsidianRest.ping(),
                new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
              ])
            : true;
        const obsidianAvailable = isPingOk || obsidianState.mode !== 'offline';
        obsidianFailCount = obsidianAvailable ? 0 : obsidianFailCount + 1;

        const obsidianStatus = obsidianAvailable ? 'CONNECTED' : 'OFFLINE';
        const forgeStatus = await neuralForge.ping();
        const isForgeOnline = forgeStatus.local || forgeStatus.cloud || forgeStatus.anthropic || forgeStatus.google || forgeStatus.openai;
        const gitNexusMcpStatus = await probeGitNexusMcpStatus();

        const integrations = [
            { name: 'OBSIDIAN', status: obsidianStatus },
            { name: 'NEURAL_FORGE', status: isForgeOnline ? 'CONNECTED' : 'OFFLINE' },
            { name: 'GITNEXUS_MCP', status: gitNexusMcpStatus }
        ];

        for (const integration of integrations) {
            const exists = db.prepare('SELECT 1 FROM integrations WHERE name = ?').get(integration.name);
            if (exists) {
                db.prepare("UPDATE integrations SET status = ?, last_sync = datetime('now') WHERE name = ?")
                    .run(integration.status, integration.name);
            } else {
                db.prepare("INSERT INTO integrations (name, status, last_sync) VALUES (?, ?, datetime('now'))")
                    .run(integration.name, integration.status);
            }
        }

        if (obsidianStatus === 'CONNECTED' && obsidianFailCount > 0) {
            console.warn(`⬡ OBSIDIAN_PULSE :: STABILIZING (${obsidianFailCount}/${FAIL_THRESHOLD})`);
        } else if (obsidianStatus === 'OFFLINE') {
            console.error('⬡ OBSIDIAN_PULSE :: CRITICAL_OFFLINE');
        }
    } catch (error) {
        console.error('⬡ INTEGRATION_CHECK_ERROR:', error);
    }
}

app.get('/api/direct-test', (req, res) => res.json({ status: 'SERVER_DIRECT_ALIVE' }));

app.use('/api', initApiRoutes(db, {
    getStatusPayload: buildStatusPayload,
    getHealth: buildHealthPayload,
    getReadiness: buildReadinessPayload,
    getLiveness: buildLivenessPayload,
    sessionRuntime,
    designAssistantBridge
}));

app.post('/api/neural/recalibrate', authMiddleware, (req, res) => {
    try {
        clearRecentEvents(db);
        bootLog('⬡ MANUAL_RECALIBRATION_TRIGGERED');
        res.json({ status: 'SUCCESS', message: 'Neural registry purged and recalibrated.' });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

initColdAcquisitionCrmRoutes(app, db);

const jsonErrorHandler: express.ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    if (error?.code === 'CORS_BLOCKED' || error?.message === 'CORS_BLOCKED') {
        res.status(403).json({
            error: 'CORS_BLOCKED',
            message: 'Origin is not allowed for this local API.',
            status: 403,
            origin: req.get('origin') || null
        });
        return;
    }

    const status = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    res.status(status).json({
        error: status === 500 ? 'INTERNAL_SERVER_ERROR' : error?.message || 'REQUEST_FAILED',
        status
    });
};

app.use(jsonErrorHandler);

let lastIngestCount = -1;
trackInterval(setInterval(async () => {
    if (shuttingDown || !wss) return;

    try {
        const payload: any = await buildStatusPayload();
        if (lastIngestCount !== -1 && payload.knowledgeStats.total !== lastIngestCount) {
            payload.vault_updated = true;
        }
        lastIngestCount = payload.knowledgeStats.total;

        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(JSON.stringify(payload));
            }
        });
    } catch (error) {
        console.error('⬡ WEBSOCKET_HEARTBEAT_ERROR:', error);
    }
}, 3000));

function attachWebSocketServer(socketServer: WebSocketServer) {
    socketServer.on('connection', async (ws, req) => {
        if (shuttingDown) {
            ws.close(1012, 'Server shutting down');
            return;
        }

        const pathname = (() => {
            try {
                return new URL((req as any).url || '/', 'http://127.0.0.1').pathname;
            } catch {
                return (req as any).url || '';
            }
        })();

        if (pathname === '/api/design-assistant/live') {
            designAssistantBridge.handleWebSocketConnection(ws);
            return;
        }

        // Shell bridge via shell service proxy (avoids pm2 posix_spawn EBADF)
        if (pathname === '/ws/shell') {
            ws.on('message', (raw: Buffer) => {
                try {
                    const { command } = JSON.parse(raw.toString());
                    if (typeof command !== 'string' || !command.trim()) return;
                    const http = require('http');
                    const body = JSON.stringify({ command });
                    const proxyReq = http.request({
                        hostname: '127.0.0.1', port: 3098, path: '/run', method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-API-KEY': process.env.SHELL_SERVICE_KEY || 'yuri-master-key-2026-04-23' },
                    }, (proxyRes: any) => {
                        let buf = '';
                        proxyRes.on('data', (chunk: Buffer) => {
                            buf += chunk.toString();
                            const parts = buf.split('\n\n');
                            buf = parts.pop() || '';
                            for (const part of parts) {
                                const raw2 = part.replace(/^data:\s*/, '').trim();
                                if (raw2) { try { ws.send(raw2); } catch {} }
                            }
                        });
                    });
                    proxyReq.on('error', (e: Error) => {
                        try { ws.send(JSON.stringify({ type: 'stderr', data: `shell service unavailable: ${e.message}` })); } catch {}
                    });
                    proxyReq.write(body);
                    proxyReq.end();
                    ws.on('close', () => proxyReq.destroy());
                } catch (_) {}
            });
            return;
        }

        console.log('⬡ NEW_SEEKER_CONNECTED');
        logEvent(db, 'SYSTEM', 'WEBSOCKET', 'New seeker connected to the Command Center', 'INFO');
        ws.send(JSON.stringify(await buildStatusPayload()));
    });

    EventBus.GlobalBus.on('CONCLAVE_EVENT', (artifact) => {
        if (shuttingDown) return;

        socketServer.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({
                    type: 'CONCLAVE_THOUGHT',
                    artifact
                }));
            }
        });
    });
}

const backgroundStartTimeout = trackTimeout(setTimeout(() => {
    if (shuttingDown) return;

    try {
        bootLog('⬡ BACKGROUND_SERVICES_STARTING');
        backgroundServicesStarted = true;

        if (!suppressWatchers) {
            void runVaultIngestion(db, 'boot').catch((error) => {
                bootLog(`⬡ VAULT_INGESTION_BOOT_ERROR: ${error.message}`);
            });

            vaultWatcherController = initVaultWatcher(db);
        }

        if (!suppressIntervals) {
            void syncOutlookIcs().catch((error) => {
                bootLog(`⬡ OUTLOOK_SYNC_ERROR: ${error.message}`);
            });
        }

        if (!suppressSwarm) {
            const swarm = new (require('./services/swarmOrchestrator').SwarmOrchestrator)(db);
            void swarm.executeSwarmGoal('SYSTEM_STABILITY_AUDIT', { boot_time: new Date().toISOString() })
                .then(() => bootLog('⬡ STABILITY_SWARM_AUDIT_COMPLETE'))
                .catch((error: any) => bootLog(`⬡ STABILITY_SWARM_ERROR: ${error.message}`));
        }

        bootLog('⬡ BACKGROUND_SERVICES_READY');
    } catch (error: any) {
        bootLog(`⬡ BACKGROUND_SERVICES_ERROR: ${error.message}`);
    }
}, 1000));

if (!isTestMode) guard.start();
sessionRuntime.startSupervisor();
if (!suppressIntervals) void checkIntegrations();

if (!suppressIntervals) {
    trackInterval(setInterval(() => {
        void syncOutlookIcs().catch((error) => {
            bootLog(`⬡ OUTLOOK_SYNC_ERROR: ${error.message}`);
        });
    }, 60 * 60 * 1000));

    trackInterval(setInterval(() => {
        void checkIntegrations();
    }, 30 * 1000));
}

async function gracefulShutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    bootLog(`⬡ SHUTDOWN_SIGNAL_RECEIVED :: ${signal}`);
    clearTrackedTimers();
    guard.stop();
    sessionRuntime.stopSupervisor();

    try {
        await vaultWatcherController?.close();
        bootLog('⬡ VAULT_WATCHER_STOPPED');
    } catch (error: any) {
        bootLog(`⬡ VAULT_WATCHER_STOP_ERROR: ${error.message}`);
    }

    wss?.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.close(1001, 'Server shutting down');
        }
    });

    const forcedExit = setTimeout(() => {
        bootLog('⬡ FORCED_EXIT :: Timed out while shutting down');
        process.exit(1);
    }, 5000);

    try {
        if (wss) {
            await new Promise<void>((resolve) => wss!.close(() => resolve()));
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
        clearTimeout(forcedExit);
    }

    try {
        db.close();
        bootLog('⬡ DATABASE_CLOSED');
    } catch (error: any) {
        bootLog(`⬡ DATABASE_CLOSE_ERROR: ${error.message}`);
    }

    process.exit(0);
}

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

async function startServer() {
    for (let index = 0; index < PORT_CANDIDATES.length; index += 1) {
        const port = PORT_CANDIDATES[index];
        currentPort = port;
        const nextPort = PORT_CANDIDATES[index + 1];

        const bindable = await canBindPort(port);
        if (!bindable) {
            if (nextPort) {
                bootLog(`⬡ PORT_COLLISION :: ${port} unavailable. Trying ${nextPort}...`);
                continue;
            }
            break;
        }

        try {
            await listenOnPort(port);
            wss = new WebSocketServer({ server });
            attachWebSocketServer(wss);

            server.on('error', (error: any) => {
                bootLog(`⬡ SERVER_ERROR: ${error.message}`);
            });

            bootLog(`⬡ YURI_BACKEND_ONLINE :: ${HOST}:${currentPort}`);
            logEvent(db, 'SYSTEM', 'SERVER', `Backend server started on ${HOST}:${currentPort}`, 'INFO');
            return;
        } catch (error) {
            if (isRecoverableListenError(error) && nextPort) {
                bootLog(`⬡ PORT_COLLISION :: ${port} failed during bind (${error.code}). Trying ${nextPort}...`);
                continue;
            }

            throw error;
        }
    }

    throw new Error(`Port exhaustion. No ports available around ${DEFAULT_PORT}.`);
}

void startServer().catch((error: any) => {
    bootLog(`⬡ FATAL_SERVER_START_ERROR: ${error.message}`);
    process.exit(1);
});
