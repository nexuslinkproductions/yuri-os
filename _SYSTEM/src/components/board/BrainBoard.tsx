/**
 * BrainBoard.tsx — YURI Cognitive Trading Deck.
 * Wires all board panels into the mockup layout.
 * Receives live ObservatoryState from useObservatoryStream (SSE+REST)
 * and manages board-local state (active market, tf, indicator toggles)
 * via useBoardData.
 */

import { useState, useEffect, useRef } from 'react';
import type { ObservatoryState } from '../../hooks/useObservatoryStream';
import { useBoardData } from './useBoardData';
import type { PaperPosition } from './api';
import type { EnergyResponse } from './api';

import CandleChart from './CandleChart';
import OrderBook from './OrderBook';
import IntentPanel from './IntentPanel';
import ConvictionPanel from './ConvictionPanel';
import PerfPanel from './PerfPanel';
import CalibrationPanel from './CalibrationPanel';
import GraduationPanel from './GraduationPanel';
import TradesPanel from './TradesPanel';
import PerpTrainerPanel from './PerpTrainerPanel';
import AsQuotePanel from './AsQuotePanel';

import './board.css';

interface Props {
  obs: ObservatoryState;
}

// Markets shown in the switcher (filter poly-*)
function getVisibleMarkets(markets: Record<string, unknown>): string[] {
  return Object.keys(markets).filter(k => !k.startsWith('poly-'));
}

const DEFAULT_TF = '5m';

function fmtPrice(p: number | undefined): string {
  if (p == null) return '—';
  if (p < 0.01) return '$' + p.toFixed(6);
  if (p < 1) return '$' + p.toFixed(4);
  if (p < 100) return '$' + p.toFixed(2);
  return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPnl(v: number | undefined): { text: string; cls: string } {
  if (v == null || !Number.isFinite(v)) return { text: '—', cls: '' };
  const abs = Math.abs(v);
  const sign = v >= 0 ? '+$' : '-$';
  const text = abs >= 1000
    ? sign + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : sign + abs.toFixed(2);
  return { text, cls: v >= 0 ? 'pos' : 'neg' };
}

function Clock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setT(pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="bb-live-time">{t}</span>;
}

// Pulse value on change
function PulseVal({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current && ref.current) {
      prev.current = value;
      ref.current.classList.remove('pulse');
      void ref.current.offsetWidth;
      ref.current.classList.add('pulse');
      const t = setTimeout(() => ref.current?.classList.remove('pulse'), 900);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return <span ref={ref} className={`bb-hstat-val ${className ?? ''}`}>{value}</span>;
}

export default function BrainBoard({ obs }: Props) {
  const visibleMarkets = getVisibleMarkets(obs.markets);
  const [activeMkt, setActiveMkt] = useState<string>('BTC-USD');
  const [activeTf, setActiveTf] = useState<string>(DEFAULT_TF);
  const [dropOpen, setDropOpen] = useState(false);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(true);

  // Board-local data: candles, orderbook, timeframes, calibration, graduation
  const board = useBoardData(activeMkt, activeTf);

  // Fallback: if active market drops out of list, snap to first
  useEffect(() => {
    if (visibleMarkets.length > 0 && !visibleMarkets.includes(activeMkt)) {
      setActiveMkt(visibleMarkets[0]);
    }
  }, [visibleMarkets, activeMkt]);

  const mktData = obs.markets[activeMkt] ?? null;
  const livePrice = mktData?.lastPrice ?? mktData?.bars?.[mktData.bars.length - 1]?.close;
  const primarySignal = mktData?.signals?.find(s => !s.source) ?? mktData?.signals?.[0] ?? undefined;

  // Aggregate paper positions across all visible crypto markets
  const allPositions: PaperPosition[] = visibleMarkets.flatMap(mkt => {
    const data = obs.markets[mkt];
    return (data?.paperPositions ?? []) as PaperPosition[];
  });

  // Aggregate paper P&L for header
  let totalPnl = 0;
  let totalInitial = 0;
  let totalEquity = 0;
  for (const mkt of visibleMarkets) {
    const d = obs.markets[mkt];
    if (!d?.pnl || typeof d.pnl !== 'object') continue;
    const p = d.pnl as { equity?: number; initialEquity?: number };
    if (typeof p.equity === 'number') totalEquity += p.equity;
    if (typeof p.initialEquity === 'number') totalInitial += p.initialEquity;
  }
  totalPnl = totalEquity - totalInitial;

  const pnlFmt = fmtPnl(totalPnl);
  const baseSym = activeMkt.replace('-USD', '');

  // Paper P&L from the authoritative /paper endpoint — the SSE-merged market state does NOT
  // reliably carry the pnl object (that produced NaN/—). board.paper is polled ~4s direct from REST.
  const paperData = board.paper;

  // Gainers ticker: compute % change from first to last bar for each market
  const tickerItems = visibleMarkets.map(mkt => {
    const d = obs.markets[mkt];
    const bars = d?.bars ?? [];
    const sym = mkt.replace('-USD', '');
    if (bars.length < 2) return { sym, chg: 0 };
    const first = bars[0].close;
    const last = bars[bars.length - 1].close;
    const chg = first > 0 ? ((last - first) / first) * 100 : 0;
    return { sym, chg };
  }).sort((a, b) => b.chg - a.chg);

  const energy: EnergyResponse | null = obs.energy?.deltaU != null
    ? { deltaU: obs.energy.deltaU, accept: obs.energy.accept ?? true, reason: obs.energy.reason ?? '' }
    : null;

  // Timeframes from board (once loaded)
  const tfs = board.timeframes.length > 0 ? board.timeframes : [{ id: '1m', label: '1m', sec: 60, supported: true }, { id: '5m', label: '5m', sec: 300, supported: true }, { id: '1h', label: '1h', sec: 3600, supported: true }];

  return (
    <div className="bb-root">
      <div className="bb-ambient" />
      <div className="bb-shell">

        {/* ═══ HEADER ═══ */}
        <header className="bb-header">
          <div className="bb-brand">
            <div className="bb-mark">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 L12 21 M6 7 L18 17 M18 7 L6 17" stroke="#9df2ff" strokeWidth={1.6} strokeLinecap="round" opacity={0.9} />
                <circle cx={12} cy={12} r={2.4} fill="#00c8f0" opacity={0.85} />
              </svg>
            </div>
            <div className="bb-brand-text">
              <span className="bb-brand-name">YURI</span>
              <span className="bb-brand-sub">Brain Board</span>
            </div>
          </div>

          {/* Asset selector */}
          <div className="bb-asset-sel" onClick={() => setDropOpen(o => !o)}>
            <span className="bb-asset-sel-sym">{activeMkt}</span>
            <span className="bb-asset-sel-arrow">▾</span>
            {dropOpen && (
              <div className="bb-asset-dropdown" onClick={e => e.stopPropagation()}>
                {visibleMarkets.map(m => (
                  <button
                    key={m}
                    className={`bb-asset-option ${m === activeMkt ? 'active' : ''}`}
                    onClick={() => { setActiveMkt(m); setDropOpen(false); }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Header stats */}
          <div className="bb-header-stats">
            <div className="bb-hstat">
              <span className="bb-hstat-label">Last</span>
              <PulseVal value={fmtPrice(livePrice)} />
            </div>
            <div className="bb-hstat">
              <span className="bb-hstat-label">Cycle</span>
              <PulseVal value={String(obs.health?.cycleCount ?? 0)} />
            </div>
            <div className="bb-hstat">
              <span className="bb-hstat-label">Markets</span>
              <PulseVal value={String(visibleMarkets.length)} />
            </div>
            <div className="bb-hstat">
              <span className="bb-hstat-label">Paper P&amp;L</span>
              <PulseVal value={pnlFmt.text} className={pnlFmt.cls} />
            </div>
            <div className="bb-hstat">
              <span className="bb-hstat-label">Regime</span>
              <PulseVal
                value={mktData?.regime?.regimeShift ? 'SHIFT' : 'VALID'}
                className={mktData?.regime?.regimeShift ? 'neg' : 'pos'}
              />
            </div>
          </div>

          <div className="bb-action-chips">
            <span className="bb-chip active">Paper</span>
            <span className="bb-chip">Live</span>
          </div>

          <div className="bb-live">
            <span className={`bb-live-dot ${obs.connected ? '' : 'offline'}`} />
            <span className={`bb-live-text ${obs.connected ? '' : 'offline'}`}>
              {obs.connected ? 'LIVE' : 'RECONNECTING'}
            </span>
            <Clock />
          </div>
        </header>

        {/* ═══ MAIN ═══ */}
        <main className="bb-main">

          {/* ══ ROW 1: TRADING DESK ══ */}
          <div className="bb-row-desk">

            {/* ── CHART PANEL ── */}
            <div className="bb-panel bb-chart-panel">
              <div className="bb-chart-header">
                {/* Timeframe ladder */}
                <div className="bb-tf-ladder">
                  {tfs.map(tf => (
                    <button
                      key={tf.id}
                      className={`bb-tf-tab ${activeTf === tf.id ? 'active' : ''}`}
                      disabled={!tf.supported}
                      title={tf.reason}
                      onClick={() => tf.supported && setActiveTf(tf.id)}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
                {/* Indicator toggles */}
                <div className="bb-chart-controls">
                  {[
                    { label: 'Bollinger', active: showBollinger, toggle: () => setShowBollinger(v => !v) },
                    { label: 'EMA 12', active: showEma, toggle: () => setShowEma(v => !v) },
                    { label: 'Volume', active: showVolume, toggle: () => setShowVolume(v => !v) },
                    { label: 'RSI', active: showRsi, toggle: () => setShowRsi(v => !v) },
                    { label: 'MACD', active: showMacd, toggle: () => setShowMacd(v => !v) },
                  ].map(c => (
                    <button key={c.label} className={`bb-ind-toggle ${c.active ? 'active' : ''}`} onClick={c.toggle}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <CandleChart
                candles={board.candles}
                indicators={board.indicators}
                loading={board.candlesLoading}
                showBollinger={showBollinger}
                showEma={showEma}
                showRsi={showRsi}
                showMacd={showMacd}
                showVolume={showVolume}
              />

              {/* Indicator chips — regime + energy summary */}
              <div className="bb-ind-chips">
                {mktData?.regime && (
                  <div className="bb-ind-chip">
                    <span className="bb-ind-chip-name">Regime</span>
                    <span className="bb-ind-chip-val">{mktData.regime.recommendation ?? 'CIRCUIT_VALID'}</span>
                    <span className={`bb-ind-chip-dir ${mktData.regime.regimeShift ? 'dn' : 'up'}`}>
                      {mktData.regime.regimeShift ? '▼' : '·'}
                    </span>
                  </div>
                )}
                {mktData?.energyDeltaU && (
                  <div className="bb-ind-chip">
                    <span className="bb-ind-chip-name">ΔU</span>
                    <span className="bb-ind-chip-val">{mktData.energyDeltaU.deltaU.toFixed(4)}</span>
                    <span className={`bb-ind-chip-dir ${mktData.energyDeltaU.accept ? 'up' : 'dn'}`}>
                      {mktData.energyDeltaU.accept ? '·' : '▼'}
                    </span>
                  </div>
                )}
                {mktData?.qualityGate && (
                  <div className="bb-ind-chip">
                    <span className="bb-ind-chip-name">QGate</span>
                    <span className="bb-ind-chip-val">{mktData.qualityGate.pass ? 'PASS' : 'FAIL'}</span>
                    <span className={`bb-ind-chip-dir ${mktData.qualityGate.pass ? 'up' : 'dn'}`}>
                      {mktData.qualityGate.pass ? '▲' : '▼'}
                    </span>
                  </div>
                )}
                {mktData?.signals?.filter(s => s.source === 'social').map(s => (
                  <div key={s.factorId} className="bb-ind-chip">
                    <span className="bb-ind-chip-name">Social</span>
                    <span className="bb-ind-chip-val">{(s.confidence * 100).toFixed(0)}%</span>
                    <span className={`bb-ind-chip-dir ${s.side === 'long' ? 'up' : 'dn'}`}>{s.side === 'long' ? '▲' : '▼'}</span>
                  </div>
                ))}
                {mktData?.signals?.filter(s => s.source === 'perp').map(s => (
                  <div key={s.factorId} className="bb-ind-chip">
                    <span className="bb-ind-chip-name">Perp</span>
                    <span className="bb-ind-chip-val">{(s.value * 100).toFixed(2)}%</span>
                    <span className={`bb-ind-chip-dir ${s.side === 'long' ? 'up' : 'dn'}`}>{s.side === 'long' ? '▲' : '▼'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── ORDER BOOK + ENERGY ── */}
            <div className="bb-panel bb-book-panel">
              <OrderBook
                orderbook={board.orderbook}
                loading={board.orderbookLoading}
                energy={energy}
                market={activeMkt}
                signal={primarySignal}
              />
            </div>

            {/* ── TRADE INTENT + POSITIONS + ACCOUNT ── */}
            <div className="bb-panel bb-intent-panel">
              <IntentPanel
                market={activeMkt}
                marketData={mktData}
                allPositions={allPositions}
                account={board.account}
              />
            </div>
          </div>

          {/* ══ ROW: A-S MAKER (Engine-2, live paper quoter) ══ */}
          <div className="bb-panel">
            <AsQuotePanel data={board.asQuote} />
          </div>

          {/* ══ ROW 2: COGNITIVE LAYER ══ */}
          <div className="bb-row-cog">
            {/* YURI's Read — conviction */}
            <div className="bb-panel">
              <ConvictionPanel markets={obs.markets} visibleMarkets={visibleMarkets} />
            </div>
            {/* Calibration */}
            <div className="bb-panel">
              <CalibrationPanel data={board.calibration} />
            </div>
            {/* Paper Performance */}
            <div className="bb-panel">
              <PerfPanel paperData={paperData} visibleMarkets={visibleMarkets} account={board.account} />
            </div>
          </div>

          {/* ══ ROW: PERP TRAINER ══ */}
          <div className="bb-panel">
            <PerpTrainerPanel data={board.trainer} />
          </div>

          {/* ══ ROW 3: GRADUATION LADDER ══ */}
          <div className="bb-panel">
            <GraduationPanel data={board.graduation} />
          </div>

          {/* ══ ROW 4: NEWS & CATALYSTS ══ */}
          <div className="bb-panel">
            <TradesPanel data={board.trades} />
          </div>

          {/* ══ GAINERS TICKER ══ */}
          <div className="bb-ticker">
            <span className="bb-ticker-label">MARKETS</span>
            <div className="bb-ticker-wrap">
              <div className="bb-ticker-track">
                {/* duplicate for seamless scroll */}
                {[...tickerItems, ...tickerItems].map((item, i) => (
                  <div key={i} className="bb-ticker-item">
                    <span className="bb-ticker-sym">{item.sym}</span>
                    <span className={`bb-ticker-chg ${item.chg >= 0 ? 'pos' : 'neg'}`}>
                      {item.chg >= 0 ? '+' : ''}{item.chg.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
