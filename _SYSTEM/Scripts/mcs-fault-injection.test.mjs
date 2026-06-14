// _SYSTEM/Scripts/mcs-fault-injection.test.mjs
// P2 Inc 5 ARMING GATE (a TEST, not a registered capability — capability-scan excludes *.test.mjs). Forks the
// REAL on-disk worker (mcs-test-worker.mjs) to prove the canonical store stays EXACTLY-ONCE under:
//   (A) rotation-under-concurrent-write, (B) 8-process throughput, (C) dead-drainer lease reclaim by
//   PID-liveness (no TTL wait), (D) crash-recovery (offset-loss + dangling-symlink repair), (E) dedup of
//   overlapping eventIds across concurrent shards + content integrity, (F) consistent peer reads during
//   rotation+compaction, (G) crash MID-FOLD -> reclaim -> dedup-seed recovery with no double-count.
// node:test + node:assert only. Scenarios E/F/G + the foldCanonical ENOENT-tolerance were swarm-hardened
// (glm-5.1 / minimax-m3 / nemotron-3-ultra peer review, 2026-06-14).
// Run: YURI_NANO_LEASES_DIR=$(mktemp -d) node --test _SYSTEM/Scripts/mcs-fault-injection.test.mjs
//
// Requires YURI_NANO_LEASES_DIR set in the runner env: nano-lease reads it at MODULE LOAD, so the test
// process and every fork must share ONE leases dir for the drain lease to be visible across processes.
// Each test uses its OWN canonical tmp dir — in-process via {dir} opts, workers via YURI_CANONICAL_DIR
// fork env — so the live store is never touched and tests don't cross-contaminate canonical state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendClaim, drainOnce, loadCanonical, readView, listGenerations, resolveDirs } from './memory-canonical-store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, 'mcs-test-worker.mjs');
const mkTmp = () => mkdtempSync(path.join(tmpdir(), 'mcs-fi-'));
const T = { timeout: 90_000 };   // generous safety net — real runs finish in seconds; a deadlock fails RED instead of hanging

/** Every eventId PHYSICALLY present across all canonical generations (duplicates included, so a double-write
 *  shows up as ids.length > Set(ids).size). The store's exactly-once floor: each eventId appears at most once. */
function canonicalEventIdList(base) {
  const ids = [];
  for (const gen of listGenerations(base)) {
    let raw; try { raw = readFileSync(gen, 'utf8'); } catch { continue; }
    for (const ln of raw.split('\n')) { const t = ln.trim(); if (!t) continue; try { const e = JSON.parse(t); if (e?.eventId) ids.push(e.eventId); } catch { /* skip */ } }
  }
  return ids;
}

if (!process.env.YURI_NANO_LEASES_DIR) {
  throw new Error('set YURI_NANO_LEASES_DIR=$(mktemp -d) so the drain lease is visible across forked workers');
}

/**
 * Fork the real worker for `action` with `payload`. Resolves on its first {type:'done'}, rejects on
 * {type:'error'}. append-loop/drain workers LINGER after 'done' (the open IPC channel keeps their event
 * loop alive), so we SIGKILL on settle — their work (claims fsync'd, canonical published) is already
 * durable by the time 'done' arrives, so the kill loses nothing.
 */
function runWorker(action, payload, env, onLog) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [action, JSON.stringify(payload)], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    let settled = false;
    const settle = (fn, v) => { if (settled) return; settled = true; try { child.kill('SIGKILL'); } catch { /* already gone */ } fn(v); };
    child.on('message', (m) => {
      if (m?.type === 'log') onLog?.(m.msg);
      else if (m?.type === 'done') settle(resolve, m);
      else if (m?.type === 'error') settle(reject, new Error(`worker error: ${m.msg}`));
    });
    child.on('error', (e) => settle(reject, e));
    child.on('exit', (code, sig) => { if (settled) return; settled = true; (code === 0 || sig) ? resolve({ exited: code }) : reject(new Error(`worker exit ${code}`)); });
  });
}

// ── Scenario A: rotation under concurrent write — exactly-once across many seal/rotate (and compaction) cycles ──
test('fault-injection A: rotation-under-write folds every claim exactly once', T, async () => {
  const dir = mkTmp();
  const { base } = resolveDirs({ dir });
  const APPENDERS = 4, COUNT = 150, EXPECT = APPENDERS * COUNT;
  // tiny rotation bytes (via env — the worker's drainOnce only forwards {dir}) -> seal/rotate every few events;
  // crossing compactGenThreshold also exercises compaction mid-write. Exactly-once must survive all of it.
  const env = { YURI_CANONICAL_DIR: dir, YURI_CANONICAL_ROTATION_BYTES: '900' };
  const appenders = Array.from({ length: APPENDERS }, (_, k) =>
    runWorker('append-loop', { laneId: `laneA-${k}`, sessionId: `sA-${k}`, count: COUNT, delayMs: 2 }, env));
  const drainer = runWorker('drain', { drainerId: 'rot-drainer', cycles: 40, intervalMs: 15 }, env);
  await Promise.all(appenders);
  await drainer;
  // tail flush in-process (rotationBytes via opts, no env mutation) — guarantees the final appends are folded
  const tail = drainOnce('A-final', { dir, rotationBytes: 900 });
  assert.equal(tail.ok, true, 'final drain acquired the lease + folded');
  const live = loadCanonical({ dir });
  assert.equal(live.length, EXPECT, `every distinct claim folded exactly once (got ${live.length}/${EXPECT})`);
  // rotation fired (>=2) AND compaction actually ran: a 900B threshold over 600 events (~3/gen) would leave
  // ~200 generations if compaction silently no-op'd; the live-claims-preserving compaction collapses them to a
  // bounded handful. The upper bound is the real proof compaction fired (a weak `>=2` alone is a false-green).
  const gens = listGenerations(base).length;
  assert.ok(gens >= 2 && gens <= 25, `rotation fired + compaction bounded growth (gens=${gens}; expected 2..25, no-compaction≈200)`);
  rmSync(dir, { recursive: true, force: true });
});

// ── Scenario B: 8 processes × 500 distinct claims — high-contention exactly-once ──
test('fault-injection B: 8 processes × 500 claims fold exactly once (no dup, no loss)', T, async () => {
  const dir = mkTmp();
  const PROCS = 8, COUNT = 500, EXPECT = PROCS * COUNT;
  const env = { YURI_CANONICAL_DIR: dir };
  const appenders = Array.from({ length: PROCS }, (_, k) =>
    runWorker('append-loop', { laneId: `laneB-${k}`, sessionId: `sB-${k}`, count: COUNT, delayMs: 0 }, env));
  const drainer = runWorker('drain', { drainerId: 'B-drainer', cycles: 25, intervalMs: 30 }, env);
  await Promise.all(appenders);
  await drainer;
  const tail = drainOnce('B-final', { dir });
  assert.equal(tail.ok, true);
  const live = loadCanonical({ dir });
  assert.equal(live.length, EXPECT, `all ${EXPECT} distinct claims present exactly once (got ${live.length})`);
  rmSync(dir, { recursive: true, force: true });
});

// ── Scenario C: dead-drainer reclaim — PID-liveness (not a TTL wait) — and exactly-once after the reclaim ──
test("fault-injection C: a dead drainer's FRESH lease is reclaimed immediately (PID-liveness), fold stays exactly-once", T, async () => {
  const dir = mkTmp();
  const env = { YURI_CANONICAL_DIR: dir };
  const SEED = 50;
  for (let i = 0; i < SEED; i++) {
    const r = appendClaim('seedC', 'sC', { kind: 'assert', subject: `kC-${i}`, predicate: 'p', object: i }, { dir });
    assert.equal(r.ok, true, 'seed append ok');
  }
  // Fork a worker that ACQUIRES the drain lease (ttl 30s) and holds it; then we crash it while the lease is
  // still FRESH. A TTL-only reclaimer would block ~30s; PID-liveness reclaims the dead holder immediately.
  const holder = await new Promise((resolve, reject) => {
    const c = fork(WORKER, ['hold-then-die', JSON.stringify({ drainerId: 'dead-drainer', holdMs: 20_000 })], {
      env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    c.on('message', (m) => { if (m?.type === 'log' && /acquired lease/.test(m.msg)) resolve(c); else if (m?.type === 'error') reject(new Error(m.msg)); });
    c.on('error', reject);
    c.on('exit', (code) => reject(new Error(`holder exited before acquiring lease (code ${code})`)));
  });
  const exited = new Promise((r) => holder.once('exit', r));
  holder.kill('SIGKILL');
  await exited;                          // child reaped by Node -> kill(pid,0) now throws ESRCH -> holderAlive=false
  // Proves the COMMON path: a dead PID's still-fresh lease is reclaimed at once. Residual (documented
  // cooperative-lease floor in nano-lease.mjs): if the OS recycles the dead PID to a live stranger within the
  // 30s TTL, liveness reads "held" and reclaim waits out the TTL — correctness holds (TTL expires), only
  // latency degrades. Not deterministically reproducible here, so asserted as the no-recycle fast path.
  const t0 = Date.now();
  const res = drainOnce('live-drainer', { dir });
  const elapsed = Date.now() - t0;
  assert.equal(res.ok, true, `live drainer reclaimed the dead lease (got ${JSON.stringify(res)})`);
  assert.ok(elapsed < 5_000, `reclaim was immediate, not a TTL wait (elapsed ${elapsed}ms; dead lease ttl was 30000ms)`);
  assert.equal(loadCanonical({ dir }).length, SEED, 'all seeded claims folded after reclaim');
  const again = drainOnce('live-drainer-2', { dir });
  assert.equal(again.ok, true);
  assert.equal(loadCanonical({ dir }).length, SEED, 're-drain is idempotent — no dup after reclaim');
  rmSync(dir, { recursive: true, force: true });
});

// ── Scenario D: crash-recovery — the deterministic core of "crash mid-rotation". Rather than racing a µs-wide
// timed SIGKILL, reconstruct the two recoverable post-crash disk states directly and prove re-drain stays
// exactly-once: (1) offsets never durably checkpointed (deleted) — the dedup seed must prevent double-fold;
// (2) the canonical.jsonl symlink lost (interrupted rotation/swap) — currentGen() must repair it. ──
test('fault-injection D: crash-recovery — offset-loss re-drain is idempotent, dangling symlink repairs, exactly-once', T, async () => {
  const dir = mkTmp();
  const { offsetsPath, canonicalLog } = resolveDirs({ dir });
  const N = 40;
  for (let i = 0; i < N; i++) {
    const r = appendClaim('seedD', 'sD', { kind: 'assert', subject: `kD-${i}`, predicate: 'p', object: i }, { dir });
    assert.equal(r.ok, true, 'seed append ok');
  }
  assert.equal(drainOnce('D1', { dir }).ok, true, 'first drain folds + checkpoints offsets');
  assert.equal(loadCanonical({ dir }).length, N, 'all folded on first drain');
  // CRASH SIM 1 — offsets were never durably checkpointed (lost). Re-drain MUST NOT double-fold: the dedup
  // seed (canonicalEventIds across all gens) is the idempotency floor independent of the per-shard offsets.
  rmSync(offsetsPath, { force: true });
  const r2 = drainOnce('D2', { dir });
  assert.equal(r2.ok, true);
  assert.equal(r2.folded, 0, 'offset-loss re-drain folds nothing new — dedup seed catches every already-folded event');
  assert.equal(loadCanonical({ dir }).length, N, 'no duplication after offset loss');
  // CRASH SIM 2 — the canonical.jsonl symlink is gone (crash between gen-create and symlink-swap). The gen
  // files survive; currentGen() must repair the dangling pointer, and a fresh append must still fold once.
  rmSync(canonicalLog, { force: true });
  assert.equal(appendClaim('seedD', 'sD2', { kind: 'assert', subject: 'kD-new', predicate: 'p', object: 'x' }, { dir }).ok, true);
  const r3 = drainOnce('D3', { dir });
  assert.equal(r3.ok, true, 'drain repaired the dangling symlink and folded');
  assert.equal(loadCanonical({ dir }).length, N + 1, 'symlink repaired + new claim folded, still exactly-once');
  rmSync(dir, { recursive: true, force: true });
});

// ── Scenario E (minimax): the store's CORE property — sha256 eventId dedup — exercised UNDER CONCURRENCY, plus
// content integrity. Same laneId + different sessions => DISTINCT shards (one-writer-per-file holds) but
// IDENTICAL (subject,object) for overlapping i => IDENTICAL eventId. AppA writes key-shared-0..99, AppB writes
// key-shared-0..149: 250 raw appends, 100 overlapping, 150 unique. A broken dedup (always-unique / payload
// overwrite) would fail the count OR the content check — neither of which A/B/C/D could catch (all distinct ids). ──
test('fault-injection E: overlapping eventIds across concurrent shards dedup to the unique set + content preserved', T, async () => {
  const dir = mkTmp();
  const { base } = resolveDirs({ dir });
  const env = { YURI_CANONICAL_DIR: dir, YURI_CANONICAL_ROTATION_BYTES: '1200' };   // also cross the compaction threshold
  const A = runWorker('append-loop', { laneId: 'shared', sessionId: 'sA', count: 100, delayMs: 1 }, env);
  const B = runWorker('append-loop', { laneId: 'shared', sessionId: 'sB', count: 150, delayMs: 1 }, env);
  const drainer = runWorker('drain', { drainerId: 'E-drainer', cycles: 30, intervalMs: 15 }, env);
  await Promise.all([A, B]);
  await drainer;
  assert.equal(drainOnce('E-final', { dir, rotationBytes: 1200 }).ok, true);
  const live = loadCanonical({ dir });
  assert.equal(live.length, 150, `250 raw appends (100 overlapping) dedup to 150 unique (got ${live.length})`);
  // CONTENT integrity (count alone is a false-green for payload-overwrite bugs): a known overlapping key must
  // still carry the exact written object.
  const k75 = live.find((c) => c.subject === 'key-shared-75');
  assert.ok(k75, 'overlapping key present in canonical');
  assert.equal(k75.object, 'val-75', `content preserved (got ${JSON.stringify(k75?.object)})`);
  // and physically: zero duplicate eventId lines, exactly the 150 unique events.
  const ids = canonicalEventIdList(base);
  assert.equal(ids.length, new Set(ids).size, `no duplicate eventId lines in canonical (lines=${ids.length})`);
  assert.equal(new Set(ids).size, 150, 'canonical holds exactly the 150 unique events');
  rmSync(dir, { recursive: true, force: true });
});

// ── Scenario F (minimax): peer-open reads must stay consistent WHILE a drainer rotates + compacts. readView()
// is the atomic single-file surface — its claimCount must be monotonic (never torn, never regress). loadCanonical()
// is a peer-open LIVE re-fold racing leased compaction's rmSync — it must never THROW (validates the ENOENT-tolerant
// fold hardening). A spinning reader runs throughout the concurrent rotation+compaction storm. ──
test('fault-injection F: peer reads stay consistent during rotation+compaction (readView monotonic; loadCanonical never throws)', T, async () => {
  const dir = mkTmp();
  const APPENDERS = 4, COUNT = 120, EXPECT = APPENDERS * COUNT;
  const env = { YURI_CANONICAL_DIR: dir, YURI_CANONICAL_ROTATION_BYTES: '900' };
  let reading = true, maxView = 0, viewRegressions = 0, readThrows = 0, polls = 0;
  const reader = (async () => {
    while (reading) {
      try {
        const v = readView({ dir });                 // atomic single-file read — consistent + monotonic
        if (typeof v.claimCount === 'number') { if (v.claimCount < maxView) viewRegressions++; maxView = Math.max(maxView, v.claimCount); }
        loadCanonical({ dir });                       // live re-fold racing leased compaction — must never throw
        polls++;
      } catch { readThrows++; }
      await new Promise((r) => setTimeout(r, 4));
    }
  })();
  const appenders = Array.from({ length: APPENDERS }, (_, k) =>
    runWorker('append-loop', { laneId: `laneF-${k}`, sessionId: `sF-${k}`, count: COUNT, delayMs: 2 }, env));
  const drainer = runWorker('drain', { drainerId: 'F-drainer', cycles: 45, intervalMs: 12 }, env);
  await Promise.all(appenders);
  await drainer;
  assert.equal(drainOnce('F-final', { dir, rotationBytes: 900 }).ok, true);
  reading = false; await reader;
  assert.ok(polls > 10, `reader actually ran concurrently (polls=${polls})`);
  assert.equal(readThrows, 0, `peer reads never threw during rotation/compaction (throws=${readThrows})`);
  assert.equal(viewRegressions, 0, `read-view claimCount never regressed — atomic publish is consistent (regressions=${viewRegressions})`);
  assert.equal(loadCanonical({ dir }).length, EXPECT, `all folded exactly once (got ${loadCanonical({ dir }).length}/${EXPECT})`);
  rmSync(dir, { recursive: true, force: true });
});

// ── Scenario G (nemotron + minimax convergent): crash MID-FOLD. drainer-1 folds a large backlog and is SIGKILLed
// while in the append loop — after it has durably written SOME canonical events but BEFORE it publishes offsets.
// Recovery then rests entirely on the dedup seed (canonicalEventIds across all gens), not the offsets: drainer-2
// reclaims the dead lease (PID-liveness) and completes the fold with no double-count. This is the exact path the
// store's lease-loss/crash-recovery comment guards but C's hold-then-die never touches (it holds the lease, never folds). ──
test('fault-injection G: crash mid-fold -> reclaim -> dedup-seed recovery is exactly-once (no double-count)', T, async () => {
  const dir = mkTmp();
  const { base } = resolveDirs({ dir });
  const SHARDS = 5, PER = 600, EXPECT = SHARDS * PER;   // 3000 fsync'd events -> a single fold runs >> the kill delay
  for (let s = 0; s < SHARDS; s++)
    for (let j = 0; j < PER; j++)
      appendClaim(`laneG-${s}`, `sG-${s}`, { kind: 'assert', subject: `kG-${s}-${j}`, predicate: 'v', object: `val-${j}` }, { dir });
  const env = { YURI_CANONICAL_DIR: dir, YURI_CANONICAL_ROTATION_BYTES: '4000' };   // rotate during the long fold too
  const d1 = fork(WORKER, ['drain', JSON.stringify({ drainerId: 'G-d1', cycles: 1, intervalMs: 10 })], {
    env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  await new Promise((r) => setTimeout(r, 250));   // d1 acquires the lease + folds a chunk of the 3000-event backlog
  const exited = new Promise((r) => d1.once('exit', r));
  d1.kill('SIGKILL');                             // crash mid-fold: partial canonical, offsets NOT published, lease NOT released
  await exited;
  // drainer-2 reclaims the dead lease (PID-liveness) and finishes from the dedup seed + (stale/absent) offsets.
  assert.equal(drainOnce('G-d2', { dir, rotationBytes: 4000 }).ok, true, 'reclaimed the dead lease + completed the fold');
  assert.equal(drainOnce('G-d3', { dir, rotationBytes: 4000 }).ok, true, 'idempotent tail drain');
  const live = loadCanonical({ dir });
  assert.equal(live.length, EXPECT, `every event folded exactly once after a mid-fold crash (got ${live.length}/${EXPECT})`);
  const ids = canonicalEventIdList(base);
  assert.equal(ids.length, new Set(ids).size, `zero duplicate eventId lines after reclaim (lines=${ids.length}, unique=${new Set(ids).size})`);
  assert.equal(readView({ dir }).claimCount, EXPECT, 'read-view did not double-count after mid-fold reclaim');
  rmSync(dir, { recursive: true, force: true });
});
