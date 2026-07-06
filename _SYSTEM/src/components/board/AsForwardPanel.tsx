/**
 * AsForwardPanel.tsx — A-S Maker · Forward Test (repurposed from the Perp Trainer slot).
 * Reads /api/observatory/as-quote. Shows the LIVE PAPER forward-test of the Avellaneda-
 * Stoikov maker: cumulative paper P&L equity curve + cumulative net (bps/$), net-per-fill,
 * and the wired-module activity — the out-of-sample evidence that should precede any live
 * sizing. PAPER ONLY (INV-1). Replaces the directional-ensemble Perp Trainer (edgeless,
 * stale snapshot) with the engine we actually run.
 */

import type { AsQuoteResponse } from './api';

interface Props {
  data: AsQuoteResponse | null;
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const f = (x: unknown, d = 2): string => (num(x) ? x.toFixed(d) : '—');

function linePath(pts: number[], w: number, h: number, pad: number): string {
  if (pts.length < 2) return '';
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = (max - min) || 1;
  const step = (w - pad * 2) / Math.max(pts.length - 1, 1);
  return pts.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
}

export default function AsForwardPanel({ data }: Props) {
  if (!data || !data.armed) {
    return (
      <>
        <div className="bb-panel-head">
          <span className="bb-eyebrow">A-S Maker · Forward Test</span>
          <span className="bb-panel-sub">disarmed</span>
        </div>
        <div style={{ padding: '14px 4px', color: 'var(--mist)', fontSize: 11, lineHeight: 1.6 }}>
          A-S paper quoter not armed — set <code>OBSERVATORY_AS_QUOTE=1</code> on the daemon.
        </div>
      </>
    );
  }

  const curve = (data.equityCurve || []);
  const pnlPts = curve.map((p) => p.cumPnlUsd).filter((v) => num(v));
  const hasCurve = pnlPts.length >= 2;
  const last = pnlPts.length ? pnlPts[pnlPts.length - 1] : 0;
  const curveCls = last >= 0 ? '#00e0a4' : '#ff7a90';
  const cumNetCls = num(data.cumNetBps) ? (data.cumNetBps! >= 0 ? 'pos' : 'neg') : 'flat';
  const w = 520, h = 96, pad = 6;

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">A-S Maker · Forward Test</span>
        <span className="bb-panel-sub">
          {data.symbol} · paper · {f((data.uptimeMs ?? 0) / 60000, 0)}m · {data.fills ?? 0} fills
        </span>
      </div>

      {/* headline forward-test stats */}
      <div className="bb-pnl-stats">
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Cum P&amp;L (paper)</span>
          <span className="bb-pnl-stat-val" style={{ color: curveCls }}>
            {num(data.cumPnlUsd) ? (data.cumPnlUsd! >= 0 ? '+$' : '-$') + Math.abs(data.cumPnlUsd!).toFixed(4) : '—'}
          </span>
          <span className="bb-pnl-stat-sub">on {f((data.lastQuote?.bidPx ?? 0) * 0.001, 2)} notional/fill</span>
        </div>
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Cum net</span>
          <span className={`bb-pnl-stat-val ${cumNetCls}`}>{f(data.cumNetBps, 1)} bps</span>
          <span className="bb-pnl-stat-sub">all fills summed</span>
        </div>
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Net / fill</span>
          <span className={`bb-pnl-stat-val ${num(data.netBps) && data.netBps! >= 0 ? 'pos' : 'neg'}`}>{f(data.netBps, 2)} bps</span>
          <span className="bb-pnl-stat-sub">vs offline −2.16</span>
        </div>
      </div>

      {/* paper equity curve */}
      <div className="bb-pnl-chart" style={{ height: 96 }}>
        {hasCurve ? (
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <line x1={pad} y1={h - pad - ((0 - Math.min(...pnlPts)) / ((Math.max(...pnlPts) - Math.min(...pnlPts)) || 1)) * (h - pad * 2)}
                  x2={w - pad} y2={h - pad - ((0 - Math.min(...pnlPts)) / ((Math.max(...pnlPts) - Math.min(...pnlPts)) || 1)) * (h - pad * 2)}
                  stroke="rgba(110,135,163,0.3)" strokeWidth={0.6} strokeDasharray="3 3" />
            <path d={linePath(pnlPts, w, h, pad)} fill="none" stroke={curveCls} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--mist)', fontSize: 10 }}>equity curve accruing — samples every 30s…</span>
          </div>
        )}
      </div>

      {/* module activity + honest framing */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, color: 'var(--mist)', fontFamily: '"JetBrains Mono", monospace', marginTop: 6 }}>
        <span>σ {f(data.sigmaPrice, 2)}</span>
        <span>κ {f(data.kappaPrice, 4)}</span>
        <span>regime h{data.regime?.haltCount ?? 0}/w{data.regime?.widenCount ?? 0}</span>
        <span>OFI R² {f(data.ofi?.r2, 4)}</span>
        <span>quotes {data.quoteCount ?? 0}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--mist)', opacity: 0.8, lineHeight: 1.5 }}>
        Out-of-sample PAPER forward-test of the A-S maker (live data, live quotes, simulated fills, INV-1).
        Net is fee-dominated below the data bar — measurement before any live sizing, not a profit claim.
      </div>
    </>
  );
}
