import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

/* ── Types ─────────────────────────────────────────── */

interface KnowledgeEntry {
    title: string;
    type: string;
    source: string;
    date: string;
    path?: string;
    summary?: string;
}

interface MemoryStats {
    knowledgeNodes: number;
    activeModels: number;
    systemUptime: number;
}

interface VaultNode {
    name: string;
    type: 'dir' | 'file';
    children?: VaultNode[];
}

const VAULT_STRUCTURE: VaultNode[] = [
    {
        name: 'backend', type: 'dir', children: [
            { name: 'server.py', type: 'file' },
            { name: 'routes', type: 'dir', children: [
                { name: 'agents.py', type: 'file' },
                { name: 'knowledge.py', type: 'file' },
                { name: 'status.py', type: 'file' },
            ]},
        ],
    },
    {
        name: 'src', type: 'dir', children: [
            { name: 'components', type: 'dir', children: [
                { name: 'ChronosStream.tsx', type: 'file' },
                { name: 'MnemosyneMedia.tsx', type: 'file' },
                { name: 'ConclaveMonitor.tsx', type: 'file' },
            ]},
            { name: 'lib', type: 'dir', children: [
                { name: 'runtime.ts', type: 'file' },
            ]},
        ],
    },
    {
        name: 'config', type: 'dir', children: [
            { name: 'agents.json', type: 'file' },
            { name: 'vault.yaml', type: 'file' },
        ],
    },
    {
        name: 'docs', type: 'dir', children: [
            { name: 'ARCHITECTURE.md', type: 'file' },
            { name: 'API.md', type: 'file' },
        ],
    },
];

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── File Tree Component ───────────────────────────── */

const TreeRow: React.FC<{ node: VaultNode; depth: number }> = ({ node, depth }) => {
    const [expanded, setExpanded] = useState(true);
    const isDir = node.type === 'dir';
    const hasChildren = isDir && node.children && node.children.length > 0;

    return (
        <>
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '3px 0', cursor: hasChildren ? 'pointer' : 'default',
                    marginLeft: depth * 16,
                }}
                onClick={() => hasChildren && setExpanded(!expanded)}
            >
                <span style={{ fontSize: '0.55rem', opacity: 0.4, width: '12px', textAlign: 'center' }}>
                    {isDir ? (expanded ? '▼' : '▶') : '•'}
                </span>
                <span className="text-mono" style={{
                    fontSize: '0.6rem',
                    color: isDir ? 'var(--gold-solar)' : 'rgba(255,255,255,0.6)',
                    opacity: isDir ? 0.8 : 0.5,
                }}>
                    {node.name}
                </span>
            </motion.div>
            {isDir && expanded && node.children?.map((child, i) => (
                <TreeRow key={`${child.name}-${i}`} node={child} depth={depth + 1} />
            ))}
        </>
    );
};

/* ── Component ─────────────────────────────────────── */

const MnemosyneMedia: React.FC = () => {
    const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
    const [knowledge, setKnowledge] = useState<KnowledgeEntry[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'OFFLINE'>('IDLE');

    const fetchData = useCallback(async () => {
        try {
            /* Try knowledge search first */
            const knowRes = await apiFetch('/api/knowledge/search?q=*');
            if (knowRes.ok) {
                const data = await knowRes.json();
                if (Array.isArray(data)) {
                    setKnowledge(data.slice(0, 12));
                } else if (data?.results && Array.isArray(data.results)) {
                    setKnowledge(data.results.slice(0, 12));
                }
                setSyncStatus('IDLE');
            }

            /* Get status for memory stats and fallback */
            const statusRes = await apiFetch('/api/status');
            if (statusRes.ok) {
                const data = await statusRes.json();
                setMemoryStats({
                    knowledgeNodes: data.metrics?.knowledgeNodes ?? 0,
                    activeModels: data.metrics?.lastModel ? 1 : 0,
                    systemUptime: data.systemLoad?.uptime ?? 0,
                });

                /* Fallback: if knowledge search failed, build from status data */
                if (!knowledge && data.obsidian) {
                    setSyncStatus(data.obsidian.status === 'syncing' ? 'SYNCING' : 'IDLE');
                }
            }

            setError(null);
        } catch (err: any) {
            /* If no data yet, show error; otherwise keep cached data */
            if (!memoryStats && !knowledge) {
                setError(err?.message || 'CONNECTION_LOST');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRetry = () => {
        setLoading(true);
        setError(null);
        fetchData();
    };

    return (
        <div className="mnemosyne-vault" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
            {/* ── Header ── */}
            <header style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="text-mono glow-text" style={{ color: 'var(--cyan-glow)', letterSpacing: '0.4em', fontSize: '2.2rem', margin: 0 }}>
                        MNEMOSYNE // MEMORY VAULT
                    </h1>
                    <div className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '4px' }}>
                        KNOWLEDGE_INGESTION // MEDIA_ARCHIVE_v1.0
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <motion.div
                        animate={{ opacity: syncStatus === 'SYNCING' ? [0.3, 1, 0.3] : 0.5 }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: syncStatus === 'OFFLINE' ? 'var(--red-fusion)'
                                : syncStatus === 'SYNCING' ? 'var(--gold-solar)' : '#00e676',
                        }}
                    />
                    <span className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.4 }}>
                        SYNC: {syncStatus}
                    </span>
                </div>
            </header>

            {/* ── Loading ── */}
            {loading && (
                <div className="text-mono" style={{ opacity: 0.3, padding: '100px', textAlign: 'center' }}>
                    RETRIEVING_KNOWLEDGE_GRAPHS...
                </div>
            )}

            {/* ── Error ── */}
            {!loading && error && !memoryStats && (
                <div style={{ textAlign: 'center', padding: '100px' }}>
                    <div className="text-mono" style={{ color: 'var(--red-fusion)', fontSize: '0.85rem', marginBottom: '20px' }}>
                        BACKEND_OFFLINE // {error}
                    </div>
                    <button
                        onClick={handleRetry}
                        className="text-mono"
                        style={{
                            padding: '12px 30px', background: 'var(--cyan-glow)', color: 'black',
                            border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, fontSize: '0.7rem',
                        }}
                    >
                        RETRY_CONNECTION
                    </button>
                </div>
            )}

            {/* ── Content ── */}
            {!loading && (!error || memoryStats) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    {/* ── Section 1: Memory Stats ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3, marginBottom: '14px', letterSpacing: '0.2em' }}>
                            SYSTEM_MEMORY_STATS
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                            {[
                                {
                                    label: 'KNOWLEDGE_NODES',
                                    value: memoryStats?.knowledgeNodes ?? 0,
                                    color: 'var(--cyan-glow)',
                                    icon: '🧠',
                                },
                                {
                                    label: 'ACTIVE_MODELS',
                                    value: memoryStats?.activeModels ?? 0,
                                    color: 'var(--gold-solar)',
                                    icon: '⚡',
                                },
                                {
                                    label: 'SYSTEM_UPTIME',
                                    value: memoryStats?.systemUptime ? formatUptime(memoryStats.systemUptime) : '--',
                                    color: '#7c4dff',
                                    icon: '⏱',
                                },
                            ].map((card, idx) => (
                                <motion.div
                                    key={card.label}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.08, duration: 0.3 }}
                                    className="neural-glass"
                                    style={{
                                        padding: '24px', borderRadius: '6px',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        display: 'flex', flexDirection: 'column', gap: '8px',
                                    }}
                                >
                                    <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, letterSpacing: '0.1em' }}>
                                        {card.label}
                                    </div>
                                    <div className="text-mono" style={{ fontSize: '2rem', color: card.color, fontWeight: 900 }}>
                                        {card.value}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* ── Section 2: Recent Knowledge ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.4 }}
                    >
                        <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3, marginBottom: '14px', letterSpacing: '0.2em' }}>
                            RECENT_KNOWLEDGE
                        </div>

                        {knowledge && knowledge.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                                <AnimatePresence>
                                    {knowledge.map((entry, idx) => (
                                        <motion.div
                                            key={`${entry.title}-${idx}`}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: idx * 0.04, duration: 0.25 }}
                                            className="neural-glass card-hover"
                                            style={{
                                                padding: '18px', borderRadius: '6px',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                display: 'flex', flexDirection: 'column', gap: '8px',
                                                cursor: 'default',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span
                                                    className="text-mono"
                                                    style={{
                                                        fontSize: '0.5rem', padding: '2px 8px',
                                                        background: `rgba(0, 229, 191, 0.1)`,
                                                        color: 'var(--cyan-glow)',
                                                        borderRadius: '2px', letterSpacing: '0.06em',
                                                    }}
                                                >
                                                    {entry.type?.toUpperCase() || 'NODE'}
                                                </span>
                                                {entry.date && (
                                                    <span className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.3 }}>
                                                        {formatDate(entry.date)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-mono" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'white', lineHeight: 1.3 }}>
                                                {entry.title}
                                            </div>
                                            {entry.source && (
                                                <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.35 }}>
                                                    SOURCE: {entry.source}
                                                </div>
                                            )}
                                            {entry.summary && (
                                                <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.5, lineHeight: 1.4 }}>
                                                    {entry.summary.slice(0, 120)}{entry.summary.length > 120 ? '...' : ''}
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="neural-glass" style={{ padding: '40px', textAlign: 'center' }}>
                                <div className="text-mono" style={{ fontSize: '0.65rem', opacity: 0.3, marginBottom: '12px' }}>
                                    {memoryStats ? 'KNOWLEDGE_ENDPOINT_UNAVAILABLE // SHOWING_SYSTEM_SUMMARY' : 'NO_KNOWLEDGE_DATA'}
                                </div>
                                {memoryStats && (
                                    <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.2, lineHeight: 1.8 }}>
                                        System tracking {memoryStats.knowledgeNodes} nodes across {memoryStats.activeModels} models.
                                        Uptime: {formatUptime(memoryStats.systemUptime)}.
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>

                    {/* ── Section 3: Media Overview (Vault Structure) ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                    >
                        <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3, marginBottom: '14px', letterSpacing: '0.2em' }}>
                            MEDIA_VAULT_STRUCTURE
                        </div>
                        <div className="neural-glass" style={{ padding: '20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {VAULT_STRUCTURE.map((node, i) => (
                                <TreeRow key={`${node.name}-${i}`} node={node} depth={0} />
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}

            <style>{`
                .mnemosyne-vault::-webkit-scrollbar { width: 4px; }
                .mnemosyne-vault::-webkit-scrollbar-track { background: transparent; }
                .mnemosyne-vault::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
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
                    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
                    border-color: rgba(255,255,255,0.15) !important;
                }
            `}</style>
        </div>
    );
};

export default MnemosyneMedia;
