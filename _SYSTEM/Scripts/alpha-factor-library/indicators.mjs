#!/usr/bin/env node
// @capability: technical-indicators
// @serves: RSI MACD bollinger ATR stochastic VWAP EMA SMA from candles | technical analysis | indicator series | momentum trend volatility volume signals
// @does: Production technical-indicator module for the YURI trading engine. Eight core indicators (sma, ema, rsi, macd, bollinger, atr, stochastic, vwap) computed from canonical OHLCV bars, plus computeAll() for a latest-values summary. Pure ESM, deterministic, no deps. Arrays are aligned to input length with null during warmup; never throws, never emits NaN (null instead). Signatures + numeric conventions match indicators-reference.mjs (independent oracle) so a differential test validates them bar-for-bar. These 8 are the verified hot-path BUILTINS behind indicator-registry.mjs (the registry adds dozens more via the technicalindicators lib).
// @use: import { sma, ema, rsi, macd, bollinger, atr, stochastic, vwap, computeAll } from this module; feed canonical {timestamp,open,high,low,close,volume} bars (closes for the price-only ones). Prefer the registry (indicator-registry.mjs) for the full catalog; reach here directly only for the core builtins.
// @exports: sma, ema, rsi, macd, bollinger, atr, stochastic, vwap, computeAll
//
// CONVENTIONS (locked against indicators-reference.mjs):
//   EMA: SMA-seeded at index period-1, k=2/(period+1).
//   RSI: Wilder's; first avg = mean of first `period` changes; RSI at index `period`;
//        avgLoss==0&&avgGain==0 -> 50; avgLoss==0 -> 100.
//   MACD: fastEMA-slowEMA from slow-1; signal = SMA-seeded EMA of the dense MACD;
//         histogram from (slow-1)+(signal-1).
//   Bollinger: POPULATION stddev (divide by N).
//   ATR: Wilder's; tr[0]=high-low; first ATR = mean of tr[0..period-1] at output index `period`.
//   Stochastic: %K from kPeriod-1 (flat window -> 0); %D = SMA(%K,dPeriod).
//   VWAP: cumulative, typical price (h+l+c)/3; null while cumulative volume is 0.

import { pathToFileURL } from 'node:url';

// ── helpers ─────────────────────────────────────────────────────────────────
function isFiniteNumber(x) { return typeof x === 'number' && Number.isFinite(x); }
function nullArray(n) { return new Array(n).fill(null); }

/** Probe a flat numeric series → {length, ok}. ok=false means a non-finite element. */
function probeSeries(values) {
  if (!Array.isArray(values)) return { length: 0, ok: true };
  const n = values.length;
  for (let i = 0; i < n; i++) if (!isFiniteNumber(values[i])) return { length: n, ok: false };
  return { length: n, ok: true };
}

/** Probe an OHLCV bar series; checks high/low/close (+volume if present) finite. */
function probeBars(bars, needVolume = false) {
  if (!Array.isArray(bars)) return { length: 0, ok: true };
  const n = bars.length;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (!b || !isFiniteNumber(b.high) || !isFiniteNumber(b.low) || !isFiniteNumber(b.close)) return { length: n, ok: false };
    if (needVolume && !isFiniteNumber(b.volume)) return { length: n, ok: false };
  }
  return { length: n, ok: true };
}

/** last non-null value of an array (or null). */
function lastNonNull(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

// ── 1. SMA ──────────────────────────────────────────────────────────────────
export function sma(values, period) {
  const probe = probeSeries(values);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period > n) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) { sum += values[i] - values[i - period]; out[i] = sum / period; }
  return out;
}

// ── 2. EMA (SMA-seeded) ──────────────────────────────────────────────────────
export function ema(values, period) {
  const probe = probeSeries(values);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period > n) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) { prev = (values[i] - prev) * k + prev; out[i] = prev; }
  return out;
}

// ── 3. RSI (Wilder's) ────────────────────────────────────────────────────────
export function rsi(values, period = 14) {
  const probe = probeSeries(values);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period >= n) return out;
  const gains = new Array(n), losses = new Array(n);
  for (let i = 1; i < n; i++) {
    const c = values[i] - values[i - 1];
    gains[i] = c > 0 ? c : 0;
    losses[i] = c < 0 ? -c : 0;
  }
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
  avgGain /= period; avgLoss /= period;
  const rsiAt = (g, l) => (l === 0 && g === 0) ? 50 : (l === 0) ? 100 : 100 - 100 / (1 + g / l);
  out[period] = rsiAt(avgGain, avgLoss);
  for (let i = period + 1; i < n; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i] = rsiAt(avgGain, avgLoss);
  }
  return out;
}

// ── 4. MACD ──────────────────────────────────────────────────────────────────
export function macd(values, fast = 12, slow = 26, signal = 9) {
  const probe = probeSeries(values);
  if (probe.length === 0) return { macd: [], signal: [], histogram: [] };
  const n = probe.length;
  const allNull = () => ({ macd: nullArray(n), signal: nullArray(n), histogram: nullArray(n) });
  if (!probe.ok) return allNull();
  if (!isFiniteNumber(fast) || !isFiniteNumber(slow) || !isFiniteNumber(signal)) return allNull();
  if (fast < 1 || slow < 1 || signal < 1 || slow < fast) return allNull();
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine = nullArray(n);
  for (let i = slow - 1; i < n; i++) macdLine[i] = fastEma[i] - slowEma[i];
  const denseStart = slow - 1;
  const denseLen = n - denseStart;
  if (denseLen < signal) return { macd: macdLine, signal: nullArray(n), histogram: nullArray(n) };
  const denseMacd = new Array(denseLen);
  for (let i = 0; i < denseLen; i++) denseMacd[i] = macdLine[denseStart + i];
  let sumSig = 0;
  for (let i = 0; i < signal; i++) sumSig += denseMacd[i];
  const kSig = 2 / (signal + 1);
  let prevSig = sumSig / signal;
  const signalLine = nullArray(n);
  const sigStart = denseStart + signal - 1;
  signalLine[sigStart] = prevSig;
  for (let i = signal; i < denseLen; i++) { prevSig = (denseMacd[i] - prevSig) * kSig + prevSig; signalLine[denseStart + i] = prevSig; }
  const histogram = nullArray(n);
  for (let i = sigStart; i < n; i++) histogram[i] = macdLine[i] - signalLine[i];
  return { macd: macdLine, signal: signalLine, histogram };
}

// ── 5. Bollinger Bands (population stddev) ────────────────────────────────────
export function bollinger(values, period = 20, mult = 2) {
  const probe = probeSeries(values);
  if (probe.length === 0) return { middle: [], upper: [], lower: [] };
  const n = probe.length;
  const allNull = () => ({ middle: nullArray(n), upper: nullArray(n), lower: nullArray(n) });
  if (!probe.ok) return allNull();
  if (!isFiniteNumber(period) || !isFiniteNumber(mult) || period < 1) return allNull();
  const middle = nullArray(n), upper = nullArray(n), lower = nullArray(n);
  if (period > n) return { middle, upper, lower };
  for (let i = period - 1; i < n; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    const mean = s / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) { const d = values[j] - mean; sq += d * d; }
    const sd = Math.sqrt(sq / period);
    middle[i] = mean; upper[i] = mean + mult * sd; lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

// ── 6. ATR (Wilder's) ─────────────────────────────────────────────────────────
export function atr(bars, period = 14) {
  const probe = probeBars(bars);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  if (!isFiniteNumber(period) || period < 1) return nullArray(n);
  const out = nullArray(n);
  if (period >= n) return out;                       // first ATR sits at index `period` → need n > period
  const tr = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i === 0) { tr[i] = b.high - b.low; continue; }
    const prevClose = bars[i - 1].close;
    const hl = b.high - b.low;
    const hpc = Math.abs(b.high - prevClose);
    const lpc = Math.abs(b.low - prevClose);
    tr[i] = hl > hpc ? hl : hpc;
    if (lpc > tr[i]) tr[i] = lpc;
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) { prev = (prev * (period - 1) + tr[i]) / period; out[i] = prev; }
  return out;
}

// ── 7. Stochastic (slow %K, %D=SMA(%K)) ───────────────────────────────────────
export function stochastic(bars, kPeriod = 14, dPeriod = 3) {
  const probe = probeBars(bars);
  if (probe.length === 0) return { k: [], d: [] };
  const n = probe.length;
  if (!probe.ok) return { k: nullArray(n), d: nullArray(n) };
  if (!isFiniteNumber(kPeriod) || !isFiniteNumber(dPeriod) || kPeriod < 1 || dPeriod < 1) return { k: nullArray(n), d: nullArray(n) };
  const k = nullArray(n), d = nullArray(n);
  if (kPeriod > n) return { k, d };
  for (let i = kPeriod - 1; i < n; i++) {
    let lo = bars[i - kPeriod + 1].low, hi = bars[i - kPeriod + 1].high;
    for (let j = i - kPeriod + 2; j <= i; j++) { if (bars[j].low < lo) lo = bars[j].low; if (bars[j].high > hi) hi = bars[j].high; }
    const range = hi - lo;
    k[i] = range === 0 ? 0 : ((bars[i].close - lo) / range) * 100;
  }
  const dStart = (kPeriod - 1) + (dPeriod - 1);
  if (dStart >= n) return { k, d };
  let sum = 0;
  for (let i = dStart - dPeriod + 1; i <= dStart; i++) sum += k[i];
  d[dStart] = sum / dPeriod;
  for (let i = dStart + 1; i < n; i++) { sum += k[i] - k[i - dPeriod]; d[i] = sum / dPeriod; }
  return { k, d };
}

// ── 8. VWAP (cumulative, typical price) ───────────────────────────────────────
export function vwap(bars) {
  const probe = probeBars(bars, true);
  if (!probe.ok) return nullArray(probe.length);
  if (probe.length === 0) return [];
  const n = probe.length;
  const out = nullArray(n);
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const typical = (b.high + b.low + b.close) / 3;
    cumPV += typical * b.volume; cumV += b.volume;
    out[i] = cumV === 0 ? null : cumPV / cumV;
  }
  return out;
}

// ── computeAll — latest-values summary ────────────────────────────────────────
export function computeAll(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return { latest: {} };
  const closes = bars.map((b) => (b && isFiniteNumber(b.close) ? b.close : NaN));
  const m = macd(closes);
  const bb = bollinger(closes);
  const st = stochastic(bars);
  return {
    latest: {
      rsi: lastNonNull(rsi(closes)),
      macd: { macd: lastNonNull(m.macd), signal: lastNonNull(m.signal), histogram: lastNonNull(m.histogram) },
      bollinger: { middle: lastNonNull(bb.middle), upper: lastNonNull(bb.upper), lower: lastNonNull(bb.lower) },
      atr: lastNonNull(atr(bars)),
      stochastic: { k: lastNonNull(st.k), d: lastNonNull(st.d) },
      vwap: lastNonNull(vwap(bars)),
      ema12: lastNonNull(ema(closes, 12)),
      ema26: lastNonNull(ema(closes, 26)),
      sma20: lastNonNull(sma(closes, 20)),
    },
  };
}

// ── self-test (main-guarded) ──────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, l) => { if (c) pass++; else { fail++; console.error('FAIL:', l); } };
  const near = (a, b, e = 1e-9) => a != null && Math.abs(a - b) <= e;

  // SMA
  const s = sma([1, 2, 3, 4], 2);
  ok(s.length === 4 && s[0] === null && near(s[1], 1.5) && near(s[3], 3.5), `sma basic (${JSON.stringify(s)})`);
  // EMA seed
  const e = ema([1, 2, 3, 4, 5], 3);
  ok(e[0] === null && e[1] === null && near(e[2], 2), `ema seed (${JSON.stringify(e)})`);
  // RSI of strictly increasing -> 100
  const r = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14);
  ok(near(r[14], 100), `rsi monotonic up -> 100 (got ${r[14]})`);
  // RSI all-equal -> 50 (no NaN)
  const rEq = rsi(new Array(20).fill(100), 14);
  ok(rEq[14] === 50, `rsi flat -> 50 (got ${rEq[14]})`);
  // warmup nulls
  ok(rsi([1, 2, 3], 14).every((x) => x === null), 'rsi too-short all null');
  // empty
  ok(sma([], 5).length === 0 && rsi([], 14).length === 0 && atr([], 14).length === 0, 'empty -> []');
  // NaN injection -> aligned all-null, no NaN out
  const nanIn = [1, 2, NaN, 4, 5];
  const sn = sma(nanIn, 2);
  ok(sn.length === 5 && sn.every((x) => x === null), 'NaN element -> aligned all-null');
  // MACD on linear: histogram -> ~0, macd==signal (NOT macd->0)
  const lin = Array.from({ length: 60 }, (_, i) => 100 + 0.5 * i);
  const ml = macd(lin);
  ok(near(ml.histogram[59], 0, 1e-6) && near(ml.macd[59], ml.signal[59], 1e-6), `macd linear: hist->0, macd==signal (h=${ml.histogram[59]})`);
  // ATR positive + warmup
  const bars = Array.from({ length: 30 }, (_, i) => ({ high: 10 + i + 1, low: 10 + i - 1, close: 10 + i }));
  const a = atr(bars, 14);
  ok(a[13] === null && a[14] != null && a[14] > 0, `atr warmup+positive (a14=${a[14]})`);
  // Bollinger on constant -> upper==lower==middle
  const bbc = bollinger(new Array(25).fill(50), 20, 2);
  ok(near(bbc.middle[19], 50) && near(bbc.upper[19], 50) && near(bbc.lower[19], 50), 'bollinger constant -> bands collapse');
  // VWAP basic
  const vb = vwap([{ high: 11, low: 9, close: 10, volume: 100 }, { high: 13, low: 11, close: 12, volume: 100 }]);
  ok(near(vb[0], 10) && vb[1] != null, `vwap basic (${JSON.stringify(vb)})`);
  // computeAll shape
  const ca = computeAll(bars.map((b, i) => ({ ...b, open: b.close, volume: 1000, timestamp: 1700000000 + i * 60 })));
  ok(ca.latest && typeof ca.latest === 'object' && 'rsi' in ca.latest && 'macd' in ca.latest, 'computeAll shape');

  console.log(`indicators --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
