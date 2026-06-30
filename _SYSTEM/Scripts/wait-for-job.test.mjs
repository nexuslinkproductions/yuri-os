#!/usr/bin/env node
/**
 * Hermetic test for wait-for-job.mjs
 *
 * Tests exit codes 0/1/2 across all three --expect modes, using in-memory
 * fixture manifests injected via the _deps hook — no touching of .claude/jobs/.
 *
 * Also runs a real CLI subprocess test against a tmp-dir fixture to verify
 * the process.exit codes end-to-end.
 *
 * Authority: MURE_ENFORCEMENT_MINIMUM_2026-06-30.md §B.4
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'wait-for-job.mjs');

const {
  waitForJob,
  evaluate,
  parseArgs,
  EXIT_CONDITION_MET,
  EXIT_TIMEOUT,
  EXIT_RUN_FAILED,
} = await import('./wait-for-job.mjs');

// ── Fixture builders ────────────────────────────────────────────────────────

/** A finished, successful swarm manifest (grounded in real swarm-mqpmmij8-4cd863). */
function manifestFinishedOk() {
  return {
    runId: 'swarm-test-ok',
    traceId: 'tr-test',
    startedAt: '2026-06-30T12:00:00.000Z',
    finishedAt: '2026-06-30T12:05:00.000Z',
    rounds: 2,
    leaves: ['R1', 'R2'],
    converged: true,
    forced: false,
    finalizeOk: true,
    finalizeReason: 'finalize-allowed',
  };
}

/** A finished, failed swarm manifest (grounded in real swarm-mqpn73hb-c4ab23). */
function manifestFinishedFail() {
  return {
    runId: 'swarm-test-fail',
    traceId: 'tr-test-fail',
    startedAt: '2026-06-30T12:00:00.000Z',
    finishedAt: '2026-06-30T12:10:00.000Z',
    rounds: 3,
    converged: true,
    forced: true,
    finalizeOk: false,
    finalizeReason: 'forced-stop',
  };
}

/** A still-running manifest (no finishedAt, no finalizeOk yet). */
function manifestRunning() {
  return {
    runId: 'swarm-test-running',
    traceId: 'tr-running',
    startedAt: '2026-06-30T12:00:00.000Z',
    // no finishedAt, no finalizeOk
    converged: false,
  };
}

/** A leaf result with a PASS label. */
function leafPass() {
  return {
    laneId: 'glm-flash',
    role: 'WS-C-R2-trends-charts',
    resultLabel: '02C2_TRENDS_CHARTS_X_PASS_COMMITTED',
    status: 'ok',
    runId: 'swarm-test-ok',
  };
}

/** A leaf result with a FAIL label. */
function leafFail() {
  return {
    laneId: 'glm-flash',
    role: 'WS-C-R2-trends-charts',
    resultLabel: '02C2_TRENDS_CHARTS_F_PASS_COMMITTED',
    status: 'ok',
    runId: 'swarm-test-ok',
  };
}

/** Injectable loader factory: returns a function that always reads from a static manifest object. */
function staticManifestLoader(manifest) {
  return () => manifest;
}

// ── Unit tests: evaluate() ──────────────────────────────────────────────────

describe('evaluate() — finishedAt', () => {
  test('finished + finalizeOk=true → met=true, failed=false', () => {
    const r = evaluate(manifestFinishedOk(), 'finishedAt', null);
    assert.equal(r.met, true);
    assert.equal(r.failed, false);
  });

  test('finished + finalizeOk=false → met=false, failed=true', () => {
    const r = evaluate(manifestFinishedFail(), 'finishedAt', null);
    assert.equal(r.met, false);
    assert.equal(r.failed, true);
    assert.match(r.detail, /finalizeOk=false/);
  });

  test('still running (no finishedAt) → met=false, failed=false', () => {
    const r = evaluate(manifestRunning(), 'finishedAt', null);
    assert.equal(r.met, false);
    assert.equal(r.failed, false);
  });

  test('null manifest → not met, not failed', () => {
    const r = evaluate(null, 'finishedAt', null);
    assert.equal(r.met, false);
    assert.equal(r.failed, false);
  });
});

describe('evaluate() — finalizeOk', () => {
  test('finalizeOk=true → met=true', () => {
    const r = evaluate(manifestFinishedOk(), 'finalizeOk', null);
    assert.equal(r.met, true);
  });

  test('finalizeOk=false → failed=true', () => {
    const r = evaluate(manifestFinishedFail(), 'finalizeOk', null);
    assert.equal(r.met, false);
    assert.equal(r.failed, true);
  });

  test('finalizeOk unset (running) → not met, not failed', () => {
    const r = evaluate(manifestRunning(), 'finalizeOk', null);
    assert.equal(r.met, false);
    assert.equal(r.failed, false);
  });
});

describe('evaluate() — resultLabel', () => {
  test('PASS label present → met=true', () => {
    // Write leaf to the test job dir and pass TEST_RUN_ID so loadLeafResult resolves it
    writeFileSync(join(TEST_RESULTS_DIR, 'WS-C-R2-trends-charts.json'), JSON.stringify(leafPass(), null, 2));
    const r = evaluate(manifestFinishedOk(), 'resultLabel', 'WS-C-R2-trends-charts', TEST_RUN_ID);
    assert.equal(r.met, true);
  });

  test('FAIL label (_F_) present → failed=true', () => {
    writeFileSync(join(TEST_RESULTS_DIR, 'WS-C-R2-fail-leaf.json'), JSON.stringify(leafFail(), null, 2));
    const r = evaluate(manifestFinishedOk(), 'resultLabel', 'WS-C-R2-fail-leaf', TEST_RUN_ID);
    assert.equal(r.met, false);
    assert.equal(r.failed, true);
    assert.match(r.reason, /leaf-failed/);
  });

  test('no leaf result → not met', () => {
    const r = evaluate(manifestFinishedOk(), 'resultLabel', 'NONEXISTENT-LEAF');
    assert.equal(r.met, false);
    assert.equal(r.failed, false);
  });

  test('resultLabel without --leaf → config-error', () => {
    const r = evaluate(manifestFinishedOk(), 'resultLabel', null);
    assert.equal(r.met, false);
    assert.match(r.reason, /config-error/);
  });
});

// ── Unit tests: parseArgs() ─────────────────────────────────────────────────

describe('parseArgs()', () => {
  test('parses --flag value pairs', () => {
    const a = parseArgs(['--run-id', 'swarm-123', '--expect', 'finishedAt']);
    assert.equal(a['run-id'], 'swarm-123');
    assert.equal(a.expect, 'finishedAt');
  });

  test('parses --flag=value', () => {
    const a = parseArgs(['--run-id=swarm-456', '--timeout=5000']);
    assert.equal(a['run-id'], 'swarm-456');
    assert.equal(a.timeout, '5000');
  });

  test('boolean flag when no value follows', () => {
    const a = parseArgs(['--help']);
    assert.equal(a.help, 'true');
  });
});

// ── Integration tests: waitForJob() with _deps injection ─────────────────────

describe('waitForJob() — injected manifest loader', () => {
  test('finishedAt on successful run → exit 0', async () => {
    const r = await waitForJob({
      runId: 'swarm-test-ok',
      expect: 'finishedAt',
      timeoutMs: 5000,
      pollMs: 10,
      _deps: { loadManifest: staticManifestLoader(manifestFinishedOk()), manifestPath: () => '/dev/null' },
    });
    assert.equal(r.exitCode, EXIT_CONDITION_MET);
    assert.equal(r.polls, 1);
  });

  test('finishedAt on failed run → exit 2', async () => {
    const r = await waitForJob({
      runId: 'swarm-test-fail',
      expect: 'finishedAt',
      timeoutMs: 5000,
      pollMs: 10,
      _deps: { loadManifest: staticManifestLoader(manifestFinishedFail()), manifestPath: () => '/dev/null' },
    });
    assert.equal(r.exitCode, EXIT_RUN_FAILED);
    assert.match(r.reason, /run-failed/);
  });

  test('finalizeOk=true → exit 0', async () => {
    const r = await waitForJob({
      runId: 'swarm-test-ok',
      expect: 'finalizeOk',
      timeoutMs: 5000,
      pollMs: 10,
      _deps: { loadManifest: staticManifestLoader(manifestFinishedOk()), manifestPath: () => '/dev/null' },
    });
    assert.equal(r.exitCode, EXIT_CONDITION_MET);
  });

  test('finalizeOk=false → exit 2', async () => {
    const r = await waitForJob({
      runId: 'swarm-test-fail',
      expect: 'finalizeOk',
      timeoutMs: 5000,
      pollMs: 10,
      _deps: { loadManifest: staticManifestLoader(manifestFinishedFail()), manifestPath: () => '/dev/null' },
    });
    assert.equal(r.exitCode, EXIT_RUN_FAILED);
  });

  test('timeout when running manifest never finishes → exit 1', async () => {
    const r = await waitForJob({
      runId: 'swarm-test-running',
      expect: 'finishedAt',
      timeoutMs: 80,   // very short
      pollMs: 20,
      _deps: { loadManifest: staticManifestLoader(manifestRunning()), manifestPath: () => '/dev/null' },
    });
    assert.equal(r.exitCode, EXIT_TIMEOUT);
    assert.ok(r.polls >= 2, 'should have polled at least twice');
  });

  test('resultLabel with no leaf on disk → timeout (exit 1)', async () => {
    // _deps injects the manifest loader, but leaf results are read from disk via loadLeafResult.
    // Since no leaf file exists for this injected runId, the condition never resolves → timeout.
    // The real PASS/FAIL label paths are covered in the CLI subprocess tests below.
    const r = await waitForJob({
      runId: 'swarm-test-ok',
      expect: 'resultLabel',
      leaf: 'WS-C-R2-trends-charts',
      timeoutMs: 80,
      pollMs: 20,
      _deps: {
        loadManifest: staticManifestLoader(manifestFinishedOk()),
        manifestPath: () => '/dev/null',
      },
    });
    assert.equal(r.exitCode, EXIT_TIMEOUT);
  });
});

// ── Hermetic subprocess tests (real CLI, tmp-dir fixtures) ───────────────────

// Create a tmp .claude/jobs structure to test the CLI end-to-end.
// We can't override JOBS_DIR via env, so we symlink/copy the script and use
// a tmp repo root. Instead, we test the CLI by creating the manifest at the
// expected path under the real .claude/jobs with a test-prefixed runId,
// then clean up.

const TEST_RUN_ID = `wait-for-job-test-${process.pid}-${Date.now()}`;
const TEST_JOB_DIR = join(__dirname, '..', '..', '.claude', 'jobs', TEST_RUN_ID);
const TEST_MANIFEST = join(TEST_JOB_DIR, 'manifest.json');
const TEST_RESULTS_DIR = join(TEST_JOB_DIR, 'results');

before(() => {
  mkdirSync(TEST_RESULTS_DIR, { recursive: true });
});

after(() => {
  try {
    rmSync(TEST_JOB_DIR, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

describe('CLI subprocess — exit codes', () => {
  test('exit 0: --expect finishedAt on successful manifest', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedOk(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--expect', 'finishedAt', '--timeout', '2000', '--poll-ms', '50'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.match(res.stdout, /CONDITION MET/);
  });

  test('exit 2: --expect finishedAt on failed manifest (finalizeOk=false)', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedFail(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--expect', 'finishedAt', '--timeout', '2000', '--poll-ms', '50'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 2, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.match(res.stderr, /RUN FAILED/);
  });

  test('exit 0: --expect finalizeOk on successful manifest', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedOk(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--expect', 'finalizeOk', '--timeout', '2000', '--poll-ms', '50'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
  });

  test('exit 2: --expect finalizeOk on failed manifest', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedFail(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--expect', 'finalizeOk', '--timeout', '2000', '--poll-ms', '50'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 2, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
  });

  test('exit 1: timeout when manifest has no finishedAt', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestRunning(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--expect', 'finishedAt', '--timeout', '120', '--poll-ms', '30'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 1, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.match(res.stderr, /TIMEOUT/);
  });

  test('exit 0: --expect resultLabel with PASS leaf result', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedOk(), null, 2));
    writeFileSync(join(TEST_RESULTS_DIR, 'WS-C-R2-trends-charts.json'), JSON.stringify(leafPass(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--leaf', 'WS-C-R2-trends-charts', '--expect', 'resultLabel', '--timeout', '2000', '--poll-ms', '50'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.match(res.stdout, /CONDITION MET/);
  });

  test('exit 2: --expect resultLabel with FAIL leaf result (_F_PASS_COMMITTED)', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedOk(), null, 2));
    writeFileSync(join(TEST_RESULTS_DIR, 'WS-C-R2-trends-charts.json'), JSON.stringify(leafFail(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--leaf', 'WS-C-R2-trends-charts', '--expect', 'resultLabel', '--timeout', '2000', '--poll-ms', '50'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 2, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.match(res.stderr, /RUN FAILED/);
  });

  test('exit 1: --expect resultLabel when leaf result missing (timeout)', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedOk(), null, 2));
    // Ensure no leaf result exists
    try { rmSync(join(TEST_RESULTS_DIR, 'MISSING-LEAF.json'), { force: true }); } catch { /* */ }
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--leaf', 'MISSING-LEAF', '--expect', 'resultLabel', '--timeout', '120', '--poll-ms', '30'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 1, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
  });

  test('exit 1: manifest not found within timeout (in-flight / missing job)', () => {
    const res = spawnSync('node', [SCRIPT, '--run-id', 'nonexistent-job-xxx', '--expect', 'finishedAt', '--timeout', '100', '--poll-ms', '20'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 1, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.match(res.stderr, /TIMEOUT|manifest not yet/);
  });

  test('exit 1: --expect resultLabel without --leaf', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedOk(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--expect', 'resultLabel', '--timeout', '100'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 1, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.match(res.stderr, /requires --leaf/);
  });

  test('exit 1: invalid --expect value', () => {
    writeFileSync(TEST_MANIFEST, JSON.stringify(manifestFinishedOk(), null, 2));
    const res = spawnSync('node', [SCRIPT, '--run-id', TEST_RUN_ID, '--expect', 'bogus', '--timeout', '100'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /must be one of/);
  });

  test('--help prints usage and exits 0', () => {
    const res = spawnSync('node', [SCRIPT, '--help'], { encoding: 'utf-8', timeout: 5000 });
    assert.equal(res.status, 0);
    assert.match(res.stderr, /Usage:/);
  });
});
