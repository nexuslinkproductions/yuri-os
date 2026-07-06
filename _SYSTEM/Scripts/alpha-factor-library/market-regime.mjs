#!/usr/bin/env node
// @capability: market-regime-state
// @serves: regime state | trending vs ranging | trend regime gate | ADX regime | should I trade with trend or fade | choppy vs directional market
// @does: Classifies each bar-window as trending, ranging, or transitional using ADX (DI+/DI-) + ATR-ratio. Pure compute — never sizes, trades, writes, or hits the network.
// @use: call classifyRegime(bars) before sizing to gate with-trend vs fade; regime='trending' + trendDir='up'/'down' confirms directionality; regime='ranging' signals fade/skip
// @exports: classifyRegime
/**
 * market-regime.mjs — YURI crypto-perp regime-state classifier.
 *
 * Classifies a bar window as TRENDING / RANGING / TRANSITIONAL using:
 *   - ADX (from indicator-registry → technicalindicators, object-of-arrays shape)
 *   - ATR ratio (latest ATR / SMA(ATR, atrLookback)) for vol-expansion confirmation
 *   - DI+ vs DI- for trend direction
 *
 * HARD CONSTRAINTS: pure ESM, DISARMED, no network, no fs writes, no protected paths.
 * Never throws — fail-soft on bad/short input.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { atr, sma } from './indicators.mjs';
import { computeIndicator } from './indicator-registry.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));

// ── defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  adxPeriod:    14,  // ADX smoothing period
  atrPeriod:    14,  // ATR smoothing period
  atrLookback:  20,  // SMA window over ATR series for ratio denominator
  trendMin:     25,  // adx >= trendMin → 'trending'
  rangeMax:     20,  // adx <  rangeMax → 'ranging'  (gap between = 'transitional')
  warmup:       30,  // minimum bars required before we produce a valid result
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Last finite value in array; default 0. */
function lastFinite(arr, fallback = 0) {
  if (!Array.isArray(arr)) return fallback;
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return fallback;
}

/** Clamp x to [lo, hi]. */
function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Fail-soft shape. */
function failShape(barsLen) {
  return {
    ok:         false,
    regime:     'ranging',
    trendDir:   'none',
    adx:        0,
    atrRatio:   1,
    diPlus:     0,
    diMinus:    0,
    strength:   0,
    confidence: 0,
    bars:       barsLen || 0,
  };
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * classifyRegime(bars, opts) → regime result object.
 *
 * @param {Array}  bars  canonical OHLCV bars {timestamp,open,high,low,close,volume}
 * @param {Object} opts  optional overrides for DEFAULTS keys
 * @returns {Object}  see file-level JSDoc contract
 */
export function classifyRegime(bars, opts = {}) {
  // Guard: treat null/undefined as empty
  const rawBars = Array.isArray(bars) ? bars : [];
  const barsLen = rawBars.length;

  // Merge opts over defaults
  const cfg = {
    adxPeriod:   coerceOpt(opts.adxPeriod,   DEFAULTS.adxPeriod),
    atrPeriod:   coerceOpt(opts.atrPeriod,   DEFAULTS.atrPeriod),
    atrLookback: coerceOpt(opts.atrLookback, DEFAULTS.atrLookback),
    trendMin:    coerceOpt(opts.trendMin,    DEFAULTS.trendMin),
    rangeMax:    coerceOpt(opts.rangeMax,    DEFAULTS.rangeMax),
    warmup:      coerceOpt(opts.warmup,      DEFAULTS.warmup),
  };

  // Fail-soft: insufficient bars
  if (barsLen < cfg.warmup) {
    return failShape(barsLen);
  }

  // ── ADX (object-of-arrays: { adx:[], pdi:[], mdi:[] }) ───────────────────
  let adxVal = 0;
  let diPlus  = 0;
  let diMinus = 0;

  try {
    const adxResult = computeIndicator(rawBars, 'adx', { period: cfg.adxPeriod });
    // adxResult is { adx:(number|null)[], pdi:(number|null)[], mdi:(number|null)[] }
    // or null if registry fails
    if (adxResult && typeof adxResult === 'object' && !Array.isArray(adxResult)) {
      adxVal  = lastFinite(adxResult.adx,  0);
      diPlus  = lastFinite(adxResult.pdi,  0);
      diMinus = lastFinite(adxResult.mdi,  0);
    }
  } catch (_) {
    // fail-soft: stay at defaults (0)
  }

  // ── ATR ratio ─────────────────────────────────────────────────────────────
  let atrRatio = 1;

  try {
    const atrSeries = atr(rawBars, cfg.atrPeriod); // (number|null)[]
    if (Array.isArray(atrSeries)) {
      const latestAtr = lastFinite(atrSeries, 0);
      // SMA over the ATR series (sma accepts null → null output but we need finite inputs)
      // Build a dense finite-only view for the denominator SMA
      const atrDense = atrSeries.filter((v) => v !== null && Number.isFinite(v));
      if (atrDense.length >= cfg.atrLookback && latestAtr > 0) {
        const smaSeries = sma(atrDense, cfg.atrLookback);
        const smaVal    = lastFinite(smaSeries, 0);
        if (smaVal > 0) {
          atrRatio = latestAtr / smaVal;
          // Clamp to a sane range to avoid NaN via division artifacts
          if (!Number.isFinite(atrRatio)) atrRatio = 1;
        }
      }
    }
  } catch (_) {
    // fail-soft
  }

  // ── Regime classification ─────────────────────────────────────────────────
  let regime;
  let strength;
  let confidence;

  if (adxVal >= cfg.trendMin) {
    regime   = 'trending';
    // strength: 0 at trendMin, 1 at adx=40 (clamp)
    strength = clamp((adxVal - cfg.trendMin) / Math.max(1, 40 - cfg.trendMin), 0, 1);
  } else if (adxVal < cfg.rangeMax) {
    regime   = 'ranging';
    // strength: 1 at adx=0, 0 at rangeMax
    strength = clamp(1 - adxVal / Math.max(1, cfg.rangeMax), 0, 1);
  } else {
    regime   = 'transitional';
    // midpoint conviction: weakest at the center of the gap
    const mid = (cfg.rangeMax + cfg.trendMin) / 2;
    strength  = clamp(Math.abs(adxVal - mid) / Math.max(1, (cfg.trendMin - cfg.rangeMax) / 2), 0, 1);
  }

  // Trend direction: meaningful when trending/transitional; still report sign in ranging
  const trendDir = (diPlus > diMinus) ? 'up' : (diMinus > diPlus) ? 'down' : 'none';

  // Confidence: blend of regime strength + ATR-ratio signal
  //   atrRatio > 1 = expanding vol → amplifies trending confidence; < 1 = contracting → amplifies ranging
  let atrConf;
  if (regime === 'trending') {
    atrConf = clamp(atrRatio - 1, 0, 1); // 0 when flat, up to 1 when 2× expanding
  } else if (regime === 'ranging') {
    atrConf = clamp(1 - atrRatio, 0, 1); // 0 when flat, up to 1 when deeply contracting
  } else {
    atrConf = 0.5; // neutral for transitional
  }
  confidence = clamp((strength + atrConf) / 2, 0, 1);

  // Final NaN guard on all numeric fields
  return {
    ok:         true,
    regime,
    trendDir,
    adx:        Number.isFinite(adxVal)  ? adxVal  : 0,
    atrRatio:   Number.isFinite(atrRatio) ? atrRatio : 1,
    diPlus:     Number.isFinite(diPlus)  ? diPlus  : 0,
    diMinus:    Number.isFinite(diMinus) ? diMinus : 0,
    strength:   Number.isFinite(strength)   ? strength   : 0,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    bars:       barsLen,
  };
}

// ── private helpers ────────────────────────────────────────────────────────────

function coerceOpt(v, def) {
  return (typeof v === 'number' && Number.isFinite(v) && v > 0) ? v : def;
}

// ── self-test (main-guarded, --test) ─────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--test')) {
    console.log('market-regime: YURI regime-state classifier (trending/ranging/transitional).');
    console.log('  node market-regime.mjs --test');
    console.log('  import { classifyRegime } from "./market-regime.mjs"');
    process.exit(0);
  }

  let pass = 0;
  let fail = 0;
  const results = [];

  function ok(cond, label, detail = '') {
    if (cond) {
      pass++;
      results.push(`  PASS  ${label}`);
    } else {
      fail++;
      results.push(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    }
  }

  // ── bar builders ──────────────────────────────────────────────────────────

  /** Monotonic uptrend: close rises steadily with tiny noise. */
  function makeTrendUp(n = 90) {
    const bars = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
      const noise = Math.sin(i * 0.7) * 0.3; // tiny oscillation
      price += 0.6 + noise;
      const close = price;
      const high  = close + 0.5 + Math.abs(noise);
      const low   = close - 0.5;
      bars.push({ timestamp: 1_700_000_000 + i * 60, open: close - 0.3, high, low, close, volume: 1000 });
    }
    return bars;
  }

  /** Monotonic downtrend. */
  function makeTrendDown(n = 90) {
    const bars = [];
    let price = 200;
    for (let i = 0; i < n; i++) {
      const noise = Math.sin(i * 0.7) * 0.3;
      price -= 0.6 + Math.abs(noise) * 0.5;
      const close = Math.max(1, price);
      const high  = close + 0.5;
      const low   = close - 0.5 - Math.abs(noise);
      bars.push({ timestamp: 1_700_000_000 + i * 60, open: close + 0.3, high, low, close, volume: 1000 });
    }
    return bars;
  }

  /** Choppy ranging: sine around a constant, no drift. */
  function makeRanging(n = 90) {
    const bars = [];
    const base = 100;
    const amp  = 2;
    for (let i = 0; i < n; i++) {
      const close = base + amp * Math.sin(i * 0.4) + 0.3 * Math.cos(i * 1.1);
      const high  = close + 0.8 + 0.2 * Math.abs(Math.sin(i));
      const low   = close - 0.8 - 0.2 * Math.abs(Math.cos(i));
      bars.push({ timestamp: 1_700_000_000 + i * 60, open: close + 0.1, high, low, close, volume: 800 });
    }
    return bars;
  }

  // ── test cases ─────────────────────────────────────────────────────────────

  // 1. GREEN trending up
  {
    const bars = makeTrendUp(90);
    const r = classifyRegime(bars);
    ok(r.ok === true,              'up-trend: ok=true');
    ok(r.regime === 'trending',    'up-trend: regime=trending',    `got ${r.regime}, adx=${r.adx.toFixed(2)}`);
    ok(r.trendDir === 'up',        'up-trend: trendDir=up',        `got ${r.trendDir}`);
    ok(r.adx > 0,                  'up-trend: adx>0',              `got ${r.adx}`);
    ok(r.bars === 90,              'up-trend: bars=90');
  }

  // 2. GREEN ranging
  {
    const bars = makeRanging(90);
    const r = classifyRegime(bars);
    ok(r.ok === true,              'ranging: ok=true');
    ok(r.regime === 'ranging',     'ranging: regime=ranging',      `got ${r.regime}, adx=${r.adx.toFixed(2)}`);
    ok(r.bars === 90,              'ranging: bars=90');
  }

  // 3. GREEN downtrend
  {
    const bars = makeTrendDown(90);
    const r = classifyRegime(bars);
    ok(r.ok === true,              'down-trend: ok=true');
    ok(r.regime === 'trending',    'down-trend: regime=trending',  `got ${r.regime}, adx=${r.adx.toFixed(2)}`);
    ok(r.trendDir === 'down',      'down-trend: trendDir=down',    `got ${r.trendDir}`);
  }

  // 4. EDGE: empty array
  {
    let threw = false;
    let r;
    try { r = classifyRegime([]); } catch { threw = true; }
    ok(!threw,                                  'empty: no throw');
    ok(r && r.ok === false,                     'empty: ok=false');
    ok(r && r.regime === 'ranging',             'empty: regime=ranging');
    ok(r && r.trendDir === 'none',              'empty: trendDir=none');
    ok(r && r.bars === 0,                       'empty: bars=0');
  }

  // 5. EDGE: 5-bar series (below warmup)
  {
    const bars = makeTrendUp(5);
    let threw = false;
    let r;
    try { r = classifyRegime(bars); } catch { threw = true; }
    ok(!threw,                                  '5-bar: no throw');
    ok(r && r.ok === false,                     '5-bar: ok=false');
    ok(r && r.regime === 'ranging',             '5-bar: regime=ranging (fail-soft)');
  }

  // 6. EDGE: null input
  {
    let threw = false;
    let r;
    try { r = classifyRegime(null); } catch { threw = true; }
    ok(!threw,                                  'null: no throw');
    ok(r && r.ok === false,                     'null: ok=false');
    ok(r && r.regime === 'ranging',             'null: regime=ranging');
  }

  // 7. no-NaN: every numeric field must be Number.isFinite on all cases
  {
    const cases = [
      { label: 'up-trend',  bars: makeTrendUp(90)   },
      { label: 'ranging',   bars: makeRanging(90)   },
      { label: 'down-trend',bars: makeTrendDown(90) },
      { label: 'empty',     bars: []                },
      { label: '5-bar',     bars: makeTrendUp(5)    },
    ];
    for (const { label, bars } of cases) {
      let r;
      try { r = classifyRegime(bars); } catch { r = null; }
      if (r) {
        const numFields = ['adx', 'atrRatio', 'diPlus', 'diMinus', 'strength', 'confidence'];
        for (const f of numFields) {
          ok(Number.isFinite(r[f]), `no-NaN: ${label}.${f}=${r[f]}`);
        }
      }
    }
  }

  // ── report ─────────────────────────────────────────────────────────────────
  console.log('\nmarket-regime --test results:');
  for (const line of results) console.log(line);
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
