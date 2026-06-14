// Tests for swarm-convergence.mjs — the 3-layer nano-swarm convergence gate + damping.
// Hermetic: arm-state is injected via opts.armed (no process.env mutation → no cross-test races).
// Run: node --test _SYSTEM/Scripts/swarm-convergence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObligationLedger, checkObligationFloor, checkCriticalSignalBlock,
  runAdversarialPass, checkDamping, dedupeWork, converge, hashFinding,
} from './swarm-convergence.mjs';

const ARMED = { armed: true };
const leaf = (id) => ({ id, role: id, expectedOutputType: 'any' });
const pass = (n) => ({ label: `08CW_TASK_${n}_X_PASS_COMMITTED`, text: 'real grounded output with content' });
const decomp = { leaves: [leaf('L1'), leaf('L2'), leaf('L3')] };
const ledger = buildObligationLedger(decomp);

test('buildObligationLedger: from leaves AND from nodes+edges', () => {
  assert.equal(ledger.leafCount, 3);
  const dag = buildObligationLedger({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }] });
  assert.deepEqual(dag.leafTasks.map((l) => l.id).sort(), ['b', 'c']); // a has outgoing edges → not a leaf
});

test('(a) blocks on open CRITICAL signal (all leaves conforming)', () => {
  const pool = { L1: pass(1), L2: pass(2), L3: pass(3) };
  const r = converge({ ledger, poolOutputs: pool, signals: [{ id: 's1', severity: 'CRITICAL', resolved: false }], ...{ opts: ARMED } });
  assert.equal(r.converged, false);
  assert.ok(r.blocking.some((b) => b.layer === 'critical-signal' && b.signalId === 's1'));
});

test('(a2) a RESOLVED critical signal does NOT block', () => {
  const pool = { L1: pass(1), L2: pass(2), L3: pass(3) };
  const r = converge({ ledger, poolOutputs: pool, signals: [{ id: 's1', severity: 'CRITICAL', resolved: true }], opts: ARMED });
  assert.equal(r.converged, true);
});

test('(b) blocks on missing leaf AND non-conforming (F) leaf', () => {
  const pool = { L1: pass(1), L2: { label: '08CW_TASK_2_F_FAIL_COMMITTED', text: 'failed' } }; // L2=F, L3 missing
  const r = converge({ ledger, poolOutputs: pool, signals: [], opts: ARMED });
  assert.equal(r.converged, false);
  const ids = r.blocking.filter((b) => b.layer === 'obligation-floor').map((b) => b.leafId);
  assert.ok(ids.includes('L3'), 'L3 missing flagged');
  assert.ok(ids.includes('L2'), 'L2 non-conforming (F passType) flagged');
});

test('(b2) empty-text output is non-conforming even with a valid label', () => {
  const floor = checkObligationFloor(ledger, { L1: pass(1), L2: pass(2), L3: { label: '08CW_TASK_3_X_PASS_COMMITTED', text: '   ' } });
  assert.deepEqual(floor.nonConforming, ['L3']);
});

test('(c) adversarial reject re-injects ONLY actionable gaps to nextRoundWork', async () => {
  const pool = { L1: pass(1), L2: pass(2), L3: pass(3) };
  const adv = await runAdversarialPass({
    poolOutputs: pool,
    runner: async () => ({ rejections: [
      { leafId: 'L2', gap: 'missing integration test', actionable: true },
      { leafId: 'L1', gap: 'could be tidier', actionable: false }, // dropped
    ] }),
  });
  assert.equal(adv.ok, false);
  assert.equal(adv.rejections.length, 1);
  const r = converge({ ledger, poolOutputs: pool, signals: [], adversarialResult: adv, round: 0, opts: ARMED });
  assert.equal(r.converged, false);
  assert.ok(r.nextRoundWork.some((w) => w.leafId === 'L2' && w.action === 're-extract'));
});

test('(c2) adversarial runner THROW is fail-soft (ok:true, never blocks)', async () => {
  const adv = await runAdversarialPass({ runner: async () => { throw new Error('lane down'); } });
  assert.equal(adv.ok, true);
  assert.equal(adv.failSoft, true);
});

test('(d) damping FORCES stop on marginal-value cutoff when blocked', () => {
  const pool = { L1: pass(1), L2: pass(2) }; // L3 missing → blocked
  const damping = { roundYields: [0, 0], seenFindingHashes: [], actionCooldown: {} };
  const r = converge({ ledger, poolOutputs: pool, signals: [], damping, round: 5, opts: { armed: true, marginalWindow: 2, marginalThreshold: 1 } });
  assert.equal(r.converged, true);
  assert.equal(r.forced, true);
  assert.match(r.reason, /marginal-value-cutoff/);
});

test('(d2) damping does NOT force-stop while still progressing', () => {
  const pool = { L1: pass(1), L2: pass(2) }; // L3 missing → blocked
  const damping = { roundYields: [5, 3], seenFindingHashes: [], actionCooldown: {} };
  const r = converge({ ledger, poolOutputs: pool, signals: [], damping, round: 2, opts: { armed: true, marginalThreshold: 1 } });
  assert.equal(r.converged, false); // still blocked, keep looping
});

test('(e) converges when all leaves conform, no critical, adversarial clean', async () => {
  const pool = { L1: pass(1), L2: pass(2), L3: pass(3) };
  const adv = await runAdversarialPass({ poolOutputs: pool, runner: async () => ({ rejections: [] }) });
  const r = converge({ ledger, poolOutputs: pool, signals: [{ id: 's', severity: 'LOW', resolved: false }], adversarialResult: adv, damping: { roundYields: [5] }, opts: ARMED });
  assert.equal(r.converged, true);
  assert.equal(r.reason, 'all-layers-satisfied');
});

test('(f) DISARMED → passthrough converged:true even with a CRITICAL signal', () => {
  const r = converge({ ledger, poolOutputs: {}, signals: [{ id: 's', severity: 'CRITICAL', resolved: false }], opts: { armed: false } });
  assert.equal(r.converged, true);
  assert.equal(r.reason, 'gate-disarmed');
});

test('(g) dedupeWork drops already-seen findings and cooled actions', () => {
  const gap = { action: 're-extract', leafId: 'L2', gap: 'missing test' };
  const s0 = { seenFindingHashes: [], actionCooldown: {} };
  const r1 = dedupeWork([gap], s0, 0, { cooldownRounds: 2 });
  assert.equal(r1.fresh.length, 1);
  // same gap next round → seen-hash drops it
  const r2 = dedupeWork([gap], r1.updatedState, 1, { cooldownRounds: 2 });
  assert.equal(r2.fresh.length, 0);
  assert.ok(r1.updatedState.seenFindingHashes.includes(hashFinding(gap.gap)));
});
