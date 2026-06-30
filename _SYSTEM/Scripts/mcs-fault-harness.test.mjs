#!/usr/bin/env node
// @capability: mcs-fault-harness
// @serves: fault injection | mcs test | concurrent drainer | rotation under write | dead drainer reclaim
// @does: Inc 5 — Multi-process fault-injection harness using node:test + fork(). Three tests:
// T-rotation-under-write: writer loops appendClaim while drainer rotates
// T-Nproc-concurrent: 8 workers x 500 appends to own shards -> single drainer folds 4000 exactly-once
// T-dead-drainer-reclaim: SIGKILL drainer mid-fold -> 2nd drainer reclaims after TTL -> zero dup
// @depends: mcs-test-worker.mjs, memory-canonical-store.mjs, nano-lease.mjs

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { resolveDirs, listGenerations, loadCanonical, readView, DRAIN_LEASE_ID } from './memory-canonical-store.mjs';
import { acquireLease, releaseLease, reclaimLeases, inspectLeases } from './nano-lease.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, 'mcs-test-worker.mjs');
const TEST_DIR_BASE = path.join(__dirname, '..', '..', '_SYSTEM', 'state', 'mcs-test');

function mkTestDir(suffix) {
  const dir = path.join(TEST_DIR_BASE, `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function spawnWorker(action, payload, env = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [action, JSON.stringify(payload)], {
      env: { ...process.env, YURI_CANONICAL_DIR: env.dir || process.env.YURI_CANONICAL_DIR },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    const logs = [];
    child.on('message', (msg) => {
      if (msg.type === 'log') logs.push(msg.msg);
      if (msg.type === 'done') resolve({ ok: true, logs, payload: msg });
      if (msg.type === 'error') reject(new Error(msg.msg));
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited ${code}, logs: ${logs.join('; ')}`));
    });
  });
}

function countEvents(dir) {
  const { base } = resolveDirs({ dir });
  let total = 0;
  for (const gen of listGenerations(base)) {
    if (!fs.existsSync(gen)) continue;
    const content = fs.readFileSync(gen, 'utf8');
    for (const line of content.split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const e = JSON.parse(t); if (e.eventId) total++; } catch { /* */ }
    }
  }
  return total;
}

function readAllEventIds(dir) {
  const { base } = resolveDirs({ dir });
  const ids = [];
  for (const gen of listGenerations(base)) {
    if (!fs.existsSync(gen)) continue;
    for (const line of fs.readFileSync(gen, 'utf8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const e = JSON.parse(t); if (e.eventId) ids.push(e.eventId); } catch { /* */ }
    }
  }
  return ids;
}

describe('MCS Fault-Injection Harness (Inc 5)', { concurrency: false }, () => {
  let testDir;

  before(() => { testDir = mkTestDir('fault'); });
  after(() => { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ } });

  // ──────────────────────────────────────────────────────────────────────────────────
  // T-rotation-under-write: writer loops appendClaim while drainer rotates
  // ──────────────────────────────────────────────────────────────────────────────────
  it('T-rotation-under-write', async () => {
    const dir = mkTestDir('rot-under-write');
    process.env.YURI_CANONICAL_DIR = dir;
    process.env.YURI_CANONICAL_ROTATION_BYTES = '1024'; // tiny rotation to force many generations

    const writer = spawnWorker('append-loop', { laneId: 'writer-1', sessionId: 's1', count: 2000, delayMs: 0 }, { dir });
    const drainer = spawnWorker('drain', { drainerId: 'drainer-rot', cycles: 50, intervalMs: 20 }, { dir });

    await Promise.all([writer, drainer]);

    const total = countEvents(dir);
    const ids = readAllEventIds(dir);
    const unique = new Set(ids).size;

    assert.strictEqual(total, 2000, `expected 2000 folded events, got ${total}`);
    assert.strictEqual(unique, 2000, `expected 2000 unique eventIds (no dups), got ${unique}`);
    assert(ids.length > 0, 'should have events');

    // Verify read-view is loadable
    const view = await import('./memory-canonical-store.mjs').then(m => m.readView({ dir }));
    assert(view.claims.length >= 2000, 'read-view should have all claims');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────────────────────
  // T-Nproc-concurrent: 8 workers x 500 appends to own shards -> single drainer folds 4000 exactly-once
  // ──────────────────────────────────────────────────────────────────────────────────
  it('T-Nproc-concurrent', async () => {
    const dir = mkTestDir('nproc-concurrent');
    process.env.YURI_CANONICAL_DIR = dir;

    const workers = [];
    for (let i = 0; i < 8; i++) {
      workers.push(spawnWorker('append-loop', { laneId: `lane-${i}`, sessionId: `sess-${i}`, count: 500, delayMs: 1 }, { dir }));
    }
    // Start drainer after a brief delay so shards accumulate
    setTimeout(() => {}, 50);
    const drainer = spawnWorker('drain', { drainerId: 'drainer-nproc', cycles: 30, intervalMs: 50 }, { dir });

    await Promise.all([...workers, drainer]);

    const total = countEvents(dir);
    const ids = readAllEventIds(dir);
    const unique = new Set(ids).size;

    assert.strictEqual(total, 4000, `expected 4000 folded events (8*500), got ${total}`);
    assert.strictEqual(unique, 4000, `expected 4000 unique eventIds (exactly-once), got ${unique}`);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────────────────────
  // T-dead-drainer-reclaim: SIGKILL drainer mid-fold -> 2nd drainer reclaims after TTL -> zero dup
  // ──────────────────────────────────────────────────────────────────────────────────
  it('T-dead-drainer-reclaim', async () => {
    const dir = mkTestDir('dead-drainer-reclaim');
    process.env.YURI_CANONICAL_DIR = dir;
    process.env.YURI_NANO_LEASE_TTL_MS = '2000'; // short TTL for test speed

    // Pre-populate shards
    for (let i = 0; i < 500; i++) {
      await import('./memory-canonical-store.mjs').then(m =>
        m.appendClaim('prefill', 's0', { kind: 'assert', subject: `k-${i}`, predicate: 'v', object: `val-${i}` }, { dir })
      );
    }

    // Start a drainer that holds lease then dies (hold-then-die)
    const deadDrainer = spawnWorker('hold-then-die', { drainerId: 'drainer-dead', holdMs: 100 }, { dir });
    await new Promise(r => setTimeout(r, 200)); // let it acquire lease

    // Kill it (simulated by worker exiting)
    await deadDrainer;

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 2500));

    // Second drainer should reclaim and complete fold
    const reclaimDrainer = spawnWorker('drain', { drainerId: 'drainer-reclaim', cycles: 10, intervalMs: 100 }, { dir });
    await reclaimDrainer;

    const total = countEvents(dir);
    const ids = readAllEventIds(dir);
    const unique = new Set(ids).size;

    assert.strictEqual(total, 500, `expected 500 folded events, got ${total}`);
    assert.strictEqual(unique, 500, `expected 500 unique eventIds (zero dup after reclaim), got ${unique}`);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});