/**
 * quantum-hypothesis-tracker.test.mjs
 *
 * Five deterministic tests for the quantum hypothesis tracker:
 *   1. Reduction theorem  — commuting projectors reproduce Bayes exactly
 *   2. Order effects      — non-commuting projectors swap posteriors by order
 *   3. QQ equality         — Wang & Busemeyer 2013 invariant holds
 *   4. Schmidt rank        — product state rank 1, entangled state rank > 1
 *   5. Bayes baseline      — hand-computed posterior matches library output
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stateVector, projector, diagonalProjector,
  hypothesisPosteriors, qqEquality,
  schmidtDecomposition, bayesPosterior, bayesSequential,
} from './quantum-hypothesis-tracker.mjs';

// ── helpers ────────────────────────────────────────────────────
const SQRT3_2 = Math.sqrt(3) / 2;
const closeTo = (a, b, tol = 1e-10) => Math.abs(a - b) < tol;

// ═══════════════════════════════════════════════════════════════
// Test 1 — Reduction theorem: commuting projectors === Bayes
// ═══════════════════════════════════════════════════════════════
test('reduction theorem: commuting projectors reproduce Bayes posterior', () => {
  // ℝ³, three hypotheses as basis vectors
  const P_H1 = projector([1, 0, 0]);
  const P_H2 = projector([0, 1, 0]);
  const P_H3 = projector([0, 0, 1]);

  // Equal superposition |ψ⟩ = (1/√3)(|H1⟩ + |H2⟩ + |H3⟩)
  const psi = stateVector([1, 1, 1]);

  // Commuting (diagonal) evidence: E1 selects {H1,H2}, E2 selects {H1,H3}
  const E1 = diagonalProjector([1, 1, 0]);
  const E2 = diagonalProjector([1, 0, 1]);

  const quantum = hypothesisPosteriors(psi, [P_H1, P_H2, P_H3], [E1, E2]);

  // Classical Bayes: same priors, matching likelihoods
  const classical = bayesSequential([1 / 3, 1 / 3, 1 / 3], [[1, 1, 0], [1, 0, 1]]);

  // Quantum posterior must be (1, 0, 0) and match Bayes exactly
  for (let i = 0; i < 3; i++) {
    assert.ok(
      closeTo(quantum[i], classical[i]),
      `H${i + 1}: quantum=${quantum[i]}, classical=${classical[i]}`
    );
  }
  assert.ok(closeTo(quantum[0], 1), 'P(H1|E1,E2) = 1');
  assert.ok(closeTo(quantum[1], 0), 'P(H2|E1,E2) = 0');
  assert.ok(closeTo(quantum[2], 0), 'P(H3|E1,E2) = 0');
});

// ═══════════════════════════════════════════════════════════════
// Test 2 — Non-commuting projectors produce order effects
// ═══════════════════════════════════════════════════════════════
test('non-commuting projectors produce order effects', () => {
  const psi = stateVector([1, 0]);
  const P_H1 = projector([1, 0]);
  const P_H2 = projector([0, 1]);

  // A: projects onto (cos30°, sin30°) = (√3/2, 1/2)
  const P_A = projector([SQRT3_2, 0.5]);
  // B: projects onto (cos60°, sin60°) = (1/2, √3/2)
  const P_B = projector([0.5, SQRT3_2]);

  // Condition on both questions answered "yes"
  const postAB = hypothesisPosteriors(psi, [P_H1, P_H2], [P_A, P_B]);
  const postBA = hypothesisPosteriors(psi, [P_H1, P_H2], [P_B, P_A]);

  // Expected (hand-derived):
  //   A→B: post-state collapses to v_B → P(H1)=1/4, P(H2)=3/4
  //   B→A: post-state collapses to v_A → P(H1)=3/4, P(H2)=1/4
  assert.ok(closeTo(postAB[0], 0.25), `P(H1|A→B)=${postAB[0]}`);
  assert.ok(closeTo(postAB[1], 0.75), `P(H2|A→B)=${postAB[1]}`);
  assert.ok(closeTo(postBA[0], 0.75), `P(H1|B→A)=${postBA[0]}`);
  assert.ok(closeTo(postBA[1], 0.25), `P(H2|B→A)=${postBA[1]}`);

  // The order effect: posteriors differ
  assert.ok(!closeTo(postAB[0], postBA[0]), 'posteriors must differ by order');
});

// ═══════════════════════════════════════════════════════════════
// Test 3 — QQ equality (Wang & Busemeyer 2013)
// ═══════════════════════════════════════════════════════════════
test('QQ equality holds for the 2D quantum model', () => {
  const psi = stateVector([1, 0]);
  const P_A = projector([SQRT3_2, 0.5]);
  const P_B = projector([0.5, SQRT3_2]);

  const qq = qqEquality(psi, P_A, P_B);

  // QQ statistic ≈ 0 (proven analytically: S_AB = S_BA for any quantum model)
  assert.ok(
    closeTo(qq.qqStatistic, 0, 1e-12),
    `QQ statistic should be ≈ 0, got ${qq.qqStatistic}`
  );

  // Verify against hand-computed values
  assert.ok(closeTo(qq.p_AyBn, 3 / 16), `p_AyBn=${qq.p_AyBn}`);
  assert.ok(closeTo(qq.p_AnBy, 1 / 16), `p_AnBy=${qq.p_AnBy}`);
  assert.ok(closeTo(qq.p_ByAn, 1 / 16), `p_ByAn=${qq.p_ByAn}`);
  assert.ok(closeTo(qq.p_BnAy, 3 / 16), `p_BnAy=${qq.p_BnAy}`);

  // Individual probabilities differ by order (order effects exist)
  assert.ok(!closeTo(qq.p_AyBn, qq.p_ByAn), 'disagreement probs differ by order');
});

// ═══════════════════════════════════════════════════════════════
// Test 4 — Schmidt rank detects product vs entangled states
// ═══════════════════════════════════════════════════════════════
test('Schmidt rank: product → 1, entangled → >1', () => {
  // Product state |0⟩⊗|1⟩ = (0, 1, 0, 0) in ℝ⁴
  const product = [0, 1, 0, 0];
  const rp = schmidtDecomposition(product, 2, 2);
  assert.equal(rp.rank, 1, 'product state rank should be 1');
  assert.ok(closeTo(rp.singularValues[0], 1), 'leading SV = 1');
  assert.ok(closeTo(rp.singularValues[1], 0), 'trailing SV = 0');

  // Bell state (1/√2)(|00⟩ + |11⟩) = (1/√2, 0, 0, 1/√2)
  const s2 = 1 / Math.sqrt(2);
  const bell = [s2, 0, 0, s2];
  const rb = schmidtDecomposition(bell, 2, 2);
  assert.equal(rb.rank, 2, 'Bell state rank should be 2');
  for (const sv of rb.singularValues) {
    assert.ok(closeTo(sv, s2), `SV = ${sv}, expected 1/√2 ≈ ${s2}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// Test 5 — Classical Bayes baseline matches hand computation
// ═══════════════════════════════════════════════════════════════
test('classical Bayes matches hand-computed posterior', () => {
  // Single-step: prior (0.4, 0.6), likelihood (0.8, 0.3)
  // → posterior (0.32/0.50, 0.18/0.50) = (0.64, 0.36)
  const post = bayesPosterior([0.4, 0.6], [0.8, 0.3]);
  assert.ok(closeTo(post[0], 0.64), `post[0]=${post[0]}`);
  assert.ok(closeTo(post[1], 0.36), `post[1]=${post[1]}`);

  // Sequential: (0.4·0.8·0.9, 0.6·0.3·0.5) = (0.288, 0.09)
  // → posterior (0.288/0.378, 0.09/0.378) = (16/21, 5/21)
  const seqPost = bayesSequential([0.4, 0.6], [[0.8, 0.3], [0.9, 0.5]]);
  assert.ok(closeTo(seqPost[0], 16 / 21), `seq[0]=${seqPost[0]}, expected ${16 / 21}`);
  assert.ok(closeTo(seqPost[1], 5 / 21), `seq[1]=${seqPost[1]}, expected ${5 / 21}`);
});
