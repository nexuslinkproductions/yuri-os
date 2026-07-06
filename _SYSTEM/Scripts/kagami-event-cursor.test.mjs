#!/usr/bin/env node
// Tests for readKagamiEventsSince — the NANO SWARM self-refresh / swarm-board tail primitive.
// Isolated: KAGAMI_CONTROL_STATE_ROOT points at a throwaway tmp dir BEFORE import, so nothing
// here touches the real _SYSTEM/state/kagami-control surface. Writes go through the real
// appendKagamiEvent path (which honors explicit id/ts), so this is a true round-trip test.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.join(os.tmpdir(), `kagami-cursor-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.KAGAMI_CONTROL_STATE_ROOT = ROOT;
const { appendKagamiEvent, readKagamiEventsSince } = await import('./kagami-event-bus.mjs');

// 5 events, known ids/ts/lanes/kinds, chronological.
function seed() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  appendKagamiEvent('LANE_DISPATCHED', { lane: 'nano-a' }, { root: ROOT, id: 'e1', ts: '2026-06-13T10:00:00.000Z' });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-b' }, { root: ROOT, id: 'e2', ts: '2026-06-13T10:01:00.000Z' });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-a' }, { root: ROOT, id: 'e3', ts: '2026-06-13T10:02:00.000Z' });
  appendKagamiEvent('HANDOFF_RECORDED', { lane: 'nano-a' }, { root: ROOT, id: 'e4', ts: '2026-06-13T10:03:00.000Z' });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-b' }, { root: ROOT, id: 'e5', ts: '2026-06-13T10:04:00.000Z' });
}
const ids = (rows) => rows.map((r) => r.id);

test('no cursor -> all events, oldest-first', () => {
  seed();
  assert.deepEqual(ids(readKagamiEventsSince({}, { root: ROOT })), ['e1', 'e2', 'e3', 'e4', 'e5']);
});

test('afterId -> exact slice after that event', () => {
  seed();
  assert.deepEqual(ids(readKagamiEventsSince({ afterId: 'e2' }, { root: ROOT })), ['e3', 'e4', 'e5']);
  assert.deepEqual(ids(readKagamiEventsSince({ afterId: 'e5' }, { root: ROOT })), [], 'cursor at the last event -> nothing new');
});

test('afterTs -> strictly-after by ISO timestamp', () => {
  seed();
  assert.deepEqual(ids(readKagamiEventsSince({ afterTs: '2026-06-13T10:02:00.000Z' }, { root: ROOT })), ['e4', 'e5']);
});

test('lane filter, and afterId + lane compose', () => {
  seed();
  assert.deepEqual(ids(readKagamiEventsSince({ lane: 'nano-a' }, { root: ROOT })), ['e1', 'e3', 'e4']);
  assert.deepEqual(ids(readKagamiEventsSince({ afterId: 'e1', lane: 'nano-a' }, { root: ROOT })), ['e3', 'e4']);
});

test('kind filter', () => {
  seed();
  assert.deepEqual(ids(readKagamiEventsSince({ kind: 'LANE_OUTPUT_DELTA' }, { root: ROOT })), ['e2', 'e3', 'e5']);
});

test('unknown afterId falls back to beginning; afterTs then narrows (rotation-safe)', () => {
  seed();
  // unknown id -> start 0 (fail-open to visibility), afterTs narrows so old events are not re-surfaced
  assert.deepEqual(ids(readKagamiEventsSince({ afterId: 'GONE', afterTs: '2026-06-13T10:03:00.000Z' }, { root: ROOT })), ['e5']);
});

test('limit -> FIRST-N after the cursor (chronological), not last-N', () => {
  seed();
  assert.deepEqual(ids(readKagamiEventsSince({ limit: 2 }, { root: ROOT })), ['e1', 'e2']);
  assert.deepEqual(ids(readKagamiEventsSince({ afterId: 'e2', limit: 2 }, { root: ROOT })), ['e3', 'e4']);
});

test('missing event file -> empty (no throw)', () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  assert.deepEqual(readKagamiEventsSince({ afterId: 'x' }, { root: ROOT }), []);
});

test('RED-TEAM: a same-millisecond peer event after the cursor is NOT dropped (afterId authoritative)', () => {
  // cursor (afterId=c1, afterTs=T) + a genuinely-new peer event c2 sharing the SAME ts T.
  // afterId positions the slice after c1; afterTs must NOT then drop c2 just because c2.ts == T.
  fs.rmSync(ROOT, { recursive: true, force: true });
  const T = '2026-06-13T12:00:00.000Z';
  appendKagamiEvent('HANDOFF_RECORDED', { lane: 'nano-a' }, { root: ROOT, id: 'c1', ts: T });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-b' }, { root: ROOT, id: 'c2', ts: T }); // same ms, NEW
  const got = readKagamiEventsSince({ afterId: 'c1', afterTs: T }, { root: ROOT });
  assert.deepEqual(got.map((e) => e.id), ['c2'], 'same-ms peer event is surfaced, not silently skipped');
});
