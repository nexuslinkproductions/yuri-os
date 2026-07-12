import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  compileOmpSpawn,
  createNativeDispatchState,
  recordNativeSpawnAccepted,
  reduceNativeDispatch,
} from './sol-moe-native-dispatch.mjs';
import {
  createNativeDispatchShadow,
  observeNativeAction,
  observeNativeAdmission,
  observeNativeCompletion,
  shadowSnapshot,
} from './native-dispatch-shadow.mjs';

const taskId = 'shadow-task';
const ticket = {
  id: taskId,
  from: 'control',
  to: 'worker',
  actors: { issuer: 'sol-parent', assignee: 'mure-synthesist' },
  scope: ['_SYSTEM/mure/'],
  expectedOutcome: 'bounded implementation with deterministic evidence',
  constraints: ['shadow observation only'],
  evidenceRequirements: ['TERM_COUNT'],
  escalationRule: 'fail loud on lifecycle mismatch',
  writeSet: [],
};

function entry(purpose, model, agentId) {
  return { id: `${taskId}:${purpose}`, taskId, purpose, role: 'engineer', model, agentId, thinking: 'high', prompt: 'bounded task' };
}

function plan() {
  return {
    routes: [{ taskId, held: false, route: { classification: { riskClass: 'R2', requiresVerifier: true }, verifier: { required: true } } }],
    queues: {
      producers: [entry('producer', 'minimax-portal/MiniMax-M3', 'mure-synthesist')],
      verifiers: [entry('verifier', 'anthropic/claude-sonnet-5', 'mure-calibrator')],
      availabilityFallbacks: [], qualityEscalations: [], calibrationAlternatives: [], evidence: [],
    },
    blocked: [], providerCalibration: null,
  };
}

function admit(state, action, suffix) {
  const receipt = { jobId: `job-${suffix}`, agent: action.args.agent };
  return { receipt, reduced: recordNativeSpawnAccepted(state, action, receipt) };
}

function completion(action, receipt, suffix, extra = {}) {
  return {
    id: `event-${suffix}`,
    taskId,
    entryId: action.entryId,
    purpose: action.purpose,
    jobId: receipt.jobId,
    ok: true,
    output: 'producer output',
    modelChange: { model: 'minimax-portal/MiniMax-M3' },
    ...extra,
  };
}

test('mirrors one R2 producer and independent verifier into an accepted ledger ticket', () => {
  let native = createNativeDispatchState(plan());
  let scheduled = reduceNativeDispatch(native);
  let shadow = observeNativeAction(createNativeDispatchShadow(ticket, 'shadow-test'), scheduled.action);

  // Verify dispatch args match compileOmpSpawn for the producer
  const producerEntry = entry('producer', 'minimax-portal/MiniMax-M3', 'mure-synthesist');
  const producerCompilerContext = { attempt: 1, taskId, upstream: { evidence: [], producer: null, priorVerifier: null } };
  assert.deepStrictEqual(scheduled.action.args, compileOmpSpawn(producerEntry, producerCompilerContext));

  const producerAdmission = admit(scheduled.state, scheduled.action, 'producer');
  shadow = observeNativeAdmission(shadow, producerAdmission.receipt);
  const producerEvent = completion(scheduled.action, producerAdmission.receipt, 'producer');
  const afterProducer = reduceNativeDispatch(producerAdmission.reduced.state, producerEvent);
  shadow = observeNativeCompletion(shadow, producerEvent, afterProducer, { TERM_COUNT: '1' });
  assert.equal(shadowSnapshot(shadow).awaiting.purpose, 'verifier');

  // Verify dispatch args match compileOmpSpawn for the verifier
  const verifierEntry = entry('verifier', 'anthropic/claude-sonnet-5', 'mure-calibrator');
  const verifierCompilerContext = {
    attempt: afterProducer.action.attempt,
    taskId,
    upstream: {
      evidence: afterProducer.state.tasks[taskId].evidence,
      producer: afterProducer.state.tasks[taskId].producer,
      priorVerifier: afterProducer.state.tasks[taskId].priorVerifier,
    },
  };
  assert.deepStrictEqual(afterProducer.action.args, compileOmpSpawn(verifierEntry, verifierCompilerContext));

  const verifierAdmission = admit(afterProducer.state, afterProducer.action, 'verifier');
  shadow = observeNativeAdmission(shadow, verifierAdmission.receipt);
  const verifierEvent = completion(afterProducer.action, verifierAdmission.receipt, 'verifier', {
    verdict: 'pass',
    output: '{"verdict":"pass"}',
    modelChange: { model: 'anthropic/claude-sonnet-5' },
  });
  const afterVerifier = reduceNativeDispatch(verifierAdmission.reduced.state, verifierEvent);
  shadow = observeNativeCompletion(shadow, verifierEvent, afterVerifier, { checked: ['TERM_COUNT'] });

  assert.deepEqual(shadowSnapshot(shadow), {
    schemaVersion: 'mure-native-dispatch-shadow-v2', ticketId: taskId, ledgerStatus: 'accepted', awaiting: null,
    admissionCount: 2, observationCount: 8, governanceWarnings: 2,
  });
});

test('fails closed on model, session, event identity, and reducer-status mismatches', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  const actionShadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const admission = admit(scheduled.state, scheduled.action, 'producer');

  // Agent mismatch on OMP admission receipt
  assert.throws(() => observeNativeAdmission(actionShadow, { ...admission.receipt, agent: 'wrong-agent' }), /receipt.agent/);

  const admittedShadow = observeNativeAdmission(actionShadow, admission.receipt);
  const event = completion(scheduled.action, admission.receipt, 'producer');

  // Model mismatch: shadow rejects the ticket via reducer MODEL_MISMATCH
  {
    const wrongModelEvent = { ...event, modelChange: { model: 'wrong/model' } };
    const wrongReduced = reduceNativeDispatch(admission.reduced.state, wrongModelEvent);
    assert.equal(wrongReduced.action.code, 'MODEL_MISMATCH');
    const wrongShadow = observeNativeCompletion(admittedShadow, wrongModelEvent, wrongReduced, { TERM_COUNT: '1' });
    assert.equal(shadowSnapshot(wrongShadow).ledgerStatus, 'rejected');
  }

  const reduced = reduceNativeDispatch(admission.reduced.state, event);

  // jobId mismatch on completion
  assert.throws(() => observeNativeCompletion(admittedShadow, { ...event, jobId: 'wrong-job' }, reduced, { TERM_COUNT: '1' }), /event.jobId/);

  // Reducer status mismatch
  assert.throws(() => observeNativeCompletion(admittedShadow, event, { ...reduced, state: { ...reduced.state, tasks: {} } }, { TERM_COUNT: '1' }), /reducer result/);
});

test('marks a terminal timeout as LOST', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  let shadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const admission = admit(scheduled.state, scheduled.action, 'timeout');
  shadow = observeNativeAdmission(shadow, admission.receipt);
  const event = { ...completion(scheduled.action, admission.receipt, 'timeout'), ok: false, failureKind: 'timeout', error: 'deadline' };
  const reduced = reduceNativeDispatch(admission.reduced.state, event);
  shadow = observeNativeCompletion(shadow, event, reduced);
  assert.equal(shadowSnapshot(shadow).ledgerStatus, 'lost');
});

test('classifies semantic and verifier execution failures as rejected', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));

  // Semantic failure on producer
  let semanticShadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const semanticAdmission = admit(scheduled.state, scheduled.action, 'semantic');
  semanticShadow = observeNativeAdmission(semanticShadow, semanticAdmission.receipt);
  const semanticEvent = { ...completion(scheduled.action, semanticAdmission.receipt, 'semantic'), ok: false, failureKind: 'semantic', error: 'invalid output' };
  const semanticReduced = reduceNativeDispatch(semanticAdmission.reduced.state, semanticEvent);
  semanticShadow = observeNativeCompletion(semanticShadow, semanticEvent, semanticReduced);
  assert.equal(semanticReduced.action.code, 'SEMANTIC_FAILURE');
  assert.equal(shadowSnapshot(semanticShadow).ledgerStatus, 'rejected');

  // Verifier execution failure
  const producerAdmission = admit(scheduled.state, scheduled.action, 'producer-for-verifier-failure');
  let verifierShadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  verifierShadow = observeNativeAdmission(verifierShadow, producerAdmission.receipt);
  const producerEvent = completion(scheduled.action, producerAdmission.receipt, 'producer-for-verifier-failure');
  const afterProducer = reduceNativeDispatch(producerAdmission.reduced.state, producerEvent);
  verifierShadow = observeNativeCompletion(verifierShadow, producerEvent, afterProducer, { TERM_COUNT: '1' });
  const verifierAdmission = admit(afterProducer.state, afterProducer.action, 'verifier-failure');
  verifierShadow = observeNativeAdmission(verifierShadow, verifierAdmission.receipt);
  const verifierEvent = {
    ...completion(afterProducer.action, verifierAdmission.receipt, 'verifier-failure'),
    ok: false,
    failureKind: 'auth',
    error: 'denied',
  };
  const verifierReduced = reduceNativeDispatch(verifierAdmission.reduced.state, verifierEvent);
  verifierShadow = observeNativeCompletion(verifierShadow, verifierEvent, verifierReduced);
  assert.equal(verifierReduced.action.code, 'VERIFIER_EXECUTION_FAILURE');
  assert.equal(shadowSnapshot(verifierShadow).ledgerStatus, 'rejected');
});

test('fails closed on purpose and job identity mismatches', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  let shadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const admission = admit(scheduled.state, scheduled.action, 'identity');
  shadow = observeNativeAdmission(shadow, admission.receipt);
  const event = completion(scheduled.action, admission.receipt, 'identity');
  const reduced = reduceNativeDispatch(admission.reduced.state, event);
  assert.throws(() => observeNativeCompletion(shadow, { ...event, purpose: 'evidence' }, reduced), /event.purpose/);
  assert.throws(() => observeNativeCompletion(shadow, { ...event, jobId: 'wrong-job' }, reduced), /event.jobId/);
});

test('rejects a producer pass that bypasses independent verification', () => {
  const unsafePlan = plan();
  unsafePlan.routes[0].route.classification = { riskClass: 'R1', requiresVerifier: false };
  unsafePlan.routes[0].route.verifier = null;
  unsafePlan.queues.verifiers = [];
  const scheduled = reduceNativeDispatch(createNativeDispatchState(unsafePlan));
  let shadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const admission = admit(scheduled.state, scheduled.action, 'unverified');
  shadow = observeNativeAdmission(shadow, admission.receipt);
  const event = completion(scheduled.action, admission.receipt, 'unverified');
  const reduced = reduceNativeDispatch(admission.reduced.state, event);
  assert.throws(() => observeNativeCompletion(shadow, event, reduced, { TERM_COUNT: '1' }), /independent verifier/);
});

test('remains outside live planner, router, reducer, and runner imports', async () => {
  const files = await Promise.all(['sol-moe-company.mjs', 'sol-moe-router.mjs', 'sol-moe-native-dispatch.mjs', 'sol-moe-run.mjs']
    .map((name) => readFile(new URL(`./${name}`, import.meta.url), 'utf8')));
  for (const source of files) assert.equal(source.includes('native-dispatch-shadow'), false);
});
