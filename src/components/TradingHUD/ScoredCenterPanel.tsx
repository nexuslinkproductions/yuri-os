/**
 * ⬡ YURI_TRADING :: ScoredCenterPanel
 * Phase 5 — ranked signals table from /api/trading/signals/merged.
 * Sort by score, filter by urgency, expand evidence on click.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchMergedSignals, type MergedSignal } from '../../lib/tradingHudBridge';
import styles from './styles.module.css';

type UrgencyFilter = 'ALL' | 'CRITICAL' | 'ELEVATED' | 'WATCH' | 'NEUTRAL';

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  dex: { label: 'DEX', color: '#00e5bf' },
  funding: { label: 'FUND', color: '#ffd740' },
  whale: { label: 'WHALE', color: '#00e676' },
  jupiter: { label: 'JUP', color: '#7c4dff' },
  birdeye: { label: 'BIRD', color: '#ff9100' },
};

function ScoreBar({ score, urgency }: { score: number; urgency: string }) {
  const c = urgency === 'CRITICAL' ? '#ff5252' : urgency === 'ELEVATED' ? '#ffd740' : urgency === 'WATCH' ? '#00e5bf' : '#4a4e66';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div style={{ width: 56, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', background: c, borderRadius: 3, boxShadow: `0 0 8px ${c}44`, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600, color: c, minWidth: 28, textAlign: 'right' }}>{score}</span>
    </div>
  );
}

function SourceBadges({ sources }: { sources: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {sources.map(src => {
        const m = SOURCE_LABELS[src] || { label: src.toUpperCase(), color: '#4a4e66' };
        return <span key={src} style={{ fontSize: 8, fontFamily: '"JetBrains Mono", monospace', padding: '1px 5px', borderRadius: 3, background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}33`, letterSpacing: 0.5 }}>{m.label}</span>;
      })}
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const c = urgency === 'CRITICAL' ? '#ff5252' : urgency === 'ELEVATED' ? '#ffd740' : urgency === 'WATCH' ? '#00e5bf' : '#4a4e66';
  return <span style={{ fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, letterSpacing: 1, padding: '2px 8px', borderRadius: 4, background: `${c}14`, color: c, border: `1px solid ${c}33`, textTransform: 'uppercase' }}>{urgency}</span>;
}

export default function ScoredCenterPanel() {
  const [signals, setSignals] = useState<MergedSignal[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [filter, setFilter] = useState<UrgencyFilter>('ALL');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchMergedSignals();
      setSignals(res.signals); setSummary(res.summary); setLastUpdate(res.ts); setError(null);
    } catch (err: any) { setError(err?.message || 'fetch error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const t = window.setInterval(fetchData, 45_000); return () => window.clearInterval(t); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = filter === 'ALL' ? signals : signals.filter(s => s.urgency === filter);
    return [...list].sort((a, b) => sortDir === 'desc' ? b.aggregateScore - a.aggregateScore : a.aggregateScore - b.aggregateScore);
  }, [signals, filter, sortDir]);

  const counts = useMemo(() => ({
    ALL: signals.length, CRITICAL: signals.filter(s => s.urgency === 'CRITICAL').length,
    ELEVATED: signals.filter(s => s.urgency === 'ELEVATED').length,
    WATCH: signals.filter(s => s.urgency === 'WATCH').length, NEUTRAL: signals.filter(s => s.urgency === 'NEUTRAL').length,
  }), [signals]);

  const timeStr = lastUpdate ? new Date(lastUpdate).toLocaleTimeString('en-GB') : '--:--:--';
  const filters: UrgencyFilter[] = ['ALL', 'CRITICAL', 'ELEVATED', 'WATCH', 'NEUTRAL'];
  const { panel, panelFull, panelHeader, panelTitle, panelCount, panelMeta, panelBody, table, muted, stateContainer, shimmer, stateIcon, stateMessage, stateError } = styles;

  return (
    <div className={`${panel} ${panelFull}`}>
      <div className={panelHeader}>
        <div className={panelTitle}><i style={{ color: 'var(--accent)' }}>◆</i> Signal Matrix<span className={panelCount}>{filtered.length}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: '"JetBrains Mono"', fontSize: 9, padding: '2px 8px', borderRadius: 12, background: filter === f ? 'rgba(0,229,191,0.12)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--muted)', border: `1px solid ${filter === f ? 'rgba(0,229,191,0.25)' : 'transparent'}`, cursor: 'pointer', fontWeight: filter === f ? 600 : 400 }}>{f} {counts[f]}</button>
          ))}
          <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} style={{ fontFamily: '"JetBrains Mono"', fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'transparent', color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>{sortDir === 'desc' ? '↓' : '↑'}</button>
        </div>
        <div className={panelMeta}>{timeStr}</div>
      </div>

      <div className={panelBody}>
        {loading ? <div className={`${stateContainer} ${shimmer}`}><i className={stateIcon}>⬡</i><p className={stateMessage}>scoring signals…</p></div>
        : error ? <div className={`${stateContainer} ${stateError}`}><i className={stateIcon}>⚠</i><p className={stateMessage}>{error}</p></div>
        : filtered.length === 0 ? <div className={stateContainer}><i className={stateIcon}>–</i><p className={stateMessage}>{filter !== 'ALL' ? `No ${filter} signals` : 'No signals scored'}</p></div>
        : <table className={table}><thead><tr><th style={{ width: 100 }}>Score</th><th>Token</th><th style={{ width: 110 }}>Sources</th><th style={{ width: 90 }}>Urgency</th><th style={{ width: 80 }}>Evidence</th><th>Signals</th></tr></thead><tbody>
          {filtered.map(s => (
            <tr key={s.token}>
              <td><ScoreBar score={s.aggregateScore} urgency={s.urgency} /></td>
              <td><b>{s.token}</b><div className={muted} style={{ fontSize: 9 }}>{s.sourceCount} src</div></td>
              <td><SourceBadges sources={s.sourceSet?.length ? s.sourceSet : s.sources} /></td>
              <td><UrgencyBadge urgency={s.urgency} /></td>
              <td><EvidenceCell evidence={s.evidence} /></td>
              <td><span className={muted} style={{ fontSize: 9 }}>{s.topSignals.slice(0, 3).join(', ')}</span></td>
            </tr>
          ))}
        </tbody></table>}
      </div>
    </div>
  );
}

function EvidenceCell({ evidence }: { evidence: string[] }) {
  const [open, setOpen] = useState(false);
  if (!evidence.length) return <span className={styles.muted}>—</span>;
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'rgba(0,229,191,0.06)', border: '1px solid rgba(0,229,191,0.15)', color: 'var(--accent, #00e5bf)', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 8, padding: '2px 7px', borderRadius: 4 }}>{evidence.length} reason{evidence.length !== 1 ? 's' : ''}</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'rgba(10,13,26,0.97)', border: '1px solid rgba(0,229,191,0.2)', borderRadius: 6, padding: '8px 12px', minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', marginTop: 4 }} onClick={() => setOpen(false)}>
          {evidence.map((e, i) => <div key={i} style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: '#d4d8e6', padding: '3px 0', borderBottom: i < evidence.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>• {e}</div>)}
        </div>
      )}
    </div>
  );
}
