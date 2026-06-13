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
  for (const key of ['entropy', 'klDivergence', 'logLoss', 'brier', 'informationGain', 'staleness']) {
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

test('staleness component skips when all evidence items are malformed', () => {
  const r = computeU({
    evidence: [
      { base: 2, age: 10, halfLife: 30 },
      { base: 0.8, age: -1, halfLife: 30 },
    ],
  });
  assert.equal(r.result.components.staleness.skipped, true);
  assert.equal(r.result.components.staleness.reason, 'all evidence items malformed');
  assert.equal(r.result.components.staleness.warnings.length, 2);
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

test('evalKL fail-closed: non-finite / negative / zero-mass distributions are maximal drift, never 0', () => {
  for (const poison of [[Infinity, Infinity], [NaN, 1], [-1, -1], [0, 0]]) {
    const g = gateProposal({
      stateBefore: { claimedDistribution: [0.5, 0.5], verifiedDistribution: [0.5, 0.5] },
      stateAfter: { claimedDistribution: poison, verifiedDistribution: [0.5, 0.5] },
    });
    assert.equal(g.result.accept, false, `poison ${poison} must reject`);
    assert.ok(g.result.componentDeltas.klDivergence > 50, `poison ${poison} is maximal drift`);
  }
  // Negative control: finite-tiny-with-real-mass takes the CLAMP path, not the poison path.
  const clamped = gateProposal({
    stateBefore: { claimedDistribution: [0.5, 0.5], verifiedDistribution: [0.5, 0.5] },
    stateAfter: { claimedDistribution: [1e-15, 1], verifiedDistribution: [0.5, 0.5] },
  });
  assert.ok(Number.isFinite(clamped.result.deltaU) && Math.abs(clamped.result.componentDeltas.klDivergence - 55.262042231857) > 1, 'real mass stays on the clamp path');
});

test('gateProposal proof.lyapunovProperty keys on ΔU sign, not on accept', () => {
  const g = gateProposal({ stateBefore: {}, stateAfter: { predictions: [0.9], outcomes: [0] }, threshold: 100 });
  assert.equal(g.result.accept, true);
  assert.ok(g.result.deltaU > 0);
  assert.equal(g.proof.lyapunovProperty, 'ascending');
});
