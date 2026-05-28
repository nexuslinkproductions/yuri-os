/**
 * descent-demo.mjs — B.2 controlled-descent demonstration scenario.
 *
 * A worked, hand-crafted 15-transition (16-state) clean workflow in which a
 * claim moves up the promotion ladder, evidence gets verified, and the
 * claimed distribution converges to the verified distribution. Under the
 * yuri-energy composition this drives U strictly downward: every transition
 * lowers entropy (claim mass concentrates), lowers KL drift (claimed → verified),
 * and raises the verified-evidence credit. No protected-path violations, no
 * promotion-ladder inversions.
 *
 * This is the canonical "good case" the evidence plan (Workstream B.2) requires:
 * if U does not descend monotonically here (within the local-minima caveat),
 * the composition has a bug.
 *
 * Contract (Layer 3 — property-based / data-like generators must be pure and
 * deterministic, no I/O): this module exports a single function `scenario()`
 * that returns an ordered array of { stateBefore, stateAfter, label } records.
 * It performs no file, network, clock, or environment reads. Calling it twice
 * returns structurally identical (deeply-equal) data.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy.mjs           (computeU/computeDeltaU/gateProposal)
 *   - _SYSTEM/Scripts/math/yuri-energy-experiment.mjs (harness that runs this)
 *   - _SYSTEM/reports/energy-landscape-paper-2026-07/00-evidence-plan.md §B.2
 */

const STEPS = 15;

// Fixed verified distribution — the ground truth the operator's claims should
// converge toward as evidence accumulates.
const VERIFIED_DISTRIBUTION = Object.freeze([0.1, 0.2, 0.3, 0.4]);

// Claimed distribution at t=0 — diverges from verified (the operator starts
// over-confident in the early tiers).
const CLAIMED_START = Object.freeze([0.4, 0.3, 0.2, 0.1]);

function lerp(from, to, t) {
  return from.map((value, i) => value + (to[i] - value) * t);
}

function normalize(distribution) {
  const sum = distribution.reduce((acc, v) => acc + v, 0);
  // Guarded against a zero-sum vector; the constructed inputs are never zero,
  // but a defensive divide-by-zero check keeps the generator total.
  if (sum === 0) return distribution.map(() => 0);
  return distribution.map((v) => v / sum);
}

/**
 * Build the i-th state snapshot (0 ≤ i ≤ STEPS). Each state is a fresh object
 * literal — no shared references between snapshots, so a consumer that mutates
 * one state cannot corrupt another.
 */
function buildState(i) {
  const t = i / STEPS;

  // Claim promotion distribution: mass migrates draft → trusted as the workflow
  // progresses. This lowers the entropy contribution step by step.
  const claimPromotionDistribution = {
    draft: 10 * (1 - t),
    research: 6,
    fixture_ready: 3 + 4 * t,
    trusted: 1 + 9 * t,
  };

  // Claimed distribution converges toward verified (KL drift drops to ~0).
  const claimedDistribution = normalize(lerp(CLAIMED_START, VERIFIED_DISTRIBUTION, t));

  return {
    claimPromotionDistribution,
    claimedDistribution,
    verifiedDistribution: [...VERIFIED_DISTRIBUTION],
    // Verified evidence accumulates two units per step — the -ι·count credit
    // pulls U down further over time.
    verifiedEvidenceCount: 10 + i * 2,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };
}

const STEP_LABELS = Object.freeze([
  'submit-claim',
  'gather-evidence-1',
  'gather-evidence-2',
  'verify-evidence-batch-1',
  'promote-research-to-fixture-1',
  'verify-evidence-batch-2',
  'promote-research-to-fixture-2',
  'verify-evidence-batch-3',
  'promote-fixture-to-trusted-1',
  'verify-evidence-batch-4',
  'promote-fixture-to-trusted-2',
  'verify-evidence-batch-5',
  'reconcile-claimed-to-verified-1',
  'reconcile-claimed-to-verified-2',
  'final-promotion-to-trusted',
]);

/**
 * scenario() — returns the ordered transition list for the controlled descent.
 *
 * @returns {Array<{stateBefore: object, stateAfter: object, label: string}>}
 *   Exactly STEPS (15) transitions over STEPS+1 (16) states.
 */
export function scenario() {
  const states = [];
  for (let i = 0; i <= STEPS; i++) states.push(buildState(i));

  const transitions = [];
  for (let i = 0; i < STEPS; i++) {
    transitions.push({
      stateBefore: states[i],
      stateAfter: states[i + 1],
      label: STEP_LABELS[i] ?? `step-${i + 1}`,
    });
  }
  return transitions;
}

export default scenario;
