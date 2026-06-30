// zai-tmux-fleet — red/grey/green hermetic tests (no live tmux unless smoke flag).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveModel, DEFAULT_MODEL, WORKER_PREFIX, isArmed, zaiTmuxFleet, ARM_FLAG,
} from './zai-tmux-fleet.mjs';
import { extractResultLabel, validatePacket } from './ollama-fleet.mjs';

test('GREEN: default model glm-5.2; worker prefix zai-worker', () => {
  assert.equal(DEFAULT_MODEL, 'glm-5.2');
  assert.equal(WORKER_PREFIX, 'zai-worker');
  assert.equal(resolveModel({}), DEFAULT_MODEL);
  assert.equal(resolveModel({ model: 'glm-4.7' }), 'glm-4.7');
});

test('GREEN: extractResultLabel finds conforming label in pane fixture', () => {
  const pane = 'working...\nRESULT_LABEL: 01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED\n';
  assert.equal(extractResultLabel(pane), '01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED');
  assert.equal(
    extractResultLabel('ok\n01LT_L1_ZAI_TMUX_ADAPTER_X_PASS_COMMITTED'),
    '01LT_L1_ZAI_TMUX_ADAPTER_X_PASS_COMMITTED',
  );
});

test('RED (DISARMED default): zaiTmuxFleet({armed:false}) dry-runs, spawns NOTHING', async () => {
  const r = await zaiTmuxFleet([{ label: 'A', prompt: 'x' }], { armed: false });
  assert.equal(r.armed, false);
  assert.equal(r.dryRun, true);
  assert.ok(Array.isArray(r.plan) && r.plan.length === 1);
  assert.equal(r.plan[0].model, 'glm-5.2');
  assert.equal(r.plan[0].provider, 'zai-tmux');
  assert.match(r.plan[0].workerName, /^zai-worker/);
  assert.equal(r.results, undefined, 'no results = no tmux spend');
});

test('RED: validatePacket rejects malformed packets', () => {
  assert.equal(validatePacket({ laneId: 'x', role: 'r', status: 'ok', resultLabel: '' }), true);
  assert.equal(validatePacket(null), false);
});

test('GREY: collided labels are de-duped', async () => {
  const r = await zaiTmuxFleet(
    [{ label: 'DUP', prompt: 'a' }, { label: 'DUP', prompt: 'b' }],
    { armed: false },
  );
  const labels = r.plan.map((p) => p.label);
  assert.equal(new Set(labels).size, 2);
});

test('GREY: concurrency default 2 in dry-run plan metadata', async () => {
  const r = await zaiTmuxFleet([{ label: 'X', prompt: 'y' }], { armed: false, concurrency: 2 });
  assert.equal(r.concurrency, 2);
});

test('GREY: isArmed is false with no env + no flag', () => {
  const prev = process.env.YURI_ZAI_TMUX_FLEET;
  delete process.env.YURI_ZAI_TMUX_FLEET;
  const armed = isArmed();
  if (prev !== undefined) process.env.YURI_ZAI_TMUX_FLEET = prev;
  assert.equal(typeof armed, 'boolean');
  if (!fs.existsSync(ARM_FLAG)) assert.equal(armed, false);
});
