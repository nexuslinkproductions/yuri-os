#!/usr/bin/env node
// @capability: strategies-trend
// @serves: trend momentum trading strategies | ema macd adx donchian breakout signals | strategy family
// @does: A family of 12 distinct trend/momentum trading strategies that turn canonical OHLCV bars into directional signals. Each strategy computes a technical indicator (EMA cross, MACD, ADX, ROC, Donchian breakout, TRIX, PSAR, VWAP, Supertrend, WMA cross) and emits a Signal {factorId, value, side, confidence, ts, archetype:'trend'} when the indicator is directional (long/short); flat/neutral bars are omitted. Every strategy is wrapped in its own try/catch so a throwing indicator is skipped, never breaks the array. Pure ESM, deterministic, no network, reuses the verified indicators.mjs builtins and indicator-registry.mjs long-tail (technicalindicators).
// @use: import { computeSignals } from this module; feed canonical {timestamp,open,high,low,close,volume} bars (unix-seconds, ~50 bars live) and a market string. Returns Signal[] — one per firing strategy. Merge with other strategy families (mean-revert, breakout, etc.) by concatenating arrays.
// @exports: computeSignals, tryStrategy, STRATEGIES

import { pathToFileURL } from 'node:url';
import { ema, macd, vwap, atr } from './indicators.mjs';
import { computeIndicator, computeIndicators } from './indicator-registry.mjs';

// ── helpers ─────────────────────────────────────────────────────────────────

function isFiniteNumber(x) { return typeof x === 'number' && Number.isFinite(x); }

function lastNonNull(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

/** Confidence from a price-relative spread (|spread|/price as a fraction). 1% → 0.95. */
function confPrice(spread, price) {
  if (!isFiniteNumber(spread) || !isFiniteNumber(price) || price === 0) return 0.5;
  const rel = Math.abs(spread) / price;
  return 0.5 + rel * 45;
}

/** True if |spread| is meaningfully non-zero relative to price (kills FP noise on flat bars). */
function significantSpread(spread, price) {
  if (!isFiniteNumber(spread) || !isFiniteNumber(price) || price === 0) return false;
  return Math.abs(spread) > 1e-9 * Math.abs(price);
}

/** Confidence from a percent value (ROC, TRIX×100). 5% → 0.95. */
function confPercent(pct) {
  if (!isFiniteNumber(pct)) return 0.5;
  return 0.5 + (Math.abs(pct) / 100) * 9;
}

/** Confidence from ADX strength. 25 → 0.5, 50 → 0.95. */
function confAdx(adx) {
  if (!isFiniteNumber(adx) || adx <= 25) return 0.5;
  return 0.5 + ((adx - 25) / 25) * 0.45;
}

/** Build a Signal, clamping confidence to (0.5, 0.95]; returns null on invalid inputs. */
function makeSignal(factorId, value, side, confidence, ts) {
  if (!isFiniteNumber(value) || !isFiniteNumber(confidence) || !isFiniteNumber(ts)) return null;
  if (side !== 'long' && side !== 'short') return null;
  const c = Math.min(0.95, Math.max(0.5 + 1e-9, confidence));
  return { factorId, value, side, confidence: c, ts, archetype: 'trend' };
}

// ── strategies ───────────────────────────────────────────────────────────────
// Each: { id, run(bars, market, ts) -> Signal | null }
// bars = canonical {timestamp,open,high,low,close,volume} (unix-seconds)

export const STRATEGIES = [
  // 1. ema-cross — EMA(12) vs EMA(26): above→long, below→short
  {
    id: 'ema-cross',
    run: (bars, market, ts) => {
      const closes = bars.map(b => b.close);
      const e12 = lastNonNull(ema(closes, 12));
      const e26 = lastNonNull(ema(closes, 26));
      if (!isFiniteNumber(e12) || !isFiniteNumber(e26)) return null;
      const spread = e12 - e26;
      if (!significantSpread(spread, e26)) return null;
      const side = spread > 0 ? 'long' : 'short';
      const price = bars[bars.length - 1].close;
      if (!isFiniteNumber(price) || price === 0) return null;
      return makeSignal(`ema-cross-${market}`, spread, side, confPrice(spread, price), ts);
    }
  },

  // 2. ema-fast-cross — EMA(5) vs EMA(20)
  {
    id: 'ema-fast-cross',
    run: (bars, market, ts) => {
      const closes = bars.map(b => b.close);
      const e5 = lastNonNull(ema(closes, 5));
      const e20 = lastNonNull(ema(closes, 20));
      if (!isFiniteNumber(e5) || !isFiniteNumber(e20)) return null;
      const spread = e5 - e20;
      if (!significantSpread(spread, e20)) return null;
      const side = spread > 0 ? 'long' : 'short';
      const price = bars[bars.length - 1].close;
      if (!isFiniteNumber(price) || price === 0) return null;
      return makeSignal(`ema-fast-cross-${market}`, spread, side, confPrice(spread, price), ts);
    }
  },

  // 3. macd-trend — MACD histogram sign (+rising→long, −falling→short)
  {
    id: 'macd-trend',
    run: (bars, market, ts) => {
      const closes = bars.map(b => b.close);
      const m = macd(closes);
      const hist = lastNonNull(m.histogram);
      if (!isFiniteNumber(hist) || !significantSpread(hist, bars[bars.length - 1].close)) return null;
      const side = hist > 0 ? 'long' : 'short';
      const price = bars[bars.length - 1].close;
      if (!isFiniteNumber(price) || price === 0) return null;
      return makeSignal(`macd-trend-${market}`, hist, side, confPrice(hist, price), ts);
    }
  },

  // 4. macd-zero — MACD line above/below zero
  {
    id: 'macd-zero',
    run: (bars, market, ts) => {
      const closes = bars.map(b => b.close);
      const m = macd(closes);
      const line = lastNonNull(m.macd);
      if (!isFiniteNumber(line) || !significantSpread(line, bars[bars.length - 1].close)) return null;
      const side = line > 0 ? 'long' : 'short';
      const price = bars[bars.length - 1].close;
      if (!isFiniteNumber(price) || price === 0) return null;
      return makeSignal(`macd-zero-${market}`, line, side, confPrice(line, price), ts);
    }
  },

  // 5. adx-trend — ADX>25 (trending) AND +DI vs −DI direction
  {
    id: 'adx-trend',
    run: (bars, market, ts) => {
      const ind = computeIndicators(bars, ['adx']);
      const adxObj = ind && ind.adx;
      if (!adxObj) return null;
      const adx = lastNonNull(adxObj.adx);
      const pdi = lastNonNull(adxObj.pdi);
      const mdi = lastNonNull(adxObj.mdi);
      if (!isFiniteNumber(adx) || !isFiniteNumber(pdi) || !isFiniteNumber(mdi)) return null;
      if (adx <= 25) return null; // not trending
      const di = pdi - mdi;
      if (!significantSpread(di, pdi + mdi || 1)) return null;
      const side = di > 0 ? 'long' : 'short';
      return makeSignal(`adx-trend-${market}`, di, side, confAdx(adx), ts);
    }
  },

  // 6. roc-momentum — ROC(12) sign + magnitude
  {
    id: 'roc-momentum',
    run: (bars, market, ts) => {
      const ind = computeIndicators(bars, ['roc']);
      const roc = ind && ind.roc ? lastNonNull(ind.roc) : null;
      if (!isFiniteNumber(roc) || !significantSpread(roc, 100)) return null;
      const side = roc > 0 ? 'long' : 'short';
      return makeSignal(`roc-momentum-${market}`, roc, side, confPercent(roc), ts);
    }
  },

  // 7. donchian-breakout — close ≥ prior 20-bar high → long; ≤ prior 20-bar low → short
  {
    id: 'donchian-breakout',
    run: (bars, market, ts) => {
      if (bars.length < 21) return null;
      const lookback = bars.slice(-21, -1); // 20 bars before the last
      let priorHigh = -Infinity, priorLow = Infinity;
      for (const b of lookback) {
        if (!b || !isFiniteNumber(b.high) || !isFiniteNumber(b.low)) return null;
        if (b.high > priorHigh) priorHigh = b.high;
        if (b.low < priorLow) priorLow = b.low;
      }
      const lastClose = bars[bars.length - 1].close;
      if (!isFiniteNumber(lastClose)) return null;
      if (lastClose > priorHigh) {
        return makeSignal(`donchian-breakout-${market}`, lastClose - priorHigh, 'long', confPrice(lastClose - priorHigh, lastClose), ts);
      }
      if (lastClose < priorLow) {
        return makeSignal(`donchian-breakout-${market}`, lastClose - priorLow, 'short', confPrice(lastClose - priorLow, lastClose), ts);
      }
      return null;
    }
  },

  // 8. trix-trend — TRIX(15) sign/slope
  {
    id: 'trix-trend',
    run: (bars, market, ts) => {
      const ind = computeIndicators(bars, ['trix']);
      const trix = ind && ind.trix ? lastNonNull(ind.trix) : null;
      if (!isFiniteNumber(trix) || !significantSpread(trix, 1)) return null;
      const side = trix > 0 ? 'long' : 'short';
      // TRIX from technicalindicators is a decimal (0.05 = 5%); scale to percent for confPercent
      return makeSignal(`trix-trend-${market}`, trix, side, confPercent(trix * 100), ts);
    }
  },

  // 9. psar-trend — Parabolic SAR: price above SAR→long, below→short
  {
    id: 'psar-trend',
    run: (bars, market, ts) => {
      const ind = computeIndicators(bars, ['psar']);
      const psar = ind && ind.psar ? lastNonNull(ind.psar) : null;
      if (!isFiniteNumber(psar)) return null;
      const lastClose = bars[bars.length - 1].close;
      if (!isFiniteNumber(lastClose)) return null;
      const diff = lastClose - psar;
      if (!significantSpread(diff, lastClose)) return null;
      const side = diff > 0 ? 'long' : 'short';
      return makeSignal(`psar-trend-${market}`, diff, side, confPrice(diff, lastClose), ts);
    }
  },

  // 10. price-vs-vwap — close vs VWAP (above→long)
  {
    id: 'price-vs-vwap',
    run: (bars, market, ts) => {
      const v = vwap(bars);
      const lastVwap = lastNonNull(v);
      if (!isFiniteNumber(lastVwap)) return null;
      const lastClose = bars[bars.length - 1].close;
      if (!isFiniteNumber(lastClose)) return null;
      const diff = lastClose - lastVwap;
      if (!significantSpread(diff, lastClose)) return null;
      const side = diff > 0 ? 'long' : 'short';
      return makeSignal(`price-vs-vwap-${market}`, diff, side, confPrice(diff, lastClose), ts);
    }
  },

  // 11. supertrend — ATR-band trend (close vs ema ± k·ATR)
  {
    id: 'supertrend',
    run: (bars, market, ts) => {
      const closes = bars.map(b => b.close);
      const e20 = lastNonNull(ema(closes, 20));
      const a14 = lastNonNull(atr(bars, 14));
      if (!isFiniteNumber(e20) || !isFiniteNumber(a14)) return null;
      const lastClose = bars[bars.length - 1].close;
      if (!isFiniteNumber(lastClose)) return null;
      const mult = 3;
      const upper = e20 + mult * a14;
      const lower = e20 - mult * a14;
      if (lastClose > upper) {
        return makeSignal(`supertrend-${market}`, lastClose - e20, 'long', confPrice(lastClose - upper, lastClose), ts);
      }
      if (lastClose < lower) {
        return makeSignal(`supertrend-${market}`, lastClose - e20, 'short', confPrice(lower - lastClose, lastClose), ts);
      }
      return null;
    }
  },

  // 12. wma-cross — WMA(10) vs WMA(30)
  {
    id: 'wma-cross',
    run: (bars, market, ts) => {
      const w10 = computeIndicator(bars, 'wma', { period: 10 });
      const w30 = computeIndicator(bars, 'wma', { period: 30 });
      const last10 = lastNonNull(w10);
      const last30 = lastNonNull(w30);
      if (!isFiniteNumber(last10) || !isFiniteNumber(last30)) return null;
      const spread = last10 - last30;
      if (!significantSpread(spread, last30)) return null;
      const side = spread > 0 ? 'long' : 'short';
      const price = bars[bars.length - 1].close;
      if (!isFiniteNumber(price) || price === 0) return null;
      return makeSignal(`wma-cross-${market}`, spread, side, confPrice(spread, price), ts);
    }
  },
];

// ── public API ──────────────────────────────────────────────────────────────

/** Wrap a strategy function in try/catch; returns null on throw. Exported for testing. */
export function tryStrategy(fn, bars, market, ts) {
  try {
    return fn(bars, market, ts);
  } catch (_e) {
    return null;
  }
}

/**
 * Compute trend/momentum signals for a bar series.
 * @param {Array} bars   canonical {timestamp,open,high,low,close,volume} (unix-seconds)
 * @param {string} market market identifier (e.g. 'BTC-USD')
 * @returns {Signal[]} array of signals from firing strategies; flat/neutral omitted
 */
export function computeSignals(bars, market) {
  if (!Array.isArray(bars) || bars.length < 30) return [];
  const lastBar = bars[bars.length - 1];
  const ts = lastBar && isFiniteNumber(lastBar.timestamp) ? lastBar.timestamp : 0;
  const out = [];
  for (const s of STRATEGIES) {
    const sig = tryStrategy(s.run, bars, market, ts);
    if (sig) out.push(sig);
  }
  return out;
}

// ── test main-guard ─────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (c, label) => { if (c) pass++; else { fail++; console.error(`FAIL: ${label}`); } };

  // Deterministic LCG (no Math.random)
  function lcg(seed) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  // Synthetic bars: uptrend segment + downtrend segment (or single direction)
  function makeBars(n, trendDir) {
    const rng = lcg(42);
    const bars = [];
    let price = 100;
    const half = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      let trend;
      if (trendDir === 'up') trend = 1;
      else if (trendDir === 'down') trend = -1;
      else trend = i < half ? 1 : -1; // 'both': first half up, second half down
      const noise = (rng() - 0.5) * 1.0;
      const change = trend * 2.0 + noise;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + rng() * 0.3;
      const low = Math.min(open, close) - rng() * 0.3;
      const volume = 1000 + Math.floor(rng() * 500);
      bars.push({ timestamp: 1700000000 + i * 3600, open, high, low, close, volume });
      price = close;
    }
    return bars;
  }

  // 1. computeSignals returns an array
  const bars = makeBars(60, 'both');
  const sigs = computeSignals(bars, 'BTC-USD');
  assert(Array.isArray(sigs), 'computeSignals returns array');

  // 2. ≥6 distinct strategies fire across trend/downtrend bars
  const allFiring = new Set();
  for (const s of computeSignals(makeBars(60, 'both'), 'BTC-USD')) allFiring.add(s.factorId);
  for (const s of computeSignals(makeBars(50, 'up'), 'BTC-USD')) allFiring.add(s.factorId);
  for (const s of computeSignals(makeBars(50, 'down'), 'BTC-USD')) allFiring.add(s.factorId);
  assert(allFiring.size >= 6, `≥6 distinct strategies fire across trend/downtrend (got ${allFiring.size})`);

  // 3. Every signal has valid fields
  for (const s of sigs) {
    assert(s.side === 'long' || s.side === 'short', `valid side: ${s.side}`);
    assert(s.confidence > 0 && s.confidence <= 0.95, `confidence in (0,0.95]: ${s.confidence}`);
    assert(Number.isFinite(s.value), `finite value: ${s.value}`);
    assert(s.factorId.includes('BTC-USD'), `correct factorId pattern: ${s.factorId}`);
    assert(s.archetype === 'trend', `archetype is trend: ${s.archetype}`);
    assert(!Number.isNaN(s.value) && !Number.isNaN(s.confidence), `no NaN in signal`);
  }

  // 4. Empty/short bars → []
  assert(computeSignals([], 'BTC-USD').length === 0, 'empty bars → []');
  assert(computeSignals(makeBars(29, 'up'), 'BTC-USD').length === 0, 'short bars (29) → []');

  // 5. All-flat bars → no signals, no crash
  const flatBars = [];
  for (let i = 0; i < 60; i++) {
    flatBars.push({ timestamp: 1700000000 + i * 3600, open: 100, high: 100, low: 100, close: 100, volume: 1000 });
  }
  const flatSigs = computeSignals(flatBars, 'BTC-USD');
  assert(Array.isArray(flatSigs) && flatSigs.length === 0, `flat bars → no signals (got ${flatSigs.length})`);

  // 6. NaN in a bar → no crash, returns array, no NaN in signals
  const nanBars = makeBars(60, 'both');
  nanBars[30].close = NaN;
  const nanSigs = computeSignals(nanBars, 'BTC-USD');
  assert(Array.isArray(nanSigs), 'NaN bar → array returned (no crash)');
  for (const s of nanSigs) {
    assert(!Number.isNaN(s.value), `no NaN in signal value (NaN bar test)`);
    assert(!Number.isNaN(s.confidence), `no NaN in confidence (NaN bar test)`);
  }

  // 7. Deliberately-broken indicator call (null element) → array still returned
  const brokenBars = makeBars(60, 'both');
  brokenBars[10] = null;
  const brokenSigs = computeSignals(brokenBars, 'BTC-USD');
  assert(Array.isArray(brokenSigs), 'null element → array still returned (throw caught)');

  // 8. tryStrategy catches a throwing function
  const throwResult = tryStrategy(() => { throw new Error('deliberate'); }, bars, 'BTC-USD', 100);
  assert(throwResult === null, 'tryStrategy catches throw → null');

  // 9. Uptrend bars → long signals fire
  const upSigs = computeSignals(makeBars(50, 'up'), 'BTC-USD');
  const longCount = upSigs.filter(s => s.side === 'long').length;
  assert(longCount >= 3, `uptrend → ≥3 long signals (got ${longCount})`);

  // 10. Downtrend bars → short signals fire
  const downSigs = computeSignals(makeBars(50, 'down'), 'BTC-USD');
  const shortCount = downSigs.filter(s => s.side === 'short').length;
  assert(shortCount >= 3, `downtrend → ≥3 short signals (got ${shortCount})`);

  // 11. Strategy count
  assert(STRATEGIES.length >= 10, `≥10 strategies defined (got ${STRATEGIES.length})`);

  console.log(`strategies-trend --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}