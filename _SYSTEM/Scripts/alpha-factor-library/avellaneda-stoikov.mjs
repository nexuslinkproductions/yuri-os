#!/usr/bin/env node
// @capability: avellaneda-stoikov
// @serves: AS maker quoting | reservation price | optimal spread | limit order placement | market making | bid ask quotes | inventory skew | volatility adaptive spread | VPIN toxicity widen
// @does: Avellaneda-Stoikov (2008) MAKER quoting — reservation price, optimal spread, and bid/ask quote placement anchored on microprice with vol-adaptive width, VPIN-toxicity widen, and λ market-impact term. Fail-open (bad params → nulls, never throws).
// @use: Reach for this when you need to place two-sided maker quotes around a microprice anchor. Primary value at ~€300 book size is (a) vol-adaptive spread width and (b) microprice anchor — NOT inventory skew (q is ±1 lot → near-zero skew). The VPIN widen and λ impact terms matter more than q·γ·σ²·τ at this scale.
// @exports: reservationPrice, optimalSpread, quotes, computeASQuotes, sigmaEwma, sigmaPrice
//
// ── SCALE CAVEAT (peer-reviewed for ~€300 book) ───────────────────────────────
// At the scale of a small retail crypto book (q ∈ {0, ±1} base-lot max), the
// inventory-SKEW term  q·γ·σ²·τ  is near-zero because q is tiny — genuine scale.
// (Do NOT confuse this with the σ-units bug below: the vol-WIDTH term γσ²τ also
//  looks near-zero if you feed RETURN vol, but that is a units error, not scale —
//  with correct PRICE vol the width term is a real few-bps spread. See σ UNITS.)
// So with correct units the reservation price ≈ microprice (skew negligible at q≈0)
// while the SPREAD WIDTH is the live lever. KEEP the formula intact. PRIMARY value:
//   (a) VOL-ADAPTIVE SPREAD WIDTH via γ·σ²·τ + (2/γ)·ln(1 + γ/κ)  [needs PRICE vol]
//   (b) MICROPRICE ANCHOR instead of raw mid (removes stale-quote risk)
// The VPIN-toxicity multiplier (toxicWiden) and the λ·orderSize impact term
// contribute more usable edge than inventory skew at this scale.
//
// Reference: Avellaneda, M. & Stoikov, S. (2008). "High-frequency trading in a
// limit order book." Quantitative Finance, 8(3), 217–224.
//
// ── σ UNITS (CRITICAL — two independent axes; glm-5.2 math audit, 2026-06-19) ───
// σ must be correct on BOTH axes or the γσ²τ spread term is wrong:
//
// AXIS 1 — TIME: σ and τ MUST share the SAME time unit. We quote at 500ms–5s, so τ
// is in SECONDS and σ MUST be PER-SECOND vol — NEVER annualized. An annualized σ
// (carry-vol-signal's realizedVol ×√(periods/yr)) blows the spread up ~3e7×.
//
// AXIS 2 — SCALE: reservationPrice/optimalSpread need PRICE vol ($ per √sec), NOT
// the dimensionless RETURN vol sigmaEwma() produces. σ_price = σ_return × S.
// γ·σ²·τ subtracts from / adds to a PRICE, so σ must carry price units; feeding
// return-vol (~1e-4) where price-vol (~$6/√s on BTC) belongs shrinks the vol term
// by S² (~3.8e9 on BTC) — it silently vanishes and γ cannot be pinned analytically.
// PIPELINE: sigmaEwma(1s log-return²) → per-second RETURN vol → sigmaPrice(σ, mid)
// → per-second PRICE vol → reservationPrice/optimalSpread. Do both conversions.
// ─────────────────────────────────────────────────────────────────────────────

import { pathToFileURL } from 'node:url';
export { computeMicroprice } from './orderbook-imbalance.mjs';

// ── GUARDS ────────────────────────────────────────────────────────────────────

/**
 * Returns true if x is a finite number.
 */
function fin(x) { return typeof x === 'number' && Number.isFinite(x); }

// ── sigmaEwma (per-second vol for A-S; glm-5.2 math audit 2026-06-19) ──────────
/**
 * sigmaEwma(r2, prevVar, halfLifeSec) → { variance, sigma } | null
 * EWMA of squared 1-SECOND log returns → the PER-SECOND vol A-S requires:
 *   σ²_t = λ·σ²_{t-1} + (1−λ)·r_t² ,  λ = 0.5^(1/halfLifeSec)
 * Half-life 30s for ~500ms quoting (fast, catches regime shifts), 60s for 2–5s
 * quoting (smoother). Seed prevVar with the first r² . NEVER annualize the output.
 * @param {number} r2 - squared 1s log return, r = ln(S_t/S_{t-1})
 * @param {number} [prevVar] - previous EWMA variance (undefined → seed with r2)
 * @param {number} [halfLifeSec=30] - EWMA half-life in seconds
 * @returns {{variance:number, sigma:number}|null}
 */
export function sigmaEwma(r2, prevVar, halfLifeSec = 30) {
  if (!fin(r2) || r2 < 0 || !fin(halfLifeSec) || halfLifeSec <= 0) return null;
  const lambda = Math.pow(0.5, 1 / halfLifeSec);
  const seed = fin(prevVar) && prevVar >= 0 ? prevVar : r2;
  const variance = lambda * seed + (1 - lambda) * r2;
  if (!fin(variance) || variance < 0) return null;
  return { variance, sigma: Math.sqrt(variance) };
}

// ── sigmaPrice (return-vol → PRICE-vol; glm-5.2 audit AXIS 2, 2026-06-19) ──────
/**
 * sigmaPrice(sigmaReturnPerSec, midPrice) → price vol ($ per √sec) | null
 *
 * reservationPrice/optimalSpread require PRICE volatility, NOT the dimensionless
 * RETURN vol that sigmaEwma() produces:  σ_price = σ_return × S.
 *
 * Feeding return-vol directly shrinks the γ·σ²·τ spread term by a factor of S²
 * (~3.8e9 on BTC at $62k) — the vol-adaptive width silently vanishes and γ cannot
 * be pinned analytically against a breakeven spread. ALWAYS convert at the call
 * site where the mid is known, after sigmaEwma and before reservationPrice/optimalSpread.
 *
 * @param {number} sigmaReturnPerSec - per-second RETURN vol (sigmaEwma().sigma)
 * @param {number} midPrice          - current mid/microprice (price scale, > 0)
 * @returns {number|null} per-second PRICE vol, or null on bad params
 */
export function sigmaPrice(sigmaReturnPerSec, midPrice) {
  if (!fin(sigmaReturnPerSec) || sigmaReturnPerSec < 0) return null;
  if (!fin(midPrice) || midPrice <= 0) return null;
  return sigmaReturnPerSec * midPrice;
}

// ── reservationPrice ──────────────────────────────────────────────────────────

/**
 * reservationPrice({ s, q, gamma, sigma, tau }) → number | null
 *
 * Avellaneda-Stoikov (2008) eq. (3):
 *   r = s − q · γ · σ² · τ
 *
 * @param {number} s     - Fair-value anchor (microprice from computeMicroprice)
 * @param {number} q     - Inventory in base units (signed; positive = long)
 * @param {number} gamma - Risk-aversion coefficient (γ > 0)
 * @param {number} sigma - PRICE volatility ($ per √sec) = sigmaPrice(sigmaEwma σ, mid); per-second & price-scaled, NOT return vol
 * @param {number} tau   - Time-to-horizon normalised to [0, 1]
 * @returns {number | null} reservation price, or null on bad/NaN params
 *
 * SCALE NOTE: at q ∈ {0,±1} with typical γ~0.001–0.1 and σ~0.01–0.05, the
 * skew term is ~1e-7 to ~1e-4 — effectively zero against a €300 position.
 * The formula is kept intact for correctness; its edge lives at larger q.
 */
export function reservationPrice({ s, q, gamma, sigma, tau, maxSkewTicks, tickSize } = {}) {
  if (!fin(s) || !fin(q) || !fin(gamma) || !fin(sigma) || !fin(tau)) return null;
  if (gamma <= 0 || sigma < 0) return null;
  // tau can be 0 (horizon passed; spread collapses to zero, reservation = s)

  // ── SKEW CLAMP (opt-in; glm-5.2 hardening 2026-06-19) ─────────────────────────
  // Clamp the inventory-skew term q·γ·σ²·τ to ±maxSkewTicks·tickSize so a large
  // inventory can't push the reservation price off the book. Omitted params → no
  // clamp (identical to the original formula). Bad params (tickSize ≤ 0,
  // maxSkewTicks < 0, or non-finite) → no clamp (fail-open to the formula).
  let skew = q * gamma * sigma * sigma * tau;
  if (fin(maxSkewTicks) && fin(tickSize) && maxSkewTicks >= 0 && tickSize > 0) {
    const cap = maxSkewTicks * tickSize;
    if (skew >  cap) skew =  cap;
    if (skew < -cap) skew = -cap;
  }
  return s - skew;
}

// ── optimalSpread ─────────────────────────────────────────────────────────────

/**
 * optimalSpread({ gamma, sigma, tau, kappa }) → number | null
 *
 * Avellaneda-Stoikov (2008) eq. (4):
 *   δ* = γ·σ²·τ + (2/γ)·ln(1 + γ/κ)
 *
 * This is the FULL two-sided spread (bid-to-ask distance).
 *
 * @param {number} gamma - Risk-aversion (γ > 0)
 * @param {number} sigma - PRICE volatility ($ per √sec) = sigmaPrice(sigmaEwma σ, mid); per-second & price-scaled, NOT return vol
 * @param {number} tau   - Time-to-horizon ∈ [0, 1]
 * @param {number} kappa - Order-book liquidity/intensity parameter (κ > 0).
 *                         Higher κ = deeper book = tighter spread.
 * @returns {number | null} optimal spread ≥ 0, or null on bad params
 *
 * PRIMARY VALUE at small scale: vol-adaptive width.  When σ doubles, spread
 * roughly quadruples via σ² term — protects against adverse selection during
 * volatile periods without any inventory signal needed.
 */
export function optimalSpread({ gamma, sigma, tau, kappa } = {}) {
  if (!fin(gamma) || !fin(sigma) || !fin(tau) || !fin(kappa)) return null;
  if (gamma <= 0 || sigma < 0 || kappa <= 0) return null;
  const spread = gamma * sigma * sigma * tau + (2 / gamma) * Math.log(1 + gamma / kappa);
  // ln(1 + γ/κ) > 0 for γ,κ>0, and γσ²τ≥0 → spread is non-negative; guard NaN
  if (!fin(spread)) return null;
  return Math.max(0, spread);
}

// ── quotes ────────────────────────────────────────────────────────────────────

/**
 * quotes({ microprice, q, gamma, sigma, tau, kappa, lambda, orderSize, vpinToxic, toxicWiden,
 *          minHalfSpreadBps, maxHalfSpreadBps, maxSkewTicks, tickSize, qMax })
 *   → { bidPx, askPx, halfSpread, reservation } | null-fields object on bad params
 *
 * Full quote placement following AS (2008):
 *   1. reservation  = reservationPrice(microprice, q, γ, σ, τ)  [with opt-in skew clamp]
 *   2. halfSpread   = optimalSpread / 2
 *   3. [optional] widen by market-impact:  halfSpread += λ · orderSize
 *   4. [optional] widen for VPIN toxicity: halfSpread *= toxicWiden  (when vpinToxic=true)
 *   5. [optional] clamp half to [minHalfSpreadBps, maxHalfSpreadBps] (converted via microprice)
 *   6. bidPx = reservation − halfSpread
 *      askPx = reservation + halfSpread
 *   7. [optional] inventory hard-limit (qMax): when |q| ≥ qMax, suppress the side
 *      that would increase |q| (set its px to null) so the quoter can only reduce
 *      inventory, never grow it past the limit.
 *
 * @param {number}  microprice  - Fair-value anchor (from computeMicroprice)
 * @param {number}  q           - Inventory in base units (signed)
 * @param {number}  gamma       - Risk-aversion γ > 0
 * @param {number}  sigma       - Volatility σ ≥ 0
 * @param {number}  tau         - Time-to-horizon ∈ [0,1]
 * @param {number}  kappa       - Order-book intensity κ > 0
 * @param {number}  [lambda]    - Market-impact coefficient (optional, ≥ 0)
 * @param {number}  [orderSize] - Order size for impact term (optional, ≥ 0)
 * @param {boolean} [vpinToxic] - True when VPIN signals toxic flow (default false)
 * @param {number}  [toxicWiden]- Spread multiplier under toxic flow (default 1.5)
 *
 * OPT-IN HARDENING GUARDS (omitted → byte-identical current behavior; glm-5.2, 2026-06-19):
 * @param {number}  [minHalfSpreadBps] - Spread FLOOR in bps; half never falls below
 *   (minHalfSpreadBps/1e4)·microprice. Protects against quoting inside the round-trip fee.
 * @param {number}  [maxHalfSpreadBps] - Spread CEILING in bps; half never exceeds
 *   (maxHalfSpreadBps/1e4)·microprice. Caps runaway spreads in high-σ regimes.
 *   If min > max → fail-open null (invalid clamp range).
 * @param {number}  [maxSkewTicks] - Clamp the inventory-skew component of reservation
 *   to ±maxSkewTicks·tickSize (passed to reservationPrice).
 * @param {number}  [tickSize]    - Tick size in price units (used with maxSkewTicks).
 * @param {number}  [qMax]        - Inventory hard-limit in lots. When |q| ≥ qMax,
 *   the inventory-INCREASING side is suppressed (its px → null). qMax ≤ 0 → suppress
 *   both sides (RED edge).
 * @returns {{ bidPx: number|null, askPx: number|null, halfSpread: number|null, reservation: number|null }}
 *
 * Fail-open: any bad param → all four fields null, never throws.
 */
export function quotes({
  microprice,
  q,
  gamma,
  sigma,
  tau,
  kappa,
  lambda,
  orderSize,
  vpinToxic = false,
  toxicWiden = 1.5,
  minHalfSpreadBps,
  maxHalfSpreadBps,
  maxSkewTicks,
  tickSize,
  qMax,
} = {}) {
  const NULL_RESULT = { bidPx: null, askPx: null, halfSpread: null, reservation: null };

  try {
    // ── SPREAD FLOOR/CEILING: fail-open on invalid clamp range ──────────────────
    // If both bounds are present and floor > ceiling, the clamp is ill-posed → null.
    const hasFloor = fin(minHalfSpreadBps);
    const hasCeil  = fin(maxHalfSpreadBps);
    if (hasFloor && hasCeil && minHalfSpreadBps > maxHalfSpreadBps) return NULL_RESULT;

    const r = reservationPrice({ s: microprice, q, gamma, sigma, tau, maxSkewTicks, tickSize });
    if (r === null) return NULL_RESULT;

    const spread = optimalSpread({ gamma, sigma, tau, kappa });
    if (spread === null) return NULL_RESULT;

    let half = spread / 2;

    // Market-impact widen
    if (fin(lambda) && fin(orderSize) && lambda >= 0 && orderSize >= 0) {
      half += lambda * orderSize;
    }

    // VPIN-toxicity widen
    if (vpinToxic === true) {
      const tw = fin(toxicWiden) && toxicWiden >= 1 ? toxicWiden : 1.5;
      half *= tw;
    }

    // ── SPREAD FLOOR/CEILING CLAMP (opt-in; glm-5.2 2026-06-19) ─────────────────
    // bps → price via microprice. 1 bps = (bps/1e4)·mid. Applied AFTER widen so the
    // post-impact, post-toxicity spread is what gets clamped. Floor protects against
    // quoting inside the fee; ceiling caps runaway high-σ spreads.
    if (hasFloor) {
      const floorPx = (minHalfSpreadBps / 1e4) * microprice;
      if (half < floorPx) half = floorPx;
    }
    if (hasCeil) {
      const ceilPx = (maxHalfSpreadBps / 1e4) * microprice;
      if (half > ceilPx) half = ceilPx;
    }

    if (!fin(half) || half < 0) return NULL_RESULT;

    let bidPx = r - half;
    let askPx = r + half;

    // ── INVENTORY HARD-LIMIT GUARD (opt-in; glm-5.2 2026-06-19) ─────────────────
    // When |q| ≥ qMax, suppress the side that would INCREASE |q|:
    //   - q > 0 (long) → buying more widens long → suppress bid (only allow sells)
    //   - q < 0 (short) → selling more widens short → suppress ask (only allow buys)
    //   - qMax ≤ 0 → both sides at/over limit → suppress BOTH (RED edge)
    // Bidding lifts inventory toward long; asking lifts inventory toward short.
    if (fin(qMax)) {
      const overLimit = Math.abs(q) >= qMax;
      if (overLimit) {
        if (qMax <= 0) {
          // RED edge: qMax=0 (or negative) with any |q|≥qMax → both sides suppressed
          bidPx = null;
          askPx = null;
        } else if (q > 0) {
          bidPx = null;  // long: suppress the buy side
        } else if (q < 0) {
          askPx = null;  // short: suppress the sell side
        } else {
          // q === 0 but |0| ≥ qMax requires qMax ≤ 0, handled above; defensive no-op
        }
      }
    }

    return {
      bidPx,
      askPx,
      halfSpread: half,
      reservation: r,
    };
  } catch (_) {
    return { bidPx: null, askPx: null, halfSpread: null, reservation: null };
  }
}

/**
 * computeASQuotes — convenience alias matching the YURI factor-library call shape.
 * Identical to quotes(); kept separately for discoverability.
 */
export const computeASQuotes = quotes;

// ── --test self-test ──────────────────────────────────────────────────────────
// Cite: Avellaneda & Stoikov (2008), Quantitative Finance 8(3), 217-224.

const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (cond, label) => {
    if (cond) { pass++; }
    else { fail++; console.error(`FAIL: ${label}`); }
  };
  const near = (a, b, eps = 1e-10) => Math.abs(a - b) < eps;

  // ── reservationPrice ────────────────────────────────────────────────────────

  // q=0 → reservation == microprice (no inventory, no skew)
  const rp0 = reservationPrice({ s: 100, q: 0, gamma: 0.01, sigma: 0.02, tau: 0.5 });
  assert(rp0 !== null && near(rp0, 100), `reservationPrice: q=0 → exactly microprice (got ${rp0})`);

  // q>0 → reservation < microprice (maker skews quotes DOWN to offload long inventory)
  const rpLong = reservationPrice({ s: 100, q: 1, gamma: 0.01, sigma: 0.02, tau: 0.5 });
  assert(rpLong !== null && rpLong < 100,
    `reservationPrice: q>0 → reservation < microprice (got ${rpLong})`);

  // q<0 → reservation > microprice (skew UP to offload short inventory)
  const rpShort = reservationPrice({ s: 100, q: -1, gamma: 0.01, sigma: 0.02, tau: 0.5 });
  assert(rpShort !== null && rpShort > 100,
    `reservationPrice: q<0 → reservation > microprice (got ${rpShort})`);

  // Known value: s=100, q=1, γ=0.001, σ=0.02, τ=0.5 → skew=0.001×0.0004×0.5=0.0000002
  // reservation = 99.9999998
  const rpKnown = reservationPrice({ s: 100, q: 1, gamma: 0.001, sigma: 0.02, tau: 0.5 });
  assert(rpKnown !== null && near(rpKnown, 100 - 0.001 * 0.0004 * 0.5, 1e-12),
    `reservationPrice: known value at small γ (got ${rpKnown})`);

  // τ=0 → skew vanishes; reservation == s regardless of q
  const rpTau0 = reservationPrice({ s: 100, q: 10, gamma: 0.1, sigma: 0.05, tau: 0 });
  assert(rpTau0 !== null && near(rpTau0, 100), `reservationPrice: τ=0 → reservation=s (got ${rpTau0})`);

  // Bad param: gamma=0 → null
  assert(reservationPrice({ s: 100, q: 1, gamma: 0, sigma: 0.02, tau: 0.5 }) === null,
    'reservationPrice: gamma=0 → null');

  // Bad param: gamma negative → null
  assert(reservationPrice({ s: 100, q: 1, gamma: -1, sigma: 0.02, tau: 0.5 }) === null,
    'reservationPrice: gamma<0 → null');

  // Bad param: NaN sigma → null
  assert(reservationPrice({ s: 100, q: 1, gamma: 0.01, sigma: NaN, tau: 0.5 }) === null,
    'reservationPrice: sigma=NaN → null');

  // ── optimalSpread ───────────────────────────────────────────────────────────

  // Known value: γ=0.01, σ=0.02, τ=1, κ=1
  //   δ* = 0.01×0.0004×1 + (200)×ln(1+0.01) = 0.000004 + 200×0.00995033... ≈ 1.99010...
  const osKnown = optimalSpread({ gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1 });
  const osExpected = 0.01 * 0.02 * 0.02 * 1 + (2 / 0.01) * Math.log(1 + 0.01 / 1);
  assert(osKnown !== null && near(osKnown, osExpected, 1e-10),
    `optimalSpread: known value (got ${osKnown}, expected ${osExpected})`);

  // Higher σ → wider spread (primary value for vol-adaptive quotes)
  const osLowVol  = optimalSpread({ gamma: 0.01, sigma: 0.01, tau: 1, kappa: 1 });
  const osHighVol = optimalSpread({ gamma: 0.01, sigma: 0.04, tau: 1, kappa: 1 });
  assert(osLowVol !== null && osHighVol !== null && osHighVol > osLowVol,
    `optimalSpread: higher σ → wider spread (${osHighVol} > ${osLowVol})`);

  // Higher κ (deeper book) → tighter spread (ln(1+γ/κ) shrinks)
  const osShallowBook = optimalSpread({ gamma: 0.01, sigma: 0.02, tau: 1, kappa: 0.1 });
  const osDeepBook    = optimalSpread({ gamma: 0.01, sigma: 0.02, tau: 1, kappa: 10  });
  assert(osShallowBook !== null && osDeepBook !== null && osDeepBook < osShallowBook,
    `optimalSpread: deeper book (κ=10) → tighter spread (${osDeepBook} < ${osShallowBook})`);

  // τ=0 → spread from γσ²τ term is 0, but ln(1+γ/κ) term persists
  const osTau0 = optimalSpread({ gamma: 0.01, sigma: 0.05, tau: 0, kappa: 1 });
  const osTau0Expected = (2 / 0.01) * Math.log(1 + 0.01 / 1);
  assert(osTau0 !== null && near(osTau0, osTau0Expected, 1e-10),
    `optimalSpread: τ=0 → only ln-term remains (got ${osTau0})`);

  // Bad params → null
  assert(optimalSpread({ gamma: 0,    sigma: 0.02, tau: 1, kappa: 1   }) === null,
    'optimalSpread: gamma=0 → null');
  assert(optimalSpread({ gamma: 0.01, sigma: 0.02, tau: 1, kappa: 0   }) === null,
    'optimalSpread: kappa=0 → null');
  assert(optimalSpread({ gamma: 0.01, sigma: -0.01, tau: 1, kappa: 1  }) === null,
    'optimalSpread: sigma<0 → null');
  assert(optimalSpread({ gamma: 0.01, sigma: NaN, tau: 1, kappa: 1    }) === null,
    'optimalSpread: sigma=NaN → null');

  // ── quotes ──────────────────────────────────────────────────────────────────

  const baseParams = { microprice: 100, q: 0, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1 };

  // q=0 → reservation == microprice; bid and ask symmetric around it
  const qBase = quotes(baseParams);
  assert(qBase.reservation !== null && near(qBase.reservation, 100),
    `quotes: q=0 → reservation = microprice (got ${qBase.reservation})`);
  assert(qBase.bidPx !== null && qBase.askPx !== null,
    'quotes: q=0 → bidPx and askPx are finite');
  assert(near(100 - qBase.bidPx, qBase.askPx - 100, 1e-10),
    `quotes: q=0 → symmetric around microprice (bid offset ${100 - qBase.bidPx}, ask offset ${qBase.askPx - 100})`);
  assert(qBase.bidPx < qBase.askPx,
    `quotes: bidPx < askPx (${qBase.bidPx} < ${qBase.askPx})`);

  // q>0 → reservation < microprice → bid and ask both shift down
  const qLong = quotes({ ...baseParams, q: 1 });
  assert(qLong.reservation !== null && qLong.reservation < 100,
    `quotes: q=1 → reservation < microprice (got ${qLong.reservation})`);
  assert(qLong.bidPx !== null && qLong.bidPx < qBase.bidPx,
    `quotes: q=1 → bid shifts down vs q=0 (${qLong.bidPx} < ${qBase.bidPx})`);
  assert(qLong.askPx !== null && qLong.askPx < qBase.askPx,
    `quotes: q=1 → ask shifts down vs q=0 (${qLong.askPx} < ${qBase.askPx})`);

  // Higher σ → wider spread (halfSpread grows)
  const qLowVol  = quotes({ ...baseParams, sigma: 0.01 });
  const qHighVol = quotes({ ...baseParams, sigma: 0.04 });
  assert(qLowVol.halfSpread !== null && qHighVol.halfSpread !== null &&
    qHighVol.halfSpread > qLowVol.halfSpread,
    `quotes: higher σ → wider halfSpread (${qHighVol.halfSpread} > ${qLowVol.halfSpread})`);

  // vpinToxic=true → halfSpread wider than toxic=false
  const qClean = quotes({ ...baseParams, vpinToxic: false, toxicWiden: 1.5 });
  const qToxic = quotes({ ...baseParams, vpinToxic: true,  toxicWiden: 1.5 });
  assert(qClean.halfSpread !== null && qToxic.halfSpread !== null &&
    qToxic.halfSpread > qClean.halfSpread,
    `quotes: vpinToxic=true → halfSpread wider (${qToxic.halfSpread} > ${qClean.halfSpread})`);
  // Ratio should be exactly toxicWiden=1.5 when no lambda term
  assert(near(qToxic.halfSpread / qClean.halfSpread, 1.5, 1e-10),
    `quotes: toxicWiden=1.5 → exact 1.5× widen (got ratio ${qToxic.halfSpread / qClean.halfSpread})`);

  // lambda·orderSize market-impact term widens the spread
  const qNoImpact = quotes({ ...baseParams, lambda: 0,    orderSize: 10 });
  const qImpact   = quotes({ ...baseParams, lambda: 0.001, orderSize: 10 });
  assert(qNoImpact.halfSpread !== null && qImpact.halfSpread !== null &&
    qImpact.halfSpread > qNoImpact.halfSpread,
    `quotes: λ·orderSize impact → wider spread (${qImpact.halfSpread} > ${qNoImpact.halfSpread})`);
  assert(near(qImpact.halfSpread - qNoImpact.halfSpread, 0.001 * 10, 1e-10),
    `quotes: impact delta = λ·orderSize exactly (got ${qImpact.halfSpread - qNoImpact.halfSpread})`);

  // bid/ask symmetric around reservation
  const rp = qBase.reservation;
  const hs = qBase.halfSpread;
  assert(near(rp - qBase.bidPx, hs, 1e-10) && near(qBase.askPx - rp, hs, 1e-10),
    `quotes: bid and ask symmetric around reservation (halfSpread=${hs})`);

  // Bad params → null fields
  const qBad = quotes({ microprice: NaN, q: 0, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1 });
  assert(qBad.bidPx === null && qBad.askPx === null,
    'quotes: NaN microprice → null result');

  const qBadGamma = quotes({ microprice: 100, q: 0, gamma: -1, sigma: 0.02, tau: 1, kappa: 1 });
  assert(qBadGamma.bidPx === null, 'quotes: gamma<0 → null result');

  // computeASQuotes is an alias
  const qAlias = computeASQuotes(baseParams);
  assert(qAlias.bidPx !== null && near(qAlias.bidPx, qBase.bidPx, 1e-10),
    'computeASQuotes: alias produces same result as quotes()');

  // ── sigmaEwma (per-second vol; glm audit) ────────────────────────────────────
  const se1 = sigmaEwma(0.0004, undefined, 30); // first call seeds with r2 → variance == r2
  assert(se1 !== null && near(se1.variance, 0.0004) && near(se1.sigma, 0.02),
    `sigmaEwma: first call seeds with r2 (σ got ${se1?.sigma})`);
  const se2 = sigmaEwma(0, 0.0004, 30); // r2=0 → variance decays below the seed
  assert(se2 !== null && se2.variance < 0.0004 && se2.variance > 0,
    `sigmaEwma: zero return decays variance (got ${se2?.variance})`);
  const seShort = sigmaEwma(0.01, 0.0001, 5);   // shorter half-life reacts faster to the new (larger) r²
  const seLong  = sigmaEwma(0.01, 0.0001, 60);
  assert(seShort !== null && seLong !== null && seShort.variance > seLong.variance,
    `sigmaEwma: shorter half-life reacts faster (${seShort?.variance} > ${seLong?.variance})`);
  assert(sigmaEwma(NaN, 0.0004, 30) === null && sigmaEwma(0.0004, 0.0004, 0) === null,
    'sigmaEwma: bad input → null');

  // ── sigmaPrice + the σ-units contract (glm-5.2 AXIS 2 audit) ─────────────────
  // sigmaPrice converts per-second RETURN vol → PRICE vol (× S).
  const spx = sigmaPrice(0.0001, 62000); // 1bps/s return vol on $62k BTC → $6.2/√s
  assert(spx !== null && near(spx, 6.2, 1e-9), `sigmaPrice: σ_return × S (got ${spx})`);
  assert(sigmaPrice(-1, 62000) === null && sigmaPrice(0.0001, 0) === null && sigmaPrice(NaN, 1) === null,
    'sigmaPrice: bad input → null');
  // CONTRACT (regression for the bug): feeding RETURN vol makes the γσ²τ width term
  // vanish vs PRICE vol — by ~S². Same γ,τ,κ; only σ differs.
  const gtk = { gamma: 0.2, tau: 10, kappa: 0.5 };
  const floor = (2 / gtk.gamma) * Math.log(1 + gtk.gamma / gtk.kappa); // κ term, σ-independent
  const widthReturn = optimalSpread({ ...gtk, sigma: 0.0001 }) - floor;                 // WRONG units
  const widthPrice  = optimalSpread({ ...gtk, sigma: sigmaPrice(0.0001, 62000) }) - floor; // correct
  assert(widthPrice > widthReturn * 1e6,
    `sigmaPrice contract: price-vol width >> return-vol width (price ${widthPrice}, return ${widthReturn})`);

  // ══ HARDENING GUARDS (glm-5.2, 2026-06-19) ════════════════════════════════════
  // Each guard: GREEN (clamp works), RED (fail-open), METAMORPHIC (monotonicity).

  // ── GUARD 1: SPREAD FLOOR / CEILING ──────────────────────────────────────────
  // GREEN floor: a tiny computed spread is raised to the floor.
  // baseParams at mid=100 → halfSpread ≈ (γσ²τ + ln-term)/2. Force a tiny spread by
  // using σ≈0,τ=0 so only the ln(1+γ/κ) term survives → very small half.
  const tinyBase = { microprice: 100, q: 0, gamma: 0.01, sigma: 0.0001, tau: 0, kappa: 10 };
  const tinyNoFloor = quotes(tinyBase);
  const floorBps = 50; // 50 bps half-spread floor = 0.5 price units at mid=100
  const tinyFloored = quotes({ ...tinyBase, minHalfSpreadBps: floorBps });
  const expectedFloorPx = (floorBps / 1e4) * 100; // 0.5
  assert(tinyFloored.halfSpread !== null && near(tinyFloored.halfSpread, expectedFloorPx, 1e-12),
    `floor: tiny spread raised to floor (raw ${tinyNoFloor.halfSpread?.toExponential(3)} → ${tinyFloored.halfSpread})`);
  assert(tinyFloored.halfSpread !== null && tinyFloored.halfSpread > (tinyNoFloor.halfSpread ?? 0),
    'floor: floored halfSpread > raw computed halfSpread');

  // GREEN ceiling: a huge σ spread is capped.
  const hugeBase = { microprice: 100, q: 0, gamma: 0.01, sigma: 100, tau: 1, kappa: 1 };
  const hugeNoCeil = quotes(hugeBase);
  const ceilBps = 100; // 100 bps ceiling = 1.0 price unit at mid=100
  const hugeCapped = quotes({ ...hugeBase, maxHalfSpreadBps: ceilBps });
  const expectedCeilPx = (ceilBps / 1e4) * 100; // 1.0
  assert(hugeCapped.halfSpread !== null && near(hugeCapped.halfSpread, expectedCeilPx, 1e-9),
    `ceiling: huge σ spread capped (raw ${hugeNoCeil.halfSpread?.toExponential(3)} → ${hugeCapped.halfSpread})`);
  assert(hugeCapped.halfSpread !== null && hugeCapped.halfSpread < (hugeNoCeil.halfSpan ?? Infinity),
    'ceiling: capped halfSpread < raw computed halfSpread');

  // RED: floor > ceiling → fail-open null
  const clampBadRange = quotes({ ...baseParams, minHalfSpreadBps: 200, maxHalfSpreadBps: 50 });
  assert(clampBadRange.bidPx === null && clampBadRange.askPx === null && clampBadRange.halfSpread === null,
    'RED floor/ceiling: min>max → all null (fail-open)');

  // GREEN both bounds within range → no change to halfSpread
  const wideBase = { microprice: 100, q: 0, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1 };
  const wideNoClamp = quotes(wideBase);
  const wideLoose = quotes({ ...wideBase, minHalfSpreadBps: 0.001, maxHalfSpreadBps: 1e6 });
  assert(wideLoose.halfSpread !== null && near(wideLoose.halfSpread, wideNoClamp.halfSpread, 1e-12),
    'floor/ceiling: loose bounds → halfSpread unchanged');

  // ── GUARD 2: SKEW CLAMP (reservationPrice + quotes passthrough) ──────────────
  // GREEN: a large q that would skew > maxSkewTicks is clamped to exactly the limit.
  // Build a case where raw skew is large: q=100, γ=0.01, σ=2 (price vol), τ=1.
  // raw skew = 100·0.01·4·1 = 4.0 price units. maxSkewTicks=10, tickSize=0.1 → cap=1.0.
  const skewBase = { s: 100, q: 100, gamma: 0.01, sigma: 2, tau: 1 };
  const rawSkewRp = reservationPrice(skewBase); // 100 - 4 = 96
  const clampedRp = reservationPrice({ ...skewBase, maxSkewTicks: 10, tickSize: 0.1 }); // 100 - 1 = 99
  assert(rawSkewRp !== null && near(rawSkewRp, 96, 1e-10),
    `skew clamp: raw reservation = 96 (got ${rawSkewRp})`);
  assert(clampedRp !== null && near(clampedRp, 99, 1e-10),
    `skew clamp GREEN: skew clamped from 4.0 to 1.0 → r=99 (got ${clampedRp})`);

  // METAMORPHIC: tighter maxSkewTicks → reservation closer to microprice (s=100).
  const rpLoose  = reservationPrice({ ...skewBase, maxSkewTicks: 50,  tickSize: 0.1 }); // cap=5.0 → raw 4.0, no clamp
  const rpTight  = reservationPrice({ ...skewBase, maxSkewTicks: 5,   tickSize: 0.1 }); // cap=0.5
  const rpTighter= reservationPrice({ ...skewBase, maxSkewTicks: 1,   tickSize: 0.1 }); // cap=0.1
  assert(rpLoose !== null && rpTight !== null && rpTighter !== null,
    'skew clamp metamorphic: all finite');
  assert(rpTight > rpLoose && rpTighter > rpTight,
    `skew clamp METAMORPHIC: tighter clamp → reservation closer to s (loose ${rpLoose}, tight ${rpTight}, tighter ${rpTighter})`);
  assert(Math.abs(100 - rpTighter) < Math.abs(100 - rpTight) && Math.abs(100 - rpTight) <= Math.abs(100 - rpLoose),
    'skew clamp METAMORPHIC: |s - r| shrinks monotonically as clamp tightens');

  // RED: bad clamp params (tickSize ≤ 0) → no clamp (fail-open to formula)
  const skewBadTick = reservationPrice({ ...skewBase, maxSkewTicks: 10, tickSize: 0 });
  assert(skewBadTick !== null && near(skewBadTick, 96, 1e-10),
    `RED skew clamp: tickSize=0 → no clamp (raw r=96, got ${skewBadTick})`);
  // negative maxSkewTicks → no clamp
  const skewNeg = reservationPrice({ ...skewBase, maxSkewTicks: -5, tickSize: 0.1 });
  assert(skewNeg !== null && near(skewNeg, 96, 1e-10),
    `RED skew clamp: maxSkewTicks<0 → no clamp (raw r=96, got ${skewNeg})`);

  // quotes() passes maxSkewTicks/tickSize through to reservationPrice
  const qSkewRaw = quotes({ microprice: 100, q: 100, gamma: 0.01, sigma: 2, tau: 1, kappa: 1 });
  const qSkewClamped = quotes({ microprice: 100, q: 100, gamma: 0.01, sigma: 2, tau: 1, kappa: 1, maxSkewTicks: 10, tickSize: 0.1 });
  assert(qSkewRaw.reservation !== null && near(qSkewRaw.reservation, 96, 1e-10),
    `skew clamp via quotes: raw reservation 96 (got ${qSkewRaw.reservation})`);
  assert(qSkewClamped.reservation !== null && near(qSkewClamped.reservation, 99, 1e-10),
    `skew clamp via quotes: clamped reservation 99 (got ${qSkewClamped.reservation})`);

  // ── GUARD 3: INVENTORY HARD-LIMIT ────────────────────────────────────────────
  // GREEN: q ≥ qMax (long) → bid suppressed (buy side), ask allowed (sell side).
  const invLong = quotes({ microprice: 100, q: 5, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1, qMax: 5 });
  assert(invLong.bidPx === null && invLong.askPx !== null,
    `inv-limit GREEN: q=5≥qMax=5 long → bid null, ask quoted (bid ${invLong.bidPx}, ask ${invLong.askPx})`);
  // GREEN: q ≤ −qMax (short) → ask suppressed (sell side), bid allowed (buy side).
  const invShort = quotes({ microprice: 100, q: -5, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1, qMax: 5 });
  assert(invShort.askPx === null && invShort.bidPx !== null,
    `inv-limit GREEN: q=-5≤-qMax short → ask null, bid quoted (bid ${invShort.bidPx}, ask ${invShort.askPx})`);

  // GREEN: |q| < qMax → both sides quoted (guard inactive)
  const invUnder = quotes({ microprice: 100, q: 3, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1, qMax: 5 });
  assert(invUnder.bidPx !== null && invUnder.askPx !== null,
    'inv-limit GREEN: |q|<qMax → both sides quoted');

  // RED edge: qMax=0 → |q|≥0 always true → both sides suppressed (with q≠0).
  const invQmax0 = quotes({ microprice: 100, q: 1, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1, qMax: 0 });
  assert(invQmax0.bidPx === null && invQmax0.askPx === null,
    `RED inv-limit: qMax=0, q=1 → both sides null (bid ${invQmax0.bidPx}, ask ${invQmax0.askPx})`);
  // qMax=0, q=0 → |0|≥0 true but qMax≤0 path → both null (defensive total suppression)
  const invQmax0q0 = quotes({ microprice: 100, q: 0, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1, qMax: 0 });
  assert(invQmax0q0.bidPx === null && invQmax0q0.askPx === null,
    'RED inv-limit: qMax=0, q=0 → both sides null');

  // METAMORPHIC: reservation is still reported even when a side is suppressed
  // (the inventory guard affects placement, not the reservation computation).
  assert(invLong.reservation !== null && invLong.halfSpread !== null,
    'inv-limit METAMORPHIC: reservation + halfSpread reported even when bid suppressed');

  // ── OPT-IN REGRESSION: omitting all new params → byte-identical current behavior
  const optInBase = { microprice: 100, q: 2, gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1, lambda: 0.001, orderSize: 5 };
  const withNewParamsUndefined = quotes(optInBase);
  // Recompute the legacy path by hand: reservation = s - q·γ·σ²·τ
  const legacyR = 100 - 2 * 0.01 * 0.02 * 0.02 * 1;
  const legacySpread = optimalSpread({ gamma: 0.01, sigma: 0.02, tau: 1, kappa: 1 });
  const legacyHalf = legacySpread / 2 + 0.001 * 5;
  assert(withNewParamsUndefined.reservation !== null && near(withNewParamsUndefined.reservation, legacyR, 1e-12),
    `opt-in regression: reservation matches legacy (${withNewParamsUndefined.reservation} vs ${legacyR})`);
  assert(withNewParamsUndefined.halfSpread !== null && near(withNewParamsUndefined.halfSpread, legacyHalf, 1e-12),
    `opt-in regression: halfSpread matches legacy (${withNewParamsUndefined.halfSpread} vs ${legacyHalf})`);
  assert(withNewParamsUndefined.bidPx !== null && near(withNewParamsUndefined.bidPx, legacyR - legacyHalf, 1e-12),
    'opt-in regression: bidPx matches legacy');
  assert(withNewParamsUndefined.askPx !== null && near(withNewParamsUndefined.askPx, legacyR + legacyHalf, 1e-12),
    'opt-in regression: askPx matches legacy');

  console.log(`avellaneda-stoikov --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
