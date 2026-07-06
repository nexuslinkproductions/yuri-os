// Level-B recursion hardening — H3 (tree kill-switch) / H5 (seedRootTree) / H6 (budget-lease tolerance).
// Built by the GLM-5.2 lane, Opus-verified. Companion to nano-levelb-h124.test.mjs (H1/H2/H4, ollama lane).
// Self-isolating: writes tree/lease state under os.tmpdir, never the real _SYSTEM/state/nano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const ISO = path.join(os.tmpdir(), 'yuri-nano-levelb-h356-' + process.pid);
process.env.YURI_NANO_TREES_DIR = path.join(ISO, 'trees');
process.env.YURI_NANO_LEASES_DIR = path.join(ISO, 'leases');

const { initTree, treeConfig, inflightLeaseId, nanoIdOf, reserveSpawnSlots } = await import('./nano-tree.mjs');
const { seedRootTree } = await import('./nano-dispatch.mjs');
const { spawnNano } = await import('./nano-spawn.mjs');
const { inspectLeases } = await import('./nano-lease.mjs');

// ── H3 tree kill-switch ──────────────────────────────────────────────────────
test('H3a: initTree persists treeTimeoutMs into cfg + default = 30min', () => {
  const rid = 'h3a-' + process.pid;
  initTree(rid, { treeTimeoutMs: 50 });
  const cfg = treeConfig(rid);
  assert.equal(cfg.treeTimeoutMs, 50);
  assert.equal(typeof cfg.createdAt, 'string');
  const rd = 'h3a-def-' + process.pid; initTree(rd, {});
  assert.equal(treeConfig(rd).treeTimeoutMs, 30 * 60 * 1000);
});

test('H3b: an aged tree refuses to spawn with reason tree-timeout (guard before other caps)', async () => {
  const aged = { createdAt: new Date(Date.now() - 10000).toISOString(), treeTimeoutMs: 50 };
  const r = await spawnNano({ ctx: { rootRunId: 'h3b', myPath: 'r', depth: 0 }, args: { lane: 'deepseek-v4-flash', task: 'x' }, opts: { deps: { armed: true, treeConfig: () => aged } } });
  assert.equal(r.reason, 'tree-timeout');
  assert.ok(r.elapsedMs > 50);
});

test('H3b: YURI_NANO_TREE_TIMEOUT_MS env override wins over a generous cfg', async () => {
  process.env.YURI_NANO_TREE_TIMEOUT_MS = '10';
  const aged = { createdAt: new Date(Date.now() - 5000).toISOString(), treeTimeoutMs: 9999999 };
  const r = await spawnNano({ ctx: { rootRunId: 'h3b-env', myPath: 'r', depth: 0 }, args: { lane: 'deepseek-v4-flash', task: 'x' }, opts: { deps: { armed: true, treeConfig: () => aged } } });
  delete process.env.YURI_NANO_TREE_TIMEOUT_MS;
  assert.equal(r.reason, 'tree-timeout');
});

test('H3b: a fresh tree is NOT timed out', async () => {
  const fresh = { createdAt: new Date().toISOString(), treeTimeoutMs: 60000 };
  const r = await spawnNano({ ctx: { rootRunId: 'h3b-fresh', myPath: 'r', depth: 0 }, args: { lane: 'deepseek-v4-flash', task: 'x' }, opts: { deps: { armed: true, treeConfig: () => fresh, fanoutAt: () => 0, depthCapFor: () => 5, readManifest: () => [] } } });
  assert.notEqual(r.reason, 'tree-timeout');
});

test('H3b: DISARMED degrades before the H3 guard ever runs', async () => {
  const aged = { createdAt: new Date(Date.now() - 10000).toISOString(), treeTimeoutMs: 50 };
  const r = await spawnNano({ ctx: { rootRunId: 'h3b-dis', myPath: 'r', depth: 0 }, args: { lane: 'deepseek-v4-flash', task: 'x' }, opts: { deps: { armed: false, treeConfig: () => aged } } });
  assert.equal(r.degrade, true);
  assert.equal(r.reason, 'spawn-disabled-DISARMED');
});

// ── H5 seedRootTree ──────────────────────────────────────────────────────────
test('H5: seedRootTree returns the YURI_NANO_* env block + acquires a live root in-flight lease', () => {
  const rid = 'h5-' + process.pid;
  const env = seedRootTree(rid);
  assert.equal(env.YURI_NANO_ROOT_RUN_ID, String(rid));
  assert.equal(env.YURI_NANO_PATH, 'r');
  assert.equal(env.YURI_NANO_DEPTH, '0');
  assert.equal(env.rootNanoId, nanoIdOf(rid, 'r'));
  const alive = inspectLeases().some((l) => l.alive && String(l.leaseId) === inflightLeaseId(rid, 'r'));
  assert.ok(alive, 'root in-flight lease must be alive after seedRootTree');
});

// ── H6 budget-lease tolerance ────────────────────────────────────────────────
test('H6: reserveSpawnSlots runs with the new 15000 default (no maxWaitMs) and grants', async () => {
  const rid = 'h6-' + process.pid; initTree(rid, {});
  const res = await reserveSpawnSlots(rid, [{ lane: 'x', task: 't' }], 'spawner-' + process.pid, { parentPath: 'r' });
  assert.ok(res && Array.isArray(res.granted));
});
