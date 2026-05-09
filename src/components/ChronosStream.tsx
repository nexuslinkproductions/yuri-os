import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

interface SystemEvent {
    id: number;
    event_type: string;
    source: string;
    message: string;
    severity: string;
    created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
    INFO: 'var(--cyan-glow)',
    WARN: 'var(--gold-solar)',
    ERROR: 'var(--red-fusion)',
    CRITICAL: '#ff1744',
};

const SOURCE_COLORS: Record<string, string> = {
    VAULT_INGESTION: '#00e676',
    VAULT_WATCHER: '#00e5bf',
    WEBSOCKET: '#7c4dff',
    IC2M_SYNC: '#ffd740',
    SYSTEM: 'var(--silver-albedo)',
};

function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sourceIcon(source: string): string {
    const icons: Record<string, string> = {
        VAULT_INGESTION: '↓',
        VAULT_WATCHER: '◈',
        WEBSOCKET: '⇄',
        IC2M_SYNC: '⟳',
        SYSTEM: '⬡',
    };
    return icons[source] || '•';
}

const ChronosStream: React.FC = () => {
    const [events, setEvents] = useState<SystemEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<string>('ALL');
    const [paused, setPaused] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const autoScroll = useRef(true);

    const sources = ['ALL', 'VAULT_INGESTION', 'VAULT_WATCHER', 'WEBSOCKET', 'IC2M_SYNC', 'SYSTEM'];

    const fetchEvents = useCallback(async () => {
        try {
            const res = await apiFetch('/api/events');
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            const eventList = Array.isArray(data) ? data : data.events || [];
            setEvents(eventList.slice(0, 100));
            setLoading(false);
            setError(null);
        } catch (e) {
            setError('Could not reach the event stream.');
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
        if (paused) return;
        const interval = setInterval(fetchEvents, 10000);
        return () => clearInterval(interval);
    }, [fetchEvents, paused]);

    useEffect(() => {
        if (autoScroll.current && scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [events]);

    const filtered = filter === 'ALL'
        ? events
        : events.filter(e => e.source === filter);

    const sourceCounts = events.reduce((acc, e) => {
        acc[e.source] = (acc[e.source] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, rgba(8,10,16,0.96) 0%, rgba(3,5,10,1) 100%)' }}>
            {/* Header */}
            <div style={{ padding: '28px 32px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <div className="text-mono" style={{ fontSize: '0.55rem', color: 'var(--cyan-glow)', letterSpacing: '0.4em', marginBottom: 6 }}>Temporal stream // live</div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Chronos</h1>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {sources.map(s => (
                            <button key={s} onClick={() => setFilter(s)}
                                style={{
                                    padding: '4px 10px', fontSize: '0.55rem', fontFamily: 'var(--font-mono)',
                                    background: filter === s ? 'rgba(0,242,255,0.1)' : 'transparent',
                                    border: `1px solid ${filter === s ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.08)'}`,
                                    color: filter === s ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.5)',
                                    borderRadius: 4, cursor: 'pointer', letterSpacing: '0.12em'
                                }}
                            >{s === 'ALL' ? 'ALL' : s.split('_')[0]}</button>
                        ))}
                    </div>
                    <button onClick={() => setPaused(!paused)}
                        style={{
                            padding: '4px 10px', fontSize: '0.55rem', fontFamily: 'var(--font-mono)',
                            background: paused ? 'rgba(255,82,82,0.1)' : 'transparent',
                            border: `1px solid ${paused ? 'var(--red-fusion)' : 'rgba(255,255,255,0.08)'}`,
                            color: paused ? 'var(--red-fusion)' : 'rgba(255,255,255,0.5)',
                            borderRadius: 4, cursor: 'pointer'
                        }}
                    >{paused ? '▸ LIVE' : '❚❚ PAUSE'}</button>
                </div>
            </div>

            {/* Source Summary */}
            <div style={{ padding: '0 32px 16px', display: 'flex', gap: 16, flexShrink: 0 }}>
                {Object.entries(sourceCounts).map(([src, count]) => (
                    <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: SOURCE_COLORS[src] || 'var(--text-dim)', fontSize: '0.65rem' }}>{sourceIcon(src)}</span>
                        <span className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.5 }}>{src.split('_').join(' ')}</span>
                        <span className="text-mono" style={{ fontSize: '0.6rem', fontWeight: 700 }}>{count}</span>
                    </div>
                ))}
            </div>

            {/* Event Stream */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,242,255,0.1) transparent' }}>
                {loading ? (
                    <div className="text-mono" style={{ opacity: 0.3, textAlign: 'center', paddingTop: 80 }}>
                        <div style={{ fontSize: '1.2rem', marginBottom: 12 }}>◈</div>
                        Streaming event horizon...
                    </div>
                ) : error ? (
                    <div className="neural-glass" style={{ padding: 28, borderLeft: '3px solid var(--red-fusion)', marginTop: 20 }}>
                        <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--red-fusion)', marginBottom: 10 }}>STREAM OFFLINE</div>
                        <div style={{ fontSize: '0.9rem', marginBottom: 16 }}>{error}</div>
                        <button onClick={fetchEvents} style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                            color: 'white', padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.6rem'
                        }}>RETRY CONNECTION</button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-mono" style={{ opacity: 0.3, textAlign: 'center', paddingTop: 80 }}>
                        <div style={{ fontSize: '1.2rem', marginBottom: 12 }}>◈</div>
                        No events match this filter.
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {filtered.map((event, i) => (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, x: -20, height: 0 }}
                                animate={{ opacity: 1, x: 0, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25, delay: i < 20 ? i * 0.02 : 0 }}
                                className="neural-glass"
                                style={{
                                    padding: '14px 18px', marginBottom: 6,
                                    borderLeft: `2px solid ${SEVERITY_COLORS[event.severity] || 'var(--cyan-glow)'}`,
                                    display: 'flex', alignItems: 'flex-start', gap: 14, fontSize: '0.82rem'
                                }}
                            >
                                <div style={{
                                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                    background: `${SOURCE_COLORS[event.source] || 'var(--text-dim)'}18`,
                                    border: `1px solid ${SOURCE_COLORS[event.source] || 'var(--text-dim)'}44`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.7rem', color: SOURCE_COLORS[event.source] || 'var(--text-dim)'
                                }}>
                                    {sourceIcon(event.source)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                                        <span className="text-mono" style={{
                                            fontSize: '0.5rem', padding: '2px 6px', borderRadius: 3,
                                            background: `${SEVERITY_COLORS[event.severity] || 'var(--cyan-dim)'}22`,
                                            color: SEVERITY_COLORS[event.severity] || 'var(--cyan-glow)',
                                        }}>
                                            {event.severity}
                                        </span>
                                        <span className="text-mono" style={{
                                            fontSize: '0.5rem', color: SOURCE_COLORS[event.source] || 'var(--text-dim)', opacity: 0.6
                                        }}>
                                            {event.source}
                                        </span>
                                    </div>
                                    <div style={{ lineHeight: 1.5, wordBreak: 'break-word' }}>{event.message}</div>
                                </div>
                                <span className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.35, flexShrink: 0, marginTop: 2 }}>
                                    {formatTime(event.created_at)}
                                </span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
};

export default ChronosStream;
