#!/usr/bin/env node
// @capability: zai-tmux-fleet-dispatch
// @serves: zai tmux fleet | glm-5.2 tmux workers | claude-zai fleet | GLM heavy substrate | Marcel-visible CC runtime
// @does: parallel fan-out of N Z.ai GLM workers — headless automation via lane-dispatch glm-max (--out poll, same Z.ai provider); showTerminal:true uses claude-zai in tmux + send-keys for Marcel-visible CC. Concurrency cap default 2. Packets in .claude/jobs/<runId>/results/. DISARMED by default; YURI_ZAI_TMUX_FLEET=1 or zai-tmux-fleet.enabled arms live spawns.
// Marcel wire notes (2026-06-30): fleet MUST export ZAI_MODEL=glm-5.2 (1M ctx per models.json — no [1m] suffix); wait for claude-zai splash (WORKSPACE/GLM/SESSION) before inject; interactive claude-zai needs TWO Enter presses (first boot/accept, second sends prompt).
// @use: zaiTmuxFleet([{label:'R1',prompt:'...'}], {concurrency:2}) — CLI: node zai-tmux-fleet.mjs --list | --tasks-file <path> | --dry-run | --smoke
// @exports: zaiTmuxFleet, resolveModel, resolveLane, resolveMode, DEFAULT_MODEL, WORKER_PREFIX, ARM_ENV, ARM_FLAG, isArmed, extractResultLabel, validatePacket, buildRunDir

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  extractResultLabel,
  validatePacket,
  buildRunDir,
} from './ollama-fleet.mjs';
import { defaultTimeoutMsForLane } from './glm-fleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const SPAWN_WORKER = path.join(REPO_ROOT, '_SYSTEM/Scripts/voice/yuri-spawn-worker.sh');
const AI_BIN = path.join(REPO_ROOT, '_SYSTEM/Scripts/ai');
const LANE_DISPATCH = path.join(HERE, 'lane-dispatch.mjs');
const DEBUG_LOG = process.env.YURI_ZAI_TMUX_DEBUG_LOG || '/tmp/zai-tmux-debug.log';

export const MODE_LLM_LANE = 'llm-lane';
export const MODE_CLAUDE_ZAI = 'claude-zai';

export const ARM_ENV = 'YURI_ZAI_TMUX_FLEET';
export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'zai-tmux-fleet.enabled');
export const DEFAULT_MODEL = 'glm-5.2';
/** ZAI_MODEL value for fleet spawns — glm-5.2 carries 1M context_window in .claude/config/models.json. */
export const ZAI_FLEET_MODEL_ENV = DEFAULT_MODEL;
export const WORKER_PREFIX = 'zai-worker';
export const DEFAULT_MIN_DURATION_MS = 60000;
export const SMOKE_MIN_DURATION_MS = 5000;
export const INJECT_DOUBLE_ENTER_GAP_MS = 2000;
export const FALSE_GREEN_REASON = 'false-green:prompt-echo';

/** Remove echoed prompt text from pane capture before label extraction. */
export function stripInjectedPrompt(text, prompt) {
  let s = String(text || '');
  const p = String(prompt || '');
  if (!p) return s;
  if (s.includes(p)) s = s.split(p).join('');
  const pLines = p.split('\n').map((l) => l.trim()).filter(Boolean);
  if (pLines.length > 1) {
    for (const line of pLines) {
      if (line.length > 12 && s.includes(line)) s = s.split(line).join('');
    }
  }
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/** True when pane body exceeds prompt echo or shows implementation evidence. */
export function hasSubstantiveEvidence(text, prompt) {
  const s = String(text || '');
  const p = String(prompt || '');
  if (s.length > p.length + 50) return true;
  if (/```/.test(s)) return true;
  if (/(?:^|\s)(?:\.\/|_SYSTEM\/|02_RESOURCES\/)[^\s]+/m.test(s)) return true;
  if (/\b[\w.-]+\.(?:mjs|ts|tsx|js|jsx|json|md)\b/.test(s)) return true;
  if (/\b(?:function|export|import|const|class)\b/.test(s)) return true;
  return false;
}

/** Classify a candidate label against baseline, duration, and pane substance. */
export function classifyPollResult({ resultLabel, baselineLabel, elapsedMs, strippedText, prompt, minDurationMs, smokePing = false }) {
  if (!resultLabel) return { ok: false, reason: '' };
  const violations = [];
  if (baselineLabel && baselineLabel === resultLabel) violations.push('baseline-had-label');
  if (elapsedMs < minDurationMs) violations.push('too-fast');
  if (!smokePing) {
    if (prompt.includes(resultLabel) && !hasSubstantiveEvidence(strippedText, prompt)) {
      violations.push('label-in-prompt');
    }
    if (!hasSubstantiveEvidence(strippedText, prompt)) violations.push('no-substance');
  }
  if (violations.length) return { ok: false, reason: `${FALSE_GREEN_REASON} (${violations.join(', ')})` };
  return { ok: true, reason: '' };
}

export function isArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

export { extractResultLabel, validatePacket, buildRunDir };

export function resolveModel(task = {}) {
  if (task.model && typeof task.model === 'string') return task.model;
  return DEFAULT_MODEL;
}

/** Map fleet model id → llm-lane alias (glm-5.2 → glm-max). */
export function resolveLane(model = DEFAULT_MODEL) {
  const m = String(model || DEFAULT_MODEL).toLowerCase();
  if (m === 'glm-5.2' || m === 'glm-max' || m === 'glm-5') return 'glm-max';
  if (m === 'glm-5.1' || m === 'glm-sub-orch') return 'glm-sub-orch';
  if (m === 'glm-4.7' || m === 'glm') return 'glm';
  return m;
}

/** Headless fleet uses lane-dispatch; Marcel-visible or tmuxClaudeZai uses claude-zai interactive. */
export function resolveMode(task = {}) {
  if (task.showTerminal === true || task.tmuxClaudeZai === true) return MODE_CLAUDE_ZAI;
  return MODE_LLM_LANE;
}

function dispatchAttemptsForLane(lane) {
  const key = String(lane || '');
  if (key === 'glm-max' || key === 'glm-sub-orch') return 2;
  return undefined;
}

function debugLog(msg) {
  if (process.env.YURI_ZAI_TMUX_DEBUG !== '1' && !process.env.YURI_ZAI_TMUX_DEBUG_LOG) return;
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(DEBUG_LOG, line); } catch { /* best-effort */ }
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
  return cmd.length > 0 && !['zsh', 'bash', 'sh', '-', 'node', 'ai'].includes(cmd);
}

/** True when claude-zai TUI shows an input-ready prompt (not boot splash). */
export function claudePaneReadyFromPane(pane, { claudeUp = true } = {}) {
  if (!claudeUp) return false;
  const body = String(pane || '');
  if (!body) return false;
  if (/0 tokens/i.test(body) && !/RESULT_LABEL/i.test(body)) return false;
  return /(?:Type your message|ctrl\+o|Claude Code|WORKSPACE|GLM|SESSION|>\s*$)/im.test(body);
}

function claudePaneReady(session) {
  return claudePaneReadyFromPane(capturePane(session, 80), { claudeUp: claudeRunning(session) });
}

/** Shell export + ai claude-zai launch line (always glm-5.2 / 1M unless task overrides model). */
export function buildWorkerLaunch(model = DEFAULT_MODEL) {
  return `export ZAI_MODEL=${model} && '${AI_BIN}' claude-zai`;
}

/**
 * Tmux send-keys plan for claude-zai prompt inject.
 * Marcel 2026-06-30: first Enter may accept/boot; second actually submits the prompt.
 */
export function injectPromptSteps(session, prompt) {
  const target = `${session}:0.0`;
  return [
    ['send-keys', '-t', target, '-l', String(prompt || '')],
    ['send-keys', '-t', target, 'Enter'],
    { sleepMs: INJECT_DOUBLE_ENTER_GAP_MS },
    ['send-keys', '-t', target, 'Enter'],
  ];
}

async function injectPromptDoubleEnter(session, prompt) {
  for (const step of injectPromptSteps(session, prompt)) {
    if (step.sleepMs != null) {
      await sleep(step.sleepMs);
      continue;
    }
    tmux(step);
  }
  debugLog(`injectPromptDoubleEnter ${session}: sent prompt (${String(prompt || '').length} chars) + 2x Enter`);
}

async function waitForShell(session, maxMs = 4000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const cmd = paneCommand(session);
    if (['zsh', 'bash', 'sh'].includes(cmd)) return true;
    await sleep(100);
  }
  return false;
}

async function waitForClaudeReady(session, maxMs = 90000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (claudePaneReady(session)) return true;
    if (claudeRunning(session) && Date.now() + 15000 > deadline) {
      const pane = capturePane(session, 40);
      if (pane && pane.length > 200 && !/Starting/i.test(pane.slice(-400))) return true;
    }
    await sleep(500);
  }
  return claudePaneReady(session);
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
    await waitForShell(workerName);
  }
  if (!claudeRunning(workerName)) {
    const launch = buildWorkerLaunch(model);
    tmuxSendKeys(workerName, launch, true);
    debugLog(`ensureWorkerHeadless ${workerName}: launched claude-zai ZAI_MODEL=${model}`);
  }
  const booted = await waitForClaude(workerName, 60000);
  if (!booted) return false;
  return waitForClaudeReady(workerName, 90000);
}

function spawnWorkerVisible(workerName, model = DEFAULT_MODEL) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [SPAWN_WORKER, workerName, ''], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ZAI_MODEL: model,
        YURI_WORKER_MODEL: model,
      },
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
    await spawnWorkerVisible(workerName, model);
  } else {
    const booted = await ensureWorkerHeadless(workerName, model);
    if (!booted) return false;
  }
  const running = await waitForClaude(workerName, 60000);
  if (!running) return false;
  return waitForClaudeReady(workerName, 90000);
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

function writePacket(packet, label, runDir) {
  if (!validatePacket(packet)) packet.status = 'malformed';
  try { fs.writeFileSync(path.join(runDir, `${label}.json`), `${JSON.stringify(packet, null, 2)}\n`); } catch { /* */ }
}

function finalizeResult({
  task, label, runDir, runId, model, workerName, lane, mode, prompt,
  t0, ok, status, text, resultLabel, stderr, outFile,
}) {
  const packet = {
    laneId: mode === MODE_LLM_LANE ? `zai-tmux:${lane}` : `zai-tmux:${model}`,
    model,
    lane: mode === MODE_LLM_LANE ? lane : undefined,
    mode,
    provider: 'zai-tmux',
    role: task.label || label,
    task: prompt.slice(0, 200),
    resultLabel,
    evidence: ok ? '' : stderr.slice(-400),
    status,
    text,
    durationMs: Date.now() - t0,
    runId,
    workerName: workerName || '',
  };
  if (process.env.YURI_FLEET_TRACE_ID) {
    packet.traceId = process.env.YURI_FLEET_TRACE_ID;
    packet.spanId = task.label || label;
  }
  writePacket(packet, label, runDir);
  return {
    label,
    model,
    lane,
    mode,
    workerName: workerName || '',
    text,
    exitCode: ok ? 0 : 1,
    file: outFile,
    resultLabel,
    ok,
    durationMs: Date.now() - t0,
    stderr: ok ? '' : stderr.slice(-400),
  };
}

/** Headless automation: lane-dispatch glm-max → --out file (same Z.ai provider, no claude-zai TUI). */
async function fireTaskHeadless(task, label, runDir, runId) {
  const outFile = path.join(runDir, `${label}.out`);
  const model = resolveModel(task);
  const lane = resolveLane(model);
  const prompt = String(task.prompt || '');
  const timeoutMs = Number(task.timeoutMs) > 0 ? Number(task.timeoutMs) : defaultTimeoutMsForLane(lane);
  const minDurationMs = Number(task.minDurationMs) > 0 ? Number(task.minDurationMs) : DEFAULT_MIN_DURATION_MS;
  const t0 = Date.now();
  let stderr = '';
  let text = '';
  let resultLabel = '';
  let status = 'fail';
  let ok = false;

  debugLog(`fireTaskHeadless ${label} lane=${lane} timeoutMs=${timeoutMs}`);

  const args = [LANE_DISPATCH, lane, prompt, '--out', outFile, '--reasoning', task.reasoning || 'high'];
  const dispatchEnv = { ...process.env, LANE_DISPATCH_TIMEOUT_MS: String(timeoutMs) };
  const attempts = dispatchAttemptsForLane(lane);
  if (attempts != null) dispatchEnv.LANE_DISPATCH_ATTEMPTS = String(attempts);

  const exitCode = await new Promise((resolve) => {
    let err = '';
    let child;
    try {
      child = spawn('node', args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: dispatchEnv,
      });
    } catch (e) {
      stderr = String(e?.message || e);
      resolve(1);
      return;
    }
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { stderr = err.trim(); resolve(code ?? 1); });
    child.on('error', (e) => { stderr = String(e?.message || e); resolve(1); });
  });

  try { text = fs.readFileSync(outFile, 'utf8').trim(); } catch { /* */ }
  const durationMs = Date.now() - t0;
  if (!text && stderr) {
    text = `[ZAI_TMUX_LLM_FAIL] lane=${lane} exit=${exitCode} durationMs=${durationMs}\n${stderr.slice(-800)}`;
  }
  resultLabel = extractResultLabel(stripInjectedPrompt(text, prompt));
  if (resultLabel) {
    const verdict = classifyPollResult({
      resultLabel,
      baselineLabel: '',
      elapsedMs: durationMs,
      strippedText: stripInjectedPrompt(text, prompt),
      prompt,
      minDurationMs,
      smokePing: task.smokePing === true,
    });
    if (verdict.ok) {
      ok = true;
      status = 'ok';
    } else {
      stderr = verdict.reason;
      text = `${stderr}\n--- out (stripped) ---\n${stripInjectedPrompt(text, prompt).slice(-4000)}`;
    }
  } else if (!stderr) {
    stderr = text
      ? `[ZAI_TMUX_NO_LABEL] durationMs=${durationMs} lane=${lane}`
      : `[ZAI_TMUX_TIMEOUT] durationMs=${durationMs} timeoutMs=${timeoutMs} lane=${lane}`;
    if (!text) text = stderr;
  }
  if (!ok && exitCode !== 0 && !stderr.includes(FALSE_GREEN_REASON)) {
    stderr = stderr || `[ZAI_TMUX_LLM_EXIT] code=${exitCode}`;
  }

  try { fs.writeFileSync(outFile, text); } catch { /* */ }
  debugLog(`fireTaskHeadless ${label} ok=${ok} label=${resultLabel || '(none)'} ms=${durationMs}`);

  return finalizeResult({
    task, label, runDir, runId, model, workerName: '', lane, mode: MODE_LLM_LANE, prompt,
    t0, ok, status, text, resultLabel, stderr, outFile,
  });
}

/** Marcel-visible claude-zai: tmux send-keys + capture-pane poll. */
async function fireTaskInteractive(task, label, runDir, runId, index) {
  const outFile = path.join(runDir, `${label}.out`);
  const model = resolveModel(task);
  const workerName = safeWorkerName(task.workerName, index);
  const prompt = String(task.prompt || '');
  const timeoutMs = Number(task.timeoutMs) > 0 ? Number(task.timeoutMs) : 3600000;
  const pollMs = Number(task.pollMs) > 0 ? Number(task.pollMs) : 5000;
  const minDurationMs = Number(task.minDurationMs) > 0 ? Number(task.minDurationMs) : DEFAULT_MIN_DURATION_MS;
  const t0 = Date.now();
  let stderr = '';
  let text = '';
  let resultLabel = '';
  let status = 'fail';
  let ok = false;
  let baselineLabel = '';

  debugLog(`fireTaskInteractive ${label} worker=${workerName}`);

  try {
    const booted = await ensureWorker(workerName, model, task.showTerminal === true);
    if (!booted) {
      stderr = '[ZAI_TMUX_BOOT_FAIL] claude-zai did not reach input-ready within 90s';
    } else {
      await sleep(1000);
      const baselinePane = capturePane(workerName);
      baselineLabel = extractResultLabel(stripInjectedPrompt(baselinePane, ''));
      await injectPromptDoubleEnter(workerName, prompt);
      debugLog(`fireTaskInteractive ${label}: prompt injected (${prompt.length} chars) double-enter`);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        text = capturePane(workerName);
        const stripped = stripInjectedPrompt(text, prompt);
        resultLabel = extractResultLabel(stripped);
        if (resultLabel) {
          const verdict = classifyPollResult({
            resultLabel,
            baselineLabel,
            elapsedMs: Date.now() - t0,
            strippedText: stripped,
            prompt,
            minDurationMs,
            smokePing: task.smokePing === true,
          });
          if (verdict.ok) {
            status = 'ok';
            ok = true;
          } else {
            stderr = verdict.reason;
            text = `${stderr}\n--- pane (stripped) ---\n${stripped.slice(-4000)}`;
          }
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

  try { fs.writeFileSync(outFile, text); } catch { /* */ }
  if (task.cleanup !== false && tmuxHasSession(workerName)) {
    try { tmux(['kill-session', '-t', workerName]); } catch { /* */ }
  }

  return finalizeResult({
    task, label, runDir, runId, model, workerName, lane: '', mode: MODE_CLAUDE_ZAI, prompt,
    t0, ok, status, text, resultLabel, stderr, outFile,
  });
}

async function fireTask(task, label, runDir, runId, index) {
  if (resolveMode(task) === MODE_LLM_LANE) {
    return fireTaskHeadless(task, label, runDir, runId);
  }
  return fireTaskInteractive(task, label, runDir, runId, index);
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
    lane: resolveLane(resolveModel(t)),
    mode: resolveMode(t),
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
  out.push(`default model: ${DEFAULT_MODEL} (Z.ai GLM Coding Plan — lane glm-max via headless automation)`);
  out.push(`headless mode: lane-dispatch ${resolveLane(DEFAULT_MODEL)} + --out poll (same Z.ai provider as claude-zai)`);
  out.push(`interactive mode: tmuxClaudeZai / showTerminal:true → claude-zai + double-Enter inject (ZAI_MODEL=${ZAI_FLEET_MODEL_ENV}, 1M ctx)`);
  out.push(`worker prefix: ${WORKER_PREFIX}-N (interactive only); debug: YURI_ZAI_TMUX_DEBUG=1 → ${DEBUG_LOG}`);
  out.push('Usage: node zai-tmux-fleet.mjs --tasks-file <path> [--concurrency 2] [--dry-run]');
  out.push('       node zai-tmux-fleet.mjs --smoke   (live smoke; needs YURI_ZAI_TMUX_FLEET=1 + tmux + Z.ai key)');
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
      label: 'SMOKE_ZAI_TMUX',
      model: DEFAULT_MODEL,
      smokePing: true,
      timeoutMs: 300000,
      pollMs: 3000,
      minDurationMs: SMOKE_MIN_DURATION_MS,
      prompt: 'YURI zai-tmux-fleet smoke ping — no repo inspection required. Reply with EXACTLY one short line confirming you are a live z.ai GLM lane (glm-max via lane-dispatch), then on a NEW line emit exactly: RESULT_LABEL: 01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED . No other text.',
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
