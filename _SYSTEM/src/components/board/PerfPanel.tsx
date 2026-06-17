/**
 * PerfPanel.tsx — Paper Performance panel.
 * Aggregates real equity/P&L/DD across all paper markets.
 * Draws a simple SVG equity curve from per-market equity values.
 */

import type { PaperMarketData } from './api';

interface Props {
  paperData: Record<string, PaperMarketData>;
  visibleMarkets: string[];
}

function linePath(pts: number[], w: number, h: number, pad: number): string {
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = (max - min) || 1;
  const step = (w - pad * 2) / Math.max(pts.length - 1, 1);
  return pts.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
}

function areaPath(pts: number[], w: number, h: number, pad: number): string {
  const step = (w - pad * 2) / Math.max(pts.length - 1, 1);
  const lastX = pad + (pts.length - 1) * step;
  const baseY = h - pad;
  return linePath(pts, w, h, pad) + ' L' + lastX.toFixed(1) + ',' + baseY + ' L' + pad + ',' + baseY + ' Z';
}

function fmtUSD(v: number): string {
  if (Math.abs(v) >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2);
}

function fmtBps(bps: number): string {
  return (bps >= 0 ? '+' : '') + bps.toFixed(0) + ' bps';
}

export default function PerfPanel({ paperData, visibleMarkets }: Props) {
  const cryptoMarkets = visibleMarkets.filter(m => !m.startsWith('poly-'));

  // Aggregate across crypto markets
  let totalEquity = 0;
  let totalInitial = 0;
  let maxDd = 0;
  let totalReturnBps = 0;
  let marketCount = 0;

  for (const mkt of cryptoMarkets) {
    const d = paperData[mkt];
    if (!d?.pnl) continue;
    totalEquity += d.pnl.equity;
    totalInitial += d.pnl.initialEquity;
    if (d.pnl.maxDrawdownBps > maxDd) maxDd = d.pnl.maxDrawdownBps;
    totalReturnBps += d.pnl.totalReturnBps;
    marketCount++;
  }

  const netPnl = totalEquity - totalInitial;
  const pnlCls = netPnl >= 0 ? 'pos' : 'neg';
  const ddCls = maxDd > 200 ? 'neg' : 'flat'; // >2% drawdown = red

  // Build equity curve: use one equity point per market as a synthetic curve
  // This is a placeholder visualization; real equity curve would need history
  const equityPts: number[] = cryptoMarkets
    .map(m => paperData[m]?.pnl?.equity ?? 0)
    .filter(v => v > 0);

  // If we have at least 2 data points, draw a simple comparison line
  const hasData = equityPts.length >= 2;
  const w = 520, h = 100, pad = 6;

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Paper Performance</span>
        <span className="bb-panel-sub">{marketCount} active markets</span>
      </div>

      <div className="bb-pnl-stats">
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Total Equity</span>
          <span className={`bb-pnl-stat-val ${pnlCls}`}>
            {totalEquity > 0 ? '$' + totalEquity.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
          </span>
          <span className="bb-pnl-stat-sub">
            started ${totalInitial > 0 ? totalInitial.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
          </span>
        </div>
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Net P&amp;L</span>
          <span className={`bb-pnl-stat-val ${pnlCls}`}>
            {totalEquity > 0 ? fmtUSD(netPnl) : '—'}
          </span>
          <span className="bb-pnl-stat-sub">{fmtBps(totalReturnBps)}</span>
        </div>
        <div className="bb-pnl-stat">
          <span className="bb-pnl-stat-label">Max DD</span>
          <span className={`bb-pnl-stat-val ${ddCls}`}>
            {maxDd > 0 ? (maxDd / 100).toFixed(2) + '%' : '—'}
          </span>
          <span className="bb-pnl-stat-sub">{marketCount} markets</span>
        </div>
      </div>

      <div className="bb-pnl-chart">
        {hasData ? (
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="pnl-eq-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,200,240,0.16)" />
                <stop offset="100%" stopColor="rgba(0,200,240,0)" />
              </linearGradient>
            </defs>
            <path d={areaPath(equityPts, w, h, pad)} fill="url(#pnl-eq-grad)" />
            <path d={linePath(equityPts, w, h, pad)} fill="none" stroke="#00c8f0" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--mist)', fontSize: 10 }}>Equity data loading…</span>
          </div>
        )}
      </div>

      <div className="bb-pnl-legend">
        <span className="bb-legend-item">
          <span className="bb-dot paper" />
          Paper{totalEquity > 0 ? ' $' + totalEquity.toLocaleString('en-US', { maximumFractionDigits: 0 }) : ''}
        </span>
        <span className="bb-legend-item" style={{ color: 'var(--mist)' }}>
          <span className="bb-dot real" />
          Real account — pending API key
        </span>
      </div>
    </>
  );
}
