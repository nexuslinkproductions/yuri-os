import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  estimateTokensFromText,
  hashPayload,
  normalizeOllamaUsage,
  recordTokenEvent,
} from './token-ledger.mjs';
import { runNeedleLocalChat } from './needle-adapter.mjs';

const MODEL_POLICY_PATH = path.resolve(process.cwd(), '.claude/config/models.json');
const LOCAL_MODEL_POLICY = loadModelPolicy().local || {};
const LOCAL_UTILITY_MODEL = LOCAL_MODEL_POLICY.utility || 'needle';
const LOCAL_PRIMARY_MODEL = LOCAL_MODEL_POLICY.primary || 'needle';
const LOCAL_FALLBACK_MODEL = LOCAL_MODEL_POLICY.fallback || 'llama3.2:latest';

export const OLLAMA_LOCAL_MODELS = Object.freeze([
  LOCAL_UTILITY_MODEL,
  LOCAL_PRIMARY_MODEL,
  LOCAL_FALLBACK_MODEL,
]);

export function resolveOllamaAdditiveLane(requestedLane, forcedModel, localModels, dryRun = false) {
  const localModel = normalizeOllamaModelAlias(forcedModel || process.env.OLLAMA_LOCAL_MODEL || pickFirstInstalled(OLLAMA_LOCAL_MODELS, localModels));
  const cloudModel = forcedModel || process.env.OLLAMA_CLOUD_MODEL || 'llama3.3:70b';
  const cloudEndpoint = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat';
  const cloudApiKey = process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '';

  if (requestedLane === 'ollama-local') {
    if (localModel && localModels.has(localModel)) return { kind: 'local', model: localModel, resolvedVia: 'local', additive: true };
    if (dryRun) {
      return {
        kind: 'local',
        model: localModel || OLLAMA_LOCAL_MODELS[0],
        executable: false,
        additive: true,
        error: 'No matching local Ollama model installed. Pull one of: ' + OLLAMA_LOCAL_MODELS.join(', '),
      };
    }
    throw new Error('Lane "ollama-local": no matching local Ollama model installed. Pull one of: ' + OLLAMA_LOCAL_MODELS.join(', '));
  }

  if (requestedLane === 'ollama-cloud') {
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

function coerceHttpScheme(raw) {
  const trimmed = String(raw || '').replace(/\/$/, '');
  if (!trimmed) return 'http://127.0.0.1:11434';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export async function runOllamaLocalChat(model, promptText, systemText, ledger = {}) {
  if (isNeedleModel(model)) {
    return runNeedleLocalChat(promptText, systemText, ledger);
  }

  const host = coerceHttpScheme(process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
  const additiveLane = String(ledger.lane || '').startsWith('ollama');
  return runOllamaNativeChat({
    endpoint: `${host}/api/chat`,
    provider: 'ollama-local',
    model,
    promptText,
    systemText,
    ledger,
    metadata: { local_runtime: 'ollama', additive_lane: additiveLane },
  });
}

function isNeedleModel(model) {
  return String(model || '').toLowerCase() === 'needle';
}

export async function runOllamaCloudChat(endpoint, apiKey, model, promptText, systemText, ledger = {}) {
  const additiveLane = String(ledger.lane || '').startsWith('ollama');
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

export async function postOllamaEmbedding({ text, model, baseUrl, traceId = '', sourcePath = 'Scripts/ollama-adapter.mjs', operationType = 'ollama_embedding' }) {
  const startedAt = Date.now();
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/embeddings`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OFFLOAD_OLLAMA_TIMEOUT_MS) || 300000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal,
    });

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
  } finally {
    clearTimeout(timeout);
  }
}

async function runOllamaNativeChat({ endpoint, apiKey = '', provider, model, promptText, systemText, ledger, metadata }) {
  const startedAt = Date.now();
  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  messages.push({ role: 'user', content: promptText });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, stream: false }),
    });
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
    trace_id: ledger.traceId || process.env.TOKEN_LEDGER_TRACE_ID || process.env.OFFLOAD_TASK_ID || `ollama-${Date.now()}-${process.pid}`,
    session_id: process.env.OFFLOAD_TASK_ID || '',
    source_path: 'Scripts/ollama-adapter.mjs',
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
