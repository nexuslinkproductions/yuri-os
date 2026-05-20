#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_NIM_LANES, DEAD_NIM_LANES } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const HEALTH_STATES = Object.freeze([
  'ok',
  'degraded',
  'missing_key',
  'model_404',
  'timeout',
  'crashed',
  'stale_daemon',
  'protected_write',
  'unknown',
]);

export const AUTOMATION_COMPONENTS = Object.freeze([
  'tmux-workers',
  'offload-pong',
  'health-json',
  'launchd-plists',
  'lane-calibration',
  'task-queue',
  'browser-harness-daemon',
]);

export function normalizeHealthState(probe = {}) {
  if (probe.ok === true || probe.status === 'ok') return 'ok';
  const text = [
    probe.error,
    probe.stderr,
    probe.stdout,
    probe.message,
    probe.probe?.error,
    probe.probe?.pong,
  ].filter(Boolean).join('\n').toLowerCase();

  if (/api[_ -]?key|missing key|unauthorized|401/.test(text)) return 'missing_key';
  if (/404|model.*not.*found|unknown model|not found/.test(text)) return 'model_404';
  if (/timeout|timed out|etimedout/.test(text)) return 'timeout';
  if (/crash|exited|signal|segfault|killed/.test(text)) return 'crashed';
  if (/stale|daemon|connection refused|econnrefused/.test(text)) return 'stale_daemon';
  if (/protected|permission denied/.test(text)) return 'protected_write';
  if (probe.ok === false) return 'degraded';
  return 'unknown';
}

export function buildAutomationHealthSummary(input = {}) {
  const workerChecks = Array.isArray(input.workerChecks) ? input.workerChecks : [];
  const browserHarness = input.browserHarness || null;
  const launchd = Array.isArray(input.launchd) ? input.launchd : [];
  const laneCalibration = Array.isArray(input.laneCalibration) ? input.laneCalibration : [];
  const checks = [
    ...workerChecks.map((entry) => normalizeCheck('worker', entry)),
    ...(browserHarness ? [normalizeCheck('browser-harness', browserHarness)] : []),
    ...launchd.map((entry) => normalizeCheck('launchd', entry)),
    ...laneCalibration.map((entry) => normalizeCheck('lane-calibration', entry)),
  ];
  const counts = Object.fromEntries(HEALTH_STATES.map((state) => [state, 0]));
  for (const check of checks) counts[check.state] = (counts[check.state] || 0) + 1;
  const ok = checks.length > 0 && checks.every((check) => check.state === 'ok');
  return {
    ok,
    timestamp: new Date().toISOString(),
    components: AUTOMATION_COMPONENTS,
    activeNimLanes: [...ACTIVE_NIM_LANES],
    deadNimLanes: [...DEAD_NIM_LANES],
    counts,
    checks,
  };
}

export function buildRepairPlan(summary = {}) {
  const checks = Array.isArray(summary.checks) ? summary.checks : [];
  const actions = [];
  for (const check of checks) {
    if (check.state === 'ok') continue;
    actions.push(repairActionFor(check));
  }
  return {
    ok: true,
    nonDestructive: true,
    actions,
  };
}

export function probeBrowserHarnessHealth(options = {}) {
  const runner = options.runner || path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'browser-harness-runner.sh');
  const result = spawnSync('bash', [runner, '--health'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: Number(options.timeoutMs || 30_000),
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    id: 'browser-harness',
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || null,
    state: normalizeHealthState({
      ok: result.status === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message,
    }),
  };
}

function normalizeCheck(component, entry = {}) {
  const id = entry.id || entry.lane || entry.worker || entry.name || component;
  const state = entry.state || normalizeHealthState(entry);
  return {
    component,
    id,
    state,
    ok: state === 'ok',
    lane: entry.lane || null,
    detail: entry.error || entry.stderr || entry.stdout || entry.message || entry.probe?.error || '',
  };
}

function repairActionFor(check) {
  const base = {
    component: check.component,
    target: check.id,
    state: check.state,
    destructive: false,
  };
  switch (check.state) {
    case 'missing_key':
      return { ...base, action: 'configure credential outside repo; do not write secrets into source files' };
    case 'model_404':
      return { ...base, action: 'mark lane dead or remap to validated model in lane kernel after probe evidence' };
    case 'timeout':
      return { ...base, action: 'increase timeout or run cold-start probe before declaring lane dead' };
    case 'crashed':
      return { ...base, action: 'capture logs, restart worker manually, then rerun PONG health' };
    case 'stale_daemon':
      return { ...base, action: 'restart daemon or browser-harness service after explicit operator approval' };
    case 'protected_write':
      return { ...base, action: 'block action and rewrite target to YURI-owned runtime state' };
    default:
      return { ...base, action: 'inspect health detail and rerun non-mutating probe' };
  }
}
