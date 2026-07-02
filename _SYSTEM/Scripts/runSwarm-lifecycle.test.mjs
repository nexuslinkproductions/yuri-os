// Tests for runSwarm.mjs Phase-2/Phase-8 additions: status.json lifecycle, budgetCap threading into the
// damping force-stop, and the per-round wall-clock watchdog (straggler ingestion + no double-dispatch).
// Hermetic: the GLM fleet runner + the aggregator are injected via opts.deps — NO live model calls, no network.
// Arm-state is injected via opts.armed (no process.env mutation). Run:
//   node --test _SYSTEM/Scripts/runSwarm-lifecycle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSwarm } from './runSwarm.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const jobDir = (runId) => path.join(REPO_ROOT, '.claude', 'jobs', runId);
const statusFile = (runId) => path.join(jobDir(runId), 'status.json');
const readStatus = (runId) => JSON.parse(fs.readFileSync(statusFile(runId), 'utf8'));
const cleanup = (runId) => { try { fs.rmSync(jobDir(runId), { recursive: true, force: true }); } catch { /* */ } };

// A conforming pool entry (X-pass label + non-empty text) — mirrors swarm-convergence.test.mjs's `pass()`.
const pass = (n) => ({ label: `08CW_TASK_${n}_X_PASS_COMMITTED`, text: 'real grounded output with content' });

// A fleet stub that resolves immediately and records the leaf labels it was asked to dispatch.
function immediateFleet(dispatchLog) {
  return async (tasks) => {
    dispatchLog.push(tasks.map((t) => t.label));
    return { results: tasks.map((t) => ({ label: t.label, ok: true })) };
  };
}

// ── 1. status.json lifecycle — happy path ────────────────────────────────────────────────────────────
test('status.json: happy path writes running → done, with startedAt/totalLeaves/endedAt', async () => {
  const runId = `swarm-test-happy-${Date.now().toString(36)}`;
  const dispatchLog = [];
  const leaves = [{ id: 'L1', prompt: 'do L1' }, { id: 'L2', prompt: 'do L2' }];
  // Disarmed → converge passthrough converged:true → single round → done.
  const pool = { L1: pass(1), L2: pass(2) };
  try {
    const r = await runSwarm({ leaves }, {
      armed: false, quiet: true, runId,
      deps: { glmFleet: immediateFleet(dispatchLog), aggregatePoolOutputs: () => ({ pool, skipped: [] }) },
    });
    assert.equal(r.runId, runId);
    const s = readStatus(runId);
    assert.equal(s.status, 'done', 'terminal status is done');
    assert.equal(s.totalLeaves, 2);
    assert.ok(typeof s.startedAt === 'string' && s.startedAt.length > 0, 'startedAt stamped');
    assert.ok(typeof s.endedAt === 'string' && s.endedAt.length > 0, 'endedAt stamped');
    assert.ok(typeof s.updatedAt === 'string', 'updatedAt stamped');
    assert.equal(s.converged, true, 'disarmed passthrough converges');
  } finally { cleanup(runId); }
});

// ── 2. status.json lifecycle — failure path (terminal state written on throw) ─────────────────────────
test('status.json: a throw inside the loop still writes a terminal failed status', async () => {
  const runId = `swarm-test-throw-${Date.now().toString(36)}`;
  const leaves = [{ id: 'L1', prompt: 'do L1' }];
  const boomFleet = async () => { throw new Error('fleet exploded'); };
  try {
    await assert.rejects(
      runSwarm({ leaves }, { armed: false, quiet: true, runId, deps: { glmFleet: boomFleet, aggregatePoolOutputs: () => ({ pool: {}, skipped: [] }) } }),
      /fleet exploded/,
      'the original throw propagates',
    );
    const s = readStatus(runId);
    assert.equal(s.status, 'failed', 'terminal status is failed on throw');
    assert.ok(typeof s.endedAt === 'string' && s.endedAt.length > 0, 'endedAt stamped even on throw');
    assert.match(String(s.error || ''), /fleet exploded/, 'error captured in status');
  } finally { cleanup(runId); }
});

// ── 3. budgetCap reaches the damping force-stop ───────────────────────────────────────────────────────
test('budgetCap: an armed, perpetually-blocked run force-stops on budget-exhausted', async () => {
  const runId = `swarm-test-budget-${Date.now().toString(36)}`;
  const leaves = [{ id: 'L1', prompt: 'do L1' }, { id: 'L2', prompt: 'do L2' }];
  // Aggregator ALWAYS returns only L1 conforming → L2 is perpetually missing → armed converge stays blocked and
  // re-dispatches every round, so budgetUsed climbs. budgetCap:2 → the damping budget force-stop must fire.
  const pool = { L1: pass(1) }; // L2 never lands
  try {
    const r = await runSwarm({ leaves }, {
      armed: true, quiet: true, runId, rounds: 10, budgetCap: 2,
      // no adversarial noise: a runner that finds nothing
      adversarialRunner: async () => ({ rejections: [] }),
      deps: { glmFleet: immediateFleet([]), aggregatePoolOutputs: () => ({ pool, skipped: [] }) },
    });
    assert.equal(r.converged, false, 'never converges (L2 always missing)');
    assert.equal(r.finalizeOk, false, 'finalize blocked on a forced stop');
    assert.match(r.verdict.reason, /forced-stop:budget-exhausted/, 'budget force-stop branch reached');
    assert.equal(r.verdict.forced, true, 'forced flag set');
    // Sanity: with budgetCap Infinity (default) the same setup runs to maxRounds WITHOUT a budget force-stop.
    const runId2 = `${runId}-nocap`;
    const r2 = await runSwarm({ leaves }, {
      armed: true, quiet: true, runId: runId2, rounds: 3,
      adversarialRunner: async () => ({ rejections: [] }),
      deps: { glmFleet: immediateFleet([]), aggregatePoolOutputs: () => ({ pool, skipped: [] }) },
    });
    assert.doesNotMatch(String(r2.verdict.reason || ''), /budget-exhausted/, 'no budget force-stop without a cap');
    cleanup(runId2);
  } finally { cleanup(runId); }
});

// ── 4. watchdog: slow round proceeds, straggler ingested next scan, no double-dispatch ────────────────
test('watchdog: a lane resolving after the window → round proceeds, straggler ingested, not re-dispatched', async () => {
  const runId = `swarm-test-watchdog-${Date.now().toString(36)}`;
  const leaves = [{ id: 'L1', prompt: 'do L1' }, { id: 'L2', prompt: 'do L2' }];
  const dispatchLog = []; // records the leaf-label sets dispatched per fleet call

  // Fleet stub: on round 0 it NEVER resolves within the window (a hung lane) — the watchdog must cut it over. It
  // records what it was asked to dispatch so we can prove no double-dispatch.
  const slowFleet = (tasks) => {
    dispatchLog.push(tasks.map((t) => t.label));
    return new Promise((resolve) => {
      // Resolve well past the watchdog (200ms >> 40ms window); if the run awaited this it would visibly stall,
      // proving the watchdog cut it over. Short enough not to leave a long dangling timer after the test returns.
      const t = setTimeout(() => resolve({ results: tasks.map((tk) => ({ label: tk.label, ok: true })) }), 200);
      if (typeof t.unref === 'function') t.unref(); // don't keep the process alive on this detached timer
    });
  };

  // Straggler arrival modelled deterministically by aggregator CALL COUNT (independent of wall-clock races):
  //   scan #1 (round 0 pre-dispatch): empty — the results dir is empty at run start.
  //   scan #2 (round 0 post-watchdog aggregate): L1 landed, L2 is the straggler (still hung).
  //   scan #3+ (round 1 pre-dispatch onward): the L2 straggler packet has now landed → ingested BEFORE re-dispatch.
  let scan = 0;
  const aggregate = () => {
    scan += 1;
    if (scan <= 1) return { pool: {}, skipped: [] };
    if (scan === 2) return { pool: { L1: pass(1) }, skipped: [] };
    return { pool: { L1: pass(1), L2: pass(2) }, skipped: [] };
  };

  try {
    const r = await runSwarm({ leaves }, {
      armed: true, quiet: true, runId, rounds: 3, roundWallClockMs: 40, // watchdog trips well before the 5s fleet
      adversarialRunner: async () => ({ rejections: [] }),
      deps: { glmFleet: slowFleet, aggregatePoolOutputs: aggregate },
    });

    // Round 0 dispatched BOTH leaves; the watchdog fired before the (hung) fleet settled.
    assert.deepEqual(dispatchLog[0].slice().sort(), ['L1', 'L2'], 'round 0 dispatched both leaves');

    // The L2 straggler was ingested by a later re-scan → the final pool has BOTH leaves and the run converges.
    assert.ok(r.poolOutputs.L1, 'L1 in final pool');
    assert.ok(r.poolOutputs.L2, 'L2 straggler ingested into final pool');
    assert.equal(r.converged, true, 'straggler ingestion satisfies the obligation floor → converged');

    // NO double-dispatch: L2 must never have been dispatched a SECOND time after its straggler packet landed.
    const l2Dispatches = dispatchLog.filter((set) => set.includes('L2')).length;
    assert.equal(l2Dispatches, 1, 'L2 dispatched exactly once — no straggler double-dispatch');

    // Terminal status is done (a transient running-stragglers state was written during round 0).
    const s = readStatus(runId);
    assert.equal(s.status, 'done', 'terminal status done after straggler convergence');
  } finally { cleanup(runId); }
});

// ── 5. watchdog OFF by default window: a fast fleet never trips the watchdog (unchanged behavior) ──────
test('watchdog: a fast fleet resolves before the window → normal path, single dispatch', async () => {
  const runId = `swarm-test-fast-${Date.now().toString(36)}`;
  const leaves = [{ id: 'L1', prompt: 'do L1' }];
  const dispatchLog = [];
  const pool = { L1: pass(1) };
  try {
    const r = await runSwarm({ leaves }, {
      armed: true, quiet: true, runId, rounds: 3, roundWallClockMs: 5000,
      adversarialRunner: async () => ({ rejections: [] }),
      deps: { glmFleet: immediateFleet(dispatchLog), aggregatePoolOutputs: () => ({ pool, skipped: [] }) },
    });
    assert.equal(r.converged, true);
    assert.equal(dispatchLog.length, 1, 'exactly one round dispatched (converged first round)');
    const s = readStatus(runId);
    assert.equal(s.status, 'done');
    // running-stragglers should NOT appear as the terminal state for a fast run.
    assert.notEqual(s.status, 'running-stragglers');
  } finally { cleanup(runId); }
});
