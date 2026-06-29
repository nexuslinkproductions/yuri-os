#!/usr/bin/env node
/**
 * fleet-router-mlp.mjs
 *
 * Tiny pure-JS multilayer perceptron for routing decisions across the three execution substrates
 * (native Claude Agents, z.ai GLM lanes, ollama-cloud) + Cursor as supplemental native lane.
 *
 * Design contract with the rest of YURI:
 * - This is ADVISORY only.
 * - Hard governance (6-gate charter, energy veto, protected paths, capability match, owner gate)
 *   in governance.mjs / energy-* / role-registry always wins.
 * - Falls back to deterministic math-bridge scoring + role-registry when:
 *     - weights are cold (default random-ish)
 *     - confidence is low
 *     - any hard gate would fail
 *
 * The MLP learns from (features, route decision, outcome) tuples stored in prediction-ledger
 * and work-ledger.
 *
 * Usage:
 *   import { extractFeatures, predictRoute, updateFromOutcome, saveWeights, loadWeights } from './fleet-router-mlp.mjs';
 *
 *   const features = extractFeatures(task, {poolState, history});
 *   const decision = predictRoute(features, candidates);   // candidates = glmLeaves or nativeSpecs or role casts
 *   ...
 *   updateFromOutcome(features, decision, outcome);
 *
 * Weights live in _SYSTEM/state/fleet-router-weights.json (gitignored).
 */

// ---------------------------------------------------------------------------
// Feature schema (keep this small and stable at first)
// Index order matters for the weight matrices.

export const FEATURE_NAMES = [
  'complexity',            // 0-1 from SmartRouter or heuristic
  'blastRadius',           // 0=LOW, 0.5=MEDIUM, 1=HIGH (numeric)
  'capabilityMatch',       // 0-1 from role-registry match
  'historicalSuccess',     // rolling success rate for (role, substrate) 0-1
  'quotaPressure',         // 0=plenty, 1=near cap (higher = prefer cheaper lane)
  'evidenceDecidability',  // 0-1 (from governance pre-filter)
  'expectedToolTurns',     // rough: prompt length + role archetype → expected iterations
  'recursionDepth',        // 0 for leaf, 1-5 for sub-orchestration
  'isHeavyReasoning',      // 1 if role is adjudicator/architect/deliberator etc.
  'isBulkCensus',          // 1 for scout/artificer bulk work
  'isSecurityAudit',       // 1 for sentinel
  'isNativeOnly',          // 1 if task requires MCP/browser/computer-use
];

export const NUM_FEATURES = FEATURE_NAMES.length;

// ---------------------------------------------------------------------------
// Small MLP: 12 inputs → 8 hidden (ReLU) → 1 output (suitability score)
// We treat routing as "score every candidate and pick the best".

const HIDDEN_SIZE = 8;

function initWeights() {
  // Xavier-ish init with small random values for cold start.
  const rng = mulberry32(0xC0FFEE);
  const w1 = Array.from({ length: NUM_FEATURES }, () =>
    Array.from({ length: HIDDEN_SIZE }, () => (rng() - 0.5) * 0.8)
  );
  const b1 = Array.from({ length: HIDDEN_SIZE }, () => (rng() - 0.5) * 0.2);
  const w2 = Array.from({ length: HIDDEN_SIZE }, () => (rng() - 0.5) * 0.8);
  const b2 = (rng() - 0.5) * 0.2;

  return { w1, b1, w2, b2, version: 1 };
}

let _weights = null;

export async function loadWeights() {
  if (_weights) return _weights;
  try {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(WEIGHTS_PATH, 'utf8');
    _weights = JSON.parse(raw);
    return _weights;
  } catch {
    _weights = initWeights();
    return _weights;
  }
}

export async function saveWeights(w = null) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const toSave = w || loadWeights();
  mkdirSync(dirname(WEIGHTS_PATH), { recursive: true });
  writeFileSync(WEIGHTS_PATH, JSON.stringify(toSave, null, 2));
  _weights = toSave;
}

const WEIGHTS_PATH = '_SYSTEM/state/fleet-router-weights.json';

// ---------------------------------------------------------------------------
// Math helpers (pure, deterministic when seeded)

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function relu(x) {
  return x > 0 ? x : 0;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function forward(features, w) {
  const { w1, b1, w2, b2 } = w;
  const h = new Array(HIDDEN_SIZE);
  for (let j = 0; j < HIDDEN_SIZE; j++) {
    let s = b1[j];
    for (let i = 0; i < NUM_FEATURES; i++) s += features[i] * w1[i][j];
    h[j] = relu(s);
  }
  let out = b2;
  for (let j = 0; j < HIDDEN_SIZE; j++) out += h[j] * w2[j];
  return { score: out, hidden: h };
}

// ---------------------------------------------------------------------------
// Feature extraction (heuristic v1 – improve over time with real data)

export function extractFeatures(task = {}, context = {}) {
  const f = new Array(NUM_FEATURES).fill(0);

  // complexity
  const c = task.complexity ?? context.complexity ?? 0.5;
  f[0] = clamp01(c);

  // blast
  const blast = String(task.blastRadius || context.blast || 'LOW').toUpperCase();
  f[1] = blast === 'HIGH' ? 1 : blast === 'MEDIUM' ? 0.5 : 0;

  // capabilityMatch (if pre-computed by role-registry)
  f[2] = clamp01(task.capabilityMatch ?? context.capabilityMatch ?? 0.7);

  // historicalSuccess – look up from context or default to neutral
  f[3] = clamp01(context.historicalSuccess ?? 0.6);

  // quotaPressure – higher means we should prefer cheaper bulk lanes
  f[4] = clamp01(context.quotaPressure ?? 0.3);

  // evidenceDecidability
  f[5] = clamp01(task.evidenceDecidability ?? context.evidenceDecidability ?? 0.8);

  // expectedToolTurns (rough)
  const promptLen = (task.prompt || '').length;
  f[6] = clamp01(Math.min(1, promptLen / 1200 + (context.roleHeavy ? 0.3 : 0)));

  // recursionDepth
  f[7] = clamp01((task.recursionDepth ?? context.recursionDepth ?? 0) / 5);

  // role signals (can be overridden by context)
  const role = (task.role || context.role || '').toLowerCase();
  f[8] = /adjudicator|architect|deliberator|helmsman/.test(role) ? 1 : 0;
  f[9] = /scout|artificer|bulk/.test(role) ? 1 : 0;
  f[10] = /sentinel|security/.test(role) ? 1 : 0;

  // isNativeOnly (MCP/browser etc.)
  f[11] = context.requiresNativeTools ? 1 : 0;

  return f;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

// ---------------------------------------------------------------------------
// Candidate scoring

/**
 * Score a list of routing candidates.
 * Each candidate should have at minimum: { id, substrate?, lane?, role? }
 * Returns { ranked: [{id, score, substrate, lane, role}], best, confidence }
 */
export async function predictRoute(features, candidates = [], opts = {}) {
  const w = await loadWeights();
  const scored = candidates.map((c) => {
    const optionVec = encodeOption(c);
    // Condition on candidate: blend task features with substrate option signal
    const conditioned = features.map((v, i) => {
      if (i < optionVec.length) return clamp01(v * 0.85 + optionVec[i] * 0.15);
      return v;
    });
    const { score } = forward(conditioned, w);
    // Small bias based on substrate preference (cheap first when pressure high)
    let bias = 0;
    const sub = (c.substrate || c.target?.substrate || '').toLowerCase();
    const pressure = features[4] || 0;
    if (pressure > 0.6 && (sub.includes('ollama') || sub.includes('flash'))) bias += 0.15;
    if (pressure < 0.3 && sub.includes('glm-max')) bias += 0.1;
    return {
      id: c.id || c.label,
      score: score + bias,
      substrate: sub || c.substrate,
      lane: c.lane || c.target?.lane,
      role: c.role,
      raw: c,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const confidence = scored.length > 1
    ? clamp01((best.score - scored[1].score) / (Math.abs(best.score) + 1e-6))
    : 0.6;

  return {
    ranked: scored,
    best: best ? { id: best.id, substrate: best.substrate, lane: best.lane, role: best.role } : null,
    confidence,
    method: 'mlp-v1',
  };
}

// Very small option encoding (can be expanded)
function encodeOption(c) {
  const sub = (c.substrate || c.target?.substrate || '').toLowerCase();
  return [
    sub.includes('native') ? 1 : 0,
    sub.includes('glm') ? 1 : 0,
    sub.includes('ollama') ? 1 : 0,
  ];
}

// ---------------------------------------------------------------------------
// Training / update (online, very lightweight for now)

export async function updateFromOutcome(features, decision, outcome, opts = {}) {
  // outcome example:
  // { success: 0|1, quality: 0-1, cost: number, timeMs: number, converged: bool }
  const w = await loadWeights();
  const lr = opts.learningRate ?? 0.02;

  const target = (outcome.success ?? (outcome.converged ? 1 : 0)) * (outcome.quality ?? 0.8);

  // Forward
  const { score, hidden } = forward(features, w);

  const err = target - score;

  // Output layer
  for (let j = 0; j < HIDDEN_SIZE; j++) {
    w.w2[j] += lr * err * hidden[j];
  }
  w.b2 += lr * err;

  // Hidden layer (very rough)
  for (let j = 0; j < HIDDEN_SIZE; j++) {
    const delta = err * w.w2[j] * (hidden[j] > 0 ? 1 : 0);
    w.b1[j] += lr * delta * 0.5;
    for (let i = 0; i < NUM_FEATURES; i++) {
      w.w1[i][j] += lr * delta * features[i];
    }
  }

  await saveWeights(w);
  return { updated: true, error: err };
}

// ---------------------------------------------------------------------------
// Convenience: current deterministic fallback (thin wrapper around existing logic)

export function deterministicScore(candidates, context = {}) {
  // Very light – in real use call the existing math-bridge.scoreOptions + role match
  return candidates.map((c, i) => ({
    id: c.id || c.label,
    score: 0.5 + (context.historicalSuccess || 0) * 0.3 - (i * 0.02),
    substrate: c.substrate || c.target?.substrate,
    lane: c.lane || c.target?.lane,
    role: c.role,
  })).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// CLI for quick inspection

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`fleet-router-mlp
  --demo               Run a tiny demo with fake audit features
  --save               Force save current (possibly random) weights
  --weights            Print current weights summary
`);
    process.exit(0);
  }

  if (args.includes('--demo')) {
    const { predictRoute, extractFeatures } = await import('./fleet-router-mlp.mjs');
    const fakeTask = { id: 'V1', role: 'adjudicator', blastRadius: 'LOW', prompt: 'git history + settings.json audit...' };
    const ctx = { complexity: 0.8, historicalSuccess: 0.65, quotaPressure: 0.4, evidenceDecidability: 0.9 };
    const feats = extractFeatures(fakeTask, ctx);
    const cands = [
      { id: 'V1-glm', substrate: 'glm', lane: 'glm-max', role: 'adjudicator' },
      { id: 'V1-native', substrate: 'native', lane: 'sonnet', role: 'adjudicator' },
      { id: 'V1-ollama', substrate: 'ollama', lane: 'flash', role: 'adjudicator' },
    ];
    const res = predictRoute(feats, cands);
    console.log('DEMO ROUTE:', JSON.stringify(res, null, 2));
    process.exit(0);
  }

  if (args.includes('--weights')) {
    const w = await loadWeights();
    console.log('version:', w.version);
    console.log('hidden size:', HIDDEN_SIZE);
    console.log('w2 sample:', w.w2.slice(0, 3));
    process.exit(0);
  }

  if (args.includes('--save')) {
    await saveWeights();
    console.log('weights saved to', WEIGHTS_PATH);
    process.exit(0);
  }

  console.log('Use --demo, --weights, or --save. See --help.');
}

// ---------------------------------------------------------------------------
// Small helper to avoid top-level await issues in some environments
function requireOrImportFs() {
  // Works in both ESM direct run and when imported
  try {
    // @ts-ignore
    return require('node:fs');
  } catch {
    // dynamic import will be handled by caller if needed
    return null;
  }
}
