// native-spawn-loop — red/grey/green for the Opus-side native-Agent execution SEAM. The safety property:
// the loop NEVER spawns a real Agent from a script (native = Agent-tool-only, Opus session) and NEVER mutates
// the MURE arm flag — it writes substrate-agnostic stub packets a convergence pass can read. (Replaces the old
// test-native-spawn.mjs smoke, which dangerously created/deleted _SYSTEM/state/mure.enabled.)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnNativeLoop, isArmed } from './native-spawn-loop.mjs';
import { validatePacket, aggregatePoolOutputs } from '../Scripts/glm-fleet.mjs';

const TMP = path.join(os.tmpdir(), `native-spawn-test-${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });

const SPECS = [
  { id: 'leaf-a', role: 'scout', model: 'sonnet', prompt: 'do A' },
  { id: 'leaf-b', role: 'sentinel', model: 'haiku', prompt: 'do B' },
];

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: spawnNativeLoop writes one valid packet per spec, keyed by id', async () => {
  const runDir = path.join(TMP, 'green', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  const { pool, skipped } = await spawnNativeLoop(SPECS, runDir);
  assert.equal(Object.keys(pool).length, 2);
  assert.equal(skipped.length, 0);
  for (const id of ['leaf-a', 'leaf-b']) {
    assert.ok(pool[id], `pool has ${id}`);
    assert.ok(pool[id].text.length > 0, 'packet has text');
    assert.ok(fs.existsSync(path.join(runDir, `native-${id}.json`)), 'packet file written');
  }
});

test('GREEN: written packets are substrate-agnostic (aggregatePoolOutputs reads them)', async () => {
  const runDir = path.join(TMP, 'agg', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  await spawnNativeLoop(SPECS, runDir);
  const { pool } = aggregatePoolOutputs(runDir);
  assert.equal(Object.keys(pool).length, 2, 'convergence reads the same schema GLM writes');
});

// ── RED (safety) ─────────────────────────────────────────────────────────────
test('RED: empty specs → skipped, never throws', async () => {
  const runDir = path.join(TMP, 'empty', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  const { pool, skipped } = await spawnNativeLoop([], runDir);
  assert.equal(Object.keys(pool).length, 0);
  assert.ok(skipped.length >= 1);
});

test('RED: a non-existent runDir → skipped, never throws', async () => {
  const { pool, skipped } = await spawnNativeLoop(SPECS, path.join(TMP, 'does-not-exist', 'results'));
  assert.equal(Object.keys(pool).length, 0);
  assert.ok(skipped.length >= 1);
});

test('RED (no live spawn): every packet is a STUB — a script never spawns a real native Agent', async () => {
  const runDir = path.join(TMP, 'stub', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  const { pool } = await spawnNativeLoop(SPECS, runDir);
  // status is a stub marker ('dry-run' when armed, 'disarmed' when not) — NEVER 'ok' (no real result from a script)
  for (const id of Object.keys(pool)) assert.notEqual(pool[id].status, 'ok', `${id} must not claim a live result`);
});

// ── GREY ────────────────────────────────────────────────────────────────────
test('GREY: every written packet passes validatePacket (laneId/role/status/resultLabel)', async () => {
  const runDir = path.join(TMP, 'valid', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  await spawnNativeLoop(SPECS, runDir);
  for (const id of ['leaf-a', 'leaf-b']) {
    const packet = JSON.parse(fs.readFileSync(path.join(runDir, `native-${id}.json`), 'utf8'));
    assert.equal(validatePacket(packet), true, `${id} packet conforms`);
    assert.equal(packet.role, id);
  }
});

test('GREY: isArmed is a boolean and honors the env arm (without touching the flag file)', () => {
  assert.equal(typeof isArmed(), 'boolean');
  const prev = process.env.YURI_MURE_ARMED;
  process.env.YURI_MURE_ARMED = '1';
  assert.equal(isArmed(), true, 'env arm honored');
  if (prev === undefined) delete process.env.YURI_MURE_ARMED; else process.env.YURI_MURE_ARMED = prev;
});
