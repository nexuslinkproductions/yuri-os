import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNativeDispatchShadow,
  observeNativeAction,
  observeNativeAdmission,
  observeNativeCompletion,
  shadowSnapshot,
} from './native-dispatch-shadow.mjs';
import { getTicket } from './delegation-ledger.mjs';

const baseTicket = {
  id: 'shadow-int-1',
  from: 'control',
  to: 'worker',
  actors: { issuer: 'sol-parent', assignee: 'worker-a' },
  scope: ['_SYSTEM/mure/'],
  expectedOutcome: 'bounded evidence',
  constraints: ['read-only'],
  evidenceRequirements: ['TERM_COUNT', 'FILE_COUNT'],
  escalationRule: 'return to control on ambiguity',
  writeSet: [],
};

function makeAction(taskId, entryId, purpose, agentId, model) {
  return {
    type: 'sessions_spawn',
    taskId,
    entryId,
    purpose,
    args: { agentId, model },
  };
}

function makeAdmission(entryId, resolvedModel, agentId, runId) {
  return {
    status: 'accepted',
    resolvedModel,
    childSessionKey: `agent:${agentId}:subagent:${runId}`,
    runId,
  };
}

function makeCompletion(taskId, entryId, purpose, childSessionKey, runId, overrides = {}) {
  return {
    taskId,
    entryId,
    purpose,
    childSessionKey,
    runId,
    ok: true,
    ...overrides,
  };
}

function makeReduction(taskId, action, taskStatus = 'running') {
  return {
    state: { tasks: { [taskId]: { status: taskStatus } } },
    action,
  };
}

// --- full happy path through shadow observer ---

test('integration: producer → verifier → accepted', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  let s = observeNativeAction(shadow, producerAction);
  assert.equal(s.awaiting.purpose, 'producer');

  s = observeNativeAdmission(s, makeAdmission('p1', 'minimax-portal/MiniMax-M3', 'mure-scout', 'run-a'));
  assert.equal(s.admissions.length, 1);

  const verifierAction = makeAction('shadow-int-1', 'v1', 'verifier', 'mure-calibrator', 'anthropic/claude-sonnet-5');
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p1', 'producer', `agent:mure-scout:subagent:run-a`, 'run-a',
      { output: '{"summary":"ok"}' }),
    makeReduction('shadow-int-1', verifierAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  assert.equal(s.awaiting.purpose, 'verifier');

  s = observeNativeAdmission(s, makeAdmission('v1', 'anthropic/claude-sonnet-5', 'mure-calibrator', 'run-v'));
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'v1', 'verifier', `agent:mure-calibrator:subagent:run-v`, 'run-v',
      { verdict: 'pass' }),
    makeReduction('shadow-int-1', { type: 'done' }, 'passed'),
  );
  assert.equal(getTicket(s.ledger, 'shadow-int-1').ledgerStatus, 'accepted');
  assert.equal(s.awaiting, null);

  const snap = shadowSnapshot(s);
  assert.equal(snap.admissionCount, 2);
});

// --- availability fallback path ---

test('integration: producer failure → availability fallback → retry', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('p1', 'minimax-portal/MiniMax-M3', 'mure-scout', 'run-a'));

  const fallbackAction = makeAction('shadow-int-1', 'p2', 'availability-fallback', 'deepseek-flash', 'deepseek/deepseek-v4-flash');
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p1', 'producer', `agent:mure-scout:subagent:run-a`, 'run-a',
      { ok: false, failureKind: 'provider-error', error: 'quota exceeded' }),
    makeReduction('shadow-int-1', fallbackAction),
  );
  assert.equal(s.awaiting.purpose, 'availability-fallback');
  assert.equal(s.awaiting.entryId, 'p2');

  s = observeNativeAdmission(s, makeAdmission('p2', 'deepseek/deepseek-v4-flash', 'deepseek-flash', 'run-b'));
  const verifierAction = makeAction('shadow-int-1', 'v1', 'verifier', 'mure-calibrator', 'anthropic/claude-sonnet-5');
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p2', 'availability-fallback', `agent:deepseek-flash:subagent:run-b`, 'run-b',
      { output: '{"summary":"ok"}' }),
    makeReduction('shadow-int-1', verifierAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  assert.equal(s.awaiting.purpose, 'verifier');
});

// --- LOST worker path ---

test('integration: timeout produces LOST status, not rejected', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('p1', 'minimax-portal/MiniMax-M3', 'mure-scout', 'run-a'));

  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p1', 'producer', `agent:mure-scout:subagent:run-a`, 'run-a',
      { ok: false, failureKind: 'timeout', error: 'worker timed out' }),
    makeReduction('shadow-int-1', { type: 'done' }, 'fail-loud'),
  );
  assert.equal(getTicket(s.ledger, 'shadow-int-1').ledgerStatus, 'lost');
  assert.ok(getTicket(s.ledger, 'shadow-int-1').lostAt);
});

// --- verifier rejection path ---

test('integration: verifier reject does not accept producer output', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('p1', 'minimax-portal/MiniMax-M3', 'mure-scout', 'run-a'));

  const verifierAction = makeAction('shadow-int-1', 'v1', 'verifier', 'mure-calibrator', 'anthropic/claude-sonnet-5');
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p1', 'producer', `agent:mure-scout:subagent:run-a`, 'run-a',
      { output: '{"summary":"ok"}' }),
    makeReduction('shadow-int-1', verifierAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  s = observeNativeAdmission(s, makeAdmission('v1', 'anthropic/claude-sonnet-5', 'mure-calibrator', 'run-v'));
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'v1', 'verifier', `agent:mure-calibrator:subagent:run-v`, 'run-v',
      { verdict: 'reject' }),
    makeReduction('shadow-int-1', { type: 'done' }, 'rejected'),
  );
  assert.equal(getTicket(s.ledger, 'shadow-int-1').ledgerStatus, 'rejected');
  assert.ok(getTicket(s.ledger, 'shadow-int-1').rejectedAt);
});

// --- quality escalation path ---

test('integration: quality-escalation after producer pass → new producer dispatch', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('p1', 'minimax-portal/MiniMax-M3', 'mure-scout', 'run-a'));

  const escalationAction = makeAction('shadow-int-1', 'q1', 'quality-escalation', 'mure-calibrator', 'anthropic/claude-sonnet-5');
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p1', 'producer', `agent:mure-scout:subagent:run-a`, 'run-a',
      { output: '{"summary":"ok"}' }),
    makeReduction('shadow-int-1', escalationAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  assert.equal(s.awaiting.purpose, 'quality-escalation');
  assert.equal(s.awaiting.entryId, 'q1');
});

// --- evidence lane before producer ---

test('integration: evidence lane runs before producer dispatch', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const evidenceAction = makeAction('shadow-int-1', 'e1', 'evidence', 'deepseek-flash', 'deepseek/deepseek-v4-flash');
  let s = observeNativeAction(shadow, evidenceAction);
  assert.equal(s.awaiting.purpose, 'evidence');

  s = observeNativeAdmission(s, makeAdmission('e1', 'deepseek/deepseek-v4-flash', 'deepseek-flash', 'run-e'));
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'e1', 'evidence', `agent:deepseek-flash:subagent:run-e`, 'run-e',
      { output: '{"upstream":[]}' }),
    makeReduction('shadow-int-1', producerAction),
  );
  assert.equal(s.awaiting.purpose, 'producer');
});

// --- mismatch failures ---

test('integration: mismatched child session key fails closed', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('p1', 'minimax-portal/MiniMax-M3', 'mure-scout', 'run-a'));

  assert.throws(() => observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p1', 'producer', 'agent:different-agent:subagent:wrong', 'run-a'),
    makeReduction('shadow-int-1', { type: 'done' }),
  ), /childSessionKey does not match/);
});

// --- exhausted escalation fails loud ---

test('integration: all-failed producer with no fallback fails loud as rejected', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('shadow-int-1', 'p1', 'producer', 'mure-scout', 'minimax-portal/MiniMax-M3');
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('p1', 'minimax-portal/MiniMax-M3', 'mure-scout', 'run-a'));
  s = observeNativeCompletion(s,
    makeCompletion('shadow-int-1', 'p1', 'producer', `agent:mure-scout:subagent:run-a`, 'run-a',
      { ok: false, failureKind: 'provider-error', error: 'all retries exhausted' }),
    makeReduction('shadow-int-1', { type: 'done' }, 'fail-loud'),
  );
  assert.equal(getTicket(s.ledger, 'shadow-int-1').ledgerStatus, 'rejected');
});

// --- shadow snapshot is immutable ---

test('integration: shadow snapshot is a frozen summary', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const snap = shadowSnapshot(shadow);
  assert.ok(Object.isFrozen(snap));
  assert.equal(snap.ticketId, 'shadow-int-1');
  assert.equal(snap.admissionCount, 0);
  assert.equal(snap.governanceWarnings, 0);
});
