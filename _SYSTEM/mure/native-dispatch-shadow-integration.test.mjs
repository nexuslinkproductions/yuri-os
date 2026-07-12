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

const TASK_ID = 'shadow-int-1';

const baseTicket = {
  id: TASK_ID,
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

// WORKER_BINDINGS-consistent model → agent pairs (sol-moe-native-dispatch.mjs), so fixtures
// mirror what the live reducer actually dispatches.
const PRODUCER_MODEL = 'minimax-portal/MiniMax-M3';
const PRODUCER_AGENT = 'mure-synthesist';
const VERIFIER_MODEL = 'anthropic/claude-sonnet-5';
const VERIFIER_AGENT = 'mure-calibrator';
const FALLBACK_MODEL = 'deepseek/deepseek-v4-flash';
const FALLBACK_AGENT = 'deepseek-flash';

// Compiler-like OMP TaskTool spawn action (mirrors compileOmpSpawn shape from sol-moe-native-dispatch.mjs).
// routeKind mirrors spawn()'s dispatch metadata (primary | availability-fallback | quality-escalation | verification);
// note purpose is NOT the same axis as routeKind — reduceFailure's fallback dispatch (line 292) retains the
// original awaiting.purpose (e.g. still 'producer') and only routeKind flips to 'availability-fallback'.
function makeAction(entryId, purpose, agentId, model, routeKind = 'primary', role = 'engineer') {
  return {
    type: 'omp-task-spawn',
    taskId: TASK_ID,
    purpose,
    routeKind,
    entryId,
    attempt: 1,
    args: {
      i: `MURE ${purpose} ${TASK_ID}`,
      context: `# Goal\nExecute one MURE ${purpose} task.`,
      agent: agentId,
      tasks: [{
        assignment: `MURE SOL MOE OMP DISPATCH\nTask ID: ${TASK_ID}\nPurpose: ${purpose}\nModel: ${model}`,
        id: `${TASK_ID}::${entryId}`,
        description: `${purpose}: ${TASK_ID} (${role})`,
        role,
      }],
    },
  };
}

// OMP TaskTool spawn admission receipt: {jobId, agent}
function makeAdmission(jobId, agentId) {
  return { jobId, agent: agentId };
}

// OMP push-completion event, keyed by jobId, carrying model_change transcript evidence
function makeCompletion(entryId, purpose, jobId, model, overrides = {}) {
  return {
    taskId: TASK_ID,
    entryId,
    purpose,
    jobId,
    ok: true,
    output: '{"summary":"ok"}',
    modelChange: { model },
    ...overrides,
  };
}

function makeReduction(action, taskStatus = 'running') {
  return {
    state: { tasks: { [TASK_ID]: { status: taskStatus } } },
    action,
  };
}

// --- full happy path through shadow observer ---

test('integration: producer → verifier → accepted', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  let s = observeNativeAction(shadow, producerAction);
  assert.equal(s.awaiting.purpose, 'producer');

  s = observeNativeAdmission(s, makeAdmission('job-a', PRODUCER_AGENT));
  assert.equal(s.admissions.length, 1);

  const verifierAction = makeAction('v1', 'verifier', VERIFIER_AGENT, VERIFIER_MODEL, 'verification');
  s = observeNativeCompletion(s,
    makeCompletion('p1', 'producer', 'job-a', PRODUCER_MODEL, { output: '{"summary":"ok"}' }),
    makeReduction(verifierAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  assert.equal(s.awaiting.purpose, 'verifier');

  s = observeNativeAdmission(s, makeAdmission('job-v', VERIFIER_AGENT));
  s = observeNativeCompletion(s,
    makeCompletion('v1', 'verifier', 'job-v', VERIFIER_MODEL, { verdict: 'pass', output: '{"verdict":"pass"}' }),
    makeReduction({ type: 'none', reason: 'task-passed' }, 'passed'),
  );
  assert.equal(getTicket(s.ledger, TASK_ID).ledgerStatus, 'accepted');
  assert.equal(s.awaiting, null);

  const snap = shadowSnapshot(s);
  assert.equal(snap.admissionCount, 2);
});

// --- availability fallback path ---
// Mirrors reduceFailure()'s fallback dispatch: purpose stays the ORIGINAL awaiting purpose
// ('producer'); only routeKind flips to 'availability-fallback' and a new entry/agent is bound.

test('integration: producer failure → availability fallback retains purpose, retries as producer', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('job-a', PRODUCER_AGENT));

  const fallbackAction = makeAction('p2', 'producer', FALLBACK_AGENT, FALLBACK_MODEL, 'availability-fallback');
  s = observeNativeCompletion(s,
    makeCompletion('p1', 'producer', 'job-a', PRODUCER_MODEL,
      { ok: false, failureKind: 'provider-error', error: 'quota exceeded' }),
    makeReduction(fallbackAction),
  );
  assert.equal(s.awaiting.purpose, 'producer');
  assert.equal(s.awaiting.entryId, 'p2');
  assert.equal(s.awaiting.agentId, FALLBACK_AGENT);

  s = observeNativeAdmission(s, makeAdmission('job-b', FALLBACK_AGENT));
  const verifierAction = makeAction('v1', 'verifier', VERIFIER_AGENT, VERIFIER_MODEL, 'verification');
  s = observeNativeCompletion(s,
    makeCompletion('p2', 'producer', 'job-b', FALLBACK_MODEL, { output: '{"summary":"ok"}' }),
    makeReduction(verifierAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  assert.equal(s.awaiting.purpose, 'verifier');
});

// --- LOST worker path ---

test('integration: timeout produces LOST status, not rejected', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('job-a', PRODUCER_AGENT));

  s = observeNativeCompletion(s,
    makeCompletion('p1', 'producer', 'job-a', PRODUCER_MODEL,
      { ok: false, failureKind: 'timeout', error: 'worker timed out' }),
    makeReduction({ type: 'fail-loud', taskId: TASK_ID, code: 'TIMEOUT_EXHAUSTED', message: 'worker timed out' }, 'fail-loud'),
  );
  assert.equal(getTicket(s.ledger, TASK_ID).ledgerStatus, 'lost');
  assert.ok(getTicket(s.ledger, TASK_ID).lostAt);
});

// --- verifier rejection path ---

test('integration: verifier reject does not accept producer output', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('job-a', PRODUCER_AGENT));

  const verifierAction = makeAction('v1', 'verifier', VERIFIER_AGENT, VERIFIER_MODEL, 'verification');
  s = observeNativeCompletion(s,
    makeCompletion('p1', 'producer', 'job-a', PRODUCER_MODEL, { output: '{"summary":"ok"}' }),
    makeReduction(verifierAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  s = observeNativeAdmission(s, makeAdmission('job-v', VERIFIER_AGENT));
  s = observeNativeCompletion(s,
    makeCompletion('v1', 'verifier', 'job-v', VERIFIER_MODEL, { verdict: 'reject' }),
    makeReduction({ type: 'none', reason: 'task-rejected' }, 'rejected'),
  );
  assert.equal(getTicket(s.ledger, TASK_ID).ledgerStatus, 'rejected');
  assert.ok(getTicket(s.ledger, TASK_ID).rejectedAt);
});

// --- quality escalation path ---
// Mirrors reduceVerifierSuccess()'s escalation dispatch: purpose AND routeKind both become
// 'quality-escalation' (unlike availability-fallback, which keeps the original purpose).

test('integration: quality-escalation after verifier reject → new producer dispatch', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('job-a', PRODUCER_AGENT));

  const escalationAction = makeAction('q1', 'quality-escalation', VERIFIER_AGENT, VERIFIER_MODEL, 'quality-escalation');
  s = observeNativeCompletion(s,
    makeCompletion('p1', 'producer', 'job-a', PRODUCER_MODEL, { output: '{"summary":"ok"}' }),
    makeReduction(escalationAction),
    { TERM_COUNT: '4', FILE_COUNT: '1' },
  );
  assert.equal(s.awaiting.purpose, 'quality-escalation');
  assert.equal(s.awaiting.entryId, 'q1');
});

// --- evidence lane before producer ---

test('integration: evidence lane runs before producer dispatch', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const evidenceAction = makeAction('e1', 'evidence', FALLBACK_AGENT, FALLBACK_MODEL);
  let s = observeNativeAction(shadow, evidenceAction);
  assert.equal(s.awaiting.purpose, 'evidence');

  s = observeNativeAdmission(s, makeAdmission('job-e', FALLBACK_AGENT));
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  s = observeNativeCompletion(s,
    makeCompletion('e1', 'evidence', 'job-e', FALLBACK_MODEL, { output: '{"upstream":[]}' }),
    makeReduction(producerAction),
  );
  assert.equal(s.awaiting.purpose, 'producer');
});

// --- mismatch failures ---

test('integration: mismatched OMP admission receipt agent fails closed', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  const s = observeNativeAction(shadow, producerAction);

  assert.throws(() => observeNativeAdmission(s, makeAdmission('job-a', 'wrong-agent')),
    /receipt.agent/);
});

// --- exhausted escalation fails loud ---

test('integration: all-failed producer with no fallback fails loud as rejected', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const producerAction = makeAction('p1', 'producer', PRODUCER_AGENT, PRODUCER_MODEL);
  let s = observeNativeAction(shadow, producerAction);
  s = observeNativeAdmission(s, makeAdmission('job-a', PRODUCER_AGENT));
  s = observeNativeCompletion(s,
    makeCompletion('p1', 'producer', 'job-a', PRODUCER_MODEL,
      { ok: false, failureKind: 'provider-error', error: 'all retries exhausted' }),
    makeReduction({ type: 'fail-loud', taskId: TASK_ID, code: 'ALL_ROUTES_EXHAUSTED', message: 'all retries exhausted' }, 'fail-loud'),
  );
  assert.equal(getTicket(s.ledger, TASK_ID).ledgerStatus, 'rejected');
});

// --- shadow snapshot is immutable ---

test('integration: shadow snapshot is a frozen summary', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const snap = shadowSnapshot(shadow);
  assert.ok(Object.isFrozen(snap));
  assert.equal(snap.ticketId, TASK_ID);
  assert.equal(snap.admissionCount, 0);
  assert.equal(snap.governanceWarnings, 0);
});
