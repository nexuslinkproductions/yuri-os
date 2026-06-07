import { existsSync, readFileSync } from 'fs';
import path from 'path';
import http from 'node:http';
import https from 'node:https';
import {
  estimateTokensFromText,
  hashPayload,
  normalizeOllamaUsage,
  recordTokenEvent,
} from './token-ledger.mjs';

// Cold model loads need extended timeouts — native fetch headersTimeout is 10s (too short).
// Use node:http directly for full socket + response timeout control.
const OLLAMA_TIMEOUT_MS = Number(process.env.LLM_COMPAT_OLLAMA_TIMEOUT_MS) || 300_000;

function ollamaHttpPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(body);
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...extraHeaders },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({
        ok:     res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        text:   () => Promise.resolve(raw),
        json:   () => Promise.resolve(JSON.parse(raw)),
      }));
    });
    req.setTimeout(OLLAMA_TIMEOUT_MS, () => req.destroy(new Error(`ollama_timeout_${OLLAMA_TIMEOUT_MS}ms`)));
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

const MODEL_POLICY_PATH = path.resolve(process.cwd(), '.claude/config/models.json');
const LOCAL_MODEL_POLICY = loadModelPolicy().local || {};
const DEFAULT_LOCAL_GEMMA_MODEL = 'gemma4:12b-it-qat';
const LOCAL_UTILITY_MODEL = LOCAL_MODEL_POLICY.utility || DEFAULT_LOCAL_GEMMA_MODEL;
const LOCAL_PRIMARY_MODEL = LOCAL_MODEL_POLICY.primary || DEFAULT_LOCAL_GEMMA_MODEL;
const LOCAL_FALLBACK_MODEL = LOCAL_MODEL_POLICY.fallback || DEFAULT_LOCAL_GEMMA_MODEL;
const LOCAL_CODE_MODEL = LOCAL_MODEL_POLICY.code || DEFAULT_LOCAL_GEMMA_MODEL;
const LOCAL_CODE_FALLBACK_MODEL = LOCAL_MODEL_POLICY.code_fallback || DEFAULT_LOCAL_GEMMA_MODEL;
const LOCAL_GEMMA_MODEL = LOCAL_MODEL_POLICY.gemma || LOCAL_MODEL_POLICY.multimodal || DEFAULT_LOCAL_GEMMA_MODEL;
const LOCAL_GEMMA_FALLBACK_MODEL = LOCAL_MODEL_POLICY.multimodal || DEFAULT_LOCAL_GEMMA_MODEL;

export const OLLAMA_LOCAL_MODELS = Object.freeze(uniqueModels([
  LOCAL_UTILITY_MODEL,
  LOCAL_PRIMARY_MODEL,
  LOCAL_FALLBACK_MODEL,
  DEFAULT_LOCAL_GEMMA_MODEL,
]));

export const OLLAMA_CODE_MODELS = Object.freeze(uniqueModels([
  LOCAL_CODE_MODEL,
  LOCAL_CODE_FALLBACK_MODEL,
  LOCAL_FALLBACK_MODEL,
  DEFAULT_LOCAL_GEMMA_MODEL,
]));

export const OLLAMA_GEMMA_MODELS = Object.freeze(uniqueModels([
  LOCAL_GEMMA_MODEL,
  LOCAL_GEMMA_FALLBACK_MODEL,
  DEFAULT_LOCAL_GEMMA_MODEL,
]));

export function resolveOllamaAdditiveLane(requestedLane, forcedModel, localModels, dryRun = false) {
  const lane = normalizeLaneName(requestedLane);
  const localCandidates = localCandidatesForLane(lane);
  const localEnvModel = lane.startsWith('gemma')
    ? (process.env.GEMMA_LOCAL_MODEL || process.env.OLLAMA_GEMMA_MODEL || process.env.OLLAMA_LOCAL_MODEL)
    : process.env.OLLAMA_LOCAL_MODEL;
  const localModel = normalizeOllamaModelAlias(forcedModel || localEnvModel || pickFirstInstalled(localCandidates, localModels));
  const cloudModel = forcedModel || cloudModelForLane(lane);
  const cloudEndpoint = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat';
  const cloudApiKey = process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '';

  if (lane === 'ollama-local' || lane === 'gemma-local' || lane === 'triage-local' || lane === 'summarize-local' || lane === 'code-local' || lane === 'gpt-oss') {
    if (localModel && localModels.has(localModel)) return { kind: 'local', model: localModel, resolvedVia: 'local', additive: true };
    if (dryRun) {
      return {
        kind: 'local',
        model: localModel || localCandidates[0],
        executable: false,
        additive: true,
        error: 'No matching local Ollama model installed. Pull one of: ' + localCandidates.join(', '),
      };
    }
    throw new Error(`Lane "${lane}": no matching local Ollama model installed. Pull one of: ${localCandidates.join(', ')}`);
  }

  if (lane === 'ollama-cloud' || lane === 'gemma-cloud' || lane === 'reason-cloud' || lane === 'code-cloud') {
    if (cloudApiKey) {
      return { kind: 'cloud', protocol: 'ollama-native', endpoint: cloudEndpoint, apiKey: cloudApiKey, model: cloudModel, resolvedVia: 'cloud', additive: true };
    }
    if (dryRun) {
      return {
        kind: 'cloud',
        protocol: 'ollama-native',
        endpoint: cloudEndpoint,
        model: cloudModel,
        executable: false,
        additive: true,
        error: 'Missing OLLAMA_API_KEY or OLLAMA_CLOUD_API_KEY',
      };
    }
    throw new Error('Lane "ollama-cloud" requires OLLAMA_API_KEY or OLLAMA_CLOUD_API_KEY.');
  }

  if (localModel && localModels.has(localModel)) {
    return { kind: 'local', model: localModel, resolvedVia: 'local', additive: true };
  }
  if (cloudApiKey) {
    return {
      kind: 'cloud',
      protocol: 'ollama-native',
      endpoint: cloudEndpoint,
      apiKey: cloudApiKey,
      model: cloudModel,
      resolvedVia: 'cloud-fallback',
      additive: true,
      note: 'ollama auto lane used cloud fallback because no matching local model was installed',
    };
  }
  if (dryRun) {
    return {
      kind: 'blocked',
      model: localModel || cloudModel,
      executable: false,
      additive: true,
      error: 'Ollama additive lane needs a local model or OLLAMA_API_KEY for cloud fallback.',
    };
  }
  throw new Error('Lane "ollama": no local model found and no OLLAMA_API_KEY for cloud fallback.');
}

function normalizeLaneName(lane) {
  return String(lane || 'ollama').replace(/^@/, '').toLowerCase();
}

function localCandidatesForLane(lane) {
  if (lane === 'code-local') return OLLAMA_CODE_MODELS;
  if (lane.startsWith('gemma')) return OLLAMA_GEMMA_MODELS;
  return OLLAMA_LOCAL_MODELS;
}

function uniqueModels(models) {
  return [...new Set(models.map((model) => normalizeOllamaModelAlias(model)).filter(Boolean))];
}

function cloudModelForLane(lane) {
  if (lane === 'code-cloud') return process.env.OLLAMA_CODE_CLOUD_MODEL || process.env.OLLAMA_CLOUD_MODEL || 'qwen2.5-coder:32b';
  if (lane === 'reason-cloud') return process.env.OLLAMA_REASON_CLOUD_MODEL || process.env.OLLAMA_CLOUD_MODEL || 'qwen2.5:72b';
  if (lane.startsWith('gemma')) return process.env.GEMMA_CLOUD_MODEL || process.env.OLLAMA_CLOUD_MODEL || 'gemma4:12b-it-qat';
  return process.env.OLLAMA_CLOUD_MODEL || 'llama3.3:70b';
}

function coerceHttpScheme(raw) {
  const trimmed = String(raw || '').replace(/\/$/, '');
  if (!trimmed) return 'http://localhost:11434';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export async function runOllamaLocalChat(model, promptText, systemText, ledger = {}) {
  const host = coerceHttpScheme(process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
  const additiveLane = isAdditiveLane(ledger.lane);
  const thinkEnabled = String(process.env.OLLAMA_THINK || 'true').toLowerCase() !== 'false';
  return runOllamaNativeChat({
    endpoint: `${host}/api/chat`,
    provider: 'ollama-local',
    model,
    promptText,
    systemText,
    ledger,
    think: thinkEnabled,
    metadata: { local_runtime: 'ollama', additive_lane: additiveLane, think_enabled: thinkEnabled },
  });
}

function isAdditiveLane(lane) {
  return /^(ollama|gemma|triage-local|summarize-local|code-local|gpt-oss)/.test(String(lane || ''));
}

export async function runOllamaCloudChat(endpoint, apiKey, model, promptText, systemText, ledger = {}) {
  const additiveLane = isAdditiveLane(ledger.lane);
  return runOllamaNativeChat({
    endpoint,
    apiKey,
    provider: 'ollama-cloud',
    model,
    promptText,
    systemText,
    ledger,
    metadata: { remote_runtime: 'ollama-native', billing_state: 'provisional', additive_lane: additiveLane },
  });
}

export async function postOllamaEmbedding({ text, model, baseUrl, traceId = '', sourcePath = '_SYSTEM/Scripts/ollama-adapter.mjs', operationType = 'ollama_embedding' }) {
  const startedAt = Date.now();
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/embeddings`;
  try {
    const response = await ollamaHttpPost(endpoint, { model, prompt: text });

    if (!response.ok) return null;
    const data = await response.json();
    await recordTokenEvent({
      trace_id: traceId || `ollama-embedding-${Date.now()}-${process.pid}`,
      source_path: sourcePath,
      lane: 'ollama-local',
      provider: 'ollama-local',
      request_model: model,
      response_model: model,
      operation_type: operationType,
      status: 'ok',
      measurement_type: 'estimated_tokenizer',
      input_tokens: estimateTokensFromText(text),
      output_tokens: 0,
      latency_ms: Date.now() - startedAt,
      payload_hash: hashPayload({ model, text }),
      metadata: { vector_dimensions: Array.isArray(data?.embedding) ? data.embedding.length : 0, additive_lane: true },
    });
    return Array.isArray(data?.embedding) ? data.embedding : null;
  } catch (error) {
    await recordTokenEvent({
      trace_id: traceId || `ollama-embedding-${Date.now()}-${process.pid}`,
      source_path: sourcePath,
      lane: 'ollama-local',
      provider: 'ollama-local',
      request_model: model,
      response_model: model,
      operation_type: operationType,
      status: 'error',
      measurement_type: 'unobservable',
      accuracy_class: 'not_measurable',
      latency_ms: Date.now() - startedAt,
      payload_hash: hashPayload({ model, text }),
      error_class: error?.name || 'Error',
      error_message: error?.message || String(error),
      metadata: { additive_lane: true },
    });
    return null;
  }
}

async function runOllamaNativeChat({ endpoint, apiKey = '', provider, model, promptText, systemText, ledger, metadata, think }) {
  const startedAt = Date.now();
  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  messages.push({ role: 'user', content: promptText });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response;
  try {
    const body = { model, messages, stream: false };
    if (typeof think === 'boolean') body.think = think;
    response = await ollamaHttpPost(endpoint, body, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
  } catch (error) {
    const errText = error?.message || String(error);
    await recordOllamaLedger({ provider, model, status: 'error', startedAt, promptText, systemText, endpoint, ledger, metadata, errorText: errText });
    throw error;
  }

  if (!response.ok) {
    const errText = await response.text();
    await recordOllamaLedger({ provider, model, status: 'error', startedAt, promptText, systemText, endpoint, ledger, metadata, errorText: errText, httpStatus: response.status });
    throw new Error(`${provider.toUpperCase().replace(/-/g, '_')}_${response.status}: ${errText}`);
  }

  const data = await response.json();
  const output = data.message?.content || data.response || '';
  await recordOllamaLedger({ provider, model, responseModel: data.model || model, status: 'ok', usage: data, output, startedAt, promptText, systemText, endpoint, ledger, metadata });
  return output;
}

async function recordOllamaLedger({ provider, model, responseModel, status, usage = {}, output = '', startedAt, promptText, systemText, endpoint, ledger = {}, metadata = {}, errorText = '', httpStatus = 0 }) {
  const measurement = status === 'ok'
    ? normalizeOllamaUsage(usage, {
      input_tokens: estimateTokensFromText([systemText, promptText].filter(Boolean).join('\n')),
      output_tokens: estimateTokensFromText(output),
    })
    : { measurement_type: 'unobservable', accuracy_class: 'not_measurable' };

  await recordTokenEvent({
    trace_id: ledger.traceId || process.env.TOKEN_LEDGER_TRACE_ID || process.env.LLM_COMPAT_TASK_ID || `ollama-${Date.now()}-${process.pid}`,
    session_id: process.env.LLM_COMPAT_TASK_ID || '',
    source_path: '_SYSTEM/Scripts/ollama-adapter.mjs',
    lane: ledger.lane || 'ollama',
    provider,
    request_model: model,
    response_model: responseModel || model,
    operation_type: 'offload_model_call',
    status,
    ...measurement,
    latency_ms: Date.now() - startedAt,
    payload_hash: hashPayload({ model, promptText, systemText, endpoint }),
    error_class: errorText ? 'OllamaHttpError' : '',
    error_message: errorText,
    metadata: {
      endpoint_hash: hashPayload(endpoint),
      http_status: httpStatus,
      output_chars: output.length,
      ...metadata,
    },
  });
}

function pickFirstInstalled(candidates, localModels) {
  for (const candidate of candidates) {
    if (localModels.has(candidate)) return candidate;
  }
  return '';
}

function loadModelPolicy() {
  try {
    if (!existsSync(MODEL_POLICY_PATH)) return {};
    return JSON.parse(readFileSync(MODEL_POLICY_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function normalizeOllamaModelAlias(model) {
  const clean = String(model || '').toLowerCase();

  if (['needle', 'gemma4:e2b', 'gemma4:latest', 'gemma4:12b', 'gemma4'].includes(clean)) {
    return DEFAULT_LOCAL_GEMMA_MODEL;
  }

  if (['qwen3.5', 'qwen3.5:4b', 'qwen3.5:latest', 'qwen-liberated', 'qwen-liberated:latest'].includes(clean)) {
    return LOCAL_UTILITY_MODEL;
  }

  if (['qwen2.5', 'qwen2.5:7b', 'qwen2.5:latest'].includes(clean)) {
    return LOCAL_PRIMARY_MODEL;
  }

  if (['llama3.2', 'llama3.2:latest'].includes(clean)) {
    return LOCAL_FALLBACK_MODEL;
  }

  return model;
}
