#!/usr/bin/env node
// @capability: high-mover-scanner
// @serves: dynamic symbol selection | high-volatility ranking | movement score | crypto universe scan | tradeable symbols
// @does: ranks the perp universe by realized volatility + ATR% + range% + volume surge into a single movementScore; scans concurrently with fail-open per-symbol error handling, filters by minVolumeUsd, returns top-N movers for dynamic symbol selection in the trading engine
// @use: call scanMovers() before each trading cycle to replace the fixed 3-symbol list with the highest-opportunity perps right now; feed the result into depth-book collector + execution engine; inject getMarkets/getCandles for offline tests
// @exports: computeMovementScore, rankMovers, scanMovers, MOVEMENT_WEIGHTS, DEFAULT_SCAN_OPTS

/**
 * high-mover-scanner.mjs
 * ──────────────────────
 * GOAL: trade what's MOVING, not a fixed 3 symbols.
 *
 * Feeds dynamic symbol selection into the depth-book collector and execution
 * engine. The same approach extends to Binance SPOT by wiring a different
 * getMarkets/getCandles that points at the SPOT REST endpoints
 * (api.binance.com /api/v3/exchangeInfo + /api/v3/klines) — no changes needed
 * inside this module.
 *
 * Candle convention (perp-adapter): ascending, oldest-first.
 *
 * MOVEMENT_WEIGHTS (documented):
 *   realizedVol  0.40 — annualized σ of log returns; the dominant signal
 *   atrPct       0.30 — ATR/price (normalized bar-level range)
 *   rangePct     0.20 — window H-L span / mean close (macro range breadth)
 *   volSurge     0.10 — recent/trailing volume ratio (confirms the move)
 *
 * All four components are normalised 0–1 within rankMovers before blending so
 * no single unit-scale dominates. computeMovementScore returns un-normalised
 * component values for transparency; the blended score is not normalised at
 * the per-symbol level (that only makes sense across the population).
 */

// ─────────────────────────────────────────────────────────────────────────────
// §1  STABLECOIN FILTER
// ─────────────────────────────────────────────────────────────────────────────

const STABLE_BASES = new Set(['USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDP', 'USDD', 'FRAX']);

function isPerpUsdtMarket(m) {
  if (!m) return false;
  if (m.contractType !== 'PERPETUAL') return false;
  if (m.quote !== 'USDT') return false;
  if (STABLE_BASES.has(m.base)) return false;
  if (m.status && m.status !== 'TRADING') return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2  BLEND WEIGHTS (documented at module top)
// ─────────────────────────────────────────────────────────────────────────────

export const MOVEMENT_WEIGHTS = Object.freeze({
  realizedVol: 0.40,
  atrPct:      0.30,
  rangePct:    0.20,
  volSurge:    0.10,
});

// ─────────────────────────────────────────────────────────────────────────────
// §3  computeMovementScore — pure, fail-open
// ─────────────────────────────────────────────────────────────────────────────

const BARS_PER_YEAR_5M = 365 * 24 * 12; // 105,120 × 5m bars per year

/**
 * computeMovementScore(candles, opts) →
 *   { movementScore, realizedVol, atrPct, rangePct, volSurge }
 *
 * All inputs validated; NaN/null/empty → safe zero-defaults, never throws.
 *
 * @param {Array<{open,high,low,close,volume}>} candles  ascending (oldest-first)
 * @param {{ barsPerYear?: number, recentFrac?: number }} opts
 *   barsPerYear  — annualisation factor (default: 5m bars/year = 105120)
 *   recentFrac   — fraction of window used for "recent" in volSurge (default 0.25)
 */
export function computeMovementScore(candles, opts = {}) {
  const SAFE = { movementScore: 0, realizedVol: 0, atrPct: 0, rangePct: 0, volSurge: 0 };

  if (!Array.isArray(candles) || candles.length < 2) return SAFE;

  const barsPerYear = (opts.barsPerYear != null && Number.isFinite(opts.barsPerYear) && opts.barsPerYear > 0)
    ? opts.barsPerYear
    : BARS_PER_YEAR_5M;

  const recentFrac = (opts.recentFrac != null && Number.isFinite(opts.recentFrac) && opts.recentFrac > 0 && opts.recentFrac < 1)
    ? opts.recentFrac
    : 0.25;

  // Sanitise candles — keep only rows with finite OHLCV
  const bars = candles.filter(c =>
    c != null &&
    Number.isFinite(Number(c.close)) && Number(c.close) > 0 &&
    Number.isFinite(Number(c.high)) &&
    Number.isFinite(Number(c.low)) &&
    Number.isFinite(Number(c.open)) &&
    Number.isFinite(Number(c.volume))
  ).map(c => ({
    o: Number(c.open),
    h: Number(c.high),
    l: Number(c.low),
    c: Number(c.close),
    v: Number(c.volume),
  }));

  if (bars.length < 2) return SAFE;

  const n = bars.length;

  // ── realizedVol: annualised σ of log returns ─────────────────────────────
  const logRets = [];
  for (let i = 1; i < n; i++) {
    const prev = bars[i - 1].c;
    const curr = bars[i].c;
    if (prev > 0 && curr > 0) {
      logRets.push(Math.log(curr / prev));
    }
  }

  let realizedVol = 0;
  if (logRets.length >= 1) {
    const mean = logRets.reduce((s, x) => s + x, 0) / logRets.length;
    const variance = logRets.reduce((s, x) => s + (x - mean) ** 2, 0) / logRets.length;
    realizedVol = Math.sqrt(variance * barsPerYear); // annualise
    if (!Number.isFinite(realizedVol)) realizedVol = 0;
  }

  // ── atrPct: ATR / mean close ─────────────────────────────────────────────
  // ATR = mean of true ranges over the window
  const trueRanges = [];
  for (let i = 1; i < n; i++) {
    const b = bars[i];
    const prevC = bars[i - 1].c;
    const tr = Math.max(
      b.h - b.l,
      Math.abs(b.h - prevC),
      Math.abs(b.l - prevC)
    );
    if (Number.isFinite(tr)) trueRanges.push(tr);
  }

  const meanClose = bars.reduce((s, b) => s + b.c, 0) / n;
  let atrPct = 0;
  if (trueRanges.length > 0 && meanClose > 0) {
    const atr = trueRanges.reduce((s, x) => s + x, 0) / trueRanges.length;
    atrPct = atr / meanClose;
    if (!Number.isFinite(atrPct)) atrPct = 0;
  }

  // ── rangePct: (maxHigh − minLow) / meanClose ─────────────────────────────
  let maxHigh = -Infinity;
  let minLow = Infinity;
  for (const b of bars) {
    if (b.h > maxHigh) maxHigh = b.h;
    if (b.l < minLow) minLow = b.l;
  }
  let rangePct = 0;
  if (meanClose > 0 && Number.isFinite(maxHigh) && Number.isFinite(minLow)) {
    rangePct = (maxHigh - minLow) / meanClose;
    if (!Number.isFinite(rangePct)) rangePct = 0;
  }

  // ── volSurge: recent-vol / trailing-avg-vol ───────────────────────────────
  // "recent" = last recentFrac of bars; "trailing" = remaining earlier bars
  const recentCount = Math.max(1, Math.round(n * recentFrac));
  const trailingCount = n - recentCount;

  let volSurge = 1; // neutral when there is no trailing history
  if (trailingCount > 0) {
    const recentBars = bars.slice(n - recentCount);
    const trailingBars = bars.slice(0, trailingCount);
    const recentAvg = recentBars.reduce((s, b) => s + b.v, 0) / recentBars.length;
    const trailingAvg = trailingBars.reduce((s, b) => s + b.v, 0) / trailingBars.length;
    if (trailingAvg > 0 && Number.isFinite(recentAvg) && Number.isFinite(trailingAvg)) {
      volSurge = recentAvg / trailingAvg;
      if (!Number.isFinite(volSurge) || volSurge < 0) volSurge = 1;
    }
  }

  // ── blended score (raw, un-normalised across population) ─────────────────
  // Cross-population normalisation happens in rankMovers; here we just blend
  // the components with their weights to give a usable per-symbol number.
  // volSurge is naturally near 1.0 so we cap it to avoid it dominating.
  const cappedVolSurge = Math.min(volSurge, 10);
  const movementScore =
    MOVEMENT_WEIGHTS.realizedVol * realizedVol +
    MOVEMENT_WEIGHTS.atrPct      * atrPct +
    MOVEMENT_WEIGHTS.rangePct    * rangePct +
    MOVEMENT_WEIGHTS.volSurge    * (cappedVolSurge / 10); // rescale 0–10 → 0–1

  return {
    movementScore: Number.isFinite(movementScore) ? movementScore : 0,
    realizedVol,
    atrPct,
    rangePct,
    volSurge,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  rankMovers — pure, fail-open
// ─────────────────────────────────────────────────────────────────────────────

/**
 * rankMovers(statsArray, { topN, minVolumeUsd }) → sorted, filtered top-N
 *
 * @param {Array<{symbol, movementScore, realizedVol, atrPct, rangePct, volSurge, volumeUsd24h?}>} statsArray
 * @param {{ topN?: number, minVolumeUsd?: number }} opts
 */
export function rankMovers(statsArray, opts = {}) {
  if (!Array.isArray(statsArray) || statsArray.length === 0) return [];

  const topN = (opts.topN != null && Number.isFinite(opts.topN) && opts.topN > 0)
    ? Math.round(opts.topN)
    : 15;
  const minVolumeUsd = (opts.minVolumeUsd != null && Number.isFinite(opts.minVolumeUsd) && opts.minVolumeUsd >= 0)
    ? opts.minVolumeUsd
    : 0;

  // Filter illiquid
  const eligible = statsArray.filter(s => {
    if (!s || typeof s !== 'object') return false;
    const score = Number(s.movementScore);
    if (!Number.isFinite(score)) return false;
    if (minVolumeUsd > 0) {
      const vol = Number(s.volumeUsd24h);
      if (!Number.isFinite(vol) || vol < minVolumeUsd) return false;
    }
    return true;
  });

  if (eligible.length === 0) return [];

  // Normalise each component 0–1 across the population before blending
  // This produces a population-relative normalised movementScore
  const fields = ['realizedVol', 'atrPct', 'rangePct', 'volSurge'];
  const maxima = {};
  for (const f of fields) {
    let mx = 0;
    for (const s of eligible) {
      const v = Number(s[f]);
      if (Number.isFinite(v) && v > mx) mx = v;
    }
    maxima[f] = mx;
  }

  const scored = eligible.map(s => {
    const norm = {};
    for (const f of fields) {
      const mx = maxima[f];
      norm[f] = (mx > 0 && Number.isFinite(Number(s[f]))) ? Number(s[f]) / mx : 0;
    }
    const cappedVolSurge = Math.min(norm.volSurge, 1);
    const normScore =
      MOVEMENT_WEIGHTS.realizedVol * norm.realizedVol +
      MOVEMENT_WEIGHTS.atrPct      * norm.atrPct +
      MOVEMENT_WEIGHTS.rangePct    * norm.rangePct +
      MOVEMENT_WEIGHTS.volSurge    * cappedVolSurge;
    return { ...s, movementScore: Number.isFinite(normScore) ? normScore : 0 };
  });

  // Sort descending
  scored.sort((a, b) => (b.movementScore ?? 0) - (a.movementScore ?? 0));

  // Tag rank (1-based)
  return scored.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  DEFAULT SCAN OPTS
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SCAN_OPTS = Object.freeze({
  interval:     '5m',
  limit:        100,
  topN:         15,
  minVolumeUsd: 1_000_000,   // $1M 24h volume floor — configurable per run
  concurrency:  8,
});

// ─────────────────────────────────────────────────────────────────────────────
// §6  scanMovers — async, fail-open per symbol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * scanMovers(opts) → Promise<moversArray>
 *
 * Fetches the perp universe, scores each symbol, returns top-N movers.
 * Fails open per symbol: one bad fetch never kills the whole scan.
 *
 * @param {{
 *   getMarkets?: () => Promise<Market[]>,
 *   getCandles?: (symbol, opts) => Promise<{candles}>,
 *   interval?:   string,
 *   limit?:      number,
 *   topN?:       number,
 *   minVolumeUsd?: number,
 *   concurrency?: number,
 * }} opts
 */
export async function scanMovers(opts = {}) {
  // Default adapters (lazy-imported so tests can inject without real network)
  let { getMarkets, getCandles } = opts;

  if (typeof getMarkets !== 'function' || typeof getCandles !== 'function') {
    const adapter = await import('./adapters/perp-adapter.mjs');
    if (typeof getMarkets !== 'function') getMarkets = adapter.getMarkets;
    if (typeof getCandles !== 'function') getCandles = adapter.getCandles;
  }

  const interval   = opts.interval   ?? DEFAULT_SCAN_OPTS.interval;
  const limit      = opts.limit      ?? DEFAULT_SCAN_OPTS.limit;
  const topN       = opts.topN       ?? DEFAULT_SCAN_OPTS.topN;
  const minVolumeUsd = opts.minVolumeUsd ?? DEFAULT_SCAN_OPTS.minVolumeUsd;
  const concurrency  = (opts.concurrency != null && opts.concurrency > 0)
    ? Math.round(opts.concurrency)
    : DEFAULT_SCAN_OPTS.concurrency;

  // Fetch universe — fail-open if getMarkets errors
  let markets = [];
  try {
    const all = await getMarkets();
    markets = Array.isArray(all) ? all.filter(isPerpUsdtMarket) : [];
  } catch {
    // Universe fetch failed — return empty rather than crashing
    return [];
  }

  if (markets.length === 0) return [];

  // Concurrency-limited per-symbol fetch + score
  const stats = [];
  let idx = 0;

  async function worker() {
    while (idx < markets.length) {
      const market = markets[idx++];
      const symbol = market.symbol;
      try {
        const { candles } = await getCandles(symbol, { interval, limit });
        const score = computeMovementScore(candles);

        // Approximate 24h volume in USD: sum(close * volume) over the window
        // then scale to 24h. Not exact but sufficient for liquidity gating.
        let volumeUsd24h = 0;
        if (Array.isArray(candles) && candles.length > 0) {
          const candleVol = candles.reduce((s, c) => {
            const cv = Number(c.close) * Number(c.volume);
            return s + (Number.isFinite(cv) ? cv : 0);
          }, 0);
          // Scale window to 24h (number of intervals in 24h / limit)
          const minsPerInterval = parseIntervalMins(interval);
          const barsIn24h = minsPerInterval > 0 ? (24 * 60) / minsPerInterval : candles.length;
          volumeUsd24h = candles.length > 0
            ? candleVol * (barsIn24h / candles.length)
            : 0;
        }

        stats.push({
          symbol,
          base:        market.base,
          quote:       market.quote,
          volumeUsd24h: Number.isFinite(volumeUsd24h) ? volumeUsd24h : 0,
          ...score,
        });
      } catch {
        // Fail-open: this symbol is skipped, rest of scan continues
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, markets.length) }, worker);
  await Promise.all(workers);

  return rankMovers(stats, { topN, minVolumeUsd });
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** parseIntervalMins('5m') → 5, ('1h') → 60, ('1d') → 1440, (unknown) → 0 */
function parseIntervalMins(interval) {
  if (!interval) return 0;
  const match = interval.match(/^(\d+)([mhd])$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return n;
  if (unit === 'h') return n * 60;
  if (unit === 'd') return n * 60 * 24;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// §8  CLI SELF-TEST (--test)
// ─────────────────────────────────────────────────────────────────────────────

function isRunningAsMain() {
  return process.argv[1] && process.argv[1].endsWith('high-mover-scanner.mjs');
}

if (isRunningAsMain() && process.argv.includes('--test')) {
  (async () => {
    let passed = 0;
    let failed = 0;

    function ok(label, cond) {
      if (cond) {
        console.log(`  PASS  ${label}`);
        passed++;
      } else {
        console.error(`  FAIL  ${label}`);
        failed++;
      }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Build a synthetic candle array (ascending). */
    function makeCandles(n, baseClose, volatilityPct, volumeBase, volumeSurgeLastFrac = 1) {
      const candles = [];
      let price = baseClose;
      const surgeStart = Math.floor(n * 0.75); // last 25% of bars get the volume surge
      for (let i = 0; i < n; i++) {
        const move = price * (volatilityPct / 100) * (Math.random() * 2 - 1);
        const open = price;
        const close = Math.max(0.001, price + move);
        const high = Math.max(open, close) * (1 + Math.abs(move) / price * 0.5);
        const low = Math.min(open, close) * (1 - Math.abs(move) / price * 0.5);
        const vol = i >= surgeStart
          ? volumeBase * volumeSurgeLastFrac
          : volumeBase;
        candles.push({ open, high, low, close: Number(close.toFixed(6)), volume: vol });
        price = close;
      }
      return candles;
    }

    /** Build a flat (near-zero-vol) candle array. */
    function makeFlatCandles(n, baseClose, volume) {
      return Array.from({ length: n }, () => ({
        open: baseClose, high: baseClose + 0.0001, low: baseClose - 0.0001,
        close: baseClose, volume,
      }));
    }

    // ── Test 1: computeMovementScore basic shape ──────────────────────────
    console.log('\n[T1] computeMovementScore — returns expected fields');
    const result = computeMovementScore(makeCandles(100, 50000, 1.5, 100, 2));
    ok('returns movementScore field', 'movementScore' in result);
    ok('returns realizedVol field',   'realizedVol' in result);
    ok('returns atrPct field',        'atrPct' in result);
    ok('returns rangePct field',      'rangePct' in result);
    ok('returns volSurge field',      'volSurge' in result);
    ok('movementScore >= 0',          result.movementScore >= 0);
    ok('realizedVol >= 0',            result.realizedVol >= 0);
    ok('atrPct >= 0',                 result.atrPct >= 0);

    // ── Test 2: fail-open on bad/empty input ─────────────────────────────
    console.log('\n[T2] computeMovementScore — fail-open (bad / empty input)');
    const safeOnNull    = computeMovementScore(null);
    const safeOnEmpty   = computeMovementScore([]);
    const safeOnOnebar  = computeMovementScore([{ open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }]);
    const safeOnNaN     = computeMovementScore([{ open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN },
                                                 { open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN }]);
    ok('null input → {movementScore:0}',  safeOnNull.movementScore === 0);
    ok('empty array → {movementScore:0}', safeOnEmpty.movementScore === 0);
    ok('single bar → {movementScore:0}',  safeOnOnebar.movementScore === 0);
    ok('all-NaN candles → safe',          safeOnNaN.movementScore === 0 && safeOnNaN.realizedVol === 0);

    // ── Test 3: high-vol ranks above flat ────────────────────────────────
    console.log('\n[T3] rankMovers — high-vol symbol ranks above flat symbol');
    const highVolCandles  = makeCandles(100, 50000, 3, 1000);   // 3% per-bar vol
    const flatCandles     = makeFlatCandles(100, 100, 50);       // nearly no movement
    const highScore  = computeMovementScore(highVolCandles);
    const flatScore  = computeMovementScore(flatCandles);
    ok('highVol realizedVol > flat realizedVol', highScore.realizedVol > flatScore.realizedVol);
    ok('highVol movementScore > flat movementScore', highScore.movementScore > flatScore.movementScore);

    const stats = [
      { symbol: 'HIGHUSDT', volumeUsd24h: 5_000_000, base: 'HIGH', quote: 'USDT', ...highScore },
      { symbol: 'FLATUSDT', volumeUsd24h: 5_000_000, base: 'FLAT', quote: 'USDT', ...flatScore },
    ];
    const ranked = rankMovers(stats, { topN: 10, minVolumeUsd: 0 });
    ok('returns 2 entries',              ranked.length === 2);
    ok('HIGHUSDT ranked 1st',            ranked[0].symbol === 'HIGHUSDT');
    ok('FLATUSDT ranked 2nd',            ranked[1].symbol === 'FLATUSDT');
    ok('ranks are 1-based sequential',   ranked[0].rank === 1 && ranked[1].rank === 2);

    // ── Test 4: illiquid filtered ─────────────────────────────────────────
    console.log('\n[T4] rankMovers — illiquid symbols filtered');
    const illiquidStats = [
      { symbol: 'BIGUSDT',  volumeUsd24h: 10_000_000, ...highScore },
      { symbol: 'TINYUSDT', volumeUsd24h: 50_000,     ...highScore },
    ];
    const filteredRanked = rankMovers(illiquidStats, { topN: 10, minVolumeUsd: 1_000_000 });
    ok('only 1 entry passes $1M filter', filteredRanked.length === 1);
    ok('BIGUSDT passes filter',          filteredRanked[0].symbol === 'BIGUSDT');

    // ── Test 5: empty universe → [] ──────────────────────────────────────
    console.log('\n[T5] rankMovers / scanMovers — empty universe returns []');
    const emptyRanked = rankMovers([], {});
    ok('rankMovers empty → []', emptyRanked.length === 0);

    // scanMovers with injected empty universe
    const emptyScanned = await scanMovers({
      getMarkets: async () => [],
      getCandles:  async () => ({ candles: [] }),
    });
    ok('scanMovers empty universe → []', emptyScanned.length === 0);

    // ── Test 6: fail-open on a throwing symbol ────────────────────────────
    console.log('\n[T6] scanMovers — fail-open on a throwing symbol');
    let throwCount = 0;
    const scannedFO = await scanMovers({
      getMarkets: async () => [
        { symbol: 'GOODUSDT', base: 'GOOD', quote: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
        { symbol: 'BADUSDT',  base: 'BAD',  quote: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
      ],
      getCandles: async (symbol) => {
        if (symbol === 'BADUSDT') { throwCount++; throw new Error('simulated network error'); }
        return { candles: makeCandles(100, 50000, 2, 500) };
      },
      topN: 10,
      minVolumeUsd: 0,
    });
    ok('bad symbol did throw during test',     throwCount === 1);
    ok('scan still returns 1 good result',     scannedFO.length === 1);
    ok('surviving symbol is GOODUSDT',         scannedFO[0].symbol === 'GOODUSDT');

    // ── Test 7: high-vol actually wins in end-to-end scan ────────────────
    console.log('\n[T7] scanMovers — high-vol symbol wins over flat in full scan');
    const scannedFull = await scanMovers({
      getMarkets: async () => [
        { symbol: 'MOVINGUSDT', base: 'MOVING', quote: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
        { symbol: 'QUIETUSDT',  base: 'QUIET',  quote: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
      ],
      getCandles: async (symbol) => {
        if (symbol === 'MOVINGUSDT') return { candles: makeCandles(100, 50000, 3.5, 2000) };
        return { candles: makeFlatCandles(100, 100, 20) };
      },
      topN: 5,
      minVolumeUsd: 0,
    });
    ok('returns 2 results',            scannedFull.length === 2);
    ok('MOVINGUSDT ranked 1st',        scannedFull[0].symbol === 'MOVINGUSDT');

    // ── Test 8: stablecoin bases filtered out ─────────────────────────────
    console.log('\n[T8] scanMovers — stablecoin bases excluded from universe');
    const scannedStable = await scanMovers({
      getMarkets: async () => [
        { symbol: 'BTCUSDT',   base: 'BTC',   quote: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
        { symbol: 'USDCUSDT',  base: 'USDC',  quote: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
        { symbol: 'FDUSDUSDT', base: 'FDUSD', quote: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
      ],
      getCandles: async () => ({ candles: makeCandles(100, 50000, 2, 500) }),
      topN: 10,
      minVolumeUsd: 0,
    });
    ok('only BTC passes stablecoin filter', scannedFull.every(r => !STABLE_BASES.has(r.base)));
    ok('returned 1 symbol (BTC)',           scannedStable.length === 1);
    ok('BTCUSDT is the survivor',           scannedStable[0].symbol === 'BTCUSDT');

    // ── Test 9: volSurge > 1 when recent bars have higher volume ─────────
    console.log('\n[T9] computeMovementScore — volSurge reflects volume spike');
    const surgeCandles = makeCandles(100, 50000, 1, 100, 5); // 5× surge in last 25%
    const surgeScore   = computeMovementScore(surgeCandles);
    ok('volSurge > 1 on surging volume', surgeScore.volSurge > 1);

    // ── SUMMARY ──────────────────────────────────────────────────────────
    console.log(`\n──────────────────────────────────────────`);
    console.log(`  high-mover-scanner --test: ${passed} passed, ${failed} failed`);
    console.log(`──────────────────────────────────────────\n`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
