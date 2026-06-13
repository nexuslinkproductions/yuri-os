#!/usr/bin/env node
// Tests for the segmented event log: rotation atomicity, segment-spanning reads, ts-skip optimization,
// index correctness + rebuild-on-miss, and full backward-compat. Isolated tmp event root before import.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.join(os.tmpdir(), `kg-rot-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.KAGAMI_CONTROL_STATE_ROOT = ROOT;
const {
  appendKagamiEvent, readKagamiEvents, readKagamiEventsSince,
  rotateEventLog, getKagamiLogSegments,
  KAGAMI_EVENT_BUS_FILE, KAGAMI_SEGMENT_INDEX_FILE,
} = await import('./kagami-event-bus.mjs');

const reset = () => fs.rmSync(ROOT, { recursive: true, force: true });
// controlled id + ts so ordering + same-ms cases are deterministic (buildKagamiEvent honors options.id/ts)
const ev = (id, ts) => appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-a' }, { root: ROOT, id, ts });
const ids = (rows) => rows.map((e) => e.id);
const seg = (root, name) => path.join(root, name);

test('under threshold -> no rotate', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  const r = rotateEventLog({ root: ROOT, maxBytes: 10 ** 9, maxLines: 10 ** 6 });
  assert.equal(r.rotated, false);
  assert.equal(r.reason, 'under-threshold');
});

test('empty active -> no rotate (no empty sealed segment ever created)', () => {
  reset();
  const r = rotateEventLog({ root: ROOT, force: true });
  assert.equal(r.rotated, false);
  assert.equal(r.reason, 'no-active'); // file does not exist yet
});

test('force rotate: seals events.000001.jsonl with EXACT range, removes active, index written', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  ev('b', '2026-01-01T00:00:00.002Z');
  ev('c', '2026-01-01T00:00:00.003Z');
  const r = rotateEventLog({ root: ROOT, force: true });
  assert.equal(r.rotated, true);
  assert.equal(r.name, 'events.000001.jsonl');
  assert.equal(r.count, 3);
  assert.equal(fs.existsSync(seg(ROOT, KAGAMI_EVENT_BUS_FILE)), false, 'active removed (recreated on next append)');
  assert.equal(fs.existsSync(seg(ROOT, 'events.000001.jsonl')), true, 'sealed segment present');
  const idx = JSON.parse(fs.readFileSync(seg(ROOT, KAGAMI_SEGMENT_INDEX_FILE), 'utf8'));
  assert.deepEqual(idx.segments['events.000001.jsonl'], {
    firstTs: '2026-01-01T00:00:00.001Z', lastTs: '2026-01-01T00:00:00.003Z', count: 3,
  });
});

test('next append recreates active; readKagamiEvents spans sealed + active in order', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  ev('b', '2026-01-01T00:00:00.002Z');
  rotateEventLog({ root: ROOT, force: true });
  ev('c', '2026-01-01T00:00:00.003Z'); // recreates active via flag 'a'
  ev('d', '2026-01-01T00:00:00.004Z');
  assert.equal(fs.existsSync(seg(ROOT, KAGAMI_EVENT_BUS_FILE)), true, 'active recreated, not clobbered');
  assert.deepEqual(ids(readKagamiEvents({ root: ROOT })), ['a', 'b', 'c', 'd']);
});

test('readKagamiEventsSince spans the rotation boundary: cursor in a sealed segment returns active tail', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  ev('b', '2026-01-01T00:00:00.002Z');
  rotateEventLog({ root: ROOT, force: true });
  ev('c', '2026-01-01T00:00:00.003Z');
  ev('d', '2026-01-01T00:00:00.004Z');
  // anchor on 'b' which now lives in the SEALED segment
  const since = readKagamiEventsSince({ afterId: 'b', afterTs: '2026-01-01T00:00:00.002Z' }, { root: ROOT });
  assert.deepEqual(ids(since), ['c', 'd']);
});

test('SKIP optimization: a sealed segment whose lastTs < afterTs is NEVER parsed (tripwire proof)', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  ev('b', '2026-01-01T00:00:00.002Z'); // sealed lastTs = ...002
  rotateEventLog({ root: ROOT, force: true });
  ev('c', '2026-01-01T00:00:00.003Z');
  ev('d', '2026-01-01T00:00:00.004Z');
  // Plant a tripwire: overwrite the SEALED segment with unparseable garbage. The index cache holds the
  // real lastTs (...002), so the skip decision uses the cache and must NOT read this file.
  fs.writeFileSync(seg(ROOT, 'events.000001.jsonl'), '{NOT VALID JSON\n');
  // cursor afterTs ...003 > sealed lastTs ...002 -> sealed segment skipped -> garbage never parsed.
  const since = readKagamiEventsSince({ afterId: 'c', afterTs: '2026-01-01T00:00:00.003Z' }, { root: ROOT });
  assert.deepEqual(ids(since), ['d'], 'returns active tail, no throw -> sealed segment was skipped, not parsed');
});

test('same-ms across the boundary is NOT dropped (afterId positional slice authoritative)', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  ev('b', '2026-01-01T00:00:00.002Z'); // sealed lastTs ...002
  rotateEventLog({ root: ROOT, force: true });
  ev('c', '2026-01-01T00:00:00.002Z'); // ACTIVE event sharing the cursor's millisecond
  ev('d', '2026-01-01T00:00:00.003Z');
  // anchor on sealed 'b' (ts ...002). lastTs ...002 is NOT < afterTs ...002 (strict) -> sealed parsed,
  // 'b' found -> slice after -> 'c' (same ms) retained because afterId was authoritative.
  const since = readKagamiEventsSince({ afterId: 'b', afterTs: '2026-01-01T00:00:00.002Z' }, { root: ROOT });
  assert.deepEqual(ids(since), ['c', 'd'], 'same-ms peer c across the boundary survives');
});

test('multiple rotations: seq increments; reads span all sealed + active', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  rotateEventLog({ root: ROOT, force: true }); // -> 000001
  ev('b', '2026-01-01T00:00:00.002Z');
  rotateEventLog({ root: ROOT, force: true }); // -> 000002
  ev('c', '2026-01-01T00:00:00.003Z');
  const segs = getKagamiLogSegments({ root: ROOT });
  assert.deepEqual(segs.sealedSegments.map((s) => s.name), ['events.000001.jsonl', 'events.000002.jsonl']);
  assert.deepEqual(ids(readKagamiEvents({ root: ROOT })), ['a', 'b', 'c']);
});

test('index-miss fallback: deleting events-index.json keeps reads correct (range recomputed)', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  ev('b', '2026-01-01T00:00:00.002Z');
  rotateEventLog({ root: ROOT, force: true });
  ev('c', '2026-01-01T00:00:00.003Z');
  fs.rmSync(seg(ROOT, KAGAMI_SEGMENT_INDEX_FILE), { force: true }); // wipe the optimization cache
  // skip decision now recomputes lastTs from the sealed file; correctness must hold
  const since = readKagamiEventsSince({ afterId: 'b', afterTs: '2026-01-01T00:00:00.002Z' }, { root: ROOT });
  assert.deepEqual(ids(since), ['c']);
  assert.deepEqual(ids(readKagamiEvents({ root: ROOT })), ['a', 'b', 'c']);
});

test('second rotate immediately after the first is a clean no-op (active freshly empty)', () => {
  reset();
  ev('a', '2026-01-01T00:00:00.001Z');
  const r1 = rotateEventLog({ root: ROOT, force: true });
  assert.equal(r1.rotated, true);
  const r2 = rotateEventLog({ root: ROOT, force: true }); // active was consumed -> nothing to rotate
  assert.equal(r2.rotated, false);
  assert.equal(r2.reason, 'no-active');
  assert.deepEqual(ids(readKagamiEvents({ root: ROOT })), ['a']);
});

test('lane/kind filters still apply across spanned segments', () => {
  reset();
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-a' }, { root: ROOT, id: 'a', ts: '2026-01-01T00:00:00.001Z' });
  appendKagamiEvent('HANDOFF_RECORDED', { lane: 'nano-b' }, { root: ROOT, id: 'b', ts: '2026-01-01T00:00:00.002Z' });
  rotateEventLog({ root: ROOT, force: true });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-a' }, { root: ROOT, id: 'c', ts: '2026-01-01T00:00:00.003Z' });
  const onlyA = readKagamiEventsSince({ lane: 'nano-a' }, { root: ROOT });
  assert.deepEqual(ids(onlyA), ['a', 'c']);
  const onlyHandoff = readKagamiEventsSince({ kind: 'HANDOFF_RECORDED' }, { root: ROOT });
  assert.deepEqual(ids(onlyHandoff), ['b']);
});
