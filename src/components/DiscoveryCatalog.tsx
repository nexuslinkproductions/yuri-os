import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

/* ── Types ─────────────────────────────────────────── */

interface StatusResponse {
    timestamp: string;
    stage: string;
    cognitiveLoad: {
        neuralDensity: number;
        swarmSync: number;
        ingestionPressure: number;
        sealStability: number;
        logicThroughput: number;
    };
    systemLoad: {
        cpu: number;
        mem: number;
        uptime: number;
        disk: string;
        ollama_latency: number;
    };
    activeAgents: string[];
    metrics: {
        tokensUsed: number;
        sessionDuration: number;
        knowledgeNodes: number;
        lastRuntime: string;
        lastModel: string;
    };
    obsidian: {
        status: string;
        mode: string;
    };
}

interface AgentEntry {
    id: number;
    name: string;
    layer: string;
    domain: string;
    command: string;
    status: string;
    current_state?: string;
    current_op?: string | null;
    role?: string;
    learning_cycles?: number;
}

interface ModelEntry {
    id: string;
    name: string;
    provider: string;
    status: string;
    runtime?: string;
    recommended?: boolean;
    version?: string;
}

/* ── Custom hook: polling ────────────────────────── */

function usePoll<T>(url: string, intervalMs: number, enabled = true) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const fetchData = useCallback(async () => {
        try {
            const res = await apiFetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (mountedRef.current) {
                setData(json as T);
                setError(null);
                setLoading(false);
            }
        } catch (e) {
            if (mountedRef.current) {
                setError(e instanceof Error ? e.message : 'Fetch failed');
                setLoading(false);
            }
        }
    }, [url]);

    useEffect(() => {
        mountedRef.current = true;
        setLoading(true);
        fetchData();
        if (!enabled) return;
        const id = setInterval(fetchData, intervalMs);
        return () => {
            mountedRef.current = false;
            clearInterval(id);
        };
    }, [url, intervalMs, enabled, fetchData]);

    return { data, error, loading, refetch: fetchData };
}

/* ── Sub-components ───────────────────────────────── */

/* Circular progress ring (SVG) */
const CircularProgress: React.FC<{ value: number; size?: number; stroke?: number; label: string; sublabel?: string }> = ({
    value, size = 100, stroke = 6, label, sublabel
}) => {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (value / 100) * circ;
    const color = value > 80 ? 'var(--red-fusion)' : value > 60 ? 'var(--gold-solar)' : 'var(--cyan-glow)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <svg width={size} height={size}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
                <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="white" fontSize="1.1rem" fontWeight={700}>
                    {Math.round(value)}%
                </text>
            </svg>
            <div className="text-mono" style={{ fontSize: '0.5rem', letterSpacing: '0.15em', opacity: 0.6 }}>{label}</div>
            {sublabel && <div className="text-mono" style={{ fontSize: '0.42rem', opacity: 0.35 }}>{sublabel}</div>}
        </div>
    );
};

/* Gauge bar */
const GaugeBar: React.FC<{ value: number; label: string; color?: string; size?: 'normal' | 'small' }> = ({
    value, label, color, size = 'normal'
}) => {
    const barColor = color || (value > 80 ? 'var(--red-fusion)' : value > 60 ? 'var(--gold-solar)' : 'var(--cyan-glow)');
    const isSmall = size === 'small';

    return (
        <div style={{ marginBottom: isSmall ? '6px' : '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className="text-mono" style={{ fontSize: isSmall ? '0.45rem' : '0.5rem', opacity: 0.7, letterSpacing: '0.1em' }}>
                    {label}
                </span>
                <span className="text-mono" style={{ fontSize: isSmall ? '0.45rem' : '0.5rem', opacity: 0.5 }}>
                    {Math.round(value)}%
                </span>
            </div>
            <div style={{ height: isSmall ? '6px' : '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <motion.div
                    style={{ height: '100%', borderRadius: '4px', background: barColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                />
            </div>
        </div>
    );
};

/* Metric card (animated entrance) */
const MetricCard: React.FC<{ title: string; children: React.ReactNode; accent?: string; delay?: number }> = ({
    title, children, accent = 'var(--cyan-glow)', delay = 0
}) => (
    <motion.div
        className="neural-glass"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        style={{
            padding: '18px',
            borderTop: `1px solid ${accent}33`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
        }}
    >
        <div className="text-mono" style={{ fontSize: '0.45rem', letterSpacing: '0.2em', opacity: 0.4 }}>{title}</div>
        {children}
    </motion.div>
);

/* Agent card (feed item) */
const AgentCard: React.FC<{ agent: AgentEntry; expanded: boolean; onToggle: () => void; delay: number }> = ({
    agent, expanded, onToggle, delay
}) => {
    const statusColor = agent.status === 'ACTIVE' ? 'var(--cyan-glow)' : 'var(--red-fusion)';
    const stateColor = !agent.current_state ? 'var(--silver-albedo)' :
        agent.current_state === 'RUBEDO' ? 'var(--red-fusion)' :
        agent.current_state === 'ALBEDO' ? 'var(--silver-albedo)' : 'var(--gold-solar)';

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay }}
            className="neural-glass"
            onClick={onToggle}
            style={{
                padding: '12px 14px',
                cursor: 'pointer',
                borderLeft: `3px solid ${statusColor}`,
                transition: 'border-color 0.3s, background 0.3s'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{agent.name}</span>
                    <span className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.3 }}>{agent.command}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="text-mono" style={{ fontSize: '0.45rem', color: stateColor, letterSpacing: '0.15em' }}>
                        {agent.current_state || '—'}
                    </span>
                    <motion.span
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ opacity: 0.3, fontSize: '0.7rem' }}
                    >
                        ▼
                    </motion.span>
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <div>
                                    <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3, letterSpacing: '0.15em' }}>DOMAIN</div>
                                    <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.7, marginTop: '2px' }}>{agent.domain}</div>
                                </div>
                                <div>
                                    <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3, letterSpacing: '0.15em' }}>LAYER</div>
                                    <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.7, marginTop: '2px' }}>{agent.layer}</div>
                                </div>
                                <div>
                                    <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3, letterSpacing: '0.15em' }}>STATUS</div>
                                    <div className="text-mono" style={{ fontSize: '0.5rem', color: statusColor, marginTop: '2px' }}>{agent.status}</div>
                                </div>
                                <div>
                                    <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3, letterSpacing: '0.15em' }}>CURRENT OP</div>
                                    <div className="text-mono" style={{ fontSize: '0.5rem', opacity: agent.current_op ? 0.7 : 0.3, marginTop: '2px' }}>
                                        {agent.current_op || 'IDLE'}
                                    </div>
                                </div>
                            </div>
                            <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.25, marginTop: '8px' }}>
                                Learning cycles: {agent.learning_cycles ?? 0} · Role: {agent.role || '—'} · ID: {agent.id}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/* Model card (grid item) */
const ModelCard: React.FC<{ model: ModelEntry; index: number }> = ({ model, index }) => {
    const statusColor = model.status === 'ACTIVE' ? 'var(--cyan-glow)' :
        model.status === 'REMOTE' ? 'var(--gold-solar)' : 'var(--red-fusion)';
    const statusDot = model.status === 'ACTIVE' ? '🟢' :
        model.status === 'REMOTE' ? '🟡' : '🔴';

    const healthValue = model.status === 'ACTIVE' ? (model.runtime === 'local' ? 85 : 95) :
        model.status === 'REMOTE' ? 55 : 10;

    return (
        <motion.div
            className="neural-glass"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: index * 0.04 }}
            style={{
                padding: '14px',
                borderTop: `1px solid ${statusColor}22`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{model.name}</div>
                    <div className="text-mono" style={{ fontSize: '0.42rem', opacity: 0.4, marginTop: '2px' }}>{model.provider}</div>
                </div>
                <span style={{ fontSize: '0.55rem' }}>{statusDot}</span>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {model.recommended && (
                    <span className="text-mono" style={{ fontSize: '0.4rem', color: 'var(--cyan-glow)', border: '1px solid var(--cyan-glow)44', padding: '1px 5px', borderRadius: '2px' }}>
                        RECOMMENDED
                    </span>
                )}
                <span className="text-mono" style={{ fontSize: '0.4rem', color: statusColor, border: `1px solid ${statusColor}33`, padding: '1px 5px', borderRadius: '2px' }}>
                    {model.status}
                </span>
                {model.runtime && (
                    <span className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.35, border: '1px solid rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '2px' }}>
                        {model.runtime}
                    </span>
                )}
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3 }}>HEALTH</span>
                    <span className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3 }}>{healthValue}%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px', overflow: 'hidden' }}>
                    <motion.div
                        style={{ height: '100%', borderRadius: '2px', background: statusColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${healthValue}%` }}
                        transition={{ duration: 0.8, delay: index * 0.04 + 0.2 }}
                    />
                </div>
            </div>

            <div className="text-mono" style={{ fontSize: '0.38rem', opacity: 0.2 }}>{model.id}</div>
        </motion.div>
    );
};

/* Skeleton pulse */
const SkeletonBlock: React.FC<{ width?: string; height?: string; style?: React.CSSProperties }> = ({ width = '100%', height = '16px', style }) => (
    <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '4px',
            width,
            height,
            ...style
        }}
    />
);

/* ── Main component ────────────────────────────────── */

const SystemDashboard: React.FC = () => {
    const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

    const statusPoll = usePoll<StatusResponse>('/api/status', 10_000);
    const agentsPoll = usePoll<AgentEntry[]>('/api/agents', 15_000);
    const modelsPoll = usePoll<ModelEntry[]>('/api/neural/models', 30_000);

    const statusLoading = statusPoll.loading;
    const statusError = statusPoll.error;
    const statusData = statusPoll.data;

    const agentsLoading = agentsPoll.loading;
    const agentsError = agentsPoll.error;
    const agentsData = agentsPoll.data;

    const modelsLoading = modelsPoll.loading;
    const modelsError = modelsPoll.error;
    const modelsData = modelsPoll.data;

    const anyLoading = statusPoll.loading || agentsPoll.loading || modelsPoll.loading;
    const anyError = statusPoll.error || agentsPoll.error || modelsPoll.error;

    const handleRetry = useCallback(() => {
        statusPoll.refetch();
        agentsPoll.refetch();
        modelsPoll.refetch();
    }, [statusPoll, agentsPoll, modelsPoll]);

    const toggleAgent = (id: number) => {
        setExpandedAgent(prev => prev === id ? null : id);
    };

    /* ── Compute agent counts and group ── */
    const agents = agentsData || [];
    const activeCount = agents.filter(a => a.status === 'ACTIVE').length;
    const offlineCount = agents.filter(a => a.status !== 'ACTIVE').length;
    const agentNameList = statusData?.activeAgents || [];

    /* ── Stage label ── */
    const stage = statusData?.stage || '—';
    const stageColor = stage === 'RUBEDO' ? 'var(--red-fusion)' :
        stage === 'ALBEDO' ? 'var(--silver-albedo)' : 'var(--gold-solar)';

    /* ── Content ── */
    const renderContent = () => {
        if (anyError && !statusData && !agentsData && !modelsData) {
            return (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="neural-glass"
                    style={{
                        padding: '40px',
                        borderLeft: '3px solid var(--red-fusion)',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px'
                    }}
                >
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--red-fusion)', letterSpacing: '0.2em' }}>BACKEND OFFLINE</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.6, lineHeight: 1.6 }}>
                        The backend at <span className="text-mono" style={{ opacity: 0.8 }}>127.0.0.1:3004</span> is not responding.
                        <br />Check that the server is running.
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="text-mono"
                        onClick={handleRetry}
                        style={{
                            background: 'rgba(255,59,48,0.1)',
                            border: '1px solid var(--red-fusion)',
                            color: 'var(--red-fusion)',
                            padding: '10px 18px',
                            cursor: 'pointer',
                            letterSpacing: '0.15em',
                            fontSize: '0.55rem',
                            marginTop: '8px',
                            borderRadius: '4px'
                        }}
                    >
                        RETRY CONNECTION
                    </motion.button>
                </motion.div>
            );
        }

        return (
            <>
                {/* ── Row 1: Live Metrics Cards ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
                    {/* Neural Density */}
                    <MetricCard title="NEURAL DENSITY" accent="var(--cyan-glow)" delay={0}>
                        {statusLoading ? (
                            <SkeletonBlock width="100px" height="100px" style={{ borderRadius: '50%' }} />
                        ) : (
                            <CircularProgress
                                value={statusData?.cognitiveLoad.neuralDensity ?? 0}
                                label="CORTICAL ACTIVITY"
                                sublabel={`Stage: ${stage}`}
                            />
                        )}
                    </MetricCard>

                    {/* Active Agents */}
                    <MetricCard title="ACTIVE AGENTS" accent="var(--gold-solar)" delay={0.1}>
                        {statusLoading || agentsLoading ? (
                            <>
                                <SkeletonBlock width="40px" height="28px" />
                                <SkeletonBlock width="80px" height="40px" />
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>
                                    {activeCount}
                                    <span style={{ fontSize: '0.7rem', fontWeight: 400, opacity: 0.35, marginLeft: '4px' }}>
                                        / {agents.length}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                                    {agentNameList.slice(0, 12).map((name) => (
                                        <span
                                            key={name}
                                            className="text-mono"
                                            style={{
                                                fontSize: '0.42rem',
                                                padding: '2px 6px',
                                                borderRadius: '2px',
                                                background: agents.find(a => a.name === name)?.status === 'ACTIVE'
                                                    ? 'rgba(0,242,255,0.08)'
                                                    : 'rgba(255,59,48,0.08)',
                                                color: agents.find(a => a.name === name)?.status === 'ACTIVE'
                                                    ? 'var(--cyan-glow)'
                                                    : 'var(--red-fusion)',
                                            }}
                                        >
                                            {name}
                                        </span>
                                    ))}
                                    {agentNameList.length > 12 && (
                                        <span className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3 }}>
                                            +{agentNameList.length - 12} more
                                        </span>
                                    )}
                                </div>
                                <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3 }}>
                                    {offlineCount} offline
                                </div>
                            </>
                        )}
                    </MetricCard>

                    {/* System Load */}
                    <MetricCard title="SYSTEM LOAD" accent="var(--red-fusion)" delay={0.2}>
                        {statusLoading ? (
                            <>
                                <SkeletonBlock height="20px" />
                                <SkeletonBlock height="20px" />
                            </>
                        ) : (
                            <div style={{ width: '100%' }}>
                                <GaugeBar value={statusData?.systemLoad.cpu ?? 0} label="CPU" size="small" />
                                <GaugeBar value={statusData?.systemLoad.mem ?? 0} label="MEM" size="small" />
                                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                    <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3 }}>DISK {statusData?.systemLoad.disk || '—'}</div>
                                    <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3 }}>UPTIME {Math.floor((statusData?.systemLoad.uptime ?? 0) / 3600)}h</div>
                                </div>
                            </div>
                        )}
                    </MetricCard>

                    {/* Ingestion Pressure */}
                    <MetricCard title="INGESTION PRESSURE" accent="var(--silver-albedo)" delay={0.3}>
                        {statusLoading ? (
                            <>
                                <SkeletonBlock width="100px" height="100px" style={{ borderRadius: '50%' }} />
                            </>
                        ) : (
                            <>
                                <CircularProgress
                                    value={statusData?.cognitiveLoad.ingestionPressure ?? 0}
                                    size={80}
                                    stroke={5}
                                    label="THROUGHPUT"
                                />
                                <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.3 }}>
                                    {statusData?.metrics.knowledgeNodes ?? 0} knowledge nodes
                                </div>
                                <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.25 }}>
                                    {statusData?.obsidian.status === 'ONLINE' ? 'Obsidian online' : 'Obsidian offline'}
                                </div>
                            </>
                        )}
                    </MetricCard>
                </div>

                {/* ── Row 2: System Health Graph ── */}
                <motion.div
                    className="neural-glass"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.35 }}
                    style={{ padding: '18px', marginBottom: '24px', borderTop: '1px solid var(--cyan-glow)22' }}
                >
                    <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.2em', opacity: 0.4, marginBottom: '14px' }}>
                        COGNITIVE LOAD // SYSTEM HEALTH
                    </div>
                    {statusLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[1, 2, 3, 4, 5].map(i => <SkeletonBlock key={i} height="24px" />)}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '4px' }}>
                            {(Object.entries(statusData?.cognitiveLoad || {}) as [string, number][]).map(([key, val]) => (
                                <GaugeBar key={key} value={val} label={key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()} />
                            ))}
                        </div>
                    )}
                    {statusData && (
                        <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.25, marginTop: '10px' }}>
                            Updated {new Date(statusData.timestamp).toLocaleTimeString()} · Stage {statusData.stage}
                            <span style={{ marginLeft: '12px', opacity: 0.15 }}>Model: {statusData.metrics.lastModel}</span>
                        </div>
                    )}
                </motion.div>

                {/* ── Row 3: Agent Activity Feed ── */}
                <motion.div
                    className="neural-glass"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    style={{ padding: '18px', marginBottom: '24px', borderTop: '1px solid var(--gold-solar)22' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.2em', opacity: 0.4 }}>
                            AGENT ACTIVITY FEED
                        </div>
                        <div className="text-mono" style={{ fontSize: '0.4rem', opacity: 0.25 }}>
                            {agents.length} total · {activeCount} active
                        </div>
                    </div>

                    {agentsLoading && agents.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} height="48px" />)}
                        </div>
                    ) : agentsError && agents.length === 0 ? (
                        <div className="text-mono" style={{ opacity: 0.3, textAlign: 'center', padding: '20px' }}>
                            Agent data unavailable.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
                            {agents.map((agent, i) => (
                                <AgentCard
                                    key={agent.id}
                                    agent={agent}
                                    expanded={expandedAgent === agent.id}
                                    onToggle={() => toggleAgent(agent.id)}
                                    delay={i * 0.03}
                                />
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* ── Row 4: Neural Model Status Grid ── */}
                <motion.div
                    className="neural-glass"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.45 }}
                    style={{ padding: '18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}
                >
                    <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.2em', opacity: 0.4, marginBottom: '14px' }}>
                        NEURAL MODEL STATUS
                    </div>
                    {modelsLoading && (modelsData || []).length === 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="neural-glass" style={{ padding: '14px' }}>
                                    <SkeletonBlock height="16px" width="70%" style={{ marginBottom: '8px' }} />
                                    <SkeletonBlock height="12px" width="50%" style={{ marginBottom: '8px' }} />
                                    <SkeletonBlock height="4px" />
                                </div>
                            ))}
                        </div>
                    ) : modelsError && (modelsData || []).length === 0 ? (
                        <div className="text-mono" style={{ opacity: 0.3, textAlign: 'center', padding: '20px' }}>
                            Model data unavailable.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                            {(modelsData || []).map((model, i) => (
                                <ModelCard key={model.id} model={model} index={i} />
                            ))}
                        </div>
                    )}
                </motion.div>
            </>
        );
    };

    return (
        <div style={{
            height: '100%',
            overflowY: 'auto',
            padding: '36px 32px 48px',
            background: 'linear-gradient(180deg, rgba(8,10,16,0.96) 0%, rgba(3,5,10,1) 100%)'
        }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px', marginBottom: '28px' }}>
                <div>
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--cyan-glow)', letterSpacing: '0.45em', marginBottom: '10px' }}>
                        System layer // live dashboard
                    </div>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', letterSpacing: '-0.04em', fontWeight: 900 }}>
                        Neural System Dashboard
                    </h1>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center' }}>
                        <span className="text-mono" style={{ fontSize: '0.5rem', color: stageColor, letterSpacing: '0.2em' }}>
                            STAGE: {stage}
                        </span>
                        <span className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.25 }}>
                            {statusData?.timestamp ? new Date(statusData.timestamp).toLocaleTimeString() : '—'}
                        </span>
                        {anyLoading && (
                            <motion.span
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="text-mono"
                                style={{ fontSize: '0.4rem', color: 'var(--gold-solar)' }}
                            >
                                Polling...
                            </motion.span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', minWidth: '300px' }}>
                    <div className="neural-glass" style={{ padding: '12px', textAlign: 'center' }}>
                        <div className="text-mono" style={{ fontSize: '0.42rem', opacity: 0.3 }}>AGENTS</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{agents.length}</div>
                    </div>
                    <div className="neural-glass" style={{ padding: '12px', textAlign: 'center' }}>
                        <div className="text-mono" style={{ fontSize: '0.42rem', opacity: 0.3 }}>MODELS</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{(modelsData || []).length}</div>
                    </div>
                    <div className="neural-glass" style={{ padding: '12px', textAlign: 'center' }}>
                        <div className="text-mono" style={{ fontSize: '0.42rem', opacity: 0.3 }}>KNOWLEDGE</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{statusData?.metrics.knowledgeNodes ?? 0}</div>
                    </div>
                </div>
            </header>

            {renderContent()}
        </div>
    );
};

export default SystemDashboard;
