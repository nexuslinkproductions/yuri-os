// Adversarial regression suite for the info-gain buy-back exploit (info-gain-policy lane).
//
// Pre-fix bug: the info-gain credit was -epsilon·informationGain in RAW nats, and
// informationGain = entropy(prior) - entropy(posterior) is bounded only by log(n).
// A proposer who fabricates a large-n prior (e.g. a 200k-element uniform that
// "collapses") manufactures ~ln(200000) ≈ 12.2 nats of credit — UNBOUNDED below as n
// grows — enough to buy back a real promotionLadderInversions defect (theta·1 = 10)
// and flip the Lyapunov gate from REJECT to ACCEPT.
//
// Fix is defense-in-depth:
//   (a) divisive normalization: credit = -epsilon·(gain / log(n)) ∈ [0, epsilon],
//       so state-space inflation buys nothing (a 200k collapse and a 3-way collapse
//       both normalize to 1.0). Grounded in adaptive-coding / divisive normalization
//       of dopamine RPE and homeostatic synaptic scaling (NEU-PLAS-06).
//   (b) structural floor: a promotionLadderInversions INCREASE is non-offsettable by
//       the summed soft credits, symmetric to the protected-path hard veto.
//
// These tests pin BOTH legs so the exploit can never silently regress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeU, gateProposal, DEFAULT_WEIGHTS } from './yuri-energy.mjs';

// Build a maximal-info-gain pair over an n-outcome support: a uniform prior
// (entropy = log n) that collapses to a point mass (entropy 0) => rawGain = log n.
function maxGainPair(n) {
  const prior = new Array(n).fill(1);
  const posterior = new Array(n).fill(0);
  posterior[0] = 1;
  return { prior, posterior };
}

test('part(a) — info-gain credit is normalized to [0,1]: huge-n collapse == small-n collapse', () => {
  const small = maxGainPair(3);
  const huge = maxGainPair(200000);
  const uSmall = computeU({ priorState: small.prior, posteriorState: small.posterior });
  const uHuge = computeU({ priorState: huge.prior, posteriorState: huge.posterior });
  const igSmall = uSmall.result.components.informationGain.value;
  const igHuge = uHuge.result.components.informationGain.value;
  assert.equal(igSmall, 1, 'n=3 maximal collapse normalizes to exactly 1.0');
  assert.equal(igHuge, 1, 'n=200000 maximal collapse ALSO normalizes to 1.0 — inflation buys nothing');
  // Credit magnitude is now bounded by epsilon (=1.0 default), not ~12.2 nats.
  assert.equal(uHuge.result.contributions.informationGain, -DEFAULT_WEIGHTS.epsilon * 1);
});

test('part(a) — legitimate partial learning still earns proportional (non-zero) credit', () => {
  // A real belief sharpening: uniform-ish prior over 4 outcomes -> confident posterior.
  const u = computeU({ priorState: [0.25, 0.25, 0.25, 0.25], posteriorState: [0.7, 0.1, 0.1, 0.1] });
  const ig = u.result.components.informationGain.value;
  assert.ok(ig > 0 && ig < 1, `genuine learning earns partial credit in (0,1), got ${ig}`);
  assert.ok(u.result.contributions.informationGain < 0, 'genuine info-gain still LOWERS U');
});

test('part(a) — a degenerate single-outcome prior (ceiling 0) earns NO credit', () => {
  const u = computeU({ priorState: [1], posteriorState: [1] });
  assert.equal(u.result.components.informationGain.value, 0, 'support ≤ 1 has no information ceiling');
  assert.equal(u.result.contributions.informationGain, 0, 'no credit from a zero-information prior');
});

test('CORE — an info-gain claim CANNOT buy back a promotionLadderInversions increase (default weights)', () => {
  // The exact pre-fix exploit: introduce one ladder inversion (real structural defect,
  // theta·1 = +10 to U) and try to mask it with a fabricated 200k-element max info-gain.
  const { prior, posterior } = maxGainPair(200000);
  const stateBefore = { promotionLadderInversions: 0 };
  const stateAfter = {
    promotionLadderInversions: 1,        // +theta·1 = +10
    priorState: prior,                   // entropy = ln(200000) ≈ 12.2 (pre-fix raw credit)
    posteriorState: posterior,           // entropy = 0
  };

  const g = gateProposal({ stateBefore, stateAfter });

  // Pre-fix: deltaU ≈ -2.2 (12.2 credit - 10 penalty) -> accept=true. The defect was masked.
  assert.equal(g.result.accept, false, 'a real structural defect must NOT be acceptable');
  assert.equal(g.result.structuralFloorVeto, true, 'the structural floor must fire');
  assert.equal(g.result.dominantTerm, 'promotionLadderInversions', 'the defect must be named as dominant');
  // The normalized credit can be at most epsilon (1.0) and the penalty is theta (10),
  // so even WITHOUT the floor, normalization alone leaves a net positive structural delta.
  assert.ok(
    g.result.componentDeltas.promotionLadderInversions >= DEFAULT_WEIGHTS.theta,
    'the ladder penalty must survive into the delta',
  );
  assert.ok(
    Math.abs(g.result.componentDeltas.informationGain) <= DEFAULT_WEIGHTS.epsilon + 1e-9,
    'the normalized info-gain credit must be capped at epsilon (cannot reach the ~12.2 raw nats)',
  );
});

test('CORE — allowOverride CANNOT bypass the structural floor on a ladder inversion', () => {
  const { prior, posterior } = maxGainPair(200000);
  const g = gateProposal({
    stateBefore: { promotionLadderInversions: 0 },
    stateAfter: { promotionLadderInversions: 1, priorState: prior, posteriorState: posterior },
    allowOverride: true,
  });
  assert.equal(g.result.accept, false, 'override must not accept a structural defect');
  assert.equal(g.result.override, false, 'override is suppressed under the structural floor');
  assert.equal(g.result.structuralFloorVeto, true);
});

test('floor fail-CLOSED — a malformed (type-confused) ladder field is vetoed, not coerced to 0', () => {
  // Symmetric to the protected-path type-confusion guard: a present-but-unparseable
  // ladder field must not slip past `after > before` by changing TYPE instead of magnitude.
  const g = gateProposal({
    stateBefore: { promotionLadderInversions: 0 },
    stateAfter: { promotionLadderInversions: 'not-a-number' },
  });
  assert.equal(g.result.accept, false, 'a malformed ladder field must fail closed');
  assert.equal(g.result.structuralFloorVeto, true);
});

test('CORE — a protected-path REPAIR cannot fund a NEW ladder inversion (per-term floor)', () => {
  // Adversarial finding: a summed-structural floor let a protected-path repair
  // (1→0, -eta = -100) drag the structural delta negative while a new ladder
  // inversion (0→1, +theta = +10) rode along under raw ΔU. Each structural defect
  // must be individually non-offsettable: repairing one axis cannot mask another.
  const g = gateProposal({
    stateBefore: { protectedPathViolations: 1, promotionLadderInversions: 0 },
    stateAfter: { protectedPathViolations: 0, promotionLadderInversions: 1 },
  });
  assert.equal(g.result.accept, false, 'a protected-path repair must not buy a new ladder inversion');
  assert.equal(g.result.structuralFloorVeto, true, 'the ladder floor must fire on its own term');
  assert.equal(g.result.componentDeltas.promotionLadderInversions, DEFAULT_WEIGHTS.theta);
  assert.equal(g.result.componentDeltas.protectedPathViolations, -DEFAULT_WEIGHTS.eta);
});

test('regression — the floor does NOT block legitimate descending transitions', () => {
  // No structural defect introduced; genuine learning lowers U. Must still ACCEPT.
  const g = gateProposal({
    stateBefore: { promotionLadderInversions: 0, priorState: [0.25, 0.25, 0.25, 0.25], posteriorState: [0.25, 0.25, 0.25, 0.25] },
    stateAfter: { promotionLadderInversions: 0, priorState: [0.25, 0.25, 0.25, 0.25], posteriorState: [0.7, 0.1, 0.1, 0.1] },
  });
  assert.equal(g.result.structuralFloorVeto, false, 'no defect -> floor must not fire');
  assert.equal(g.result.accept, true, 'genuine learning with no structural defect must be accepted');
  assert.ok(g.result.deltaU <= 0, 'and the transition is descending (Lyapunov property preserved)');
});

test('regression — REMOVING a ladder inversion (defect repair) is accepted, floor does not fire', () => {
  // The floor keys on an INCREASE only. Repairing a defect (after < before) must pass.
  const g = gateProposal({
    stateBefore: { promotionLadderInversions: 2 },
    stateAfter: { promotionLadderInversions: 0 },
  });
  assert.equal(g.result.structuralFloorVeto, false, 'a decrease must not trip the floor');
  assert.equal(g.result.accept, true, 'repairing a structural defect lowers U and is accepted');
});
