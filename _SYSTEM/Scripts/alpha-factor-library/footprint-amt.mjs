#!/usr/bin/env node
// @capability: footprint-amt
// @serves: volume profile | footprint chart | bid ask delta | CVD cumulative volume delta | POC point of control | value area VAH VAL | composite value area | auction market theory | initiative responsive absorption
// @does: Auction-Market-Theory analysis layer over recorded trade flow (MURE gap-2): volume-at-price profiles with per-bin buy/sell delta, volume-POC vs delta-POC (divergence = value migrating), canonical 70% value-area expansion (VAH/VAL), composite multi-session profiles (merge-then-compute), CVD with optional session reset, footprint OHLCV+delta bars, and AMT regime signals (initiative acceptance vs responsive rejection at the value-area edges) in the canonical factor-signal shape.
// @use: computeVolumeProfile(trades,{binSize}) → profile+VA; computeFootprintBars(trades,{barSec,binSize}) → footprint bars; amtSignals(bars, valueArea, {market}) → ensemble-ready signals; profileFromTape(tapePath,{t0,t1,binSize}) straight off a recorded tape. DISARMED-first: degrades to empty shapes without _SYSTEM/state/mure-footprint.enabled.
// @exports: computeVolumeProfile, computeCVD, computeFootprintBars, computeValueArea, amtSignals, profileFromTape
//
// MURE gap-2 (MURE_GAP_SEAM_DESIGN_2026-07-06.mjs::gap2_footprint_amt). Pure compute over injected
// trades/tape — no network. Existing modules never import this (DAG: new→existing only).
//
// SPEC (lanes/D-quant-spec.md §7 — Steidlmayer/Dalton, cited):
//   delta(price,bar) = volumeAtAsk − volumeAtBid  (aggressor-side classification, NOT tick-rule —
//     the tape carries true aggressor sides: taker buy = ask-side, taker sell = bid-side)
//   CVD_t = Σ delta_i (bar-level), session reset optional (UTC-daily convention for sub-daily TFs)
//   POC = argmax_price(totalVolume) · deltaPOC = argmax_price(|delta|) — divergence = value migrating
//   VA  = smallest contiguous range around POC holding ≥70% of volume, grown one adjacent bin at a
//         time toward the LARGER neighbor (70% is a FIXED convention, not a tunable)
//   Composite VA = ValueArea(merged raw distributions) — merge BEFORE computing, never average VAs
//   Regimes: responsive (probe outside value rejected, weak one-sided delta at the extreme) vs
//   initiative (break accepted, strong confirming delta) vs absorption (heavy volume, delta not
//   confirming, price pinned).
//
// TRADE INPUT (both accepted, normalized internally):
//   tape-replay.tradesBetween → { ts, tradePrice, tradeSize, aggressorSide:'buy'|'sell' }
//   trades-stream shape       → { ts, price, qty, aggressorSide | isBuyerMaker }
//   ts unit-agnostic (ms or s) EXCEPT session-reset CVD and barSec bucketing, which need seconds
//   unless opts.tsUnit='ms' (then converted). Documented per function.
//
// SEAM-SPEC IMPORT DEVIATIONS (documented, deliberate):
//   ofi.ofiContribution NOT imported — footprint delta comes from true trade aggressor sides, which
//     supersedes book-snapshot pressure decomposition for volume-at-price work (the spec's listed
//     use, "per-bar buy/sell pressure decomposition", is exactly what aggressor-side delta IS).
//   orderbook-imbalance.computeMicroprice NOT imported — amtSignals operates on bars+VA; no book
//     state crosses this seam (the microprice acceptance anchor belongs to the caller that has both).
//
// DISARMED CONTRACT: flag _SYSTEM/state/mure-footprint.enabled (creation owner-gated; MURE_FLAG_DIR
// is the unit-test sandbox override only). Disarmed → computeVolumeProfile {bins:[],poc:null,
// deltaPoc:null,vah:null,val:null,...} · computeCVD [] · computeFootprintBars [] · computeValueArea
// {vah:null,val:null,poc:null,valueAreaVol:0} · amtSignals [] · profileFromTape null. No throw.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadTape } from './tape-replay.mjs';
import { validateBar } from './data-quality-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAG_NAME = 'mure-footprint.enabled';
const FLAG_PATH = () => path.join(
  process.env.MURE_FLAG_DIR || path.resolve(__dirname, '..', '..', 'state'),
  FLAG_NAME,
);
const armed = () => { try { return existsSync(FLAG_PATH()); } catch { return false; } };

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const EMPTY_PROFILE = Object.freeze({ bins: [], poc: null, deltaPoc: null, vah: null, val: null, totalVol: 0, valueAreaVol: 0, binSize: null });

/** Normalize a trade from either accepted shape → {ts, price, qty, side:'buy'|'sell'} | null. */
function normTrade(t) {
  if (!t || typeof t !== 'object') return null;
  const price = Number(t.tradePrice ?? t.price ?? t.p);
  const qty = Number(t.tradeSize ?? t.qty ?? t.q);
  const ts = Number(t.ts);
  if (!isNum(price) || !isNum(qty) || qty <= 0 || !isNum(ts)) return null;
  let side = t.aggressorSide;
  if (side !== 'buy' && side !== 'sell') {
    if (typeof t.isBuyerMaker === 'boolean') side = t.isBuyerMaker ? 'sell' : 'buy';
    else if (t.m === true) side = 'sell';
    else if (t.m === false) side = 'buy';
    else return null; // no aggressor info → excluded (never guess via tick rule here)
  }
  return { ts, price, qty, side };
}

const binOf = (price, binSize) => Math.round(Math.floor(price / binSize + 1e-9) * binSize * 1e9) / 1e9;

// ═══════════════════════════════════════════════════════════════════════════
// computeValueArea — the canonical 70% expansion (separate so composite/merged
// profiles route through the SAME algorithm — Lane D: merge before, compute once).
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {{bins:{price,totalVol}[]}} volumeProfile  bins sorted ascending by price
 * @param {{valuePct?:number}} [opts]  0.70 is the AMT convention — override only for research
 * @returns {{vah:number|null, val:number|null, poc:number|null, valueAreaVol:number, totalVol:number}}
 */
export function computeValueArea(volumeProfile, { valuePct = 0.70 } = {}) {
  const degrade = { vah: null, val: null, poc: null, valueAreaVol: 0, totalVol: 0 };
  if (!armed()) return degrade;
  try {
    const bins = Array.isArray(volumeProfile?.bins) ? volumeProfile.bins.filter((b) => b && isNum(b.price) && isNum(b.totalVol) && b.totalVol >= 0) : [];
    if (bins.length === 0) return degrade;
    const sorted = [...bins].sort((a, b) => a.price - b.price);
    const totalVol = sorted.reduce((a, b) => a + b.totalVol, 0);
    if (totalVol <= 0) return degrade;
    // POC = max-volume bin; deterministic tie-break toward the LOWER price (documented).
    let pi = 0;
    for (let i = 1; i < sorted.length; i++) if (sorted[i].totalVol > sorted[pi].totalVol) pi = i;
    let lo = pi, hi = pi;
    let acc = sorted[pi].totalVol;
    const target = valuePct * totalVol;
    // Grow one adjacent bin at a time toward the larger neighbor (Lane D construction).
    while (acc < target && (lo > 0 || hi < sorted.length - 1)) {
      const below = lo > 0 ? sorted[lo - 1].totalVol : -1;
      const above = hi < sorted.length - 1 ? sorted[hi + 1].totalVol : -1;
      if (above > below) { hi += 1; acc += sorted[hi].totalVol; }
      else { lo -= 1; acc += sorted[lo].totalVol; }
    }
    return { vah: sorted[hi].price, val: sorted[lo].price, poc: sorted[pi].price, valueAreaVol: acc, totalVol };
  } catch { return degrade; }
}

// ═══════════════════════════════════════════════════════════════════════════
// computeVolumeProfile — volume-at-price + delta + POC/deltaPOC + VA.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Pass ONE session's trades for a session profile, or N sessions' trades CONCATENATED for the
 * composite profile (merge-before-compute is exactly "hand all the raw trades in" — Lane D).
 * @param {object[]} trades  either accepted trade shape
 * @param {{binSize?:number, priceMin?:number, priceMax?:number, valuePct?:number}} [opts]
 * @returns {{bins:{price,buyVol,sellVol,totalVol,delta}[], poc, deltaPoc, vah, val, totalVol, valueAreaVol, binSize}}
 *   bins ascending by price. poc = volume POC; deltaPoc = argmax|delta| — divergence is a signal.
 */
export function computeVolumeProfile(trades, { binSize = 0.25, priceMin, priceMax, valuePct = 0.70 } = {}) {
  if (!armed()) return EMPTY_PROFILE;
  try {
    if (!Array.isArray(trades) || !isNum(binSize) || binSize <= 0) return { ...EMPTY_PROFILE, binSize: isNum(binSize) ? binSize : null };
    const acc = new Map(); // binPrice → {buyVol, sellVol}
    for (const raw of trades) {
      const t = normTrade(raw);
      if (!t) continue;
      if (isNum(priceMin) && t.price < priceMin) continue;
      if (isNum(priceMax) && t.price > priceMax) continue;
      const key = binOf(t.price, binSize);
      let b = acc.get(key);
      if (!b) { b = { buyVol: 0, sellVol: 0 }; acc.set(key, b); }
      if (t.side === 'buy') b.buyVol += t.qty; else b.sellVol += t.qty;
    }
    if (acc.size === 0) return { ...EMPTY_PROFILE, binSize };
    const bins = [...acc.entries()]
      .map(([price, b]) => ({ price, buyVol: b.buyVol, sellVol: b.sellVol, totalVol: b.buyVol + b.sellVol, delta: b.buyVol - b.sellVol }))
      .sort((a, b) => a.price - b.price);
    const va = computeValueArea({ bins }, { valuePct });
    let dp = bins[0];
    for (const b of bins) if (Math.abs(b.delta) > Math.abs(dp.delta)) dp = b;
    return { bins, poc: va.poc, deltaPoc: dp.price, vah: va.vah, val: va.val, totalVol: va.totalVol, valueAreaVol: va.valueAreaVol, binSize };
  } catch { return EMPTY_PROFILE; }
}

// ═══════════════════════════════════════════════════════════════════════════
// computeCVD — cumulative volume delta.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {object[]} trades
 * @param {{sessionResetSec?:number|null, tsUnit?:'s'|'ms'}} [opts]
 *   sessionResetSec: e.g. 86400 → CVD resets at each UTC-day boundary (the sub-daily convention,
 *   Lane D). Default null = pure cumulative (daily-and-above convention). tsUnit only matters when
 *   resetting (boundary math needs seconds).
 * @returns {{ts:number, delta:number, cvd:number}[]}  per-trade, chronological
 */
export function computeCVD(trades, { sessionResetSec = null, tsUnit = 's' } = {}) {
  if (!armed()) return [];
  try {
    if (!Array.isArray(trades)) return [];
    const norm = trades.map(normTrade).filter(Boolean).sort((a, b) => a.ts - b.ts);
    const out = [];
    let cvd = 0;
    let session = null;
    const toSec = (ts) => (tsUnit === 'ms' ? ts / 1000 : ts);
    for (const t of norm) {
      if (isNum(sessionResetSec) && sessionResetSec > 0) {
        const s = Math.floor(toSec(t.ts) / sessionResetSec);
        if (session !== null && s !== session) cvd = 0;
        session = s;
      }
      const delta = t.side === 'buy' ? t.qty : -t.qty;
      cvd += delta;
      out.push({ ts: t.ts, delta, cvd });
    }
    return out;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════
// computeFootprintBars — OHLCV + per-price delta bins + bar delta + running CVD.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {object[]} trades
 * @param {{barSec?:number, binSize?:number, tsUnit?:'s'|'ms'}} [opts]
 * @returns {{ts, open, high, low, close, volume, delta, cvd, bins:{price,buyVol,sellVol,delta,vol}[], valid}[]}
 *   ts = bar START (unix-seconds). Each emitted bar's OHLCV is checked through the EXISTING
 *   validateBar gate (data-quality reuse); failures carry valid:false rather than being dropped
 *   (footprint bins can still be studied), and callers gate on it.
 */
export function computeFootprintBars(trades, { barSec = 60, binSize = 0.25, tsUnit = 's' } = {}) {
  if (!armed()) return [];
  try {
    if (!Array.isArray(trades) || !isNum(barSec) || barSec <= 0 || !isNum(binSize) || binSize <= 0) return [];
    const norm = trades.map(normTrade).filter(Boolean).sort((a, b) => a.ts - b.ts);
    if (norm.length === 0) return [];
    const toSec = (ts) => (tsUnit === 'ms' ? ts / 1000 : ts);
    const buckets = new Map(); // barStartSec → trades[]
    for (const t of norm) {
      const start = Math.floor(toSec(t.ts) / barSec) * barSec;
      if (!buckets.has(start)) buckets.set(start, []);
      buckets.get(start).push(t);
    }
    const out = [];
    let cvd = 0;
    for (const [ts, arr] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
      const open = arr[0].price, close = arr[arr.length - 1].price;
      let high = -Infinity, low = Infinity, volume = 0, delta = 0;
      const binAcc = new Map();
      for (const t of arr) {
        if (t.price > high) high = t.price;
        if (t.price < low) low = t.price;
        volume += t.qty;
        delta += t.side === 'buy' ? t.qty : -t.qty;
        const key = binOf(t.price, binSize);
        let b = binAcc.get(key);
        if (!b) { b = { buyVol: 0, sellVol: 0 }; binAcc.set(key, b); }
        if (t.side === 'buy') b.buyVol += t.qty; else b.sellVol += t.qty;
      }
      cvd += delta;
      const bins = [...binAcc.entries()]
        .map(([price, b]) => ({ price, buyVol: b.buyVol, sellVol: b.sellVol, delta: b.buyVol - b.sellVol, vol: b.buyVol + b.sellVol }))
        .sort((a, b) => a.price - b.price);
      const check = validateBar({ timestamp: ts, open, high, low, close, volume }); // REUSED gate
      out.push({ ts, open, high, low, close, volume, delta, cvd, bins, valid: check?.ok !== false });
    }
    return out;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════
// amtSignals — AMT regime classification at the value-area edges → canonical signals.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Classifies each footprint bar against a REFERENCE value area (prior session or composite —
 * the caller chooses which VA to hand in; short rungs pair with single-session VA, long rungs
 * with composite VA per Lane D §7):
 *   close > VAH, delta strongly + → INITIATIVE BUYING (acceptance above value) → long
 *   close > VAH, delta ≤ 0        → RESPONSIVE probe (unconfirmed breach)      → short (fade)
 *   close < VAL, delta strongly − → INITIATIVE SELLING                          → short
 *   close < VAL, delta ≥ 0        → RESPONSIVE probe                            → long (fade)
 *   inside VA                     → no signal (balanced auction)
 *   ABSORPTION guard: breach bar with heavy volume but |delta|/volume below deltaConfirm AND
 *   close pinned back at/inside the edge → treated as responsive (the push failed).
 *
 * @param {object[]} footprintBars  from computeFootprintBars (uses ts, close, delta, volume, valid)
 * @param {{vah:number, val:number, poc?:number}} valueArea  the REFERENCE VA
 * @param {{market?:string, deltaConfirm?:number, confidenceCap?:number, emitPerBar?:boolean}} [opts]
 *   deltaConfirm: min |delta|/volume to call a breach initiative (default 0.15).
 * @returns {{factorId, ts, value, side, confidence, source}[]}  canonical signal shape;
 *   value = the bar's delta; by default only the LAST bar emits (live-loop semantics) —
 *   emitPerBar:true emits every classified bar (research mode).
 */
export function amtSignals(footprintBars, valueArea, { market = '', deltaConfirm = 0.15, confidenceCap = 0.60, emitPerBar = false } = {}) {
  if (!armed()) return [];
  try {
    if (!Array.isArray(footprintBars) || footprintBars.length === 0) return [];
    const vah = Number(valueArea?.vah), val = Number(valueArea?.val);
    if (!isNum(vah) || !isNum(val) || vah < val) return [];
    const bars = footprintBars.filter((b) => b && isNum(b.close) && isNum(b.delta) && isNum(b.volume) && b.volume > 0 && b.valid !== false);
    if (bars.length === 0) return [];
    const targets = emitPerBar ? bars : [bars[bars.length - 1]];
    const signals = [];
    for (const bar of targets) {
      let side = null; let regime = null;
      const deltaRatio = bar.delta / bar.volume; // [-1, 1]
      if (bar.close > vah) {
        if (deltaRatio >= deltaConfirm) { side = 'long'; regime = 'initiative-buy'; }
        else { side = 'short'; regime = 'responsive-fade-high'; }
      } else if (bar.close < val) {
        if (deltaRatio <= -deltaConfirm) { side = 'short'; regime = 'initiative-sell'; }
        else { side = 'long'; regime = 'responsive-fade-low'; }
      }
      if (!side) continue; // inside value — balanced, no edge claim
      // Confidence: |deltaRatio| scaled for initiative; (deltaConfirm − |ratio|) shortfall for
      // responsive; capped — footprint regime is an overlay, never a price-signal-strength claim.
      const conf = regime.startsWith('initiative')
        ? Math.min(confidenceCap, 0.30 + Math.abs(deltaRatio) * 0.4)
        : Math.min(confidenceCap, 0.25 + Math.max(0, deltaConfirm - Math.abs(deltaRatio)) * 0.8);
      signals.push({
        factorId: `footprint-amt-${market}`,
        ts: bar.ts, value: bar.delta, side, confidence: conf, source: 'footprint',
        regime, // extra diagnostic field — canonical consumers ignore unknown fields
      });
    }
    return signals;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════
// profileFromTape — convenience: recorded tape → profile (tape-replay REUSED).
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {string|object[]} tapePathOrLines  anything loadTape accepts
 * @param {{t0:number, t1:number, binSize?:number, valuePct?:number}} opts  t0/t1 in tape ms
 * @returns profile | null (disarmed / bad window)
 */
export function profileFromTape(tapePathOrLines, { t0, t1, binSize = 0.25, valuePct = 0.70 } = {}) {
  if (!armed()) return null;
  try {
    if (!isNum(t0) || !isNum(t1) || t1 < t0) return null;
    const tape = loadTape(tapePathOrLines); // REUSED — zero re-parsing here
    return computeVolumeProfile(tape.tradesBetween(t0, t1), { binSize, valuePct });
  } catch { return null; }
}

export default { computeVolumeProfile, computeCVD, computeFootprintBars, computeValueArea, amtSignals, profileFromTape };

// ── CLI smoke: node footprint-amt.mjs --smoke ────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--smoke')) {
  console.log(`armed=${armed()} flag=${FLAG_PATH()}`);
  const trades = [
    { ts: 1, price: 100, qty: 30, aggressorSide: 'buy' },
    { ts: 2, price: 101, qty: 20, aggressorSide: 'sell' },
    { ts: 3, price: 102, qty: 50, aggressorSide: 'buy' },
    { ts: 4, price: 103, qty: 10, aggressorSide: 'sell' },
  ];
  console.log(JSON.stringify(computeVolumeProfile(trades, { binSize: 1 }), null, 2));
}
