// omp-fleet-protocol.mjs
//
// Pure protocol foundation for the OMP fleet bridge: identities, constants,
// and event schemas. No reducer, delivery selectors, OMP extension, or smoke
// harness live here — see the October OMP fleet bridge plan for the phases
// that add those on top of this module.

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
