import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import os from 'os';
import { SystemConfig } from '../config/SystemConfig';
import { forgeTelemetryTracker, latencyTracker } from './neuralForgeService';

const TRACKER_FILE = SystemConfig.resolve('_SYSTEM/token-tracker.md');
const SESSION_DIR = os.tmpdir();
const METRICS_CACHE_TTL_MS = 15_000;

let cachedTokenMetrics: TokenStats | null = null;
let cachedTokenMetricsAt = 0;

function cloneTokenStats(stats: TokenStats): TokenStats {
    return typeof structuredClone === 'function' ? structuredClone(stats) : JSON.parse(JSON.stringify(stats));
}

export interface TokenStats {
    totalSessions: number;
    totalTokens: number;
    recentSessions: any[];
    currentSession?: {
        sessionId: string;
        tokens: number;
        toolsLoaded: number;
        durationMinutes: number;
    };
    systemLoad?: {
        cpu: number;
        mem: number;
        uptime: number;
        disk: string;
        ollama_latency?: number;
    };
    routing?: {
        latest: ReturnType<typeof forgeTelemetryTracker.getLatest>;
        recent: ReturnType<typeof forgeTelemetryTracker.getRecent>;
    };
}

/**
 * Get OS-level metrics without shelling out.
 */
function getSystemMetrics() {
    const cpus = os.cpus();
    const avgLoad = cpus.length > 0 ? os.loadavg()[0] / cpus.length : 0;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsed = totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : 0;

    let diskUsage = 'ERR';
    try {
        const stat = fs.statfsSync(SystemConfig.ROOT);
        const total = stat.blocks * stat.bsize;
        const free = stat.bfree * stat.bsize;
        diskUsage = total > 0 ? `${Math.round(((total - free) / total) * 100)}%` : '0%';
    } catch {
        const parent = path.dirname(SystemConfig.ROOT);
        try {
            const stat = fs.statfsSync(parent);
            const total = stat.blocks * stat.bsize;
            const free = stat.bfree * stat.bsize;
            diskUsage = total > 0 ? `${Math.round(((total - free) / total) * 100)}%` : '0%';
        } catch {
            diskUsage = 'ERR';
        }
    }

    return {
        cpu: Math.min(Math.round(avgLoad * 100), 100),
        mem: Math.round(memUsed),
        uptime: Math.round(os.uptime()),
        disk: diskUsage,
        ollama_latency: latencyTracker.getAverage()
    };
}

function safeRoutingSnapshot() {
    try {
        return {
            latest: forgeTelemetryTracker.getLatest(),
            recent: forgeTelemetryTracker.getRecent(5)
        };
    } catch (error) {
        console.warn('⬡ METRICS_WARN :: Routing telemetry unavailable, using cache fallback.');
        return cachedTokenMetrics?.routing ?? {
            latest: null as unknown as ReturnType<typeof forgeTelemetryTracker.getLatest>,
            recent: []
        };
    }
}

import { telemetryService } from './telemetryService';

export async function getTokenMetrics(): Promise<TokenStats> {
    const now = Date.now();
    if (cachedTokenMetrics && now - cachedTokenMetricsAt < METRICS_CACHE_TTL_MS) {
        return cloneTokenStats(cachedTokenMetrics);
    }

    const stats: TokenStats = cachedTokenMetrics ? cloneTokenStats(cachedTokenMetrics) : {
        totalSessions: 0,
        totalTokens: 0,
        recentSessions: [],
    };
    stats.systemLoad = getSystemMetrics();
    stats.routing = safeRoutingSnapshot();

    // 1. Query Database via Telemetry Service
    try {
        const dbStats = await telemetryService.getStats();
        stats.totalSessions = dbStats.totalSessions;
        stats.totalTokens = dbStats.totalTokens;
        stats.recentSessions = dbStats.recentSessions;
    } catch (err) {
        console.warn('⬡ METRICS_WARN :: Database stats unavailable, falling back to tracker file.');
    }

    // 2. Fallback to Tracker File if DB is empty
    if (stats.totalSessions === 0 && fs.existsSync(TRACKER_FILE)) {
        try {
            const content = fs.readFileSync(TRACKER_FILE, 'utf-8');
            const sessionLines = content.split('\n').filter(line => line.startsWith('### SESSION'));
            stats.totalSessions = sessionLines.length;
            
            stats.recentSessions = sessionLines.slice(-10).map(line => {
                const parts = line.split(' - ');
                return {
                    id: parts[0]?.replace('### SESSION ', ''),
                    info: parts[1] || ''
                };
            });
        } catch (err) {
            console.error('⬡ METRICS_ERROR :: Tracker read failed:', err);
        }
    }

    // 3. Check for active session in DB first, then /tmp
    try {
        const activeSession = await telemetryService.getActiveSession();
        if (activeSession) {
            const startTime = activeSession.startTime || Date.now();
            const duration = Math.floor((Date.now() - startTime) / 1000 / 60);

            stats.currentSession = {
                sessionId: activeSession.sessionId || 'UNKNOWN',
                tokens: activeSession.tokensEstimated || 0,
                toolsLoaded: activeSession.toolsLoaded || 0,
                durationMinutes: duration
            };
        } else {
            // Check /tmp legacy
            const files = await glob(`${SESSION_DIR}/claude-session-*.json`);
            if (files.length > 0) {
                const latestFile = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
                const sessionData = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
                
                const startTime = sessionData.startTime || Date.now();
                const duration = Math.floor((Date.now() - startTime) / 1000 / 60);

                stats.currentSession = {
                    sessionId: sessionData.sessionId || 'UNKNOWN',
                    tokens: sessionData.tokensEstimated || 0,
                    toolsLoaded: (sessionData.toolsLoaded || []).length,
                    durationMinutes: duration
                };
            }
        }
    } catch (error) {
        console.error('⬡ METRICS_ERROR :: Active session parse failed:', error);
    }

    cachedTokenMetrics = stats;
    cachedTokenMetricsAt = now;
    return cloneTokenStats(stats);
}
