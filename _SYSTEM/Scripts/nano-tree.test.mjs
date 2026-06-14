// Tests for nano-tree.mjs (Move-1b INC-1). Hermetic: env-overridden state dirs in a tmp dir, set BEFORE
// the dynamic import so the modules capture them at load. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-tree-test-'));
process.env.YURI_NANO_TREES_DIR = path.join(TMP, 'trees');
process.env.YURI_NANO_LEASES_DIR = path.join(TMP, 'leases');
const nt = await import('./nano-tree.mjs');
const lease = await import('./nano-lease.mjs');

test('path identity decodes lineage from the string', () => {
  assert.equal(nt.mintPath(null, 0), 'r');
  assert.equal(nt.mintPath('r', 0), 'r.0');
  assert.equal(nt.mintPath('r.0', 2), 'r.0.2');
  assert.equal(nt.depthOf('r'), 0);
  assert.equal(nt.depthOf('r.0'), 1);
  assert.equal(nt.depthOf('r.0.2.1'), 3);
  assert.equal(nt.parentOf('r.0.2'), 'r.0');
  assert.equal(nt.parentOf('r'), null);
  assert.ok(nt.isAncestor('r.0', 'r.0.2'));
  assert.ok(!nt.isAncestor('r.0', 'r.1'));
  assert.ok(!nt.isAncestor('r.0', 'r.0')); // strict
  assert.equal(nt.nanoIdOf('run9', 'r.0'), 'run9/r.0');
  assert.equal(nt.inflightLeaseId('run9', 'r.0'), 'nanotree:run9:r.0');
});

test('three limits: decaying fan-out, depth tier, param tier', () => {
  assert.equal(nt.fanoutAt(0), 4);   // F0=4
  assert.equal(nt.fanoutAt(1), 2);   // ceil(4*0.5)
  assert.equal(nt.fanoutAt(2), 1);   // ceil(4*0.25)=1
  assert.equal(nt.fanoutAt(5), 1);   // floor at 1
  assert.equal(nt.depthCapFor('heavy'), 5);
  assert.equal(nt.depthCapFor('light'), 10);
  assert.equal(nt.tierForParamsB(550), 'heavy');
  assert.equal(nt.tierForParamsB(31), 'light');
  assert.equal(nt.tierForParamsB(200), 'light');  // boundary: not >200
  assert.equal(nt.tierForParamsB(201), 'heavy');
});

test('initTree records the root and seeds bounds', () => {
  const r = nt.initTree('treeA', { budget: 10, f0: 4, decay: 0.5 });
  assert.equal(r.rootPath, 'r');
  assert.equal(nt.nodeCount('treeA'), 1);          // root counts
  assert.equal(nt.treeConfig('treeA').budget, 10);
});

test('reserveSpawnSlots grants up to remaining budget, assigns paths', async () => {
  nt.initTree('treeB', { budget: 3 });             // root = 1 → 2 child slots
  const specs = [{ lane: 'a' }, { lane: 'b' }, { lane: 'c' }, { lane: 'd' }];
  const res = await nt.reserveSpawnSlots('treeB', specs, 'spawnerX', { parentPath: 'r' });
  assert.equal(res.granted.length, 2);
  assert.equal(res.rejected.length, 2);
  assert.deepEqual(res.granted.map((g) => g.path), ['r.0', 'r.1']);
  assert.equal(res.granted[0].depth, 1);
  assert.equal(nt.nodeCount('treeB'), 3);          // root + 2
});

test('reserveSpawnSlots continues child indices across calls', async () => {
  nt.initTree('treeC', { budget: 64 });
  await nt.reserveSpawnSlots('treeC', [{ lane: 'a' }, { lane: 'b' }], 's1', { parentPath: 'r' });
  const r2 = await nt.reserveSpawnSlots('treeC', [{ lane: 'c' }], 's2', { parentPath: 'r' });
  assert.deepEqual(r2.granted.map((g) => g.path), ['r.2']); // continues after r.0, r.1
});

test('concurrent reserves honor the node budget atomically (no TOCTOU overflow)', async () => {
  nt.initTree('treeD', { budget: 4 });             // root=1 → 3 slots
  const calls = Array.from({ length: 12 }, (_, i) =>
    nt.reserveSpawnSlots('treeD', [{ lane: `n${i}` }], `s${i}`, { parentPath: 'r', maxWaitMs: 8000 }));
  const results = await Promise.all(calls);
  const totalGranted = results.reduce((a, r) => a + r.granted.length, 0);
  assert.equal(totalGranted, 3);                   // exactly the 3 free slots, never 12
  const paths = results.flatMap((r) => r.granted.map((g) => g.path));
  assert.equal(new Set(paths).size, paths.length); // all unique
  assert.equal(nt.nodeCount('treeD'), 4);          // root + 3, budget respected
});

test('inflightDescendants enumerates the whole subtree by lease prefix', () => {
  nt.initTree('treeE', { budget: 64 });
  // a live lease for a grandchild of r.0
  lease.acquireLease(nt.inflightLeaseId('treeE', 'r.0.1'), 'nano-r01');
  lease.acquireLease(nt.inflightLeaseId('treeE', 'r.1'), 'nano-r1');
  const underR0 = nt.inflightDescendants('treeE', 'r.0').map((l) => l.leaseId);
  assert.deepEqual(underR0, ['nanotree:treeE:r.0.1']);     // sees the deep descendant
  const underR1 = nt.inflightDescendants('treeE', 'r.1');
  assert.equal(underR1.length, 0);                          // r.1 has no descendants
  const underRoot = nt.inflightDescendants('treeE', 'r').map((l) => l.leaseId).sort();
  assert.deepEqual(underRoot, ['nanotree:treeE:r.0.1', 'nanotree:treeE:r.1']);
  lease.releaseLease(nt.inflightLeaseId('treeE', 'r.0.1'), 'nano-r01');
  assert.equal(nt.inflightDescendants('treeE', 'r.0').length, 0); // gone after release
});

test('manifestOrphans = spawned, no complete, no live lease', () => {
  nt.initTree('treeF', { budget: 64 });
  nt.recordSpawn('treeF', { path: 'r.0', lane: 'a', depth: 1 });
  nt.recordSpawn('treeF', { path: 'r.1', lane: 'b', depth: 1 });
  // r.1 has a live lease (in flight, not an orphan); r.0 has neither lease nor complete → orphan
  lease.acquireLease(nt.inflightLeaseId('treeF', 'r.1'), 'nano-r1b');
  let orphans = nt.manifestOrphans('treeF', 'r');
  assert.deepEqual(orphans, ['r.0']);
  // complete r.0 → no longer an orphan
  nt.recordComplete('treeF', 'r.0');
  orphans = nt.manifestOrphans('treeF', 'r');
  assert.deepEqual(orphans, []);
  lease.releaseLease(nt.inflightLeaseId('treeF', 'r.1'), 'nano-r1b');
});
