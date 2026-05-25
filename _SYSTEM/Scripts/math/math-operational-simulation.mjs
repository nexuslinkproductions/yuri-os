#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  confidenceDecay,
  cosineSimilarity,
  crossEntropy,
  dijkstra,
  expectedValue,
  klDivergence,
  softmax,
  topologicalSort,
  weightedMean,
  weightedVariance,
} from './math-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_OUT = path.join(REPO_ROOT, '_SYSTEM/reports/math-operational-simulation-2026-05-25.json');

const MEMORY_WEIGHTS = [0.35, 0.25, 0.25, 0.15];

function buildMemoryRanking() {
  const candidates = [
    {
      id: 'recent-high-signal',
      baseConfidence: 0.9,
      ageDays: 2,
      halfLifeDays: 10,
      sourceReliability: 0.95,
      informationGain: 0.32,
      queryVector: [0.7, 0.2, 0.1],
      memoryVector: [0.65, 0.25, 0.12],
    },
    {
      id: 'old-reference',
      baseConfidence: 0.8,
      ageDays: 20,
      halfLifeDays: 10,
      sourceReliability: 0.9,
      informationGain: 0.18,
      queryVector: [0.7, 0.2, 0.1],
      memoryVector: [0.55, 0.22, 0.05],
    },
    {
      id: 'fresh-low-signal',
      baseConfidence: 0.65,
      ageDays: 1,
      halfLifeDays: 10,
      sourceReliability: 0.7,
      informationGain: 0.04,
      queryVector: [0.7, 0.2, 0.1],
      memoryVector: [0.58, 0.18, 0.11],
    },
  ];

  const scored = candidates.map((candidate) => {
    const recencyConfidence = confidenceDecay({
      base: candidate.baseConfidence,
      age: candidate.ageDays,
      halfLife: candidate.halfLifeDays,
    });
    const similarity = cosineSimilarity(candidate.queryVector, candidate.memoryVector);
    const normalizedInformationGain = Math.min(candidate.informationGain / 0.5, 1);
    const components = [
      recencyConfidence,
      candidate.sourceReliability,
      normalizedInformationGain,
      similarity,
    ];
    return {
      id: candidate.id,
      components: {
        recencyConfidence,
        sourceReliability: candidate.sourceReliability,
        normalizedInformationGain,
        similarity,
      },
      score: weightedMean(components, MEMORY_WEIGHTS),
      disagreement: weightedVariance(components, MEMORY_WEIGHTS),
    };
  }).sort((left, right) => right.score - left.score);

  return {
    formulaIds: ['confidence-decay', 'cosine-similarity', 'weighted-mean', 'weighted-variance'],
    weights: MEMORY_WEIGHTS,
    ranked: scored,
    recommendation: scored[0].id,
    interpretation: 'Recent, reliable, information-bearing memories outrank stale or low-signal candidates.',
  };
}

function buildContextRouting() {
  const graph = {
    directed: true,
    nodes: ['intake', 'math-packet', 'formula-bank', 'visual-lab', 'operational-report'],
    edges: [
      { from: 'intake', to: 'math-packet', weight: 1 },
      { from: 'math-packet', to: 'formula-bank', weight: 2 },
      { from: 'formula-bank', to: 'operational-report', weight: 2 },
      { from: 'math-packet', to: 'visual-lab', weight: 3 },
      { from: 'visual-lab', to: 'operational-report', weight: 1 },
      { from: 'intake', to: 'operational-report', weight: 9 },
    ],
  };
  const route = dijkstra(graph, 'intake', 'operational-report');
  const order = topologicalSort({
    nodes: ['read-startup', 'audit-formulas', 'upgrade-cards', 'run-proofs', 'write-report'],
    edges: [
      { from: 'read-startup', to: 'audit-formulas' },
      { from: 'audit-formulas', to: 'upgrade-cards' },
      { from: 'upgrade-cards', to: 'run-proofs' },
      { from: 'run-proofs', to: 'write-report' },
    ],
  });
  return {
    formulaIds: ['dijkstra-relaxation', 'topological-dependency-order'],
    route,
    dependencyOrder: order.order,
    interpretation: 'The cheapest route still requires loading the math packet before emitting an operational report.',
  };
}

function buildRagConflictDetection() {
  const trustedBaseline = [0.45, 0.35, 0.2];
  const observedRetrieval = [0.62, 0.18, 0.2];
  const divergence = klDivergence(observedRetrieval, trustedBaseline, { base: 2 });
  const mismatch = crossEntropy(observedRetrieval, trustedBaseline, { base: 2 });
  return {
    formulaIds: ['kl-divergence', 'cross-entropy'],
    labels: ['local_verified', 'research_advisory', 'operator_context'],
    trustedBaseline,
    observedRetrieval,
    divergence,
    mismatch,
    threshold: 0.1,
    status: divergence > 0.1 ? 'review_distribution_shift' : 'within_baseline',
    interpretation: 'The observed retrieval mix shifted toward local verified material; review if the task expected broader research.',
  };
}

function buildToolRouting() {
  const options = [
    { id: 'node-kernel', values: [0.95, 0.85, 0.2], probabilities: [0.5, 0.35, 0.15] },
    { id: 'python-lab', values: [0.8, 0.9, 0.4], probabilities: [0.35, 0.45, 0.2] },
    { id: 'symbolic-adapter', values: [0.65, 0.7, 0.55], probabilities: [0.3, 0.4, 0.3] },
  ];
  const expected = options.map((option) => ({
    id: option.id,
    expectedUtility: expectedValue(option.values, option.probabilities),
  }));
  const distribution = softmax(expected.map((option) => option.expectedUtility), { temperature: 0.1 });
  return {
    formulaIds: ['expected-value', 'softmax'],
    options: expected.map((option, index) => ({ ...option, displayWeight: distribution[index] })),
    recommendation: expected[0].id,
    interpretation: 'The Node kernel remains the trusted execution route; Python lab is useful for visual proof artifacts.',
  };
}

function buildReleaseScoring() {
  const hardBlockers = [];
  const evidence = {
    mathHealth: 1,
    proofGate: 1,
    visualArtifacts: 1,
    operationalReport: 0.9,
  };
  const values = Object.values(evidence);
  const weights = [0.35, 0.3, 0.2, 0.15];
  return {
    formulaIds: ['weighted-mean', 'weighted-variance'],
    hardBlockers,
    evidence,
    weights,
    score: weightedMean(values, weights),
    disagreement: weightedVariance(values, weights),
    status: hardBlockers.length === 0 ? 'advisory_ready' : 'blocked',
    interpretation: 'Aggregate scores are advisory only; a hard blocker would override the numeric score.',
  };
}

function buildCreativeScheduling() {
  const dag = {
    nodes: ['concept', 'reference-board', 'draft', 'review', 'render', 'package'],
    edges: [
      { from: 'concept', to: 'reference-board' },
      { from: 'reference-board', to: 'draft' },
      { from: 'draft', to: 'review' },
      { from: 'review', to: 'render' },
      { from: 'render', to: 'package' },
    ],
  };
  const order = topologicalSort(dag).order;
  return {
    formulaIds: ['topological-dependency-order'],
    order,
    interpretation: 'The schedule is valid because each creative step appears after its prerequisites.',
  };
}

export function buildOperationalSimulationReport() {
  const sections = {
    memoryRanking: buildMemoryRanking(),
    contextRouting: buildContextRouting(),
    ragConflictDetection: buildRagConflictDetection(),
    toolRouting: buildToolRouting(),
    releaseScoring: buildReleaseScoring(),
    creativeProductionScheduling: buildCreativeScheduling(),
  };
  return {
    schema: 'yuri.math-operational-simulation.v0',
    generatedAt: '2026-05-25T00:00:00.000Z',
    advisoryOnly: true,
    localTruthClaim: false,
    writesRuntimeTruth: false,
    purpose: 'Non-invasive demonstration of math improving YURI memory, routing, RAG conflict detection, lane selection, release gates, and creative scheduling.',
    sections,
    reportHash: sha256Stable(sections),
  };
}

function writeReport(outPath, report) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
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

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  const outFlagIndex = process.argv.indexOf('--out');
  const stdout = process.argv.includes('--stdout');
  const outPath = outFlagIndex >= 0 ? path.resolve(process.argv[outFlagIndex + 1]) : DEFAULT_OUT;
  const report = buildOperationalSimulationReport();
  if (stdout) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    writeReport(outPath, report);
    console.log(JSON.stringify({ ok: true, path: path.relative(REPO_ROOT, outPath), reportHash: report.reportHash }, null, 2));
  }
}
