#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  astar,
  bayesUpdate,
  brierScore,
  confidenceDecay,
  cosineSimilarity,
  crossEntropy,
  dijkstra,
  dotProduct,
  entropy,
  expectedValue,
  informationGain,
  klDivergence,
  logLoss,
  logScale,
  makeMathResult,
  normalizeDistribution,
  pNorm,
  softmax,
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

test('computes logarithmic information primitives deterministically', () => {
  assert.equal(entropy([0.5, 0.5], { base: 2 }), 1);
  assert.equal(entropy([1, 0], { base: 2 }), 0);
  assert.ok(Math.abs(klDivergence([0.5, 0.5], [0.25, 0.75], { base: 2 }) - 0.20751874963942185) < 1e-12);
  assert.ok(Math.abs(crossEntropy([0.5, 0.5], [0.25, 0.75], { base: 2 }) - 1.207518749639422) < 1e-12);
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
