// @capability: strategies-volume-vol
// @serves: volume volatility regime trading strategies | obv mfi force-index atr breakout squeeze signals | strategy family
// @does: 8+ distinct VOLUME/VOLATILITY/REGIME strategies turning OHLCV into directional signals. Pure ESM, deterministic, no network, no throws from computeSignals. Each strategy in its own try/catch. Guard divide-by-zero (zero volume / zero ATR / zero bandwidth).
// @use: import { computeSignals } from this module; feed canonical {timestamp,open,high,low,close,volume} bars (~50 live). Returns Signal[] with factorId, value, side ('long'|'short'), confidence (0..1), ts, archetype:'volvol'. OMIT flat signals (only push long/short).
// @exports: computeSignals

import { sma, ema, bollinger, atr, vwap } from './indicators.mjs';
import { computeIndicators } from './indicator-registry.mjs';

/**
 * Signal type contract shared across the strategy family.
 * @typedef {Object} Signal
 * @property {string} factorId - `<strategyId>-<market>`
 * @property {number} value - raw signal value (can be negative for short)
 * @property {'long'|'short'} side - directional side
 * @property {number} confidence - 0..1
 * @property {number} ts - last bar timestamp (unix seconds)
 * @property {'volvol'} archetype - fixed for this family
 */

/**
 * @param {Array<{timestamp:number,open:number,high:number,low:number,close:number,volume:number}>} bars - OHLCV bars (unix-second timestamps)
 * @param {string} market - market identifier for factorId suffix
 * @returns {Signal[]}
 */
export function computeSignals(bars, market) {
  // Guard: need at least 30 bars for meaningful indicators
  if (!bars || bars.length < 30) return [];

  const n = bars.length;
  const ts = bars[n - 1]?.timestamp ?? Date.now() / 1000;
  const signals = [];

  // Pre-compute common arrays
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);

  // Fetch long-tail indicators from registry (obv, mfi, forceindex)
  const registryIndicators = computeIndicators(bars, ['obv', 'mfi', 'forceindex']);
  const obv = registryIndicators.obv ?? allNull(n);
  const mfi = registryIndicators.mfi ?? allNull(n);
  const forceIndex = registryIndicators.forceindex ?? allNull(n);

  // Pre-compute built-in indicators
  const atr14 = atr(bars, 14);
  const bb20 = bollinger(closes, 20, 2);
  const volSma20 = sma(volumes, 20);
  const range = bars.map((b) => b.high - b.low);
  const rangeSma20 = sma(range, 20);

  // Helper: slope of last k values (linear regression slope ≈ diff for short windows)
  function slope(arr, k = 5) {
    const len = arr.length;
    if (len < k) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < k; i++) {
      const idx = len - k + i;
      const y = arr[idx];
      if (y == null || !Number.isFinite(y)) return 0;
      sumX += i;
      sumY += y;
      sumXY += i * y;
      sumXX += i * i;
    }
    const denom = k * sumXX - sumX * sumX;
    if (denom === 0) return 0;
    return (k * sumXY - sumX * sumY) / denom;
  }

  // Helper: last valid value
  function last(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
    }
    return null;
  }

  // Helper: safe divide
  function div(num, den, fallback = 0) {
    if (den == null || den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) return fallback;
    return num / den;
  }

  // Helper: push signal if valid
  function push(factorId, value, side, confidence) {
    if (confidence <= 0 || confidence > 1) return;
    if (!Number.isFinite(value)) return;
    signals.push({ factorId: `${factorId}-${market}`, value, side, confidence, ts, archetype: 'volvol' });
  }

  // =========================================================================
  // 1. obv-trend — OBV rising (slope>0) → long, falling → short
  // =========================================================================
  try {
    const obvSlope = slope(obv, 5);
    if (obvSlope > 0) push('obv-trend', obvSlope, 'long', Math.min(0.9, 0.5 + Math.abs(obvSlope) * 0.01));
    else if (obvSlope < 0) push('obv-trend', obvSlope, 'short', Math.min(0.9, 0.5 + Math.abs(obvSlope) * 0.01));
  } catch (_e) {}

  // =========================================================================
  // 2. mfi-trend — MFI(14): rising through 50 → long, falling → short
  // =========================================================================
  try {
    const mfiLast = last(mfi);
    const mfiPrev = mfi[n - 2];
    if (mfiLast != null && mfiPrev != null && Number.isFinite(mfiLast) && Number.isFinite(mfiPrev)) {
      const mfiSlope = mfiLast - mfiPrev;
      if (mfiLast > 50 && mfiSlope > 0) push('mfi-trend', mfiLast - 50, 'long', Math.min(0.9, 0.5 + (mfiLast - 50) * 0.01));
      else if (mfiLast < 50 && mfiSlope < 0) push('mfi-trend', 50 - mfiLast, 'short', Math.min(0.9, 0.5 + (50 - mfiLast) * 0.01));
    }
  } catch (_e) {}

  // =========================================================================
  // 3. force-index — Force Index(13) sign
  // =========================================================================
  try {
    const fiLast = last(forceIndex);
    if (fiLast != null && Number.isFinite(fiLast) && fiLast !== 0) {
      const side = fiLast > 0 ? 'long' : 'short';
      push('force-index', fiLast, side, Math.min(0.9, 0.5 + Math.abs(fiLast) * 0.001));
    }
  } catch (_e) {}

  // =========================================================================
  // 4. volume-surge — current volume ≫ avg(20) AND price up → long; ≫avg AND price down → short
  // =========================================================================
  try {
    const volLast = volumes[n - 1];
    const volAvg = last(volSma20);
    const priceChange = closes[n - 1] - closes[n - 2];
    if (volLast != null && volAvg != null && volAvg > 0 && Number.isFinite(volLast) && Number.isFinite(volAvg)) {
      const ratio = volLast / volAvg;
      if (ratio > 2.0 && priceChange > 0) push('volume-surge', ratio, 'long', Math.min(0.95, 0.5 + Math.log(ratio) * 0.15));
      else if (ratio > 2.0 && priceChange < 0) push('volume-surge', -ratio, 'short', Math.min(0.95, 0.5 + Math.log(ratio) * 0.15));
    }
  } catch (_e) {}

  // =========================================================================
  // 5. atr-regime — ATR(14) expanding (lastATR > avgATR·1.3) → trend-follow last bar direction; contracting → flat (omit)
  // =========================================================================
  try {
    const atrLast = last(atr14);
    const atrAvg = sma(atr14.filter((v) => v != null && Number.isFinite(v)), 20);
    const atrAvgLast = last(atrAvg);
    const lastDir = closes[n - 1] - closes[n - 2];
    if (atrLast != null && atrAvgLast != null && atrAvgLast > 0 && Number.isFinite(atrLast) && Number.isFinite(atrAvgLast)) {
      const ratio = atrLast / atrAvgLast;
      if (ratio > 1.3 && lastDir !== 0) {
        const side = lastDir > 0 ? 'long' : 'short';
        push('atr-regime', ratio, side, Math.min(0.9, 0.5 + (ratio - 1) * 0.2));
      }
      // contracting → omit (flat)
    }
  } catch (_e) {}

  // =========================================================================
  // 6. volatility-breakout — close breaks above (prevClose + k·ATR) → long; below (prevClose − k·ATR) → short
  // =========================================================================
  try {
    const k = 1.5;
    const atrLast = last(atr14);
    const prevClose = closes[n - 2];
    const currClose = closes[n - 1];
    if (atrLast != null && atrLast > 0 && prevClose != null && currClose != null && Number.isFinite(atrLast)) {
      const upper = prevClose + k * atrLast;
      const lower = prevClose - k * atrLast;
      if (currClose > upper) push('volatility-breakout', currClose - upper, 'long', Math.min(0.95, 0.5 + (currClose - upper) / atrLast * 0.2));
      else if (currClose < lower) push('volatility-breakout', lower - currClose, 'short', Math.min(0.95, 0.5 + (lower - currClose) / atrLast * 0.2));
    }
  } catch (_e) {}

  // =========================================================================
  // 7. bollinger-squeeze-breakout — bandwidth at multi-bar low (squeeze) THEN close breaks the band → trade breakout direction
  // =========================================================================
  try {
    const bandwidth = bb20.middle.map((m, i) => {
      if (m == null || bb20.upper[i] == null || bb20.lower[i] == null || m === 0) return null;
      return (bb20.upper[i] - bb20.lower[i]) / m;
    });
    const bwLast = last(bandwidth);
    // Find min bandwidth over last 20 bars
    let minBw = Infinity;
    for (let i = Math.max(0, n - 20); i < n; i++) {
      if (bandwidth[i] != null && bandwidth[i] < minBw) minBw = bandwidth[i];
    }
    const currClose = closes[n - 1];
    const upperLast = bb20.upper[n - 1];
    const lowerLast = bb20.lower[n - 1];
    if (bwLast != null && minBw < Infinity && bwLast <= minBw * 1.05 && upperLast != null && lowerLast != null && Number.isFinite(currClose)) {
      // Squeeze detected; check breakout
      if (currClose > upperLast) push('bollinger-squeeze-breakout', currClose - upperLast, 'long', Math.min(0.95, 0.5 + (currClose - upperLast) / upperLast * 10));
      else if (currClose < lowerLast) push('bollinger-squeeze-breakout', lowerLast - currClose, 'short', Math.min(0.95, 0.5 + (lowerLast - currClose) / lowerLast * 10));
    }
  } catch (_e) {}

  // =========================================================================
  // 8. range-expansion — today's range ≫ avg range AND directional close → follow
  // =========================================================================
  try {
    const rangeLast = range[n - 1];
    const rangeAvg = last(rangeSma20);
    const priceChange = closes[n - 1] - closes[n - 2];
    if (rangeLast != null && rangeAvg != null && rangeAvg > 0 && Number.isFinite(rangeLast) && Number.isFinite(rangeAvg)) {
      const ratio = rangeLast / rangeAvg;
      if (ratio > 1.5 && priceChange !== 0) {
        const side = priceChange > 0 ? 'long' : 'short';
        push('range-expansion', ratio, side, Math.min(0.9, 0.5 + (ratio - 1) * 0.15));
      }
    }
  } catch (_e) {}

  // =========================================================================
  // 9. volume-weighted-momentum — sign of Σ(return·volume) over last N
  // =========================================================================
  try {
    const N = 10;
    let sum = 0;
    let valid = 0;
    for (let i = n - N; i < n; i++) {
      if (i <= 0) continue;
      const ret = div(closes[i] - closes[i - 1], closes[i - 1]);
      const vol = volumes[i];
      if (Number.isFinite(ret) && vol != null && Number.isFinite(vol)) {
        sum += ret * vol;
        valid++;
      }
    }
    if (valid >= 5 && sum !== 0) {
      const side = sum > 0 ? 'long' : 'short';
      push('volume-weighted-momentum', sum, side, Math.min(0.9, 0.5 + Math.abs(sum) * 10));
    }
  } catch (_e) {}

  // =========================================================================
  // 10. vwap-deviation — price deviation from VWAP with volume confirmation
  // =========================================================================
  try {
    // VWAP is statically imported at the top of this module (no await inside this sync fn).
    const vwapVals = vwap(bars);
    const vwapLast = last(vwapVals);
    const currClose = closes[n - 1];
    const volLast = volumes[n - 1];
    const volAvg = last(volSma20);
    if (vwapLast != null && currClose != null && vwapLast > 0 && volLast != null && volAvg != null && volAvg > 0) {
      const deviation = (currClose - vwapLast) / vwapLast;
      const volRatio = volLast / volAvg;
      // Only signal if volume confirms (above average)
      if (volRatio > 1.2 && Math.abs(deviation) > 0.002) {
        const side = deviation > 0 ? 'long' : 'short';
        push('vwap-deviation', deviation, side, Math.min(0.9, 0.5 + Math.abs(deviation) * 50 + (volRatio - 1) * 0.1));
      }
    }
  } catch (_e) {}

  return signals;
}

// ── utils ───────────────────────────────────────────────────────────────────
function allNull(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  return out;
}

// ── deterministic test harness (MAIN-GUARDED) ────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--test')) {
  // LCG for deterministic pseudo-random
  let seed = 0xC0FFEE;
  function lcg() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  }

  // Generate ~60 synthetic bars with volume spike + volatility expansion
  function genBars(count = 65) {
    const bars = [];
    let close = 100;
    let time = Math.floor(Date.now() / 1000) - count * 60;
    for (let i = 0; i < count; i++) {
      // Volatility expansion segment: bars 30-45
      const volMult = (i >= 30 && i < 45) ? 2.5 : 1.0;
      // Volume spike at bar 20
      const volSpike = (i === 20) ? 10 : 1.0;

      const drift = (lcg() - 0.5) * 0.5 * volMult;
      const range = 0.5 + lcg() * 1.5 * volMult;
      const high = close + range * lcg();
      const low = close - range * (1 - lcg());
      const open = close + (lcg() - 0.5) * 0.3;
      close = Math.max(low, Math.min(high, close + drift));
      const volume = Math.floor(1000 * volSpike * (0.5 + lcg() * 2));
      bars.push({
        timestamp: time + i * 60,
        open: Number(open.toFixed(4)),
        high: Number(high.toFixed(4)),
        low: Number(low.toFixed(4)),
        close: Number(close.toFixed(4)),
        volume
      });
    }
    return bars;
  }

  const bars = genBars();
  const market = 'TEST-USD';
  const result = computeSignals(bars, market);

  let pass = 0, fail = 0;
  function assert(cond, msg) {
    if (cond) pass++;
    else { fail++; console.error(`FAIL: ${msg}`); }
  }

  // Basic structure
  assert(Array.isArray(result), 'returns array');
  assert(result.length >= 5, `≥5 strategies fire (got ${result.length})`);

  // Every signal validates contract
  for (const s of result) {
    assert(s.factorId && s.factorId.endsWith(`-${market}`), `factorId pattern: ${s.factorId}`);
    assert(typeof s.value === 'number' && Number.isFinite(s.value), `finite value: ${s.value}`);
    assert(s.side === 'long' || s.side === 'short', `valid side: ${s.side}`);
    assert(typeof s.confidence === 'number' && s.confidence > 0 && s.confidence <= 1, `confidence in (0,1]: ${s.confidence}`);
    assert(typeof s.ts === 'number' && Number.isFinite(s.ts), `finite ts: ${s.ts}`);
    assert(s.archetype === 'volvol', `archetype volvol: ${s.archetype}`);
  }

  // Edge cases
  assert(computeSignals(null, market).length === 0, 'null bars -> []');
  assert(computeSignals([], market).length === 0, 'empty bars -> []');
  assert(computeSignals(bars.slice(0, 5), market).length === 0, 'short bars (<30) -> []');

  // Zero-volume bar handled (should not throw / NaN)
  const zeroVolBars = bars.map((b, i) => ({ ...b, volume: i === 0 ? 0 : b.volume }));
  const zeroVolResult = computeSignals(zeroVolBars, market);
  assert(Array.isArray(zeroVolResult), 'zero-volume bar handled');

  // Flat bars (no price movement) -> should not crash, may return []
  const flatBars = bars.map((b) => ({ ...b, open: 100, high: 100, low: 100, close: 100 }));
  const flatResult = computeSignals(flatBars, market);
  assert(Array.isArray(flatResult), 'flat bars handled');

  // Broken indicator (NaN in bars) -> should not throw
  const brokenBars = bars.map((b, i) => i === 5 ? { ...b, close: NaN } : b);
  const brokenResult = computeSignals(brokenBars, market);
  assert(Array.isArray(brokenResult), 'NaN bar handled');

  console.log(`strategies-volume-vol --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}