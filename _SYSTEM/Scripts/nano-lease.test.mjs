#!/usr/bin/env node
// Tests for nano-lease.mjs — the NANO SWARM anti-clobber keystone (G1). Isolated: YURI_NANO_LEASES_DIR
// points at a throwaway tmp dir BEFORE import. Covers the load-bearing invariants: exactly-one-winner
// (mutual exclusion), owner-only release/renew (no lease theft), and dead/stale reclaim (no wedge).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.join(os.tmpdir(), `nano-lease-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.YURI_NANO_LEASES_DIR = DIR;
const { acquireLease, releaseLease, renewLease, reclaimLeases, acquireOrWait, listLeases, leaseDir } =
  await import('./nano-lease.mjs');

const reset = () => fs.rmSync(DIR, { recursive: true, force: true });
// plant a lease dir with a controlled .owner (for dead/stale scenarios)
function plant(id, meta) {
  const d = leaseDir(id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '.owner'), JSON.stringify(meta));
}

test('acquire: first wins, second (other nano) is refused with heldBy', () => {
  reset();
  const a = acquireLease('file:src/x.ts', 'nano-a');
  assert.equal(a.ok, true);
  const b = acquireLease('file:src/x.ts', 'nano-b');
  assert.equal(b.ok, false);
  assert.equal(b.heldBy, 'nano-a');
});

test('mutual exclusion: same id, two acquirers -> exactly one ok', () => {
  reset();
  const r1 = acquireLease('task:build', 'nano-a');
  const r2 = acquireLease('task:build', 'nano-b');
  assert.equal([r1.ok, r2.ok].filter(Boolean).length, 1, 'exactly one winner');
});

test('release: owner frees; NON-owner is refused (no lease theft)', () => {
  reset();
  acquireLease('file:y', 'nano-a');
  assert.equal(releaseLease('file:y', 'nano-b'), false, 'a non-owner cannot release');
  assert.ok(acquireLease('file:y', 'nano-b').ok === false, 'still held by nano-a');
  assert.equal(releaseLease('file:y', 'nano-a'), true, 'owner releases');
  assert.equal(acquireLease('file:y', 'nano-b').ok, true, 'free after owner release');
});

test('renew: owner bumps renewedAt; non-owner refused', () => {
  reset();
  acquireLease('file:z', 'nano-a', { ttlMs: 1000 });
  const before = JSON.parse(fs.readFileSync(path.join(leaseDir('file:z'), '.owner'), 'utf8')).renewedAt;
  assert.equal(renewLease('file:z', 'nano-b'), false, 'non-owner cannot renew');
  // ensure clock advances at least 1ms
  const t0 = Date.now(); while (Date.now() === t0) { /* spin <1ms */ }
  assert.equal(renewLease('file:z', 'nano-a'), true);
  const after = JSON.parse(fs.readFileSync(path.join(leaseDir('file:z'), '.owner'), 'utf8')).renewedAt;
  assert.ok(after >= before, 'renewedAt advanced');
});

test('reclaim: a STALE remote holder is swept (staleness via renewedAt)', () => {
  reset();
  plant('file:stale', { leaseId: 'file:stale', nanoId: 'ghost', host: 'other-host', pid: 4242, acquiredAt: 1, renewedAt: 1, ttlMs: 1000 });
  const reclaimed = reclaimLeases();
  assert.ok(reclaimed.includes('file:stale'));
  assert.equal(fs.existsSync(leaseDir('file:stale')), false, 'stale lease dir removed');
});

test('reclaim: a DEAD same-host pid is swept; a live holder is kept', () => {
  reset();
  plant('file:dead', { leaseId: 'file:dead', nanoId: 'crashed', host: os.hostname(), pid: 999999, acquiredAt: 1, renewedAt: Date.now(), ttlMs: 9e9 });
  const live = acquireLease('file:live', 'nano-a'); // held by THIS live pid
  const reclaimed = reclaimLeases();
  assert.ok(reclaimed.includes('file:dead'), 'dead pid reclaimed even though renewedAt is fresh');
  assert.equal(listLeases().some((l) => l.leaseId === 'file:live'), true, 'live holder kept');
  assert.ok(live.ok);
});

test('acquire reclaims a stale holder and retakes the lease', () => {
  reset();
  plant('file:takeover', { leaseId: 'file:takeover', nanoId: 'ghost', host: 'other-host', pid: 1, acquiredAt: 1, renewedAt: 1, ttlMs: 100 });
  const r = acquireLease('file:takeover', 'nano-a');
  assert.equal(r.ok, true, 'reclaimed the stale lease and took it');
  assert.equal(JSON.parse(fs.readFileSync(path.join(leaseDir('file:takeover'), '.owner'), 'utf8')).nanoId, 'nano-a');
});

test('acquireOrWait: immediate when free; times out against a live holder', async () => {
  reset();
  const a = await acquireOrWait('slot:gpu', 'nano-a', { maxWaitMs: 50, pollMs: 10 });
  assert.equal(a.ok, true);
  const b = await acquireOrWait('slot:gpu', 'nano-b', { maxWaitMs: 60, pollMs: 10 });
  assert.equal(b.ok, false);
  assert.equal(b.timeout, true);
});

test('guards: missing id/nanoId refused; release of free lease is a no-op success', () => {
  reset();
  assert.equal(acquireLease('', 'nano-a').ok, false);
  assert.equal(acquireLease('x', '').ok, false);
  assert.equal(releaseLease('never-held', 'nano-a'), true);
});

// ---- RED-TEAM REGRESSIONS (2026-06-13, the agentic nano red-team) ----

test('RT#3: release FAILS CLOSED on a null/owner-less dir (no theft of a mid-claim lease)', () => {
  reset();
  const d = leaseDir('file:noowner');
  fs.mkdirSync(d, { recursive: true }); // a dir with NO .owner (simulates a corrupt/mid-claim state)
  assert.equal(releaseLease('file:noowner', 'totally-not-the-owner'), false, 'a non-owner cannot free an owner-less dir');
  assert.equal(fs.existsSync(d), true, 'the dir survives the refused release');
});

test('RT#2: a live-but-STALE same-host holder is reclaimable (pid reuse cannot wedge past TTL)', () => {
  reset();
  // plant THIS process's (live) pid but a long-expired renewedAt -> pidLive && !fresh -> reclaimable
  const d = leaseDir('file:pidreuse');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '.owner'), JSON.stringify({ leaseId: 'file:pidreuse', nanoId: 'crashed-long-ago', host: os.hostname(), pid: process.pid, acquiredAt: 1, renewedAt: 1, ttlMs: 1000 }));
  assert.ok(reclaimLeases().includes('file:pidreuse'), 'stale lease on a recycled-but-live pid is reclaimed');
  assert.equal(acquireLease('file:pidreuse', 'nano-new').ok, true, 'and re-acquirable');
});

test('RT#4: orphan .stage-/.rcl- dirs are age-swept (do not leak forever)', () => {
  reset();
  const orphan = path.join(DIR, '.stage-orphan123');
  fs.mkdirSync(orphan, { recursive: true });
  // backdate its mtime well past 2*TTL so the age-sweep collects it
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(orphan, old, old);
  reclaimLeases();
  assert.equal(fs.existsSync(orphan), false, 'aged orphan staging dir swept');
});

test('RT#1: CROSS-PROCESS exactly-one-winner (the BLOCK) — 20 racing procs, one winner', async () => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const mod = path.join(here, 'nano-lease.mjs');
  const worker = path.join(DIR, '..', `lease-worker-${crypto.randomBytes(4).toString('hex')}.mjs`);
  fs.mkdirSync(DIR, { recursive: true });
  // The winner HOLDS the lease ~600ms (like a real nano doing work) before exiting — so concurrent
  // acquirers see a LIVE holder and are refused. (An instant-exit winner would look crashed to the
  // next proc, which would then legitimately reclaim it — that tests crash-recovery, not exclusion.)
  fs.writeFileSync(worker, `import { acquireLease } from ${JSON.stringify(mod)};\nconst r = acquireLease('file:contended', 'nano-' + process.argv[2]);\nif (r.ok) { setTimeout(() => { process.stdout.write(JSON.stringify({ ok: true })); process.exit(0); }, 600); } else { process.stdout.write(JSON.stringify({ ok: false })); process.exit(0); }\n`);
  reset();
  const run = (i) => new Promise((res) => {
    const c = spawn(process.execPath, [worker, String(i)], { env: { ...process.env, YURI_NANO_LEASES_DIR: DIR } });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => { try { res(JSON.parse(out).ok); } catch { res(false); } });
  });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => run(i)));
  const winners = results.filter(Boolean).length;
  fs.rmSync(worker, { force: true });
  assert.equal(winners, 1, `exactly one process may win the lease (got ${winners})`);
});
