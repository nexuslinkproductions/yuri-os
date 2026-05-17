import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../lib/runtime';
import {
    getOracleCommandState,
    ORACLE_COMMAND_BUDGETS_MS,
    subscribeOracleCommandState,
    submitOracleCommand,
    type OracleCommandState
} from '../lib/oracleCommandBridge';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'conclave' | 'system';
    content: string;
    model?: string;
    timestamp: string;
    deliberations?: {
        enlil?: string;
        nabu?: string;
        enki?: string;
        inanna?: string;
    };
    memory_bank?: any;
    context_injected?: boolean;
    streaming?: boolean;
}

interface Model {
    id: string;
    name: string;
    provider: string;
    status: string;
    runtime?: 'native' | 'local' | 'fallback';
    recommended?: boolean;
}

interface WorkflowCatalogEntry {
    id: string;
    title: string;
    summary: string;
    category: string;
    status: string;
    surfaces: Array<'codex' | 'claude' | 'both'>;
}

interface MathCurveCatalogEntry {
    id: string;
    title: string;
    family: string;
    summary: string;
    status: string;
}

interface ImageServiceStatus {
    configured: boolean;
    baseURL: string;
    authConfigured: boolean;
}

interface ImageTaskRecord {
    taskId: string;
    resultUrls: string[];
    successFlag: number;
    errorMessage: string | null;
    progress: string;
}

interface UploadedSourceImage {
    name: string;
    dataUrl: string;
    previewUrl: string;
}

type MsgAction =
    | { type: 'add'; message: Message }
    | { type: 'update'; id: string; patch: Partial<Message> }
    | { type: 'remove'; id: string }
    | { type: 'reset' };

function formatDuration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function messagesReducer(state: Message[], action: MsgAction): Message[] {
    switch (action.type) {
        case 'add':
            if (state.some((m) => m.id === action.message.id)) return state;
            return [...state, action.message];
        case 'update':
            return state.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m));
        case 'remove':
            return state.filter((m) => m.id !== action.id);
        case 'reset':
            return [];
        default:
            return state;
    }
}

function buildMessageContent(data: any) {
    const message = data?.final_summary || data?.content || data?.error || 'Directive processed.';
    if (data?.status && data.status !== 'CONCLAVE_SUCCESS') {
        return `⬡ ${data.status} :: ${message}`;
    }
    return message;
}

function extractDeliberations(memoryBank: any): Message['deliberations'] {
    const delibs: Message['deliberations'] = {};
    const artifacts: any[] = memoryBank?.memory?.shortTerm || memoryBank?.shortTerm || [];
    const byRole: Record<string, any[]> = {};

    for (const artifact of artifacts) {
        const role = String(artifact.producer || 'UNKNOWN').toUpperCase();
        (byRole[role] ||= []).push(artifact);
    }

    const summarize = (arts: any[] | undefined): string => {
        if (!arts || arts.length === 0) return '';
        return arts
            .map((artifact: any) => `[${artifact.type}] ${typeof artifact.payload === 'string' ? artifact.payload : JSON.stringify(artifact.payload).slice(0, 200)}`)
            .join('\n\n');
    };

    delibs.enlil = summarize(byRole.ARCHITECT);
    delibs.nabu = summarize(byRole.SCRIBE);
    delibs.enki = summarize(byRole.CRAFTSMAN);
    delibs.inanna = summarize(byRole.GUARDIAN);
    return delibs;
}

function shouldShowMissionSynthesis(response: any) {
    return response?.status === 'CONCLAVE_SUCCESS' && response?.ui?.overlay === 'mission_synthesis';
}

const NeuralForge: React.FC = () => {
    const [messages, dispatchMsg] = useReducer(messagesReducer, []);
    const [status, setStatus] = useState({ local: false, cloud: false });
    const [imageStatus, setImageStatus] = useState<ImageServiceStatus | null>(null);
    const [models, setModels] = useState<Model[]>([]);
    const [catalog, setCatalog] = useState<{ workflows: WorkflowCatalogEntry[]; mathCurves: MathCurveCatalogEntry[] }>({
        workflows: [],
        mathCurves: []
    });
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [input, setInput] = useState('');
    const [useConclave, setUseConclave] = useState(true);
    const [catalogLoadedAt, setCatalogLoadedAt] = useState<string | null>(null);

    const [imagePrompt, setImagePrompt] = useState('A cinematic product shot of a matte black camera under studio lights');
    const [imageSize, setImageSize] = useState<'1:1' | '3:2' | '2:3'>('1:1');
    const [imageVariants, setImageVariants] = useState(1);
    const [imageEnhance, setImageEnhance] = useState(false);
    const [imageWaitForCompletion, setImageWaitForCompletion] = useState(true);
    const [imageGenerating, setImageGenerating] = useState(false);
    const [imageTask, setImageTask] = useState<ImageTaskRecord | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    const [imageSource, setImageSource] = useState<UploadedSourceImage | null>(null);
    const [commandState, setCommandState] = useState<OracleCommandState>(() => getOracleCommandState());

    const scrollRef = useRef<HTMLDivElement>(null);
    const activeRequestRef = useRef<string | null>(null);
    const completedRequestRef = useRef<string | null>(null);

    useEffect(() => {
        const loadDiscovery = async () => {
            try {
                const [statusRes, modelsRes, catalogRes] = await Promise.all([
                    apiFetch('/api/neural/status'),
                    apiFetch('/api/neural/models'),
                    apiFetch('/api/catalog')
                ]);

                const statusData = await statusRes.json();
                const modelData = await modelsRes.json();
                const catalogData = await catalogRes.json();

                setStatus({
                    local: !!statusData.local,
                    cloud: !!statusData.cloud
                });
                setImageStatus(statusData?.image ? {
                    configured: !!statusData.image.configured,
                    baseURL: String(statusData.image.baseURL || ''),
                    authConfigured: !!statusData.image.authConfigured
                } : null);

                const nextModels = Array.isArray(modelData) ? modelData : [];
                setModels(nextModels);
                setCatalog({
                    workflows: Array.isArray(catalogData?.workflows) ? catalogData.workflows : [],
                    mathCurves: Array.isArray(catalogData?.mathCurves) ? catalogData.mathCurves : []
                });
                setCatalogLoadedAt(new Date().toISOString());

                setSelectedModel((current) => {
                    if (current && nextModels.some((model: Model) => model.id === current)) return current;
                    const preferred = nextModels.find((model: Model) => model.recommended)
                        || nextModels.find((model: Model) => model.status === 'ACTIVE')
                        || nextModels[0];
                    return preferred?.id || current;
                });
            } catch (error) {
                console.error('⬡ NEURAL_DISCOVERY_SYNC_FAILED', error);
            }
        };

        loadDiscovery();
        const interval = window.setInterval(loadDiscovery, 30000);
        return () => window.clearInterval(interval);
    }, []);

    const isThinking = commandState.phase === 'submitted'
        || commandState.phase === 'deliberating'
        || commandState.phase === 'stale';

    const submitTypedDirective = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isThinking) return;
        setInput('');

        try {
            await submitOracleCommand({
                command: trimmed,
                source: 'typed',
                useCouncil: useConclave,
                modelId: useConclave ? undefined : selectedModel || undefined
            });
        } catch {}
    }, [input, isThinking, useConclave, selectedModel]);

    const handleTypedSubmitKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void submitTypedDirective();
    }, [submitTypedDirective]);

    const generateImage = useCallback(async () => {
        const prompt = imagePrompt.trim();
        if (!prompt || imageGenerating) return;

        setImageGenerating(true);
        setImageError(null);
        setImageTask(null);

        try {
            const res = await apiFetch('/api/neural/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    size: imageSize,
                    nVariants: imageVariants,
                    isEnhance: imageEnhance,
                    waitForCompletion: imageWaitForCompletion,
                    sourceImageDataUrl: imageSource?.dataUrl,
                    sourceImageName: imageSource?.name
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'IMAGE_GENERATION_FAILED');
            }

            setImageTask({
                taskId: String(data.taskId || ''),
                resultUrls: Array.isArray(data.resultUrls) ? data.resultUrls : [],
                successFlag: typeof data.successFlag === 'number' ? data.successFlag : 0,
                errorMessage: data.errorMessage || null,
                progress: String(data.progress || '0.00')
            });
        } catch (error: any) {
            setImageError(error?.message || 'IMAGE_GENERATION_FAILED');
        } finally {
            setImageGenerating(false);
        }
    }, [imagePrompt, imageSize, imageVariants, imageEnhance, imageWaitForCompletion, imageGenerating, imageSource]);

    const handleSourceImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        if (!file) {
            setImageSource(null);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            if (!dataUrl) {
                setImageSource(null);
                return;
            }

            setImageSource({
                name: file.name,
                dataUrl,
                previewUrl: dataUrl
            });
        };
        reader.readAsDataURL(file);
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isThinking]);

    useEffect(() => {
        return subscribeOracleCommandState(setCommandState);
    }, []);

    useEffect(() => {
        if (!commandState.requestId) {
            activeRequestRef.current = null;
            completedRequestRef.current = null;
            return;
        }

        const requestId = commandState.requestId;
        const thinkingId = `t_${requestId}`;

        if (activeRequestRef.current !== requestId) {
            activeRequestRef.current = requestId;
            completedRequestRef.current = null;
            dispatchMsg({
                type: 'add',
                message: {
                    id: `u_${requestId}`,
                    role: 'user',
                    content: commandState.command,
                    timestamp: new Date(commandState.submittedAt || Date.now()).toISOString()
                }
            });
        }

        if (commandState.phase === 'submitted' || commandState.phase === 'deliberating' || commandState.phase === 'stale') {
            const thinkingContent = commandState.phase === 'submitted'
                ? 'ORACLE_LINK_SUBMITTED...'
                : commandState.phase === 'stale'
                    ? commandState.staleLevel === 'hard'
                        ? 'FORGE_STILL_WORKING // HOLD_CHANNEL_OPEN...'
                        : 'FORGE_DELAYED // DELIBERATION_CONTINUES...'
                    : commandState.mode === 'council'
                        ? 'THE_CONCLAVE_IS_DELIBERATING...'
                        : 'FORGE_THINKING...';

            dispatchMsg({
                type: 'add',
                message: {
                    id: thinkingId,
                    role: 'system',
                    content: thinkingContent,
                    timestamp: new Date(commandState.submittedAt || Date.now()).toISOString(),
                    streaming: true
                }
            });
            dispatchMsg({
                type: 'update',
                id: thinkingId,
                patch: { content: thinkingContent }
            });
            return;
        }

        dispatchMsg({ type: 'remove', id: thinkingId });

        if (completedRequestRef.current === requestId) {
            return;
        }

        completedRequestRef.current = requestId;
        if (commandState.phase === 'completed' && commandState.response) {
            const data = commandState.response as Record<string, any>;
            if (commandState.mode === 'council' && data.status === 'CONCLAVE_SUCCESS' && data.memory_bank) {
                dispatchMsg({
                    type: 'add',
                    message: {
                        id: `c_${requestId}`,
                        role: 'conclave',
                        content: typeof data.final_summary === 'string' ? data.final_summary : 'Processed.',
                        deliberations: extractDeliberations(data.memory_bank),
                        timestamp: new Date(commandState.settledAt || Date.now()).toISOString()
                    }
                });
            } else {
                dispatchMsg({
                    type: 'add',
                    message: {
                        id: `a_${requestId}`,
                        role: 'assistant',
                        content: buildMessageContent(data),
                        timestamp: new Date(commandState.settledAt || Date.now()).toISOString()
                    }
                });
            }

            if (commandState.source === 'typed' && shouldShowMissionSynthesis(data)) {
                (window as any).nudimmudEngine?.showHolographicResult(data);
            }
            return;
        }

        if (commandState.phase === 'failed') {
            dispatchMsg({
                type: 'add',
                message: {
                    id: `err_${requestId}`,
                    role: 'assistant',
                    content: `⬡ ERROR :: ${commandState.error || 'ORACLE_COMMAND_FAILED'}`,
                    timestamp: new Date(commandState.settledAt || Date.now()).toISOString()
                }
            });
        }
    }, [commandState]);

    const timeLabel = useMemo(() => {
        if (!catalogLoadedAt) return 'PENDING';
        return new Date(catalogLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, [catalogLoadedAt]);

    const summaryChips = [
        { label: 'LOCAL', value: status.local ? 'ONLINE' : 'OFFLINE', tone: status.local ? 'var(--gold-solar)' : 'rgba(255,255,255,0.4)' },
        { label: 'CLOUD', value: status.cloud ? 'ONLINE' : 'OFFLINE', tone: status.cloud ? 'var(--gold-solar)' : 'rgba(255,255,255,0.4)' },
        { label: 'MODELS', value: String(models.length), tone: 'var(--cyan-glow)' },
        { label: 'WORKFLOWS', value: String(catalog.workflows.length), tone: 'var(--cyan-glow)' },
        { label: 'CURVES', value: String(catalog.mathCurves.length), tone: 'var(--cyan-glow)' }
    ];

    const bridgeLabel = commandState.phase === 'submitted'
        ? 'SUBMITTED'
        : commandState.phase === 'deliberating'
            ? `DELIBERATING // ${formatDuration(commandState.elapsedMs)}`
            : commandState.phase === 'stale'
                ? `${commandState.staleLevel === 'hard' ? 'STALE // HOLD' : 'DELAYED'} // ${formatDuration(commandState.elapsedMs)}`
                : commandState.phase === 'completed'
                    ? 'RESPONDING'
                    : commandState.phase === 'failed'
                        ? 'FAULT'
                        : 'READY';

    const bridgeTone = commandState.phase === 'submitted' || commandState.phase === 'deliberating'
        ? 'var(--gold-solar)'
        : commandState.phase === 'completed'
            ? 'var(--cyan-glow)'
            : commandState.phase === 'failed'
                ? 'var(--red-fusion)'
                : commandState.phase === 'stale'
                    ? commandState.staleLevel === 'hard' ? 'var(--red-fusion)' : 'var(--gold-solar)'
                    : 'rgba(255,255,255,0.55)';

    const bridgeHint = commandState.phase === 'stale'
        ? commandState.staleLevel === 'hard'
            ? `LONG DELIBERATION // HARD LIMIT ${formatDuration(commandState.mode === 'council' ? ORACLE_COMMAND_BUDGETS_MS.councilHardTimeout : ORACLE_COMMAND_BUDGETS_MS.directHardTimeout)}`
            : 'DELIBERATION CONTINUES // KEEP CHANNEL OPEN'
        : commandState.phase === 'submitted'
            ? 'ORACLE LINK ACKNOWLEDGED'
            : commandState.phase === 'deliberating'
                ? `SOFT STALE AT ${formatDuration(ORACLE_COMMAND_BUDGETS_MS.staleSoft)}`
                : commandState.phase === 'completed'
                    ? 'FINAL RESPONSE RECEIVED'
                    : commandState.phase === 'failed'
                        ? 'NEURAL LINK FAULT'
                        : 'READY FOR DIRECTIVE';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '60px', minHeight: '100%', paddingBottom: '120px' }}>
            {/* 1. HEADER_OPERATIONAL_OVERVIEW */}
            <header className="neural-glass" style={{ padding: '40px', display: 'flex', justifyContent: 'space-between', gap: '40px', alignItems: 'flex-end', borderBottom: '1px solid rgba(118,185,0,0.15)' }}>
                <div style={{ maxWidth: '850px' }}>
                    <div className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--gold-solar)', letterSpacing: '0.45em', marginBottom: '15px', fontWeight: 700 }}>
                        ORACLE // NEURAL_HUD // FORGE_DELIBERATION_STREAM
                    </div>
                    <h2 style={{ margin: 0, fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 900, letterSpacing: '-0.05em', color: 'white', lineHeight: 0.9 }}>
                        Neural Forge
                    </h2>
                    <p style={{ margin: '20px 0 0', maxWidth: '75ch', lineHeight: 1.8, color: 'rgba(255,255,255,0.65)', fontSize: '1.05rem' }}>
                        Mission-critical reasoning and creative synthesis. The forge prioritizes high-performance local inference via Qwen-Liberated to ensure maximum response speed and security.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 140px)', gap: '20px' }}>
                    {summaryChips.slice(0, 3).map((item) => (
                        <div key={item.label} className="neural-glass" style={{ padding: '20px', borderRadius: '10px', textAlign: 'center', border: `1px solid ${item.tone}33`, background: 'rgba(0,0,0,0.2)' }}>
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.2em', opacity: 0.5, marginBottom: '10px' }}>{item.label}</div>
                            <div className="text-mono" style={{ fontSize: '0.9rem', fontWeight: 900, color: item.tone }}>{item.value}</div>
                        </div>
                    ))}
                </div>
            </header>

            {/* 2. CHAT_MISSION_CONTROL */}
            <section style={{ padding: '0 40px' }}>
                <div className="neural-glass" style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '30px', minHeight: '750px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', background: 'rgba(0,0,0,0.4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '25px' }}>
                        <div>
                            <div className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--gold-solar)', letterSpacing: '0.2em', marginBottom: '10px', fontWeight: 800 }}>
                                MISSION_COMMAND_STREAM
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white' }}>Mission Command & Inquiry</div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <div className="neural-glass" style={{ padding: '12px 18px', borderRadius: '8px', border: `1px solid ${bridgeTone}33`, background: 'rgba(0,0,0,0.3)', minWidth: '180px' }}>
                                <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.45, letterSpacing: '0.18em', marginBottom: '6px' }}>LIVE_BRIDGE</div>
                                <div className="text-mono" style={{ fontSize: '0.8rem', color: bridgeTone, fontWeight: 800, letterSpacing: '0.12em' }}>{bridgeLabel}</div>
                                <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.38, marginTop: '6px', letterSpacing: '0.12em' }}>{bridgeHint}</div>
                            </div>
                            <div className="neural-glass" style={{ padding: '12px 24px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(0,0,0,0.3)' }}>
                                <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.6, color: 'var(--cyan-glow)' }}>NEURAL_NODE:</div>
                                <select
                                    value={useConclave ? 'council' : selectedModel}
                                    onChange={(e) => {
                                        if (e.target.value === 'council') {
                                            setUseConclave(true);
                                            return;
                                        }
                                        setUseConclave(false);
                                        setSelectedModel(e.target.value);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--gold-solar)',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="council" style={{ background: '#0a0a0a' }}>[ AEONIC_COUNCIL ]</option>
                                    {models.map((model) => (
                                        <option key={model.id} value={model.id} style={{ background: '#0a0a0a' }}>
                                            {model.name.toUpperCase()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={() => setUseConclave((current) => !current)}
                                className="text-mono"
                                style={{
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 900,
                                    color: useConclave ? 'var(--gold-solar)' : 'rgba(255,255,255,0.4)',
                                    border: `1px solid ${useConclave ? 'var(--gold-solar)' : 'rgba(255,255,255,0.15)'}`,
                                    padding: '12px 28px',
                                    borderRadius: '8px',
                                    background: useConclave ? 'rgba(118, 185, 0, 0.12)' : 'transparent',
                                    transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)'
                                }}
                            >
                                {useConclave ? 'COUNCIL: ENGAGED' : 'NODE: DIRECT'}
                            </button>
                        </div>
                    </div>

                    {/* SCROLLABLE_CHAT_AREA */}
                    <div ref={scrollRef} style={{ flex: 1, minHeight: '600px', maxHeight: '1200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px', paddingRight: '25px', paddingBottom: '30px', scrollbarWidth: 'thin' }}>
                        <AnimatePresence initial={false}>
                            {messages.length > 0 ? messages.map((message) => (
                                <motion.div key={message.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                        <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.45, marginBottom: '10px', letterSpacing: '0.15em', fontWeight: 600 }}>
                                            {message.role.toUpperCase()} // {new Date(message.timestamp).toLocaleTimeString()}
                                        </div>
                                        
                                        {message.role === 'conclave' && message.deliberations ? (
                                            <div className="neural-glass" style={{ padding: '30px', borderLeft: '5px solid var(--gold-solar)', borderRadius: '12px', background: 'rgba(118,185,0,0.03)', maxWidth: '92%', boxShadow: '0 15px 40px rgba(0,0,0,0.2)' }}>
                                                {(['enlil', 'nabu', 'enki', 'inanna'] as const).map((key) => {
                                                    const content = message.deliberations?.[key];
                                                    if (!content) return null;
                                                    return (
                                                        <details key={key} style={{ marginBottom: '22px' }} open={false}>
                                                            <summary className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--cyan-glow)', fontWeight: 900, marginBottom: '10px', letterSpacing: '0.2em', cursor: 'pointer', listStyle: 'none' }}>
                                                                [{key.toUpperCase()}_PROTOCOL] <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: '10px' }}>(Click to expand details)</span>
                                                            </summary>
                                                            <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.95)', whiteSpace: 'pre-wrap', lineHeight: 1.8, fontWeight: 400, padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(0,242,255,0.1)' }}>
                                                                {content}
                                                            </div>
                                                        </details>
                                                    );
                                                })}
                                                <div style={{ marginTop: '25px', padding: '20px 25px', background: 'rgba(118,185,0,0.08)', border: '1px solid rgba(118,185,0,0.3)', borderRadius: '6px' }}>
                                                    <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.6, marginBottom: '8px', color: 'var(--gold-solar)', fontWeight: 800 }}>MISSION_SYNTHESIS</div>
                                                    <div style={{ color: 'white', fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.6 }}>
                                                        ⬡ {message.content}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="neural-glass" style={{ 
                                                padding: '20px 30px', 
                                                borderRadius: '16px', 
                                                border: message.role === 'user' ? '1px solid rgba(118,185,0,0.35)' : '1px solid rgba(255,255,255,0.12)',
                                                background: message.role === 'user' ? 'rgba(118,185,0,0.07)' : 'rgba(255,255,255,0.03)',
                                                color: message.role === 'user' ? 'var(--gold-solar)' : 'white', 
                                                fontSize: '1.05rem', 
                                                lineHeight: 1.8,
                                                maxWidth: '85%',
                                                whiteSpace: 'pre-wrap',
                                                boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                                            }}>
                                                {message.content}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div className="text-mono" style={{ opacity: 0.2, letterSpacing: '0.5em', fontSize: '1.5rem', fontWeight: 300 }}>
                                        AWAITING_COMMAND_PULSE
                                    </div>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* INPUT_BAR */}
                    <div style={{ display: 'flex', gap: '20px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(118,185,0,0.25)', padding: '20px 35px', borderRadius: '15px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', marginTop: '10px' }}>
                        <input
                            type="text"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleTypedSubmitKeyDown}
                            placeholder="Type a mission directive or inquiry to the council..."
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                fontSize: '1.15rem',
                                outline: 'none',
                                fontFamily: 'var(--font-mono)',
                                padding: '10px 0'
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => void submitTypedDirective()}
                            className="text-mono"
                            style={{
                                background: 'var(--gold-solar)',
                                border: 'none',
                                color: '#000',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                fontWeight: 900,
                                borderRadius: '8px',
                                padding: '12px 45px',
                                transition: 'all 0.3s',
                                boxShadow: '0 0 20px rgba(118, 185, 0, 0.3)'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            EXECUTE
                        </button>
                    </div>
                </div>

                {/* 3. VISUAL_TRANSITION_SEPARATOR */}
                <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '2px', height: '100%', background: 'linear-gradient(to bottom, transparent, var(--gold-solar), transparent)', opacity: 0.3 }}></div>
                </div>

                {/* 4. IMAGE_STUDIO_LANE */}
                <div id="image-studio-lane" style={{ marginTop: '20px', minHeight: '800px' }}>
                    <div className="text-mono" style={{ fontSize: '0.7rem', color: 'var(--cyan-glow)', letterSpacing: '0.3em', marginBottom: '30px', textAlign: 'center', opacity: 0.6 }}>
                        [ CREATIVE_GENERATION_SURFACE ]
                    </div>
                    <ImageStudio
                        imageStatus={imageStatus}
                        imagePrompt={imagePrompt}
                        setImagePrompt={setImagePrompt}
                        imageSize={imageSize}
                        setImageSize={setImageSize}
                        imageVariants={imageVariants}
                        setImageVariants={setImageVariants}
                        imageEnhance={imageEnhance}
                        setImageEnhance={setImageEnhance}
                        imageWaitForCompletion={imageWaitForCompletion}
                        setImageWaitForCompletion={setImageWaitForCompletion}
                        imageGenerating={imageGenerating}
                        imageSource={imageSource}
                        setImageSource={setImageSource}
                        imageTask={imageTask}
                        imageError={imageError}
                        generateImage={generateImage}
                        handleSourceImageSelect={handleSourceImageSelect}
                    />
                </div>

                {/* 5. ATLAS_PANELS_FOOTER */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '100px' }}>
                    <AtlasPanel
                        kicker="OPERATIONAL_WORKFLOWS"
                        title="Workflow Index"
                        subtitle="Direct operational flows and system automation routines."
                        accent="var(--gold-solar)"
                        items={catalog.workflows.slice(0, 6).map((workflow) => ({
                            title: workflow.title,
                            summary: workflow.summary,
                            status: workflow.status,
                            meta: workflow.category
                        }))}
                    />

                    <AtlasPanel
                        kicker="MATHEMATICAL_GEOMETRY"
                        title="Curve Index"
                        subtitle="Reference motion patterns and procedural curves."
                        accent="var(--cyan-glow)"
                        items={catalog.mathCurves.slice(0, 6).map((curve) => ({
                            title: curve.title,
                            summary: curve.summary,
                            status: curve.status,
                            meta: curve.family
                        }))}
                        footer={`CORE_SYNC_COMPLETED_AT: ${timeLabel}`}
                    />
                </div>
            </section>
        </div>
    );
};

interface ImageStudioProps {
    imageStatus: ImageServiceStatus | null;
    imagePrompt: string;
    setImagePrompt: React.Dispatch<React.SetStateAction<string>>;
    imageSize: '1:1' | '3:2' | '2:3';
    setImageSize: React.Dispatch<React.SetStateAction<'1:1' | '3:2' | '2:3'>>;
    imageVariants: number;
    setImageVariants: React.Dispatch<React.SetStateAction<number>>;
    imageEnhance: boolean;
    setImageEnhance: React.Dispatch<React.SetStateAction<boolean>>;
    imageWaitForCompletion: boolean;
    setImageWaitForCompletion: React.Dispatch<React.SetStateAction<boolean>>;
    imageGenerating: boolean;
    imageSource: UploadedSourceImage | null;
    setImageSource: React.Dispatch<React.SetStateAction<UploadedSourceImage | null>>;
    imageTask: ImageTaskRecord | null;
    imageError: string | null;
    generateImage: () => void;
    handleSourceImageSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

function ImageStudio({
    imageStatus,
    imagePrompt,
    setImagePrompt,
    imageSize,
    setImageSize,
    imageVariants,
    setImageVariants,
    imageEnhance,
    setImageEnhance,
    imageWaitForCompletion,
    setImageWaitForCompletion,
    imageGenerating,
    imageSource,
    setImageSource,
    imageTask,
    imageError,
    generateImage,
    handleSourceImageSelect
}: ImageStudioProps) {
    return (
        <div className="neural-glass" style={{ padding: '40px', display: 'grid', gap: '30px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '20px' }}>
                <div>
                    <div className="text-mono" style={{ fontSize: '0.6rem', color: 'var(--cyan-glow)', letterSpacing: '0.2em', marginBottom: '8px', fontWeight: 800 }}>IMAGE_GENERATION_UNIT</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>Visual Synthesis Lane</div>
                </div>
                <div className="text-mono" style={{ fontSize: '0.65rem', color: imageStatus?.configured ? 'var(--gold-solar)' : 'rgba(255,255,255,0.3)' }}>
                    {imageStatus?.configured ? `STATUS: ONLINE // ${imageStatus.baseURL}` : 'STATUS: OFFLINE'}
                </div>
            </div>

            <textarea
                value={imagePrompt}
                onChange={(event) => setImagePrompt(event.target.value)}
                rows={4}
                style={{
                    width: '100%',
                    resize: 'vertical',
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    borderRadius: '12px',
                    padding: '20px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '1rem',
                    outline: 'none',
                    lineHeight: 1.6,
                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
                }}
                placeholder="Describe the visual concept for neural synthesis..."
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ display: 'grid', gap: '10px' }}>
                    <label className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.4, letterSpacing: '0.15em', fontWeight: 700 }}>ASPECT_RATIO</label>
                    <select
                        value={imageSize}
                        onChange={(event) => setImageSize(event.target.value as '1:1' | '3:2' | '2:3')}
                        style={{
                            width: '100%',
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white',
                            borderRadius: '8px',
                            padding: '12px 15px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.85rem',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="1:1" style={{ background: '#111' }}>1:1 (SQUARE)</option>
                        <option value="3:2" style={{ background: '#111' }}>3:2 (LANDSCAPE)</option>
                        <option value="2:3" style={{ background: '#111' }}>2:3 (PORTRAIT)</option>
                    </select>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                    <label className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.4, letterSpacing: '0.15em', fontWeight: 700 }}>VARIANT_COUNT</label>
                    <input
                        type="number"
                        min={1}
                        max={4}
                        value={imageVariants}
                        onChange={(event) => setImageVariants(Math.max(1, Math.min(4, Number(event.target.value) || 1)))}
                        style={{
                            width: '100%',
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white',
                            borderRadius: '8px',
                            padding: '12px 15px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.85rem',
                            outline: 'none'
                        }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                <button
                    type="button"
                    onClick={() => setImageEnhance((current) => !current)}
                    className="text-mono"
                    style={{
                        cursor: 'pointer',
                        background: imageEnhance ? 'rgba(118,185,0,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${imageEnhance ? 'rgba(118,185,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        color: imageEnhance ? 'var(--gold-solar)' : 'rgba(255,255,255,0.6)',
                        padding: '15px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        transition: 'all 0.3s'
                    }}
                >
                    {imageEnhance ? 'OPTIMIZATION: ENABLED' : 'OPTIMIZATION: STANDARD'}
                </button>
                <button
                    type="button"
                    onClick={() => setImageWaitForCompletion((current) => !current)}
                    className="text-mono"
                    style={{
                        cursor: 'pointer',
                        background: imageWaitForCompletion ? 'rgba(118,185,0,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${imageWaitForCompletion ? 'rgba(118,185,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        color: imageWaitForCompletion ? 'var(--gold-solar)' : 'rgba(255,255,255,0.6)',
                        padding: '15px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        transition: 'all 0.3s'
                    }}
                >
                    {imageWaitForCompletion ? 'MODE: SYNCHRONOUS' : 'MODE: ASYNCHRONOUS'}
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '20px', alignItems: 'start' }}>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '25px', background: 'rgba(0,0,0,0.2)' }}>
                    <div className="text-mono" style={{ fontSize: '0.6rem', color: 'var(--gold-solar)', marginBottom: '15px', letterSpacing: '0.2em', fontWeight: 700 }}>SOURCE_REFERENCE_ASSET</div>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleSourceImageSelect}
                        style={{
                            width: '100%',
                            color: 'rgba(255,255,255,0.8)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem'
                        }}
                    />
                    <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.4, marginTop: '15px', lineHeight: 1.6 }}>
                        Upload a reference asset to guide the neural engine. The file remains local until execution is triggered.
                    </div>
                    {imageSource && (
                        <div style={{ marginTop: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={() => setImageSource(null)}
                                className="text-mono"
                                style={{
                                    cursor: 'pointer',
                                    background: 'rgba(255,0,0,0.1)',
                                    border: '1px solid rgba(255,0,0,0.3)',
                                    color: 'var(--red-fusion)',
                                    padding: '8px 15px',
                                    borderRadius: '4px',
                                    fontSize: '0.6rem',
                                    fontWeight: 800
                                }}
                            >
                                DISCARD_REFERENCE
                            </button>
                            <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.6 }}>
                                {imageSource.name}
                            </div>
                        </div>
                    )}
                </div>

                <div className="neural-glass" style={{ padding: '10px', minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }}>
                    {imageSource ? (
                        <img
                            src={imageSource.previewUrl}
                            alt={imageSource.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                        />
                    ) : (
                        <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.25, textAlign: 'center', lineHeight: 1.8, letterSpacing: '0.2em' }}>
                            EMPTY_BUFFER
                            <br />
                            LATENT_SPACE_READY
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '25px' }}>
                <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.5 }}>
                    {imageStatus?.authConfigured ? 'AUTH: VERIFIED' : 'AUTH: MISSING'}
                    {imageSource ? ' // PIPELINE: IMG2IMG' : ' // PIPELINE: TXT2IMG'}
                    {imageTask ? ` // SESSION: ${imageTask.taskId}` : ''}
                </div>
                <button
                    type="button"
                    onClick={generateImage}
                    disabled={imageGenerating || !imagePrompt.trim()}
                    className="text-mono"
                    style={{
                        cursor: imageGenerating ? 'wait' : 'pointer',
                        background: 'var(--gold-solar)',
                        border: 'none',
                        color: '#000',
                        padding: '15px 40px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 900,
                        opacity: imageGenerating ? 0.6 : 1,
                        transition: 'all 0.3s',
                        boxShadow: '0 0 30px rgba(118, 185, 0, 0.2)'
                    }}
                >
                    {imageGenerating ? 'SYNTHESIZING...' : 'EXECUTE_GENERATION'}
                </button>
            </div>

            {imageError && (
                <div className="neural-glass" style={{ padding: '15px', background: 'rgba(255,0,0,0.05)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: '6px' }}>
                    <div className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--red-fusion)', fontWeight: 800 }}>⬡ PIPELINE_FAULT: {imageError}</div>
                </div>
            )}

            {imageTask && (
                <div className="neural-glass" style={{ padding: '25px', background: 'rgba(118,185,0,0.03)', border: '1px solid rgba(118,185,0,0.2)', borderRadius: '12px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'center' }}>
                    <div>
                        <div className="text-mono" style={{ fontSize: '0.6rem', color: 'var(--gold-solar)', marginBottom: '10px', letterSpacing: '0.15em', fontWeight: 800 }}>
                            TASK_STATUS: {imageTask.successFlag === 1 ? 'MANIFESTED' : imageTask.successFlag === 2 ? 'FAULT' : 'PROCESSING'} // {imageTask.progress}
                        </div>
                        <div style={{ fontSize: '0.9rem', opacity: 0.8, color: 'white', lineHeight: 1.5 }}>
                            {imageTask.errorMessage || 'The neural forge has accepted the visual directive.'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {imageTask.resultUrls.map((url, idx) => (
                            <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-mono"
                                style={{
                                    fontSize: '0.65rem',
                                    color: '#000',
                                    background: 'var(--gold-solar)',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    fontWeight: 900
                                }}
                            >
                                VIEW_RESULT_{idx + 1}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

interface AtlasPanelProps {
    kicker: string;
    title: string;
    subtitle: string;
    accent: string;
    items: Array<{
        title: string;
        summary: string;
        status: string;
        meta: string;
    }>;
    footer?: string;
}

function AtlasPanel({ kicker, title, subtitle, accent, items, footer }: AtlasPanelProps) {
    return (
        <div className="neural-glass" style={{ padding: '30px', display: 'grid', gap: '20px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '15px' }}>
                <div>
                    <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.4, letterSpacing: '0.2em', marginBottom: '8px', color: accent }}>
                        {kicker}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white' }}>{title}</div>
                </div>
                <div className="text-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: accent, background: `${accent}15`, padding: '4px 10px', borderRadius: '4px', fontWeight: 700 }}>
                    {items.length} ENTRIES
                </div>
            </div>
            <div className="text-mono" style={{ fontSize: '0.65rem', opacity: 0.5, lineHeight: 1.6 }}>
                {subtitle}
            </div>
            <div style={{ display: 'grid', gap: '15px' }}>
                {items.length > 0 ? items.map((item) => (
                    <div key={`${item.meta}-${item.title}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', alignItems: 'baseline', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{item.title}</div>
                            <div className="text-mono" style={{ fontSize: '0.55rem', color: accent, opacity: 0.8, fontWeight: 700 }}>
                                {item.status.toUpperCase()} // {item.meta.toUpperCase()}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', lineHeight: 1.6, opacity: 0.6, color: 'white' }}>
                            {item.summary}
                        </div>
                    </div>
                )) : (
                    <div className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.3, letterSpacing: '0.2em', textAlign: 'center', padding: '20px' }}>
                        NO_ENTRIES_FOUND
                    </div>
                )}
            </div>
            {footer && (
                <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.25, letterSpacing: '0.2em', textAlign: 'right', marginTop: '10px' }}>
                    {footer}
                </div>
            )}
        </div>
    );
}

export default NeuralForge;
