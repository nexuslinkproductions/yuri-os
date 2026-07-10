// @serves: shadow-only delegation lifecycle ledger for MURE archetype dispatch
// @does: records typed delegation tickets and advances them through a pure lifecycle
//        (ticketed → dispatched → produced → verified → accepted/rejected/LOST)
//        with LOST-worker reconciliation before retry
// @does-not: select models, compile sessions_spawn payloads, alter live dispatch,
//            import live planner/router/reducer code, or mutate artifacts it indexes
// @exports: createLedger, recordTicket, recordDispatch, recordProducerOutput,
//           recordVerifierVerdict, accept, reject, markLost, reconcileLost,
//           retry, getTicket, queryByStatus, snapshot, LEDGER_SCHEMA_VERSION

import {
  createDelegationTicket,
  createRunLifecycle,
} from './archetype-contract.mjs';

export const LEDGER_SCHEMA_VERSION = 'mure-delegation-ledger-v1';

const TERMINAL = new Set(['accepted', 'rejected', 'cancelled', 'lost']);
const RECONCILED = new Set(['reconciled-clean', 'reconciled-partial', 'reconciled-dirty']);

/**
 * Extended lifecycle states for the delegation ledger.
 * Extends the base archetype-contract lifecycle with dispatch/production/verification/LOST.
 */
const LEDGER_TRANSITIONS = Object.freeze({
  ticketed: new Set(['dispatched', 'cancelled']),
  dispatched: new Set(['produced', 'lost', 'cancelled']),
  produced: new Set(['verifying', 'verified', 'rejected', 'lost', 'cancelled']),
  verifying: new Set(['verified', 'rejected', 'lost', 'cancelled']),
  verified: new Set(['accepted', 'rejected', 'cancelled']),
  lost: new Set(['reconciling']),
  reconciling: new Set(['reconciled-clean', 'reconciled-partial', 'reconciled-dirty']),
  'reconciled-clean': new Set(['ticketed']),
  'reconciled-partial': new Set(['ticketed']),
  'reconciled-dirty': new Set(['ticketed', 'cancelled']),
  accepted: new Set(),
  rejected: new Set(),
  cancelled: new Set(),
});

/**
 * Create a new shadow-only delegation ledger.
 * The ledger is an in-memory append-only log; it persists nothing and routes nothing.
 */
export function createLedger(ledgerId = `ledger-${Date.now()}`) {
  return freezeLedger({
    schemaVersion: LEDGER_SCHEMA_VERSION,
    id: ledgerId,
    createdAt: new Date().toISOString(),
    tickets: new Map(),
    log: [],
  });
}

/**
 * Record a typed delegation ticket in the ledger.
 * The ticket is validated through the provider-neutral archetype contract.
 */
export function recordTicket(ledger, ticketInput) {
  const ticket = createDelegationTicket(ticketInput);
  if (ledger.tickets.has(ticket.id)) throw new TypeError(`duplicate ticketId: ${ticket.id}`);
  const entry = {
    ticketId: ticket.id,
    ticket,
    lifecycle: createRunLifecycle(ticket.id),
    ledgerStatus: 'ticketed',
    dispatch: null,
    producerOutput: null,
    verifierVerdict: null,
    reconciliation: null,
    acceptedAt: null,
    rejectedAt: null,
    lostAt: null,
    retries: 0,
  };
  const next = cloneLedger(ledger);
  next.tickets.set(ticket.id, entry);
  next.log.push({
    ts: new Date().toISOString(),
    action: 'record-ticket',
    ticketId: ticket.id,
    from: ticket.from,
    to: ticket.to,
  });
  return freezeLedger(next);
}

/**
 * Record that a ticket was dispatched to a producer.
 * Does NOT record provider, model, agentId, or route — only the dispatch event.
 */
export function recordDispatch(ledger, ticketId, dispatchMeta = {}) {
  const entry = requireTicket(ledger, ticketId);
  requireLedgerStatus(entry, 'ticketed', 'dispatch');
  requirePlainObject(dispatchMeta, 'dispatchMeta');
  const dispatch = {
    dispatchedAt: new Date().toISOString(),
    producer: sanitizeMeta(dispatchMeta.producer, 'producer'),
    note: sanitizeMeta(dispatchMeta.note, 'note'),
  };
  const next = cloneLedger(ledger);
  next.tickets.set(ticketId, { ...entry, ledgerStatus: 'dispatched', dispatch });
  next.log.push({ ts: dispatch.dispatchedAt, action: 'dispatch', ticketId });
  return freezeLedger(next);
}

/**
 * Record producer output for a dispatched ticket.
 * The output must include deterministic evidence fields declared in the ticket.
 */
export function recordProducerOutput(ledger, ticketId, output) {
  const entry = requireTicket(ledger, ticketId);
  requireLedgerStatus(entry, 'dispatched', 'producer-output');
  const ticket = entry.ticket;
  const missing = (ticket.evidenceRequirements || []).filter((req) => !hasEvidenceKey(output, req));
  if (missing.length) {
    throw new TypeError(`producer output missing evidence: ${missing.join(', ')}`);
  }
  const producerOutput = {
    receivedAt: new Date().toISOString(),
    evidence: freezeShallow(output.evidence || {}),
    summary: String(output.summary || ''),
    warnings: freezeShallow(output.warnings || []),
  };
  const next = cloneLedger(ledger);
  next.tickets.set(ticketId, { ...entry, ledgerStatus: 'produced', producerOutput });
  next.log.push({ ts: producerOutput.receivedAt, action: 'producer-output', ticketId });
  return freezeLedger(next);
}

/**
 * Record a verifier verdict on produced output.
 * Verdict must be one of: 'pass', 'fail', 'not-checked'.
 * 'not-checked' requires an explicit uncheckedReason.
 */
export function recordVerifierVerdict(ledger, ticketId, verdict) {
  const entry = requireTicket(ledger, ticketId);
  requireLedgerStatus(entry, 'produced', 'verifier-verdict');
  requirePlainObject(verdict, 'verdict');
  const result = nonEmptyString(verdict.verdict, 'verdict.verdict');
  if (!['pass', 'fail', 'not-checked'].includes(result)) {
    throw new TypeError(`verdict.verdict must be pass|fail|not-checked, got: ${result}`);
  }
  if (result === 'not-checked' && !verdict.uncheckedReason) {
    throw new TypeError('verdict.uncheckedReason required when verdict is not-checked');
  }
  if (result === 'fail' && !verdict.failureReason) {
    throw new TypeError('verdict.failureReason required when verdict is fail');
  }
  const verifierVerdict = {
    recordedAt: new Date().toISOString(),
    verdict: result,
    checked: freezeShallow(verdict.checked || []),
    uncheckedReason: verdict.uncheckedReason || null,
    failureReason: verdict.failureReason || null,
    notes: String(verdict.notes || ''),
  };
  const next = cloneLedger(ledger);
  const status = result === 'pass' ? 'verified' : result === 'fail' ? 'rejected' : 'verifying';
  next.tickets.set(ticketId, {
    ...entry,
    ledgerStatus: status,
    verifierVerdict,
    rejectedAt: result === 'fail' ? verifierVerdict.recordedAt : entry.rejectedAt,
  });
  next.log.push({
    ts: verifierVerdict.recordedAt,
    action: 'verifier-verdict',
    ticketId,
    verdict: result,
    status,
  });
  return freezeLedger(next);
}

/**
 * Accept a verified ticket. Terminal state.
 */
export function accept(ledger, ticketId, note = '') {
  const entry = requireTicket(ledger, ticketId);
  if (entry.ledgerStatus !== 'verified') {
    throw new TypeError(`accept requires status verified, got: ${entry.ledgerStatus}`);
  }
  if (!entry.verifierVerdict || entry.verifierVerdict.verdict !== 'pass') {
    throw new TypeError('cannot accept a ticket without a passing verifier verdict');
  }
  const acceptedAt = new Date().toISOString();
  const next = cloneLedger(ledger);
  next.tickets.set(ticketId, {
    ...entry,
    ledgerStatus: 'accepted',
    acceptedAt,
  });
  next.log.push({ ts: acceptedAt, action: 'accept', ticketId, note });
  return freezeLedger(next);
}

/**
 * Reject a ticket. Terminal state.
 */
export function reject(ledger, ticketId, reason, note = '') {
  const entry = requireTicket(ledger, ticketId);
  requireNonTerminal(entry, 'reject');
  const rejectionReason = nonEmptyString(reason, 'reason');
  const rejectedAt = new Date().toISOString();
  const next = cloneLedger(ledger);
  next.tickets.set(ticketId, {
    ...entry,
    ledgerStatus: 'rejected',
    rejectedAt,
  });
  next.log.push({ ts: rejectedAt, action: 'reject', ticketId, reason: rejectionReason, note });
  return freezeLedger(next);
}

/**
 * Mark a dispatched/produced ticket as LOST (worker did not return).
 * Must be reconciled before retry.
 */
export function markLost(ledger, ticketId, reason) {
  const entry = requireTicket(ledger, ticketId);
  if (!['dispatched', 'produced', 'verifying'].includes(entry.ledgerStatus)) {
    throw new TypeError(`markLost requires dispatched/produced/verifying, got: ${entry.ledgerStatus}`);
  }
  const lostReason = nonEmptyString(reason, 'reason');
  const lostAt = new Date().toISOString();
  const next = cloneLedger(ledger);
  next.tickets.set(ticketId, {
    ...entry,
    ledgerStatus: 'lost',
    lostAt,
  });
  next.log.push({ ts: lostAt, action: 'mark-lost', ticketId, reason: lostReason });
  return freezeLedger(next);
}

/**
 * Reconcile a LOST ticket before retry.
 * outcome: 'reconciled-clean' (no writes), 'reconciled-partial' (some writes, rolled back),
 *          'reconciled-dirty' (unresolved writes).
 */
export function reconcileLost(ledger, ticketId, outcome, detail = '') {
  const entry = requireTicket(ledger, ticketId);
  if (entry.ledgerStatus !== 'lost') {
    throw new TypeError(`reconcileLost requires status lost, got: ${entry.ledgerStatus}`);
  }
  if (!RECONCILED.has(outcome)) {
    throw new TypeError(`outcome must be one of ${[...RECONCILED].join('|')}, got: ${outcome}`);
  }
  const reconciliation = {
    reconciledAt: new Date().toISOString(),
    outcome,
    detail: String(detail || ''),
    writeSet: entry.ticket.writeSet || [],
  };
  const next = cloneLedger(ledger);
  next.tickets.set(ticketId, { ...entry, ledgerStatus: outcome, reconciliation });
  next.log.push({ ts: reconciliation.reconciledAt, action: 'reconcile', ticketId, outcome });
  return freezeLedger(next);
}

/**
 * Retry a reconciled ticket. Returns a new ledger with the ticket back in 'ticketed'.
 */
export function retry(ledger, ticketId) {
  const entry = requireTicket(ledger, ticketId);
  if (!RECONCILED.has(entry.ledgerStatus)) {
    throw new TypeError(`retry requires a reconciled status, got: ${entry.ledgerStatus}`);
  }
  const next = cloneLedger(ledger);
  next.tickets.set(ticketId, {
    ...entry,
    ledgerStatus: 'ticketed',
    dispatch: null,
    producerOutput: null,
    verifierVerdict: null,
    reconciliation: null,
    retries: entry.retries + 1,
  });
  next.log.push({ ts: new Date().toISOString(), action: 'retry', ticketId, attempt: entry.retries + 1 });
  return freezeLedger(next);
}

/** Read-only ticket snapshot. */
export function getTicket(ledger, ticketId) {
  const entry = ledger.tickets.get(ticketId);
  return entry ? deepFreezeClone(entry) : null;
}

/** Query tickets by ledger status. */
export function queryByStatus(ledger, status) {
  const results = [];
  for (const entry of ledger.tickets.values()) {
    if (entry.ledgerStatus === status) results.push(deepFreezeClone(entry));
  }
  return Object.freeze(results);
}

/** Return a frozen summary snapshot of the ledger. */
export function snapshot(ledger) {
  const statuses = {};
  for (const entry of ledger.tickets.values()) {
    statuses[entry.ledgerStatus] = (statuses[entry.ledgerStatus] || 0) + 1;
  }
  return Object.freeze({
    schemaVersion: LEDGER_SCHEMA_VERSION,
    id: ledger.id,
    totalTickets: ledger.tickets.size,
    statuses: Object.freeze(statuses),
    logEntries: ledger.log.length,
  });
}

// --- internal helpers ---

function cloneLedger(ledger) {
  return {
    schemaVersion: ledger.schemaVersion,
    id: ledger.id,
    createdAt: ledger.createdAt,
    tickets: new Map(ledger.tickets),
    log: [...ledger.log],
  };
}

function freezeLedger(ledger) {
  const tickets = new Map(
    [...ledger.tickets].map(([ticketId, entry]) => [ticketId, deepFreezeClone(entry)]),
  );
  for (const method of ['set', 'delete', 'clear']) {
    Object.defineProperty(tickets, method, {
      value() { throw new TypeError('delegation ledger tickets are read-only'); },
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }
  return Object.freeze({
    schemaVersion: ledger.schemaVersion,
    id: ledger.id,
    createdAt: ledger.createdAt,
    tickets: Object.freeze(tickets),
    log: Object.freeze(ledger.log.map(deepFreezeClone)),
  });
}

function requireTicket(ledger, ticketId) {
  const entry = ledger.tickets.get(ticketId);
  if (!entry) throw new TypeError(`unknown ticketId: ${ticketId}`);
  return entry;
}

function requireLedgerStatus(entry, expected, action) {
  if (entry.ledgerStatus !== expected) {
    throw new TypeError(`${action} requires ledger status ${expected}, got: ${entry.ledgerStatus}`);
  }
}

function requireNonTerminal(entry, action) {
  if (TERMINAL.has(entry.ledgerStatus)) {
    throw new TypeError(`${action} cannot act on terminal status: ${entry.ledgerStatus}`);
  }
}

function hasEvidenceKey(output, req) {
  if (!output || typeof output !== 'object') return false;
  const evidence = output.evidence || output;
  const key = String(req).replace(/\s+/g, '_').toLowerCase();
  return Object.prototype.hasOwnProperty.call(evidence, key) ||
    Object.prototype.hasOwnProperty.call(evidence, req);
}

function sanitizeMeta(value, label) {
  if (value === undefined || value === null) return null;
  return String(value);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function freezeShallow(value) {
  if (Array.isArray(value)) return Object.freeze([...value]);
  if (value && typeof value === 'object') return Object.freeze({ ...value });
  return value;
}

function deepFreezeClone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreezeClone));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepFreezeClone(v)]),
    ));
  }
  return value;
}
