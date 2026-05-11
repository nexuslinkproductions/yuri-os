#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL_CONFIG_PATH = path.join(ROOT, '.claude/config/models.json');
const DEFAULT_TIMEOUT_MS = 90000;

const argv = process.argv.slice(2);
const options = parseArgs(argv);
const config = readModelConfig();
const installedModels = listInstalledModels();
const scenarios = buildScenarios(config).slice(0, options.scenarioLimit || undefined);

const dryRun = !options.execute;
const results = [];

for (const scenario of scenarios) {
  const model = scenario.model;
  const installed = installedModels.has(model);
  const result = {
    id: scenario.id,
    metric: scenario.metric,
    role: scenario.role,
    model,
    installed,
    dry_run: dryRun,
    prompt_chars: scenario.prompt.length,
    memory_before: memorySnapshot(),
  };

  if (dryRun) {
    result.status = installed ? 'planned' : 'missing_model';
    result.validator = scenario.validatorName;
    results.push(result);
    continue;
  }

  if (!installed) {
    result.status = 'missing_model';
    results.push(result);
    continue;
  }

  const startedAt = Date.now();
  try {
    const response = await generateWithOllama(model, scenario.prompt, scenario.system, options.timeoutMs);
    const elapsedMs = Date.now() - startedAt;
    const evalCount = Number(response.eval_count || 0);
    const evalDurationNs = Number(response.eval_duration || 0);
    const loadDurationNs = Number(response.load_duration || 0);
    const output = response.response || response.message?.content || '';
    const validation = scenario.validate(output);

    results.push({
      ...result,
      status: validation.ok ? 'ok' : 'validator_failed',
      elapsed_ms: elapsedMs,
      cold_load_ms: Math.round(loadDurationNs / 1e6),
      eval_count: evalCount,
      tokens_per_second: evalDurationNs > 0 ? Number((evalCount / (evalDurationNs / 1e9)).toFixed(2)) : null,
      output_chars: output.length,
      validation,
      memory_after: memorySnapshot(),
    });
  } catch (error) {
    results.push({
      ...result,
      status: 'error',
      elapsed_ms: Date.now() - startedAt,
      error: error?.message || String(error),
      memory_after: memorySnapshot(),
    });
  }
}

const summary = summarize(results);
const payload = {
  generated_at: new Date().toISOString(),
  machine: machineSummary(),
  ollama_version: ollamaVersion(),
  dry_run: dryRun,
  acceptance: {
    lightweight_cold_start_ms_max: 30000,
    general_cold_start_ms_max: 45000,
    no_heavy_models_auto: true,
    code_local_requires_coder_model: true,
  },
  policy: {
    utility: config.local?.utility,
    primary: config.local?.primary,
    code: config.local?.code,
    deep_reasoning: config.local?.deep_reasoning,
    multimodal: config.local?.multimodal,
    manual_only: config.local?.manual_only || [],
  },
  summary,
  results,
};

if (options.json) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  printHuman(payload);
}

process.exit(summary.failed === 0 ? 0 : 1);

function parseArgs(args) {
  const out = {
    execute: false,
    json: false,
    scenarioLimit: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--execute') {
      out.execute = true;
      continue;
    }
    if (arg === '--dry-run') {
      out.execute = false;
      continue;
    }
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--scenario-limit' && args[i + 1]) {
      out.scenarioLimit = Math.max(0, parseInt(args[++i], 10) || 0);
      continue;
    }
    if (arg === '--timeout-ms' && args[i + 1]) {
      out.timeoutMs = Math.max(1000, parseInt(args[++i], 10) || DEFAULT_TIMEOUT_MS);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function readModelConfig() {
  return JSON.parse(readFileSync(MODEL_CONFIG_PATH, 'utf8'));
}

function buildScenarios(modelConfig) {
  const local = modelConfig.local || {};
  return [
    {
      id: 'summarize_long_doc',
      metric: 'cold-load/tokens/sec',
      role: 'utility',
      model: local.utility || 'qwen3.5:4b',
      system: 'Return a compact factual summary.',
      prompt: `Summarize the following orchestration note in five bullets:\n\n${'Yuri receives raw operator intent, normalizes it, compiles a graph plan, dispatches work, verifies artifacts, sanitizes tainted output, and promotes only reviewed facts. '.repeat(90)}`,
      validatorName: 'non_empty_summary',
      validate: (output) => ({ ok: output.trim().length > 80, expected: 'non-empty summary over 80 chars' }),
    },
    {
      id: 'route_plan_accuracy',
      metric: 'route-plan accuracy',
      role: 'utility',
      model: local.utility || 'qwen3.5:4b',
      system: 'Return only strict JSON.',
      prompt: 'Classify this Yuri request into a scenario: "brain dump to durable orchestration control plane with graph plan, verify, sanitize, promote". Return {"scenario":"...","confidence":0.0}.',
      validatorName: 'control_plane_scenario_json',
      validate: (output) => {
        const json = parseJsonObject(output);
        return {
          ok: json?.scenario === 'control-plane-orchestration',
          expected: 'scenario=control-plane-orchestration',
          observed: json?.scenario || null,
        };
      },
    },
    {
      id: 'typescript_symbol_accuracy',
      metric: 'code-symbol accuracy',
      role: 'code',
      model: local.code || 'qwen2.5-coder:7b',
      system: 'Return only strict JSON.',
      prompt: 'Given TypeScript `function resolveLane(lane: string) { return lane === "code-local" ? "qwen2.5-coder:7b" : "qwen3.5:4b"; }`, return {"symbol":"...","code_local_model":"..."}.',
      validatorName: 'symbol_and_model_json',
      validate: (output) => {
        const json = parseJsonObject(output);
        return {
          ok: json?.symbol === 'resolveLane' && json?.code_local_model === 'qwen2.5-coder:7b',
          expected: 'resolveLane + qwen2.5-coder:7b',
          observed: json || null,
        };
      },
    },
    {
      id: 'native_function_candidate_json',
      metric: 'JSON compliance',
      role: 'utility',
      model: local.utility || 'qwen3.5:4b',
      system: 'Return only valid JSON. No markdown.',
      prompt: 'Evaluate whether "obliteratus QA gate" should be a deterministic native Yuri function or a model. Return {"native_function":true,"reason":"...","requires_model":false}.',
      validatorName: 'strict_native_function_json',
      validate: (output) => {
        const json = parseJsonObject(output);
        return {
          ok: json?.native_function === true && json?.requires_model === false,
          expected: 'native_function=true and requires_model=false',
          observed: json || null,
        };
      },
    },
    {
      id: 'gitnexus_file_inventory',
      metric: 'file-inventory accuracy',
      role: 'primary',
      model: local.primary || 'qwen2.5:7b',
      system: 'Return only strict JSON.',
      prompt: 'Which repo file owns automatic offload lane selection? Choose one: Scripts/offload-contract.mjs, backend/src/services/smartRouter.ts, README.md. Return {"source_of_truth":"..."}.',
      validatorName: 'offload_contract_source_json',
      validate: (output) => {
        const json = parseJsonObject(output);
        return {
          ok: json?.source_of_truth === 'Scripts/offload-contract.mjs',
          expected: 'Scripts/offload-contract.mjs',
          observed: json?.source_of_truth || null,
        };
      },
    },
  ];
}

async function generateWithOllama(model, prompt, system, timeoutMs) {
  const host = (process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system,
        stream: false,
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OLLAMA_${response.status}: ${await response.text()}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function listInstalledModels() {
  const models = new Set();

  try {
    const out = execFileSync('ollama', ['list'], { encoding: 'utf8', timeout: 5000 });
    for (const line of out.split(/\r?\n/).slice(1)) {
      const name = line.trim().split(/\s+/)[0];
      if (name) models.add(name);
    }
  } catch {
    // Manifest fallback below supports CI and machines without an active ollama binary.
  }

  const manifestRoot = process.env.OLLAMA_MANIFEST_DIR || path.join(process.env.HOME || '', '.ollama/models/manifests/registry.ollama.ai/library');
  if (!existsSync(manifestRoot)) return models;

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
      if (parts.length >= 2) models.add(`${parts[0]}:${parts[1]}`);
    }
  }

  return models;
}

function parseJsonObject(output) {
  try {
    return JSON.parse(output);
  } catch {
    const match = output.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function memorySnapshot() {
  return {
    total_gb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    free_gb: Number((os.freemem() / 1024 ** 3).toFixed(2)),
    loadavg_1m: Number(os.loadavg()[0].toFixed(2)),
  };
}

function machineSummary() {
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    total_memory_gb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
  };
}

function ollamaVersion() {
  try {
    return execFileSync('ollama', ['--version'], { encoding: 'utf8', timeout: 3000 }).trim();
  } catch {
    return 'unavailable';
  }
}

function summarize(items) {
  const failed = items.filter((item) => !['ok', 'planned'].includes(item.status)).length;
  const heavyAutoModels = new Set(['deepseek-liberated:latest', 'deepseek-v2:16b', 'gemma4:latest']);
  const automaticModels = items.map((item) => item.model).filter(Boolean);
  return {
    total: items.length,
    passed: items.length - failed,
    failed,
    missing_models: items.filter((item) => item.status === 'missing_model').map((item) => item.model),
    heavy_models_selected: automaticModels.filter((model) => heavyAutoModels.has(model)),
  };
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

function printHuman(payload) {
  console.log(`Yuri local model benchmark (${payload.dry_run ? 'dry-run' : 'execute'})`);
  console.log(`Ollama: ${payload.ollama_version}`);
  console.log(`Policy: utility=${payload.policy.utility} primary=${payload.policy.primary} code=${payload.policy.code}`);
  for (const result of payload.results) {
    const rate = result.tokens_per_second == null ? '' : ` ${result.tokens_per_second} tok/s`;
    const load = result.cold_load_ms == null ? '' : ` cold=${result.cold_load_ms}ms`;
    console.log(`- ${result.id}: ${result.status} ${result.model}${load}${rate}`);
  }
}

function printHelp() {
  console.log(`Usage: node Scripts/yuri-local-model-benchmark.mjs [--dry-run|--execute] [--json] [--scenario-limit N] [--timeout-ms N]

Dry-run is the default. Use --execute to call local Ollama and measure cold-load, tokens/sec, JSON compliance, route-plan accuracy, code-symbol accuracy, and memory snapshots.`);
}
