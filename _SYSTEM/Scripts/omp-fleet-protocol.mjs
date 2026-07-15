// omp-fleet-protocol.mjs
//
// Pure protocol foundation for the OMP fleet bridge: identities and
// constants only. No event schemas, reducers, extension code, or smoke
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
 * Stable resource ID for a task's lease, scoped to a project. Task IDs
 * follow the same bounded lowercase kebab rule as fleet IDs but allow up
 * to 80 characters.
 */
export function taskLeaseId(projectId, taskId) {
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
  return `fleet-task:${projectId}:${trimmed}`;
}
