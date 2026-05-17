import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

interface KnowledgeNode {
    id: number;
    title: string;
    domain: string;
    source_path: string;
    color?: string;
    summary?: string;
}

interface KnowledgeLink {
    source: number;
    target: number;
}

interface KnowledgePayload {
    nodes: KnowledgeNode[];
    links: KnowledgeLink[];
}

interface BridgeProps {
    surfaceLabel?: string;
}

const Bridge: React.FC<BridgeProps> = ({ surfaceLabel = 'Bridge' }) => {
    const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
    const [links, setLinks] = useState<KnowledgeLink[]>([]);
    const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
    const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
    const [selectedNodeContent, setSelectedNodeContent] = useState<string>('');
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [fetchingDetail, setFetchingDetail] = useState(false);

    const loadKnowledge = async () => {
        try {
            setLoadError(null);
            const host = window.location.hostname;
            const response = await apiFetch(`http://${host}:3004/api/knowledge`);
            const payload = await response.json() as KnowledgePayload;
            const nextNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
            setNodes(nextNodes);
            setLinks(Array.isArray(payload.links) ? payload.links : []);
            if (!selectedNode && nextNodes.length > 0) {
                setSelectedNode(nextNodes[0]);
            }
        } catch (error) {
            console.error('⬡ BRIDGE_SYNC_ERROR', error);
            setLoadError(`Knowledge atlas unavailable. The ${surfaceLabel} surface could not load the graph.`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        document.body.classList.add('bridge-active');
        return () => document.body.classList.remove('bridge-active');
    }, []);

    useEffect(() => {
        loadKnowledge();

        const engine = (window as any).nudimmudEngine;
        if (!engine) return;

        const unsubscribe = engine.subscribe((data: { obsidian?: { activeFile?: string } }) => {
            if (data.obsidian?.activeFile) {
                setActiveFile(data.obsidian.activeFile);
            }
        });

        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedNode) return;

        const loadDetail = async () => {
            setFetchingDetail(true);
            setSelectedNodeContent('Accessing knowledge sector...');
            try {
                const host = window.location.hostname;
                const res = await apiFetch(`http://${host}:3004/api/knowledge/detail?path=${encodeURIComponent(selectedNode.source_path)}`);
                const data = await res.json();
                setSelectedNodeContent(String(data.content || 'Sector empty.'));
            } catch {
                setSelectedNodeContent('Link error.');
            } finally {
                setFetchingDetail(false);
            }
        };

        void loadDetail();
    }, [selectedNode]);

    const domains = useMemo(() => {
        const counts = new Map<string, number>();
        nodes.forEach((node) => counts.set(node.domain, (counts.get(node.domain) || 0) + 1));
        return ['ALL', ...Array.from(counts.keys()).sort((a, b) => a.localeCompare(b))];
    }, [nodes]);

    const groupedNodes = useMemo(() => {
        const filtered = selectedDomain === 'ALL'
            ? nodes
            : nodes.filter((node) => node.domain === selectedDomain);

        const groups = new Map<string, KnowledgeNode[]>();
        filtered.forEach((node) => {
            const key = node.domain || 'GENERAL';
            (groups.get(key) || groups.set(key, []).get(key)!).push(node);
        });
        return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [nodes, selectedDomain]);

    const relatedNodes = useMemo(() => {
        if (!selectedNode) return [];

        const idSet = new Set<number>();
        links.forEach((link) => {
            if (link.source === selectedNode.id) idSet.add(link.target);
            if (link.target === selectedNode.id) idSet.add(link.source);
        });

        return nodes.filter((node) => idSet.has(node.id)).slice(0, 8);
    }, [links, nodes, selectedNode]);

    const stats = [
        { label: 'NODES', value: nodes.length, tone: 'var(--gold-solar)' },
        { label: 'LINKS', value: links.length, tone: 'var(--cyan-glow)' },
        { label: 'FILTER', value: selectedDomain, tone: 'var(--gold-solar)' },
        { label: 'ACTIVE', value: activeFile ? 'YES' : 'NO', tone: activeFile ? 'var(--gold-solar)' : 'rgba(255,255,255,0.45)' }
    ];

    const openSelectedNode = () => {
        if (!selectedNode) return;
        (window as any).nudimmudEngine?.openNote(selectedNode.source_path);
    };

    return (
        <div style={{ display: 'grid', gap: '18px', minHeight: '100%' }}>
            <header className="neural-glass" style={{ padding: '24px 28px', display: 'flex', justifyContent: 'space-between', gap: '24px', alignItems: 'flex-end' }}>
                <div style={{ maxWidth: '760px' }}>
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--gold-solar)', letterSpacing: '0.34em', marginBottom: '10px' }}>
                        {surfaceLabel} // knowledge atlas
                    </div>
                    <h2 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.4rem)', fontWeight: 800, letterSpacing: '-0.05em' }}>
                        Atlas
                    </h2>
                    <p style={{ margin: '10px 0 0', maxWidth: '64ch', lineHeight: 1.6, color: 'rgba(255,255,255,0.68)' }}>
                        The 3D graph is gone. The same knowledge now lands in a fast atlas with filters, direct search, and an inspector that does not choke the shell.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', minWidth: '300px' }}>
                    {stats.map((item) => (
                        <div key={item.label} className="neural-glass" style={{ padding: '10px 12px', borderRadius: '4px' }}>
                            <div className="text-mono" style={{ fontSize: '0.45rem', letterSpacing: '0.18em', opacity: 0.35, marginBottom: '6px' }}>
                                {item.label}
                            </div>
                            <div className="text-mono" style={{ fontSize: '0.72rem', fontWeight: 700, color: item.tone }}>
                                {item.value}
                            </div>
                        </div>
                    ))}
                </div>
            </header>

            <section style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {domains.map((domain) => (
                    <button
                        key={domain}
                        type="button"
                        className="text-mono"
                        onClick={() => setSelectedDomain(domain)}
                        style={{
                            border: `1px solid ${selectedDomain === domain ? 'rgba(118, 185, 0, 0.35)' : 'rgba(255,255,255,0.08)'}`,
                            background: selectedDomain === domain ? 'rgba(118, 185, 0, 0.08)' : 'rgba(255,255,255,0.02)',
                            color: selectedDomain === domain ? 'var(--gold-solar)' : 'rgba(255,255,255,0.68)',
                            borderRadius: '4px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            letterSpacing: '0.14em',
                            fontSize: '0.54rem'
                        }}
                    >
                        {domain}
                    </button>
                ))}
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(360px, 0.8fr)', gap: '16px', alignItems: 'start' }}>
                <div className="neural-glass" style={{ padding: '22px', display: 'grid', gap: '16px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, marginBottom: '4px', letterSpacing: '0.18em' }}>Knowledge stream</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>Domain rows and direct note access</div>
                        </div>
                        <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.45, letterSpacing: '0.16em' }}>
                            {loading ? 'Syncing' : 'Ready'}
                        </div>
                    </div>

                    {loadError ? (
                        <div className="neural-glass" style={{ padding: '18px 20px', borderLeft: '3px solid var(--red-fusion)' }}>
                            <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--red-fusion)', letterSpacing: '0.2em', marginBottom: '8px' }}>Load failed</div>
                            <div style={{ lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>{loadError}</div>
                            <button
                                type="button"
                                className="text-mono"
                                onClick={loadKnowledge}
                                style={{
                                    marginTop: '14px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    color: 'white',
                                    padding: '9px 12px',
                                    cursor: 'pointer',
                                    letterSpacing: '0.14em'
                                }}
                            >
                                Retry load
                            </button>
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="text-mono" style={{ opacity: 0.38, letterSpacing: '0.16em', padding: '20px 0' }}>
                            Accessing knowledge atlas...
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '14px' }}>
                            {groupedNodes.map(([domain, domainNodes]) => (
                                <div key={domain} style={{ display: 'grid', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                                        <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.45, letterSpacing: '0.2em' }}>
                                            {domain}
                                        </div>
                                        <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.18em' }}>
                                            {domainNodes.length} nodes
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        {domainNodes.slice(0, 12).map((node) => {
                                            const isSelected = selectedNode?.id === node.id;
                                            const isActive = node.source_path === activeFile;
                                            return (
                                                <button
                                                    key={node.id}
                                                    type="button"
                                                    onClick={() => setSelectedNode(node)}
                                                    className="neural-glass"
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '12px 14px',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        borderLeft: `3px solid ${isSelected ? 'var(--gold-solar)' : isActive ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.08)'}`,
                                                        background: isSelected ? 'rgba(118, 185, 0, 0.08)' : 'rgba(255,255,255,0.02)',
                                                        display: 'grid',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
                                                        <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{node.title}</div>
                                                        <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.4, letterSpacing: '0.16em' }}>
                                                            {isSelected ? 'Selected' : isActive ? 'Active file' : 'Node'}
                                                        </div>
                                                    </div>
                                                    <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.45, letterSpacing: '0.14em' }}>
                                                        {node.source_path}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <aside className="neural-glass" style={{ padding: '22px', display: 'grid', gap: '16px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, marginBottom: '4px', letterSpacing: '0.18em' }}>Node inspector</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                                {selectedNode ? selectedNode.title : 'Select a node'}
                            </div>
                        </div>
                        {selectedNode && (
                            <button
                                type="button"
                                onClick={openSelectedNode}
                                className="text-mono"
                                style={{
                                    cursor: 'pointer',
                                    fontSize: '0.55rem',
                                    color: 'var(--gold-solar)',
                                    border: '1px solid rgba(118, 185, 0, 0.35)',
                                    padding: '6px 10px',
                                    borderRadius: '4px',
                                    background: 'rgba(118,185,0,0.06)'
                                }}
                            >
                                Open in vault
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'grid', gap: '8px' }}>
                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em' }}>DETAILS</div>
                        <div className="neural-glass" style={{ padding: '14px', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.45, letterSpacing: '0.16em' }}>
                                    {selectedNode ? selectedNode.domain : 'No selection'}
                                </div>
                                <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.45, letterSpacing: '0.16em' }}>
                                    {fetchingDetail ? 'LOADING' : 'STABLE'}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.72rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.8)' }}>
                                {selectedNodeContent || 'Pick a node to inspect its content.'}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '8px' }}>
                            <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em' }}>Related</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {relatedNodes.length > 0 ? relatedNodes.map((node) => (
                                <button
                                    key={node.id}
                                    type="button"
                                    onClick={() => setSelectedNode(node)}
                                    className="text-mono"
                                    style={{
                                        cursor: 'pointer',
                                        padding: '6px 10px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(118,185,0,0.28)',
                                        background: 'rgba(118,185,0,0.05)',
                                        color: 'var(--gold-solar)',
                                        fontSize: '0.5rem',
                                        letterSpacing: '0.12em'
                                    }}
                                >
                                    {node.title}
                                </button>
                            )) : (
                                <div className="text-mono" style={{ fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.16em' }}>
                                    No related nodes.
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '6px' }}>
                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.18em' }}>Active file</div>
                        <div className="neural-glass" style={{ padding: '12px', borderRadius: '4px' }}>
                            <div style={{ fontSize: '0.7rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.8)' }}>
                                {activeFile || 'No active file'}
                            </div>
                        </div>
                    </div>
                </aside>
            </section>

            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="text-mono"
                        style={{ fontSize: '0.45rem', opacity: 0.4, letterSpacing: '0.18em' }}
                    >
                        {selectedNode.source_path}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Bridge;
