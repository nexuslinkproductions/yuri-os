// Tests for nano-barrier.mjs (Move-1b INC-2). All substrate deps injected via opts.deps → hermetic, no fs.
// converge is the REAL Move-1 gate (arm via opts.armed) so the safety↔quality interaction is genuine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canFinalize, subtreeContested, hasEotClaim, contestedFromView, EOT_PREDICATE } from './nano-barrier.mjs';

const ROOT = 'run1';
// a deps factory: sensible empty defaults, override per test.
function deps({ live = [], drain = { ok: true }, view = { claims: {}, contested: {} }, orphans = [], converge } = {}) {
  const calls = [];
  const d = {
    inflightDescendants: () => { calls.push('inflight'); return live; },
    drainOnce: () => { calls.push('drain'); return drain; },
    readView: () => { calls.push('readView'); return view; },
    manifestOrphans: () => { calls.push('orphans'); return orphans; },
  };
  if (converge) d.converge = (...a) => { calls.push('converge'); return converge(...a); };
  return { d, calls };
}
const base = (extra = {}) => ({ rootRunId: ROOT, myPath: 'r', ledger: { leafTasks: [] }, poolOutputs: {}, ...extra });

test('INV-1: live descendant blocks, converge NOT called', () => {
  const { d, calls } = deps({ live: [{ leaseId: 'nanotree:run1:r.0' }], converge: () => ({ converged: true }) });
  const r = canFinalize(base({ opts: { armed: true, deps: d } }));
  assert.equal(r.converged, false);
  assert.equal(r.reason, 'descendants-in-flight');
  assert.equal(r.blocking[0].layer, 'barrier-inflight');
  assert.ok(!calls.includes('converge'));   // short-circuit before quality
  assert.ok(!calls.includes('drain'));      // and before drain (children still writing)
});

test('INV-2: drain runs BEFORE readView (ordering)', () => {
  const { d, calls } = deps({ converge: () => ({ converged: true, reason: 'ok' }) });
  canFinalize(base({ opts: { armed: true, deps: d } }));
  assert.ok(calls.indexOf('drain') >= 0 && calls.indexOf('readView') > calls.indexOf('drain'));
});

test('INV-2: contended/failed drain blocks (never finalize on a stale view)', () => {
  const { d } = deps({ drain: { ok: false, reason: 'drainer-held', heldBy: 'other' }, converge: () => ({ converged: true }) });
  const r = canFinalize(base({ opts: { armed: true, deps: d } }));
  assert.equal(r.converged, false);
  assert.match(r.reason, /drain-not-fresh/);
  assert.equal(r.blocking[0].layer, 'barrier-drain');
});

test('orphan (no EOT claim) → barrier-critical EVEN when converge is DISARMED', () => {
  const { d } = deps({ orphans: ['r.0'], view: { claims: {}, contested: {} } });
  const r = canFinalize(base({ opts: { armed: false, deps: d } })); // disarmed → converge would passthrough
  assert.equal(r.converged, false);
  assert.equal(r.reason, 'barrier-critical');
  assert.ok(r.barrierSafety.some((s) => s.layer === 'barrier-orphan' && s.path === 'r.0' && s.severity === 'CRITICAL'));
});

test('spawned-but-gone child WITH an EOT claim is NOT an orphan → clears', () => {
  const view = { claims: { [`${ROOT}/r.0 ${EOT_PREDICATE}`]: { object: 'complete' } }, contested: {} };
  const { d } = deps({ orphans: ['r.0'], view });
  const r = canFinalize(base({ opts: { armed: false, deps: d } }));
  assert.equal(r.converged, true);           // disarmed passthrough, no orphan
});

test('contested IN my subtree blocks; OUT of subtree does not', () => {
  const inSub = { claims: {}, contested: { 'fact x': { competing: [{ lane: `${ROOT}/r.0.1`, object: 'A' }, { lane: `${ROOT}/r.2`, object: 'B' }] } } };
  const r1 = canFinalize(base({ myPath: 'r.0', opts: { armed: false, deps: deps({ view: inSub }).d } }));
  assert.equal(r1.converged, false);
  assert.equal(r1.reason, 'barrier-critical');
  assert.ok(r1.barrierSafety.some((s) => s.layer === 'barrier-contested'));
  // same contested claim, but node r.2 is not an ancestor of r.0.1 → from r.5's view nothing in its subtree
  const r2 = canFinalize(base({ myPath: 'r.5', opts: { armed: false, deps: deps({ view: inSub }).d } }));
  assert.equal(r2.converged, true);          // not in r.5's subtree → clears
});

test('clean subtree, DISARMED → passthrough converged:true', () => {
  const { d } = deps({});
  const r = canFinalize(base({ opts: { armed: false, deps: d } }));
  assert.equal(r.converged, true);
  assert.equal(r.reason, 'gate-disarmed');
});

test('clean subtree, ARMED + unmet obligation floor → quality gate blocks', () => {
  const { d } = deps({});
  const r = canFinalize(base({
    ledger: { leafTasks: [{ id: 'leafA' }] }, poolOutputs: {}, // leafA missing
    opts: { armed: true, deps: d },
  }));
  assert.equal(r.converged, false);
  assert.equal(r.reason, 'blocked');
  assert.ok(r.blocking.some((b) => b.layer === 'obligation-floor' && b.leafId === 'leafA'));
});

test('subtreeContested unit: root catches all of its tree', () => {
  const list = contestedFromView({ contested: { 'k1': { competing: [{ lane: `${ROOT}/r.0` }] }, 'k2': { competing: [{ lane: 'other-root/r.0' }] } } });
  assert.deepEqual(subtreeContested(ROOT, 'r', list).map((c) => c.key), ['k1']); // k2 is a different tree
  assert.equal(hasEotClaim({ claims: { [`${ROOT}/r.0 eot`]: {} } }, ROOT, 'r.0'), true);
  assert.equal(hasEotClaim({ claims: {} }, ROOT, 'r.0'), false);
});
