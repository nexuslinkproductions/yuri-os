// omp-fleet-protocol.mjs
//
// Pure protocol foundation for the OMP fleet bridge: identities, constants,
// event schemas, operation authorization, and a deterministic in-memory
// reducer that folds a validated event stream into fleet state, plus pure
// delivery selectors and recovery decisions derived from that state. No OMP
// extension or smoke harness lives here — see the October OMP fleet bridge
// plan for the phases that add those on top of this module.

import crypto from 'node:crypto';
import fs from 'node:fs';

export const FLEET_PROTOCOL_VERSION = 'yuri.omp-fleet.v1';

// Lowercase kebab-case: one or more alnum segments joined by single hyphens.
// Rejects empty strings, uppercase, whitespace, path-traversal sequences,
// and underscores.
export const FLEET_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const FLEET_LIMITS = Object.freeze({
  peerLeaseTtlMs: 20000,
  leaseRenewEveryMs: 5000,
  reconcileEveryMs: 2000,
  maxMessageBytes: 8192,
  maxTaskBytes: 32768,
  maxArtifactUris: 16,
  maxArtifactUriChars: 2048,
  recentEventIds: 4096,
});

const MAX_FLEET_ID_CHARS = 48;
const MAX_TASK_ID_CHARS = 80;
const PROCESS_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

/**
 * Validate a fleet ID: trims, bounds to <=48 chars, and requires lowercase
 * kebab-case. Throws `Invalid fleet ID` on any violation.
 */
export function validateFleetId(fleetId) {
  if (typeof fleetId !== 'string') {
    throw new Error('Invalid fleet ID');
  }
  const trimmed = fleetId.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_FLEET_ID_CHARS ||
    !FLEET_ID_RE.test(trimmed)
  ) {
    throw new Error('Invalid fleet ID');
  }
  return trimmed;
}

/**
 * Derive a stable, opaque project identifier from a working directory by
 * resolving symlinks (fs.realpathSync) and hashing the canonical path with
 * sha256, keeping the first 32 hex characters.
 */
export function canonicalProjectId(cwd) {
  const real = fs.realpathSync(cwd);
  const hash = crypto.createHash('sha256').update(real, 'utf8').digest('hex');
  return `project_${hash.slice(0, 32)}`;
}

/**
 * Build a colon-delimited process owner ID that couples a stable peer
 * identity (fleetId) to a unique process identity (pid + processUuid),
 * with an optional base64url-encoded session ID.
 */
export function buildProcessOwnerId({ fleetId, pid, processUuid, sessionId } = {}) {
  const validFleetId = validateFleetId(fleetId);

  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('Invalid pid');
  }

  if (typeof processUuid !== 'string' || !PROCESS_UUID_RE.test(processUuid)) {
    throw new Error('Invalid process UUID');
  }

  const encodedSessionId =
    sessionId == null ? '' : Buffer.from(String(sessionId), 'utf8').toString('base64url');

  return `${validFleetId}:${pid}:${processUuid}:${encodedSessionId}`;
}

/**
 * Reverse buildProcessOwnerId, returning { fleetId, pid, processUuid,
 * sessionId }. sessionId is undefined when the owner ID carried no session.
 */
export function parseProcessOwnerId(ownerId) {
  if (typeof ownerId !== 'string') {
    throw new Error('Invalid process owner ID');
  }

  const parts = ownerId.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid process owner ID');
  }

  const [fleetId, pidStr, processUuid, encodedSessionId] = parts;

  const validFleetId = validateFleetId(fleetId);

  const pid = Number(pidStr);
  if (!Number.isSafeInteger(pid) || pid <= 0 || String(pid) !== pidStr) {
    throw new Error('Invalid process owner ID');
  }

  if (!PROCESS_UUID_RE.test(processUuid)) {
    throw new Error('Invalid process owner ID');
  }
  if (encodedSessionId !== '' && !BASE64URL_RE.test(encodedSessionId)) {
    throw new Error('Invalid process owner ID');
  }

  const sessionId =
    encodedSessionId === '' ? undefined : Buffer.from(encodedSessionId, 'base64url').toString('utf8');

  return { fleetId: validFleetId, pid, processUuid, sessionId };
}

/**
 * Stable resource ID for a peer's lease, scoped to a project.
 */
export function peerLeaseId(projectId, fleetId) {
  const validFleetId = validateFleetId(fleetId);
  return `fleet-peer:${projectId}:${validFleetId}`;
}

/**
 * Validate a task ID: trims and requires the same lowercase kebab-case rule
 * as fleet IDs, but allows up to 80 characters. Throws `Invalid task ID` on
 * any violation. Shared by taskLeaseId and the task-related event payload
 * validators below.
 */
function validateTaskId(taskId) {
  if (typeof taskId !== 'string') {
    throw new Error('Invalid task ID');
  }
  const trimmed = taskId.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_TASK_ID_CHARS ||
    !FLEET_ID_RE.test(trimmed)
  ) {
    throw new Error('Invalid task ID');
  }
  return trimmed;
}

/**
 * Stable resource ID for a task's lease, scoped to a project. Task IDs
 * follow the same bounded lowercase kebab rule as fleet IDs but allow up
 * to 80 characters.
 */
export function taskLeaseId(projectId, taskId) {
  const validTaskId = validateTaskId(taskId);
  return `fleet-task:${projectId}:${validTaskId}`;
}

// ── fleet event schemas ───────────────────────────────────────────────────
//
// Closed, versioned, size-bounded event contract. Every event is a plain
// object shaped `{id, ts, schemaVersion, kind, projectId, traceId, from,
// to, payload}`. buildFleetEvent constructs and validates one;
// validateFleetEvent re-validates a raw event (e.g. one received over the
// wire). No reducer, delivery selectors, or transport wrapping live here.

/**
 * Closed set of fleet event kinds. Peer presence, message delivery, and the
 * task offer/claim/completion/failure/recovery lifecycle — nothing else.
 */
export const FLEET_EVENT_KINDS = Object.freeze([
  'fleet.peer.joined',
  'fleet.peer.left',
  'fleet.message.sent',
  'fleet.message.acknowledged',
  'fleet.task.offered',
  'fleet.task.claimed',
  'fleet.task.completed',
  'fleet.task.failed',
  'fleet.task.recovered',
]);

const FLEET_EVENT_KIND_SET = new Set(FLEET_EVENT_KINDS);

// Closed authorization map: which exact sender fleetIds may emit each
// event kind. There is no separate "actor" field and no role-inference
// fallback — the sender's `from` value is checked verbatim against this
// closed set, so an unrecognized fleetId (anything other than the literal
// 'captain'/'worker' identities) is rejected outright rather than treated
// as a worker. Presence/message events flow from either identity; only
// 'captain' may offer a task, and only 'worker' may
// claim/complete/fail/recover one.
const FLEET_EVENT_AUTHORIZED_SENDERS = Object.freeze({
  'fleet.peer.joined': Object.freeze(['captain', 'worker']),
  'fleet.peer.left': Object.freeze(['captain', 'worker']),
  'fleet.message.sent': Object.freeze(['captain', 'worker']),
  'fleet.message.acknowledged': Object.freeze(['captain', 'worker']),
  'fleet.task.offered': Object.freeze(['captain']),
  'fleet.task.claimed': Object.freeze(['worker']),
  'fleet.task.completed': Object.freeze(['worker']),
  'fleet.task.failed': Object.freeze(['worker']),
  'fleet.task.recovered': Object.freeze(['worker']),
});

const ARTIFACT_URI_PREFIXES = Object.freeze([
  'agent://',
  'artifact://',
  'history://',
  'local://',
]);

function utf8ByteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

// Bounds every metadata/lifecycle scalar string (id, ts, projectId,
// traceId, messageId, replyTo, attemptId, priorAttemptId, reason, and
// owner/recipient values not already structurally bounded elsewhere) to
// FLEET_LIMITS.maxArtifactUriChars UTF-8 bytes. Reuses the existing limit
// rather than inventing a new one — it is the protocol's general
// "bounded opaque string" ceiling.
function isBoundedScalar(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    utf8ByteLength(value) <= FLEET_LIMITS.maxArtifactUriChars
  );
}

function isPlainPayload(payload) {
  return payload != null && typeof payload === 'object' && !Array.isArray(payload);
}

// Runs `fn(value)` for reuse (task-ID rules, process-owner-ID rules) but
// normalizes any failure to a single payload-shaped error, since payload
// sub-fields share the outer payload validation family.
function withPayloadError(fn, value) {
  try {
    return fn(value);
  } catch {
    throw new Error('Invalid fleet event payload');
  }
}

// Validates a participant (`from`/`to`): the raw value must already equal
// its own canonical form (validateFleetId trims — a raw value carrying
// whitespace the canonical form does not is rejected here, rather than
// silently normalized), so two differently-padded strings that canonicalize
// to the same ID cannot be compared as "different" by a caller and slip a
// same-sender/recipient send past the check below.
function validateParticipant(rawId) {
  let canonicalId;
  try {
    canonicalId = validateFleetId(rawId);
  } catch {
    throw new Error('Invalid fleet event participants');
  }
  if (rawId !== canonicalId) {
    throw new Error('Invalid fleet event participants');
  }
  return canonicalId;
}

function validateArtifactUris(artifactUris) {
  if (!Array.isArray(artifactUris) || artifactUris.length > FLEET_LIMITS.maxArtifactUris) {
    throw new Error('Invalid fleet event payload');
  }
  for (const uri of artifactUris) {
    if (
      typeof uri !== 'string' ||
      uri.length === 0 ||
      uri.length > FLEET_LIMITS.maxArtifactUriChars ||
      !ARTIFACT_URI_PREFIXES.some((prefix) => uri.startsWith(prefix))
    ) {
      throw new Error('Invalid fleet event payload');
    }
  }
  return artifactUris;
}

// peer joined/left: require ownerId, a well-formed, bounded process owner ID.
function validatePeerPayload(payload) {
  if (!isPlainPayload(payload) || !isBoundedScalar(payload.ownerId)) {
    throw new Error('Invalid fleet event payload');
  }
  withPayloadError(parseProcessOwnerId, payload.ownerId);
  return payload;
}

// message sent: messageId (bounded scalar), body (<=maxMessageBytes
// UTF-8), replyTo (null|bounded scalar), artifactUris, and authority
// fixed to 'peer'.
function validateMessageSentPayload(payload) {
  if (!isPlainPayload(payload)) {
    throw new Error('Invalid fleet event payload');
  }
  const { messageId, body, replyTo, artifactUris, authority } = payload;
  if (
    !isBoundedScalar(messageId) ||
    typeof body !== 'string' ||
    utf8ByteLength(body) > FLEET_LIMITS.maxMessageBytes ||
    (replyTo !== null && !isBoundedScalar(replyTo)) ||
    authority !== 'peer'
  ) {
    throw new Error('Invalid fleet event payload');
  }
  validateArtifactUris(artifactUris);
  return payload;
}

// message acknowledged: messageId (bounded scalar), recipient (a valid
// fleet ID), and disposition fixed to 'injected'.
function validateMessageAckPayload(payload) {
  if (!isPlainPayload(payload)) {
    throw new Error('Invalid fleet event payload');
  }
  const { messageId, recipient, disposition } = payload;
  if (!isBoundedScalar(messageId) || disposition !== 'injected') {
    throw new Error('Invalid fleet event payload');
  }
  withPayloadError(validateFleetId, recipient);
  return payload;
}

// task offered: bounded kebab taskId plus a contract {goal, acceptance[]}.
// Each string is bounded by maxTaskBytes UTF-8, and the complete
// serialized contract is separately bounded by maxTaskBytes UTF-8 too, so
// many small-but-valid strings cannot aggregate past the limit.
function validateTaskOfferedPayload(payload) {
  if (!isPlainPayload(payload)) {
    throw new Error('Invalid fleet event payload');
  }
  const { taskId, contract } = payload;
  withPayloadError(validateTaskId, taskId);
  if (!isPlainPayload(contract)) {
    throw new Error('Invalid fleet event payload');
  }
  const { goal, acceptance } = contract;
  if (
    typeof goal !== 'string' ||
    goal.length === 0 ||
    utf8ByteLength(goal) > FLEET_LIMITS.maxTaskBytes
  ) {
    throw new Error('Invalid fleet event payload');
  }
  if (
    !Array.isArray(acceptance) ||
    acceptance.length === 0 ||
    !acceptance.every(
      (item) => typeof item === 'string' && item.length > 0 && utf8ByteLength(item) <= FLEET_LIMITS.maxTaskBytes,
    )
  ) {
    throw new Error('Invalid fleet event payload');
  }
  if (utf8ByteLength(JSON.stringify(contract)) > FLEET_LIMITS.maxTaskBytes) {
    throw new Error('Invalid fleet event payload');
  }
  return payload;
}

// task claimed: taskId, attemptId (bounded scalar), ownerId.
function validateTaskClaimedPayload(payload) {
  if (!isPlainPayload(payload)) {
    throw new Error('Invalid fleet event payload');
  }
  const { taskId, attemptId, ownerId } = payload;
  withPayloadError(validateTaskId, taskId);
  if (!isBoundedScalar(attemptId)) {
    throw new Error('Invalid fleet event payload');
  }
  if (!isBoundedScalar(ownerId)) {
    throw new Error('Invalid fleet event payload');
  }
  withPayloadError(parseProcessOwnerId, ownerId);
  return payload;
}

// task completed/failed: taskId, attemptId (bounded scalar), summary
// (<=maxTaskBytes UTF-8), artifactUris.
function validateTaskResultPayload(payload) {
  if (!isPlainPayload(payload)) {
    throw new Error('Invalid fleet event payload');
  }
  const { taskId, attemptId, summary, artifactUris } = payload;
  withPayloadError(validateTaskId, taskId);
  if (
    !isBoundedScalar(attemptId) ||
    typeof summary !== 'string' ||
    utf8ByteLength(summary) > FLEET_LIMITS.maxTaskBytes
  ) {
    throw new Error('Invalid fleet event payload');
  }
  validateArtifactUris(artifactUris);
  return payload;
}

// task recovered: taskId, attemptId, priorAttemptId, reason (all bounded
// scalars), ownerId (bounded scalar, also structurally validated).
function validateTaskRecoveredPayload(payload) {
  if (!isPlainPayload(payload)) {
    throw new Error('Invalid fleet event payload');
  }
  const { taskId, attemptId, priorAttemptId, ownerId, reason } = payload;
  withPayloadError(validateTaskId, taskId);
  if (
    !isBoundedScalar(attemptId) ||
    !isBoundedScalar(priorAttemptId) ||
    !isBoundedScalar(reason)
  ) {
    throw new Error('Invalid fleet event payload');
  }
  if (!isBoundedScalar(ownerId)) {
    throw new Error('Invalid fleet event payload');
  }
  withPayloadError(parseProcessOwnerId, ownerId);
  return payload;
}

const FLEET_EVENT_PAYLOAD_VALIDATORS = Object.freeze({
  'fleet.peer.joined': validatePeerPayload,
  'fleet.peer.left': validatePeerPayload,
  'fleet.message.sent': validateMessageSentPayload,
  'fleet.message.acknowledged': validateMessageAckPayload,
  'fleet.task.offered': validateTaskOfferedPayload,
  'fleet.task.claimed': validateTaskClaimedPayload,
  'fleet.task.completed': validateTaskResultPayload,
  'fleet.task.failed': validateTaskResultPayload,
  'fleet.task.recovered': validateTaskRecoveredPayload,
});

/**
 * Validate a fleet event end to end: known+versioned kind, complete
 * identity (id/ts/projectId/traceId), valid non-identical participants
 * (`to` is mandatory), a sender (`from`) present verbatim in that kind's
 * closed authorized-sender set, and a payload satisfying that kind's
 * required-field/UTF-8/artifact-URI rules. Throws on the first violation
 * found, in that order. Returns the event unchanged on success, so later
 * reducers never receive a partial event.
 */
export function validateFleetEvent(event) {
  if (event == null || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Invalid fleet event');
  }

  const { id, ts, schemaVersion, kind, projectId, traceId, from, to, payload } = event;

  if (typeof kind !== 'string' || !FLEET_EVENT_KIND_SET.has(kind)) {
    throw new Error('Unknown fleet event kind');
  }
  if (schemaVersion !== FLEET_PROTOCOL_VERSION) {
    throw new Error('Invalid fleet event schema version');
  }
  if (
    !isBoundedScalar(id) ||
    !isBoundedScalar(ts) ||
    Number.isNaN(Date.parse(ts)) ||
    !isBoundedScalar(projectId) ||
    !isBoundedScalar(traceId)
  ) {
    throw new Error('Invalid fleet event identity');
  }

  const fromId = validateParticipant(from);
  const toId = validateParticipant(to);
  if (fromId === toId) {
    throw new Error('Invalid fleet event participants');
  }

  const authorizedSenders = FLEET_EVENT_AUTHORIZED_SENDERS[kind];
  if (!authorizedSenders.includes(from)) {
    throw new Error(`Sender "${from}" is not authorized to emit ${kind}`);
  }

  FLEET_EVENT_PAYLOAD_VALIDATORS[kind](payload);

  return event;
}

/**
 * Build a fleet event: defaults `id` to `fleet_<randomUUID>` and `ts` to
 * the current ISO timestamp (both overridable via `options` for
 * deterministic tests/replays), stamps `schemaVersion`, then validates the
 * assembled event via validateFleetEvent before returning it.
 */
export function buildFleetEvent(kind, fields = {}, options = {}) {
  const { projectId, traceId, from, to, payload } = fields;

  const event = {
    id: options.id ?? `fleet_${crypto.randomUUID()}`,
    ts: options.ts ?? new Date().toISOString(),
    schemaVersion: FLEET_PROTOCOL_VERSION,
    kind,
    projectId,
    traceId,
    from,
    to,
    payload,
  };

  return validateFleetEvent(event);
}

// ── fleet operation authorization ─────────────────────────────────────────
//
// Closed, role-scoped authorization for the higher-level fleet operations a
// runtime surface (status/send/task lifecycle calls) exposes to a peer. This
// is a distinct axis from FLEET_EVENT_AUTHORIZED_SENDERS above (which gates
// *event kinds* at the wire-schema layer): operations name a caller-facing
// action, not an event, and are not wired into reduceFleetEvent — a runtime
// layer (out of scope here) calls this before invoking the corresponding
// transport action.

const FLEET_OPERATIONS = Object.freeze([
  'peers',
  'status',
  'send',
  'offerTask',
  'claimTask',
  'completeTask',
  'failTask',
]);

const FLEET_OPERATION_SET = new Set(FLEET_OPERATIONS);

const FLEET_OPERATION_AUTHORIZATION = Object.freeze({
  captain: Object.freeze(['peers', 'status', 'send', 'offerTask']),
  worker: Object.freeze(['peers', 'status', 'send', 'claimTask', 'completeTask', 'failTask']),
});

/**
 * Authorize `actor` (exact string, verbatim — no role-inference fallback)
 * to perform `operation`. `operation` must belong to the closed
 * FLEET_OPERATIONS set or this throws `Unknown fleet operation`. A known
 * operation the actor's role does not carry (or an actor outside the
 * closed captain/worker role map) resolves to `false`, never a throw.
 */
export function authorizeFleetOperation(actor, operation) {
  if (typeof operation !== 'string' || !FLEET_OPERATION_SET.has(operation)) {
    throw new Error(`Unknown fleet operation "${operation}"`);
  }
  const allowed = FLEET_OPERATION_AUTHORIZATION[actor];
  return Boolean(allowed) && allowed.includes(operation);
}

// ── fleet state + reducer ──────────────────────────────────────────────────
//
// Deterministic, pure, in-memory fold of a validated fleet event stream.
// No runtime transport lives here — createFleetState/reduceFleetEvent/
// foldFleetEvents only build and advance the state shape; pure delivery
// selectors and recovery decisions follow in the section below.

/**
 * Build an empty fleet state scoped to `projectId`: Maps for peers,
 * messages, and tasks; a bounded recent-event-ID array paired with a Set
 * for O(1) dedup membership; a `{afterId, afterTs}` cursor (both
 * `undefined` until the first successful transition); and a reserved,
 * always-empty errors array — a rejected transition throws without
 * recording anything here or anywhere else in state (see
 * rejectFleetTransition), so a rejected event never mutates state at all.
 */
export function createFleetState(projectId) {
  if (!isBoundedScalar(projectId)) {
    throw new Error('Invalid fleet state projectId');
  }
  return {
    projectId,
    peers: new Map(),
    messages: new Map(),
    tasks: new Map(),
    recentEventIds: [],
    recentEventIdSet: new Set(),
    cursor: { afterId: undefined, afterTs: undefined },
    errors: [],
  };
}

function rejectFleetTransition(message) {
  throw new Error(message);
}

function applyPeerJoined(state, event) {
  const { from, ts, payload } = event;
  state.peers.set(from, {
    fleetId: from,
    ownerId: payload.ownerId,
    status: 'live',
    joinedAt: ts,
    leftAt: undefined,
    updatedAt: ts,
  });
}

function applyPeerLeft(state, event) {
  const { from, ts, payload } = event;
  const existing = state.peers.get(from);
  if (!existing) {
    // Accepted unknown leave: a no-op on the peers map, but the event is
    // still valid and still advances dedup/cursor (see caller).
    return;
  }
  state.peers.set(from, {
    ...existing,
    ownerId: payload.ownerId,
    status: 'left',
    leftAt: ts,
    updatedAt: ts,
  });
}

function applyMessageSent(state, event) {
  const { id, traceId, from, to, ts, payload } = event;
  state.messages.set(payload.messageId, {
    ...payload,
    eventId: id,
    traceId,
    from,
    to,
    ts,
    acknowledged: false,
    disposition: undefined,
    acknowledgedAt: undefined,
  });
}

function applyMessageAcknowledged(state, event) {
  const { ts, payload } = event;
  const existing = state.messages.get(payload.messageId);
  if (!existing) {
    // Accepted unknown acknowledgement: a no-op on the messages map, but the
    // event is still valid and still advances dedup/cursor (see caller).
    return;
  }
  state.messages.set(payload.messageId, {
    ...existing,
    acknowledged: true,
    disposition: payload.disposition,
    acknowledgedAt: ts,
  });
}

function applyTaskOffered(state, event) {
  const { traceId, from, to, ts, payload } = event;
  if (state.tasks.has(payload.taskId)) {
    rejectFleetTransition(`Cannot offer task "${payload.taskId}": task already exists`);
  }
  state.tasks.set(payload.taskId, {
    taskId: payload.taskId,
    status: 'offered',
    contract: payload.contract,
    from,
    to,
    traceId,
    offeredAt: ts,
    attempt: 0,
    attemptId: undefined,
    ownerId: undefined,
    recovered: false,
    priorAttemptId: undefined,
    reason: undefined,
    summary: undefined,
    artifactUris: undefined,
  });
}

function applyTaskClaimed(state, event) {
  const { ts, payload } = event;
  const task = state.tasks.get(payload.taskId);
  if (!task || task.status !== 'offered') {
    rejectFleetTransition(
      `Cannot apply fleet.task.claimed outside offered state for task "${payload.taskId}"`,
    );
  }
  state.tasks.set(payload.taskId, {
    ...task,
    status: 'claimed',
    ownerId: payload.ownerId,
    attemptId: payload.attemptId,
    attempt: 1,
    recovered: false,
    claimedAt: ts,
  });
}

function applyTaskRecovered(state, event) {
  const { ts, payload } = event;
  const task = state.tasks.get(payload.taskId);
  if (!task || task.status !== 'claimed') {
    rejectFleetTransition(
      `Cannot apply fleet.task.recovered outside claimed state for task "${payload.taskId}"`,
    );
  }
  state.tasks.set(payload.taskId, {
    ...task,
    attemptId: payload.attemptId,
    priorAttemptId: payload.priorAttemptId,
    ownerId: payload.ownerId,
    attempt: task.attempt + 1,
    recovered: true,
    reason: payload.reason,
    recoveredAt: ts,
  });
}

function applyTaskResult(state, event, terminalStatus) {
  const { kind, ts, payload } = event;
  const task = state.tasks.get(payload.taskId);
  if (!task || task.status !== 'claimed') {
    rejectFleetTransition(
      `Cannot apply ${kind} outside claimed state for task "${payload.taskId}"`,
    );
  }
  if (task.attemptId !== payload.attemptId) {
    rejectFleetTransition(
      `Cannot apply ${kind}: attemptId "${payload.attemptId}" does not match claimed attemptId for task "${payload.taskId}"`,
    );
  }
  state.tasks.set(payload.taskId, {
    ...task,
    status: terminalStatus,
    summary: payload.summary,
    artifactUris: payload.artifactUris,
    completedAt: ts,
  });
}

const FLEET_EVENT_REDUCERS = Object.freeze({
  'fleet.peer.joined': applyPeerJoined,
  'fleet.peer.left': applyPeerLeft,
  'fleet.message.sent': applyMessageSent,
  'fleet.message.acknowledged': applyMessageAcknowledged,
  'fleet.task.offered': applyTaskOffered,
  'fleet.task.claimed': applyTaskClaimed,
  'fleet.task.recovered': applyTaskRecovered,
  'fleet.task.completed': (state, event) => applyTaskResult(state, event, 'completed'),
  'fleet.task.failed': (state, event) => applyTaskResult(state, event, 'failed'),
});

/**
 * Fold one already-built or wire-received event into `state`, mutating and
 * returning the same state object. Validates `input` via validateFleetEvent
 * first (throws on any structural violation). An event for a foreign
 * projectId or a previously-seen event ID is silently ignored — state is
 * returned unchanged, and dedup/cursor are not touched either way. A
 * semantically invalid transition (duplicate task offer, claim without a
 * matching offer, recover/complete/fail outside claimed state, or a
 * completed/failed attemptId mismatch) throws without mutating `state` at
 * all — a rejected event never touches peers/messages/tasks/errors, and
 * recentEventIds/recentEventIdSet/cursor are only advanced after a
 * transition succeeds, so it never poisons dedup or cursor ordering either.
 */
export function reduceFleetEvent(state, input) {
  const event = validateFleetEvent(input);

  if (event.projectId !== state.projectId) {
    return state;
  }
  if (state.recentEventIdSet.has(event.id)) {
    return state;
  }

  FLEET_EVENT_REDUCERS[event.kind](state, event);

  state.recentEventIds.push(event.id);
  state.recentEventIdSet.add(event.id);
  if (state.recentEventIds.length > FLEET_LIMITS.recentEventIds) {
    const evicted = state.recentEventIds.shift();
    state.recentEventIdSet.delete(evicted);
  }
  state.cursor = { afterId: event.id, afterTs: event.ts };

  return state;
}

/**
 * Fold `events` in order into a fresh state created via
 * `createFleetState(projectId)`, returning the resulting state.
 */
export function foldFleetEvents(events, { projectId } = {}) {
  const state = createFleetState(projectId);
  for (const event of events) {
    reduceFleetEvent(state, event);
  }
  return state;
}

// ── fleet delivery selection + recovery decisions ─────────────────────────
//
// Pure selectors over already-folded fleet state: which messages/tasks are
// still owed to a given peer, and which claimed tasks are safe to recover
// after a prior owning process disappears. No mutation, no I/O, no OMP
// extension or transport wiring lives here — a later phase reads these.

/**
 * Select messages still owed to `fleetId`: addressed to that peer,
 * unacknowledged, and not already delivered this session (per
 * `injectedMessageIds`). Sorted by `ts` then `eventId` so delivery order is
 * deterministic even when two messages share a timestamp.
 */
export function selectPendingDeliveries(state, fleetId, injectedMessageIds = new Set()) {
  const peer = validateFleetId(fleetId);
  return [...state.messages.values()]
    .filter((message) => message.to === peer && !message.acknowledged && !injectedMessageIds.has(message.messageId))
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.eventId.localeCompare(b.eventId));
}

/**
 * Select tasks still owed to `fleetId` for `ownerId`: a fresh offer
 * (`${taskId}:offer`), or a claimed task that was recovered onto this exact
 * `ownerId` (`task.attemptId`). Any other status — including terminal
 * completed/failed tasks and claims not owned by `ownerId` — is excluded.
 * `injectedTaskAttemptIds` drops deliveries already handed out this
 * session, keyed by the same `deliveryId` returned on each entry.
 */
export function selectPendingTaskDeliveries(state, fleetId, ownerId, injectedTaskAttemptIds = new Set()) {
  const peer = validateFleetId(fleetId);
  return [...state.tasks.entries()]
    .map(([taskId, task]) => {
      if (task.to !== peer) return null;
      if (task.status === 'offered') return { ...task, taskId, deliveryId: `${taskId}:offer` };
      if (task.status === 'claimed' && task.recovered && task.ownerId === ownerId) {
        return { ...task, taskId, deliveryId: task.attemptId };
      }
      return null;
    })
    .filter((task) => task && !injectedTaskAttemptIds.has(task.deliveryId));
}

/**
 * Derive safe recovery decisions for `fleetId`'s claimed tasks only —
 * terminal (completed/failed) and offered tasks are never candidates.
 * `ownerAlive(task.ownerId)` decides per task: an alive prior owner yields
 * `needs-review` (no automatic takeover of a task someone may still be
 * working); a dead prior owner yields a `recover` action carrying the next
 * attempt's `priorAttemptId`, `attemptId` (`${taskId}-${attempt + 1}`), and
 * `newOwnerId` so the caller can emit a matching `fleet.task.recovered`
 * event.
 */
export function deriveRecoveryActions(state, { fleetId, ownerAlive, newOwnerId }) {
  const peer = validateFleetId(fleetId);
  return [...state.tasks.entries()]
    .filter(([, task]) => task.to === peer && task.status === 'claimed')
    .map(([taskId, task]) => {
      if (ownerAlive(task.ownerId)) {
        return { taskId, status: 'needs-review', reason: 'prior owner still appears alive' };
      }
      return {
        taskId,
        status: 'recover',
        priorAttemptId: task.attemptId,
        attemptId: `${taskId}-${task.attempt + 1}`,
        ownerId: newOwnerId,
        reason: 'prior process dead; no terminal task event',
      };
    });
}
