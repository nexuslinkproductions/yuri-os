import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';

interface TemporalEvent {
    id: number;
    title: string;
    start_time: string;
    end_time: string;
    strategic_summary: string;
    importance_score: number;
    type?: string;
}

const IMPORTANCE_COLORS: Record<number, string> = {
    10: 'var(--red-fusion)',
    9: 'var(--red-fusion)',
    8: 'var(--gold-solar)',
    7: 'var(--gold-solar)',
    6: 'var(--cyan-glow)',
    5: 'var(--cyan-glow)',
    4: '#FFFFFF',
    3: '#FFFFFF',
    2: 'rgba(255,255,255,0.4)',
    1: 'rgba(255,255,255,0.2)'
};

const ChronosStream: React.FC = () => {
    const [events, setEvents] = useState<TemporalEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchEvents = async () => {
        try {
            const host = window.location.hostname;
            const res = await apiFetch(`http://${host}:3004/api/temporal-graph`);
            const data = await res.json();
            setEvents(data);
        } catch (err) {
            console.error('⬡ CHRONOS_FETCH_ERROR:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 15000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="chronos-container" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
            <header style={{ marginBottom: '60px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="text-mono glow-text" style={{ color: 'var(--cyan-glow)', letterSpacing: '0.4em', fontSize: '2.2rem', marginBottom: '8px', margin: 0 }}>
                        CHRONOS // TEMPORAL_C2
                    </h1>
                    <div className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.4 }}>
                        SEQUENTIAL_LOGIC_PERSISTENCE // AEON_FLUX_STABILITY: NOMINAL
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '30px' }}>
                    {[
                        { label: 'TEMPORAL_DRIFT', value: '0.002ms', color: 'var(--cyan-glow)' },
                        { label: 'EVENT_DENSITY', value: events.length, color: 'white' }
                    ].map((m: { label: string, value: string | number, color: string }) => (
                        <div key={m.label} style={{ textAlign: 'right' }}>
                            <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3 }}>{m.label}</div>
                            <div className="text-mono" style={{ fontSize: '1.2rem', color: m.color, fontWeight: 900 }}>{m.value}</div>
                        </div>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="text-mono" style={{ opacity: 0.3, padding: '100px', textAlign: 'center' }}>SYNCHRONIZING_TIME_VERTICES...</div>
            ) : (
                <div style={{ position: 'relative', paddingLeft: '40px' }}>
                    {/* Vertical Timeline Axis */}
                    <div style={{ 
                        position: 'absolute', left: '10px', top: '10px', bottom: '10px', width: '1px', 
                        background: 'linear-gradient(180deg, var(--cyan-glow) 0%, rgba(255,255,255,0.05) 100%)',
                        boxShadow: '0 0 10px var(--cyan-glow)33'
                    }} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        <AnimatePresence>
                            {events.map((event: TemporalEvent, idx: number) => (
                                <motion.div 
                                    key={event.id} 
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="neural-glass card-hover-effect"
                                    style={{ 
                                        padding: '25px', 
                                        position: 'relative',
                                        borderLeft: `2px solid ${IMPORTANCE_COLORS[event.importance_score] || 'white'}`
                                    }}
                                >
                                    {/* Timeline Marker */}
                                    <div style={{ 
                                        position: 'absolute', left: '-35px', top: '30px', 
                                        width: '10px', height: '10px', borderRadius: '50%',
                                        background: IMPORTANCE_COLORS[event.importance_score] || 'white',
                                        boxShadow: `0 0 10px ${IMPORTANCE_COLORS[event.importance_score]}66`
                                    }} />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                        <div className="text-mono" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--cyan-glow)', fontSize: '0.7rem', fontWeight: 900 }}>
                                                {formatTime(event.start_time)}
                                            </span>
                                            <span style={{ fontSize: '0.5rem', opacity: 0.3 }}>&gt;&gt;</span>
                                            <span style={{ fontSize: '0.65rem', opacity: 0.4 }}>EVENT_NODE_{event.id.toString().padStart(4, '0')}</span>
                                        </div>
                                        <div className="text-mono" style={{ 
                                            fontSize: '0.45rem', padding: '2px 8px', 
                                            background: 'rgba(255,255,255,0.05)', borderRadius: '2px', opacity: 0.6 
                                        }}>
                                            IMPORTANCE: {event.importance_score}
                                        </div>
                                    </div>

                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '10px', margin: 0 }}>{event.title}</h3>
                                    
                                    {event.strategic_summary && (
                                        <div style={{ 
                                            fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', 
                                            lineHeight: '1.5', padding: '12px', background: 'rgba(0,0,0,0.3)',
                                            borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)',
                                            marginTop: '15px'
                                        }}>
                                            <span className="text-mono" style={{ color: IMPORTANCE_COLORS[event.importance_score], marginRight: '8px', fontSize: '0.6rem' }}>STRATEGIC_BRIEF:</span>
                                            {event.strategic_summary}
                                        </div>
                                    )}

                                    {/* Action Footnote */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '15px', gap: '10px' }}>
                                        <button className="text-mono" style={{ 
                                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', 
                                            fontSize: '0.5rem', cursor: 'pointer', textDecoration: 'underline'
                                        }}>EXPAND_CONTEXT</button>
                                        <button className="text-mono" style={{ 
                                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', 
                                            fontSize: '0.5rem', cursor: 'pointer', textDecoration: 'underline'
                                        }}>LINK_TO_VAULT</button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {events.length === 0 && (
                            <div className="text-mono" style={{ opacity: 0.2, textAlign: 'center', padding: '50px' }}>
                                THE_STREAM_IS_QUIET // AWAITING_TEMPORAL_VERTICES
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .chronos-container::-webkit-scrollbar { width: 4px; }
                .chronos-container::-webkit-scrollbar-track { background: transparent; }
                .chronos-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
                
                .neural-glass {
                    backdrop-filter: blur(25px) saturate(180%);
                    background: rgba(17, 25, 40, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .card-hover-effect {
                    transition: all 0.3s ease;
                }
                .card-hover-effect:hover {
                    background: rgba(17, 25, 40, 0.7) !important;
                    transform: translateX(5px);
                    box-shadow: 0 5px 25px rgba(0,0,0,0.5);
                    border-color: rgba(255,255,255,0.2) !important;
                }
            `}</style>
        </div>
    );
};

export default ChronosStream;
