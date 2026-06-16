/**
 * MarketsTab.tsx
 *
 * Markets tab for the Observatory dashboard.
 *
 * - lightweight-charts v5 candlestick charts for BTC-USD and ETH-USD
 * - Paper positions / P&L table
 * - NO_TRADE log
 *
 * lightweight-charts v5 API:
 *   import { createChart, CandlestickSeries } from 'lightweight-charts'
 *   const chart = createChart(containerEl, options)
 *   const series = chart.addSeries(CandlestickSeries, seriesOptions)
 *   series.setData(bars)   — bars: { time: UTCTimestamp (unix seconds), open, high, low, close }
 *   chart.remove()         — dispose on unmount
 */

import { useEffect, useRef } from 'react';
import type React from 'react';
import type { MarketSnapshot, PaperState } from '../../hooks/useObservatoryStream';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  markets: Record<string, MarketSnapshot>;
  paper: PaperState;
}

// ── Candle chart ──────────────────────────────────────────────────────────────

function CandleChart({ snapshot }: { snapshot: MarketSnapshot }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let chart: ReturnType<typeof import('lightweight-charts')['createChart']> | null = null;

    // Dynamic import so tsc doesn't choke on the ESM-only package during type-check
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 220,
        layout: {
          background: { color: '#0d0d12' },
          textColor: '#94a3b8',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        crosshair: { mode: 1 },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.08)',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.08)',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      // Build bar data from bars array or lastBar fallback
      const bars = snapshot.bars && snapshot.bars.length > 0
        ? snapshot.bars
        : snapshot.lastBar
        ? [snapshot.lastBar]
        : [];

      if (bars.length > 0) {
        // timestamp = unix seconds = lightweight-charts UTCTimestamp directly
        const data = bars
          .filter(b => b && typeof b.timestamp === 'number' && isFinite(b.timestamp))
          .map(b => ({
            time: b.timestamp as number,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }))
          // must be strictly ascending by time
          .sort((a, b) => a.time - b.time)
          // deduplicate by time (keep last)
          .filter((v, i, arr) => i === arr.length - 1 || v.time !== arr[i + 1].time);

        if (data.length > 0) {
          series.setData(data as Parameters<typeof series.setData>[0]);
          chart.timeScale().fitContent();
        }
      }

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chart) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current);

      return () => ro.disconnect();
    }).catch(() => {
      // lightweight-charts unavailable — render empty
    });

    return () => {
      if (chart) {
        chart.remove();
        chart = null;
      }
    };
  }, [snapshot.market, snapshot.bars, snapshot.lastBar]);

  const lastPrice = snapshot.lastBar?.close;
  const hasError = Boolean(snapshot.error);
  // BUG-1 fix: server emits qualityGate.pass (not .passed)
  const notPassed = snapshot.qualityGate && snapshot.qualityGate.pass === false;

  return (
    <div className="obs-candle-card">
      <div className="obs-candle-header">
        <span className="obs-market-label">{snapshot.market}</span>
        <span className="obs-venue-label">{snapshot.venue}</span>
        {hasError && (
          <span className="obs-badge obs-badge--error">ERR</span>
        )}
        {notPassed && !hasError && (
          <span className="obs-badge obs-badge--warn">DQ</span>
        )}
        {lastPrice != null && (
          <span className="obs-price-label">${lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        )}
      </div>

      {hasError ? (
        <div className="obs-chart-error">
          <span>{snapshot.error}</span>
        </div>
      ) : (
        <div ref={containerRef} className="obs-chart-container" />
      )}
    </div>
  );
}

// ── Paper positions table ─────────────────────────────────────────────────────

function PaperTable({ paper }: { paper: PaperState }) {
  const positions = paper.positions ?? {};
  const entries = Object.values(positions);
  const noTrades = paper.noTrades ?? [];

  return (
    <div className="obs-paper-section">
      <div className="obs-section-title">Paper Positions</div>

      <div className="obs-paper-stats">
        <div className="obs-stat">
          <span className="obs-stat-label">P&amp;L</span>
          <span className={`obs-stat-value ${(paper.pnl ?? 0) >= 0 ? 'obs-green' : 'obs-red'}`}>
            {paper.pnl != null ? `$${paper.pnl.toFixed(2)}` : '—'}
          </span>
        </div>
        <div className="obs-stat">
          <span className="obs-stat-label">Drawdown</span>
          <span className="obs-stat-value obs-red">
            {paper.drawdown != null ? `${(paper.drawdown * 100).toFixed(2)}%` : '—'}
          </span>
        </div>
        <div className="obs-stat">
          <span className="obs-stat-label">Positions</span>
          <span className="obs-stat-value">{entries.length}</span>
        </div>
      </div>

      {entries.length > 0 ? (
        <table className="obs-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Current</th>
              <th>Unreal P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(pos => (
              <tr key={pos.market}>
                <td>{pos.market}</td>
                <td className={pos.side === 'long' ? 'obs-green' : 'obs-red'}>{pos.side.toUpperCase()}</td>
                <td>{pos.qty.toFixed(6)}</td>
                <td>${pos.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                <td>{pos.currentPrice != null ? `$${pos.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}</td>
                <td className={(pos.unrealisedPnl ?? 0) >= 0 ? 'obs-green' : 'obs-red'}>
                  {pos.unrealisedPnl != null ? `$${pos.unrealisedPnl.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="obs-empty">No open positions</div>
      )}

      {noTrades.length > 0 && (
        <div className="obs-no-trade-section">
          <div className="obs-section-title obs-section-title--sm">NO_TRADE log</div>
          <div className="obs-no-trade-list">
            {noTrades.map((reason, i) => (
              <div key={i} className="obs-no-trade-item">
                <span className="obs-badge obs-badge--neutral">NO_TRADE</span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Markets Tab ───────────────────────────────────────────────────────────────

const TARGET_MARKETS = ['BTC-USD', 'ETH-USD'];

export default function MarketsTab({ markets, paper }: Props) {
  // Prioritise target markets; fall back to whatever is available
  const displayed = TARGET_MARKETS
    .map(m => markets[m])
    .filter(Boolean as unknown as <T>(v: T | undefined) => v is T);

  // Include any additional markets beyond the two targets
  const extras = Object.values(markets).filter(m => !TARGET_MARKETS.includes(m.market));
  const all = [...displayed, ...extras];

  const isLoading = Object.keys(markets).length === 0;

  return (
    <div className="obs-tab-content">
      {isLoading ? (
        <div className="obs-loading">
          <span className="obs-spinner" />
          <span>Awaiting market data...</span>
        </div>
      ) : (
        <>
          <div className="obs-charts-grid">
            {all.length > 0 ? (
              all.map(snap => <CandleChart key={snap.market} snapshot={snap} />)
            ) : (
              TARGET_MARKETS.map(m => (
                <div key={m} className="obs-candle-card">
                  <div className="obs-candle-header">
                    <span className="obs-market-label">{m}</span>
                  </div>
                  <div className="obs-chart-error">No data</div>
                </div>
              ))
            )}
          </div>
          <PaperTable paper={paper} />
        </>
      )}
    </div>
  );
}
