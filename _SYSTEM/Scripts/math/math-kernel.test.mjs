#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  astar,
  bayesUpdate,
  bregmanDivergence,
  brierScore,
  confidenceDecay,
  cosineSimilarity,
  crossEntropy,
  cusum,
  dijkstra,
  dotProduct,
  entropy,
  expectedValue,
  informationGain,
  klDivergence,
  lmsrIncrement,
  logLoss,
  logScale,
  makeMathResult,
  maxEntBelief,
  median,
  pearson,
  rankWithTies,
  mergeLaneEvidence,
  negEntropyPotential,
  normalizeDistribution,
  percentile,
  pNorm,
  scalarKalman,
  softmax,
  spearman,
  topologicalSort,
  weightedMean,
  weightedStdDev,
  weightedVariance,
} from './math-kernel.mjs';

const GRAPH = Object.freeze({
  directed: false,
  nodes: ['A', 'B', 'C', 'D', 'E', 'F'],
  edges: [
    { from: 'A', to: 'B', weight: 4 },
    { from: 'A', to: 'C', weight: 2 },
    { from: 'B', to: 'C', weight: 5 },
    { from: 'B', to: 'D', weight: 10 },
    { from: 'C', to: 'E', weight: 3 },
    { from: 'E', to: 'D', weight: 4 },
    { from: 'D', to: 'F', weight: 11 },
  ],
});

test('normalizes finite non-negative distributions', () => {
  assert.deepEqual(normalizeDistribution([2, 2, 4]), [0.25, 0.25, 0.5]);
  assert.throws(() => normalizeDistribution([0, 0]), /positive sum/);
  assert.throws(() => normalizeDistribution([1, -1]), /non-negative/);
});

// L4#7 (Codex kernel finding): aggregate overflow. 1e308-scale inputs saturate the
// internal sum/product to Infinity, which used to silently produce [0,...,0] from
// normalizeDistribution, 0 from entropy, NaN from weightedMean, and Infinity from
// mergeLaneEvidence. These aggregate primitives must fail closed on a non-finite
// intermediate, never emit overflow garbage.
test('aggregate primitives fail closed on 1e308-scale overflow instead of emitting garbage', () => {
  const MAX = 1e308; // MAX + MAX overflows to Infinity
  // normalizeDistribution: sum overflows -> must throw, not return [0,0,0].
  assert.throws(() => normalizeDistribution([MAX, MAX, MAX]), /non-finite|overflow/i);
  // entropy delegates to normalizeDistribution -> must throw, not return 0.
  assert.throws(() => entropy([MAX, MAX, MAX]), /non-finite|overflow/i);
  // weightedMean: Infinity/Infinity = NaN -> must throw, not return NaN.
  assert.throws(() => weightedMean([MAX, MAX], [MAX, MAX]), /non-finite|overflow/i);
  // mergeLaneEvidence independent product overflows -> must throw, not return Infinity/null.
  assert.throws(() => mergeLaneEvidence([MAX, MAX], [0.5, 0.5], 'independent'), /non-finite|overflow/i);
  // mergeLaneEvidence arbitrary routes through weightedMean; weights [1,1] make
  // the weighted numerator MAX*1+MAX*1 overflow -> must throw too.
  assert.throws(() => mergeLaneEvidence([MAX, MAX], [1, 1], 'arbitrary'), /non-finite|overflow/i);

  // OVER-FIX GUARD: legitimate small/normalized inputs are unaffected and still finite.
  assert.deepEqual(normalizeDistribution([2, 2, 4]), [0.25, 0.25, 0.5]);
  assert.equal(entropy([0.5, 0.5], { base: 2 }), 1);
  assert.equal(weightedMean([1, 2, 3], [0.2, 0.3, 0.5]), 2.3);
  assert.equal(mergeLaneEvidence([2, 3], [0.5, 0.5], 'independent').merged, 6);
  assert.equal(mergeLaneEvidence([4, 4, 4, 4], [0.25, 0.25, 0.25, 0.25], 'arbitrary').merged, 4);
});

test('computes logarithmic information primitives deterministically', () => {
  assert.equal(entropy([0.5, 0.5], { base: 2 }), 1);
  assert.equal(entropy([1, 0], { base: 2 }), 0);
  assert.ok(Math.abs(klDivergence([0.5, 0.5], [0.25, 0.75], { base: 2 }) - 0.207518749639422) < 1e-12);
  assert.ok(Math.abs(crossEntropy([0.5, 0.5], [0.25, 0.75], { base: 2 }) - 1.20751874963942) < 1e-12);
  assert.equal(informationGain([0.5, 0.5], [1, 0], { base: 2 }), 1);
});

test('rejects invalid probability comparisons instead of hiding infinite divergence', () => {
  assert.throws(() => klDivergence([0.5, 0.5], [1, 0]), /zero where p is positive/);
  assert.throws(() => crossEntropy([0.5, 0.5], [1, 0]), /zero where p is positive/);
});

test('applies deterministic confidence decay', () => {
  assert.equal(confidenceDecay({ base: 0.8, age: 10, halfLife: 10 }), 0.4);
  assert.equal(confidenceDecay({ base: 1, age: 0, halfLife: 5 }), 1);
  assert.throws(() => confidenceDecay({ base: 1.2, age: 1, halfLife: 5 }), /between 0 and 1/);
});

test('computes deterministic vector and weighted statistics primitives', () => {
  assert.equal(dotProduct([1, 2, 3], [4, 5, 6]), 32);
  assert.equal(pNorm([3, 4]), 5);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 1], [1, 1]), 1);
  assert.equal(weightedMean([1, 2, 3], [1, 1, 2]), 2.25);
  assert.equal(weightedVariance([1, 2, 3], [1, 1, 2]), 0.6875);
  assert.ok(Math.abs(weightedStdDev([1, 2, 3], [1, 1, 2]) - 0.82915619758885) < 1e-12);
  assert.throws(() => cosineSimilarity([0, 0], [1, 1]), /non-zero/);
  assert.throws(() => weightedMean([1, 2], [0, 0]), /positive sum/);
});

test('computes probability calibration and decision primitives without domain policy', () => {
  assert.equal(brierScore([0.9, 0.2], [1, 0]), 0.025);
  assert.ok(Math.abs(logLoss([0.9, 0.2], [1, 0]) - 0.164252033486018) < 1e-12);
  assert.equal(bayesUpdate({ prior: 0.5, likelihoodIfTrue: 0.8, likelihoodIfFalse: 0.2 }), 0.8);
  assert.deepEqual(softmax([0, 0]), [0.5, 0.5]);
  assert.equal(expectedValue([10, 20], [1, 3]), 17.5);
  assert.equal(logScale(100, 10, 1000, 20), 10);
  assert.throws(() => brierScore([1.2], [1]), /between 0 and 1/);
  assert.throws(() => bayesUpdate({ prior: 0.5, likelihoodIfTrue: 0, likelihoodIfFalse: 0 }), /positive evidence mass/);
});

test('Dijkstra finds the uninformed shortest weighted path', () => {
  const result = dijkstra(GRAPH, 'A', 'F');

  assert.deepEqual(result.path, ['A', 'C', 'E', 'D', 'F']);
  assert.equal(result.cost, 20);
  assert.ok(result.expandedCount >= result.path.length);
  assert.equal(result.algorithm, 'dijkstra');
});

test('A* matches Dijkstra with an admissible heuristic and expands no more nodes on the fixture', () => {
  const heuristic = { A: 20, B: 21, C: 18, D: 11, E: 15, F: 0 };
  const dijkstraResult = dijkstra(GRAPH, 'A', 'F');
  const astarResult = astar(GRAPH, 'A', 'F', heuristic, { strict: true });

  assert.deepEqual(astarResult.path, dijkstraResult.path);
  assert.equal(astarResult.cost, dijkstraResult.cost);
  assert.ok(astarResult.expandedCount < dijkstraResult.expandedCount);
  assert.equal(astarResult.proof.assumptions.includes('admissible_heuristic_checked'), true);
});

test('A* strict mode rejects overestimating heuristics', () => {
  const heuristic = { A: 100, B: 100, C: 100, D: 100, E: 100, F: 0 };

  assert.throws(() => astar(GRAPH, 'A', 'F', heuristic, { strict: true }), /inadmissible heuristic/);
});

test('topological sort returns dependency order and rejects cycles', () => {
  const dag = {
    nodes: ['research', 'kernel', 'lab', 'gate'],
    edges: [
      { from: 'research', to: 'kernel' },
      { from: 'kernel', to: 'lab' },
      { from: 'kernel', to: 'gate' },
    ],
  };

  assert.deepEqual(topologicalSort(dag).order, ['research', 'kernel', 'lab', 'gate']);
  assert.throws(() => topologicalSort({
    nodes: ['A', 'B'],
    edges: [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ],
  }), /cycle/);
});

test('math result envelope hashes inputs and results reproducibly', () => {
  const first = makeMathResult({
    operation: 'entropy',
    input: { probabilities: [0.5, 0.5] },
    result: { value: 1 },
    proof: { algorithm: 'shannon_entropy' },
  });
  const second = makeMathResult({
    operation: 'entropy',
    input: { probabilities: [0.5, 0.5] },
    result: { value: 1 },
    proof: { algorithm: 'shannon_entropy' },
  });

  assert.equal(first.schema, 'yuri.math.result.v0');
  assert.equal(first.inputsHash, second.inputsHash);
  assert.equal(first.resultHash, second.resultHash);
  assert.equal(first.deterministic, true);
});

// --- card 24: Bregman divergence (CANARY: negEntropy psi reproduces KL to the digit) ---
test('bregmanDivergence with negEntropy potential reproduces klDivergence to the digit', () => {
  const cases = [
    [[0.5, 0.5], [0.25, 0.75]],
    [[0.1, 0.2, 0.7], [0.3, 0.3, 0.4]],
    [[0.4, 0.6], [0.5, 0.5]],
  ];
  for (const [p, q] of cases) {
    for (const base of [2, Math.E, 10]) {
      const psi = negEntropyPotential({ base });
      const bregman = bregmanDivergence(p, q, psi);
      const kl = klDivergence(p, q, { base });
      assert.ok(Math.abs(bregman - kl) < 1e-9, `base ${base} p ${p} q ${q}: bregman ${bregman} != kl ${kl}`);
    }
  }
  // Identical distributions -> zero divergence.
  assert.equal(bregmanDivergence([0.5, 0.5], [0.5, 0.5], negEntropyPotential({ base: 2 })), 0);
});

test('bregmanDivergence rejects malformed potentials and mismatched lengths', () => {
  assert.throws(() => bregmanDivergence([0.5, 0.5], [0.5, 0.5], {}), /value\(x\) and grad\(x\)/);
  assert.throws(() => bregmanDivergence([0.5, 0.5], [0.4, 0.3, 0.3], negEntropyPotential()), /equal length/);
});

// --- card 28: MaxEnt belief prior (CANARY: entropy(maxEnt) >= entropy(legacy beliefWidth)) ---
test('maxEntBelief is entropy-maximal vs the legacy beliefWidth Gaussian-ish belief at matched mean', () => {
  const support = 7;
  const maxRank = support - 1;
  for (const meanRank of [1, 2, 3, 4, 5]) {
    const maxEnt = maxEntBelief(meanRank, support);
    // Legacy beliefWidth = LADDER_N / (2 * (n + 1)); build the comparison belief as a
    // truncated Gaussian-ish bump of that width centered at meanRank, then renormalize.
    const beliefWidth = support / (2 * (support + 1));
    const legacyRaw = Array.from({ length: support }, (_, i) =>
      Math.exp(-((i - meanRank) ** 2) / (2 * Math.max(beliefWidth, 1e-9) ** 2)) + 1e-9);
    const legacy = normalizeDistribution(legacyRaw);
    // Sums to 1 and respects support.
    assert.ok(Math.abs(maxEnt.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.equal(maxEnt.length, support);
    assert.ok(
      entropy(maxEnt, { base: 2 }) >= entropy(legacy, { base: 2 }) - 1e-9,
      `meanRank ${meanRank}: maxEnt entropy ${entropy(maxEnt, { base: 2 })} < legacy ${entropy(legacy, { base: 2 })}`,
    );
    // The recovered mean matches the constraint.
    const recoveredMean = maxEnt.reduce((acc, p, i) => acc + i * p, 0);
    assert.ok(Math.abs(recoveredMean - meanRank) < 1e-6, `meanRank ${meanRank}: recovered ${recoveredMean}`);
  }
  // Uniform mean -> uniform distribution (kernel applies roundStable to every mass).
  const uniform = maxEntBelief(maxRank / 2, support);
  for (const mass of uniform) {
    assert.ok(Math.abs(mass - 1 / support) < 1e-12, `uniform mass ${mass} != ${1 / support}`);
  }
});

test('maxEntBelief rejects invalid support and out-of-range means', () => {
  assert.throws(() => maxEntBelief(2, 1), /support must be an integer >= 2/);
  assert.throws(() => maxEntBelief(2, 4.5), /support must be an integer >= 2/);
  assert.throws(() => maxEntBelief(9, 7), /meanRank must be within/);
  assert.throws(() => maxEntBelief(-1, 7), /meanRank must be within/);
});

// --- card 27: LMSR increment (proper-scoring + b*ln(N) UNIFORM-PRIOR bound) ---
// SCOPE: this canary proves the bound holds FROM A UNIFORM PRIOR only. b*ln(N) is
// the uniform-prior worst-case subsidy (1/N -> 1 costs exactly b*ln(N)); it is NOT
// a per-increment bound from an arbitrary beliefBefore (see the non-uniform test).
test('lmsrIncrement is strictly proper and (from a uniform prior) bounded by b*ln(N)', () => {
  const b = 2;
  const before = [0.25, 0.25, 0.25, 0.25];
  // Moving toward the resolved index nets positive credit on that index.
  const toward = lmsrIncrement(before, [0.7, 0.1, 0.1, 0.1], b);
  assert.ok(toward.increments[0] > 0, 'pushing toward truth nets positive credit');
  // Pushing confidently wrong nets a larger-magnitude penalty (log asymmetry).
  const away = lmsrIncrement(before, [0.01, 0.97, 0.01, 0.01], b);
  assert.ok(away.increments[0] < 0, 'pushing away from truth nets a penalty on the true index');
  assert.ok(Math.abs(away.increments[0]) > Math.abs(toward.increments[0]), 'wrong-confidence penalty exceeds toward-credit');
  // From the uniform prior, each per-index credit respects the subsidy cap b*ln(N).
  assert.ok(Math.abs(toward.bound - b * Math.log(4)) < 1e-9);
  for (const inc of toward.increments) {
    assert.ok(inc <= toward.bound + 1e-9, `increment ${inc} exceeds bound ${toward.bound}`);
  }
  // The exact uniform-prior worst case: 1/N -> certainty on the resolved index
  // hits b*ln(N) to the digit (this is what `bound` actually proves).
  const worst = lmsrIncrement([0.25, 0.25, 0.25, 0.25], [1 - 3e-15, 1e-15, 1e-15, 1e-15], b);
  assert.ok(worst.increments[0] <= worst.bound + 1e-9, 'uniform-prior worst case stays at/below b*ln(N)');
  assert.ok(worst.increments[0] > worst.bound - 1e-9, 'uniform-prior worst case approaches b*ln(N)');
});

// L4#8 (Codex kernel finding): the b*ln(N) `bound` is FALSE as a per-increment
// guarantee from a NON-UNIFORM prior. From a near-zero pBefore a single increment
// dwarfs the bound. This test asserts the TRUE per-index invariant
// (increment == b*(ln pAfter - ln pBefore)) and documents that `bound` does NOT
// cap it for arbitrary beliefBefore — so the canary is honest about what it proves.
test('lmsrIncrement bound does NOT cap a single increment from a non-uniform prior', () => {
  const MIN = Number.MIN_VALUE; // 5e-324, smallest positive double
  const b = 1;
  const res = lmsrIncrement([MIN, 1], [1, MIN], b);
  // Claimed-by-the-old-canary bound for N=2 is b*ln(2) ~= 0.693.
  assert.ok(Math.abs(res.bound - b * Math.log(2)) < 1e-9, 'bound is b*ln(N) for N=2');
  // But the realized increment on the resolved index is ~744 — three orders of
  // magnitude over `bound`. A per-increment <= bound assertion here WOULD BE FALSE.
  const maxIncrement = Math.max(...res.increments.map(Math.abs));
  assert.ok(maxIncrement > 700, `non-uniform increment must exceed b*ln(N) grossly, got ${maxIncrement}`);
  assert.ok(maxIncrement > res.bound, 'increment from a non-uniform prior exceeds the uniform-prior bound');
  // TRUE per-index invariant: increment == b*(ln pAfter - ln pBefore) exactly.
  const before = normalizeDistribution([MIN, 1]);
  const after = normalizeDistribution([1, MIN]);
  for (let i = 0; i < res.increments.length; i += 1) {
    const expected = b * (Math.log(after[i]) - Math.log(before[i]));
    assert.ok(Math.abs(res.increments[i] - expected) < 1e-6, `increment[${i}] must equal b*(ln pAfter - ln pBefore)`);
  }
});

test('lmsrIncrement rejects non-positive b and zero-mass beliefs', () => {
  assert.throws(() => lmsrIncrement([0.5, 0.5], [0.5, 0.5], 0), /liquidity b must be positive/);
  assert.throws(() => lmsrIncrement([1, 0], [0.5, 0.5], 1), /positive belief mass/);
});

// --- card 3: e-value merge under dependence (exposes redundant-council theater) ---
test('mergeLaneEvidence exposes redundant lanes under arbitrary dependence', () => {
  const oneLane = [4];
  const fourCopies = [4, 4, 4, 4];
  const equalWeights = [0.25, 0.25, 0.25, 0.25];
  // Equal-weight mean of N identical lanes == one lane (redundancy exposed).
  const mean = mergeLaneEvidence(fourCopies, equalWeights, 'arbitrary');
  assert.equal(mean.merge, 'weighted-mean');
  assert.equal(mean.merged, mergeLaneEvidence(oneLane, [1], 'arbitrary').merged);
  assert.equal(mean.merged, 4);
  // Product merge blows up ~4x for the same identical lanes (false confidence).
  const product = mergeLaneEvidence(fourCopies, equalWeights, 'independent');
  assert.equal(product.merge, 'product');
  assert.equal(product.merged, 256);
  assert.ok(product.merged > mean.merged * 4, 'product over-counts dependent lanes');
});

test('mergeLaneEvidence rejects negative e-values and unknown dependence', () => {
  assert.throws(() => mergeLaneEvidence([-1, 2], [0.5, 0.5], 'arbitrary'), /non-negative/);
  assert.throws(() => mergeLaneEvidence([1, 2], [0.5, 0.5], 'mystery'), /arbitrary.*independent/);
});

// --- PC-2 KIT: CUSUM regime alarm ---
test('cusum alarms on slow drift that no single MAD step would flag, and stays quiet in-control', () => {
  // Slow drift -0.3 -> +0.3 over 40 ticks; no single step is a big outlier.
  const drift = Array.from({ length: 40 }, (_, i) => -0.3 + (0.6 * i) / 39);
  const driftResult = cusum(drift, { k: 0.05, h: 1, mu0: 0 });
  assert.equal(driftResult.alarm, true, 'CUSUM must catch the slow rot');
  assert.ok(driftResult.changeIndex > 0 && driftResult.changeIndex < 40);
  // Flat in-control stream around mu0 never alarms.
  const flat = new Array(60).fill(0).map((_, i) => (i % 2 === 0 ? 0.02 : -0.02));
  const flatResult = cusum(flat, { k: 0.1, h: 2, mu0: 0 });
  assert.equal(flatResult.alarm, false, 'in-control stream must not alarm');
  assert.equal(flatResult.changeIndex, -1);
});

test('cusum rejects non-positive threshold and negative slack', () => {
  assert.throws(() => cusum([0.1, 0.2], { k: 0.1, h: 0 }), /threshold h must be positive/);
  assert.throws(() => cusum([0.1, 0.2], { k: -1, h: 1 }), /slack k must be non-negative/);
});

// --- PC-2 KIT: scalar Kalman recovery filter ---
test('scalarKalman flags a one-sided spike and re-sensitizes via q within a couple ticks', () => {
  // Flat baseline, then a sharp upward spike at index 5.
  const stream = [1, 1, 1, 1, 1, 8, 8, 8, 8, 8];
  const result = scalarKalman(stream, { q: 0.5, r: 0.5, initialEstimate: 1, initialVariance: 0.5 });
  // The spike step is surprising (one-sided high NIS).
  assert.equal(result.surprises[5].surprised, true, 'the upward spike must be surprising');
  // Baseline steps are not.
  assert.equal(result.surprises[2].surprised, false);
  // Estimate tracks toward the new regime within ~2 ticks of the spike.
  assert.ok(result.estimates[7] > 6, `estimate should re-acquire the new level, got ${result.estimates[7]}`);
  assert.equal(result.estimates.length, stream.length);
});

test('scalarKalman rejects non-positive measurement noise and negative process noise', () => {
  assert.throws(() => scalarKalman([1, 2], { q: 0, r: 0 }), /measurement noise r must be positive/);
  assert.throws(() => scalarKalman([1, 2], { q: -1, r: 1 }), /process noise q must be non-negative/);
});

// F-K1: admissible-but-INCONSISTENT heuristic (audit counterexample). Under the
// no-reopen closed set, strict must reject; non-strict must return an internally
// consistent result (cost == edge-sum of the returned path), never a stale cost.
test('A* strict rejects admissible-but-inconsistent heuristics; non-strict reconciles cost to the returned path', () => {
  const graph = { nodes: ['S', 'P', 'Q', 'G'], edges: [
    { from: 'S', to: 'P', weight: 1 }, { from: 'P', to: 'Q', weight: 1 },
    { from: 'S', to: 'Q', weight: 2.5 }, { from: 'Q', to: 'G', weight: 1 },
  ] };
  const heuristic = { S: 0, P: 2, Q: 0, G: 0 }; // admissible (true costs 3,2,1,0); inconsistent at P->Q (2 > 1+0)
  assert.throws(() => astar(graph, 'S', 'G', heuristic, { strict: true }), /inconsistent heuristic/);
  const loose = astar(graph, 'S', 'G', heuristic);
  assert.deepEqual(loose.path, ['S', 'P', 'Q', 'G']);
  assert.equal(loose.cost, 3); // the path's true edge-sum, not the stale 3.5
  assert.ok(loose.proof.warnings.includes('cost_recomputed_from_reconstructed_path'));
  // Consistent heuristics certify both properties in strict mode.
  const ok = astar(GRAPH, 'A', 'F', { A: 20, B: 21, C: 18, D: 11, E: 15, F: 0 }, { strict: true });
  assert.ok(ok.proof.assumptions.includes('consistent_heuristic_checked'));
  // Tolerance is RELATIVE in the roundStable domain: a consistent strict run over
  // fractional weights summing to ~1e7 must NOT throw on its own rounding residue.
  const big = {
    nodes: Array.from({ length: 11 }, (_, i) => `n${i}`),
    edges: Array.from({ length: 10 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, weight: 1234567.89 })),
  };
  const bigH = Object.fromEntries(big.nodes.map((n) => [n, 0]));
  const bigResult = astar(big, 'n0', 'n10', bigH, { strict: true });
  assert.equal(bigResult.cost, 12345678.9);
});

// F-K2: the post-aggregate finite invariant extends to the vector/statistics
// primitives. Includes the denominator-product seam: both pNorms FINITE
// (1.34078079299426e154) yet their product overflows — cosine used to emit a
// silently wrong 0 where the true similarity is 0.5.
test('vector and statistics primitives fail closed on aggregate overflow', () => {
  const MAX = 1e308;
  assert.throws(() => dotProduct([MAX, MAX], [MAX, MAX]), /non-finite|overflow/i);
  assert.throws(() => pNorm([MAX, MAX]), /non-finite|overflow/i);
  assert.throws(() => cosineSimilarity([MAX, MAX], [MAX, MAX]), /non-finite|overflow/i);
  const x = Math.sqrt(Number.MAX_VALUE / 2);
  const c1 = (1 + Math.sqrt(3)) / 2;
  const c2 = (1 - Math.sqrt(3)) / 2;
  // Both pNorms finite, dot finite (8.99e307), denominator product Infinity —
  // HEAD returned 0, true cosine 0.5. Catches omission of the denominator assert.
  assert.throws(() => cosineSimilarity([x, x], [x * c1, x * c2]), /non-finite|overflow/i);
  assert.throws(() => weightedVariance([1e200, -1e200], [1, 1]), /non-finite|overflow/i);
  assert.throws(() => weightedStdDev([1e200, -1e200], [1, 1]), /non-finite|overflow/i);
  // Over-fix guard: legitimate inputs unaffected.
  assert.equal(dotProduct([1, 2, 3], [4, 5, 6]), 32);
  assert.equal(pNorm([3, 4]), 5);
  assert.equal(cosineSimilarity([1, 1], [1, 1]), 1);
  assert.equal(weightedVariance([1, 2, 3], [1, 1, 2]), 0.6875);
  // expectedValue is overflow-safe by construction (normalized probabilities
  // bound every partial sum by max|value|).
  assert.equal(expectedValue([1e308, 1e308], [1, 1]), 1e308);
});

// F-K3: the KL canary must hold for RAW COUNTS too — the potential's simplex
// projection is applied once, feeding value, grad, AND the inner product.
// Pre-fix: bregman([2,2],[1,3]) = 0.967800252726973 (neither KL of raw nor of normalized).
test('bregmanDivergence with negEntropy equals klDivergence for unnormalized inputs', () => {
  const psi = negEntropyPotential();
  assert.equal(bregmanDivergence([2, 2], [1, 3], psi), klDivergence([2, 2], [1, 3]));
  assert.equal(bregmanDivergence([2, 2], [1, 3], psi), 0.14384103622589);
  const psi2 = negEntropyPotential({ base: 2 });
  assert.ok(Math.abs(bregmanDivergence([3, 1, 4], [2, 2, 4], psi2) - klDivergence([3, 1, 4], [2, 2, 4], { base: 2 })) < 1e-12);
});

test('cusum exposes the canonical change-point estimate via lastZeroIndex; changeIndex stays the alarm index', () => {
  const r = cusum([0, 0, 5, 5, 5], { k: 1, h: 5 }); // S = [0,0,4,8,12]
  assert.equal(r.alarm, true);
  assert.equal(r.changeIndex, 3);   // ALARM index (back-compat, unchanged)
  assert.equal(r.lastZeroIndex, 1); // last S===0 before the climb; change onset = 2
  const quiet = cusum([0.01, -0.01, 0.01], { k: 0.1, h: 2 });
  assert.equal(quiet.alarm, false);
  assert.equal(quiet.lastZeroIndex, -1); // no alarm -> no change-point estimate
  const immediate = cusum([10, 10], { k: 1, h: 5 }); // alarms at index 0, S never zero
  assert.equal(immediate.lastZeroIndex, -1); // climb began at stream start
});

test('maxEntBelief validates solver options instead of silently returning a constraint-violating uniform', () => {
  assert.throws(() => maxEntBelief(0.5, 3, { maxIterations: 0 }), /maxIterations must be an integer >= 1/);
  assert.throws(() => maxEntBelief(0.5, 3, { maxIterations: 2.5 }), /maxIterations must be an integer >= 1/);
  assert.throws(() => maxEntBelief(0.5, 3, { tolerance: 0 }), /tolerance must be positive/);
  assert.throws(() => maxEntBelief(0.5, 3, { tolerance: -1 }), /tolerance must be positive/);
  assert.deepEqual(maxEntBelief(1, 3, { maxIterations: 100, tolerance: 1e-12 }).length, 3); // valid options accepted
});

test('informationGain is a plain entropy delta and can be negative', () => {
  assert.equal(informationGain([1, 0], [0.5, 0.5], { base: 2 }), -1);
});

// gates-foundry-9: entropy-family bases must be finite and > 1 — a base in
// (0,1) flips the sign of every entropy (H >= 0 violated); Infinity silently
// zeroes it.
test('entropy-family log base must be finite and greater than 1', () => {
  assert.throws(() => entropy([0.5, 0.5], { base: 0.5 }), /greater than 1/);
  assert.throws(() => entropy([0.5, 0.5], { base: 1 }), /greater than 1/);
  assert.throws(() => entropy([0.5, 0.5], { base: Infinity }), /finite/);
  assert.throws(() => entropy([0.5, 0.5], { base: NaN }), /finite/);
  assert.equal(entropy([0.5, 0.5], { base: 2 }), 1);
});

// clockwork-2: shared primitives — kernel-strict non-finite policy (throw on
// NaN/Infinity entries; boundary callers pre-filter), house conventions:
// spearman = Pearson over average-tied ranks, percentile = nearest-rank ceil,
// median = averaged middle.
test('spearman: tie-corrected — Pearson over average-tied ranks, degenerate input returns 0', () => {
  assert.equal(spearman([1, 1, 1, 1], [1, 2, 3, 4]), 0);
  assert.equal(spearman([1, 1, 1, 1], [4, 3, 2, 1]), 0);
  assert.equal(spearman([1, 2, 2, 3], [1, 2, 3, 4]), 0.948683298050514); // Pearson([1,2.5,2.5,4],[1,2,3,4]) = 4.5/√22.5
  assert.equal(spearman([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(spearman([1, 2, 3], [10, 20, 30]), 1);
  assert.throws(() => spearman([1, NaN], [1, 2]), /finite/);
});

test('percentile: nearest-rank (ceil), no interpolation; p50 != averaged median by design', () => {
  const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(xs, 90), 90); // sorted[ceil(9)-1] = sorted[8], NOT the max
  assert.equal(percentile(xs, 100), 100);
  assert.equal(percentile([1, 2, 3, 4], 50), 2); // nearest-rank p50 = 2; averaged median = 2.5
  assert.equal(percentile([5, 1, 9, 3, 7, 2, 8, 4, 6, 10], 90), 9);
  assert.throws(() => percentile([], 50));
  assert.throws(() => percentile([1, 2], 0), /\(0, 100\]/);
  assert.throws(() => percentile([1, NaN], 50), /finite/);
});

test('median: averaged middle; kernel-strict on empty and non-finite input', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([3, 1, 2]), 2);
  assert.throws(() => median([]));
  assert.throws(() => median([1, NaN]), /finite/);
});

test('pearson + rankWithTies: shared kernel primitives (constant input → 0, average tie ranks)', () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), 0); // constant → 0, never NaN/±1
  assert.deepEqual(rankWithTies([1, 1, 2]), [1.5, 1.5, 3]);
  assert.ok(Math.abs(spearman([1, 1, 2], [1, 2, 3]) - Math.sqrt(3) / 2) < 1e-9);
});
