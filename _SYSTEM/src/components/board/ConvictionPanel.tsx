/**
 * ConvictionPanel.tsx — YURI's Read (per-market conviction bars).
 * Driven by real signals from /markets.
 */

import { useState, useEffect, useRef } from 'react';
import type { MarketData } from './api';

interface Props {
  markets: Record<string, MarketData>;
  visibleMarkets: string[];
}

const THINK_TEXTS = [
  'evaluating regime · multi-market · live signals',
  'CUSUM regime shift scan · active',
  'recalibrating conviction · real signals',
  'factor health check · momentum active',
  'energy gate monitoring · ΔU within threshold',
  'order book pressure analysis · live',
  'social + perp overlays merged',
  'circuit ordering · quantum sequencing',
];

export default function ConvictionPanel({ markets, visibleMarkets }: Props) {
  const [thinkText, setThinkText] = useState(THINK_TEXTS[0]);
  const idxRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % THINK_TEXTS.length;
      setThinkText(THINK_TEXTS[idxRef.current]);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const rows = visibleMarkets.map(mkt => {
    const data = markets[mkt];
    const sym = mkt.replace('-USD', '');
    // Primary signal: prefer momentum (no source)
    const signals = data?.signals ?? [];
    const primary = signals.find(s => !s.source) ?? signals[0] ?? null;
    const side: 'long' | 'short' | 'neutral' = primary?.side ?? 'neutral';
    const conf = primary ? Math.round(primary.confidence * 100) : 0;
    const sideLabel = side === 'long' ? 'LONG' : side === 'short' ? 'SHORT' : 'NEUT';

    return { sym, side, conf, sideLabel };
  });

  const marketCount = visibleMarkets.length;
  const signalCount = rows.filter(r => r.conf > 0).length;

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">YURI's Read</span>
        <span className="bb-panel-sub">Conviction · {marketCount} markets</span>
      </div>
      <div className="bb-conv-list">
        {rows.map(r => (
          <div key={r.sym} className="bb-conv-row">
            <span className="bb-conv-sym">{r.sym}</span>
            <div className="bb-conv-meter">
              <div className={`bb-conv-meter-fill ${r.side}`} style={{ width: r.conf + '%' }} />
              <div className="bb-conv-meter-pulse" />
            </div>
            <div className="bb-conv-read">
              <span className={`bb-conv-side ${r.side}`}>{r.sideLabel}</span>
              <span className="bb-conv-pct">{r.conf}%</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="bb-empty">Loading markets…</div>}
      </div>
      <div className="bb-thinking">
        <span className="bb-thinking-label">Cortex</span>
        <div className="bb-thinking-wave">
          <span /><span /><span /><span /><span />
        </div>
        <span className="bb-thinking-text">{thinkText} · {signalCount} signals</span>
      </div>
    </>
  );
}
