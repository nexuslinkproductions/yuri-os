#!/usr/bin/env node
// @capability: cline-fleet-dispatch
// @serves: cline fleet | clinepass sidecar | cline cli peer lane | fourth substrate
// @does: parallel fan-out of N ClinePass CLI tasks (`cline -P clinepass -m <model>`) with concurrency cap, RESULT_LABEL packets in .claude/jobs/<runId>/results/. DISARMED by default; YURI_CLINE_FLEET=1 or cline-fleet.enabled arms live spend.
// @use: clineFleet([{model:'glm-5.2',label:'R1',prompt:'...'}], {concurrency:2}) — CLI: node cline-fleet.mjs --list | --tasks-file <path> | --dry-run | --smoke
// @exports: clineFleet, resolveModel, CLINE_ROSTER, DEFAULT_MODEL, PROVIDER, ARM_ENV, ARM_FLAG, isArmed, extractResultLabel, validatePacket, buildRunDir

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  extractResultLabel,
  validatePacket,
  buildRunDir,
} from './ollama-fleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const PROVIDER = 'cline-pass';
export const ARM_ENV = 'YURI_CLINE_FLEET';
export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'cline-fleet.enabled');

export function isArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

/** Load the YURI-registered ClinePass key (gitignored, 600 perms) and inject into spawn env. */
const CLINE_PASS_KEY_FILE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'cline-pass.key');
let _cachedKey = null;
function loadClinePassKey() {
  if (_cachedKey !== null) return _cachedKey;
  try {
    if (fs.existsSync(CLINE_PASS_KEY_FILE)) {
      _cachedKey = fs.readFileSync(CLINE_PASS_KEY_FILE, 'utf8').trim() || false;
    } else {
      _cachedKey = false;
    }
  } catch { _cachedKey = false; }
  return _cachedKey;
}

/** Build the env for a cline spawn, injecting the YURI-registered key if present. */
function buildClineEnv() {
  const env = { ...process.env };
  const key = loadClinePassKey();
  if (key) {
    if (!env.CLINE_PASS_API_KEY) env.CLINE_PASS_API_KEY = key;
    if (!env.CLINE_API_KEY) env.CLINE_API_KEY = key;
  }
  return env;
}

/** ClinePass models — cline CLI v3 expects modelType/model format (cline-pass/<model>). */
export const CLINE_ROSTER = Object.freeze({
  glm: 'cline-pass/glm-5.2',
  kimi: 'cline-pass/kimi-k2.7-code',
  deepseek: 'cline-pass/deepseek-v4-pro',
  mimo: 'cline-pass/mimo-v2.5',
  qwen: 'cline-pass/qwen3.7-max',
});
export const DEFAULT_MODEL = CLINE_ROSTER.glm;

export function resolveModel(task = {}) {
  if (task.model && typeof task.model === 'string') return task.model;
  if (task.tier && CLINE_ROSTER[task.tier]) return CLINE_ROSTER[task.tier];
  return DEFAULT_MODEL;
}

function safeLabel(s, i = 0) {
  const v = String(s || `cline${i + 1}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  return v || `cline${i + 1}`;
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    const i = cursor;
    cursor += 1;
    if (i >= items.length) return;
    results[i] = await Promise.resolve(worker(items[i], i)).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    return next();
  }
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => next());
  await Promise.all(lanes);
  return results;
}

function fireTask(task, label, runDir, runId) {
  return new Promise((resolve) => {
    const outFile = path.join(runDir, `${label}.out`);
    const model = resolveModel(task);
    const timeoutSec = Math.max(60, Math.floor(Number(task.timeoutSec || task.timeoutMs / 1000 || 600)));
    const prompt = String(task.prompt || '');
    const key = loadClinePassKey();
    const args = [
      '-P', PROVIDER,
      '-m', model,
      '-c', REPO_ROOT,
      '--auto-approve', 'true',
      '-t', String(timeoutSec),
    ];
    if (key) args.push('-k', key);
    args.push(prompt);
    const t0 = Date.now();
    let err = '';
    let stdout = '';
    let child;
    try {
      child = spawn('cline', args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildClineEnv(),
      });
    } catch (e) {
      resolve({
        label, model, text: '', exitCode: 1, file: outFile, resultLabel: '', ok: false,
        durationMs: Date.now() - t0, stderr: String(e?.message || e),
      });
      return;
    }
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      const text = stdout.trim();
      try { fs.writeFileSync(outFile, text); } catch { /* best-effort */ }
      const resultLabel = extractResultLabel(text);
      const ok = code === 0 && text.length > 0;
      const packet = {
        laneId: `cline:${PROVIDER}:${model}`,
        model,
        provider: PROVIDER,
        role: task.label || label,
        task: prompt.slice(0, 200),
        resultLabel,
        evidence: '',
        status: ok ? 'ok' : 'fail',
        text,
        durationMs: Date.now() - t0,
        runId,
      };
      if (process.env.YURI_FLEET_TRACE_ID) {
        packet.traceId = process.env.YURI_FLEET_TRACE_ID;
        packet.spanId = task.label || label;
      }
      if (!validatePacket(packet)) packet.status = 'malformed';
      try { fs.writeFileSync(path.join(runDir, `${label}.json`), `${JSON.stringify(packet, null, 2)}\n`); } catch { /* */ }
      resolve({
        label, model, text, exitCode: code, file: outFile, resultLabel, ok,
        durationMs: Date.now() - t0, stderr: ok ? '' : err.slice(-400),
      });
    });
    child.on('error', (e) => {
      resolve({
        label, model, text: '', exitCode: 1, file: outFile, resultLabel: '', ok: false,
        durationMs: Date.now() - t0, stderr: String(e?.message || e),
      });
    });
  });
}

/**
 * Fan out a ClinePass fleet. DISARMED by default.
 * @param {Array<{model?,tier?,label,prompt,timeoutSec?,timeoutMs?}>} tasks
 * @param {{concurrency?:number, runId?:string, runDir?:string, armed?:boolean}} opts
 */
export async function clineFleet(tasks = [], opts = {}) {
  const armed = opts.armed != null ? !!opts.armed : isArmed();
  const runId = opts.runId || `clf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = opts.runDir || buildRunDir(runId);
  const cRaw = Number(opts.concurrency);
  const concurrency = Number.isFinite(cRaw) && cRaw >= 1 ? Math.floor(cRaw) : 2;
  const seenLabels = new Set();
  const labels = tasks.map((t, i) => {
    let l = safeLabel(t.label, i);
    if (seenLabels.has(l)) l = `${l}_${i}`;
    seenLabels.add(l);
    return l;
  });
  const plan = tasks.map((t, i) => ({
    label: labels[i],
    model: resolveModel(t),
    provider: PROVIDER,
    prompt: String(t.prompt || ''),
  }));

  if (!armed) {
    return { runId, runDir, armed: false, dryRun: true, concurrency, plan, provider: PROVIDER };
  }

  fs.mkdirSync(runDir, { recursive: true });
  const results = await runPool(tasks, concurrency, (t, i) => fireTask(t, labels[i], runDir, runId));
  return { runId, runDir, armed: true, concurrency, provider: PROVIDER, results };
}

function listRoster() {
  const armed = isArmed();
  const how = process.env[ARM_ENV] === '1' ? 'env YURI_CLINE_FLEET=1' : (fs.existsSync(ARM_FLAG) ? 'flag _SYSTEM/state/cline-fleet.enabled' : '');
  const out = [];
  out.push(`cline-fleet — ${armed ? `ARMED (${how})` : 'DISARMED (dry-run; arm via YURI_CLINE_FLEET=1 or: touch _SYSTEM/state/cline-fleet.enabled)'}`);
  out.push(`provider: ${PROVIDER} (ClinePass subscription — see _SYSTEM/reports/CLINE_CREDIT_BUDGET.md)`);
  out.push('roster (tier -> model):');
  for (const [tier, model] of Object.entries(CLINE_ROSTER)) {
    out.push(`  ${tier.padEnd(10)} ${model}${model === DEFAULT_MODEL ? '   (default)' : ''}`);
  }
  out.push('Usage: node cline-fleet.mjs --tasks-file <path> [--concurrency 2] [--dry-run]');
  out.push('       node cline-fleet.mjs --smoke   (live smoke; needs YURI_CLINE_FLEET=1 + cline auth clinepass)');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flagVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--list') || argv.length === 0) {
    process.stdout.write(`${listRoster()}\n`);
    process.exit(0);
  }
  const forceDry = argv.includes('--dry-run');
  let tasks = [];
  if (argv.includes('--smoke')) {
    tasks = [{
      tier: 'glm',
      label: 'SMOKE_CLINE',
      timeoutSec: 120,
      prompt: 'Reply with one short line confirming ClinePass is live, then on a NEW line emit exactly: 01CL_CLINE_FLEET_SMOKE_X_PASS_COMMITTED . No other text.',
    }];
  } else if (flagVal('--tasks-file') || flagVal('--tasks')) {
    try {
      const raw = flagVal('--tasks-file')
        ? JSON.parse(fs.readFileSync(flagVal('--tasks-file'), 'utf8'))
        : JSON.parse(flagVal('--tasks'));
      tasks = Array.isArray(raw) ? raw : (raw.tasks ?? []);
    } catch (e) {
      process.stderr.write(`cline-fleet: bad tasks input: ${String(e?.message || e)}\n`);
      process.exit(2);
    }
    if (!tasks.length) {
      process.stderr.write('cline-fleet: tasks must be a non-empty array\n');
      process.exit(2);
    }
  } else {
    process.stderr.write('cline-fleet: provide --tasks-file <path> | --tasks <json> | --smoke | --list\n');
    process.exit(2);
  }
  const opts = { concurrency: Number(flagVal('--concurrency') || 2) };
  if (forceDry) opts.armed = false;
  clineFleet(tasks, opts).then((r) => {
    const summary = r.dryRun
      ? { runId: r.runId, armed: false, dryRun: true, runDir: r.runDir, provider: PROVIDER, lanes: r.plan.map((p) => ({ label: p.label, model: p.model })) }
      : { runId: r.runId, armed: true, runDir: r.runDir, concurrency: r.concurrency, results: r.results.map((x) => ({ label: x.label, model: x.model, ok: x.ok, exitCode: x.exitCode, resultLabel: x.resultLabel, ms: x.durationMs, chars: x.text.length })) };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exit(r.dryRun ? 0 : (r.results.every((x) => x.ok) ? 0 : 1));
  }).catch((e) => { process.stderr.write(`cline-fleet error: ${String(e?.message || e)}\n`); process.exit(1); });
}
