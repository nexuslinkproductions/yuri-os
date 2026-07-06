#!/usr/bin/env node
// Phase-2 integration: nano-tick + lease + compact-precheck. Isolates BOTH the kagami event root AND
// the leases dir to tmp before import, so nothing touches real state.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const sfx = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
const EVENTS = path.join(os.tmpdir(), `nt-lease-ev-${sfx}`);
const LEASES = path.join(os.tmpdir(), `nt-lease-lk-${sfx}`);
process.env.KAGAMI_CONTROL_STATE_ROOT = EVENTS;
process.env.YURI_NANO_LEASES_DIR = LEASES;
const { tick } = await import('./nano-tick.mjs');
const { acquireLease, releaseLease, listLeases } = await import('./nano-lease.mjs');
const { readKagamiEventsSince } = await import('./kagami-event-bus.mjs');

const reset = () => { fs.rmSync(EVENTS, { recursive: true, force: true }); fs.rmSync(LEASES, { recursive: true, force: true }); };
const kinds = (lane) => readKagamiEventsSince({ lane }, { root: EVENTS }).map((e) => e.kind);

test('tick with shard: claims + releases the lease, emits LEASE_CLAIMED/RELEASED, work runs', async () => {
  reset();
  let ran = false;
  const r = await tick('nano-a', { root: EVENTS, shard: 'file:src/x.ts', work: () => { ran = true; return { ok: true }; } });
  assert.equal(ran, true, 'work ran (lease was free)');
  assert.deepEqual(kinds('nano-a'), ['LEASE_CLAIMED', 'LANE_DISPATCHED', 'LANE_OUTPUT_DELTA', 'LEASE_RELEASED', 'HANDOFF_RECORDED']);
  assert.equal(listLeases().length, 0, 'lease released after the tick');
  assert.ok(r.cursor.afterId);
});

test('tick with a HELD shard: YIELDS cleanly (LEASE_CONTENDED, no work, no OUTPUT_DELTA)', async () => {
  reset();
  acquireLease('file:hot', 'nano-other'); // someone else holds it
  let ran = false;
  const r = await tick('nano-b', { root: EVENTS, shard: 'file:hot', work: () => { ran = true; return { ok: true }; } });
  assert.equal(ran, false, 'work did NOT run — shard was held');
  assert.equal(r.skipped, true);
  assert.equal(r.heldBy, 'nano-other');
  const k = kinds('nano-b');
  assert.deepEqual(k, ['LEASE_CONTENDED', 'HANDOFF_RECORDED'], 'contended -> contended+handoff only');
  assert.equal(k.includes('LANE_OUTPUT_DELTA'), false, 'no work output on a contended tick');
  releaseLease('file:hot', 'nano-other');
});

test('two nanos, same shard, sequential ticks: the first works, the second (while held) would yield', async () => {
  reset();
  // hold the shard out-of-band to represent nano-1 mid-work, then nano-2 ticks the same shard
  acquireLease('task:build', 'nano-1');
  const r2 = await tick('nano-2', { root: EVENTS, shard: 'task:build', work: () => ({ ok: true }) });
  assert.equal(r2.skipped, true, 'nano-2 yields while nano-1 holds the shard (never-clobber)');
  releaseLease('task:build', 'nano-1');
  // now free -> nano-2 can claim + work
  const r2b = await tick('nano-2', { root: EVENTS, shard: 'task:build', work: () => ({ ok: true, did: 'build' }) });
  assert.ok(!r2b.skipped, 'nano-2 proceeds once the shard is free');
});

test('compact-precheck: a token signal over the ceiling yields to compaction (no work, lease released)', async () => {
  reset();
  let ran = false;
  const r = await tick('nano-a', {
    root: EVENTS, shard: 'file:big', work: () => { ran = true; return { ok: true }; },
    tokenSignal: { tokenCount: 600_000 }, // over the 500k default ceiling
  });
  assert.equal(ran, false, 'work skipped — over the compaction ceiling');
  assert.equal(r.compactNeeded, true);
  assert.equal(listLeases().length, 0, 'lease released before yielding to compaction (not stranded)');
  assert.ok(kinds('nano-a').includes('LEASE_RELEASED'));
});

test('compact-precheck: an UNDER-ceiling signal proceeds to work normally', async () => {
  reset();
  let ran = false;
  await tick('nano-a', { root: EVENTS, shard: 'file:ok', work: () => { ran = true; return { ok: true }; }, tokenSignal: { tokenCount: 100 } });
  assert.equal(ran, true, 'under ceiling -> work runs');
});
