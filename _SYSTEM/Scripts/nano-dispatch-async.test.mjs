// Tests for nano-dispatch-async.mjs (D1 self-governed build). Hermetic: tmp env, real barrier/tree/lease/
// eot/canonical-store, injected FAKE dispatch (no real process spawn). Proves the pool bound AND — the
// load-bearing part — that CONCURRENT in-flight descendants make nano-barrier INV-1 fire (serial leaves it
// dormant). node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-async-test-'));
process.env.YURI_NANO_TREES_DIR = path.join(TMP, 'trees');
process.env.YURI_NANO_LEASES_DIR = path.join(TMP, 'leases');
process.env.YURI_CANONICAL_DIR = path.join(TMP, 'canonical');
const da = await import('./nano-dispatch-async.mjs');
const nt = await import('./nano-tree.mjs');
const lease = await import('./nano-lease.mjs');
const barrier = await import('./nano-barrier.mjs');
const eot = await import('./nano-eot.mjs');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('makePool respects the concurrency bound and runs everything', async () => {
  const pool = da.makePool(4);
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => pool.run(async () => { await delay(3); return i; })));
  assert.equal(results.length, 30);
  assert.equal(new Set(results).size, 30);
  assert.ok(pool.stats().peak <= 4, `peak ${pool.stats().peak} must be <= 4`);
  assert.ok(pool.stats().peak >= 2, 'peak should show real concurrency, not serial');
});

test('dispatchPool fans children concurrently within the bound', async () => {
  const granted = Array.from({ length: 10 }, (_, i) => ({ lane: 'l', task: 't', path: `r.${i}`, depth: 1 }));
  let observedPeak = 0;
  const fakeDispatch = async () => { await delay(4); return { ok: true }; };
  const { pool, all } = da.dispatchPool(granted, (g) => ({ rootRunId: 'x', myPath: g.path, depth: g.depth }), { concurrency: 3, dispatch: fakeDispatch });
  const tick = setInterval(() => { observedPeak = Math.max(observedPeak, pool.stats().active); }, 1);
  const res = await all; clearInterval(tick);
  assert.equal(res.length, 10);
  assert.ok(pool.stats().peak <= 3, `peak ${pool.stats().peak} <= 3`);
});

test('CONCURRENT in-flight descendants make the barrier BLOCK, then converge when all close', async () => {
  const ROOT = 'async-coupling';
  nt.initTree(ROOT, { budget: 64 });
  // simulate spawnNano's INV-1 registration for 3 concurrent children (lease owned by the child nanoId)
  const kids = ['r.0', 'r.1', 'r.2'];
  for (const p of kids) { nt.recordSpawn(ROOT, { path: p, lane: 'l', depth: 1 }); lease.acquireLease(nt.inflightLeaseId(ROOT, p), nt.nanoIdOf(ROOT, p)); }
  // all three live concurrently → the barrier MUST block (this is the invariant serial dispatch leaves dormant)
  assert.equal(nt.inflightDescendants(ROOT, 'r').length, 3);
  const blocked = barrier.canFinalize({ rootRunId: ROOT, myPath: 'r', ledger: { leafTasks: [] }, opts: { armed: true } });
  assert.equal(blocked.converged, false);
  assert.equal(blocked.reason, 'descendants-in-flight');

  // fire the children concurrently through the pool; each closes (EOT writes claim + releases its lease)
  const fakeDispatch = async (spec, ctx) => {
    await delay(2);
    eot.closeNano({ rootRunId: ctx.rootRunId, myPath: ctx.myPath, resultLabel: '08RX_X_PASS', claims: [{ subject: `f:${ctx.myPath}`, predicate: 'is', object: 'ok' }] });
    return { ok: true };
  };
  const { all } = da.dispatchPool(kids.map((p) => ({ lane: 'l', task: 't', path: p, depth: 1 })), (g) => ({ rootRunId: ROOT, myPath: g.path, depth: 1 }), { concurrency: 16, dispatch: fakeDispatch });
  await all;

  assert.equal(nt.inflightDescendants(ROOT, 'r').length, 0); // all closed
  const conv = barrier.canFinalize({ rootRunId: ROOT, myPath: 'r', ledger: { leafTasks: [] }, opts: { armed: true } });
  assert.equal(conv.converged, true, JSON.stringify(conv));
});

test('NEGATIVE/dormant-race catch: a DEEP concurrent descendant still blocks the root (tree-scoped, not direct-child)', () => {
  const ROOT = 'async-deep';
  nt.initTree(ROOT, { budget: 64 });
  // r.0 completed; but its child r.0.0 is still live (a grandchild a direct-child-only barrier would MISS)
  nt.recordSpawn(ROOT, { path: 'r.0', lane: 'l', depth: 1 }); nt.recordComplete(ROOT, 'r.0');
  nt.recordSpawn(ROOT, { path: 'r.0.0', lane: 'l', depth: 2 });
  lease.acquireLease(nt.inflightLeaseId(ROOT, 'r.0.0'), nt.nanoIdOf(ROOT, 'r.0.0'));
  // the tree-scoped barrier MUST see the deep descendant and block; this assertion FAILS if a regression
  // narrows the barrier to direct children only (the dormant-race the whole design exists to prevent).
  const v = barrier.canFinalize({ rootRunId: ROOT, myPath: 'r', ledger: { leafTasks: [] }, opts: { armed: true } });
  assert.equal(v.converged, false);
  assert.equal(v.reason, 'descendants-in-flight');
  assert.ok(v.blocking.some((b) => b.leaseId === nt.inflightLeaseId(ROOT, 'r.0.0')));
});
