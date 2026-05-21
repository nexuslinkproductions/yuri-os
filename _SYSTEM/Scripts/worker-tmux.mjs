#!/usr/bin/env node
/**
 * worker-tmux.mjs — paste prompts into live Codex / Claude Code TUIs via tmux.
 */

import { existsSync, readFileSync, accessSync, constants } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthProbe } from './offload-contract.mjs';

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
  const result = {
    lane: laneName,
    worker: normalized,
    tmux: { pane: target || null, session: registry.session, hasSession: false },
    fifo: { path: fifoPath, writable: false },
    panePid: null,
    probe: { ok: false, pong: null, ms: null, error: null },
    ok: false,
    retries: cfg.retryCount,
  };

  if (target && hasTmux()) {
    try {
      result.tmux.hasSession = hasSession(registry.session);
      const pidText = execFileSync(
        'tmux',
        ['list-panes', '-t', target, '-F', '#{pane_pid}'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 },
      ).trim();
      result.panePid = pidText || null;
    } catch (e) {
      result.tmux.error = e.message || String(e);
    }
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
