LLM_COMPAT_WARN code=0 lane=ollama-cloud reason=cost_admission_reject_conservative_unreliable_actuals estUsd=0.11725 cap=50
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] list_dir[0m
[2m[tool] list_dir[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] write_file[0m
[2m[tool] bash[0m
[2m[tool] grep[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
All 38 tests pass. Here is the complete module and notes.

---

## `carry-vol-signal.mjs` — complete

```js
#!/usr/bin/env node
// @capability: carry-vol-signal
// @serves: funding-carry-to-vol | vol-normalized carry | crypto perp carry efficiency | observatory carry overlay
// @does: Computes the funding-carry-to-vol ratio (annualized funding APR / annualized realized vol) for crypto perpetuals, then emits advisory directional signals. Vol-normalizes the carry gate so a flat APR threshold doesn't fire in high-vol regimes. Pure functions over injected price series; funding fetch routes through perp-adapter. Advisory only (confidence ≤ 0.65), never dominates price signals.
// @use: Reach for this in the observatory crypto cycle when you want vol-normalized carry signals instead of a flat APR threshold. The signal belongs on LONG ladder rungs (3h/12h/weekly) — funding accrues over 8h periods, the edge is multi-hour/daily, NOT 1-min scalp.
// @exports: realizedVol, carryToVol, carryVolToSignal, computeCarryVolSignals
//
// CONSTRAINTS: paper-only (INV-1 — no order path), no key reads (INV-2 — pure math + perp-adapter read), fail-open (computeCarryVolSignals never throws). No new npm dep.

import * as PerpAdapter from './adapters/perp-adapter.mjs';
import { cryptoMarketToPerpSymbol } from './perp-signals.mjs';
import { pathToFileURL } from 'node:url';

// ── DEFAULT THRESHOLDS ──────────────────────────────────────────────────────

// Minimum annualized realized vol below which the ratio is suppressed.
// 0.05 = 5% annualized. Below this, the asset is essentially flat — any carry
// ratio would be an artifact of near-zero denominator noise. Crypto perps
// typically vol at 50-150% annualized, so this only catches degenerate cases.
export const DEFAULT_MIN_VOL = 0.05;

// Minimum |funding APR| below which we don't compute the ratio.
// 0.02 = 2% APR. Below this, funding is noise — even in a low-vol regime,
// 2% carry doesn't cover execution costs or tail risk.
export const DEFAULT_MIN_FUNDING_APR = 0.02;

// |carryToVol| ratio threshold: the carry must earn at least this fraction
// of the asset's annualized vol per year to fire a signal.
// 0.15 = you earn 15% of vol per year. At 80% vol that's 12% APR funding
// needed — a meaningful edge that survives slippage and regime shifts.
export const DEFAULT_RATIO_THRESHOLD = 0.15;

// Default periods per year for 1-min bars (60*24*365).
export const DEFAULT_PERIODS_PER_YEAR_1M = 525600;

// ── realizedVol ─────────────────────────────────────────────────────────────

/**
 * realizedVol(series, opts) -> number | NaN
 * Computes annualized realized vol from a price series.
 *
 * @param {[number, number][]} series - [[ts, price], ...] sorted ascending.
 * @param {object} [opts]
 *   - periodsPerYear: number (default 525600 for 1-min bars)
 * @returns {number} annualized vol (e.g. 0.80 = 80%) | NaN on insufficient data
 *
 * Uses close-to-close log returns: std(logRets) * sqrt(periodsPerYear).
 * Returns NaN when fewer than 2 valid returns can be computed.
 */
export function realizedVol(series, opts = {}) {
  if (!Array.isArray(series) || series.length < 3) return NaN;
  const periodsPerYear = Number.isFinite(opts.periodsPerYear) ? opts.periodsPerYear : DEFAULT_PERIODS_PER_YEAR_1M;
  if (periodsPerYear <= 0) return NaN;

  const logRets = [];
  for (let i = 1; i < series.length; i++) {
    const prev = Number(series[i - 1][1]);
    const curr = Number(series[i][1]);
    if (prev <= 0 || curr <= 0) continue;
    const r = Math.log(curr / prev);
    if (Number.isFinite(r)) logRets.push(r);
  }
  if (logRets.length < 2) return NaN;

  // Sample std (ddof=1)
  const n = logRets.length;
  const mean = logRets.reduce((s, v) => s + v, 0) / n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = logRets[i] - mean;
    sumSq += d * d;
  }
  const variance = sumSq / (n - 1);
  const std = Math.sqrt(variance);
  return std * Math.sqrt(periodsPerYear);
}

// ── carryToVol ──────────────────────────────────────────────────────────────

/**
 * carryToVol(annualizedFundingApr, annualizedVol) -> number | NaN
 * Ratio of annualized funding APR to annualized realized vol.
 * Dimensionless. Returns NaN when either input is non-finite.
 * The caller is responsible for the divide-by-small-vol guard (minVol)
 * and min-funding floor — this function computes the raw ratio.
 */
export function carryToVol(annualizedFundingApr, annualizedVol) {
  const apr = Number(annualizedFundingApr);
  const vol = Number(annualizedVol);
  if (!Number.isFinite(apr) || !Number.isFinite(vol)) return NaN;
  if (vol === 0) return NaN;
  return apr / vol;
}

// ── carryVolToSignal ────────────────────────────────────────────────────────

/**
 * carryVolToSignal(annualizedFundingApr, ratio, market, ts, opts) -> signal | null
 * Converts a carry-to-vol ratio into an advisory directional signal.
 *
 * Gates (all must pass):
 *   1. |fundingApr| >= minFundingApr (default 0.02)
 *   2. |ratio| >= ratioThreshold (default 0.15) — also implicitly guards
 *      divide-by-small-vol since a tiny vol would inflate the ratio past threshold
 *
 * Side convention (matches perp-signals):
 *   fundingApr > 0 (crowded long) → 'short' (receive carry by being short)
 *   fundingApr < 0 (crowded short) → 'long'
 *
 * Confidence: advisory, capped at 0.65, scales with |ratio| above threshold.
 *
 * @param {number} annualizedFundingApr - annualized funding APR (e.g. 0.30 = 30%)
 * @param {number} ratio - carryToVol ratio (dimensionless)
 * @param {string} market - market symbol (e.g. 'BTC-USD')
 * @param {number} ts - timestamp (seconds)
 * @param {object} [opts]
 *   - minFundingApr, ratioThreshold
 * @returns {object|null} signal or null if gated
 */
export function carryVolToSignal(annualizedFundingApr, ratio, market, ts, opts = {}) {
  const apr = Number(annualizedFundingApr);
  const r = Number(ratio);
  if (!Number.isFinite(apr) || !Number.isFinite(r)) return null;
  if (!market || typeof market !== 'string') return null;
  if (!Number.isFinite(ts)) return null;

  const minFundingApr = Number.isFinite(opts.minFundingApr) ? opts.minFundingApr : DEFAULT_MIN_FUNDING_APR;
  const ratioThreshold = Number.isFinite(opts.ratioThreshold) ? opts.ratioThreshold : DEFAULT_RATIO_THRESHOLD;

  // Gate 1: min funding floor — don't fire on microscopic funding
  if (Math.abs(apr) < minFundingApr) return null;

  // Gate 2: ratio threshold — carry must be meaningful relative to risk.
  // Also implicitly guards divide-by-small-vol: if vol were near zero the
  // ratio would explode PAST threshold, not below it. The minVol guard in
  // computeCarryVolSignals catches the degenerate-vol case upstream.
  if (Math.abs(r) < ratioThreshold) return null;

  // Side: carry-receiver convention (matches perp-signals)
  const side = apr > 0 ? 'short' : 'long';

  // Confidence: advisory, scales with excess ratio above threshold, capped at 0.65
  const excess = Math.abs(r) - ratioThreshold;
  const confidence = Math.min(0.65, 0.30 + excess * 0.5);

  return {
    factorId: `carry-vol-${market}`,
    value: r,
    side,
    confidence,
    ts,
    source: 'carryvol',
  };
}

// ── computeCarryVolSignals ──────────────────────────────────────────────────

/**
 * computeCarryVolSignals(market, series, opts) -> Promise<signal[]>
 * Computes carry-vol signals for a single market.
 *
 * 1. Computes realized vol from the injected price series.
 * 2. Fetches funding via PerpAdapter (keyless public read).
 * 3. Annualizes funding.
 * 4. Computes carryToVol ratio.
 * 5. Gates and emits signal.
 *
 * FAIL-OPEN: on any error returns [] so the crypto cycle is never broken.
 *
 * @param {string} market - e.g. 'BTC-USD'
 * @param {[number, number][]} series - [[ts, price], ...] ascending
 * @param {object} [opts]
 *   - periodsPerYear: for realized vol annualization (default 525600 for 1-min bars)
 *   - periodsPerYearFunding: for funding annualization (default 1095 for 8h funding)
 *   - minVol, minFundingApr, ratioThreshold
 * @returns {Promise<signal[]>}
 */
export async function computeCarryVolSignals(market, series, opts = {}) {
  try {
    if (!market || !Array.isArray(series) || series.length < 3) return [];

    const minVol = Number.isFinite(opts.minVol) ? opts.minVol : DEFAULT_MIN_VOL;

    // Step 1: realized vol from injected price series
    const vol = realizedVol(series, opts);
    if (!Number.isFinite(vol) || vol < minVol) return [];

    // Step 2: map market to perp symbol and fetch funding
    const symbol = cryptoMarketToPerpSymbol(market);
    if (!symbol) return [];

    const funding = await PerpAdapter.getFunding(symbol);
    let ts = Math.floor(Date.now() / 1000);
    if (funding && funding.timestamp != null) {
      ts = Math.floor(Number(funding.timestamp) / 1000) || ts;
    }

    const periodsPerYearFunding = Number.isFinite(opts.periodsPerYearFunding)
      ? opts.periodsPerYearFunding
      : undefined; // PerpAdapter.annualizeFunding defaults to 1095

    const apr = PerpAdapter.annualizeFunding(
      funding?.fundingRate,
      periodsPerYearFunding,
    );
    if (apr == null || !Number.isFinite(apr)) return [];

    // Step 3: compute ratio
    const ratio = carryToVol(apr, vol);
    if (!Number.isFinite(ratio)) return [];

    // Step 4: gate and emit
    const sig = carryVolToSignal(apr, ratio, market, ts, opts);
    return sig ? [sig] : [];
  } catch (_e) {
    // fail-open
    return [];
  }
}

// ── --test self-test (deterministic, injected httpGet, no network) ──────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (c, label) => { if (c) pass++; else { fail++; console.error(`FAIL: ${label}`); } };

  // ── realizedVol ──────────────────────────────────────────────────────────
  // Empty / short series → NaN
  assert(!Number.isFinite(realizedVol([])), 'realizedVol: empty -> NaN');
  assert(!Number.isFinite(realizedVol([[0, 100]])), 'realizedVol: 1 point -> NaN');
  assert(!Number.isFinite(realizedVol([[0, 100], [1, 101]])), 'realizedVol: 2 points (<3) -> NaN');

  // Constant price → zero vol
  const constSeries = Array.from({ length: 100 }, (_, i) => [i, 100]);
  const constVol = realizedVol(constSeries, { periodsPerYear: 525600 });
  assert(Number.isFinite(constVol) && constVol < 1e-10,
    `realizedVol: constant price -> ~0 vol (got ${constVol})`);

  // Known oscillating series: prices alternate 100, 101, 100, 101...
  // Log returns: ln(101/100) ≈ +0.00995, ln(100/101) ≈ -0.00995
  // With 100 points (99 returns), alternating, std ≈ 0.00995
  // Annualized (525600 periods): 0.00995 * sqrt(525600) ≈ 7.22
  const oscSeries = Array.from({ length: 100 }, (_, i) => [i, i % 2 === 0 ? 100 : 101]);
  const oscVol = realizedVol(oscSeries, { periodsPerYear: 525600 });
  assert(Number.isFinite(oscVol) && oscVol > 5 && oscVol < 10,
    `realizedVol: oscillating 100/101 -> vol ~7.2 (got ${oscVol?.toFixed(4)})`);

  // Known trend: prices increase by 1% each period → log returns constant → std=0 → vol=0
  const trendSeries = Array.from({ length: 50 }, (_, i) => [i, 100 * Math.pow(1.01, i)]);
  const trendVol = realizedVol(trendSeries, { periodsPerYear: 525600 });
  assert(Number.isFinite(trendVol) && trendVol < 1e-10,
    `realizedVol: steady 1% trend -> ~0 vol (got ${trendVol})`);

  // Negative prices skipped — only 1 valid return survives → NaN (need ≥2)
  const negSeries = [[0, 100], [1, -5], [2, 110], [3, 99]];
  const negVol = realizedVol(negSeries, { periodsPerYear: 525600 });
  assert(!Number.isFinite(negVol),
    `realizedVol: negative price skipped, <2 valid returns -> NaN (got ${negVol})`);

  // ── carryToVol ───────────────────────────────────────────────────────────
  // Normal case: 50% APR / 80% vol = 0.625
  const r1 = carryToVol(0.50, 0.80);
  assert(Number.isFinite(r1) && Math.abs(r1 - 0.625) < 1e-10,
    `carryToVol: 50% APR / 80% vol = 0.625 (got ${r1})`);

  // Zero vol → NaN
  assert(!Number.isFinite(carryToVol(0.50, 0)), 'carryToVol: zero vol -> NaN');

  // Negative funding → negative ratio
  const rNeg = carryToVol(-0.30, 0.60);
  assert(Number.isFinite(rNeg) && rNeg < 0,
    `carryToVol: negative funding -> negative ratio (got ${rNeg})`);

  // Non-finite inputs → NaN
  assert(!Number.isFinite(carryToVol(NaN, 0.80)), 'carryToVol: NaN apr -> NaN');
  assert(!Number.isFinite(carryToVol(0.50, Infinity)), 'carryToVol: Inf vol -> NaN');

  // ── carryVolToSignal ─────────────────────────────────────────────────────
  // Strong positive funding + strong ratio → short signal
  const sigShort = carryVolToSignal(0.50, 0.625, 'BTC-USD', 1000);
  assert(sigShort !== null, 'carryVolToSignal: strong pos funding -> signal');
  assert(sigShort.side === 'short', 'carryVolToSignal: pos funding -> short (carry receiver)');
  assert(sigShort.factorId === 'carry-vol-BTC-USD', 'carryVolToSignal: factorId correct');
  assert(sigShort.source === 'carryvol', 'carryVolToSignal: source=carryvol');
  assert(sigShort.value === 0.625, 'carryVolToSignal: value = ratio');
  assert(sigShort.ts === 1000, 'carryVolToSignal: ts preserved');
  assert(sigShort.confidence <= 0.65,
    `carryVolToSignal: confidence capped <= 0.65 (got ${sigShort.confidence})`);

  // Strong negative funding + strong ratio → long signal
  const sigLong = carryVolToSignal(-0.50, -0.625, 'BTC-USD', 1000);
  assert(sigLong !== null, 'carryVolToSignal: strong neg funding -> signal');
  assert(sigLong.side === 'long', 'carryVolToSignal: neg funding -> long');

  // Sub-threshold ratio → null
  assert(carryVolToSignal(0.50, 0.05, 'BTC-USD', 1000) === null,
    'carryVolToSignal: sub-threshold ratio -> null');

  // Sub-threshold funding → null (even if ratio is high — ratio would be high
  // because vol is tiny, but the funding floor catches it first)
  assert(carryVolToSignal(0.01, 0.50, 'BTC-USD', 1000) === null,
    'carryVolToSignal: sub-threshold funding -> null');

  // Non-finite inputs → null
  assert(carryVolToSignal(NaN, 0.625, 'BTC-USD', 1000) === null,
    'carryVolToSignal: NaN apr -> null');
  assert(carryVolToSignal(0.50, NaN, 'BTC-USD', 1000) === null,
    'carryVolToSignal: NaN ratio -> null');
  assert(carryVolToSignal(0.50, 0.625, null, 1000) === null,
    'carryVolToSignal: null market -> null');
  assert(carryVolToSignal(0.50, 0.625, 'BTC-USD', NaN) === null,
    'carryVolToSignal: NaN ts -> null');

  // Confidence scaling: high excess ratio → confidence approaches cap
  const sigHigh = carryVolToSignal(1.00, 1.25, 'BTC-USD', 1000); // excess = 1.10
  assert(sigHigh !== null && sigHigh.confidence <= 0.65,
    `carryVolToSignal: high ratio confidence capped <= 0.65 (got ${sigHigh?.confidence})`);

  // ── computeCarryVolSignals end-to-end (injected httpGet) ─────────────────
  await (async () => {
    // Build a synthetic price series with ~80% annualized vol.
    // Prices alternating 100.00 / 100.11 produce log returns of ±~0.0011.
    // std ≈ 0.0011 → annualized = 0.0011 * sqrt(525600) ≈ 0.80 = 80%.
    // With 54.75% APR funding, ratio = 0.5475/0.80 ≈ 0.684 (well above 0.15).
    const series = Array.from(
      { length: 100 },
      (_, i) => [1_700_000_000 + i * 60, i % 2 === 0 ? 100.00 : 100.11],
    );

    // Mock funding: 0.05% per 8h → ~54.75% APR (well above minFundingApr=0.02)
    const fundingTime = 1_718_505_600_000;
    const mockHttpGet = async (url) => {
      if (url.includes('premiumIndex')) {
        return { status: 200, headers: {}, body: JSON.stringify({
          symbol: 'BTCUSDT', markPrice: '65000.0', indexPrice: '64980.0',
          lastFundingRate: '0.0005', time: fundingTime,
        }) };
      }
      return { status: 200, headers: {}, body: '{}' };
    };
    PerpAdapter.setHttpGet(mockHttpGet);

    const sigs = await computeCarryVolSignals('BTC-USD', series);
    assert(Array.isArray(sigs), 'computeCarryVolSignals returns array');
    assert(sigs.length === 1,
      `computeCarryVolSignals: funding+vol -> 1 signal (got ${sigs.length})`);
    assert(sigs[0].factorId === 'carry-vol-BTC-USD',
      'computeCarryVolSignals: factorId correct');
    assert(sigs[0].side === 'short',
      'computeCarryVolSignals: pos funding -> short');
    assert(sigs[0].source === 'carryvol',
      'computeCarryVolSignals: source=carryvol');
    assert(sigs[0].confidence <= 0.65,
      `computeCarryVolSignals: confidence <= 0.65 (got ${sigs[0].confidence})`);

    // Fail-open: 500 from venue → [] not throw
    PerpAdapter.setHttpGet(async () => ({ status: 500, headers: {}, body: 'err' }));
    const sigs2 = await computeCarryVolSignals('BTC-USD', series);
    assert(Array.isArray(sigs2) && sigs2.length === 0,
      'computeCarryVolSignals: venue 500 -> [] (fail-open)');

    // Fail-open: null market → []
    const sigs3 = await computeCarryVolSignals(null, series);
    assert(Array.isArray(sigs3) && sigs3.length === 0,
      'computeCarryVolSignals: null market -> []');

    // Fail-open: empty series → []
    const sigs4 = await computeCarryVolSignals('BTC-USD', []);
    assert(Array.isArray(sigs4) && sigs4.length === 0,
      'computeCarryVolSignals: empty series -> []');

    // Sub-threshold vol: constant price series → vol ~0 < minVol → []
    PerpAdapter.setHttpGet(mockHttpGet);
    const flatSeries = Array.from(
      { length: 100 },
      (_, i) => [1_700_000_000 + i * 60, 100],
    );
    const sigs5 = await computeCarryVolSignals('BTC-USD', flatSeries);
    assert(Array.isArray(sigs5) && sigs5.length === 0,
      'computeCarryVolSignals: flat price (vol < minVol) -> []');
  })();

  console.log(`carry-vol-signal --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
```

---

## Notes

### Threshold justifications (one line each)

| Threshold | Value | Why |
|---|---|---|
| `minVol` | 0.05 (5% ann.) | Crypto perps vol at 50–150% ann.; below 5% the asset is degenerate-flat and any carry ratio is a denominator artifact. |
| `minFundingApr` | 0.02 (2% ann.) | Below 2% APR the funding doesn't cover execution costs, tail risk, or opportunity cost — it's noise even in low vol. |
| `ratioThreshold` | 0.15 | At 80% vol this requires 12% APR funding — a meaningful edge that survives slippage, regime shifts, and the 8h funding settlement granularity. |

### Guard architecture (three layers, not one)

1. **`minVol`** in `computeCarryVolSignals` — kills the pipeline early when vol is degenerate (flat price → vol ~0 → ratio would explode). This is the divide-by-small-vol guard.
2. **`minFundingApr`** in `carryVolToSignal` — kills when funding is microscopic even if vol is also tiny (ratio noise).
3. **`ratioThreshold`** in `carryVolToSignal` — the primary economic gate. Also implicitly catches the divide-by-small-vol case: if vol were near zero, the ratio would explode *past* threshold, not below it. The `minVol` guard is belt-and-suspenders.

### Falsification to run on the live ledger

To know if this signal is real vs noise:

1. **Backtest the ratio distribution** — compute `carryToVol` across all perps over 90 days. If 90%+ of observations fall below `ratioThreshold`, the signal is structurally starved (funding never compensates for vol in this market regime).
2. **Regime sensitivity** — split by vol regime (low < 40%, mid 40–100%, high > 100%). If the signal only fires in low vol, it's a vol-regime proxy, not a carry signal.
3. **Horizon decay** — score the signal's forward PnL at 3h, 12h, weekly. If the edge decays before the 8h funding settlement, the carry never materializes (the signal is just a vol forecast in disguise).
4. **Cross-perp rank** — if all perps fire simultaneously (e.g. all above threshold during a vol crush), the signal is a market-wide regime indicator, not a perp-selection alpha. The edge is in the *spread* between perps, not the absolute level.

### Horizon home

This signal belongs on the **3h / 12h / weekly** ladder rungs, not the 1-min scalp. Funding accrues over 8h periods; the edge is multi-hour to daily. Scoring it at 15m would produce false negatives (the carry hasn't been earned yet) and false positives (price noise dominates at that horizon).
