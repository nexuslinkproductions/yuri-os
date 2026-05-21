#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_NIM_LANES, DEAD_NIM_LANES } from './lane-kernel.mjs';
import { getHealthSummary as getKagamiHealthSummary } from './kagami-overseer.mjs';

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
  const kagamiOverseer = resolveKagamiOverseerHealth(input);
  const now = input.now ? new Date(input.now) : new Date();
  const checks = [
    ...workerChecks.map((entry) => normalizeCheck('worker', entry)),
    ...(browserHarness ? [normalizeCheck('browser-harness', browserHarness)] : []),
    ...launchd.map((entry) => normalizeCheck('launchd', entry, { now })),
    ...laneCalibration.map((entry) => normalizeCheck('lane-calibration', entry)),
    ...(kagamiOverseer ? [normalizeKagamiCheck(kagamiOverseer)] : []),
  ];
  const counts = Object.fromEntries(HEALTH_STATES.map((state) => [state, 0]));
  for (const check of checks) counts[check.state] = (counts[check.state] || 0) + 1;
  const ok = checks.length > 0 && checks.every((check) => check.state === 'ok');
  const automationHealth = {
    status: kagamiOverseer?.status || 'unknown',
    ok: !kagamiOverseer || kagamiOverseer.status !== 'fail',
    kagamiOverseer,
  };
  return {
    ok,
    timestamp: new Date().toISOString(),
    components: AUTOMATION_COMPONENTS,
    activeNimLanes: [...ACTIVE_NIM_LANES],
    deadNimLanes: [...DEAD_NIM_LANES],
    automationHealth,
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

function normalizeCheck(component, entry = {}, options = {}) {
  const id = entry.id || entry.lane || entry.worker || entry.name || component;
  const evidence = component === 'launchd'
    ? normalizeLaunchdEvidence(entry, options)
    : normalizeGenericEvidence(entry);
  const state = component === 'launchd'
    ? normalizeLaunchdState(entry, evidence)
    : entry.state || normalizeHealthState(entry);
  return {
    component,
    id,
    state,
    ok: state === 'ok',
    lane: entry.lane || null,
    detail: entry.error || entry.stderr || entry.stdout || entry.message || entry.probe?.error || '',
    evidence,
  };
}

function normalizeGenericEvidence(entry = {}) {
  return {
    ok: entry.ok ?? null,
    status: entry.status ?? null,
    exitCode: normalizeExitCode(entry.exitCode ?? entry.exit ?? entry.status),
    signal: entry.signal ?? null,
  };
}

function normalizeLaunchdEvidence(entry = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const pid = Number(entry.pid || 0);
  const stdoutMtime = normalizeTimestamp(entry.stdoutMtime || entry.stdout_mtime || entry.stdout?.mtime || entry.stdoutPathMtime);
  const stateMtime = normalizeTimestamp(entry.stateMtime || entry.state_mtime || entry.stateFileMtime);
  const lastRunAt = normalizeTimestamp(entry.lastRunAt || entry.last_run_at || entry.lastRun);
  const expectedIntervalMs = normalizeExpectedIntervalMs(entry);
  const stdoutAgeMs = stdoutMtime ? now.getTime() - stdoutMtime.getTime() : null;
  const stateAgeMs = stateMtime ? now.getTime() - stateMtime.getTime() : null;
  const lastRunAgeMs = lastRunAt ? now.getTime() - lastRunAt.getTime() : null;
  const daemon = Boolean(entry.daemon || entry.interval === 'daemon' || entry.schedule === 'daemon');
  const scheduleExpected = daemon
    ? false
    : expectedIntervalMs > 0 && lastRunAgeMs !== null
      ? lastRunAgeMs <= expectedIntervalMs * 1.5
      : null;

  return {
    daemon,
    pid: pid || null,
    pidAlive: pid > 0,
    lastExit: normalizeExitCode(entry.lastExit ?? entry.last_exit ?? entry.exit ?? entry.exitCode),
    stdoutMtime: stdoutMtime ? stdoutMtime.toISOString() : null,
    stdoutAgeMs,
    stdoutFresh: stdoutAgeMs === null ? null : stdoutAgeMs <= Number(entry.stdoutFreshMs || 60 * 60 * 1000),
    stateMtime: stateMtime ? stateMtime.toISOString() : null,
    stateAgeMs,
    stateFresh: stateAgeMs === null ? null : stateAgeMs <= Number(entry.stateFreshMs || 60 * 60 * 1000),
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    lastRunAgeMs,
    expectedIntervalMs: expectedIntervalMs || null,
    scheduleExpected,
  };
}

function normalizeLaunchdState(entry = {}, evidence = {}) {
  if (entry.state) return entry.state;
  if (evidence.daemon && evidence.pidAlive) return 'ok';
  if (evidence.lastExit && evidence.lastExit !== 0) return 'crashed';
  if (evidence.scheduleExpected === false) return 'stale_daemon';
  if (entry.ok === true) return 'ok';
  return normalizeHealthState(entry);
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value);
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeExitCode(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeExpectedIntervalMs(entry = {}) {
  if (entry.expectedIntervalMs) return Number(entry.expectedIntervalMs);
  if (entry.intervalMs) return Number(entry.intervalMs);
  const text = String(entry.interval || entry.schedule || '').trim().toLowerCase();
  const match = text.match(/(?:every\s*)?(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days)/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  if (/^s/.test(unit)) return value * 1000;
  if (/^m/.test(unit)) return value * 60 * 1000;
  if (/^h/.test(unit)) return value * 60 * 60 * 1000;
  if (/^d/.test(unit)) return value * 24 * 60 * 60 * 1000;
  return 0;
}

function resolveKagamiOverseerHealth(input) {
  if (input.kagamiOverseer === null) return null;
  if (input.kagamiOverseer) return input.kagamiOverseer;
  if (input.includeKagamiOverseer === true) {
    return getKagamiHealthSummary({
      logPath: input.kagamiLedgerPath,
      now: input.now,
    });
  }
  return null;
}

function normalizeKagamiCheck(summary = {}) {
  const state = summary.status === 'ok'
    ? 'ok'
    : summary.status === 'fail'
      ? 'crashed'
      : 'degraded';
  return {
    component: 'kagami-overseer',
    id: 'kagami-overseer',
    state,
    ok: state === 'ok',
    lane: null,
    detail: summary.quarantinedLanes?.length
      ? `quarantined lanes: ${summary.quarantinedLanes.join(', ')}`
      : '',
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = buildAutomationHealthSummary({ includeKagamiOverseer: true });
  if (summary.automationHealth.status === 'degraded') {
    const lanes = summary.automationHealth.kagamiOverseer?.quarantinedLanes || [];
    process.stdout.write(`YURI_SUPERCHARGE_GATE_WARNING automation:health quarantined=${lanes.join(',')}\n`);
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.automationHealth.status === 'fail' ? 1 : 0);
}
