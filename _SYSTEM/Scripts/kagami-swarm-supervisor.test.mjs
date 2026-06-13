#!/usr/bin/env node
// Tests for the NANO SWARM supervisor: reaper (attribute -> reclaim -> LEASE_EXPIRED), fresh-lease
// safety, singleton gating, log rotation in-cycle, and the pure planReap/computeLiveness cores. Both the
// event root and the leases dir are isolated to tmp; a low rotate-line threshold is set before import.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const sfx = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
const EVENTS = path.join(os.tmpdir(), `sup-ev-${sfx}`);
const LEASES = path.join(os.tmpdir(), `sup-lk-${sfx}`);
process.env.KAGAMI_CONTROL_STATE_ROOT = EVENTS;
process.env.YURI_NANO_LEASES_DIR = LEASES;
process.env.KAGAMI_ROTATE_LINES = '3'; // tiny so a few events trigger rotation deterministically

const { superviseOnce, planReap, computeLiveness, SUPERVISOR_LEASE_ID, DEFAULT_SILENT_MS } = await import('./kagami-swarm-supervisor.mjs');
const { acquireLease, releaseLease, leaseDir, listLeases } = await import('./nano-lease.mjs');
const { appendKagamiEvent, readKagamiEventsSince, getKagamiLogSegments } = await import('./kagami-event-bus.mjs');

const reset = () => { fs.rmSync(EVENTS, { recursive: true, force: true }); fs.rmSync(LEASES, { recursive: true, force: true }); };
const kinds = (lane) => readKagamiEventsSince({ lane }, { root: EVENTS }).map((e) => e.kind);

// Plant a STALE lease for `nanoId` on `id`: claim it, then rewrite its owner to a dead pid + ancient ts.
function plantStaleLease(id, nanoId) {
  acquireLease(id, nanoId);
  const owner = path.join(leaseDir(id), '.owner');
  const meta = JSON.parse(fs.readFileSync(owner, 'utf8'));
  meta.pid = 2147483647; // not a live pid -> process.kill(pid,0) throws ESRCH
  meta.renewedAt = 1; // ancient -> not fresh
  fs.writeFileSync(owner, JSON.stringify(meta));
}

test('clean swarm: ok, nothing expired, emits a SWARM_SUPERVISION_CYCLE', async () => {
  reset();
  const r = await superviseOnce({ supervisorId: 'sup-1', rotate: false });
  assert.equal(r.ok, true);
  assert.equal(r.expired.length, 0);
  assert.ok(kinds('sup-1').includes('SWARM_SUPERVISION_CYCLE'));
  assert.equal(listLeases().length, 0, 'supervisor released its own self-lease');
});

test('reaper: a STALE lease is reclaimed, attributed, and recorded as LEASE_EXPIRED', async () => {
  reset();
  plantStaleLease('file:x', 'nano-dead');
  const r = await superviseOnce({ supervisorId: 'sup-1', rotate: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.expired, [{ leaseId: 'file:x', nanoId: 'nano-dead' }]);
  const expEvents = readKagamiEventsSince({ lane: 'nano-dead' }, { root: EVENTS });
  assert.equal(expEvents.length, 1);
  assert.equal(expEvents[0].kind, 'LEASE_EXPIRED');
  assert.equal(expEvents[0].payload.leaseId, 'file:x');
  assert.equal(listLeases().some((l) => l.leaseId === 'file:x'), false, 'stale lease gone');
});

test('reaper: a FRESH (live) lease is NOT reaped', async () => {
  reset();
  acquireLease('file:y', 'nano-live'); // current pid, fresh renewedAt -> alive
  const r = await superviseOnce({ supervisorId: 'sup-1', rotate: false });
  assert.equal(r.expired.length, 0, 'live lease survives');
  assert.equal(listLeases().some((l) => l.leaseId === 'file:y'), true);
  releaseLease('file:y', 'nano-live');
});

test('singleton: a second supervisor while the lease is held is a clean no-op', async () => {
  reset();
  acquireLease(SUPERVISOR_LEASE_ID, 'other-sup'); // someone already supervising
  const r = await superviseOnce({ supervisorId: 'me', rotate: false });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-singleton');
  assert.equal(r.heldBy, 'other-sup');
  releaseLease(SUPERVISOR_LEASE_ID, 'other-sup');
});

test('rotation in-cycle: a log over the line threshold is rotated by the supervisor', async () => {
  reset();
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-a' }, { root: EVENTS, id: 'e1', ts: '2026-01-01T00:00:00.001Z' });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-a' }, { root: EVENTS, id: 'e2', ts: '2026-01-01T00:00:00.002Z' });
  appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: 'nano-a' }, { root: EVENTS, id: 'e3', ts: '2026-01-01T00:00:00.003Z' }); // >= 3 -> over threshold
  const r = await superviseOnce({ supervisorId: 'sup-1' }); // rotate defaults true
  assert.ok(r.rotated, 'a rotation happened');
  assert.equal(r.rotated.name, 'events.000001.jsonl');
  const segs = getKagamiLogSegments({ root: EVENTS });
  assert.equal(segs.sealedSegments.length, 1, 'one sealed segment now exists');
});

test('planReap (pure): only dead non-self, non-ownerless leases are reaped', () => {
  const snap = [
    { leaseId: SUPERVISOR_LEASE_ID, nanoId: 'sup', alive: true },
    { leaseId: 'file:a', nanoId: 'nano-a', alive: false },
    { leaseId: 'file:b', nanoId: 'nano-b', alive: true },
    { leaseId: null, nanoId: null, alive: false, ownerless: true },
  ];
  assert.deepEqual(planReap(snap), [{ leaseId: 'file:a', nanoId: 'nano-a' }]);
});

test('computeLiveness (pure): a lane silent beyond the window is flagged, a fresh one is not', () => {
  const now = 10_000_000;
  const events = [
    { lane: 'nano-a', ts: new Date(now - 1000).toISOString(), kind: 'HANDOFF_RECORDED' },
    { lane: 'nano-b', ts: new Date(now - 20 * 60 * 1000).toISOString(), kind: 'LANE_DISPATCHED' },
    { lane: 'sup-1', ts: new Date(now).toISOString(), kind: 'SWARM_SUPERVISION_CYCLE' },
  ];
  const live = computeLiveness(events, now, DEFAULT_SILENT_MS, 'sup-1'); // exclude the supervisor itself
  const a = live.find((l) => l.lane === 'nano-a');
  const b = live.find((l) => l.lane === 'nano-b');
  assert.equal(live.some((l) => l.lane === 'sup-1'), false, 'excluded lane absent');
  assert.equal(a.silent, false, 'nano-a fresh');
  assert.equal(b.silent, true, 'nano-b silent (20min > 10min window)');
  assert.equal(live[0].lane, 'nano-a', 'sorted most-recent first');
});
