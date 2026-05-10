import { apiFetchWithTimeout, API_ORIGINS, getRuntimeAuthToken } from './runtime';

export const ORACLE_COMMAND_ENDPOINT = '/api/oracle/command';
export const ORACLE_COMMAND_BUDGETS_MS = {
    deliberationDelay: 150,
    staleSoft: 30_000,
    staleHard: 60_000,
    directHardTimeout: 120_000,
    councilHardTimeout: 90_000
} as const;

const COUNCIL_AGENTS = ['ENLIL', 'NABU', 'ENKI', 'INANNA'] as const;
export type CouncilAgent = typeof COUNCIL_AGENTS[number];

export type OracleCommandPhase =
    | 'idle'
    | 'submitted'
    | 'deliberating'
    | 'stale'
    | 'completed'
    | 'failed';

export type OracleCommandSource = 'typed' | 'voice';
export type OracleCommandMode = 'direct' | 'council';
export type OracleStaleLevel = 'soft' | 'hard';

export interface OracleCommandResponse {
    [key: string]: any;
}

export interface OracleCommandState {
    requestId: string | null;
    source: OracleCommandSource | null;
    mode: OracleCommandMode;
    phase: OracleCommandPhase;
    staleLevel: OracleStaleLevel | null;
    command: string;
    response: OracleCommandResponse | null;
    error: string | null;
    submittedAt: number | null;
    settledAt: number | null;
    elapsedMs: number;
    councilAgent: CouncilAgent | null;
}

export interface OracleSubmitOptions {
    command: string;
    source?: OracleCommandSource;
    useCouncil?: boolean;
    modelId?: string;
    signal?: AbortSignal;
}

type OracleCommandListener = (state: OracleCommandState) => void;
type TimeoutHandle = ReturnType<typeof globalThis.setTimeout>;
type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

const listeners = new Set<OracleCommandListener>();

let state: OracleCommandState = createIdleState();
let requestCounter = 0;
let activeController: AbortController | null = null;
let phaseTimer: TimeoutHandle | null = null;
let staleSoftTimer: TimeoutHandle | null = null;
let staleHardTimer: TimeoutHandle | null = null;
let tickInterval: IntervalHandle | null = null;

let councilAgentTimer: IntervalHandle | null = null;

function createIdleState(): OracleCommandState {
    return {
        requestId: null,
        source: null,
        mode: 'direct',
        phase: 'idle',
        staleLevel: null,
        command: '',
        response: null,
        error: null,
        submittedAt: null,
        settledAt: null,
        elapsedMs: 0,
        councilAgent: null
    };
}

function cloneState(current: OracleCommandState): OracleCommandState {
    return {
        ...current,
        response: current.response ? { ...current.response } : null
    };
}

function emit() {
    const snapshot = cloneState(state);
    listeners.forEach((listener) => listener(snapshot));
}

function setState(nextState: OracleCommandState | ((current: OracleCommandState) => OracleCommandState)) {
    state = typeof nextState === 'function' ? nextState(state) : nextState;
    emit();
}

function clearTimeoutSafe(timer: TimeoutHandle | null) {
    if (timer !== null) {
        globalThis.clearTimeout(timer);
    }
}

function clearIntervalSafe(timer: IntervalHandle | null) {
    if (timer !== null) {
        globalThis.clearInterval(timer);
    }
}

function stopTimers() {
    clearTimeoutSafe(phaseTimer);
    clearTimeoutSafe(staleSoftTimer);
    clearTimeoutSafe(staleHardTimer);
    clearIntervalSafe(tickInterval);
    clearIntervalSafe(councilAgentTimer);
    phaseTimer = null;
    staleSoftTimer = null;
    staleHardTimer = null;
    tickInterval = null;
    councilAgentTimer = null;
}

function startCouncilAgentCycle(requestId: string) {
    let idx = 0;
    councilAgentTimer = globalThis.setInterval(() => {
        idx = (idx + 1) % COUNCIL_AGENTS.length;
        setState((current) => {
            if (current.requestId !== requestId || !isActivePhase(current.phase)) {
                clearIntervalSafe(councilAgentTimer);
                councilAgentTimer = null;
                return current;
            }
            return { ...current, councilAgent: COUNCIL_AGENTS[idx] };
        });
    }, 8_000);
}

function isActivePhase(phase: OracleCommandPhase) {
    return phase === 'submitted' || phase === 'deliberating' || phase === 'stale';
}

function getElapsedMs(submittedAt: number | null, fallback = 0) {
    return submittedAt ? Math.max(0, Date.now() - submittedAt) : fallback;
}

function startElapsedClock(requestId: string) {
    clearIntervalSafe(tickInterval);
    tickInterval = globalThis.setInterval(() => {
        setState((current) => {
            if (current.requestId !== requestId || !current.submittedAt || !isActivePhase(current.phase)) {
                clearIntervalSafe(tickInterval);
                tickInterval = null;
                return current;
            }
            return {
                ...current,
                elapsedMs: getElapsedMs(current.submittedAt, current.elapsedMs)
            };
        });
    }, 250);
}

function schedulePhaseTimers(requestId: string) {
    phaseTimer = globalThis.setTimeout(() => {
        setState((current) => {
            if (current.requestId !== requestId || current.phase !== 'submitted') {
                return current;
            }
            return {
                ...current,
                phase: 'deliberating',
                elapsedMs: getElapsedMs(current.submittedAt, current.elapsedMs)
            };
        });
    }, ORACLE_COMMAND_BUDGETS_MS.deliberationDelay);

    staleSoftTimer = globalThis.setTimeout(() => {
        setState((current) => {
            if (current.requestId !== requestId || !isActivePhase(current.phase)) {
                return current;
            }
            return {
                ...current,
                phase: 'stale',
                staleLevel: 'soft',
                elapsedMs: getElapsedMs(current.submittedAt, current.elapsedMs)
            };
        });
    }, ORACLE_COMMAND_BUDGETS_MS.staleSoft);

    staleHardTimer = globalThis.setTimeout(() => {
        setState((current) => {
            if (current.requestId !== requestId || !isActivePhase(current.phase)) {
                return current;
            }
            return {
                ...current,
                phase: 'stale',
                staleLevel: 'hard',
                elapsedMs: getElapsedMs(current.submittedAt, current.elapsedMs)
            };
        });
    }, ORACLE_COMMAND_BUDGETS_MS.staleHard);
}

function hardTimeoutForMode(mode: OracleCommandMode) {
    return mode === 'council'
        ? ORACLE_COMMAND_BUDGETS_MS.councilHardTimeout
        : ORACLE_COMMAND_BUDGETS_MS.directHardTimeout;
}

function makeRequestId() {
    requestCounter += 1;
    return `oracle_${Date.now()}_${requestCounter}`;
}

function normalizeError(error: unknown) {
    if (error instanceof Error) {
        return error.message || 'ORACLE_COMMAND_FAILED';
    }
    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }
    return 'ORACLE_COMMAND_FAILED';
}

function settleRequest(requestId: string, phase: 'completed' | 'failed', patch: Partial<OracleCommandState>) {
    stopTimers();
    setState((current) => {
        if (current.requestId !== requestId) return current;
        const settledAt = Date.now();
        return {
            ...current,
            ...patch,
            phase,
            settledAt,
            elapsedMs: getElapsedMs(current.submittedAt, current.elapsedMs)
        };
    });
}

export function getOracleCommandState() {
    return cloneState(state);
}

export function subscribeOracleCommandState(listener: OracleCommandListener) {
    listeners.add(listener);
    listener(getOracleCommandState());
    return () => {
        listeners.delete(listener);
    };
}

export function resetOracleCommandState() {
    stopTimers();
    activeController?.abort();
    activeController = null;
    setState(createIdleState());
}

export type OracleStreamCallback = (chunk: { type: 'token' | 'done' | 'error'; token?: string; content?: string; error?: string }) => void;

export async function submitOracleCommandStream(
    options: OracleSubmitOptions & { onChunk: OracleStreamCallback; modelId?: string }
) {
    const command = options.command.trim();
    if (!command) throw new Error('ORACLE_COMMAND_REQUIRED');

    stopTimers();
    activeController?.abort();
    const requestId = makeRequestId();
    const submittedAt = Date.now();
    const controller = new AbortController();
    activeController = controller;

    setState({
        requestId,
        source: options.source || 'typed',
        mode: 'direct',
        phase: 'submitted',
        staleLevel: null,
        command,
        response: null,
        error: null,
        submittedAt,
        settledAt: null,
        elapsedMs: 0,
        councilAgent: null
    });

    startElapsedClock(requestId);
    schedulePhaseTimers(requestId);

    const model = options.modelId || 'qwen-liberated:latest';
    const apiToken = await getRuntimeAuthToken();
    const tokenParam = apiToken ? `&apiKey=${encodeURIComponent(apiToken)}` : '';
    const url = `${API_ORIGINS[0]}/api/oracle/stream?command=${encodeURIComponent(command)}&model=${encodeURIComponent(model)}${tokenParam}`;

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000];
    let full = '';
    let attempt = 0;

    const connect = () => {
        const es = new EventSource(url);

        es.addEventListener('token', (e: MessageEvent) => {
            attempt = 0; // reset retry counter on successful data
            try {
                const { token } = JSON.parse(e.data);
                full += token;
                options.onChunk({ type: 'token', token });
            } catch (_) {}
        });

        es.addEventListener('done', (e: MessageEvent) => {
            es.close();
            try { const { content } = JSON.parse(e.data); full = content || full; } catch (_) {}
            options.onChunk({ type: 'done', content: full });
            settleRequest(requestId, 'completed', { response: { content: full }, error: null });
        });

        es.addEventListener('error', (e: MessageEvent) => {
            es.close();
            let msg = 'STREAM_FAILED';
            try { msg = JSON.parse((e as any).data)?.message || msg; } catch (_) {}
            options.onChunk({ type: 'error', error: msg });
            settleRequest(requestId, 'failed', { response: null, error: msg });
        });

        es.onerror = () => {
            es.close();
            if (attempt < MAX_RETRIES) {
                const delay = RETRY_DELAYS[attempt] ?? 4000;
                attempt++;
                globalThis.setTimeout(connect, delay);
            } else {
                options.onChunk({ type: 'error', error: 'SSE_CONNECTION_LOST' });
                settleRequest(requestId, 'failed', { response: null, error: 'SSE_CONNECTION_LOST' });
            }
        };
    };

    connect();
}

export async function submitOracleCommand(options: OracleSubmitOptions) {
    const command = options.command.trim();
    if (!command) {
        throw new Error('ORACLE_COMMAND_REQUIRED');
    }

    stopTimers();
    activeController?.abort();

    const requestId = makeRequestId();
    const submittedAt = Date.now();
    const mode: OracleCommandMode = options.useCouncil ? 'council' : 'direct';
    const controller = new AbortController();
    const upstreamSignal = options.signal;
    const relayAbort = () => controller.abort();

    if (upstreamSignal) {
        if (upstreamSignal.aborted) {
            controller.abort();
        } else {
            upstreamSignal.addEventListener('abort', relayAbort, { once: true });
        }
    }

    activeController = controller;

    setState({
        requestId,
        source: options.source || 'typed',
        mode,
        phase: 'submitted',
        staleLevel: null,
        command,
        response: null,
        error: null,
        submittedAt,
        settledAt: null,
        elapsedMs: 0,
        councilAgent: null
    });

    startElapsedClock(requestId);
    schedulePhaseTimers(requestId);
    if (mode === 'council') startCouncilAgentCycle(requestId);

    try {
        const response = await apiFetchWithTimeout(ORACLE_COMMAND_ENDPOINT, hardTimeoutForMode(mode), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command,
                useCouncil: mode === 'council',
                modelId: mode === 'direct' ? options.modelId || undefined : undefined
            }),
            signal: controller.signal
        });

        const payload = await response.json().catch(() => ({} as OracleCommandResponse));
        if (!response.ok) {
            const message = String(
                (payload as Record<string, unknown>)?.message
                || (payload as Record<string, unknown>)?.error
                || `HTTP_${response.status}`
            );
            throw new Error(message);
        }

        settleRequest(requestId, 'completed', {
            response: payload,
            error: null
        });
        return payload;
    } catch (error) {
        if (state.requestId === requestId) {
            settleRequest(requestId, 'failed', {
                response: null,
                error: normalizeError(error)
            });
        }
        throw error;
    } finally {
        if (upstreamSignal) {
            upstreamSignal.removeEventListener('abort', relayAbort);
        }
        if (activeController === controller) {
            activeController = null;
        }
    }
}
