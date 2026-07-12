// @serves: shadow-only projection of native MURE dispatch into the delegation ledger
// @does: validates reducer actions, OMP admissions, and terminal events before mirroring
//   lifecycle facts into the delegation ledger. Validates via model_change evidence.
// @does-not: select routes, execute OMP TaskTool spawns, persist state, or alter live reducer behavior

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
import { validateDispatchGovernance } from './dispatch-governance.mjs';

export const NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION = 'mure-native-dispatch-shadow-v2';
const LOST_FAILURE_KINDS = new Set(['timeout']);

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
  if (!action || action.type !== 'omp-task-spawn') return appendObservation(shadow, 'ignored-action', action?.type || 'none');
  requireMatch(action.taskId, shadow.taskId, 'action.taskId');
  if (shadow.awaiting) throw new TypeError('shadow already awaits a native completion');
  const purpose = nonEmpty(action.purpose, 'action.purpose');
  if (!['producer', 'availability-fallback', 'quality-escalation', 'verifier', 'evidence'].includes(purpose)) {
    throw new TypeError(`unsupported native action purpose: ${purpose}`);
  }

  // Shadow governance check: record violations but do not block observation
  const dispatchedAgent = action.args?.tasks?.[0]?.agent;
  const governance = validateDispatchGovernance({
    purpose: purpose === 'availability-fallback' || purpose === 'quality-escalation' ? 'producer' : purpose,
    fromArchetype: 'control',
    toArchetype: 'worker',
    agentId: dispatchedAgent,
    producerArchetype: purpose === 'verifier' ? shadow.awaiting?.archetype || 'worker' : undefined,
    producerAgentId: purpose === 'verifier' ? shadow.awaiting?.agentId : undefined,
  });

  let ledger = shadow.ledger;
  const ticket = getTicket(ledger, shadow.ticketId);
  if (purpose !== 'verifier' && ticket.ledgerStatus === 'ticketed') {
    ledger = recordDispatch(ledger, shadow.ticketId, {
      producer: dispatchedAgent || '',
      note: `native ${purpose} dispatched via OMP TaskTool`,
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
      agentId: nonEmpty(dispatchedAgent, 'action args agent'),
      admission: null,
    }),
    observations: [
      ...shadow.observations,
      freeze({ type: 'action', purpose, entryId: action.entryId }),
      ...(governance.ok ? [] : [freeze({ type: 'governance-warning', errors: governance.errors })]),
    ],
  });
}

export function observeNativeAdmission(shadow, receipt) {
  validateShadow(shadow);
  if (!shadow.awaiting) throw new TypeError('OMP admission requires an awaiting action');
  if (!receipt || !receipt.jobId) throw new TypeError('OMP admission receipt must include jobId');
  const jobId = nonEmpty(receipt.jobId, 'receipt.jobId');
  const agent = nonEmpty(receipt.agent, 'receipt.agent');
  requireMatch(agent, shadow.awaiting.agentId, 'receipt.agent');
  const admission = freeze({ jobId, agent });
  return freeze({
    ...thawShadow(shadow),
    awaiting: freeze({ ...shadow.awaiting, admission }),
    admissions: [...shadow.admissions, admission],
    observations: [...shadow.observations, freeze({ type: 'admission', entryId: shadow.awaiting.entryId })],
  });
}

export function observeNativeCompletion(shadow, event, reduction, evidence = {}) {
  validateShadow(shadow);
  if (!shadow.awaiting?.admission) throw new TypeError('OMP completion requires a matching accepted admission');
  requireMatch(event?.taskId, shadow.taskId, 'event.taskId');
  requireMatch(event?.entryId, shadow.awaiting.entryId, 'event.entryId');
  requireMatch(event?.purpose, shadow.awaiting.purpose, 'event.purpose');
  requireMatch(event?.jobId, shadow.awaiting.admission.jobId, 'event.jobId');
  if (!reduction?.state?.tasks?.[shadow.taskId] || !reduction.action) {
    throw new TypeError('completion requires the matching native reducer result');
  }

  let ledger = shadow.ledger;
  const purpose = shadow.awaiting.purpose;
  if (event.ok !== true) {
    const nextAction = reduction.action;
    if (nextAction.type === 'omp-task-spawn' && nextAction.purpose !== 'verifier') {
      return observeNativeAction(finishAwaiting(shadow, ledger, 'availability-fallback'), nextAction);
    }
    const failureKind = String(event.failureKind || 'unknown').toLowerCase();
    if (LOST_FAILURE_KINDS.has(failureKind)) {
      ledger = markLost(ledger, shadow.ticketId, String(event.error || failureKind));
      return finishAwaiting(shadow, ledger, 'lost');
    }
    ledger = reject(ledger, shadow.ticketId,
      String(reduction.action.code || event.error || `OMP ${purpose} failed`));
    return finishAwaiting(shadow, ledger, 'rejected');
  }

  if (purpose === 'verifier') {
    const verdict = strictVerdict(event);
    ledger = recordVerifierVerdict(ledger, shadow.ticketId, verdict === 'pass'
      ? { verdict: 'pass', checked: evidence.checked || ['OMP reducer verdict'] }
      : { verdict: 'fail', failureReason: evidence.failureReason || 'OMP verifier rejected producer' });
    if (verdict === 'pass') {
      if (reduction.state.tasks[shadow.taskId].status !== 'passed') {
        throw new TypeError('passing verifier event does not match reducer task status');
      }
      ledger = accept(ledger, shadow.ticketId, 'accepted by OMP reducer and independent verifier');
    }
    return finishAwaiting(shadow, ledger, verdict === 'pass' ? 'accepted' : 'rejected');
  }

  if (purpose === 'evidence') {
    const next = finishAwaiting(shadow, ledger, 'evidence-observed');
    if (reduction.action.type === 'omp-task-spawn') return observeNativeAction(next, reduction.action);
    throw new TypeError('evidence completion did not yield the next OMP dispatch action');
  }

  ledger = recordProducerOutput(ledger, shadow.ticketId, {
    evidence,
    summary: String(event.output || ''),
  });
  const next = finishAwaiting(shadow, ledger, 'producer-completed');
  if (reduction.action.type === 'omp-task-spawn' && (reduction.action.purpose === 'verifier' || reduction.action.purpose === 'quality-escalation')) {
    return observeNativeAction(next, reduction.action);
  }
  if (reduction.state.tasks[shadow.taskId].status === 'fail-loud') {
    return freeze({ ...thawShadow(next), ledger: reject(ledger, shadow.ticketId, reduction.action.message || 'OMP reducer failed loud') });
  }
  throw new TypeError('producer completion did not yield the required independent verifier action');
}

export function shadowSnapshot(shadow) {
  validateShadow(shadow);
  const ticket = getTicket(shadow.ledger, shadow.ticketId);
  const governanceWarnings = shadow.observations.filter((o) => o.type === 'governance-warning');
  return freeze({
    schemaVersion: NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION,
    ticketId: shadow.ticketId,
    ledgerStatus: ticket.ledgerStatus,
    awaiting: shadow.awaiting ? { entryId: shadow.awaiting.entryId, purpose: shadow.awaiting.purpose } : null,
    admissionCount: shadow.admissions.length,
    observationCount: shadow.observations.length,
    governanceWarnings: governanceWarnings.length,
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
