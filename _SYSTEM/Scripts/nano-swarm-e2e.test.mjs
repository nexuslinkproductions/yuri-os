// Move-1b END-TO-END integration (INC-6). The REAL stack — nano-tree + nano-lease + memory-canonical-store
// + nano-spawn + nano-eot + nano-barrier — wired together in tmp dirs, no live lanes (dispatch simulates the
// child). Proves the full loop: spawn → register lease → child EOT writes canonical claim + releases lease →
// parent barrier drains, sees no in-flight + no orphan → converges. Plus the in-flight-block + orphan paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-e2e-test-'));
process.env.YURI_NANO_TREES_DIR = path.join(TMP, 'trees');
process.env.YURI_NANO_LEASES_DIR = path.join(TMP, 'leases');
process.env.YURI_CANONICAL_DIR = path.join(TMP, 'canonical');
const nt = await import('./nano-tree.mjs');
const sp = await import('./nano-spawn.mjs');
const eot = await import('./nano-eot.mjs');
const barrier = await import('./nano-barrier.mjs');
const store = await import('./memory-canonical-store.mjs');
const lease = await import('./nano-lease.mjs');
const { keyOf } = store;

const armedDeps = (dispatch) => ({ armed: true, admit: () => ({ admitted: true, reservationId: 'res-e2e' }), dispatch });

test('HAPPY PATH: spawn → child EOT writes canonical + releases → parent barrier converges', async () => {
  const ROOT = 'e2e-happy';
  nt.initTree(ROOT, { budget: 64 });
  // a well-behaved child: do work, then close (write claim + EOT marker + manifest complete + release lease).
  const dispatch = async (spec, childCtx) => {
    eot.closeNano({
      rootRunId: childCtx.rootRunId, myPath: childCtx.myPath, resultLabel: '08RX_CHILD_DONE_X_PASS',
      claims: [{ subject: `finding:${childCtx.myPath}`, predicate: 'is', object: 'ok' }],
    });
    return { ok: true };
  };
  const r = await sp.spawnNano({ ctx: { rootRunId: ROOT, myPath: 'r', depth: 0 }, args: { task: 'analyze', lane: 'deepseek-v4-pro', count: 2 }, opts: { deps: armedDeps(dispatch) } });
  assert.equal(r.spawned.length, 2);

  // every child released its lease at EOT → no in-flight descendants remain
  assert.equal(nt.inflightDescendants(ROOT, 'r').length, 0);

  // parent finalize: drains the children's shards, sees no in-flight / no orphan / no contested → converged
  const v = barrier.canFinalize({ rootRunId: ROOT, myPath: 'r', ledger: { leafTasks: [] }, poolOutputs: {}, opts: { armed: true } });
  assert.equal(v.converged, true, JSON.stringify(v));
  assert.equal(v.reason, 'all-layers-satisfied');

  // EOT-as-canonical-writer worked end-to-end: the children's findings + EOT markers are now canonical truth
  const view = store.readView();
  assert.ok(barrier.hasEotClaim(view, ROOT, 'r.0'));
  assert.ok(barrier.hasEotClaim(view, ROOT, 'r.1'));
  assert.ok(view.claims[keyOf({ subject: 'finding:r.0', predicate: 'is' })], 'child r.0 finding folded to canonical');
});

test('IN-FLIGHT BLOCK: a still-running child (lease held, no EOT) blocks parent finalize', async () => {
  const ROOT = 'e2e-inflight';
  nt.initTree(ROOT, { budget: 64 });
  const dispatch = async () => ({ ok: true });   // child "started" but never closes → lease stays held
  const r = await sp.spawnNano({ ctx: { rootRunId: ROOT, myPath: 'r', depth: 0 }, args: { task: 't', lane: 'deepseek-v4-pro', count: 1 }, opts: { deps: armedDeps(dispatch) } });
  assert.equal(r.spawned.length, 1);
  assert.equal(nt.inflightDescendants(ROOT, 'r').length, 1);   // r.0 lease alive

  const v = barrier.canFinalize({ rootRunId: ROOT, myPath: 'r', ledger: { leafTasks: [] }, poolOutputs: {}, opts: { armed: true } });
  assert.equal(v.converged, false);
  assert.equal(v.reason, 'descendants-in-flight');
});

test('ORPHAN → CRITICAL: a dead child (lease gone, no EOT) flags H2, never silent finalize', async () => {
  const ROOT = 'e2e-orphan';
  nt.initTree(ROOT, { budget: 64 });
  // child registers then DIES before closing: release its lease WITHOUT writing an EOT claim (simulates reap).
  const dispatch = async (spec, childCtx) => {
    lease.releaseLease(nt.inflightLeaseId(childCtx.rootRunId, childCtx.myPath), nt.nanoIdOf(childCtx.rootRunId, childCtx.myPath));
    return { ok: false, died: true };
  };
  const r = await sp.spawnNano({ ctx: { rootRunId: ROOT, myPath: 'r', depth: 0 }, args: { task: 't', lane: 'deepseek-v4-pro', count: 1 }, opts: { deps: armedDeps(dispatch) } });
  assert.equal(r.spawned.length, 1);
  assert.equal(nt.inflightDescendants(ROOT, 'r').length, 0);   // lease gone (reaped)

  const v = barrier.canFinalize({ rootRunId: ROOT, myPath: 'r', ledger: { leafTasks: [] }, poolOutputs: {}, opts: { armed: true } });
  assert.equal(v.converged, false);
  assert.equal(v.reason, 'barrier-critical');
  assert.ok(v.barrierSafety.some((s) => s.layer === 'barrier-orphan' && s.path === 'r.0' && s.severity === 'CRITICAL'));
});
