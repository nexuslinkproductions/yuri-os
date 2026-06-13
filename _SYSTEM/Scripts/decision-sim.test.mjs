#!/usr/bin/env node
/**
 * Tests for decision-sim.mjs — verify each Tier-1 method on a TOY problem with a known answer.
 * Run: node --test _SYSTEM/Scripts/decision-sim.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRng, halton, robustScore, crossEntropyOptimize, minimaxRegret, pgdWitness, infoGapHorizon, multiverse,
} from './decision-sim.mjs';

// TOY: strategy A dominates B dominates C; continuous x helps a little; noise is the uncertainty.
const TOY = {
  name: 'toy',
  discrete: { strategy: ['A', 'B', 'C'] },
  continuous: { x: [0, 1] },
  paramSpace: { noise: [0, 1] },
  sampleParams: (rng) => ({ noise: rng() }),
  value: (c, p) => (c.strategy === 'A' ? 1.0 : c.strategy === 'B' ? 0.6 : 0.3) + (c.x || 0) * 0.1 - p.noise * 0.2,
  nullValue: () => 0.55, // constant baseline: A & B beat it on average, C does not
};

test('makeRng is reproducible; halton is low-discrepancy in [0,1)', () => {
  const a = makeRng(42); const b = makeRng(42);
  assert.equal(a(), b(), 'same seed → same stream');
  for (let i = 1; i < 20; i += 1) { const h = halton(i, 2); assert.ok(h >= 0 && h < 1); }
});

test('crossEntropyOptimize converges to the dominant strategy A with high confidence', () => {
  const { best, confidence } = crossEntropyOptimize(TOY, { iters: 25, pop: 120, draws: 120, seed: 3 });
  assert.equal(best.strategy, 'A');
  assert.ok(best.x > 0.6, `x should push high, got ${best.x.toFixed(2)}`);
  assert.equal(confidence.strategy.choice, 'A');
  assert.ok(confidence.strategy.mass > 0.7, `optimizer confidence in A should be high, got ${confidence.strategy.mass}`);
});

test('minimaxRegret picks the dominant strategy', () => {
  const configs = ['A', 'B', 'C'].map((strategy) => ({ strategy, x: 1 }));
  const { winner, ranked } = minimaxRegret(TOY, configs, { draws: 300 });
  assert.equal(winner.config.strategy, 'A');
  assert.equal(ranked[ranked.length - 1].config.strategy, 'C', 'C has the worst max-regret');
});

test('pgdWitness: A robustly beats NULL; C does not (witness found)', () => {
  const A = pgdWitness(TOY, { strategy: 'A', x: 1 }, { restarts: 6, steps: 30 });
  assert.equal(A.robust, true, `A should beat null everywhere (margin ${A.margin})`);
  const C = pgdWitness(TOY, { strategy: 'C', x: 0 }, { restarts: 6, steps: 30 });
  assert.equal(C.robust, false, 'C should lose to null somewhere');
  assert.ok(C.margin < 0, `C witness margin should be negative, got ${C.margin}`);
});

test('infoGapHorizon: A survives a wide horizon; C flips early', () => {
  const A = infoGapHorizon(TOY, { strategy: 'A', x: 1 }, { nominal: { noise: 0.5 }, draws: 150 });
  const C = infoGapHorizon(TOY, { strategy: 'C', x: 1 }, { nominal: { noise: 0.5 }, draws: 150 });
  // A's mean margin (≈1.05−0.55=0.5) never flips within α≤1; C's (≈0.4−0.55<0) flips immediately.
  assert.equal(A.flipped, false, 'A should survive the full horizon');
  assert.ok(C.horizon <= A.horizon, 'C flips no later than A');
});

test('multiverse: dominant winner is robust across spec variants', () => {
  const variants = [
    { label: 'noise-heavier', patch: (p) => ({ ...p, value: (c, pr) => p.value(c, pr) - pr.noise * 0.1 }) },
    { label: 'x-irrelevant', patch: (p) => ({ ...p, value: (c, pr) => p.value({ ...c, x: 0 }, pr) }) },
    { label: 'baseline', patch: (p) => p },
  ];
  const pick = (p) => crossEntropyOptimize(p, { iters: 18, pop: 90, draws: 90, seed: 5 }).best;
  const { robustnessFraction, baseline } = multiverse(TOY, variants, pick, { keyDims: ['strategy'] });
  assert.equal(baseline.strategy, 'A');
  assert.equal(robustnessFraction, 1, 'A wins under every reasonable spec');
});

test('robustScore penalizes tail risk (CVaR) vs a pure-mean ranking', () => {
  // two configs, same mean, different tail: the lower-variance one scores higher under CVaR.
  const P = {
    discrete: { k: ['steady', 'swingy'] }, continuous: {},
    paramSpace: { u: [0, 1] }, sampleParams: (rng) => ({ u: rng() }),
    value: (c, p) => (c.k === 'steady' ? 0.5 : (p.u < 0.5 ? 0.9 : 0.1)), // same mean 0.5, swingy has fat tail
  };
  const steady = robustScore(P, { k: 'steady' }, { draws: 400, seed: 1 });
  const swingy = robustScore(P, { k: 'swingy' }, { draws: 400, seed: 1 });
  assert.ok(steady > swingy, `CVaR should prefer steady (${steady.toFixed(3)}) over swingy (${swingy.toFixed(3)})`);
});
