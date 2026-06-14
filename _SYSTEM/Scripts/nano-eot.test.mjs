// Tests for nano-eot.mjs (Move-1b INC-3). Deps injected → hermetic; spies assert the load-bearing ordering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeNano, EOT_PREDICATE } from './nano-eot.mjs';

const ROOT = 'run1';
const PATH = 'r.0';
const NANO_ID = `${ROOT}/${PATH}`;

// spy deps: appendClaim ok unless its subject/predicate is in `failOn`; records call order in `order`.
function spy({ failOn = [] } = {}) {
  const order = [];
  const appended = [];
  const completes = [];
  const released = [];
  const d = {
    appendClaim: (lane, session, claim) => {
      order.push(`append:${claim.predicate}`);
      appended.push({ lane, session, claim });
      const key = `${claim.subject} ${claim.predicate}`;
      if (failOn.includes(key) || failOn.includes(claim.predicate)) return { ok: false, reason: 'event-too-large' };
      return { ok: true, eventId: `evt.${claim.predicate}` };
    },
    recordComplete: (root, p) => { order.push('complete'); completes.push([root, p]); },
    releaseLease: (id, owner) => { order.push('release'); released.push([id, owner]); return true; },
  };
  return { d, order, appended, completes, released };
}

test('full success: work claims + EOT marker + manifest complete, lease released LAST', () => {
  const s = spy();
  const r = closeNano({
    rootRunId: ROOT, myPath: PATH, resultLabel: '08RX_X_PASS',
    claims: [{ subject: 'fact1', predicate: 'is', object: 'a' }, { subject: 'fact2', predicate: 'is', object: 'b' }],
    opts: { deps: s.d },
  });
  assert.equal(r.ok, true);
  assert.equal(r.claimsWritten, 2);
  assert.equal(r.marker, true);
  assert.equal(r.completed, true);
  assert.equal(r.released, true);
  // ORDERING: every append before complete before release
  assert.deepEqual(s.order, ['append:is', 'append:is', `append:${EOT_PREDICATE}`, 'complete', 'release']);
  assert.ok(s.order.lastIndexOf('release') === s.order.length - 1, 'release is LAST');
});

test('EOT marker is keyed to the nanoId + carries the label', () => {
  const s = spy();
  closeNano({ rootRunId: ROOT, myPath: PATH, resultLabel: 'LBL_X_PASS', claims: [], opts: { deps: s.d } });
  const marker = s.appended.find((a) => a.claim.predicate === EOT_PREDICATE);
  assert.equal(marker.claim.subject, NANO_ID);
  assert.equal(marker.lane, NANO_ID);          // shard-per-nano (lane = nanoId)
  assert.equal(marker.session, ROOT);
  assert.equal(marker.claim.object.label, 'LBL_X_PASS');
});

test('partial (a work claim fails): NO marker, NO complete, but lease STILL released', () => {
  const s = spy({ failOn: ['fact2 is'] });
  const r = closeNano({
    rootRunId: ROOT, myPath: PATH,
    claims: [{ subject: 'fact1', predicate: 'is', object: 'a' }, { subject: 'fact2', predicate: 'is', object: 'b' }],
    opts: { deps: s.d },
  });
  assert.equal(r.ok, false);
  assert.equal(r.marker, false);               // no clean-close proof → parent flags orphan
  assert.equal(r.completed, false);
  assert.equal(r.released, true);              // never block the parent forever
  assert.ok(!s.order.includes('complete'));
  assert.ok(!s.order.includes(`append:${EOT_PREDICATE}`)); // marker never attempted on partial
  assert.equal(s.order[s.order.length - 1], 'release');
  assert.equal(r.failures.length, 1);
});

test('malformed claim (no subject/predicate) → failure, no marker, lease released', () => {
  const s = spy();
  const r = closeNano({ rootRunId: ROOT, myPath: PATH, claims: [{ object: 'orphaned' }], opts: { deps: s.d } });
  assert.equal(r.ok, false);
  assert.equal(r.marker, false);
  assert.equal(r.released, true);
  assert.equal(r.failures[0].reason, 'missing subject/predicate');
});

test('release targets the correct in-flight lease id + nano owner', () => {
  const s = spy();
  closeNano({ rootRunId: ROOT, myPath: PATH, claims: [], opts: { deps: s.d } });
  assert.deepEqual(s.released[0], [`nanotree:${ROOT}:${PATH}`, NANO_ID]);
});

test('guards bad input', () => {
  assert.equal(closeNano({ myPath: 'r.0' }).ok, false);
  assert.equal(closeNano({ rootRunId: 'x' }).ok, false);
});
