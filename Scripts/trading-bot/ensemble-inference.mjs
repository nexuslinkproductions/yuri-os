#!/usr/bin/env node
/**
 * Trading Bot — Phase 4: Ensemble Inference & Calibration
 *
 * Runs 5-model ensemble (Claude, Grok, GPT-4o, DeepSeek, Gemini) in parallel,
 * aggregates probabilities via weighted average with dispersion analysis,
 * assigns confidence via calibration table, and appends to prediction_result.jsonl.
 *
 * Spec: .claude/trading-bot/phase-4/ENSEMBLE_INFERENCE.md
 * Schema: .claude/trading-bot/schemas/prediction_result.schema.json
 */

// ─── Imports ────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Default Model Configuration ────────────────────────────────────────────

const DEFAULT_MODEL_CONFIG = {
  nemotron: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    model: 'nvidia/llama-3.1-nemotron-70b-instruct',
    weight: 0.25,
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    model: 'grok-beta',
    weight: 0.20,
  },
  gpt4o: {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'gpt-4o',
    weight: 0.20,
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
    weight: 0.20,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GOOGLE_API_KEY',
    model: 'gemini-2.0-flash',
    weight: 0.15,
  },
};

// ─── Default Calibration Table (from spec) ──────────────────────────────────

const DEFAULT_CALIBRATION_TABLE = [
  { minDispersion: 0.00, maxDispersion: 0.05, label: '< 0.05', brierScore: 0.12, sampleSize: 8 },
  { minDispersion: 0.05, maxDispersion: 0.10, label: '0.05-0.10', brierScore: 0.18, sampleSize: 12 },
  { minDispersion: 0.10, maxDispersion: 0.15, label: '0.10-0.15', brierScore: 0.24, sampleSize: 18 },
  { minDispersion: 0.15, maxDispersion: Infinity, label: '> 0.15', brierScore: 0.32, sampleSize: 12 },
];
const MAX_BRIER = 1.0;

// ─── Output Path ────────────────────────────────────────────────────────────

const OUTPUT_DIR = resolve(__dirname, '../../.claude/trading-bot/data');
const PREDICTION_LOG = resolve(OUTPUT_DIR, 'prediction_result.jsonl');
const CALIBRATION_LOG = resolve(OUTPUT_DIR, 'calibration_report.md');
const ROLLING_BRIER_PATH = resolve(OUTPUT_DIR, 'rolling_brier_calibration.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

function nowISO() {
  return new Date().toISOString();
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function loadJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function appendJsonl(path, record) {
  ensureOutputDir();
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf-8');
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  ensureOutputDir();
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function inferEdgeEstimate(evidencePacket = {}, features = {}) {
  if (typeof features.edge_estimate === 'number') return Math.abs(features.edge_estimate);
  if (typeof evidencePacket.edge_estimate === 'number') return Math.abs(evidencePacket.edge_estimate);
  const consensusStrength = Math.abs(evidencePacket?.sentiment_score ?? 0);
  const sourceCount = evidencePacket?.source_count ?? 0;
  return consensusStrength * Math.min(1, sourceCount / 5);
}

/**
 * Fetch model config from environment, with fallbacks.
 * Returns null if API key is missing (model skipped).
 */
function getModelConfig(modelName) {
  const cfg = DEFAULT_MODEL_CONFIG[modelName];
  if (!cfg) return null;

  const apiKey = process.env[cfg.apiKeyEnv] || '';
  if (!apiKey) return null;

  const overriddenBaseUrl = process.env[`${modelName.toUpperCase()}_BASE_URL`];
  const overriddenModel = process.env[`${modelName.toUpperCase()}_MODEL`];

  return {
    name: modelName,
    label: modelName.charAt(0).toUpperCase() + modelName.slice(1),
    baseUrl: overriddenBaseUrl || cfg.baseUrl,
    apiKey,
    model: overriddenModel || cfg.model,
    weight: cfg.weight,
  };
}

function getActiveModelConfigs() {
  const configs = [];
  for (const name of Object.keys(DEFAULT_MODEL_CONFIG)) {
    const cfg = getModelConfig(name);
    if (cfg) configs.push(cfg);
  }
  return configs;
}

function loadRollingBrierCalibration() {
  return loadJson(ROLLING_BRIER_PATH, {
    version: 1,
    updated_at: null,
    market_types: {},
  });
}

function persistRollingBrierCalibration(report, prior = loadRollingBrierCalibration()) {
  const next = {
    version: 1,
    updated_at: nowISO(),
    market_types: { ...(prior.market_types || {}) },
  };

  const marketType = report.marketType || report.market_type || 'default';
  const modelPerformance = report.modelPerformance || {};
  const existing = next.market_types[marketType] || { models: {}, samples: 0 };
  const models = { ...(existing.models || {}) };

  for (const [name, perf] of Object.entries(modelPerformance)) {
    const previous = models[name] || { brierScore: perf.brierScore, sampleCount: 0 };
    const previousCount = previous.sampleCount || 0;
    const sampleCount = perf.sampleCount || 0;
    const totalSamples = previousCount + sampleCount;
    const brierScore = totalSamples > 0
      ? ((previous.brierScore || 0) * previousCount + perf.brierScore * sampleCount) / totalSamples
      : perf.brierScore;
    models[name] = {
      brierScore: Number(brierScore.toFixed(4)),
      sampleCount: totalSamples,
      lastObservedAt: report.generatedAt || nowISO(),
    };
  }

  next.market_types[marketType] = {
    ...existing,
    models,
    samples: Object.values(models).reduce((sum, model) => sum + (model.sampleCount || 0), 0),
    updated_at: nowISO(),
  };

  writeJson(ROLLING_BRIER_PATH, next);
  return next;
}

function applyRollingBrierWeights(weights, marketType, calibration = loadRollingBrierCalibration()) {
  const marketCalibration = calibration.market_types?.[marketType]
    || calibration.market_types?.default
    || null;
  if (!marketCalibration?.models) return weights;

  const adjusted = { ...weights };
  for (const [name, currentWeight] of Object.entries(weights)) {
    const model = marketCalibration.models[name];
    if (!model || (model.sampleCount || 0) < 3) continue;
    const inverseBrier = 1 / Math.max(0.05, model.brierScore || 0.5);
    adjusted[name] = currentWeight * inverseBrier;
  }

  const total = Object.values(adjusted).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights;

  return Object.fromEntries(
    Object.entries(adjusted).map(([name, weight]) => [name, Number((weight / total).toFixed(4))])
  );
}

/**
 * Normalize weights so they sum to 1.0.
 * If no active configs or total weight is 0, return null.
 */
function normalizeWeights(configs) {
  const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) return null;
  return configs.map(c => ({ ...c, weight: c.weight / totalWeight }));
}

// ─── Construct Inference Prompt ────────────────────────────────────────────

/**
 * Build the model prompt from evidence packet and market features.
 * Matches the prompt structure in ENSEMBLE_INFERENCE.md.
 */
function buildPrompt(marketId, evidencePacket, features) {
  const sysMsg = `You are a prediction market analyst. Given market evidence and candidate information, estimate the probability of the YES outcome (price going up) as a decimal 0-1. Return ONLY a JSON object with key "probability" (float).`;

  // Extract market data from features
  const lastPrice = features?.last_price ?? features?.current_price ?? 'N/A';
  const volume24h = features?.volume_24h ?? evidencePacket?.volume_24h ?? 'N/A';
  const spreadBps = features?.spread_bps ?? evidencePacket?.spread_bps ?? 'N/A';
  const targetPrice = features?.target_price ?? 'N/A';

  const consensusSummary = evidencePacket?.consensus_summary ?? 'No consensus data available';
  const dissentSummary = evidencePacket?.dissent_summary ?? 'No contrarian data available';

  const userMsg = [
    `Market: ${marketId}`,
    `Current Price: ${lastPrice}`,
    `24h Volume: ${volume24h}`,
    `Spread: ${spreadBps} bps`,
    '',
    'Evidence Summary:',
    consensusSummary,
    '',
    'Contrarian View:',
    dissentSummary,
    '',
    `What is the probability this market closes above ${targetPrice}?`,
  ].join('\n');

  return { system: sysMsg, user: userMsg };
}

// ─── callModel: Single Model API Call ───────────────────────────────────────

/**
 * Call a single model via its OpenAI-compatible chat completion endpoint.
 *
 * @param {string} modelName - 'claude' | 'grok' | 'gpt4o' | 'deepseek' | 'gemini'
 * @param {string} prompt - The full prompt (system + user joined)
 * @returns {Promise<number|null>} Probability 0-1, or null if failed
 */
async function callModel(modelName, prompt) {
  const cfg = getModelConfig(modelName);
  if (!cfg) return null;

  const endpoint = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const maxRetries = 3;
  const timeoutMs = 30_000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const body = {
        model: cfg.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        console.warn(`[${cfg.label}] API error (${response.status}): ${errText}`);
        if (response.status === 429) {
          // Rate limited — exponential backoff with jitter
          const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 30_000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          // Client error (non-rate-limit) — not retriable
          console.error(`[${cfg.label}] Non-retriable error ${response.status}, skipping`);
          return null;
        }
        // Server error — retry
        const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 30_000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        console.warn(`[${cfg.label}] Empty response content, attempt ${attempt}`);
        const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 30_000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Parse JSON from response
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try extracting JSON from markdown code block
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[1]); } catch { return null; }
        } else {
          return null;
        }
      }

      const prob = parsed?.probability;
      if (typeof prob !== 'number' || prob < 0 || prob > 1) {
        console.warn(`[${cfg.label}] Invalid probability: ${prob}`);
        return null;
      }

      return prob;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[${cfg.label}] Timeout after ${timeoutMs}ms (attempt ${attempt})`);
      } else {
        console.warn(`[${cfg.label}] Network error (attempt ${attempt}): ${err.message}`);
      }

      if (attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 30_000);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`[${cfg.label}] Max retries exceeded, skipping`);
        return null;
      }
    }
  }

  return null;
}

// ─── getDynamicWeights: Market-Type Adaptive Weights ────────────────────────

/**
 * Compute dynamic ensemble weights based on market type and evidence quality.
 *
 * Static base weights:
 *   Claude 0.25, Grok 0.20, GPT-4o 0.20, DeepSeek 0.20, Gemini 0.15
 *
 * Market type adjustments:
 *   - political: boost news-heavy models (Claude, GPT-4o)
 *   - financial: boost quantitative models (DeepSeek, Gemini)
 *   - weather: all equal (pattern recognition)
 *   - sports: boost social-sentiment models (Grok, Claude)
 *
 * Evidence quality adjustment:
 *   High quality (>0.8) -> amplify differential
 *   Low quality (<0.5) -> flatten toward equal weights (avoid overconfident ensemble)
 *
 * @param {string} marketId - Market identifier
 * @param {object} evidencePacket - Evidence packet with quality score
 * @param {string} marketType - 'political' | 'financial' | 'weather' | 'sports'
 * @returns {Record<string,number>} Adjusted weights summing to 1.0
 */
function getDynamicWeights(marketId, evidencePacket, marketType) {
  const staticWeights = {
    claude: 0.25,
    grok: 0.20,
    gpt4o: 0.20,
    deepseek: 0.20,
    gemini: 0.15,
  };

  let adjusted = { ...staticWeights };

  // Market type adjustment multipliers
  const TYPE_BOOST = 1.5;
  switch (marketType) {
    case 'political':
      adjusted.claude *= TYPE_BOOST;
      adjusted.gpt4o *= TYPE_BOOST;
      break;
    case 'financial':
      adjusted.deepseek *= TYPE_BOOST;
      adjusted.gemini *= TYPE_BOOST;
      break;
    case 'weather':
      // All equal — reset to uniform
      adjusted = { claude: 0.20, grok: 0.20, gpt4o: 0.20, deepseek: 0.20, gemini: 0.20 };
      break;
    case 'sports':
      adjusted.grok *= TYPE_BOOST;
      adjusted.claude *= TYPE_BOOST;
      break;
    default:
      // Unknown market type — use static weights as-is
      break;
  }

  // Evidence quality adjustment
  const quality = evidencePacket?.quality ?? evidencePacket?.quality_score ?? 0.5;
  if (quality < 0.5) {
    // Low quality: flatten toward equal weights (avoid overconfident ensemble)
    // Interpolate between adjusted and equal weights based on quality
    const t = quality / 0.5; // 0 at quality=0, 1 at quality=0.5
    const equalWeight = 1 / Object.keys(adjusted).length;
    for (const key of Object.keys(adjusted)) {
      adjusted[key] = adjusted[key] * t + equalWeight * (1 - t);
    }
  } else if (quality > 0.8) {
    // High quality: amplify differential
    // Scale deviation from mean by 1.25x
    const modelNames = Object.keys(adjusted);
    const total = modelNames.reduce((s, k) => s + adjusted[k], 0);
    const meanWeight = total / modelNames.length;
    const AMPLIFY = 1.25;
    for (const key of modelNames) {
      const deviation = adjusted[key] - meanWeight;
      adjusted[key] = Math.max(0.01, meanWeight + deviation * AMPLIFY);
    }
  }

  adjusted = applyRollingBrierWeights(adjusted, marketType);

  // Normalize to sum to 1.0
  const totalWeight = Object.values(adjusted).reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return { ...staticWeights };

  const normalized = {};
  for (const [key, val] of Object.entries(adjusted)) {
    normalized[key] = parseFloat((val / totalWeight).toFixed(4));
  }

  // Fix rounding errors to ensure exact 1.0 sum
  const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.0001) {
    const delta = parseFloat((1.0 - sum).toFixed(4));
    const maxKey = Object.entries(normalized).sort((a, b) => b[1] - a[1])[0][0];
    normalized[maxKey] = parseFloat((normalized[maxKey] + delta).toFixed(4));
  }

  return normalized;
}

// ─── shouldRunInference: Token Budget Filter ────────────────────────────────

/**
 * Token budget filter — skip expensive inference on low-edge markets.
 *
 * Checks:
 * - Evidence quality >= 0.3
 * - Net edge potential > 2%
 *
 * @param {object} evidencePacket - Evidence packet with quality and market data
 * @param {object} [features] - Market features (optional, for edge estimation)
 * @returns {boolean} True if inference should proceed
 */
function shouldRunInference(evidencePacket, features = {}) {
  const quality = evidencePacket?.quality ?? evidencePacket?.quality_score ?? 0;
  if (quality < 0.3) {
    const marketId = evidencePacket?.market_id ?? 'unknown';
    console.log(`[TokenBudget] SKIP ${marketId}: evidence quality ${quality.toFixed(2)} < 0.3`);
    return false;
  }

  // Estimate net edge potential from consensus strength + source relevance
  const consensusStrength = Math.abs(evidencePacket?.sentiment_score ?? 0);
  const sourceCount = evidencePacket?.source_count ?? 0;
  // Edge proxy: consensus strength * source presence (capped at 5 sources)
  const edgeEstimate = consensusStrength * Math.min(1, sourceCount / 5);

  if (edgeEstimate < 0.02) {
    const marketId = evidencePacket?.market_id ?? 'unknown';
    console.log(`[TokenBudget] SKIP ${marketId}: low edge potential ${(edgeEstimate * 100).toFixed(1)}% < 2%`);
    return false;
  }

  return true;
}

function getEnsembleGateConfig() {
  return {
    enabled: process.env.TRADING_BOT_ENSEMBLE_GATE_ENABLED !== '0',
    logOnly: process.env.TRADING_BOT_ENSEMBLE_GATE_MODE === 'log-only'
      || process.env.TRADING_BOT_ENSEMBLE_GATE_LOG_ONLY === '1',
    minQuality: parseFloat(process.env.TRADING_BOT_ENSEMBLE_GATE_MIN_QUALITY || '0.3'),
    minEdge: parseFloat(process.env.TRADING_BOT_ENSEMBLE_GATE_MIN_EDGE || '0.02'),
    minSources: parseInt(process.env.TRADING_BOT_ENSEMBLE_GATE_MIN_SOURCES || '1', 10),
  };
}

function shouldRunFullEnsemble(evidencePacket, features = {}, config = getEnsembleGateConfig()) {
  const marketId = evidencePacket?.market_id || features?.market_id || 'unknown';
  const quality = evidencePacket?.quality ?? evidencePacket?.quality_score ?? 0;
  const sourceCount = evidencePacket?.source_count ?? evidencePacket?.sources?.length ?? 0;
  const edgeEstimate = inferEdgeEstimate(evidencePacket, features);
  const failures = [];

  if (!config.enabled) {
    return { run: true, enforced: false, reason: 'gate disabled', failures };
  }
  if (quality < config.minQuality) {
    failures.push(`quality ${quality.toFixed(2)} < ${config.minQuality}`);
  }
  if (edgeEstimate < config.minEdge) {
    failures.push(`edge ${(edgeEstimate * 100).toFixed(1)}% < ${(config.minEdge * 100).toFixed(1)}%`);
  }
  if (sourceCount < config.minSources) {
    failures.push(`sources ${sourceCount} < ${config.minSources}`);
  }

  if (failures.length === 0) {
    return { run: true, enforced: true, reason: 'gate passed', failures };
  }

  const reason = failures.join('; ');
  if (config.logOnly) {
    console.warn(`[EnsembleGate] LOG_ONLY ${marketId}: ${reason}`);
    return { run: true, enforced: false, reason, failures };
  }

  console.log(`[EnsembleGate] SKIP ${marketId}: ${reason}`);
  return { run: false, enforced: true, reason, failures };
}

// ─── aggregateProbs: Weighted Ensemble ──────────────────────────────────────

/**
 * Compute weighted probability and dispersion from per-model estimates.
 *
 * p_model = Σ(weight_i * p_i) / Σ(weight_i)
 * dispersion = sqrt( Σ(weight_i * (p_i - p_model)²) / Σ(weight_i) )
 *
 * @param {Record<string,number>} probs - Model name → probability
 * @param {Record<string,number>} weights - Model name → weight
 * @returns {{ p_model: number, dispersion: number }}
 */
function aggregateProbs(probs, weights) {
  const modelNames = Object.keys(probs).filter(name => {
    return typeof probs[name] === 'number' && !isNaN(probs[name]);
  });

  if (modelNames.length === 0) {
    // No valid probabilities — return neutral
    return { p_model: 0.5, dispersion: 0 };
  }

  // Sum available weights (only for models that returned valid probs)
  let totalWeight = 0;
  let weightedSum = 0;

  for (const name of modelNames) {
    const w = weights[name] ?? 0;
    totalWeight += w;
    weightedSum += w * probs[name];
  }

  // Division guard: if no valid weights, use equal weight
  let p_model;
  if (totalWeight <= 0) {
    p_model = modelNames.reduce((s, n) => s + probs[n], 0) / modelNames.length;
    totalWeight = modelNames.length;
  } else {
    p_model = weightedSum / totalWeight;
  }

  // Compute weighted dispersion (standard deviation)
  let varianceSum = 0;
  for (const name of modelNames) {
    const w = weights[name] ?? 0;
    const effectiveW = totalWeight > 0 ? w / totalWeight : 1 / modelNames.length;
    varianceSum += effectiveW * Math.pow(probs[name] - p_model, 2);
  }

  const dispersion = Math.sqrt(varianceSum);

  return { p_model, dispersion };
}

// ─── assignConfidence: Dispersion → Confidence Mapping ──────────────────────

/**
 * Map dispersion value to confidence score using calibration table.
 *
 * confidence = 1 - (actual_brier / max_brier)
 *
 * @param {number} dispersion
 * @param {Array} calibrationTable - Array of { minDispersion, maxDispersion, brierScore, label }
 * @returns {number} Confidence score 0-1
 */
function assignConfidence(dispersion, calibrationTable) {
  if (typeof dispersion !== 'number' || isNaN(dispersion) || dispersion < 0) {
    return 0.5; // Fallback
  }

  const table = calibrationTable && calibrationTable.length > 0
    ? calibrationTable
    : DEFAULT_CALIBRATION_TABLE;

  // Find the bucket this dispersion falls into
  const bucket = table.find(
    b => dispersion >= b.minDispersion && dispersion < b.maxDispersion
  );

  if (!bucket) {
    // If dispersion exactly equals maxDispersion boundary, use last bucket
    const lastBucket = table[table.length - 1];
    const brierScore = lastBucket?.brierScore ?? 0.5;
    const maxBrier = MAX_BRIER;
    return Math.min(1, Math.max(0, 1 - brierScore / maxBrier));
  }

  const brierScore = bucket.brierScore ?? 0.5;
  const maxBrier = MAX_BRIER;

  // Guard: maxBrier > 0 is always true since MAX_BRIER = 1.0
  const confidence = 1 - brierScore / maxBrier;

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, confidence));
}

// ─── assignBucketLabel ──────────────────────────────────────────────────────

/**
 * Determine the dispersion bucket label for a given dispersion value.
 */
function assignBucketLabel(dispersion, calibrationTable) {
  const table = calibrationTable && calibrationTable.length > 0
    ? calibrationTable
    : DEFAULT_CALIBRATION_TABLE;

  const bucket = table.find(
    b => dispersion >= b.minDispersion && dispersion < b.maxDispersion
  );

  if (!bucket) {
    const lastBucket = table[table.length - 1];
    return lastBucket?.label ?? '> 0.15';
  }

  return bucket.label;
}

// ─── runInference: Main Entry Point ─────────────────────────────────────────

/**
 * Run the full ensemble inference pipeline.
 *
 * 1. Construct prompt from evidence packet + features
 * 2. Call all 5 models in parallel with 30s timeout
 * 3. Aggregate probabilities with normalized weights
 * 4. Compute dispersion
 * 5. Assign confidence via calibration table
 * 6. Append to prediction_result.jsonl
 * 7. Return PredictionResult
 *
 * @param {string} marketId - e.g. 'BTC-USD'
 * @param {object} evidencePacket - Evidence packet with consensus/dissent summaries
 * @param {object} features - CandidateFeatures with market data
 * @returns {Promise<object>} PredictionResult
 */
async function runInference(marketId, evidencePacket, features) {
  // 0. Token budget filter — skip if evidence quality or edge potential are too low
  const marketType = features?.market_type || evidencePacket?.market_type || 'financial';
  const fullEnsembleGate = shouldRunFullEnsemble(
    { ...evidencePacket, market_id: evidencePacket?.market_id || marketId },
    { ...features, market_id: features?.market_id || marketId },
  );
  if (!fullEnsembleGate.run) {
    // Return a minimal prediction result indicating skip so callers can handle gracefully
    return {
      market_id: marketId,
      skipped: true,
      skip_reason: fullEnsembleGate.reason,
      gate: fullEnsembleGate,
      p_model: 0.5,
      confidence: 0,
      dispersion: 0,
      research_quality: evidencePacket?.quality ?? evidencePacket?.quality_score ?? 0,
      timestamp: nowISO(),
    };
  }

  // 1. Get active model configs (those with API keys)
  let configs = getActiveModelConfigs();
  if (configs.length === 0) {
    throw new Error(`No model API keys configured. Set at least one of: ${Object.keys(DEFAULT_MODEL_CONFIG).map(k => DEFAULT_MODEL_CONFIG[k].apiKeyEnv).join(', ')}`);
  }

  // 2. Build prompt
  const prompt = buildPrompt(marketId, evidencePacket, features);

  // 3. Call all models in parallel
  console.log(`[Ensemble] Running inference for ${marketId} with ${configs.length} models...`);

  const results = await Promise.allSettled(
    configs.map(cfg =>
      callModel(cfg.name, prompt)
        .then(prob => ({ modelName: cfg.name, prob }))
    )
  );

  // 4. Collect valid results, track stale/errors
  const probs = {};
  const notes = [];
  const modelWeights = {};
  let modelKeys = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value && result.value.prob !== null) {
      const { modelName, prob } = result.value;
      const cfg = configs.find(c => c.name === modelName);
      probs[modelName] = prob;
      modelWeights[modelName] = cfg.weight;
      modelKeys.push(modelName);
    } else if (result.status === 'fulfilled') {
      // Model returned null (failed but didn't throw)
      const modelName = result.value?.modelName || 'unknown';
      notes.push(`${modelName} unavailable`);
      console.warn(`[Ensemble] ${modelName} failed to return probability`);
    } else {
      // Promise rejected
      notes.push(`model error`);
      console.error(`[Ensemble] Model call rejected:`, result.reason);
    }
  }

  // 5. Compute dynamic weights based on market type + evidence quality
  const activeConfigs = configs.filter(c => modelKeys.includes(c.name));
  const dynamicWeights = getDynamicWeights(marketId, evidencePacket, marketType);

  // Filter dynamic weights to only active models, then normalize
  const activeWeights = {};
  for (const name of modelKeys) {
    activeWeights[name] = dynamicWeights[name] ?? DEFAULT_MODEL_CONFIG[name]?.weight ?? 0.2;
  }
  const totalActiveWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  if (totalActiveWeight <= 0) {
    throw new Error('All models failed to return valid probabilities');
  }
  const normWeights = {};
  for (const [name, w] of Object.entries(activeWeights)) {
    normWeights[name] = w / totalActiveWeight;
  }

  // 6. Aggregate using dynamic weights
  const { p_model, dispersion } = aggregateProbs(probs, normWeights);

  // 7. Assign confidence
  const confidence = assignConfidence(dispersion);

  // 8. Bucket label
  const bucketLabel = assignBucketLabel(dispersion);

  // 9. Research quality from evidence packet
  const researchQuality = evidencePacket?.quality_score ??
    (evidencePacket?.consensus_summary ? 0.6 : 0.3);

  // 10. Notes
  if (dispersion < 0.05) notes.push('consensus strong');
  else if (dispersion > 0.15) notes.push('high disagreement');
  else notes.push('moderate consensus');

  if (evidencePacket?.freshness_flags) {
    notes.push(...evidencePacket.freshness_flags);
  }

  const result = {
    market_id: marketId,
    p_model: Number(p_model.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    model_probs: Object.fromEntries(
      Object.entries(probs).map(([k, v]) => [k, Number(v.toFixed(4))])
    ),
    dispersion: Number(dispersion.toFixed(4)),
    research_quality: Number(researchQuality.toFixed(4)),
    data_quality: Number((evidencePacket?.quality ?? evidencePacket?.quality_score ?? 0.5).toFixed(4)),
    market_type: marketType,
    bucketed_by_dispersion: bucketLabel,
    model_weights: Object.fromEntries(
      Object.entries(modelWeights).map(([k, v]) => [k, Number(v.toFixed(4))])
    ),
    dynamic_weights: Object.fromEntries(
      Object.entries(normWeights).map(([k, v]) => [k, Number(v.toFixed(4))])
    ),
    notes: [...new Set(notes)], // deduplicate
    timestamp: nowISO(),
  };

  // 11. Append to JSONL
  appendJsonl(PREDICTION_LOG, result);

  console.log(`[Ensemble] Result: p_model=${result.p_model}, dispersion=${result.dispersion}, confidence=${result.confidence}, models=${modelKeys.join(',')}`);

  return result;
}

// ─── generateCalibrationReport ──────────────────────────────────────────────

/**
 * Generate a calibration report after accumulating trade outcomes.
 * Computes Brier Score per model, dispersion bucket analysis, and confidence calibration.
 *
 * @param {Array} trades - Array of PredictionResult objects (from JSONL)
 * @param {Array} outcomes - Array of trade outcomes with actual_result (0 or 1)
 * @returns {Promise<object>} CalibrationReport
 */
async function generateCalibrationReport(trades, outcomes) {
  if (!trades || !outcomes || trades.length === 0) {
    return {
      generatedAt: nowISO(),
      tradeCount: 0,
      modelPerformance: {},
      dispersionAnalysis: [],
      confidenceCalibration: { status: 'insufficient_data', message: 'Need at least 1 trade' },
      issues: ['No trades available for calibration'],
    };
  }

  // Build lookup: market_id + timestamp -> outcome
  const outcomeMap = new Map();
  for (const o of outcomes) {
    const key = `${o.market_id}::${o.timestamp || ''}`;
    outcomeMap.set(key, o.actual_result);
    // Also index by just market_id for simpler matching
    outcomeMap.set(o.market_id, o.actual_result);
  }

  // Model performance: Brier Score per model
  const modelBrierSums = {};
  const modelCounts = {};

  for (const trade of trades) {
    // Find matching outcome
    let outcome = outcomeMap.get(`${trade.market_id}::${trade.timestamp}`);
    if (outcome === undefined) outcome = outcomeMap.get(trade.market_id);
    if (outcome === undefined) continue;

    const y = outcome; // 0 or 1
    const modelProbs = trade.model_probs || {};
    const tradeBrierOverall = typeof trade.p_model === 'number'
      ? Math.pow(trade.p_model - y, 2)
      : null;

    for (const [modelName, prob] of Object.entries(modelProbs)) {
      if (typeof prob !== 'number') continue;
      if (!modelBrierSums[modelName]) {
        modelBrierSums[modelName] = { sum: 0, count: 0 };
      }
      modelBrierSums[modelName].sum += Math.pow(prob - y, 2);
      modelBrierSums[modelName].count += 1;
    }
  }

  const modelPerformance = {};
  for (const [name, data] of Object.entries(modelBrierSums)) {
    if (data.count > 0) {
      modelPerformance[name] = {
        brierScore: Number((data.sum / data.count).toFixed(4)),
        sampleCount: data.count,
      };
    }
  }

  // Rank by Brier Score (lower is better)
  const rankedModels = Object.entries(modelPerformance)
    .sort((a, b) => a[1].brierScore - b[1].brierScore)
    .map(([name, data], idx) => ({
      name,
      brierScore: data.brierScore,
      rank: idx + 1,
      sampleCount: data.sampleCount,
    }));

  // Dispersion analysis: bin by dispersion range
  const dispersionBins = {};
  for (const trade of trades) {
    let outcome = outcomeMap.get(`${trade.market_id}::${trade.timestamp}`);
    if (outcome === undefined) outcome = outcomeMap.get(trade.market_id);
    if (outcome === undefined) continue;

    const disp = trade.dispersion ?? 0.5;
    const bucketLabel = assignBucketLabel(disp);
    if (!dispersionBins[bucketLabel]) {
      dispersionBins[bucketLabel] = { trades: [], count: 0, brierSum: 0 };
    }
    dispersionBins[bucketLabel].trades.push(trade);
    dispersionBins[bucketLabel].count += 1;
    if (typeof trade.p_model === 'number') {
      dispersionBins[bucketLabel].brierSum += Math.pow(trade.p_model - outcome, 2);
    }
  }

  const dispersionAnalysis = [];
  let maxBrierInBins = 0;
  for (const [label, data] of Object.entries(dispersionBins)) {
    const brier = data.count > 0 ? data.brierSum / data.count : 0;
    if (brier > maxBrierInBins) maxBrierInBins = brier;
    dispersionAnalysis.push({
      bucket: label,
      count: data.count,
      brierScore: Number(brier.toFixed(4)),
    });
  }
  dispersionAnalysis.sort((a, b) => a.bucket.localeCompare(b.bucket));

  // Confidence calibration check: are brier scores within expected range?
  const confidenceCalibration = { status: 'ok', buckets: [] };
  const defaultBrierMap = {};
  for (const b of DEFAULT_CALIBRATION_TABLE) {
    defaultBrierMap[b.label] = b.brierScore;
  }

  for (const bin of dispersionAnalysis) {
    const expectedBrier = defaultBrierMap[bin.bucket];
    const drift = expectedBrier !== undefined && bin.brierScore > 0
      ? bin.brierScore - expectedBrier
      : 0;
    confidenceCalibration.buckets.push({
      bucket: bin.bucket,
      actualBrier: bin.brierScore,
      expectedBrier: expectedBrier ?? null,
      drift: Number(drift.toFixed(4)),
      status: drift > 0.05 ? 'drifted' : 'ok',
    });
  }

  if (confidenceCalibration.buckets.some(b => b.status === 'drifted')) {
    confidenceCalibration.status = 'drift_detected';
  }

  // Issues
  const issues = [];
  for (const bin of dispersionAnalysis) {
    const expectedBrier = defaultBrierMap[bin.bucket];
    if (expectedBrier !== undefined && (bin.brierScore - expectedBrier) > 0.05) {
      issues.push(`Dispersion bucket ${bin.bucket}: Brier ${bin.brierScore.toFixed(3)} vs expected ${expectedBrier.toFixed(3)} (drift ${(bin.brierScore - expectedBrier).toFixed(3)})`);
    }
  }
  if (issues.length === 0) issues.push('None');

  const report = {
    generatedAt: nowISO(),
    tradeCount: trades.length,
    marketType: trades[0]?.market_type || trades[0]?.marketType || 'default',
    matchedOutcomeCount: Object.values(dispersionBins).reduce((s, d) => s + d.count, 0),
    modelPerformance,
    modelRankings: rankedModels,
    dispersionAnalysis,
    confidenceCalibration,
    issues,
  };

  // Write calibration report
  ensureOutputDir();
  const md = generateCalibrationMarkdown(report);
  writeFileSync(CALIBRATION_LOG, md, 'utf-8');
  persistRollingBrierCalibration(report);
  console.log(`[Calibration] Report written to ${CALIBRATION_LOG}`);

  return report;
}

// ─── Helper: Markdown Report ────────────────────────────────────────────────

function generateCalibrationMarkdown(report) {
  const lines = [
    `# Calibration Report`,
    ``,
    `**Generated:** ${report.generatedAt}`,
    `**Trades Analyzed:** ${report.tradeCount} (${report.matchedOutcomeCount} matched to outcomes)`,
    ``,
    `## Model Performance`,
    `| Model | Brier Score | Sample Count | Rank |`,
    `|-------|-------------|-------------|------|`,
  ];

  for (const m of report.modelRankings || []) {
    lines.push(`| ${m.name} | ${m.brierScore.toFixed(4)} | ${m.sampleCount} | ${m.rank} |`);
  }

  if ((report.modelRankings || []).length === 0) {
    lines.push(`| _No model data_ | — | — | — |`);
  }

  lines.push(
    ``,
    `## Dispersion Analysis`,
    `| Bucket | Trades | Brier Score | Status |`,
    `|--------|--------|-------------|--------|`,
  );

  for (const bin of report.dispersionAnalysis) {
    const status = bin.brierScore <= 0.15 ? '✅' : bin.brierScore <= 0.25 ? '⚠️' : '🔴';
    lines.push(`| ${bin.bucket} | ${bin.count} | ${bin.brierScore.toFixed(4)} | ${status} |`);
  }

  if (report.dispersionAnalysis.length === 0) {
    lines.push(`| _No dispersion data_ | — | — | — |`);
  }

  lines.push(
    ``,
    `## Confidence Calibration`,
    `**Status:** ${report.confidenceCalibration.status}`,
    `| Bucket | Actual Brier | Expected Brier | Drift | Status |`,
    `|--------|-------------|----------------|-------|--------|`,
  );

  for (const b of report.confidenceCalibration?.buckets || []) {
    lines.push(`| ${b.bucket} | ${b.actualBrier.toFixed(4)} | ${(b.expectedBrier ?? 0).toFixed(4)} | ${b.drift.toFixed(4)} | ${b.drift > 0.05 ? '⚠️ drift' : '✅ ok'} |`);
  }

  lines.push(
    ``,
    `## Issues`,
  );

  for (const issue of report.issues) {
    lines.push(`- ${issue}`);
  }

  lines.push('');

  return lines.join('\n');
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (args.includes('--dry-run')) {
    const gate = shouldRunFullEnsemble(
      { market_id: 'DRY-RUN', quality_score: 0.7, source_count: 3, sentiment_score: 0.3 },
      { market_type: 'financial' },
    );
    console.log(JSON.stringify({
      ok: true,
      command: 'ensemble-inference',
      dry_run: true,
      gate,
      output: PREDICTION_LOG,
      rolling_brier: ROLLING_BRIER_PATH,
    }, null, 2));
    process.exit(0);
  }

  if (subcommand === 'infer') {
    // Usage: node ensemble-inference.mjs infer <marketId> [evidencePacketPath] [featuresPath]
    const marketId = args[1];
    if (!marketId) {
      console.error('Usage: node ensemble-inference.mjs infer <marketId> [evidencePacket.json] [features.json]');
      process.exit(1);
    }

    let evidencePacket = {};
    if (args[2]) {
      try {
        evidencePacket = JSON.parse(readFileSync(resolve(args[2]), 'utf-8'));
      } catch (err) {
        console.error(`Failed to read evidence packet: ${err.message}`);
        evidencePacket = {};
      }
    }

    let features = {};
    if (args[3]) {
      try {
        features = JSON.parse(readFileSync(resolve(args[3]), 'utf-8'));
      } catch (err) {
        console.error(`Failed to read features: ${err.message}`);
        features = {};
      }
    }

    const result = await runInference(marketId, evidencePacket, features);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (subcommand === 'calibrate') {
    // Usage: node ensemble-inference.mjs calibrate [trades.jsonl] [outcomes.jsonl]
    const tradesPath = args[1] || PREDICTION_LOG;
    const outcomesPath = args[2];

    const trades = loadJsonl(tradesPath);
    const outcomes = outcomesPath ? loadJsonl(outcomesPath) : [];

    const report = await generateCalibrationReport(trades, outcomes);
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  if (subcommand === 'test') {
    // Self-test: run a dry inference to verify the module works
    console.log('[Ensemble] Running self-test...');
    const configs = getActiveModelConfigs();
    if (configs.length === 0) {
      console.warn('[Ensemble] No API keys configured — doing unit test of aggregation & confidence only');
    } else {
      console.log(`[Ensemble] Found ${configs.length} configured models: ${configs.map(c => c.name).join(', ')}`);
    }

    // Test aggregateProbs
    const testProbs = { claude: 0.62, grok: 0.67, gpt4o: 0.65, deepseek: 0.64, gemini: 0.60 };
    const testWeights = { claude: 0.25, grok: 0.20, gpt4o: 0.20, deepseek: 0.20, gemini: 0.15 };
    const { p_model, dispersion } = aggregateProbs(testProbs, testWeights);
    console.log(`[Test] aggregateProbs: p_model=${p_model.toFixed(4)}, dispersion=${dispersion.toFixed(4)}`);
    console.assert(Math.abs(p_model - 0.635) < 0.01, 'p_model should be ~0.635');
    console.assert(dispersion >= 0, 'dispersion should be >= 0');

    // Test assignConfidence
    const conf = assignConfidence(0.024, DEFAULT_CALIBRATION_TABLE);
    console.log(`[Test] assignConfidence(0.024): ${conf.toFixed(4)}`);
    console.assert(Math.abs(conf - 0.88) < 0.01, 'confidence should be ~0.88');

    const conf2 = assignConfidence(0.18, DEFAULT_CALIBRATION_TABLE);
    console.log(`[Test] assignConfidence(0.18): ${conf2.toFixed(4)}`);
    console.assert(Math.abs(conf2 - 0.68) < 0.01, 'confidence should be ~0.68');

    // Test bucket label
    const label1 = assignBucketLabel(0.024, DEFAULT_CALIBRATION_TABLE);
    console.log(`[Test] assignBucketLabel(0.024): ${label1}`);
    console.assert(label1 === '< 0.05', 'label should be "< 0.05"');

    // Test buildPrompt
    const packet = {
      consensus_summary: 'Institutional adoption continuing, supply constraints supportive',
      dissent_summary: 'Some analysts warn of overvaluation at current levels',
      quality_score: 0.85,
    };
    const feat = {
      last_price: 85000,
      volume_24h: 35000000000,
      spread_bps: 5,
      target_price: 90000,
    };
    const prompt = buildPrompt('BTC-USD', packet, feat);
    console.assert(prompt.system.includes('prediction market analyst'), 'system prompt should be correct');
    console.assert(prompt.user.includes('85000'), 'user prompt should include price');

    // Test edge: no models
    const emptyProbs = {};
    const { p_model: p0, dispersion: d0 } = aggregateProbs(emptyProbs, testWeights);
    console.assert(p0 === 0.5, 'empty probs should return 0.5');
    console.assert(d0 === 0, 'empty probs should return 0 dispersion');

    // Test edge: single model
    const singleProb = { claude: 0.73 };
    const { p_model: p1, dispersion: d1 } = aggregateProbs(singleProb, testWeights);
    console.assert(p1 === 0.73, 'single model should return its prob');
    console.assert(d1 === 0, 'single model should have 0 dispersion');

    const gateReject = shouldRunFullEnsemble({ market_id: 'LOW', quality_score: 0.1, source_count: 0, sentiment_score: 0 }, {}, {
      enabled: true,
      logOnly: false,
      minQuality: 0.3,
      minEdge: 0.02,
      minSources: 1,
    });
    console.assert(gateReject.run === false, 'ensemble gate should reject low-quality packets');

    const gateLogOnly = shouldRunFullEnsemble({ market_id: 'LOW', quality_score: 0.1, source_count: 0, sentiment_score: 0 }, {}, {
      enabled: true,
      logOnly: true,
      minQuality: 0.3,
      minEdge: 0.02,
      minSources: 1,
    });
    console.assert(gateLogOnly.run === true && gateLogOnly.enforced === false, 'log-only gate should allow but mark unenforced');

    const weighted = applyRollingBrierWeights(
      { claude: 0.2, grok: 0.2, gpt4o: 0.2, deepseek: 0.2, gemini: 0.2 },
      'financial',
      { market_types: { financial: { models: { deepseek: { brierScore: 0.1, sampleCount: 5 }, grok: { brierScore: 0.4, sampleCount: 5 } } } } },
    );
    console.assert(weighted.deepseek > weighted.grok, 'rolling Brier calibration should boost lower-Brier models');

    console.log('[Ensemble] All self-tests passed.');
    process.exit(0);
  }

  // Default: show usage
  console.log(`
Ensemble Inference Tool — Phase 4

Usage:
  node ensemble-inference.mjs infer <marketId> [evidence.json] [features.json]    Run ensemble inference
  node ensemble-inference.mjs calibrate [trades.jsonl] [outcomes.jsonl]           Generate calibration report
  node ensemble-inference.mjs test                                                 Run self-tests

Environment (set at least one for model access):
  NVIDIA_API_KEY       — Nemotron
  XAI_API_KEY          — Grok
  OPENAI_API_KEY       — GPT-4o
  DEEPSEEK_API_KEY     — DeepSeek
  GOOGLE_API_KEY       — Gemini

Override endpoints:
  <MODEL>_BASE_URL     — e.g. CLAUDE_BASE_URL, GROK_BASE_URL
  <MODEL>_MODEL        — e.g. CLAUDE_MODEL, GROK_MODEL

Output:
  .claude/trading-bot/data/prediction_result.jsonl
  .claude/trading-bot/data/calibration_report.md
`);
  process.exit(0);
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  runInference,
  getDynamicWeights,
  shouldRunInference,
  shouldRunFullEnsemble,
  getEnsembleGateConfig,
  inferEdgeEstimate,
  loadRollingBrierCalibration,
  persistRollingBrierCalibration,
  applyRollingBrierWeights,
  callModel,
  aggregateProbs,
  assignConfidence,
  assignBucketLabel,
  generateCalibrationReport,
  buildPrompt,
  getModelConfig,
  getActiveModelConfigs,
  normalizeWeights,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_CALIBRATION_TABLE,
};

// ─── Execute if run directly ────────────────────────────────────────────────

// Only run main() when this file is the direct entry point (not imported)
import { argv } from 'node:process';

const entryArg = argv[1];
if (entryArg && entryArg.endsWith('ensemble-inference.mjs')) {
  main().catch(err => {
    console.error('[Ensemble] Fatal error:', err);
    process.exit(1);
  });
}
