#!/usr/bin/env node
// @capability: crypto-perp-train-session
// @serves: train trading engine | paper training session | leveraged micro-trade backtest | binance perp trainer | run paper session | raise win rate
// @does: bounded leveraged-perp paper TRAINING session — replays Binance BTC bars through a DEDICATED perpMode engine (owner model: bankroll + clamp(riskPct*eq,1,25) margin + leverage), REUSING the live daemon's real computeLiveSignals + combineSignals, with a 1-bar lag (no look-ahead), engine-auto liquidation + funding, price stop/take/max-hold exits + a CONVICTION GATE (flipThreshold) and HOLD-THROUGH-WEAK exit policy (no churning the position on 1-min noise; sim-proven to lift win rate + cut the bleed). Emits a win-rate scorecard. Does NOT touch the live daemon (own engine + own session ledgers).
// @use: node train-session.mjs --leverage 20 --risk-pct 0.03 --bankroll 300 --cycles 500 --market BTCUSDT ; or import { runTrainSession } and pass {bars} for deterministic sweeps/tests.
// @exports: runTrainSession, parseArgs, DEFAULTS
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { createPaperEngine, binanceFeeModel } from './afl-paper.mjs';
import { computeLiveSignals } from './observatory/orchestrator.mjs';
import { combineSignals } from './ensemble.mjs';
import { dataQualityGate } from './data-quality-gate.mjs';
import * as PerpAdapter from './adapters/perp-adapter.mjs';
import { computeSessionReport, formatScorecard } from './session-report.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(_HERE, '..', '..', 'state');
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Evenly downsample a {t,eq} series to at most `max` points (keeps first + last). */
function downsample(series, max = 150) {
  if (series.length <= max) return series;
  const step = (series.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(series[Math.round(i * step)]);
  out[out.length - 1] = series[series.length - 1];
  return out;
}

export const DEFAULTS = {
  leverage: 20, riskPct: 0.03, bankroll: 300, cycles: 500,
  market: 'BTCUSDT', interval: '1m',
  stopPct: 0.005, takePct: 0.01, maxHoldBars: 60, // price-based exits (stop INSIDE liq); 2:1 R:R
  warmup: 60, threshold: 0.1,
  flipThreshold: 0.25,    // conviction gate — only enter/flip when |ensemble.net| clears this (kills 1-min churn)
  holdThroughWeak: true,  // hold the position through weak/flat signals → let price stop/take/max-hold govern
  marginMin: 1, marginMax: 25,                    // owner per-trade margin band (EUR)
  maintenanceMarginRate: 0.004,                   // Binance BTCUSDT Tier-1
};

/**
 * runTrainSession(opts) -> scorecard. Pure-ish: pass opts.bars (array of {timestamp,open,high,low,close,volume})
 * for a DETERMINISTIC offline run (tests/sweeps); omit to fetch live Binance klines. Never touches the daemon.
 */
export async function runTrainSession(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  cfg.bankroll = clamp(cfg.bankroll, 10, 1_000_000);
  const inst = `ensemble-${cfg.market}`;
  const tag = opts.tag || `${process.pid}`;
  const paperLedgerPath = opts.paperLedgerPath || path.join(STATE_DIR, `train-session-paper-${tag}.jsonl`);
  const predictionLedgerPath = opts.predictionLedgerPath || path.join(STATE_DIR, `train-session-pred-${tag}.jsonl`);
  try { mkdirSync(STATE_DIR, { recursive: true }); } catch { /* ok */ }
  // Fresh session ledgers — a bounded session must not inherit a prior run's trades on the same path.
  try { rmSync(paperLedgerPath, { force: true }); rmSync(predictionLedgerPath, { force: true }); } catch { /* ok */ }

  // Funding: real Binance 8h rate → hourly (engine.applyFunding expects an hourly rate). Fail-soft to 0.
  let hourlyRate = 0;
  if (!opts.skipFunding) {
    try { const f = await PerpAdapter.getFunding(cfg.market); if (isNum(f?.fundingRate)) hourlyRate = f.fundingRate / 8; } catch { /* keep 0 */ }
  }

  const engine = createPaperEngine({
    paperLedgerPath, predictionLedgerPath,
    feeModel: binanceFeeModel('taker'),
    caps: {
      initialEquity: cfg.bankroll,
      perpMode: true, leverage: cfg.leverage, maintenanceMarginRate: cfg.maintenanceMarginRate,
      fundingRates: { [inst]: hourlyRate },
      maxPositionPct: 1.0, maxGrossExposurePct: 10.0, maxNetExposurePct: 10.0, minNotional: 0.5,
    },
  });

  // Bars: injected (deterministic) or fetched from Binance.
  let candles = Array.isArray(opts.bars) ? opts.bars : null;
  if (!candles) {
    const limit = Math.min(cfg.cycles + cfg.warmup + 5, 1500);
    const res = await PerpAdapter.getCandles(cfg.market, { interval: cfg.interval, limit });
    candles = res.candles;
  }
  if (!Array.isArray(candles) || candles.length <= cfg.warmup + 1) {
    const r = computeSessionReport({ closes: [], startingEquity: cfg.bankroll, pnl: engine.pnl(), config: pubCfg(cfg) });
    r.equityCurve = [];
    return r;
  }

  const equitySamples = []; // {t, eq} per marked bar → downsampled into report.equityCurve
  let openIdx = -1; // bar index the current position opened on (for max-hold-in-bars)
  const end = candles.length;
  for (let i = cfg.warmup; i < end; i += 1) {
    const sigWindow = candles.slice(0, i); // bars[0..i-1] — signal sees up to the PREVIOUS closed bar (no look-ahead)
    const execBar = candles[i];            // execute on bar i — the signal could not see it
    if (!execBar || !isNum(execBar.close)) continue;

    const gate = dataQualityGate(sigWindow);
    if (!gate || gate.pass === false) continue;

    const signals = computeLiveSignals(sigWindow, inst);
    const ensemble = combineSignals(signals, { threshold: cfg.threshold });

    // MTM + engine-side liquidation + funding accrual at this bar.
    try { engine.ingestBar(execBar, inst); } catch { /* fail-soft */ }
    engine.mark(execBar.timestamp, { [inst]: execBar.close });
    equitySamples.push({ t: execBar.timestamp, eq: round2(engine.pnl().equity || cfg.bankroll) });

    // Price stop / take / max-hold on the open position (the engine's liquidation sits further out).
    let pos = engine.positions().find((p) => p.instrument === inst);
    if (pos) {
      const dir = pos.side === 'long' ? 1 : -1;
      const pnlFrac = (pos.avgEntryPrice > 0) ? dir * (execBar.close - pos.avgEntryPrice) / pos.avgEntryPrice : 0;
      const heldBars = openIdx >= 0 ? (i - openIdx) : 0;
      let exit = null;
      if (pnlFrac <= -cfg.stopPct) exit = 'stop-loss';
      else if (pnlFrac >= cfg.takePct) exit = 'take-profit';
      else if (heldBars >= cfg.maxHoldBars) exit = 'max-hold';
      if (exit) { try { engine.closePosition(inst, exit, execBar.timestamp, execBar.close); openIdx = -1; } catch { /* fail-soft */ } }
    }

    // Entry / flip / flatten — owner sizing: margin = clamp(riskPct*equity, 1, 25), notional = margin*leverage.
    // CONVICTION GATE (flipThreshold) + HOLD-THROUGH-WEAK: don't churn the position on 1-min noise — let the
    // price stop/take/max-hold govern unless an opposite signal is genuinely STRONG. Sim-proven 2026-06-18:
    // vs flip-on-every-signal, cuts churn ~60% (45→18 trades), raises win rate 4.4%→11.1%, halves the bleed.
    pos = engine.positions().find((p) => p.instrument === inst);
    const strong = !cfg.flipThreshold || Math.abs(ensemble.net) >= cfg.flipThreshold;
    const openOrFlip = () => {
      const eq = engine.pnl().equity || cfg.bankroll;
      const margin = clamp(cfg.riskPct * eq, cfg.marginMin, cfg.marginMax);
      const r = engine.onSignal(
        { factorId: inst, side: ensemble.side, value: ensemble.net, confidence: ensemble.confidence, ts: execBar.timestamp, notional: margin * cfg.leverage },
        { instrument: inst, bar: execBar, barHistory: sigWindow },
      );
      if (r && (r.action === 'OPEN')) openIdx = i;
    };
    if (ensemble.side === 'flat') {
      // hold-through-weak keeps the position so the designed price exits can play out; else flatten on flat.
      if (pos && !cfg.holdThroughWeak) { engine.onSignal({ factorId: inst, side: 'flat', value: 0, confidence: 0.5, ts: execBar.timestamp }, { instrument: inst, bar: execBar, barHistory: sigWindow }); openIdx = -1; }
    } else if (!pos) {
      if (strong) openOrFlip();
    } else if (pos.side !== ensemble.side) {
      // opposite signal: flip only if STRONG when holding through weak; otherwise flip on any opposite signal.
      if (cfg.holdThroughWeak ? strong : true) openOrFlip();
    }
  }

  // Close any still-open position at the final bar so the scorecard is complete.
  const lastBar = candles[end - 1];
  const stillOpen = engine.positions().find((p) => p.instrument === inst);
  if (stillOpen && lastBar) { try { engine.closePosition(inst, 'session-end', lastBar.timestamp, lastBar.close); } catch { /* ok */ } }
  if (lastBar) equitySamples.push({ t: lastBar.timestamp, eq: round2(engine.pnl().equity || cfg.bankroll) });

  const report = computeSessionReport({ paperLedgerPath, startingEquity: cfg.bankroll, pnl: engine.pnl(), config: pubCfg(cfg) });
  report.equityCurve = downsample(equitySamples, 150);
  return report;
}

function pubCfg(cfg) {
  return { leverage: cfg.leverage, riskPct: cfg.riskPct, bankroll: cfg.bankroll, cycles: cfg.cycles, market: cfg.market, interval: cfg.interval };
}

export function parseArgs(argv) {
  const out = {};
  const map = { '--leverage': 'leverage', '--risk-pct': 'riskPct', '--bankroll': 'bankroll', '--cycles': 'cycles', '--market': 'market', '--interval': 'interval', '--stop-pct': 'stopPct', '--take-pct': 'takePct', '--max-hold': 'maxHoldBars', '--flip-threshold': 'flipThreshold', '--report': 'reportPath' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = map[argv[i]];
    if (!key) continue;
    const v = argv[i + 1]; i += 1;
    out[key] = (key === 'market' || key === 'interval' || key === 'reportPath') ? v : Number(v);
  }
  return out;
}

// CLI
const _SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(_SELF)) {
  const opts = parseArgs(process.argv.slice(2));
  runTrainSession(opts)
    .then((rep) => { console.log(formatScorecard(rep)); })
    .catch((e) => { console.error('train-session error:', e.message); process.exit(1); });
}
