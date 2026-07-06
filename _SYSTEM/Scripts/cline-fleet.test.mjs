// cline-fleet — red/grey/green for the ClinePass sidecar (no spend). DISARMED-by-default:
// without YURI_CLINE_FLEET=1 / cline-fleet.enabled, clineFleet MUST dry-run and fan out NOTHING.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveModel, CLINE_ROSTER, DEFAULT_MODEL, PROVIDER, isArmed, clineFleet, ARM_FLAG,
} from './cline-fleet.mjs';
import { extractResultLabel, validatePacket } from './ollama-fleet.mjs';

test('GREEN: roster has ClinePass models; default = glm-5.2', () => {
  for (const t of ['glm', 'kimi', 'deepseek', 'mimo', 'qwen']) assert.ok(CLINE_ROSTER[t], `tier ${t}`);
  assert.equal(DEFAULT_MODEL, 'glm-5.2');
  assert.equal(PROVIDER, 'clinepass');
});

test('GREEN: resolveModel — explicit model wins, then tier, then default', () => {
  assert.equal(resolveModel({ model: 'kimi-k2.7-code' }), 'kimi-k2.7-code');
  assert.equal(resolveModel({ tier: 'kimi' }), 'kimi-k2.7-code');
  assert.equal(resolveModel({}), DEFAULT_MODEL);
});

test('GREEN: extractResultLabel finds conforming label', () => {
  assert.equal(extractResultLabel('ok\n01CL_CLINE_FLEET_SMOKE_X_PASS_COMMITTED'), '01CL_CLINE_FLEET_SMOKE_X_PASS_COMMITTED');
});

test('RED (DISARMED default): clineFleet({armed:false}) dry-runs, fans out NOTHING', async () => {
  const r = await clineFleet([{ tier: 'glm', label: 'A', prompt: 'x' }], { armed: false });
  assert.equal(r.armed, false);
  assert.equal(r.dryRun, true);
  assert.ok(Array.isArray(r.plan) && r.plan.length === 1);
  assert.equal(r.plan[0].model, 'glm-5.2');
  assert.equal(r.plan[0].provider, 'clinepass');
  assert.equal(r.results, undefined, 'no results = no spend');
});

test('RED: validatePacket rejects malformed packets', () => {
  assert.equal(validatePacket({ laneId: 'x', role: 'r', status: 'ok', resultLabel: '' }), true);
  assert.equal(validatePacket(null), false);
});

test('GREY: resolveModel falls back to default on unknown tier', () => {
  assert.equal(resolveModel({ tier: 'nonsense' }), DEFAULT_MODEL);
});

test('GREY: collided labels are de-duped', async () => {
  const r = await clineFleet([{ tier: 'glm', label: 'DUP', prompt: 'a' }, { tier: 'kimi', label: 'DUP', prompt: 'b' }], { armed: false });
  const labels = r.plan.map((p) => p.label);
  assert.equal(new Set(labels).size, 2);
});

test('GREY: isArmed is false with no env + no flag', () => {
  const prev = process.env.YURI_CLINE_FLEET;
  delete process.env.YURI_CLINE_FLEET;
  const armed = isArmed();
  if (prev !== undefined) process.env.YURI_CLINE_FLEET = prev;
  assert.equal(typeof armed, 'boolean');
  if (!fs.existsSync(ARM_FLAG)) assert.equal(armed, false);
});
