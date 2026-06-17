#!/usr/bin/env node
// @capability: strategies-meanrev
// @serves: mean reversion trading strategies | rsi bollinger stochastic cci williams zscore signals | strategy family
// @exports: computeSignals
//
// @does: Family of 12 distinct MEAN-REVERSION strategies. Each turns OHLCV bars
//        into a directional Signal betting that an extreme reverts to the mean
//        (oversold/below-band → LONG expecting a bounce up; overbought/above-band
//        → SHORT expecting a fade down). Strategies reuse the verified BUILTINS
//        (sma, ema, rsi, macd, bollinger, atr, stochastic, vwap) and the
//        indicator-registry TI long-tail (cci, williamsr, mfi) — no math is
//        reinvented. Pure ESM, deterministic, no network, no Math.random.
//
// @use: import { computeSignals } from this module; pass canonical
//        {timestamp,open,high,low,close,volume} bars (unix-seconds) and a market
//        string. Returns an array of Signal objects matching the shared contract:
//
//          { factorId, value, side, confidence, ts, archetype }
//
//        - factorId  : `<strategyId>-${market}` (e.g. `rsi-meanrev-BTC-USD`)
//        - value     : the underlying reading (rsi, z-score, %B, etc.) at ts
//        - side      : 'long' or 'short' (flat/neutral signals are OMITTED)
//        - confidence: (0.5 .. 0.95]  — grows with distance from the mean
//        - ts        : last bar timestamp (unix-seconds)
//        - archetype : always 'meanrev' (lets downstream circuit/portfolio code
//                      group families without parsing the id)
//
//        Behavior: returns [] when bars are missing/short (<30). Every strategy
//        runs inside its own try/catch — a broken indicator in one strategy
//        never affects the others. No strategy throws out of computeSignals.

import {
  sma, ema, rsi, bollinger, atr, stochastic, vwap
} from './indicators.mjs';
import { computeIndicators } from './indicator-registry.mjs';

// ── shared helpers ────────────────────────────────────────────────────────

/** Last non-null value of an aligned indicator series. */
function lastNonNull(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
  return null;
}

/** Clamp a number into [lo, hi]. */
function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/**
 * Linear-map |distance| from 0..maxDist to confidence in [0.5, 0.95].
 *   - distance = 0  → confidence = 0.5 (minimum meaningful)
 *   - distance >= maxDist → confidence = 0.95 (cap)
 * Returns 0 when distance is non-finite or maxDist <= 0.
 */
function distanceConfidence(distance, maxDist) {
  if (!Number.isFinite(distance) || !Number.isFinite(maxDist) || maxDist <= 0) return 0;
  const norm = Math.min(1, Math.abs(distance) / maxDist);
  return clamp(0.5 + 0.45 * norm, 0.5, 0.95);
}

/** Build a Signal or null. Returns null on any non-finite field. */
function mkSignal({ strategyId, market, value, side, confidence, ts }) {
  if (side !== 'long' && side !== 'short') return null;
  if (!Number.isFinite(value) || !Number.isFinite(confidence) || !Number.isFinite(ts)) return null;
  if (confidence <= 0 || confidence > 0.95) return null;
  return {
    factorId: `${strategyId}-${market}`,
    value,
    side,
    confidence,
    ts,
    archetype: 'meanrev'
  };
}

// ── 1. rsi-meanrev (moderate threshold 35/65) ─────────────────────────────
function rsiMeanRevStrategy(bars, market) {
  const closes = bars.map((b) => b.close);
  const series = rsi(closes, 14);
  const v = lastNonNull(series);
  if (v == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  // distance from neutral 50, mapped over a 15-point band → max distance ~ 20
  const dist = v - 50;                       // negative when oversold → long
  const conf = distanceConfidence(dist, 15); // |15| reaches 0.95
  if (v < 35)  return [mkSignal({ strategyId: 'rsi-meanrev', market, value: v, side: 'long', confidence: conf, ts })].filter(Boolean);
  if (v > 65)  return [mkSignal({ strategyId: 'rsi-meanrev', market, value: v, side: 'short', confidence: conf, ts })].filter(Boolean);
  return [];
}

// ── 2. rsi-extreme (stronger threshold 20/80) ─────────────────────────────
function rsiExtremeStrategy(bars, market) {
  const closes = bars.map((b) => b.close);
  const series = rsi(closes, 14);
  const v = lastNonNull(series);
  if (v == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  const dist = v - 50;
  // bigger band (25) so confidence builds slowly — extremes are rarer & worth more
  const conf = distanceConfidence(dist, 25);
  if (v < 20) return [mkSignal({ strategyId: 'rsi-extreme', market, value: v, side: 'long', confidence: conf, ts })].filter(Boolean);
  if (v > 80) return [mkSignal({ strategyId: 'rsi-extreme', market, value: v, side: 'short', confidence: conf, ts })].filter(Boolean);
  return [];
}

// ── 3. bollinger-meanrev (close vs upper/lower band) ──────────────────────
function bollingerMeanRevStrategy(bars, market) {
  const closes = bars.map((b) => b.close);
  const bb = bollinger(closes, 20, 2);
  const close = closes[closes.length - 1];
  const upper = lastNonNull(bb.upper);
  const lower = lastNonNull(bb.lower);
  const middle = lastNonNull(bb.middle);
  if (!Number.isFinite(close) || upper == null || lower == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  const width = upper - lower;
  if (!(width > 0)) return [];                                // degenerate bands → skip
  if (close < lower) {
    const dist = (lower - close) / Math.max(Math.abs(middle) || 1, 1e-9);
    return [mkSignal({ strategyId: 'bollinger-meanrev', market, value: dist, side: 'long', confidence: distanceConfidence(dist, 0.05), ts })].filter(Boolean);
  }
  if (close > upper) {
    const dist = (close - upper) / Math.max(Math.abs(middle) || 1, 1e-9);
    return [mkSignal({ strategyId: 'bollinger-meanrev', market, value: dist, side: 'short', confidence: distanceConfidence(dist, 0.05), ts })].filter(Boolean);
  }
  return [];
}

// ── 4. bollinger-pctb (%B = (close-lower)/(upper-lower)) ──────────────────
function bollingerPctBStrategy(bars, market) {
  const closes = bars.map((b) => b.close);
  const bb = bollinger(closes, 20, 2);
  const close = closes[closes.length - 1];
  const upper = lastNonNull(bb.upper);
  const lower = lastNonNull(bb.lower);
  if (!Number.isFinite(close) || upper == null || lower == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  const width = upper - lower;
  if (!(width > 0)) return [];
  const pctB = (close - lower) / width;             // 0 = at lower, 1 = at upper
  if (pctB < 0) {
    return [mkSignal({ strategyId: 'bollinger-pctb', market, value: pctB, side: 'long', confidence: distanceConfidence(-pctB, 0.5), ts })].filter(Boolean);
  }
  if (pctB > 1) {
    return [mkSignal({ strategyId: 'bollinger-pctb', market, value: pctB, side: 'short', confidence: distanceConfidence(pctB - 1, 0.5), ts })].filter(Boolean);
  }
  return [];
}

// ── 5. stochastic-meanrev (%K < 20 → long, > 80 → short) ─────────────────
function stochasticMeanRevStrategy(bars, market) {
  const st = stochastic(bars, 14, 3);
  const k = lastNonNull(st.k);
  if (k == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  const dist = k - 50;
  const conf = distanceConfidence(dist, 30);        // 30-pt range to reach 0.95
  if (k < 20) return [mkSignal({ strategyId: 'stochastic-meanrev', market, value: k, side: 'long', confidence: conf, ts })].filter(Boolean);
  if (k > 80) return [mkSignal({ strategyId: 'stochastic-meanrev', market, value: k, side: 'short', confidence: conf, ts })].filter(Boolean);
  return [];
}

// ── 6. williamsr-meanrev (Williams %R < -80 → long, > -20 → short) ───────
function williamsRMeanRevStrategy(bars, market) {
  // use the registry (TI long-tail) so the long-tail path is exercised
  const reg = computeIndicators(bars, ['williamsr']);
  const series = reg && reg.williamsr;
  const w = lastNonNull(series);
  if (w == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  // Williams %R sits in [-100, 0]; -50 is the midpoint
  const dist = w - (-50);
  const conf = distanceConfidence(dist, 30);
  if (w < -80) return [mkSignal({ strategyId: 'williamsr-meanrev', market, value: w, side: 'long', confidence: conf, ts })].filter(Boolean);
  if (w > -20) return [mkSignal({ strategyId: 'williamsr-meanrev', market, value: w, side: 'short', confidence: conf, ts })].filter(Boolean);
  return [];
}

// ── 7. cci-meanrev (CCI(20) < -100 → long, > 100 → short) ────────────────
function cciMeanRevStrategy(bars, market) {
  const reg = computeIndicators(bars, ['cci']);
  const series = reg && reg.cci;
  const c = lastNonNull(series);
  if (c == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  // CCI is unbounded in principle; map distance from 0 over ±150 to confidence
  const conf = distanceConfidence(c, 150);
  if (c < -100) return [mkSignal({ strategyId: 'cci-meanrev', market, value: c, side: 'long', confidence: conf, ts })].filter(Boolean);
  if (c > 100)  return [mkSignal({ strategyId: 'cci-meanrev', market, value: c, side: 'short', confidence: conf, ts })].filter(Boolean);
  return [];
}

// ── 8. zscore-meanrev (z = (close - SMA20) / st_dev) ─────────────────────
function zscoreMeanRevStrategy(bars, market) {
  const closes = bars.map((b) => b.close);
  const smaSeries = sma(closes, 20);
  const mean = lastNonNull(smaSeries);
  if (mean == null) return [];
  const n = closes.length;
  // recompute population stddev over the last 20 closes (same window as SMA)
  const window = closes.slice(n - 20);
  let sq = 0;
  for (let i = 0; i < window.length; i++) {
    const d = window[i] - mean;
    sq += d * d;
  }
  const sd = Math.sqrt(sq / window.length);
  if (!Number.isFinite(sd) || sd <= 0) return [];           // guard divide-by-zero / flat
  const close = closes[n - 1];
  const z = (close - mean) / sd;
  const ts = bars[n - 1].timestamp;
  if (z < -2) return [mkSignal({ strategyId: 'zscore-meanrev', market, value: z, side: 'long', confidence: distanceConfidence(-z, 2), ts })].filter(Boolean);
  if (z > 2)  return [mkSignal({ strategyId: 'zscore-meanrev', market, value: z, side: 'short', confidence: distanceConfidence(z, 2), ts })].filter(Boolean);
  return [];
}

// ── 9. vwap-reversion (close far below/above VWAP) ───────────────────────
function vwapReversionStrategy(bars, market) {
  const v = vwap(bars);
  const vwapVal = lastNonNull(v);
  if (vwapVal == null || !(vwapVal > 0)) return [];
  const close = bars[bars.length - 1].close;
  if (!Number.isFinite(close)) return [];
  // distance as % of VWAP
  const distPct = (close - vwapVal) / vwapVal;
  const ts = bars[bars.length - 1].timestamp;
  if (distPct < -0.01) {                                     // 1% below
    return [mkSignal({ strategyId: 'vwap-reversion', market, value: distPct, side: 'long', confidence: distanceConfidence(-distPct, 0.05), ts })].filter(Boolean);
  }
  if (distPct > 0.01) {                                      // 1% above
    return [mkSignal({ strategyId: 'vwap-reversion', market, value: distPct, side: 'short', confidence: distanceConfidence(distPct, 0.05), ts })].filter(Boolean);
  }
  return [];
}

// ── 10. keltner-reversion (close vs EMA20 ± k·ATR) ───────────────────────
function keltnerReversionStrategy(bars, market) {
  const closes = bars.map((b) => b.close);
  const emaSeries = ema(closes, 20);
  const atrSeries = atr(bars, 14);
  const mid = lastNonNull(emaSeries);
  const a = lastNonNull(atrSeries);
  if (mid == null || a == null || !(a > 0)) return [];
  const k = 1.5;
  const upper = mid + k * a;
  const lower = mid - k * a;
  const close = closes[closes.length - 1];
  const ts = bars[bars.length - 1].timestamp;
  const width = upper - lower;
  if (!(width > 0)) return [];
  if (close < lower) {
    const dist = (lower - close) / Math.max(Math.abs(mid) || 1, 1e-9);
    return [mkSignal({ strategyId: 'keltner-reversion', market, value: dist, side: 'long', confidence: distanceConfidence(dist, 0.05), ts })].filter(Boolean);
  }
  if (close > upper) {
    const dist = (close - upper) / Math.max(Math.abs(mid) || 1, 1e-9);
    return [mkSignal({ strategyId: 'keltner-reversion', market, value: dist, side: 'short', confidence: distanceConfidence(dist, 0.05), ts })].filter(Boolean);
  }
  return [];
}

// ── 11. mfi-meanrev (MFI(14) < 20 → long, > 80 → short) ──────────────────
function mfiMeanRevStrategy(bars, market) {
  const reg = computeIndicators(bars, ['mfi']);
  const series = reg && reg.mfi;
  const m = lastNonNull(series);
  if (m == null) return [];
  const ts = bars[bars.length - 1].timestamp;
  const dist = m - 50;
  const conf = distanceConfidence(dist, 30);
  if (m < 20) return [mkSignal({ strategyId: 'mfi-meanrev', market, value: m, side: 'long', confidence: conf, ts })].filter(Boolean);
  if (m > 80) return [mkSignal({ strategyId: 'mfi-meanrev', market, value: m, side: 'short', confidence: conf, ts })].filter(Boolean);
  return [];
}

// ── 12. sma-deviation (% deviation of close from SMA(20) → revert) ───────
function smaDeviationStrategy(bars, market) {
  const closes = bars.map((b) => b.close);
  const smaSeries = sma(closes, 20);
  const mean = lastNonNull(smaSeries);
  if (mean == null || !(Math.abs(mean) > 0)) return [];
  const close = closes[closes.length - 1];
  if (!Number.isFinite(close)) return [];
  const devPct = (close - mean) / mean;                       // signed
  const ts = bars[bars.length - 1].timestamp;
  if (devPct < -0.02) {
    return [mkSignal({ strategyId: 'sma-deviation', market, value: devPct, side: 'long', confidence: distanceConfidence(-devPct, 0.1), ts })].filter(Boolean);
  }
  if (devPct > 0.02) {
    return [mkSignal({ strategyId: 'sma-deviation', market, value: devPct, side: 'short', confidence: distanceConfidence(devPct, 0.1), ts })].filter(Boolean);
  }
  return [];
}

// ── strategy registry (ordered) ───────────────────────────────────────────
const STRATEGIES = [
  ['rsi-meanrev',         rsiMeanRevStrategy],
  ['rsi-extreme',         rsiExtremeStrategy],
  ['bollinger-meanrev',   bollingerMeanRevStrategy],
  ['bollinger-pctb',      bollingerPctBStrategy],
  ['stochastic-meanrev',  stochasticMeanRevStrategy],
  ['williamsr-meanrev',   williamsRMeanRevStrategy],
  ['cci-meanrev',         cciMeanRevStrategy],
  ['zscore-meanrev',      zscoreMeanRevStrategy],
  ['vwap-reversion',      vwapReversionStrategy],
  ['keltner-reversion',   keltnerReversionStrategy],
  ['mfi-meanrev',         mfiMeanRevStrategy],
  ['sma-deviation',       smaDeviationStrategy]
];

// ── public api ────────────────────────────────────────────────────────────
/**
 * computeSignals(bars, market) — run every mean-reversion strategy and return
 * the union of non-flat signals. Each strategy is isolated by try/catch so a
 * broken indicator never aborts the whole call. Returns [] for short/empty
 * bars.
 *
 * @param {Array} bars
 * @param {string} market
 * @returns {Array<{factorId, value, side, confidence, ts, archetype}>}
 */
export function computeSignals(bars, market) {
  const out = [];
  if (!Array.isArray(bars) || bars.length < 30) return out;
  if (typeof market !== 'string' || market.length === 0) return out;
  for (const [id, fn] of STRATEGIES) {
    try {
      const sigs = fn(bars, market) || [];
      for (const s of sigs) {
        if (s && s.factorId === `${id}-${market}`) out.push(s);
      }
    } catch (_e) {
      // swallow — a broken strategy must not block siblings
    }
  }
  return out;
}

// ── test main-guard ───────────────────────────────────────────────────────
import { pathToFileURL as _ptf } from 'node:url';
import { resolve as _resolve } from 'node:path';
const _main = (() => {
  try {
    if (typeof process === 'undefined' || !Array.isArray(process.argv)) return false;
    if (!process.argv[1]) return false;
    if (!process.argv.includes('--test')) return false;
    const here = _ptf(_resolve(process.argv[1])).href;
    return import.meta.url === here;
  } catch (_e) { return false; }
})();

if (_main) {
  // Two synth streams — deterministic LCG, no Math.random.
  //   - dumpSeries(): ends deep oversold  → many LONG signals
  //   - spikeSeries(): ends overbought    → many SHORT signals
  function lcg(seed) {
    let s = seed >>> 0;
    return function next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x1_0000_0000;
    };
  }
  function buildBars(n, schedule) {
    const rng = lcg(0xC0FFEE);
    const bars = [];
    let price = 100;
    const t0 = 1_700_000_000;
    for (let i = 0; i < n; i++) {
      const noise = (rng() - 0.5) * 0.3;
      const shock = schedule[i] || 0;
      price = Math.max(1, price + noise + shock);
      const open = price;
      const close = price + (rng() - 0.5) * 0.2;
      const high = Math.max(open, close) + rng() * 0.3;
      const low = Math.min(open, close) - rng() * 0.3;
      const volume = 1000 + Math.floor(rng() * 500);
      bars.push({ timestamp: t0 + i * 60, open, high, low, close, volume });
    }
    return bars;
  }
  // Dump series: sustained down-shocks through the END of the data so the
  // last bar's window is dominated by the decline → deep oversold (longs).
  const dumpSchedule = {};
  // bars 30-39: initial drop establishing oversold territory
  [30, 31, 32, 33, 34, 35, 36, 37, 38, 39].forEach((i, k) => {
    dumpSchedule[i] = [-2, -2, -2, -2, -2, -3, -4, -5, -6, -4][k];
  });
  // bars 50-59: a second wave of drops so the FINAL window is still falling
  [50, 51, 52, 53, 54, 55, 56, 57, 58, 59].forEach((i, k) => {
    dumpSchedule[i] = [-1, -2, -3, -4, -3, -2, -2, -2, -2, -2][k];
  });
  // Spike series: sustained up-shocks at the END so the last bar is overbought.
  const spikeSchedule = {};
  [50, 51, 52, 53, 54, 55, 56, 57, 58, 59].forEach((i, k) => {
    spikeSchedule[i] = [2, 3, 4, 5, 6, 4, 3, 3, 3, 2][k];
  });
  function synthBars() { return buildBars(60, {}); } // unused — kept for back-compat
  const dumpBars = buildBars(60, dumpSchedule);
  const spikeBars = buildBars(60, spikeSchedule);

  const tests = [];
  function test(name, fn) { tests.push({ name, fn }); }

  let pass = 0, fail = 0;
  function check(name, cond, extra) {
    if (cond) { pass++; }
    else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
  }

  test('valid bars produce an array', () => {
    const sigs = computeSignals(dumpBars, 'TEST-USD');
    check('returns array', Array.isArray(sigs));
    check('at least 6 strategies fire on oversold series', sigs.length >= 6, `got ${sigs.length}`);
  });

  test('all signals have valid contract', () => {
    const sigs = computeSignals(dumpBars, 'TEST-USD').concat(computeSignals(spikeBars, 'TEST-USD'));
    const idRe = /^(rsi-meanrev|rsi-extreme|bollinger-meanrev|bollinger-pctb|stochastic-meanrev|williamsr-meanrev|cci-meanrev|zscore-meanrev|vwap-reversion|keltner-reversion|mfi-meanrev|sma-deviation)-TEST-USD$/;
    for (const s of sigs) {
      check(`side ∈ {long, short}: ${s.factorId}`, s.side === 'long' || s.side === 'short');
      check(`confidence ∈ (0, 0.95]: ${s.factorId}`, Number.isFinite(s.confidence) && s.confidence > 0 && s.confidence <= 0.95);
      check(`finite value: ${s.factorId}`, Number.isFinite(s.value));
      check(`factorId pattern: ${s.factorId}`, typeof s.factorId === 'string' && idRe.test(s.factorId));
      check(`archetype='meanrev': ${s.factorId}`, s.archetype === 'meanrev');
      check(`ts finite: ${s.factorId}`, Number.isFinite(s.ts));
    }
    check('no NaN values', !sigs.some((s) => Number.isNaN(s.value) || Number.isNaN(s.confidence)));
  });

  test('empty/short bars return []', () => {
    check('null', Array.isArray(computeSignals(null, 'X')));
    check('empty', computeSignals([], 'X').length === 0);
    check('too short', computeSignals(buildBars(10, {}), 'X').length === 0);
  });

  test('flat bars do not produce divide-by-zero explosions', () => {
    // all bars identical → stddev=0, BB width=0, Keltner width=0, VWAP drift=0
    const flat = buildBars(60, {}).map((b) => ({ ...b, open: 100, high: 100, low: 100, close: 100, volume: 1000 }));
    const sigs = computeSignals(flat, 'FLAT-USD');
    check('returns array', Array.isArray(sigs));
    check('no NaN in signals', !sigs.some((s) => Number.isNaN(s.value) || Number.isNaN(s.confidence)));
    // zscore / bollinger / keltner should NOT fire on flat; some (rsi on flat) may
    // be neutral (rsi on no-change = 50 → not <35 nor >65 → no signal)
    check('no signal has NaN value', !sigs.some((s) => !Number.isFinite(s.value)));
  });

  test('NaN bar is handled by indicator layer (caught / null)', () => {
    const bars = buildBars(60, {});
    bars[30] = { timestamp: bars[30].timestamp, open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN };
    let threw = false;
    let sigs = [];
    try { sigs = computeSignals(bars, 'NAN-USD'); } catch (e) { threw = true; }
    check('computeSignals does not throw on NaN bar', threw === false);
    check('returns array on NaN bar', Array.isArray(sigs));
    check('no NaN in any returned signal', !sigs.some((s) => Number.isNaN(s.value) || Number.isNaN(s.confidence)));
  });

  test('BOTH sides fire across the two synthetic reversion cycles', () => {
    const longs = computeSignals(dumpBars, 'TEST-USD');
    const shorts = computeSignals(spikeBars, 'TEST-USD');
    check('at least one long signal on dump series', longs.some((s) => s.side === 'long'));
    check('at least one short signal on spike series', shorts.some((s) => s.side === 'short'));
    check('longs are 100% long side', longs.every((s) => s.side === 'long'));
    check('shorts are 100% short side', shorts.every((s) => s.side === 'short'));
  });

  test('a broken indicator input (short bars beyond minimum) does not throw', () => {
    const tiny = buildBars(35, {});
    const sigs = computeSignals(tiny, 'TINY-USD');
    check('returns array', Array.isArray(sigs));
    check('no NaN in any signal', !sigs.some((s) => Number.isNaN(s.value) || Number.isNaN(s.confidence)));
  });

  // run
  for (const t of tests) {
    process.stdout.write(`▶ ${t.name}\n`);
    t.fn();
  }
  process.stdout.write(`strategies-meanrev --test: ${pass} pass, ${fail} fail\n`);
  if (fail > 0) process.exit(1);
}
