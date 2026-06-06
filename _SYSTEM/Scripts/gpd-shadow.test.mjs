#!/usr/bin/env node
/**
 * gpd-shadow.test.mjs — synthetic kill-criteria for the read-only GPD observer.
 */
import { computeU } from './math/yuri-energy.mjs';
import {
  computeBudget,
  fireRule,
  gScore,
  infoClock,
} from './gpd-shadow.mjs';

let pass = 0, fail = 0;
const details = {};
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const approxLe = (a, b, tol = 1e-9) => a <= b + tol;
const U = (state) => computeU(state).result.U;

function entropySolved(state) {
  return {
    ...state,
    claimPromotionDistribution: { resolved: 10 },
    verifiedEvidenceCount: Number(state.verifiedEvidenceCount || 0) + 1,
  };
}

function oneRewire(state) {
  return {
    ...state,
    promotionLadderInversions: Math.max(0, Number(state.promotionLadderInversions || 0) - 1),
  };
}

function candidatesFor(state, overrides = {}) {
  return {
    recall: {
      stateAfter: overrides.recallAfter || entropySolved(state),
      cost: overrides.recallCost ?? 1,
      calibration: overrides.recallCalibration ?? 1,
    },
    rewire: {
      stateAfter: overrides.rewireAfter || oneRewire(state),
      cost: overrides.rewireCost ?? 3,
      calibration: overrides.rewireCalibration ?? 1,
    },
  };
}

function step(state, opts = {}) {
  return fireRule({
    energyState: state,
    candidates: candidatesFor(state, opts),
    budget: opts.budget,
  }, opts);
}

function applyTick(state, tick, opts = {}) {
  if (!tick.wouldFire) return state;
  return candidatesFor(state, opts)[tick.action].stateAfter;
}

// 1. U monotone-decreases along would-fire trajectory.
{
  let state = {
    claimPromotionDistribution: { draft: 5, research: 5, fixture_ready: 1 },
    protectedPathViolations: 0,
    promotionLadderInversions: 2,
    verifiedEvidenceCount: 0,
  };
  let spent = 0;
  const budget = 20;
  const trajectory = [];
  let monotone = true;
  for (let i = 0; i < 6; i++) {
    const beforeU = U(state);
    const tick = step(state, { budget, spent, rewireCost: 3, clock: { tau0: 0.0001, lambda: 0.01 } });
    trajectory.push(tick);
    if (!tick.wouldFire) break;
    const next = applyTick(state, tick, { rewireCost: 3 });
    const afterU = U(next);
    if (!approxLe(afterU, beforeU) || tick.predictedDeltaU > 0) monotone = false;
    spent += tick.kappa;
    state = next;
  }
  details[1] = { fires: trajectory.filter((t) => t.wouldFire).length, finalU: U(state), spent };
  ok(monotone && details[1].fires >= 2, 'kill-criterion 1: U monotone-decreases along would-fire trajectory');
}

// 2. Conserved budget holds even for an adversarial all-high-value seed.
{
  let state = {
    claimPromotionDistribution: { a: 100, b: 100, c: 100 },
    protectedPathViolations: 0,
    promotionLadderInversions: 100,
    verifiedEvidenceCount: 0,
  };
  const budget = 5;
  let spent = 0;
  const trace = [];
  for (let i = 0; i < 10; i++) {
    const tick = step(state, { budget, spent, recallCost: 2, rewireCost: 3, clock: { tau0: 0.000001, lambda: 0.01 } });
    trace.push(tick);
    if (!tick.wouldFire) break;
    spent += tick.kappa;
    state = applyTick(state, tick, { recallCost: 2, rewireCost: 3 });
  }
  const budgetState = computeBudget(trace, budget);
  details[2] = { ...budgetState, ticks: trace.length };
  ok(budgetState.conserved && budgetState.spent <= budget && trace.every((t) => t.budgetLeft >= 0), 'kill-criterion 2: Σκ ≤ B always, including all-high-value seed');
}

// 3. Veto integrity: protected-path crossing is blocked despite high g.
{
  const wrong = new Array(50).fill(1);
  const outcomes = new Array(50).fill(0);
  const before = {
    claimPromotionDistribution: { a: 100, b: 100 },
    predictions: wrong,
    outcomes,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
    verifiedEvidenceCount: 0,
  };
  const recallAfter = {
    ...entropySolved(before),
    predictions: new Array(50).fill(0),
    outcomes,
    protectedPathViolations: 1,
  };
  const tick = fireRule({
    energyState: before,
    candidates: candidatesFor(before, { recallAfter, recallCost: 1, rewireCalibration: 0 }),
    budget: 10,
  }, { budget: 10, clock: { tau0: 0.000001, lambda: 0.01 } });
  details[3] = {
    action: tick.action,
    wouldFire: tick.wouldFire,
    vetoBlocked: tick.vetoBlocked,
    vetoReason: tick.vetoReason,
    recallG: tick.g.recall,
  };
  ok(tick.action === 'recall' && tick.g.recall > tick.tau && tick.vetoBlocked && !tick.wouldFire, 'kill-criterion 3: protected-path veto blocks a high-g would-fire');
}

// 4. Low calibration suppresses would-fire.
{
  const before = {
    claimPromotionDistribution: { a: 100, b: 100 },
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
    verifiedEvidenceCount: 0,
  };
  const high = gScore('recall', { energyState: before, candidates: candidatesFor(before, { recallCalibration: 1 }) });
  const lowTick = fireRule({
    energyState: before,
    candidates: candidatesFor(before, { recallCalibration: 0.000001, rewireCalibration: 0 }),
    budget: 10,
  }, { budget: 10, clock: { tau0: 0.001, lambda: 0 } });
  details[4] = { highG: high.g, lowG: lowTick.g.recall, tau: lowTick.tau, wouldFire: lowTick.wouldFire };
  ok(high.g > 0 && lowTick.g.recall < lowTick.tau && !lowTick.wouldFire, 'kill-criterion 4: low C_a keeps uncalibrated organ near no-fire');
}

function runPolicy(policy) {
  let state = {
    claimPromotionDistribution: { a: 100, b: 100 },
    protectedPathViolations: 0,
    promotionLadderInversions: 2,
    verifiedEvidenceCount: 0,
  };
  const lowU = 20.1;
  let spent = 0;
  const trace = [];
  for (let i = 0; i < 5 && U(state) > lowU; i++) {
    let tick;
    if (policy === 'gpd') {
      tick = step(state, { budget: 100, spent, recallCost: 1, rewireCost: 20, clock: { tau0: 0.000001, lambda: 0.01 } });
    } else {
      const action = policy === 'fixed' ? 'rewire' : (i % 2 === 0 ? 'rewire' : 'recall');
      const c = candidatesFor(state, { recallCost: 1, rewireCost: 20 });
      tick = {
        action,
        wouldFire: true,
        kappa: c[action].cost,
      };
    }
    trace.push(tick);
    if (!tick.wouldFire) break;
    const c = candidatesFor(state, { recallCost: 1, rewireCost: 20 });
    spent += c[tick.action].cost;
    state = c[tick.action].stateAfter;
  }
  return { spent, finalU: U(state), trace };
}

// 5. GPD reaches the low-U attractor in fewer κ than fixed-priority + random baselines.
{
  const gpd = runPolicy('gpd');
  const fixed = runPolicy('fixed');
  const random = runPolicy('random');
  details[5] = {
    gpd: { spent: gpd.spent, finalU: gpd.finalU, actions: gpd.trace.map((t) => t.action) },
    fixed: { spent: fixed.spent, finalU: fixed.finalU, actions: fixed.trace.map((t) => t.action) },
    random: { spent: random.spent, finalU: random.finalU, actions: random.trace.map((t) => t.action) },
  };
  ok(gpd.finalU <= 20.1 && fixed.finalU <= 20.1 && random.finalU <= 20.1
    && gpd.spent < fixed.spent && gpd.spent < random.spent,
  'kill-criterion 5: GPD reaches low-U attractor with less κ than fixed/random baselines');
}

ok(infoClock(10, { tau0: 0.5, lambda: 0.2, uFloor: 0 }) < infoClock(1, { tau0: 0.5, lambda: 0.2, uFloor: 0 }), 'infoClock fires more eagerly at higher U');

console.log(JSON.stringify({ killCriteriaResults: details }, null, 2));
console.log(`\ngpd-shadow.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
