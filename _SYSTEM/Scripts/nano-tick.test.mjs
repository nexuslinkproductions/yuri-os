#!/usr/bin/env node
// Tests for nano-tick.mjs — the NANO SWARM Phase-0 loop driver. Isolated tmp event root; the real
// guarded event bus + cursor reader + refresh are exercised end-to-end (git runs on the real repo).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.join(os.tmpdir(), `nano-tick-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.KAGAMI_CONTROL_STATE_ROOT = ROOT;
const { tick, runTicks, recoverCursor } = await import('./nano-tick.mjs');
const { readKagamiEventsSince, appendKagamiEvent } = await import('./kagami-event-bus.mjs');

const reset = () => fs.rmSync(ROOT, { recursive: true, force: true });
const laneEvents = (lane) => readKagamiEventsSince({ lane }, { root: ROOT });

test('tick: emits the 3 lifecycle events in order', async () => {
  reset();
  const r = await tick('nano-a', { root: ROOT, goalId: 'g1' });
  const kinds = laneEvents('nano-a').map((e) => e.kind);
  assert.deepEqual(kinds, ['LANE_DISPATCHED', 'LANE_OUTPUT_DELTA', 'HANDOFF_RECORDED']);
  assert.equal(r.emitted.length, 3);
});

test('tick: work fn receives the brain and its result lands in OUTPUT_DELTA', async () => {
  reset();
  let sawBrain = '';
  await tick('nano-a', { root: ROOT, work: ({ brain }) => { sawBrain = brain; return { ok: true, did: 'a-thing' }; } });
  assert.match(sawBrain, /<nano-brain nano="nano-a">/);
  const delta = laneEvents('nano-a').find((e) => e.kind === 'LANE_OUTPUT_DELTA');
  assert.match(delta.payload.result, /a-thing/);
});

test('tick: cursor is anchored to THIS tick HANDOFF; recoverCursor matches', async () => {
  reset();
  const r = await tick('nano-a', { root: ROOT });
  const handoff = laneEvents('nano-a').find((e) => e.kind === 'HANDOFF_RECORDED');
  assert.deepEqual(r.cursor, { afterId: handoff.id, afterTs: handoff.ts });
  assert.deepEqual(recoverCursor('nano-a', ROOT), { afterId: handoff.id, afterTs: handoff.ts });
});

test('tick: a throwing work fn is captured (ok:false), all 3 events still emitted', async () => {
  reset();
  const r = await tick('nano-a', { root: ROOT, work: () => { throw new Error('boom'); } });
  assert.equal(r.result.ok, false);
  assert.match(r.result.error, /boom/);
  assert.equal(laneEvents('nano-a').length, 3, 'resilient: still closes with all 3 events');
});

test('cross-process continuity: a fresh tick (no cursor) recovers from the last HANDOFF', async () => {
  reset();
  const first = await tick('nano-a', { root: ROOT });          // tick 1
  const second = await tick('nano-a', { root: ROOT });         // tick 2, no cursor passed -> must recover
  // tick 2 must start AFTER tick 1's handoff: its refresh sees none of tick 1's own 3 events.
  const handoffs = laneEvents('nano-a').filter((e) => e.kind === 'HANDOFF_RECORDED');
  assert.equal(handoffs.length, 2);
  assert.deepEqual(second.cursor, { afterId: handoffs[1].id, afterTs: handoffs[1].ts });
  assert.notDeepEqual(second.cursor, first.cursor, 'cursor advanced across ticks');
});

test('runTicks: N ticks thread the cursor; no self-echo (own prior events not re-seen)', async () => {
  reset();
  const out = await runTicks('nano-a', { ticks: 3, root: ROOT });
  assert.equal(out.ticks.length, 3);
  // 3 ticks x 3 events = 9 on the bus for this lane
  assert.equal(laneEvents('nano-a').length, 9);
  // a 2nd full refresh from the final cursor sees zero new (the swarm is quiet besides this nano)
  assert.deepEqual(readKagamiEventsSince({ afterId: out.finalCursor.afterId }, { root: ROOT }), []);
});

test('peer visibility: nano-a sees nano-b decisions on the shared bus', async () => {
  reset();
  await tick('nano-b', { root: ROOT, work: () => ({ ok: true, note: 'b-did-work' }) });
  const r = await tick('nano-a', { root: ROOT });
  // nano-a's refresh ran against an empty start cursor, so its brain shows nano-b's events
  assert.match(r.brain, /nano-b\//);
});

test('RED-TEAM #2: a CIRCULAR work result still closes the tick with all 3 events (always-HANDOFF)', async () => {
  reset();
  const circular = {}; circular.self = circular; // JSON.stringify would throw
  const r = await tick('nano-a', { root: ROOT, work: () => circular });
  const kinds = laneEvents('nano-a').map((e) => e.kind);
  assert.deepEqual(kinds, ['LANE_DISPATCHED', 'LANE_OUTPUT_DELTA', 'HANDOFF_RECORDED'], 'tick still closes with a HANDOFF');
  const delta = laneEvents('nano-a').find((e) => e.kind === 'LANE_OUTPUT_DELTA');
  assert.match(delta.payload.result, /unserializable/);
  assert.ok(r.cursor.afterId, 'cursor advanced past the handoff');
});

test('RED-TEAM #3: recoverCursor anchors off the last event of ANY kind (crash mid-tick -> no self-echo)', () => {
  reset();
  // simulate a crash AFTER dispatch but BEFORE handoff: only a LANE_DISPATCHED on the bus, no HANDOFF
  appendKagamiEvent('LANE_DISPATCHED', { lane: 'nano-a' }, { root: ROOT, id: 'd1', ts: '2026-06-13T09:00:00.000Z' });
  const cur = recoverCursor('nano-a', ROOT);
  assert.deepEqual(cur, { afterId: 'd1', afterTs: '2026-06-13T09:00:00.000Z' }, 'anchors off the orphan dispatch, not null');
  // so the next refresh starts AFTER the orphan -> the nano does not re-see its own crashed-tick event
  assert.deepEqual(readKagamiEventsSince({ afterId: cur.afterId, lane: 'nano-a' }, { root: ROOT }), []);
});
