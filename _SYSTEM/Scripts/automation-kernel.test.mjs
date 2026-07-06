import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildAutomationHealthSummary,
  buildRepairPlan,
  normalizeHealthState,
} from './automation-kernel.mjs';

test('automation health state classification separates key, 404, timeout, crash, and stale daemon', () => {
  assert.equal(normalizeHealthState({ ok: false, error: 'missing NVIDIA_API_KEY' }), 'missing_key');
  assert.equal(normalizeHealthState({ ok: false, stderr: '404 model not found' }), 'model_404');
  assert.equal(normalizeHealthState({ ok: false, error: 'ETIMEDOUT' }), 'timeout');
  assert.equal(normalizeHealthState({ ok: false, message: 'worker crashed with signal SIGTERM' }), 'crashed');
  assert.equal(normalizeHealthState({ ok: false, error: 'ECONNREFUSED browser daemon' }), 'stale_daemon');
  assert.equal(normalizeHealthState({ ok: true }), 'ok');
});

test('automation summary combines worker, browser, launchd, and calibration checks', () => {
  const summary = buildAutomationHealthSummary({
    kagamiOverseer: null,
    workerChecks: [
      { id: 'deepseek', ok: true },
      { id: 'nvidia-nemotron', ok: false, stderr: '404 model not found' },
    ],
    browserHarness: { id: 'browser-harness', ok: true },
    launchd: [{ id: 'kagami-overseer', ok: false, error: 'stale daemon' }],
    laneCalibration: [{ id: 'nvidia-qwen3-next', ok: true }],
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.counts.ok, 3);
  assert.equal(summary.counts.model_404, 1);
  assert.equal(summary.counts.stale_daemon, 1);
  // NIM lanes retired 2026-06-10 → automation-kernel spreads the now-empty ACTIVE_NIM_LANES and
  // the [nemotron, kimi] DEAD_NIM_LANES from lane-kernel into its summary verbatim.
  assert.deepEqual(summary.activeNimLanes, []);
  assert.ok(summary.deadNimLanes.includes('nemotron-3-ultra-550b-a55b'));
  assert.ok(summary.deadNimLanes.includes('kimi-k2.6'));
});

test('automation repair plan is non-destructive and state-specific', () => {
  const summary = buildAutomationHealthSummary({
    kagamiOverseer: null,
    workerChecks: [
      { id: 'nvidia-nemotron', ok: false, stderr: '404 model not found' },
      { id: 'browser-harness', ok: false, error: 'ECONNREFUSED daemon' },
    ],
  });
  const plan = buildRepairPlan(summary);

  assert.equal(plan.nonDestructive, true);
  assert.equal(plan.actions.length, 2);
  assert.match(plan.actions[0].action, /mark lane dead|remap/);
  assert.match(plan.actions[1].action, /restart daemon/);
  assert.equal(plan.actions.some((action) => action.destructive), false);
});

test('automation summary includes Kagami quarantine evidence when requested', () => {
  const summary = buildAutomationHealthSummary({
    kagamiOverseer: {
      status: 'degraded',
      ok: true,
      quarantinedLanes: ['nvidia-glm'],
      lanes: {},
    },
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.automationHealth.status, 'degraded');
  assert.equal(summary.counts.degraded, 1);
  assert.match(summary.checks.at(-1).detail, /nvidia-glm/);
});

test('launchd health separates daemon liveness from log and state freshness', () => {
  const summary = buildAutomationHealthSummary({
    kagamiOverseer: null,
    now: '2026-05-21T12:00:00.000Z',
    launchd: [
      {
        id: 'shellservice',
        daemon: true,
        pid: 92397,
        exit: 15,
        stdoutMtime: '2026-05-20T17:00:00.000Z',
        stateMtime: '2026-05-20T17:00:00.000Z',
      },
      {
        id: 'lane-memory-prune',
        interval: 'every 1h',
        exit: 19968,
        lastRunAt: '2026-05-21T09:00:00.000Z',
      },
    ],
  });

  const shellservice = summary.checks.find((check) => check.id === 'shellservice');
  const prune = summary.checks.find((check) => check.id === 'lane-memory-prune');

  assert.equal(shellservice.state, 'ok');
  assert.equal(shellservice.evidence.pidAlive, true);
  assert.equal(shellservice.evidence.stdoutFresh, false);
  assert.equal(shellservice.evidence.stateFresh, false);
  assert.equal(prune.state, 'crashed');
  assert.equal(prune.evidence.lastExit, 19968);
  assert.equal(prune.evidence.scheduleExpected, false);
});
