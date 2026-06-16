// token-ledger-drain-lock.test.mjs — B1-ext-2 (race-class kill): the drain single-writer lock
// now reuses nano-lease (red-teamed reclaim) instead of the hand-rolled mtime-stale mkdir lock.
// Guards: (1) end-to-end drain still RECORDS — the .ok-return regression (acquireLease returns an
// object {ok}, not a boolean; a `=== true` check would silently make drain a permanent no-op and
// stop the live ledger); (2) single-writer — a held drain lease makes a concurrent drain skip;
// (3) path-scoping — isolated ledgers do not share a lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTokenLedgerPaths, enqueueTokenEvent, drainTokenLedger } from './token-ledger.mjs';
import { acquireLease, releaseLease } from './nano-lease.mjs';

function tmpLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tldl-'));
  const paths = resolveTokenLedgerPaths({
    stateRoot: dir, queueDir: path.join(dir, 'queue'), faultDir: path.join(dir, 'faults'),
    vaultDir: path.join(dir, 'vault'), lockDir: path.join(dir, 'queue.lock'), dbPath: path.join(dir, 'x.db'),
  });
  return { dir, paths, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
// mirrors the internal drainLeaseId(paths) — if that format changes, update here too.
const leaseIdFor = (paths) => `token-ledger-drain:${path.resolve(paths.lockDir)}`;
const evt = (id) => ({ event_id: id, provider: 'ollama-cloud', model: 'minimax-m3:cloud', lane: 'test', input_tokens: 100, output_tokens: 50, cost_usd: 0.01, operation_type: 'test', measurement_type: 'actual', created_at: new Date().toISOString() });

test('B1-ext-2 #1 end-to-end drain RECORDS + re-drains (guards the .ok-return regression that would no-op the live ledger)', () => {
  const L = tmpLedger();
  try {
    enqueueTokenEvent(evt('rec-1'), L.paths);
    const d1 = drainTokenLedger(L.paths);
    assert.equal(d1.lock_acquired, true, 'drain must acquire the lease');
    if (!d1.db_deferred) assert.equal(d1.inserted, 1, 'the event must be recorded (acquireLease().ok wired correctly)');
    const d2 = drainTokenLedger(L.paths);
    assert.equal(d2.lock_acquired, true, 'lock must be re-acquirable → release worked');
  } finally { L.cleanup(); }
});

test('B1-ext-2 #2 single-writer: a held drain lease makes a concurrent drain SKIP', () => {
  const L = tmpLedger();
  const id = leaseIdFor(L.paths);
  try {
    enqueueTokenEvent(evt('held-1'), L.paths);
    const got = acquireLease(id, 'other-holder', { ttlMs: 120000 });
    assert.equal(!!(got && got.ok), true, 'precondition: external holder takes the lease');
    const d = drainTokenLedger(L.paths);
    assert.equal(d.lock_acquired, false, 'drain must skip while another holder owns the lease (no double-drain)');
  } finally { try { releaseLease(id, 'other-holder'); } catch (_) {} L.cleanup(); }
});

test('B1-ext-2 #3 path-scoped: holding ledger A’s lease does NOT block ledger B', () => {
  const A = tmpLedger();
  const B = tmpLedger();
  const idA = leaseIdFor(A.paths);
  try {
    const got = acquireLease(idA, 'holds-A', { ttlMs: 120000 });
    assert.equal(!!(got && got.ok), true);
    enqueueTokenEvent(evt('b-1'), B.paths);
    const d = drainTokenLedger(B.paths);
    assert.equal(d.lock_acquired, true, 'ledger B drains independently of ledger A’s lock (path-scoped id)');
  } finally { try { releaseLease(idA, 'holds-A'); } catch (_) {} A.cleanup(); B.cleanup(); }
});
