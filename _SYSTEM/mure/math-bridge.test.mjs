// MURE math-bridge — red/grey/green over the live math-layer cross-reference.
// GREEN: each wrapper returns the right shape + an obviously-correct verdict.
// RED:   degenerate inputs fail soft (empty, commuting projectors, non-protected path).
// GREY:  metamorphic (option-order invariance, monotone shift), determinism, and independent-oracle checks
//        against the underlying formula (robustScore == 0.5*mean+0.5*CVaR; orderEffect matches a hand calc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreOptions, bestOption, orderEffect, robustnessRadius, governanceVeto, salienceTier, normalizeOptions, TIER,
} from './math-bridge.mjs';

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: scoreOptions ranks the clearly-better, lower-uncertainty option first', () => {
  const r = scoreOptions([{ id: 'good', score: 0.85, uncertainty: 0.05 }, { id: 'bad', score: 0.6, uncertainty: 0.3 }]);
  assert.equal(r.best.id, 'good');
  assert.equal(r.ranked.length, 2);
  assert.ok(Number.isFinite(r.ranked[0].robust));
});

test('GREEN: orderEffect detects a real order effect on non-commuting projectors', () => {
  const oe = orderEffect({ dim: 2 });
  assert.equal(oe.orderSensitive, true);
  assert.notEqual(oe.jointAB, oe.jointBA);
});

test('GREEN: governanceVeto flags a protected path; salienceTier tiers correctly', () => {
  assert.equal(governanceVeto({ filePath: '.env', isMutating: true }).veto, true);
  assert.equal(salienceTier({ filePath: '.env', isMutating: true, tool: 'Write' }), TIER.CRITICAL);
  assert.equal(salienceTier({ tool: 'Read', filePath: 'foo.txt' }), TIER.SKIP);
});

test('GREEN: robustnessRadius separates a strong option from a weak one', () => {
  assert.equal(robustnessRadius({ id: 's', score: 0.7, uncertainty: 0.1 }).robust, true);
  assert.equal(robustnessRadius({ id: 'w', score: 0.05, uncertainty: 0.4 }).robust, false);
});

// ── RED ───────────────────────────────────────────────────────────────────
test('RED: scoreOptions([]) returns empty, no throw', () => {
  const r = scoreOptions([]);
  assert.equal(r.best, null);
  assert.equal(r.ranked.length, 0);
});

test('RED: commuting projectors (A == B) show NO order effect', () => {
  const oe = orderEffect({ psi: [1, 0], vecA: [1, 0], vecB: [1, 0] });
  assert.equal(oe.orderSensitive, false);
  assert.equal(oe.jointAB, oe.jointBA);
});

test('RED: a non-protected path is not vetoed', () => {
  assert.equal(governanceVeto({ filePath: '_SYSTEM/mure/foo.mjs', isMutating: true }).veto, false);
});

// ── GREY ───────────────────────────────────────────────────────────────────
test('GREY (order-invariance): ranking is invariant to input option order', () => {
  const opts = [{ id: 'a', score: 0.8, uncertainty: 0.1 }, { id: 'b', score: 0.7, uncertainty: 0.1 }, { id: 'c', score: 0.6, uncertainty: 0.2 }];
  const fwd = scoreOptions(opts).ranked.map((r) => r.id);
  const rev = scoreOptions([...opts].reverse()).ranked.map((r) => r.id);
  assert.deepEqual(fwd, rev);
});

test('GREY (determinism): same seed → identical robust scores', () => {
  const o = [{ id: 'x', score: 0.5, uncertainty: 0.2 }];
  assert.deepEqual(scoreOptions(o, { seed: 7 }), scoreOptions(o, { seed: 7 }));
});

test('GREY (monotone shift): adding a constant to all means preserves the ranking', () => {
  const base = [{ id: 'a', score: 0.5, uncertainty: 0.1 }, { id: 'b', score: 0.4, uncertainty: 0.1 }];
  const shifted = base.map((o) => ({ ...o, score: o.score + 0.2 }));
  assert.deepEqual(scoreOptions(base).ranked.map((r) => r.id), scoreOptions(shifted).ranked.map((r) => r.id));
});

test('GREY (independent oracle): zero-uncertainty robust score equals the mean (0.5·mean+0.5·CVaR, CVaR=mean)', () => {
  const r = scoreOptions([{ id: 'flat', score: 0.62, uncertainty: 0 }]);
  assert.ok(Math.abs(r.best.robust - 0.62) < 1e-6, `robust ${r.best.robust} ~= 0.62`);
});

test('GREY (oracle, hand calc): orderEffect(|0>, A=|0>, B=|+>) → jointAB=0.5, jointBA=0.25', () => {
  const oe = orderEffect({ psi: [1, 0], vecA: [1, 0], vecB: [1, 1] });
  assert.ok(Math.abs(oe.jointAB - 0.5) < 1e-6, `jointAB ${oe.jointAB}`);
  assert.ok(Math.abs(oe.jointBA - 0.25) < 1e-6, `jointBA ${oe.jointBA}`);
});

test('GREY (normalize robustness): mixed option encodings normalize to {id,mean,sd}', () => {
  const n = normalizeOptions([0.5, { id: 'x', value: 0.7, risk: 0.2 }, { score: 0.3 }]);
  assert.equal(n[0].mean, 0.5);
  assert.equal(n[1].mean, 0.7);
  assert.equal(n[1].sd, 0.2);
  assert.equal(n[2].id, 'opt2'); // auto-id
});

test('GREY (bestOption agrees with scoreOptions head)', () => {
  const o = [{ id: 'a', score: 0.9, uncertainty: 0.05 }, { id: 'b', score: 0.5, uncertainty: 0.5 }];
  assert.equal(bestOption(o).id, scoreOptions(o).ranked[0].id);
});
