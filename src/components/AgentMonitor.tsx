import React, { useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

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
    parent_agent_id?: number | null;
    nodeId: string;
    activity: number[];
    activityScore: number;
    activityPeak: number;
    load: number;
    latency: number;
    ageSeconds: number | null;
    ageLabel: string;
    freshness: 'LIVE' | 'STALE';
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function parsePulse(value: string | null) {
    if (!value) return null;

    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const parsed = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatAge(seconds: number | null) {
    if (seconds === null) return 'NO_PULSE';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
}

function metricTint(status: string) {
    if (status === 'ACTIVE') return 'var(--cyan-glow)';
    if (status === 'SYNCING') return 'var(--gold-solar)';
    if (status === 'IDLE') return 'rgba(255,255,255,0.35)';
    return 'var(--red-fusion)';
}

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
    const gradientId = useId();
    if (!data || data.length === 0) return null;
    const width = 120;
    const height = 38;
    const max = Math.max(...data, 1);
    const points = data.map((value, index) => ({
        x: data.length === 1 ? width / 2 : (index / (data.length - 1)) * width,
        y: height - (value / max) * (height - 4) - 2
    }));
    const path = `M ${points.map((point) => `${point.x},${point.y}`).join(' L ')}`;
    const fillPath = `${path} L ${width},${height} L 0,${height} Z`;

    return (
        <svg aria-hidden="true" focusable="false" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.48" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={fillPath} fill={`url(#${gradientId})`} />
            <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

const AgentMonitor: React.FC = () => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ACTIVE' | 'IDLE' | 'STALE'>('ALL');
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<string | null>(null);
    const [copiedAgent, setCopiedAgent] = useState<string | null>(null);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await apiFetch('/api/agents');
                const rawAgents = await res.json();
                const now = Date.now();

                const enriched = await Promise.all((rawAgents as any[]).map(async (agent, index) => {
                    const activityRes = await apiFetch(`/api/agents/${encodeURIComponent(agent.name)}/activity`).catch(() => null);
                    const activity = activityRes?.ok ? await activityRes.json() : [];
                    const recent = activity.slice(-6);
                    const average = recent.length > 0 ? recent.reduce((sum: number, value: number) => sum + value, 0) / recent.length : 0;
                    const peak = activity.length > 0 ? Math.max(...activity) : 0;
                    const pulse = parsePulse(agent.last_pulse);
                    const ageSeconds = pulse ? Math.max(0, (now - pulse.getTime()) / 1000) : null;
                    const freshness = ageSeconds !== null && ageSeconds > 600 ? 'STALE' : 'LIVE';
                    const nodeId = agent.nodeId || `${String(agent.domain || 'AGT').slice(0, 3).toUpperCase()}-${String(index + 1).padStart(2, '0')}`;
                    const load = clamp(18 + average * 8 + (agent.learning_cycles || 0) * 0.35 + (agent.status === 'ACTIVE' ? 10 : 0));
                    const latency = clamp(16 + Math.round((ageSeconds ?? 18) * 1.8 + (6 - Math.min(6, average)) * 4));

                    return {
                        ...agent,
                        nodeId,
                        activity,
                        activityScore: average,
                        activityPeak: peak,
                        load,
                        latency,
                        ageSeconds,
                        ageLabel: formatAge(ageSeconds),
                        freshness
                    } as Agent;
                }));

                setAgents(enriched.filter((agent) => agent.status !== 'OFFLINE'));
                setLastRefresh(new Date().toISOString());
            } catch (error) {
                console.error('⬡ TELEMETRY_FAILURE', error);
            } finally {
                setLoading(false);
            }
        };

        fetchAgents();
        const interval = setInterval(fetchAgents, 5000);
        return () => clearInterval(interval);
    }, []);

    const summary = useMemo(() => {
        const visible = selectedFilter === 'ALL'
            ? agents
            : agents.filter((agent) => {
                if (selectedFilter === 'ACTIVE') return agent.status === 'ACTIVE';
                if (selectedFilter === 'IDLE') return agent.status === 'IDLE';
                return agent.freshness === 'STALE';
            });

        return {
            visible,
            active: agents.filter((agent) => agent.status === 'ACTIVE').length,
            idle: agents.filter((agent) => agent.status === 'IDLE').length,
            stale: agents.filter((agent) => agent.freshness === 'STALE').length,
            averageLoad: agents.length > 0
                ? Math.round(agents.reduce((sum, agent) => sum + agent.load, 0) / agents.length)
                : 0,
            total: agents.length
        };
    }, [agents, selectedFilter]);

    const copyCommand = async (agent: Agent) => {
        const command = agent.current_op || agent.command || agent.name;
        try {
            await navigator.clipboard.writeText(command || '');
            setCopiedAgent(agent.name);
            window.setTimeout(() => setCopiedAgent((current) => (current === agent.name ? null : current)), 1400);
        } catch {
            // Ignore clipboard failures.
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minHeight: '100%' }}>
            <header className="neural-glass" style={{ padding: '24px 28px', display: 'flex', justifyContent: 'space-between', gap: '24px', alignItems: 'flex-end' }}>
                <div style={{ maxWidth: '760px' }}>
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--gold-solar)', letterSpacing: '0.38em', marginBottom: '10px' }}>
                        SWARM_TELEMETRY // LIVE_FEED
                    </div>
                    <h2 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.4rem)', fontWeight: 800, letterSpacing: '-0.05em' }}>
                        Active Agents
                    </h2>
                    <p style={{ margin: '10px 0 0', maxWidth: '58ch', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)' }}>
                        Real agent state from `/api/agents` and `/api/agents/:name/activity`. The monitor now uses pulse age and event counts instead of random placeholders.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '240px', alignItems: 'flex-end' }}>
                    <div className="text-mono" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2em' }}>
                        REFRESH_STATUS
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '999px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--cyan-glow)', boxShadow: '0 0 12px var(--cyan-glow)' }} />
                        <span className="text-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.12em' }}>
                            {lastRefresh ? `UPDATED ${formatAge(Math.max(0, (Date.now() - new Date(lastRefresh).getTime()) / 1000))} AGO` : 'SYNCING'}
                        </span>
                    </div>
                </div>
            </header>

            <section className="neural-glass" style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
                {[
                    { label: 'VISIBLE', value: summary.visible.length, tint: 'var(--gold-solar)' },
                    { label: 'ACTIVE', value: summary.active, tint: 'var(--cyan-glow)' },
                    { label: 'AVG_LOAD', value: `${summary.averageLoad}%`, tint: 'var(--gold-solar)' },
                    { label: 'STALE', value: summary.stale, tint: 'var(--red-fusion)' }
                ].map((item) => (
                    <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 4px' }}>
                        <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.18em', opacity: 0.35 }}>
                            {item.label}
                        </div>
                        <div className="text-mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: item.tint }}>
                            {item.value}
                        </div>
                    </div>
                ))}
            </section>

            <section style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(['ALL', 'ACTIVE', 'IDLE', 'STALE'] as const).map((filter) => (
                    <button
                        type="button"
                        key={filter}
                        className="text-mono"
                        onClick={() => setSelectedFilter(filter)}
                        style={{
                            border: `1px solid ${selectedFilter === filter ? 'rgba(255, 184, 0, 0.28)' : 'rgba(255,255,255,0.08)'}`,
                            background: selectedFilter === filter ? 'rgba(255, 184, 0, 0.08)' : 'rgba(255,255,255,0.03)',
                            color: selectedFilter === filter ? 'var(--gold-solar)' : 'rgba(255,255,255,0.65)',
                            borderRadius: '999px',
                            padding: '9px 14px',
                            cursor: 'pointer',
                            letterSpacing: '0.14em',
                            fontSize: '0.56rem'
                        }}
                    >
                        {filter}
                    </button>
                ))}
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {loading ? (
                    <div className="text-mono" style={{ opacity: 0.35, padding: '48px 20px' }}>
                        LISTENING_FOR_AGENT_PULSES...
                    </div>
                ) : summary.visible.length === 0 ? (
                    <div className="text-mono" style={{ opacity: 0.35, padding: '48px 20px' }}>
                        NO_AGENTS_MATCH_CURRENT_FILTER
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {summary.visible.map((agent) => {
                            const statusColor = metricTint(agent.status);
                            const isExpanded = expandedAgent === agent.name;
                            return (
                                <motion.div
                                    key={agent.nodeId}
                                    layout
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="neural-glass"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setExpandedAgent((current) => (current === agent.name ? null : agent.name))}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setExpandedAgent((current) => (current === agent.name ? null : agent.name));
                                        }
                                    }}
                                    style={{
                                        padding: '18px 20px',
                                        borderLeft: `3px solid ${statusColor}`,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '14px'
                                    }}
                                >
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(240px, 0.9fr) auto', gap: '18px', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', minWidth: 0 }}>
                                            <div style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '16px',
                                                background: `linear-gradient(135deg, ${statusColor}22, ${statusColor}55)`,
                                                border: `1px solid ${statusColor}33`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                color: statusColor,
                                                flexShrink: 0
                                            }}>
                                                {agent.nodeId.split('-')[1] || agent.name.slice(0, 2).toUpperCase()}
                                            </div>

                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                                                        {agent.name}
                                                    </div>
                                                    <div className="text-mono" style={{ fontSize: '0.46rem', letterSpacing: '0.18em', padding: '4px 8px', borderRadius: '999px', border: `1px solid ${statusColor}33`, color: statusColor }}>
                                                        {agent.status}
                                                    </div>
                                                    <div className="text-mono" style={{ fontSize: '0.46rem', letterSpacing: '0.18em', padding: '4px 8px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)', color: agent.freshness === 'STALE' ? 'var(--red-fusion)' : 'rgba(255,255,255,0.55)' }}>
                                                        {agent.freshness}
                                                    </div>
                                                </div>
                                                <div className="text-mono" style={{ fontSize: '0.58rem', opacity: 0.42, marginTop: '6px', letterSpacing: '0.08em' }}>
                                                    {agent.domain} / {agent.role || 'No assigned role'}
                                                </div>
                                                <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.32, marginTop: '6px' }}>
                                                    {agent.current_state || 'STATE_UNKNOWN'} // {agent.current_op || agent.command || 'IDLE'}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', letterSpacing: '0.12em', opacity: 0.45 }}>
                                                <span>ACTIVITY</span>
                                                <span>{agent.activityScore.toFixed(1)} AVG</span>
                                            </div>
                                            <Sparkline data={agent.activity} color={statusColor} />
                                            <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${agent.load}%` }}
                                                    transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                                                    style={{ height: '100%', background: statusColor, boxShadow: `0 0 12px ${statusColor}55` }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                            <div className="text-mono" style={{ fontSize: '0.46rem', opacity: 0.38, letterSpacing: '0.18em' }}>
                                                {agent.nodeId}
                                            </div>
                                            <div style={{ display: 'grid', gap: '6px', textAlign: 'right' }}>
                                                <div className="text-mono" style={{ fontSize: '0.52rem', opacity: 0.5 }}>
                                                    LOAD {Math.round(agent.load)}%
                                                </div>
                                                <div className="text-mono" style={{ fontSize: '0.52rem', opacity: 0.5 }}>
                                                    LATENCY {agent.latency}MS
                                                </div>
                                                <div className="text-mono" style={{ fontSize: '0.52rem', opacity: 0.5 }}>
                                                    PULSE {agent.ageLabel}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="text-mono"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setExpandedAgent(agent.name);
                                            }}
                                            style={{
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'rgba(255,255,255,0.75)',
                                                borderRadius: '999px',
                                                padding: '7px 12px',
                                                cursor: 'pointer',
                                                fontSize: '0.52rem',
                                                letterSpacing: '0.12em'
                                            }}
                                        >
                                            FOCUS
                                        </button>
                                        <button
                                            type="button"
                                            className="text-mono"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void copyCommand(agent);
                                            }}
                                            style={{
                                                border: '1px solid rgba(255, 184, 0, 0.2)',
                                                background: 'rgba(255, 184, 0, 0.06)',
                                                color: 'var(--gold-solar)',
                                                borderRadius: '999px',
                                                padding: '7px 12px',
                                                cursor: 'pointer',
                                                fontSize: '0.52rem',
                                                letterSpacing: '0.12em'
                                            }}
                                        >
                                            {copiedAgent === agent.name ? 'COPIED' : 'COPY COMMAND'}
                                        </button>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                style={{ overflow: 'hidden' }}
                                            >
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <div className="neural-glass" style={{ padding: '12px' }}>
                                                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em' }}>PEAK_ACTIVITY</div>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: statusColor }}>{agent.activityPeak}</div>
                                                    </div>
                                                    <div className="neural-glass" style={{ padding: '12px' }}>
                                                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em' }}>LEARNING_CYCLES</div>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold-solar)' }}>{agent.learning_cycles ?? 0}</div>
                                                    </div>
                                                    <div className="neural-glass" style={{ padding: '12px' }}>
                                                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em' }}>PARENT</div>
                                                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{agent.parent_agent_id ?? 'ROOT'}</div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </section>
        </div>
    );
};

export default AgentMonitor;
