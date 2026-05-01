#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

const argv = process.argv.slice(2);

if (argv.includes('--inventory')) {
  const localModels = listLocalModels();
  console.log(JSON.stringify(buildInventory(localModels), null, 2));
  process.exit(0);
}

const lane = (argv.shift() || '').toLowerCase();
const options = parseArgs(argv);

if (!lane) {
  console.error('Usage: offload-runner <lane> [--model <id>] [--system <prompt>] [--dry-run] [--inventory] <prompt>');
  process.exit(1);
}

const prompt = options.prompt.trim();

if (!prompt && !options.dryRun) {
  console.error('Missing prompt.');
  process.exit(1);
}

const localModels = listLocalModels();
const resolved = resolveLane(lane, options.model, localModels, options.dryRun);

if (options.dryRun) {
  const out = { lane, ...resolved };
  if (out.apiKey) out.apiKey = '[set]';
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (resolved.status === 'SKIPPED_MISSING_ENDPOINT' || resolved.status === 'SKIPPED_MISSING_KEY') {
  console.error(`[${lane}] ${resolved.status}: ${resolved.error}`);
  process.exit(0);
}

if (resolved.kind === 'local') {
  const result = await runLocalChat(resolved.model, prompt, options.system);
  process.stdout.write(result + (result.endsWith('\n') ? '' : '\n'));
  process.exit(0);
}

if (resolved.protocol === 'ollama-native') {
  const result = await runOllamaRemote(resolved.endpoint, resolved.apiKey, resolved.model, prompt, options.system);
  process.stdout.write(result + (result.endsWith('\n') ? '' : '\n'));
  process.exit(0);
}

const result = await runOpenAICompatibleChat(
  resolved.endpoint, resolved.apiKey, resolved.model, prompt, options.system, resolved.extraBody,
  { extraHeaders: resolved.extraHeaders, maxTokens: resolved.maxTokens, timeout: resolved.timeout }
);
process.stdout.write(result + (result.endsWith('\n') ? '' : '\n'));

function parseArgs(rest) {
  const out = { model: '', system: '', prompt: '', dryRun: false, inventory: false };
  const promptParts = [];

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--model' && rest[i + 1]) {
      out.model = rest[++i];
      continue;
    }
    if (token === '--system' && rest[i + 1]) {
      out.system = rest[++i];
      continue;
    }
    if (token === '--dry-run' || token === '--route-only') {
      out.dryRun = true;
      continue;
    }
    if (token === '--inventory') {
      out.inventory = true;
      continue;
    }
    promptParts.push(token);
  }

  out.prompt = promptParts.join(' ');
  return out;
}

function resolveLane(requestedLane, forcedModel, localModels, dryRun = false) {
  const normalizedForcedModel = normalizeForcedModel(forcedModel, requestedLane);

  if (requestedLane === 'gemma' || requestedLane === 'gemma-local' || requestedLane === 'gemma-cloud') {
    return resolveGemmaLane(requestedLane, normalizedForcedModel, localModels, dryRun);
  }

  const laneMap = {
    'ollama': {
      kind: 'local',
      model: normalizedForcedModel || process.env.OLLAMA_MODEL || pickFirstExisting([
        'qwen-liberated:latest',
        'qwen2.5:7b',
        'deepseek-r1:latest',
        'llama3.2:latest'
      ], localModels)
    },
    'gpt-oss': {
      kind: 'local',
      model: normalizedForcedModel || process.env.GPT_OSS_MODEL || pickFirstExisting([
        'gpt-oss:20b',
        'gpt-oss:120b',
        'qwen-liberated:latest',
        'deepseek-r1:latest',
        'llama3.2:latest'
      ], localModels)
    },
    'deepseek': {
      kind: 'local',
      model: normalizedForcedModel || process.env.DEEPSEEK_MODEL || pickFirstExisting([
        'deepseek-liberated:latest',
        'deepseek-r1:latest',
        'deepseek-v2:16b',
        'qwen-liberated:latest',
        'llama3.2:latest'
      ], localModels)
    },
    'kimi': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.KIMI_BASE_URL || ''),
      apiKey: process.env.KIMI_API_KEY || '',
      model: normalizedForcedModel || process.env.KIMI_MODEL || 'kimi-k2.6',
      extraBody: cloudExtraBody('kimi')
    },
    'moonshot': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1'),
      apiKey: process.env.MOONSHOT_API_KEY || '',
      model: normalizedForcedModel || process.env.MOONSHOT_MODEL || 'kimi-k2.6',
      extraBody: cloudExtraBody('moonshot')
    },
    'deepseek-cloud': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: normalizedForcedModel || process.env.DEEPSEEK_CLOUD_MODEL || 'deepseek-v4-pro',
    },
    'ollama-cloud': {
      kind: 'cloud',
      protocol: 'ollama-native',
      endpoint: process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat',
      apiKey: process.env.OLLAMA_API_KEY || '',
      model: normalizedForcedModel || process.env.OLLAMA_CLOUD_MODEL || pickFirstExisting([
        'llama3.3:70b',
        'qwen2.5:72b',
        'deepseek-r1:70b',
        'llama3.1:70b'
      ], new Set()),
    },
    'triage-local': {
      kind: 'local',
      model: normalizedForcedModel || process.env.TRIAGE_LOCAL_MODEL || pickFirstExisting([
        'qwen2.5:7b',
        'qwen2.5:3b',
        'llama3.2:3b',
        'llama3.2:latest'
      ], localModels)
    },
    'summarize-local': {
      kind: 'local',
      model: normalizedForcedModel || process.env.SUMMARIZE_LOCAL_MODEL || pickFirstExisting([
        'qwen2.5:7b',
        'qwen-liberated:latest',
        'llama3.2:latest'
      ], localModels)
    },
    'code-local': {
      kind: 'local',
      model: normalizedForcedModel || process.env.CODE_LOCAL_MODEL || pickFirstExisting([
        'qwen2.5-coder:latest',
        'deepseek-coder:latest',
        'qwen2.5:7b',
        'deepseek-r1:latest'
      ], localModels)
    },
    'reason-kimi': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.REASON_KIMI_BASE_URL || process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1'),
      apiKey: process.env.REASON_KIMI_API_KEY || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || '',
      model: normalizedForcedModel || process.env.REASON_KIMI_MODEL || 'kimi-k2.6',
      extraBody: cloudExtraBody('reason-kimi')
    },
    'reason-cloud': {
      kind: 'cloud',
      protocol: 'ollama-native',
      endpoint: process.env.REASON_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat',
      apiKey: process.env.REASON_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '',
      model: normalizedForcedModel || process.env.REASON_CLOUD_MODEL || 'qwen2.5:72b',
    },
    'code-deepseek': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.CODE_DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
      apiKey: process.env.CODE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',
      model: normalizedForcedModel || process.env.CODE_DEEPSEEK_MODEL || 'deepseek-v4-pro'
    },
    'code-cloud': {
      kind: 'cloud',
      protocol: 'ollama-native',
      endpoint: process.env.CODE_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat',
      apiKey: process.env.CODE_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '',
      model: normalizedForcedModel || process.env.CODE_CLOUD_MODEL || 'qwen2.5-coder:32b',
    },
    'nvidia-deepseek': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || process.env.NVIDIA_NIM_MODEL || 'deepseek-ai/deepseek-v4-pro',
    },
    'openrouter-free': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'),
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: normalizedForcedModel || process.env.OPENROUTER_MODEL || 'openrouter/free',
      maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS || '2048', 10),
      timeout: 30000,
      extraHeaders: {
        'HTTP-Referer': 'https://nudimmud.local',
        'X-OpenRouter-Title': 'NUDIMMUD',
      },
      requiresKey: true,
    }
  };

  const resolved = laneMap[requestedLane];
  if (!resolved) {
    if (requestedLane === 'claude') {
      throw new Error('Lane "claude" removed: it routed to DeepSeek Cloud, not Claude. Use "deepseek-cloud" instead.');
    }
    throw new Error(`Unsupported lane: ${requestedLane}`);
  }

  if (resolved.kind === 'local') {
    return { kind: 'local', model: resolved.model };
  }

  if (!resolved.endpoint) {
    if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
      return {
        kind: resolved.kind,
        protocol: resolved.protocol,
        endpoint: '',
        apiKey: resolved.apiKey || '',
        model: resolved.model,
        extraBody: resolved.extraBody,
        executable: false,
        status: 'SKIPPED_MISSING_ENDPOINT',
        error: `Missing endpoint for lane: ${requestedLane}`,
      };
    }
    throw new Error(`Missing endpoint for lane: ${requestedLane}`);
  }

  if (resolved.requiresKey && !resolved.apiKey) {
    if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
      return {
        kind: resolved.kind,
        endpoint: resolved.endpoint,
        apiKey: '',
        model: resolved.model,
        executable: false,
        status: 'SKIPPED_MISSING_KEY',
        error: `Missing API key for lane: ${requestedLane}`,
      };
    }
    throw new Error(`Missing API key for lane: ${requestedLane}`);
  }

  if (requestedLane === 'openrouter-free') {
    const model = resolved.model;
    const isFree = model === 'openrouter/free' || model.endsWith(':free');
    if (!isFree && process.env.OPENROUTER_ALLOW_PAID !== '1') {
      if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
        return {
          kind: 'blocked',
          model,
          executable: false,
          status: 'BLOCKED_PAID_MODEL',
          error: `Model "${model}" requires OPENROUTER_ALLOW_PAID=1`,
        };
      }
      throw new Error(`OpenRouter paid model blocked: "${model}". Set OPENROUTER_ALLOW_PAID=1 to allow.`);
    }
  }

  return resolved;
}

function normalizeForcedModel(forcedModel, lane) {
  if (!forcedModel) return '';

  // Strip routing suffixes (:cloud, :local, :remote) — they're routing hints, not model IDs
  forcedModel = forcedModel.replace(/:(?:cloud|local|remote)$/i, '');

  const normalized = forcedModel.replace(/[_]/g, '-').toLowerCase();
  const laneName = lane.replace(/[_]/g, '-').toLowerCase();

  if (normalized === laneName) return '';
  if (laneName === 'gpt-oss' && (normalized === 'gptoss' || normalized === 'gpt-oss')) return '';
  if (laneName === 'deepseek' && normalized === 'deepseek') return '';
  if (laneName === 'ollama' && normalized === 'ollama') return '';
  if (laneName === 'kimi' && (normalized === 'kimi' || normalized === 'moonshot')) return '';
  if (laneName === 'moonshot' && (normalized === 'moonshot' || normalized === 'kimi')) return '';
  if (laneName === 'deepseek-cloud' && normalized === 'deepseek-cloud') return '';
  if (laneName === 'ollama-cloud' && (normalized === 'ollama-cloud' || normalized === 'ollama')) return '';
  if (laneName === 'triage-local' && normalized === 'triage-local') return '';
  if (laneName === 'summarize-local' && normalized === 'summarize-local') return '';
  if (laneName === 'code-local' && normalized === 'code-local') return '';
  if (laneName === 'reason-cloud' && normalized === 'reason-cloud') return '';
  if (laneName === 'code-cloud' && normalized === 'code-cloud') return '';
  if (laneName === 'reason-kimi' && (normalized === 'reason-kimi' || normalized === 'kimi')) return '';
  if (laneName === 'code-deepseek' && (normalized === 'code-deepseek' || normalized === 'deepseek')) return '';
  if (laneName === 'gemma-local' && normalized === 'gemma-local') return '';
  if (laneName === 'gemma-cloud' && normalized === 'gemma-cloud') return '';
  if (laneName === 'gemma' && normalized === 'gemma') return '';

  return forcedModel;
}

function cloudExtraBody(provider) {
  if (provider === 'kimi' || provider === 'reason-kimi') {
    return { chat_template_kwargs: { thinking: true } };
  }
  return undefined;
}

function resolveGemmaLane(lane, normalizedForcedModel, localModels, dryRun = false) {
  if (normalizedForcedModel && !normalizedForcedModel.startsWith('gemma4:')) {
    throw new Error(`Lane "${lane}" requires a gemma4: model, got "${normalizedForcedModel}".`);
  }

  if (lane === 'gemma-local') {
    const model = normalizedForcedModel || envGemmaModel('GEMMA_LOCAL_MODEL') || pickGemmaLocal(localModels);
    if (!model) {
      if (dryRun) {
        return {
          kind: 'local',
          model: 'gemma4:e4b',
          installed: false,
          executable: false,
          error: 'No local gemma4 model installed. Run: ollama pull gemma4:e4b',
        };
      }
      throw new Error('Lane "gemma-local": no local gemma4 model installed. Run: ollama pull gemma4:e4b');
    }
    return { kind: 'local', model, installed: true, executable: true };
  }

  if (lane === 'gemma-cloud') {
    const apiKey = process.env.GEMMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '';
    const endpoint = process.env.GEMMA_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat';
    const model = normalizedForcedModel || envGemmaModel('GEMMA_CLOUD_MODEL') || 'gemma4:e4b';
    if (!apiKey) {
      if (dryRun) {
        return {
          kind: 'cloud',
          protocol: 'ollama-native',
          endpoint,
          model,
          hasKey: false,
          executable: false,
          error: 'Missing OLLAMA_API_KEY or GEMMA_CLOUD_API_KEY',
        };
      }
      throw new Error('Lane "gemma-cloud" requires OLLAMA_API_KEY or GEMMA_CLOUD_API_KEY.');
    }
    return { kind: 'cloud', protocol: 'ollama-native', endpoint, apiKey, model, hasKey: true, executable: true };
  }

  // lane === 'gemma' — cloud-first, local fallback
  const hasCloudKey = !!(process.env.OLLAMA_API_KEY || process.env.GEMMA_CLOUD_API_KEY);
  if (hasCloudKey) {
    return {
      kind: 'cloud',
      protocol: 'ollama-native',
      endpoint: process.env.GEMMA_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat',
      apiKey: process.env.GEMMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY,
      model: normalizedForcedModel || envGemmaModel('GEMMA_MODEL') || 'gemma4:e4b',
      resolvedVia: 'cloud',
      executable: true,
    };
  }

  const localModel = normalizedForcedModel || envGemmaModel('GEMMA_MODEL') || pickGemmaLocal(localModels);
  if (localModel) return { kind: 'local', model: localModel, resolvedVia: 'local', executable: true };

  if (dryRun) {
    return {
      kind: 'blocked',
      model: 'gemma4:e4b',
      hasCloudKey: false,
      hasLocalModel: false,
      executable: false,
      error: 'No OLLAMA_API_KEY for cloud and no local gemma4 model installed. Install gemma4:e4b or set OLLAMA_API_KEY.',
    };
  }
  throw new Error('Lane "gemma": no OLLAMA_API_KEY for cloud and no local gemma4 model installed. Install gemma4:e4b or set OLLAMA_API_KEY.');
}

function envGemmaModel(envName) {
  const val = process.env[envName] || '';
  if (!val) return '';
  if (val.startsWith('gemma4:')) return val;
  throw new Error(`${envName}="${val}" is not a gemma4: model. Gemma lanes require gemma4: models only.`);
}

function pickGemmaLocal(localModels) {
  for (const c of ['gemma4:e4b', 'gemma4:e2b']) {
    if (localModels.has(c)) return c;
  }
  return '';
}

function normalizeOpenAIBaseUrl(url) {
  const trimmed = (url || '').replace(/\/$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function pickFirstExisting(candidates, localModels) {
  for (const candidate of candidates) {
    if (localModels.has(candidate)) return candidate;
  }
  return candidates[0];
}

function listLocalModels() {
  const models = new Set();
  const manifestRoot = process.env.OLLAMA_MANIFEST_DIR || path.join(process.env.HOME || '', '.ollama/models/manifests/registry.ollama.ai/library');

  if (!existsSync(manifestRoot)) {
    return models;
  }

  const stack = [manifestRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of safeReadDir(current)) {
      const full = path.join(current, entry);
      const stat = safeStat(full);
      if (!stat) continue;
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }

      const rel = path.relative(manifestRoot, full);
      const parts = rel.split(path.sep);
      if (parts.length >= 2) {
        models.add(`${parts[0]}:${parts[1]}`);
      }
    }
  }

  return models;
}

function safeReadDir(dir) {
  try {
    return readdirSync(dir) || [];
  } catch {
    return [];
  }
}

function safeStat(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

function buildInventory(localModels) {
  const laneNames = ['ollama', 'gpt-oss', 'deepseek', 'kimi', 'moonshot', 'deepseek-cloud', 'ollama-cloud', 'triage-local', 'summarize-local', 'code-local', 'reason-kimi', 'reason-cloud', 'code-deepseek', 'code-cloud', 'nvidia-deepseek', 'gemma-local', 'gemma-cloud', 'gemma', 'openrouter-free'];
  const lanes = {};
  for (const name of laneNames) {
    try {
      const r = resolveLane(name, '', localModels, true);
      lanes[name] = { kind: r.kind, model: r.model };
      if (r.endpoint) lanes[name].endpoint = r.endpoint;
      if (r.protocol) lanes[name].protocol = r.protocol;
      if (r.apiKey !== undefined) lanes[name].hasKey = !!r.apiKey;
      if (r.executable !== undefined) lanes[name].executable = r.executable;
      if (r.status) lanes[name].status = r.status;
      if (r.error) lanes[name].error = r.error;
      if (r.resolvedVia) lanes[name].resolvedVia = r.resolvedVia;
    } catch (e) {
      lanes[name] = { error: e.message };
    }
  }
  return { lanes, localModels: [...localModels].sort() };
}

async function runLocalChat(model, promptText, systemText) {
  const host = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  messages.push({ role: 'user', content: promptText });

  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`OLLAMA_${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.message?.content || data.response || '';
}

async function runOllamaRemote(endpoint, apiKey, model, promptText, systemText) {
  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  messages.push({ role: 'user', content: promptText });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: false })
  });

  if (!response.ok) {
    throw new Error(`OLLAMA_CLOUD_${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.message?.content || data.response || '';
}

async function runOpenAICompatibleChat(endpoint, apiKey, model, promptText, systemText, extraBody, opts = {}) {
  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  messages.push({ role: 'user', content: promptText });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);

  const body = {
    model,
    messages,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(extraBody || {})
  };

  const fetchOpts = { method: 'POST', headers, body: JSON.stringify(body) };
  let timeoutId;
  if (opts.timeout) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), opts.timeout);
    fetchOpts.signal = controller.signal;
  }

  let response;
  try {
    response = await fetch(`${endpoint}/chat/completions`, fetchOpts);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 402) throw new Error('CREDIT_EXHAUSTED');
    if (response.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`OPENAI_COMPAT_${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
