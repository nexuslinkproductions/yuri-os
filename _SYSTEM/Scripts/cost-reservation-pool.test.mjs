#!/usr/bin/env node
//
// cost-reservation-pool.test.mjs — DB-free unit tests for the cost admission gate.
//
// Deliberately does NOT import better-sqlite3 (it stubs getRollups via injection / override), so it runs
// green in a worktree that lacks the backend node_modules. Covers: disarmed advisory pass, estimate math,
// armed reject (over budget), armed admit + reservation written (no-partial), release, R3 rollback, and
// the FAIL-CONSERVATIVE actuals path (truncation at 100 rows + missing/unreadable DB → never actuals=0).
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  estimateTaskCost,
  admit,
  release,
  reacquireWithRollback,
  actualsToDate,
  sumActiveReservations,
  readArmState,
  resolvePaths,
} from './cost-reservation-pool.mjs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-reservation-test-'));
const reserveDir = path.join(tmpRoot, 'reservations');
const armFlag = path.join(tmpRoot, 'cost-admission.armed');

// Clean env so the test is hermetic regardless of the launching shell.
for (const k of ['YURI_COST_ADMISSION_ENFORCE', 'YURI_COST_ADMISSION_CAP_USD', 'YURI_COST_ADMISSION_OVEREST', 'YURI_COST_ADMISSION_WINDOW', 'YURI_COST_ADMISSION_EXEMPT_FREE', 'YURI_COST_RESERVE_DIR', 'YURI_COST_ADMISSION_FLAG']) {
  delete process.env[k];
}

const WINDOW = '2026-06-13';
const base = { reserveDir, armFlag, windowLabel: WINDOW };

function makeRollupStub(rows) {
  return { getRollups: () => rows };
}

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; process.stderr.write(`FAIL ${name}: ${e.message}\n`); }
}

try {
  // ── 1. ESTIMATE: priced through the SAME token-ledger formula (currency parity) ──
  check('estimate prices a paid lane correctly', () => {
    const est = estimateTaskCost({ model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1 });
    // gpt-5.5: input 5/M, output 20/M -> 1000/1e6*5 + 500/1e6*20 = 0.005 + 0.010 = 0.015
    assert.equal(est.costUsd, 0.015, `costUsd ${est.costUsd}`);
    assert.equal(est.free, false);
  });

  check('estimate flags a free lane (mimo flat-plan / local) as free $0', () => {
    const est = estimateTaskCost({ model: 'mimo-v2.5-pro[1m]', inputTokens: 5000, outputTokensPerStep: 5000, steps: 4 });
    assert.equal(est.costUsd, 0, `free lane should cost 0, got ${est.costUsd}`);
    assert.equal(est.free, true);
  });

  check('over-estimate multiplier scales the estimate', () => {
    const est = estimateTaskCost({ model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1, overEstimateMultiplier: 2 });
    assert.equal(est.costUsd, 0.03, `2x of 0.015 should be 0.03, got ${est.costUsd}`);
  });

  check('multi-step estimate sums per-step cost (cost-to-COMPLETION, not one call)', () => {
    const one = estimateTaskCost({ model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1 });
    const three = estimateTaskCost({ model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 3 });
    assert.equal(three.costUsd, one.costUsd * 3, `3 steps should be 3x, got ${three.costUsd}`);
  });

  // ── 2. DISARMED: admit ALWAYS advisory-passes, writes NO reservation ──
  check('DISARMED admit is advisory pass, no reservation file', () => {
    const r = admit({ model: 'gpt-5.5', inputTokens: 100000, outputTokensPerStep: 100000, steps: 10 }, base);
    assert.equal(r.admitted, true);
    assert.equal(r.enforced, false);
    assert.equal(r.reservationId, null);
    assert.equal(r.decision, 'advisory_pass');
    const { reserveDir: rd } = resolvePaths(base);
    const files = fs.existsSync(rd) ? fs.readdirSync(rd).filter((f) => f.endsWith('.json')) : [];
    assert.equal(files.length, 0, 'disarmed must write no reservation');
  });

  // ── 3. ARMED but NO CAP: still inert (fail-open: a budget gate with no budget admits) ──
  check('armed env+flag but NO cap stays advisory (no budget value set)', () => {
    fs.mkdirSync(path.dirname(armFlag), { recursive: true });
    fs.writeFileSync(armFlag, new Date().toISOString()); // flag with NO cap body
    process.env.YURI_COST_ADMISSION_ENFORCE = '1';
    const arm = readArmState(base);
    assert.equal(arm.envArmed, true);
    assert.equal(arm.flagArmed, true);
    assert.equal(arm.enforced, false, 'no cap -> not enforced');
    assert.equal(arm.capUsd, null);
    const r = admit({ model: 'gpt-5.5', inputTokens: 100, outputTokensPerStep: 100, steps: 1 }, base);
    assert.equal(r.enforced, false);
    assert.equal(r.decision, 'advisory_pass');
  });

  // ── 4. FULLY ARMED (env + flag + cap): reject over budget ──
  check('FULLY ARMED rejects an estimate that exceeds the cap', () => {
    fs.writeFileSync(armFlag, JSON.stringify({ capUsd: 0.01, window: WINDOW })); // tiny cap
    process.env.YURI_COST_ADMISSION_ENFORCE = '1';
    const arm = readArmState(base);
    assert.equal(arm.enforced, true);
    assert.equal(arm.capUsd, 0.01);
    // estimate 0.015 > cap 0.01 with zero actuals -> reject. Inject reliable empty actuals.
    const r = admit(
      { model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1 },
      { ...base, actuals: { reliable: true, spentUsd: 0, spentEffectiveTokens: 0, windowLabel: WINDOW } },
    );
    assert.equal(r.admitted, false);
    assert.equal(r.enforced, true);
    assert.equal(r.decision, 'reject_over_budget');
    assert.equal(r.reservationId, null);
  });

  // ── 5. FULLY ARMED: admit under budget, write a reservation, then it counts against the next admit ──
  let reservationId = null;
  check('FULLY ARMED admits under budget and WRITES a reservation (all-or-nothing)', () => {
    fs.writeFileSync(armFlag, JSON.stringify({ capUsd: 1.0, window: WINDOW }));
    const r = admit(
      { lane: 'gpt', model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1 },
      { ...base, actuals: { reliable: true, spentUsd: 0, spentEffectiveTokens: 0, windowLabel: WINDOW } },
    );
    assert.equal(r.admitted, true);
    assert.equal(r.enforced, true);
    assert.equal(r.decision, 'admit_reserved');
    assert.ok(r.reservationId, 'admit must return a reservationId');
    reservationId = r.reservationId;
    const active = sumActiveReservations(base);
    assert.equal(active.count, 1, 'one active reservation');
    assert.equal(active.reservedUsd, 0.015, `reserved 0.015, got ${active.reservedUsd}`);
  });

  check('active reservation reduces headroom for the NEXT admit (no double-spend)', () => {
    // cap 1.0, already reserved 0.015. input 200000 * 5/M = 1.0 ; + reserved 0.015 = 1.015 > 1.0 -> reject.
    const over = admit(
      { model: 'gpt-5.5', inputTokens: 200000, outputTokensPerStep: 0, reasoningTokensPerStep: 0, steps: 1 },
      { ...base, actuals: { reliable: true, spentUsd: 0, spentEffectiveTokens: 0, windowLabel: WINDOW } },
    );
    assert.equal(over.admitted, false, 'estimate that overflows remaining headroom must reject');
    assert.equal(over.decision, 'reject_over_budget');
  });

  // ── 6. RELEASE frees the reservation ──
  check('release frees the held reservation', () => {
    const before = sumActiveReservations(base).count;
    const rel = release(reservationId, base);
    assert.equal(rel.released, true);
    const after = sumActiveReservations(base).count;
    assert.equal(after, before - 1, 'release should drop the active count by 1');
    // idempotent: releasing again is a clean not_found, not a throw
    const again = release(reservationId, base);
    assert.equal(again.released, false);
    assert.equal(again.reason, 'not_found');
  });

  // ── 7. FAIL-CONSERVATIVE actuals: truncation at the 100-row LIMIT ──
  check('actualsToDate FAILS CONSERVATIVE when the rollup is truncated at the 100-row limit', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ day: WINDOW, cost_usd: 0.0001, effective_tokens: 1 }));
    const res = actualsToDate({ ...base, getRollups: () => rows });
    assert.equal(res.reliable, false, 'truncated rollup must be unreliable');
    assert.equal(res.spentUsd, Number.POSITIVE_INFINITY, 'truncated actuals must be +Infinity, NEVER 0');
    assert.equal(res.reason, 'rollup_truncated_at_limit');
  });

  check('actualsToDate FAILS CONSERVATIVE when no ledger is bound (missing DB engine)', () => {
    const res = actualsToDate({ ...base }); // no getRollups, no stub
    assert.equal(res.reliable, false);
    assert.equal(res.spentUsd, Number.POSITIVE_INFINITY, 'unbound ledger must be +Infinity, NEVER 0');
    assert.equal(res.reason, 'rollup_not_bound_use_async');
  });

  check('actualsToDate FAILS CONSERVATIVE on a thrown DB error (better_sqlite3_unavailable)', () => {
    const res = actualsToDate({ ...base, getRollups: () => { throw Object.assign(new Error('no engine'), { code: 'BETTER_SQLITE3_UNAVAILABLE' }); } });
    assert.equal(res.reliable, false);
    assert.equal(res.spentUsd, Number.POSITIVE_INFINITY);
    assert.equal(res.reason, 'better_sqlite3_unavailable');
  });

  check('actualsToDate reads real spend when the rollup is UNDER the limit (reliable)', () => {
    const rows = [
      { day: WINDOW, cost_usd: 0.20, effective_tokens: 1000 },
      { day: WINDOW, cost_usd: 0.05, effective_tokens: 500 },
      { day: '2026-06-12', cost_usd: 9.99, effective_tokens: 99999 }, // other window — must NOT count
    ];
    const res = actualsToDate({ ...base, getRollups: () => rows });
    assert.equal(res.reliable, true);
    assert.equal(res.spentUsd, 0.25, `should sum only the window day, got ${res.spentUsd}`);
    assert.equal(res.matchedRows, 2);
  });

  // ── 8. ARMED admit with UNRELIABLE actuals → reject conservative (never silently admit) ──
  check('ARMED admit with unreliable (Infinity) actuals rejects conservatively', () => {
    fs.writeFileSync(armFlag, JSON.stringify({ capUsd: 100.0, window: WINDOW })); // huge cap
    const r = admit(
      { model: 'gpt-5.5', inputTokens: 10, outputTokensPerStep: 10, steps: 1 }, // trivially cheap
      { ...base, actuals: { reliable: false, spentUsd: Number.POSITIVE_INFINITY, reason: 'rollup_truncated_at_limit', windowLabel: WINDOW } },
    );
    assert.equal(r.admitted, false, 'even a cheap task must reject when actuals are unprovable');
    assert.equal(r.decision, 'reject_conservative_unreliable_actuals');
  });

  // ── 9. FREE-LANE EXEMPTION (owner-toggleable) ──
  check('ARMED admit exempts a free ($0) lane by default', () => {
    fs.writeFileSync(armFlag, JSON.stringify({ capUsd: 0.000001, window: WINDOW })); // basically no budget
    const r = admit(
      { lane: 'mimo', model: 'mimo-v2.5-pro[1m]', inputTokens: 100000, outputTokensPerStep: 100000, steps: 5 },
      { ...base, actuals: { reliable: true, spentUsd: 0, windowLabel: WINDOW } },
    );
    assert.equal(r.admitted, true, 'free lane should be exempt from the USD cap by default');
    assert.equal(r.decision, 'free_lane_exempt');
  });

  // ── 10. R3 reacquire-with-rollback (forward-safe primitive) ──
  check('R3 reacquireWithRollback re-reserves the next step when it fits', () => {
    fs.writeFileSync(armFlag, JSON.stringify({ capUsd: 1.0, window: WINDOW }));
    const first = admit(
      { lane: 'gpt', model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1 },
      { ...base, actuals: { reliable: true, spentUsd: 0, windowLabel: WINDOW } },
    );
    assert.equal(first.admitted, true);
    const res = reacquireWithRollback(
      first.reservationId,
      { lane: 'gpt', model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1 },
      { ...base, actuals: { reliable: true, spentUsd: 0, windowLabel: WINDOW } },
    );
    assert.equal(res.reacquired, true, 'next step that fits should reacquire');
    assert.ok(res.reservation && res.reservation.id, 'reacquire writes a fresh reservation');
    // exactly one active reservation (old released, new acquired)
    assert.equal(sumActiveReservations(base).count, 1);
    release(res.reservation.id, base);
  });

  check('R3 reacquireWithRollback ROLLS BACK when the next step no longer fits', () => {
    fs.writeFileSync(armFlag, JSON.stringify({ capUsd: 0.02, window: WINDOW })); // only fits ~one 0.015 hold
    const first = admit(
      { lane: 'gpt', model: 'gpt-5.5', inputTokens: 1000, outputTokensPerStep: 500, reasoningTokensPerStep: 0, steps: 1 },
      { ...base, actuals: { reliable: true, spentUsd: 0, windowLabel: WINDOW } },
    );
    assert.equal(first.admitted, true, `setup: first admit under cap, got ${JSON.stringify(first.decision)}`);
    // Next step is HUGE -> cannot fit -> rollback to the original hold.
    const res = reacquireWithRollback(
      first.reservationId,
      { lane: 'gpt', model: 'gpt-5.5', inputTokens: 500000, outputTokensPerStep: 0, steps: 1 }, // way over 0.02
      { ...base, actuals: { reliable: true, spentUsd: 0, windowLabel: WINDOW } },
    );
    assert.equal(res.reacquired, false, 'oversized next step must NOT reacquire');
    assert.equal(res.rolledBack, true, 'must roll back to keep the caller funded');
    assert.ok(res.rollbackReservationId, 'rollback writes a restored reservation');
    // exactly one active reservation again (the rolled-back original), caller is not left empty-handed
    assert.equal(sumActiveReservations(base).count, 1);
    release(res.rollbackReservationId, base);
  });

  process.stdout.write(`cost-reservation-pool: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
  process.stdout.write('cost-reservation-pool: pass\n');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  for (const k of ['YURI_COST_ADMISSION_ENFORCE', 'YURI_COST_ADMISSION_CAP_USD']) delete process.env[k];
}
