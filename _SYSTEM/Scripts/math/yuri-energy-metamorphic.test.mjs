// Tests for yuri-energy-metamorphic.mjs — metamorphic-relation suite
// + coverage-fed fault-campaign runner for computeU.
// GREEN: every MR holds on the real computeU over the coverage-fed campaign.
// RED: every planted mutant is CAUGHT by >=1 MR (proves non-vacuity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runCampaign, runMutationCheck, METAMORPHIC_RELATIONS, MUTANTS,
  shrinkCounterexample, makeRng, genState,
} from './yuri-energy-metamorphic.mjs';

const TRIALS = 2000;
const MUTANT_TRIALS = 300;

test('GREEN: all metamorphic relations hold on real computeU across the campaign', () => {
  const { passed, results, totalChecks, totalViolations, totalErrors } = runCampaign({ numStates: TRIALS });

  // Every MR must have zero violations and zero errors
  const failed = results.filter((r) => r.violated > 0 || r.errors > 0);
  const details = failed.map((r) =>
    `${r.name} violated=${r.violated} errors=${r.errors} firstViolation=${JSON.stringify(r.firstViolation)} firstError=${JSON.stringify(r.firstError)}`,
  );

  assert.equal(passed, true, `MRs violated:\n${details.join('\n')}`);
  assert.equal(results.length, METAMORPHIC_RELATIONS.length);
  assert.ok(totalChecks > 0, 'campaign must exercise at least some checks');
  assert.equal(totalViolations, 0);
  assert.equal(totalErrors, 0);
});

test('GREEN: every MR exercised on diverse state shapes (coverage)', () => {
  const { coverage } = runCampaign({ numStates: TRIALS });

  for (const cov of coverage) {
    assert.ok(
      cov.shapesCovered.length > 0,
      `${cov.name} was never exercised on any state shape — campaign is structurally broken`,
    );
  }
});

test('GREEN: all eight MRs are present', () => {
  assert.equal(METAMORPHIC_RELATIONS.length, 8);
  const names = METAMORPHIC_RELATIONS.map((m) => m.name);
  assert.ok(names.some((n) => n.startsWith('MR-scale')));
  assert.ok(names.some((n) => n.startsWith('MR-permute')));
  assert.ok(names.some((n) => n.startsWith('MR-ceiling-idempotence')));
  assert.ok(names.some((n) => n.startsWith('MR-additivity')));
  assert.ok(names.some((n) => n.startsWith('MR-prediction-symmetry')));
  assert.ok(names.some((n) => n.startsWith('MR-drift-monotonicity')));
  assert.ok(names.some((n) => n.startsWith('MR-weight-isolation')), 'B2 behavioral replacement for MR-scale tautology');
  assert.ok(names.some((n) => n.startsWith('MR-term-completeness')), 'B2 linear-omission catcher');
});

test('RED: every planted mutant is caught by >=1 MR (non-vacuous)', () => {
  const { allCaught, report } = runMutationCheck({ numStates: MUTANT_TRIALS });
  const escaped = Object.entries(report)
    .filter(([, v]) => !v.caught)
    .map(([n]) => n);

  assert.equal(allCaught, true, `mutants escaped the suite: ${escaped.join(', ')}`);

  // Verify each mutant is caught by the MR class it targets
  for (const [name, result] of Object.entries(report)) {
    assert.ok(result.caught, `${name} was not caught`);
    assert.ok(result.violatedMRs.length > 0, `${name} caught by zero MRs`);

    if (name === 'scale-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-scale')),
        `scale-breaker not caught by MR-scale: ${result.violatedMRs}`,
      );
    }
    if (name === 'permute-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-permute')),
        `permute-breaker not caught by MR-permute: ${result.violatedMRs}`,
      );
    }
    if (name === 'ceiling-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-ceiling-idempotence')),
        `ceiling-breaker not caught by MR-ceiling-idempotence: ${result.violatedMRs}`,
      );
    }
    if (name === 'additivity-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-additivity')),
        `additivity-breaker not caught by MR-additivity: ${result.violatedMRs}`,
      );
    }
    if (name === 'prediction-symmetry-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-prediction-symmetry')),
        `prediction-symmetry-breaker not caught by MR-prediction-symmetry: ${result.violatedMRs}`,
      );
    }
    if (name === 'drift-monotonicity-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-drift-monotonicity')),
        `drift-monotonicity-breaker not caught by MR-drift-monotonicity: ${result.violatedMRs}`,
      );
    }
    // B2: the cross-wire breaker must be caught by MR-weight-isolation and NOT by MR-scale —
    // proving the behavioral MR sees a wiring bug the linear tautology is blind to (unique catcher).
    if (name === 'weight-isolation-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-weight-isolation')),
        `weight-isolation-breaker not caught by MR-weight-isolation: ${result.violatedMRs}`,
      );
      assert.ok(
        !result.violatedMRs.some((n) => n.startsWith('MR-scale')),
        `MR-scale should be BLIND to the cross-wire (it is gated on β=0, uniform-scaling-safe): ${result.violatedMRs}`,
      );
    }
    // B2: the unconditional-term drop must be caught by MR-term-completeness and NOT by MR-additivity
    // (U==Σ is preserved) — proving term-completeness is the load-bearing unique catcher.
    if (name === 'term-completeness-breaker') {
      assert.ok(
        result.violatedMRs.some((n) => n.startsWith('MR-term-completeness')),
        `term-completeness-breaker not caught by MR-term-completeness: ${result.violatedMRs}`,
      );
      assert.ok(
        !result.violatedMRs.some((n) => n.startsWith('MR-additivity')),
        `MR-additivity should be BLIND (both sides drop equally, U==Σ holds): ${result.violatedMRs}`,
      );
    }
  }
});

test('determinism: same seed reproduces the same campaign verdict', () => {
  const a = runCampaign({ numStates: 200, seed: 123 });
  const b = runCampaign({ numStates: 200, seed: 123 });
  assert.deepEqual(
    a.results.map((r) => ({ name: r.name, passed: r.passed, violated: r.violated })),
    b.results.map((r) => ({ name: r.name, passed: r.passed, violated: r.violated })),
  );
});

test('genState is well-formed and seed-stable', () => {
  const s = genState(makeRng(13));
  assert.ok(s.claimPromotionDistribution && typeof s.claimPromotionDistribution === 'object');
  assert.ok(Object.keys(s.claimPromotionDistribution).length >= 2);
  assert.ok(Array.isArray(s.claimedDistribution));
  assert.ok(Number.isInteger(s.protectedPathViolations));
  assert.ok(s.protectedPathViolations >= 0);
});

test('shrinkCounterexample shrinks without crashing on a known-good state', () => {
  // Use MR-permute on a simple state — the relation should hold
  const mr = METAMORPHIC_RELATIONS.find((m) => m.name.startsWith('MR-permute'));
  const state = {
    claimPromotionDistribution: { A: 0.2, B: 0.5, C: 0.3 },
    claimedDistribution: [0.3, 0.3, 0.4],
    verifiedDistribution: [0.4, 0.3, 0.3],
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
    verifiedEvidenceCount: 0,
  };
  const transformed = mr.transform(state, makeRng(0));
  const shrunk = shrinkCounterexample(mr, state, transformed, { maxIter: 20 });
  assert.ok(typeof shrunk.originalSize === 'number');
  assert.ok(typeof shrunk.shrunkSize === 'number');
  assert.ok(shrunk.shrunkSize <= shrunk.originalSize);
  assert.ok(shrunk.shrunk.sourceState);
});