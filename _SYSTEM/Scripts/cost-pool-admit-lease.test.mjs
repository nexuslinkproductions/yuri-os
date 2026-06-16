// cost-pool-admit-lease.test.mjs — B1-ext-1 (race-class kill): the armed admit() read→check→write
// is serialized by a reservations-dir-scoped nano-lease so two concurrent admits cannot both pass
// the budget check and double-spend the cap. On lease contention admit REJECTS CONSERVATIVE (a rare
// concurrent admit is rejected rather than risking a double-spend). Cost admission ships DISARMED,
// so this hardens the armed path; the disarmed path is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { admit } from './cost-reservation-pool.mjs';
import { acquireLease, releaseLease } from './nano-lease.mjs';

function armedPool() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpa-'));
  const reserveDir = path.join(dir, 'reservations');
  const armFlag = path.join(dir, 'arm.flag');
  fs.mkdirSync(reserveDir, { recursive: true });
  fs.writeFileSync(armFlag, ''); // flag present → flagArmed
  // reliable actuals via overrides → the sync rollup DB isn't bound in a hermetic test
  // (actualsToDate would return unreliable → conservative reject before the fits check).
  const overrides = { reserveDir, armFlag, capUsd: 100, actuals: { spentUsd: 0, reliable: true, reason: 'test' } };
  const leaseId = `cost-pool-admit:${path.resolve(reserveDir)}`;
  return { dir, overrides, leaseId, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const TASK = { lane: 'deepseek', model: 'deepseek-v4-flash', promptChars: 400, steps: 1 };

test('B1-ext-1 #1 DISARMED admit is unchanged (advisory_pass, no lease taken)', () => {
  const r = admit(TASK, { reserveDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cpa-dis-')) }); // no env, no flag → disarmed
  assert.equal(r.enforced, false);
  assert.equal(r.decision, 'advisory_pass');
  assert.equal(r.admitted, true);
});

test('B1-ext-1 #2 ARMED admit with a free lease reserves, then releases (next admit can acquire)', () => {
  const P = armedPool();
  const prev = process.env.YURI_COST_ADMISSION_ENFORCE;
  process.env.YURI_COST_ADMISSION_ENFORCE = '1';
  try {
    const r = admit(TASK, P.overrides);
    assert.equal(r.enforced, true, 'must be armed');
    assert.equal(r.admitted, true, 'a small task under a $100 cap fits');
    assert.equal(r.decision, 'admit_reserved');
    // lease was released in finally → an external holder can now take it
    const got = acquireLease(P.leaseId, 'after', { ttlMs: 5000 });
    assert.equal(!!(got && got.ok), true, 'admit released its lease (no leak)');
    releaseLease(P.leaseId, 'after');
  } finally {
    if (prev === undefined) delete process.env.YURI_COST_ADMISSION_ENFORCE; else process.env.YURI_COST_ADMISSION_ENFORCE = prev;
    P.cleanup();
  }
});

test('B1-ext-1 #3 (TOCTOU guard) a HELD budget lease forces conservative-reject — no double-spend', () => {
  const P = armedPool();
  const prev = process.env.YURI_COST_ADMISSION_ENFORCE;
  process.env.YURI_COST_ADMISSION_ENFORCE = '1';
  const held = acquireLease(P.leaseId, 'concurrent-admit', { ttlMs: 10000 });
  try {
    assert.equal(!!(held && held.ok), true, 'precondition: a concurrent admit holds the budget lease');
    const r = admit(TASK, P.overrides);
    assert.equal(r.admitted, false, 'a concurrent admit must NOT also be admitted (no double-spend)');
    assert.equal(r.decision, 'reject_conservative_lease_contention');
    assert.equal(r.reservationId, null, 'no reservation may be written under contention');
  } finally {
    try { releaseLease(P.leaseId, 'concurrent-admit'); } catch (_) {}
    if (prev === undefined) delete process.env.YURI_COST_ADMISSION_ENFORCE; else process.env.YURI_COST_ADMISSION_ENFORCE = prev;
    P.cleanup();
  }
});
