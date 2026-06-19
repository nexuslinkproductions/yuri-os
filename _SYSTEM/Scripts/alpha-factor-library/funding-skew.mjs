#!/usr/bin/env node
// @capability: funding-skew
// @serves: funding rate quote skew | perp settlement nudge | inventory funding-cost bias | reservation price funding adjustment | engine-2 maker skew
// @does: Pure-compute helper returning a bounded quote-skew adjustment toward the funding-fAVORABLE side for a perp maker. SIGN CONVENTION (positive fundingRate → bias SHORT → nudge reservation DOWN; mirrors A-S reservationPrice in avellaneda-stoikov.mjs). SETTLEMENT-PROXIMITY WEIGHT = 1 - secsToFunding/fundingIntervalSec, i.e. skew GROWS as settlement APPROACHES (→1 at settlement, →0 right after). JUSTIFICATION: Binance USDⓈ-M funding is a DISCRETE snapshot payment (the per-interval rate, paid in full to whoever holds the favorable side at the settlement timestamp — NOT continuously accrued). So the value of skewing toward the favorable side scales with (a) capture certainty — the closer to settlement, the more likely the current position is still open at the timestamp; and (b) inverse adverse-selection cost — skewing 10s before settlement has a tiny window to be picked off, skewing 8h early has the full window for a payment you're unlikely to still be holding to collect. Both make the efficient skew time the final approach to settlement, hence weight = 1 - secs/28800. This is the dominant maker heuristic (settlement-capture bots ramp in the final minutes). Fail-open: bad/zero/NaN funding or tickSize≤0 → flat.
// @use: Call fundingSkew({fundingRate,q,secsToFunding,tickSize,opts}) → {skewTicks,bias,reservationAdjPrice}; quoting layer adds reservationAdjPrice (= skewTicks·tickSize, signed) to the A-S reservation price. DISARMED paper only; never sizes the live daemon.
// @exports: fundingSkew, FUNDING_SKEW_DEFAULTS
//
// CONSTRAINTS: pure function (no imports), fail-open (never throws; bad input → flat), no new deps.
// INV-1 paper-only (no order path), INV-2 no key reads. SIGN CONVENTION (must match A-S reservationPrice
// in avellaneda-stoikov.mjs, which nudges reservation DOWN for positive inventory q): positive fundingRate
// → reservationAdjPrice NEGATIVE (nudge reservation DOWN, encourage being short). Magnitude scales with
// |fundingRate| × (1 - secsToFunding/28800) × sensitivity, clamped to ±maxSkewTicks ticks. Metamorphic-safe:
// larger |funding| → larger |skewTicks| up to the clamp; symmetric in sign.

import { pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// §0 — DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────
export const FUNDING_SKEW_DEFAULTS = {
  // Ticks of skew per unit of "expected funding cost over the remaining window".
  // Expected-funding-cost ∈ roughly [-0.02, +0.02] for sane regimes (|f| ≤ 0.01%/8h × 1.0),
  // so sensitivity 50 → up to ~1 tick at the sane edge, ~5 ticks at |f|=0.001 (0.1%/8h, rare).
  // Deliberately conservative: this is a nudge, not a regime change. [INTERNAL engineering choice]
  sensitivity: 50,
  // Hard clamp on |skewTicks|. Reservation price must stay near mid or quotes cross/spread inverts.
  // 8 ticks on BTC ($0.10 tick) = $0.80 — large but bounded; quoting layer should also bound the
  // combined skew (q-skew + funding-skew). [INTERNAL]
  maxSkewTicks: 8,
  // Funding interval (Binance USDⓈ-M perp = 8h = 28800s). [SOURCED Binance docs]
  fundingIntervalSec: 28800,
  // Inventory-awareness factor: multiply the skew by (1 - |q|/maxQabs) so a maker already maxed-out
  // on the funding-favorable side does not keep skewing further (diminishing room). Set maxQabs≤0
  // to disable (treat q as irrelevant). [INTERNAL]
  maxQabs: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// §1 — CORE: fundingSkew
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compute a bounded quote-skew adjustment toward the funding-favorable side.
 *
 * SIGN CONVENTION (mirrors A-S reservationPrice — positive inventory q nudges reservation DOWN):
 *   fundingRate > 0  (longs pay shorts) → bias SHORT → reservationAdjPrice < 0 (nudge DOWN)
 *   fundingRate < 0  (shorts pay longs) → bias LONG  → reservationAdjPrice > 0 (nudge UP)
 *
 * SETTLEMENT-PROXIMITY WEIGHT = 1 - secsToFunding / fundingIntervalSec.
 * The funding payment is realized ONLY if inventory is held through settlement, and Binance pays
 * the per-snapshot fundingRate in full at the settlement timestamp (NOT accrued continuously). So
 * the value of skewing toward the favorable side scales with capture-certainty (closer to settlement
 * → more likely the current position is still open at the timestamp) AND inverse-adverse-selection
 * (skewing 10s before settlement has a tiny window to be picked off; skewing 8h early has the full
 * window for a payment you're unlikely to still be holding to collect). Both make the efficient skew
 * time the final approach to settlement. Hence weight →1 AT settlement, →0 right AFTER settlement.
 * This is the dominant maker heuristic (settlement-capture bots ramp in the final minutes, not 8h early).
 *
 * @param {object} p
 * @param {number} p.fundingRate   Per-interval funding rate (fraction, e.g. 0.0001 = 0.01%/8h).
 * @param {number} [p.q=0]         Current inventory (base units); used only for the inventory-awareness factor.
 * @param {number} [p.secsToFunding] Seconds to next settlement. Skew grows as this →0 (settlement approaching); 0/at-settlement → max weight; omitted → treated as at-settlement (max weight).
 * @param {number} [p.tickSize]    Price increment; reservationAdjPrice = skewTicks × tickSize. If ≤0 → fail-open flat.
 * @param {object} [p.opts]        Overrides merged onto FUNDING_SKEW_DEFAULTS.
 * @returns {{skewTicks:number, bias:'long'|'short'|'flat', reservationAdjPrice:number}}
 */
export function fundingSkew({ fundingRate, q = 0, secsToFunding, tickSize, opts = {} } = {}) {
  const o = { ...FUNDING_SKEW_DEFAULTS, ...(opts || {}) };
  const FAIL_OPEN = { skewTicks: 0, bias: 'flat', reservationAdjPrice: 0 };

  // Fail-open guards: NaN/Infinity/non-number funding, zero funding, bad tickSize.
  if (typeof fundingRate !== 'number' || !Number.isFinite(fundingRate) || fundingRate === 0) return FAIL_OPEN;
  if (typeof tickSize !== 'number' || !Number.isFinite(tickSize) || tickSize <= 0) return FAIL_OPEN;

  // Settlement-proximity weight ∈ [0,1]; clamp secsToFunding into [0, interval]. Missing secsToFunding
  // → treat as AT settlement (max proximity = 1), the conservative "no countdown provided" default.
  // Direction (A): proximity = 1 - secs/interval → 1 AT settlement, 0 right AFTER. See header justification.
  const interval = (Number.isFinite(o.fundingIntervalSec) && o.fundingIntervalSec > 0) ? o.fundingIntervalSec : 28800;
  const secs = (typeof secsToFunding === 'number' && Number.isFinite(secsToFunding)) ? secsToFunding : 0;
  const secsClamped = Math.max(0, Math.min(interval, secs));
  const proximity = 1 - (secsClamped / interval);              // →1 at settlement, →0 just after

  // Inventory-awareness: shrink skew if already loaded on the funding-favorable side.
  let invFactor = 1;
  if (typeof q === 'number' && Number.isFinite(q) && Number.isFinite(o.maxQabs) && o.maxQabs > 0) {
    invFactor = Math.max(0, 1 - Math.abs(q) / o.maxQabs);
  }

  // Raw signed skew in ticks. Expected funding cost = fundingRate × proximity; sign is preserved
  // by fundingRate itself. sensitivity scales it into tick space. The DOWN-nudge-on-positive-funding
  // convention is just: skewTicks carries the SAME sign as fundingRate, and reservationAdjPrice is
  // skewTicks × tickSize — so positive funding → negative reservationAdjPrice? NO: we want positive
  // funding → nudge reservation DOWN → reservationAdjPrice NEGATIVE. So skewTicks must be NEGATIVE
  // for positive funding. Hence the leading minus sign on the raw skew.
  const rawSkew = -(fundingRate * proximity * o.sensitivity * invFactor);

  // Clamp to ±maxSkewTicks.
  const maxSk = (Number.isFinite(o.maxSkewTicks) && o.maxSkewTicks > 0) ? o.maxSkewTicks : 0;
  const skewTicks = Math.max(-maxSk, Math.min(maxSk, rawSkew));

  // Bias label by the sign of fundingRate (NOT the post-clamp skewTicks — the clamp can zero a
  // sub-tick nudge but the funding DIRECTION is still defined). Tie-broken by fundingRate sign.
  let bias = 'flat';
  if (fundingRate > 0) bias = 'short';
  else if (fundingRate < 0) bias = 'long';

  const reservationAdjPrice = skewTicks * tickSize;               // signed, same sign as skewTicks
  return { skewTicks, bias, reservationAdjPrice };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — --test self-test (deterministic, no network)
// ─────────────────────────────────────────────────────────────────────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (label, cond) => { if (cond) { pass++; } else { fail++; console.error(`FAIL: ${label}`); } };
  const approx = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;
  const tick = 0.1; // BTC-ish

  // GREEN 1 — positive funding → short bias, reservation DOWN (negative reservationAdjPrice)
  {
    const r = fundingSkew({ fundingRate: 0.0005, secsToFunding: 14400, tickSize: tick });
    ok('G1 positive funding → bias short', r.bias === 'short');
    ok('G1 positive funding → reservation DOWN (skewTicks<0)', r.skewTicks < 0);
    ok('G1 positive funding → reservationAdjPrice<0', r.reservationAdjPrice < 0);
    ok('G1 reservationAdjPrice = skewTicks·tickSize', approx(r.reservationAdjPrice, r.skewTicks * tick));
  }
  // GREEN 2 — negative funding → long bias, reservation UP
  {
    const r = fundingSkew({ fundingRate: -0.0005, secsToFunding: 14400, tickSize: tick });
    ok('G2 negative funding → bias long', r.bias === 'long');
    ok('G2 negative funding → reservation UP (skewTicks>0)', r.skewTicks > 0);
    ok('G2 negative funding → reservationAdjPrice>0', r.reservationAdjPrice > 0);
  }
  // GREEN 3 — magnitude scales with |funding| (metamorphic: half the funding → half the skew, pre-clamp)
  {
    const big = fundingSkew({ fundingRate: 0.0004, secsToFunding: 14400, tickSize: tick });
    const small = fundingSkew({ fundingRate: 0.0002, secsToFunding: 14400, tickSize: tick });
    ok('G3 |skew| doubles with doubled |funding|', approx(Math.abs(big.skewTicks), 2 * Math.abs(small.skewTicks)));
  }
  // GREEN 4 — settlement-proximity direction (A): skew GROWS as settlement APPROACHES.
  // ECONOMIC DIRECTION (justified in header): Binance pays the snapshot fundingRate in full at the
  // settlement timestamp; the closer to settlement, the higher the capture-certainty and the lower the
  // adverse-selection window. So at-settlement (secs=0) → MAX skew; right-after (secs=28800) → ~0 skew.
  {
    const near = fundingSkew({ fundingRate: 0.0005, secsToFunding: 100, tickSize: tick });    // 100s to settlement
    const far  = fundingSkew({ fundingRate: 0.0005, secsToFunding: 28000, tickSize: tick });  // 28000s to settlement
    ok('G4 near-settlement skew > far-from-settlement skew (direction A)',
      Math.abs(near.skewTicks) > Math.abs(far.skewTicks));
    // at-settlement (secs=0) → proximity=1 → max; right-after (secs=28800) → proximity=0 → ~0
    const atSettle = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick });
    const afterSettle = fundingSkew({ fundingRate: 0.0005, secsToFunding: 28800, tickSize: tick });
    ok('G4b at-settlement (secs=0) → max skew', approx(atSettle.skewTicks, -(0.0005 * 1 * 50)));
    ok('G4c right-after-settlement (secs=28800) → ~0 skew', approx(afterSettle.skewTicks, 0));
  }
  // GREEN 5 — clamp engages at high |funding| (at settlement, proximity=1; raw = -fundingRate·1·50·1)
  {
    const r = fundingSkew({ fundingRate: 0.5, secsToFunding: 0, tickSize: tick, opts: { maxSkewTicks: 3 } });
    ok('G5 high |funding| clamped to -maxSkewTicks', approx(r.skewTicks, -3));
    ok('G5 clamp sign preserved (short/Down)', r.bias === 'short' && r.skewTicks < 0);
    // sub-clamp: smaller |funding| stays under the clamp (raw -2.5 < 3)
    const sub = fundingSkew({ fundingRate: 0.05, secsToFunding: 0, tickSize: tick, opts: { maxSkewTicks: 3 } });
    ok('G5b sub-clamp |funding| below clamp (skewTicks=-2.5)', approx(sub.skewTicks, -2.5));
  }
  // GREEN 6 — secsToFunding omitted → treated as AT settlement (max proximity = 1)
  {
    const r = fundingSkew({ fundingRate: 0.0005, tickSize: tick });
    const atSettle = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick });
    ok('G6 omitted secsToFunding == at-settlement (max weight)', approx(r.skewTicks, atSettle.skewTicks));
  }

  // RED 1 — zero funding → flat / fail-open
  {
    const r = fundingSkew({ fundingRate: 0, secsToFunding: 14400, tickSize: tick });
    ok('R1 zero funding → flat', r.bias === 'flat' && r.skewTicks === 0 && r.reservationAdjPrice === 0);
  }
  // RED 2 — NaN funding → flat
  {
    const r = fundingSkew({ fundingRate: NaN, secsToFunding: 14400, tickSize: tick });
    ok('R2 NaN funding → flat', r.bias === 'flat' && r.skewTicks === 0);
  }
  // RED 3 — Infinity funding → flat
  {
    const r = fundingSkew({ fundingRate: Infinity, secsToFunding: 14400, tickSize: tick });
    ok('R3 Infinity funding → flat', r.bias === 'flat' && r.skewTicks === 0);
  }
  // RED 4 — non-number funding → flat
  {
    const r = fundingSkew({ fundingRate: 'high', secsToFunding: 14400, tickSize: tick });
    ok('R4 non-number funding → flat', r.bias === 'flat' && r.skewTicks === 0);
  }
  // RED 5 — tickSize ≤ 0 → flat
  {
    const r = fundingSkew({ fundingRate: 0.0005, secsToFunding: 14400, tickSize: 0 });
    ok('R5 tickSize=0 → flat', r.bias === 'flat' && r.reservationAdjPrice === 0);
    const r2 = fundingSkew({ fundingRate: 0.0005, secsToFunding: 14400, tickSize: -1 });
    ok('R5b tickSize<0 → flat', r2.bias === 'flat' && r2.reservationAdjPrice === 0);
  }
  // RED 6 — undefined args → flat
  {
    const r = fundingSkew();
    ok('R6 no args → flat', r.bias === 'flat' && r.skewTicks === 0 && r.reservationAdjPrice === 0);
  }

  // METAMORPHIC — clamp is symmetric, bias is symmetric in sign
  {
    const r = fundingSkew({ fundingRate: 0.0005, secsToFunding: 14400, tickSize: tick, opts: { maxSkewTicks: 1 } });
    const r2 = fundingSkew({ fundingRate: -0.0005, secsToFunding: 14400, tickSize: tick, opts: { maxSkewTicks: 1 } });
    ok('MM clamp symmetric |skew| equal', approx(Math.abs(r.skewTicks), Math.abs(r2.skewTicks)));
    ok('MM sign flip: short<0, long>0', r.skewTicks < 0 && r2.skewTicks > 0);
  }
  // METAMORPHIC — reservationAdjPrice scales linearly with tickSize
  {
    const a = fundingSkew({ fundingRate: 0.0005, secsToFunding: 14400, tickSize: 0.1 });
    const b = fundingSkew({ fundingRate: 0.0005, secsToFunding: 14400, tickSize: 0.2 });
    ok('MM reservationAdjPrice doubles with tickSize', approx(b.reservationAdjPrice, 2 * a.reservationAdjPrice));
  }

  // GREEN 7 — INVENTORY-AWARENESS: maxQabs>0 shrinks skew by (1 - |q|/maxQabs).
  // At-settlement (prox=1), f=0.0005, sensitivity=50: raw = -f·1·50·invFactor.
  // q=0.5, maxQabs=1 → invFactor=0.5 → skew=-0.0125. KILLS the invFactor-branch mutants
  // (maxQabs default 0→1, *→/, Math.max→Math.min, +/- sign, > 0→> 1, === → !== on typeof q, q=0→1 default).
  {
    const r = fundingSkew({ fundingRate: 0.0005, q: 0.5, secsToFunding: 0, tickSize: tick, opts: { maxQabs: 1 } });
    ok('G7 invFactor=0.5 shrinks skew to -0.0125', approx(r.skewTicks, -0.0125));
    ok('G7 invFactor path still short-bias', r.bias === 'short');
  }
  // GREEN 7b — q = maxQabs → invFactor = 0 → skew fully suppressed (flat magnitude, bias still 'short').
  // KILLS Math.max(0,...)→Math.max(1,...) (would give invFactor=1 instead of 0) and Math.min→... variants.
  {
    const r = fundingSkew({ fundingRate: 0.0005, q: 1, secsToFunding: 0, tickSize: tick, opts: { maxQabs: 1 } });
    ok('G7b q=maxQabs → invFactor=0 → skewTicks=0', approx(r.skewTicks, 0));
    ok('G7b bias still short (funding sign, not skew magnitude)', r.bias === 'short');
  }
  // GREEN 7c — omitted q with maxQabs>0 defaults q=0 → invFactor=1 (no shrink). KILLS q=0→1 default mutant.
  {
    const r = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick, opts: { maxQabs: 1 } });
    ok('G7c omitted q (default 0) with maxQabs>0 → invFactor=1, skew=-0.025', approx(r.skewTicks, -0.025));
  }
  // GREEN 7d — q between 0 and maxQabs shrinks proportionally (metamorphic: q=0.25 → invFactor=0.75).
  {
    const r = fundingSkew({ fundingRate: 0.0005, q: 0.25, secsToFunding: 0, tickSize: tick, opts: { maxQabs: 1 } });
    ok('G7d q=0.25 → invFactor=0.75 → skew=-0.01875', approx(r.skewTicks, -0.01875));
  }

  // GREEN 8 — INTERVAL-GUARD: invalid fundingIntervalSec (≤0, NaN) → fallback to 28800.
  // With secsToFunding=0: proximity = 1 - 0/28800 = 1 → skew = -f·1·50 = -0.025.
  // KILLS the > → ≥ interval mutant (interval=0 would div-by-zero → NaN) and > 0 → > 1 mutant.
  {
    const r0 = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick, opts: { fundingIntervalSec: 0 } });
    ok('G8 interval=0 → fallback 28800 → skew=-0.025', approx(r0.skewTicks, -0.025));
    const rNaN = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick, opts: { fundingIntervalSec: NaN } });
    ok('G8b interval=NaN → fallback 28800 → skew=-0.025', approx(rNaN.skewTicks, -0.025));
    const rNeg = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick, opts: { fundingIntervalSec: -100 } });
    ok('G8c interval<0 → fallback 28800 → skew=-0.025', approx(rNeg.skewTicks, -0.025));
  }

  // GREEN 9 — CLAMP-FALLBACK: invalid maxSkewTicks (NaN, ≤0) → fallback to 0 → flat skew magnitude.
  // KILLS the :0→:1 fallback mutant (would clamp to ±1 instead of 0) and > → ≥ mutant.
  {
    const rNaN = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick, opts: { maxSkewTicks: NaN } });
    ok('G9 maxSkewTicks=NaN → fallback 0 → skewTicks=0', approx(rNaN.skewTicks, 0));
    const rNeg = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick, opts: { maxSkewTicks: -1 } });
    ok('G9b maxSkewTicks<0 → fallback 0 → skewTicks=0', approx(rNeg.skewTicks, 0));
    const rZero = fundingSkew({ fundingRate: 0.0005, secsToFunding: 0, tickSize: tick, opts: { maxSkewTicks: 0 } });
    ok('G9c maxSkewTicks=0 → clamp 0 → skewTicks=0', approx(rZero.skewTicks, 0));
  }

  // Equivalent-mutant notes (mutations that produce identical behavior on all reachable inputs):
  //   L72 ||→&& tickSize guard (typeof!==number && !isFinite → always true when reached for non-numbers)
  //   L80/L97 comment-literal / fallback-literal 0→1 where value unreachable or masked by downstream
  //   L104/103 fundingRate sign: >0 vs ≥0 and <0 vs <1 identical since fundingRate=0 is guarded at L71
  //   L77/L78 finite-guard &&↔|| identical for finite-positive vs NaN operands on the guarded paths
  //   L71 fundingRate===0→===1: zero funding yields zero raw skew → flat-by-collision (output identical)

  console.log(`funding-skew --test: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}
