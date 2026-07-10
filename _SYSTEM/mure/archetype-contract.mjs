// @serves: shadow-only, provider-neutral contracts for MURE delegation archetypes
// @does: validates typed delegation tickets and a pure run-lifecycle state machine
// @does-not: select models, compile sessions_spawn payloads, or alter live dispatch

export const ARCHETYPES = Object.freeze([
  'control',
  'architect',
  'strategic-peer',
  'delegated-orchestrator',
  'worker',
  'verifier',
]);

const ARCHETYPE_SET = new Set(ARCHETYPES);
const DELEGATORS = new Set(['control', 'delegated-orchestrator']);
const TERMINAL_STATUSES = new Set(['accepted', 'rejected', 'cancelled']);
const TRANSITIONS = Object.freeze({
  planned: new Set(['ticketed', 'owner-held', 'cancelled']),
  ticketed: new Set(['in-review', 'owner-held', 'cancelled']),
  'in-review': new Set(['verified', 'rejected', 'owner-held', 'cancelled']),
  verified: new Set(['accepted', 'rejected', 'owner-held']),
  'owner-held': new Set(['ticketed', 'cancelled']),
  accepted: new Set(),
  rejected: new Set(),
  cancelled: new Set(),
});
const TICKET_KEYS = new Set([
  'id', 'from', 'to', 'actors', 'scope', 'expectedOutcome',
  'constraints', 'evidenceRequirements', 'escalationRule', 'writeSet',
]);
const ACTOR_KEYS = new Set(['issuer', 'assignee', 'producer']);
const FORBIDDEN_TICKET_KEYS = new Set([
  'provider', 'model', 'agentId', 'route', 'routeKind', 'thinking',
  'runtime', 'mode', 'context', 'cleanup', 'sandbox', 'sessions_spawn',
  'spawn', 'execution', 'execute', 'tool',
]);

/** Return the immutable definition for one provider-neutral archetype. */
export function getArchetypeContract(id) {
  const archetype = requireArchetype(id, 'archetype');
  return CONTRACTS[archetype];
}

/** Validate and freeze a typed delegation ticket without accepting routing data. */
export function createDelegationTicket(ticket) {
  requirePlainObject(ticket, 'ticket');
  for (const key of Object.keys(ticket)) {
    if (FORBIDDEN_TICKET_KEYS.has(key)) throw new TypeError(`ticket must not contain routing field: ${key}`);
    if (!TICKET_KEYS.has(key)) throw new TypeError(`ticket contains unknown field: ${key}`);
  }
  const id = nonEmpty(ticket.id, 'ticket.id');
  const from = requireArchetype(ticket.from, 'ticket.from');
  const to = requireArchetype(ticket.to, 'ticket.to');
  if (!DELEGATORS.has(from)) throw new TypeError(`${from} may not issue delegation tickets`);
  if (to === 'control' || to === 'delegated-orchestrator') {
    throw new TypeError(`${to} may not be assigned as a delegated ticket target`);
  }
  if (from === to) throw new TypeError('delegation ticket may not target its issuing archetype');

  const actors = normalizeActors(ticket.actors);
  const scope = nonEmptyArray(ticket.scope, 'ticket.scope');
  const expectedOutcome = nonEmpty(ticket.expectedOutcome, 'ticket.expectedOutcome');
  const constraints = stringArray(ticket.constraints, 'ticket.constraints');
  const evidenceRequirements = nonEmptyArray(ticket.evidenceRequirements, 'ticket.evidenceRequirements');
  const escalationRule = nonEmpty(ticket.escalationRule, 'ticket.escalationRule');
  const writeSet = stringArray(ticket.writeSet, 'ticket.writeSet');

  if (to === 'verifier') {
    if (!actors.producer) throw new TypeError('verifier ticket requires actors.producer');
    if (actors.producer === actors.assignee) throw new TypeError('a producer may not verify itself');
  } else if (actors.producer) {
    throw new TypeError('actors.producer is only valid for verifier tickets');
  }

  return freeze({
    schemaVersion: 'mure-archetype-ticket-v1',
    id,
    from,
    to,
    actors,
    scope,
    expectedOutcome,
    constraints,
    evidenceRequirements,
    escalationRule,
    writeSet,
  });
}

/** Start a pure, shadow-only run lifecycle. */
export function createRunLifecycle(runId) {
  return freeze({
    schemaVersion: 'mure-archetype-lifecycle-v1',
    runId: nonEmpty(runId, 'runId'),
    status: 'planned',
    history: [],
  });
}

/** Advance a lifecycle through one legal transition; terminal states never reopen. */
export function transitionRunLifecycle(lifecycle, nextStatus, note = '') {
  requirePlainObject(lifecycle, 'lifecycle');
  const current = nonEmpty(lifecycle.status, 'lifecycle.status');
  if (!Object.hasOwn(TRANSITIONS, current)) throw new TypeError(`unknown lifecycle status: ${current}`);
  const next = nonEmpty(nextStatus, 'nextStatus');
  if (!Object.hasOwn(TRANSITIONS, next)) throw new TypeError(`unknown lifecycle status: ${next}`);
  if (TERMINAL_STATUSES.has(current)) throw new TypeError(`terminal lifecycle status may not reopen: ${current}`);
  if (!TRANSITIONS[current].has(next)) throw new TypeError(`illegal lifecycle transition: ${current} -> ${next}`);
  const history = Array.isArray(lifecycle.history) ? lifecycle.history : [];
  return freeze({
    schemaVersion: 'mure-archetype-lifecycle-v1',
    runId: nonEmpty(lifecycle.runId, 'lifecycle.runId'),
    status: next,
    history: [...history, freeze({ from: current, to: next, note: String(note || '') })],
  });
}

function normalizeActors(actors) {
  requirePlainObject(actors, 'ticket.actors');
  for (const key of Object.keys(actors)) {
    if (!ACTOR_KEYS.has(key)) throw new TypeError(`ticket.actors contains unknown field: ${key}`);
  }
  const issuer = nonEmpty(actors.issuer, 'ticket.actors.issuer');
  const assignee = nonEmpty(actors.assignee, 'ticket.actors.assignee');
  const producer = actors.producer === undefined ? undefined : nonEmpty(actors.producer, 'ticket.actors.producer');
  return freeze(producer ? { issuer, assignee, producer } : { issuer, assignee });
}

function requireArchetype(value, label) {
  const archetype = nonEmpty(value, label);
  if (!ARCHETYPE_SET.has(archetype)) throw new TypeError(`unknown archetype: ${archetype}`);
  return archetype;
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function nonEmptyArray(value, label) {
  const list = stringArray(value, label);
  if (!list.length) throw new TypeError(`${label} must contain at least one entry`);
  return list;
}

function stringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return freeze(value.map((entry, index) => nonEmpty(entry, `${label}[${index}]`)));
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function freeze(value) {
  return Object.freeze(value);
}

const CONTRACTS = freeze({
  control: freeze({ id: 'control', mayIssueTickets: true, mayExecuteWork: false, mayVerifyOwnOutput: false }),
  architect: freeze({ id: 'architect', mayIssueTickets: false, mayExecuteWork: false, mayVerifyOwnOutput: false }),
  'strategic-peer': freeze({ id: 'strategic-peer', mayIssueTickets: false, mayExecuteWork: false, mayVerifyOwnOutput: false }),
  'delegated-orchestrator': freeze({ id: 'delegated-orchestrator', mayIssueTickets: true, mayExecuteWork: false, mayVerifyOwnOutput: false }),
  worker: freeze({ id: 'worker', mayIssueTickets: false, mayExecuteWork: true, mayVerifyOwnOutput: false }),
  verifier: freeze({ id: 'verifier', mayIssueTickets: false, mayExecuteWork: false, mayVerifyOwnOutput: false }),
});
