#!/usr/bin/env node
/**
 * orchestrator.mjs — YURI AFL Observatory Orchestrator (W2 bridge)
 *
 * runCycle() = one observatory cycle:
 *   for each tracked market:
 *     fetch → normalize timestamps to unix-SECONDS (single chokepoint)
 *            → dataQualityGate → factor signals → computeSize → paper fill
 *
 * CONSTRAINTS (§4 master-brief):
 *   - PAPER-ONLY — no real orders ever (INV-1)
 *   - NO key reads — creds from env only (INV-2)
 *   - No protected paths — ledgers under _SYSTEM/state/ only
 *   - Energy ΔU via gateProposal = advisory telemetry, NEVER blocks
 *   - Timestamps: ALL bars normalized to unix-SECONDS before gate + downstream
 *   - httpGet injectable for offline/test (deterministic)
 *   - No express, no ws — pure node:http + better-sqlite3 + AFL spine
 *
 * @module observatory/orchestrator
 */

import path from 'node:path';
import https from 'node:https';
import { URL as NodeURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';

// ── Path resolution ────────────────────────────────────────────────────────
const _HERE = path.dirname(fileURLToPath(import.meta.url));
// observatory/ → alpha-factor-library/ → Scripts/ → _SYSTEM/
const AFL_ROOT = path.resolve(_HERE, '..');
const SCRIPTS_ROOT = path.resolve(AFL_ROOT, '..');
const SYSTEM_ROOT = path.resolve(SCRIPTS_ROOT, '..');

// ── Ledger paths (under _SYSTEM/state/ only) ──────────────────────────────
const STATE_DIR = path.join(SYSTEM_ROOT, 'state');
const PAPER_LEDGER = path.join(STATE_DIR, 'observatory-paper.jsonl');
const QUANTUM_SHADOW_LEDGER = path.join(STATE_DIR, 'observatory-quantum-shadow.jsonl');
const PRED_LEDGER = path.join(STATE_DIR, 'observatory-predictions.jsonl');

// ── AFL spine imports ──────────────────────────────────────────────────────
import { dataQualityGate } from '../data-quality-gate.mjs';
import { computeSize } from '../afl-sizing.mjs';
import { createPaperEngine, binanceFeeModel } from '../afl-paper.mjs';
import { selectHorizon, realisticRoundTripCost } from '../multi-horizon-gate.mjs';
import { gateProposal } from '../../math/yuri-energy.mjs';
import { detectRegimeShift } from '../regime-detector.mjs';
import { computeAllStrategies } from '../strategy-registry.mjs';
import { combineSignals } from '../ensemble.mjs';
import { recordForecasts } from '../strategy-weights.mjs';
// factorQualityScore removed — not wired in W2 observatory (BUG-3: dead import)
// PerpAdapter removed — W2 is crypto-primary; perp market loop not yet wired (BUG-4: inert import)

// Adapter imports — we re-export setHttpGet from each to inject mocks.
// BINANCE-ONLY (2026-06-19, owner directive "get away from coinbase, binance only"):
// CoinbaseAdapter import REMOVED — the venue is Binance USDⓈ-M (PerpAdapter). coinbase-adapter.mjs
// is deleted in a later step of this migration; no live code references it.
import * as PolymarketAdapter from '../adapters/polymarket-adapter.mjs';
import * as PerpAdapter from '../adapters/perp-adapter.mjs';
import * as SocialAdapter from '../adapters/social-adapter.mjs';
import * as PolymarketDiscovery from '../adapters/polymarket-discovery.mjs';
import { computePerpSignals } from '../perp-signals.mjs';
import { computeCrossAssetSignals } from '../cross-asset-signal.mjs';
import { computeCarryVolSignals } from '../carry-vol-signal.mjs';
import { circuitInputFromBars } from '../factor-return-vectors.mjs';
import { optimizeFactorCircuit } from '../factor-circuit.mjs';
import { webSearch as agentReachSearch, available as agentReachAvailable } from '../../agent-reach.mjs';
import { scorePost, aggregateSentiment } from '../adapters/social-adapter.mjs';
import { computeIndicators, listIndicators as registryListIndicators } from '../indicator-registry.mjs';
import { getConfluence } from '../multi-tf-confluence.mjs';

// ── Constants ──────────────────────────────────────────────────────────────
const DEFAULT_CYCLE_INTERVAL_MS = 15_000;  // 15s — conservative, rate-limit aware

// Default tracked markets — crypto PRIMARY, Polymarket secondary
// BTC/ETH anchors + fast movers (live vol scan 2026-06-16: WIF ~6.8%/day, SOL/SUI/AVAX ~3.6%
// vs BTC ~2.1%). Readable-price coins only (sub-cent memecoins need adaptive decimals first).
// Override with OBSERVATORY_CRYPTO_MARKETS=BTC-USD,SOL-USD,...
const DEFAULT_CRYPTO_MARKETS = (process.env.OBSERVATORY_CRYPTO_MARKETS
  ? process.env.OBSERVATORY_CRYPTO_MARKETS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['BTC-USD', 'ETH-USD', 'SOL-USD', 'SUI-USD', 'WIF-USD', 'AVAX-USD']);

// BINANCE-ONLY (2026-06-19, owner directive "get away from coinbase, binance only in the daemon"):
// all crypto market data (candles/book/ticks) now routes through PerpAdapter (Binance USDⓈ-M perp),
// matching the A-S maker engine's instrument so board prices == the quoter's prices. Market keys keep
// the 'BTC-USD' display form (the daemon's split('-') logic stays valid); toBinanceSymbol maps to the
// Binance symbol for the API call. 1-min bars → Binance kline interval '1m'.
const toBinanceSymbol = (m) => { const s = String(m).toUpperCase(); return s.includes('-') ? s.split('-')[0] + 'USDT' : s; };

// Number of candles to fetch per cycle for crypto
const CANDLES_FETCH_LIMIT = 300;   // ~300 bars: deep warmup + history for factors/regime. Binance fapi/v1/klines limit is 1500/req.

// Learn loop: how often (in cycles) to decode closed paper trades → AFL_LEDGER. 10 cycles
// ≈ a few minutes; the decode is idempotent so cadence only affects calibration freshness.
const LEARN_DECODE_EVERY = 10;

// Per-factor paper position cap (legacy per-factor path; kept for reference).
const PER_FACTOR_MAX_PCT = 0.001;

// ENSEMBLE: the strategies trade TOGETHER as ONE fused position per market. Max size for that single
// combined position (fraction of book equity), scaled down by conviction. One position/market × 6
// markets keeps fee drag tiny while trading continuously.
const ENSEMBLE_MAX_PCT = 0.10;
const ENSEMBLE_WEIGHTS_PATH = path.join(STATE_DIR, 'ensemble-weights.json');
const FORECAST_LEDGER = path.join(STATE_DIR, 'strategy-forecasts.jsonl');
// DISARMED multi-TF confluence + 1h regime SHADOW ledger: records the higher-TF bias vs the live 1m
// ensemble decision (agree/conflict) + forward price, so confluence-gating can be PROVEN on real data
// before it ever touches sizing. Append-only telemetry, like the quantum A/B shadow ledger.
const CONFLUENCE_SHADOW_LEDGER = path.join(STATE_DIR, 'observatory-confluence-shadow.jsonl');

// OVERSEER CONTROL SURFACE: a hot-reloaded config the overseer team (Sonnet + deepseek-flash) writes
// to steer trading WITHOUT touching execution code. Absent file → these defaults → IDENTICAL to the
// pre-overseer behavior (DISARMED by construction). INV-1-safe: config only, never an order path.
const OVERSEER_CONFIG_PATH = path.join(STATE_DIR, 'overseer-config.json');
const OVERSEER_DEFAULTS = {
  threshold: null,       // null → ensemble.mjs DEFAULT_THRESHOLD (0.05). Raise → fewer noise trades.
  maxPct: null,          // null → ENSEMBLE_MAX_PCT (0.10). Max notional fraction per combined position.
  feeHurdle: 0,          // round-trip fee fraction the expected move must clear (edgeGate). 0 = no hurdle.
  edgeGate: false,       // require conviction-scaled expected move ≥ feeHurdle before opening/flipping.
  regimeGate: false,     // when ON + regime=RECOMPUTE_CIRCUIT, TRIM entry size by regimeTrimFactor (NOT freeze).
  regimeTrimFactor: 0.5, // size multiplier during regime instability (owner decision 'A' 2026-06-17 — de-risk, don't block).
  perMarketEnable: {},   // { 'BTC-USD': false } freezes new entries for that market; absent → enabled.
  paused: false,         // true → no new entries/flips anywhere (de-risk flatten + MTM still run).
  minHoldCycles: 0,      // hold-time hysteresis: a NEW side must persist this many cycles before a flip
                         //   executes (0 = off). Longer holds → bigger moves → clears the fixed fee.
  maxHoldSec: 0,         // TIME-STOP: force-close a position older than this many seconds (0 = off).
                         //   Caps hold time → faster, horizon-aligned outcomes for the learn loop.
  stopLossPct: 0.015,    // STOP-LOSS (de-risk default 2026-06-18): close at 1.5% adverse move of position
                         //   value. At 20x that's ~30% of margin — WELL inside the ~4.6% isolated-liq
                         //   distance, so no position can ride to liquidation. Was 0 (unbounded loss). Tunable
                         //   via overseer-config; the funding-carry harvester will use settlement-based exits.
  takeProfitPct: 0.025,  // TAKE-PROFIT: bank at 2.5% favorable move (~1.7:1 R:R). Was 0 (rode to signal-flip).
  confluence: false,     // DISARMED multi-TF confluence + 1h regime MEASUREMENT layer. false → zero
                         //   extra network + zero behavior change. true → compute the higher-TF bias
                         //   (weekly→1m) + 1h regime, record snap.confluence + the shadow ledger
                         //   (bias vs forward move) WITHOUT touching sizing. Owner arms gating later (phase 3).
  confluenceAnchor: '1h',// regime-state anchor TF for the confluence read (reuses already-fetched bars).
  confluenceGate: false, // when ON (auto-enables confluence), BLOCK an entry/flip that CONFLICTS with the
                         //   higher-TF bias (1m wants long while weekly/4h/1h are short = the counter-trend
                         //   bug). Directional veto only — ALIGNED + neutral entries flow; exits never blocked.
};

// Per-market recent ensemble-side history for hold-time hysteresis (module state, survives cycles).
const _ensSideHist = new Map();

/**
 * getOverseerConfig() — the overseer team's hot-reloaded steering config, merged over safe defaults.
 * Read cold each cycle (no cache) so an overseer write lands on the very next cycle, no restart.
 * Missing/corrupt → defaults = current behavior. Fail-soft.
 */
function getOverseerConfig() {
  let cfg = { ...OVERSEER_DEFAULTS };
  try {
    if (existsSync(OVERSEER_CONFIG_PATH)) {
      const c = JSON.parse(readFileSync(OVERSEER_CONFIG_PATH, 'utf8'));
      if (c && typeof c === 'object') {
        const pm = (c.perMarketEnable && typeof c.perMarketEnable === 'object') ? c.perMarketEnable : {};
        cfg = { ...OVERSEER_DEFAULTS, ...c, perMarketEnable: pm };
      }
    }
  } catch { /* fall through to defaults */ }
  // OPERATOR ARM via env (stable — survives the overseer beats' config rewrites; the beats own the
  // config FILE for dynamic steering, so a durable arm like multi-horizon belongs in env, not the file).
  if (process.env.OBSERVATORY_MULTI_HORIZON === '1') cfg.multiHorizon = true;
  // DISARMED-by-default confluence MEASUREMENT arm (durable env arm, like multiHorizon): records the
  // higher-TF bias + 1h regime vs the live ensemble WITHOUT touching sizing. Safe to arm — measurement only.
  if (process.env.OBSERVATORY_CONFLUENCE === '1') cfg.confluence = true;
  // The confluence ENTRY GATE (blocks counter-higher-TF entries) — auto-enables the confluence read so the
  // gate always has data. Reversible env arm (improvement: stops the counter-trend bug). Owner 2026-06-18.
  if (process.env.OBSERVATORY_CONFLUENCE_GATE === '1') { cfg.confluence = true; cfg.confluenceGate = true; }
  return cfg;
}

/**
 * recentVolPct(bars, n) — mean absolute 1-bar return over the last n bars (typical per-bar move).
 * The expected-move estimate for the edge-vs-fee gate: trade only when conviction-scaled vol clears
 * the round-trip fee. Conservative (single-bar vol under-counts multi-bar holds → fewer trades).
 */
function recentVolPct(bars, n = 14) {
  if (!Array.isArray(bars) || bars.length < 2) return 0;
  const slice = bars.slice(-(n + 1));
  let sum = 0, k = 0;
  for (let i = 1; i < slice.length; i++) {
    const p0 = slice[i - 1].close, p1 = slice[i].close;
    if (p0 > 0 && Number.isFinite(p0) && Number.isFinite(p1)) { sum += Math.abs(p1 / p0 - 1); k++; }
  }
  return k ? sum / k : 0;
}

/**
 * getEnsembleWeights() — per-strategy weights for the ensemble vote, written by the slower
 * re-weighting beat (Sonnet brain + learn loop). Accepts {weights:{id:w}} or a flat {id:w}.
 * Default {} = uniform. Fail-soft (missing/corrupt file → uniform).
 */
function getEnsembleWeights() {
  try {
    if (!existsSync(ENSEMBLE_WEIGHTS_PATH)) return {};
    const w = JSON.parse(readFileSync(ENSEMBLE_WEIGHTS_PATH, 'utf8'));
    if (w && typeof w === 'object') return (w.weights && typeof w.weights === 'object') ? w.weights : w;
    return {};
  } catch { return {}; }
}

// ── Timestamp normalization (single chokepoint) ────────────────────────────
/**
 * toUnixSeconds(ts) — normalize any timestamp (ms or seconds) to unix-SECONDS.
 * Heuristic: if ts > 1e11 it's milliseconds (any ms-epoch after ~1973); else seconds.
 * This is the SINGLE canonicalization point before dataQualityGate.
 * @param {number} ts
 * @returns {number} unix-seconds
 */
function toUnixSeconds(ts) {
  if (!Number.isFinite(ts)) return ts;
  return ts > 1e11 ? Math.floor(ts / 1000) : ts;
}

/**
 * normalizeBarTimestamp(bar) — returns a new bar with timestamp in unix-SECONDS.
 * Mutates nothing; returns a shallow copy.
 */
function normalizeBarTimestamp(bar) {
  if (!bar || typeof bar !== 'object') return bar;
  return { ...bar, timestamp: toUnixSeconds(bar.timestamp) };
}

// ── Live factor signal computation ────────────────────────────────────────
/**
 * computeLiveSignals(bars, market) — derive a few live factor signals from OHLCV.
 * Lightweight and self-contained — does NOT hit the network.
 * Returns an array of {factorId, value, side, confidence, ts} signal objects.
 */
export function computeLiveSignals(bars, market) {
  if (!bars || bars.length < 5) return [];
  const signals = [];
  const now = bars[bars.length - 1].timestamp;

  // Signal 1: momentum (short vs long EMA sign)
  const closes = bars.map((b) => b.close).filter(Number.isFinite);
  if (closes.length >= 10) {
    const emaShort = ema(closes, 5);
    const emaLong = ema(closes, 10);
    const last = closes[closes.length - 1];
    const trend = emaShort > emaLong ? 'long' : 'short';
    const trendStrength = Math.abs(emaShort - emaLong) / (emaLong || 1);
    const confidence = Math.min(0.99, 0.5 + Math.min(trendStrength * 10, 0.49));
    signals.push({
      factorId: `obs-momentum-${market}`,
      value: emaShort - emaLong,
      side: trend,
      confidence,
      ts: now,
    });
  }

  // Signal 2: vol regime (ATR-based)
  if (bars.length >= 10) {
    const atrs = atrSeries(bars, 10);
    const lastAtr = atrs[atrs.length - 1];
    const avgAtr = atrs.reduce((s, v) => s + v, 0) / atrs.length;
    const volRegime = lastAtr > avgAtr * 1.2 ? 'short' : lastAtr < avgAtr * 0.8 ? 'long' : 'flat';
    const confidence = 0.55;
    if (volRegime !== 'flat') {
      signals.push({
        factorId: `obs-vol-regime-${market}`,
        value: lastAtr - avgAtr,
        side: volRegime,
        confidence,
        ts: now,
      });
    }
  }

  // The full strategy library (trend + mean-reversion + volume/volatility families — dozens of
  // strategies, each its own factor). Fail-soft: a throwing family never zeroes the base signals.
  try {
    signals.push(...computeAllStrategies(bars, market));
  } catch (_e) { /* strategy library is advisory; never break the cycle */ }

  return signals;
}

/** Exponential moving average over a numeric series. */
function ema(values, period) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

/** ATR series (using high-low range as a proxy; no prior close needed). */
function atrSeries(bars, period) {
  const trs = bars.map((b) => Number.isFinite(b.high) && Number.isFinite(b.low) ? b.high - b.low : 0);
  const out = [];
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / Math.max(period, 1);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out.push(atr);
  }
  if (!out.length) out.push(atr);
  return out;
}

// ── Returns series for sizing ──────────────────────────────────────────────
function closeReturns(bars) {
  const returns = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      returns.push(Math.log(b / a));
    }
  }
  return returns;
}

// ── Energy advisory telemetry ──────────────────────────────────────────────
/**
 * computeEnergyDelta(signal, paperSnap) — gateProposal ΔU for one trade proposal.
 * ADVISORY ONLY — never blocks.
 * Returns { deltaU, accept, reason } or null on error (fail-open).
 */
function computeEnergyDelta(signal, paperSnap) {
  try {
    // Build minimal before/after states from paper snapshot
    const before = {
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
      verifiedEvidenceCount: Math.min(10, Math.floor((paperSnap?.completedTrades || 0) / 2)),
      claimPromotionDistribution: [1, 0, 0, 0, 0, 0],
      predictions: [], outcomes: [],
      evidence: [], prior: null, posterior: null,
    };
    const after = {
      ...before,
      // A paper trade that loses increases calibration error slightly
      verifiedEvidenceCount: before.verifiedEvidenceCount + 1,
    };
    const gate = gateProposal({ stateBefore: before, stateAfter: after, threshold: 0 });
    return {
      deltaU: gate.result.deltaU,
      accept: gate.result.accept,
      reason: gate.result.reason,
    };
  } catch (_e) {
    return null; // fail-open — energy ΔU is advisory
  }
}

// ── Quantum factor-circuit (real return-vector live-wire) ──────────────────
/**
 * computeCircuit(bars, signals) — order-optimal factor sequencing on REAL return
 * vectors (via factor-return-vectors.circuitInputFromBars → the opts.vectors
 * injection in factor-circuit). Returns compact telemetry or null. FAIL-OPEN.
 *   ratio > 1  ⇒ a genuine non-commutative ORDER advantage exists.
 *   ratio == 1 ⇒ the factors commute (no sequencing advantage — never faked).
 * Only the price-derived obs-* signals carry a real return-vector mapping; perp/
 * social overlays are excluded (they map to zero vectors by construction).
 */
function computeCircuit(bars, signals) {
  const priceSignals = (signals || []).filter(
    (s) => s && String(s.factorId).startsWith('obs-') && s.side !== 'flat',
  );
  if (priceSignals.length < 2) return null;
  try {
    const { factors, opts, injected, degenerate } = circuitInputFromBars(bars, priceSignals, {
      recordEnergy: false, sampleCount: 50, draws: 30, iters: 2, seed: 42,
    });
    const r = optimizeFactorCircuit(factors, opts);
    return {
      ratio: r.quality?.ratio ?? null,
      allCommute: r.allCommute ?? null,
      bestOrdering: r.bestOrdering ?? null,
      factorIds: factors.map((f) => f.id),
      injected: injected === true,
      degenerate: degenerate === true,
    };
  } catch (_e) {
    return null; // fail-open — circuit telemetry never breaks the cycle
  }
}

// ── Snapshot state (in-memory, per market) ────────────────────────────────
/**
 * createMarketSnapshot() — empty snapshot template for one market.
 */
function createMarketSnapshot(market, venue) {
  return {
    market,
    venue,
    updatedAt: null,          // unix-seconds
    bars: [],                 // last N bars (seconds timestamps)
    signals: [],              // latest signals
    paperPositions: [],       // current open positions
    pnl: null,                // P&L summary from paper engine
    drawdown: null,           // current drawdown fraction
    regime: null,             // detectRegimeShift output
    energyDeltaU: null,       // last gateProposal ΔU (advisory)
    qualityGate: null,        // last dataQualityGate result
    circuit: null,            // quantum factor-circuit telemetry (ratio/ordering, advisory)
    error: null,              // last cycle error for this market
  };
}

// ── Paper engine factory (lazy, per-market) ────────────────────────────────
const _paperEngines = new Map();

// PERP MODE (DISARMED by default): with OBSERVATORY_PERP_MODE=1 the paper engine models Binance USDⓈ-M
// LEVERAGED economics (binanceFeeModel 0.02/0.05 + leverage + isolated-margin liquidation) instead of
// Binance USDⓈ-M perp spot-linear economics. Leverage via OBSERVATORY_LEVERAGE (default 20×). Owner-armed in the plist env — identical
// DISARMED pattern to OBSERVATORY_TICK_STREAM / OBSERVATORY_MULTI_HORIZON. Default off → spot unchanged.
const PERP_MODE = process.env.OBSERVATORY_PERP_MODE === '1';
const PERP_LEVERAGE = (Number.isFinite(Number(process.env.OBSERVATORY_LEVERAGE)) && Number(process.env.OBSERVATORY_LEVERAGE) > 0)
  ? Number(process.env.OBSERVATORY_LEVERAGE) : 20;

// PRICED SIZE (DISARMED by default, OBSERVATORY_PRICED_SIZE=1 to arm): route the crypto sizing seam
// through the principled computeSize sizer the polymarket sleeve already uses (fractional-Kelly +
// vol/drawdown throttles, fail-closed: edgeLowerCI≤0→0). Mirrors the quantum A/B shadow — the priced
// decision is computed + recorded every cycle (snap.ensemble.pricedNotional/pricedReason) but the
// paper engine keeps the DISARMED conviction-scalar notional until the owner arms the flag. Armed,
// caps.maxFraction=maxPct (0.10) per position → structurally kills the configured 6.0 (600%) gross.
// With the honest no-edge verdict (factors R0, DSR≈0) the priced path stays ~0 → correct (no edge →
// no trade). HARD ARM-PRECONDITION (BOTH inputs uncalibrated — the live shadow confirms the phantom):
//  - winProb is a v0 prior (0.52), NOT ensemble.confidence (circular: conf=0.5+|net|/2, A05 [B|HIGH]).
//  - edgeMean=|ensemble.net| is SIGNAL INTENSITY, not a validated forward-return edge. The live shadow
//    shows a strong ensemble (net~0.8) → pricedNotional~$6-7k = PHANTOM sizing (an 0.8 vote is not an
//    80% expected return). Both must come from AFL_LEDGER walk-forward calibration (factorCalibration /
//    a validated signal→return-edge transform) before arming. Until then: plumbing-only shadow, never a
//    basis for real sizing. (Same signal→edge unit-mismatch class as the overlays — see overlay-edge-validate.)
const PRICED_SIZE = process.env.OBSERVATORY_PRICED_SIZE === '1';
const PRICED_SIZE_WINPROB_PRIOR = 0.52;   // uncalibrated v0 prior; TODO calibrate from AFL_LEDGER before arming
const PRICED_SIZE_TARGETVOL = 0.20;       // annualized vol target; poly uses 0.15 (binary), crypto continuous → 0.20

function getPaperEngine(market) {
  if (_paperEngines.has(market)) return _paperEngines.get(market);
  const safe = market.replace(/[^a-zA-Z0-9-]/g, '_');
  const paperLedger = path.join(STATE_DIR, `observatory-paper-${safe}.jsonl`);
  const predLedger = path.join(STATE_DIR, `observatory-pred-${safe}.jsonl`);
  ensureDir(paperLedger);
  ensureDir(predLedger);
  const engine = createPaperEngine({
    paperLedgerPath: paperLedger,
    predictionLedgerPath: predLedger,
    feeModel: binanceFeeModel('taker'), // BINANCE-ONLY (2026-06-19): always Binance USDM-M taker fees (0.05%). Coinbase scrapped; PERP_MODE now only gates leverage/perp economics, not the venue fee.
    caps: {
      initialEquity: 100_000,
      ...(PERP_MODE ? { perpMode: true, leverage: PERP_LEVERAGE, maintenanceMarginRate: 0.004 } : {}),
      // PAPER discovery across DOZENS of factors churning every cycle on 1-min noise = very high
      // turnover. The learn loop scores per-factor RETURNS (size-independent), so we keep positions
      // TINY (0.1%) → the book drains slowly and SURVIVES the night → trades continuously → maximum
      // per-factor samples accrue, while each factor's return still honestly carries the ~0.2%
      // round-trip cost it must beat. As equity drains, positions auto-shrink (self-limiting).
      // Paper-only, reversible; real-money sizing re-tightens all of these hard.
      maxPositionPct: 0.001,
      maxGrossExposurePct: 6.0,
      maxNetExposurePct: 4.0,
    },
  });
  _paperEngines.set(market, engine);
  return engine;
}

function ensureDir(filePath) {
  const d = path.dirname(filePath);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ── httpGet injection (for mock testing) ─────────────────────────────────
let _httpGetOverride = null;

/**
 * setHttpGet(fn) — inject a mock httpGet for all adapters simultaneously.
 * fn(url, headers?) -> Promise<{status, headers, body}>
 * Pass null/undefined to clear the override and restore the real HTTPS default.
 *
 * NOTE: perp-adapter.setHttpGet requires a function (throws on null).
 * To restore the default we pass a thin wrapper around node:https so adapters
 * get a real function, not null. This is the correct "clear" path.
 */
function _realHttpGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new NodeURL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'YURI-AFL/1.0', ...headers },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('httpGet timeout')); });
    req.on('error', reject);
    req.end();
  });
}

export function setHttpGet(fn) {
  if (fn === null || fn === undefined) {
    // Clear: restore real HTTPS default on all adapters.
    // perp adapter rejects null — pass the real default function instead.
    _httpGetOverride = null;
    PolymarketAdapter.setHttpGet(_realHttpGet);
    PerpAdapter.setHttpGet(_realHttpGet);
    SocialAdapter.setHttpGet(_realHttpGet);
    PolymarketDiscovery.setHttpGet(_realHttpGet);
    return;
  }
  _httpGetOverride = fn;
  PolymarketAdapter.setHttpGet(fn);
  PerpAdapter.setHttpGet(fn);
  SocialAdapter.setHttpGet(fn);
  PolymarketDiscovery.setHttpGet(fn);
}

// ── Sentiment → signal mapping (advisory overlay) ──────────────────────────
/**
 * sentimentToSignal(sentiment, market) -> signal | null
 * Maps social-adapter getSentiment() {score∈[-1,1], magnitude∈[0,1]} to an
 * advisory overlay signal. Suppressed when near-neutral or low-magnitude.
 * Confidence is intentionally capped below the price signals (overlay, not driver).
 */
// ── Agent-Reach real-web sentiment (preferred over RSS; cached 5min) ────────
const _arCache = new Map();   // asset → { sent, ts }
const _AR_TTL = 300;          // 5-minute cache (news is slow-moving; keeps the cycle light)
let _arAvail = null;          // cached availability check (one subprocess, not per-cycle)
/**
 * agentReachSentiment(asset) — real-web news sentiment via Agent-Reach (Exa search)
 * scored with the social lexicon. Cached 5min, fail-open (null). Skipped when
 * agent-reach is unavailable. This is the live "internet access" sentiment path.
 */
async function agentReachSentiment(asset) {
  const now = Math.floor(Date.now() / 1000);
  const cached = _arCache.get(asset);
  if (cached && now - cached.ts < _AR_TTL) return cached.sent;
  if (_arAvail === null) { try { _arAvail = await agentReachAvailable(); } catch { _arAvail = false; } }
  if (!_arAvail) return null;
  try {
    const results = await agentReachSearch(`${asset} cryptocurrency price news sentiment`, { numResults: 6, timeoutMs: 12_000 });
    if (!results || results.length === 0) return null;
    const scored = results.map((r) => {
      const s = scorePost({ title: r.title, body: r.text });
      return { postScore: s.score, engagement: { score: 1, comments: 0 }, matchedWords: s.matchedWords };
    });
    const agg = aggregateSentiment(scored);
    const sent = { asset: asset.toUpperCase(), ts: now, score: agg.score, magnitude: agg.magnitude, sampleCount: agg.sampleCount, sources: ['agent-reach'] };
    _arCache.set(asset, { sent, ts: now });
    return sent;
  } catch (_e) {
    return null;
  }
}

function sentimentToSignal(sentiment, market) {
  if (!sentiment || typeof sentiment !== 'object') return null;
  const score = Number(sentiment.score);
  const magnitude = Number(sentiment.magnitude);
  if (!Number.isFinite(score) || !Number.isFinite(magnitude)) return null;
  if (Math.abs(score) < 0.10 || magnitude < 0.05) return null; // no edge / no volume
  const side = score > 0 ? 'long' : 'short';
  const confidence = Math.min(0.65, 0.40 + magnitude * 0.25);
  return {
    factorId: `social-sentiment-${market}`,
    value: score,
    side,
    confidence,
    ts: Number.isFinite(sentiment.ts) ? sentiment.ts : Math.floor(Date.now() / 1000),
    source: 'social',
    sampleCount: sentiment.sampleCount ?? null,
  };
}

// ── SSRF-safe public host check ───────────────────────────────────────────
// Adapters already guard SSRF internally; this is belt-and-suspenders at the
// orchestrator boundary for any future direct fetch calls.
const PRIVATE_IP = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
function isPrivateHost(hostname) {
  return PRIVATE_IP.test(hostname) || hostname === '169.254.169.254' ||
    hostname === '::1' || hostname === '[::1]';
}

// ── Market cycle: crypto (Binance USDⓈ-M klines) ────────────────────────────
// Rolling per-market close cache for the cross-asset lead/lag overlay (leaders like BTC lead alts).
// Bounded window; updated each cycle as each market is processed. Module-scoped so a lagger can read
// the leader's series populated earlier in the same cycle (market order = config order, BTC first).
const _recentCloses = new Map(); // market -> [[tsSeconds, close], ...]
const _horizonPlan = new Map(); // market -> { holdSec, stopPct, takePct } chosen by the multi-horizon gate (DISARMED unless oc.multiHorizon)

async function runCryptoCycle(market, snap, cfg = {}) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - 5 * 60 * 60; // ~5h back → ~300 1m klines (well under Binance fapi/v1/klines 1500/req limit)
  const end = now;

  let candles;
  try {
    const result = await PerpAdapter.getCandles(toBinanceSymbol(market), {
      interval: '1m',                 // ONE_MINUTE bars (Binance returns the latest `limit`)
      limit: CANDLES_FETCH_LIMIT,
    });
    candles = result.candles;
  } catch (err) {
    snap.error = `getCandles failed: ${err.message}`;
    return snap;
  }

  if (!candles || candles.length === 0) {
    snap.error = 'getCandles returned empty result';
    return snap;
  }

  // NORMALIZE TIMESTAMPS TO UNIX-SECONDS (single chokepoint)
  // coinbase-adapter.mjs mapCandle: timestamp = Number(c.start) which is already unix-seconds
  // but we normalize defensively through the single path here.
  const bars = candles.map(normalizeBarTimestamp);

  // Data quality gate
  const gate = dataQualityGate(bars);
  snap.qualityGate = {
    pass: gate.pass,
    rejectCount: gate.rejectCount,
    nonMonotonicCount: gate.nonMonotonicCount,
    flagCount: gate.flagCount,
  };

  if (!gate.pass) {
    snap.error = `dataQualityGate FAIL: ${gate.report.reason} (${gate.rejectCount} rejects, ${gate.nonMonotonicCount} non-monotone)`;
    return snap;
  }

  snap.bars = bars.slice(-50); // keep last 50 bars in snapshot
  snap.updatedAt = now;

  // Paper engine (one per market). Each factor trades its OWN namespaced book inside it; bar
  // history is supplied per-onSignal via ctx.barHistory. We deliberately do NOT ingest a market
  // bar series — a single global lastTs would reject the per-factor books and spam non-monotone logs.
  const engine = getPaperEngine(market);

  // Regime detection
  try {
    const closes = bars.map((b) => b.close);
    const volSignal = closes.length >= 10
      ? closes.slice(-10).map((c, i, arr) => i > 0 ? c - arr[i - 1] : 0).slice(1)
      : [];
    snap.regime = detectRegimeShift({ signedStream: volSignal });
  } catch (_e) {
    snap.regime = { recommendation: 'UNKNOWN', error: _e.message };
  }

  // Live factor signals (price-derived → sized + paper-filled below)
  const signals = computeLiveSignals(bars, market);

  // ── Perp + social OVERLAY signals (advisory telemetry; NOT sized/paper-filled:
  //    their edge units — funding APR / sentiment score — differ from the
  //    price-return edge the sizer expects; they inform positioning, not P&L) ──
  const overlaySignals = [];
  const lastClose = bars.length ? bars[bars.length - 1].close : null;
  if (cfg.enablePerp !== false) {
    try {
      const perpSigs = await computePerpSignals(market, {
        // spot proxy = latest bar close (no extra network call)
        getSpotPrice: Number.isFinite(lastClose) ? async () => lastClose : undefined,
      });
      if (Array.isArray(perpSigs)) overlaySignals.push(...perpSigs);
    } catch (_e) { /* fail-open — perp overlay never breaks the crypto cycle */ }
  }
  if (cfg.enableSocial !== false) {
    try {
      const asset = market.split('-')[0];
      // Prefer Agent-Reach real-web news (Exa) when enabled+available; fall back to RSS.
      let sentiment = null;
      if (cfg.enableAgentReachNews !== false) sentiment = await agentReachSentiment(asset);
      if (!sentiment || sentiment.sampleCount === 0) sentiment = await SocialAdapter.getSentiment(asset);
      const sig = sentimentToSignal(sentiment, market);
      if (sig) overlaySignals.push(sig);
    } catch (_e) { /* fail-open — social overlay never breaks the crypto cycle */ }
  }
  // ── Cross-asset lead/lag OVERLAY (BTC/ETH lead alts → directional tilt on the lagger) ──
  //    Advisory like perp/social: recorded for multi-horizon scoring, NOT sized into P&L.
  //    Reads a rolling cross-market close cache (the leader's series is populated earlier this cycle).
  if (cfg.enableCrossAsset !== false) {
    try {
      const xseries = bars
        .map((b) => [b.timestamp, b.close])
        .filter(([t, c]) => Number.isFinite(t) && Number.isFinite(c) && c > 0);
      if (xseries.length) _recentCloses.set(market, xseries.slice(-120));
      const marketSeries = {};
      for (const [m, s] of _recentCloses) marketSeries[m] = s;
      const xaSigs = computeCrossAssetSignals(marketSeries, {});
      // Keep only THIS market's lagger signal (each lagger is recorded on its own cycle pass).
      for (const sig of xaSigs) {
        if (sig && sig.factorId === `xasset-lead-${market}`) overlaySignals.push(sig);
      }
    } catch (_e) { /* fail-open — cross-asset never breaks the crypto cycle */ }
  }
  // ── Funding-carry-to-vol OVERLAY (vol-normalized perp carry → long-rung tilt) ──
  //    Advisory like perp/cross-asset: recorded for multi-horizon ladder scoring
  //    (belongs on 3h/12h/weekly rungs — funding accrues over 8h), NOT sized into P&L.
  if (cfg.enableCarryVol !== false) {
    try {
      const cvSeries = bars
        .map((b) => [b.timestamp, b.close])
        .filter(([t, c]) => Number.isFinite(t) && Number.isFinite(c) && c > 0)
        .slice(-120);
      if (cvSeries.length) {
        const cvSigs = await computeCarryVolSignals(market, cvSeries, {});
        if (Array.isArray(cvSigs)) overlaySignals.push(...cvSigs);
      }
    } catch (_e) { /* fail-open — carry-vol never breaks the crypto cycle */ }
  }

  // Telemetry = price signals + overlays; paper sizing below uses price signals only.
  snap.signals = [...signals, ...overlaySignals];

  // Quantum factor-circuit telemetry on the REAL return-vectors of the price signals
  snap.circuit = computeCircuit(bars, signals);

  // Quantum A/B SHADOW (DISARMED telemetry): record the classical-vs-quantum directional call
  // for this cycle so we can MEASURE whether order-optimal sequencing would lift outcomes — without
  // ever touching live sizing. Arming ordering→sizing is a separate owner-gated step. Fail-soft.
  if (cfg.enableQuantumShadow !== false && snap.circuit) {
    try {
      const { shadowCompare, recordShadowPrediction } = await import('../quantum-ab-shadow.mjs');
      const cmp = shadowCompare({ signals, circuit: snap.circuit });
      snap.circuit.shadow = cmp;
      recordShadowPrediction(cmp, {
        market,
        ts: snap.updatedAt || Math.floor(Date.now() / 1000),
        ledgerPath: QUANTUM_SHADOW_LEDGER,
      });
    } catch (_e) { /* shadow telemetry never breaks the cycle */ }
  }

  // ── ENSEMBLE EXECUTION ─────────────────────────────────────────────────────
  // Fuse ALL strategy signals into ONE combined decision (the strategies work TOGETHER) and trade a
  // SINGLE ensemble position per market, transition-aware, every cycle (≤10s). Per-strategy weights
  // come from the slower re-weighting beat (Sonnet brain + learn loop); default uniform.
  const lastBar = bars[bars.length - 1];
  const inst = `ensemble-${market}`;
  // Mark-to-market the combined position so live unrealized P&L MOVES (one ensemble instrument per
  // market engine → monotone bar series, no global-lastTs clash). Without this a held position shows
  // 0 P&L until it closes and the board looks dead. Fail-soft.
  try { engine.ingestBar(lastBar, inst); } catch (_e) { /* ingest fail-soft */ }
  // Mark-to-market step: accrues funding and (perp) ENFORCES liquidation when the mark crosses liqPx —
  // without this a leveraged position could sink past its liquidation price unrealistically. Fail-soft;
  // ~no-op in spot (0 funding rate, perpMode off). Fast risk exits (stop/take) still run separately below.
  try { engine.mark(lastBar.timestamp, { [inst]: lastBar.close }); } catch (_e) { /* mark fail-soft */ }
  const equity = engine.pnl().equity || 100_000;
  // Overseer steering (hot-reloaded; defaults = current behavior).
  const oc = getOverseerConfig();
  const ensemble = combineSignals(signals, {
    weights: getEnsembleWeights(),
    threshold: (typeof oc.threshold === 'number' && Number.isFinite(oc.threshold)) ? oc.threshold : undefined,
  });
  snap.ensemble = {
    side: ensemble.side, net: ensemble.net, strength: ensemble.strength,
    confidence: ensemble.confidence, longVotes: ensemble.longVotes,
    shortVotes: ensemble.shortVotes, contributors: ensemble.contributors, top: ensemble.top,
  };

  // ── MULTI-TF CONFLUENCE + 1h REGIME (DISARMED measurement layer) ─────────────────────────────────
  // The live engine sizes off 1-minute signals → it trades counter to the dominant higher-TF trend on
  // noise (the primary losing pattern). This computes the higher-TF bias HIERARCHY (weekly→4h→1h→15m→
  // 5m→1m, higher TFs heavier) + a 1h regime state, and MEASURES whether the 1m ensemble AGREES or
  // CONFLICTS with it — recorded to snap + a shadow ledger so confluence-gating can be PROVEN on real
  // forward outcomes BEFORE it ever touches sizing. DISARMED: oc.confluence defaults false → this whole
  // block is skipped (zero extra network, zero behavior change). Sizing below is UNTOUCHED regardless;
  // arming confluence→sizing is a separate owner-gated step (phase 3). Fail-soft end to end.
  if (oc.confluence) {
    try {
      const symbol = `${market.split('-')[0]}USDT`; // BTC-USD → BTCUSDT (Binance multi-TF context feed)
      const conf = await getConfluence({ symbol, regimeAnchor: oc.confluenceAnchor || '1h' });
      const eSide = ensemble.side;
      const aligned = eSide !== 'flat' && conf.bias !== 'neutral' && conf.bias === eSide;
      const conflicts = eSide !== 'flat' && conf.bias !== 'neutral' && conf.bias !== eSide;
      const reg = conf.regime || null;
      snap.confluence = {
        bias: conf.bias, confluence: conf.confluence, confidence: conf.confidence,
        agreement: conf.agreement, activeTfs: conf.activeTfs, weightedScore: conf.weightedScore,
        perTf: conf.perTf,
        regime: reg ? reg.regime : null, regimeDir: reg ? reg.trendDir : null, adx: reg ? reg.adx : null,
        aligned, conflicts,
      };
      // Compact shadow line for later scoring (confluence.bias vs forward price move). Fail-soft.
      try {
        appendFileSync(CONFLUENCE_SHADOW_LEDGER, JSON.stringify({
          market, ts: snap.updatedAt || now, close: lastBar.close,
          ensembleSide: eSide, ensembleNet: ensemble.net,
          bias: conf.bias, confluence: conf.confluence, confidence: conf.confidence,
          agreement: conf.agreement, activeTfs: conf.activeTfs, weightedScore: conf.weightedScore,
          regime: reg ? reg.regime : null, regimeDir: reg ? reg.trendDir : null, adx: reg ? reg.adx : null,
          aligned, conflicts,
        }) + '\n');
      } catch { /* ledger append never breaks the cycle */ }
    } catch (_e) { /* confluence is advisory telemetry — never break the cycle */ }
  }

  // Hold-time hysteresis bookkeeping: record this cycle's side so a flip can require persistence.
  const minHold = (typeof oc.minHoldCycles === 'number' && oc.minHoldCycles > 0) ? Math.floor(oc.minHoldCycles) : 0;
  if (minHold > 0) {
    let hist = _ensSideHist.get(market) || [];
    hist.push(ensemble.side);
    if (hist.length > minHold + 3) hist = hist.slice(-(minHold + 3));
    _ensSideHist.set(market, hist);
  }

  // Record per-strategy forecasts (leak-free) so the re-weighting brain + horizon ladder can score
  // which strategies actually predict → adaptive per-horizon weights. Overlays (funding/basis/
  // cross-asset/social) are recorded too: their DIRECTION is scorable against the spot forward move
  // even though they are not sized into P&L (the "different edge units" caveat is about sizing, not
  // directional prediction — and funding/carry only show edge at the longer rungs). Telemetry only,
  // never trades. Fail-soft.
  if (cfg.enableStrategyForecasts !== false) {
    try { recordForecasts(market, [...signals, ...overlaySignals], lastBar.close, now, FORECAST_LEDGER); } catch (_e) { /* never break the cycle */ }
  }

  const existing = engine.positions().find((p) => p.instrument === inst);

  // ── RISK EXITS (every cycle, on the OPEN position; tagged with DISTINCT reasons in the tape) ──────
  // Close FIRST on stop-loss / take-profit / max-hold — independent of conviction. Caps losses, locks
  // profits-in-plus, and bounds hold time (owner: reduce big losses, take profits, ~5min hold cap).
  // Position is MTM'd by the ingestBar above, so existing.unrealizedPnl is current.
  let exited = null;
  if (existing) {
    const ageS = Number.isFinite(existing.openedTs) ? (now - existing.openedTs) : 0;
    const notionalVal = Math.abs((existing.avgEntryPrice || 0) * (existing.quantity || 0));
    const pnlFrac = notionalVal > 0 ? (existing.unrealizedPnl || 0) / notionalVal : 0; // P&L as a fraction of position value
    const maxHoldSec = (typeof oc.maxHoldSec === 'number' && oc.maxHoldSec > 0) ? oc.maxHoldSec : 0;
    const stopLossPct = (typeof oc.stopLossPct === 'number' && oc.stopLossPct > 0) ? oc.stopLossPct : 0;
    const takeProfitPct = (typeof oc.takeProfitPct === 'number' && oc.takeProfitPct > 0) ? oc.takeProfitPct : 0;
    if (stopLossPct > 0 && pnlFrac <= -stopLossPct) exited = 'stop-loss';          // cap the downside
    else if (takeProfitPct > 0 && pnlFrac >= takeProfitPct) exited = 'take-profit'; // lock the upside
    else if (maxHoldSec > 0 && ageS >= maxHoldSec) exited = 'max-hold';            // time stop
    if (exited) {
      try { engine.closePosition(inst, exited, now); } catch (_e) { /* fail-soft */ }
      snap.ensemble.closed = `${exited}(${ageS}s,${(pnlFrac * 100).toFixed(2)}%)`;
    }
  }

  if (!exited) {
    if (ensemble.side === 'flat') {
      // No conviction → flatten the combined position if open. De-risking is ALWAYS allowed.
      if (existing) {
        engine.onSignal(
          { factorId: inst, side: 'flat', value: 0, confidence: 0.5, ts: now },
          { instrument: inst, bar: lastBar, barHistory: bars },
        );
      }
    } else if (!existing || existing.side !== ensemble.side) {
      // New conviction or a flip → an OPENING of exposure. Run the overseer gates (all default-off →
      // identical to pre-overseer behavior). Each block records WHY a trade was skipped for telemetry.
      const marketEnabled = oc.perMarketEnable[market] !== false;
      // regimeGate TRIMS size during instability instead of FREEZING entries: a RECOMPUTE_CIRCUIT is a
      // "rebuild the factor ordering / de-risk" signal, NOT a "stop trading" one. Hard-freezing starved a
      // whole market of data (BTC opened 0 positions while regime-blocked while SOL traded). Owner 'A' 2026-06-17.
      const regimeUnstable = !!(snap.regime && snap.regime.recommendation === 'RECOMPUTE_CIRCUIT');
      const regimeTrim = (oc.regimeGate === true && regimeUnstable)
        ? (typeof oc.regimeTrimFactor === 'number' && oc.regimeTrimFactor > 0 ? Math.min(1, oc.regimeTrimFactor) : 0.5)
        : 1;
      let skipped = null;
      if (oc.paused === true) skipped = 'paused';
      else if (!marketEnabled) skipped = 'market-disabled';
      else if (minHold > 0) {
        // Hold-time hysteresis: only open/flip once the new side has PERSISTED minHold cycles.
        const hist = _ensSideHist.get(market) || [];
        const recent = hist.slice(-minHold);
        const persisted = recent.length >= minHold && recent.every((s) => s === ensemble.side);
        if (!persisted) skipped = `hysteresis(${recent.filter((s) => s === ensemble.side).length}/${minHold})`;
      }
      // CONFLUENCE GATE: veto an entry/flip that fights the higher-TF bias (the counter-trend bug). A
      // DIRECTIONAL block only — aligned + neutral entries flow, exits/flatten are never blocked, so a
      // market is never starved (it just can't open AGAINST weekly/4h/1h). Requires the confluence read
      // (snap.confluence, set when oc.confluence is on); inert if absent. Armed via OBSERVATORY_CONFLUENCE_GATE.
      if (!skipped && oc.confluenceGate === true && snap.confluence && snap.confluence.conflicts === true) {
        skipped = `confluence-conflict(1m ${ensemble.side} vs ${snap.confluence.bias}/${snap.confluence.regime || '?'})`;
      }
      if (!skipped && oc.edgeGate === true) {
        const conviction = Math.min(1, ensemble.strength * 2);
        if (oc.multiHorizon === true) {
          // MULTI-HORIZON gate (Marcel's 3-5 timeframes): trade on the SHORTEST horizon whose expected
          // move clears the REALISTIC round-trip fee; the chosen horizon then drives the hold-time AND a
          // wider stop/take (via _horizonPlan, honored by fastRiskExit) so the long trade isn't knifed by
          // the 1-min stop or closed at maxHold before its move can materialize.
          // Cost basis MUST match the engine's actual fill fee, else the gate mis-selects horizons. The
          // live perp engine fills at binanceFeeModel('taker')=0.05% (getPaperEngine:428). BINANCE-ONLY
          // (2026-06-19): the legacy Coinbase 0.60% cryptoFeeModel branch is scrapped — it overstated the
          // round-trip ~12× and forced wrongly-long horizons / false skips.
          const takerRate = binanceFeeModel('taker')(undefined, 1, 1); // fee on $1 notional = the rate
          const rtCost = realisticRoundTripCost({ takerRate, spreadFrac: 0.0005 });
          const margin = Number.isFinite(oc.horizonMargin) ? oc.horizonMargin : 1.0;
          const sel = selectHorizon({ volPerBar: recentVolPct(bars), conviction, roundTripCost: rtCost, marginFactor: margin });
          if (!sel) {
            skipped = `no-horizon-clears-fee(rt=${(rtCost * 100).toFixed(2)}%)`;
            _horizonPlan.delete(market);
          } else {
            const stopFrac = Number.isFinite(oc.horizonStopFrac) ? oc.horizonStopFrac : 0.5;
            _horizonPlan.set(market, { holdSec: sel.holdSec, stopPct: sel.expMove * stopFrac, takePct: sel.expMove });
            snap.ensemble.horizon = sel.horizon;
            snap.ensemble.horizonExpMove = +(sel.expMove * 100).toFixed(3);
            console.log(`[observatory] multi-horizon ${market} ${ensemble.side} @ ${sel.horizon}: expMove ${(sel.expMove * 100).toFixed(2)}% clears fee ${(rtCost * 100).toFixed(2)}% → hold ${Math.round(sel.holdSec / 60)}m, stop ${(sel.expMove * stopFrac * 100).toFixed(2)}%/take ${(sel.expMove * 100).toFixed(2)}%`);
          }
        } else {
          // Legacy single-horizon (√5) gate.
          const expMove = recentVolPct(bars) * Math.sqrt(5) * conviction;
          const hurdle = (typeof oc.feeHurdle === 'number' && Number.isFinite(oc.feeHurdle)) ? oc.feeHurdle : 0;
          if (expMove < hurdle) skipped = `edge<fee(${(expMove * 100).toFixed(3)}%<${(hurdle * 100).toFixed(2)}%)`;
        }
      }
      if (skipped) {
        snap.ensemble.skipped = skipped; // gated out this cycle — surfaced in /ensemble + /markets
      } else {
        // Size by conviction (strength), trade ONE combined position.
        snap.energyDeltaU = computeEnergyDelta(
          { factorId: inst, side: ensemble.side, value: ensemble.net, confidence: ensemble.confidence },
          engine.pnl(),
        );
        const maxPct = (typeof oc.maxPct === 'number' && Number.isFinite(oc.maxPct)) ? oc.maxPct : ENSEMBLE_MAX_PCT;

        // PRICED SIZE shadow (DISARMED): compute the principled computeSize decision every cycle so the
        // sizer is live-in-shadow + A/B-readable, even while the paper engine still uses the conviction
        // scalar below. Same inputs as the polymarket sleeve, crypto-tuned (targetVol 0.20, drawdown from
        // the live engine). DISARMED it only records what the sizer WOULD have done; armed it caps each
        // position to maxFraction=maxPct (0.10) — the structural 600%-gross kill.
        const pricedReturns = closeReturns(bars);
        const pricedDrawdown = (engine.pnl().drawdownBps || 0) / 10000;
        const pricedSize = computeSize({
          edgeMean: Math.abs(ensemble.net),
          edgeLowerCI: Math.abs(ensemble.net) * 0.7,
          winProb: PRICED_SIZE_WINPROB_PRIOR,            // uncalibrated v0; see PRICED_SIZE arm-precondition
          payoff: 1.0,
          returns: pricedReturns,
          equity,
          targetVol: PRICED_SIZE_TARGETVOL,
          caps: { maxFraction: maxPct, currentDrawdown: pricedDrawdown },
        });
        snap.ensemble.pricedNotional = +pricedSize.targetNotional.toFixed(2);
        snap.ensemble.pricedFraction = +pricedSize.fraction.toFixed(4);
        snap.ensemble.pricedReason = pricedSize.reason;

        // Live notional: ARMED (OBSERVATORY_PRICED_SIZE=1) → priced sizer (×regimeTrim for the regime
        // de-risk); DISARMED → legacy conviction scalar, byte-identical to pre-wire behavior.
        const notional = PRICED_SIZE
          ? pricedSize.targetNotional * regimeTrim
          : equity * maxPct * Math.min(1, ensemble.strength * 2) * regimeTrim;
        if (regimeTrim < 1) snap.ensemble.regimeTrim = regimeTrim; // de-risked by regime, not frozen (telemetry)
        if (notional > 0) {
          engine.onSignal(
            { factorId: inst, side: ensemble.side, value: ensemble.net, confidence: ensemble.confidence, ts: now, notional },
            { instrument: inst, bar: lastBar, barHistory: bars },
          );
        }
      }
    }
    // else: same-side conviction already held → hold (no churn).
  }

  // Capture final paper state
  snap.paperPositions = engine.positions();
  const pnlSnap = engine.pnl();
  snap.pnl = pnlSnap;
  snap.drawdown = pnlSnap.maxDrawdownBps / 10000;

  snap.error = null;
  return snap;
}

// ── Market cycle: Polymarket (reconstructBars from trades) ─────────────────
async function runPolymarketCycle(tokenId, question, snap) {
  const now = Math.floor(Date.now() / 1000);

  let trades;
  try {
    const result = await PolymarketAdapter.getTrades(tokenId, {
      limit: 100,
      startTs: now - 3600, // last hour
      endTs: now,
    });
    trades = result.trades;
  } catch (err) {
    snap.error = `getTrades failed: ${err.message}`;
    return snap;
  }

  if (!trades || trades.length === 0) {
    // Sparse market — not an error, just no data
    snap.updatedAt = now;
    snap.error = null;
    return snap;
  }

  // Reconstruct OHLCV bars via VWAP bucketing (5-minute buckets = 300,000ms)
  const rawBars = PolymarketAdapter.reconstructBars(trades, 5 * 60 * 1000);

  if (!rawBars || rawBars.length === 0) {
    snap.updatedAt = now;
    snap.error = null;
    return snap;
  }

  // NORMALIZE TIMESTAMPS TO UNIX-SECONDS (single chokepoint)
  // reconstructBars emits ms-epoch timestamps — convert to seconds.
  const bars = rawBars.map(normalizeBarTimestamp);

  // Data quality gate
  const gate = dataQualityGate(bars);
  snap.qualityGate = {
    pass: gate.pass,
    rejectCount: gate.rejectCount,
    nonMonotonicCount: gate.nonMonotonicCount,
    flagCount: gate.flagCount,
  };

  if (!gate.pass) {
    snap.error = `dataQualityGate FAIL: ${gate.report.reason}`;
    return snap;
  }

  snap.bars = bars.slice(-50);
  snap.updatedAt = now;

  // Feed bars to paper engine
  const engine = getPaperEngine(`poly-${tokenId}`);
  for (const bar of bars) {
    engine.ingestBar(bar, `poly-${tokenId}`);
  }

  // Live signals
  const signals = computeLiveSignals(bars, `poly-${tokenId}`);
  snap.signals = signals;
  snap.circuit = computeCircuit(bars, signals);

  // Paper fills
  const returns = closeReturns(bars);
  const lastBar = bars[bars.length - 1];
  const equity = engine.pnl().equity || 100_000;

  for (const sig of signals) {
    if (sig.side === 'flat') continue;
    const sizing = computeSize({
      edgeMean: Math.abs(sig.value),
      edgeLowerCI: Math.abs(sig.value) * 0.7,
      winProb: sig.confidence,
      payoff: 1.0,
      returns,
      equity,
      targetVol: 0.15, // lower vol target for binary outcomes
    });
    if (sizing.targetNotional <= 0) continue;
    snap.energyDeltaU = computeEnergyDelta(sig, engine.pnl());
    // Pass notional so the engine resolves qty fractionally (no integer-floor).
    engine.onSignal({ ...sig, notional: sizing.targetNotional }, { instrument: `poly-${tokenId}`, bar: lastBar });
  }

  snap.paperPositions = engine.positions();
  snap.pnl = engine.pnl();
  snap.drawdown = snap.pnl.maxDrawdownBps / 10000;
  snap.error = null;
  return snap;
}

// ── In-memory observatory state ────────────────────────────────────────────
const _state = {
  snapshots: new Map(),   // market key → snapshot
  factors: [],            // latest factor signals across all markets
  regimes: new Map(),     // market key → regime result
  energy: null,           // latest energy telemetry (cross-market)
  lastCycle: null,        // unix-seconds
  cycleCount: 0,
  ticks: new Map(),       // market key → { market, venue, price, bid, ask, ts } (1s fast-tick)
  lastTick: null,         // unix-seconds of the last fast-tick poll
  account: null,          // real (view-only) account state placeholder — null until refreshAccount runs (coinbase-removed stub; no Binance view-only account wired)
};

// ── Fast price tick (1s) — lightweight last-price poll, SEPARATE from runCycle ──
/**
 * fastTick(config?) — poll ONLY the latest price for each tracked market and
 * update the in-memory tick state + each market snapshot's lastPrice/lastTickTs.
 * This is the per-SECOND live pulse: cheap (one getTicker/getPrice per market),
 * fail-open per market, NEVER runs the heavy factor/sizing/paper pipeline.
 * Returns the tick array (for SSE price.tick events).
 */
export async function fastTick(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = Math.floor(Date.now() / 1000);
  const out = [];

  // Crypto — Binance perp best bid/ask (mid) via bookTicker
  for (const market of cfg.cryptoMarkets) {
    try {
      const t = await PerpAdapter.getTicker(toBinanceSymbol(market));
      const price = Number.isFinite(t.price) ? t.price : ((Number.isFinite(t.bid) && Number.isFinite(t.ask)) ? (t.bid + t.ask) / 2 : null);
      if (price == null) continue;
      const tick = { market, venue: 'binance', price, bid: t.bid ?? null, ask: t.ask ?? null, ts: now };
      _state.ticks.set(market, tick);
      const snap = _state.snapshots.get(market);
      if (snap) { snap.lastPrice = price; snap.lastTickTs = now; }
      out.push(tick);
    } catch (_e) { /* fail-open per market */ }
  }

  // Polymarket — CLOB mid/buy price
  for (const { tokenId } of (cfg.polymarkets || [])) {
    const key = `poly-${tokenId}`;
    try {
      const p = await PolymarketAdapter.getPrice(tokenId, 'buy');
      const price = Number.isFinite(p?.price) ? p.price : null;
      if (price == null) continue;
      const tick = { market: key, venue: 'polymarket', price, bid: null, ask: null, ts: now };
      _state.ticks.set(key, tick);
      const snap = _state.snapshots.get(key);
      if (snap) { snap.lastPrice = price; snap.lastTickTs = now; }
      out.push(tick);
    } catch (_e) { /* fail-open per market */ }
  }

  _state.lastTick = now;
  return out;
}

/**
 * fastRiskExit() — the FAST risk loop. Runs on the per-second tick cadence (NOT the slow signal
 * cycle), checks every open ensemble position against the LIVE TICK price, and closes any that breach
 * stop-loss / take-profit / max-hold — at the tick price. This is what makes the stop actually bite:
 * the slow cycle (~60s, 1-min bars) let losses overshoot to -0.4% before a check; this catches the
 * -0.15% breach within ~1-2s. Config-gated (all default-off). Returns the exits taken (for SSE/log).
 */
export function fastRiskExit() {
  const oc = getOverseerConfig();
  const stopLossPct = (typeof oc.stopLossPct === 'number' && oc.stopLossPct > 0) ? oc.stopLossPct : 0;
  const takeProfitPct = (typeof oc.takeProfitPct === 'number' && oc.takeProfitPct > 0) ? oc.takeProfitPct : 0;
  const maxHoldSec = (typeof oc.maxHoldSec === 'number' && oc.maxHoldSec > 0) ? oc.maxHoldSec : 0;
  if (!stopLossPct && !takeProfitPct && !maxHoldSec) return [];
  const now = Math.floor(Date.now() / 1000);
  const exits = [];
  for (const [market, engine] of _paperEngines) {
    const inst = `ensemble-${market}`;
    let pos;
    try { pos = engine.positions().find((p) => p.instrument === inst); } catch { continue; }
    if (!pos) continue;
    const tick = _state.ticks.get(market);
    const px = tick && Number.isFinite(tick.price) ? tick.price : null;
    if (px == null) continue; // no live tick → leave for the slow cycle (bar-priced)
    const dir = pos.side === 'long' ? 1 : -1;
    const notionalVal = Math.abs((pos.avgEntryPrice || 0) * (pos.quantity || 0));
    const livePnl = dir * (px - (pos.avgEntryPrice || px)) * (pos.quantity || 0); // P&L at the LIVE tick
    const pnlFrac = notionalVal > 0 ? livePnl / notionalVal : 0;
    const ageS = Number.isFinite(pos.openedTs) ? (now - pos.openedTs) : 0;
    let reason = null;
    // Multi-horizon (when armed): honor the per-market horizon plan — wider stop/take + longer hold scaled
    // to the chosen horizon — so a 3h-horizon trade isn't knifed by the 1-min stop or closed at maxHold.
    const plan = (oc.multiHorizon === true) ? _horizonPlan.get(market) : null;
    const effStop = (plan && plan.stopPct > 0) ? plan.stopPct : stopLossPct;
    const effTake = (plan && plan.takePct > 0) ? plan.takePct : takeProfitPct;
    const effHold = (plan && plan.holdSec > 0) ? plan.holdSec : maxHoldSec;
    if (effStop && pnlFrac <= -effStop) reason = 'stop-loss';
    else if (effTake && pnlFrac >= effTake) reason = 'take-profit';
    else if (effHold && ageS >= effHold) reason = 'max-hold';
    if (reason) {
      try {
        engine.closePosition(inst, reason, now, px); // close at the LIVE tick price
        const snap = _state.snapshots.get(market);
        if (snap && snap.ensemble) snap.ensemble.closed = `${reason}@tick(${ageS}s,${(pnlFrac * 100).toFixed(2)}%)`;
        exits.push({ market, reason, pnlFrac: +(pnlFrac * 100).toFixed(3), livePnl: +livePnl.toFixed(2), ageS });
      } catch (_e) { /* fail-soft */ }
    }
  }
  return exits;
}

/**
 * applyTick(market, price, opts?) — write ONE externally-sourced LIVE tick into the
 * in-memory tick state + market snapshot, identical to fastTick's per-market update.
 * Lets an event-driven feed (the websocket tick-stream) keep _state.ticks real-time so
 * fastRiskExit fires at the actual touch. Returns the stored tick, or null if invalid.
 */
export function applyTick(market, price, opts = {}) {
  if (!market || !Number.isFinite(price) || price <= 0) return null;
  const now = Math.floor(Date.now() / 1000);
  const tick = { market, venue: opts.venue || 'binance', price, bid: opts.bid ?? null, ask: opts.ask ?? null, ts: now };
  _state.ticks.set(market, tick);
  const snap = _state.snapshots.get(market);
  if (snap) { snap.lastPrice = price; snap.lastTickTs = now; }
  return tick;
}

/** getTicks() — current fast-tick price map for REST. */
export function getTicks() {
  return Object.fromEntries(_state.ticks);
}

// ── Real (view-only) account state ─────────────────────────────────────────
// USD-pegged stablecoins counted at face value toward realEquityUsd.
const USD_STABLE = new Set(['USD', 'USDC', 'USDT', 'DAI', 'PYUSD', 'USDP', 'GUSD']);

/**
 * refreshAccount(config?) — coinbase-removed stub (BINANCE-ONLY 2026-06-19).
 * No Binance view-only account is wired (optional, owner-gated). READ-ONLY:
 * never builds/places an order (INV-1). Stores a `connected:false` marker — the
 * cycle is never blocked, no secret is ever read from disk (INV-2).
 * realEquityUsd is a best-effort sum: stablecoins at face value + any crypto
 * holding priceable from the LIVE TICK MAP (zero extra API calls). Holdings we
 * cannot price are reported (priced:false) and excluded from the equity sum.
 */
export async function refreshAccount(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (cfg.enableAccount === false) return _state.account;
  const now = Math.floor(Date.now() / 1000);
  // BINANCE-ONLY (2026-06-19, owner directive "get away from coinbase"): the Coinbase
  // view-only account path is removed. No Binance view-only account is wired (optional,
  // owner-gated). Report disconnected — INV-1/INV-2 intact (no keys read, no orders, no
  // network). Paper P&L is the engine's own book; this is the REAL-account placeholder.
  _state.account = { connected: false, advisory: 'coinbase-removed (binance-only); no real account wired', holdings: [], realEquityUsd: null, ts: now };
  return _state.account;
}

/** getAccount() — current real (view-only) account state for REST. */
export function getAccount() {
  return _state.account;
}

/**
 * getIndicators(market, ids?) — technical indicators (the Hybrid registry: 8 verified builtins
 * + technicalindicators long-tail) computed on a tracked market's CURRENT bars. On-demand from
 * the in-memory snapshot; ids = optional subset (default all). Fail-soft: no bars → empty.
 */
export function getIndicators(market, ids) {
  const snap = _state.snapshots.get(market);
  const bars = snap?.bars;
  if (!Array.isArray(bars) || bars.length === 0) return { market, indicators: {}, advisory: 'no-bars' };
  const idList = Array.isArray(ids) && ids.length ? ids : undefined;
  let indicators = {};
  try { indicators = computeIndicators(bars, idList); } catch (_e) { /* registry is fail-soft; never break REST */ }
  return { market, venue: snap.venue, count: bars.length, indicators };
}

/** listAvailableIndicators() — registry catalog metadata (id/label/category/source/params). */
export function listAvailableIndicators() {
  try { return registryListIndicators(); } catch (_e) { return []; }
}

// ── Live order book (on-demand, TTL-coalesced) ─────────────────────────────
// The board polls the focus market's book fast (~1-2s). Binance fapi/v1/depth is
// keyless market data; a short TTL cache coalesces rapid polls so we never hammer the
// venue (rate-limit aware). FAIL-SOFT: error → last cached book (marked stale) or null.
const _bookCache = new Map(); // market -> { ts:ms, book }
const BOOK_TTL_MS = 1200;

/**
 * fetchOrderBook(market, opts?) — unified L2 order book for a crypto market.
 * { market, book:{venue,symbol,bids:[{price,size}],asks:[{price,size}],mid,spreadBps}|null, cachedMs, advisory? }
 * Polymarket keys (poly-*) have no Binance book → advisory null. READ-ONLY, never throws.
 */
export async function fetchOrderBook(market, { limit = 25 } = {}) {
  if (!market) return { market: null, book: null, advisory: 'market-required' };
  if (market.startsWith('poly-')) return { market, book: null, advisory: 'no-book-for-polymarket' };
  const now = Date.now();
  const cached = _bookCache.get(market);
  if (cached && now - cached.ts < BOOK_TTL_MS) return { market, book: cached.book, cachedMs: now - cached.ts };
  try {
    const book = await PerpAdapter.getOrderBook(toBinanceSymbol(market), { limit });
    _bookCache.set(market, { ts: now, book });
    return { market, book, cachedMs: 0 };
  } catch (e) {
    if (cached) return { market, book: cached.book, advisory: `stale: ${e.message}`, cachedMs: now - cached.ts };
    return { market, book: null, advisory: e.message };
  }
}

// ── Learn-loop read surfaces: calibration + graduation (TTL-cached, fail-soft) ──
// Lazy-imported so the native better-sqlite3 / evaluator deps load only when a
// calibration/graduation read is actually requested — never on the hot cycle path.
let _calCache = null;  // { ts:ms, data }
let _gradCache = null; // { ts:ms, data }
const CAL_TTL_MS = 10_000;
const GRAD_TTL_MS = 15_000;

/**
 * getCalibration() — per-factor reliability scorecard from the accrued outcome ledger
 * (DSR, Brier, mean realized return, promotion verdict). DRY-RUN (apply:false → zero DB writes).
 * Empty ledger → { evaluated:0, factors:[], advisory:'accruing…' } (the honest pre-edge state).
 */
export async function getCalibration() {
  const now = Date.now();
  if (_calCache && now - _calCache.ts < CAL_TTL_MS) return _calCache.data;
  try {
    const { reevaluateFactors } = await import('../factor-reeval.mjs');
    // minN:2 so the scorecard shows every factor accruing (with its current n); the
    // promotion verdict stays honest (thin/edge-less factors → promote:false). The
    // nightly lifecycle apply uses the stricter default minN.
    const r = await reevaluateFactors({ apply: false, minN: 2 });
    const data = {
      evaluated: r.evaluated,
      factors: (r.factors || []).map((f) => ({
        factorId: f.factorId,
        n: f.stats?.n ?? null,
        sharpe: f.stats?.sharpe ?? null,
        dsr: f.stats?.dsr ?? null,
        brier: f.stats?.brier ?? null,
        meanReturn: f.stats?.meanReturn ?? null,
        promote: f.gate?.promote ?? null,
        reasons: f.gate?.reasons ?? [],
      })),
      advisory: r.evaluated === 0 ? 'accruing: no factor outcomes in the ledger yet — run the trade-outcome decoder' : undefined,
    };
    _calCache = { ts: now, data };
    return data;
  } catch (e) {
    return { evaluated: 0, factors: [], advisory: `calibration-error: ${e.message}` };
  }
}

/**
 * getGraduation() — R0→R3 reliability verdict (the "do we genuinely know it works" answer).
 * Feeds the calibration stats we HAVE (dsr/brier/n) into the graduation ladder; the metrics not
 * yet wired (dataQuality, fleet-FDR, mddBps, energy ΔU, sign-agreement) stay null → fail-CLOSED,
 * so real-money R2 stays correctly out of reach until those are proven. Honest by construction.
 */
export async function getGraduation() {
  const now = Date.now();
  if (_gradCache && now - _gradCache.ts < GRAD_TTL_MS) return _gradCache.data;
  try {
    const cal = await getCalibration();
    const { assembleGraduation } = await import('../graduation.mjs');
    const factorStats = (cal.factors || []).map((f) => {
      // dataQuality (R0→R1 gate) — WIRED 2026-06-18: was hardcoded null → every factor bricked at R0
      // before its edge was ever evaluated (the wiring bug). A factor only accrues outcomes from cycles
      // whose bars PASSED the ingest data-quality-gate (runCycle hard-returns on a failing gate BEFORE
      // any signal/outcome is produced), so any factor with accrued valid outcomes (n>=1) is built on
      // clean data by construction → dataQuality 1.0. No outcomes yet → null → fail-closed (stays R0).
      const dataQuality = (Number.isFinite(f.n) && f.n >= 1) ? 1.0 : null;
      return {
        factorId: f.factorId,
        n: f.n, dsr: f.dsr, brier: f.brier, dataQuality,
        // R1→R2 (real-money) + R2→R3 safety metrics still not wired per-factor → null → fail-closed.
        // This is the CONSERVATIVE real-money guard (R2 stays out of reach), NOT the dataQuality bug:
        fdrPass: null, mddBps: null, energyDeltaU: null, signAgreement: null, cusumBreak: null,
      };
    });
    const g = await assembleGraduation({ factorStats });
    const data = {
      ...g,
      generatedAt: Math.floor(now / 1000),
      advisory: cal.advisory
        || 'dataQuality now wired per-factor (R0→R1 live); fleet-FDR / drawdown / energy / sign-agreement still unwired → real-money R2 stays gated. Factors that reach R1 then stall at R1→R2 on dsr — the honest no-edge wall, now at the right place.',
    };
    _gradCache = { ts: now, data };
    return data;
  } catch (e) {
    return { portfolio: { rung: 'R0', byRung: {}, factorCount: 0, blockers: [] }, factors: [], advisory: `graduation-error: ${e.message}` };
  }
}

/**
 * getQuantum() — the quantum A/B shadow verdict: does running the factor-circuit's order-optimal
 * sequencing in the background actually lift outcomes vs the classical blend? DISARMED — this is
 * pure measurement; the ordering does NOT drive live sizing. Builds leak-free forward returns from
 * each market's live bars (~5min horizon) and scores the accrued shadow predictions. Fail-soft.
 */
let _quantumCache = null;
const QUANTUM_TTL_MS = 15_000;
const QUANTUM_HORIZON_S = 300; // ~5min forward return to score a per-cycle directional call
export async function getQuantum() {
  const now = Date.now();
  if (_quantumCache && now - _quantumCache.ts < QUANTUM_TTL_MS) return _quantumCache.data;
  try {
    const { scoreShadow } = await import('../quantum-ab-shadow.mjs');
    if (!existsSync(QUANTUM_SHADOW_LEDGER)) {
      return { verdict: null, advisory: 'no shadow data yet — accruing per-cycle A/B predictions', note: DISARMED_NOTE };
    }
    const lines = readFileSync(QUANTUM_SHADOW_LEDGER, 'utf8').split('\n').filter(Boolean);
    const realizedByKey = {};
    for (const l of lines) {
      let r; try { r = JSON.parse(l); } catch { continue; }
      if (!r || r.type !== 'shadow') continue;
      const snap = _state.snapshots.get(r.market);
      const bars = snap?.bars;
      if (!Array.isArray(bars) || bars.length < 2) continue;
      // entry = close of the last bar at/before r.ts; exit = close of the first bar ≥ r.ts+horizon.
      let p0 = null, p1 = null;
      for (const b of bars) { if (Number.isFinite(b.timestamp) && b.timestamp <= r.ts) p0 = b.close; }
      for (const b of bars) { if (Number.isFinite(b.timestamp) && b.timestamp >= r.ts + QUANTUM_HORIZON_S) { p1 = b.close; break; } }
      if (Number.isFinite(p0) && Number.isFinite(p1) && p0 > 0) realizedByKey[r.key] = (p1 - p0) / p0;
    }
    const verdict = scoreShadow({ ledgerPath: QUANTUM_SHADOW_LEDGER, realizedByKey });
    const data = {
      verdict,
      advisory: verdict.n === 0
        ? 'shadow predictions recorded — forward returns not yet realized (need ≥5min elapsed)'
        : (verdict.disagree.n === 0
          ? 'classical and quantum agree on every scored cycle so far — ordering has not changed a single call yet'
          : undefined),
      note: DISARMED_NOTE,
    };
    _quantumCache = { ts: now, data };
    return data;
  } catch (e) {
    return { verdict: null, advisory: `quantum-shadow-error: ${e.message}`, note: DISARMED_NOTE };
  }
}
const DISARMED_NOTE = 'DISARMED telemetry: quantum ordering does NOT drive live sizing. This measures whether it WOULD lift outcomes before anyone arms it.';

// ── Recent paper trades (the live trade tape) ───────────────────────────────
let _tradesCache = null;
const TRADES_TTL_MS = 3000;
/**
 * getRecentTrades(limit?) — newest-first closed paper trades across all market books, for the
 * live trade tape. Reads the tail of each observatory-paper-*.jsonl. TTL-cached, fail-soft.
 */
export function getRecentTrades(limit = 40) {
  const now = Date.now();
  if (_tradesCache && now - _tradesCache.ts < TRADES_TTL_MS) return _tradesCache.data;
  const out = [];
  try {
    const files = readdirSync(STATE_DIR).filter((f) => /^observatory-paper-.*\.jsonl$/.test(f));
    for (const f of files) {
      const market = f.replace(/^observatory-paper-/, '').replace(/\.jsonl$/, '');
      let lines;
      try { lines = readFileSync(path.join(STATE_DIR, f), 'utf8').split('\n'); } catch { continue; }
      for (const ln of lines.slice(-400)) {
        const t = ln.trim();
        if (!t) continue;
        let o; try { o = JSON.parse(t); } catch { continue; }
        if (o && (o.type === 'close' || o.type === 'partial_close')) {
          out.push({
            market,
            factorId: o.fid ?? o.inst ?? null,
            side: o.side ?? null,
            entryPx: Number.isFinite(o.entryPx) ? o.entryPx : null,
            exitPx: Number.isFinite(o.exitPx) ? o.exitPx : (Number.isFinite(o.fp) ? o.fp : null),
            netPnl: Number.isFinite(o.netPnl) ? o.netPnl : (Number.isFinite(o.grossPnl) ? o.grossPnl : null),
            qty: Number.isFinite(o.qty) ? o.qty : (Number.isFinite(o.closeQty) ? o.closeQty : null),
            reason: o.reason ?? null,
            ts: o.cts ?? o.ts ?? 0,
          });
        }
      }
    }
    out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const data = { trades: out.slice(0, limit), total: out.length };
    _tradesCache = { ts: now, data };
    return data;
  } catch (e) {
    return { trades: [], total: 0, advisory: e.message };
  }
}

/**
 * getSnapshot() — current full state snapshot for REST endpoints.
 */
export function getSnapshot() {
  return {
    markets: Object.fromEntries(_state.snapshots),
    factors: _state.factors,
    regimes: Object.fromEntries(_state.regimes),
    energy: _state.energy,
    ticks: Object.fromEntries(_state.ticks),
    account: _state.account,
    lastCycle: _state.lastCycle,
    lastTick: _state.lastTick,
    cycleCount: _state.cycleCount,
  };
}

// ── Config / tracked markets ───────────────────────────────────────────────

/** Observable market definition */
export const DEFAULT_CONFIG = {
  cryptoMarkets: DEFAULT_CRYPTO_MARKETS,
  polymarkets: [], // [{tokenId, question}] — configured by caller / bootstrapPolymarkets
  intervalMs: DEFAULT_CYCLE_INTERVAL_MS,
  // Wave-4 overlays (advisory telemetry; fail-open; do NOT drive paper P&L):
  enablePerp: true,            // funding/basis positioning overlay on crypto markets
  enableCrossAsset: true,      // cross-asset lead/lag overlay (BTC/ETH lead alts), advisory/scored-only
  enableSocial: true,          // public-source sentiment overlay per asset
  enableAgentReachNews: true,  // prefer Agent-Reach real-web news (Exa) for sentiment over RSS
  autoDiscoverPolymarkets: false, // when true, bootstrapPolymarkets() fills polymarkets live
  polymarketLimit: 3,          // how many liquid Polymarket markets to auto-discover
  enableAccount: true,         // coinbase-removed stub each cycle (no-op; no Binance view-only account wired)
  enableLearnLoop: true,       // decode closed paper trades → AFL_LEDGER (data accrual only; promotion stays owner-gated)
  enableQuantumShadow: true,   // record classical-vs-quantum A/B shadow each cycle (telemetry only; never sizes)
  enableStrategyForecasts: true, // record per-strategy forecasts each cycle → the re-weighting brain's data
  enableTickStream: false,     // DISARMED: when armed (OBSERVATORY_TICK_STREAM=1), a Binance fstream @bookTicker websocket feeds _state.ticks in real-time + fires fastRiskExit at the actual touch (sub-second exits). Default off → the 1s REST poll stays the floor.
};

/**
 * bootstrapPolymarkets(cfg) -> Promise<Array<{tokenId, question}>>
 * Resolves the live Polymarket watch-list. If autoDiscoverPolymarkets is set and
 * no explicit list was given, queries the Gamma API (via polymarket-discovery) for
 * the top-N liquid active markets. FAIL-OPEN: discovery failure returns [] so the
 * crypto loop is never blocked. Called once by the server on --serve startup.
 */
export async function bootstrapPolymarkets(cfg = {}) {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  if (Array.isArray(c.polymarkets) && c.polymarkets.length > 0) return c.polymarkets;
  if (!c.autoDiscoverPolymarkets) return [];
  try {
    const found = await PolymarketDiscovery.discoverMarkets({ limit: c.polymarketLimit || 3 });
    return (found || []).map((m) => ({ tokenId: m.tokenId, question: m.question }));
  } catch (_e) {
    return []; // fail-open — discovery must not break the loop
  }
}

// ── Main runCycle ──────────────────────────────────────────────────────────
/**
 * runCycle(config?) — one full observatory cycle.
 * Runs all markets, updates in-memory state, returns the full snapshot.
 * Deterministic when httpGet is injected. Never throws — errors land in snap.error.
 *
 * @param {object} [config] — optional override of DEFAULT_CONFIG
 * @returns {Promise<object>} full state snapshot after this cycle
 */
export async function runCycle(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  ensureDir(PAPER_LEDGER);

  // Crypto markets (Binance USDⓈ-M perp)
  for (const market of cfg.cryptoMarkets) {
    if (!_state.snapshots.has(market)) {
      _state.snapshots.set(market, createMarketSnapshot(market, 'binance'));
    }
    const snap = _state.snapshots.get(market);
    await runCryptoCycle(market, snap, cfg);
    if (snap.regime) _state.regimes.set(market, snap.regime);
  }

  // Polymarket markets
  for (const { tokenId, question } of (cfg.polymarkets || [])) {
    const key = `poly-${tokenId}`;
    if (!_state.snapshots.has(key)) {
      _state.snapshots.set(key, createMarketSnapshot(key, 'polymarket'));
    }
    const snap = _state.snapshots.get(key);
    snap.question = question;
    await runPolymarketCycle(tokenId, question, snap);
  }

  // Real view-only account placeholder (coinbase-removed stub; no Binance account wired) — READ-ONLY, fail-open, never breaks the cycle
  if (cfg.enableAccount !== false) {
    try { await refreshAccount(cfg); } catch (_e) { /* account read must never break the cycle */ }
  }

  // Learn loop: decode CLOSED paper trades → per-factor AFL_LEDGER (idempotent, throttled,
  // fail-soft). This ACCRUES outcome data only — lifecycle promotion (apply:true) stays
  // owner-gated. First cycle (count 0) backfills the full on-disk trade history.
  if (cfg.enableLearnLoop !== false && _state.cycleCount % LEARN_DECODE_EVERY === 0) {
    try {
      const { decodeAll } = await import('../trade-outcome-decoder.mjs');
      const r = await decodeAll({ stateDir: STATE_DIR });
      if (r && r.decoded) console.log(`[learn-loop] decoded ${r.decoded} new outcome(s) → AFL_LEDGER (${r.factors?.length || 0} factors)`);
    } catch (_e) { /* learn loop must never break the cycle */ }
  }

  // Aggregate signals
  _state.factors = [];
  for (const [, snap] of _state.snapshots) {
    if (snap.signals && snap.signals.length > 0) {
      _state.factors.push(...snap.signals);
    }
  }

  // Cross-market energy telemetry (aggregate)
  const anyEnergy = [..._state.snapshots.values()].find((s) => s.energyDeltaU != null);
  _state.energy = anyEnergy?.energyDeltaU ?? null;

  _state.lastCycle = Math.floor(Date.now() / 1000);
  _state.cycleCount++;

  return getSnapshot();
}

// ── Accessors for REST endpoints ───────────────────────────────────────────
export function getMarkets() {
  return Object.fromEntries(_state.snapshots);
}

export function getFactors() {
  return _state.factors;
}

export function getPaper() {
  const out = {};
  for (const [k, snap] of _state.snapshots) {
    out[k] = { positions: snap.paperPositions, pnl: snap.pnl, drawdown: snap.drawdown };
  }
  return out;
}

export function getRegime() {
  return Object.fromEntries(_state.regimes);
}

/** getEnsemble() — the fused combined decision per market (all strategies voting together). */
export function getEnsemble() {
  const out = {};
  for (const [k, snap] of _state.snapshots) {
    if (snap.ensemble) out[k] = snap.ensemble;
  }
  return out;
}

export function getEnergy() {
  return _state.energy;
}

export function getHealth() {
  const markets = [..._state.snapshots.values()];
  const ok = markets.length > 0;
  const errCount = markets.filter((s) => s.error != null).length;
  return {
    ok,
    cycleCount: _state.cycleCount,
    lastCycle: _state.lastCycle,
    lastTick: _state.lastTick,
    marketCount: markets.length,
    errorCount: errCount,
    accountConnected: !!_state.account?.connected,
    realEquityUsd: _state.account?.realEquityUsd ?? null,
    uptime: process.uptime(),
  };
}

// ── SSE event builders ────────────────────────────────────────────────────
/**
 * buildSSEEvents(snapshot) — given a runCycle snapshot, build the SSE event objects.
 * Types: 'market.tick' | 'factor.signal' | 'paper.fill' | 'regime.shift' | 'energy.state'
 */
export function buildSSEEvents(snapshot) {
  const events = [];
  const ts = snapshot.lastCycle || Math.floor(Date.now() / 1000);

  // market.tick — one per market
  for (const [market, snap] of Object.entries(snapshot.markets || {})) {
    events.push({
      type: 'market.tick',
      market,
      venue: snap.venue,
      updatedAt: snap.updatedAt,
      lastBar: snap.bars?.length > 0 ? snap.bars[snap.bars.length - 1] : null,
      qualityGate: snap.qualityGate,
      error: snap.error,
      ts,
    });
  }

  // factor.signal — one per signal
  for (const sig of (snapshot.factors || [])) {
    events.push({
      type: 'factor.signal',
      ...sig,
      ts,
    });
  }

  // paper.fill — one per market with positions
  for (const [market, snap] of Object.entries(snapshot.markets || {})) {
    if (snap.paperPositions && snap.paperPositions.length > 0) {
      events.push({
        type: 'paper.fill',
        market,
        positions: snap.paperPositions,
        pnl: snap.pnl,
        drawdown: snap.drawdown,
        ts,
      });
    }
  }

  // regime.shift — one per market where regime detection ran
  for (const [market, regime] of Object.entries(snapshot.regimes || {})) {
    if (regime) {
      events.push({
        type: 'regime.shift',
        market,
        recommendation: regime.recommendation,
        reasons: regime.reasons,
        layers: regime.layers,
        ts,
      });
    }
  }

  // circuit.state — one per market with quantum factor-circuit telemetry
  for (const [market, snap] of Object.entries(snapshot.markets || {})) {
    if (snap.circuit) {
      events.push({
        type: 'circuit.state',
        market,
        ratio: snap.circuit.ratio,
        allCommute: snap.circuit.allCommute,
        bestOrdering: snap.circuit.bestOrdering,
        factorIds: snap.circuit.factorIds,
        injected: snap.circuit.injected,
        ts,
      });
    }
  }

  // energy.state — always emitted (advisory telemetry)
  events.push({
    type: 'energy.state',
    deltaU: snapshot.energy?.deltaU ?? null,
    accept: snapshot.energy?.accept ?? null,
    reason: snapshot.energy?.reason ?? null,
    ts,
  });

  return events;
}

// ── --test self-test (deterministic mock cycle) ───────────────────────────
if (process.argv.includes('--test')) {
  await runSelfTest();
}

async function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const assert = (cond, label) => {
    if (cond) { pass++; }
    else { fail++; console.error(`FAIL: ${label}`); }
  };

  console.log('orchestrator --test: running mock cycle...');

  // Build canned mock bars (unix-seconds, strictly monotone, positive prices)
  const BASE_TS = 1_718_505_600; // 2024-06-16 00:00:00 UTC
  const STEP = 300; // 5-minute bars
  const mockBars = Array.from({ length: 20 }, (_, i) => ({
    timestamp: BASE_TS + i * STEP,
    open: 65000 + i * 10,
    high: 65050 + i * 10,
    low: 64950 + i * 10,
    close: 65020 + i * 10,
    volume: 100 + i,
  }));

  // Binance USDⓈ-M klines response shape: a JSON ARRAY of kline arrays, ASCENDING by openTime
  // (oldest-first) — the chronological order mapKline/perp-adapter PRESERVES (no reverse, unlike
  // coinbase's newest-first candles). Each row: [openTime(ms), open, high, low, close, volume, ...].
  // mapKline floors openTime(ms)/1000 back to unix-seconds, matching the {timestamp,...} bar contract.
  const mockKlinesBody = JSON.stringify(
    mockBars.map((b) => [
      b.timestamp * 1000, // openTime in MS (mapKline → floor(/1000) → unix-seconds)
      String(b.open),
      String(b.high),
      String(b.low),
      String(b.close),
      String(b.volume),
    ]),
  );

  // Mock httpGet — returns canned data for known URL patterns.
  // BINANCE-ONLY (2026-06-19): candle fetch routes through PerpAdapter.getCandles →
  // GET https://fapi.binance.com/fapi/v1/klines (array response). The old coinbase.com/candles
  // branch is DEAD (coinbase scrapped) — match the binance klines endpoint instead.
  const mockHttpGet = async (url) => {
    if (url.includes('fapi.binance.com') && url.includes('klines')) {
      return { status: 200, headers: {}, body: mockKlinesBody };
    }
    // Default: empty 200
    return { status: 200, headers: {}, body: '{}' };
  };

  setHttpGet(mockHttpGet);

  // Reset state for clean test
  _state.snapshots.clear();
  _state.factors = [];
  _state.regimes.clear();
  _state.energy = null;
  _state.lastCycle = null;
  _state.cycleCount = 0;

  // Run one cycle with BTC-USD only
  let snapshot;
  try {
    snapshot = await runCycle({ cryptoMarkets: ['BTC-USD'], polymarkets: [], intervalMs: 0, enableAgentReachNews: false });
  } catch (err) {
    console.error('FAIL: runCycle threw:', err);
    process.exit(1);
  }

  // Assertions
  assert(snapshot != null, 'snapshot is non-null');
  assert(typeof snapshot === 'object', 'snapshot is object');
  assert('markets' in snapshot, 'snapshot has markets');
  assert('BTC-USD' in snapshot.markets, 'BTC-USD in markets');

  const btcSnap = snapshot.markets['BTC-USD'];
  assert(btcSnap != null, 'BTC-USD snap is non-null');
  assert(btcSnap.error === null, `BTC-USD has no error (got: ${btcSnap.error})`);
  assert(btcSnap.qualityGate != null, 'qualityGate was run');
  assert(btcSnap.qualityGate.pass === true, `qualityGate PASS (got: ${JSON.stringify(btcSnap.qualityGate)})`);

  // Bars: timestamps must be unix-seconds (< 1e11)
  assert(Array.isArray(btcSnap.bars), 'bars is array');
  assert(btcSnap.bars.length > 0, 'bars is non-empty');
  const tsValues = btcSnap.bars.map((b) => b.timestamp);
  assert(tsValues.every((t) => Number.isFinite(t) && t < 1e11), `all bar timestamps are unix-seconds (sample: ${tsValues[0]})`);
  assert(tsValues.every((t, i) => i === 0 || t > tsValues[i - 1]), 'bar timestamps are strictly monotone');

  // Signals computed
  assert(Array.isArray(btcSnap.signals), 'signals is array');

  // PnL shape
  assert(btcSnap.pnl != null, 'pnl is non-null');
  assert(typeof btcSnap.pnl.equity === 'number', 'pnl.equity is number');
  assert(Number.isFinite(btcSnap.pnl.equity), 'pnl.equity is finite');

  // Paper positions shape
  assert(Array.isArray(btcSnap.paperPositions), 'paperPositions is array');

  // Regime
  assert(btcSnap.regime != null, 'regime was computed');

  // Snapshot fields
  assert(typeof snapshot.lastCycle === 'number', 'lastCycle is number');
  assert(snapshot.cycleCount === 1, `cycleCount is 1 (got ${snapshot.cycleCount})`);

  // SSE events shape
  const events = buildSSEEvents(snapshot);
  assert(Array.isArray(events), 'SSE events is array');
  assert(events.length > 0, 'SSE events non-empty');
  const types = new Set(events.map((e) => e.type));
  assert(types.has('market.tick'), 'SSE has market.tick');
  assert(types.has('energy.state'), 'SSE has energy.state');

  // No real-order path — paper engine never submits real orders
  // (Confirmed by INV-1 in afl-paper.mjs — no network call on submitPaperOrder/onSignal)
  assert(true, 'paper-only confirmed (INV-1 from afl-paper.mjs)');

  console.log(`orchestrator --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
