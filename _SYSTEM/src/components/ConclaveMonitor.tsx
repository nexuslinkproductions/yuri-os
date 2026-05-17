import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

/* ── Types ─────────────────────────────────────────── */

interface Agent {
    id: number;
    name: string;
    layer: string;
    domain: string;
    role: string | null;
    command: string | null;
    status: string;
    last_pulse: string | null;
    current_op?: string | null;
    current_state?: string;
    learning_cycles?: number;
}

interface WorkspaceFile {
    name: string;
    current_op: string;
}

type AgentStatusType = 'ACTIVE' | 'IDLE' | 'ERROR' | 'SYNCING';

const STATUS_COLORS: Record<AgentStatusType, { dot: string; bg: string; text: string }> = {
    ACTIVE: { dot: '#00e676', bg: 'rgba(0, 230, 118, 0.08)', text: '#00e676' },
    IDLE: { dot: '#9e9e9e', bg: 'rgba(158, 158, 158, 0.06)', text: '#9e9e9e' },
    ERROR: { dot: 'var(--red-fusion)', bg: 'rgba(255, 82, 82, 0.08)', text: 'var(--red-fusion)' },
    SYNCING: { dot: 'var(--gold-solar)', bg: 'rgba(255, 215, 64, 0.08)', text: 'var(--gold-solar)' },
};

function classifyStatus(status: string): AgentStatusType {
    const s = status?.toUpperCase() || '';
    if (s === 'ACTIVE' || s === 'LIVE' || s === 'RUNNING') return 'ACTIVE';
    if (s === 'ERROR' || s === 'FAILED' || s === 'CRASHED') return 'ERROR';
    if (s === 'SYNCING' || s === 'SYNC' || s === 'LOADING') return 'SYNCING';
    return 'IDLE';
}

function getLayerColor(layer?: string): string {
    switch (layer?.toUpperCase()) {
        case 'CORE': return 'var(--red-fusion)';
        case 'PROCESS': return 'var(--gold-solar)';
        case 'DATA': return 'var(--cyan-glow)';
        case 'INTERFACE': return '#7c4dff';
        default: return 'rgba(255,255,255,0.4)';
    }
}

/* ── Component ─────────────────────────────────────── */

const ConclaveMonitor: React.FC = () => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
    const [pulse, setPulse] = useState(false);

    const fetchAgents = useCallback(async () => {
        try {
            const res = await apiFetch('/api/agents');
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setAgents(data);
            }
            setError(null);
            setPulse(true);
            setTimeout(() => setPulse(false), 800);
        } catch (err: any) {
            setError(err?.message || 'CONNECTION_LOST');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 15000);
        return () => clearInterval(interval);
    }, [fetchAgents]);

    const handleRetry = () => {
        setLoading(true);
        setError(null);
        fetchAgents();
    };

    const toggleExpand = (id: number) => {
        setExpandedAgent((prev) => (prev === id ? null : id));
    };

    const totalAgents = agents.length;
    const activeCount = agents.filter((a) => classifyStatus(a.status) === 'ACTIVE').length;
    const idleCount = agents.filter((a) => classifyStatus(a.status) === 'IDLE').length;
    const errorCount = agents.filter((a) => classifyStatus(a.status) === 'ERROR').length;

    return (
        <div className="conclave-monitor" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
            {/* ── Header ── */}
            <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div>
                        <h1 className="text-mono glow-text" style={{ color: 'var(--gold-solar)', letterSpacing: '0.4em', fontSize: '2.2rem', margin: 0 }}>
                            CONCLAVE // AGENT ASSEMBLY
                        </h1>
                        <div className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '4px' }}>
                            DISTRIBUTED_INTELLIGENCE_NETWORK // POLL: 15s
                        </div>
                    </div>
                </div>

                <motion.div
                    animate={{ opacity: pulse ? [0.6, 1, 0.6] : 0.4 }}
                    transition={{ duration: 0.8 }}
                    style={{
                        width: '10px', height: '10px', borderRadius: '50%',
                        background: !error ? 'var(--cyan-glow)' : 'var(--red-fusion)',
                        boxShadow: !error ? '0 0 12px var(--cyan-glow)' : '0 0 12px var(--red-fusion)',
                        flexShrink: 0,
                    }}
                />
            </header>

            {/* ── Summary Stats ── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}
            >
                {[
                    { label: 'TOTAL_AGENTS', value: totalAgents, color: 'white' },
                    { label: 'ACTIVE', value: activeCount, color: '#00e676' },
                    { label: 'IDLE', value: idleCount, color: '#9e9e9e' },
                    { label: 'ERRORS', value: errorCount, color: 'var(--red-fusion)' },
                ].map((stat, idx) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06, duration: 0.25 }}
                        className="neural-glass"
                        style={{ padding: '18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, marginBottom: '4px', letterSpacing: '0.1em' }}>
                            {stat.label}
                        </div>
                        <div className="text-mono" style={{ fontSize: '1.8rem', color: stat.color, fontWeight: 900 }}>
                            {stat.value}
                        </div>
                    </motion.div>
                ))}
            </motion.div>

            {/* ── Loading ── */}
            {loading && (
                <div className="text-mono" style={{ opacity: 0.3, padding: '80px', textAlign: 'center' }}>
                    SUMMONING_CONCLAVE_AGENTS...
                </div>
            )}

            {/* ── Error ── */}
            {!loading && error && (
                <div style={{ textAlign: 'center', padding: '80px' }}>
                    <div className="text-mono" style={{ color: 'var(--red-fusion)', fontSize: '0.85rem', marginBottom: '20px' }}>
                        BACKEND_OFFLINE // {error}
                    </div>
                    <button
                        onClick={handleRetry}
                        className="text-mono"
                        style={{
                            padding: '12px 30px', background: 'var(--gold-solar)', color: 'black',
                            border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, fontSize: '0.7rem',
                        }}
                    >
                        RETRY_CONNECTION
                    </button>
                </div>
            )}

            {/* ── Empty ── */}
            {!loading && !error && agents.length === 0 && (
                <div className="text-mono" style={{ opacity: 0.2, textAlign: 'center', padding: '80px', fontSize: '0.85rem' }}>
                    NO_AGENTS_REGISTERED // CONCLAVE_IS_EMPTY
                </div>
            )}

            {/* ── Agent Grid ── */}
            {!loading && !error && agents.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                    <AnimatePresence mode="popLayout">
                        {agents.map((agent, idx) => {
                            const statusType = classifyStatus(agent.status);
                            const colors = STATUS_COLORS[statusType];
                            const isExpanded = expandedAgent === agent.id;
                            const layerColor = getLayerColor(agent.layer);

                            return (
                                <motion.div
                                    key={agent.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.03, duration: 0.25, layout: { duration: 0.3 } }}
                                    className="neural-glass card-hover"
                                    style={{
                                        borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)',
                                        overflow: 'hidden', cursor: 'pointer',
                                    }}
                                    onClick={() => toggleExpand(agent.id)}
                                >
                                    {/* Card Body */}
                                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* Status Dot + Name */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <motion.div
                                                animate={statusType === 'ACTIVE' ? { scale: [1, 1.3, 1] } : {}}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                style={{
                                                    width: '10px', height: '10px', borderRadius: '50%',
                                                    background: colors.dot,
                                                    boxShadow: `0 0 8px ${colors.dot}66`,
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <div className="text-mono" style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', flex: 1 }}>
                                                {agent.name}
                                            </div>
                                            <div className="text-mono" style={{
                                                fontSize: '0.45rem', padding: '2px 8px', borderRadius: '2px',
                                                background: colors.bg, color: colors.text, letterSpacing: '0.06em',
                                                flexShrink: 0,
                                            }}>
                                                {statusType}
                                            </div>
                                        </div>

                                        {/* Tags Row */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {agent.domain && (
                                                <span className="text-mono" style={{
                                                    fontSize: '0.5rem', padding: '2px 8px',
                                                    background: 'rgba(124, 77, 255, 0.1)', color: '#7c4dff',
                                                    borderRadius: '2px',
                                                }}>
                                                    {agent.domain.toUpperCase()}
                                                </span>
                                            )}
                                            {agent.layer && (
                                                <span className="text-mono" style={{
                                                    fontSize: '0.5rem', padding: '2px 8px',
                                                    background: `${layerColor}1a`, color: layerColor,
                                                    borderRadius: '2px',
                                                }}>
                                                    LAYER_{agent.layer.toUpperCase()}
                                                </span>
                                            )}
                                            {agent.role && (
                                                <span className="text-mono" style={{
                                                    fontSize: '0.45rem', opacity: 0.4, padding: '2px 8px',
                                                }}>
                                                    {agent.role.toUpperCase().replace(/_/g, ' ')}
                                                </span>
                                            )}
                                        </div>

                                        {/* Current Operation */}
                                        {agent.current_op && (
                                            <div className="text-mono" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                                                <span style={{ opacity: 0.3 }}>OP: </span>
                                                {agent.current_op}
                                            </div>
                                        )}
                                    </div>

                                    {/* Expanded Section */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                                                style={{ overflow: 'hidden' }}
                                            >
                                                <div style={{
                                                    padding: '0 20px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.04)',
                                                    display: 'flex', flexDirection: 'column', gap: '8px',
                                                }}>
                                                    <div style={{ height: '12px' }} />
                                                    {agent.command && (
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <span className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, width: '60px', flexShrink: 0 }}>
                                                                COMMAND:
                                                            </span>
                                                            <span className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.6, fontFamily: 'monospace' }}>
                                                                {agent.command}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {agent.current_state && (
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <span className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, width: '60px', flexShrink: 0 }}>
                                                                STATE:
                                                            </span>
                                                            <span className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.6 }}>
                                                                {agent.current_state}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {agent.learning_cycles !== undefined && (
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <span className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, width: '60px', flexShrink: 0 }}>
                                                                CYCLES:
                                                            </span>
                                                            <span className="text-mono" style={{ fontSize: '0.55rem', color: 'var(--gold-solar)' }}>
                                                                {agent.learning_cycles}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {agent.last_pulse && (
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <span className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, width: '60px', flexShrink: 0 }}>
                                                                PULSE:
                                                            </span>
                                                            <span className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.4 }}>
                                                                {new Date(agent.last_pulse).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            <style>{`
                .conclave-monitor::-webkit-scrollbar { width: 4px; }
                .conclave-monitor::-webkit-scrollbar-track { background: transparent; }
                .conclave-monitor::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
                .neural-glass {
                    backdrop-filter: blur(25px) saturate(180%);
                    background: rgba(17, 25, 40, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .card-hover {
                    transition: all 0.25s ease;
                }
                .card-hover:hover {
                    background: rgba(17, 25, 40, 0.75) !important;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
                    border-color: rgba(255,255,255,0.12) !important;
                }
            `}</style>
        </div>
    );
};

export default ConclaveMonitor;
