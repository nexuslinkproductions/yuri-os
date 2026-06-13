#!/usr/bin/env node
// Tests for nano-refresh.mjs — the NANO SWARM self-refresh step.
// buildNanoBrain is pure → tested exhaustively + deterministically. refresh is integration-tested
// against an isolated tmp event root (KAGAMI_CONTROL_STATE_ROOT) with the real cursor reader; git
// runs on the real repo so refresh assertions check STRUCTURE, not volatile git content.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.join(os.tmpdir(), `nano-refresh-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.KAGAMI_CONTROL_STATE_ROOT = ROOT;
const { buildNanoBrain, refresh } = await import('./nano-refresh.mjs');
const { appendKagamiEvent } = await import('./kagami-event-bus.mjs');

// ---- buildNanoBrain (pure) ----
test('buildNanoBrain: wrapped block with all sections + nano id', () => {
  const b = buildNanoBrain({ nanoId: 'nano-a', head: { sha: 'abc123', ref: 'main' }, commits: ['abc subj'], dirty: [], events: [] });
  assert.match(b, /^<nano-brain nano="nano-a">/);
  assert.match(b, /\n<\/nano-brain>$/);
  assert.match(b, /HEAD abc123 \(main\)/);
  assert.match(b, /recent: abc subj/);
  assert.match(b, /worktree: clean/);
  assert.match(b, /peers since cursor \(0\):/);
  assert.match(b, /\(no new swarm events\)/);
});

test('buildNanoBrain: dirty worktree counts + truncates the list past 3', () => {
  const b = buildNanoBrain({ dirty: [' M a', ' M b', ' M c', ' M d', '?? e'] });
  assert.match(b, /worktree: 5 uncommitted \(M a, M b, M c, …\)/);
});

test('buildNanoBrain: no commits -> (none); detached head fallback', () => {
  const b = buildNanoBrain({ head: {}, commits: [] });
  assert.match(b, /HEAD \(unknown\) \(\?\)/);
  assert.match(b, /recent: \(none\)/);
});

test('buildNanoBrain: event lines = [lane/kind] payload, truncated to 80', () => {
  const long = 'x'.repeat(200);
  const b = buildNanoBrain({ events: [{ lane: 'nano-b', kind: 'LANE_OUTPUT_DELTA', payload: { note: long } }] });
  assert.match(b, /\[nano-b\/LANE_OUTPUT_DELTA\]/);
  const evLine = b.split('\n').find((l) => l.includes('nano-b/'));
  assert.ok(evLine.length <= 2 + 1 + `[nano-b/LANE_OUTPUT_DELTA] `.length + 80 + 2, 'payload snippet is bounded');
  assert.ok(!evLine.includes(long), 'full 200-char payload must not appear');
});

test('buildNanoBrain: newCount > shown -> "showing last N"; cursor rendered', () => {
  const b = buildNanoBrain({ events: [{ lane: 'a', kind: 'K', payload: {} }], newCount: 50, cursorAdvancedTo: { afterId: 'e50', afterTs: '2026-06-13T10:00:00.000Z' } });
  assert.match(b, /peers since cursor \(50, showing last 1\):/);
  assert.match(b, /cursor -> id=e50 ts=2026-06-13T10:00:00\.000Z/);
});

test('buildNanoBrain: null cursor -> (unchanged)', () => {
  assert.match(buildNanoBrain({ cursorAdvancedTo: null }), /cursor -> \(unchanged\)/);
});

// ---- refresh (integration, isolated event root) ----
function seed() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  appendKagamiEvent('LANE_DISPATCHED', { lane: 'nano-a' }, { root: ROOT, id: 'r1', ts: '2026-06-13T10:00:00.000Z' });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-b' }, { root: ROOT, id: 'r2', ts: '2026-06-13T10:01:00.000Z' });
  appendKagamiEvent('HANDOFF_RECORDED', { lane: 'nano-b' }, { root: ROOT, id: 'r3', ts: '2026-06-13T10:02:00.000Z' });
}

test('refresh: reads new events, advances cursor to the LAST, reports count', () => {
  seed();
  const r = refresh('nano-a', { cursor: {}, root: ROOT });
  assert.equal(r.counts.newEvents, 3);
  assert.deepEqual(r.cursor, { afterId: 'r3', afterTs: '2026-06-13T10:02:00.000Z' });
  assert.match(r.brain, /peers since cursor \(3\):/);
  assert.match(r.brain, /HEAD /); // real git ran
});

test('refresh: from the advanced cursor -> nothing new (no re-surface)', () => {
  seed();
  const first = refresh('nano-a', { cursor: {}, root: ROOT });
  const second = refresh('nano-a', { cursor: first.cursor, root: ROOT });
  assert.equal(second.counts.newEvents, 0, 'a second refresh sees no already-consumed events');
  assert.match(second.brain, /\(no new swarm events\)/);
  assert.deepEqual(second.cursor, first.cursor, 'cursor holds when nothing new');
});

test('refresh: never throws on a bogus event root', () => {
  assert.doesNotThrow(() => refresh('nano-a', { cursor: {}, root: path.join(ROOT, 'nonexistent-sub') }));
});
