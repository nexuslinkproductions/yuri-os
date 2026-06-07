#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveOllamaAdditiveLane,
  runOllamaCloudChat,
  runOllamaLocalChat,
} from './ollama-adapter.mjs';
import { coreOnDispatch, coreOnResult } from './lane-core-hooks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const options = parseCli(process.argv.slice(2));
let prompt = options.prompt || process.env.LLM_COMPAT_PROMPT_TEXT || '';
if (!prompt && !options.dryRun && !process.stdin.isTTY) {
  prompt = readFileSync(0, 'utf8');
}

try {
  const installedModels = listInstalledModels();
  const lane = resolveOllamaAdditiveLane(options.lane, options.model, installedModels, options.dryRun);

  if (options.dryRun) {
    const printable = { ...lane };
    if (printable.apiKey) printable.hasKey = true;
    delete printable.apiKey;
    process.stdout.write(`${JSON.stringify({
      lane: normalizeLane(options.lane),
      promptChars: prompt.length,
      installed: [...installedModels].sort(),
      ...printable,
    }, null, 2)}\n`);
    process.exitCode = lane.executable === false ? 1 : 0;
  } else {
    if (lane.executable === false || lane.kind === 'blocked') {
      throw new Error(lane.error || 'ollama lane blocked');
    }
    if (!prompt.trim()) throw new Error('empty_prompt');

    const normalizedLane = normalizeLane(options.lane);
    const runId = process.env.LLM_COMPAT_TASK_ID || `ollama-lane-${Date.now()}-${process.pid}`;
    const { recallBlock } = await coreOnDispatch({ lane: normalizedLane, prompt, runId });
    const system = [options.system || systemForLane(options.lane), recallBlock].filter(Boolean).join('\n\n');
    const ledger = {
      lane: normalizedLane,
      traceId: runId,
    };
    const output = lane.kind === 'cloud'
      ? await runOllamaCloudChat(lane.endpoint, lane.apiKey, lane.model, prompt, system, ledger)
      : await runOllamaLocalChat(lane.model, prompt, system, ledger);

    coreOnResult({ lane: normalizedLane, prompt, output, exitCode: 0, runId });
    process.stdout.write(output + (output.endsWith('\n') ? '' : '\n'));
  }
} catch (error) {
  const reason = String(error?.message || error || 'unknown').replace(/\s+/g, '_').slice(0, 180);
  process.stderr.write(`LLM_COMPAT_FAIL code=1 lane=${normalizeLane(options.lane)} reason=${reason}\n`);
  process.exitCode = 1;
}

function parseCli(argv) {
  const out = { lane: '', prompt: '', model: '', system: '', dryRun: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--model' || arg === '-m') {
      out.model = argv[++i] || '';
    } else if (arg === '--system') {
      out.system = readMaybeFile(argv[++i] || '');
    } else if (arg === '--dry-run' || arg === '--route-only' || arg === '-d') {
      out.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      continue;
    } else {
      rest.push(arg);
    }
  }
  out.lane = rest.shift() || 'ollama';
  out.prompt = rest.join(' ');
  return out;
}

function readMaybeFile(value) {
  if (!value) return '';
  if (!value.startsWith('@')) return value;
  const file = path.resolve(REPO_ROOT, value.slice(1));
  return readFileSync(file, 'utf8');
}

function normalizeLane(lane) {
  return String(lane || 'ollama').replace(/^@/, '').toLowerCase();
}

function systemForLane(lane) {
  const normalized = normalizeLane(lane);
  if (normalized === 'code-local') return 'Return concise code-focused analysis. Do not invent file paths.';
  if (normalized === 'summarize-local') return 'Return a compact factual summary. Preserve source uncertainty.';
  if (normalized.startsWith('gemma')) return 'You are a local Gemma lane for bounded YURI analysis. Return concise, evidence-aware output.';
  return 'You are a local YURI utility lane. Return structured, terse output.';
}

function listInstalledModels() {
  const models = new Set();
  try {
    const out = execFileSync('ollama', ['list'], { encoding: 'utf8', timeout: 7000 });
    for (const line of out.split(/\r?\n/).slice(1)) {
      const name = line.trim().split(/\s+/)[0];
      if (name) models.add(name);
    }
  } catch {
    // Manifest fallback below covers stopped daemons and CI.
  }

  const manifestRoot = process.env.OLLAMA_MANIFEST_DIR || path.join(process.env.HOME || '', '.ollama/models/manifests/registry.ollama.ai/library');
  if (existsSync(manifestRoot)) {
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

function printHelp() {
  process.stdout.write(`Usage: node _SYSTEM/Scripts/ollama-lane.mjs <lane> [prompt] [--model MODEL] [--dry-run]\n`);
}
