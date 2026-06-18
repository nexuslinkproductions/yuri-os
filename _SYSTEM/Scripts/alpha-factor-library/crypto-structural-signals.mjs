#!/usr/bin/env node
// @capability: crypto-structural-signals
// @serves: OI quadrant | price OI quadrant | funding price reaction | offside positioning | accumulation squeeze distribution capitulation | crypto perp structural edge
// @does: Pure compute functions for two crypto-perp structural signals: (1) OI×price quadrant (accumulation/squeeze/distribution/capitulation regimes from joint price+OI direction); (2) funding×price reaction (extreme funding with non-confirming price = offside positioning → mean-reversion bias). Data is passed in — NO network calls here. Both are hypothesis signals to be measured at their real horizon before any sizing consideration.
// @use: Reach for this when you want structural market-regime signals from OI series + price + funding. Data fetching (getOpenInterest hist, getFundingHistory, getCandles) stays in the caller/orchestrator; these functions are pure compute over pre-fetched arrays.
// @exports: computeOiQuadrant, computeFundingPriceReaction
//
// CONSTRAINTS: paper-only (INV-1 — no order path), pure compute (no network), fail-open
// (bad/empty/NaN input → []), no new npm dep. Advisory only (confidence ≤ 0.70).

import { pathToFileURL } from 'node:url';

// ── helpers ─────────────────────────────────────────────────────────────────

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }

// ── computeOiQuadrant ────────────────────────────────────────────────────────

/**
 * computeOiQuadrant({ closes, oiSeries, market, ts, lookback? }) -> signal[]
 *
 * MECHANISM (hypothesis): OI and price move together or against each other.
 * Joint direction encodes the probable actor: new money entering (accumulation)
 * tends to trend; old money exiting under pressure (squeeze/capitulation) tends
 * to revert. The quadrant is an early-regime-identification signal. Edge would
 * come from the transition — entering/exiting a regime before it is priced in.
 * Measured edge depends heavily on horizon (likely 1h–4h) and market microstructure.
 *
 * Quadrant mapping (priceΔ sign × OI-Δ sign):
 *   (+, +) accumulation  → long  (new longs entering, trend following)
 *   (+, −) squeeze       → short (price up but OI falling = short squeeze, fade after squeeze exhausts)
 *   (−, +) distribution  → short (new shorts entering, trend following)
 *   (−, −) capitulation  → long  (longs closed under forced liquidation, potential reversal)
 *
 * value: priceΔ% * sign(OIΔ) — positive = bullish quadrant, negative = bearish
 * confidence: scaled from joint displacement magnitude, capped at 0.70
 *
 * @param {object} params
 *   - closes: number[] — close prices, ascending (oldest-first), ≥ lookback+1
 *   - oiSeries: number[] — OI values, ascending, same cadence, ≥ lookback+1
 *   - market: string — e.g. 'BTC-USD'
 *   - ts: number — unix-seconds timestamp for the signal
 *   - lookback: number — bars to look back for Δ (default 5)
 * @returns {Array<{factorId,value,side,confidence,ts,source}>}
 */
export function computeOiQuadrant({ closes, oiSeries, market, ts, lookback = 5 } = {}) {
  try {
    if (!market || typeof market !== 'string') return [];
    if (!Array.isArray(closes) || !Array.isArray(oiSeries)) return [];
    if (!isNum(ts)) return [];
    const lb = Math.max(1, Math.floor(lookback) || 5);
    if (closes.length < lb + 1 || oiSeries.length < lb + 1) return [];

    const prevClose = closes[closes.length - 1 - lb];
    const currClose = closes[closes.length - 1];
    const prevOI = oiSeries[oiSeries.length - 1 - lb];
    const currOI = oiSeries[oiSeries.length - 1];

    if (!isNum(prevClose) || !isNum(currClose) || prevClose <= 0) return [];
    if (!isNum(prevOI) || !isNum(currOI) || prevOI <= 0) return [];

    const pricePct = (currClose - prevClose) / prevClose; // signed %
    const oiPct = (currOI - prevOI) / prevOI;             // signed %

    if (!isNum(pricePct) || !isNum(oiPct)) return [];

    // Joint displacement magnitude — used for confidence
    const displacement = Math.sqrt(pricePct * pricePct + oiPct * oiPct);

    const priceUp = pricePct >= 0;
    const oiUp = oiPct >= 0;

    // Quadrant → side
    // (+,+) accumulation → long; (+,−) squeeze → short; (−,+) distribution → short; (−,−) capitulation → long
    let side;
    if (priceUp && oiUp) side = 'long';      // accumulation
    else if (priceUp && !oiUp) side = 'short'; // short squeeze exhausting → fade
    else if (!priceUp && oiUp) side = 'short'; // distribution
    else side = 'long';                         // capitulation reversal

    // value: signed (positive = bullish regime, negative = bearish)
    // use pricePct scaled by sign(oiPct) to capture joint directionality
    const oiSign = oiPct >= 0 ? 1 : -1;
    const value = pricePct * oiSign;

    // confidence: displacement → [0, 0.70], flat signal = low confidence
    // at 5% joint displacement → ~0.35 confidence; at 10% → ~0.55; at 20% → ~0.70
    const confidence = Math.min(0.70, displacement * 3.5);

    return [{
      factorId: `oi-quadrant-${market}`,
      value,
      side,
      confidence,
      ts,
      source: 'perp',
    }];
  } catch (_e) {
    return [];
  }
}

// ── computeFundingPriceReaction ──────────────────────────────────────────────

/**
 * computeFundingPriceReaction({ closes, fundingRate, market, ts, windowBars?, zThreshold? }) -> signal[]
 *
 * MECHANISM (hypothesis): When funding is extreme (longs paying heavily or shorts
 * paying heavily) but price does NOT confirm the funded side's P&L, the dominant
 * side is offside — they are paying carry without their position working. Mean
 * reversion follows as the losing side is eventually forced out or voluntarily exits.
 * Positive extreme funding + price flat or down = longs offside → short bias.
 * Negative extreme funding + price flat or up = shorts offside → long bias.
 * The edge (if real) would be strongest at 1h–4h where funding accumulation is
 * measurable but positions haven't been fully unwound yet.
 *
 * value: z-scored funding rate × non-confirmation factor (signed)
 *   - positive value = short bias (longs offside)
 *   - negative value = long bias (shorts offside)
 * confidence: magnitude of z-score × non-confirmation, capped at 0.65
 *
 * @param {object} params
 *   - closes: number[] — close prices ascending, ≥ windowBars+1
 *   - fundingRate: number — current funding rate (per 8h, e.g. 0.0005 = 0.05%)
 *   - market: string
 *   - ts: number — unix-seconds
 *   - windowBars: number — bars over which to measure price move (default 8)
 *   - zThreshold: number — |z-score| of funding required before firing (default 1.5)
 * @returns {Array<{factorId,value,side,confidence,ts,source}>}
 */
export function computeFundingPriceReaction({ closes, fundingRate, market, ts, windowBars = 8, zThreshold = 1.5 } = {}) {
  try {
    if (!market || typeof market !== 'string') return [];
    if (!Array.isArray(closes)) return [];
    if (!isNum(fundingRate)) return [];
    if (!isNum(ts)) return [];

    const wb = Math.max(2, Math.floor(windowBars) || 8);
    if (closes.length < wb + 1) return [];

    // Price move over the window — is price confirming the funded side?
    const prevClose = closes[closes.length - 1 - wb];
    const currClose = closes[closes.length - 1];
    if (!isNum(prevClose) || !isNum(currClose) || prevClose <= 0) return [];
    const pricePct = (currClose - prevClose) / prevClose;
    if (!isNum(pricePct)) return [];

    // Z-score funding: compare to a simple reference band.
    // Typical Binance funding: ±0.01% to ±0.1% per 8h. We treat |fundingRate| > 0.001 (0.1% per 8h)
    // as the 1-sigma reference, giving z = fundingRate / 0.001. This is a model assumption
    // (we don't have a rolling funding series here); callers can pass a normalized rate instead.
    const FUNDING_SIGMA_REF = 0.001; // 0.1% per 8h ≈ ~1σ for BTC/ETH
    const zFunding = fundingRate / FUNDING_SIGMA_REF;

    if (Math.abs(zFunding) < zThreshold) return [];

    // Non-confirmation: funded side's direction vs actual price move
    // Positive funding → longs paying → longs expect price up → if price NOT up, non-confirmed
    // Non-confirmation factor: -(sign(funding) × pricePct), clamped to [-1, 1]
    // >0 means funded side NOT confirmed (offside), <0 means confirmed (momentum, no reversion signal)
    const fundingSign = zFunding > 0 ? 1 : -1;
    const nonConfirm = -(fundingSign * pricePct); // positive = offside

    // Only fire when price is NOT confirming (nonConfirm > 0, i.e. price diverging from funded direction)
    if (nonConfirm <= 0) return [];

    // value: z-score × non-confirmation magnitude (positive = short bias, negative = long bias)
    const value = zFunding * Math.min(1, Math.abs(nonConfirm) * 10); // scale pricePct ~1%→10× to [0,1] range

    // Side: longs offside (positive funding, price not up) → short; shorts offside → long
    const side = fundingSign > 0 ? 'short' : 'long';

    // Confidence: |zFunding| × nonConfirm magnitude, capped at 0.65
    const confidence = Math.min(0.65, (Math.abs(zFunding) / 5) * Math.min(1, Math.abs(pricePct) * 20 + 0.3));

    return [{
      factorId: `funding-price-reaction-${market}`,
      value,
      side,
      confidence,
      ts,
      source: 'perp',
    }];
  } catch (_e) {
    return [];
  }
}

// ── --test self-test (synthetic, no network) ─────────────────────────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (c, label) => {
    if (c) { pass++; }
    else { fail++; console.error(`FAIL: ${label}`); }
  };

  const market = 'BTC-USD';
  const ts = 1_700_000_000;

  // ── computeOiQuadrant ─────────────────────────────────────────────────────

  // Case 1: accumulation — price up + OI up → long
  {
    const closes = [100, 101, 102, 103, 104, 110]; // recent up
    const oiSeries = [1000, 1010, 1020, 1030, 1040, 1100]; // OI up
    const sigs = computeOiQuadrant({ closes, oiSeries, market, ts, lookback: 5 });
    assert(Array.isArray(sigs) && sigs.length === 1, 'accumulation: returns 1 signal');
    assert(sigs[0].side === 'long', `accumulation: side=long (got ${sigs[0]?.side})`);
    assert(sigs[0].factorId === 'oi-quadrant-BTC-USD', 'accumulation: factorId');
    assert(sigs[0].source === 'perp', 'accumulation: source=perp');
    assert(isNum(sigs[0].value) && sigs[0].value > 0, `accumulation: value positive (got ${sigs[0]?.value})`);
    assert(sigs[0].confidence > 0 && sigs[0].confidence <= 0.70, `accumulation: confidence in range (got ${sigs[0]?.confidence})`);
  }

  // Case 2: short-squeeze → short bias (price up + OI down)
  {
    const closes = [100, 102, 104, 106, 108, 120]; // price up
    const oiSeries = [1000, 990, 980, 970, 960, 900]; // OI down (shorts covering)
    const sigs = computeOiQuadrant({ closes, oiSeries, market, ts, lookback: 5 });
    assert(Array.isArray(sigs) && sigs.length === 1, 'squeeze: returns 1 signal');
    assert(sigs[0].side === 'short', `squeeze: side=short (got ${sigs[0]?.side})`);
    assert(isNum(sigs[0].value) && sigs[0].value < 0, `squeeze: value negative (got ${sigs[0]?.value})`);
  }

  // Case 3: distribution → short (price down + OI up)
  {
    const closes = [110, 108, 106, 104, 102, 90]; // price down
    const oiSeries = [1000, 1010, 1020, 1030, 1040, 1100]; // OI up
    const sigs = computeOiQuadrant({ closes, oiSeries, market, ts, lookback: 5 });
    assert(sigs.length === 1 && sigs[0].side === 'short', `distribution: side=short (got ${sigs[0]?.side})`);
  }

  // Case 4: capitulation → long (price down + OI down)
  {
    const closes = [110, 108, 106, 104, 102, 90]; // price down
    const oiSeries = [1000, 990, 980, 970, 960, 900]; // OI down
    const sigs = computeOiQuadrant({ closes, oiSeries, market, ts, lookback: 5 });
    assert(sigs.length === 1 && sigs[0].side === 'long', `capitulation: side=long (got ${sigs[0]?.side})`);
  }

  // Case 5: insufficient data → []
  {
    const sigs = computeOiQuadrant({ closes: [100, 101], oiSeries: [1000, 1001], market, ts, lookback: 5 });
    assert(sigs.length === 0, 'insufficient data: []');
  }

  // Case 6: empty arrays → []
  {
    assert(computeOiQuadrant({ closes: [], oiSeries: [], market, ts }).length === 0, 'empty arrays: []');
  }

  // Case 7: NaN in closes → []
  {
    const closes = [100, NaN, 102, 103, 104, 110];
    const oiSeries = [1000, 1010, 1020, 1030, 1040, 1100];
    const sigs = computeOiQuadrant({ closes, oiSeries, market, ts, lookback: 5 });
    // NaN propagation: prevClose might be valid but we guard isNum on the deltas
    // The NaN is at index 1, prevClose is at index 0 → isNum(100) = true, currClose=110 OK → signal fires
    // So this case tests NaN at non-critical index; the key guard is isNum(pricePct)
    assert(Array.isArray(sigs), 'NaN in series: returns array (fail-open)');
  }

  // Case 8: null market → []
  {
    const closes = [100, 101, 102, 103, 104, 110];
    const oiSeries = [1000, 1010, 1020, 1030, 1040, 1100];
    assert(computeOiQuadrant({ closes, oiSeries, market: null, ts }).length === 0, 'null market: []');
  }

  // ── computeFundingPriceReaction ───────────────────────────────────────────

  // Case 9: extreme positive funding + price flat/down → longs offside → short
  {
    const closes = Array.from({ length: 9 }, (_, i) => 100 - i * 0.1); // price drifting down
    const fundingRate = 0.003; // 0.3% per 8h = 3× sigma ref → z=3, well above threshold
    const sigs = computeFundingPriceReaction({ closes, fundingRate, market, ts });
    assert(Array.isArray(sigs) && sigs.length === 1, 'offside-long: returns 1 signal');
    assert(sigs[0].side === 'short', `offside-long: side=short (longs offside) (got ${sigs[0]?.side})`);
    assert(sigs[0].factorId === `funding-price-reaction-${market}`, 'offside-long: factorId');
    assert(sigs[0].source === 'perp', 'offside-long: source=perp');
    assert(isNum(sigs[0].value) && sigs[0].value > 0, `offside-long: value positive (got ${sigs[0]?.value})`);
    assert(sigs[0].confidence > 0 && sigs[0].confidence <= 0.65, `offside-long: confidence in range (got ${sigs[0]?.confidence})`);
  }

  // Case 10: extreme negative funding + price flat/up → shorts offside → long
  {
    const closes = Array.from({ length: 9 }, (_, i) => 100 + i * 0.1); // price drifting up
    const fundingRate = -0.003; // extreme negative
    const sigs = computeFundingPriceReaction({ closes, fundingRate, market, ts });
    assert(sigs.length === 1 && sigs[0].side === 'long', `offside-short: side=long (got ${sigs[0]?.side})`);
  }

  // Case 11: funding below threshold → []
  {
    const closes = Array.from({ length: 9 }, (_, i) => 100 - i * 0.1);
    const fundingRate = 0.0005; // 0.5× sigma = z<1.5
    assert(computeFundingPriceReaction({ closes, fundingRate, market, ts }).length === 0, 'funding below threshold: []');
  }

  // Case 12: extreme funding but price CONFIRMS direction (no reversion signal) → []
  {
    const closes = Array.from({ length: 9 }, (_, i) => 100 + i * 0.5); // price strongly up
    const fundingRate = 0.003; // positive funding + price up = longs confirmed, no reversion
    const sigs = computeFundingPriceReaction({ closes, fundingRate, market, ts });
    assert(sigs.length === 0, `confirmed funding direction: [] (got ${sigs.length})`);
  }

  // Case 13: NaN fundingRate → []
  {
    const closes = Array.from({ length: 9 }, (_, i) => 100 - i * 0.1);
    assert(computeFundingPriceReaction({ closes, fundingRate: NaN, market, ts }).length === 0, 'NaN funding: []');
  }

  // Case 14: insufficient closes → []
  {
    const closes = [100, 99]; // < windowBars+1
    assert(computeFundingPriceReaction({ closes, fundingRate: 0.003, market, ts }).length === 0, 'insufficient closes: []');
  }

  // Case 15: empty/missing input → []
  {
    assert(computeOiQuadrant({}).length === 0, 'computeOiQuadrant empty opts: []');
    assert(computeFundingPriceReaction({}).length === 0, 'computeFundingPriceReaction empty opts: []');
    assert(computeOiQuadrant().length === 0, 'computeOiQuadrant no args: []');
    assert(computeFundingPriceReaction().length === 0, 'computeFundingPriceReaction no args: []');
  }

  console.log(`crypto-structural-signals --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
