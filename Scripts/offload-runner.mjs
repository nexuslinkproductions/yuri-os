#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const lane = (argv.shift() || '').toLowerCase();

if (!lane) {
  console.error('Usage: offload-runner <lane> [--model <id>] [--system <prompt>] <prompt>');
  process.exit(1);
}

const options = parseArgs(argv);
const prompt = options.prompt.trim();

if (!prompt) {
  console.error('Missing prompt.');
  process.exit(1);
}

const localModels = listLocalModels();
const resolved = resolveLane(lane, options.model, localModels);

if (resolved.kind === 'local') {
  const result = await runLocalChat(resolved.model, prompt, options.system);
  process.stdout.write(result + (result.endsWith('\n') ? '' : '\n'));
  process.exit(0);
}

const result = await runOpenAICompatibleChat(resolved.endpoint, resolved.apiKey, resolved.model, prompt, options.system, resolved.extraBody);
process.stdout.write(result + (result.endsWith('\n') ? '' : '\n'));

function parseArgs(rest) {
  const out = { model: '', system: '', prompt: '' };
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
    promptParts.push(token);
  }

  out.prompt = promptParts.join(' ');
  return out;
}

function resolveLane(requestedLane, forcedModel, localModels) {
  const normalizedForcedModel = normalizeForcedModel(forcedModel, requestedLane);

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
    }
  };

  const resolved = laneMap[requestedLane];
  if (!resolved) {
    throw new Error(`Unsupported lane: ${requestedLane}`);
  }

  if (resolved.kind === 'local') {
    return { kind: 'local', model: resolved.model };
  }

  if (!resolved.endpoint) {
    throw new Error(`Missing endpoint for lane: ${requestedLane}`);
  }

  return resolved;
}

function normalizeForcedModel(forcedModel, lane) {
  if (!forcedModel) return '';

  const normalized = forcedModel.replace(/[_]/g, '-').toLowerCase();
  const laneName = lane.replace(/[_]/g, '-').toLowerCase();

  if (normalized === laneName) return '';
  if (laneName === 'gpt-oss' && (normalized === 'gptoss' || normalized === 'gpt-oss')) return '';
  if (laneName === 'deepseek' && normalized === 'deepseek') return '';
  if (laneName === 'ollama' && normalized === 'ollama') return '';
  if (laneName === 'kimi' && (normalized === 'kimi' || normalized === 'moonshot')) return '';
  if (laneName === 'moonshot' && (normalized === 'moonshot' || normalized === 'kimi')) return '';

  return forcedModel;
}

function cloudExtraBody(provider) {
  if (provider === 'kimi') {
    return { chat_template_kwargs: { thinking: true } };
  }
  return undefined;
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

async function runOpenAICompatibleChat(endpoint, apiKey, model, promptText, systemText, extraBody) {
  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  messages.push({ role: 'user', content: promptText });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model,
    messages,
    ...(extraBody || {})
  };

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`OPENAI_COMPAT_${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
