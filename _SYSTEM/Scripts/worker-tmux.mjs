#!/usr/bin/env node
/**
 * worker-tmux.mjs — paste prompts into live Codex / Claude Code TUIs via tmux.
 */

import { existsSync, readFileSync, accessSync, constants } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthProbe } from './llm-compat-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_TMUX_PATH = fileURLToPath(import.meta.url);
const REGISTRY_PATH = path.join(__dirname, 'worker-tmux-registry.json');
const FIFO_PREFIX = '/tmp/yuri-worker-';

export function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

export function hasTmux() {
  try {
    execFileSync('which', ['tmux'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function hasSession(session) {
  try {
    execFileSync('tmux', ['has-session', '-t', session], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function resolveTransport() {
  const mode = (process.env.YURI_WORKER_TRANSPORT || 'auto').toLowerCase();
  if (mode === 'queue') return 'queue';
  if (mode === 'tmux') return hasSession(loadRegistry().session) ? 'tmux' : 'queue';
  // auto
  if (!hasTmux()) return 'queue';
  return hasSession(loadRegistry().session) ? 'tmux' : 'queue';
}

export function paneTarget(registry, worker) {
  const pane = registry.panes[worker];
  if (pane === undefined) return null;
  return `${registry.session}:${registry.window}.${pane}`;
}

function normalizeLaneName(laneName) {
  const base = String(laneName || '').replace(/^@/, '');
  if (base === 'codex-spark') return 'codex';
  if (base === 'deepseek-v4-pro' || base === 'deepseek-v4-flash' || base === 'deepseek') return 'deepseek';
  return base;
}

function laneHealthConfig(registry, laneName) {
  const key = normalizeLaneName(laneName);
  const overrides = (registry.healthConfig && registry.healthConfig[key]) || {};
  const defaults = registry.healthConfig?.default || {};
  return {
    healthTimeout: Number(overrides.healthTimeout ?? defaults.healthTimeout ?? 15_000),
    retryCount: Number(overrides.retryCount ?? defaults.retryCount ?? 2),
  };
}

function paneRuntimeInfo(target) {
  const raw = execFileSync(
    'tmux',
    ['display-message', '-p', '-t', target, '#{pane_pid}\n#{pane_current_command}'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 },
  ).trimEnd();
  const [pid = '', currentCommand = ''] = raw.split('\n');
  let childProcesses = '';
  let screenText = '';
  try {
    childProcesses = execFileSync('pgrep', ['-P', pid, '-fl', '.'], {
      encoding: 'utf8',
      maxBuffer: 128 * 1024,
    }).trim();
  } catch {
    childProcesses = '';
  }
  try {
    screenText = execFileSync(
      'tmux',
      ['capture-pane', '-t', target, '-p', '-S', '-80'],
      { encoding: 'utf8', maxBuffer: 512 * 1024 },
    );
  } catch {
    screenText = '';
  }
  return { pid, currentCommand, childProcesses, screenText };
}

export function matchesExpectedProcess(registry, worker, info) {
  const cfg = registry.tuiHealth?.[worker] || {};
  const expected = cfg.expectedProcess || [];
  if (!expected.length) return { ok: true, expected, matched: null };
  const liveHaystack = `${info.currentCommand || ''}\n${info.childProcesses || ''}`.toLowerCase();
  const liveMatch = expected.find((name) => liveHaystack.includes(String(name).toLowerCase()));
  if (liveMatch) return { ok: true, expected, matched: liveMatch, source: 'process' };

  const currentCommand = String(info.currentCommand || '').trim().toLowerCase();
  const hasChildren = Boolean(String(info.childProcesses || '').trim());
  const idleShell = /^(zsh|bash|sh|fish|nu|pwsh)$/.test(currentCommand) && !hasChildren;
  const screenNeedles = cfg.screenNeedles || cfg.screenNeedle || [];
  const needles = Array.isArray(screenNeedles) ? screenNeedles : [screenNeedles];
  const screenHaystack = String(info.screenText || '').toLowerCase();
  const screenMatch = !idleShell
    ? needles.find((name) => name && screenHaystack.includes(String(name).toLowerCase()))
    : null;
  if (screenMatch) return { ok: true, expected, matched: screenMatch, source: 'screen' };

  return { ok: false, expected, matched: null, source: idleShell ? 'idle-shell' : 'none' };
}

/**
 * Multiline-safe feed: tmux buffer → paste → Enter.
 */
export function feedWorkerTui(worker, text) {
  const registry = loadRegistry();
  const target = paneTarget(registry, worker);

  if (!target) {
    return { ok: false, error: `unknown worker pane: ${worker}` };
  }
  if (registry.tuiWorkers && !registry.tuiWorkers.includes(worker)) {
    return { ok: false, error: 'not a TUI worker', fallback: 'queue' };
  }
  if (!hasTmux()) {
    return { ok: false, error: 'tmux not installed (brew install tmux)' };
  }
  if (!hasSession(registry.session)) {
    return {
      ok: false,
      error: `tmux session "${registry.session}" not running — start: bash _SYSTEM/Scripts/yuri-workers-tmux.sh start`,
    };
  }

  const buf = registry.bufferName || 'yuri-worker-feed';
  const payload = String(text).slice(0, 120_000);

  try {
    execFileSync('tmux', ['set-buffer', '-b', buf, payload], {
      maxBuffer: 16 * 1024 * 1024,
    });
    execFileSync('tmux', ['paste-buffer', '-t', target, '-d', '-b', buf]);
    execFileSync('tmux', ['send-keys', '-t', target, 'Enter']);
    return { ok: true, target, transport: 'tmux' };
  } catch (e) {
    return { ok: false, error: e.message || String(e), target };
  }
}

/** Scrollback capture from live TUI pane. */
export function captureWorkerPane(worker, lines = 400) {
  const registry = loadRegistry();
  const target = paneTarget(registry, worker);
  if (!target || !hasSession(registry.session)) {
    return { ok: false, error: 'pane or session unavailable', text: '' };
  }
  try {
    const text = execFileSync(
      'tmux',
      ['capture-pane', '-t', target, '-p', '-S', `-${Math.max(50, lines)}`],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
    return { ok: true, target, text };
  } catch (e) {
    return { ok: false, error: e.message || String(e), text: '' };
  }
}

export async function healthCheck(laneName) {
  const normalized = normalizeLaneName(laneName);
  const registry = loadRegistry();
  const target = paneTarget(registry, normalized);
  const fifoPath = `${FIFO_PREFIX}${normalized}`;
  const cfg = laneHealthConfig(registry, normalized);
  const isTuiWorker = Boolean(registry.tuiWorkers?.includes(normalized));
  const result = {
    lane: laneName,
    worker: normalized,
    tmux: { pane: target || null, session: registry.session, hasSession: false },
    fifo: isTuiWorker
      ? { path: null, writable: true, skipped: true, reason: 'TUI worker uses tmux/PTY feed' }
      : { path: fifoPath, writable: false },
    panePid: null,
    paneCurrentCommand: null,
    paneChildProcesses: '',
    processMatch: null,
    probe: { ok: false, pong: null, ms: null, error: null },
    ok: false,
    retries: cfg.retryCount,
  };

  if (target && hasTmux()) {
    try {
      result.tmux.hasSession = hasSession(registry.session);
      if (result.tmux.hasSession) {
        const info = paneRuntimeInfo(target);
        result.panePid = info.pid || null;
        result.paneCurrentCommand = info.currentCommand || null;
        result.paneChildProcesses = info.childProcesses;
        result.paneScreenText = info.screenText ? info.screenText.slice(-2000) : '';
        result.processMatch = matchesExpectedProcess(registry, normalized, info);
      }
    } catch (e) {
      result.tmux.error = e.message || String(e);
    }
  }

  if (isTuiWorker) {
    const processOk = result.processMatch?.ok !== false;
    result.probe = {
      ok: result.tmux.hasSession && processOk,
      pong: result.tmux.hasSession && processOk ? 'PTY' : null,
      ms: 0,
      error: result.tmux.hasSession
        ? (processOk ? null : `expected live TUI process: ${result.processMatch?.expected?.join(', ') || normalized}`)
        : `tmux session "${registry.session}" not running`,
    };
    result.ok = Boolean(target && result.tmux.hasSession && processOk);
    return result;
  }

  try {
    accessSync(fifoPath, constants.W_OK);
    result.fifo.writable = true;
  } catch (e) {
    result.fifo.error = e.message || String(e);
  }

  let probe;
  for (let attempt = 1; attempt <= cfg.retryCount; attempt += 1) {
    probe = await healthProbe(laneName, { timeoutMs: cfg.healthTimeout });
    result.retries = attempt;
    if (probe.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  result.probe = probe;
  result.ok = result.fifo.writable && probe.ok && (result.tmux.hasSession || target == null);
  return result;
}

export async function healthCheckAll(laneNames) {
  const registry = loadRegistry();
  const defaultLanes = [...(registry.tuiWorkers || []), ...(registry.queueWorkers || [])];
  const lanes = (laneNames && laneNames.length ? laneNames : defaultLanes).filter(Boolean);
  const checks = [];
  for (const laneName of lanes) {
    checks.push(await healthCheck(laneName));
  }
  const ok = checks.every((entry) => entry.ok);
  return { ok, checks, checked: checks.length, timestamp: new Date().toISOString() };
}

/** Detached capture after model has time to respond. */
export function scheduleCaptureAfterFeed(worker, taskId, options = {}) {
  const script = path.join(__dirname, 'worker-capture-once.mjs');
  const delay = options.delayMs ?? 12_000;
  const lines = options.lines ?? 500;
  const args = [
    script,
    '--worker',
    worker,
    '--task-id',
    taskId || '',
    '--delay',
    String(delay),
    '--lines',
    String(lines),
  ];
  if (options.lane) args.push('--lane', options.lane);
  if (options.session) args.push('--session', options.session);
  if (options.model) args.push('--model', options.model);
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      YURI_CAPTURE_DELAY_MS: String(delay),
      YURI_CAPTURE_LINES: String(lines),
    },
  });
  child.unref();
  return { scheduled: true, delayMs: delay };
}

export function printTmuxStatus() {
  const registry = loadRegistry();
  const session = registry.session;
  const alive = hasSession(session);
  console.log(`tmux installed: ${hasTmux()}`);
  console.log(`session ${session}: ${alive ? 'RUNNING' : 'stopped'}`);
  if (alive) {
    for (const w of registry.tuiWorkers || []) {
      console.log(`  TUI pane ${w}: ${paneTarget(registry, w)}`);
    }
    for (const w of registry.queueWorkers || []) {
      console.log(`  queue pane ${w}: ${paneTarget(registry, w)} (worker-bridge loop)`);
    }
  }
  console.log(`transport resolve: ${resolveTransport()}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--health')) return;
  const idx = args.indexOf('--health');
  const lanes = args.slice(idx + 1).filter((lane) => lane && !lane.startsWith('--'));
  const report = await healthCheckAll(lanes);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : 1);
}

if (path.resolve(WORKER_TMUX_PATH) === path.resolve(process.argv[1] || '')) {
  await main();
}
