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
  assert.ok(summary.activeNimLanes.includes('nvidia-nemotron-120b'));
  assert.ok(summary.deadNimLanes.includes('nvidia-nemotron'));
});

test('automation repair plan is non-destructive and state-specific', () => {
  const summary = buildAutomationHealthSummary({
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
