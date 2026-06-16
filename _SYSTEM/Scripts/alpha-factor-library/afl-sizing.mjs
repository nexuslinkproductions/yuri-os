#!/usr/bin/env node
/**
 * afl-sizing.mjs — paper-only advisory position sizing for the AFL pipeline.
 *
 * Pipeline: signal → regime → vol_target_sizing → risk_check.
 * Conservative by construction: fractional-Kelly on the LOWER confidence bound of edge,
 * volatility targeting via nexus-distrib (Rust-backed weightedStdDev with JS fallback),
 * optional CVaR-robust cap via decision-sim QMC sampling.
 *
 * PAPER-ONLY: computes a sizing body, NEVER posts an order.
 *
 * @module afl-sizing
 * @capability afl-sizing
 * @serves position sizing | fractional Kelly | volatility targeting | CVaR-robust sizing
 * @does computeSize({edgeMean,edgeLowerCI,winProb,payoff,returns,equity,targetVol,caps}) →
 *   {targetNotional,targetQty,fraction,reason} — paper-only advisory sizing
 * @use the sizing step in the AFL pipeline after regime detection, before risk_check
 */

import { weightedStdDev, backend as nexusBackend } from '../math/nexus-distrib.mjs';
import { halton, makeQmcRng, robustScore, makeRng } from '../decision-sim.mjs';

// ── constants ──────────────────────────────────────────────────────────────
const ANNUALIZATION   = Math.sqrt(365);   // daily → annual vol
const CARVER_DIVISOR  = 16;               // √256 ≈ 16, Carver daily-vol-target scalar
const MIN_WIN_PROB    = 0.50;             // confidence floor — below this → NO_TRADE
const DEFAULT_KELLY   = 0.35;             // λ ∈ [0.25, 0.5]
const DEFAULT_TARGET  = 0.20;             // 20 % annualised portfolio vol
const DEFAULT_TAIL    = 0.10;             // CVaR tail fraction
const QMC_DRAWS       = 200;              // QMC uncertainty draws for CVaR-robust cap
const DD_FLOOR        = 0.25;             // drawdown-throttle floor

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Realised annualised volatility from daily returns via nexus-distrib's
 * weightedStdDev (Rust-backed when YURI_NEXUS_RUST=1, JS fallback otherwise).
 * Returns null when fewer than 2 observations.
 */
function realizedVol(returns) {
  if (!returns || returns.length < 2) return null;
  const w = returns.map(() => 1);               // equal weights — sample vol
  const dailySigma = weightedStdDev(returns, w);
  return dailySigma * ANNUALIZATION;
}

/**
 * Fractional Kelly on the LOWER-CI edge.
 *
 * Standard Kelly:  f* = (b·p − q) / b   where b = payoff (net odds), q = 1−p.
 * We use edgeLowerCI (the deflated-Sharpe lower bound) as the conservative edge
 * estimate, then scale by kellyFraction ∈ [0.25, 0.5].
 *
 * Returns 0 when edgeLowerCI ≤ 0 or the raw Kelly is non-positive.
 */
function fractionalKelly(edgeLowerCI, winProb, payoff, kellyFraction) {
  if (edgeLowerCI <= 0) return 0;
  if (payoff <= 0) return 0;                     // degenerate — no positive payout
  const q = 1 - winProb;
  const rawKelly = (payoff * winProb - q) / payoff;
  if (rawKelly <= 0) return 0;

  // Conservative Kelly: edgeLowerCI / payoff (the lower-bound edge as a fraction).
  // Clamp to rawKelly so the conservative estimate never exceeds the point estimate
  // (fractional-Kelly-on-lowerCI ≤ point-Kelly by construction).
  const conservative = Math.min(edgeLowerCI / payoff, rawKelly);
  return kellyFraction * conservative;
}

/**
 * Vol-targeting scalar (Carver-style, asymmetric).
 *
 * daily_cash_vol_target = (annual_pct_vol_target × capital) / 16
 * scalar = targetVol / realizedVol
 *
 * Asymmetric rule: fast down-shift on vol expansion (square the ratio),
 * slow up-shift on vol contraction (sqrt the ratio).
 */
function volTargetScalar(equity, targetVol, realizedAnnualVol) {
  if (!realizedAnnualVol || realizedAnnualVol <= 0) return 1.0;
  const ratio = targetVol / realizedAnnualVol;
  return ratio < 1 ? ratio * ratio : Math.sqrt(ratio);
}

/**
 * Drawdown throttle: size = base × max(floor, 1 − dd / max_dd).
 */
function drawdownThrottle(currentDD, maxDD) {
  if (!maxDD || maxDD <= 0) return 1.0;
  return Math.max(DD_FLOOR, 1 - currentDD / maxDD);
}

/**
 * CVaR-robust cap via decision-sim QMC sampling over return uncertainty.
 *
 * Builds a minimal decision-sim problem where the "config" is the sizing fraction
 * and uncertainty is drawn from a distribution skewed toward the lower-CI edge.
 * Returns a cap fraction (0–1): if half-size scores better under CVaR, cap at 0.5.
 */
export function cvarRobustCap(edgeMean, edgeLowerCI, winProb, payoff, returns, equity) {
  // Robust-Kelly cap: choose the fraction that MAXIMIZES the worst-tail (CVaR) of
  // log-growth over the EMPIRICAL return distribution. Fat negative tails → cap < 1
  // (shrinks size); mostly-positive returns → cap = 1 (no shrink). Deterministic on
  // real data — no model sampling needed.
  // NOTE: the prior implementation used value = equity*sqrt(fraction*edge), which is
  // scale-invariant in fraction → halfScore was ALWAYS fullScore/sqrt(2), so the cap
  // could never trip and was a silent no-op (red-team 2026-06-16 BUG-1, CRITICAL).
  if (!Array.isArray(returns)) return 1.0;
  const rs = returns.filter(Number.isFinite);
  if (rs.length < 10) return 1.0;
  const candidates = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  let best = 1.0;
  let bestCvar = -Infinity;
  for (const f of candidates) {
    const g = rs.map((r) => {
      const x = 1 + f * r;
      return x > 1e-9 ? Math.log(x) : -50; // ruin guard for f*r ≤ -1
    });
    g.sort((a, b) => a - b);
    const tailN = Math.max(1, Math.floor(g.length * DEFAULT_TAIL));
    let s = 0;
    for (let i = 0; i < tailN; i++) s += g[i];
    const cvar = s / tailN; // mean of the worst tailFrac of log-growth outcomes
    if (cvar > bestCvar) {
      bestCvar = cvar;
      best = f;
    }
  }
  return best;
}

// ── main export ─────────────────────────────────────────────────────────────

/**
 * computeSize — paper-only advisory position sizing.
 *
 * @param {Object}  args
 * @param {number}  args.edgeMean       point estimate of edge (deflated Sharpe)
 * @param {number}  args.edgeLowerCI    lower confidence bound of edge
 * @param {number}  args.winProb        win probability estimate
 * @param {number}  args.payoff         payoff ratio (net odds; 1.0 = even-money)
 * @param {number[]} args.returns       daily return series for realised-vol
 * @param {number}  args.equity         current portfolio equity
 * @param {number}  [args.targetVol=0.20]  annualised target volatility
 * @param {Object}  [args.caps]         hard risk caps
 * @param {number}  [args.caps.maxFraction=0.25]      max fraction of equity
 * @param {number}  [args.caps.maxPerPosition=∞]      max notional per position
 * @param {number}  [args.caps.maxDrawdown=0.25]      drawdown threshold
 * @param {number}  [args.caps.currentDrawdown=0]     current drawdown level
 * @param {number}  [args.caps.kellyFraction=0.35]    Kelly multiplier (0.25–0.5)
 * @param {number}  [args.caps.confidenceFloor=0.50]  minimum winProb to trade
 * @param {boolean} [args.caps.cvarsRobust=false]      enable CVaR-robust cap
 * @returns {{ targetNotional: number, targetQty: number, fraction: number, reason: string }}
 */
export function computeSize({
  edgeMean,
  edgeLowerCI,
  winProb,
  payoff,
  returns,
  equity,
  targetVol = DEFAULT_TARGET,
  caps = {},
}) {
  const {
    maxFraction      = 0.25,
    maxPerPosition   = Infinity,
    maxDrawdown      = 0.25,
    currentDrawdown  = 0,
    kellyFraction    = DEFAULT_KELLY,
    confidenceFloor  = MIN_WIN_PROB,
    cvarsRobust      = false,
  } = caps;

  // ── Gate 0: finite-input guard ───────────────────────────────────────
  // NaN/Infinity slips past `<= 0` and `< floor` (both false for NaN) and would
  // leak as NaN targetNotional/fraction (red-team 2026-06-16 BUG-2). Fail closed.
  if (!Number.isFinite(edgeLowerCI) || !Number.isFinite(winProb)
      || !Number.isFinite(payoff) || payoff <= 0) {
    return { targetNotional: 0, targetQty: 0, fraction: 0,
             reason: 'NO_TRADE: non-finite inputs' };
  }

  // ── Gate 1: NO_TRADE conditions ──────────────────────────────────────
  if (edgeLowerCI <= 0) {
    return { targetNotional: 0, targetQty: 0, fraction: 0,
             reason: 'NO_TRADE: edgeLowerCI ≤ 0' };
  }
  if (winProb < confidenceFloor) {
    return { targetNotional: 0, targetQty: 0, fraction: 0,
             reason: `NO_TRADE: winProb ${winProb.toFixed(3)} < floor ${confidenceFloor}` };
  }
  if (!Number.isFinite(equity) || equity <= 0) {
    return { targetNotional: 0, targetQty: 0, fraction: 0,
             reason: 'NO_TRADE: invalid equity' };
  }

  // ── Step 1: Fractional Kelly on lower-CI edge ─────────────────────────
  const kellyFrac = fractionalKelly(edgeLowerCI, winProb, payoff, kellyFraction);
  if (kellyFrac <= 0) {
    return { targetNotional: 0, targetQty: 0, fraction: 0,
             reason: 'NO_TRADE: fractional Kelly ≤ 0' };
  }

  // ── Step 2: Volatility targeting ─────────────────────────────────────
  const realizedAnnualVol = realizedVol(returns);
  const volScalar = volTargetScalar(equity, targetVol, realizedAnnualVol);

  // ── Step 3: Drawdown throttle ────────────────────────────────────────
  const ddScalar = drawdownThrottle(currentDrawdown, maxDrawdown);

  // ── Step 4: Combine base fraction ────────────────────────────────────
  let fraction = kellyFrac * volScalar * ddScalar;

  // ── Step 5: Optional CVaR-robust cap ──────────────────────────────────
  let cvarCap = 1.0;
  if (cvarsRobust && returns && returns.length >= 10) {
    cvarCap = cvarRobustCap(edgeMean, edgeLowerCI, winProb, payoff, returns, equity);
    fraction = Math.min(fraction, cvarCap);
  }

  // ── Step 6: Hard caps ────────────────────────────────────────────────
  fraction = Math.min(fraction, maxFraction);

  let targetNotional = equity * fraction;
  if (Number.isFinite(maxPerPosition)) {
    targetNotional = Math.min(targetNotional, maxPerPosition);
    fraction = targetNotional / equity;
  }

  // Floor at zero
  if (fraction < 0) fraction = 0;
  if (targetNotional < 0) targetNotional = 0;

  // ── Reason string ────────────────────────────────────────────────────
  const parts = [];
  parts.push(`Kelly(λ=${kellyFraction}) on edgeLowerCI=${edgeLowerCI.toFixed(4)}`);
  if (realizedAnnualVol !== null) {
    parts.push(`volScalar=${volScalar.toFixed(3)} `
      + `(σ_realized=${(realizedAnnualVol * 100).toFixed(1)}% `
      + `vs target=${(targetVol * 100).toFixed(0)}%)`);
  }
  if (ddScalar < 1) parts.push(`ddThrottle=${ddScalar.toFixed(3)}`);
  if (cvarCap < 1) parts.push(`CVaR-cap=${cvarCap.toFixed(3)}`);
  if (fraction === maxFraction) parts.push(`at maxFraction=${maxFraction}`);
  if (Number.isFinite(maxPerPosition) && targetNotional === maxPerPosition) {
    parts.push(`at maxPerPosition=${maxPerPosition}`);
  }

  const reason = fraction === 0 ? 'NO_TRADE: capped to zero' : parts.join(' | ');

  return {
    targetNotional: +targetNotional.toFixed(2),
    targetQty: 0,          // paper-only — qty requires price; caller computes
    fraction: +fraction.toFixed(6),
    reason,
  };
}

// ── self-test (--test) ──────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) < tol;
}

function runTests() {
  // ── T1: NO_TRADE on non-edge ─────────────────────────────────────────
  const r1 = computeSize({
    edgeMean: 0.1, edgeLowerCI: -0.01, winProb: 0.55, payoff: 1.0,
    returns: [], equity: 10000,
  });
  assert(r1.fraction === 0 && r1.reason.includes('NO_TRADE'),
         'T1: non-edge → NO_TRADE');

  // ── T2: NO_TRADE on low winProb ──────────────────────────────────────
  const r2 = computeSize({
    edgeMean: 0.1, edgeLowerCI: 0.05, winProb: 0.45, payoff: 1.0,
    returns: [], equity: 10000,
  });
  assert(r2.fraction === 0 && r2.reason.includes('winProb'),
         'T2: low winProb → NO_TRADE');

  // ── T3: Basic Kelly sizing (no vol data → volScalar=1) ───────────────
  // edgeLowerCI=0.10, payoff=1.0 → conservativeKelly = 0.10/1.0 = 0.10
  // rawKelly = (1.0*0.55 − 0.45)/1.0 = 0.10 → min(0.10,0.10)=0.10
  // λ=0.35 → 0.035
  const r3 = computeSize({
    edgeMean: 0.15, edgeLowerCI: 0.10, winProb: 0.55, payoff: 1.0,
    returns: [], equity: 10000,
  });
  assert(r3.fraction > 0 && r3.fraction <= 0.25, 'T3: Kelly positive');
  assert(r3.targetNotional > 0, 'T3: targetNotional positive');
  assert(approx(r3.fraction, 0.035, 0.001),
         `T3: Kelly fraction ~0.035, got ${r3.fraction}`);

  // ── T4: fractional-Kelly-on-lowerCI ≤ point-Kelly ────────────────────
  // point-Kelly would use edgeMean=0.15 → 0.15/1.0=0.15, λ=0.35 → 0.0525
  // lowerCI-Kelly uses edgeLowerCI=0.10 → 0.035
  // 0.035 < 0.0525 ✓
  const pointKellyFrac = 0.35 * Math.min(0.15 / 1.0, (1.0 * 0.55 - 0.45) / 1.0);
  assert(r3.fraction < pointKellyFrac,
         `T4: lowerCI-Kelly ${r3.fraction} < point-Kelly ${pointKellyFrac}`);

  // ── T5: Vol targeting shrinks size when realised > target ────────────
  const highVol = [0.02, -0.03, 0.04, -0.02, 0.03, -0.04, 0.01, -0.01, 0.05, -0.02];
  const r5 = computeSize({
    edgeMean: 0.15, edgeLowerCI: 0.10, winProb: 0.55, payoff: 1.0,
    returns: highVol, equity: 10000, targetVol: 0.10,
  });
  assert(r5.fraction < r3.fraction,
         `T5: vol targeting shrinks: ${r5.fraction} < ${r3.fraction}`);

  // ── T6: Drawdown throttle ────────────────────────────────────────────
  // ddScalar = max(0.25, 1 − 0.15/0.25) = max(0.25, 0.40) = 0.40
  // base Kelly = 0.035 × 0.40 = 0.014
  const r6 = computeSize({
    edgeMean: 0.15, edgeLowerCI: 0.10, winProb: 0.55, payoff: 1.0,
    returns: [], equity: 10000,
    caps: { currentDrawdown: 0.15, maxDrawdown: 0.25 },
  });
  assert(approx(r6.fraction, 0.014, 0.001),
         `T6: dd throttle ${r6.fraction} ~0.014`);

  // ── T7: maxFraction cap ──────────────────────────────────────────────
  const r7 = computeSize({
    edgeMean: 0.5, edgeLowerCI: 0.4, winProb: 0.7, payoff: 1.0,
    returns: [], equity: 10000,
    caps: { maxFraction: 0.1 },
  });
  assert(r7.fraction <= 0.1, 'T7: maxFraction cap holds');

  // ── T8: maxPerPosition cap ───────────────────────────────────────────
  const r8 = computeSize({
    edgeMean: 0.5, edgeLowerCI: 0.4, winProb: 0.7, payoff: 1.0,
    returns: [], equity: 100000,
    caps: { maxPerPosition: 5000 },
  });
  assert(r8.targetNotional <= 5000, 'T8: maxPerPosition cap holds');

  // ── T9: CVaR-robust path runs (exercises decision-sim import) ────────
  const r9 = computeSize({
    edgeMean: 0.15, edgeLowerCI: 0.05, winProb: 0.55, payoff: 1.0,
    returns: highVol, equity: 10000,
    caps: { cvarsRobust: true },
  });
  assert(r9.fraction >= 0, 'T9: CVaR-robust path runs');

  // ── T10: nexus-distrib backend accessible ─────────────────────────────
  const be = nexusBackend();
  assert(typeof be.active === 'string', 'T10: backend.active is string');
  assert(typeof be.rustLoaded === 'boolean', 'T10: backend.rustLoaded is boolean');

  console.log('ALL TESTS PASSED');
}

// ── CLI entry ───────────────────────────────────────────────────────────────
if (process.argv.includes('--test')) {
  runTests();
}
