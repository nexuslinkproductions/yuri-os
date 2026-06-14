// Tests for nano-spawn.mjs (Move-1b INC-4). Real nano-tree/nano-lease (tmp env dirs) exercise the genuine
// depth/fan-out/budget caps + atomic lease registration; cost + dispatch + arm are injected. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-spawn-test-'));
process.env.YURI_NANO_TREES_DIR = path.join(TMP, 'trees');
process.env.YURI_NANO_LEASES_DIR = path.join(TMP, 'leases');
process.env.YURI_NANOSWARM_SPAWN_FLAG = path.join(TMP, 'spawn.enabled');
delete process.env.YURI_NANOSWARM_SPAWN;
const sp = await import('./nano-spawn.mjs');
const nt = await import('./nano-tree.mjs');
const lease = await import('./nano-lease.mjs');

// inject: armed true, admit pass, dispatch spy. (real reserve/lease/tree)
function deps({ admit, dispatch } = {}) {
  const dispatches = [];
  return {
    d: {
      armed: true,
      admit: admit || (() => ({ admitted: true, reservationId: 'res-1' })),
      dispatch: dispatch || (async (spec, ctx) => { dispatches.push({ spec, ctx }); return { ok: true, dispatched: true }; }),
    },
    dispatches,
  };
}
const ctxAt = (rootRunId, myPath, depth) => ({ rootRunId, myPath, depth });

test('spawnArmed is two-factor: env AND flag file', () => {
  delete process.env.YURI_NANOSWARM_SPAWN;
  assert.equal(sp.spawnArmed(), false);
  process.env.YURI_NANOSWARM_SPAWN = '1';
  assert.equal(sp.spawnArmed(), false);                 // env but no flag file
  fs.writeFileSync(process.env.YURI_NANOSWARM_SPAWN_FLAG, '1');
  assert.equal(sp.spawnArmed(), true);                  // both
  fs.rmSync(process.env.YURI_NANOSWARM_SPAWN_FLAG);
  delete process.env.YURI_NANOSWARM_SPAWN;
});

test('DISARMED → degrade, no spawn', async () => {
  nt.initTree('t-dis', { budget: 64 });
  const r = await sp.spawnNano({ ctx: ctxAt('t-dis', 'r', 0), args: { task: 'x', lane: 'deepseek-v4-pro' }, opts: { deps: { armed: false } } });
  assert.equal(r.degrade, true);
  assert.equal(r.reason, 'spawn-disabled-DISARMED');
  assert.equal(r.spawned.length, 0);
});

test('tier routing: heavy frontier/unknown, light flash/nano', () => {
  assert.equal(sp.tierForLane('nemotron-3-ultra'), 'heavy');
  assert.equal(sp.tierForLane('claude-opus'), 'heavy');
  assert.equal(sp.tierForLane('mystery-lane'), 'heavy');   // unknown → conservative
  assert.equal(sp.tierForLane('gemma4:31b:cloud'), 'light');
  assert.equal(sp.tierForLane('ds-flash'), 'light');
});

test('DEPTH cap: heavy lane blocked at depth 5, allowed at 4', async () => {
  nt.initTree('t-depth', { budget: 64 });
  const { d } = deps();
  const blocked = await sp.spawnNano({ ctx: ctxAt('t-depth', 'r.0.0.0.0.0', 5), args: { task: 't', lane: 'nemotron-3-ultra' }, opts: { deps: d } });
  assert.equal(blocked.reason, 'depth-cap-reached');
  assert.equal(blocked.cap, 5);
  const ok = await sp.spawnNano({ ctx: ctxAt('t-depth', 'r.0.0.0.0', 4), args: { task: 't', lane: 'nemotron-3-ultra' }, opts: { deps: d } });
  assert.equal(ok.spawned.length, 1);                  // childDepth 5 == cap, allowed
});

test('DEPTH cap: light lane reaches depth 10', async () => {
  nt.initTree('t-light', { budget: 64 });
  const { d } = deps();
  const at9 = await sp.spawnNano({ ctx: ctxAt('t-light', 'r.0.0.0.0.0.0.0.0', 9), args: { task: 't', lane: 'gemma4:31b' }, opts: { deps: d } });
  assert.equal(at9.spawned.length, 1);                 // childDepth 10 == light cap
  const at10 = await sp.spawnNano({ ctx: ctxAt('t-light', 'r.0.0.0.0.0.0.0.0.0', 10), args: { task: 't', lane: 'gemma4:31b' }, opts: { deps: d } });
  assert.equal(at10.reason, 'depth-cap-reached');
  assert.equal(at10.cap, 10);
});

test('FAN-OUT cap: depth-0 F_eff=4 clamps a request of 6', async () => {
  nt.initTree('t-fan', { budget: 64 });
  const { d } = deps();
  const r = await sp.spawnNano({ ctx: ctxAt('t-fan', 'r', 0), args: { task: 't', lane: 'gemma4:31b', count: 6 }, opts: { deps: d } });
  assert.equal(r.spawned.length, 4);                   // F0=4 at depth 0
  assert.equal(r.rejected.fanout, 2);
});

test('NODE BUDGET caps total even when fan-out + depth allow more', async () => {
  nt.initTree('t-bud', { budget: 3 });                 // root=1 → 2 slots
  const { d } = deps();
  const r = await sp.spawnNano({ ctx: ctxAt('t-bud', 'r', 0), args: { task: 't', lane: 'gemma4:31b', count: 4 }, opts: { deps: d } });
  assert.equal(r.spawned.length, 2);                   // budget stops at 2
  assert.ok(r.rejected.budget >= 1);
  assert.equal(nt.nodeCount('t-bud'), 3);
});

test('COST reject: unfunded child skipped, counted, not dispatched', async () => {
  nt.initTree('t-cost', { budget: 64 });
  let n = 0;
  const admit = () => (++n === 1 ? { admitted: true, reservationId: 'r1' } : { admitted: false, decision: 'reject_over_budget' });
  const { d, dispatches } = deps({ admit });
  const r = await sp.spawnNano({ ctx: ctxAt('t-cost', 'r', 0), args: { task: 't', lane: 'gemma4:31b', count: 3 }, opts: { deps: d } });
  assert.equal(r.spawned.length, 1);                   // only the first funded
  assert.equal(r.rejected.cost, 2);
  assert.equal(dispatches.length, 1);                  // unfunded never dispatched
  // cost-rejected slots are VOIDED → must NOT become false orphans at the barrier (the INC-4 adversarial fix)
  assert.deepEqual(nt.manifestOrphans('t-cost', 'r'), []);
});

test('happy path: children registered (lease) BEFORE dispatch, ctx propagated', async () => {
  nt.initTree('t-ok', { budget: 64 });
  const seenAtDispatch = [];
  const dispatch = async (spec, childCtx) => {
    // INV-1: at dispatch time the child's in-flight lease must already be alive (registered before boot)
    const alive = lease.inspectLeases().some((l) => l.alive && l.leaseId === nt.inflightLeaseId('t-ok', childCtx.myPath));
    seenAtDispatch.push({ myPath: childCtx.myPath, depth: childCtx.depth, reservationId: childCtx.reservationId, leaseAlive: alive });
    return { ok: true };
  };
  const { d } = deps({ dispatch });
  const r = await sp.spawnNano({ ctx: ctxAt('t-ok', 'r', 0), args: { task: 'do', lane: 'deepseek-v4-pro', count: 2 }, opts: { deps: d } });
  assert.equal(r.spawned.length, 2);
  assert.deepEqual(r.spawned.map((s) => s.path), ['r.0', 'r.1']);
  assert.equal(r.spawned[0].depth, 1);
  assert.ok(seenAtDispatch.every((s) => s.leaseAlive), 'every child lease alive before its dispatch (INV-1)');
  assert.ok(seenAtDispatch.every((s) => s.reservationId === 'res-1'));
  assert.equal(r.spawned[0].leaseOwner, 't-ok/r.0');   // lease owned by the CHILD's nanoId
});

test('bad input: missing task / bad lane', async () => {
  nt.initTree('t-bad', { budget: 64 });
  const { d } = deps();
  assert.equal((await sp.spawnNano({ ctx: ctxAt('t-bad', 'r', 0), args: { lane: 'gemma4:31b' }, opts: { deps: d } })).reason, 'task-required');
  assert.equal((await sp.spawnNano({ ctx: ctxAt('t-bad', 'r', 0), args: { task: 't', lane: './raw.mjs' }, opts: { deps: d } })).reason, 'bad-lane');
});
