/**
 * TradesPanel.tsx — live trade tape. Newest-first closed paper trades across all factor books,
 * polled from /trades (~3s). Makes paper-trading activity visible at a glance.
 */

import type { TradesResponse } from './api';

interface Props {
  data: TradesResponse;
}

function fmtPx(p: number | null): string {
  if (p == null || !isFinite(p)) return '—';
  if (p < 1) return p.toFixed(5);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPnl(v: number | null): string {
  if (v == null || !isFinite(v)) return '—';
  return (v >= 0 ? '+$' : '−$') + Math.abs(v).toFixed(2);
}

function fmtAge(ts: number): string {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Strip the trailing market suffix so the strategy name is readable (rsi-meanrev-BTC-USD → rsi-meanrev).
function shortFactor(factorId: string | null, market: string): string {
  if (!factorId) return '—';
  return factorId.replace(new RegExp(`-?${market}$`), '');
}

export default function TradesPanel({ data }: Props) {
  const trades = data?.trades ?? [];

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Trade Tape</span>
        <span className="bb-panel-sub">{data?.total ?? 0} closed · live</span>
      </div>

      {trades.length === 0 ? (
        <div className="bb-cal-pending">No closed paper trades yet — accruing.</div>
      ) : (
        <div className="bb-tape" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto', fontFamily: 'var(--bb-mono, ui-monospace, monospace)', fontSize: 10 }}>
          {trades.map((t, i) => {
            const win = (t.netPnl ?? 0) >= 0;
            const longSide = String(t.side).toLowerCase() === 'long';
            return (
              <div
                key={`${t.market}-${t.factorId}-${t.ts}-${i}`}
                style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto auto', gap: 8, alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' }}
              >
                <span style={{ color: longSide ? '#19c37d' : '#e8453a', fontWeight: 600 }}>
                  {longSide ? 'LONG' : 'SHORT'}
                </span>
                <span style={{ color: '#9db2c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#cdd9e8' }}>{t.market.replace('-USD', '')}</span> {shortFactor(t.factorId, t.market)}
                </span>
                <span style={{ color: '#6e87a3' }}>{fmtPx(t.entryPx)}→{fmtPx(t.exitPx)}</span>
                <span style={{ color: win ? '#19c37d' : '#e8453a', textAlign: 'right', minWidth: 64 }}>
                  {fmtPnl(t.netPnl)} <span style={{ color: '#42546b' }}>{fmtAge(t.ts)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
