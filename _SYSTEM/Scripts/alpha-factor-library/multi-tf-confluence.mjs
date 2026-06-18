#!/usr/bin/env node
// @capability: multi-tf-confluence
// @serves: multi-timeframe confluence | higher timeframe bias | weekly 4h 1h trend alignment | confluence confidence | counter-trend filter | timeframe agreement
// @does: Computes a bias+confidence signal from up to 6 timeframes (1w→4h→1h→15m→5m→1m) weighted by hierarchy; higher TFs dominate — aligned stack = high confidence, conflict = reduced confidence, contradiction = neutral/skip.
// @use: call getConfluence({symbol}) to get higher-TF bias+confidence before/with the 1m ensemble
// @exports: scoreTimeframe, computeConfluenceFromBars, getConfluence

/**
 * multi-tf-confluence.mjs
 *
 * PURPOSE:
 *   The live engine sizes off 1-minute signals and trades counter to the dominant
 *   higher-TF trend (the primary losing pattern). This module corrects that by
 *   building a bias HIERARCHY: weekly → 4h → 1h → 15m → 5m → 1m.
 *   CONFLUENCE (how aligned the timeframes are) IS the confidence model.
 *
 * DISARMED CONTRACT:
 *   This module ONLY computes and returns bias + confidence numbers.
 *   It NEVER sizes, trades, touches orders, writes ledgers, or mutates state.
 *
 * INDICATOR RETURN SHAPES (verified from indicators.mjs source):
 *   ema(closes, period)  → number[] aligned to closes.length, null during warmup
 *                          SMA-seeded at index period-1; k = 2/(period+1)
 *   macd(closes)         → { macd: number[], signal: number[], histogram: number[] }
 *                          all length-aligned; histogram first non-null at index
 *                          (slow-1) + (signal-1) = 33 for defaults (26+9-2)
 *
 * PERP-ADAPTER RETURN SHAPE (verified from perp-adapter.mjs source):
 *   getCandles(symbol, { interval, limit })
 *     → { candles: [{timestamp,open,high,low,close,volume}, ...] } ascending (oldest-first)
 *     interval is Binance-native string: '1w','4h','1h','15m','5m','1m'
 *     limit capped at 1500 by the adapter
 */

import { ema, macd } from './indicators.mjs';
import * as PerpAdapter from './adapters/perp-adapter.mjs';
import { classifyRegime as _classifyRegime } from './market-regime.mjs';
import { pathToFileURL } from 'node:url';

// ── DEFAULTS ─────────────────────────────────────────────────────────────────

/** Higher TF carries more weight; sum = 1.00 */
const DEFAULT_WEIGHTS = {
  '1w':  0.30,
  '4h':  0.25,
  '1h':  0.20,
  '15m': 0.13,
  '5m':  0.07,
  '1m':  0.05,
};

const DEFAULT_TIMEFRAMES = ['1w', '4h', '1h', '15m', '5m', '1m'];

/** |weightedScore| below this → bias = 'neutral' */
const DEFAULT_NEUTRAL_BAND = 0.15;

/** Default bar count per TF. 200 bars gives enough warmup for EMA-50 + slope. */
const DEFAULT_LIMIT = 200;

/**
 * Per-TF cache TTL in seconds. Weekly bars change slowly; 1m bars expire fast.
 * Injectable via getConfluence opts.ttl.
 */
const DEFAULT_TTL = {
  '1w':  3600,
  '4h':  900,
  '1h':  300,
  '15m': 120,
  '5m':  30,
  '1m':  10,
};

// Minimum bars needed for EMA-50 warmup + at least a few extra for slope.
const MIN_BARS_FOR_SCORE = 55;

// Slope window: compare EMA-20 latest vs N bars back to get a normalised slope.
const SLOPE_LOOKBACK = 5;

// ── HELPERS ───────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return 0;
  return v < lo ? lo : v > hi ? hi : v;
}

function lastNonNull(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

function nthFromEnd(arr, n) {
  // Return arr[arr.length - 1 - n] if finite, else null
  if (!Array.isArray(arr) || arr.length <= n) return null;
  const v = arr[arr.length - 1 - n];
  return (v != null && Number.isFinite(v)) ? v : null;
}

// ── PURE CORE: scoreTimeframe ─────────────────────────────────────────────────

/**
 * scoreTimeframe(bars, opts) → {
 *   dir: 'up'|'down'|'none',
 *   score: number,          // ∈ [-1, 1]
 *   ema20: number,
 *   ema50: number,
 *   slope: number,          // normalised EMA20 slope over SLOPE_LOOKBACK bars
 *   macdHist: number,
 *   priceVsEma: number,     // (close - ema20) / ema20  ∈ approx [-1,1]
 *   ok: boolean
 * }
 *
 * SCORING BLEND (four equal-weight sub-signals, each ∈ [-1,1]):
 *   1. ema_cross:    sign(ema20 - ema50)  × gap_factor (normalised gap)
 *   2. ema_slope:    sign(slope) × min(|slope| / 0.005, 1)
 *   3. macd_hist:    sign(macdHist) × min(|macdHist| / typical_range, 1)
 *   4. price_vs_ema: sign(priceVsEma) × min(|priceVsEma| / 0.01, 1)
 * Weighted: [0.35, 0.25, 0.20, 0.20]  (cross dominant; slope supports)
 * Clamped to [-1, 1].
 *
 * FAIL-SOFT: bars too short (< MIN_BARS_FOR_SCORE) → ok:false, everything 0/null.
 */
export function scoreTimeframe(bars, opts = {}) {
  const FAIL = { dir: 'none', score: 0, ema20: 0, ema50: 0, slope: 0, macdHist: 0, priceVsEma: 0, ok: false };

  // Validate input
  if (!Array.isArray(bars) || bars.length < MIN_BARS_FOR_SCORE) return FAIL;

  // Extract closes — filter to only finite values aligned to bars positions
  const closes = bars.map(b => {
    if (!b || b.close == null) return NaN;
    const c = Number(b.close);
    return Number.isFinite(c) ? c : NaN;
  });

  // Need at least MIN_BARS_FOR_SCORE finite closes
  const finiteCount = closes.filter(Number.isFinite).length;
  if (finiteCount < MIN_BARS_FOR_SCORE) return FAIL;

  // ── EMA 20 ─────────────────────────────────────────────────────────────────
  const ema20Arr = ema(closes, 20);
  const ema20 = lastNonNull(ema20Arr);
  if (ema20 == null) return FAIL;

  // Slope: (ema20[latest] - ema20[latest - SLOPE_LOOKBACK]) / ema20[latest - SLOPE_LOOKBACK]
  // Use nthFromEnd to find a non-null value SLOPE_LOOKBACK bars ago.
  // We search back from the latest for a non-null anchor.
  const slopeAnchor = nthFromEnd(ema20Arr, SLOPE_LOOKBACK);
  const slope = (ema20 != null && slopeAnchor != null && slopeAnchor !== 0)
    ? (ema20 - slopeAnchor) / slopeAnchor
    : 0;

  // ── EMA 50 ─────────────────────────────────────────────────────────────────
  const ema50Arr = ema(closes, 50);
  const ema50 = lastNonNull(ema50Arr);
  if (ema50 == null) return FAIL;

  // ── MACD histogram ─────────────────────────────────────────────────────────
  const macdResult = macd(closes);          // { macd:[], signal:[], histogram:[] }
  const macdHist = lastNonNull(macdResult.histogram) ?? 0;

  // ── price vs EMA20 ─────────────────────────────────────────────────────────
  const lastClose = lastNonNull(closes);
  if (lastClose == null) return FAIL;
  const priceVsEma = ema20 !== 0 ? (lastClose - ema20) / ema20 : 0;

  // ── Sub-signal computation ──────────────────────────────────────────────────

  // 1. EMA cross: sign(ema20 - ema50) × normalised gap
  //    Gap normalised by price: gap% = (ema20 - ema50) / ema50
  //    Scale: ±1% gap → ±1 signal (anything ≥1% is saturated)
  const crossGap = ema50 !== 0 ? (ema20 - ema50) / ema50 : 0;
  const s_cross = clamp(crossGap / 0.01, -1, 1);

  // 2. EMA slope: sign × magnitude, saturates at ±0.5% change per SLOPE_LOOKBACK bars
  const s_slope = clamp(slope / 0.005, -1, 1);

  // 3. MACD histogram: normalise by a rough typical range.
  //    We use a dynamic range: max |hist| in the array (bounded to avoid division by 0).
  const histArr = macdResult.histogram.filter(Number.isFinite);
  const histRange = histArr.length > 0
    ? Math.max(Math.abs(Math.min(...histArr)), Math.abs(Math.max(...histArr)), 1e-10)
    : 1e-10;
  const s_macd = clamp(macdHist / histRange, -1, 1);

  // 4. Price vs EMA20: saturates at ±1% deviation
  const s_price = clamp(priceVsEma / 0.01, -1, 1);

  // ── Weighted blend ─────────────────────────────────────────────────────────
  const score = clamp(
    0.35 * s_cross +
    0.25 * s_slope +
    0.20 * s_macd  +
    0.20 * s_price,
    -1, 1
  );

  const dir = score > 0.05 ? 'up' : score < -0.05 ? 'down' : 'none';

  return {
    dir,
    score,
    ema20,
    ema50,
    slope,
    macdHist,
    priceVsEma,
    ok: true,
  };
}

// ── PURE CORE: computeConfluenceFromBars ──────────────────────────────────────

/**
 * computeConfluenceFromBars(barsByTf, opts) → {
 *   bias:          'long'|'short'|'neutral',
 *   confluence:    number,   // 0..1  strength of alignment = |weightedScore| renorm'd
 *   confidence:    number,   // 0..1  monotone map of confluence
 *   agreement:     number,   // count of ok TFs whose dir matches bias sign
 *   activeTfs:     number,   // ok:true count
 *   weightedScore: number,   // Σ(weight·score) / Σ(active weights)  ∈ [-1,1]
 *   perTf:         [{ tf, dir, score, weight, ok }]
 * }
 *
 * barsByTf = { '1w':[bars], '4h':[bars], ... }  any subset of DEFAULT_TIMEFRAMES
 *
 * MISSING TF: ok:false TFs drop from the weight normaliser — missing weekly
 * does NOT zero the score; it simply removes 0.30 from the denominator.
 *
 * CONFIDENCE MAP:
 *   confidence = confluence^0.7
 *   Rationale: sub-linear mapping — keeps mid-range confluence from collapsing
 *   to low confidence too fast. At confluence=0 → confidence=0;
 *   at confluence=1 → confidence=1; at confluence=0.5 → confidence≈0.615.
 *   This is intentional: a 50% confluence (mild agreement) should yield
 *   meaningful but not full confidence.
 */
export function computeConfluenceFromBars(barsByTf, opts = {}) {
  const weights  = opts.weights      ?? DEFAULT_WEIGHTS;
  const tfs      = opts.timeframes   ?? DEFAULT_TIMEFRAMES;
  const band     = opts.neutralBand  ?? DEFAULT_NEUTRAL_BAND;

  const perTf = [];
  let weightedScoreSum = 0;
  let activeWeightSum  = 0;

  for (const tf of tfs) {
    const w    = weights[tf] ?? 0;
    const bars = barsByTf?.[tf];
    const result = scoreTimeframe(Array.isArray(bars) ? bars : []);

    perTf.push({ tf, dir: result.dir, score: result.score, weight: w, ok: result.ok });

    if (result.ok) {
      weightedScoreSum += w * result.score;
      activeWeightSum  += w;
    }
  }

  // Renormalise by active weight — missing TFs drop weight, not score
  const weightedScore = activeWeightSum > 0
    ? clamp(weightedScoreSum / activeWeightSum, -1, 1)
    : 0;

  const activeTfs = perTf.filter(t => t.ok).length;

  // Bias
  const bias = weightedScore >= band
    ? 'long'
    : weightedScore <= -band
      ? 'short'
      : 'neutral';

  // Confluence = |weightedScore| (already in [0,1] after clamp+renorm)
  const confluence = Math.abs(weightedScore);

  // Confidence: sub-linear map so partial agreement yields meaningful signal
  // confidence = confluence^0.7
  const confidence = confluence > 0 ? Math.pow(confluence, 0.7) : 0;

  // Agreement count: how many ok TFs point in bias direction
  let agreement = 0;
  if (bias === 'long')  agreement = perTf.filter(t => t.ok && t.dir === 'up').length;
  if (bias === 'short') agreement = perTf.filter(t => t.ok && t.dir === 'down').length;

  return {
    bias,
    confluence,
    confidence,
    agreement,
    activeTfs,
    weightedScore,
    perTf,
  };
}

// ── ASYNC WRAPPER: getConfluence ──────────────────────────────────────────────

// In-process cache: Map<string, { bars, expiresAt }>
// key = `${symbol}:${tf}`
const _cache = new Map();

/**
 * getConfluence({
 *   getCandles,   // injectable; defaults to PerpAdapter.getCandles
 *   symbol,       // e.g. 'BTCUSDT'
 *   timeframes,   // array of TF strings; defaults to DEFAULT_TIMEFRAMES
 *   weights,      // per-TF weight map; defaults to DEFAULT_WEIGHTS
 *   ttl,          // per-TF TTL seconds; defaults to DEFAULT_TTL
 *   limit,        // candle count per TF; default 200
 *   now,          // injectable seconds timestamp (for tests); default Date.now()/1000
 * }) → <same shape as computeConfluenceFromBars> + { symbol, fetchedAt }
 *
 * CACHE: per (symbol,tf) keyed by `symbol:tf`. TTL is per-TF so weekly bars
 * are not refetched on every 1m cycle. `now` is injectable for deterministic tests.
 *
 * FAIL-SOFT: a fetch failure on any TF logs a warning and marks that TF ok:false.
 */
export async function getConfluence({
  getCandles: getCandlesFn,
  symbol,
  timeframes,
  weights,
  ttl,
  limit,
  now: nowFn,
  regimeAnchor,
  classifyRegime: classifyRegimeFn,
} = {}) {
  const fetchFn  = typeof getCandlesFn === 'function' ? getCandlesFn : PerpAdapter.getCandles;
  const tfs      = timeframes  ?? DEFAULT_TIMEFRAMES;
  const wts      = weights     ?? DEFAULT_WEIGHTS;
  const ttlMap   = ttl         ?? DEFAULT_TTL;
  const lim      = limit       ?? DEFAULT_LIMIT;
  const nowSec   = typeof nowFn === 'function' ? nowFn() : (typeof nowFn === 'number' ? nowFn : Date.now() / 1000);
  const sym      = typeof symbol === 'string' ? symbol : 'BTCUSDT';
  // Regime is anchored to a single higher TF (default 1h — the intraday anchor; owner: "1h+ matters").
  // It reuses the bars already fetched for that TF below → ZERO extra network. Injectable for tests.
  const anchorTf = typeof regimeAnchor === 'string' ? regimeAnchor : '1h';
  const regimeFn = typeof classifyRegimeFn === 'function' ? classifyRegimeFn : _classifyRegime;

  const barsByTf = {};

  await Promise.all(tfs.map(async tf => {
    const cacheKey = `${sym}:${tf}`;
    const cached   = _cache.get(cacheKey);
    const tfTtl    = ttlMap[tf] ?? 60;

    if (cached && nowSec < cached.expiresAt) {
      barsByTf[tf] = cached.bars;
      return;
    }

    try {
      const result = await fetchFn(sym, { interval: tf, limit: lim });
      const bars = result?.candles ?? [];
      barsByTf[tf] = bars;
      _cache.set(cacheKey, { bars, expiresAt: nowSec + tfTtl });
    } catch (err) {
      // Fail-soft: TF absent → scoreTimeframe will return ok:false
      barsByTf[tf] = [];
      // Don't cache failures — retry next cycle
    }
  }));

  const result = computeConfluenceFromBars(barsByTf, { weights: wts, timeframes: tfs });

  // Regime STATE on the anchor TF's already-fetched bars (zero extra network). Fail-soft: if the
  // anchor TF wasn't fetched / is short, classifyRegime returns its ok:false shape (regime:'ranging').
  let regime = null;
  try {
    regime = regimeFn(Array.isArray(barsByTf[anchorTf]) ? barsByTf[anchorTf] : []);
  } catch (_e) {
    regime = null; // fail-soft — regime is advisory context, never breaks the confluence read
  }

  return {
    ...result,
    regime,
    regimeAnchor: anchorTf,
    symbol: sym,
    fetchedAt: nowSec,
  };
}

// ── SELF-TEST (main-guarded) ──────────────────────────────────────────────────

const _isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (_isMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (cond, label) => {
    if (cond) {
      pass++;
    } else {
      fail++;
      console.error(`FAIL: ${label}`);
    }
  };
  const near = (a, b, eps = 1e-9) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= eps;

  // ── HELPERS for building synthetic bars ──────────────────────────────────────

  /**
   * Build trending bars: startPrice moving by `step` per bar.
   * step > 0 = uptrend, step < 0 = downtrend.
   */
  function makeBars(count, startPrice, step) {
    return Array.from({ length: count }, (_, i) => {
      const c = startPrice + step * i;
      return {
        timestamp: 1700000000 + i * 60,
        open:  c - Math.abs(step) * 0.3,
        high:  c + Math.abs(step) * 0.5,
        low:   c - Math.abs(step) * 0.5,
        close: c,
        volume: 1000,
      };
    });
  }

  const UP_BARS   = makeBars(200, 100, 0.5);   // clear uptrend
  const DOWN_BARS = makeBars(200, 200, -0.5);  // clear downtrend
  const FLAT_BARS = makeBars(200, 100, 0);     // flat / sideways

  // ── TEST 1: All 6 TFs clean uptrend → bias 'long', high confluence, agreement 6 ──
  {
    const allUp = {
      '1w': UP_BARS, '4h': UP_BARS, '1h': UP_BARS,
      '15m': UP_BARS, '5m': UP_BARS, '1m': UP_BARS,
    };
    const r = computeConfluenceFromBars(allUp);
    ok(r.bias === 'long',      `[T1] all-up → bias=long (got ${r.bias})`);
    ok(r.confluence > 0.6,     `[T1] all-up → confluence>0.6 (got ${r.confluence.toFixed(3)})`);
    ok(r.agreement === 6,      `[T1] all-up → agreement=6 (got ${r.agreement})`);
    ok(r.activeTfs === 6,      `[T1] all-up → activeTfs=6 (got ${r.activeTfs})`);
    ok(r.weightedScore > 0.15, `[T1] all-up → weightedScore>0.15 (got ${r.weightedScore.toFixed(3)})`);
    console.log(`  T1 all-up: bias=${r.bias} confluence=${r.confluence.toFixed(3)} confidence=${r.confidence.toFixed(3)} agreement=${r.agreement}`);
  }

  // ── TEST 2: All 6 TFs downtrend → bias 'short' ───────────────────────────────
  {
    const allDown = {
      '1w': DOWN_BARS, '4h': DOWN_BARS, '1h': DOWN_BARS,
      '15m': DOWN_BARS, '5m': DOWN_BARS, '1m': DOWN_BARS,
    };
    const r = computeConfluenceFromBars(allDown);
    ok(r.bias === 'short',          `[T2] all-down → bias=short (got ${r.bias})`);
    ok(r.confluence > 0.6,          `[T2] all-down → confluence>0.6 (got ${r.confluence.toFixed(3)})`);
    ok(r.weightedScore < -0.15,     `[T2] all-down → weightedScore<-0.15 (got ${r.weightedScore.toFixed(3)})`);
    console.log(`  T2 all-down: bias=${r.bias} confluence=${r.confluence.toFixed(3)} agreement=${r.agreement}`);
  }

  // ── TEST 3: WEEKLY+4h+1h UP, 1m+5m DOWN → bias 'long', reduced confluence ────
  // Core anti-counter-trend property: higher TFs dominate
  {
    const allUp = {
      '1w': UP_BARS, '4h': UP_BARS, '1h': UP_BARS,
      '15m': UP_BARS, '5m': UP_BARS, '1m': UP_BARS,
    };
    const rUnanimous = computeConfluenceFromBars(allUp);

    const conflict = {
      '1w': UP_BARS, '4h': UP_BARS, '1h': UP_BARS,      // up  (weight=0.75)
      '15m': UP_BARS, '5m': DOWN_BARS, '1m': DOWN_BARS, // mix (weight=0.25)
    };
    const rConflict = computeConfluenceFromBars(conflict);

    ok(rConflict.bias === 'long',
      `[T3] higher-TF up + lower-TF down → bias=long (got ${rConflict.bias})`);
    ok(rConflict.confluence < rUnanimous.confluence,
      `[T3] conflict confluence (${rConflict.confluence.toFixed(3)}) < unanimous confluence (${rUnanimous.confluence.toFixed(3)})`);
    ok(rConflict.weightedScore > 0,
      `[T3] conflict weightedScore>0 (got ${rConflict.weightedScore.toFixed(3)})`);
    console.log(`  T3 conflict: bias=${rConflict.bias} confluence=${rConflict.confluence.toFixed(3)} (vs unanimous=${rUnanimous.confluence.toFixed(3)})`);
  }

  // ── TEST 4: Even split / contradictory → bias 'neutral' ──────────────────────
  // Use flat bars (score≈0) to force the neutralBand condition
  {
    const mixed = {
      '1w': FLAT_BARS, '4h': FLAT_BARS, '1h': FLAT_BARS,
      '15m': FLAT_BARS, '5m': FLAT_BARS, '1m': FLAT_BARS,
    };
    const r = computeConfluenceFromBars(mixed);
    ok(r.bias === 'neutral',
      `[T4] all-flat → bias=neutral (got ${r.bias}, weightedScore=${r.weightedScore.toFixed(4)})`);
    console.log(`  T4 flat/neutral: bias=${r.bias} weightedScore=${r.weightedScore.toFixed(4)}`);
  }

  // ── TEST 5: Missing weekly (5 TFs) → works, no NaN, weights renormalized ──────
  {
    const noWeekly = {
      '4h': UP_BARS, '1h': UP_BARS,
      '15m': UP_BARS, '5m': UP_BARS, '1m': UP_BARS,
    };
    const r = computeConfluenceFromBars(noWeekly);
    ok(r.bias === 'long',               `[T5] no-weekly → bias=long (got ${r.bias})`);
    ok(Number.isFinite(r.confluence),   `[T5] no-weekly → confluence is finite (got ${r.confluence})`);
    ok(Number.isFinite(r.confidence),   `[T5] no-weekly → confidence is finite (got ${r.confidence})`);
    ok(!Number.isNaN(r.weightedScore),  `[T5] no-weekly → weightedScore not NaN (got ${r.weightedScore})`);
    ok(r.activeTfs === 5,               `[T5] no-weekly → activeTfs=5 (got ${r.activeTfs})`);
    // The 5-TF score should still be a strong 'long' — just renorm'd over 0.70 weight
    ok(r.confluence > 0.5,             `[T5] no-weekly → confluence>0.5 (got ${r.confluence.toFixed(3)})`);
    console.log(`  T5 no-weekly: bias=${r.bias} confluence=${r.confluence.toFixed(3)} activeTfs=${r.activeTfs}`);
  }

  // ── TEST 6: async getConfluence with stub fetcher ─────────────────────────────
  {
    let callCounts = {};
    const stubFetcher = async (sym, { interval, limit }) => {
      callCounts[interval] = (callCounts[interval] ?? 0) + 1;
      return { candles: interval === '1w' ? DOWN_BARS : UP_BARS };
    };

    // Clear the module cache between test runs by using a fresh time base
    const T0 = 1_700_000_000;

    // First call — should fetch all 6 TFs
    const r1 = await getConfluence({
      getCandles: stubFetcher,
      symbol: 'TESTUSDT',
      now: T0,
    });

    ok(typeof r1.bias === 'string',     `[T6] first call → has bias (got ${r1.bias})`);
    ok(r1.symbol === 'TESTUSDT',        `[T6] first call → symbol preserved`);
    ok(Number.isFinite(r1.fetchedAt),   `[T6] first call → fetchedAt is finite`);
    ok(Number.isFinite(r1.confidence),  `[T6] first call → confidence is finite`);
    ok(r1.regime && r1.regime.ok === true, `[T6] regime present + ok (anchor 1h on UP_BARS → got ${r1.regime?.regime}/${r1.regime?.trendDir})`);
    ok(r1.regimeAnchor === '1h',        `[T6] regimeAnchor='1h' (got ${r1.regimeAnchor})`);

    const firstCallTotalCalls = Object.values(callCounts).reduce((a, b) => a + b, 0);
    ok(firstCallTotalCalls === 6,
      `[T6] first call → exactly 6 fetches (got ${firstCallTotalCalls})`);

    // Second call at T0+5 — all short-TTL TFs (1m=10s, 5m=30s) still cached
    // Only 1m (TTL=10s) is still fresh at T0+5. We need to verify 1w (TTL=3600) is cached.
    const countsBefore2nd = { ...callCounts };
    const r2 = await getConfluence({
      getCandles: stubFetcher,
      symbol: 'TESTUSDT',
      now: T0 + 5,  // 5 seconds later — all TFs still within TTL
    });

    const callsDuring2nd = Object.entries(callCounts).reduce((acc, [k, v]) => {
      acc[k] = v - (countsBefore2nd[k] ?? 0);
      return acc;
    }, {});
    const total2nd = Object.values(callsDuring2nd).reduce((a, b) => a + b, 0);
    ok(total2nd === 0,
      `[T6] second call (5s later) → 0 fetches (all cached) (got ${total2nd} fetches: ${JSON.stringify(callsDuring2nd)})`);

    // Third call at T0+15 — 1m (TTL=10) should have expired, others still cached
    const countsBefore3rd = { ...callCounts };
    const r3 = await getConfluence({
      getCandles: stubFetcher,
      symbol: 'TESTUSDT',
      now: T0 + 15,  // 1m expired (TTL=10), 5m still cached (TTL=30)
    });

    const callsDuring3rd = Object.entries(callCounts).reduce((acc, [k, v]) => {
      acc[k] = v - (countsBefore3rd[k] ?? 0);
      return acc;
    }, {});
    ok(callsDuring3rd['1m'] === 1,
      `[T6] third call (15s later) → 1m refetched (got ${callsDuring3rd['1m']})`);
    ok((callsDuring3rd['1w'] ?? 0) === 0,
      `[T6] third call → 1w not refetched (got ${callsDuring3rd['1w'] ?? 0})`);
    ok((callsDuring3rd['5m'] ?? 0) === 0,
      `[T6] third call → 5m not refetched (got ${callsDuring3rd['5m'] ?? 0})`);

    console.log(`  T6 async stub: r1.bias=${r1.bias} r1.confidence=${r1.confidence.toFixed(3)} call-pattern=[${firstCallTotalCalls}→0→1m-only]`);
  }

  // ── TEST 7: empty / garbage input → fail-soft, no throw ──────────────────────
  {
    let threw = false;
    let r;
    try {
      r = computeConfluenceFromBars({});
    } catch (e) {
      threw = true;
    }
    ok(!threw,                          `[T7] empty barsByTf → no throw`);
    ok(r.bias === 'neutral',            `[T7] empty → bias=neutral (got ${r?.bias})`);
    ok(r.activeTfs === 0,               `[T7] empty → activeTfs=0 (got ${r?.activeTfs})`);
    ok(Number.isFinite(r.confluence),   `[T7] empty → confluence finite (got ${r?.confluence})`);

    // Garbage values
    let threw2 = false;
    try {
      computeConfluenceFromBars({ '1w': null, '4h': 'garbage', '1m': [{ close: NaN }] });
    } catch (e) {
      threw2 = true;
    }
    ok(!threw2, `[T7] garbage input → no throw`);

    // scoreTimeframe with too-short bars
    const short = scoreTimeframe([{ close: 100 }, { close: 101 }]);
    ok(short.ok === false,   `[T7] scoreTimeframe too-short → ok=false (got ${short.ok})`);
    ok(short.score === 0,    `[T7] scoreTimeframe too-short → score=0 (got ${short.score})`);

    // scoreTimeframe with empty array
    const empty = scoreTimeframe([]);
    ok(empty.ok === false,   `[T7] scoreTimeframe empty → ok=false`);

    // scoreTimeframe with undefined
    let threw3 = false;
    try { scoreTimeframe(undefined); } catch(e) { threw3 = true; }
    ok(!threw3, `[T7] scoreTimeframe(undefined) → no throw`);

    console.log(`  T7 fail-soft: all no-throw, bias=${r.bias}, activeTfs=${r.activeTfs}`);
  }

  // ── TEST 8: scoreTimeframe basic sanity ──────────────────────────────────────
  {
    const upResult   = scoreTimeframe(UP_BARS);
    const downResult = scoreTimeframe(DOWN_BARS);

    ok(upResult.ok === true,        `[T8] up → ok=true`);
    ok(upResult.dir === 'up',       `[T8] up → dir='up' (got ${upResult.dir})`);
    ok(upResult.score > 0,          `[T8] up → score>0 (got ${upResult.score.toFixed(3)})`);

    ok(downResult.ok === true,      `[T8] down → ok=true`);
    ok(downResult.dir === 'down',   `[T8] down → dir='down' (got ${downResult.dir})`);
    ok(downResult.score < 0,        `[T8] down → score<0 (got ${downResult.score.toFixed(3)})`);

    console.log(`  T8 scoreTimeframe: up.score=${upResult.score.toFixed(3)} down.score=${downResult.score.toFixed(3)}`);
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  console.log(`\nmulti-tf-confluence --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
