#!/usr/bin/env node
/**
 * YURI Energy Function — yuri-energy.mjs
 *
 * Composes existing math-kernel primitives into a scalar potential U(state)
 * over YURI control-plane state. Bound to dispatch and claim promotion as a
 * Lyapunov-style rejection rule:
 *
 *   ΔU > threshold → reject the proposed transition (unless operator override)
 *   ΔU ≤ threshold → accept the proposed transition
 *
 * Architectural disclaimer:
 *
 * This is NOT the Potential-Derived (PD) layer from the energy-based-models
 * literature. It is an applied composition of proven primitives at the
 * control-plane meta-level, not at the neural-network weight level.
 *
 * The weights are designed (hand-tuned), not learned. This is an explicit
 * limitation noted in the methodology paper. The current weights reflect the
 * policy "claim/evidence drift is bad, protected-path violations are
 * catastrophic, verified evidence is good."
 *
 * Status: research → fixture_ready. Not yet runtime_tested in dispatch.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/math-kernel.mjs           (primitives composed here)
 *   - _SYSTEM/reports/YURI_GROUND_TRUTH_AUDIT_2026-05-28.md §4.1
 *   - YURI memory: project-energy-landscape-paper
 */

import {
  entropy,
  klDivergence,
  logLoss,
  brierScore,
  informationGain,
  confidenceDecay,
  makeMathResult,
} from './math-kernel.mjs';

const ENERGY_PRECISION = 1e9;

// ---------------------------------------------------------------------------
// Default weights
// ---------------------------------------------------------------------------
//
// These weights are hand-tuned, not learned. They encode the policy described
// above. Override per-call via the `weights` argument if a specific dispatch
// scenario requires a different weighting.

export const DEFAULT_WEIGHTS = Object.freeze({
  alpha: 1.0,    // entropy(claimPromotionDistribution) — uncertainty about claim status
  beta: 2.0,     // klDivergence(claimed, verified) — drift between claim and evidence
  gamma: 1.0,    // logLoss(predictions, outcomes) — forecast calibration penalty
  delta: 1.0,    // brierScore(forecasts, results) — forecast accuracy penalty
  epsilon: 1.0,  // -informationGain(prior, posterior) — info gain LOWERS energy
  zeta: 0.5,    // sum(staleness) — stale evidence dragging state up
  eta: 100.0,   // protectedPathViolations — catastrophic, high weight
  theta: 10.0,  // promotionLadderInversions — high weight
  iota: 0.1,    // -verifiedEvidenceCount — verified evidence subtracts from U (saturating)
  kappa: 5.0,   // repeatedFailurePenalty — per-event count of confidently-wrong predictions
  lambda: 50.0, // malformedForecastPenalty — out-of-range/non-finite forecast inputs fail CLOSED
});

// Saturation cap for the verified-evidence credit (bounds U BELOW). The credit is
// -iota·log1p(min(count, CAP)): logarithmic AND capped, so it has a finite infimum
// (-iota·log1p(CAP)). Without this the credit was linear -> U unbounded below ->
// no infimum -> the "descent/Lyapunov" claim is vacuous and evidence buys an
// arbitrarily large masking budget.
const VERIFIED_EVIDENCE_CREDIT_CAP = 50;

function normalizeWeights(weights = DEFAULT_WEIGHTS) {
  const supplied = weights || {};
  for (const key of Object.keys(supplied)) {
    if (!Object.hasOwn(DEFAULT_WEIGHTS, key)) {
      throw new Error(`unknown yuri-energy weight: ${key}`);
    }
  }

  const normalized = { ...DEFAULT_WEIGHTS };
  for (const [key, value] of Object.entries({ ...DEFAULT_WEIGHTS, ...supplied })) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`weight ${key} must be finite`);
    if (numeric < 0) throw new Error(`weight ${key} must be non-negative`);
    normalized[key] = numeric;
  }
  return normalized;
}

function roundEnergy(value) {
  const rounded = Math.round(value * ENERGY_PRECISION) / ENERGY_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function readNonNegativeField(state, field, warnings) {
  if (!Object.hasOwn(state, field) || state[field] === null || state[field] === undefined || state[field] === '') {
    return 0;
  }

  const value = Number(state[field]);
  if (!Number.isFinite(value)) {
    warnings.push(`${field} ignored: expected finite non-negative number`);
    return 0;
  }
  if (value < 0) {
    warnings.push(`${field} clamped to 0: negative values cannot lower U`);
    return 0;
  }
  return value;
}

function serializeComponent(component) {
  if (component.skipped) {
    return {
      skipped: true,
      reason: component.reason,
      ...(component.warnings?.length ? { warnings: component.warnings } : {}),
    };
  }
  return {
    value: component.value,
    ...(component.warnings?.length ? { warnings: component.warnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// Component evaluators — each one is safe against missing/empty state fields.
// Returns { value, skipped: false } on success or { skipped: true, reason } on
// missing data. The composition uses 0 contribution for skipped components,
// not NaN — this keeps U finite for partial state snapshots.
// ---------------------------------------------------------------------------

function evalEntropy(distribution) {
  if (!distribution) return { skipped: true, reason: 'no claimPromotionDistribution' };
  const values = Array.isArray(distribution) ? distribution : Object.values(distribution);
  if (values.length === 0) return { skipped: true, reason: 'empty distribution' };
  if (values.every((v) => v === 0)) return { value: 0, skipped: false };
  try {
    return { value: entropy(values), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `entropy failed: ${err.message}` };
  }
}

// Clamp distribution entries away from 0 (mirror of the logLoss epsilon clamp).
// Without this, a provable-lie verified=[0,1] makes klDivergence throw "infinite"
// -> evalKL returns skipped -> the term contributes 0 -> the gate ACCEPTS the
// worst case. Clamping yields a large but FINITE KL -> large positive ΔU -> reject.
const KL_EPSILON = 1e-12;
function clampDistribution(arr) {
  return arr.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > KL_EPSILON ? n : KL_EPSILON;
  });
}

function evalKL({ claimed, verified }) {
  if (!claimed || !verified) return { skipped: true, reason: 'no claimed/verified pair' };
  if (!Array.isArray(claimed) || !Array.isArray(verified)) {
    return { skipped: true, reason: 'claimed/verified must be arrays' };
  }
  if (claimed.length !== verified.length) {
    // Attack-finding fix: a length mismatch is itself a structurally invalid claim.
    // klDivergence throws on unequal length -> evalKL would skip -> the drift term
    // contributes 0 -> the gate ACCEPTS the worst case. Treat a mismatch as maximal
    // drift (large finite KL) so it REJECTS, symmetric to the zero-value clamp.
    return {
      value: Math.log(1 / KL_EPSILON),
      skipped: false,
      warnings: ['claimed/verified length mismatch — treated as maximal drift'],
    };
  }
  try {
    // HIGH bug #3 fix: clamp BOTH sides so KL is finite + monotonic in drift.
    return { value: klDivergence(clampDistribution(claimed), clampDistribution(verified)), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `KL failed: ${err.message}` };
  }
}

// Per-event repeated-failure penalty (HIGH bug #6). logLoss/brier are MEANS, so
// the 2nd..Nth confidently-wrong prediction adds ~0 to a saturated average and
// the gate stops penalizing repeated lies. This counts confidently-wrong events
// (high-confidence prediction on the wrong side) and penalizes per COUNT, so each
// additional failure raises U — breaking the windowed-mean plateau.
function evalRepeatedFailure(preds, outs) {
  if (!Array.isArray(preds) || !Array.isArray(outs)) {
    return { skipped: true, reason: 'no predictions/outcomes' };
  }
  if (preds.length === 0) return { value: 0, skipped: false };
  let count = 0;
  for (let i = 0; i < preds.length; i += 1) {
    const p = Number(preds[i]);
    const o = Number(outs[i]);
    if (!Number.isFinite(p) || !Number.isFinite(o)) continue; // malformed -> evalMalformedForecast
    // Bucket fractional/out-of-range outcomes to the nearest label (0.0001 -> 0,
    // 0.9999 -> 1) so a near-miss report cannot evade the count. Strict, symmetric
    // boundary: the uninformative midpoint p=0.5 is counted on NEITHER side.
    const oLabel = o >= 0.5 ? 1 : 0;
    if ((p > 0.5 && oLabel === 0) || (p < 0.5 && oLabel === 1)) count += 1;
  }
  return { value: count, skipped: false };
}

// Fail-CLOSED guard on malformed forecast inputs (attack-finding fix). logLoss and
// brier throw -> skip -> contribute 0 on any prediction/outcome outside [0,1], and a
// skipped term lets the gate ACCEPT the worst case (verified: outcome=2 flipped a
// reject to accept). This counts every out-of-range / non-finite forecast entry and
// RAISES U at high weight, so an attacker-controlled invalid forecast vector cannot
// drive ΔU to 0 and slip a transition through gateProposal.
function isValidProbability(x) {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}
function countMalformed(arr) {
  if (!Array.isArray(arr)) return 0;
  let c = 0;
  for (const x of arr) if (!isValidProbability(x)) c += 1;
  return c;
}
function evalMalformedForecast(state) {
  const count = countMalformed(state.predictions) + countMalformed(state.outcomes)
    + countMalformed(state.forecasts) + countMalformed(state.results);
  if (count === 0) return { skipped: true, reason: 'no malformed forecast inputs' };
  return { value: count, skipped: false };
}

function evalLogLoss(preds, outs) {
  if (!preds || !outs) return { skipped: true, reason: 'no predictions/outcomes' };
  if (preds.length === 0) return { value: 0, skipped: false };
  try {
    return { value: logLoss(preds, outs), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `logLoss failed: ${err.message}` };
  }
}

function evalBrier(preds, outs) {
  if (!preds || !outs) return { skipped: true, reason: 'no forecasts/results' };
  if (preds.length === 0) return { value: 0, skipped: false };
  try {
    return { value: brierScore(preds, outs), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `brier failed: ${err.message}` };
  }
}

function evalInfoGain({ prior, posterior }) {
  if (!prior || !posterior) return { skipped: true, reason: 'no prior/posterior' };
  try {
    return { value: informationGain(prior, posterior), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `infoGain failed: ${err.message}` };
  }
}

function evalStaleness(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { skipped: true, reason: 'no evidence array' };
  }
  let total = 0;
  const warnings = [];
  for (const [index, item] of evidence.entries()) {
    try {
      const decayed = confidenceDecay(item);
      total += Math.max(0, item.base - decayed);
    } catch (err) {
      warnings.push(`evidence[${index}] skipped: ${err.message}`);
    }
  }
  if (warnings.length === evidence.length) {
    return { skipped: true, reason: 'all evidence items malformed', warnings };
  }
  return { value: roundEnergy(total), skipped: false, warnings };
}

// ---------------------------------------------------------------------------
// computeU — scalar potential over a YURI control-plane state snapshot.
// ---------------------------------------------------------------------------

export function computeU(state = {}, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  const validationWarnings = [];

  const components = {
    entropy: evalEntropy(state.claimPromotionDistribution),
    klDivergence: evalKL({
      claimed: state.claimedDistribution,
      verified: state.verifiedDistribution,
    }),
    logLoss: evalLogLoss(state.predictions, state.outcomes),
    brier: evalBrier(state.forecasts, state.results),
    repeatedFailure: evalRepeatedFailure(state.predictions, state.outcomes),
    malformedForecast: evalMalformedForecast(state),
    informationGain: evalInfoGain({
      prior: state.priorState,
      posterior: state.posteriorState,
    }),
    staleness: evalStaleness(state.evidence),
  };

  const contributions = {};
  let U = 0;

  if (!components.entropy.skipped) {
    contributions.entropy = w.alpha * components.entropy.value;
    U += contributions.entropy;
  }
  if (!components.klDivergence.skipped) {
    contributions.klDivergence = w.beta * components.klDivergence.value;
    U += contributions.klDivergence;
  }
  if (!components.logLoss.skipped) {
    contributions.logLoss = w.gamma * components.logLoss.value;
    U += contributions.logLoss;
  }
  if (!components.brier.skipped) {
    contributions.brier = w.delta * components.brier.value;
    U += contributions.brier;
  }
  if (!components.repeatedFailure.skipped) {
    contributions.repeatedFailure = roundEnergy(w.kappa * components.repeatedFailure.value);
    U += contributions.repeatedFailure;
  }
  if (!components.malformedForecast.skipped) {
    contributions.malformedForecast = roundEnergy(w.lambda * components.malformedForecast.value);
    U += contributions.malformedForecast;
  }
  if (!components.informationGain.skipped) {
    contributions.informationGain = -w.epsilon * components.informationGain.value;
    U += contributions.informationGain;
  }
  if (!components.staleness.skipped) {
    contributions.staleness = w.zeta * components.staleness.value;
    U += contributions.staleness;
  }

  const protectedPathViolations = readNonNegativeField(state, 'protectedPathViolations', validationWarnings);
  const promotionLadderInversions = readNonNegativeField(state, 'promotionLadderInversions', validationWarnings);
  const verifiedEvidenceCount = readNonNegativeField(state, 'verifiedEvidenceCount', validationWarnings);

  contributions.protectedPathViolations = roundEnergy(w.eta * protectedPathViolations);
  contributions.promotionLadderInversions = roundEnergy(w.theta * promotionLadderInversions);
  const cappedEvidence = Math.min(verifiedEvidenceCount, VERIFIED_EVIDENCE_CREDIT_CAP);
  contributions.verifiedEvidenceCredit = roundEnergy(-w.iota * Math.log1p(cappedEvidence));

  U += contributions.protectedPathViolations;
  U += contributions.promotionLadderInversions;
  U += contributions.verifiedEvidenceCredit;

  const value = roundEnergy(U);

  return makeMathResult({
    operation: 'yuri-energy.computeU',
    input: { state, weights: w },
    result: {
      U: value,
      components: Object.fromEntries(
        Object.entries(components).map(([k, v]) => [k, serializeComponent(v)]),
      ),
      contributions,
      validationWarnings,
    },
    proof: {
      advisory_only: true,
      local_truth_claim: false,
      weights: w,
      note: 'Hand-tuned weights; not learned. See methodology paper §5 (Honest Limitations).',
    },
  });
}

// ---------------------------------------------------------------------------
// computeDeltaU — gradient between two states.
// ---------------------------------------------------------------------------

export function computeDeltaU(stateBefore, stateAfter, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  const before = computeU(stateBefore, w);
  const after = computeU(stateAfter, w);
  const deltaU = roundEnergy(after.result.U - before.result.U);

  const componentDeltas = {};
  const keys = new Set([
    ...Object.keys(before.result.contributions),
    ...Object.keys(after.result.contributions),
  ]);
  for (const key of keys) {
    const b = before.result.contributions[key] ?? 0;
    const a = after.result.contributions[key] ?? 0;
    componentDeltas[key] = roundEnergy(a - b);
  }

  return makeMathResult({
    operation: 'yuri-energy.computeDeltaU',
    input: { stateBefore, stateAfter, weights: w },
    result: {
      deltaU,
      uBefore: before.result.U,
      uAfter: after.result.U,
      componentDeltas,
    },
    proof: {
      advisory_only: true,
      local_truth_claim: false,
      lyapunovProperty: deltaU <= 0 ? 'descending' : 'ascending',
    },
  });
}

// ---------------------------------------------------------------------------
// gateProposal — Lyapunov gate on a proposed state transition.
// ---------------------------------------------------------------------------

export function gateProposal({
  stateBefore,
  stateAfter,
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
} = {}) {
  if (!stateBefore || !stateAfter || Array.isArray(stateBefore) || Array.isArray(stateAfter)) {
    throw new Error('gateProposal requires stateBefore and stateAfter');
  }
  const normalizedThreshold = Number(threshold);
  if (!Number.isFinite(normalizedThreshold)) {
    throw new Error('gateProposal threshold must be finite');
  }
  const w = normalizeWeights(weights);
  const delta = computeDeltaU(stateBefore, stateAfter, w);
  const deltaU = delta.result.deltaU;
  const passesThreshold = deltaU <= normalizedThreshold;
  const overrideAllowed = allowOverride === true;

  // HARD VETO (HIGH bug #4): a protected-path violation INCREASE is catastrophic
  // and NON-offsettable — no evidence credit (masking) and no override may accept
  // it. This now lives in the LIVE gate, not just the simulator. A masking attack
  // (huge verifiedEvidenceCount pushing ΔU back under threshold) cannot pass here.
  const vetoWarnings = [];
  const protectedBefore = readNonNegativeField(stateBefore, 'protectedPathViolations', vetoWarnings);
  const protectedAfter = readNonNegativeField(stateAfter, 'protectedPathViolations', vetoWarnings);
  const protectedPathVeto = protectedAfter > protectedBefore;

  const accept = protectedPathVeto ? false : (passesThreshold || overrideAllowed);

  const reason = protectedPathVeto
    ? `protected-path violation increase (${protectedBefore}→${protectedAfter}) — HARD VETO, non-offsettable (ΔU and override ignored)`
    : passesThreshold
      ? `ΔU=${deltaU} ≤ threshold=${normalizedThreshold} (descending or held)`
      : overrideAllowed
        ? `ΔU=${deltaU} > threshold=${normalizedThreshold} but override allowed`
        : `ΔU=${deltaU} > threshold=${normalizedThreshold} (ascending — energy raised, reject)`;

  let dominantTerm = null;
  if (deltaU > normalizedThreshold) {
    const positive = Object.entries(delta.result.componentDeltas)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    dominantTerm = positive[0]?.[0] ?? null;
  }

  return makeMathResult({
    operation: 'yuri-energy.gateProposal',
    input: { stateBefore, stateAfter, weights: w, threshold: normalizedThreshold, allowOverride },
    result: {
      accept,
      reason,
      deltaU,
      threshold: normalizedThreshold,
      override: !protectedPathVeto && !passesThreshold && overrideAllowed,
      protectedPathVeto,
      dominantTerm: protectedPathVeto ? 'protectedPathViolations' : dominantTerm,
      componentDeltas: delta.result.componentDeltas,
    },
    proof: {
      advisory_only: true,
      local_truth_claim: false,
      lyapunovProperty: passesThreshold ? 'descending' : 'ascending',
    },
  });
}

// ---------------------------------------------------------------------------
// CLI worked example — runs two demo scenarios when invoked directly.
// ---------------------------------------------------------------------------

function workedExample() {
  // Scenario A — descending transition: a new claim gets verified, KL drift drops.
  const stateA_before = {
    claimPromotionDistribution: { draft: 5, research: 8, fixture_ready: 3, runtime_tested: 1 },
    claimedDistribution: [0.5, 0.3, 0.2],
    verifiedDistribution: [0.3, 0.3, 0.4],
    verifiedEvidenceCount: 12,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };
  const stateA_after = {
    claimPromotionDistribution: { draft: 4, research: 8, fixture_ready: 4, runtime_tested: 1 },
    claimedDistribution: [0.4, 0.3, 0.3],
    verifiedDistribution: [0.3, 0.3, 0.4],
    verifiedEvidenceCount: 13,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };

  const gateA = gateProposal({ stateBefore: stateA_before, stateAfter: stateA_after });

  // Scenario B — ascending transition: a protected-path violation is introduced.
  const stateB_before = {
    claimPromotionDistribution: { runtime_tested: 5, trusted: 3 },
    verifiedEvidenceCount: 20,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };
  const stateB_after = {
    claimPromotionDistribution: { runtime_tested: 5, trusted: 3 },
    verifiedEvidenceCount: 20,
    protectedPathViolations: 1,
    promotionLadderInversions: 0,
  };

  const gateB = gateProposal({ stateBefore: stateB_before, stateAfter: stateB_after });

  return {
    scenarioA_descent: {
      accept: gateA.result.accept,
      deltaU: gateA.result.deltaU,
      reason: gateA.result.reason,
      componentDeltas: gateA.result.componentDeltas,
    },
    scenarioB_ascent_protected_path: {
      accept: gateB.result.accept,
      deltaU: gateB.result.deltaU,
      reason: gateB.result.reason,
      dominantTerm: gateB.result.dominantTerm,
      componentDeltas: gateB.result.componentDeltas,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worked-example' || argv.length === 0) {
    console.log(JSON.stringify(workedExample(), null, 2));
  } else if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(
      [
        'YURI Energy Function — Lyapunov-gated promotion potential',
        '',
        'Usage:',
        '  node _SYSTEM/Scripts/math/yuri-energy.mjs --worked-example',
        '',
        'Programmatic:',
        '  import { computeU, computeDeltaU, gateProposal, DEFAULT_WEIGHTS }',
        '    from "_SYSTEM/Scripts/math/yuri-energy.mjs";',
      ].join('\n'),
    );
  } else {
    console.error(`unknown argument: ${argv[0]}`);
    process.exit(2);
  }
}
