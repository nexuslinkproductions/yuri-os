// Phase 2 unit tests — buildTraceRecord user/regime/event fields + allow-list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTraceRecord, validateRecord, ALLOWED_STRING_PATHS } from './yuri-energy-trace.mjs';

test('ALLOWED_STRING_PATHS includes user, regime, event', () => {
  assert.ok(ALLOWED_STRING_PATHS.has('user'));
  assert.ok(ALLOWED_STRING_PATHS.has('regime'));
  assert.ok(ALLOWED_STRING_PATHS.has('event'));
});

test('buildTraceRecord emits user, defaults regime=observability, event=Dispatch Recorded', () => {
  const r = buildTraceRecord({ lane: 'shintai', runId: 'r1', user: 'mike', stateBefore: {}, stateAfter: {} });
  assert.equal(r.user, 'mike');
  assert.equal(r.regime, 'observability');
  assert.equal(r.event, 'Dispatch Recorded');
});

test('buildTraceRecord with empty user coerces to "" (gate-safe anonymous)', () => {
  const r = buildTraceRecord({ lane: 'x', runId: 'r', stateBefore: {}, stateAfter: {} });
  assert.equal(r.user, '');
  assert.doesNotThrow(() => validateRecord(r));
});

test('action regime derives event from the gate decision', () => {
  const accepted = buildTraceRecord({
    lane: 'x', runId: 'a', regime: 'action', stateBefore: {}, stateAfter: {},
    gateProposalResult: { result: { accept: true } },
  });
  assert.equal(accepted.regime, 'action');
  assert.equal(accepted.event, 'Proposal Accepted');

  const rejected = buildTraceRecord({
    lane: 'x', runId: 'r', regime: 'action', stateBefore: {}, stateAfter: {},
    gateProposalResult: { result: { accept: false } },
  });
  assert.equal(rejected.event, 'Proposal Rejected');
});

test('an unknown regime value falls back to observability', () => {
  const r = buildTraceRecord({ lane: 'x', runId: 'r', regime: 'garbage', stateBefore: {}, stateAfter: {} });
  assert.equal(r.regime, 'observability');
  assert.equal(r.event, 'Dispatch Recorded');
});

test('a fully populated record (user+regime+event) passes the Privacy Gate', () => {
  const r = buildTraceRecord({
    lane: 'shintai', runId: 'r', user: 'mike', regime: 'action', stateBefore: {}, stateAfter: {},
    gateProposalResult: { result: { accept: true } },
  });
  assert.doesNotThrow(() => validateRecord(r));
});
