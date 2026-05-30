#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHealthSummary } from './kagami-overseer.mjs';
import { appendKagamiEvent } from './kagami-event-bus.mjs';
import { canBindLocalhost } from './loopback-capability.mjs';
import { loadControlPlaneEvidence } from './memory-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const RELEASE_GATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'release-gate');
export const RELEASE_EVIDENCE_JSONL = path.join(RELEASE_GATE_DIR, 'automation-evidence.jsonl');
export const RELEASE_HEALTH_LATEST = path.join(RELEASE_GATE_DIR, 'automation-health-latest.json');

export const BASELINE_COMMITS = Object.freeze([
  'dceb29ae',
  '5fc2ccbb',
  '18fc4f93',
  '8be194c5',
  'c04ebc11',
  '50bde010',
  'ee88dadf',
  '559138b6',
]);

const NETWORK_DEPENDENT_CHECKS = new Set([
  'test:rick-harness-runtime',
  'test:offload-runner-rails',
  'browser-harness:health',
]);

export function buildChecks(options = {}) {
  const includeBrowser = options.includeBrowser !== false;
  const checks = [
    ['syntax:loopback-capability', process.execPath, ['--check', '_SYSTEM/Scripts/loopback-capability.mjs']],
    ['syntax:rails', process.execPath, ['--check', '_SYSTEM/Scripts/rails.mjs']],
    ['syntax:yuri-rails-config', process.execPath, ['--check', '_SYSTEM/kagami/yuri-rails-config.mjs']],
    ['syntax:yuri-control-plane', process.execPath, ['--check', '_SYSTEM/Scripts/yuri-control-plane.mjs']],
    ['syntax:threat-intel-kernel', process.execPath, ['--check', '_SYSTEM/Scripts/threat-intel-kernel.mjs']],
    ['syntax:security-lens', process.execPath, ['--check', '_SYSTEM/Scripts/security-lens.mjs']],
    ['syntax:cyber-lab-harness', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-lab-harness.mjs']],
    ['syntax:cyber-lab-runner', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-lab-runner.mjs']],
    ['syntax:cyber-guardrail-proof', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-guardrail-proof.mjs']],
    ['syntax:cyber-retest-proof', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-retest-proof.mjs']],
    ['syntax:cyber-browser-replay', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-browser-replay.mjs']],
    ['syntax:cyber-authorized-replay-scope', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-authorized-replay-scope.mjs']],
    ['syntax:cyber-provenance-score', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-provenance-score.mjs']],
    ['syntax:cyber-rag-conflict-proof', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-rag-conflict-proof.mjs']],
    ['syntax:cyber-memory-rollback-proof', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-memory-rollback-proof.mjs']],
    ['syntax:cyber-proof-cards', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-proof-cards.mjs']],
    ['syntax:cyber-pilot-pack', process.execPath, ['--check', '_SYSTEM/Scripts/cyber-pilot-pack.mjs']],
    ['syntax:secret-leak-scan', process.execPath, ['--check', '_SYSTEM/Scripts/secret-leak-scan.mjs']],
    ['syntax:lane-cache-rotator', process.execPath, ['--check', '_SYSTEM/Scripts/lane-cache-rotator.mjs']],
    ['syntax:artifact-registry', process.execPath, ['--check', '_SYSTEM/Scripts/artifact-registry.mjs']],
    ['syntax:lane-persona-map', process.execPath, ['--check', '_SYSTEM/Scripts/lane-persona-map.mjs']],
    ['syntax:yuri-closeout', process.execPath, ['--check', '_SYSTEM/Scripts/yuri-closeout.mjs']],
    ['syntax:eot-archive', process.execPath, ['--check', '_SYSTEM/Scripts/eot-archive.mjs']],
    ['syntax:eot-pulse-archive', process.execPath, ['--check', '_SYSTEM/Scripts/eot-pulse-archive.mjs']],
    ['syntax:eot-phase10-archive', process.execPath, ['--check', '_SYSTEM/Scripts/eot-phase10-archive.mjs']],
    ['syntax:math-kernel', process.execPath, ['--check', '_SYSTEM/Scripts/math/math-kernel.mjs']],
    ['syntax:math-adapters', process.execPath, ['--check', '_SYSTEM/Scripts/math/math-adapters.mjs']],
    ['syntax:math-health', process.execPath, ['--check', '_SYSTEM/Scripts/math/math-health.mjs']],
    ['syntax:memory-kernel', process.execPath, ['--check', '_SYSTEM/Scripts/memory-kernel.mjs']],
    ['syntax:automation-kernel', process.execPath, ['--check', '_SYSTEM/Scripts/automation-kernel.mjs']],
    ['syntax:kagami-event-bus', process.execPath, ['--check', '_SYSTEM/Scripts/kagami-event-bus.mjs']],
    ['syntax:lane-arbitration', process.execPath, ['--check', '_SYSTEM/Scripts/lane-arbitration.mjs']],
    ['syntax:kagami-overseer', process.execPath, ['--check', '_SYSTEM/Scripts/kagami-overseer.mjs']],
    ['syntax:worker-capture-once', process.execPath, ['--check', '_SYSTEM/Scripts/worker-capture-once.mjs']],
    ['syntax:health-status', process.execPath, ['--check', '_SYSTEM/Scripts/health-status.mjs']],
    ['syntax:yuri-supercharge-gate', process.execPath, ['--check', '_SYSTEM/Scripts/yuri-supercharge-gate.mjs']],
    ['syntax:yuri-supercharge-report', process.execPath, ['--check', '_SYSTEM/Scripts/yuri-supercharge-report.mjs']],
    ['syntax:shintai-dispatch', process.execPath, ['--check', '_SYSTEM/Scripts/shintai-dispatch.mjs']],
    ['syntax:rick-repl', process.execPath, ['--check', '_SYSTEM/Scripts/rick-repl.mjs']],
    ['test:loopback-capability', process.execPath, ['--test', '_SYSTEM/Scripts/loopback-capability.test.mjs']],
    ['test:rails', process.execPath, ['--test', '_SYSTEM/Scripts/rails.test.mjs']],
    ['test:yuri-rails-config', process.execPath, ['--test', '_SYSTEM/kagami/yuri-rails-config.test.mjs']],
    ['test:yuri-control-plane', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-control-plane.test.mjs']],
    ['test:threat-intel-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/threat-intel-kernel.test.mjs']],
    ['test:security-lens', process.execPath, ['--test', '_SYSTEM/Scripts/security-lens.test.mjs']],
    ['test:cyber-lab-harness', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-lab-harness.test.mjs']],
    ['test:cyber-lab-runner', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-lab-runner.test.mjs']],
    ['test:cyber-guardrail-proof', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-guardrail-proof.test.mjs']],
    ['test:cyber-retest-proof', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-retest-proof.test.mjs']],
    ['test:cyber-browser-replay', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-browser-replay.test.mjs']],
    ['test:cyber-authorized-replay-scope', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-authorized-replay-scope.test.mjs']],
    ['test:cyber-provenance-score', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-provenance-score.test.mjs']],
    ['test:cyber-rag-conflict-proof', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-rag-conflict-proof.test.mjs']],
    ['test:cyber-memory-rollback-proof', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-memory-rollback-proof.test.mjs']],
    ['test:cyber-proof-cards', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-proof-cards.test.mjs']],
    ['test:cyber-pilot-pack', process.execPath, ['--test', '_SYSTEM/Scripts/cyber-pilot-pack.test.mjs']],
    ['test:secret-leak-scan', process.execPath, ['--test', '_SYSTEM/Scripts/secret-leak-scan.test.mjs']],
    ['test:lane-cache-rotator', process.execPath, ['--test', '_SYSTEM/Scripts/lane-cache-rotator.test.mjs']],
    ['test:artifact-registry', process.execPath, ['--test', '_SYSTEM/Scripts/artifact-registry.test.mjs']],
    ['test:lane-persona-map', process.execPath, ['--test', '_SYSTEM/Scripts/lane-persona-map.test.mjs']],
    ['test:yuri-closeout', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-closeout.test.mjs']],
    ['test:math-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/math/math-kernel.test.mjs']],
    ['test:math-adapters', process.execPath, ['--test', '_SYSTEM/Scripts/math/math-adapters.test.mjs']],
    ['test:math-health', process.execPath, ['--test', '_SYSTEM/Scripts/math/math-health.test.mjs']],
    ['test:math-research-archive', process.execPath, ['--test', '_SYSTEM/Scripts/math/math-research-archive.test.mjs']],
    ['test:energy-config', process.execPath, ['--test', '_SYSTEM/Scripts/math/yuri-energy-config.test.mjs']],
    ['test:energy-simulate', process.execPath, ['--test', '_SYSTEM/Scripts/math/yuri-energy-simulate.test.mjs']],
    ['test:energy-dashboard-data', process.execPath, ['--test', '_SYSTEM/Scripts/math/yuri-energy-dashboard-data.test.mjs']],
    ['test:energy-tick-core', process.execPath, ['--test', '_SYSTEM/Scripts/energy-tick-core.test.mjs']],
    ['test:yuri-user-roster', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-user-roster.test.cjs']],
    ['test:yuri-user-auth', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-user-auth.test.cjs']],
    ['test:yuri-user', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-user.test.mjs']],
    ['test:yuri-user-data-collect', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-user-data-collect.test.mjs']],
    ['test:yuri-control-server', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-control-server.test.mjs']],
    ['test:operator-write-guard', process.execPath, ['.claude/hooks/tests/operator-write-guard.test.js']],
    ['test:lane-session', process.execPath, ['--test', '_SYSTEM/Scripts/lane-session.test.mjs']],
    ['test:memory-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/memory-kernel.test.mjs']],
    ['test:automation-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/automation-kernel.test.mjs']],
    ['test:kagami-event-bus', process.execPath, ['--test', '_SYSTEM/Scripts/kagami-event-bus.test.mjs']],
    ['test:lane-arbitration', process.execPath, ['--test', '_SYSTEM/Scripts/lane-arbitration.test.mjs']],
    ['test:kagami-overseer', process.execPath, ['--test', '_SYSTEM/Scripts/kagami-overseer.test.mjs']],
    ['test:worker-capture-once', process.execPath, ['--test', '_SYSTEM/Scripts/worker-capture-once.test.mjs']],
    ['test:health-status', process.execPath, ['--test', '_SYSTEM/Scripts/health-status.test.mjs']],
    ['test:worker-tmux', process.execPath, ['--test', '_SYSTEM/Scripts/worker-tmux.test.mjs']],
    ['test:yuri-supercharge-gate', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-supercharge-gate.test.mjs']],
    ['test:yuri-supercharge-report', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-supercharge-report.test.mjs']],
    ['test:lane-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/lane-kernel.test.mjs']],
    ['test:rick-harness-runtime', process.execPath, ['--test', '_SYSTEM/Scripts/rick-harness-runtime.test.mjs']],
    ['test:offload-runner-rails', process.execPath, ['--test', '_SYSTEM/Scripts/offload-runner-rails.test.mjs']],
    ['automation:health', process.execPath, ['_SYSTEM/Scripts/automation-kernel.mjs']],
    ['offload:contract-regression', process.execPath, ['_SYSTEM/Scripts/offload-contract-regression.test.mjs']],
    ['offload:dispatch-drift', process.execPath, ['_SYSTEM/Scripts/offload-contract-dispatch-check.mjs']],
    ['security:secret-leak-live', process.execPath, ['_SYSTEM/Scripts/secret-leak-scan.mjs']],
    ['math:health', process.execPath, ['_SYSTEM/Scripts/math/math-health.mjs']],
  ];

  if (includeBrowser) {
    checks.push(['browser-harness:health', 'bash', ['_SYSTEM/Scripts/browser-harness-runner.sh', '--health']]);
  }

  return checks;
}

export async function runSuperchargeGate(options = {}) {
  const stream = options.stream || process.stdout;
  const errorStream = options.errorStream || process.stderr;
  appendVerificationEvent('CODEX_VERIFICATION_STARTED', {
    source: 'yuri-supercharge-gate',
    session: 'release-gate',
    lane: 'codex-main',
    includeBrowser: options.includeBrowser !== false,
  });
  const loopback = await canBindLocalhost();
  const checks = buildChecks(options);
  const results = checks.map(([name, command, commandArgs]) => {
    if (!loopback.ok && NETWORK_DEPENDENT_CHECKS.has(name)) {
      return {
        name,
        ok: true,
        skipped: true,
        status: 0,
        signal: null,
        ms: 0,
        stdout: `[loopback unavailable] ${loopback.code || loopback.error || 'cannot bind 127.0.0.1'}`,
        stderr: '',
      };
    }

    const started = Date.now();
    const result = spawnSync(command, commandArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: name.startsWith('test:rick') ? 20_000 : 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      name,
      ok: result.status === 0,
      skipped: false,
      status: result.status,
      signal: result.signal,
      ms: Date.now() - started,
      stdout: tail(result.stdout),
      stderr: tail(result.stderr || result.error?.message || ''),
    };
  });

  const warnings = [];
  for (const result of results) {
    const label = result.skipped ? 'SKIP' : result.ok ? 'PASS' : 'FAIL';
    stream.write(`${label} ${result.name} ${result.ms}ms\n`);
    if (result.stdout.includes('YURI_SUPERCHARGE_GATE_WARNING')) {
      warnings.push(...result.stdout.split('\n').filter((line) => line.includes('YURI_SUPERCHARGE_GATE_WARNING')));
    }
    if (!result.ok) {
      if (result.stdout) stream.write(result.stdout + '\n');
      if (result.stderr) errorStream.write(result.stderr + '\n');
    }
  }

  for (const warning of warnings) {
    stream.write(`${warning}\n`);
  }

  const failed = results.filter((result) => !result.ok);
  const skipped = results.filter((result) => result.skipped);
  const healthSummary = safeHealthSummary();
  const gateStatus = failed.length
    ? 'FAIL'
    : skipped.length
      ? 'ENV_BLOCKED'
      : healthSummary.status === 'degraded'
        ? 'WARNING'
        : 'OK';
  const failReasons = failed.map((result) => ({
    check: result.name,
    status: result.status,
    signal: result.signal,
    stderr: result.stderr,
  }));
  const evidence = buildReleaseEvidence({
    gateStatus,
    results,
    warnings,
    failReasons,
    healthSummary,
    loopback,
  });
  writeReleaseEvidence(evidence);

  if (gateStatus === 'FAIL') {
    appendVerificationEvent('CODEX_VERIFICATION_FAILED', {
      source: 'yuri-supercharge-gate',
      session: 'release-gate',
      lane: 'codex-main',
      gateStatus,
      failedChecks: failed.map((result) => result.name),
      skippedChecks: skipped.map((result) => result.name),
      evidenceRefs: ['_SYSTEM/state/release-gate/automation-health-latest.json'],
    });
    stream.write('YURI_SUPERCHARGE_GATE_FAIL\n');
    return { ok: false, gateStatus, exitCode: 1, results, evidence };
  }
  if (gateStatus === 'ENV_BLOCKED') {
    stream.write('YURI_SUPERCHARGE_GATE_ENV_BLOCKED\n');
    return { ok: true, gateStatus, exitCode: 0, results, evidence };
  }
  if (gateStatus === 'WARNING') {
    stream.write('YURI_SUPERCHARGE_GATE_WARNING health degraded\n');
  }
  appendVerificationEvent('CODEX_VERIFICATION_PASSED', {
    source: 'yuri-supercharge-gate',
    session: 'release-gate',
    lane: 'codex-main',
    gateStatus,
    skippedChecks: skipped.map((result) => result.name),
    evidenceRefs: ['_SYSTEM/state/release-gate/automation-health-latest.json'],
  });
  stream.write('YURI_SUPERCHARGE_GATE_PASS\n');
  return { ok: true, gateStatus, exitCode: 0, results, evidence };
}

function appendVerificationEvent(kind, payload) {
  try {
    appendKagamiEvent(kind, payload);
  } catch {
    // Release checks must not fail just because runtime telemetry is unavailable.
  }
}

export function buildReleaseEvidence({
  gateStatus,
  results = [],
  warnings = [],
  failReasons = [],
  healthSummary = safeHealthSummary(),
  loopback = { ok: true },
} = {}) {
  const preflight = loadControlPlaneEvidence();
  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    baselineCommits: [...BASELINE_COMMITS],
    gateStatus,
    preflightSha256: sha256Stable(preflight.hashes || {}),
    preflightOk: preflight.ok,
    healthSummary,
    loopback,
    warnings,
    failReasons,
    checks: results.map((result) => ({
      name: result.name,
      ok: result.ok,
      skipped: Boolean(result.skipped),
      status: result.status,
      signal: result.signal,
      ms: result.ms,
    })),
  };
}

export function writeReleaseEvidence(evidence, options = {}) {
  const dir = path.resolve(options.dir || RELEASE_GATE_DIR);
  mkdirSync(dir, { recursive: true });
  const jsonlPath = path.join(dir, 'automation-evidence.jsonl');
  const latestPath = path.join(dir, 'automation-health-latest.json');
  durableWrite(jsonlPath, `${JSON.stringify(evidence)}\n`, 'a');
  durableWrite(latestPath, `${JSON.stringify(evidence, null, 2)}\n`, 'w');
  return { jsonlPath, latestPath };
}

function durableWrite(filePath, content, flag) {
  const fd = openSync(filePath, flag);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function safeHealthSummary() {
  try {
    return getHealthSummary({ autoUnquarantine: true });
  } catch (error) {
    return {
      ok: false,
      status: 'fail',
      error: error?.message || String(error),
      quarantinedLanes: [],
      crashCounts: {},
    };
  }
}

function sha256Stable(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function tail(value, max = 4000) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(-max) : text;
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  const args = new Set(process.argv.slice(2));
  const includeBrowser = !args.has('--skip-browser');
  const result = await runSuperchargeGate({ includeBrowser });
  process.exit(result.exitCode);
}
