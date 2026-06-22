#!/usr/bin/env node
// @capability: mure-math-bridge
// @serves: math layer agent governance | cross-reference formulas into agents | decision-sim role scoring | quantum order effect agent | energy veto governance | brier calibration agent | mure math
// @does: thin role-facing adapter that cross-references YURI's live math layer (decision-sim CVaR/regret, quantum order-effect/non-commutativity, energy protected-path/catastrophic veto, prediction-ledger Brier calibration) into clean calls the MURE role engine uses for goal-scoring, role-selection, the self-governance gate, adversarial confidence, and the learn loop. Imports the existing modules — never re-implements them (capability-first).
// @use: import { scoreOptions, bestOption, orderEffect, robustnessRadius, governanceVeto, breakerVerdict, calibrate, MATH_HOOKS } from mure/math-bridge.mjs. All scoring fns are PURE + deterministic (seeded); calibrate() reads the ledger; breakerVerdict needs energy states.
// @exports: scoreOptions, bestOption, orderEffect, robustnessRadius, governanceVeto, breakerVerdict, calibrate, normalizeOptions, MATH_HOOKS
//
// Authority: ADVISORY scoring. These numbers INFORM the governance gate + goal ranking; they never bypass the
// constitution hard-stop or owner-gating. A confident score is advisory until local evidence verifies it.

import {
  robustScore, minimaxRegret, pgdWitness, infoGapHorizon, makeRng, gauss, clamp,
} from '../Scripts/decision-sim.mjs';
import {
  stateVector, projector, normalize, measureSequential, qqEquality,
} from '../Scripts/quantum-hypothesis-tracker.mjs';
import { isProtectedPath, salience, TIER } from '../Scripts/energy-tick-core.mjs';
import { verdictFromStates, isCatastrophic } from '../Scripts/energy-breaker.mjs';

export { TIER };

// ── option normalization ───────────────────────────────────────────────────
// Accept options as {id, score|mean|value, uncertainty|sd|risk} OR plain numbers.
// Internal config shape for decision-sim: { id, mean, sd }.
export function normalizeOptions(options = []) {
  const arr = Array.isArray(options) ? options : [];
  return arr.map((o, i) => {
    if (typeof o === 'number') return { id: `opt${i}`, mean: o, sd: 0 };
    const mean = Number(o.mean ?? o.score ?? o.value ?? 0);
    const sd = Number(o.sd ?? o.uncertainty ?? o.risk ?? 0);
    return { ...o, id: String(o.id ?? `opt${i}`), mean: Number.isFinite(mean) ? mean : 0, sd: Number.isFinite(sd) && sd >= 0 ? sd : 0 };
  });
}

function optionProblem(nullValue = 0) {
  // value(config, p) = mean + z·sd, z ~ N(0,1). robustScore → 0.5·mean + 0.5·CVaR(tail) → penalizes
  // high-uncertainty options on the downside tail. minimaxRegret shares ONE param draw across options.
  return {
    value: (cfg, p) => cfg.mean + p.z * (cfg.sd || 0),
    sampleParams: (rng) => ({ z: gauss(rng) }),
    nullValue: () => nullValue,
  };
}

// pgdWitness / infoGapHorizon need a BOUNDED paramSpace (not the unbounded gauss axis). Bounded uniform
// u∈[0,1] mapped to ±sd around the mean → a finite uncertainty axis to search for the worst case / flip.
function boundedProblem(nullValue = 0) {
  return {
    paramSpace: { u: [0, 1] },
    value: (cfg, p) => cfg.mean + (p.u - 0.5) * 2 * (cfg.sd || 0),
    sampleParams: (rng) => ({ u: rng() }),
    nullValue: () => nullValue,
  };
}

/**
 * Risk-adjusted ranking of options (goal-scoring / role path-choice).
 * Each option's robust score = 0.5·mean + 0.5·CVaR (decision-sim.robustScore, fresh same-seed rng per
 * option → fair + deterministic). minimaxRegret adds worst-case regret across the shared option set.
 * @returns {{ranked:Array<{id,mean,sd,robust,regret}>, best, method}}
 */
export function scoreOptions(options, opts = {}) {
  const list = normalizeOptions(options);
  if (!list.length) return { ranked: [], best: null, method: 'empty' };
  const draws = Math.max(16, Number(opts.draws || 64));
  const seed = Number(opts.seed ?? 12345);
  const nullValue = Number(opts.nullValue ?? 0);
  const problem = optionProblem(nullValue);
  const robust = list.map((o) => ({
    id: o.id, mean: o.mean, sd: o.sd,
    robust: +robustScore(problem, o, { draws, rng: makeRng(seed) }).toFixed(6), // fresh rng/opt → fair
  }));
  const regret = {};
  if (list.length > 1) {
    try {
      const mm = minimaxRegret(problem, list, { draws: Math.max(64, draws), seed });
      mm.ranked.forEach((r) => { regret[r.config.id] = r.maxRegret; });
    } catch { /* degenerate → no regret column */ }
  }
  const ranked = robust
    .map((r) => ({ ...r, regret: regret[r.id] ?? null }))
    .sort((a, b) => (b.robust - a.robust) || ((a.regret ?? 0) - (b.regret ?? 0)));
  return { ranked, best: ranked[0], method: 'robustScore+minimaxRegret' };
}

export function bestOption(options, opts = {}) {
  return scoreOptions(options, opts).best;
}

/**
 * Order-effect probe (quantum non-commutativity, Wang & Busemeyer / YURI quantum layer).
 * Does the ORDER of two steps/evidence change the outcome? jointAB vs jointBA = the order-sensitive signal;
 * qqStatistic ≈ 0 is the model-consistency check (quantum guarantees it).
 * @param {{dim?:number, components?:number[], maskA?:number[], maskB?:number[], tol?:number}} spec
 * @returns {{qqStatistic, orderSensitive, jointAB, jointBA}}
 */
export function orderEffect(spec = {}) {
  // Order effects require NON-COMMUTING projectors. Diagonal projectors in one basis always commute (zero
  // order effect by construction); rank-1 projectors onto two NON-orthogonal vectors do not. Defaults give a
  // genuine effect: psi=e0, A=e0 (basis), B=uniform superposition (non-aligned) → jointAB ≠ jointBA.
  const dim = Number(spec.dim || (Array.isArray(spec.psi) ? spec.psi.length : 2));
  const e0 = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
  const uniform = (n) => Array.from({ length: n }, () => 1);
  const psi = stateVector(Array.isArray(spec.psi) ? spec.psi : e0(dim));
  const vecA = normalize(Array.isArray(spec.vecA) ? spec.vecA : e0(dim));
  const vecB = normalize(Array.isArray(spec.vecB) ? spec.vecB : uniform(dim));
  const P_A = projector(vecA);
  const P_B = projector(vecB);
  const tol = Number(spec.tol ?? 1e-6);
  const qq = qqEquality(psi, P_A, P_B);
  const jointAB = measureSequential([P_A, P_B], psi).jointProbability;
  const jointBA = measureSequential([P_B, P_A], psi).jointProbability;
  return {
    qqStatistic: +Number(qq.qqStatistic ?? 0).toFixed(8), // ≈0 = quantum-model-consistent (not "no effect")
    jointAB: +jointAB.toFixed(8),
    jointBA: +jointBA.toFixed(8),
    orderSensitive: Math.abs(jointAB - jointBA) > tol,     // the real order-effect signal
  };
}

/**
 * Robustness radius of an option vs the NULL baseline (adjudicator/oracle confidence).
 * margin (pgdWitness): worst-case value − null; ≥0 ⇒ beats null everywhere found.
 * alpha (infoGapHorizon): how far params can deviate before the choice flips.
 */
export function robustnessRadius(option, opts = {}) {
  const o = normalizeOptions([option])[0];
  const problem = boundedProblem(Number(opts.nullValue ?? 0)); // bounded paramSpace required by pgd/infogap
  let margin = null; let alpha = null; const raw = {};
  try { const w = pgdWitness(problem, o, opts); raw.pgd = w; const m = Number(w?.margin); if (Number.isFinite(m)) margin = +m.toFixed(6); } catch (e) { raw.pgdErr = String(e?.message || e); }
  try { const h = infoGapHorizon(problem, o, { nominal: { u: 0.5 }, ...opts }); raw.infogap = h; const a = Number(h?.horizon); if (Number.isFinite(a)) alpha = +a.toFixed(4); } catch (e) { raw.infogapErr = String(e?.message || e); }
  return { margin, alpha, robust: margin != null && margin >= 0, raw };
}

/**
 * Governance hard-veto probe (the steward's constitution check, PURE).
 * protected-path = the non-negotiable veto; salienceTier filters low-signal decisions.
 * Full energy-breaker verdict is available via breakerVerdict() when energy states exist.
 */
export function governanceVeto(transition = {}) {
  const t = (transition && typeof transition === 'object') ? transition : {};
  const filePath = String(t.filePath || t.file_path || t.path || '').replace(/\\/g, '/'); // normalize separators
  // Check raw AND lowercased — on a case-insensitive FS (macOS) BACKEND/data === backend/data; a case
  // variant must not slip past the protected-path veto. (native red-team #2.)
  const protectedPath = filePath ? (isProtectedPath(filePath) || isProtectedPath(filePath.toLowerCase())) : false;
  const tier = salience({ ...t, protectedHit: protectedPath || !!t.protectedHit });
  return {
    protectedPath,
    salienceTier: tier, // TIER.SKIP=0 / WORK=1 / CRITICAL=2
    veto: protectedPath,
    reason: protectedPath ? `protected-path:${filePath}` : null,
  };
}

/** Salience tier of a transition (energy front-door) — SKIP=0 / WORK=1 / CRITICAL=2. Filters low-signal
 * decisions so a role doesn't run the full gate on trivial reads. */
export function salienceTier(transition = {}) {
  const t = (transition && typeof transition === 'object') ? transition : {};
  const filePath = String(t.filePath || t.file_path || t.path || '');
  const protectedHit = filePath ? isProtectedPath(filePath) : !!t.protectedHit;
  return salience({ ...t, protectedHit });
}

/** Full energy-breaker verdict (live integration) — needs prev/next energy states. */
export function breakerVerdict(prevState, nextState, opts = {}) {
  const v = verdictFromStates(prevState, nextState, opts);
  return { ...v, catastrophic: isCatastrophic(v) };
}

/** Calibration / honesty readout (the calibrator's learn loop). Reads the prediction ledger. */
export function calibrate(opts = {}) {
  try {
    // Lazy import: the ledger module touches _SYSTEM/state at call time, not at import.
    return import('../Scripts/prediction-ledger.mjs').then((m) => m.calibrationReport(opts));
  } catch (e) {
    return Promise.resolve({ error: String(e?.message || e), meanBrier: null });
  }
}

// Hook registry — resolves a role's mathHooks[] string to its bridge fn (role-registry consumes this).
export const MATH_HOOKS = Object.freeze({
  scoreOptions, bestOption, orderEffect, robustnessRadius, governanceVeto, salienceTier, breakerVerdict, calibrate,
});

export function resolveMathHook(name) {
  return Object.prototype.hasOwnProperty.call(MATH_HOOKS, name) ? MATH_HOOKS[name] : null;
}
