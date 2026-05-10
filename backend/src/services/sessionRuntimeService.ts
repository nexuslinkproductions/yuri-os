import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { SystemConfig } from '../config/SystemConfig';

export type SessionRuntimeStatus = 'active' | 'completed' | 'error' | 'interrupted';
export type SessionRuntimeIdleMode = 'backlog' | 'hold';

export interface SessionSnapshot {
    id: string;
    title: string;
    model: string;
    status: SessionRuntimeStatus;
    startTs: number;
    endTs: number | null;
    tokenCount: number;
    summary: string;
    targetDurationMs: number;
    deadlineAt: number;
    lastHeartbeatAt: number;
    restartCount: number;
    checkpointRef: string | null;
    idleMode: SessionRuntimeIdleMode;
    currentTask: string;
    prompt: string;
    canResume: boolean;
    runtimePid: number | null;
}

export interface StartSessionInput {
    prompt?: unknown;
    title?: unknown;
    durationMs?: unknown;
    durationMinutes?: unknown;
    idleMode?: unknown;
    model?: unknown;
}

export interface HeartbeatInput {
    sessionId?: unknown;
    currentTask?: unknown;
    checkpointRef?: unknown;
}

export interface StopSessionInput {
    sessionId?: unknown;
    reason?: unknown;
}

type SessionRow = {
    session_id: string;
    start_time: number;
    end_time: number | null;
    tokens_estimated: number;
    tools_loaded: number;
    status: string;
    metadata: string | null;
};

type SessionMetadata = {
    version: number;
    runtimeKind: 'yuri-session-runtime';
    title: string;
    model: string;
    prompt: string;
    summary: string;
    targetDurationMs: number;
    deadlineAt: number;
    lastHeartbeatAt: number;
    restartCount: number;
    checkpointRef: string | null;
    idleMode: SessionRuntimeIdleMode;
    currentTask: string;
    canResume: boolean;
    runtimePid: number | null;
};

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_DURATION_MS = 10 * 60 * 60 * 1000;
const MIN_DURATION_MS = 1_000;
const SUPERVISOR_INTERVAL_MS = 30_000;
const WORK_SLICE_INTERVAL_MS = 3 * 60 * 1000;

export class SessionRuntimeService {
    private interval: NodeJS.Timeout | null = null;
    private child: ChildProcess | null = null;
    private lastWorkSliceAt = 0;

    constructor(private readonly db: Database.Database) {}

    startSupervisor() {
        this.recoverActiveSession();
        if (this.interval) return;
        this.interval = setInterval(() => {
            this.tick();
        }, SUPERVISOR_INTERVAL_MS);
    }

    stopSupervisor() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.child && this.child.exitCode === null) {
            this.child.kill('SIGTERM');
        }
        this.child = null;
    }

    startSession(input: StartSessionInput): SessionSnapshot {
        this.completeExpiredActiveSession();
        const existing = this.getActiveRow();
        if (existing) {
            throw Object.assign(new Error('ACTIVE_SESSION_EXISTS'), { statusCode: 409 });
        }

        const now = Date.now();
        const targetDurationMs = normalizeDuration(input.durationMs, input.durationMinutes);
        const prompt = normalizeText(input.prompt, 'Autonomous Yuri command-center session');
        const title = normalizeText(input.title, 'Yuri Autonomous Session');
        const idleMode = input.idleMode === 'hold' ? 'hold' : 'backlog';
        const model = normalizeText(input.model, 'yuri-runtime');
        const sessionId = `yuri-session-${timestampId(now)}-${crypto.randomBytes(3).toString('hex')}`;
        const metadata: SessionMetadata = {
            version: 1,
            runtimeKind: 'yuri-session-runtime',
            title,
            model,
            prompt,
            summary: 'Session lease active; supervisor owns heartbeat, deadline, and backlog execution.',
            targetDurationMs,
            deadlineAt: now + targetDurationMs,
            lastHeartbeatAt: now,
            restartCount: 0,
            checkpointRef: null,
            idleMode,
            currentTask: prompt,
            canResume: true,
            runtimePid: process.pid,
        };

        this.db.prepare(`
            INSERT INTO telemetry_sessions (
                session_id,
                start_time,
                tokens_estimated,
                tools_loaded,
                status,
                metadata
            ) VALUES (?, ?, 0, 0, 'ACTIVE', ?)
        `).run(sessionId, now, JSON.stringify(metadata));

        return this.rowToSnapshot(this.getRow(sessionId)!);
    }

    heartbeat(input: HeartbeatInput): SessionSnapshot {
        const sessionId = requireText(input.sessionId, 'sessionId');
        const row = this.getRow(sessionId);
        if (!row || row.status !== 'ACTIVE') {
            throw Object.assign(new Error('ACTIVE_SESSION_NOT_FOUND'), { statusCode: 404 });
        }

        const patch: Partial<SessionMetadata> = {
            lastHeartbeatAt: Date.now(),
            runtimePid: process.pid,
        };
        if (typeof input.currentTask === 'string' && input.currentTask.trim()) {
            patch.currentTask = input.currentTask.trim();
        }
        if (typeof input.checkpointRef === 'string' && input.checkpointRef.trim()) {
            patch.checkpointRef = input.checkpointRef.trim();
        }

        this.updateMetadata(sessionId, patch);
        return this.rowToSnapshot(this.getRow(sessionId)!);
    }

    stopSession(input: StopSessionInput): SessionSnapshot {
        const sessionId = requireText(input.sessionId, 'sessionId');
        const row = this.getRow(sessionId);
        if (!row || row.status !== 'ACTIVE') {
            throw Object.assign(new Error('ACTIVE_SESSION_NOT_FOUND'), { statusCode: 404 });
        }

        const now = Date.now();
        const reason = normalizeText(input.reason, 'Session stopped');
        this.updateMetadata(sessionId, {
            summary: reason,
            currentTask: 'stopped',
            lastHeartbeatAt: now,
            canResume: false,
            runtimePid: null,
        });
        this.db.prepare(`
            UPDATE telemetry_sessions
            SET status = 'FINALIZED', end_time = ?
            WHERE session_id = ?
        `).run(now, sessionId);

        return this.rowToSnapshot(this.getRow(sessionId)!);
    }

    getCurrentSession(): SessionSnapshot | null {
        this.completeExpiredActiveSession();
        const row = this.getActiveRow();
        return row ? this.rowToSnapshot(row) : null;
    }

    getHistory(limit = 20): SessionSnapshot[] {
        const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
        const rows = this.db.prepare(`
            SELECT session_id, start_time, end_time, tokens_estimated, tools_loaded, status, metadata
            FROM telemetry_sessions
            ORDER BY start_time DESC
            LIMIT 100
        `).all() as SessionRow[];
        return rows.filter(isRuntimeRow).slice(0, safeLimit).map((row) => this.rowToSnapshot(row));
    }

    private tick() {
        try {
            const current = this.getCurrentSession();
            if (!current) return;
            this.heartbeat({ sessionId: current.id, currentTask: current.currentTask });

            if (current.idleMode === 'backlog') {
                this.maybeRunWorkSlice(current);
            }
        } catch (error) {
            console.error('⬡ SESSION_RUNTIME_TICK_ERROR:', error);
        }
    }

    private recoverActiveSession() {
        const row = this.getActiveRow();
        if (!row) return;
        const snapshot = this.rowToSnapshot(row);
        if (snapshot.deadlineAt <= Date.now()) {
            this.finalizeExpired(snapshot.id);
            return;
        }

        this.updateMetadata(snapshot.id, {
            restartCount: snapshot.restartCount + 1,
            lastHeartbeatAt: Date.now(),
            currentTask: snapshot.currentTask || 'recovered active session',
            canResume: true,
            runtimePid: process.pid,
        });
    }

    private completeExpiredActiveSession() {
        const row = this.getActiveRow();
        if (!row) return;
        const snapshot = this.rowToSnapshot(row);
        if (snapshot.deadlineAt <= Date.now()) {
            this.finalizeExpired(snapshot.id);
        }
    }

    private finalizeExpired(sessionId: string) {
        const now = Date.now();
        this.updateMetadata(sessionId, {
            summary: 'Session deadline reached.',
            currentTask: 'deadline reached',
            lastHeartbeatAt: now,
            canResume: false,
            runtimePid: null,
        });
        this.db.prepare(`
            UPDATE telemetry_sessions
            SET status = 'FINALIZED', end_time = ?
            WHERE session_id = ? AND status = 'ACTIVE'
        `).run(now, sessionId);
    }

    private maybeRunWorkSlice(snapshot: SessionSnapshot) {
        if (process.env.NUDIMMUD_SESSION_RUNTIME_TEST_MODE === '1') return;
        if (this.child && this.child.exitCode === null) return;
        if (Date.now() - this.lastWorkSliceAt < WORK_SLICE_INTERVAL_MS) return;
        this.lastWorkSliceAt = Date.now();

        const mode = process.env.NUDIMMUD_SESSION_RUNTIME_MODE === 'dry-run' ? '--dry-run' : '--live';
        const scriptPath = path.join(SystemConfig.ROOT, 'Scripts/yuri-sandbox-loop.mjs');
        const prompt = buildWorkSlicePrompt(snapshot);
        const args = [scriptPath, mode, '--prompt', prompt];
        if (process.env.NUDIMMUD_DB_PATH) {
            args.push('--db', process.env.NUDIMMUD_DB_PATH);
        }

        this.updateMetadata(snapshot.id, {
            currentTask: 'running bounded Yuri work slice',
            lastHeartbeatAt: Date.now(),
            runtimePid: process.pid,
        });

        this.child = spawn(process.execPath, args, {
            cwd: SystemConfig.ROOT,
            env: process.env,
            stdio: ['ignore', 'ignore', 'pipe'],
        });

        this.child.stderr?.on('data', (chunk) => {
            console.error(`⬡ SESSION_RUNTIME_WORK_SLICE_ERROR: ${chunk.toString()}`);
        });

        this.child.on('exit', (code, signal) => {
            const checkpointRef = `yuri-sandbox-loop:${Date.now()}`;
            const currentTask = signal
                ? `work slice stopped by ${signal}`
                : `work slice exited ${code ?? 0}`;
            try {
                this.updateMetadata(snapshot.id, {
                    checkpointRef,
                    currentTask,
                    lastHeartbeatAt: Date.now(),
                    runtimePid: process.pid,
                });
            } catch (error) {
                console.error('⬡ SESSION_RUNTIME_WORK_SLICE_UPDATE_ERROR:', error);
            }
        });
    }

    private getActiveRow(): SessionRow | undefined {
        const rows = this.db.prepare(`
            SELECT session_id, start_time, end_time, tokens_estimated, tools_loaded, status, metadata
            FROM telemetry_sessions
            WHERE status = 'ACTIVE'
            ORDER BY start_time DESC
            LIMIT 20
        `).all() as SessionRow[];
        return rows.find(isRuntimeRow);
    }

    private getRow(sessionId: string): SessionRow | undefined {
        return this.db.prepare(`
            SELECT session_id, start_time, end_time, tokens_estimated, tools_loaded, status, metadata
            FROM telemetry_sessions
            WHERE session_id = ?
        `).get(sessionId) as SessionRow | undefined;
    }

    private updateMetadata(sessionId: string, patch: Partial<SessionMetadata>) {
        const row = this.getRow(sessionId);
        if (!row) return;
        const metadata = { ...parseMetadata(row), ...patch };
        this.db.prepare('UPDATE telemetry_sessions SET metadata = ? WHERE session_id = ?')
            .run(JSON.stringify(metadata), sessionId);
    }

    private rowToSnapshot(row: SessionRow): SessionSnapshot {
        const metadata = parseMetadata(row);
        return {
            id: row.session_id,
            title: metadata.title,
            model: metadata.model,
            status: mapStatus(row.status),
            startTs: row.start_time,
            endTs: row.end_time,
            tokenCount: row.tokens_estimated || 0,
            summary: metadata.summary,
            targetDurationMs: metadata.targetDurationMs,
            deadlineAt: metadata.deadlineAt,
            lastHeartbeatAt: metadata.lastHeartbeatAt,
            restartCount: metadata.restartCount,
            checkpointRef: metadata.checkpointRef,
            idleMode: metadata.idleMode,
            currentTask: metadata.currentTask,
            prompt: metadata.prompt,
            canResume: metadata.canResume && row.status === 'ACTIVE',
            runtimePid: metadata.runtimePid,
        };
    }
}

function parseMetadata(row: SessionRow): SessionMetadata {
    const fallback: SessionMetadata = {
        version: 1,
        runtimeKind: 'yuri-session-runtime',
        title: row.session_id,
        model: 'oracle',
        prompt: '',
        summary: row.status === 'ACTIVE' ? 'Active telemetry session.' : 'Completed telemetry session.',
        targetDurationMs: DEFAULT_DURATION_MS,
        deadlineAt: row.start_time + DEFAULT_DURATION_MS,
        lastHeartbeatAt: row.start_time,
        restartCount: 0,
        checkpointRef: null,
        idleMode: 'backlog',
        currentTask: row.status === 'ACTIVE' ? 'active' : 'complete',
        canResume: row.status === 'ACTIVE',
        runtimePid: null,
    };

    if (!row.metadata) return fallback;
    try {
        const parsed = JSON.parse(row.metadata) as Partial<SessionMetadata>;
        return {
            ...fallback,
            ...parsed,
            runtimeKind: 'yuri-session-runtime',
            idleMode: parsed.idleMode === 'hold' ? 'hold' : 'backlog',
            checkpointRef: typeof parsed.checkpointRef === 'string' ? parsed.checkpointRef : null,
            runtimePid: typeof parsed.runtimePid === 'number' ? parsed.runtimePid : null,
        };
    } catch {
        return fallback;
    }
}

function isRuntimeRow(row: SessionRow) {
    if (!row.metadata) return false;
    try {
        const parsed = JSON.parse(row.metadata) as Partial<SessionMetadata>;
        return parsed.runtimeKind === 'yuri-session-runtime';
    } catch {
        return false;
    }
}

function normalizeDuration(durationMs: unknown, durationMinutes: unknown) {
    const rawMs = Number(durationMs);
    const rawMinutes = Number(durationMinutes);
    const candidate = Number.isFinite(rawMs) && rawMs > 0
        ? rawMs
        : Number.isFinite(rawMinutes) && rawMinutes > 0
            ? rawMinutes * 60_000
            : DEFAULT_DURATION_MS;
    return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.floor(candidate)));
}

function normalizeText(value: unknown, fallback: string) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function requireText(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
        throw Object.assign(new Error(`${field} required`), { statusCode: 400 });
    }
    return value.trim();
}

function mapStatus(status: string): SessionRuntimeStatus {
    if (status === 'ACTIVE') return 'active';
    if (status === 'ERROR') return 'error';
    if (status === 'INTERRUPTED') return 'interrupted';
    return 'completed';
}

function timestampId(value: number) {
    return new Date(value).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function buildWorkSlicePrompt(snapshot: SessionSnapshot) {
    return [
        `Continue durable Yuri session ${snapshot.id}.`,
        `Session title: ${snapshot.title}.`,
        `Operator prompt: ${snapshot.prompt}.`,
        `Deadline: ${new Date(snapshot.deadlineAt).toISOString()}.`,
        'If the explicit prompt is exhausted, choose the next bounded backlog item: verification, failing-test repair, build blockers, route hardening, docs/hygiene.',
        'Produce local evidence and stop cleanly at the slice boundary.',
    ].join('\n');
}
