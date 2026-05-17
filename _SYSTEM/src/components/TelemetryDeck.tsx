import React, { useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

interface TelemetryData {
    timestamp?: string;
    stage?: string;
    cognitiveLoad: {
        neuralDensity: number;
        swarmSync: number;
        ingestionPressure: number;
        logicThroughput: number;
    };
    systemLoad?: {
        cpu: number;
        mem: number;
        uptime: number;
        disk: string;
    };
    obsidian?: {
        status: string;
        activeFile: string | null;
    };
    activeAgents?: string[];
    metrics?: {
        tokensUsed?: number;
        sessionDuration?: number;
        knowledgeNodes?: number;
        lastRuntime?: string | null;
        lastModel?: string | null;
        lastCompressionRatio?: number | null;
    };
}

interface Integration {
    name: string;
    status: string;
}

interface Sample {
    at: string;
    density: number;
    sync: number;
    pressure: number;
    throughput: number;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const ageLabel = (timestamp?: string | null) => {
    if (!timestamp) return 'SYNCING';
    const ageSeconds = Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 1000);
    if (ageSeconds < 60) return `${Math.round(ageSeconds)}s AGO`;
    if (ageSeconds < 3600) return `${Math.round(ageSeconds / 60)}m AGO`;
    return `${Math.round(ageSeconds / 3600)}h AGO`;
};

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
    const gradientId = useId();
    if (!data.length) return null;
    const width = 160;
    const height = 44;
    const max = Math.max(...data, 1);
    const points = data.map((value, index) => ({
        x: data.length === 1 ? width / 2 : (index / (data.length - 1)) * width,
        y: height - (value / max) * (height - 6) - 3
    }));
    const path = `M ${points.map((point) => `${point.x},${point.y}`).join(' L ')}`;
    const fillPath = `${path} L ${width},${height} L 0,${height} Z`;

    return (
        <svg aria-hidden="true" focusable="false" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={fillPath} fill={`url(#${gradientId})`} />
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

const TelemetryDeck: React.FC = () => {
    const [data, setData] = useState<TelemetryData | null>(null);
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [history, setHistory] = useState<Sample[]>([]);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    useEffect(() => {
        const fetchIntegrations = async () => {
            try {
                const host = window.location.hostname;
                const res = await apiFetch(`http://${host}:3004/api/integrations`);
                const payload = await res.json();
                setIntegrations(Array.isArray(payload) ? payload : []);
            } catch {
                // Integration status is best-effort.
            }
        };

        fetchIntegrations();
        const interval = setInterval(fetchIntegrations, 30000);

        let unsubscribe: (() => void) | null = null;
        const engine = (window as any).nudimmudEngine;
        if (engine) {
            unsubscribe = engine.subscribe((payload: TelemetryData) => {
                setData(payload);
                setLastUpdated(payload.timestamp || new Date().toISOString());

                const sample: Sample = {
                    at: payload.timestamp || new Date().toISOString(),
                    density: payload.cognitiveLoad?.neuralDensity ?? 0,
                    sync: payload.cognitiveLoad?.swarmSync ?? 0,
                    pressure: payload.cognitiveLoad?.ingestionPressure ?? 0,
                    throughput: payload.cognitiveLoad?.logicThroughput ?? 0
                };

                setHistory((current) => [...current.slice(-11), sample]);
            });
        }

        return () => {
            clearInterval(interval);
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const combinedHistory = useMemo(() => (
        history.map((sample) => Math.round((sample.density + sample.sync + sample.pressure + sample.throughput) / 4))
    ), [history]);

    const latest = history[history.length - 1];
    const systemLoad = data?.systemLoad;
    const activeAgents = data?.activeAgents?.length || 0;
    const currentScore = data
        ? Math.round((
            (data.cognitiveLoad?.neuralDensity ?? 0)
            + (data.cognitiveLoad?.swarmSync ?? 0)
            + (data.cognitiveLoad?.ingestionPressure ?? 0)
            + (data.cognitiveLoad?.logicThroughput ?? 0)
        ) / 4)
        : 0;
    const loadScore = latest
        ? Math.round((latest.density + latest.sync + latest.pressure + latest.throughput) / 4)
        : currentScore;
    const loadTint = loadScore > 80 ? 'var(--red-fusion)' : loadScore > 60 ? 'var(--gold-solar)' : 'var(--cyan-glow)';

    const loadItems = [
        { label: 'NEURAL_DENSITY', value: data?.cognitiveLoad.neuralDensity ?? 0, tint: 'var(--cyan-glow)' },
        { label: 'SWARM_SYNC', value: data?.cognitiveLoad.swarmSync ?? 0, tint: 'var(--gold-solar)' },
        { label: 'INGESTION_PRESSURE', value: data?.cognitiveLoad.ingestionPressure ?? 0, tint: 'var(--red-fusion)' },
        { label: 'LOGIC_THROUGHPUT', value: data?.cognitiveLoad.logicThroughput ?? 0, tint: 'var(--cyan-glow)' }
    ];

    return (
        <div style={{ display: 'grid', gap: '18px', minHeight: '100%' }}>
            <header className="neural-glass" style={{ padding: '24px 28px', display: 'flex', justifyContent: 'space-between', gap: '24px', alignItems: 'flex-end' }}>
                <div style={{ maxWidth: '760px' }}>
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--gold-solar)', letterSpacing: '0.38em', marginBottom: '10px' }}>
                        SYSTEM_TELEMETRY // LIVE
                    </div>
                    <h2 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.4rem)', fontWeight: 800, letterSpacing: '-0.05em' }}>
                        Telemetry Deck
                    </h2>
                    <p style={{ margin: '10px 0 0', maxWidth: '62ch', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)' }}>
                        Cognitive load, system load, and integration status sampled from the runtime bus. The deck now tracks freshness and short-term history instead of freezing a single snapshot.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px', alignItems: 'flex-end' }}>
                    <div className="text-mono" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2em' }}>
                        PULSE_STATE
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '999px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: loadTint, boxShadow: `0 0 12px ${loadTint}` }} />
                        <span className="text-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.12em' }}>
                            {lastUpdated ? ageLabel(lastUpdated) : 'AWAITING PULSE'}
                        </span>
                    </div>
                </div>
            </header>

            {!data ? (
                <div className="text-mono" style={{ opacity: 0.35, fontSize: '0.7rem', padding: '24px 6px' }}>
                    LISTENING_FOR_RUNTIME_PAYLOAD...
                </div>
            ) : (
                <>
                    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
                        {loadItems.map((item) => (
                            <motion.div
                                key={item.label}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="neural-glass"
                                style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                                    <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.18em', opacity: 0.36 }}>
                                        {item.label}
                                    </div>
                                    <div className="text-mono" style={{ fontSize: '0.64rem', color: item.tint }}>
                                        {Math.round(item.value)}%
                                    </div>
                                </div>
                                <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${clamp(item.value)}%` }}
                                        transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                                        style={{ height: '100%', background: item.tint, boxShadow: `0 0 10px ${item.tint}66` }}
                                    />
                                </div>
                            </motion.div>
                        ))}
                    </section>

                    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)', gap: '16px', alignItems: 'start' }}>
                        <div className="neural-glass" style={{ padding: '22px', display: 'grid', gap: '18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <div>
                                    <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.18em', opacity: 0.35, marginBottom: '6px' }}>
                                        COHERENCE_TRAJECTORY
                                    </div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
                                        Combined load: {loadScore}%
                                    </div>
                                </div>
                                <div className="text-mono" style={{ fontSize: '0.56rem', letterSpacing: '0.14em', opacity: 0.45 }}>
                                    STAGE {data.stage || 'UNKNOWN'}
                                </div>
                            </div>

                            <Sparkline data={combinedHistory} color={loadTint} />

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                                {[
                                    { label: 'ACTIVE_AGENTS', value: activeAgents, tint: 'var(--cyan-glow)' },
                                    { label: 'TOKENS_USED', value: data.metrics?.tokensUsed ?? 0, tint: 'var(--gold-solar)' },
                                    { label: 'KNOWLEDGE_NODES', value: data.metrics?.knowledgeNodes ?? 0, tint: 'var(--red-fusion)' }
                                ].map((item) => (
                                    <div key={item.label} className="neural-glass" style={{ padding: '14px' }}>
                                        <div className="text-mono" style={{ fontSize: '0.45rem', letterSpacing: '0.18em', opacity: 0.35, marginBottom: '6px' }}>
                                            {item.label}
                                        </div>
                                        <div style={{ fontSize: '1rem', fontWeight: 700, color: item.tint }}>
                                            {item.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                                <div className="neural-glass" style={{ padding: '14px' }}>
                                    <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em', marginBottom: '6px' }}>
                                        OBSIDIAN
                                    </div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: data.obsidian?.status === 'ONLINE' ? 'var(--cyan-glow)' : 'var(--red-fusion)' }}>
                                        {data.obsidian?.status || 'UNKNOWN'}
                                    </div>
                                </div>
                                <div className="neural-glass" style={{ padding: '14px' }}>
                                    <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em', marginBottom: '6px' }}>
                                        SYSTEM_CPU
                                    </div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                                        {Math.round(systemLoad?.cpu ?? 0)}%
                                    </div>
                                </div>
                                <div className="neural-glass" style={{ padding: '14px' }}>
                                    <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em', marginBottom: '6px' }}>
                                        SYSTEM_MEM
                                    </div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                                        {Math.round(systemLoad?.mem ?? 0)}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            <div className="neural-glass" style={{ padding: '20px', display: 'grid', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
                                    <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.18em' }}>
                                        INTEGRATIONS
                                    </div>
                                    <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.18em' }}>
                                        {integrations.length} CONNECTORS
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {integrations.map((integration) => (
                                        <div key={integration.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{integration.name}</div>
                                                <div className="text-mono" style={{ fontSize: '0.46rem', opacity: 0.35, letterSpacing: '0.18em', marginTop: '4px' }}>
                                                    {integration.name === 'OBSIDIAN' ? 'FILE_SYNC' : 'SERVICE_LINK'}
                                                </div>
                                            </div>
                                            <div className="text-mono" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: integration.status === 'CONNECTED' ? 'var(--cyan-glow)' : 'var(--red-fusion)' }}>
                                                {integration.status}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="neural-glass" style={{ padding: '20px', display: 'grid', gap: '12px' }}>
                                <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.18em' }}>
                                    OBSIDIAN_ACTIVE_NOTE
                                </div>
                                <div style={{ fontSize: '0.92rem', lineHeight: 1.5 }}>
                                    {data.obsidian?.activeFile ? data.obsidian.activeFile.split('/').pop() : 'No active note'}
                                </div>
                                <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.18em' }}>
                                    SYSTEM_UPTIME
                                </div>
                                <div style={{ fontSize: '0.92rem', lineHeight: 1.5 }}>
                                    {systemLoad?.uptime ? `${Math.round(systemLoad.uptime / 3600)}h ${Math.round((systemLoad.uptime % 3600) / 60)}m` : '---'}
                                </div>
                                <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.18em' }}>
                                    LAST_RUNTIME
                                </div>
                                <div style={{ fontSize: '0.92rem', lineHeight: 1.5 }}>
                                    {data.metrics?.lastRuntime || '---'} / {data.metrics?.lastModel || '---'}
                                </div>
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

export default TelemetryDeck;
