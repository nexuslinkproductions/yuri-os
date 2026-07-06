#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
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

// He/Kaiming-uniform input-layer scale: a = sqrt(6 / fan_in). Wider than the old
// 0.8 Xavier-ish range so pre-activations carry enough variance to keep ReLU
// units alive instead of collapsing to a permanent 0 (dead-ReLU gradient stall).
const HE_SCALE = Math.sqrt(6 / NUM_FEATURES);

function initWeights() {
  // He/Kaiming-uniform init with a small POSITIVE hidden bias so ReLU units
  // start active. The old (rng()-0.5)*0.2 bias landed ~half negative; with
  // sparse binary features the pre-activation then stayed ≤0 → hidden[j]=0
  // → delta=0 → no update → flat training error. Positive bias + He scaling
  // keeps the gradient flowing from epoch 1.
  const rng = mulberry32(0xC0FFEE);
  const w1 = Array.from({ length: NUM_FEATURES }, () =>
    Array.from({ length: HIDDEN_SIZE }, () => (rng() - 0.5) * 2 * HE_SCALE)
  );
  const b1 = Array.from({ length: HIDDEN_SIZE }, () => rng() * 0.25); // [0, 0.25) positive
  const w2 = Array.from({ length: HIDDEN_SIZE }, () => (rng() - 0.5) * 2 * HE_SCALE);
  const b2 = (rng() - 0.5) * 0.2;

  return { w1, b1, w2, b2, version: 2 };
}

let _weights = null;

// Dry-run (advisory) weight accumulator. In persist=false mode each call used
// to clone fresh singleton weights, update the throwaway clone, and discard it
// — so multi-epoch dry training never accumulated and the error stayed
// perfectly flat (the root cause of the 0.2793×4 baseline). This scratch copy
// persists across calls within a process so dry runs actually learn. It seeds
// from the current singleton on first use; set back to null to reseed.
let _scratchWeights = null;
// Expose the scratch accumulator so the trainer can report dual-Brier:
//   singleton (loadWeights) → persisted-model generalization quality,
//   scratch (getScratchWeights) → post-training fit quality.
// Returns null until updateFromOutcome has run at least once in this process
// (i.e. no dry-training has happened yet), matching the "no scratch yet" case.
export function getScratchWeights() {
  return _scratchWeights;
}

export async function loadWeights() {
  // loadWeights returns the on-disk singleton — a --dry run must have zero
  // side effects on the persisted model, so held-out eval against the
  // singleton measures generalization (the model quality that ships). The
  // scratch accumulator is mutated by updateFromOutcome during dry training
  // and is surfaced separately via getScratchWeights() so the trainer can
  // report dual-Brier: singleton Brier = generalization, scratch Brier =
  // post-training fit. The decreasing scratch *training* error proves the
  // multi-epoch mechanism works; the singleton/scratch gap signals overfit.
  if (_weights) return _weights;
  try {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(WEIGHTS_PATH, 'utf8');
    _weights = JSON.parse(raw); if (_weights.version !== 2) _weights = initWeights();
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

// Numerically stable logistic sigmoid. Maps the raw MLP score to a (0,1)
// probability so the training residual stays bounded in [-1,1] (matching the
// [0,1] target) instead of growing unbounded on the raw linear output.
function sigmoid(x) {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

// Exported for held-out eval Brier computation (train-fleet-router-from-ledger.mjs).
// Pure + deterministic: given feature vector + weights → { score, hidden }.
export function forward(features, w) {
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

// ---------------------------------------------------------------------------
// Substrate vocabulary (shared with the candidate builder in company.mjs).
// Near-equivalents are grouped into one bucket each, keeping the conditioning
// vector compact (≤ NUM_FEATURES) instead of 12+ sparse one-hot dimensions.
// Index order is stable and load-bearing: encodeOption[i] ↔ SUBSTRATE_BUCKETS[i].
export const SUBSTRATE_BUCKETS = [
  'native',            // omp_task — primary OMP worker substrate
  'glm-heavy',         // glm-max, tmux-zai, cline (all run glm-5.2) — orchestrator-peer / architecture
  'glm-workhorse',     // glm, glm_fleet (umbrella) — code-gen / refactor workhorse
  'glm-fast',          // glm-flash, glm-turbo — fast bulk / reactive
  'ollama-flash',      // ollama-flash, ollama_cloud (umbrella) — default bulk
  'ollama-specialist', // ollama-minimax — specialist tier
  'mimo',              // mimo substrates (Anthropic-protocol)
  'cursor',            // cursor substrate
];

// Map a candidate's raw substrate (+lane, where the specific tier usually
// lives) onto one canonical bucket. Robust to both umbrella names (glm_fleet,
// ollama_cloud) and explicit sub-lanes (glm-max, tmux-zai, ollama-minimax).
function classifySubstrate(substrate, lane) {
  const s = String(substrate || '').toLowerCase();
  const l = String(lane || '').toLowerCase();
  const combined = `${s} ${l}`;
  if (s === 'omp_task' || s.includes('native') || s === 'omp') return 'native';
  if (combined.includes('glm-max') || combined.includes('tmux-zai') || combined.includes('cline') || combined.includes('glm-5.2') || combined.includes('glm-heavy')) return 'glm-heavy';
  if (combined.includes('glm-flash') || combined.includes('glm-turbo')) return 'glm-fast';
  if (combined.includes('glm')) return 'glm-workhorse';
  if (combined.includes('minimax')) return 'ollama-specialist';
  if (combined.includes('ollama')) return 'ollama-flash';
  if (s.includes('mimo')) return 'mimo';
  if (s.includes('cursor')) return 'cursor';
  return 'native';
}

// One-hot option encoding over the full substrate vocabulary. Returns a
// SUBSTRATE_BUCKETS.length vector with a single 1 at the matched bucket.
// Feeds the conditioning blend in predictRoute (optionVec.length ≤ NUM_FEATURES).
function encodeOption(c) {
  const sub = c.substrate || c.target?.substrate || '';
  const lane = c.lane || c.target?.lane || '';
  const bucket = classifySubstrate(sub, lane);
  const vec = new Array(SUBSTRATE_BUCKETS.length).fill(0);
  const idx = SUBSTRATE_BUCKETS.indexOf(bucket);
  if (idx >= 0) vec[idx] = 1;
  return vec;
}

// ---------------------------------------------------------------------------
// Training / update (online, very lightweight for now)

export async function updateFromOutcome(features, decision, outcome, opts = {}) {
  // outcome example:
  // { success: 0|1, quality: 0-1, cost: number, timeMs: number, converged: bool }
  //
  // When persist === true, mutate the live singleton directly. When false
  // (advisory / dry-run), accumulate into the module-level scratch copy so
  // consecutive calls (multi-epoch training) build on each other instead of
  // re-cloning the unchanged singleton every time and discarding the update —
  // that throwaway-clone behaviour was the root cause of the flat-training bug
  // (every epoch recomputed identical pre-update errors on the same weights).
  const persist = opts.persist !== false;
  const liveWeights = await loadWeights();
  let w;
  if (persist) {
    w = liveWeights;
  } else {
    if (!_scratchWeights) _scratchWeights = structuredClone(liveWeights);
    w = _scratchWeights;
  }
  const lr = opts.learningRate ?? 0.02;
  // L2 weight decay keeps logits bounded so held-out predictions stay
  // calibrated instead of collapsing to confident-wrong extremes (which
  // exploded Brier on this small 68-example training set).
  const decay = opts.weightDecay ?? 0.1;
  const wd = lr * decay;

  const target = (outcome.success ?? (outcome.converged ? 1 : 0)) * (outcome.quality ?? 0.8);

  // Forward
  const { score, hidden } = forward(features, w);

  // Train in probability space: the raw `score` is an unbounded logit while
  // targets live in [0,1], so a raw residual (target - score) grows large and
  // pushes weights straight past the target → overshoot → mean|err| climbs
  // across epochs. Sigmoid-bounding gives a cross-entropy-style gradient
  // signal bounded in [-1,1] that actually converges. forward() still returns
  // the raw score (unchanged contract); the squash is training-local.
  const err = target - sigmoid(score);

  // Snapshot w2 BEFORE the output-layer update. The hidden-layer backprop
  // delta must use PRE-update output weights: feeding the just-mutated w2
  // into its own gradient is positive feedback (err up across epochs →
  // divergence). Standard backprop uses the forward-pass weights for both
  // layers' deltas.
  const w2Snapshot = w.w2.slice();

  // Output layer (+ L2 decay)
  for (let j = 0; j < HIDDEN_SIZE; j++) {
    w.w2[j] = w.w2[j] * (1 - wd) + lr * err * hidden[j];
  }
  w.b2 = w.b2 * (1 - wd) + lr * err;

  // Hidden layer (+ L2 decay); uses the PRE-update w2 snapshot. Clamp the
  // delta to [-1,1] as a cheap safety net against outlier-driven blowups
  // (err and w2Snapshot[j] are each individually bounded, but their product
  // can still spike on rare large-magnitude pre-update weights).
  for (let j = 0; j < HIDDEN_SIZE; j++) {
    let delta = err * w2Snapshot[j] * (hidden[j] > 0 ? 1 : 0);
    if (delta > 1) delta = 1; else if (delta < -1) delta = -1;
    w.b1[j] = w.b1[j] * (1 - wd) + lr * delta * 0.5;
    for (let i = 0; i < NUM_FEATURES; i++) {
      w.w1[i][j] = w.w1[i][j] * (1 - wd) + lr * delta * features[i];
    }
  }

  if (persist) await saveWeights(w);
  return { updated: true, error: err, persisted: persist };
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
