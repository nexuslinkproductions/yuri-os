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
import { fileURLToPath } from 'node:url';

const MURE_FLAG = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), '_SYSTEM/state/mure.enabled');

const TMP = path.join(os.tmpdir(), `native-spawn-test-${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });

const SPECS = [
  { id: 'leaf-a', role: 'scout', model: 'sonnet', prompt: 'do A' },
  { id: 'leaf-b', role: 'sentinel', model: 'haiku', prompt: 'do B' },
];

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: disarmed spawnNativeLoop emits no result-shaped packets', async () => {
  const runDir = path.join(TMP, 'green', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  const { pool, skipped } = await spawnNativeLoop(SPECS, runDir);
  assert.equal(Object.keys(pool).length, 0);
  assert.equal(skipped.length, 2);
  for (const id of ['leaf-a', 'leaf-b']) {
    assert.equal(pool[id], undefined, `pool has no fabricated ${id} output`);
    assert.equal(fs.existsSync(path.join(runDir, `native-${id}.json`)), false, 'no fabricated packet file written');
  }
});

test('GREEN: convergence receives no fabricated packets while disarmed', async () => {
  const runDir = path.join(TMP, 'agg', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  await spawnNativeLoop(SPECS, runDir);
  const { pool } = aggregatePoolOutputs(runDir);
  assert.equal(Object.keys(pool).length, 0, 'convergence sees no fabricated native output');
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

test('RED (D-6 honesty): armed without live Agent session → blocked-needs-opus-session, never dry-run stub', async () => {
  const runDir = path.join(TMP, 'blocked', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  const prev = process.env.YURI_MURE_ARMED;
  process.env.YURI_MURE_ARMED = '1';
  const { pool } = await spawnNativeLoop(SPECS, runDir);
  if (prev === undefined) delete process.env.YURI_MURE_ARMED; else process.env.YURI_MURE_ARMED = prev;
  for (const id of Object.keys(pool)) {
    assert.equal(pool[id].status, 'blocked-needs-opus-session', `${id} must be honestly blocked`);
    assert.notEqual(pool[id].status, 'dry-run');
    assert.notEqual(pool[id].status, 'ok');
  }
});

test('RED (no live spawn): disarmed packets are disarmed, never ok', async () => {
  const runDir = path.join(TMP, 'disarmed', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  const prevEnv = process.env.YURI_MURE_ARMED;
  delete process.env.YURI_MURE_ARMED;
  const flag = MURE_FLAG;
  const hadFlag = fs.existsSync(flag);
  if (hadFlag) fs.renameSync(flag, `${flag}.bak-test`);
  try {
    const { pool } = await spawnNativeLoop(SPECS, runDir);
    for (const id of Object.keys(pool)) {
      assert.equal(pool[id].status, 'disarmed', `${id} disarmed when MURE disarmed`);
      assert.notEqual(pool[id].status, 'ok');
    }
  } finally {
    if (hadFlag) fs.renameSync(`${flag}.bak-test`, flag);
    if (prevEnv !== undefined) process.env.YURI_MURE_ARMED = prevEnv;
  }
});

// ── GREY ────────────────────────────────────────────────────────────────────
test('GREY: disarmed execution leaves no packet for validatePacket to accept', async () => {
  const runDir = path.join(TMP, 'valid', 'results');
  fs.mkdirSync(runDir, { recursive: true });
  const { pool, skipped } = await spawnNativeLoop(SPECS, runDir);
  assert.equal(Object.keys(pool).length, 0);
  assert.equal(skipped.length, 2);
  for (const id of ['leaf-a', 'leaf-b']) {
    assert.equal(fs.existsSync(path.join(runDir, `native-${id}.json`)), false, `${id} writes no result packet`);
  }
});

test('GREY: isArmed is a boolean and honors the env arm (without touching the flag file)', () => {
  assert.equal(typeof isArmed(), 'boolean');
  const prev = process.env.YURI_MURE_ARMED;
  process.env.YURI_MURE_ARMED = '1';
  assert.equal(isArmed(), true, 'env arm honored');
  if (prev === undefined) delete process.env.YURI_MURE_ARMED; else process.env.YURI_MURE_ARMED = prev;
});
