import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';
import { humanizeLabel } from '../lib/labels';

interface Ticket {
    id: number;
    external_id: string;
    title: string;
    status: string;
    priority: string;
    assigned_to: string;
    client: string;
}

const PRIORITY_THEME: Record<string, { color: string; class: string }> = {
    URGENT: { color: 'var(--red-fusion)', class: 'critical-pulse' },
    HIGH:   { color: 'var(--gold-solar)', class: '' },
    MEDIUM: { color: 'var(--cyan-glow)',  class: '' },
    LOW:    { color: 'var(--text-dim)',   class: '' },
};

const STATUS_COLUMNS = ['Backlog', 'Planning', 'Todo', 'In progress', 'Review', 'Done'];

const getTeamColor = (assigned_to: string) => {
    const a = assigned_to?.toLowerCase() || '';
    if (a.includes('claudio') || a.includes('cti')) return 'var(--color-claudio)';
    if (a.includes('fanny')) return 'var(--color-fanny)';
    if (a.includes('cati')) return 'var(--color-cati)';
    if (a.includes('marcel')) return 'var(--color-marcel)';
    return 'var(--cyan-glow)';
};

const TicketBoard: React.FC = () => {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN' | 'PIPELINE' | 'CARDS' | 'ORBS'>('KANBAN');
    const [loading, setLoading] = useState(true);
    const [activeFile, setActiveFile] = useState<string | null>(null);

    useEffect(() => {
        const engine = (window as any).yuriEngine;
        if (!engine) return;

        const unsubscribe = engine.subscribe((data: { obsidian?: { activeFile: string } }) => {
            if (data.obsidian?.activeFile) {
                setActiveFile(data.obsidian.activeFile);
            }
        });
        
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const fetchTickets = async () => {
            try {
                const host = window.location.hostname;
                const res = await apiFetch(`http://${host}:3004/api/tickets`);
                const data = await res.json();
                setTickets(data);
            } catch (err) {
                console.error('⬡ TICKET_FETCH_ERROR:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchTickets();
    }, []);

    const renderList = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tickets.map((ticket: Ticket, idx: number) => {
                const teamColor = getTeamColor(ticket.assigned_to);
                return (
                    <motion.div
                        key={ticket.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="neural-glass card-hover-effect"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '100px 120px 1fr 100px 150px',
                            alignItems: 'center',
                            gap: '24px',
                            padding: '16px 24px',
                            cursor: 'pointer',
                            borderLeft: `2px solid ${teamColor}`
                        }}
                        onClick={() => (window as any).missionSidebar?.open(ticket)}
                    >
                        <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.3 }}>#{ticket.external_id}</div>
                        <div className="text-mono" style={{ fontSize: '0.6rem', color: 'var(--gold-solar)', background: 'rgba(255,184,0,0.05)', padding: '2px 8px', borderRadius: '2px', border: '1px solid rgba(255,184,0,0.2)', textAlign: 'center' }}>
                            {ticket.client || 'INTERNAL'}
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{ticket.title}</div>
                        <div className={`text-mono ${PRIORITY_THEME[ticket.priority]?.class}`} style={{ fontSize: '0.55rem', color: PRIORITY_THEME[ticket.priority]?.color, border: `1px solid ${PRIORITY_THEME[ticket.priority]?.color}33`, padding: '2px 8px', textAlign: 'center', borderRadius: '2px' }}>{humanizeLabel(ticket.priority)}</div>
                        <div className="text-mono" style={{ fontSize: '0.65rem', color: teamColor, textAlign: 'right' }}>{ticket.assigned_to?.toUpperCase()}</div>
                    </motion.div>
                );
            })}
        </div>
    );

    const renderKanban = () => (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUS_COLUMNS.length}, 1fr)`, gap: '24px', height: '100%', minWidth: '1200px' }}>
            {STATUS_COLUMNS.map((col: string) => (
                <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                        <h3 className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.6, letterSpacing: '0.2em' }}>{col}</h3>
                        <span className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.3 }}>{tickets.filter(t => humanizeLabel(t.status || 'Todo').toLowerCase() === col.toLowerCase()).length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                        {tickets.filter((t: Ticket) => humanizeLabel(t.status || 'Todo').toLowerCase() === col.toLowerCase()).map((ticket: Ticket) => {
                            const teamColor = getTeamColor(ticket.assigned_to);
                            return (
                                <motion.div
                                    key={ticket.id}
                                    layout
                                    className="neural-glass card-hover-effect"
                                    style={{ 
                                        padding: '16px', 
                                        borderTop: `1px solid rgba(255,255,255,0.05)`,
                                        borderLeft: `3px solid ${teamColor}`,
                                        cursor: 'pointer',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onClick={() => (window as any).missionSidebar?.open(ticket)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3 }}>{ticket.external_id}</div>
                                        {ticket.client && (
                                            <div className="text-mono" style={{ fontSize: '0.5rem', color: 'var(--gold-solar)' }}>{ticket.client}</div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', lineHeight: '1.4' }}>{ticket.title}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div className={`text-mono ${PRIORITY_THEME[ticket.priority]?.class}`} style={{ fontSize: '0.5rem', color: PRIORITY_THEME[ticket.priority]?.color }}>{humanizeLabel(ticket.priority)}</div>
                                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: teamColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>
                                            {ticket.assigned_to?.[0]?.toUpperCase() || '?'}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );

    const renderPipeline = () => (
        <div style={{ position: 'relative', height: '100%', padding: '40px 0' }}>
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, opacity: 0.1 }}>
                <path d="M 0,50 Q 500,50 1000,50" fill="none" stroke="var(--cyan-glow)" strokeWidth="2" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                {STATUS_COLUMNS.map((col: string, i: number) => {
                    const colTickets = tickets.filter((t: Ticket) => humanizeLabel(t.status || 'Todo').toLowerCase() === col.toLowerCase());
                    return (
                        <div key={col} style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ 
                                width: '48px', height: '48px', borderRadius: '50%', background: colTickets.length > 0 ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.05)', 
                                margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid rgba(255,255,255,0.1)', boxShadow: colTickets.length > 0 ? '0 0 20px var(--cyan-glow)' : 'none'
                            }}>
                                <span className="text-mono" style={{ fontSize: '0.9rem', fontWeight: 'bold', color: colTickets.length > 0 ? '#000' : 'white' }}>{colTickets.length}</span>
                            </div>
                            <h4 className="text-mono" style={{ fontSize: '0.65rem', opacity: 0.5 }}>{col}</h4>
                        </div>
                    );
                })}
            </div>
            
            <div style={{ marginTop: '80px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px' }}>
                {tickets.filter((t: Ticket) => humanizeLabel(t.status).toLowerCase() === 'in progress' || humanizeLabel(t.status).toLowerCase() === 'editing').slice(0, 3).map((ticket: Ticket) => {
                    const teamColor = getTeamColor(ticket.assigned_to);
                    return (
                        <div key={ticket.id} className="neural-glass" style={{ padding: '24px', borderTop: `2px solid ${teamColor}`, background: 'rgba(0,0,0,0.4)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div className="text-mono" style={{ fontSize: '0.55rem', color: teamColor }}>In flight data</div>
                                <div className="text-mono" style={{ fontSize: '0.55rem', color: 'var(--gold-solar)' }}>{ticket.client}</div>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{ticket.title}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const STATUS_COLOR: Record<string, string> = {
        'Todo':        'var(--text-dim)',
        'In progress': 'var(--cyan-glow)',
        'Review':      'var(--gold-solar)',
        'Done':        'rgba(159,232,115,0.5)',
        'Backlog':     'rgba(247,247,247,0.2)',
        'Planning':    'rgba(118,185,0,0.5)',
        'Cancelled':   'var(--red-fusion)',
    };

    const renderHoloCards = () => (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
            padding: '4px 2px',
        }}>
            {tickets.map((t, i) => {
                const priority = PRIORITY_THEME[t.priority?.toUpperCase()] || PRIORITY_THEME.LOW;
                const statusColor = STATUS_COLOR[t.status] || 'var(--text-dim)';
                const teamColor = getTeamColor(t.assigned_to);
                return (
                    <motion.div
                        key={t.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.2 }}
                        whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2 }}
                        style={{
                            background: 'rgba(8,8,8,0.72)',
                            border: `1px solid ${statusColor}33`,
                            borderTop: `2px solid ${statusColor}`,
                            padding: '14px 16px',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden',
                            backdropFilter: 'blur(8px)',
                            transformStyle: 'preserve-3d',
                            perspective: 800,
                            transition: 'box-shadow 0.2s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${statusColor}33`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                    >
                        {/* Priority bar */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: `${t.priority === 'URGENT' ? 100 : t.priority === 'HIGH' ? 70 : t.priority === 'MEDIUM' ? 45 : 20}%`, height: 2, background: priority.color }} />

                        {/* Status pill */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 9, letterSpacing: '0.12em', color: statusColor, textTransform: 'uppercase', background: `${statusColor}11`, padding: '2px 8px', border: `1px solid ${statusColor}33` }}>
                                {t.status}
                            </span>
                            <span style={{ fontSize: 8, color: teamColor, letterSpacing: '0.08em' }}>{t.assigned_to || '—'}</span>
                        </div>

                        {/* Title */}
                        <div style={{ fontSize: 12, color: 'var(--silver-albedo)', lineHeight: 1.5, marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' }}>
                            {t.title}
                        </div>

                        {/* Meta */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', opacity: 0.6 }}>
                            <span>{t.client || '—'}</span>
                            <span style={{ color: priority.color }}>{t.priority}</span>
                        </div>

                        {/* Holographic shimmer */}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(159,232,115,0.03) 0%, transparent 50%, rgba(118,185,0,0.03) 100%)', pointerEvents: 'none' }}/>
                    </motion.div>
                );
            })}
        </div>
    );

    const renderOrbColumns = () => {
        const columns = STATUS_COLUMNS;
        return (
            <div style={{ display: 'flex', gap: 20, height: '100%', overflowX: 'auto', padding: '4px 2px' }}>
                {columns.map(col => {
                    const colTickets = tickets.filter(t => t.status === col);
                    const colColor = STATUS_COLOR[col] || 'var(--text-dim)';
                    return (
                        <div key={col} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 80 }}>
                            <div style={{ fontSize: 8, letterSpacing: '0.1em', color: colColor, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center' }}>
                                {col}<br/>
                                <span style={{ opacity: 0.5 }}>{colTickets.length}</span>
                            </div>
                            {colTickets.map((t, i) => {
                                const priority = PRIORITY_THEME[t.priority?.toUpperCase()] || PRIORITY_THEME.LOW;
                                const teamColor = getTeamColor(t.assigned_to);
                                return (
                                    <motion.div
                                        key={t.id}
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: i * 0.05, type: 'spring', stiffness: 250 }}
                                        title={t.title}
                                        whileHover={{ scale: 1.2 }}
                                        style={{
                                            width: 52, height: 52,
                                            borderRadius: '50%',
                                            background: `${priority.color}18`,
                                            border: `2px solid ${priority.color}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            boxShadow: `0 0 10px ${priority.color}33`,
                                            flexShrink: 0
                                        }}
                                    >
                                        {/* Team color ring */}
                                        <motion.div style={{
                                            position: 'absolute', inset: -5,
                                            borderRadius: '50%',
                                            border: `1px solid ${teamColor}40`,
                                            pointerEvents: 'none'
                                        }} animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}/>
                                        <span style={{ fontSize: 9, color: priority.color, textAlign: 'center', padding: 4, lineHeight: 1.2, maxWidth: 40, overflow: 'hidden' }}>
                                            {t.external_id || String(t.id).slice(-3)}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="ticket-board-container" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '50px' }}>
                <div style={{ flex: 1 }}>
                    <div className="text-mono" style={{ fontSize: '0.6rem', color: 'var(--gold-solar)', letterSpacing: '0.5em', marginBottom: '10px' }}>System operations // Logos</div>
                    <h2 className="text-mono glow-text" style={{ fontSize: '1.8rem', letterSpacing: '0.4em', marginBottom: '4px' }}>iC2M work stream</h2>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <p className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.4 }}>Authoritative vault ingestion active</p>
                        <div className="text-mono" style={{ fontSize: '0.6rem', color: (window as any).yuriEngine?.obsidianState?.status === 'ONLINE' ? 'var(--cyan-glow)' : 'var(--red-fusion)' }}>
                           [ Vault: {(window as any).yuriEngine?.obsidianState?.status || 'OFFLINE'} ]
                        </div>
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '4px' }}>
                    {(['LIST', 'KANBAN', 'PIPELINE', 'CARDS', 'ORBS'] as const).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className="text-mono"
                            style={{
                                background: viewMode === mode ? 'rgba(0, 242, 255, 0.1)' : 'transparent',
                                border: 'none',
                                color: viewMode === mode ? 'var(--cyan-glow)' : 'var(--text-dim)',
                                padding: '8px 20px',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                letterSpacing: '0.15em',
                                borderRadius: '2px',
                                transition: 'var(--transition-master)',
                            }}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="text-mono" style={{ opacity: 0.4, padding: '20px' }}>Synchronizing iC2M infrastructure...</div>
            ) : (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={viewMode}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        style={{ height: '100%' }}
                    >
                        {viewMode === 'LIST' && renderList()}
                        {viewMode === 'KANBAN' && renderKanban()}
                        {viewMode === 'PIPELINE' && renderPipeline()}
                        {viewMode === 'CARDS' && renderHoloCards()}
                        {viewMode === 'ORBS' && renderOrbColumns()}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};

export default TicketBoard;
