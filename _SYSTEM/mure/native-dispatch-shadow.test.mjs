import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
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
  const receipt = { status: 'accepted', childSessionKey: `agent:${action.args.agentId}:subagent:${suffix}`, runId: `run-${suffix}`, resolvedModel: action.args.model };
  return { receipt, reduced: recordNativeSpawnAccepted(state, action, receipt) };
}

function completion(action, receipt, suffix, extra = {}) {
  return { id: `event-${suffix}`, taskId, entryId: action.entryId, purpose: action.purpose, childSessionKey: receipt.childSessionKey, runId: receipt.runId, ok: true, output: 'producer output', ...extra };
}

test('mirrors one R2 producer and independent verifier into an accepted ledger ticket', () => {
  let native = createNativeDispatchState(plan());
  let scheduled = reduceNativeDispatch(native);
  let shadow = observeNativeAction(createNativeDispatchShadow(ticket, 'shadow-test'), scheduled.action);

  const producerAdmission = admit(scheduled.state, scheduled.action, 'producer');
  shadow = observeNativeAdmission(shadow, producerAdmission.receipt);
  const producerEvent = completion(scheduled.action, producerAdmission.receipt, 'producer');
  const afterProducer = reduceNativeDispatch(producerAdmission.reduced.state, producerEvent);
  shadow = observeNativeCompletion(shadow, producerEvent, afterProducer, { TERM_COUNT: '1' });
  assert.equal(shadowSnapshot(shadow).awaiting.purpose, 'verifier');

  const verifierAdmission = admit(afterProducer.state, afterProducer.action, 'verifier');
  shadow = observeNativeAdmission(shadow, verifierAdmission.receipt);
  const verifierEvent = completion(afterProducer.action, verifierAdmission.receipt, 'verifier', { verdict: 'pass', output: '{"verdict":"pass"}' });
  const afterVerifier = reduceNativeDispatch(verifierAdmission.reduced.state, verifierEvent);
  shadow = observeNativeCompletion(shadow, verifierEvent, afterVerifier, { checked: ['TERM_COUNT'] });

  assert.deepEqual(shadowSnapshot(shadow), {
    schemaVersion: 'mure-native-dispatch-shadow-v1', ticketId: taskId, ledgerStatus: 'accepted', awaiting: null,
    admissionCount: 2, observationCount: 6,
  });
});

test('fails closed on model, session, event identity, and reducer-status mismatches', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  const actionShadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const admission = admit(scheduled.state, scheduled.action, 'producer');
  assert.throws(() => observeNativeAdmission(actionShadow, { ...admission.receipt, resolvedModel: 'openai/gpt-5.6-terra' }), /resolvedModel/);
  const admittedShadow = observeNativeAdmission(actionShadow, admission.receipt);
  const event = completion(scheduled.action, admission.receipt, 'producer');
  const reduced = reduceNativeDispatch(admission.reduced.state, event);
  assert.throws(() => observeNativeCompletion(admittedShadow, { ...event, childSessionKey: 'agent:wrong:subagent:x' }, reduced, { TERM_COUNT: '1' }), /childSessionKey/);
  assert.throws(() => observeNativeCompletion(admittedShadow, event, { ...reduced, state: { ...reduced.state, tasks: {} } }, { TERM_COUNT: '1' }), /reducer result/);
});

test('marks a terminal native timeout as LOST instead of silently retrying', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  let shadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const admission = admit(scheduled.state, scheduled.action, 'timeout');
  shadow = observeNativeAdmission(shadow, admission.receipt);
  const event = { ...completion(scheduled.action, admission.receipt, 'timeout'), ok: false, failureKind: 'timeout', error: 'deadline' };
  const reduced = reduceNativeDispatch(admission.reduced.state, event);
  shadow = observeNativeCompletion(shadow, event, reduced);
  assert.equal(shadowSnapshot(shadow).ledgerStatus, 'lost');
});

test('classifies returned semantic and verifier execution failures as rejected, not LOST', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  let semanticShadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const semanticAdmission = admit(scheduled.state, scheduled.action, 'semantic');
  semanticShadow = observeNativeAdmission(semanticShadow, semanticAdmission.receipt);
  const semanticEvent = { ...completion(scheduled.action, semanticAdmission.receipt, 'semantic'), ok: false, failureKind: 'semantic', error: 'invalid output' };
  const semanticReduced = reduceNativeDispatch(semanticAdmission.reduced.state, semanticEvent);
  semanticShadow = observeNativeCompletion(semanticShadow, semanticEvent, semanticReduced);
  assert.equal(semanticReduced.action.code, 'SEMANTIC_FAILURE');
  assert.equal(shadowSnapshot(semanticShadow).ledgerStatus, 'rejected');

  const producerAdmission = admit(scheduled.state, scheduled.action, 'producer-for-verifier-failure');
  let verifierShadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  verifierShadow = observeNativeAdmission(verifierShadow, producerAdmission.receipt);
  const producerEvent = completion(scheduled.action, producerAdmission.receipt, 'producer-for-verifier-failure');
  const afterProducer = reduceNativeDispatch(producerAdmission.reduced.state, producerEvent);
  verifierShadow = observeNativeCompletion(verifierShadow, producerEvent, afterProducer, { TERM_COUNT: '1' });
  const verifierAdmission = admit(afterProducer.state, afterProducer.action, 'verifier-failure');
  verifierShadow = observeNativeAdmission(verifierShadow, verifierAdmission.receipt);
  const verifierEvent = { ...completion(afterProducer.action, verifierAdmission.receipt, 'verifier-failure'), ok: false, failureKind: 'auth', error: 'denied' };
  const verifierReduced = reduceNativeDispatch(verifierAdmission.reduced.state, verifierEvent);
  verifierShadow = observeNativeCompletion(verifierShadow, verifierEvent, verifierReduced);
  assert.equal(verifierReduced.action.code, 'VERIFIER_EXECUTION_FAILURE');
  assert.equal(shadowSnapshot(verifierShadow).ledgerStatus, 'rejected');
});

test('fails closed on purpose and run identity mismatches', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  let shadow = observeNativeAction(createNativeDispatchShadow(ticket), scheduled.action);
  const admission = admit(scheduled.state, scheduled.action, 'identity');
  shadow = observeNativeAdmission(shadow, admission.receipt);
  const event = completion(scheduled.action, admission.receipt, 'identity');
  const reduced = reduceNativeDispatch(admission.reduced.state, event);
  assert.throws(() => observeNativeCompletion(shadow, { ...event, purpose: 'evidence' }, reduced), /event.purpose/);
  assert.throws(() => observeNativeCompletion(shadow, { ...event, runId: 'wrong-run' }, reduced), /event.runId/);
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
