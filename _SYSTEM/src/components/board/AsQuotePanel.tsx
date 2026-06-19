/**
 * AsQuotePanel.tsx — LIVE Avellaneda-Stoikov PAPER maker quoter (Engine-2).
 * Reads /api/observatory/as-quote. PAPER ONLY (INV-1: no real orders) — fills are
 * simulated against the live public trade stream. This is the panel that makes the
 * armed A-S engine verifiable: live quote, fills, bucketed net, and proof each wired
 * module is firing (regime halts/widens, funding skew, OFI λ-measurement).
 */

import type { AsQuoteResponse } from './api';

interface Props {
  data: AsQuoteResponse | null;
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const f = (x: unknown, d = 2): string => (num(x) ? x.toFixed(d) : '—');

export default function AsQuotePanel({ data }: Props) {
  // DISARMED / unreachable → explicit state, never blank.
  if (!data || !data.armed) {
    return (
      <>
        <div className="bb-panel-head">
          <span className="bb-eyebrow">A-S Maker · Live Paper</span>
          <span className="bb-panel-sub">disarmed</span>
        </div>
        <div style={{ padding: '14px 4px', color: 'var(--mist)', fontSize: 11, lineHeight: 1.6 }}>
          A-S paper quoter is <strong>not armed</strong>. Set <code>OBSERVATORY_AS_QUOTE=1</code> on the
          daemon and reload. (Separate from the ensemble engine below.)
        </div>
      </>
    );
  }

  const lq = data.lastQuote || null;
  const quoting = !!data.quoting;
  const netCls = num(data.netBps) ? (data.netBps! >= 0 ? 'pos' : 'neg') : 'flat';
  const regime = data.regime || { haltCount: 0, widenCount: 0, lastAction: 'normal' };
  const ofi = data.ofi || { lambda: null, r2: null, n: 0, levels: null };
  const funding = data.funding || { rate: null, secsToFunding: null, skewTicks: 0 };

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">A-S Maker · Live Paper</span>
        <span className="bb-panel-sub">
          {data.symbol} · {data.quoteCount ?? 0} quotes · {f((data.uptimeMs ?? 0) / 60000, 0)}m
        </span>
      </div>

      {/* status + live quote */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 10px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
          color: quoting ? '#00e0a4' : 'var(--mist)', letterSpacing: '0.04em',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: quoting ? '#00e0a4' : '#6e87a3',
            boxShadow: quoting ? '0 0 8px #00e0a4' : 'none',
          }} />
          {quoting ? 'QUOTING' : 'IDLE'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--mist)' }}>PAPER · no real orders (INV-1)</span>
      </div>

      {lq ? (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 14, fontFamily: '"JetBrains Mono", monospace',
          fontSize: 13, padding: '8px 10px', borderRadius: 6, background: 'rgba(0,200,240,0.05)',
          border: '1px solid rgba(0,200,240,0.12)', marginBottom: 10,
        }}>
          <span style={{ color: '#ff7a90' }}>bid {f(lq.bidPx, 1)}</span>
          <span style={{ color: 'var(--mist)', fontSize: 10 }}>½sp {f(lq.halfSpread)}</span>
          <span style={{ color: '#00e0a4' }}>ask {f(lq.askPx, 1)}</span>
          <span style={{ color: 'var(--mist)', fontSize: 10, marginLeft: 'auto' }}>r {f(lq.reservation, 1)}</span>
        </div>
      ) : (
        <div style={{ padding: '8px 0', color: 'var(--mist)', fontSize: 10 }}>warming up — first quote forming…</div>
      )}

      {/* key stats */}
      <div className="bb-pnl-stats">
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Fills</span>
          <span className="bb-pnl-stat-val">{data.fills ?? 0}</span>
          <span className="bb-pnl-stat-sub">paper</span>
        </div>
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Net / fill</span>
          <span className={`bb-pnl-stat-val ${netCls}`}>{f(data.netBps, 2)} bps</span>
          <span className="bb-pnl-stat-sub">fee-dominated</span>
        </div>
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Inventory</span>
          <span className="bb-pnl-stat-val">{f(data.qLots, 0)} lot</span>
          <span className="bb-pnl-stat-sub">max {f(data.maxInventoryLots, 0)}</span>
        </div>
      </div>

      {/* PnL bucket breakdown */}
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--mist)', margin: '8px 0 10px', lineHeight: 1.7 }}>
        spread <span style={{ color: '#00e0a4' }}>+{f(data.grossSpreadBps)}</span>
        {'  −  adverse '}<span style={{ color: '#ff7a90' }}>{f(data.adverseSelBps)}</span>
        {'  −  fee '}<span style={{ color: '#ff7a90' }}>{f(data.feeBps, 1)}</span>
        {'  =  net '}<span className={netCls === 'pos' ? undefined : undefined} style={{ color: netCls === 'pos' ? '#00e0a4' : '#ff7a90' }}>{f(data.netBps)}</span> bps/fill
      </div>

      {/* wired-modules firing — the verification row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 16px', fontSize: 10, color: 'var(--mist)', fontFamily: '"JetBrains Mono", monospace' }}>
        <span>σ(price) <span style={{ color: '#cfe' }}>{f(data.sigmaPrice, 2)}</span></span>
        <span>κ <span style={{ color: '#cfe' }}>{f(data.kappaPrice, 4)}</span></span>
        <span>regime <span style={{ color: regime.lastAction === 'halt' ? '#ff7a90' : regime.lastAction === 'widen' ? '#ffd166' : '#00e0a4' }}>{regime.lastAction}</span> <span style={{ opacity: 0.7 }}>h{regime.haltCount}/w{regime.widenCount}</span></span>
        <span>funding <span style={{ color: '#cfe' }}>{funding.rate != null ? (funding.rate * 100).toFixed(4) + '%' : '—'}</span></span>
        <span>OFI R² <span style={{ color: '#cfe' }}>{f(ofi.r2, 4)}</span> <span style={{ opacity: 0.7 }}>n{ofi.n}</span></span>
        <span>κ src <span style={{ color: '#cfe', fontSize: 9 }}>{(data.kappaSource || '').replace('fitKappa', 'fit').slice(0, 22)}</span></span>
      </div>

      {/* A-S FILL TAPE — each row is a real paper fill (trade match against the live stream) */}
      {data.recentFills && data.recentFills.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--mist)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            Recent fills · Binance BTCUSDT perp{num(data.bookMid) ? ` · mid ${f(data.bookMid, 1)}` : ''}
          </div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, lineHeight: 1.7, maxHeight: 120, overflowY: 'auto' }}>
            {data.recentFills.map((fl, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: fl.side === 'buy' ? '#00e0a4' : '#ff7a90', width: 30, fontWeight: 600 }}>{fl.side === 'buy' ? 'BID' : 'ASK'}</span>
                <span style={{ color: '#cfe' }}>{f(fl.price, 1)}</span>
                <span style={{ color: 'var(--mist)' }}>{num(fl.netBps) ? `${fl.netBps.toFixed(2)} bps` : ''}</span>
                <span style={{ color: 'var(--mist)', marginLeft: 'auto', opacity: 0.7 }}>{fl.ts ? new Date(fl.ts).toLocaleTimeString() : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.lastError && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#ff5470' }}>⚠ {data.lastError}</div>
      )}
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--mist)', opacity: 0.8, lineHeight: 1.5 }}>
        Live data, live quotes, simulated fills. Net is fee-dominated below the data bar — live measurement, not a profit claim.
      </div>
    </>
  );
}
