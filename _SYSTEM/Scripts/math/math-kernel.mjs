#!/usr/bin/env node
import { createHash } from 'node:crypto';

const RESULT_SCHEMA = 'yuri.math.result.v0';
const EPSILON = 1e-12;

export function normalizeDistribution(values) {
  assertNumberArray(values, 'distribution');
  for (const value of values) {
    if (value < 0) throw new Error('distribution values must be non-negative');
  }
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= 0) throw new Error('distribution must have a positive sum');
  return values.map((value) => value / sum);
}

export function entropy(probabilities, options = {}) {
  const base = options.base ?? Math.E;
  assertLogBase(base);
  const distribution = normalizeDistribution(probabilities);
  return roundStable(-distribution.reduce((total, probability) => {
    if (probability === 0) return total;
    return total + probability * logBase(probability, base);
  }, 0));
}

export function klDivergence(p, q, options = {}) {
  const base = options.base ?? Math.E;
  assertLogBase(base);
  const left = normalizeDistribution(p);
  const right = normalizeDistribution(q);
  assertSameLength(left, right, 'KL divergence');
  return roundStable(left.reduce((total, probability, index) => {
    const reference = right[index];
    if (probability === 0) return total;
    if (reference === 0) {
      throw new Error('KL divergence is infinite because q has zero where p is positive');
    }
    return total + probability * logBase(probability / reference, base);
  }, 0));
}

export function crossEntropy(p, q, options = {}) {
  const base = options.base ?? Math.E;
  assertLogBase(base);
  const left = normalizeDistribution(p);
  const right = normalizeDistribution(q);
  assertSameLength(left, right, 'cross entropy');
  return roundStable(-left.reduce((total, probability, index) => {
    const reference = right[index];
    if (probability === 0) return total;
    if (reference === 0) {
      throw new Error('cross entropy is infinite because q has zero where p is positive');
    }
    return total + probability * logBase(reference, base);
  }, 0));
}

export function informationGain(before, after, options = {}) {
  return roundStable(entropy(before, options) - entropy(after, options));
}

export function confidenceDecay({ base, age, halfLife }) {
  assertFiniteNumber(base, 'base');
  assertFiniteNumber(age, 'age');
  assertFiniteNumber(halfLife, 'halfLife');
  if (base < 0 || base > 1) throw new Error('base confidence must be between 0 and 1');
  if (age < 0) throw new Error('age must be non-negative');
  if (halfLife <= 0) throw new Error('halfLife must be positive');
  return roundStable(base * Math.pow(0.5, age / halfLife));
}

export function dotProduct(left, right) {
  assertVectorPair(left, right, 'dot product');
  return roundStable(left.reduce((total, value, index) => total + value * right[index], 0));
}

export function pNorm(values, p = 2) {
  assertNumberArray(values, 'vector');
  assertFiniteNumber(p, 'p');
  if (p < 1) throw new Error('p-norm requires p >= 1');
  return roundStable(Math.pow(values.reduce((total, value) => total + Math.abs(value) ** p, 0), 1 / p));
}

export function cosineSimilarity(left, right) {
  assertVectorPair(left, right, 'cosine similarity');
  const denominator = pNorm(left, 2) * pNorm(right, 2);
  if (denominator <= 0) throw new Error('cosine similarity requires non-zero vectors');
  const similarity = dotProduct(left, right) / denominator;
  if (Math.abs(similarity - 1) < EPSILON) return 1;
  if (Math.abs(similarity + 1) < EPSILON) return -1;
  return roundStable(clampNumber(similarity, -1, 1));
}

export function weightedMean(values, weights) {
  assertVectorPair(values, weights, 'weighted mean');
  const weightSum = assertWeightVector(weights);
  return roundStable(values.reduce((total, value, index) => total + value * weights[index], 0) / weightSum);
}

export function weightedVariance(values, weights) {
  assertVectorPair(values, weights, 'weighted variance');
  const weightSum = assertWeightVector(weights);
  const mean = weightedMean(values, weights);
  return roundStable(values.reduce((total, value, index) => total + weights[index] * (value - mean) ** 2, 0) / weightSum);
}

export function weightedStdDev(values, weights) {
  return roundStable(Math.sqrt(weightedVariance(values, weights)));
}

export function brierScore(predictions, outcomes) {
  assertVectorPair(predictions, outcomes, 'Brier score');
  return roundStable(predictions.reduce((total, probability, index) => {
    assertProbability(probability, `prediction ${index}`);
    assertProbability(outcomes[index], `outcome ${index}`);
    return total + (probability - outcomes[index]) ** 2;
  }, 0) / predictions.length);
}

export function logLoss(predictions, outcomes, options = {}) {
  const epsilon = options.epsilon ?? 1e-15;
  assertFiniteNumber(epsilon, 'epsilon');
  if (epsilon <= 0 || epsilon >= 0.5) throw new Error('epsilon must be between 0 and 0.5');
  assertVectorPair(predictions, outcomes, 'log loss');
  return roundStable(-predictions.reduce((total, probability, index) => {
    assertProbability(probability, `prediction ${index}`);
    assertProbability(outcomes[index], `outcome ${index}`);
    const clipped = clampNumber(probability, epsilon, 1 - epsilon);
    const outcome = outcomes[index];
    return total + outcome * Math.log(clipped) + (1 - outcome) * Math.log(1 - clipped);
  }, 0) / predictions.length);
}

export function bayesUpdate({ prior, likelihoodIfTrue, likelihoodIfFalse }) {
  assertProbability(prior, 'prior');
  assertFiniteNumber(likelihoodIfTrue, 'likelihoodIfTrue');
  assertFiniteNumber(likelihoodIfFalse, 'likelihoodIfFalse');
  if (likelihoodIfTrue < 0 || likelihoodIfFalse < 0) throw new Error('likelihoods must be non-negative');
  const positiveMass = prior * likelihoodIfTrue;
  const negativeMass = (1 - prior) * likelihoodIfFalse;
  const evidenceMass = positiveMass + negativeMass;
  if (evidenceMass <= 0) throw new Error('Bayes update requires positive evidence mass');
  return roundStable(positiveMass / evidenceMass);
}

export function softmax(values, options = {}) {
  assertNumberArray(values, 'softmax vector');
  const temperature = options.temperature ?? 1;
  assertFiniteNumber(temperature, 'temperature');
  if (temperature <= 0) throw new Error('temperature must be positive');
  const scaled = values.map((value) => value / temperature);
  const maxValue = Math.max(...scaled);
  const expValues = scaled.map((value) => Math.exp(value - maxValue));
  return normalizeDistribution(expValues).map(roundStable);
}

export function expectedValue(values, probabilities) {
  assertVectorPair(values, probabilities, 'expected value');
  const distribution = normalizeDistribution(probabilities);
  return roundStable(values.reduce((total, value, index) => total + value * distribution[index], 0));
}

export function logScale(value, min, max, points = 1) {
  assertFiniteNumber(value, 'value');
  assertFiniteNumber(min, 'min');
  assertFiniteNumber(max, 'max');
  assertFiniteNumber(points, 'points');
  if (min <= 0) throw new Error('logScale min must be positive');
  if (max <= min) throw new Error('logScale max must be greater than min');
  if (points < 0) throw new Error('logScale points must be non-negative');
  if (value <= min) return 0;
  if (value >= max) return points;
  return roundStable((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min)) * points);
}

export function makeMathResult({ operation, input, result, proof = {} }) {
  if (!operation) throw new Error('operation is required');
  return {
    schema: RESULT_SCHEMA,
    operation,
    deterministic: true,
    inputsHash: sha256Stable(input ?? {}),
    resultHash: sha256Stable(result ?? {}),
    result,
    proof,
  };
}

export function dijkstra(graph, source, target, options = {}) {
  const normalized = normalizeGraph(graph, { allowNegative: false });
  assertNode(normalized, source, 'source');
  assertNode(normalized, target, 'target');

  const distances = new Map(normalized.nodes.map((node) => [node, Infinity]));
  const previous = new Map();
  const visited = new Set();
  const visitedOrder = [];
  const queue = new MinPriorityQueue();

  distances.set(source, 0);
  queue.push(source, 0);

  while (!queue.isEmpty()) {
    const current = queue.pop();
    if (visited.has(current.value)) continue;
    visited.add(current.value);
    visitedOrder.push(current.value);
    if (current.value === target) break;

    for (const edge of normalized.adjacency.get(current.value) || []) {
      if (visited.has(edge.to)) continue;
      const nextDistance = distances.get(current.value) + edge.weight;
      if (nextDistance + EPSILON < distances.get(edge.to)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, current.value);
        queue.push(edge.to, nextDistance);
      }
    }
  }

  return buildPathResult({
    algorithm: 'dijkstra',
    source,
    target,
    cost: distances.get(target),
    previous,
    visitedOrder,
    proof: {
      algorithm: 'dijkstra',
      complexity: 'O((V + E) log V)',
      assumptions: ['non_negative_edge_weights'],
      warnings: options.warnings || [],
    },
  });
}

export function astar(graph, source, target, heuristic = {}, options = {}) {
  const normalized = normalizeGraph(graph, { allowNegative: false });
  assertNode(normalized, source, 'source');
  assertNode(normalized, target, 'target');
  const heuristicFn = buildHeuristic(heuristic);
  const assumptions = ['non_negative_edge_weights'];
  const warnings = [];

  if (options.strict) {
    validateAdmissibleHeuristic(normalized, target, heuristicFn);
    assumptions.push('admissible_heuristic_checked');
  } else {
    warnings.push('heuristic_admissibility_not_checked');
  }

  const gScore = new Map(normalized.nodes.map((node) => [node, Infinity]));
  const previous = new Map();
  const closed = new Set();
  const visitedOrder = [];
  const queue = new MinPriorityQueue();

  gScore.set(source, 0);
  queue.push(source, heuristicFn(source));

  while (!queue.isEmpty()) {
    const current = queue.pop();
    if (closed.has(current.value)) continue;
    closed.add(current.value);
    visitedOrder.push(current.value);
    if (current.value === target) break;

    for (const edge of normalized.adjacency.get(current.value) || []) {
      const tentative = gScore.get(current.value) + edge.weight;
      if (tentative + EPSILON < gScore.get(edge.to)) {
        gScore.set(edge.to, tentative);
        previous.set(edge.to, current.value);
        queue.push(edge.to, tentative + heuristicFn(edge.to));
      }
    }
  }

  return buildPathResult({
    algorithm: 'astar',
    source,
    target,
    cost: gScore.get(target),
    previous,
    visitedOrder,
    proof: {
      algorithm: 'astar',
      complexity: 'O((V + E) log V) with binary heap frontier',
      assumptions,
      warnings,
    },
  });
}

export function topologicalSort(dag) {
  if (!dag || typeof dag !== 'object') throw new Error('dag must be an object');
  const nodes = [...new Set(dag.nodes || [])];
  if (!nodes.length) throw new Error('dag.nodes must include at least one node');
  const nodeSet = new Set(nodes);
  const indegree = new Map(nodes.map((node) => [node, 0]));
  const adjacency = new Map(nodes.map((node) => [node, []]));

  for (const edge of dag.edges || []) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
      throw new Error(`edge references unknown node: ${edge.from} -> ${edge.to}`);
    }
    adjacency.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  const queue = nodes.filter((node) => indegree.get(node) === 0);
  const order = [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    order.push(current);
    for (const next of adjacency.get(current)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  if (order.length !== nodes.length) {
    throw new Error('topological sort failed because the graph contains a cycle');
  }

  return {
    algorithm: 'topological-sort',
    order,
    proof: {
      algorithm: 'kahn',
      complexity: 'O(V + E)',
      assumptions: ['directed_acyclic_graph'],
      warnings: [],
    },
  };
}

function validateAdmissibleHeuristic(normalized, target, heuristicFn) {
  for (const node of normalized.nodes) {
    const estimate = heuristicFn(node);
    if (estimate < 0) throw new Error(`heuristic for ${node} must be non-negative`);
    const trueCost = dijkstra(normalized.sourceGraph, node, target).cost;
    if (Number.isFinite(trueCost) && estimate > trueCost + EPSILON) {
      throw new Error(`inadmissible heuristic for ${node}: ${estimate} > ${trueCost}`);
    }
  }
}

function buildPathResult({ algorithm, source, target, cost, previous, visitedOrder, proof }) {
  const reachable = Number.isFinite(cost);
  const path = reachable ? reconstructPath(previous, source, target) : [];
  return {
    algorithm,
    source,
    target,
    path,
    cost: reachable ? roundStable(cost) : Infinity,
    reachable,
    visitedOrder,
    expandedCount: visitedOrder.length,
    proof,
  };
}

function reconstructPath(previous, source, target) {
  const path = [target];
  let current = target;
  while (current !== source) {
    current = previous.get(current);
    if (!current) return [];
    path.push(current);
  }
  return path.reverse();
}

function normalizeGraph(graph, options = {}) {
  if (!graph || typeof graph !== 'object') throw new Error('graph must be an object');
  const nodes = [...new Set(graph.nodes || [])];
  if (!nodes.length) throw new Error('graph.nodes must include at least one node');
  const nodeSet = new Set(nodes);
  const directed = graph.directed !== false;
  const adjacency = new Map(nodes.map((node) => [node, []]));
  const sourceEdges = [];

  for (const edge of graph.edges || []) {
    assertEdge(edge, nodeSet, options);
    adjacency.get(edge.from).push({ from: edge.from, to: edge.to, weight: edge.weight });
    sourceEdges.push({ from: edge.from, to: edge.to, weight: edge.weight });
    if (!directed) {
      adjacency.get(edge.to).push({ from: edge.to, to: edge.from, weight: edge.weight });
      sourceEdges.push({ from: edge.to, to: edge.from, weight: edge.weight });
    }
  }

  return {
    nodes,
    edges: sourceEdges,
    directed: true,
    adjacency,
    sourceGraph: {
      directed: true,
      nodes,
      edges: sourceEdges,
    },
  };
}

function assertEdge(edge, nodeSet, options) {
  if (!edge || typeof edge !== 'object') throw new Error('edge must be an object');
  if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
    throw new Error(`edge references unknown node: ${edge.from} -> ${edge.to}`);
  }
  assertFiniteNumber(edge.weight, `edge weight ${edge.from} -> ${edge.to}`);
  if (!options.allowNegative && edge.weight < 0) {
    throw new Error('Dijkstra/A* require non-negative edge weights');
  }
}

function buildHeuristic(heuristic) {
  if (typeof heuristic === 'function') {
    return (node) => {
      const value = heuristic(node);
      assertFiniteNumber(value, `heuristic for ${node}`);
      return value;
    };
  }
  if (!heuristic || typeof heuristic !== 'object') throw new Error('heuristic must be a function or object');
  return (node) => {
    const value = heuristic[node] ?? 0;
    assertFiniteNumber(value, `heuristic for ${node}`);
    return value;
  };
}

function assertNode(graph, node, label) {
  if (!graph.nodes.includes(node)) throw new Error(`${label} node is not in graph: ${node}`);
}

function assertSameLength(left, right, label) {
  if (left.length !== right.length) throw new Error(`${label} requires distributions of equal length`);
}

function assertVectorPair(left, right, label) {
  assertNumberArray(left, `${label} left`);
  assertNumberArray(right, `${label} right`);
  assertSameLength(left, right, label);
}

function assertNumberArray(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must be a non-empty array`);
  for (const value of values) {
    assertFiniteNumber(value, label);
  }
}

function assertWeightVector(weights) {
  let total = 0;
  for (const weight of weights) {
    if (weight < 0) throw new Error('weights must be non-negative');
    total += weight;
  }
  if (total <= 0) throw new Error('weights must have a positive sum');
  return total;
}

function assertProbability(value, label) {
  assertFiniteNumber(value, label);
  if (value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
}

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function assertLogBase(base) {
  assertFiniteNumber(base, 'log base');
  if (base <= 0 || base === 1) throw new Error('log base must be positive and not equal to 1');
}

function logBase(value, base) {
  return Math.log(value) / Math.log(base);
}

function roundStable(value) {
  if (!Number.isFinite(value)) return value;
  if (Math.abs(value) < EPSILON) return 0;
  return Number(value.toPrecision(15));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sha256Stable(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
  return JSON.stringify(value);
}

class MinPriorityQueue {
  #items = [];

  isEmpty() {
    return this.#items.length === 0;
  }

  push(value, priority) {
    this.#items.push({ value, priority });
    this.#bubbleUp(this.#items.length - 1);
  }

  pop() {
    if (this.#items.length === 0) return null;
    const root = this.#items[0];
    const last = this.#items.pop();
    if (this.#items.length > 0) {
      this.#items[0] = last;
      this.#sinkDown(0);
    }
    return root;
  }

  #bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.#items[parent].priority <= this.#items[index].priority) break;
      this.#swap(parent, index);
      index = parent;
    }
  }

  #sinkDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;
      if (left < this.#items.length && this.#items[left].priority < this.#items[smallest].priority) {
        smallest = left;
      }
      if (right < this.#items.length && this.#items[right].priority < this.#items[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) break;
      this.#swap(index, smallest);
      index = smallest;
    }
  }

  #swap(left, right) {
    const temp = this.#items[left];
    this.#items[left] = this.#items[right];
    this.#items[right] = temp;
  }
}
