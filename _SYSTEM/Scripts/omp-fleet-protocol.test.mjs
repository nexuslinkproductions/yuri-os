import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FLEET_LIMITS,
  FLEET_PROTOCOL_VERSION,
  FLEET_EVENT_KINDS,
  canonicalProjectId,
  validateFleetId,
  buildProcessOwnerId,
  peerLeaseId,
  taskLeaseId,
  parseProcessOwnerId,
  buildFleetEvent,
  validateFleetEvent,
} from './omp-fleet-protocol.mjs';

// ── isolated temp root ──────────────────────────────────────────────────

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-fleet-protocol-'));
const PROJECT_ID = canonicalProjectId(TMP_ROOT);

test.after(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ── validateFleetId ─────────────────────────────────────────────────────

test('validateFleetId accepts bounded lowercase kebab IDs and rejects invalid ones', () => {
  assert.equal(validateFleetId('worker'), 'worker');
  assert.equal(validateFleetId('worker-7'), 'worker-7');
  assert.equal(validateFleetId('a'.repeat(48)), 'a'.repeat(48));

  assert.throws(() => validateFleetId(''), /Invalid fleet ID/);
  assert.throws(() => validateFleetId('Worker'), /Invalid fleet ID/);
  assert.throws(() => validateFleetId('wor ker'), /Invalid fleet ID/);
  assert.throws(() => validateFleetId('../etc'), /Invalid fleet ID/);
  assert.throws(() => validateFleetId('work_er'), /Invalid fleet ID/);
  assert.throws(() => validateFleetId('a'.repeat(49)), /Invalid fleet ID/);
});

// ── canonicalProjectId ──────────────────────────────────────────────────

test('canonicalProjectId is stable through a symlink and matches project_[a-f0-9]{32}', () => {
  const realDir = fs.mkdtempSync(path.join(TMP_ROOT, 'real-'));
  const linkPath = path.join(TMP_ROOT, 'link-to-real');
  fs.symlinkSync(realDir, linkPath, 'dir');

  const idFromReal = canonicalProjectId(realDir);
  const idFromLink = canonicalProjectId(linkPath);

  assert.match(idFromReal, /^project_[a-f0-9]{32}$/);
  assert.equal(idFromReal, idFromLink);
});

// ── process owner ID round-trip ─────────────────────────────────────────

test('buildProcessOwnerId/parseProcessOwnerId round-trip a process identity', () => {
  const identity = {
    fleetId: 'worker',
    pid: 4242,
    processUuid: '123e4567-e89b-12d3-a456-426614174000',
    sessionId: 'session-7',
  };

  const ownerId = buildProcessOwnerId(identity);
  const parsed = parseProcessOwnerId(ownerId);

  assert.equal(parsed.fleetId, identity.fleetId);
  assert.equal(parsed.pid, identity.pid);
  assert.equal(parsed.processUuid, identity.processUuid);
  assert.equal(parsed.sessionId, identity.sessionId);

  const colonIdentity = { ...identity, sessionId: 'session:7:captain' };
  const colonOwnerId = buildProcessOwnerId(colonIdentity);
  const colonParsed = parseProcessOwnerId(colonOwnerId);
  assert.equal(colonParsed.sessionId, colonIdentity.sessionId);

  const prefix = colonOwnerId.slice(0, colonOwnerId.lastIndexOf(':') + 1);
  assert.throws(() => parseProcessOwnerId(`${prefix}@@@!!!`), /Invalid process owner ID/);
  assert.throws(() => parseProcessOwnerId(`${prefix}has space`), /Invalid process owner ID/);
});

// ── lease IDs ────────────────────────────────────────────────────────────

test('peer/task lease IDs are stable resources and peerLeaseTtlMs is 20000', () => {
  const projectId = canonicalProjectId(TMP_ROOT);

  const peerA = peerLeaseId(projectId, 'worker');
  const peerB = peerLeaseId(projectId, 'worker');
  assert.equal(peerA, peerB);
  assert.equal(peerA, `fleet-peer:${projectId}:worker`);

  const taskA = taskLeaseId(projectId, 'task-123');
  const taskB = taskLeaseId(projectId, 'task-123');
  assert.equal(taskA, taskB);
  assert.equal(taskA, `fleet-task:${projectId}:task-123`);

  assert.throws(() => taskLeaseId(projectId, 'a'.repeat(81)), /Invalid task ID/);

  assert.equal(FLEET_LIMITS.peerLeaseTtlMs, 20000);
});

// ── fleet event schemas ──────────────────────────────────────────────────

test('buildFleetEvent produces a valid fleet.message.sent event with fixed id/ts', () => {
  const fixedId = 'fleet_11111111-1111-4111-8111-111111111111';
  const fixedTs = '2026-01-01T00:00:00.000Z';

  const event = buildFleetEvent(
    'fleet.message.sent',
    {
      projectId: PROJECT_ID,
      traceId: 'trace-1',
      from: 'captain',
      to: 'worker',
      payload: {
        messageId: 'msg-1',
        body: 'hello worker',
        replyTo: null,
        artifactUris: ['artifact://foo'],
        authority: 'peer',
      },
    },
    { id: fixedId, ts: fixedTs },
  );

  assert.equal(event.id, fixedId);
  assert.equal(event.ts, fixedTs);
  assert.equal(event.schemaVersion, FLEET_PROTOCOL_VERSION);
  assert.equal(event.kind, 'fleet.message.sent');
  assert.equal(validateFleetEvent(event), event);
});

test('FLEET_EVENT_KINDS is closed and buildFleetEvent enforces kind/authority/sender authorization', () => {
  assert.ok(FLEET_EVENT_KINDS.includes('fleet.task.completed'));

  const baseMessagePayload = () => ({
    messageId: 'msg-2',
    body: 'hi',
    replyTo: null,
    artifactUris: [],
    authority: 'peer',
  });

  assert.throws(() =>
    buildFleetEvent('fleet.shell.exec', {
      projectId: PROJECT_ID,
      traceId: 'trace-2',
      from: 'captain',
      to: 'worker',
      payload: baseMessagePayload(),
    }),
  );

  assert.throws(
    () =>
      buildFleetEvent('fleet.message.sent', {
        projectId: PROJECT_ID,
        traceId: 'trace-3',
        from: 'captain',
        to: 'worker',
        payload: { ...baseMessagePayload(), authority: 'root' },
      }),
    /Invalid fleet event payload/,
  );

  assert.throws(
    () =>
      buildFleetEvent('fleet.task.offered', {
        projectId: PROJECT_ID,
        traceId: 'trace-4',
        from: 'worker',
        to: 'captain',
        payload: {
          taskId: 'task-1',
          contract: { goal: 'do the thing', acceptance: ['it works'] },
        },
      }),
    /not authorized to emit/,
  );

  assert.throws(
    () =>
      buildFleetEvent('fleet.message.sent', {
        projectId: PROJECT_ID,
        traceId: 'trace-4b',
        from: 'intruder',
        to: 'worker',
        payload: baseMessagePayload(),
      }),
    /not authorized to emit/,
  );

  assert.throws(
    () =>
      buildFleetEvent('fleet.message.sent', {
        projectId: PROJECT_ID,
        traceId: 'trace-4c',
        from: 'captain',
        to: 'captain ',
        payload: baseMessagePayload(),
      }),
    /Invalid fleet event participants/,
  );
});

test('buildFleetEvent enforces UTF-8 byte and count bounds for bodies, artifact URIs, contracts, and scalars', () => {
  assert.throws(() =>
    buildFleetEvent('fleet.message.sent', {
      projectId: PROJECT_ID,
      traceId: 'trace-5',
      from: 'captain',
      to: 'worker',
      payload: {
        messageId: 'msg-3',
        body: 'x'.repeat(FLEET_LIMITS.maxMessageBytes + 1),
        replyTo: null,
        artifactUris: [],
        authority: 'peer',
      },
    }),
  );

  assert.throws(() =>
    buildFleetEvent('fleet.message.sent', {
      projectId: PROJECT_ID,
      traceId: 'trace-6',
      from: 'captain',
      to: 'worker',
      payload: {
        messageId: 'msg-4',
        body: 'hi',
        replyTo: null,
        artifactUris: Array.from(
          { length: FLEET_LIMITS.maxArtifactUris + 1 },
          (_, i) => `artifact://item-${i}`,
        ),
        authority: 'peer',
      },
    }),
  );

  // Aggregate contract overflow: each string is individually well within
  // maxTaskBytes, but the fully serialized contract exceeds it.
  assert.throws(
    () =>
      buildFleetEvent('fleet.task.offered', {
        projectId: PROJECT_ID,
        traceId: 'trace-7',
        from: 'captain',
        to: 'worker',
        payload: {
          taskId: 'task-2',
          contract: {
            goal: 'ship a large batch of small acceptance criteria',
            acceptance: Array.from(
              { length: 1000 },
              (_, i) => `criterion number ${i} must independently pass review`,
            ),
          },
        },
      }),
    /Invalid fleet event payload/,
  );

  // Oversized scalar: traceId exceeds FLEET_LIMITS.maxArtifactUriChars.
  assert.throws(
    () =>
      buildFleetEvent('fleet.message.sent', {
        projectId: PROJECT_ID,
        traceId: 'x'.repeat(FLEET_LIMITS.maxArtifactUriChars + 1),
        from: 'captain',
        to: 'worker',
        payload: {
          messageId: 'msg-5',
          body: 'hi',
          replyTo: null,
          artifactUris: [],
          authority: 'peer',
        },
      }),
    /Invalid fleet event identity/,
  );

  // Invalid URI scheme: not one of agent://, artifact://, history://, local://.
  assert.throws(
    () =>
      buildFleetEvent('fleet.message.sent', {
        projectId: PROJECT_ID,
        traceId: 'trace-8',
        from: 'captain',
        to: 'worker',
        payload: {
          messageId: 'msg-6',
          body: 'hi',
          replyTo: null,
          artifactUris: ['http://evil.example/payload'],
          authority: 'peer',
        },
      }),
    /Invalid fleet event payload/,
  );

  // Multibyte body counting: 4097 two-byte 'é' characters is 4097 JS chars
  // (under maxMessageBytes if counted by .length) but 8194 UTF-8 bytes
  // (over maxMessageBytes) — proves bytes, not characters, are counted.
  const multibyteBody = 'é'.repeat(4097);
  assert.equal(multibyteBody.length, 4097);
  assert.ok(Buffer.byteLength(multibyteBody, 'utf8') > FLEET_LIMITS.maxMessageBytes);
  assert.throws(() =>
    buildFleetEvent('fleet.message.sent', {
      projectId: PROJECT_ID,
      traceId: 'trace-9',
      from: 'captain',
      to: 'worker',
      payload: {
        messageId: 'msg-7',
        body: multibyteBody,
        replyTo: null,
        artifactUris: [],
        authority: 'peer',
      },
    }),
  );
});
