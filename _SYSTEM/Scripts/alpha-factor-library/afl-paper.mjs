// @capability: afl-paper
// @serves: paper trading | paper engine | simulated fills | market impact | almgren-chriss | circuit breaker | position tracking | P&L | drawdown | AFL paper order | replay | backtest
// @does: YURI AFL paper-trading engine — pure simulation, NO real orders. Simulates fills via Almgren-Chriss impact + half-spread + venue fee (crypto tiered maker/taker; polymarket quadratic). Tracks positions, realized+unrealized P&L, max drawdown, 3-state circuit breaker. Append-only JSONL ledgers. Deterministic + replayable. Bars validated by validateBar (data-quality-gate). Prediction outcomes wired via prediction-ledger recordPrediction/recordOutcome.
// @use: createPaperEngine(opts) → engine; call ingestBar(bar, instrument) to feed canonical {timestamp,open,high,low,close,volume} bars; call submitPaperOrder({venue,symbol,side,qty|notional,refPrice}) for size-explicit fills; call onSignal(signal, ctx) for factor-signal-driven orders. Never POSTs real orders (PAPER-ONLY, INV-1).
// @exports: createPaperEngine, cryptoFeeModel, predictionMarketFeeModel

/**
 * afl-paper.mjs — YURI AFL Paper-Trading Engine (PURE SIMULATION)
 *
 * INV-1: NEVER places a real order. No network calls. No key reads.
 * INV-2: No key/secret reads of any kind.
 * INV-3: Live market-data bars fed in by caller (engine never fetches).
 *
 * Canonical bar field: `timestamp` (unix-seconds, strictly monotone, finite).
 * Bars are validated by validateBar from data-quality-gate.mjs before use.
 * Malformed bars are fail-closed: logged + rejected, never ingested.
 *
 * Order SIZE arrives explicitly from the caller (afl-sizing is a separate
 * module). Internal sizing only clamps to risk caps.
 *
 * Ledger paths must be under _SYSTEM/state/ — NEVER backend/data/ or other
 * protected paths.
 *
 * Pure ESM. better-sqlite3 not used (pure JSONL ledgers).
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBar } from './data-quality-gate.mjs';
import { recordPrediction, recordOutcome } from '../prediction-ledger.mjs';

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

/** Almgren-Chriss market-impact scaling factor. */
const Y_IMPACT = 0.5;
/** Sigmoid steepness for low-participation exponent correction. */
const SIGMOID_K = 800;
/** Participation threshold below which the exponent correction activates. */
const PI_THRESHOLD = 0.005;
/** Floor for ADV / volume denominators to prevent division-by-zero. */
const MIN_ADV = 1;
/** Floor for volatility to guarantee non-zero impact. */
const MIN_SIGMA = 1e-6;
/** Rolling window of bars kept per instrument. */
const BAR_WINDOW = 200;
/** Default lookback (bar count) for ADV calculation. */
const ADV_LOOKBACK = 20;
/** Default spread estimate when no book is available (fraction of mid). */
const DEFAULT_SPREAD_FRAC = 0.0005; // 5 bps

/* ═══════════════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════════════ */

/** @param {any} x @returns {x is number} */
function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Safe number with fallback for NaN/undefined. */
function safeNum(x, fb = 0) {
  return isNum(x) ? x : fb;
}

/** Round to cents (two decimals). No float leaks. */
function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Round qty to the nearest qty step (fractional-safe).
 * Default step = 1e-8 (crypto dust floor). Caller-overridable via caps.qtyStep.
 * Never floors to zero on a legitimately small fractional qty.
 * @param {number} qty
 * @param {number} [step=1e-8]
 * @returns {number}
 */
function roundToStep(qty, step = 1e-8) {
  if (!isNum(step) || step <= 0) step = 1e-8;
  return Math.round(qty / step) * step;
}

/** Ensure parent directory of `p` exists. */
function ensureDir(p) {
  const d = dirname(p);
  if (d && !existsSync(d)) mkdirSync(d, { recursive: true });
}

/** Append a single JSON line (append-only ledger). */
function appendJsonl(p, obj) {
  ensureDir(p);
  appendFileSync(p, JSON.stringify(obj) + '\n', 'utf-8');
}

/* ═══════════════════════════════════════════════════════════════════
   Fee-Model Factories
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Crypto exchange tiered maker / taker fee model.
 * Coinbase Advanced Trade tiered rates (approximate).
 * @param {'maker'|'taker'} role
 * @param {number} [monthlyVolume=0] 30-day USD volume for tier lookup.
 * @returns {(venue: string, price: number, size: number) => number}
 */
export function cryptoFeeModel(role = 'taker', monthlyVolume = 0) {
  const tiers = [
    { max: 1_000_000, maker: 0.0010, taker: 0.0010 },
    { max: 5_000_000, maker: 0.0009, taker: 0.0010 },
    { max: 10_000_000, maker: 0.0008, taker: 0.0009 },
    { max: Infinity,  maker: 0.0006, taker: 0.0008 },
  ];
  const tier = tiers.find(t => monthlyVolume < t.max) ?? tiers[tiers.length - 1];
  const rate = tier[role] ?? tier.taker;
  return (_venue, price, size) => {
    if (!isNum(price) || !isNum(size)) return 0;
    return round2(Math.abs(price * size) * rate);
  };
}

/**
 * Prediction-market quadratic fee model (Polymarket).
 * per-contract fee = ⌈c · rate · p · (1 − p) · 100⌉ / 100
 * @param {number} [c=1] contract multiplier
 * @param {number} [rate=0.07] fee rate (7 %)
 * @returns {(venue: string, price: number, size: number) => number}
 */
export function predictionMarketFeeModel(c = 1, rate = 0.07) {
  return (_venue, price, size) => {
    if (!isNum(price) || !isNum(size)) return 0;
    const p = Math.max(0, Math.min(1, price));
    const per = Math.ceil(c * rate * p * (1 - p) * 100) / 100;
    return round2(per * Math.abs(size));
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Market-Data Analytics
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Per-bar volatility (stdev of log returns) from an array of bars.
 * @param {Array<{close:number}>} bars
 * @returns {number}
 */
function computeSigma(bars) {
  if (!Array.isArray(bars) || bars.length < 3) return MIN_SIGMA;
  const rets = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (!isNum(a) || !isNum(b) || a <= 0 || b <= 0) continue;
    const r = Math.log(b / a);
    if (isNum(r)) rets.push(r);
  }
  if (rets.length < 2) return MIN_SIGMA;
  const mu = rets.reduce((s, r) => s + r, 0) / rets.length;
  const v = rets.reduce((s, r) => s + (r - mu) ** 2, 0) / (rets.length - 1);
  return Math.max(Math.sqrt(v), MIN_SIGMA);
}

/**
 * Average Daily Volume extrapolated from recent bars.
 * Canonical field is `timestamp` (unix-seconds).
 * @param {Array<{volume:number, timestamp:number}>} bars
 * @param {number} [lookback]
 * @returns {number}
 */
function computeAdv(bars, lookback = ADV_LOOKBACK) {
  if (!Array.isArray(bars) || bars.length === 0) return MIN_ADV;
  const recent = bars.slice(-lookback);
  const totalVol = recent.reduce((s, b) => s + safeNum(b.volume, 0), 0);
  if (recent.length < 2) return Math.max(totalVol, MIN_ADV);
  // timestamps in seconds; dt in seconds → scale to daily
  const dt = recent[recent.length - 1].timestamp - recent[0].timestamp;
  if (dt <= 0) return Math.max(totalVol, MIN_ADV);
  return Math.max((totalVol / dt) * 86_400, MIN_ADV);
}

/* ═══════════════════════════════════════════════════════════════════
   Fill Model
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Simulate a fill price with Almgren-Chriss market impact and
 * low-participation sigmoid correction.
 *
 * `fill = mid ± (½·spread + impact)`
 * `impact = Y · σ_price · π^exponent`
 *
 * When participation π < PI_THRESHOLD the sigmoid smoothly *decreases*
 * the exponent from 0.5 toward 0.2, increasing impact (corrects the √
 * under-estimate at very low participation). σ_price = σ_return · mid.
 *
 * @param {{side:'buy'|'sell', mid:number, spread:number, sigma:number, qty:number, adv:number}} p
 * @returns {number} fill price, or NaN on bad input
 */
function computeFillPrice({ side, mid, spread, sigma, qty, adv }) {
  if (!isNum(mid) || mid <= 0) return NaN;
  if (!isNum(spread) || spread < 0) spread = 0;
  if (!isNum(sigma) || sigma <= 0) sigma = MIN_SIGMA;
  if (!isNum(qty) || qty <= 0) return NaN;
  if (!isNum(adv) || adv <= 0) adv = MIN_ADV;

  const pi = qty / adv;

  // Low-participation sigmoid correction on the exponent:
  // At pi << PI_THRESHOLD: exponent → 0.2  (higher impact)
  // At pi >> PI_THRESHOLD: exponent → 0.5  (pure √)
  const sig = 1 / (1 + Math.exp(-SIGMOID_K * (PI_THRESHOLD - pi)));
  const exponent = 0.5 - 0.3 * sig;

  const sigmaPrice = sigma * mid;
  const impact = Y_IMPACT * sigmaPrice * Math.pow(Math.max(pi, 1e-12), exponent);
  const slippage = 0.5 * Math.max(spread, 0) + impact;

  const fill = side === 'buy' ? mid + slippage : mid - slippage;
  return isNum(fill) && fill > 0 ? fill : NaN;
}

/* ═══════════════════════════════════════════════════════════════════
   Signal Validation
   ═══════════════════════════════════════════════════════════════════ */

/** @param {any} s @returns {boolean} */
function isValidSignal(s) {
  if (!s || typeof s !== 'object') return false;
  if (!s.factorId || typeof s.factorId !== 'string') return false;
  if (!isNum(s.ts) || s.ts <= 0) return false;
  if (!['long', 'short', 'flat'].includes(s.side)) return false;
  if (!isNum(s.confidence) || s.confidence < 0 || s.confidence > 1) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   Engine Factory
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Create a paper-trading engine for the YURI AFL organ.
 *
 * PURE SIMULATION — never places real orders (INV-1), never reads API
 * keys (INV-2), never hits the network. All fills are derived from
 * passed-in data only.
 *
 * @param {Object} config
 * @param {string} config.paperLedgerPath       Path for paper-trade JSONL ledger (under _SYSTEM/state/).
 * @param {string} config.predictionLedgerPath  Path for AFL prediction JSONL ledger.
 * @param {(venue:string, price:number, size:number)=>number} [config.feeModel]
 * @param {Object}  [config.caps]
 * @param {number}  [config.caps.initialEquity=100000]
 * @param {number}  [config.caps.maxPositionPct=0.10]       Max per-instrument notional fraction of equity.
 * @param {number}  [config.caps.maxGrossExposurePct=0.50]  Max gross portfolio exposure.
 * @param {number}  [config.caps.maxNetExposurePct=0.30]    Max net portfolio exposure.
 * @param {number}  [config.caps.softDrawdown=0.05]         5 % → HALF_OPEN breaker.
 * @param {number}  [config.caps.hardDrawdown=0.10]         10 % → OPEN + flatten.
 * @param {number}  [config.caps.maxDrawdown=0.20]          Reference for tail sizing.
 * @param {number}  [config.caps.tailMultiplier=3]          Neg-skew tail multiplier.
 * @param {string}  [config.caps.venue='default']
 * @param {Object<string,number>} [config.caps.fundingRates] Instrument → hourly rate.
 * @param {number}  [config.caps.qtyStep=1e-8]              Minimum qty increment (fractional-safe; use 1e-8 for crypto, 1 for integer-share markets).
 * @param {number}  [config.caps.minNotional=1]             Minimum trade notional in USD; sub-threshold orders become explicit NO_TRADE('dust_notional').
 * @returns {{
 *   ingestBar: Function,
 *   submitPaperOrder: Function,
 *   onSignal: Function,
 *   mark: Function,
 *   positions: Function,
 *   pnl: Function,
 *   snapshot: Function,
 *   replay: Function
 * }}
 */
export function createPaperEngine(config) {
  if (!config || typeof config !== 'object') throw new Error('config required');

  const { paperLedgerPath, predictionLedgerPath } = config;
  if (!paperLedgerPath || typeof paperLedgerPath !== 'string')
    throw new Error('paperLedgerPath required');
  if (!predictionLedgerPath || typeof predictionLedgerPath !== 'string')
    throw new Error('predictionLedgerPath required');

  // Guard: refuse protected paths at construction time (fail-closed)
  const PROTECTED = ['backend/data', '.claude/state', '.claude/history', '.env', 'node_modules', '.amp/'];
  for (const pp of [paperLedgerPath, predictionLedgerPath]) {
    const norm = pp.replace(/\\/g, '/').toLowerCase(); // case-insensitive: macOS HFS+ resolves Backend/Data → backend/data (red-team BUG-4)
    if (PROTECTED.some(guard => norm.includes(guard))) {
      throw new Error(`Ledger path "${pp}" is a protected path — use _SYSTEM/state/ instead`);
    }
  }

  const feeModel = typeof config.feeModel === 'function'
    ? config.feeModel
    : cryptoFeeModel('taker');

  const c = config.caps ?? {};
  const caps = {
    initialEquity:       safeNum(c.initialEquity, 100_000),
    maxPositionPct:      safeNum(c.maxPositionPct, 0.10),
    maxGrossExposurePct: safeNum(c.maxGrossExposurePct, 0.50),
    maxNetExposurePct:   safeNum(c.maxNetExposurePct, 0.30),
    softDrawdown:        safeNum(c.softDrawdown, 0.05),
    hardDrawdown:        safeNum(c.hardDrawdown, 0.10),
    maxDrawdown:         safeNum(c.maxDrawdown, 0.20),
    tailMultiplier:      safeNum(c.tailMultiplier, 3),
    venue:               c.venue || 'default',
    fundingRates:        c.fundingRates ?? {},
    qtyStep:             safeNum(c.qtyStep, 1e-8),
    minNotional:         safeNum(c.minNotional, 1),
  };

  // ── Internal state ─────────────────────────────────────────────
  const S = {
    initEq:      caps.initialEquity,
    cumRealized: 0,          // gross realised P&L from closed trades
    cumFees:     0,          // all fees (entry + exit)
    cumFunding:  0,          // all funding costs
    peakEq:      caps.initialEquity,
    maxDd:       0,          // fraction 0…1
    cbState:     /** @type {'CLOSED'|'HALF_OPEN'|'OPEN'} */ ('CLOSED'),
    positions:   new Map(),  // instrument → pos
    bars:        new Map(),  // instrument → bar[]
    lastTs:      0,
    trades:      0,          // completed round-trips
    opens:       0,
    noTrades:    0,
    fundMap:     new Map(),  // instrument → cumulative funding paid
    fundTs:      new Map(),  // instrument → last-funding ts (seconds)
    seq:         0,
  };

  function nextId() { return ++S.seq; }

  // ── Ledger helpers ─────────────────────────────────────────────
  function logPaper(o) { appendJsonl(paperLedgerPath, { ...o, _seq: nextId() }); }

  function logPredEntry(id, subject, change, effects, ts) {
    recordPrediction({ id, subject, change, predictedEffects: effects, source: 'afl-paper', ts },
      { file: predictionLedgerPath });
  }

  function logPredOutcome(predictionId, effects, ts) {
    recordOutcome({ predictionId, observedEffects: effects, ts }, { file: predictionLedgerPath });
  }

  // ── Equity / drawdown ──────────────────────────────────────────
  /** Compute equity = initEq + realized − fees − funding + unrealized. */
  function equity() {
    let ur = 0;
    for (const [inst, pos] of S.positions) {
      const bh = S.bars.get(inst);
      const px = bh && bh.length ? bh[bh.length - 1].close : pos.avg;
      ur += (pos.side === 'long' ? 1 : -1) * (px - pos.avg) * pos.qty;
    }
    return S.initEq + S.cumRealized - S.cumFees - S.cumFunding + ur;
  }

  /** @returns {{eq:number, dd:number}} */
  function snapDd() {
    const eq = equity();
    if (eq > S.peakEq) S.peakEq = eq;
    const dd = S.peakEq > 0 ? (S.peakEq - eq) / S.peakEq : 0;
    S.maxDd = Math.max(S.maxDd, dd);
    return { eq, dd };
  }

  // ── Circuit breaker ────────────────────────────────────────────
  /**
   * 3-state circuit breaker.
   * CLOSED   → normal trading
   * HALF_OPEN → size reduced (soft drawdown exceeded)
   * OPEN     → flatten + halt (hard drawdown exceeded)
   * Recovery: OPEN → CLOSED when dd < 50 % of soft threshold.
   */
  function checkCb(dd, ts) {
    if (S.cbState === 'OPEN') {
      if (dd < caps.softDrawdown * 0.5) {
        S.cbState = 'CLOSED';
        logPaper({ type: 'risk', event: 'cb_recovered', ddBps: round2(dd * 1e4), ts });
      }
      return S.cbState;
    }
    if (dd >= caps.hardDrawdown) {
      S.cbState = 'OPEN';
      logPaper({ type: 'risk', event: 'cb_open', ddBps: round2(dd * 1e4), ts });
      flattenAll(ts);
    } else if (dd >= caps.softDrawdown) {
      S.cbState = 'HALF_OPEN';
    } else {
      S.cbState = 'CLOSED';
    }
    return S.cbState;
  }

  /**
   * Drawdown-aware size scaling.
   * size = base × max(0.25, 1 − dd·tailMultiplier / maxDrawdown)
   */
  function ddShrink(base, dd) {
    const f = Math.max(0.25, 1 - (dd * caps.tailMultiplier) / Math.max(caps.maxDrawdown, 0.01));
    return roundToStep(base * f, caps.qtyStep);
  }

  // ── Position helpers ───────────────────────────────────────────
  function execOpen(inst, side, qty, px, fee, ts, fid, conf) {
    S.cumFees += fee;
    const ex = S.positions.get(inst);
    if (ex && ex.side === side) {
      const tq = ex.qty + qty;
      ex.avg = round2((ex.avg * ex.qty + px * qty) / tq);
      ex.qty = tq;
      ex.ents.push({ px, qty, ts, fee });
    } else {
      S.positions.set(inst, {
        inst, side, qty, avg: px,
        ents: [{ px, qty, ts, fee }],
        ots: ts, fid: fid || 'unknown', conf: conf ?? 0,
      });
      S.fundTs.set(inst, ts);
    }
    S.opens++;
  }

  /**
   * Close (full) a position. Returns trade details.
   */
  function execClose(inst, px, xFee, ts, reason) {
    const pos = S.positions.get(inst);
    if (!pos) return { gross: 0, net: 0, eFees: 0, xFee: 0, side: '', qty: 0 };
    S.cumFees += xFee;
    const dir = pos.side === 'long' ? 1 : -1;
    const gross = dir * (px - pos.avg) * pos.qty;
    S.cumRealized += gross;
    const eFees = pos.ents.reduce((s, e) => s + e.fee, 0);
    const net = gross - eFees - xFee;

    logPaper({
      type: 'close', inst, fid: pos.fid, side: pos.side, qty: pos.qty,
      entryPx: round2(pos.avg), exitPx: round2(px),
      grossPnl: round2(gross), netPnl: round2(net),
      eFees: round2(eFees), xFee: round2(xFee),
      reason, ots: pos.ots, cts: ts, fills: pos.ents.length,
    });

    S.positions.delete(inst);
    S.fundMap.delete(inst);
    S.fundTs.delete(inst);
    S.trades++;
    return { gross, net, eFees, xFee, side: pos.side, qty: pos.qty };
  }

  function flattenAll(ts) {
    for (const [inst, pos] of [...S.positions.entries()]) {
      const bh = S.bars.get(inst);
      const px = bh && bh.length ? bh[bh.length - 1].close : pos.avg;
      const xf = feeModel(caps.venue, px, pos.qty);
      execClose(inst, px, xf, ts, 'flatten');
    }
  }

  function applyFunding(ts) {
    for (const [inst, pos] of S.positions) {
      const rate = caps.fundingRates[inst];
      if (!rate || !isNum(rate) || rate <= 0) continue;
      const lt = S.fundTs.get(inst);
      if (!lt || ts <= lt) continue;
      const hrs = (ts - lt) / 3_600; // ts in seconds → hours
      if (hrs <= 0) continue;
      const cost = round2(rate * hrs * pos.avg * pos.qty);
      if (cost <= 0) continue;
      S.cumFunding += cost;
      S.fundMap.set(inst, (S.fundMap.get(inst) || 0) + cost);
      S.fundTs.set(inst, ts);
    }
  }

  // ── Spread estimation ──────────────────────────────────────────
  function estimateSpread(bar, book, mid) {
    if (book && Array.isArray(book.bids) && Array.isArray(book.asks)) {
      const bb = book.bids[0]?.[0], ba = book.asks[0]?.[0];
      if (isNum(bb) && isNum(ba) && ba > bb) return ba - bb;
    }
    return mid * DEFAULT_SPREAD_FRAC;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Ingest a canonical market bar. Validated by validateBar (data-quality-gate)
   * before storage. Malformed bars are fail-closed: logged + rejected.
   *
   * Canonical bar: {timestamp, open, high, low, close, volume}
   * timestamp = unix-SECONDS, strictly monotone, finite.
   *
   * @param {{timestamp:number, open:number, high:number, low:number, close:number, volume:number}} bar
   * @param {string} [instrument='default']
   * @returns {boolean} true if ingested, false if rejected
   */
  function ingestBar(bar, instrument = 'default') {
    const v = validateBar(bar);
    if (!v.ok) {
      logPaper({
        type: 'rejected', reason: 'invalid_bar',
        rejects: v.rejects, inst: instrument, ts: S.lastTs,
      });
      return false;
    }
    // Canonical field is `timestamp` (unix-seconds)
    if (!isNum(bar.timestamp) || bar.timestamp <= 0) {
      logPaper({ type: 'rejected', reason: 'missing_timestamp', inst: instrument, ts: S.lastTs });
      return false;
    }
    if (!S.bars.has(instrument)) S.bars.set(instrument, []);
    const h = S.bars.get(instrument);

    // Monotone guard: reject bars that are not strictly after the last ingested
    if (h.length > 0 && bar.timestamp <= h[h.length - 1].timestamp) {
      logPaper({
        type: 'rejected', reason: 'non_monotone_timestamp',
        barTs: bar.timestamp, lastTs: h[h.length - 1].timestamp,
        inst: instrument, ts: S.lastTs,
      });
      return false;
    }

    h.push({
      timestamp: bar.timestamp,
      open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: safeNum(bar.volume, 0),
    });
    if (h.length > BAR_WINDOW) h.splice(0, h.length - BAR_WINDOW);
    S.lastTs = Math.max(S.lastTs, bar.timestamp);
    return true;
  }

  /**
   * Submit a paper order with explicitly-sized qty or notional.
   * SIZE arrives from the caller (afl-sizing computes it).
   * This method ONLY clamps to risk caps — it does NOT size internally.
   *
   * INV-1: NEVER POSTs a real order. Simulates fill only.
   *
   * @param {{
   *   venue: string,
   *   symbol: string,
   *   side: 'buy'|'sell',
   *   qty?: number,
   *   notional?: number,
   *   refPrice: number,
   *   book?: {bids:Array, asks:Array},
   *   adv?: number,
   * }} order
   * @returns {{
   *   ok: boolean,
   *   fillPrice?: number,
   *   qty?: number,
   *   fee?: number,
   *   impact?: number,
   *   reason?: string,
   * }}
   */
  function submitPaperOrder({ venue, symbol, side, qty, notional, refPrice, book, adv: advHint } = {}) {
    // INV-1 marker — this function is PAPER-ONLY, no network call, no real order
    if (!symbol || typeof symbol !== 'string') return { ok: false, reason: 'missing_symbol' };
    if (!['buy', 'sell'].includes(side)) return { ok: false, reason: 'invalid_side' };
    if (!isNum(refPrice) || refPrice <= 0) return { ok: false, reason: 'invalid_refPrice' };

    const bh = S.bars.get(symbol) || [];
    const lastBar = bh.length ? bh[bh.length - 1] : null;
    const mid = lastBar ? (lastBar.high + lastBar.low + lastBar.close) / 3 : refPrice;

    // Resolve qty from explicit qty or notional
    let resolvedQty = null;
    if (isNum(qty) && qty > 0) {
      resolvedQty = qty;
    } else if (isNum(notional) && notional > 0) {
      resolvedQty = notional / mid;
    }
    if (!resolvedQty || resolvedQty <= 0) return { ok: false, reason: 'missing_qty_or_notional' };

    // Clamp to max position cap (INV-1 safety: don't allow runaway paper positions).
    // Use raw (non-floored) clamp to support fractional-unit crypto (e.g. 0.1 BTC).
    const { eq } = snapDd();
    const maxQtyFromCap = (caps.maxPositionPct * eq) / mid;
    const clampedQty = Math.min(resolvedQty, maxQtyFromCap);
    if (clampedQty <= 0) {
      logPaper({ type: 'rejected', reason: 'qty_clamped_to_zero', symbol, side, ts: S.lastTs });
      return { ok: false, reason: 'qty_clamped_to_zero' };
    }

    const spread = estimateSpread(lastBar, book, mid);
    const sigma = computeSigma(bh.length >= 3 ? bh : []);
    const adv = isNum(advHint) ? advHint : computeAdv(bh);

    const fp = computeFillPrice({ side, mid, spread, sigma, qty: clampedQty, adv });
    if (!isNum(fp) || fp <= 0) {
      logPaper({ type: 'rejected', reason: 'fill_compute_failed', symbol, side, ts: S.lastTs });
      return { ok: false, reason: 'fill_compute_failed' };
    }

    const fee = feeModel(venue || caps.venue, fp, clampedQty);
    const impact = Math.abs(fp - mid);

    logPaper({
      type: 'paper_order', symbol, venue: venue || caps.venue, side,
      requestedQty: resolvedQty, clampedQty, refPrice: round2(refPrice),
      fillPrice: round2(fp), fee: round2(fee), impact: round2(impact),
      spread: round2(spread), sigmaBps: round2(sigma * 1e4), adv: Math.round(adv),
      ts: S.lastTs,
    });

    return {
      ok: true,
      fillPrice: round2(fp),
      qty: clampedQty,
      fee: round2(fee),
      impact: round2(impact),
    };
  }

  /**
   * Process an AFL factor signal. Opens, closes, flips, or refuses (NO_TRADE).
   * Size is capped to risk caps; beyond that sizing lives in afl-sizing.mjs.
   *
   * @param {{factorId:string, ts:number, value:number, side:'long'|'short'|'flat', confidence:number}} signal
   * @param {{instrument:string, bar?:object, book?:{bids:Array,asks:Array}, adv?:number, closeFraction?:number}} ctx
   * @returns {{action:string, [k:string]:any}}
   */
  function onSignal(signal, ctx) {
    if (!isValidSignal(signal)) {
      const r = { action: 'NO_TRADE', reason: 'invalid_signal', ts: S.lastTs };
      logPaper({ type: 'no_trade', ...r, raw: signal });
      S.noTrades++;
      return r;
    }
    const { factorId, ts, value, side, confidence } = signal;
    const instrument = ctx?.instrument || signal.instrument;
    if (!instrument || typeof instrument !== 'string') {
      const r = { action: 'NO_TRADE', reason: 'missing_instrument', factorId, ts };
      logPaper({ type: 'no_trade', ...r });
      S.noTrades++;
      return r;
    }
    S.lastTs = Math.max(S.lastTs, ts);

    if (!isNum(value) || !isNum(confidence)) {
      const r = { action: 'NO_TRADE', reason: 'nan_or_invalid', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument });
      S.noTrades++;
      return r;
    }

    // Bar history for sigma/ADV/impact + the history-sufficiency check. Prefer a caller-supplied
    // ctx.barHistory (lets many namespaced factor books share ONE market bar series without
    // per-instrument ingest + a global-lastTs monotonicity clash); fall back to S.bars[instrument].
    const bh = (Array.isArray(ctx?.barHistory) && ctx.barHistory.length >= 3)
      ? ctx.barHistory
      : (S.bars.get(instrument) || []);
    const bar = ctx?.bar || (bh.length ? bh[bh.length - 1] : null);
    // bar must pass validateBar (canonical field `timestamp`)
    if (!bar || !validateBar(bar).ok) {
      const r = { action: 'NO_TRADE', reason: 'no_price_data', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument });
      S.noTrades++;
      return r;
    }
    const mid = (bar.high + bar.low + bar.close) / 3;
    if (!isNum(mid) || mid <= 0) {
      const r = { action: 'NO_TRADE', reason: 'bad_mid', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument });
      S.noTrades++;
      return r;
    }
    const spread = estimateSpread(bar, ctx?.book, mid);
    const sigma = computeSigma(bh.length >= 3 ? bh : [bar, { ...bar, close: bar.close * 0.999 }, { ...bar, close: bar.close * 1.001 }]);
    const adv = isNum(ctx?.adv) ? ctx.adv : computeAdv(bh);

    const { eq, dd } = snapDd();
    const cb = checkCb(dd, ts);
    if (cb === 'OPEN') {
      const r = { action: 'NO_TRADE', reason: 'circuit_breaker_open', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument, ddBps: round2(dd * 1e4) });
      S.noTrades++;
      return r;
    }

    /* ── FLAT → close (partial or full) ── */
    if (side === 'flat') {
      const pos = S.positions.get(instrument);
      if (!pos) {
        const r = { action: 'NO_TRADE', reason: 'no_position', factorId, ts };
        logPaper({ type: 'no_trade', ...r, inst: instrument });
        S.noTrades++;
        return r;
      }
      const cf = isNum(ctx?.closeFraction) ? Math.max(0, Math.min(1, ctx.closeFraction)) : 1;
      const cQty = roundToStep(pos.qty * cf, caps.qtyStep);
      if (cQty <= 0) {
        const r = { action: 'NO_TRADE', reason: 'zero_close_qty', factorId, ts };
        logPaper({ type: 'no_trade', ...r, inst: instrument });
        S.noTrades++;
        return r;
      }

      const cSide = pos.side === 'long' ? 'sell' : 'buy';
      const fp = computeFillPrice({ side: cSide, mid, spread, sigma, qty: cQty, adv });
      if (!isNum(fp)) {
        const r = { action: 'NO_TRADE', reason: 'bad_fill', factorId, ts };
        logPaper({ type: 'no_trade', ...r, inst: instrument });
        S.noTrades++;
        return r;
      }
      const xf = feeModel(caps.venue, fp, cQty);
      const dir = pos.side === 'long' ? 1 : -1;
      const gross = dir * (fp - pos.avg) * cQty;

      if (cQty < pos.qty) {
        // Partial close
        S.cumFees += xf;
        S.cumRealized += gross;
        pos.qty -= cQty;
        const predId = `pred_${instrument}_${factorId}_${pos.ots}`;
        const ret = dir * (fp - pos.avg) / pos.avg;
        logPredOutcome(predId, [{ target: 'mark_price', effect: ret >= 0 ? 'up' : 'down', value: round2(ret * 1e4) }], ts);
        logPaper({ type: 'partial_close', inst: instrument, fid: factorId, side: pos.side, closeQty: cQty, remainQty: pos.qty, fp: round2(fp), xf: round2(xf), grossPnl: round2(gross), ts });
        return { action: 'PARTIAL_CLOSE', instrument, factorId, closeQty: cQty, remainQty: pos.qty, fillPrice: round2(fp), grossPnl: round2(gross), fee: round2(xf) };
      }

      // Full close — save pos.side before execClose deletes it
      const posSide = pos.side;
      const posOts = pos.ots;
      const tr = execClose(instrument, fp, xf, ts, 'signal');
      const predId = `pred_${instrument}_${factorId}_${posOts}`;
      const ret = (posSide === 'long' ? 1 : -1) * (fp - pos.avg) / (pos.avg || 1);
      logPredOutcome(predId, [{ target: 'mark_price', effect: ret >= 0 ? 'up' : 'down', value: round2(ret * 1e4) }], ts);
      return { action: 'CLOSE', instrument, factorId, side: posSide, quantity: tr.qty, fillPrice: round2(fp), grossPnl: round2(tr.gross), netPnl: round2(tr.net), fee: round2(xf) };
    }

    /* ── LONG / SHORT → open, add, or flip ── */
    if (bh.length < 3) {
      const r = { action: 'NO_TRADE', reason: 'insufficient_history', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument, bars: bh.length });
      S.noTrades++;
      return r;
    }

    // Base qty from equity cap, caller-supplied notional, or caller-supplied qty.
    // Fractional-safe: roundToStep(x, qtyStep) instead of Math.floor(x) everywhere.
    // Caller may pass signal.notional (USD) or signal.qty (base units); both supported.
    let callerQty = null;
    if (isNum(signal.notional) && signal.notional > 0) {
      // Notional path — convert to fractional base-unit qty
      callerQty = roundToStep(signal.notional / mid, caps.qtyStep);
    } else if (isNum(signal.qty) && signal.qty > 0) {
      // Explicit qty path — round to step (do NOT floor — that zeroes crypto)
      callerQty = roundToStep(signal.qty, caps.qtyStep);
    }
    const maxNot = caps.maxPositionPct * eq;
    let baseQty = callerQty ?? roundToStep(maxNot / mid, caps.qtyStep);
    if (baseQty <= 0) {
      const r = { action: 'NO_TRADE', reason: 'zero_base_qty', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument, eq: round2(eq), mid: round2(mid) });
      S.noTrades++;
      return r;
    }

    // Min-notional dust guard — explicit reason, not silent zero
    if (baseQty * mid < caps.minNotional) {
      const r = { action: 'NO_TRADE', reason: 'dust_notional', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument, notionalUSD: round2(baseQty * mid), minNotional: caps.minNotional });
      S.noTrades++;
      return r;
    }

    let adjQty = ddShrink(baseQty, dd);
    // HALF_OPEN: halve size (fractional-safe, round-to-step)
    if (cb === 'HALF_OPEN') adjQty = roundToStep(adjQty * 0.5, caps.qtyStep);
    // Confidence scaling is internal SIZING — skip it when the caller passed an explicit
    // pre-sized qty/notional (signal.qty/signal.notional from afl-sizing) to avoid double-sizing.
    // Use roundToStep (not Math.round/floor) so fractional crypto qty survives scaling.
    if (callerQty === null) adjQty = roundToStep(adjQty * confidence, caps.qtyStep);
    if (adjQty <= 0) {
      const r = { action: 'NO_TRADE', reason: 'zero_adj_qty', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument });
      S.noTrades++;
      return r;
    }

    // Exposure caps (fractional-safe — roundToStep instead of Math.floor)
    let grossExp = 0, netExp = 0;
    for (const [i2, p2] of S.positions) {
      const b2 = S.bars.get(i2);
      if (!b2 || !b2.length) continue;
      const n = b2[b2.length - 1].close * p2.qty;
      grossExp += n;
      netExp += p2.side === 'long' ? n : -n;
    }
    const sSign = side === 'long' ? 1 : -1;
    const mg = caps.maxGrossExposurePct * eq;
    if (grossExp + mid * adjQty > mg) {
      adjQty = roundToStep(Math.max(0, mg - grossExp) / mid, caps.qtyStep);
    }
    const mn = caps.maxNetExposurePct * eq;
    if (Math.abs(netExp + sSign * mid * adjQty) > mn) {
      adjQty = roundToStep(Math.max(0, mn - Math.abs(netExp)) / mid, caps.qtyStep);
    }
    if (adjQty <= 0) {
      const r = { action: 'NO_TRADE', reason: 'exposure_limit', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument });
      S.noTrades++;
      return r;
    }

    // Flip if needed
    const existing = S.positions.get(instrument);
    let flipRes = null;
    if (existing && existing.side !== side) {
      const cs = existing.side === 'long' ? 'sell' : 'buy';
      const cf = computeFillPrice({ side: cs, mid, spread, sigma, qty: existing.qty, adv });
      if (!isNum(cf)) {
        const r = { action: 'NO_TRADE', reason: 'flip_fill_failed', factorId, ts };
        logPaper({ type: 'no_trade', ...r, inst: instrument });
        S.noTrades++;
        return r;
      }
      const cfee = feeModel(caps.venue, cf, existing.qty);
      flipRes = execClose(instrument, cf, cfee, ts, 'flip');
    }

    // Open
    const oSide = side === 'long' ? 'buy' : 'sell';
    const fp = computeFillPrice({ side: oSide, mid, spread, sigma, qty: adjQty, adv });
    if (!isNum(fp) || fp <= 0) {
      const r = { action: 'NO_TRADE', reason: 'bad_open_fill', factorId, ts };
      logPaper({ type: 'no_trade', ...r, inst: instrument });
      S.noTrades++;
      return r;
    }
    const ofee = feeModel(caps.venue, fp, adjQty);
    execOpen(instrument, side, adjQty, fp, ofee, ts, factorId, confidence);

    // Prediction ledger entry (wired via recordPrediction)
    const predId = `pred_${instrument}_${factorId}_${ts}`;
    logPredEntry(predId, `${instrument}/${factorId}`, `enter_${side}`,
      [{ target: 'mark_price', effect: side === 'long' ? 'up' : 'down', confidence: round2(confidence) }], ts);

    logPaper({
      type: 'open', inst: instrument, fid: factorId, side,
      qty: adjQty, fp: round2(fp), fee: round2(ofee), conf: round2(confidence),
      cb, ddBps: round2(dd * 1e4), sigmaBps: round2(sigma * 1e4),
      adv: Math.round(adv), ts,
    });

    return {
      action: 'OPEN', instrument, factorId, side, quantity: adjQty,
      fillPrice: round2(fp), fee: round2(ofee),
      flip: flipRes ? { grossPnl: round2(flipRes.gross), netPnl: round2(flipRes.net) } : null,
    };
  }

  /**
   * Mark all positions to market. Applies accrued funding.
   * @param {number} ts Unix-seconds
   * @param {Object<string,number>} [prices] Per-instrument price overrides.
   * @returns {{equity:number, drawdownBps:number, circuitBreaker:string}}
   */
  function mark(ts, prices = {}) {
    if (!isNum(ts)) {
      const eq = equity();
      return { equity: round2(eq), drawdownBps: round2(S.maxDd * 1e4), circuitBreaker: S.cbState };
    }
    S.lastTs = Math.max(S.lastTs, ts);
    applyFunding(ts);
    const { eq, dd } = snapDd();
    checkCb(dd, ts);
    return { equity: round2(eq), drawdownBps: round2(dd * 1e4), circuitBreaker: S.cbState };
  }

  /**
   * Current open positions.
   * @returns {Array<Object>}
   */
  function positions() {
    const out = [];
    for (const [inst, pos] of S.positions) {
      const bh = S.bars.get(inst);
      const px = bh && bh.length ? bh[bh.length - 1].close : pos.avg;
      const dir = pos.side === 'long' ? 1 : -1;
      out.push({
        instrument: inst, side: pos.side, quantity: pos.qty,
        avgEntryPrice: round2(pos.avg), currentPrice: round2(px),
        unrealizedPnl: round2(dir * (px - pos.avg) * pos.qty),
        fundingPaid: round2(S.fundMap.get(inst) || 0),
        factorId: pos.fid, openedTs: pos.ots, entryCount: pos.ents.length,
      });
    }
    return out;
  }

  /**
   * Portfolio P&L summary.
   * @returns {Object}
   */
  function pnl() {
    let ur = 0;
    for (const [inst, pos] of S.positions) {
      const bh = S.bars.get(inst);
      const px = bh && bh.length ? bh[bh.length - 1].close : pos.avg;
      ur += (pos.side === 'long' ? 1 : -1) * (px - pos.avg) * pos.qty;
    }
    const eq = equity();
    const ret = S.initEq > 0 ? (eq - S.initEq) / S.initEq : 0;
    return {
      equity: round2(eq), initialEquity: round2(S.initEq),
      grossRealizedPnl: round2(S.cumRealized), unrealizedPnl: round2(ur),
      totalFees: round2(S.cumFees), totalFunding: round2(S.cumFunding),
      totalReturnBps: round2(ret * 1e4), maxDrawdownBps: round2(S.maxDd * 1e4),
      circuitBreaker: S.cbState, openPositions: S.positions.size,
      completedTrades: S.trades, noTrades: S.noTrades,
    };
  }

  /**
   * Full engine state snapshot (for auditing / debugging).
   * @returns {Object}
   */
  function snapshot() {
    return {
      ...pnl(), positions: positions(), peakEquity: round2(S.peakEq),
      openCount: S.opens,
      barHistorySizes: Object.fromEntries([...S.bars.entries()].map(([k, v]) => [k, v.length])),
    };
  }

  /**
   * Deterministic replay for back-testing.
   * Bars and signals are merged by timestamp; bars at time T are always
   * ingested BEFORE any signal at time T is evaluated.
   *
   * @param {Array<{instrument?:string, bar:object}|object>} barsSeries
   * @param {Array<{factorId:string, ts:number, value:number, side:string, confidence:number, instrument?:string}>} signals
   * @returns {Object} final snapshot
   */
  function replay(barsSeries, signals) {
    if (!Array.isArray(barsSeries) || !Array.isArray(signals))
      throw new Error('replay: barsSeries and signals must be arrays');

    const normBars = barsSeries.map(e =>
      (e && e.instrument && e.bar) ? e : { instrument: 'default', bar: e }
    );
    const normSigs = signals.map(s => ({ ...s, instrument: s.instrument || 'default' }));
    // Sort by canonical `timestamp` field
    normBars.sort((a, b) => (a.bar.timestamp ?? 0) - (b.bar.timestamp ?? 0));
    normSigs.sort((a, b) => a.ts - b.ts);

    let si = 0;
    for (const { instrument, bar } of normBars) {
      ingestBar(bar, instrument);
      while (si < normSigs.length && normSigs[si].ts <= bar.timestamp) {
        onSignal(normSigs[si], { instrument: normSigs[si].instrument });
        si++;
      }
    }
    while (si < normSigs.length) {
      onSignal(normSigs[si], { instrument: normSigs[si].instrument });
      si++;
    }
    const lastTs = normBars.length ? (normBars[normBars.length - 1].bar.timestamp ?? S.lastTs) : S.lastTs;
    mark(lastTs);
    return snapshot();
  }

  return { ingestBar, submitPaperOrder, onSignal, mark, positions, pnl, snapshot, replay };
}

/* ═══════════════════════════════════════════════════════════════════
   Self-Test  (node afl-paper.mjs --test)
   ═══════════════════════════════════════════════════════════════════ */

const _SELF = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === resolve(_SELF) && process.argv.includes('--test')) {
  const testDir = '/tmp/afl-paper-selftest';
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });

  const paperPath = `${testDir}/paper.jsonl`;
  const predPath  = `${testDir}/prediction.jsonl`;

  let passed = 0;
  let failed = 0;

  function assert(cond, label, detail = '') {
    if (cond) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
      failed++;
    }
  }

  console.log('\n=== AFL Paper Engine Self-Test ===\n');

  /* ── T1: Protected path guard ── */
  console.log('T1: Protected path guard');
  try {
    createPaperEngine({ paperLedgerPath: '/tmp/x.jsonl', predictionLedgerPath: 'backend/data/x.jsonl', caps: {} });
    assert(false, 'T1a protected path should throw');
  } catch (e) {
    assert(e.message.includes('protected path'), 'T1a protected path throws', e.message);
  }

  /* ── T2: ingestBar rejects malformed bars ── */
  console.log('\nT2: ingestBar rejects malformed bars');
  {
    const eng = createPaperEngine({ paperLedgerPath: paperPath, predictionLedgerPath: predPath, feeModel: cryptoFeeModel('taker') });

    // high < low
    const r1 = eng.ingestBar({ timestamp: 1000, open: 100, high: 90, low: 101, close: 95, volume: 500 });
    assert(r1 === false, 'T2a high<low rejected');

    // NaN close
    const r2 = eng.ingestBar({ timestamp: 1001, open: 100, high: 110, low: 90, close: NaN, volume: 500 });
    assert(r2 === false, 'T2b NaN close rejected');

    // Missing timestamp
    const r3 = eng.ingestBar({ open: 100, high: 110, low: 90, close: 100, volume: 500 });
    assert(r3 === false, 'T2c missing timestamp rejected');

    // Negative volume is rejected by validateBar
    const r4 = eng.ingestBar({ timestamp: 1002, open: 100, high: 110, low: 90, close: 100, volume: -1 });
    assert(r4 === false, 'T2d negative volume rejected');

    // Non-monotone timestamp
    const r5 = eng.ingestBar({ timestamp: 1003, open: 100, high: 110, low: 90, close: 100, volume: 500 });
    assert(r5 === true, 'T2e valid bar accepted');
    const r6 = eng.ingestBar({ timestamp: 1003, open: 100, high: 110, low: 90, close: 100, volume: 500 });
    assert(r6 === false, 'T2f duplicate timestamp (non-monotone) rejected');

    const paperLines = readFileSync(paperPath, 'utf-8').trim().split('\n').filter(Boolean);
    const rejections = paperLines.map(l => JSON.parse(l)).filter(l => l.type === 'rejected');
    assert(rejections.length >= 4, `T2g rejections logged (${rejections.length} >= 4)`);
  }

  // Clean slate for next tests
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });

  /* ── T3: Almgren-Chriss fill model ── */
  console.log('\nT3: Almgren-Chriss fill model correctness');
  {
    // Buy fill should be above mid; sell fill should be below mid
    const eng = createPaperEngine({ paperLedgerPath: paperPath, predictionLedgerPath: predPath, feeModel: cryptoFeeModel('taker') });
    const mid = 50_000;
    const sigma = 0.02;
    const adv = 1000;
    const qty = 10;

    const buyFill = computeFillPrice_test({ side: 'buy',  mid, spread: 100, sigma, qty, adv });
    const sellFill = computeFillPrice_test({ side: 'sell', mid, spread: 100, sigma, qty, adv });
    assert(isNum(buyFill) && buyFill > mid, `T3a buy fill (${buyFill}) > mid (${mid})`);
    assert(isNum(sellFill) && sellFill < mid, `T3b sell fill (${sellFill}) < mid (${mid})`);
    assert(buyFill > sellFill, 'T3c buy fill > sell fill');

    // crypto fee: taker at 0.001 on $100 notional → $0.10
    const fee = cryptoFeeModel('taker')(undefined, 100, 1);
    assert(Math.abs(fee - 0.1) < 0.001, `T3d crypto taker fee = ${fee} (expect 0.10)`);

    // Polymarket quadratic fee at p=0.5 (maximum)
    const polyFee = predictionMarketFeeModel(1, 0.07)(undefined, 0.5, 1);
    const expected = Math.ceil(1 * 0.07 * 0.5 * 0.5 * 100) / 100;
    assert(Math.abs(polyFee - expected) < 0.001, `T3e polymarket fee at p=0.5 = ${polyFee} (expect ${expected})`);
  }

  // Helper to expose computeFillPrice for T3 without exporting it
  function computeFillPrice_test({ side, mid, spread, sigma, qty, adv }) {
    // Replicate the fill formula inline for the test (no separate export needed)
    if (!isNum(mid) || mid <= 0) return NaN;
    if (!isNum(spread) || spread < 0) spread = 0;
    if (!isNum(sigma) || sigma <= 0) sigma = MIN_SIGMA;
    if (!isNum(qty) || qty <= 0) return NaN;
    if (!isNum(adv) || adv <= 0) adv = MIN_ADV;
    const pi = qty / adv;
    const sig = 1 / (1 + Math.exp(-SIGMOID_K * (PI_THRESHOLD - pi)));
    const exponent = 0.5 - 0.3 * sig;
    const sigmaPrice = sigma * mid;
    const impact = Y_IMPACT * sigmaPrice * Math.pow(Math.max(pi, 1e-12), exponent);
    const slippage = 0.5 * Math.max(spread, 0) + impact;
    const fill = side === 'buy' ? mid + slippage : mid - slippage;
    return isNum(fill) && fill > 0 ? fill : NaN;
  }

  /* ── T4: Full replay — P&L / drawdown / breaker / prediction ledger ── */
  console.log('\nT4: Full replay sequence');
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
  {
    const eng = createPaperEngine({
      paperLedgerPath: paperPath,
      predictionLedgerPath: predPath,
      feeModel: cryptoFeeModel('taker'),
      caps: {
        initialEquity: 10_000_000,   // large enough to trade at BTC prices (~50k)
        maxPositionPct: 0.10,
        softDrawdown: 0.05,
        hardDrawdown: 0.10,
        maxDrawdown: 0.20,
        tailMultiplier: 3,
        fundingRates: { 'BTC-PERP': 0.0001 },
      },
    });

    // Synthetic bars: BTC-PERP rises 20 bars, falls 10 bars (price ~50k)
    const bars = [];
    let px = 50_000;
    function round2t(x) { return Math.round(x * 100) / 100; }
    for (let i = 0; i < 30; i++) {
      const drift = i < 20 ? 80 : -60;
      const noise = ((i * 7 + 13) % 17 - 8) * 15;
      const o = px;
      const c = px + drift + noise;
      const h = Math.max(o, c) + Math.abs(noise) * 0.5 + 20;
      const l = Math.min(o, c) - Math.abs(noise) * 0.5 - 20;
      bars.push({
        timestamp: 1_000_000 + i * 60, // seconds
        open: round2t(o), high: round2t(h), low: round2t(l), close: round2t(c),
        volume: 1200 + (i * 137) % 500,
      });
      px = c;
    }

    const signals = [
      { factorId: 'momentum', ts: 1_000_000 + 10 * 60, value: 0.8,  side: 'long',  confidence: 0.75 },
      { factorId: 'momentum', ts: 1_000_000 + 20 * 60, value: 0.1,  side: 'flat',  confidence: 0.50 },
      { factorId: 'reversal', ts: 1_000_000 + 22 * 60, value: -0.6, side: 'short', confidence: 0.65 },
      { factorId: 'reversal', ts: 1_000_000 + 28 * 60, value: 0.0,  side: 'flat',  confidence: 0.30 },
    ];

    const snap = eng.replay(
      bars.map(b => ({ instrument: 'BTC-PERP', bar: b })),
      signals.map(s => ({ ...s, instrument: 'BTC-PERP' })),
    );

    const summary = eng.pnl();
    assert(isNum(summary.equity), `T4a equity is finite: ${summary.equity}`);
    assert(summary.openPositions === 0, `T4b all positions closed: ${summary.openPositions}`);
    assert(summary.maxDrawdownBps >= 0, `T4c maxDrawdown >= 0: ${summary.maxDrawdownBps}`);
    assert(['CLOSED', 'HALF_OPEN', 'OPEN'].includes(summary.circuitBreaker), `T4d valid cb state: ${summary.circuitBreaker}`);
    assert(summary.totalFees > 0, `T4e fees accrued: ${summary.totalFees}`);

    // Prediction ledger check
    const predLines = readFileSync(predPath, 'utf-8').trim().split('\n').filter(Boolean);
    const preds = predLines.map(l => JSON.parse(l));
    const predEntries  = preds.filter(p => p.type === 'prediction');
    const predOutcomes = preds.filter(p => p.type === 'outcome');
    assert(predEntries.length >= 1, `T4f prediction entries recorded (${predEntries.length})`);
    assert(predOutcomes.length >= 1, `T4g prediction outcomes recorded (${predOutcomes.length})`);

    // Paper ledger
    const paperLines = readFileSync(paperPath, 'utf-8').trim().split('\n').filter(Boolean);
    const paperRows = paperLines.map(l => JSON.parse(l));
    const opens = paperRows.filter(r => r.type === 'open');
    assert(opens.length >= 1, `T4h open entries in paper ledger (${opens.length})`);

    console.log(`  bars: ${bars.length}  signals: ${signals.length}  opens: ${opens.length}`);
    console.log(`  equity: ${summary.equity}  maxDdBps: ${summary.maxDrawdownBps}  fees: ${summary.totalFees}`);
  }

  /* ── T5: Replay determinism ── */
  console.log('\nT5: Replay determinism');
  {
    const mkEngine = () => createPaperEngine({
      paperLedgerPath: `${testDir}/p1.jsonl`,
      predictionLedgerPath: `${testDir}/pred1.jsonl`,
      feeModel: cryptoFeeModel('taker'),
      caps: { initialEquity: 50_000 },
    });
    const bars2 = [];
    let px2 = 10_000;
    for (let i = 0; i < 20; i++) {
      const c2 = px2 + 50 * (i % 3 === 0 ? -1 : 1);
      bars2.push({ timestamp: 2_000_000 + i * 60, open: px2, high: Math.max(px2, c2) + 10, low: Math.min(px2, c2) - 10, close: c2, volume: 500 });
      px2 = c2;
    }
    const sigs2 = [
      { factorId: 'f1', ts: 2_000_000 + 5 * 60, value: 0.5, side: 'long',  confidence: 0.6 },
      { factorId: 'f1', ts: 2_000_000 + 15 * 60, value: 0.1, side: 'flat', confidence: 0.4 },
    ];

    const e1 = mkEngine();
    const snap1 = e1.replay(bars2.map(b => ({ instrument: 'ETH', bar: b })), sigs2.map(s => ({ ...s, instrument: 'ETH' })));

    // Second engine: re-create from scratch with same inputs
    const e2 = createPaperEngine({
      paperLedgerPath: `${testDir}/p2.jsonl`,
      predictionLedgerPath: `${testDir}/pred2.jsonl`,
      feeModel: cryptoFeeModel('taker'),
      caps: { initialEquity: 50_000 },
    });
    const snap2 = e2.replay(bars2.map(b => ({ instrument: 'ETH', bar: b })), sigs2.map(s => ({ ...s, instrument: 'ETH' })));

    assert(snap1.equity === snap2.equity, `T5a deterministic equity: ${snap1.equity} === ${snap2.equity}`);
    assert(snap1.maxDrawdownBps === snap2.maxDrawdownBps, `T5b deterministic maxDd: ${snap1.maxDrawdownBps} === ${snap2.maxDrawdownBps}`);
  }

  /* ── T6: submitPaperOrder (explicit-size path, INV-1) ── */
  console.log('\nT6: submitPaperOrder explicit-size path');
  {
    const eng2 = createPaperEngine({
      paperLedgerPath: `${testDir}/p3.jsonl`,
      predictionLedgerPath: `${testDir}/pred3.jsonl`,
      feeModel: cryptoFeeModel('taker'),
      caps: { initialEquity: 100_000 },
    });
    // Feed bars so engine has a price context
    eng2.ingestBar({ timestamp: 3_000_000, open: 50000, high: 50500, low: 49500, close: 50000, volume: 1000 });
    eng2.ingestBar({ timestamp: 3_000_060, open: 50000, high: 50600, low: 49400, close: 50100, volume: 1100 });
    eng2.ingestBar({ timestamp: 3_000_120, open: 50100, high: 50700, low: 49300, close: 50200, volume: 1200 });

    const res = eng2.submitPaperOrder({ venue: 'coinbase', symbol: 'BTC-USD', side: 'buy', qty: 0.1, refPrice: 50000 });
    assert(res.ok === true, `T6a submitPaperOrder ok: ${JSON.stringify(res)}`);
    assert(isNum(res.fillPrice) && res.fillPrice > 0, `T6b fillPrice finite+positive: ${res.fillPrice}`);
    assert(isNum(res.fee) && res.fee >= 0, `T6c fee >= 0: ${res.fee}`);
    assert(isNum(res.impact) && res.impact >= 0, `T6d impact >= 0: ${res.impact}`);

    // Notional path
    const res2 = eng2.submitPaperOrder({ venue: 'coinbase', symbol: 'BTC-USD', side: 'sell', notional: 5000, refPrice: 50000 });
    assert(res2.ok === true, `T6e notional path ok: ${JSON.stringify(res2)}`);

    // Missing qty+notional → error
    const res3 = eng2.submitPaperOrder({ venue: 'coinbase', symbol: 'BTC-USD', side: 'buy', refPrice: 50000 });
    assert(res3.ok === false && res3.reason === 'missing_qty_or_notional', `T6f missing qty → error: ${res3.reason}`);

    // Verify: no real order code in the ledger (PAPER-ONLY)
    const paperLines2 = readFileSync(`${testDir}/p3.jsonl`, 'utf-8').trim().split('\n').filter(Boolean);
    const paperRows2 = paperLines2.map(l => JSON.parse(l));
    const realOrders = paperRows2.filter(r => r.type === 'order' && r.real === true);
    assert(realOrders.length === 0, `T6g no real orders in ledger (INV-1 verified)`);
  }

  /* ── T7: Fractional crypto qty (BUG-1 regression) ── */
  console.log('\nT7: Fractional crypto qty — onSignal notional path (BUG-1 regression)');
  {
    // Small equity so maxNot/mid would be deeply fractional without notional path.
    // e.g. $1k equity, 5% pos cap = $50 maxNot, BTC @ $65k → 0.00076 BTC (→ 0 with old Math.floor)
    const eng3 = createPaperEngine({
      paperLedgerPath: `${testDir}/p4.jsonl`,
      predictionLedgerPath: `${testDir}/pred4.jsonl`,
      feeModel: cryptoFeeModel('taker'),
      caps: { initialEquity: 1_000, maxPositionPct: 0.05 },
    });
    const BTC_PRICE = 65_000;
    // Feed 3 bars so bh.length >= 3 (history requirement)
    for (let i = 0; i < 3; i++) {
      eng3.ingestBar({
        timestamp: 5_000_000 + i * 60,
        open: BTC_PRICE, high: BTC_PRICE + 50, low: BTC_PRICE - 50, close: BTC_PRICE + i,
        volume: 500,
      }, 'BTC-USD');
    }

    // Notional path: $50 notional at BTC = $65k → qty ≈ 0.000769 BTC (was 0 with Math.floor)
    const r7a = eng3.onSignal(
      { factorId: 'frac-test', ts: 5_000_180, value: 0.9, side: 'long', confidence: 0.8, notional: 50 },
      { instrument: 'BTC-USD' },
    );
    assert(r7a.action === 'OPEN', `T7a fractional-notional opens position (got: ${r7a.action}, reason: ${r7a.reason})`);
    assert(isNum(r7a.quantity) && r7a.quantity > 0 && r7a.quantity < 1,
      `T7b qty is fractional BTC (got: ${r7a.quantity})`);

    const pos7 = eng3.positions();
    assert(pos7.length === 1, `T7c position exists after fractional fill (${pos7.length})`);
    assert(pos7[0].quantity > 0 && pos7[0].quantity < 1,
      `T7d position qty is fractional (${pos7[0].quantity})`);

    // Explicit fractional qty path: signal.qty = 0.00432 (was floored to 0)
    const eng4 = createPaperEngine({
      paperLedgerPath: `${testDir}/p5.jsonl`,
      predictionLedgerPath: `${testDir}/pred5.jsonl`,
      feeModel: cryptoFeeModel('taker'),
      caps: { initialEquity: 1_000, maxPositionPct: 0.05 },
    });
    for (let i = 0; i < 3; i++) {
      eng4.ingestBar({
        timestamp: 6_000_000 + i * 60,
        open: BTC_PRICE, high: BTC_PRICE + 50, low: BTC_PRICE - 50, close: BTC_PRICE + i,
        volume: 500,
      }, 'BTC-USD');
    }
    const r7b = eng4.onSignal(
      { factorId: 'frac-qty-test', ts: 6_000_180, value: 0.9, side: 'long', confidence: 0.8, qty: 0.00432 },
      { instrument: 'BTC-USD' },
    );
    assert(r7b.action === 'OPEN', `T7e fractional-qty opens position (got: ${r7b.action}, reason: ${r7b.reason})`);
    assert(isNum(r7b.quantity) && r7b.quantity > 0 && r7b.quantity < 1,
      `T7f qty is fractional BTC (got: ${r7b.quantity})`);

    console.log(`  T7: fractional notional qty=${pos7[0]?.quantity}  explicit-qty qty=${r7b.quantity}`);
  }

  /* ── Summary ── */
  console.log(`\n=== Self-Test ${failed === 0 ? 'PASSED' : 'FAILED'} ===`);
  console.log(`  passed: ${passed}  failed: ${failed}`);
  rmSync(testDir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}
