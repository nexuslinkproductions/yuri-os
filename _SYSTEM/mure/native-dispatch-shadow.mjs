// @serves: shadow-only projection of native MURE dispatch into the delegation ledger
// @does: validates reducer actions, admissions, and terminal events before mirroring lifecycle facts
// @does-not: select routes, execute sessions_spawn, persist state, or alter live reducer behavior

import {
  accept,
  createLedger,
  getTicket,
  markLost,
  recordDispatch,
  recordProducerOutput,
  recordTicket,
  recordVerifierVerdict,
  reject,
} from './delegation-ledger.mjs';

export const NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION = 'mure-native-dispatch-shadow-v1';

export function createNativeDispatchShadow(ticket, shadowId = `native-shadow-${Date.now()}`) {
  const ledger = recordTicket(createLedger(shadowId), ticket);
  return freeze({
    schemaVersion: NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION,
    ticketId: ticket.id,
    taskId: ticket.id,
    ledger,
    awaiting: null,
    admissions: [],
    observations: [],
  });
}

export function observeNativeAction(shadow, action) {
  validateShadow(shadow);
  if (!action || action.type !== 'sessions_spawn') return appendObservation(shadow, 'ignored-action', action?.type || 'none');
  requireMatch(action.taskId, shadow.taskId, 'action.taskId');
  if (shadow.awaiting) throw new TypeError('shadow already awaits a native completion');
  const purpose = nonEmpty(action.purpose, 'action.purpose');
  if (!['producer', 'availability-fallback', 'quality-escalation', 'verifier', 'evidence'].includes(purpose)) {
    throw new TypeError(`unsupported native action purpose: ${purpose}`);
  }

  let ledger = shadow.ledger;
  const ticket = getTicket(ledger, shadow.ticketId);
  if (purpose !== 'verifier' && ticket.ledgerStatus === 'ticketed') {
    ledger = recordDispatch(ledger, shadow.ticketId, {
      producer: action.args?.agentId || '',
      note: `native ${purpose} dispatched`,
    });
  } else if (purpose === 'verifier' && ticket.ledgerStatus !== 'produced') {
    throw new TypeError(`verifier action requires produced ledger state, got: ${ticket.ledgerStatus}`);
  }

  return freeze({
    ...thawShadow(shadow),
    ledger,
    awaiting: freeze({
      entryId: nonEmpty(action.entryId, 'action.entryId'),
      purpose,
      agentId: nonEmpty(action.args?.agentId, 'action.args.agentId'),
      requestedModel: nonEmpty(action.args?.model, 'action.args.model'),
      admission: null,
    }),
    observations: [...shadow.observations, freeze({ type: 'action', purpose, entryId: action.entryId })],
  });
}

export function observeNativeAdmission(shadow, receipt) {
  validateShadow(shadow);
  if (!shadow.awaiting) throw new TypeError('native admission requires an awaiting action');
  if (!receipt || receipt.status !== 'accepted') throw new TypeError('native admission receipt must be accepted');
  const resolvedModel = nonEmpty(receipt.resolvedModel, 'receipt.resolvedModel');
  requireMatch(resolvedModel, shadow.awaiting.requestedModel, 'receipt.resolvedModel');
  const childSessionKey = nonEmpty(receipt.childSessionKey, 'receipt.childSessionKey');
  const runId = nonEmpty(receipt.runId, 'receipt.runId');
  if (!childSessionKey.includes(`agent:${shadow.awaiting.agentId}:subagent:`)) {
    throw new TypeError('receipt.childSessionKey does not match awaiting agentId');
  }
  const admission = freeze({ childSessionKey, runId, resolvedModel });
  return freeze({
    ...thawShadow(shadow),
    awaiting: freeze({ ...shadow.awaiting, admission }),
    admissions: [...shadow.admissions, admission],
    observations: [...shadow.observations, freeze({ type: 'admission', entryId: shadow.awaiting.entryId })],
  });
}

export function observeNativeCompletion(shadow, event, reduction, evidence = {}) {
  validateShadow(shadow);
  if (!shadow.awaiting?.admission) throw new TypeError('native completion requires a matching accepted admission');
  requireMatch(event?.taskId, shadow.taskId, 'event.taskId');
  requireMatch(event?.entryId, shadow.awaiting.entryId, 'event.entryId');
  requireMatch(event?.purpose, shadow.awaiting.purpose, 'event.purpose');
  requireMatch(event?.childSessionKey, shadow.awaiting.admission.childSessionKey, 'event.childSessionKey');
  if (event.runId !== undefined) requireMatch(event.runId, shadow.awaiting.admission.runId, 'event.runId');
  if (!reduction?.state?.tasks?.[shadow.taskId] || !reduction.action) {
    throw new TypeError('completion requires the matching native reducer result');
  }

  let ledger = shadow.ledger;
  const purpose = shadow.awaiting.purpose;
  if (event.ok !== true) {
    const nextAction = reduction.action;
    if (nextAction.type === 'sessions_spawn' && nextAction.purpose !== 'verifier') {
      return observeNativeAction(finishAwaiting(shadow, ledger, 'availability-fallback'), nextAction);
    }
    ledger = markLost(ledger, shadow.ticketId, String(event.error || event.failureKind || 'native child lost'));
    return finishAwaiting(shadow, ledger, 'lost');
  }

  if (purpose === 'verifier') {
    const verdict = strictVerdict(event);
    ledger = recordVerifierVerdict(ledger, shadow.ticketId, verdict === 'pass'
      ? { verdict: 'pass', checked: evidence.checked || ['native reducer verdict'] }
      : { verdict: 'fail', failureReason: evidence.failureReason || 'native verifier rejected producer' });
    if (verdict === 'pass') {
      if (reduction.state.tasks[shadow.taskId].status !== 'passed') {
        throw new TypeError('passing verifier event does not match reducer task status');
      }
      ledger = accept(ledger, shadow.ticketId, 'accepted by native reducer and independent verifier');
    }
    return finishAwaiting(shadow, ledger, verdict === 'pass' ? 'accepted' : 'rejected');
  }

  if (purpose === 'evidence') {
    const next = finishAwaiting(shadow, ledger, 'evidence-observed');
    if (reduction.action.type === 'sessions_spawn') return observeNativeAction(next, reduction.action);
    throw new TypeError('evidence completion did not yield the next native dispatch action');
  }

  ledger = recordProducerOutput(ledger, shadow.ticketId, {
    evidence,
    summary: String(event.output || ''),
  });
  const next = finishAwaiting(shadow, ledger, 'producer-completed');
  if (reduction.action.type === 'sessions_spawn' && reduction.action.purpose === 'verifier') {
    return observeNativeAction(next, reduction.action);
  }
  if (reduction.state.tasks[shadow.taskId].status === 'fail-loud') {
    return freeze({ ...thawShadow(next), ledger: reject(ledger, shadow.ticketId, reduction.action.message || 'native reducer failed loud') });
  }
  throw new TypeError('producer completion did not yield the required independent verifier action');
}

export function shadowSnapshot(shadow) {
  validateShadow(shadow);
  const ticket = getTicket(shadow.ledger, shadow.ticketId);
  return freeze({
    schemaVersion: NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION,
    ticketId: shadow.ticketId,
    ledgerStatus: ticket.ledgerStatus,
    awaiting: shadow.awaiting ? { entryId: shadow.awaiting.entryId, purpose: shadow.awaiting.purpose } : null,
    admissionCount: shadow.admissions.length,
    observationCount: shadow.observations.length,
  });
}

function strictVerdict(event) {
  if (event.verdict === 'pass' || event.verdict === 'reject') return event.verdict;
  if (typeof event.output === 'string') {
    try {
      const parsed = JSON.parse(event.output);
      if (parsed?.verdict === 'pass' || parsed?.verdict === 'reject') return parsed.verdict;
    } catch { /* fail closed below */ }
  }
  throw new TypeError('verifier completion requires strict pass|reject verdict');
}

function finishAwaiting(shadow, ledger, result) {
  return freeze({
    ...thawShadow(shadow),
    ledger,
    awaiting: null,
    observations: [...shadow.observations, freeze({ type: 'completion', result })],
  });
}

function appendObservation(shadow, type, detail) {
  return freeze({ ...thawShadow(shadow), observations: [...shadow.observations, freeze({ type, detail })] });
}

function validateShadow(shadow) {
  if (!shadow || shadow.schemaVersion !== NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION) {
    throw new TypeError('invalid native dispatch shadow state');
  }
}

function requireMatch(actual, expected, label) {
  if (String(actual ?? '') !== String(expected ?? '')) throw new TypeError(`${label} does not match shadow binding`);
}

function nonEmpty(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function thawShadow(shadow) {
  return {
    schemaVersion: shadow.schemaVersion,
    ticketId: shadow.ticketId,
    taskId: shadow.taskId,
    ledger: shadow.ledger,
    awaiting: shadow.awaiting,
    admissions: [...shadow.admissions],
    observations: [...shadow.observations],
  };
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}
