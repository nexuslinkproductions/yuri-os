import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

interface VaultNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    mtime?: string;
}

interface PhysisVaultProps {
    surfaceLabel?: string;
    initialPath?: string;
}

const PhysisVault: React.FC<PhysisVaultProps> = ({ surfaceLabel = 'Physis', initialPath = '' }) => {
    const [path, setPath] = useState<string>(initialPath);
    const [nodes, setNodes] = useState<VaultNode[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [filter, setFilter] = useState<string>('');

    const bookmarks = [
        { name: 'ROOT', path: '' },
        { name: 'BACKEND', path: 'backend' },
        { name: 'SRC', path: 'src' },
        { name: 'PROJECTS', path: '01_PROJECTS' },
        { name: 'KNOWLEDGE', path: '06_KNOWLEDGE-BASE' },
        { name: 'SYSTEM', path: '_SYSTEM' },
        { name: 'NETWORK', path: '06_NETWORK-SYNC' }
    ];

    const fetchNodes = async () => {
        setLoading(true);
        try {
            setLoadError(null);
            const host = window.location.hostname;
            const res = await apiFetch(`http://${host}:3004/api/files/ls?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            setNodes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('⬡ VAULT_FETCH_ERROR:', err);
            setLoadError('Explorer index unavailable. The file browser could not load nodes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNodes();

        if ((window as any).nudimmudEngine) {
            return (window as any).nudimmudEngine.subscribe((data: { obsidian?: { activeFile: string }, vault_updated?: boolean }) => {
                if (data.obsidian?.activeFile) setActiveFile(data.obsidian.activeFile);
                if (data.vault_updated) fetchNodes();
            });
        }
    }, [path]);

    const filteredNodes = useMemo(() => {
        return nodes.filter((node) => node.name.toLowerCase().includes(filter.toLowerCase()));
    }, [nodes, filter]);

    const formatSize = (bytes?: number) => {
        if (!bytes) return '---';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size > 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)}${units[unitIndex]}`;
    };

    const navigate = (newPath: string) => {
        setPath(newPath);
        setFilter('');
    };

    const breadcrumbs = path.split('/').filter(Boolean);

    return (
        <div
            className="physis-container"
            style={{
                height: '100%',
                display: 'flex',
                background: 'linear-gradient(180deg, rgba(4, 6, 10, 0.98), rgba(9, 12, 20, 0.98))',
                color: '#e2e8f0',
                overflow: 'hidden'
            }}
        >
            <aside
                style={{
                    width: '220px',
                    minWidth: '220px',
                    background: 'rgba(10,15,25,0.78)',
                    backdropFilter: 'blur(24px)',
                    padding: '28px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                    borderRight: '1px solid rgba(255,255,255,0.06)'
                }}
            >
                <div>
                    <div className="text-mono" style={{ fontSize: '0.58rem', opacity: 0.35, letterSpacing: '0.24em' }}>
                        Browse
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '1.45rem', fontWeight: 900, lineHeight: 1.05 }}>
                        {surfaceLabel}
                    </div>
                    <div className="text-mono" style={{ marginTop: '8px', fontSize: '0.62rem', lineHeight: 1.5, opacity: 0.48 }}>
                        Browse notes and folders here. Sync and connection debugging lives in Vault Link Debugger.
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {bookmarks.map((bookmark) => (
                        <button
                            key={bookmark.name}
                            type="button"
                            onClick={() => navigate(bookmark.path)}
                            className="text-mono"
                            style={{
                                background: path === bookmark.path ? 'rgba(0,242,255,0.14)' : 'rgba(255,255,255,0.02)',
                                color: path === bookmark.path ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.72)',
                                border: '1px solid',
                                borderColor: path === bookmark.path ? 'rgba(0,242,255,0.25)' : 'rgba(255,255,255,0.06)',
                                padding: '10px 12px',
                                textAlign: 'left',
                                fontSize: '0.66rem',
                                cursor: 'pointer',
                                borderRadius: '10px',
                                transition: 'all 0.2s ease',
                                fontWeight: path === bookmark.path ? 800 : 500,
                                letterSpacing: '0.14em'
                            }}
                        >
                            {bookmark.name}
                        </button>
                    ))}
                </div>

                <div className="neural-glass" style={{ padding: '14px', marginTop: 'auto', borderLeft: '2px solid var(--cyan-glow)' }}>
                    <div className="text-mono" style={{ fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.2em', marginBottom: '8px' }}>
                        Active file
                    </div>
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.82)', wordBreak: 'break-word' }}>
                        {activeFile ? activeFile : 'No active note selected'}
                    </div>
                </div>
            </aside>

            <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <header
                    style={{
                        padding: '26px 34px',
                        background: 'rgba(255,255,255,0.02)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        display: 'grid',
                        gap: '18px'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
                        <div>
                            <div className="text-mono" style={{ fontSize: '0.58rem', opacity: 0.35, letterSpacing: '0.34em', marginBottom: '10px' }}>
                                File explorer
                            </div>
                            <h2 style={{ margin: 0, color: 'white', letterSpacing: '-0.04em', fontSize: 'clamp(1.7rem, 2.4vw, 2.4rem)' }}>
                                {surfaceLabel} // explorer
                            </h2>
                            <div className="text-mono" style={{ marginTop: '8px', fontSize: '0.68rem', opacity: 0.45 }}>
                                Browse, search, and open content. Debugging stays in the separate sync panel.
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="text-mono"
                                onClick={() => {
                                    const host = window.location.hostname;
                                    apiFetch(`http://${host}:3004/api/knowledge/refresh`, { method: 'POST' });
                                    fetchNodes();
                                }}
                                style={{
                                    background: 'rgba(0,242,255,0.08)',
                                    border: '1px solid rgba(0,242,255,0.18)',
                                    color: 'var(--cyan-glow)',
                                    fontSize: '0.6rem',
                                    padding: '10px 14px',
                                    cursor: 'pointer',
                                    borderRadius: '10px',
                                    letterSpacing: '0.16em',
                                    fontWeight: 700
                                }}
                            >
                                Refresh index
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="Search files and folders..."
                                value={filter}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                                className="text-mono"
                                style={{
                                    width: '100%',
                                    background: 'rgba(0,0,0,0.32)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    color: 'white',
                                    padding: '12px 14px',
                                    borderRadius: '12px',
                                    fontSize: '0.72rem',
                                    outline: 'none'
                                }}
                            />
                            <div
                                className="text-mono"
                                style={{
                                    position: 'absolute',
                                    right: '14px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    opacity: 0.35,
                                    fontSize: '0.58rem',
                                    letterSpacing: '0.12em'
                                }}
                            >
                                {filteredNodes.length} nodes
                            </div>
                        </div>

                        <div className="text-mono" style={{ fontSize: '0.58rem', opacity: 0.38, letterSpacing: '0.16em', whiteSpace: 'nowrap' }}>
                            {breadcrumbs.length ? breadcrumbs.map((segment) => segment.toUpperCase()).join(' / ') : 'ROOT'}
                        </div>
                    </div>
                </header>

                <div style={{ flex: 1, padding: '28px 34px 36px', overflowY: 'auto' }} className="custom-scrollbar">
                    {loadError ? (
                        <div className="neural-glass" style={{ padding: '18px 20px', borderLeft: '3px solid var(--red-fusion)', marginBottom: '18px' }}>
                            <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--red-fusion)', letterSpacing: '0.2em', marginBottom: '8px' }}>
                                Load failed
                            </div>
                            <div style={{ lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>{loadError}</div>
                            <button
                                type="button"
                                className="text-mono"
                                onClick={fetchNodes}
                                style={{
                                    marginTop: '14px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    color: 'white',
                                    padding: '9px 12px',
                                    cursor: 'pointer',
                                    borderRadius: '10px',
                                    letterSpacing: '0.14em'
                                }}
                            >
                                Retry load
                            </button>
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="text-mono" style={{ opacity: 0.3, textAlign: 'center', paddingTop: '100px' }}>
                            Accessing explorer layers...
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '18px' }}>
                            {filteredNodes.map((node) => (
                                <motion.button
                                    key={node.path}
                                    type="button"
                                    layout
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    whileHover={{ y: -4 }}
                                    onClick={() => {
                                        if (node.isDirectory) {
                                            navigate(node.path);
                                        } else {
                                            (window as any).nudimmudEngine?.openNote(node.path);
                                        }
                                    }}
                                    className="neural-glass card-hover-effect"
                                    style={{
                                        textAlign: 'left',
                                        padding: '22px',
                                        cursor: 'pointer',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        background: 'rgba(255,255,255,0.02)',
                                        color: 'white'
                                    }}
                                >
                                    <div style={{ fontSize: '1.8rem', marginBottom: '14px', opacity: 0.9 }}>
                                        {node.isDirectory ? '📂' : '📄'}
                                    </div>
                                    <div
                                        className="text-mono"
                                        style={{
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            marginBottom: '8px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            letterSpacing: '0.08em'
                                        }}
                                    >
                                        {node.name}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }} className="text-mono">
                                        <span style={{ fontSize: '0.54rem', opacity: 0.32 }}>{node.isDirectory ? 'LAYER' : 'NODE'}</span>
                                        <span style={{ fontSize: '0.54rem', opacity: 0.5 }}>{formatSize(node.size)}</span>
                                    </div>
                                    <div
                                        className="text-mono"
                                        style={{
                                            marginTop: '12px',
                                            fontSize: '0.52rem',
                                            opacity: 0.3,
                                            lineHeight: 1.4,
                                            wordBreak: 'break-word'
                                        }}
                                    >
                                        {node.path || 'root'}
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    )}

                    {!loading && !loadError && filteredNodes.length === 0 ? (
                        <div className="text-mono" style={{ opacity: 0.35, padding: '48px 0', textAlign: 'center' }}>
                            No matches found.
                        </div>
                    ) : null}
                </div>
            </main>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--cyan-glow); }

                .neural-glass {
                    backdrop-filter: blur(20px);
                    background: rgba(17, 25, 40, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .card-hover-effect {
                    transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .card-hover-effect:hover {
                    background: rgba(17, 25, 40, 0.7) !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 15px var(--cyan-glow)11;
                    border-color: var(--cyan-glow)44 !important;
                }
            `}</style>
        </div>
    );
};

export default PhysisVault;
