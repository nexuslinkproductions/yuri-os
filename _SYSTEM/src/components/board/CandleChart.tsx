/**
 * CandleChart.tsx — SVG candlestick chart with Bollinger, EMA12, volume,
 * RSI sub-pane, and MACD sub-pane. Ported from mockup render functions.
 */

import type { OHLCVBar } from './api';
import type { ComputedIndicators } from './useBoardData';

interface Props {
  candles: OHLCVBar[];
  indicators: ComputedIndicators | null;
  loading: boolean;
  showBollinger: boolean;
  showEma: boolean;
  showRsi: boolean;
  showMacd: boolean;
  showVolume: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ChartMainProps {
  candles: OHLCVBar[];
  indicators: ComputedIndicators | null;
  showBollinger: boolean;
  showEma: boolean;
}

function ChartMain({ candles, indicators, showBollinger, showEma }: ChartMainProps) {
  if (candles.length === 0) return null;

  const W = 820, H = 180, padR = 52, padT = 6, padB = 6;
  const chartW = W - padR;
  const n = candles.length;

  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const minP = Math.min(...lows) * 0.997;
  const maxP = Math.max(...highs) * 1.003;
  const range = maxP - minP || 1;

  const yOf = (p: number) => padT + (maxP - p) / range * (H - padT - padB);
  const xOf = (i: number) => (i / Math.max(n - 1, 1)) * chartW;
  const cw = (chartW / n) * 0.65;

  // price axis labels
  const gridLines: React.ReactNode[] = [];
  for (let i = 0; i <= 4; i++) {
    const p = minP + (range * i / 4);
    const y = yOf(p);
    gridLines.push(
      <g key={i}>
        <line x1={0} y1={y.toFixed(1)} x2={chartW} y2={y.toFixed(1)} stroke="rgba(130,160,210,0.04)" strokeWidth={0.5} />
        <text x={W - 3} y={(y + 3).toFixed(1)} textAnchor="end" fill="rgba(110,135,163,0.6)" fontSize={8} fontFamily="JetBrains Mono">{fmtPrice(p)}</text>
      </g>
    );
  }

  // Bollinger
  let bollingerEl: React.ReactNode = null;
  if (showBollinger && indicators?.bb) {
    const bb = indicators.bb;
    const startIdx = bb.upper.findIndex(v => v !== null);
    if (startIdx >= 0) {
      // area
      let area = '';
      for (let i = startIdx; i < n; i++) {
        const v = bb.upper[i];
        if (v !== null) area += (i === startIdx ? 'M' : 'L') + xOf(i).toFixed(1) + ',' + yOf(v).toFixed(1);
      }
      for (let i = n - 1; i >= startIdx; i--) {
        const v = bb.lower[i];
        if (v !== null) area += 'L' + xOf(i).toFixed(1) + ',' + yOf(v).toFixed(1);
      }
      area += ' Z';

      const mkPath = (arr: (number | null)[]) => arr.map((v, i) =>
        v !== null ? `${i === startIdx ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}` : ''
      ).filter(Boolean).join(' ');

      bollingerEl = (
        <g>
          <defs>
            <linearGradient id="bb-fill-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(130,160,210,0.06)" />
              <stop offset="100%" stopColor="rgba(130,160,210,0.02)" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#bb-fill-grad)" />
          <path d={mkPath(bb.upper)} fill="none" stroke="rgba(130,160,210,0.25)" strokeWidth={0.7} />
          <path d={mkPath(bb.lower)} fill="none" stroke="rgba(130,160,210,0.25)" strokeWidth={0.7} />
          <path d={mkPath(bb.middle)} fill="none" stroke="rgba(130,160,210,0.18)" strokeWidth={0.6} strokeDasharray="3 3" />
        </g>
      );
    }
  }

  // Candles
  const candleEls = candles.map((c, i) => {
    const x = xOf(i);
    const up = c.close >= c.open;
    const color = up ? '#34e6a0' : '#ff5470';
    const bodyTop = yOf(Math.max(c.open, c.close));
    const bodyBot = yOf(Math.min(c.open, c.close));
    const bh = Math.max(bodyBot - bodyTop, 1);
    return (
      <g key={c.timestamp}>
        <line x1={x.toFixed(1)} y1={yOf(c.high).toFixed(1)} x2={x.toFixed(1)} y2={yOf(c.low).toFixed(1)} stroke={color} strokeWidth={1} opacity={0.55} />
        <rect x={(x - cw / 2).toFixed(1)} y={bodyTop.toFixed(1)} width={cw.toFixed(1)} height={bh.toFixed(1)} fill={color} opacity={0.72} rx={0.5} />
      </g>
    );
  });

  // EMA
  let emaEl: React.ReactNode = null;
  if (showEma && indicators?.ema12 && indicators.ema12.length === n) {
    const path = indicators.ema12.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    emaEl = <path d={path} fill="none" stroke="#9df2ff" strokeWidth={1.2} opacity={0.65} strokeLinejoin="round" />;
  }

  // current price line
  const curPrice = candles[n - 1].close;
  const curY = yOf(curPrice);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {gridLines}
      {bollingerEl}
      {candleEls}
      {emaEl}
      <line x1={0} y1={curY.toFixed(1)} x2={chartW} y2={curY.toFixed(1)} stroke="rgba(0,200,240,0.3)" strokeWidth={0.5} strokeDasharray="4 3" />
      <rect x={chartW} y={(curY - 7).toFixed(1)} width={padR} height={14} fill="rgba(0,200,240,0.15)" rx={2} />
      <text x={W - 3} y={(curY + 3).toFixed(1)} textAnchor="end" fill="#9df2ff" fontSize={9} fontFamily="JetBrains Mono" fontWeight={600}>{fmtPrice(curPrice)}</text>
    </svg>
  );
}

function VolumeChart({ candles }: { candles: OHLCVBar[] }) {
  if (candles.length === 0) return null;
  const W = 820, H = 34, padR = 52, pad = 2;
  const chartW = W - padR;
  const n = candles.length;
  const maxVol = Math.max(...candles.map(c => c.volume));
  const xOf = (i: number) => (i / Math.max(n - 1, 1)) * chartW;
  const cw = (chartW / n) * 0.65;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {candles.map((c, i) => {
        const x = xOf(i);
        const h = (c.volume / maxVol) * (H - pad * 2);
        const up = c.close >= c.open;
        return (
          <rect
            key={c.timestamp}
            x={(x - cw / 2).toFixed(1)} y={(H - pad - h).toFixed(1)}
            width={cw.toFixed(1)} height={Math.max(h, 0.5).toFixed(1)}
            fill={up ? 'rgba(52,230,160,0.35)' : 'rgba(255,84,112,0.35)'} rx={0.5}
          />
        );
      })}
      <text x={W - 3} y={10} textAnchor="end" fill="rgba(110,135,163,0.5)" fontSize={7} fontFamily="JetBrains Mono">VOL</text>
    </svg>
  );
}

function RsiChart({ rsi }: { rsi: number[] }) {
  if (rsi.length === 0) return null;
  const W = 820, H = 42, padR = 52, pad = 3;
  const chartW = W - padR;
  const n = rsi.length;
  const yOf = (v: number) => pad + (100 - v) / 100 * (H - pad * 2);
  const xOf = (i: number) => (i / Math.max(n - 1, 1)) * chartW;

  const path = rsi.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const cur = rsi[n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      <line x1={0} y1={yOf(70).toFixed(1)} x2={chartW} y2={yOf(70).toFixed(1)} stroke="rgba(255,84,112,0.15)" strokeWidth={0.5} strokeDasharray="2 2" />
      <line x1={0} y1={yOf(50).toFixed(1)} x2={chartW} y2={yOf(50).toFixed(1)} stroke="rgba(130,160,210,0.06)" strokeWidth={0.5} />
      <line x1={0} y1={yOf(30).toFixed(1)} x2={chartW} y2={yOf(30).toFixed(1)} stroke="rgba(52,230,160,0.15)" strokeWidth={0.5} strokeDasharray="2 2" />
      <text x={W - 3} y={(yOf(70) + 3).toFixed(1)} textAnchor="end" fill="rgba(255,84,112,0.4)" fontSize={7} fontFamily="JetBrains Mono">70</text>
      <text x={W - 3} y={(yOf(30) + 3).toFixed(1)} textAnchor="end" fill="rgba(52,230,160,0.4)" fontSize={7} fontFamily="JetBrains Mono">30</text>
      <path d={path} fill="none" stroke="#9df2ff" strokeWidth={1} opacity={0.7} strokeLinejoin="round" />
      <text x={W - 3} y={(yOf(cur) - 4).toFixed(1)} textAnchor="end" fill="#9df2ff" fontSize={8} fontFamily="JetBrains Mono" fontWeight={600}>{cur.toFixed(1)}</text>
    </svg>
  );
}

function MacdChart({ macd }: { macd: ComputedIndicators['macd'] }) {
  if (macd.histogram.length === 0) return null;
  const W = 820, H = 42, padR = 52, pad = 3;
  const chartW = W - padR;
  const n = macd.histogram.length;
  const allVals = [...macd.histogram, ...macd.macdLine, ...macd.signalLine];
  const maxAbs = Math.max(...allVals.map(Math.abs)) * 1.15 || 1;
  const yOf = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - pad);
  const xOf = (i: number) => (i / Math.max(n - 1, 1)) * chartW;
  const cw = (chartW / n) * 0.65;

  const macdPath = macd.macdLine.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const sigPath = macd.signalLine.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      <line x1={0} y1={(H / 2).toFixed(1)} x2={chartW} y2={(H / 2).toFixed(1)} stroke="rgba(130,160,210,0.1)" strokeWidth={0.5} />
      {macd.histogram.map((h, i) => {
        const x = xOf(i);
        const top = h >= 0 ? yOf(h) : H / 2;
        const height = Math.abs(yOf(h) - H / 2);
        return (
          <rect key={i} x={(x - cw / 2).toFixed(1)} y={top.toFixed(1)} width={cw.toFixed(1)} height={Math.max(height, 0.5).toFixed(1)}
            fill={h >= 0 ? 'rgba(52,230,160,0.45)' : 'rgba(255,84,112,0.45)'} rx={0.5} />
        );
      })}
      <path d={macdPath} fill="none" stroke="#00c8f0" strokeWidth={0.8} opacity={0.7} strokeLinejoin="round" />
      <path d={sigPath} fill="none" stroke="#f5a623" strokeWidth={0.8} opacity={0.7} strokeLinejoin="round" />
    </svg>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function CandleChart({
  candles, indicators, loading,
  showBollinger, showEma, showRsi, showMacd, showVolume,
}: Props) {
  if (loading && candles.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="bb-skeleton" style={{ height: 180, borderRadius: 8 }} />
        <div className="bb-skeleton" style={{ height: 34 }} />
        <div className="bb-skeleton" style={{ height: 42 }} />
      </div>
    );
  }

  if (candles.length === 0) {
    return <div className="bb-empty">No candle data for this market / timeframe.</div>;
  }

  return (
    <>
      <div className="bb-chart-main">
        <ChartMain candles={candles} indicators={indicators} showBollinger={showBollinger} showEma={showEma} />
      </div>
      {showVolume && (
        <div className="bb-chart-vol">
          <VolumeChart candles={candles} />
        </div>
      )}
      {showRsi && indicators && (
        <div className="bb-chart-sub">
          <span className="bb-sub-label">RSI 14</span>
          <div className="bb-sub-viz">
            <RsiChart rsi={indicators.rsi} />
          </div>
        </div>
      )}
      {showMacd && indicators && (
        <div className="bb-chart-sub">
          <span className="bb-sub-label">MACD</span>
          <div className="bb-sub-viz">
            <MacdChart macd={indicators.macd} />
          </div>
        </div>
      )}
    </>
  );
}
