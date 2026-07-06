// ollama-fleet — red/grey/green for the PURE surface (no spend). The safety-critical property is DISARMED-by-
// default: without YURI_OLLAMA_FLEET=1 / the flag, ollamaFleet MUST return a dry-run plan and fan out NOTHING.
// Live fan-out is proven by `--smoke` (armed), not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  resolveModel, OLLAMA_ROSTER, DEFAULT_MODEL, extractResultLabel, validatePacket,
  aggregatePoolOutputs, ollamaFleet, isArmed, buildRunDir, ARM_FLAG,
} from './ollama-fleet.mjs';

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: roster has the owner trio + heavy models; default = flash bulk', () => {
  for (const t of ['flash', 'minimax', 'kimi', 'nemotron', 'deepseek-pro']) assert.ok(OLLAMA_ROSTER[t], `tier ${t}`);
  assert.equal(DEFAULT_MODEL, 'deepseek-v4-flash:cloud');
  assert.equal(OLLAMA_ROSTER.kimi, 'kimi-k2.7-code:cloud');
});

test('GREEN: resolveModel — explicit model wins, then tier, then default', () => {
  assert.equal(resolveModel({ model: 'x:cloud' }), 'x:cloud');
  assert.equal(resolveModel({ tier: 'minimax' }), 'minimax-m3:cloud');
  assert.equal(resolveModel({}), DEFAULT_MODEL);
});

test('GREEN: extractResultLabel finds a conforming label, else empty', () => {
  assert.equal(extractResultLabel('blah\n01OL_OLLAMA_FLEET_SMOKE_X_PASS_COMMITTED'), '01OL_OLLAMA_FLEET_SMOKE_X_PASS_COMMITTED');
  assert.equal(extractResultLabel('summary\n02B1_OLLAMA_SIDECAR_X_PASS_COMMITTED'), '02B1_OLLAMA_SIDECAR_X_PASS_COMMITTED');
  assert.equal(extractResultLabel('02R1_GOVERNANCE_TESTS_X_PASS_COMMITTED'), '02R1_GOVERNANCE_TESTS_X_PASS_COMMITTED');
  assert.equal(extractResultLabel('RESULT_LABEL: AMS_Y1_INTEGRITAET_X_PASS_COMMITTED'), 'AMS_Y1_INTEGRITAET_X_PASS_COMMITTED');
  assert.equal(extractResultLabel('  RESULT_LABEL: AMS_D1_MECHANISMUS_KARTE_X_PASS_COMMITTED'), 'AMS_D1_MECHANISMUS_KARTE_X_PASS_COMMITTED');
  assert.equal(extractResultLabel('no label here'), '');
});

// ── RED (safety) ─────────────────────────────────────────────────────────────
test('RED (DISARMED default): ollamaFleet({armed:false}) dry-runs, fans out NOTHING', async () => {
  const r = await ollamaFleet([{ tier: 'flash', label: 'A', prompt: 'x' }], { armed: false });
  assert.equal(r.armed, false); assert.equal(r.dryRun, true);
  assert.ok(Array.isArray(r.plan) && r.plan.length === 1);
  assert.equal(r.plan[0].model, 'deepseek-v4-flash:cloud');
  assert.equal(r.results, undefined, 'no results = no spend');
});

test('RED: validatePacket rejects packets missing required fields', () => {
  assert.equal(validatePacket({ laneId: 'x', role: 'r', status: 'ok', resultLabel: '' }), true);
  assert.equal(validatePacket({ role: 'r', status: 'ok', resultLabel: '' }), false); // no laneId
  assert.equal(validatePacket({ laneId: 'x', status: 'ok', resultLabel: '' }), false); // no role
  assert.equal(validatePacket(null), false);
});

test('RED: aggregatePoolOutputs on a missing dir returns skipped, never throws', () => {
  const r = aggregatePoolOutputs(path.join(os.tmpdir(), `nope-${process.pid}`));
  assert.deepEqual(r.pool, {});
  assert.ok(r.skipped.length >= 1);
});

// ── GREY ────────────────────────────────────────────────────────────────────
test('GREY: resolveModel falls back to default on an unknown tier', () => {
  assert.equal(resolveModel({ tier: 'nonsense' }), DEFAULT_MODEL);
});

test('GREY: collided labels are de-duped to distinct plan entries', async () => {
  const r = await ollamaFleet([{ tier: 'flash', label: 'DUP', prompt: 'a' }, { tier: 'kimi', label: 'DUP', prompt: 'b' }], { armed: false });
  const labels = r.plan.map((p) => p.label);
  assert.equal(new Set(labels).size, 2, 'two tasks with the same label must not collide to one file');
});

test('GREY: isArmed is false with no env + no flag (DISARMED is the default)', () => {
  const prev = process.env.YURI_OLLAMA_FLEET;
  delete process.env.YURI_OLLAMA_FLEET;
  const armed = isArmed();
  if (prev !== undefined) process.env.YURI_OLLAMA_FLEET = prev;
  assert.equal(typeof armed, 'boolean');
  if (!fs.existsSync(ARM_FLAG)) assert.equal(armed, false);
});
