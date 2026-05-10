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
import { initDatabase } from './models/database';
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

dotenv.config();

function isTruthy(v: string | undefined): boolean {
    return v === '1' || v === 'true';
}

const isTestMode = isTruthy(process.env.NUDIMMUD_TEST_MODE);
const suppressWatchers = isTestMode || isTruthy(process.env.NUDIMMUD_DISABLE_WATCHERS);
const suppressIntervals = isTestMode || isTruthy(process.env.NUDIMMUD_DISABLE_INTERVALS);
const suppressSwarm = isTestMode || isTruthy(process.env.NUDIMMUD_DISABLE_SWARM_ORCHESTRATOR);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.PORT || 3004);
const MAX_PORT = DEFAULT_PORT + 10;
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

bootLog('⬡ NUDIMMUD_SERVER_IGNITING...');
bootLog('⬡ AUTH_RUNTIME_READY :: Local bootstrap token initialized');

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
let wss: WebSocketServer | null = null;
const db = initDatabase();
const guard = new StabilityGuard(db);
const sessionRuntime = new SessionRuntimeService(db);

let shuttingDown = false;
let currentPort = DEFAULT_PORT;
let vaultWatcherController: VaultWatcherController | null = null;
let backgroundServicesStarted = false;

const trackedTimeouts = new Set<NodeJS.Timeout>();
const trackedIntervals = new Set<NodeJS.Timeout>();

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

function isAllowedCorsOrigin(origin: string) {
    try {
        const parsed = new URL(origin);
        return LOOPBACK_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}

const corsOptions: CorsOptions = {
    origin(origin, callback) {
        if (!origin || isAllowedCorsOrigin(origin)) {
            callback(null, true);
            return;
        }

        const error = new Error('CORS_BLOCKED') as Error & { code: string; statusCode: number };
        error.code = 'CORS_BLOCKED';
        error.statusCode = 403;
        callback(error);
    }
};

app.use(cors(corsOptions));
app.use(express.json());

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
    error: string | null;
};

function buildDatabaseReadiness(): DatabaseReadiness {
    try {
        db.prepare('SELECT 1').get();
        const quickCheck = String(db.pragma('quick_check', { simple: true }) || 'unknown');
        const foreignKeyViolations = (db.pragma('foreign_key_check') as unknown[]).length;
        return {
            available: true,
            ready: quickCheck === 'ok' && foreignKeyViolations === 0,
            quickCheck,
            foreignKeyViolations,
            error: null
        };
    } catch (error: any) {
        return {
            available: false,
            ready: false,
            quickCheck: 'unavailable',
            foreignKeyViolations: -1,
            error: error?.message || 'database_unavailable'
        };
    }
}

function checkDatabaseHealth() {
    return buildDatabaseReadiness().ready;
}

async function buildHealthPayload() {
    const database = buildDatabaseReadiness();
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
            database: database.ready ? 'online' : 'degraded',
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
    const tokenLoad = metrics.currentSession ? (metrics.currentSession.tokens / 200000) * 100 : 20;

    const snapshot = {
        neural_density: clamp(tokenLoad + (Math.random() * 5)),
        swarm_sync: clamp(activeCount * 5 + 50 + (Math.random() * 15)),
        ingestion_pressure: clamp((knowledgeTotal / 1000) * 100 * (0.8 + Math.random() * 0.4)),
        seal_stability: clamp(98 + Math.random() * 2),
        logic_throughput: clamp(75 + Math.random() * 25),
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
            lastCompressionRatio: metrics.routing?.latest?.compressionRatio || null
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

        const integrations = [
            { name: 'OBSIDIAN', status: obsidianStatus },
            { name: 'NEURAL_FORGE', status: isForgeOnline ? 'CONNECTED' : 'OFFLINE' },
            { name: 'GITNEXUS_MCP', status: 'CONNECTED' }
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

app.get('/api/obsidian/status', (_, res) => {
    try {
        const status = obsidianRest.getStatus?.() || { status: 'UNKNOWN', lastSync: null };
        res.json(status);
    } catch (err) {
        res.json({ status: 'OFFLINE', lastSync: null, error: String(err) });
    }
});
app.get('/api/obsidian/paths', async (_, res) => {
    try {
        const paths = await (obsidianRest as any).listVaults?.() || [];
        res.json({ vaults: paths, count: paths.length });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
app.post('/api/obsidian/reconnect', authMiddleware, async (_, res) => {
    try {
        const result = await (obsidianRest as any).reconnect?.() || {
            success: false
        };
        res.json({ success: (result as any).success, status: 'RECONNECT_ATTEMPTED' });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
app.post('/api/obsidian/sync', authMiddleware, async (req, res) => {
    try {
        const { action } = req.body;
        if (action === 'test') {
            const result = await obsidianRest.ping?.() || false;
            res.json({ success: result, test: true });
        } else {
            res.status(400).json({ error: 'Unknown action' });
        }
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

app.use('/api', initApiRoutes(db, {
    getStatusPayload: buildStatusPayload,
    getHealth: buildHealthPayload,
    getReadiness: buildReadinessPayload,
    getLiveness: buildLivenessPayload,
    sessionRuntime
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

        // Shell bridge via shell service proxy (avoids pm2 posix_spawn EBADF)
        if ((req as any).url === '/ws/shell') {
            ws.on('message', (raw: Buffer) => {
                try {
                    const { command } = JSON.parse(raw.toString());
                    if (typeof command !== 'string' || !command.trim()) return;
                    const http = require('http');
                    const body = JSON.stringify({ command });
                    const proxyReq = http.request({
                        hostname: '127.0.0.1', port: 3098, path: '/run', method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-API-KEY': process.env.SHELL_SERVICE_KEY || 'nudimmud-master-key-2026-04-23' },
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

            bootLog(`⬡ NUDIMMUD_BACKEND_ONLINE :: ${HOST}:${currentPort}`);
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
