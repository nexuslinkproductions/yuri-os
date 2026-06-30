#!/usr/bin/env node
// @capability: zai-tmux-fleet-dispatch
// @serves: zai tmux fleet | glm-5.2 tmux workers | claude-zai fleet | GLM heavy substrate | Marcel-visible CC runtime
// @does: parallel fan-out of N Z.ai Claude Code tmux workers (glm-5.2 via `ai claude-zai`) with concurrency cap (default 2), prompt inject via tmux send-keys, RESULT_LABEL poll from capture-pane, packets in .claude/jobs/<runId>/results/. DISARMED by default; YURI_ZAI_TMUX_FLEET=1 or zai-tmux-fleet.enabled arms live tmux spawns.
// @use: zaiTmuxFleet([{label:'R1',prompt:'...'}], {concurrency:2}) — CLI: node zai-tmux-fleet.mjs --list | --tasks-file <path> | --dry-run | --smoke
// @exports: zaiTmuxFleet, resolveModel, DEFAULT_MODEL, WORKER_PREFIX, ARM_ENV, ARM_FLAG, isArmed, extractResultLabel, validatePacket, buildRunDir

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  extractResultLabel,
  validatePacket,
  buildRunDir,
} from './ollama-fleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const SPAWN_WORKER = path.join(REPO_ROOT, '_SYSTEM/Scripts/voice/yuri-spawn-worker.sh');
const AI_BIN = path.join(REPO_ROOT, '_SYSTEM/Scripts/ai');

export const ARM_ENV = 'YURI_ZAI_TMUX_FLEET';
export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'zai-tmux-fleet.enabled');
export const DEFAULT_MODEL = 'glm-5.2';
export const WORKER_PREFIX = 'zai-worker';

export function isArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

export { extractResultLabel, validatePacket, buildRunDir };

export function resolveModel(task = {}) {
  if (task.model && typeof task.model === 'string') return task.model;
  return DEFAULT_MODEL;
}

function safeLabel(s, i = 0) {
  const v = String(s || `zai${i + 1}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  return v || `zai${i + 1}`;
}

function safeWorkerName(name, index) {
  const base = String(name || `${WORKER_PREFIX}-${index + 1}`).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 48);
  return base || `${WORKER_PREFIX}-${index + 1}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tmux(args, opts = {}) {
  try {
    return execFileSync('tmux', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch (e) {
    if (opts.allowFail) return '';
    throw e;
  }
}

function tmuxHasSession(name) {
  try {
    execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function paneCommand(session) {
  return tmux(['display-message', '-p', '-t', `${session}:0.0`, '#{pane_current_command}'], { allowFail: true });
}

function claudeRunning(session) {
  const cmd = paneCommand(session);
  return cmd.length > 0 && !['zsh', 'bash', 'sh', '-', ''].includes(cmd);
}

function tmuxSendKeys(session, text, enter = false) {
  tmux(['send-keys', '-t', `${session}:0.0`, '-l', text]);
  if (enter) tmux(['send-keys', '-t', `${session}:0.0`, 'Enter']);
}

function capturePane(session, scrollLines = 500) {
  return tmux(['capture-pane', '-p', '-t', `${session}:0.0`, '-S', `-${scrollLines}`], { allowFail: true });
}

async function waitForClaude(session, maxMs = 60000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (claudeRunning(session)) return true;
    await sleep(500);
  }
  return claudeRunning(session);
}

async function ensureWorkerHeadless(workerName, model) {
  if (!tmuxHasSession(workerName)) {
    tmux(['new-session', '-d', '-s', workerName, '-c', REPO_ROOT, '-x', '220', '-y', '50']);
    await sleep(400);
  }
  if (!claudeRunning(workerName)) {
    const launch = `export ZAI_MODEL=${model} && '${AI_BIN}' claude-zai`;
    tmuxSendKeys(workerName, launch, true);
  }
  return waitForClaude(workerName, 60000);
}

function spawnWorkerVisible(workerName) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [SPAWN_WORKER, workerName, ''], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `spawn-worker exit ${code}`));
    });
    child.on('error', reject);
  });
}

async function ensureWorker(workerName, model, showTerminal) {
  if (showTerminal) {
    await spawnWorkerVisible(workerName);
    return waitForClaude(workerName, 60000);
  }
  return ensureWorkerHeadless(workerName, model);
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

async function fireTask(task, label, runDir, runId, index) {
  const outFile = path.join(runDir, `${label}.out`);
  const model = resolveModel(task);
  const workerName = safeWorkerName(task.workerName, index);
  const prompt = String(task.prompt || '');
  const timeoutMs = Number(task.timeoutMs) > 0 ? Number(task.timeoutMs) : 3600000;
  const pollMs = Number(task.pollMs) > 0 ? Number(task.pollMs) : 5000;
  const showTerminal = task.showTerminal === true;
  const t0 = Date.now();
  let stderr = '';
  let text = '';
  let resultLabel = '';
  let status = 'fail';
  let ok = false;

  try {
    const booted = await ensureWorker(workerName, model, showTerminal);
    if (!booted) {
      stderr = '[ZAI_TMUX_BOOT_FAIL] claude-zai did not start within 60s';
    } else {
      await sleep(showTerminal ? 1000 : 500);
      tmuxSendKeys(workerName, prompt, true);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        text = capturePane(workerName);
        if (fs.existsSync(outFile)) {
          try {
            const fileText = fs.readFileSync(outFile, 'utf8').trim();
            if (fileText.length > text.length) text = fileText;
          } catch { /* best-effort */ }
        }
        resultLabel = extractResultLabel(text);
        if (resultLabel) {
          status = 'ok';
          ok = true;
          break;
        }
        if (!claudeRunning(workerName)) {
          const healed = await ensureWorkerHeadless(workerName, model);
          if (!healed) {
            stderr = '[ZAI_TMUX_WORKER_DEAD] bare shell after self-heal attempt';
            break;
          }
        }
        await sleep(pollMs);
      }
      if (!ok && !stderr) {
        stderr = `[ZAI_TMUX_TIMEOUT] durationMs=${Date.now() - t0} timeoutMs=${timeoutMs}`;
        if (!text) text = stderr;
        else text = `${stderr}\n--- partial pane ---\n${text.slice(-4000)}`;
      }
    }
  } catch (e) {
    stderr = String(e?.message || e);
    if (!text) text = `[ZAI_TMUX_ERROR] ${stderr}`;
  }

  try { fs.writeFileSync(outFile, text); } catch { /* best-effort */ }

  const packet = {
    laneId: `zai-tmux:${model}`,
    model,
    provider: 'zai-tmux',
    role: task.label || label,
    task: prompt.slice(0, 200),
    resultLabel,
    evidence: ok ? '' : stderr.slice(-400),
    status,
    text,
    durationMs: Date.now() - t0,
    runId,
    workerName,
  };
  if (process.env.YURI_FLEET_TRACE_ID) {
    packet.traceId = process.env.YURI_FLEET_TRACE_ID;
    packet.spanId = task.label || label;
  }
  if (!validatePacket(packet)) packet.status = 'malformed';
  try { fs.writeFileSync(path.join(runDir, `${label}.json`), `${JSON.stringify(packet, null, 2)}\n`); } catch { /* */ }

  if (task.cleanup !== false && tmuxHasSession(workerName)) {
    try { tmux(['kill-session', '-t', workerName]); } catch { /* best-effort */ }
  }

  return {
    label,
    model,
    workerName,
    text,
    exitCode: ok ? 0 : 1,
    file: outFile,
    resultLabel,
    ok,
    durationMs: Date.now() - t0,
    stderr: ok ? '' : stderr.slice(-400),
  };
}

/**
 * Fan out a Z.ai tmux fleet. DISARMED by default.
 * @param {Array<{label,prompt,model?,workerName?,timeoutMs?,showTerminal?,pollMs?}>} tasks
 * @param {{concurrency?:number, runId?:string, runDir?:string, armed?:boolean}} opts
 */
export async function zaiTmuxFleet(tasks = [], opts = {}) {
  const armed = opts.armed != null ? !!opts.armed : isArmed();
  const runId = opts.runId || `ztf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
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
    workerName: safeWorkerName(t.workerName, i),
    provider: 'zai-tmux',
    prompt: String(t.prompt || ''),
    showTerminal: t.showTerminal === true,
  }));

  if (!armed) {
    return { runId, runDir, armed: false, dryRun: true, concurrency, plan, provider: 'zai-tmux' };
  }

  fs.mkdirSync(runDir, { recursive: true });
  const results = await runPool(tasks, concurrency, (t, i) => fireTask(t, labels[i], runDir, runId, i));
  return { runId, runDir, armed: true, concurrency, provider: 'zai-tmux', results };
}

function listRoster() {
  const armed = isArmed();
  const how = process.env[ARM_ENV] === '1' ? 'env YURI_ZAI_TMUX_FLEET=1' : (fs.existsSync(ARM_FLAG) ? 'flag _SYSTEM/state/zai-tmux-fleet.enabled' : '');
  const out = [];
  out.push(`zai-tmux-fleet — ${armed ? `ARMED (${how})` : 'DISARMED (dry-run; arm via YURI_ZAI_TMUX_FLEET=1 or: touch _SYSTEM/state/zai-tmux-fleet.enabled)'}`);
  out.push(`default model: ${DEFAULT_MODEL} (Z.ai GLM Coding Plan via ai claude-zai)`);
  out.push(`worker prefix: ${WORKER_PREFIX}-N (headless tmux by default; showTerminal:true opens macOS Terminal via yuri-spawn-worker.sh)`);
  out.push('LIMITATION: claude-zai is interactive-only — automation uses tmux send-keys + capture-pane poll; no headless --print path.');
  out.push('Usage: node zai-tmux-fleet.mjs --tasks-file <path> [--concurrency 2] [--dry-run]');
  out.push('       node zai-tmux-fleet.mjs --smoke   (live smoke; needs YURI_ZAI_TMUX_FLEET=1 + tmux + Z.ai key)');
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
      label: 'SMOKE_ZAI_TMUX',
      model: DEFAULT_MODEL,
      timeoutMs: 300000,
      pollMs: 3000,
      prompt: 'Reply with one short line confirming Z.ai tmux fleet is live, then on a NEW line emit exactly: 01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED . No other text.',
    }];
  } else if (flagVal('--tasks-file') || flagVal('--tasks')) {
    try {
      const raw = flagVal('--tasks-file')
        ? JSON.parse(fs.readFileSync(flagVal('--tasks-file'), 'utf8'))
        : JSON.parse(flagVal('--tasks'));
      tasks = Array.isArray(raw) ? raw : (raw.tasks ?? []);
    } catch (e) {
      process.stderr.write(`zai-tmux-fleet: bad tasks input: ${String(e?.message || e)}\n`);
      process.exit(2);
    }
    if (!tasks.length) {
      process.stderr.write('zai-tmux-fleet: tasks must be a non-empty array\n');
      process.exit(2);
    }
  } else {
    process.stderr.write('zai-tmux-fleet: provide --tasks-file <path> | --tasks <json> | --smoke | --list\n');
    process.exit(2);
  }
  const opts = { concurrency: Number(flagVal('--concurrency') || 2) };
  if (forceDry) opts.armed = false;
  zaiTmuxFleet(tasks, opts).then((r) => {
    const summary = r.dryRun
      ? { runId: r.runId, armed: false, dryRun: true, runDir: r.runDir, provider: 'zai-tmux', lanes: r.plan.map((p) => ({ label: p.label, model: p.model, workerName: p.workerName })) }
      : { runId: r.runId, armed: true, runDir: r.runDir, concurrency: r.concurrency, results: r.results.map((x) => ({ label: x.label, model: x.model, workerName: x.workerName, ok: x.ok, exitCode: x.exitCode, resultLabel: x.resultLabel, ms: x.durationMs, chars: x.text.length })) };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exit(r.dryRun ? 0 : (r.results.every((x) => x.ok) ? 0 : 1));
  }).catch((e) => { process.stderr.write(`zai-tmux-fleet error: ${String(e?.message || e)}\n`); process.exit(1); });
}
