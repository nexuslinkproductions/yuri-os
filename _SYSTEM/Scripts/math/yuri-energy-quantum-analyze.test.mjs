#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOFT_COMPONENTS, recordContribVector, orderEffectTest, pairCoupling, weightCouplingTest,
} from './yuri-energy-quantum-analyze.mjs';
import { DEFAULT_WEIGHTS } from './energy-calibration-contract.mjs';

// Build a record whose recovered basis for a component equals the given value:
// contribution = basis * weight (linear terms); reconstruction recovers basis = contribution/weight.
const W = DEFAULT_WEIGHTS;
function rec(bases, decision = 'reject') {
  const contrib = {};
  if ('klDivergence' in bases) contrib.klDivergence = bases.klDivergence * W.beta;     // linear
  if ('staleness' in bases) contrib.staleness = bases.staleness * W.zeta;              // linear
  if ('logLoss' in bases) contrib.logLoss = bases.logLoss * W.gamma;                   // linear
  if ('repeatedFailure' in bases) contrib.repeatedFailure = bases.repeatedFailure * W.kappa;
  return { componentContributions: contrib, weights: W, decision };
}

test('SOFT_COMPONENTS = the 9 soft (non-barrier) components', () => {
  assert.equal(SOFT_COMPONENTS.length, 9);
  assert.ok(!SOFT_COMPONENTS.includes('protectedPathViolations'));
  assert.ok(!SOFT_COMPONENTS.includes('promotionLadderInversions'));
  assert.ok(SOFT_COMPONENTS.includes('klDivergence'));
});

test('recordContribVector recovers soft basis; absent component → 0', () => {
  const v = recordContribVector(rec({ klDivergence: 1.5 }));
  assert.equal(v.klDivergence, 1.5);
  assert.equal(v.staleness, 0); // absent contribution → 0
});

test('orderEffectTest: faithful commuting QQ ≈ 0; contrast has power; no order-effect on synthetic data', () => {
  // synthetic records with no temporal order structure
  const records = [];
  for (let i = 0; i < 40; i++) {
    records.push(rec({ klDivergence: i % 5, staleness: (i * 3) % 7 }, i % 2 ? 'reject' : 'accept'));
  }
  const r = orderEffectTest(records);
  assert.equal(r.skipped, false);
  assert.equal(r.faithfulCommuting, true, `faithful commuting model must give identical joints (orderEffect ~0), got ${r.faithfulOrderEffect}`);
  assert.ok(r.faithfulOrderEffect < 1e-9);
  assert.equal(r.qqConsistent, true, `Wang-Busemeyer QQ must be ~0 for the quantum machinery, got ${r.qqStatistic}`);
  assert.equal(r.hasPower, true, 'canonical non-commuting check must show the instrument detects order-effects');
  assert.ok(Math.abs(r.powerOrderEffect - 0.25) < 1e-9, `power check should be 0.25, got ${r.powerOrderEffect}`);
  assert.equal(r.classicalAsymmetry, 0, 'classical Bayes is order-blind by construction');
});

test('pairCoupling: independent components are NOT significant vs the permutation null', () => {
  // klDivergence and staleness vary INDEPENDENTLY (different cycles) → observed ratio sits
  // inside the shuffled-null distribution → not significant (no data-driven coupling).
  const records = [];
  for (let i = 0; i < 80; i++) {
    records.push(rec({ klDivergence: (i % 4) + 1, staleness: (Math.floor(i / 4) % 4) + 1 }));
  }
  const c = pairCoupling(records, 'klDivergence', 'staleness', { bins: 4, permutations: 80, seed: 3 });
  assert.equal(c.degenerate, false);
  assert.equal(c.significant, false, `independent components must NOT be null-significant, p=${c.pValue}`);
});

test('pairCoupling: perfectly correlated components ARE significant vs the permutation null', () => {
  // staleness === klDivergence exactly → observed ratio far exceeds the shuffled null.
  const records = [];
  for (let i = 0; i < 80; i++) {
    const x = (i % 4) + 1;
    records.push(rec({ klDivergence: x, staleness: x }));
  }
  const c = pairCoupling(records, 'klDivergence', 'staleness', { bins: 4, permutations: 80, seed: 3 });
  assert.equal(c.degenerate, false);
  assert.equal(c.significant, true, `perfectly correlated components must be null-significant, p=${c.pValue}, obs=${c.observedRatio}, cutoff=${c.nullCutoff}`);
  assert.ok(c.pValue < 0.05);
});

test('pairCoupling: a constant (no-variance) component is degenerate → not significant', () => {
  const records = [];
  for (let i = 0; i < 20; i++) records.push(rec({ klDivergence: (i % 4) + 1, staleness: 2 }));
  const c = pairCoupling(records, 'klDivergence', 'staleness', { bins: 4, permutations: 40 });
  assert.equal(c.degenerate, true);
  assert.equal(c.significant, false);
});

test('weightCouplingTest aggregate: robustly-coupled set (bin-stable + null-significant) + D6 recommendation', () => {
  const records = [];
  for (let i = 0; i < 80; i++) {
    const x = (i % 4) + 1;
    records.push(rec({ klDivergence: x, staleness: x, logLoss: (Math.floor(i / 4) % 4) + 1 }));
  }
  const out = weightCouplingTest(records, { binsSweep: [3, 4], permutations: 60, seed: 3 });
  assert.ok(Array.isArray(out.pairs) && out.pairs.length >= 1);
  assert.ok(typeof out.d6Recommendation === 'string');
  // pairs are ranked by effect size; beta~zeta (klDivergence~staleness) is perfectly
  // correlated → must be the TOP-ranked pair, bin-stable significant, with the largest ratio.
  const bz = out.pairs.find((p) => p.weightA === 'beta' && p.weightB === 'zeta');
  assert.ok(bz, 'beta~zeta pair must be present');
  assert.equal(bz.binStableSignificant, true);
  assert.equal(out.pairs[0].weightA + '~' + out.pairs[0].weightB, 'beta~zeta', 'beta~zeta must rank #1 by effect size');
  assert.ok(out.maxMedianRatio > 0);
});
