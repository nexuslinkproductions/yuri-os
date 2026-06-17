#!/usr/bin/env node
// @capability: indicators-reference
// @serves: indicators | naive reference | differential oracle | cross-check | textbook | Wilder | SMA-seeded EMA
// @does: INDEPENDENT NAIVE REFERENCE implementation of the 8 core technical indicators (sma, ema, rsi, macd, bollinger, atr, stochastic, vwap). Written the most textbook-literal way possible (explicit loops, SMA-seeded EMA, Wilder's recursive smoothing, population stddev for Bollinger) so that any bug in the production `indicators.mjs` (authored by a separate lane) shows up as a diff when the two are compared bar-for-bar on identical inputs. Correctness over speed. NOT for production hot paths.
// @use: import { sma, ema, rsi, macd, bollinger, atr, stochastic, vwap } from this module; pass identical OHLCV inputs to both this and production `indicators.mjs`; assert.deepEqual for arrays. Reach here only when validating the production indicator module — never for live factor computation.
// @exports: sma, ema, rsi, macd, bollinger, atr, stochastic, vwap
//
// =============================================================================
// INDEPENDENT NAIVE REFERENCE — differential oracle for indicators.mjs,
// not for production hot paths.
//
// This file is DELIBERATELY NAIVE. Every indicator is written the most
// textbook-literal way: explicit loops, no clever smoothing shortcuts, no
// vectorization, no caching. The point is that bugs in the optimized
// production module will show up as a diff when the two are compared.
//
// Signatures MUST match the production `indicators.mjs` so a test can
// diff them bar-for-bar. If you change a signature here, you are breaking
// the oracle contract.
// =============================================================================

// --- local helpers (textbook, no deps) -------------------------------------

/**
 * True if x is a finite number (not NaN, not Infinity, not null, not undefined).
 */
function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Probe a flat numeric series. Distinguishes three cases the caller must
 * handle differently:
 *   - { length: 0,            ok: true  }  — input is not an array (return [])
 *   - { length: values.length, ok: false } — array contains a non-finite
 *                                            element (return nullArray(length))
 *   - { length: values.length, ok: true  }  — all-finite array, proceed
 * Without the ok flag, callers can't tell "return empty" from "return all-null
 * of input length" — and the second case is the contract: NaN/short-safe means
 * aligned, all-null, never NaN.
 */
function probeSeries(values) {
  if (!Array.isArray(values)) return { length: 0, ok: true };
  const n = values.length;
  for (let i = 0; i < n; i++) {
    if (!isFiniteNumber(values[i])) return { length: n, ok: false };
  }
  return { length: n, ok: true };
}

/**
 * Probe an OHLCV bar series. Same three-case contract as probeSeries.
 * Each bar must be {open, high, low, close, volume} with all four price/
 * volume fields finite. (Timestamp is not checked here — the production
 * module owns its own timestamp contract; the oracle only needs the
 * price/volume fields finite to compute the indicators.)
 */
function probeBars(bars) {
  if (!Array.isArray(bars)) return { length: 0, ok: true };
  const n = bars.length;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (!b || typeof b !== 'object') return { length: n, ok: false };
    if (!isFiniteNumber(b.open)) return { length: n, ok: false };
    if (!isFiniteNumber(b.high)) return { length: n, ok: false };
    if (!isFiniteNumber(b.low)) return { length: n, ok: false };
    if (!isFiniteNumber(b.close)) return { length: n, ok: false };
    if (!isFiniteNumber(b.volume)) return { length: n, ok: false };
  }
  return { length: n, ok: true };
}

/**
 * Allocate an array of length n filled with null.
 */
function nullArray(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  return out;
}

// --- 1. SMA (simple moving average) -----------------------------------------

/**
 * Simple Moving Average. null for indices where i < period - 1.
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function sma(values, period) {
  const probe = probeSeries(values);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period > n) return out;
  // Sliding sum (textbook-literal: subtract left, add right).
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

// --- 2. EMA (exponential moving average, SMA-seeded, recursive) ------------

/**
 * EMA the textbook recursive way, SMA-seeded:
 *   out[period-1] = SMA(values[0..period-1])
 *   out[i]        = (values[i] - out[i-1]) * k + out[i-1]   where k = 2/(period+1)
 * null for indices where i < period - 1.
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function ema(values, period) {
  const probe = probeSeries(values);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period > n) return out;
  const k = 2 / (period + 1);
  // SMA seed at index period - 1.
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  // Recursive step.
  for (let i = period; i < n; i++) {
    prev = (values[i] - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

// --- 3. RSI (Wilder's, written the slow explicit way) ----------------------

/**
 * Relative Strength Index, Wilder's smoothing:
 *   change[i] = values[i] - values[i-1]
 *   gain[i]   = max(change[i], 0)
 *   loss[i]   = max(-change[i], 0)
 *   firstAvg at i=period : arithmetic mean of first `period` changes
 *   thereafter: avgGain = (avgGainPrev*(period-1) + gain)/period
 *               avgLoss = (avgLossPrev*(period-1) + loss)/period
 *   RSI = 100 - 100 / (1 + avgGain/avgLoss)
 *   if avgLoss == 0 and avgGain == 0  -> 50
 *   if avgLoss == 0 and avgGain  > 0  -> 100
 * null for indices where i < period.
 * @param {number[]} values
 * @param {number} [period=14]
 * @returns {(number|null)[]}
 */
export function rsi(values, period = 14) {
  const probe = probeSeries(values);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period >= n) return out; // need period changes, i.e. n >= period + 1
  // Build the change series, gains, losses.
  const gains = new Array(n);
  const losses = new Array(n);
  for (let i = 1; i < n; i++) {
    const c = values[i] - values[i - 1];
    gains[i] = c > 0 ? c : 0;
    losses[i] = c < 0 ? -c : 0;
  }
  // First averages: arithmetic mean of changes[1..period] inclusive (period changes).
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  // RSI at index `period`.
  if (avgLoss === 0 && avgGain === 0) out[period] = 50;
  else if (avgLoss === 0) out[period] = 100;
  else out[period] = 100 - 100 / (1 + avgGain / avgLoss);
  // Wilder smoothing for subsequent bars.
  for (let i = period + 1; i < n; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    if (avgLoss === 0 && avgGain === 0) out[i] = 50;
    else if (avgLoss === 0) out[i] = 100;
    else out[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// --- 4. MACD ---------------------------------------------------------------

/**
 * MACD with the production-default periods (12, 26, 9), SMA-seeded everywhere.
 * Returns three arrays aligned to input length, null during each line's own
 * warmup. Note: `macd` and `signal` lines start at index slow-1 and
 * slow-1 + signal - 1 respectively; `histogram` starts at slow-1 + signal - 1.
 * @param {number[]} values
 * @param {number} [fast=12]
 * @param {number} [slow=26]
 * @param {number} [signal=9]
 * @returns {{macd:(number|null)[],signal:(number|null)[],histogram:(number|null)[]}}
 */
export function macd(values, fast = 12, slow = 26, signal = 9) {
  // MACD needs a series probe that distinguishes non-array from bad-array.
  const probe = probeSeries(values);
  if (probe.length === 0) return { macd: [], signal: [], histogram: [] };
  if (!probe.ok) {
    return {
      macd: nullArray(probe.length),
      signal: nullArray(probe.length),
      histogram: nullArray(probe.length),
    };
  }
  const n = probe.length;
  if (!isFiniteNumber(fast) || !isFiniteNumber(slow) || !isFiniteNumber(signal)) {
    return { macd: nullArray(n), signal: nullArray(n), histogram: nullArray(n) };
  }
  if (fast < 1 || slow < 1 || signal < 1 || slow < fast) {
    return { macd: nullArray(n), signal: nullArray(n), histogram: nullArray(n) };
  }
  // Compute EMAs on the full series (nulls in the warmup section).
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  // MACD line = fastEma - slowEma; both null during their own warmup, so
  // MACD is null until both lines are alive, i.e. index slow-1.
  const macdLine = nullArray(n);
  for (let i = slow - 1; i < n; i++) {
    macdLine[i] = fastEma[i] - slowEma[i];
  }
  // Signal = EMA(macdLine, signal) with SMA seed. But macdLine is sparse-null
  // before slow-1. We construct a dense MACD numeric series (the values
  // starting at slow-1) and EMA-seed it.
  const denseStart = slow - 1;
  const denseLen = n - denseStart;
  if (denseLen < signal) {
    // Not enough MACD values to seed a signal EMA.
    return { macd: macdLine, signal: nullArray(n), histogram: nullArray(n) };
  }
  const denseMacd = new Array(denseLen);
  for (let i = 0; i < denseLen; i++) denseMacd[i] = macdLine[denseStart + i];
  // SMA-seed the signal EMA on the first `signal` MACD values.
  let sumSig = 0;
  for (let i = 0; i < signal; i++) sumSig += denseMacd[i];
  const kSig = 2 / (signal + 1);
  let prevSig = sumSig / signal;
  const signalLine = nullArray(n);
  // Signal exists starting at denseStart + signal - 1.
  const sigStart = denseStart + signal - 1;
  signalLine[sigStart] = prevSig;
  for (let i = signal; i < denseLen; i++) {
    prevSig = (denseMacd[i] - prevSig) * kSig + prevSig;
    signalLine[denseStart + i] = prevSig;
  }
  // Histogram = macd - signal. Null until both exist.
  const histogram = nullArray(n);
  for (let i = sigStart; i < n; i++) histogram[i] = macdLine[i] - signalLine[i];
  return { macd: macdLine, signal: signalLine, histogram };
}

// --- 5. Bollinger Bands ----------------------------------------------------

/**
 * Bollinger Bands, POPULATION stddev (divide by N, not N-1) — matches the
 * spec and the production module's contract.
 *   middle = SMA(values, period)
 *   stddev = sqrt( sum((x - mean)^2) / N )
 *   upper  = middle + mult * stddev
 *   lower  = middle - mult * stddev
 * null for indices where i < period - 1.
 * @param {number[]} values
 * @param {number} [period=20]
 * @param {number} [mult=2]
 * @returns {{middle:(number|null)[],upper:(number|null)[],lower:(number|null)[]}}
 */
export function bollinger(values, period = 20, mult = 2) {
  const probe = probeSeries(values);
  if (probe.length === 0) return { middle: [], upper: [], lower: [] };
  if (!probe.ok) {
    return {
      middle: nullArray(probe.length),
      upper: nullArray(probe.length),
      lower: nullArray(probe.length),
    };
  }
  const n = probe.length;
  if (!isFiniteNumber(period) || !isFiniteNumber(mult) || period < 1) {
    return { middle: nullArray(n), upper: nullArray(n), lower: nullArray(n) };
  }
  const middle = nullArray(n);
  const upper = nullArray(n);
  const lower = nullArray(n);
  if (period > n) return { middle, upper, lower };
  // Recompute mean + sum-of-squares per window (textbook-literal, no shortcuts).
  for (let i = period - 1; i < n; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    const mean = s / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mean;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / period);
    middle[i] = mean;
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

// --- 6. ATR (Wilder's, explicit true-range loop) ---------------------------

/**
 * Average True Range, Wilder's smoothing.
 *   tr[0] = high[0] - low[0]
 *   tr[i] = max( high[i] - low[i],
 *                |high[i] - close[i-1]|,
 *                |low[i]  - close[i-1]| )
 *   first ATR at i = period: arithmetic mean of tr[0..period-1]   (i.e. first
 *                     `period` true ranges, NOT period-1).
 *   thereafter: atr[i] = (atr[i-1] * (period-1) + tr[i]) / period
 * null for indices where i < period.
 * @param {Array<{high:number,low:number,close:number}>} bars
 * @param {number} [period=14]
 * @returns {(number|null)[]}
 */
export function atr(bars, period = 14) {
  const probe = probeBars(bars);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period > n) return out; // need at least `period` true ranges
  // Build true-range series.
  const tr = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i === 0) {
      tr[i] = b.high - b.low;
    } else {
      const prevClose = bars[i - 1].close;
      const hl = b.high - b.low;
      const hpc = Math.abs(b.high - prevClose);
      const lpc = Math.abs(b.low - prevClose);
      tr[i] = hl > hpc ? hl : hpc;
      if (lpc > tr[i]) tr[i] = lpc;
    }
  }
  // First ATR: mean of first `period` TRs (indices 0..period-1) at output
  // index `period`.
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

// --- 7. Stochastic (slow stochastic, %K and %D) ----------------------------

/**
 * Slow stochastic: %K and SMA(%K, dPeriod).
 *   %K[i] = (close[i] - lowestLow(i, kPeriod)) / (highestHigh(i, kPeriod) - lowestLow(i, kPeriod)) * 100
 *     where lowestLow(i, kPeriod)    = min(low[i-kPeriod+1..i])
 *           highestHigh(i, kPeriod)  = max(high[i-kPeriod+1..i])
 *   %D[i] = SMA(%K, dPeriod)[i]
 * %K null for i < kPeriod - 1. %D null for i < kPeriod - 1 + dPeriod - 1.
 * If highestHigh == lowestLow (window is flat), %K = 0 by convention.
 * @param {Array<{high:number,low:number,close:number}>} bars
 * @param {number} [kPeriod=14]
 * @param {number} [dPeriod=3]
 * @returns {{k:(number|null)[],d:(number|null)[]}}
 */
export function stochastic(bars, kPeriod = 14, dPeriod = 3) {
  const probe = probeBars(bars);
  if (probe.length === 0) return { k: [], d: [] };
  if (!probe.ok) {
    return { k: nullArray(probe.length), d: nullArray(probe.length) };
  }
  const n = probe.length;
  if (!isFiniteNumber(kPeriod) || !isFiniteNumber(dPeriod) || kPeriod < 1 || dPeriod < 1) {
    return { k: nullArray(n), d: nullArray(n) };
  }
  const k = nullArray(n);
  const d = nullArray(n);
  if (kPeriod > n) return { k, d };
  // %K (textbook-literal: recompute min/max per bar).
  for (let i = kPeriod - 1; i < n; i++) {
    let lo = bars[i - kPeriod + 1].low;
    let hi = bars[i - kPeriod + 1].high;
    for (let j = i - kPeriod + 2; j <= i; j++) {
      if (bars[j].low < lo) lo = bars[j].low;
      if (bars[j].high > hi) hi = bars[j].high;
    }
    const range = hi - lo;
    k[i] = range === 0 ? 0 : ((bars[i].close - lo) / range) * 100;
  }
  // %D = SMA(%K, dPeriod) — null until kPeriod-1 + dPeriod-1.
  if (dPeriod > n) return { k, d };
  const dStart = (kPeriod - 1) + (dPeriod - 1);
  let sum = 0;
  for (let i = dPeriod - 1; i >= 0; i--) sum += k[(dStart - (dPeriod - 1)) + i] ?? 0;
  // Recompute cleanly: SMA over the last dPeriod k values ending at dStart.
  sum = 0;
  for (let i = dStart - dPeriod + 1; i <= dStart; i++) sum += k[i];
  d[dStart] = sum / dPeriod;
  for (let i = dStart + 1; i < n; i++) {
    sum += k[i] - k[i - dPeriod];
    d[i] = sum / dPeriod;
  }
  return { k, d };
}

// --- 8. VWAP (cumulative, typical price (h+l+c)/3) -------------------------

/**
 * Volume-Weighted Average Price, cumulative, no rolling window reset.
 *   typical[i] = (high[i] + low[i] + close[i]) / 3
 *   vwap[i]    = sum(typical[j] * volume[j], j=0..i) / sum(volume[j], j=0..i)
 * Returns null for any bar where the running cumulative volume is 0
 * (degenerate: would otherwise produce a 0/0).
 * @param {Array<{high:number,low:number,close:number,volume:number}>} bars
 * @returns {(number|null)[]}
 */
export function vwap(bars) {
  const probe = probeBars(bars);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  const out = nullArray(n);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const typical = (b.high + b.low + b.close) / 3;
    cumPV += typical * b.volume;
    cumV += b.volume;
    out[i] = cumV === 0 ? null : cumPV / cumV;
  }
  return out;
}

// --- self-test (main-guarded) ----------------------------------------------

function assertClose(a, b, eps, label) {
  if (a === null && b === null) return true;
  if (a === null || b === null) {
    throw new Error(`assertClose(${label}): one side null a=${a} b=${b}`);
  }
  if (Math.abs(a - b) > eps) {
    throw new Error(`assertClose(${label}): |${a} - ${b}| > ${eps}`);
  }
  return true;
}

function assertEq(a, b, label) {
  if (a !== b) throw new Error(`assertEq(${label}): ${a} !== ${b}`);
  return true;
}

function assertNull(x, label) {
  if (x !== null) throw new Error(`assertNull(${label}): got ${x}`);
  return true;
}

function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const test = (name, fn) => {
    try {
      fn();
      pass++;
    } catch (e) {
      fail++;
      console.error(`  FAIL ${name}: ${e.message}`);
    }
  };

  // --- SMA ---
  test('SMA hand-computed fixture', () => {
    // values 1..10, period 3
    // out[2] = (1+2+3)/3 = 2
    // out[3] = (2+3+4)/3 = 3
    // out[9] = (8+9+10)/3 = 9
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = sma(v, 3);
    assertEq(out.length, 10, 'sma length');
    assertNull(out[0], 'sma[0]');
    assertNull(out[1], 'sma[1]');
    assertClose(out[2], 2, 1e-12, 'sma[2]');
    assertClose(out[3], 3, 1e-12, 'sma[3]');
    assertClose(out[9], 9, 1e-12, 'sma[9]');
  });

  // --- EMA ---
  test('EMA SMA-seeded matches textbook recursion', () => {
    // values 1..10, period 3
    // seed: out[2] = 2
    // k = 2/4 = 0.5
    // out[3] = (4 - 2)*0.5 + 2 = 3
    // out[4] = (5 - 3)*0.5 + 3 = 4
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = ema(v, 3);
    assertEq(out.length, 10, 'ema length');
    assertNull(out[0], 'ema[0]');
    assertNull(out[1], 'ema[1]');
    assertClose(out[2], 2, 1e-12, 'ema[2] seed');
    assertClose(out[3], 3, 1e-12, 'ema[3]');
    assertClose(out[4], 4, 1e-12, 'ema[4]');
  });

  // --- RSI monotonic fixture (textbook example) ---
  test('RSI Wilder textbook monotonic series', () => {
    // Constant gain of +1 for 15 bars. Wilder period 14.
    // changes: 14 changes, each gain=1, loss=0.
    // firstAvgGain = 1, firstAvgLoss = 0
    // RSI[14] = 100 (avgLoss == 0)
    // thereafter avgGain stays = 1, avgLoss = 0
    // so RSI[i] = 100 for all i >= 14.
    const v = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const out = rsi(v, 14);
    assertEq(out.length, 16, 'rsi length');
    for (let i = 0; i < 14; i++) assertNull(out[i], `rsi[${i}] null`);
    assertClose(out[14], 100, 1e-9, 'rsi[14]');
    assertClose(out[15], 100, 1e-9, 'rsi[15]');
  });

  test('RSI constant-loss series', () => {
    // Constant loss of -1 for 15 bars. avgGain = 0, avgLoss = 1.
    // RSI[14] = 100 - 100/(1 + 0) = 0.
    const v = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    const out = rsi(v, 14);
    for (let i = 0; i < 14; i++) assertNull(out[i], `rsi-loss[${i}] null`);
    assertClose(out[14], 0, 1e-9, 'rsi-loss[14]');
    assertClose(out[15], 0, 1e-9, 'rsi-loss[15]');
  });

  test('RSI flat series -> 50', () => {
    const v = new Array(20).fill(100);
    const out = rsi(v, 14);
    for (let i = 0; i < 14; i++) assertNull(out[i], `rsi-flat[${i}] null`);
    assertClose(out[14], 50, 1e-9, 'rsi-flat[14]');
  });

  // --- MACD ---
  test('MACD length and warmup', () => {
    const v = [];
    for (let i = 0; i < 50; i++) v.push(100 + i * 0.5);
    const { macd: m, signal: s, histogram: h } = macd(v, 12, 26, 9);
    assertEq(m.length, 50, 'macd length');
    assertEq(s.length, 50, 'sig length');
    assertEq(h.length, 50, 'hist length');
    // macd nulls before index slow-1 = 25
    for (let i = 0; i < 25; i++) assertNull(m[i], `m[${i}]`);
    // signal nulls before slow-1 + signal-1 = 33
    for (let i = 0; i < 33; i++) assertNull(s[i], `s[${i}]`);
    // histogram nulls before 33
    for (let i = 0; i < 33; i++) assertNull(h[i], `h[${i}]`);
    // histogram = macd - signal at the first bar both exist
    assertClose(h[33], m[33] - s[33], 1e-9, 'hist[33]');
    // On a linear (constant-slope) series, EMA-fast LEADS EMA-slow by a FIXED
    // offset, so MACD converges to a NONZERO constant (= slope*7 for 12/26),
    // and the signal line (EMA9 of MACD) converges to that SAME constant.
    // The impl-independent invariant is therefore: histogram (macd-signal) -> 0
    // and macd == signal (both finite). (The old "macd -> 0" assertion was WRONG —
    // corrected 2026-06-16; minimax's MACD value was mathematically correct.)
    assertClose(h[49], 0, 1e-6, 'hist[49] -> 0 on linear (macd,signal converge equal)');
    assertClose(m[49], s[49], 1e-6, 'macd[49] == signal[49] on linear');
  });

  // --- Bollinger ---
  test('Bollinger on constant series -> middle=const, upper=lower=const', () => {
    const v = new Array(25).fill(50);
    const { middle, upper, lower } = bollinger(v, 20, 2);
    assertEq(middle.length, 25, 'b length');
    for (let i = 0; i < 19; i++) assertNull(middle[i], `b-mid[${i}]`);
    assertClose(middle[19], 50, 1e-9, 'b-mid[19]');
    assertClose(upper[19], 50, 1e-9, 'b-up[19]');
    assertClose(lower[19], 50, 1e-9, 'b-lo[19]');
  });

  // --- ATR ---
  test('ATR hand-computed on toy bars', () => {
    // bars: h,l,c. tr[0] = h-l. tr[i] = max(h-l, |h-prevC|, |l-prevC|).
    // period 3. first ATR at index 3 = mean of tr[0..2].
    // Use bars where we can hand-compute everything.
    // bar0: h=10, l=8,  c=9    -> tr0 = 2
    // bar1: h=11, l=9,  c=10   -> tr1 = max(2, |11-9|=2, |9-9|=0) = 2
    // bar2: h=12, l=10, c=11   -> tr2 = max(2, |12-10|=2, |10-10|=0) = 2
    // bar3: h=13, l=11, c=12   -> tr3 = max(2, |13-11|=2, |11-11|=0) = 2
    // first ATR at i=3: (2+2+2)/3 = 2
    // ATR[4]: (2*2 + 2)/3 = 2
    const bars = [
      { high: 10, low: 8,  close: 9,  open: 9,  volume: 1, timestamp: 0 },
      { high: 11, low: 9,  close: 10, open: 10, volume: 1, timestamp: 1 },
      { high: 12, low: 10, close: 11, open: 11, volume: 1, timestamp: 2 },
      { high: 13, low: 11, close: 12, open: 12, volume: 1, timestamp: 3 },
      { high: 14, low: 12, close: 13, open: 13, volume: 1, timestamp: 4 },
    ];
    const out = atr(bars, 3);
    assertEq(out.length, 5, 'atr length');
    for (let i = 0; i < 3; i++) assertNull(out[i], `atr[${i}]`);
    assertClose(out[3], 2, 1e-12, 'atr[3]');
    assertClose(out[4], 2, 1e-12, 'atr[4]');
  });

  test('ATR hand-computed with gap up', () => {
    // bar0: h=10, l=8,  c=9    -> tr0 = 2
    // bar1: h=20, l=18, c=19   -> tr1 = max(2, |20-9|=11, |18-9|=9) = 11
    // bar2: h=22, l=20, c=21   -> tr2 = max(2, |22-19|=3, |20-19|=1) = 3
    // bar3: h=23, l=21, c=22   -> tr3 = max(2, |23-21|=2, |21-21|=0) = 2
    // period 3. first ATR at i=3: (2+11+3)/3 = 16/3
    // ATR[4]: ((16/3)*2 + 2)/3 = (32/3 + 2)/3 = (32/3 + 6/3)/3 = (38/3)/3 = 38/9
    const bars = [
      { high: 10, low: 8,  close: 9,  open: 9,  volume: 1, timestamp: 0 },
      { high: 20, low: 18, close: 19, open: 19, volume: 1, timestamp: 1 },
      { high: 22, low: 20, close: 21, open: 21, volume: 1, timestamp: 2 },
      { high: 23, low: 21, close: 22, open: 22, volume: 1, timestamp: 3 },
      { high: 24, low: 22, close: 23, open: 23, volume: 1, timestamp: 4 },
    ];
    const out = atr(bars, 3);
    assertClose(out[3], 16 / 3, 1e-12, 'atr-gap[3]');
    assertClose(out[4], 38 / 9, 1e-12, 'atr-gap[4]');
  });

  // --- Stochastic ---
  test('Stochastic flat window -> 0', () => {
    // All high=low=close, so highestHigh == lowestLow -> %K = 0.
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push({ high: 100, low: 100, close: 100, open: 100, volume: 1, timestamp: i });
    const { k, d } = stochastic(bars, 14, 3);
    for (let i = 0; i < 13; i++) assertNull(k[i], `stoch-k[${i}]`);
    for (let i = 0; i < 15; i++) assertNull(d[i], `stoch-d[${i}]`);
    assertClose(k[13], 0, 1e-12, 'stoch-k[13]');
    assertClose(d[15], 0, 1e-12, 'stoch-d[15]');
  });

  test('Stochastic monotonic up -> 100', () => {
    // close is at top of each window, so %K = 100.
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push({ high: 100 + i, low: 50, close: 100 + i, open: 75, volume: 1, timestamp: i });
    const { k, d } = stochastic(bars, 14, 3);
    for (let i = 13; i < 20; i++) assertClose(k[i], 100, 1e-12, `stoch-up-k[${i}]`);
    // d[15] = mean of k[13..15] = 100
    assertClose(d[15], 100, 1e-12, 'stoch-up-d[15]');
  });

  // --- VWAP ---
  test('VWAP equal-volume equal-typical -> typical price', () => {
    // All bars volume=2, typical=10. vwap should be 10 from index 0.
    const bars = [];
    for (let i = 0; i < 5; i++) bars.push({ high: 11, low: 9, close: 10, open: 10, volume: 2, timestamp: i });
    const out = vwap(bars);
    assertEq(out.length, 5, 'vwap length');
    for (let i = 0; i < 5; i++) assertClose(out[i], 10, 1e-12, `vwap[${i}]`);
  });

  test('VWAP zero-volume -> null', () => {
    const bars = [
      { high: 10, low: 8, close: 9, open: 9, volume: 0, timestamp: 0 },
      { high: 11, low: 9, close: 10, open: 10, volume: 2, timestamp: 1 },
    ];
    const out = vwap(bars);
    assertNull(out[0], 'vwap[0] zero vol');
    // (10*2)/2 = 10
    assertClose(out[1], 10, 1e-12, 'vwap[1]');
  });

  // --- Edge safety ---
  test('Empty input -> empty output for all 8', () => {
    assertEq(sma([], 3).length, 0, 'sma empty');
    assertEq(ema([], 3).length, 0, 'ema empty');
    assertEq(rsi([], 14).length, 0, 'rsi empty');
    const m = macd([], 12, 26, 9);
    assertEq(m.macd.length, 0, 'macd empty');
    const b = bollinger([], 20, 2);
    assertEq(b.middle.length, 0, 'b empty');
    assertEq(atr([], 14).length, 0, 'atr empty');
    const st = stochastic([], 14, 3);
    assertEq(st.k.length, 0, 'stoch empty');
    assertEq(vwap([]).length, 0, 'vwap empty');
  });

  test('Short input / period>length -> all null', () => {
    const v = [1, 2, 3];
    const s = sma(v, 14);
    assertEq(s.length, 3, 'sma short length');
    for (let i = 0; i < 3; i++) assertNull(s[i], `sma-short[${i}]`);
    const e = ema(v, 14);
    for (let i = 0; i < 3; i++) assertNull(e[i], `ema-short[${i}]`);
    const r = rsi(v, 14);
    for (let i = 0; i < 3; i++) assertNull(r[i], `rsi-short[${i}]`);
    const b = bollinger(v, 14, 2);
    for (let i = 0; i < 3; i++) assertNull(b.middle[i], `b-short[${i}]`);
    const bars = [{ high: 1, low: 1, close: 1, open: 1, volume: 1, timestamp: 0 }];
    const a = atr(bars, 14);
    for (let i = 0; i < 1; i++) assertNull(a[i], `atr-short[${i}]`);
    const st = stochastic(bars, 14, 3);
    for (let i = 0; i < 1; i++) assertNull(st.k[i], `stoch-short-k[${i}]`);
  });

  test('NaN in input -> all null (no throw, no NaN out)', () => {
    const v = [1, 2, NaN, 4, 5];
    const s = sma(v, 3);
    for (let i = 0; i < 5; i++) assertNull(s[i], `sma-nan[${i}]`);
    const e = ema(v, 3);
    for (let i = 0; i < 5; i++) assertNull(e[i], `ema-nan[${i}]`);
    const r = rsi(v, 14);
    for (let i = 0; i < 5; i++) assertNull(r[i], `rsi-nan[${i}]`);
    const bars = [
      { high: 1, low: 1, close: 1, open: 1, volume: 1, timestamp: 0 },
      { high: 2, low: 1, close: 2, open: 1, volume: 1, timestamp: 1 },
      { high: 3, low: 2, close: NaN, open: 2, volume: 1, timestamp: 2 },
    ];
    const a = atr(bars, 2);
    for (let i = 0; i < 3; i++) assertNull(a[i], `atr-nan[${i}]`);
    const st = stochastic(bars, 2, 2);
    for (let i = 0; i < 3; i++) assertNull(st.k[i], `stoch-nan[${i}]`);
    const vw = vwap(bars);
    for (let i = 0; i < 3; i++) assertNull(vw[i], `vwap-nan[${i}]`);
  });

  test('All-equal series does not produce NaN', () => {
    const v = new Array(30).fill(7);
    const s = sma(v, 10);
    for (let i = 9; i < 30; i++) assertClose(s[i], 7, 1e-12, `sma-eq[${i}]`);
    const r = rsi(v, 14);
    for (let i = 14; i < 30; i++) assertClose(r[i], 50, 1e-9, `rsi-eq[${i}]`);
    const b = bollinger(v, 20, 2);
    for (let i = 19; i < 30; i++) {
      assertClose(b.middle[i], 7, 1e-12, `b-eq-mid[${i}]`);
      assertClose(b.upper[i], 7, 1e-12, `b-eq-up[${i}]`);
      assertClose(b.lower[i], 7, 1e-12, `b-eq-lo[${i}]`);
    }
    const bars = [];
    for (let i = 0; i < 30; i++) bars.push({ high: 7, low: 7, close: 7, open: 7, volume: 1, timestamp: i });
    const a = atr(bars, 14);
    for (let i = 14; i < 30; i++) assertClose(a[i], 0, 1e-12, `atr-eq[${i}]`);
    const st = stochastic(bars, 14, 3);
    for (let i = 13; i < 30; i++) assertClose(st.k[i], 0, 1e-12, `stoch-eq-k[${i}]`);
  });

  // --- Signature contract: arrays aligned to input length ---
  test('Output length equals input length (aligned)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    assertEq(sma(v, 5).length, 15, 'sma aligned');
    assertEq(ema(v, 5).length, 15, 'ema aligned');
    assertEq(rsi(v, 5).length, 15, 'rsi aligned');
    const m = macd(v, 5, 10, 4);
    assertEq(m.macd.length, 15, 'macd aligned');
    assertEq(m.signal.length, 15, 'macd.sig aligned');
    assertEq(m.histogram.length, 15, 'macd.hist aligned');
    const b = bollinger(v, 5, 2);
    assertEq(b.middle.length, 15, 'b.mid aligned');
    assertEq(b.upper.length, 15, 'b.up aligned');
    assertEq(b.lower.length, 15, 'b.lo aligned');
    const bars = [];
    for (let i = 0; i < 15; i++) bars.push({ high: 10 + i, low: 9 + i, close: 9.5 + i, open: 9.5 + i, volume: 1, timestamp: i });
    assertEq(atr(bars, 5).length, 15, 'atr aligned');
    const st = stochastic(bars, 5, 3);
    assertEq(st.k.length, 15, 'stoch.k aligned');
    assertEq(st.d.length, 15, 'stoch.d aligned');
    assertEq(vwap(bars).length, 15, 'vwap aligned');
  });

  return { pass, fail };
}

async function main() {
  if (process.argv[2] !== '--test') {
    console.error('usage: indicators-reference.mjs --test');
    process.exit(2);
  }
  const { pass, fail } = runSelfTest();
  console.log(`indicators-reference --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

// Main guard: only run self-test when this file is the entrypoint, not on import.
const _main = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (_main) {
  main().catch((e) => {
    console.error(`indicators-reference --test: fatal ${e.stack || e.message}`);
    process.exit(1);
  });
}
