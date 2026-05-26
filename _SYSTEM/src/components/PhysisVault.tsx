import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

/* ─── Types ──────────────────────────────────────────────────────── */

interface VaultNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    mtime?: string;
}

interface Shelf {
    name: string;
    path: string;
    color: string;
    icon: string;
    description: string;
}

interface PhysisVaultProps {
    surfaceLabel?: string;
    initialPath?: string;
}

/* ─── Const ──────────────────────────────────────────────────────── */

const FILE_TYPE_COLORS: Record<string, string> = {
    folder: 'var(--cyan-glow)',
    md:     'var(--gold-solar)',
    ts:     '#3178c6',
    tsx:    '#3178c6',
    js:     '#f7df1e',
    jsx:    '#f7df1e',
    json:   '#8bc34a',
    css:    '#42a5f5',
    html:   '#e44d26',
    yaml:   '#cb171e',
    yml:    '#cb171e',
    png:    '#e91e63',
    jpg:    '#e91e63',
    jpeg:   '#e91e63',
    svg:    '#ffb300',
    gif:    '#ab47bc',
    pdf:    '#f44336',
    zip:    '#78909c',
    tar:    '#78909c',
    gz:     '#78909c',
    py:     '#3776ab',
    go:     '#00add8',
    rs:     '#dea584',
};

const FOLDER_BOOKMARKS: Shelf[] = [
    { name: 'ROOT',       path: '',                             color: '#76b900', icon: '⬡', description: 'Vault root directory' },
    { name: 'BACKEND',    path: 'backend',                      color: '#42a5f5', icon: '◈', description: 'Backend server code' },
    { name: 'SRC',        path: 'src',                          color: '#3178c6', icon: '⊞', description: 'Frontend source' },
    { name: 'PROJECTS',   path: '01_PROJECTS',                  color: '#ffb300', icon: '◆', description: 'Active client projects' },
    { name: 'RESOURCES',  path: '02_RESOURCES',                 color: '#8bc34a', icon: '◎', description: 'Research & knowledge base' },
    { name: 'NEXUS',      path: '03_NEXUS-LINK',                color: '#ab47bc', icon: '⊡', description: 'Nexus Link identity assets' },
    { name: 'SYSTEM',     path: '_SYSTEM',                      color: '#e44d26', icon: '⎔', description: 'Agentic OS kernel' },
];

/* ─── Helpers ────────────────────────────────────────────────────── */

function getFileType(name: string): string {
    if (!name.includes('.')) return 'folder';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return FILE_TYPE_COLORS[ext] ? ext : 'file';
}

function getTypeColor(name: string): string {
    const type = getFileType(name);
    return type === 'folder'
        ? 'var(--cyan-glow)'
        : FILE_TYPE_COLORS[type] || 'rgba(255,255,255,0.5)';
}

function getTypeLabel(name: string): string {
    const type = getFileType(name);
    return type === 'folder' ? 'LAYER' : type === 'file' ? 'NODE' : type.toUpperCase();
}

function formatSize(bytes?: number): string {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let u = 0;
    while (size >= 1024 && u < units.length - 1) { size /= 1024; u++; }
    return `${size.toFixed(size >= 100 ? 0 : 1)}${units[u]}`;
}

function formatMtime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'moments ago';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getFilterType(filter: string): 'all' | 'folders' | 'files' | string {
    const f = filter.trim().toLowerCase();
    if (f === 'type:folders' || f === 'type:folder' || f === 'folders' || f === 'dirs') return 'folders';
    if (f === 'type:files' || f === 'type:file' || f === 'files') return 'files';
    if (f.startsWith('ext:')) return f.replace('ext:', '').trim();
    return 'all';
}

/* ─── Motion Variants ────────────────────────────────────────────── */

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.035, delayChildren: 0.08 } },
};

const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
};

const shelfVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i: number) => ({
        opacity: 1, x: 0,
        transition: { delay: i * 0.06, type: 'spring' as const, stiffness: 200, damping: 24 },
    }),
};

const slidePanel = {
    hidden: { opacity: 0, x: 80 },
    visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 200, damping: 26 } },
    exit: { opacity: 0, x: 80, transition: { duration: 0.2 } },
};

/* ─── Breadcrumb Item ────────────────────────────────────────────── */

interface BreadcrumbSegment {
    label: string;
    path: string;
    isLast: boolean;
}

/* ─── Component ──────────────────────────────────────────────────── */

const PhysisVault: React.FC<PhysisVaultProps> = ({ surfaceLabel = 'Physis', initialPath = '' }) => {
    const [path, setPath] = useState<string>(initialPath);
    const [nodes, setNodes] = useState<VaultNode[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [filter, setFilter] = useState<string>('');

    /* detail panel */
    const [selectedFile, setSelectedFile] = useState<VaultNode | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState<boolean>(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    /* view toggle */
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const detailPanelRef = useRef<HTMLDivElement>(null);

    /* ── fetch nodes ────────────────────────────────────────────── */

    const fetchNodes = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const host = window.location.hostname;
            const res = await apiFetch(`http://${host}:3004/api/files/ls?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            setNodes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('⬡ VAULT_FETCH_ERROR:', err);
            setLoadError('Vault unreachable — check the backend connection.');
        } finally {
            setLoading(false);
        }
    }, [path]);

    useEffect(() => {
        fetchNodes();
        if ((window as any).yuriEngine) {
            return (window as any).yuriEngine.subscribe((data: { obsidian?: { activeFile: string }; vault_updated?: boolean }) => {
                if (data.obsidian?.activeFile) setActiveFile(data.obsidian.activeFile);
                if (data.vault_updated) fetchNodes();
            });
        }
    }, [path, fetchNodes]);

    /* ── fetch file preview ──────────────────────────────────────── */

    const fetchFilePreview = useCallback(async (node: VaultNode) => {
        if (!node.isDirectory) {
            setSelectedFile(node);
            setFilePreview(null);
            setPreviewError(null);
            setPreviewLoading(true);
            try {
                const host = window.location.hostname;
                const res = await apiFetch(`http://${host}:3004/api/vault/read?path=${encodeURIComponent(node.path)}`);
                const text = await res.text();
                setFilePreview(text.slice(0, 500));
            } catch {
                setPreviewError('Could not load preview');
            } finally {
                setPreviewLoading(false);
            }
        }
    }, []);

    /* ── navigation ──────────────────────────────────────────────── */

    const navigate = useCallback((newPath: string) => {
        setPath(newPath);
        setFilter('');
        setSelectedFile(null);
        setFilePreview(null);
    }, []);

    /* ── breadcrumbs ─────────────────────────────────────────────── */

    const breadcrumbs: BreadcrumbSegment[] = useMemo(() => {
        const segments = path.split('/').filter(Boolean);
        const crumbPath: BreadcrumbSegment[] = [
            { label: 'ROOT', path: '', isLast: segments.length === 0 },
        ];
        segments.forEach((seg, i) => {
            const acc = segments.slice(0, i + 1).join('/');
            crumbPath.push({ label: seg, path: acc, isLast: i === segments.length - 1 });
        });
        return crumbPath;
    }, [path]);

    /* ── filtering ────────────────────────────────────────────────── */

    const filterType = useMemo(() => getFilterType(filter), [filter]);
    const filterText = useMemo(() => {
        const f = filter.trim().toLowerCase();
        if (f.startsWith('type:') || f.startsWith('ext:')) return '';
        return f;
    }, [filter]);

    const filteredNodes = useMemo(() => {
        return nodes.filter((node) => {
            const name = node.name.toLowerCase();

            /* type filter */
            if (filterType === 'folders' && !node.isDirectory) return false;
            if (filterType === 'files' && node.isDirectory) return false;
            if (filterType !== 'all' && filterType !== 'folders' && filterType !== 'files') {
                const ext = node.name.split('.').pop()?.toLowerCase() || '';
                if (ext !== filterType) return false;
            }

            /* text filter */
            if (filterText && !name.includes(filterText)) return false;
            return true;
        });
    }, [nodes, filter, filterType, filterText]);

    /* ── highlight matching text ──────────────────────────────────── */

    const highlightMatch = useCallback((text: string): React.ReactNode => {
        if (!filterText) return text;
        const lower = text.toLowerCase();
        const idx = lower.indexOf(filterText);
        if (idx === -1) return text;
        return (
            <>
                {text.slice(0, idx)}
                <span style={{ background: 'rgba(118, 185, 0, 0.25)', color: 'var(--gold-solar)', borderRadius: 2, padding: '0 2px' }}>
                    {text.slice(idx, idx + filterText.length)}
                </span>
                {text.slice(idx + filterText.length)}
            </>
        );
    }, [filterText]);

    /* ── auto-close detail on navigation ──────────────────────────── */

    const closeDetail = useCallback(() => {
        setSelectedFile(null);
        setFilePreview(null);
        setPreviewError(null);
    }, []);

    /* ── click node ────────────────────────────────────────────────── */

    const handleNodeClick = useCallback((node: VaultNode) => {
        if (node.isDirectory) {
            navigate(node.path);
        } else {
            fetchFilePreview(node);
        }
    }, [navigate, fetchFilePreview]);

    /* ── open file externally ──────────────────────────────────────── */

    const openExternally = useCallback((path: string) => {
        (window as any).yuriEngine?.openNote(path);
    }, []);

    /* ── render ────────────────────────────────────────────────────── */

    const renderSkeleton = () => (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '16px',
        }}>
            {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                    key={`skel-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.08 }}
                    style={{
                        height: i < 4 ? 150 : 120,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.04)',
                    }}
                />
            ))}
        </div>
    );

    const renderEmptyState = (message: string, icon: string) => (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '80px 32px',
                gap: '18px',
                textAlign: 'center',
            }}
        >
            <div style={{ fontSize: '2.8rem', opacity: 0.18, fontFamily: 'var(--font-body)' }}>{icon}</div>
            <div className="text-mono" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', maxWidth: 360, lineHeight: 1.6 }}>
                {message}
            </div>
        </motion.div>
    );

    const renderErrorState = () => (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="neural-glass"
            style={{
                padding: '28px 24px',
                borderRadius: 14,
                borderLeft: '3px solid var(--red-fusion)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                alignItems: 'flex-start',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.2rem', opacity: 0.6 }}>⚠</span>
                <span className="text-mono" style={{ fontSize: '0.7rem', color: 'var(--red-fusion)', letterSpacing: '0.15em', fontWeight: 700 }}>
                    VAULT DISCONNECTED
                </span>
            </div>
            <div style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>{loadError}</div>
            <motion.button
                type="button"
                className="text-mono"
                whileHover={{ scale: 1.03, background: 'rgba(0,242,255,0.12)' }}
                whileTap={{ scale: 0.97 }}
                onClick={fetchNodes}
                style={{
                    marginTop: 6,
                    background: 'rgba(0,242,255,0.07)',
                    border: '1px solid rgba(0,242,255,0.18)',
                    color: 'var(--cyan-glow)',
                    padding: '10px 18px',
                    cursor: 'pointer',
                    borderRadius: 10,
                    letterSpacing: '0.12em',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                }}
            >
                Retry connection
            </motion.button>
        </motion.div>
    );

    const renderNoResults = () => (
        renderEmptyState('No matches in this collection — try a different search or clear the filter.', '◈')
    );

    return (
        <div
            className="physis-container"
            style={{
                height: '100%',
                display: 'flex',
                background: 'linear-gradient(180deg, rgba(4, 6, 10, 0.98), rgba(9, 12, 20, 0.98))',
                color: '#e2e8f0',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            {/* ── LEFT SIDEBAR: Shelves ──────────────────────────────── */}
            <motion.aside
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                style={{
                    width: 240,
                    minWidth: 240,
                    background: 'rgba(10, 15, 25, 0.78)',
                    backdropFilter: 'blur(24px)',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                }}
            >
                {/* brand header */}
                <div style={{ padding: '24px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3, letterSpacing: '0.24em' }}>
                        LIBRARY SYSTEM
                    </div>
                    <div style={{ marginTop: 6, fontSize: '1.4rem', fontWeight: 900, lineHeight: 1.0, color: 'white' }}>
                        {surfaceLabel}
                    </div>
                </div>

                {/* shelves */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }} className="custom-scrollbar">
                    {FOLDER_BOOKMARKS.map((shelf, i) => {
                        const active = path === shelf.path;
                        return (
                            <motion.button
                                key={shelf.name}
                                type="button"
                                custom={i}
                                variants={shelfVariants}
                                initial="hidden"
                                animate="visible"
                                whileHover={{ x: 4 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => navigate(shelf.path)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '12px 14px',
                                    borderRadius: 12,
                                    border: '1px solid',
                                    borderColor: active ? `${shelf.color}44` : 'rgba(255,255,255,0.04)',
                                    background: active ? `${shelf.color}0d` : 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%',
                                    transition: 'border-color 0.2s, background 0.2s',
                                }}
                            >
                                <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    background: active ? `${shelf.color}18` : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${active ? `${shelf.color}33` : 'rgba(255,255,255,0.05)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1rem',
                                    color: shelf.color,
                                    flexShrink: 0,
                                }}>
                                    {shelf.icon}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="text-mono" style={{
                                        fontSize: '0.7rem',
                                        fontWeight: active ? 800 : 600,
                                        color: active ? shelf.color : 'rgba(255,255,255,0.8)',
                                        letterSpacing: '0.1em',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {shelf.name}
                                    </div>
                                    <div className="text-mono" style={{
                                        fontSize: '0.5rem',
                                        color: 'rgba(255,255,255,0.3)',
                                        marginTop: 3,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {shelf.description}
                                    </div>
                                </div>
                                {active && (
                                    <motion.div
                                        layoutId="shelf-indicator"
                                        style={{
                                            width: 3,
                                            height: 20,
                                            borderRadius: 2,
                                            background: shelf.color,
                                            flexShrink: 0,
                                        }}
                                    />
                                )}
                            </motion.button>
                        );
                    })}
                </div>

                {/* active file */}
                <div style={{
                    padding: '12px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(0,0,0,0.15)',
                }}>
                    <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, letterSpacing: '0.2em', marginBottom: 6 }}>
                        ACTIVE FILE
                    </div>
                    <motion.div
                        key={activeFile || 'none'}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-mono"
                        style={{
                            fontSize: '0.65rem',
                            lineHeight: 1.5,
                            color: 'rgba(255,255,255,0.7)',
                            wordBreak: 'break-word',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {activeFile || (
                            <span style={{ opacity: 0.35, fontStyle: 'italic' }}>
                                No active note selected
                            </span>
                        )}
                    </motion.div>
                </div>
            </motion.aside>

            {/* ── MAIN AREA ────────────────────────────────────────── */}
            <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>

                {/* top bar */}
                <motion.header
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    style={{
                        padding: '18px 28px',
                        background: 'rgba(255,255,255,0.015)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                    }}
                >
                    {/* search */}
                    <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                        <input
                            type="text"
                            placeholder="Search files... (type:folders, ext:tsx)"
                            value={filter}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                            className="text-mono"
                            style={{
                                width: '100%',
                                background: 'rgba(0,0,0,0.35)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                color: 'white',
                                padding: '10px 36px 10px 14px',
                                borderRadius: 10,
                                fontSize: '0.68rem',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                                letterSpacing: '0.04em',
                            }}
                            onFocus={(e) => { e.target.style.borderColor = 'rgba(118,185,0,0.3)'; }}
                            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                        />
                        <span style={{
                            position: 'absolute',
                            right: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '0.5rem',
                            opacity: 0.25,
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.1em',
                            pointerEvents: 'none',
                        }}>
                            {filteredNodes.length}
                        </span>
                        {filter && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                type="button"
                                onClick={() => setFilter('')}
                                style={{
                                    position: 'absolute',
                                    right: 32,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.3)',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    padding: '2px',
                                }}
                            >
                                ✕
                            </motion.button>
                        )}
                    </div>

                    {/* breadcrumb nav */}
                    <nav style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        overflow: 'hidden',
                        flex: 1,
                        justifyContent: 'center',
                    }}>
                        <AnimatePresence mode="popLayout">
                            {breadcrumbs.map((crumb) => (
                                <motion.div
                                    key={crumb.path}
                                    layout
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 8 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                                >
                                    {!crumb.isLast ? (
                                        <button
                                            type="button"
                                            onClick={() => navigate(crumb.path)}
                                            className="text-mono"
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'rgba(255,255,255,0.4)',
                                                cursor: 'pointer',
                                                fontSize: '0.6rem',
                                                letterSpacing: '0.08em',
                                                padding: '2px 4px',
                                                borderRadius: 4,
                                                transition: 'color 0.15s, background 0.15s',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold-solar)'; e.currentTarget.style.background = 'rgba(118,185,0,0.06)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'none'; }}
                                        >
                                            {crumb.label}
                                        </button>
                                    ) : (
                                        <span className="text-mono" style={{
                                            fontSize: '0.6rem',
                                            letterSpacing: '0.08em',
                                            color: 'rgba(255,255,255,0.75)',
                                            fontWeight: 700,
                                        }}>
                                            {crumb.label}
                                        </span>
                                    )}
                                    {!crumb.isLast && (
                                        <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.55rem' }}>/</span>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </nav>

                    {/* view toggle + actions */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                            display: 'flex',
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                        }}>
                            {(['grid', 'list'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setViewMode(mode)}
                                    className="text-mono"
                                    style={{
                                        padding: '7px 10px',
                                        background: viewMode === mode ? 'rgba(118,185,0,0.12)' : 'transparent',
                                        border: 'none',
                                        color: viewMode === mode ? 'var(--gold-solar)' : 'rgba(255,255,255,0.35)',
                                        cursor: 'pointer',
                                        fontSize: '0.6rem',
                                        letterSpacing: '0.1em',
                                        fontWeight: viewMode === mode ? 800 : 500,
                                        transition: 'background 0.15s, color 0.15s',
                                    }}
                                >
                                    {mode === 'grid' ? '⊞' : '≡'}
                                </button>
                            ))}
                        </div>
                        <motion.button
                            type="button"
                            className="text-mono"
                            whileHover={{ background: 'rgba(0,242,255,0.1)' }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                const host = window.location.hostname;
                                apiFetch(`http://${host}:3004/api/knowledge/refresh`, { method: 'POST' });
                                fetchNodes();
                            }}
                            style={{
                                background: 'rgba(0,242,255,0.06)',
                                border: '1px solid rgba(0,242,255,0.12)',
                                color: 'var(--cyan-glow)',
                                fontSize: '0.55rem',
                                padding: '7px 12px',
                                cursor: 'pointer',
                                borderRadius: 8,
                                letterSpacing: '0.12em',
                                fontWeight: 700,
                            }}
                        >
                            ↻ sync
                        </motion.button>
                    </div>
                </motion.header>

                {/* content area */}
                <div style={{ flex: 1, padding: '24px 28px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="custom-scrollbar">

                    {/* status bar above content */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 18,
                            paddingBottom: 12,
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                    >
                        <div className="text-mono" style={{ display: 'flex', gap: 18, fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.12em' }}>
                            <span>{filteredNodes.length} item{filteredNodes.length !== 1 ? 's' : ''}</span>
                            {selectedFile && (
                                <span style={{ color: 'var(--gold-solar)', opacity: 0.7 }}>
                                    Selected: {selectedFile.name}
                                </span>
                            )}
                        </div>
                        {filter && (
                            <div className="text-mono" style={{ fontSize: '0.5rem', color: 'var(--gold-solar)', opacity: 0.6, letterSpacing: '0.1em' }}>
                                filtered
                            </div>
                        )}
                    </motion.div>

                    {/* main content switch */}
                    {loadError ? (
                        renderErrorState()
                    ) : loading ? (
                        renderSkeleton()
                    ) : filteredNodes.length === 0 && !filter ? (
                        path === ''
                            ? renderEmptyState('This collection is empty — add content to populate it.', '⬡')
                            : renderEmptyState('This collection is empty — add content to populate it.', '⬡')
                    ) : filteredNodes.length === 0 ? (
                        renderNoResults()
                    ) : (
                        <AnimatePresence mode="wait">
                            {viewMode === 'grid' ? (
                                <motion.div
                                    key="grid-view"
                                    variants={containerVariants}
                                    initial="hidden"
                                    animate="visible"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                                        gap: 14,
                                    }}
                                >
                                    {filteredNodes.map((node) => {
                                        const typeColor = getTypeColor(node.name);
                                        const isSelected = selectedFile?.path === node.path;
                                        return (
                                            <motion.button
                                                key={node.path}
                                                type="button"
                                                variants={cardVariants}
                                                layout
                                                whileHover={{ y: -6, scale: 1.02 }}
                                                whileTap={{ scale: 0.97 }}
                                                onClick={() => handleNodeClick(node)}
                                                className="neural-glass"
                                                style={{
                                                    textAlign: 'left',
                                                    padding: node.isDirectory ? '22px 18px 18px' : '14px 14px 12px',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                    borderRadius: 12,
                                                    border: `1px solid ${isSelected ? `${typeColor}55` : 'rgba(255,255,255,0.05)'}`,
                                                    background: isSelected
                                                        ? `${typeColor}0a`
                                                        : 'rgba(255,255,255,0.015)',
                                                    color: 'white',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    transition: 'border-color 0.2s, background 0.2s',
                                                    minHeight: node.isDirectory ? 140 : 100,
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = `${typeColor}33`;
                                                        e.currentTarget.style.boxShadow = `0 0 20px ${typeColor}0d`;
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    }
                                                }}
                                            >
                                                {/* type indicator line */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    right: 0,
                                                    height: 2,
                                                    background: `linear-gradient(90deg, ${typeColor}, transparent 80%)`,
                                                    opacity: 0.6,
                                                }} />

                                                {/* icon */}
                                                <div style={{
                                                    fontSize: node.isDirectory ? '1.5rem' : '1.1rem',
                                                    marginBottom: node.isDirectory ? 12 : 8,
                                                    opacity: 0.7,
                                                    color: typeColor,
                                                }}>
                                                    {node.isDirectory ? '◈' : '⊡'}
                                                </div>

                                                {/* name */}
                                                <div
                                                    className="text-mono"
                                                    style={{
                                                        fontSize: node.isDirectory ? '0.75rem' : '0.65rem',
                                                        fontWeight: node.isDirectory ? 800 : 600,
                                                        letterSpacing: '0.06em',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        marginBottom: 4,
                                                    }}
                                                    title={node.name}
                                                >
                                                    {highlightMatch(node.name)}
                                                </div>

                                                {/* bottom metadata row */}
                                                <div style={{
                                                    marginTop: 'auto',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'flex-end',
                                                }}>
                                                    <span className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.25 }}>
                                                        {getTypeLabel(node.name)}
                                                    </span>
                                                    <span className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.4 }}>
                                                        {node.isDirectory ? '' : formatSize(node.size)}
                                                    </span>
                                                </div>

                                                {/* mtime */}
                                                {node.mtime && (
                                                    <div className="text-mono" style={{
                                                        fontSize: '0.45rem',
                                                        opacity: 0.2,
                                                        marginTop: 4,
                                                    }}>
                                                        {formatMtime(node.mtime)}
                                                    </div>
                                                )}
                                            </motion.button>
                                        );
                                    })}
                                </motion.div>
                            ) : (
                                /* ── LIST VIEW ── */
                                <motion.div
                                    key="list-view"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                                >
                                    {filteredNodes.map((node, i) => {
                                        const typeColor = getTypeColor(node.name);
                                        const isSelected = selectedFile?.path === node.path;
                                        return (
                                            <motion.button
                                                key={node.path}
                                                type="button"
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.02 }}
                                                whileHover={{ x: 3, background: `${typeColor}06` }}
                                                whileTap={{ scale: 0.99 }}
                                                onClick={() => handleNodeClick(node)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    padding: '8px 14px',
                                                    borderRadius: 8,
                                                    border: `1px solid ${isSelected ? `${typeColor}33` : 'transparent'}`,
                                                    background: isSelected ? `${typeColor}08` : 'transparent',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    color: 'white',
                                                    width: '100%',
                                                    transition: 'border-color 0.15s, background 0.15s',
                                                }}
                                            >
                                                {/* icon */}
                                                <div style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 6,
                                                    background: `${typeColor}12`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.75rem',
                                                    color: typeColor,
                                                    flexShrink: 0,
                                                }}>
                                                    {node.isDirectory ? '◈' : '⊡'}
                                                </div>

                                                {/* name */}
                                                <div className="text-mono" style={{
                                                    flex: 1,
                                                    fontSize: '0.62rem',
                                                    letterSpacing: '0.05em',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    fontWeight: node.isDirectory ? 700 : 500,
                                                }}>
                                                    {highlightMatch(node.name)}
                                                </div>

                                                {/* type badge */}
                                                <span className="text-mono" style={{
                                                    fontSize: '0.45rem',
                                                    color: typeColor,
                                                    opacity: 0.5,
                                                    letterSpacing: '0.08em',
                                                    flexShrink: 0,
                                                }}>
                                                    {getTypeLabel(node.name)}
                                                </span>

                                                {/* size */}
                                                {!node.isDirectory && (
                                                    <span className="text-mono" style={{
                                                        fontSize: '0.5rem',
                                                        opacity: 0.3,
                                                        minWidth: 50,
                                                        textAlign: 'right',
                                                        flexShrink: 0,
                                                    }}>
                                                        {formatSize(node.size)}
                                                    </span>
                                                )}

                                                {/* mtime */}
                                                {node.mtime && (
                                                    <span className="text-mono" style={{
                                                        fontSize: '0.48rem',
                                                        opacity: 0.25,
                                                        minWidth: 56,
                                                        textAlign: 'right',
                                                        flexShrink: 0,
                                                    }}>
                                                        {formatMtime(node.mtime)}
                                                    </span>
                                                )}
                                            </motion.button>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}

                    {/* bottom padding spacer */}
                    <div style={{ flex: 1, minHeight: 16 }} />
                </div>

                {/* bottom status bar */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    style={{
                        padding: '8px 28px',
                        background: 'rgba(0,0,0,0.25)',
                        borderTop: '1px solid rgba(255,255,255,0.03)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div className="text-mono" style={{ display: 'flex', gap: 20, fontSize: '0.48rem', opacity: 0.3, letterSpacing: '0.08em' }}>
                        <span>Items: {filteredNodes.length}/{nodes.length}</span>
                        {selectedFile && (
                            <span style={{ opacity: 0.5 }}>
                                {/* eslint-disable-next-line */}
                                {selectedFile.isDirectory ? 'Layer' : formatSize(selectedFile.size)} · {formatMtime(selectedFile.mtime) || '—'}
                            </span>
                        )}
                    </div>
                    <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.2, letterSpacing: '0.08em' }}>
                        {surfaceLabel} // LIBRARY
                    </div>
                </motion.div>
            </main>

            {/* ── DETAIL PANEL (slide-in from right) ──────────────── */}
            <AnimatePresence>
                {selectedFile && !selectedFile.isDirectory && (
                    <motion.aside
                        ref={detailPanelRef}
                        variants={slidePanel}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 360,
                            height: '100%',
                            background: 'rgba(8, 12, 22, 0.97)',
                            backdropFilter: 'blur(28px)',
                            borderLeft: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 20,
                            boxShadow: '-8px 0 30px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* header */}
                        <div style={{
                            padding: '20px 20px 14px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                        }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.3, letterSpacing: '0.2em', marginBottom: 6 }}>
                                    FILE DETAIL
                                </div>
                                <div className="text-mono" style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    color: 'white',
                                    letterSpacing: '0.04em',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {selectedFile.name}
                                </div>
                            </div>
                            <motion.button
                                type="button"
                                whileHover={{ rotate: 90 }}
                                whileTap={{ scale: 0.85 }}
                                onClick={closeDetail}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: 'rgba(255,255,255,0.5)',
                                    cursor: 'pointer',
                                    borderRadius: 8,
                                    width: 30,
                                    height: 30,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    flexShrink: 0,
                                }}
                            >
                                ✕
                            </motion.button>
                        </div>

                        {/* meta */}
                        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <MetaRow label="Type" value={getTypeLabel(selectedFile.name)} color={getTypeColor(selectedFile.name)} />
                            <MetaRow label="Size" value={formatSize(selectedFile.size) || '—'} />
                            <MetaRow label="Modified" value={formatMtime(selectedFile.mtime) || '—'} />
                            <MetaRow label="Path" value={selectedFile.path || 'root'} mono />
                        </div>

                        {/* type badge */}
                        <div style={{ padding: '0 20px', marginBottom: 14 }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: `${getTypeColor(selectedFile.name)}14`,
                                color: getTypeColor(selectedFile.name),
                                border: `1px solid ${getTypeColor(selectedFile.name)}22`,
                                fontSize: '0.55rem',
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: '0.12em',
                                fontWeight: 600,
                            }}>
                                {getFileType(selectedFile.name).toUpperCase()}
                            </span>
                        </div>

                        {/* actions */}
                        <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8 }}>
                            <motion.button
                                type="button"
                                className="text-mono"
                                whileHover={{ scale: 1.03, background: 'rgba(0,242,255,0.1)' }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => openExternally(selectedFile.path)}
                                style={{
                                    flex: 1,
                                    background: 'rgba(0,242,255,0.06)',
                                    border: '1px solid rgba(0,242,255,0.15)',
                                    color: 'var(--cyan-glow)',
                                    padding: '9px 0',
                                    cursor: 'pointer',
                                    borderRadius: 8,
                                    fontSize: '0.6rem',
                                    letterSpacing: '0.1em',
                                    fontWeight: 700,
                                }}
                            >
                                Open in editor
                            </motion.button>
                        </div>

                        {/* divider */}
                        <div style={{ padding: '0 20px' }}>
                            <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 12 }} />
                            <div className="text-mono" style={{ fontSize: '0.48rem', opacity: 0.25, letterSpacing: '0.2em', marginBottom: 10 }}>
                                PREVIEW
                            </div>
                        </div>

                        {/* preview content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }} className="custom-scrollbar">
                            {previewLoading ? (
                                <div style={{ display: 'flex', gap: 6, padding: 8 }}>
                                    <motion.div
                                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                                        transition={{ duration: 1.4, repeat: Infinity }}
                                        style={{
                                            width: '100%',
                                            height: 120,
                                            borderRadius: 8,
                                            background: 'rgba(255,255,255,0.02)',
                                        }}
                                    />
                                </div>
                            ) : previewError ? (
                                <div className="text-mono" style={{ fontSize: '0.6rem', color: 'var(--red-fusion)', opacity: 0.7 }}>
                                    {previewError}
                                </div>
                            ) : filePreview ? (
                                <pre style={{
                                    fontSize: '0.58rem',
                                    lineHeight: 1.7,
                                    color: 'rgba(255,255,255,0.7)',
                                    fontFamily: 'var(--font-mono)',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    margin: 0,
                                }}>
                                    {filePreview}
                                    {filePreview.length >= 500 && (
                                        <span style={{ opacity: 0.35, display: 'block', marginTop: 8 }}>
                                            ... preview truncated (500 chars)
                                        </span>
                                    )}
                                </pre>
                            ) : (
                                <div className="text-mono" style={{ fontSize: '0.58rem', opacity: 0.25, fontStyle: 'italic' }}>
                                    No preview available
                                </div>
                            )}
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* ── STYLES ─────────────────────────────────────────────── */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--cyan-glow); }

                .neural-glass {
                    backdrop-filter: blur(20px);
                    background: rgba(17, 25, 40, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .text-mono {
                    font-family: var(--font-mono, 'JetBrains Mono', monospace);
                }

                .physis-container {
                    user-select: none;
                }
            `}</style>
        </div>
    );
};

/* ─── MetaRow sub-component ──────────────────────────────────────── */

function MetaRow({ label, value, color, mono }: {
    label: string;
    value: string;
    color?: string;
    mono?: boolean;
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, letterSpacing: '0.12em', flexShrink: 0 }}>
                {label}
            </span>
            <span className="text-mono" style={{
                fontSize: '0.58rem',
                color: color || 'rgba(255,255,255,0.7)',
                fontFamily: mono ? 'var(--font-mono)' : undefined,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'right',
            }}>
                {value}
            </span>
        </div>
    );
}

export default PhysisVault;
