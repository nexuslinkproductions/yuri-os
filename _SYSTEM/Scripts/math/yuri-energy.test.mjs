import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeU,
  computeDeltaU,
  gateProposal,
  DEFAULT_WEIGHTS,
  wasserstein1,
  evalWasserstein,
  evalOverconfidenceDrift,
  claimedConcentration,
} from './yuri-energy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = '_SYSTEM/Scripts/math/yuri-energy.mjs';

// ---------------------------------------------------------------------------
// computeU — basic shape and empty-state behavior
// ---------------------------------------------------------------------------

test('computeU returns 0 for empty state and skips all components', () => {
  const r = computeU({});
  assert.equal(r.result.U, 0);
  for (const key of ['entropy', 'wasserstein', 'logLoss', 'brier', 'informationGain', 'staleness']) {
    assert.equal(r.result.components[key].skipped, true, `${key} must be skipped`);
  }
});

test('computeU returns deterministic envelope with makeMathResult shape', () => {
  const r = computeU({ verifiedEvidenceCount: 5 });
  assert.equal(r.operation, 'yuri-energy.computeU');
  assert.equal(r.deterministic, true);
  assert.ok(typeof r.inputsHash === 'string');
  assert.ok(typeof r.resultHash === 'string');
  assert.equal(r.proof.advisory_only, true);
});

test('verified evidence count lowers U via a SATURATING iota credit (bounds U below)', () => {
  const noEvidence = computeU({ verifiedEvidenceCount: 0 });
  const withEvidence = computeU({ verifiedEvidenceCount: 10 });
  assert.ok(withEvidence.result.U < noEvidence.result.U, 'verified evidence must lower U');
  // credit is -iota·log1p(count), NOT linear -iota·count — saturating so U has a
  // finite infimum (bound-U fix) and evidence cannot buy unbounded masking budget.
  assert.ok(
    Math.abs(withEvidence.result.contributions.verifiedEvidenceCredit - (-DEFAULT_WEIGHTS.iota * Math.log1p(10))) < 1e-6,
  );
  // 100x the evidence does NOT give 100x the credit; it caps at -iota·log1p(50).
  const huge = computeU({ verifiedEvidenceCount: 1000 }).result.contributions.verifiedEvidenceCredit;
  assert.ok(Math.abs(huge - (-DEFAULT_WEIGHTS.iota * Math.log1p(50))) < 1e-6, 'credit saturates at the cap');
});

test('protected-path violations dominate U via eta weight', () => {
  const clean = computeU({});
  const tainted = computeU({ protectedPathViolations: 1 });
  assert.equal(tainted.result.U - clean.result.U, DEFAULT_WEIGHTS.eta);
});

test('promotion ladder inversions raise U via theta weight', () => {
  const clean = computeU({});
  const inverted = computeU({ promotionLadderInversions: 2 });
  assert.equal(inverted.result.U - clean.result.U, 2 * DEFAULT_WEIGHTS.theta);
});

test('invalid counters cannot lower U and are reported as validation warnings', () => {
  const r = computeU({
    protectedPathViolations: -1,
    promotionLadderInversions: -2,
    verifiedEvidenceCount: -5,
  });
  assert.equal(r.result.U, 0);
  assert.equal(r.result.contributions.protectedPathViolations, 0);
  assert.equal(r.result.contributions.promotionLadderInversions, 0);
  assert.equal(r.result.contributions.verifiedEvidenceCredit, 0);
  assert.equal(r.result.validationWarnings.length, 3);
});

// ---------------------------------------------------------------------------
// computeU — component math correctness
// ---------------------------------------------------------------------------

test('entropy component lifts U when claim distribution has spread', () => {
  const concentrated = computeU({ claimPromotionDistribution: [10, 0, 0, 0] });
  const spread = computeU({ claimPromotionDistribution: [3, 3, 3, 3] });
  assert.ok(spread.result.U > concentrated.result.U, 'spread distribution should have higher entropy');
});

test('KL divergence component lifts U when claimed diverges from verified', () => {
  const aligned = computeU({
    claimedDistribution: [0.5, 0.5],
    verifiedDistribution: [0.5, 0.5],
  });
  const diverged = computeU({
    claimedDistribution: [0.9, 0.1],
    verifiedDistribution: [0.1, 0.9],
  });
  assert.ok(diverged.result.U > aligned.result.U, 'divergence must lift U');
});

test('information gain LOWERS U (epsilon is negative-signed)', () => {
  const noGain = computeU({});
  const gained = computeU({
    priorState: [0.25, 0.25, 0.25, 0.25],   // high entropy
    posteriorState: [0.97, 0.01, 0.01, 0.01], // low entropy = info gained
  });
  assert.ok(gained.result.U < noGain.result.U, 'information gain must lower U');
  assert.ok(gained.result.contributions.informationGain < 0);
});

test('staleness component lifts U when evidence is old', () => {
  const fresh = computeU({
    evidence: [{ base: 0.9, age: 0, halfLife: 30 }],
  });
  const stale = computeU({
    evidence: [{ base: 0.9, age: 90, halfLife: 30 }],
  });
  assert.ok(stale.result.U > fresh.result.U, 'stale evidence must lift U');
});

test('staleness component reports malformed evidence without hiding valid items', () => {
  const r = computeU({
    evidence: [
      { base: 0.8, age: 30, halfLife: 30 },
      { base: 2, age: 10, halfLife: 30 },
    ],
  });
  assert.equal(r.result.components.staleness.skipped, undefined);
  assert.equal(r.result.components.staleness.warnings.length, 1);
  assert.ok(r.result.contributions.staleness > 0);
});

test('staleness FAILS CLOSED when all evidence items are malformed (GAP-2 F5)', () => {
  const r = computeU({
    evidence: [
      { base: 2, age: 10, halfLife: 30 },
      { base: 0.8, age: -1, halfLife: 30 },
    ],
  });
  // Hardened 2026-06-14 (red-team F5): a PRESENT but all-malformed evidence array previously
  // skipped → contributed 0 staleness (silent fail-OPEN). Now each phantom item = 1 unit max
  // staleness so it RAISES U instead of vanishing. Per-item skip warnings are preserved + a summary.
  assert.ok(!r.result.components.staleness.skipped);
  assert.equal(r.result.components.staleness.value, 2);
  assert.equal(r.result.contributions.staleness, 0.5 * 2); // zeta * 2 phantom-stale items
  assert.ok(r.result.components.staleness.warnings.some((w) => /maximally stale/.test(w)));
  assert.ok(r.result.components.staleness.warnings.length >= 2); // 2 per-item + summary
});

test('entropy FAILS CLOSED on a poisoned distribution (GAP-2 F1)', () => {
  const r = computeU({ claimPromotionDistribution: [-1, 2, 3] });
  // was: kernel entropy throws -> skip -> contributes 0 (silent fail-open). now: max entropy ln(3).
  assert.ok(!r.result.components.entropy.skipped);
  assert.equal(r.result.components.entropy.value, Math.log(3));
  assert.ok(r.result.components.entropy.warnings.some((w) => /maximum entropy/.test(w)));
});

test('infoGain credit SUPPRESSED on a poisoned prior/posterior (GAP-2 F4)', () => {
  const r = computeU({ priorState: [-1, 1, 1], posteriorState: [1, 1, 1] });
  // infoGain is a CREDIT term (-eps*value). a poisoned distribution must not grant unearned credit.
  assert.ok(!r.result.components.informationGain.skipped);
  assert.equal(r.result.components.informationGain.value, 0);
  assert.ok(r.result.components.informationGain.warnings.some((w) => /credit suppressed/.test(w)));
});

test('GAP-2 clean-path: a valid state fires NO fail-closed guard (byte-identical path)', () => {
  const r = computeU({
    claimPromotionDistribution: [1, 2, 3], priorState: [2, 1, 1], posteriorState: [1, 1, 1],
    evidence: [{ base: 0.9, age: 5, halfLife: 30 }],
  });
  for (const k of ['entropy', 'informationGain', 'staleness']) {
    const ws = r.result.components[k].warnings || [];
    assert.ok(
      !ws.some((w) => /poisoned|maximally stale|credit suppressed|maximum entropy/.test(w)),
      `${k} must have no fail-closed warning on clean input`,
    );
  }
});

// ---------------------------------------------------------------------------
// computeDeltaU — gradient correctness
// ---------------------------------------------------------------------------

test('computeDeltaU returns 0 for identical states', () => {
  const state = { verifiedEvidenceCount: 5 };
  const d = computeDeltaU(state, state);
  assert.equal(d.result.deltaU, 0);
});

test('computeDeltaU is negative when state improves', () => {
  const before = { verifiedEvidenceCount: 0, protectedPathViolations: 0 };
  const after = { verifiedEvidenceCount: 10, protectedPathViolations: 0 };
  const d = computeDeltaU(before, after);
  assert.ok(d.result.deltaU < 0, 'gaining verified evidence must descend U');
  assert.equal(d.proof.lyapunovProperty, 'descending');
});

test('computeDeltaU is positive when state degrades', () => {
  const before = { protectedPathViolations: 0 };
  const after = { protectedPathViolations: 1 };
  const d = computeDeltaU(before, after);
  assert.ok(d.result.deltaU > 0, 'introducing a protected-path violation must ascend U');
  assert.equal(d.proof.lyapunovProperty, 'ascending');
});

test('componentDeltas isolate which term changed', () => {
  const before = { protectedPathViolations: 0, promotionLadderInversions: 0 };
  const after = { protectedPathViolations: 1, promotionLadderInversions: 0 };
  const d = computeDeltaU(before, after);
  assert.equal(d.result.componentDeltas.protectedPathViolations, DEFAULT_WEIGHTS.eta);
  assert.equal(d.result.componentDeltas.promotionLadderInversions, 0);
});

// ---------------------------------------------------------------------------
// gateProposal — Lyapunov gate behavior
// ---------------------------------------------------------------------------

test('gateProposal accepts a descending transition', () => {
  const r = gateProposal({
    stateBefore: { verifiedEvidenceCount: 0 },
    stateAfter: { verifiedEvidenceCount: 5 },
  });
  assert.equal(r.result.accept, true);
  assert.ok(r.result.deltaU < 0);
  assert.equal(r.result.dominantTerm, null);
});

test('gateProposal rejects an ascending transition by default', () => {
  const r = gateProposal({
    stateBefore: { protectedPathViolations: 0 },
    stateAfter: { protectedPathViolations: 1 },
  });
  assert.equal(r.result.accept, false);
  assert.ok(r.result.deltaU > 0);
  assert.equal(r.result.dominantTerm, 'protectedPathViolations');
});

test('gateProposal honors allowOverride and reports override=true (benign ascent)', () => {
  // A BENIGN ascending transition (losing evidence credit raises U) — override may
  // accept it. NOT a protected-path increase, which the hard veto refuses to
  // override (covered separately below).
  const r = gateProposal({
    stateBefore: { verifiedEvidenceCount: 10 },
    stateAfter: { verifiedEvidenceCount: 0 },
    allowOverride: true,
  });
  assert.ok(r.result.deltaU > 0, 'scenario must be ascending');
  assert.equal(r.result.accept, true);
  assert.equal(r.result.override, true);
});

test('gateProposal requires boolean true for override', () => {
  const r = gateProposal({
    stateBefore: { protectedPathViolations: 0 },
    stateAfter: { protectedPathViolations: 1 },
    allowOverride: 'true',
  });
  assert.equal(r.result.accept, false);
  assert.equal(r.result.override, false);
});

test('gateProposal accepts when ΔU is exactly at threshold', () => {
  const r = gateProposal({
    stateBefore: {},
    stateAfter: {},
    threshold: 0,
  });
  assert.equal(r.result.accept, true);
  assert.equal(r.result.deltaU, 0);
});

test('gateProposal A4: a present-but-NEGATIVE protected/ladder field FAILS CLOSED (red-team neg-field)', () => {
  // Verified seam: readNonNegativeField clamps a negative to 0, so `5 -> -5` read as a repair and the veto
  // did NOT fire (accept was true). Now a present-but-negative count fails closed like a malformed one.
  const negProtected = gateProposal({
    stateBefore: { protectedPathViolations: 5, promotionLadderInversions: 0 },
    stateAfter: { protectedPathViolations: -5, promotionLadderInversions: 0 },
  });
  assert.equal(negProtected.result.protectedPathVeto, true);
  assert.equal(negProtected.result.accept, false);

  const negLadder = gateProposal({
    stateBefore: { protectedPathViolations: 0, promotionLadderInversions: 5 },
    stateAfter: { protectedPathViolations: 0, promotionLadderInversions: -5 },
  });
  assert.equal(negLadder.result.structuralFloorVeto, true);
  assert.equal(negLadder.result.accept, false);

  // clean-path unchanged: a benign non-negative transition still accepts
  assert.equal(gateProposal({ stateBefore: {}, stateAfter: {} }).result.accept, true);
});

test('gateProposal identifies the dominant rising component', () => {
  const r = gateProposal({
    stateBefore: { protectedPathViolations: 0, promotionLadderInversions: 0 },
    stateAfter: { protectedPathViolations: 0, promotionLadderInversions: 5 },
  });
  assert.equal(r.result.accept, false);
  assert.equal(r.result.dominantTerm, 'promotionLadderInversions');
});

test('gateProposal structural floor keys on raw ladder increase, not theta or threshold (red-team #1)', () => {
  for (const opts of [
    { weights: { theta: 0 }, threshold: 0 },
    { threshold: 99 },
  ]) {
    const r = gateProposal({
      stateBefore: { promotionLadderInversions: 0 },
      stateAfter: { promotionLadderInversions: 1 },
      ...opts,
    });
    assert.equal(r.result.accept, false);
    assert.equal(r.result.structuralFloorVeto, true);
    assert.equal(r.result.dominantTerm, 'promotionLadderInversions');
  }
});

test('gateProposal throws on missing state', () => {
  assert.throws(() => gateProposal({ stateBefore: {} }), /requires stateBefore and stateAfter/);
  assert.throws(() => gateProposal({}), /requires stateBefore and stateAfter/);
  assert.throws(() => gateProposal({ stateBefore: [], stateAfter: {} }), /requires stateBefore and stateAfter/);
});

test('gateProposal rejects non-finite thresholds', () => {
  assert.throws(
    () => gateProposal({ stateBefore: {}, stateAfter: {}, threshold: Infinity }),
    /threshold must be finite/,
  );
  assert.throws(
    () => gateProposal({ stateBefore: {}, stateAfter: {}, threshold: 'nope' }),
    /threshold must be finite/,
  );
});

// ---------------------------------------------------------------------------
// Weight override
// ---------------------------------------------------------------------------

test('custom weights override defaults', () => {
  const defaultR = computeU({ verifiedEvidenceCount: 10 });
  const customR = computeU({ verifiedEvidenceCount: 10 }, { iota: 1.0 });
  assert.notEqual(defaultR.result.U, customR.result.U);
  // saturating credit: -iota·log1p(10) with iota=1.0 (not the old linear -10).
  assert.ok(Math.abs(customR.result.contributions.verifiedEvidenceCredit - (-1.0 * Math.log1p(10))) < 1e-6);
});

test('weight overrides must be finite, non-negative, and known', () => {
  assert.throws(() => computeU({}, { eta: -1 }), /weight eta must be non-negative/);
  assert.throws(() => computeU({}, { alpha: Number.NaN }), /weight alpha must be finite/);
  assert.throws(() => computeU({}, { bogus: 1 }), /unknown yuri-energy weight: bogus/);
});

// ---------------------------------------------------------------------------
// Integration: realistic state trace
// ---------------------------------------------------------------------------

test('realistic trace: 3-step descent through claim verification', () => {
  // Initial state: lots of unverified claims, no protected violations.
  const s0 = {
    claimPromotionDistribution: { draft: 8, research: 6, fixture_ready: 2 },
    claimedDistribution: [0.5, 0.3, 0.2],
    verifiedDistribution: [0.2, 0.3, 0.5],
    verifiedEvidenceCount: 5,
  };
  // Step 1: one claim moves draft → research.
  const s1 = {
    ...s0,
    claimPromotionDistribution: { draft: 7, research: 7, fixture_ready: 2 },
    verifiedEvidenceCount: 6,
  };
  // Step 2: claim and verified distributions converge.
  const s2 = {
    ...s1,
    claimedDistribution: [0.3, 0.3, 0.4],
    verifiedEvidenceCount: 8,
  };

  const u0 = computeU(s0).result.U;
  const u1 = computeU(s1).result.U;
  const u2 = computeU(s2).result.U;

  assert.ok(u2 < u0, 'trace must descend overall');
  // Each step must not ascend (Lyapunov property at the macro level).
  assert.ok(u1 <= u0 || Math.abs(u1 - u0) < 0.5, 'step 1 should not materially ascend');
  assert.ok(u2 < u1, 'step 2 must descend (KL drops)');
});

test('CLI worked example proves one accepted descent and one rejected protected-path ascent', () => {
  const output = execFileSync(process.execPath, [SCRIPT, '--worked-example'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.scenarioA_descent.accept, true);
  assert.ok(parsed.scenarioA_descent.deltaU < 0);
  assert.equal(parsed.scenarioB_ascent_protected_path.accept, false);
  assert.equal(parsed.scenarioB_ascent_protected_path.dominantTerm, 'protectedPathViolations');
});

// --- Phase-3 wave regressions (math-base fix 2026-06-10) ---

test('evalWasserstein fail-closed: non-finite / negative / zero-mass distributions are MAXIMAL drift, never 0', () => {
  // W₁ cannot self-saturate (no log, no zero-in-denominator), so a poisoned distribution would otherwise
  // score a MODEST W₁ → fail-OPEN. distributionPoisoned forces it to the support ceiling (n-1) instead —
  // the un-saturatable term's only line between garbage and a laundered accept (NOT KL's 27.63, which
  // would contaminate the calibration percentile scale; the ceiling is in-band with the worst real drift).
  for (const poison of [[Infinity, Infinity], [NaN, 1], [-1, -1], [0, 0]]) {
    const g = gateProposal({
      stateBefore: { claimedDistribution: [0.5, 0.5], verifiedDistribution: [0.5, 0.5] },
      stateAfter: { claimedDistribution: poison, verifiedDistribution: [0.5, 0.5] },
    });
    assert.equal(g.result.accept, false, `poison ${poison} must reject`);
    // sentinel = support ceiling (n-1 = 1 on a 2-rung support); contributes β·1 over a β·0 baseline.
    assert.equal(g.result.componentDeltas.wasserstein, DEFAULT_WEIGHTS.beta * 1, `poison ${poison} is maximal drift (ceiling), not a laundered small value`);
  }
  // Negative control: finite-tiny-WITH-real-mass [1e-15, 1] is NOT poison (the 1 carries mass) → it takes
  // the NORMALIZE path, yielding a normal sub-ceiling W₁ (≈0.5 rung), distinct from the poison ceiling.
  const ctrl = gateProposal({
    stateBefore: { claimedDistribution: [0.5, 0.5], verifiedDistribution: [0.5, 0.5] },
    stateAfter: { claimedDistribution: [1e-15, 1], verifiedDistribution: [0.5, 0.5] },
  });
  assert.ok(Number.isFinite(ctrl.result.deltaU), 'control deltaU finite');
  assert.ok(Math.abs(ctrl.result.componentDeltas.wasserstein - DEFAULT_WEIGHTS.beta * 0.5) < 1e-9, 'real mass takes the normalize path (≈0.5-rung W₁), not the poison ceiling');
});

test('gateProposal proof.lyapunovProperty keys on ΔU sign, not on accept', () => {
  const g = gateProposal({ stateBefore: {}, stateAfter: { predictions: [0.9], outcomes: [0] }, threshold: 100 });
  assert.equal(g.result.accept, true);
  assert.ok(g.result.deltaU > 0);
  assert.equal(g.proof.lyapunovProperty, 'ascending');
});

// =====================================================================
// Wasserstein-1 drift term (energyFormulaVersion 3) — unit invariants.
// =====================================================================

const oh = (i, n = 6) => { const v = new Array(n).fill(0); v[i] = 1; return v; };

test('W₁ — two one-hots: W₁(i,j) = |i−j| exactly (the ordinal-distance identity)', () => {
  for (const [i, j] of [[0, 0], [0, 1], [2, 5], [5, 0], [1, 4]]) {
    assert.equal(wasserstein1(oh(i), oh(j)), Math.abs(i - j), `W₁(oneHot ${i}, oneHot ${j}) must be |i−j|`);
  }
});

test('W₁ — DISTANCE-AWARE + strictly monotone in rung gap (the whole point; KL was flat)', () => {
  const v = oh(0);
  let prev = -1;
  for (let j = 0; j <= 5; j += 1) {
    const d = wasserstein1(oh(j), v);
    assert.equal(d, j, `gap ${j} → W₁=${j}`);
    assert.ok(d > prev, 'strictly increasing with rung distance');
    prev = d;
  }
  // 5-rung gap costs strictly more than a 1-rung gap (KL saturated both to the same value).
  assert.ok(wasserstein1(oh(5), v) > wasserstein1(oh(1), v));
});

test('W₁ — same-rung is exactly 0; symmetric; bounded by N−1', () => {
  assert.equal(wasserstein1(oh(3), oh(3)), 0);
  assert.equal(wasserstein1(oh(1), oh(4)), wasserstein1(oh(4), oh(1)));
  assert.equal(wasserstein1(oh(0), oh(5)), 5); // = N−1, the ceiling
});

test('W₁ — multimodal (bimodal claimed) is honored, no collapse', () => {
  // half the mass 2 rungs off, half 5 rungs off, vs evidence at rung 0.
  const claimed = [0, 0, 0.5, 0, 0, 0.5];
  const verified = oh(0);
  // EMD = Σ_{k=0..4}|CDF_c(k) − CDF_v(k)|: CDF_c=[0,0,.5,.5,.5], CDF_v=[1,1,1,1,1]
  // = 1 + 1 + .5 + .5 + .5 = 3.5  (the two modes contribute by their distance, not collapsed to one)
  assert.ok(Math.abs(wasserstein1(claimed, verified) - 3.5) < 1e-9, 'bimodal mass averaged by distance, not collapsed');
});

test('evalWasserstein — normalizes unnormalized inputs (W₁ ∈ [0, N−1])', () => {
  const r = evalWasserstein({ claimed: [0, 0, 0, 0, 0, 2], verified: [3, 0, 0, 0, 0, 0] }); // raw counts
  assert.equal(r.skipped, false);
  assert.ok(Math.abs(r.value - 5) < 1e-9, 'normalized one-hots at the extremes → W₁=5');
});

test('evalWasserstein — POISON forces the support ceiling (n−1), never a laundered small value', () => {
  for (const poison of [[Infinity, 0, 0, 0, 0, 0], [NaN, 1, 0, 0, 0, 0], [-1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]) {
    const r = evalWasserstein({ claimed: poison, verified: oh(0) });
    assert.equal(r.skipped, false, 'poison must not skip (skip → 0 contribution → fail-open)');
    assert.equal(r.value, 5, 'poison = support ceiling n−1 = 5 (maximal drift)');
  }
});

test('evalWasserstein — length mismatch = maximal drift over the widest declared support', () => {
  const r = evalWasserstein({ claimed: [0.1, 0.9, 0], verified: [0.5, 0.5] });
  assert.equal(r.skipped, false);
  assert.equal(r.value, 2, 'span = max(3,2) − 1');
});

// =====================================================================
// Overconfidence-coupling term (μ) — closes the W₁ confidence-blind residual.
// =====================================================================

test('claimedConcentration — uniform→0, one-hot→1, bimodal→partial, poison/degenerate→1 (fail-closed)', () => {
  assert.ok(Math.abs(claimedConcentration(new Array(6).fill(1 / 6)) - 0) < 1e-9, 'uniform = 0');
  assert.equal(claimedConcentration(oh(2)), 1, 'one-hot = 1');
  const bimodal = claimedConcentration([0.5, 0, 0, 0, 0, 0.5]); // H=ln2, conc=1−ln2/ln6
  assert.ok(Math.abs(bimodal - (1 - Math.log(2) / Math.log(6))) < 1e-9, 'bimodal = 1−ln2/ln6 ≈ 0.613 (NOT collapsed to 0/1)');
  assert.equal(claimedConcentration([NaN, 0, 0, 0, 0, 1]), 1, 'poison → 1 (fail-closed)');
  assert.equal(claimedConcentration([0, 0, 0, 0, 0, 0]), 1, 'zero-mass → 1');
  assert.equal(claimedConcentration([1]), 1, 'degenerate len<2 → 1 (avoids 1−H/ln(1)=0/0)');
  // bounded for any valid input
  for (const v of [[0.2, 0.8], [0.9, 0.05, 0.05], [0.34, 0.33, 0.33]]) {
    const c = claimedConcentration(v);
    assert.ok(c >= 0 && c <= 1 && Number.isFinite(c), `conc∈[0,1] for ${v}`);
  }
});

test('μ — conc=1 for a one-hot claim → overconfidenceDrift == W₁ (full confidence)', () => {
  const r = evalOverconfidenceDrift({ claimed: oh(5), verified: oh(0) });
  assert.ok(Math.abs(r.value - 5) < 1e-9, 'oneHot(5) vs oneHot(0): conc=1, W₁=5 → 5');
});

test('μ — conc=0 for a UNIFORM claim → overconfidenceDrift == 0 (uncertain ≠ overconfident)', () => {
  const uniform = new Array(6).fill(1 / 6);
  const r = evalOverconfidenceDrift({ claimed: uniform, verified: oh(0) });
  assert.ok(Math.abs(r.value) < 1e-9, 'a uniform (max-entropy) claim is not overconfident → no coupling penalty even when drifted');
});

test('μ — confident+wrong > diffuse+wrong at the SAME drift (the whole point)', () => {
  const verified = oh(0);
  const confident = evalOverconfidenceDrift({ claimed: oh(3), verified }).value;      // conc=1
  const diffuse = evalOverconfidenceDrift({ claimed: [0.4, 0.2, 0.0, 0.4, 0.0, 0.0], verified }).value; // same-ish mean, lower conc
  assert.ok(confident > diffuse, 'a sharp drifted claim is penalized more than a diffuse one (confidence dimension restored)');
});

test('μ — confident but RIGHT (W₁=0) → 0 (no penalty for confident convergence)', () => {
  const r = evalOverconfidenceDrift({ claimed: oh(4), verified: oh(4) });
  assert.equal(r.value, 0, 'concentrated AND on-evidence is fine — only confident+wrong is penalized');
});

test('μ — POISON claimed forces max (conc=1 × ceiling W₁) — fail-closed', () => {
  const r = evalOverconfidenceDrift({ claimed: [NaN, 0, 0, 0, 0, 1], verified: oh(0) });
  assert.equal(r.skipped, false);
  assert.equal(r.value, 5, 'poison → conc=1, W₁=n−1 → 5 (maximal)');
});

test('μ — computeU wires overconfidenceDrift = w.mu · value (unrounded linear)', () => {
  const r = computeU({ claimedDistribution: oh(5), verifiedDistribution: oh(0) }).result;
  assert.ok(Math.abs(r.contributions.overconfidenceDrift - DEFAULT_WEIGHTS.mu * 5) < 1e-9, 'μ·5');
  assert.ok(Math.abs(r.contributions.wasserstein - DEFAULT_WEIGHTS.beta * 5) < 1e-9, 'β·5 (drift term unchanged)');
});

test('μ — LIVE-representative residual is CLOSED: 6-class entropy collapse + confident 1-rung drift REJECTS', () => {
  // The live feeder caps claim-promotion at the 6 ladder rungs → max entropy credit α·ln(6)=1.79.
  // A confident 1-rung drift: β·1.0 (=2.0) already > 1.79, and μ·conc·W₁ adds more → firm reject with margin.
  const before = {
    claimPromotionDistribution: { draft: 1, research: 1, fixture_ready: 1, runtime_tested: 1, operator_validated: 1, trusted: 1 },
    claimedDistribution: oh(0), verifiedDistribution: oh(0),
  };
  const after = {
    claimPromotionDistribution: { draft: 6 }, // full collapse to one rung (max entropy credit on a 6-class dist)
    claimedDistribution: oh(1), verifiedDistribution: oh(0), // confident 1-rung drift
  };
  const g = gateProposal({ stateBefore: before, stateAfter: after });
  assert.ok(g.result.deltaU > 0, `confident drift + max 6-class entropy collapse must REJECT, got ΔU=${g.result.deltaU}`);
  assert.equal(g.result.accept, false);
});
