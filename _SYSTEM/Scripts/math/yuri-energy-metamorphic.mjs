#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Metamorphic-relation suite + coverage-fed fault-campaign
//                runner for computeU. Candidate B of the substrate-frontier-
//                grade mission (T4 gap). ADDS a DIFFERENT AXIS from the
//                invariant prover (A): oracle-free input-transform relations
//                where correctness is `f(T(x)) R f(x)` — no ground-truth
//                oracle required. Each MR is exercised across a generated
//                campaign; coverage is tallied; counterexamples are shrunk.
//   target:      NEW file only. Reads computeU; mutates NO gate behavior.
//   constraints: dependency-free (no `npm i` — honors the no-install floor);
//                seeded PRNG (reproducible counterexamples); observe-mode;
//                fully reversible by deletion.
//   acceptance:  (GREEN) every MR holds on the real computeU over a coverage-
//                fed campaign of N generated states; (RED) every planted
//                mutant is CAUGHT by ≥1 MR — proves the suite is non-vacuous.
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-metamorphic.test.mjs
//   rollback:    rm this file + its .test.mjs (no other file touched).
// ===========================================================================
//
// @capability: energy-metamorphic-campaign
// @serves: metamorphic testing computeU | oracle-free input transform relations | coverage fed fault campaign | shrink counterexamples | planted mutant negative controls
// @does: 6 metamorphic relations over computeU (MR-scale, MR-permute, MR-ceiling-idempotence, MR-additivity, MR-prediction-symmetry, MR-drift-monotonicity) + a coverage-tallying campaign runner + per-MR planted-mutant negative controls + a counterexample shrinker
// @use: after ANY change to computeU / its evaluators / its weights, run this to prove the oracle-free input-transform relations still hold over the random state space — catches bugs the invariant prover's PBT might miss because MRs verify RELATIONS between calls rather than properties of a single call; the mutant battery guards the harness itself against vacuity
// @exports: makeRng, genState, METAMORPHIC_RELATIONS, runCampaign, MUTANTS, runMutationCheck, shrinkCounterexample
//
// Frontier-discipline transfer: metamorphic testing (Chen et al.) + coverage-
// driven verification (UVM covergroups, chip DV functional coverage) → the YURI
// scoring function. Metamorphic relations are the software analog of "don't-care
// input transitions that must preserve a known output relation": no oracle needed,
// just f(T(x)) R f(x). The campaign + coverage tally + shrinker is the DV loop.

import { computeU, DEFAULT_WEIGHTS } from './yuri-energy.mjs';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic, reproducible counterexamples
// ---------------------------------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// State generator — produces well-formed states compatible with computeU.
// Mirrors the invariants prover's genState shape but is self-contained
// (no cross-file dependency) so this file is independently verifiable.
// ---------------------------------------------------------------------------
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const randDist = (rng, n) => Array.from({ length: n }, () => rng());
const randProbs = (rng, n) => Array.from({ length: n }, () => 0.01 + rng() * 0.98);
const randLabels = (rng, n) => Array.from({ length: n }, () => (rng() < 0.5 ? 0 : 1));

export function genState(rng, opts = {}) {
  const {
    forceDistributions = randInt(rng, 2, 6),
    forcePredictions  = randInt(rng, 1, 5),
    forceForecasts    = randInt(rng, 1, 5),
    forceBarrier      = true,
    forceEvidence     = true,
  } = opts;

  // Build claimPromotionDistribution as an object (mirrors the live shape)
  const nc = forceDistributions;
  const cpd = {};
  for (let i = 0; i < nc; i++) cpd[String.fromCharCode(65 + i)] = rng();

  return {
    claimPromotionDistribution: cpd,
    claimedDistribution: randDist(rng, nc),
    verifiedDistribution: randDist(rng, nc),
    predictions: randProbs(rng, forcePredictions),
    outcomes: randLabels(rng, forcePredictions),
    forecasts: randProbs(rng, forceForecasts),
    results: randLabels(rng, forceForecasts),
    priorState: randDist(rng, nc),
    posteriorState: randDist(rng, nc),
    evidence: [],
    protectedPathViolations: forceBarrier ? randInt(rng, 0, 3) : 0,
    promotionLadderInversions: forceBarrier ? randInt(rng, 0, 3) : 0,
    verifiedEvidenceCount: forceEvidence ? randInt(rng, 0, 60) : 0,
  };
}

// ---------------------------------------------------------------------------
// Shape classifier — tags each generated state so the campaign can tally
// which state shapes each MR was exercised on (coverage feedback).
// ---------------------------------------------------------------------------
function classifyShape(state) {
  const tags = [];
  if (state.claimPromotionDistribution && Object.keys(state.claimPromotionDistribution).length > 0) {
    tags.push('has-cpd');
  }
  if (Array.isArray(state.claimedDistribution) && state.claimedDistribution.length > 0) {
    tags.push('has-distributions');
  }
  if (Array.isArray(state.predictions) && state.predictions.length > 0) {
    tags.push('has-predictions');
  }
  if (Array.isArray(state.forecasts) && state.forecasts.length > 0) {
    tags.push('has-forecasts');
  }
  if (state.protectedPathViolations > 0 || state.promotionLadderInversions > 0) {
    tags.push('has-barrier');
  }
  if (state.verifiedEvidenceCount > 0) {
    tags.push('has-evidence');
  }
  if (tags.length === 0) tags.push('empty');
  return tags;
}

// ---------------------------------------------------------------------------
// Adapter: call computeU, extract {U, contributions}
// ---------------------------------------------------------------------------
// Mutable so runMutationCheck can inject a mutant scorer (dependency injection) and
// run the REAL mr.check() against it, then restore. Avoids re-deriving each MR's
// check inline (which drifts from the relation it claims to test).
let score = (state, weights = DEFAULT_WEIGHTS) => computeU(state, weights).result;

// ---------------------------------------------------------------------------
// Tolerance
// ---------------------------------------------------------------------------
const EPS = 1e-6;

// ===========================================================================
// METAMORPHIC RELATIONS
//
// Each MR is { name, shape (formula-derived | behavioral), applicable(state),
//   transform(state, rng), check(before, after) → {ok, detail} }.
//
// "formula-derived" = the relation follows directly from the additive weighted-
//   sum definition of computeU (tautology risk — still useful as a smoke test
//   after refactors that touch the summation loop).
// "behavioral" = the relation depends on the mathematical properties of the
//   underlying evaluators (entropy, W₁, logLoss, etc.) — these are the
//   higher-value MRs that catch real implementation bugs.
// ===========================================================================

export const METAMORPHIC_RELATIONS = [
  // ---- MR-1: scale (formula-derived) ----------------------------------
  // Scaling ALL weights by k>0 scales U by exactly k, because U is a
  // linear combination of its components: U = Σ wᵢ·fᵢ(state).  Follows
  // directly from the definition — tautology risk is high.
  {
    name: 'MR-scale: U(k·weights, state) == k·U(weights, state)',
    shape: 'formula-derived',
    applicable: () => true,
    transform(state) {
      return state; // identity — the transform is in the weight space
    },
    check(state, _transformed, rng) {
      const k = 0.25 + rng() * 3.75; // k ∈ (0.25, 4.0] — positive only (negative weights fail-closed)
      const w0 = DEFAULT_WEIGHTS;
      const wk = Object.freeze(
        Object.fromEntries(Object.entries(w0).map(([key, v]) => [key, v * k])),
      );
      const r0 = score(state, w0);
      const rk = score(state, wk);
      const expected = r0.U * k;
      const actual = rk.U;
      const ok = Math.abs(actual - expected) < EPS * Math.max(1, Math.abs(expected));
      return {
        ok,
        detail: ok ? null : { k, u0: r0.U, uk: actual, expected, diff: actual - expected },
      };
    },
  },

  // ---- MR-2: permute (behavioral) -------------------------------------
  // Entropy is invariant under permutation of its input vector.  Since
  // evalEntropy calls Object.values() then entropy(), permuting the VALUES
  // among the keys of claimPromotionDistribution leaves the multiset of
  // values unchanged → normalized distribution unchanged → entropy
  // contribution unchanged.
  //
  // PRECISE CONDITION: stateB.claimPromotionDistribution is a permutation
  // of stateA.claimPromotionDistribution (as a multiset of values), AND all
  // other state fields are identical → entropy contribution is identical.
  {
    name: 'MR-permute: permuting claimPromotionDistribution values leaves entropy contribution invariant',
    shape: 'behavioral',
    applicable(state) {
      const cpd = state.claimPromotionDistribution;
      return cpd && typeof cpd === 'object' && Object.keys(cpd).length >= 2;
    },
    transform(state, rng) {
      const cpd = state.claimPromotionDistribution;
      const entries = Object.entries(cpd);
      // Fisher-Yates shuffle of the VALUES (keys stay in place)
      const vals = entries.map(([, v]) => v);
      for (let i = vals.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [vals[i], vals[j]] = [vals[j], vals[i]];
      }
      const newCpd = {};
      for (let i = 0; i < entries.length; i++) {
        newCpd[entries[i][0]] = vals[i];
      }
      return { ...state, claimPromotionDistribution: newCpd };
    },
    check(before, after) {
      const r0 = score(before);
      const r1 = score(after);
      const e0 = r0.contributions.entropy ?? 0;
      const e1 = r1.contributions.entropy ?? 0;
      const ok = Math.abs(e0 - e1) < EPS;
      return { ok, detail: ok ? null : { entropy0: e0, entropy1: e1, diff: e1 - e0 } };
    },
  },

  // ---- MR-3: ceiling-idempotence (behavioral) -------------------------
  // evalWasserstein fail-closes on poisoned distributions by returning the
  // ceiling value (n-1) where n is the support length.  Once a distribution
  // is poisoned, ADDING MORE POISON (while keeping the array length the
  // same) does NOT increase the wasserstein contribution — it's already at
  // the ceiling.  This tests the fail-closed guard, not the W₁ formula.
  {
    name: 'MR-ceiling-idempotence: once drift is at ceiling (poisoned), more poison does not increase it',
    shape: 'behavioral',
    applicable(state) {
      return (
        Array.isArray(state.claimedDistribution) &&
        state.claimedDistribution.length >= 2 &&
        Array.isArray(state.verifiedDistribution) &&
        state.verifiedDistribution.length === state.claimedDistribution.length
      );
    },
    transform(state, _rng) {
      // Poison the claimed distribution (NaN entries force the ceiling)
      const n = state.claimedDistribution.length;
      const poisoned = Array.from({ length: n }, (_, i) => (i === 0 ? NaN : 0.5));
      return { ...state, claimedDistribution: poisoned };
    },
    check(_before, stateA, _rng) {
      // stateA: already poisoned (one NaN). stateB: MORE poisoned (all NaN).
      const n = stateA.claimedDistribution.length;
      const stateB = {
        ...stateA,
        claimedDistribution: Array.from({ length: n }, () => NaN),
      };
      const rA = score(stateA);
      const rB = score(stateB);
      const wA = rA.contributions.wasserstein ?? 0;
      const wB = rB.contributions.wasserstein ?? 0;
      // Both should be at the ceiling β·(n-1). The extra poison in stateB
      // (all-NaN vs one-NaN) must not increase the contribution.
      const ok = Math.abs(wB - wA) < EPS;
      return { ok, detail: ok ? null : { wassersteinA: wA, wassersteinB: wB, diff: wB - wA, n } };
    },
  },

  // ---- MR-4: additivity (formula-derived) -----------------------------
  // U is defined as the sum of its per-component contributions.  Under any
  // state transform that keeps the state valid, the recomputed U must still
  // equal the sum of the recomputed contributions.  This is the
  // reconstruction invariant applied to a TRANSFORMED state — formula-
  // derived, but catches regressions where a transform triggers a code path
  // that breaks the bookkeeping (e.g. a skipped component's contribution
  // key is absent from the contributions object but its value is included
  // in U through a parallel accumulator).
  {
    name: 'MR-additivity: U == sum(contributions) under state transform',
    shape: 'formula-derived',
    applicable: () => true,
    transform(state, rng) {
      // Scale all distribution entries by a random factor
      const k = 0.5 + rng() * 2.0;
      const scaleArr = (arr) => (Array.isArray(arr) ? arr.map((v) => Number(v) * k) : arr);
      const scaleObj = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const out = {};
        for (const [key, v] of Object.entries(obj)) out[key] = Number(v) * k;
        return out;
      };
      return {
        ...state,
        claimPromotionDistribution: scaleObj(state.claimPromotionDistribution),
        claimedDistribution: scaleArr(state.claimedDistribution),
        verifiedDistribution: scaleArr(state.verifiedDistribution),
        priorState: scaleObj(state.priorState),
        posteriorState: scaleObj(state.posteriorState),
      };
    },
    check(_before, after) {
      const r = score(after);
      const sumContribs = Object.values(r.contributions).reduce((s, v) => s + v, 0);
      const ok = Math.abs(r.U - sumContribs) < EPS;
      return {
        ok,
        detail: ok ? null : { U: r.U, sumContribs, diff: r.U - sumContribs, contributions: r.contributions },
      };
    },
  },

  // ---- MR-5: prediction-symmetry (behavioral) -------------------------
  // For binary logLoss: swapping predictions p→1-p AND outcomes o→1-o
  // leaves the logLoss unchanged.  The brier score is also symmetric under
  // this transform.  This tests that the kernel logLoss/brier primitives
  // respect the mathematical symmetry.
  {
    name: 'MR-prediction-symmetry: (p,o)→(1-p,1-o) leaves logLoss+brier invariant',
    shape: 'behavioral',
    applicable(state) {
      return (
        Array.isArray(state.predictions) &&
        state.predictions.length > 0 &&
        Array.isArray(state.outcomes) &&
        state.outcomes.length === state.predictions.length
      );
    },
    transform(state) {
      const swapPreds = state.predictions.map((p) => 1 - Number(p));
      const swapOuts = state.outcomes.map((o) => 1 - Number(o));
      return { ...state, predictions: swapPreds, outcomes: swapOuts };
    },
    check(before, after) {
      const r0 = score(before);
      const r1 = score(after);
      // The logLoss and brier contributions should be unchanged (up to
      // float tolerance).  We check the combined signal since both terms
      // are invariant under this transform.
      const ll0 = r0.contributions.logLoss ?? 0;
      const br0 = r0.contributions.brier ?? 0;
      const ll1 = r1.contributions.logLoss ?? 0;
      const br1 = r1.contributions.brier ?? 0;
      const sig0 = ll0 + br0;
      const sig1 = ll1 + br1;
      const ok = Math.abs(sig0 - sig1) < EPS;
      return {
        ok,
        detail: ok
          ? null
          : { logLoss0: ll0, logLoss1: ll1, brier0: br0, brier1: br1, sig0, sig1, diff: sig1 - sig0 },
      };
    },
  },

  // ---- MR-6: drift-monotonicity (behavioral) --------------------------
  // Starting from a state where claimed == verified (zero drift), moving
  // claimed mass to a FARTHER rung MUST increase the wasserstein
  // contribution (W₁ is monotonic in transport distance).  The entropy and
  // other terms are held constant so only the drift term changes.
  {
    name: 'MR-drift-monotonicity: moving claimed mass away from evidence increases W₁ contribution',
    shape: 'behavioral',
    applicable(state) {
      return (
        Array.isArray(state.claimedDistribution) &&
        state.claimedDistribution.length >= 3 &&
        Array.isArray(state.verifiedDistribution) &&
        state.verifiedDistribution.length === state.claimedDistribution.length
      );
    },
    transform(state, _rng) {
      // Make claimed == verified (zero drift baseline)
      const n = state.verifiedDistribution.length;
      const baseline = [...state.verifiedDistribution];
      return { ...state, claimedDistribution: baseline };
    },
    check(_before, stateA, _rng) {
      // stateA: claimed == verified → zero drift.
      // stateB: move mass from rung 0 to rung n-1 → large drift.
      const n = stateA.claimedDistribution.length;
      const moved = [...stateA.verifiedDistribution];
      // Shift half the mass of rung 0 to the last rung
      const shift = moved[0] * 0.5;
      moved[0] -= shift;
      moved[n - 1] += shift;
      const stateB = { ...stateA, claimedDistribution: moved };
      const rA = score(stateA);
      const rB = score(stateB);
      const wA = rA.contributions.wasserstein ?? 0;
      const wB = rB.contributions.wasserstein ?? 0;
      // W₁ must increase (or stay same if shift=0, but shift > 0 when mass > 0)
      const ok = wB >= wA - EPS;
      return {
        ok,
        detail: ok ? null : { wasserstein0: wA, wasserstein1: wB, diff: wB - wA, n, shift },
      };
    },
  },
];

// ===========================================================================
// CAMPAIGN RUNNER
//
// Generates N source states, applies each applicable MR transform, checks
// the relation, and reports per-MR pass/violation counts + a coverage tally
// (which MRs got exercised on which state shapes).
// ===========================================================================

export function runCampaign({
  numStates = 2000,
  seed = 0xBEEF,
  weights = DEFAULT_WEIGHTS,
} = {}) {
  const rng = makeRng(seed);
  const results = METAMORPHIC_RELATIONS.map((mr) => ({
    name: mr.name,
    shape: mr.shape,
    passed: 0,
    violated: 0,
    skipped: 0,        // state not applicable to this MR
    errors: 0,         // transform or check threw
    firstViolation: null,
    firstError: null,
    shapesExercised: new Set(),
  }));

  const overallShapes = new Set();

  for (let i = 0; i < numStates; i++) {
    const sourceState = genState(rng);
    const sourceShape = classifyShape(sourceState).join('+');
    overallShapes.add(sourceShape);

    for (const [idx, mr] of METAMORPHIC_RELATIONS.entries()) {
      const rec = results[idx];

      if (!mr.applicable(sourceState)) {
        rec.skipped++;
        continue;
      }

      let transformed;
      try {
        transformed = mr.transform(sourceState, rng);
      } catch (err) {
        rec.errors++;
        if (!rec.firstError) {
          rec.firstError = {
            stateId: i,
            sourceState,
            phase: 'transform',
            message: String((err && err.message) || err),
          };
        }
        continue;
      }

      let checkResult;
      try {
        checkResult = mr.check(sourceState, transformed, rng);
      } catch (err) {
        rec.errors++;
        if (!rec.firstError) {
          rec.firstError = {
            stateId: i,
            sourceState,
            transformedState: transformed,
            phase: 'check',
            message: String((err && err.message) || err),
          };
        }
        continue;
      }

      if (checkResult.ok) {
        rec.passed++;
      } else {
        rec.violated++;
        if (!rec.firstViolation) {
          rec.firstViolation = {
            stateId: i,
            sourceState,
            transformedState: transformed,
            detail: checkResult.detail,
          };
        }
      }

      // Track shape coverage for this MR
      rec.shapesExercised.add(sourceShape);
    }
  }

  // Build coverage summary
  const allShapes = [...overallShapes].sort();
  const coverage = METAMORPHIC_RELATIONS.map((mr, idx) => ({
    name: mr.name,
    shape: mr.shape,
    shapesCovered: [...results[idx].shapesExercised].sort(),
    shapesTotal: allShapes.length,
    coverageFraction: allShapes.length > 0
      ? results[idx].shapesExercised.size / allShapes.length
      : 0,
  }));

  const allPassed = results.every((r) => r.violated === 0 && r.errors === 0);
  const totalChecks = results.reduce((s, r) => s + r.passed + r.violated, 0);
  const totalViolations = results.reduce((s, r) => s + r.violated, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);

  return {
    passed: allPassed,
    numStates,
    totalChecks,
    totalViolations,
    totalErrors,
    seed,
    results: results.map((r) => ({
      name: r.name,
      shape: r.shape,
      passed: r.passed,
      violated: r.violated,
      skipped: r.skipped,
      errors: r.errors,
      firstViolation: r.firstViolation,
      firstError: r.firstError,
    })),
    coverage,
    allShapes,
  };
}

// ===========================================================================
// COUNTEREXAMPLE SHRINKER
//
// Given a state that violates an MR, try to find a smaller/minimal state
// that still violates the same MR. "Smaller" = fewer distribution classes,
// fewer forecast entries, lower integer fields, fewer non-empty fields.
// Returns the smallest counterexample found within maxIter iterations.
// ===========================================================================

export function shrinkCounterexample(mr, sourceState, transformedState, { maxIter = 200 } = {}) {
  // Start from sourceState; try simplifications
  let best = { sourceState, transformedState };
  let bestSize = stateSize(sourceState);
  const rng = makeRng(0x5417); // shrink-stream seed (was an invalid hex literal in the peer draft)

  for (let iter = 0; iter < maxIter; iter++) {
    const candidate = simplifyState(best.sourceState, rng);
    const candidateSize = stateSize(candidate);
    if (candidateSize >= bestSize) continue; // only accept strictly smaller

    if (!mr.applicable(candidate)) continue;

    let candTransformed;
    try {
      candTransformed = mr.transform(candidate, rng);
    } catch (_) {
      continue;
    }

    let checkResult;
    try {
      checkResult = mr.check(candidate, candTransformed, rng);
    } catch (_) {
      continue;
    }

    if (!checkResult.ok) {
      // Still violates — accept the smaller counterexample
      best = { sourceState: candidate, transformedState: candTransformed };
      bestSize = candidateSize;
    }
  }

  return {
    originalSize: stateSize(sourceState),
    shrunkSize: bestSize,
    shrunk: best,
    shrunkDetail: (() => {
      try {
        return mr.check(best.sourceState, best.transformedState, makeRng(0));
      } catch (_) {
        return { ok: false, detail: 'check threw after shrink' };
      }
    })(),
  };
}

// Approximate state "size" — lower is simpler
function stateSize(state) {
  let size = 0;
  if (state.claimPromotionDistribution) {
    size += Object.keys(state.claimPromotionDistribution).length * 10;
  }
  if (Array.isArray(state.claimedDistribution)) size += state.claimedDistribution.length * 5;
  if (Array.isArray(state.predictions)) size += state.predictions.length * 3;
  if (Array.isArray(state.forecasts)) size += state.forecasts.length * 3;
  size += (state.protectedPathViolations || 0) * 2;
  size += (state.promotionLadderInversions || 0) * 2;
  size += Math.min((state.verifiedEvidenceCount || 0), 50);
  return size;
}

function simplifyState(state, rng) {
  const s = { ...state };

  // Shrink distributions: drop entries or reduce lengths
  if (s.claimPromotionDistribution && typeof s.claimPromotionDistribution === 'object') {
    const keys = Object.keys(s.claimPromotionDistribution);
    if (keys.length > 1 && rng() < 0.4) {
      const dropKey = keys[Math.floor(rng() * keys.length)];
      const shrunk = {};
      for (const k of keys) if (k !== dropKey) shrunk[k] = s.claimPromotionDistribution[k];
      s.claimPromotionDistribution = shrunk;
    }
  }

  if (Array.isArray(s.claimedDistribution) && s.claimedDistribution.length > 1 && rng() < 0.3) {
    s.claimedDistribution = s.claimedDistribution.slice(0, -1);
    if (Array.isArray(s.verifiedDistribution) && s.verifiedDistribution.length > 1) {
      s.verifiedDistribution = s.verifiedDistribution.slice(0, -1);
    }
  }

  // Shrink prediction/forecast arrays
  if (Array.isArray(s.predictions) && s.predictions.length > 1 && rng() < 0.3) {
    s.predictions = s.predictions.slice(0, -1);
    s.outcomes = (s.outcomes || []).slice(0, -1);
  }

  if (Array.isArray(s.forecasts) && s.forecasts.length > 1 && rng() < 0.3) {
    s.forecasts = s.forecasts.slice(0, -1);
    s.results = (s.results || []).slice(0, -1);
  }

  // Reduce integer fields
  if (s.protectedPathViolations > 0 && rng() < 0.5) s.protectedPathViolations--;
  if (s.promotionLadderInversions > 0 && rng() < 0.5) s.promotionLadderInversions--;
  if (s.verifiedEvidenceCount > 0 && rng() < 0.5) {
    s.verifiedEvidenceCount = Math.max(0, s.verifiedEvidenceCount - Math.ceil(s.verifiedEvidenceCount * 0.5));
  }

  // Zero out optional fields
  if (rng() < 0.15) {
    if (!(s.protectedPathViolations > 0)) delete s.protectedPathViolations;
    if (!(s.promotionLadderInversions > 0)) delete s.promotionLadderInversions;
  }

  return s;
}

// ===========================================================================
// NEGATIVE CONTROLS: PLANTED MUTANTS
//
// Each mutant is a deliberately-broken clone of computeU that violates ONE
// specific MR.  The campaign MUST catch each mutant — proving the MR suite
// is non-vacuous.  We never mutate the real computeU (the gate).
// ===========================================================================

function cloneAndBreak(breaks) {
  return (state, weights = DEFAULT_WEIGHTS) => {
    const r = computeU(state, weights).result;
    return breaks(r, state, weights);
  };
}

export const MUTANTS = {
  // MR-scale breaker: scaling weights does NOT scale U linearly
  'scale-breaker': cloneAndBreak((r, _state, weights) => {
    // Add a constant bias so U(w) != k·U(w/k) for scaled weights
    const biased = { ...r, U: r.U + 17.3, contributions: { ...r.contributions } };
    return biased;
  }),

  // MR-permute breaker: entropy changes when CPD values are permuted
  'permute-breaker': cloneAndBreak((r, state) => {
    // Make entropy contribution depend on key order by adding a
    // position-dependent term
    const c = { ...r.contributions };
    // Claude-fix: the original used keys.LENGTH (permutation-INVARIANT) so MR-permute
    // could never catch it. Use a POSITION-weighted sum of the values — Σ vals[i]·i —
    // which genuinely changes when the values are permuted across positions.
    const vals = Object.values(state.claimPromotionDistribution || {});
    let posBias = 0;
    for (let i = 0; i < vals.length; i++) posBias += Number(vals[i]) * i;
    c.entropy = (c.entropy ?? 0) + posBias * 0.1;
    const sumContribs = Object.values(c).reduce((s, v) => s + v, 0);
    return { U: sumContribs, contributions: c };
  }),

  // MR-ceiling-idempotence breaker: extra poison increases drift beyond ceiling
  'ceiling-breaker': cloneAndBreak((r, state) => {
    // Artificially increase wasserstein when more entries are NaN
    const c = { ...r.contributions };
    const claimed = state.claimedDistribution || [];
    const nanCount = claimed.filter((v) => !Number.isFinite(Number(v))).length;
    c.wasserstein = (c.wasserstein ?? 0) + nanCount * 5;
    const sumContribs = Object.values(c).reduce((s, v) => s + v, 0);
    return { U: sumContribs, contributions: c };
  }),

  // MR-additivity breaker: U != sum(contributions) after transform
  'additivity-breaker': cloneAndBreak((r) => {
    // Deliberately break the U == sum relation
    return { U: r.U + 42, contributions: r.contributions };
  }),

  // MR-prediction-symmetry breaker: logLoss changes under (p,o)→(1-p,1-o)
  'prediction-symmetry-breaker': cloneAndBreak((r, state) => {
    // Add a bias that depends on the raw prediction value (not symmetric)
    const c = { ...r.contributions };
    const preds = state.predictions || [];
    const bias = preds.reduce((s, p) => s + Number(p), 0) * 0.01;
    c.logLoss = (c.logLoss ?? 0) + bias;
    const sumContribs = Object.values(c).reduce((s, v) => s + v, 0);
    return { U: sumContribs, contributions: c };
  }),

  // MR-drift-monotonicity breaker: moving mass AWAY lowers W₁
  'drift-monotonicity-breaker': cloneAndBreak((r) => {
    const c = { ...r.contributions };
    // Invert: large W₁ → small contribution, small W₁ → large contribution
    const orig = c.wasserstein ?? 0;
    c.wasserstein = orig > 0 ? 1 / orig : 100;
    const sumContribs = Object.values(c).reduce((s, v) => s + v, 0);
    return { U: sumContribs, contributions: c };
  }),
};

/**
 * Run the campaign against every planted mutant.  Returns {allCaught, report}
 * where allCaught is true iff every mutant is caught by ≥1 MR.
 */
export function runMutationCheck({
  numStates = 500,
  seed = 0xBEEF,
} = {}) {
  const report = {};
  let allCaught = true;

  const realScore = score;
  for (const [name, mutant] of Object.entries(MUTANTS)) {
    // DEPENDENCY INJECTION: point the module-level `score` at the mutant so the
    // REAL mr.check() runs against it. This replaces the original inline
    // re-derivation of each check, which drifted from the actual relation and
    // mis-attributed which MR caught a mutant (MR-drift / MR-ceiling build
    // internal states their inline copies did not replicate). [Claude-fix]
    score = (s, w = DEFAULT_WEIGHTS) => mutant(s, w);
    try {
      const rng = makeRng(seed + name.length);
      const violatedMRs = new Set();
      for (const mr of METAMORPHIC_RELATIONS) {
        for (let i = 0; i < numStates; i++) {
          const sourceState = genState(rng);
          if (!mr.applicable(sourceState)) continue;
          let res;
          try {
            const transformed = mr.transform(sourceState, rng);
            res = mr.check(sourceState, transformed, rng);
          } catch (_) { continue; }
          if (res && !res.ok) { violatedMRs.add(mr.name); break; }
        }
      }
      const caught = violatedMRs.size > 0;
      report[name] = { caught, violatedMRs: [...violatedMRs] };
      if (!caught) allCaught = false;
    } finally {
      score = realScore; // always restore the real scorer, even if a check throws
    }
  }

  return { allCaught, report };
}

// ===========================================================================
// CLI
// ===========================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
  const numStates = Number(process.argv[2]) || 2000;
  const green = runCampaign({ numStates });
  const red = runMutationCheck({ numStates: Math.min(numStates, 500) });

  console.log(JSON.stringify({
    campaign: {
      passed: green.passed,
      numStates: green.numStates,
      totalChecks: green.totalChecks,
      totalViolations: green.totalViolations,
      totalErrors: green.totalErrors,
      perMR: green.results.map((r) => ({
        name: r.name,
        shape: r.shape,
        passed: r.passed,
        violated: r.violated,
        skipped: r.skipped,
        errors: r.errors,
      })),
      coverage: green.coverage.map((c) => ({
        name: c.name,
        shapesCovered: c.shapesCovered,
        coverageFraction: c.coverageFraction,
      })),
    },
    mutants: red,
  }, null, 2));
}