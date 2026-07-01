#!/usr/bin/env node
/**
 * gpd-shadow.mjs — Governed Potential Descent read-only observer.
 *
 * Shadow-only implementation of:
 *   g(a|x) = C_a(x) * [U(x) - E[U(x⊕a)]] / kappa(a)
 *   fire iff argmax(g) clears the information-clock, passes the veto wall,
 *   and fits inside the owner-granted budget.
 *
 * The core exports are pure and do not read, write, sample, or use a clock.
 * The CLI writes only a generated trace under _SYSTEM/reports/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeU, computeDeltaU, gateProposal, DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { goldenSectionSearch } from './math/yuri-phi.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const GPD_ACTIONS = Object.freeze(['recall', 'rewire']);
export const DEFAULT_COSTS = Object.freeze({ recall: 1, rewire: 3 });
export const DEFAULT_CALIBRATION = Object.freeze({ recall: 1, rewire: 1 });
export const DEFAULT_INFO_CLOCK = Object.freeze({
  tau0: 0.05,
  lambda: 0.05,
  uFloor: -DEFAULT_WEIGHTS.iota * Math.log1p(50),
});
const VETO_ONLY_THRESHOLD = 1e15;

function finiteNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be finite`);
  return n;
}

function nonNegativeNumber(value, label) {
  const n = finiteNumber(value, label);
  if (n < 0) throw new Error(`${label} must be non-negative`);
  return n;
}

function normalizeAction(action) {
  if (!GPD_ACTIONS.includes(action)) {
    throw new Error(`unsupported GPD action: ${action}`);
  }
  return action;
}

function stateBeforeOf(x) {
  const before = x?.energyState ?? x?.state ?? x;
  if (!before || Array.isArray(before) || typeof before !== 'object') {
    throw new Error('GPD state requires an energy state object');
  }
  return before;
}

function candidateAfter(x, action) {
  return x?.candidates?.[action]?.stateAfter
    ?? x?.predictedAfter?.[action]
    ?? x?.actions?.[action]?.stateAfter
    ?? null;
}

function actionCost(x, action, costs = {}) {
  const raw = x?.candidates?.[action]?.cost
    ?? x?.actions?.[action]?.cost
    ?? costs[action]
    ?? DEFAULT_COSTS[action];
  const cost = nonNegativeNumber(raw, `cost.${action}`);
  if (cost <= 0) throw new Error(`cost.${action} must be > 0`);
  return cost;
}

function actionCalibration(x, action, calibration = {}) {
  const raw = x?.candidates?.[action]?.calibration
    ?? x?.actions?.[action]?.calibration
    ?? calibration[action]
    ?? x?.calibration?.[action]
    ?? DEFAULT_CALIBRATION[action];
  return Math.max(0, Math.min(1, finiteNumber(raw, `calibration.${action}`)));
}

export function infoClock(U, {
  tau0 = DEFAULT_INFO_CLOCK.tau0,
  lambda = DEFAULT_INFO_CLOCK.lambda,
  uFloor = DEFAULT_INFO_CLOCK.uFloor,
} = {}) {
  const t0 = nonNegativeNumber(tau0, 'tau0');
  const lam = nonNegativeNumber(lambda, 'lambda');
  const u = finiteNumber(U, 'U');
  const floor = finiteNumber(uFloor, 'uFloor');
  return t0 * Math.exp(-lam * (u - floor));
}

export function tuneInfoClock(samples = [], opts = {}) {
  const lo = opts.tau0Min ?? 0.001;
  const hi = opts.tau0Max ?? 1;
  if (!Array.isArray(samples) || samples.length === 0) {
    return { tau0: DEFAULT_INFO_CLOCK.tau0, lambda: opts.lambda ?? DEFAULT_INFO_CLOCK.lambda, objective: null };
  }
  const lambda = opts.lambda ?? DEFAULT_INFO_CLOCK.lambda;
  const targetRate = opts.targetRate ?? 0.5;
  const objective = (tau0) => {
    let fires = 0;
    for (const s of samples) {
      const tau = infoClock(s.U, { tau0, lambda, uFloor: opts.uFloor ?? DEFAULT_INFO_CLOCK.uFloor });
      if (s.g >= tau) fires += 1;
    }
    return (fires / samples.length - targetRate) ** 2;
  };
  const tuned = goldenSectionSearch(objective, lo, hi, { tol: opts.tol ?? 1e-5, maxIter: opts.maxIter ?? 80 });
  return { tau0: tuned.x, lambda, objective: tuned.fx, evals: tuned.evals };
}

export function gScore(action, x, opts = {}) {
  const a = normalizeAction(action);
  const stateBefore = stateBeforeOf(x);
  const stateAfter = opts.stateAfter ?? candidateAfter(x, a);
  if (!stateAfter || Array.isArray(stateAfter) || typeof stateAfter !== 'object') {
    throw new Error(`missing predicted after-state for action ${a}`);
  }

  const before = computeU(stateBefore, opts.weights);
  const delta = computeDeltaU(stateBefore, stateAfter, opts.weights);
  const kappa = actionCost(x, a, opts.costs);
  const C = actionCalibration(x, a, opts.calibration);
  const predictedDeltaU = delta.result.deltaU;
  const predictedDescent = before.result.U - delta.result.uAfter;
  const g = C * predictedDescent / kappa;

  const veto = gateProposal({
    origin: 'shadow',
    stateBefore,
    stateAfter,
    weights: opts.weights,
    threshold: VETO_ONLY_THRESHOLD,
    allowOverride: false,
    maxLadderInversionCap: opts.maxLadderInversionCap ?? 0,
  });

  return {
    action: a,
    g,
    calibration: C,
    kappa,
    predictedDeltaU,
    predictedDescent,
    uBefore: before.result.U,
    uAfter: delta.result.uAfter,
    vetoValid: veto.result.accept,
    vetoBlocked: !veto.result.accept,
    vetoReason: veto.result.reason,
    dominantTerm: veto.result.dominantTerm,
    componentDeltas: delta.result.componentDeltas,
  };
}

export function computeBudget(trace = [], budget = 0) {
  const B = nonNegativeNumber(budget, 'budget');
  let spent = 0;
  for (const tick of trace) {
    if (tick?.wouldFire) spent += nonNegativeNumber(tick.kappa ?? tick.cost ?? 0, 'trace.kappa');
  }
  const budgetLeft = Math.max(0, B - spent);
  return { budget: B, spent, budgetLeft, conserved: spent <= B };
}

export function fireRule(x, opts = {}) {
  const stateBefore = stateBeforeOf(x);
  const U = computeU(stateBefore, opts.weights).result.U;
  const budget = nonNegativeNumber(opts.budget ?? x?.budget ?? 0, 'budget');
  const spent = nonNegativeNumber(opts.spent ?? x?.spent ?? 0, 'spent');
  const budgetLeftBefore = Math.max(0, budget - spent);
  const clock = {
    ...DEFAULT_INFO_CLOCK,
    ...(opts.clock || {}),
  };
  const tau = infoClock(U, clock);

  const scores = {};
  for (const action of GPD_ACTIONS) {
    if (candidateAfter(x, action) || opts.stateAfter?.[action]) {
      scores[action] = gScore(action, x, { ...opts, stateAfter: opts.stateAfter?.[action] });
    }
  }
  const ranked = Object.values(scores).sort((a, b) => b.g - a.g || a.kappa - b.kappa || a.action.localeCompare(b.action));
  const best = ranked[0] ?? null;
  const canAfford = !!best && best.kappa <= budgetLeftBefore;
  const clearsClock = !!best && best.g >= tau;
  const vetoBlocked = !!best && best.vetoBlocked;
  const wouldFire = !!best && clearsClock && !vetoBlocked && canAfford;
  const budgetLeft = wouldFire ? budgetLeftBefore - best.kappa : budgetLeftBefore;

  return {
    state: stateBefore,
    action: best?.action ?? 'noop',
    aStar: best?.action ?? 'noop',
    g: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.g])),
    scores,
    tau,
    U,
    predictedDeltaU: best?.predictedDeltaU ?? 0,
    wouldFire,
    vetoBlocked,
    budgetBlocked: !!best && !canAfford,
    budgetLeft,
    kappa: wouldFire ? best.kappa : 0,
    selectedKappa: best?.kappa ?? 0,
    vetoReason: best?.vetoReason ?? null,
  };
}

export function defaultShadowCandidates(state) {
  const before = stateBeforeOf(state);
  const recallAfter = {
    ...before,
    claimPromotionDistribution: { recalled: 10 },
    verifiedEvidenceCount: Number(before.verifiedEvidenceCount || 0) + 1,
  };
  const rewireAfter = {
    ...before,
    promotionLadderInversions: Math.max(0, Number(before.promotionLadderInversions || 0) - 1),
  };
  return {
    recall: { stateAfter: recallAfter, cost: DEFAULT_COSTS.recall, calibration: 1 },
    rewire: { stateAfter: rewireAfter, cost: DEFAULT_COSTS.rewire, calibration: 1 },
  };
}

export function buildShadowTrace(states = [], opts = {}) {
  const budget = nonNegativeNumber(opts.budget ?? 5, 'budget');
  const trace = [];
  let spent = 0;
  for (const raw of states) {
    const x = raw?.candidates ? raw : { energyState: stateBeforeOf(raw), candidates: defaultShadowCandidates(raw) };
    const tick = fireRule(x, { ...opts, budget, spent });
    trace.push(tick);
    if (tick.wouldFire) spent += tick.kappa;
    const b = computeBudget(trace, budget);
    if (!b.conserved) throw new Error(`GPD budget invariant violated: spent ${b.spent} > budget ${budget}`);
  }
  return trace;
}

function demoStates() {
  return [
    {
      claimPromotionDistribution: { draft: 7, research: 7, fixture_ready: 1 },
      protectedPathViolations: 0,
      promotionLadderInversions: 1,
      verifiedEvidenceCount: 2,
    },
    {
      claimPromotionDistribution: { draft: 4, research: 2, fixture_ready: 9 },
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
      verifiedEvidenceCount: 4,
    },
  ];
}

function runCli() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const budgetIdx = args.indexOf('--budget');
  const outRel = outIdx >= 0 ? args[outIdx + 1] : '_SYSTEM/reports/gpd-shadow-trace.json';
  const budget = budgetIdx >= 0 ? Number(args[budgetIdx + 1]) : 5;
  if (!outRel || path.isAbsolute(outRel) || outRel.includes('..')) throw new Error('output must be a repo-relative path');
  const outAbs = path.join(REPO_ROOT, outRel);
  const reportDir = path.join(REPO_ROOT, '_SYSTEM/reports');
  if (!outAbs.startsWith(reportDir + path.sep) && outAbs !== path.join(reportDir, path.basename(outAbs))) {
    throw new Error('gpd-shadow trace output must stay under _SYSTEM/reports/');
  }
  const samples = demoStates().map((s) => {
    const x = { energyState: s, candidates: defaultShadowCandidates(s) };
    const score = Math.max(...Object.values(fireRule(x, { budget }).g));
    return { U: computeU(s).result.U, g: score };
  });
  const tuned = tuneInfoClock(samples, { targetRate: 0.5 });
  const trace = buildShadowTrace(demoStates(), { budget, clock: { tau0: tuned.tau0, lambda: tuned.lambda } });
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'read-only-shadow',
    budget,
    tunedClock: tuned,
    trace,
    budgetInvariant: computeBudget(trace, budget),
  }, null, 2));
  console.log(`gpd-shadow: wrote ${outRel} (${trace.length} ticks)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
