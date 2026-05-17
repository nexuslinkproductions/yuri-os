import React, { useState, useEffect, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

interface Agent {
    id: number;
    name: string;
    layer: string;
    domain: string;
    role: string | null;
    learning_cycles: number;
    status: string;
    command: string;
    parent_agent_id: number | null;
    current_op: string | null;
    current_state: string;
}

interface SwarmMessage {
    id: number;
    sender: string;
    receiver: string;
    content: string;
    created_at: string;
}

interface Integration {
    name: string;
    status: string;
}

interface SwarmMetrics {
    active_agents: number;
    total_agents: number;
    recent_events_1h: number;
    neural_entropy: number;
    swarm_sync: number;
    knowledge_density?: number;
}

const STATE_COLORS: Record<string, string> = {
    'NIGREDO': '#333333',
    'ALBEDO': '#FFFFFF',
    'CITRINITAS': '#FFD700',
    'RUBEDO': '#FF4500'
};

const LAYER_COLORS: Record<string, string> = {
    'BUSINESS': 'var(--gold-solar)',
    'ENGINEERING': 'var(--cyan-glow)'
};

const Sparkline = ({ data, color }: { data: number[], color: string }) => {
    const gradientId = useId();
    if (!data || data.length === 0) return null;
    const max = Math.max(...data, 1);
    const width = 100;
    const height = 30;
    const points = data.map((d, i) => ({
        x: (i / (data.length - 1)) * width,
        y: height - (d / max) * height
    }));

    const pathData = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;

    return (
        <svg aria-hidden="true" focusable="false" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`${pathData} L ${width},${height} L 0,${height} Z`} fill={`url(#${gradientId})`} />
            <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

const SacredIcon = ({ type, color }: { type: number, color: string }) => {
    const patterns = [
        <g stroke={color} fill="none" strokeWidth="0.5">
            <circle cx="25" cy="25" r="10" /><circle cx="25" cy="15" r="10" /><circle cx="25" cy="35" r="10" />
            <circle cx="15" cy="20" r="10" /><circle cx="35" cy="20" r="10" /><circle cx="15" cy="30" r="10" /><circle cx="35" cy="30" r="10" />
        </g>,
        <g stroke={color} fill="none" strokeWidth="0.5">
            <circle cx="25" cy="25" r="15" /><path d="M 25,10 L 38,32 L 12,32 Z" /><path d="M 25,40 L 12,18 L 38,18 Z" />
            <circle cx="25" cy="25" r="5" fill={color} fillOpacity="0.2" />
        </g>,
        <g stroke={color} fill="none" strokeWidth="0.5">
            {[0, 45, 90, 135].map((deg: number) => (<ellipse key={deg} cx="25" cy="25" rx="20" ry="8" transform={`rotate(${deg} 25 25)`} />))}
            <circle cx="25" cy="25" r="2" fill={color} />
        </g>,
        <g stroke={color} fill="none" strokeWidth="0.5">
            <path d="M 25,5 L 45,40 L 5,40 Z" /><path d="M 25,45 L 5,10 L 45,10 Z" /><path d="M 25,15 L 35,35 L 15,35 Z" />
            <rect x="20" y="20" width="10" height="10" transform="rotate(45 25 25)" />
        </g>
    ];
    return (
        <svg width="40" height="40" viewBox="0 0 50 50" style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}>
            {patterns[type % patterns.length]}
        </svg>
    );
};

const IndraSwarm: React.FC = () => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [messages, setMessages] = useState<SwarmMessage[]>([]);
    const [metrics, setMetrics] = useState<SwarmMetrics | null>(null);
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [agentActivity, setAgentActivity] = useState<Record<string, number[]>>({});
    const [loading, setLoading] = useState(true);
    const [showConsole, setShowConsole] = useState(false);
    const [vaultStatus, setVaultStatus] = useState('OFFLINE');
    const [expandedSubAgent, setExpandedSubAgent] = useState<number | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

    const host = window.location.hostname;

    const fetchData = async () => {
        try {
            const [agentsRes, mRes, metricsRes, integRes] = await Promise.all([
                apiFetch(`http://${host}:3004/api/agents`).catch(() => null),
                apiFetch(`http://${host}:3004/api/swarm/messages`).catch(() => null),
                apiFetch(`http://${host}:3004/api/swarm/metrics`).catch(() => null),
                apiFetch(`http://${host}:3004/api/integrations`).catch(() => null)
            ]);

            const agentData = agentsRes?.ok ? await agentsRes.json() : [];
            if (agentsRes?.ok) setAgents(agentData);
            if (mRes?.ok) setMessages(await mRes.json());
            if (metricsRes?.ok) setMetrics(await metricsRes.json());

            if (integRes?.ok) {
                const data = await integRes.json();
                setIntegrations(data);
                const obsidian = data.find((i: Integration) => i.name === 'OBSIDIAN');
                if (obsidian) setVaultStatus(obsidian.status === 'ONLINE' ? 'CONNECTED' : 'OFFLINE');
            }

            const activeAgents = (agentData as Agent[]).filter((agent) => agent.status === 'ACTIVE');
            const activityEntries = await Promise.all(activeAgents.map(async (agent) => {
                const actRes = await apiFetch(`http://${host}:3004/api/agents/${encodeURIComponent(agent.name)}/activity`).catch(() => null);
                if (!actRes?.ok) return null;
                const actData = await actRes.json();
                return [agent.name, actData] as const;
            }));
            const nextActivity: Record<string, number[]> = {};
            for (const entry of activityEntries) {
                if (entry) nextActivity[entry[0]] = entry[1];
            }
            if (Object.keys(nextActivity).length > 0) {
                setAgentActivity((prev: Record<string, number[]>) => ({ ...prev, ...nextActivity }));
            }
            setLastSyncedAt(new Date().toISOString());
        } catch (err) {
            console.error('⬡ INDRA_FETCH_ERROR:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        
        let unsubscribe: any = null;
        if ((window as any).nudimmudEngine) {
            unsubscribe = (window as any).nudimmudEngine.subscribe((data: { swarmMessage?: boolean, obsidian?: { status: string }, integrations?: Integration[] }) => {
                if (data.swarmMessage) fetchData();
                if (data.obsidian) setVaultStatus(data.obsidian.status === 'ONLINE' ? 'CONNECTED' : 'OFFLINE');
                if (data.integrations) {
                    setIntegrations(data.integrations);
                    const obsidian = data.integrations.find((i: Integration) => i.name === 'OBSIDIAN');
                    if (obsidian) setVaultStatus(obsidian.status === 'ONLINE' ? 'CONNECTED' : 'OFFLINE');
                }
            });
        }


        return () => {
            clearInterval(interval);
            if (unsubscribe) unsubscribe();
        };
    }, []);

    return (
        <div className="indra-container" style={{ 
            padding: '20px', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px',
            background: 'radial-gradient(circle at top, rgba(255,184,0,0.08) 0%, rgba(10,6,5,1) 58%)'
        }}>
            {/* GLOBAL HUD */}
            <header className="neural-glass" style={{ 
                padding: '20px 40px', 
                borderRadius: '8px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
                <div>
                    <h1 className="text-mono glow-text" style={{ color: 'var(--cyan-glow)', letterSpacing: '0.34em', fontSize: '1.8rem', margin: 0 }}>
                        INDRA // SWARM_INTELLIGENCE
                    </h1>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '5px' }}>
                        <div className="text-mono" style={{ fontSize: '0.65rem', opacity: 0.4 }}>
                            CENTRAL_COMMAND_ORCHESTRATOR // VERSION_9.1_AEON
                        </div>
                        <div className="text-mono" style={{ 
                            fontSize: '0.55rem', 
                            padding: '2px 8px', 
                            background: 'rgba(0,0,0,0.3)', 
                            border: `1px solid ${vaultStatus === 'CONNECTED' ? 'var(--cyan-glow)' : 'var(--red-fusion)'}44`,
                            color: vaultStatus === 'CONNECTED' ? 'var(--cyan-glow)' : 'var(--red-fusion)',
                            borderRadius: '2px'
                        }}>
                            VAULT_LINK: {vaultStatus}
                        </div>
                        <div className="text-mono" style={{
                            fontSize: '0.55rem',
                            padding: '2px 8px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.7)',
                            borderRadius: '2px'
                        }}>
                            LAST_SYNC: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'SYNCING'}
                        </div>
                    </div>
                </div>

                {metrics && (
                    <div style={{ display: 'flex', gap: '40px' }}>
                        {[
                            { label: 'ACTIVE_THREADS', value: metrics.active_agents, color: 'var(--cyan-glow)' },
                            { label: 'KNOWLEDGE_NODES', value: metrics.knowledge_density || 0, color: 'var(--cyan-glow)' },
                            { label: 'NEURAL_ENTROPY', value: `${metrics.neural_entropy}%`, color: 'var(--red-fusion)' },
                            { label: 'SWARM_SYNC', value: `${metrics.swarm_sync}%`, color: 'var(--gold-solar)' },
                        ].map(m => (
                            <div key={m.label} style={{ textAlign: 'right' }}>
                                <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3, letterSpacing: '0.1em' }}>{m.label}</div>
                                <div className="text-mono" style={{ fontSize: '1.2rem', color: m.color, fontWeight: 900 }}>{m.value}</div>
                            </div>
                        ))}
                    </div>
                )}
            </header>

            <div style={{ display: 'flex', flex: 1, gap: '20px', minHeight: 0 }}>
                {/* PRIMARY SWARM GRID */}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }} className="custom-scrollbar">
                    {loading ? (
                        <div className="text-mono" style={{ opacity: 0.5, padding: '40px' }}>SYNCHRONIZING_NEURAL_LAYERS...</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                            {['BUSINESS', 'ENGINEERING'].map((layer, lIdx) => (
                                <div key={layer}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                                        <h2 style={{ fontSize: '0.8rem', color: LAYER_COLORS[layer], letterSpacing: '0.3em', margin: 0 }} className="text-mono">
                                            {layer}_LAYER_CLUSTER
                                        </h2>
                                        <div style={{ flex: 1, height: '1px', background: `linear-gradient(90deg, ${LAYER_COLORS[layer]}44, transparent)` }}></div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
                                        <AnimatePresence mode="popLayout">
                                            {agents.filter((a: Agent) => a.layer === layer && !a.parent_agent_id).map((agent: Agent, aIdx: number) => (
                                                <motion.div 
                                                    key={agent.id} 
                                                    layout
                                                    initial={{ scale: 0.95, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className={`neural-glass card-hover-effect ${agent.status === 'ACTIVE' ? 'agent-active-pulse' : ''}`} 
                                                    style={{ 
                                                        padding: '24px',
                                                        borderLeft: `4px solid ${agent.status === 'ACTIVE' ? LAYER_COLORS[layer] : 'rgba(255,255,255,0.05)'}`,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '20px',
                                                        position: 'relative',
                                                        overflow: 'hidden',
                                                        background: 'rgba(255,255,255,0.01)',
                                                        boxShadow: agent.status === 'ACTIVE' ? `0 0 40px ${LAYER_COLORS[layer]}11` : 'none'
                                                    }}
                                                >
                                                    {/* Background Glow */}
                                                    <div style={{ 
                                                        position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', 
                                                        background: `radial-gradient(circle at top right, ${LAYER_COLORS[layer]}11, transparent)`,
                                                        pointerEvents: 'none'
                                                    }} />

                                                    <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                                                        <SacredIcon type={aIdx} color={LAYER_COLORS[layer]} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span className="text-mono" style={{ fontWeight: 900, fontSize: '1.2rem', color: 'white' }}>{agent.name}</span>
                                                                <span className="text-mono" style={{ 
                                                                    fontSize: '0.5rem', padding: '2px 8px', 
                                                                    background: 'rgba(255,255,255,0.05)', borderRadius: '2px',
                                                                    color: agent.status === 'ACTIVE' ? LAYER_COLORS[layer] : 'inherit'
                                                                }}>{agent.status}</span>
                                                            </div>
                                                            <div className="text-mono" style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '2px' }}>{agent.role || 'Neural Unit Operations'}</div>
                                                        </div>
                                                    </div>

                                                    {/* Activity Sparkline */}
                                                    <div style={{ margin: '5px 0' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }} className="text-mono">
                                                            <span style={{ fontSize: '0.5rem', opacity: 0.3 }}>NEURAL_ACTIVITY_24H</span>
                                                            <span style={{ fontSize: '0.5rem', color: LAYER_COLORS[layer] }}>ACTIVE</span>
                                                        </div>
                                                        <Sparkline data={agentActivity[agent.name] || [2, 5, 3, 8, 4, 6, 2, 8]} color={LAYER_COLORS[layer]} />
                                                    </div>

                                                    {/* Learning Progress */}
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', marginBottom: '6px' }} className="text-mono">
                                                            <span style={{ opacity: 0.4 }}>LEARNING_CYCLE_PHASE</span>
                                                            <span style={{ color: LAYER_COLORS[layer] }}>{agent.learning_cycles}%</span>
                                                        </div>
                                                        <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '1px', overflow: 'hidden' }}>
                                                            <motion.div 
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${agent.learning_cycles}%` }}
                                                                style={{ height: '100%', background: LAYER_COLORS[layer], boxShadow: `0 0 10px ${LAYER_COLORS[layer]}aa` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Command Terminal */}
                                                    <div className="command-terminal" style={{ 
                                                        background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '4px',
                                                        border: '1px solid rgba(255,255,255,0.03)',
                                                        fontSize: '0.65rem', fontFamily: 'var(--font-mono)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.3, marginBottom: '5px' }}>
                                                            <span>LAST_COMMAND</span>
                                                            <span>{agent.current_state}</span>
                                                        </div>
                                                        <div style={{ color: LAYER_COLORS[layer] }}>
                                                            <span style={{ opacity: 0.3 }}>&gt;</span> {agent.current_op || agent.command || 'IDLE'}
                                                        </div>
                                                    </div>

                                                    {/* Tactical Controls */}
                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                        <button 
                                                            type="button"
                                                            className="text-mono tactical-btn"
                                                            onClick={() => alert(`REBOOTING_${agent.name}...`)}
                                                            style={{ 
                                                                flex: 1, padding: '8px', fontSize: '0.55rem', 
                                                                background: 'rgba(255,184,0,0.05)', border: '1px solid rgba(255,184,0,0.2)',
                                                                color: 'var(--gold-solar)', borderRadius: '2px', cursor: 'pointer'
                                                            }}
                                                        >
                                                            REBOOT
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            className="text-mono tactical-btn"
                                                            onClick={() => alert(`SYNCING_COGNITIVE_BASE_${agent.name}...`)}
                                                            style={{ 
                                                                flex: 1, padding: '8px', fontSize: '0.55rem', 
                                                                background: 'rgba(0,242,255,0.05)', border: '1px solid rgba(0,242,255,0.2)',
                                                                color: 'var(--cyan-glow)', borderRadius: '2px', cursor: 'pointer'
                                                            }}
                                                        >
                                                            SYNC
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            className="text-mono tactical-btn"
                                                            onClick={() => alert(`FETCHING_NEURAL_LOGS_${agent.name}...`)}
                                                            style={{ 
                                                                flex: 1, padding: '8px', fontSize: '0.55rem', 
                                                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                                                                color: 'white', borderRadius: '2px', cursor: 'pointer'
                                                            }}
                                                        >
                                                            LOGS
                                                        </button>
                                                    </div>

                                                    {/* Direct Reports / Sub-agents */}
                                                    {agents.filter((sub: Agent) => sub.parent_agent_id === agent.id).length > 0 && (
                                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
                                                            <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, marginBottom: '10px', letterSpacing: '0.1em' }}>DIRECT_REPORTS</div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                                {agents.filter((sub: Agent) => sub.parent_agent_id === agent.id).map((sub: Agent) => (
                                                                    <div key={sub.id}>
                                                                        <div 
                                                                            onClick={() => setExpandedSubAgent(expandedSubAgent === sub.id ? null : sub.id)}
                                                                            className="text-mono"
                                                                            style={{ 
                                                                                fontSize: '0.55rem', 
                                                                                padding: '8px', 
                                                                                background: 'rgba(255,255,255,0.01)',
                                                                                border: `1px solid ${sub.status === 'ACTIVE' ? LAYER_COLORS[layer] + '22' : 'rgba(255,255,255,0.03)'}`,
                                                                                borderRadius: '2px',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            <span style={{ opacity: 0.8 }}>{sub.name}</span>
                                                                            <div style={{ 
                                                                                width: '4px', height: '4px', borderRadius: '50%', 
                                                                                background: sub.status === 'ACTIVE' ? LAYER_COLORS[layer] : 'transparent',
                                                                                border: sub.status !== 'ACTIVE' ? '1px solid rgba(255,255,255,0.2)' : 'none',
                                                                                boxShadow: sub.status === 'ACTIVE' ? `0 0 5px ${LAYER_COLORS[layer]}` : 'none'
                                                                            }} />
                                                                        </div>
                                                                        
                                                                        <AnimatePresence>
                                                                            {expandedSubAgent === sub.id && (
                                                                                <motion.div
                                                                                    initial={{ height: 0, opacity: 0 }}
                                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                                    exit={{ height: 0, opacity: 0 }}
                                                                                    style={{ overflow: 'hidden' }}
                                                                                >
                                                                                    <div style={{ 
                                                                                        padding: '10px', 
                                                                                        marginTop: '5px',
                                                                                        background: 'rgba(0,0,0,0.2)',
                                                                                        border: `1px solid ${LAYER_COLORS[layer]}11`,
                                                                                        borderRadius: '2px'
                                                                                    }}>
                                                                                        <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, marginBottom: '5px' }}>SUB_OP_STATUS</div>
                                                                                        <div className="text-mono" style={{ fontSize: '0.6rem', color: LAYER_COLORS[layer] }}>
                                                                                            <span style={{ opacity: 0.3 }}>&gt;</span> {sub.current_op || sub.command || 'IDLE'}
                                                                                        </div>
                                                                                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.2, marginTop: '5px' }}>
                                                                                            DOMAIN: {sub.domain} // STATE: {sub.current_state}
                                                                                        </div>
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* GLOBAL SYSTEM STABILITY HUD */}
            <footer className="neural-glass" style={{ padding: '20px', borderRadius: '8px', marginTop: 'auto' }}>
                <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>SYSTEM_STABILITY_INDEX</span>
                    <span style={{ color: 'var(--cyan-glow)' }}>SYNC_STATUS: OPTIMAL</span>
                </div>
                <div style={{ height: '30px', display: 'flex', alignItems: 'flex-end', gap: '3px' }}>
                    {agents.map((agent: Agent, i: number) => {
                        const activity = agentActivity[agent.name] || [];
                        const recent = activity.slice(-10);
                        const avg = recent.length > 0 
                            ? recent.reduce((sum: number, p: number) => sum + p, 0) / recent.length 
                            : 15;
                        
                        return (
                            <motion.div 
                                key={agent.name}
                                animate={{ 
                                    height: `${Math.max(15, Math.min(100, avg))}%`,
                                    opacity: agent.status === 'ACTIVE' ? 0.8 : 0.2,
                                    background: agent.status === 'ACTIVE' ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.1)'
                                }}
                                transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                                style={{ 
                                    flex: 1, 
                                    borderRadius: '1px'
                                }}
                            />
                        );
                    })}
                </div>
            </footer>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--cyan-glow); }
                
                .neural-glass {
                    backdrop-filter: blur(25px) saturate(180%);
                    -webkit-backdrop-filter: blur(25px) saturate(180%);
                    background-color: rgba(17, 25, 40, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .card-hover-effect {
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }
                
                .card-hover-effect:hover {
                    background-color: rgba(17, 25, 40, 0.8);
                    transform: translateY(-5px);
                    box-shadow: 0 10px 40px rgba(0,0,0,0.8), 0 0 20px rgba(0,255,255,0.1);
                    border-color: rgba(0,255,255,0.3);
                }

                @keyframes neural-pulse {
                    0% { border-left-color: rgba(255,255,255,0.1); }
                    50% { border-left-color: inherit; }
                    100% { border-left-color: rgba(255,255,255,0.1); }
                }

                .agent-active-pulse {
                    animation: neural-pulse 3s infinite ease-in-out;
                }

                .tactical-btn {
                    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .tactical-btn:hover {
                    background: rgba(255,255,255,0.1) !important;
                    color: white !important;
                    border-color: var(--cyan-glow) !important;
                    box-shadow: 0 0 10px var(--cyan-glow)33;
                }
            `}</style>
        </div>
    );
};

export default IndraSwarm;
