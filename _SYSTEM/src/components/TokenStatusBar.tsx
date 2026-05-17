import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/runtime';

interface TokenState {
    model?: string;
    context?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cost?: number;
    updatedAt?: string;
}

interface WeeklyState {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cost?: number;
    sessionCount?: number;
    weekStart?: string;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
    const barColor = pct > 80 ? 'var(--red-fusion)' : pct > 55 ? 'var(--gold-solar)' : color;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 56, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.4s' }}/>
            </div>
            <span style={{ fontSize: 9, color: barColor, minWidth: 28, textAlign: 'right' }}>{Math.round(pct)}%</span>
        </div>
    );
}

function fmt(n: number | undefined): string {
    if (!n) return '0';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

// Weekly budget — 500k tokens as a soft reference ceiling
const WEEKLY_BUDGET = 500_000;
const CONTEXT_MAX   = 200_000;

export default function TokenStatusBar() {
    const [session, setSession] = useState<TokenState | null>(null);
    const [weekly, setWeekly]   = useState<WeeklyState | null>(null);
    const [error, setError]     = useState(false);

    useEffect(() => {
        const load = () => {
            apiFetch('/api/telemetry/tokens')
                .then(r => r.json())
                .then(d => {
                    setSession(d.session || null);
                    setWeekly(d.weekly || null);
                    setError(false);
                })
                .catch(() => setError(true));
        };
        load();
        const id = setInterval(load, 5000);
        return () => clearInterval(id);
    }, []);

    if (error || (!session && !weekly)) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '0 16px',
            height: '100%',
            borderLeft: '1px solid rgba(159,232,115,0.12)',
            fontFamily: 'JetBrains Mono, monospace'
        }}>
            {/* Session */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 8, letterSpacing: '0.12em', color: 'var(--cyan-glow)', textTransform: 'uppercase', opacity: 0.7 }}>SESSION</span>
                    <Bar value={session?.context || 0} max={100} color="var(--cyan-glow)" />
                    <span style={{ fontSize: 9, color: 'rgba(247,247,247,0.5)' }}>
                        ↑{fmt(session?.inputTokens)} ↓{fmt(session?.outputTokens)}
                    </span>
                    {(session?.cost || 0) > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--gold-solar)' }}>
                            ${(session?.cost || 0).toFixed(3)}
                        </span>
                    )}
                </div>
            </div>

            {/* Separator */}
            <div style={{ width: 1, height: 20, background: 'rgba(159,232,115,0.15)' }}/>

            {/* Weekly */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 8, letterSpacing: '0.12em', color: 'var(--gold-solar)', textTransform: 'uppercase', opacity: 0.7 }}>WEEK</span>
                    <Bar value={weekly?.totalTokens || 0} max={WEEKLY_BUDGET} color="var(--gold-solar)" />
                    <span style={{ fontSize: 9, color: 'rgba(247,247,247,0.5)' }}>
                        {fmt(weekly?.totalTokens)} tok · {weekly?.sessionCount || 0} sess
                    </span>
                    {(weekly?.cost || 0) > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--gold-solar)' }}>
                            ${(weekly?.cost || 0).toFixed(2)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
