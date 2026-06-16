/**
 * MarketsTab.tsx
 *
 * Markets tab — asymmetric Ma layout, deck design, per-chart timeframe selector,
 * regime badge + signal chips inline, live candle polling.
 */

import { useEffect, useRef, useState } from 'react';
import type { MarketSnapshot, PaperState, RegimeState, OHLCVBar } from '../../hooks/useObservatoryStream';

const HOST = ((import.meta.env as Record<string, string>).VITE_OBSERVATORY_BASE) ?? '';
const BASE = `${HOST}/api/observatory`;

interface Props {
  markets: Record<string, MarketSnapshot>;
  paper: PaperState;
  regimes?: Record<string, RegimeState>;
}

interface TfOption {
  id: string;
  label: string;
  sec: number;
  supported: boolean;
  reason?: string;
}

// ── Timeframe hook ────────────────────────────────────────────────────────────

function useTfOptions(venue: string) {
  const [tfs, setTfs] = useState<TfOption[]>([]);
  useEffect(() => {
    fetch(`${BASE}/timeframes?venue=${encodeURIComponent(venue)}`, { signal: AbortSignal.timeout(8000) })
      .then(r => r.ok ? r.json() as Promise<TfOption[]> : Promise.resolve([]))
      .then(setTfs)
      .catch(() => {});
  }, [venue]);
  return tfs;
}

// ── Candle chart with timeframe selector ──────────────────────────────────────

interface ChartProps {
  snapshot: MarketSnapshot;
  tfs: TfOption[];
  isPrimary?: boolean;
  regime?: RegimeState;
}

function MarketChart({ snapshot, tfs, isPrimary, regime }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);

  const [activeTf, setActiveTf] = useState('5m');
  const [tfLoading, setTfLoading] = useState(false);
  const [candlesData, setCandlesData] = useState<OHLCVBar[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastPrice = snapshot.lastPrice ?? snapshot.lastBar?.close;
  const isPolymarket = snapshot.venue === 'polymarket';
  const displayTitle = isPolymarket && snapshot.question ? snapshot.question : snapshot.market;
  const priceDisplay = lastPrice != null
    ? isPolymarket
      ? `${(lastPrice * 100).toFixed(1)}%`
      : `$${lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  const hasError = Boolean(snapshot.error);
  const notPassed = snapshot.qualityGate && snapshot.qualityGate.pass === false;

  // Fetch candles for the active timeframe
  const fetchCandles = (tf: string) => {
    const venue = snapshot.venue ?? 'coinbase';
    return fetch(
      `${BASE}/candles?market=${encodeURIComponent(snapshot.market)}&tf=${tf}&venue=${encodeURIComponent(venue)}`,
      { signal: AbortSignal.timeout(10000) },
    )
      .then(res => {
        if (!res.ok) return null;
        return res.json() as Promise<{ supported: boolean; candles?: OHLCVBar[]; reason?: string }>;
      })
      .then(json => {
        if (!json || !json.supported || !json.candles) return null;
        return json.candles;
      })
      .catch(() => null);
  };

  // Load candles when tf changes
  useEffect(() => {
    const tf = tfs.find(t => t.id === activeTf);
    if (!tf || !tf.supported) {
      setCandlesData(null);
      return;
    }
    setTfLoading(true);
    fetchCandles(activeTf).then(data => {
      setTfLoading(false);
      if (data) setCandlesData(data);
    });

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchCandles(activeTf).then(data => { if (data) setCandlesData(data); });
    }, 15000);

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTf, tfs, snapshot.market, snapshot.venue]);

  // Build the bar array to render
  const barsToRender: OHLCVBar[] = candlesData
    ?? (snapshot.bars && snapshot.bars.length > 0 ? snapshot.bars : snapshot.lastBar ? [snapshot.lastBar] : []);

  // Chart init
  useEffect(() => {
    if (!containerRef.current) return;
    const height = isPrimary ? 260 : 180;

    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      if (!containerRef.current) return;

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }

      chartRef.current = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { color: '#04070f' },
          textColor: '#42546b',
          fontFamily: '"SF Mono",ui-monospace,Menlo,Consolas,monospace',
        },
        grid: {
          vertLines: { color: 'rgba(232,242,252,.05)' },
          horzLines: { color: 'rgba(232,242,252,.05)' },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: 'rgba(232,242,252,.06)' },
        timeScale: {
          borderColor: 'rgba(232,242,252,.06)',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
        upColor:         '#46e3c2',
        downColor:       '#e8453a',
        borderUpColor:   '#46e3c2',
        borderDownColor: '#e8453a',
        wickUpColor:     '#46e3c2',
        wickDownColor:   '#e8453a',
      });

      const data = barsToRender
        .filter(b => b && typeof b.timestamp === 'number' && isFinite(b.timestamp))
        .map(b => ({ time: b.timestamp as number, open: b.open, high: b.high, low: b.low, close: b.close }))
        .sort((a, b) => a.time - b.time)
        .filter((v, i, arr) => i === arr.length - 1 || v.time !== arr[i + 1].time);

      if (data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seriesRef.current.setData(data as any);
        chartRef.current.timeScale().fitContent();
      }

      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }).catch(() => {});

    return () => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.market, isPrimary]);

  // Update series data without recreating chart
  useEffect(() => {
    if (!seriesRef.current) return;
    const data = barsToRender
      .filter(b => b && typeof b.timestamp === 'number' && isFinite(b.timestamp))
      .map(b => ({ time: b.timestamp as number, open: b.open, high: b.high, low: b.low, close: b.close }))
      .sort((a, b) => a.time - b.time)
      .filter((v, i, arr) => i === arr.length - 1 || v.time !== arr[i + 1].time);
    if (data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seriesRef.current.setData(data as any);
      chartRef.current?.timeScale().fitContent();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barsToRender]);

  // Regime summary
  const rec = regime?.recommendation;
  const recColor: Record<string, string> = {
    LONG: 'var(--d-jade)', SHORT: 'var(--d-verm)',
    NO_TRADE: 'var(--d-mist)', HOLD: '#f0a500', RECOMPUTE_CIRCUIT: '#f0a500',
  };
  const recUpperColor = rec ? (recColor[rec.toUpperCase()] ?? 'var(--d-mist)') : null;

  // Signal chips (price signals only, max 4)
  const signals = (snapshot.signals ?? [])
    .filter(s => !s.source && !s.factorId?.startsWith('perp-') && !s.factorId?.startsWith('social-'))
    .slice(0, 4);

  return (
    <div>
      {/* Header row */}
      <div className="d-mkt-header">
        {isPrimary ? (
          <span className="d-mkt-name" title={snapshot.market}>{displayTitle}</span>
        ) : (
          <span className="d-mkt-name-sm" title={snapshot.market}>{displayTitle}</span>
        )}
        <span className="d-mkt-venue">{snapshot.venue}</span>
        {isPolymarket && <span className="obs-badge obs-badge--poly">POLY</span>}
        {hasError && <span className="obs-badge obs-badge--error">ERR</span>}
        {notPassed && !hasError && <span className="obs-badge obs-badge--warn">DQ</span>}
        {priceDisplay != null && (
          isPrimary
            ? <span className="d-mkt-price">{priceDisplay}</span>
            : <span className="d-mkt-price-sm">{priceDisplay}</span>
        )}
      </div>

      {/* Timeframe selector */}
      {tfs.length > 0 && (
        <div className="d-tf-row">
          {tfs.map(tf => (
            <button
              key={tf.id}
              className={`d-tf-pill ${activeTf === tf.id ? 'active' : ''}`}
              disabled={!tf.supported}
              title={!tf.supported ? (tf.reason ?? 'unsupported') : tf.label}
              onClick={() => tf.supported && setActiveTf(tf.id)}
            >
              {tf.label}
            </button>
          ))}
          {tfLoading && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--d-mist)', alignSelf: 'center', marginLeft: 4 }}>
              loading…
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      {hasError ? (
        <div className="obs-chart-error"><span>{snapshot.error}</span></div>
      ) : (
        <div ref={containerRef} className={isPrimary ? 'obs-chart-container' : 'obs-chart-container-sm'} />
      )}

      {/* Meta row: quality, regime, signals */}
      <div className="d-mkt-meta">
        {snapshot.qualityGate?.pass === true && (
          <div className="d-mkt-meta-item">
            <span className="d-section-tag">Gate</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--d-jade)' }}>PASS</span>
          </div>
        )}
        {rec && (
          <div className="d-mkt-meta-item">
            <span className="d-section-tag">Regime</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: recUpperColor ?? 'var(--d-mist)' }}>
              {rec.toUpperCase()}
            </span>
          </div>
        )}
        {typeof snapshot.pnl === 'number' && (
          <div className="d-mkt-meta-item">
            <span className="d-section-tag">P&amp;L</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: snapshot.pnl >= 0 ? 'var(--d-jade)' : 'var(--d-verm)' }}>
              {snapshot.pnl >= 0 ? '+$' : '-$'}{Math.abs(snapshot.pnl).toFixed(2)}
            </span>
          </div>
        )}
        {snapshot.drawdown != null && (
          <div className="d-mkt-meta-item">
            <span className="d-section-tag">DD</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--d-verm)' }}>
              {(snapshot.drawdown * 100).toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Signal chips */}
      {signals.length > 0 && (
        <div className="d-signal-row">
          {signals.map(s => (
            <span key={s.factorId} className={`d-signal-chip ${s.side}`}>
              {s.factorId.replace(/^obs-/, '').slice(0, 12)}
              <span style={{ opacity: .6 }}>{(s.confidence * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      )}

      {/* Self-explaining caption */}
      <p className="d-caption">
        Price + candles from live SSE feed. Green/red = jade/vermilion candles (long/short signals).
        Regime badge from CUSUM detector.
      </p>
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
      <span className="obs-section-title">Paper Positions</span>
      <p className="d-caption" style={{ marginBottom: 16 }}>Simulated paper positions — no real capital at risk.</p>

      <div className="obs-paper-stats">
        <div className="obs-stat">
          <span className="obs-stat-label">P&amp;L</span>
          <span className={`obs-stat-value ${(typeof paper.pnl === 'number' ? paper.pnl : 0) >= 0 ? 'obs-green' : 'obs-red'}`}>
            {typeof paper.pnl === 'number' ? `$${paper.pnl.toFixed(2)}` : '—'}
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

export default function MarketsTab({ markets, paper, regimes }: Props) {
  const isLoading = Object.keys(markets).length === 0;

  const displayed = TARGET_MARKETS
    .map(m => markets[m])
    .filter((v): v is MarketSnapshot => Boolean(v));

  const extras = Object.values(markets).filter(m => !TARGET_MARKETS.includes(m.market));
  const all = [...displayed, ...extras];
  const [primary, ...secondaries] = all;

  const primaryVenue = primary?.venue ?? 'coinbase';
  const tfs = useTfOptions(primaryVenue);

  if (isLoading) {
    return (
      <div className="obs-tab-content">
        <div className="obs-loading">
          <span className="obs-spinner" />
          <span>Awaiting market data...</span>
        </div>
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="obs-tab-content">
        <div className="obs-empty">No market data available</div>
      </div>
    );
  }

  return (
    <div className="obs-tab-content">
      <div className="d-market-grid">
        {/* Primary market — larger */}
        <div>
          {primary && (
            <MarketChart
              snapshot={primary}
              tfs={tfs}
              isPrimary
              regime={regimes?.[primary.market]}
            />
          )}
        </div>

        {/* Secondary markets — tighter */}
        {secondaries.length > 0 && (
          <div className="d-market-secondaries">
            {secondaries.map(snap => (
              <MarketChart
                key={snap.market}
                snapshot={snap}
                tfs={tfs}
                isPrimary={false}
                regime={regimes?.[snap.market]}
              />
            ))}
          </div>
        )}
      </div>

      <PaperTable paper={paper} />
    </div>
  );
}
