import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ConclaveThought {
    id: string;
    type: string;
    producer: string;
    payload: any;
    timestamp: number;
}

function previewThoughtPayload(payload: unknown) {
    if (typeof payload === 'string') return payload;

    try {
        return JSON.stringify(payload);
    } catch {
        return '[UNSERIALIZABLE_PAYLOAD]';
    }
}

const ConclaveMonitor: React.FC = () => {
    const [thoughts, setThoughts] = useState<ConclaveThought[]>([]);
    const [status, setStatus] = useState<'STANDBY' | 'ACTIVE'>('STANDBY');
    const [lastSeen, setLastSeen] = useState<string | null>(null);
    const resetTimer = useRef<number | null>(null);

    useEffect(() => {
        const engine = (window as any).nudimmudEngine;
        if (!engine) return;

        const unsubscribe = engine.subscribe((data: { type: string; artifact: ConclaveThought }) => {
            if (data.type !== 'CONCLAVE_THOUGHT') return;

            const thought = data.artifact;
            setThoughts((current) => [thought, ...current].slice(0, 5));
            setStatus('ACTIVE');
            setLastSeen(new Date(thought.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

            if (resetTimer.current) window.clearTimeout(resetTimer.current);
            resetTimer.current = window.setTimeout(() => setStatus('STANDBY'), 4500);
        });

        return () => {
            unsubscribe();
            if (resetTimer.current) window.clearTimeout(resetTimer.current);
        };
    }, []);

    return (
        <div style={{
            minHeight: '56px',
            background: 'rgba(12, 8, 7, 0.94)',
            borderTop: '1px solid rgba(255, 184, 0, 0.14)',
            display: 'flex',
            alignItems: 'center',
            padding: '10px 20px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.64rem',
            gap: '18px',
            boxShadow: '0 -6px 24px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(14px)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: status === 'ACTIVE' ? 'var(--gold-solar)' : 'rgba(255,255,255,0.12)',
                    boxShadow: status === 'ACTIVE' ? '0 0 12px var(--gold-solar)' : 'none'
                }} />
                <span style={{ opacity: 0.45, letterSpacing: '0.16em' }}>CONCLAVE_PULSE</span>
                <span style={{ color: status === 'ACTIVE' ? 'var(--gold-solar)' : 'rgba(255,255,255,0.82)', fontWeight: 700, letterSpacing: '0.08em' }}>
                    {status}
                </span>
            </div>

            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <AnimatePresence mode="popLayout">
                    {thoughts.length > 0 ? (
                        <motion.div
                            key="thought-strip"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            style={{ display: 'flex', gap: '10px', overflowX: 'auto', scrollbarWidth: 'none' }}
                        >
                            {thoughts.map((thought, index) => (
                                <div
                                    key={thought.id}
                                    title={previewThoughtPayload(thought.payload)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 12px',
                                        borderRadius: '999px',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        opacity: 1 - (index * 0.12),
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                    }}
                                >
                                    <span style={{ color: 'var(--gold-solar)' }}>[{thought.producer}]</span>
                                    <span style={{ opacity: 0.56 }}>{thought.type}</span>
                                    <span style={{ opacity: 0.84 }}>
                                        {previewThoughtPayload(thought.payload).slice(0, 52)}
                                        ...
                                    </span>
                                </div>
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="idle-strip"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-mono"
                            style={{ opacity: 0.34, letterSpacing: '0.12em' }}
                        >
                            AWAITING_CONCLAVE_THOUGHTS...
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, color: 'rgba(255,255,255,0.48)' }}>
                <span>THOUGHTS {thoughts.length}</span>
                <span>LAST {lastSeen || '--:--:--'}</span>
            </div>
        </div>
    );
};

export default ConclaveMonitor;
