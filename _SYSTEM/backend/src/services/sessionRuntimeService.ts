import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { SystemConfig } from '../config/SystemConfig';

export type SessionRuntimeStatus = 'active' | 'completed' | 'error' | 'interrupted';
export type SessionRuntimeIdleMode = 'backlog' | 'hold';
export type BacklogTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

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
    graphId: string | null;
    intentId: string | null;
    graphPlanPath: string | null;
    normalizedIntentPath: string | null;
    verificationState: string | null;
    promotionState: string | null;
}

export interface StartSessionInput {
    prompt?: unknown;
    title?: unknown;
    durationMs?: unknown;
    durationMinutes?: unknown;
    idleMode?: unknown;
    model?: unknown;
    graphId?: unknown;
    intentId?: unknown;
    graphPlanPath?: unknown;
    normalizedIntentPath?: unknown;
    verificationState?: unknown;
    promotionState?: unknown;
}

export interface HeartbeatInput {
    sessionId?: unknown;
    currentTask?: unknown;
    checkpointRef?: unknown;
    graphId?: unknown;
    intentId?: unknown;
    graphPlanPath?: unknown;
    normalizedIntentPath?: unknown;
    verificationState?: unknown;
    promotionState?: unknown;
}

export interface StopSessionInput {
    sessionId?: unknown;
    reason?: unknown;
}

export interface BacklogTaskSnapshot {
    id: string;
    sessionId: string;
    title: string;
    prompt: string;
    reason: string;
    priority: number;
    status: BacklogTaskStatus;
    attempts: number;
    maxAttempts: number;
    checkpointRef: string | null;
    lastError: string | null;
    createdAt: number;
    updatedAt: number;
    startedAt: number | null;
    completedAt: number | null;
}

export interface BacklogSummary {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    total: number;
}

export interface AddBacklogTaskInput {
    sessionId?: unknown;
    title?: unknown;
    prompt?: unknown;
    reason?: unknown;
    priority?: unknown;
    maxAttempts?: unknown;
}

export interface BacklogTaskInput {
    sessionId?: unknown;
}

export interface CompleteBacklogTaskInput {
    sessionId?: unknown;
    checkpointRef?: unknown;
    error?: unknown;
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

type BacklogTaskRow = {
    id: string;
    session_id: string;
    title: string;
    prompt: string;
    reason: string;
    priority: number;
    status: BacklogTaskStatus;
    attempts: number;
    max_attempts: number;
    checkpoint_ref: string | null;
    last_error: string | null;
    created_at: number;
    updated_at: number;
    started_at: number | null;
    completed_at: number | null;
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
    graphId: string | null;
    intentId: string | null;
    graphPlanPath: string | null;
    normalizedIntentPath: string | null;
    verificationState: string | null;
    promotionState: string | null;
};

export type ControlPlaneNodeCounts = Record<string, number>;

export interface ControlPlaneGraphSummary {
    graphId: string;
    intentId: string;
    scenario: string;
    routeLane: string;
    createdAt: string | null;
    lifecycle: string[];
    nodeCount: number;
    artifactRoot: string | null;
    graphPlanPath: string;
    normalizedIntentPath: string | null;
    rawOutputTainted: boolean;
    sanitizedVerifiedSummaryOnly: boolean;
    promotionRequiresReview: boolean;
}

export interface ControlPlanePromotionGateStatus {
    status: string;
    action: string;
    requiresVerification: boolean;
    verifiedNodeCount: number;
    totalNodeCount: number;
    verificationState: string | null;
    promotionState: string | null;
}

export interface ControlPlaneStatusSnapshot {
    activeSession: SessionSnapshot | null;
    currentGraph: ControlPlaneGraphSummary | null;
    nodeCountsByVerificationStatus: ControlPlaneNodeCounts;
    promotionGateStatus: ControlPlanePromotionGateStatus;
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_DURATION_MS = 10 * 60 * 60 * 1000;
const MIN_DURATION_MS = 1_000;
const SUPERVISOR_INTERVAL_MS = 30_000;
const WORK_SLICE_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_BACKLOG_TASKS = [
    {
        title: 'Restore verification baseline',
        prompt: 'Run focused verification and repair the first deterministic failing test or build gate.',
        reason: 'baseline verification keeps long sessions useful without operator polling',
        priority: 20,
    },
    {
        title: 'Clear build blockers',
        prompt: 'Run the build gate and repair the first TypeScript or bundling blocker with local evidence.',
        reason: 'build health is the highest-confidence autonomous maintenance task',
        priority: 30,
    },
    {
        title: 'Harden backend control routes',
        prompt: 'Audit one bounded backend route hardening candidate and finish it with tests if risk is low.',
        reason: 'backend hardening slices are bounded and testable',
        priority: 40,
    },
    {
        title: 'Refresh operator runtime evidence',
        prompt: 'Inspect operator runtime surfaces and improve stale labels, status truth, or diagnostics only when evidence is local.',
        reason: 'operator status should explain what the runtime is actually doing',
        priority: 50,
    },
];

export class SessionRuntimeService {
    private interval: NodeJS.Timeout | null = null;
    private child: ChildProcess | null = null;
    private lastWorkSliceAt = 0;

    constructor(private readonly db: Database.Database) {
        this.ensureBacklogTable();
    }

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
            graphId: normalizeOptionalText(input.graphId),
            intentId: normalizeOptionalText(input.intentId),
            graphPlanPath: normalizeOptionalArtifactPath(input.graphPlanPath, 'graph-plan.json'),
            normalizedIntentPath: normalizeOptionalArtifactPath(input.normalizedIntentPath, 'normalized-intent.json'),
            verificationState: normalizeOptionalText(input.verificationState),
            promotionState: normalizeOptionalText(input.promotionState),
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
        this.seedDefaultBacklog(sessionId, now);

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
        applyControlPlanePatch(input, patch);

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

    getControlPlaneStatus(): ControlPlaneStatusSnapshot {
        const activeSession = this.getCurrentSession();
        const currentGraph = activeSession ? this.readGraphSummary(activeSession) : null;
        const nodeCountsByVerificationStatus = activeSession && currentGraph
            ? readNodeVerificationCounts(activeSession.graphPlanPath, currentGraph.nodeCount)
            : {};
        return {
            activeSession,
            currentGraph,
            nodeCountsByVerificationStatus,
            promotionGateStatus: buildPromotionGateStatus(activeSession, currentGraph, nodeCountsByVerificationStatus),
        };
    }

    getBacklog(input: BacklogTaskInput & { limit?: unknown } = {}) {
        const sessionId = this.resolveRuntimeSessionId(input.sessionId);
        const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(input.limit) || 50)));
        const rows = this.db.prepare(`
            SELECT *
            FROM yuri_session_backlog
            WHERE session_id = ?
            ORDER BY
                CASE status
                    WHEN 'running' THEN 0
                    WHEN 'queued' THEN 1
                    WHEN 'failed' THEN 2
                    ELSE 3
                END,
                priority ASC,
                created_at ASC
            LIMIT ?
        `).all(sessionId, safeLimit) as BacklogTaskRow[];
        const tasks = rows.map(rowToBacklogTask);
        return {
            sessionId,
            summary: summarizeBacklog(tasks),
            tasks,
        };
    }

    addBacklogTask(input: AddBacklogTaskInput): BacklogTaskSnapshot {
        const sessionId = this.resolveRuntimeSessionId(input.sessionId);
        const title = requireText(input.title, 'title');
        const prompt = requireText(input.prompt, 'prompt');
        const reason = normalizeText(input.reason, 'operator queued backlog task');
        const priority = clampInteger(input.priority, 1, 100, 50);
        const maxAttempts = clampInteger(input.maxAttempts, 1, 5, 3);
        const now = Date.now();
        const id = `backlog-${timestampId(now)}-${crypto.randomBytes(3).toString('hex')}`;

        this.db.prepare(`
            INSERT INTO yuri_session_backlog (
                id,
                session_id,
                title,
                prompt,
                reason,
                priority,
                status,
                attempts,
                max_attempts,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)
        `).run(id, sessionId, title, prompt, reason, priority, maxAttempts, now, now);

        return this.getBacklogTask(id)!;
    }

    claimNextBacklogTask(input: BacklogTaskInput): { task: BacklogTaskSnapshot | null; session: SessionSnapshot | null } {
        const sessionId = this.resolveRuntimeSessionId(input.sessionId);
        const row = this.db.prepare(`
            SELECT *
            FROM yuri_session_backlog
            WHERE session_id = ?
              AND status = 'queued'
              AND attempts < max_attempts
            ORDER BY priority ASC, created_at ASC
            LIMIT 1
        `).get(sessionId) as BacklogTaskRow | undefined;
        if (!row) {
            return { task: null, session: this.getCurrentSession() };
        }

        const now = Date.now();
        this.db.prepare(`
            UPDATE yuri_session_backlog
            SET status = 'running',
                attempts = attempts + 1,
                started_at = COALESCE(started_at, ?),
                updated_at = ?
            WHERE id = ?
        `).run(now, now, row.id);
        this.updateMetadata(sessionId, {
            currentTask: `backlog: ${row.title}`,
            lastHeartbeatAt: now,
            runtimePid: process.pid,
        });

        return {
            task: this.getBacklogTask(row.id)!,
            session: this.getCurrentSession(),
        };
    }

    completeBacklogTask(taskId: string, input: CompleteBacklogTaskInput) {
        const task = this.getBacklogTask(taskId);
        if (!task) throw Object.assign(new Error('BACKLOG_TASK_NOT_FOUND'), { statusCode: 404 });
        const sessionId = this.resolveRuntimeSessionId(input.sessionId || task.sessionId);
        if (task.sessionId !== sessionId) {
            throw Object.assign(new Error('BACKLOG_TASK_SESSION_MISMATCH'), { statusCode: 400 });
        }

        const now = Date.now();
        const checkpointRef = normalizeOptionalText(input.checkpointRef) || task.checkpointRef;
        const errorText = normalizeOptionalText(input.error);
        const status: BacklogTaskStatus = errorText ? 'failed' : 'completed';
        this.db.prepare(`
            UPDATE yuri_session_backlog
            SET status = ?,
                checkpoint_ref = ?,
                last_error = ?,
                completed_at = ?,
                updated_at = ?
            WHERE id = ?
        `).run(status, checkpointRef, errorText, now, now, taskId);
        this.updateMetadata(sessionId, {
            checkpointRef,
            currentTask: errorText ? `backlog failed: ${task.title}` : `backlog completed: ${task.title}`,
            lastHeartbeatAt: now,
            runtimePid: process.pid,
        });

        return {
            task: this.getBacklogTask(taskId)!,
            session: this.getCurrentSession(),
        };
    }

    private tick() {
        try {
            const current = this.getCurrentSession();
            if (!current) return;
            this.heartbeat({ sessionId: current.id, currentTask: current.currentTask });

            if (current.idleMode === 'backlog' && this.canStartWorkSlice()) {
                const { task } = this.claimNextBacklogTask({ sessionId: current.id });
                if (task) this.maybeRunWorkSlice(current, task);
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

    private maybeRunWorkSlice(snapshot: SessionSnapshot, task: BacklogTaskSnapshot) {
        this.lastWorkSliceAt = Date.now();

        const mode = process.env.YURI_SESSION_RUNTIME_MODE === 'dry-run' ? '--dry-run' : '--live';
        const scriptPath = path.join(SystemConfig.ROOT, 'Scripts/yuri-sandbox-loop.mjs');
        const prompt = buildWorkSlicePrompt(snapshot, task);
        const args = [scriptPath, mode, '--prompt', prompt];
        if (process.env.YURI_DB_PATH) {
            args.push('--db', process.env.YURI_DB_PATH);
        }

        this.updateMetadata(snapshot.id, {
            currentTask: `running backlog: ${task.title}`,
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
                this.completeBacklogTask(task.id, {
                    sessionId: snapshot.id,
                    checkpointRef,
                    error: code === 0 && !signal ? undefined : currentTask,
                });
            } catch (error) {
                console.error('⬡ SESSION_RUNTIME_WORK_SLICE_UPDATE_ERROR:', error);
            }
        });
    }

    private canStartWorkSlice() {
        if (process.env.YURI_SESSION_RUNTIME_TEST_MODE === '1') return false;
        if (this.child && this.child.exitCode === null) return false;
        return Date.now() - this.lastWorkSliceAt >= WORK_SLICE_INTERVAL_MS;
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
            graphId: metadata.graphId,
            intentId: metadata.intentId,
            graphPlanPath: metadata.graphPlanPath,
            normalizedIntentPath: metadata.normalizedIntentPath,
            verificationState: metadata.verificationState,
            promotionState: metadata.promotionState,
        };
    }

    private readGraphSummary(snapshot: SessionSnapshot): ControlPlaneGraphSummary | null {
        const graphPlanPath = normalizeOptionalArtifactPath(snapshot.graphPlanPath, 'graph-plan.json');
        if (!graphPlanPath) return null;
        const graphPlan = readJsonArtifact(graphPlanPath);
        if (!isRecord(graphPlan)) return null;
        const nodes = Array.isArray(graphPlan.nodes) ? graphPlan.nodes : [];
        const artifactPolicy = isRecord(graphPlan.artifact_policy) ? graphPlan.artifact_policy : {};
        const canonicalStatePolicy = isRecord(graphPlan.canonical_state_policy) ? graphPlan.canonical_state_policy : {};
        const graphId = stringValue(graphPlan.graph_id) || snapshot.graphId;
        const intentId = stringValue(graphPlan.intent_id) || snapshot.intentId;
        if (!graphId || !intentId) return null;

        return {
            graphId,
            intentId,
            scenario: stringValue(graphPlan.scenario) || 'unknown',
            routeLane: stringValue(graphPlan.route_lane) || 'unknown',
            createdAt: stringValue(graphPlan.created_at),
            lifecycle: Array.isArray(graphPlan.lifecycle)
                ? graphPlan.lifecycle.map((item) => String(item)).filter(Boolean)
                : [],
            nodeCount: nodes.length,
            artifactRoot: stringValue(artifactPolicy.artifact_root),
            graphPlanPath,
            normalizedIntentPath: normalizeOptionalArtifactPath(snapshot.normalizedIntentPath, 'normalized-intent.json'),
            rawOutputTainted: canonicalStatePolicy.raw_output_tainted === true || artifactPolicy.raw_output_tainted === true,
            sanitizedVerifiedSummaryOnly: canonicalStatePolicy.sanitized_verified_summary_only === true,
            promotionRequiresReview: canonicalStatePolicy.promotion_requires_review === true,
        };
    }

    private ensureBacklogTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS yuri_session_backlog (
                id              TEXT PRIMARY KEY,
                session_id      TEXT NOT NULL,
                title           TEXT NOT NULL,
                prompt          TEXT NOT NULL,
                reason          TEXT NOT NULL,
                priority        INTEGER NOT NULL DEFAULT 50,
                status          TEXT NOT NULL DEFAULT 'queued',
                attempts        INTEGER NOT NULL DEFAULT 0,
                max_attempts    INTEGER NOT NULL DEFAULT 3,
                checkpoint_ref  TEXT,
                last_error      TEXT,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL,
                started_at      INTEGER,
                completed_at    INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_yuri_session_backlog_session_status_priority
                ON yuri_session_backlog(session_id, status, priority, created_at);
        `);
    }

    private seedDefaultBacklog(sessionId: string, now: number) {
        const insert = this.db.prepare(`
            INSERT INTO yuri_session_backlog (
                id,
                session_id,
                title,
                prompt,
                reason,
                priority,
                status,
                attempts,
                max_attempts,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, 3, ?, ?)
        `);
        for (const task of DEFAULT_BACKLOG_TASKS) {
            insert.run(
                `backlog-${timestampId(now)}-${crypto.randomBytes(3).toString('hex')}`,
                sessionId,
                task.title,
                task.prompt,
                task.reason,
                task.priority,
                now,
                now,
            );
        }
    }

    private resolveRuntimeSessionId(value: unknown): string {
        const sessionId = normalizeOptionalText(value);
        if (sessionId) {
            const row = this.getRow(sessionId);
            if (!row || !isRuntimeRow(row)) {
                throw Object.assign(new Error('SESSION_NOT_FOUND'), { statusCode: 404 });
            }
            return sessionId;
        }

        const active = this.getCurrentSession();
        if (!active) throw Object.assign(new Error('ACTIVE_SESSION_NOT_FOUND'), { statusCode: 404 });
        return active.id;
    }

    private getBacklogTask(taskId: string): BacklogTaskSnapshot | null {
        const row = this.db.prepare('SELECT * FROM yuri_session_backlog WHERE id = ?')
            .get(taskId) as BacklogTaskRow | undefined;
        return row ? rowToBacklogTask(row) : null;
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
        graphId: null,
        intentId: null,
        graphPlanPath: null,
        normalizedIntentPath: null,
        verificationState: null,
        promotionState: null,
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
            graphId: typeof parsed.graphId === 'string' ? parsed.graphId : null,
            intentId: typeof parsed.intentId === 'string' ? parsed.intentId : null,
            graphPlanPath: normalizeOptionalArtifactPath(parsed.graphPlanPath, 'graph-plan.json'),
            normalizedIntentPath: normalizeOptionalArtifactPath(parsed.normalizedIntentPath, 'normalized-intent.json'),
            verificationState: typeof parsed.verificationState === 'string' ? parsed.verificationState : null,
            promotionState: typeof parsed.promotionState === 'string' ? parsed.promotionState : null,
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

function normalizeOptionalText(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeOptionalArtifactPath(value: unknown, expectedBasename: string) {
    const text = normalizeOptionalText(value);
    if (!text) return null;
    const resolved = path.resolve(text);
    return path.basename(resolved) === expectedBasename ? resolved : null;
}

function applyControlPlanePatch(input: HeartbeatInput, patch: Partial<SessionMetadata>) {
    const graphId = normalizeOptionalText(input.graphId);
    const intentId = normalizeOptionalText(input.intentId);
    const graphPlanPath = normalizeOptionalArtifactPath(input.graphPlanPath, 'graph-plan.json');
    const normalizedIntentPath = normalizeOptionalArtifactPath(input.normalizedIntentPath, 'normalized-intent.json');
    const verificationState = normalizeOptionalText(input.verificationState);
    const promotionState = normalizeOptionalText(input.promotionState);

    if (graphId) patch.graphId = graphId;
    if (intentId) patch.intentId = intentId;
    if (graphPlanPath) patch.graphPlanPath = graphPlanPath;
    if (normalizedIntentPath) patch.normalizedIntentPath = normalizedIntentPath;
    if (verificationState) patch.verificationState = verificationState;
    if (promotionState) patch.promotionState = promotionState;
}

function readJsonArtifact(filePath: string | null) {
    if (!filePath) return null;
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > 1_000_000) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    } catch {
        return null;
    }
}

function readNodeVerificationCounts(graphPlanPath: string | null, fallbackNodeCount: number): ControlPlaneNodeCounts {
    const counts: ControlPlaneNodeCounts = {};
    if (!graphPlanPath) return counts;
    const verificationDir = path.join(path.dirname(graphPlanPath), 'node-verifications');
    try {
        const entries = fs.readdirSync(verificationDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.verification.json'));
        if (entries.length === 0) {
            if (fallbackNodeCount > 0) counts.pending = fallbackNodeCount;
            return counts;
        }
        for (const entry of entries) {
            const payload = readJsonArtifact(path.join(verificationDir, entry.name));
            const status = isRecord(payload) && typeof payload.verification_status === 'string'
                ? payload.verification_status
                : 'unknown';
            counts[status] = (counts[status] || 0) + 1;
        }
        return counts;
    } catch {
        if (fallbackNodeCount > 0) counts.pending = fallbackNodeCount;
        return counts;
    }
}

function buildPromotionGateStatus(
    snapshot: SessionSnapshot | null,
    graphSummary: ControlPlaneGraphSummary | null,
    nodeCounts: ControlPlaneNodeCounts,
): ControlPlanePromotionGateStatus {
    const verifiedNodeCount = (nodeCounts.verified || 0) + (nodeCounts.passed || 0) + (nodeCounts.ok || 0);
    const totalNodeCount = graphSummary?.nodeCount || 0;
    const requiresVerification = graphSummary?.promotionRequiresReview !== false;
    const state = snapshot?.promotionState || (requiresVerification && verifiedNodeCount < totalNodeCount
        ? 'blocked_pending_verification'
        : 'eligible_for_review');
    return {
        status: graphSummary ? state : 'no_active_graph',
        action: graphSummary ? 'existing-learning-review-only' : 'none',
        requiresVerification,
        verifiedNodeCount,
        totalNodeCount,
        verificationState: snapshot?.verificationState || null,
        promotionState: snapshot?.promotionState || null,
    };
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function mapBacklogStatus(status: string): BacklogTaskStatus {
    if (status === 'running') return 'running';
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    return 'queued';
}

function rowToBacklogTask(row: BacklogTaskRow): BacklogTaskSnapshot {
    return {
        id: row.id,
        sessionId: row.session_id,
        title: row.title,
        prompt: row.prompt,
        reason: row.reason,
        priority: row.priority,
        status: mapBacklogStatus(row.status),
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        checkpointRef: row.checkpoint_ref,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
    };
}

function summarizeBacklog(tasks: BacklogTaskSnapshot[]): BacklogSummary {
    const summary: BacklogSummary = {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        total: tasks.length,
    };
    for (const task of tasks) {
        summary[task.status] += 1;
    }
    return summary;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function timestampId(value: number) {
    return new Date(value).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function buildWorkSlicePrompt(snapshot: SessionSnapshot, task: BacklogTaskSnapshot) {
    return [
        `Continue durable Yuri session ${snapshot.id}.`,
        `Session title: ${snapshot.title}.`,
        `Operator prompt: ${snapshot.prompt}.`,
        `Backlog task: ${task.title}.`,
        `Backlog reason: ${task.reason}.`,
        `Backlog prompt: ${task.prompt}.`,
        `Deadline: ${new Date(snapshot.deadlineAt).toISOString()}.`,
        'Produce local evidence and stop cleanly at the slice boundary.',
    ].join('\n');
}
