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
  authorizeFleetOperation,
  createFleetState,
  reduceFleetEvent,
  foldFleetEvents,
  selectPendingDeliveries,
  selectPendingTaskDeliveries,
  deriveRecoveryActions,
  deriveOctoberWorkerId,
  octoberNodeLeaseId,
  isWorkerPeerId,
  destinationMatchesPeer,
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

// ── fleet operation authorization ─────────────────────────────────────────

test('authorizeFleetOperation is closed by role and throws on an unknown operation', () => {
  assert.equal(authorizeFleetOperation('captain', 'offerTask'), true);
  assert.equal(authorizeFleetOperation('worker', 'claimTask'), true);
  assert.equal(authorizeFleetOperation('worker', 'offerTask'), false);
  assert.equal(authorizeFleetOperation('captain', 'completeTask'), false);
  assert.throws(() => authorizeFleetOperation('captain', 'shell'), /Unknown fleet operation/);
});

// ── fleet state reducer ────────────────────────────────────────────────────

test('foldFleetEvents applies the offered→claimed→completed task lifecycle and protects terminal tasks from recovery', () => {
  const projectId = 'project_deadbeef';
  const workerOwnerId = buildProcessOwnerId({
    fleetId: 'worker',
    pid: 4242,
    processUuid: '22222222-2222-4222-8222-222222222222',
  });

  const offered = buildFleetEvent(
    'fleet.task.offered',
    {
      projectId,
      traceId: 'trace-lifecycle',
      from: 'captain',
      to: 'worker',
      payload: {
        taskId: 'task-lifecycle',
        contract: { goal: 'ship it', acceptance: ['it works'] },
      },
    },
    { id: 'fleet_lifecycle-offered', ts: '2026-01-01T00:00:00.000Z' },
  );

  const claimed = buildFleetEvent(
    'fleet.task.claimed',
    {
      projectId,
      traceId: 'trace-lifecycle',
      from: 'worker',
      to: 'captain',
      payload: { taskId: 'task-lifecycle', attemptId: 'attempt-1', ownerId: workerOwnerId },
    },
    { id: 'fleet_lifecycle-claimed', ts: '2026-01-01T00:01:00.000Z' },
  );

  const completed = buildFleetEvent(
    'fleet.task.completed',
    {
      projectId,
      traceId: 'trace-lifecycle',
      from: 'worker',
      to: 'captain',
      payload: {
        taskId: 'task-lifecycle',
        attemptId: 'attempt-1',
        summary: 'shipped',
        artifactUris: [],
      },
    },
    { id: 'fleet_lifecycle-completed', ts: '2026-01-01T00:02:00.000Z' },
  );

  const state = foldFleetEvents([offered, claimed], { projectId });

  const duplicateOffer = buildFleetEvent(
    'fleet.task.offered',
    {
      projectId,
      traceId: 'trace-lifecycle-duplicate-offer',
      from: 'captain',
      to: 'worker',
      payload: {
        taskId: 'task-lifecycle',
        contract: { goal: 'ship it', acceptance: ['it works'] },
      },
    },
    { id: 'fleet_lifecycle-duplicate-offer', ts: '2026-01-01T00:00:30.000Z' },
  );

  const preDuplicateOfferSnapshot = structuredClone({
    peers: state.peers,
    messages: state.messages,
    tasks: state.tasks,
    recentEventIds: state.recentEventIds,
    recentEventIdSet: state.recentEventIdSet,
    cursor: state.cursor,
    errors: state.errors,
  });

  assert.throws(() => reduceFleetEvent(state, duplicateOffer), /already exists/);

  assert.deepStrictEqual(state.peers, preDuplicateOfferSnapshot.peers);
  assert.deepStrictEqual(state.messages, preDuplicateOfferSnapshot.messages);
  assert.deepStrictEqual(state.tasks, preDuplicateOfferSnapshot.tasks);
  assert.deepStrictEqual(state.recentEventIds, preDuplicateOfferSnapshot.recentEventIds);
  assert.deepStrictEqual(state.recentEventIdSet, preDuplicateOfferSnapshot.recentEventIdSet);
  assert.deepStrictEqual(state.cursor, preDuplicateOfferSnapshot.cursor);
  assert.deepStrictEqual(state.errors, preDuplicateOfferSnapshot.errors);

  const postClaimSnapshot = structuredClone({
    peers: state.peers,
    messages: state.messages,
    tasks: state.tasks,
    recentEventIds: state.recentEventIds,
    recentEventIdSet: state.recentEventIdSet,
    cursor: state.cursor,
    errors: state.errors,
  });

  const dedupResult = reduceFleetEvent(state, claimed);

  assert.equal(dedupResult, state);
  assert.equal(state.tasks.get('task-lifecycle').attempt, 1);
  assert.deepStrictEqual(state.peers, postClaimSnapshot.peers);
  assert.deepStrictEqual(state.messages, postClaimSnapshot.messages);
  assert.deepStrictEqual(state.tasks, postClaimSnapshot.tasks);
  assert.deepStrictEqual(state.recentEventIds, postClaimSnapshot.recentEventIds);
  assert.deepStrictEqual(state.recentEventIdSet, postClaimSnapshot.recentEventIdSet);
  assert.deepStrictEqual(state.cursor, postClaimSnapshot.cursor);
  assert.deepStrictEqual(state.errors, postClaimSnapshot.errors);

  reduceFleetEvent(state, completed);

  const task = state.tasks.get('task-lifecycle');
  assert.equal(task.status, 'completed');
  assert.equal(task.attempt, 1);
  assert.equal(task.summary, 'shipped');
  assert.equal(task.ownerId, workerOwnerId);
  assert.equal('owner' in task, false);

  const messageSent = buildFleetEvent(
    'fleet.message.sent',
    {
      projectId,
      traceId: 'trace-message',
      from: 'captain',
      to: 'worker',
      payload: {
        messageId: 'msg-lifecycle-1',
        body: 'status check',
        replyTo: null,
        artifactUris: ['artifact://lifecycle-status'],
        authority: 'peer',
      },
    },
    { id: 'fleet_lifecycle-message-sent', ts: '2026-01-01T00:02:30.000Z' },
  );

  reduceFleetEvent(state, messageSent);

  const storedMessage = state.messages.get('msg-lifecycle-1');
  assert.equal(storedMessage.body, 'status check');
  assert.deepStrictEqual(storedMessage.artifactUris, ['artifact://lifecycle-status']);
  assert.equal(storedMessage.authority, 'peer');
  assert.equal(storedMessage.eventId, 'fleet_lifecycle-message-sent');
  assert.equal(storedMessage.traceId, 'trace-message');
  assert.equal(storedMessage.from, 'captain');
  assert.equal(storedMessage.to, 'worker');
  assert.equal(storedMessage.ts, '2026-01-01T00:02:30.000Z');
  assert.equal(storedMessage.acknowledged, false);
  assert.equal(storedMessage.disposition, undefined);
  assert.equal(storedMessage.acknowledgedAt, undefined);

  const messageAcknowledged = buildFleetEvent(
    'fleet.message.acknowledged',
    {
      projectId,
      traceId: 'trace-message',
      from: 'worker',
      to: 'captain',
      payload: { messageId: 'msg-lifecycle-1', recipient: 'worker', disposition: 'injected' },
    },
    { id: 'fleet_lifecycle-message-acknowledged', ts: '2026-01-01T00:02:31.000Z' },
  );

  reduceFleetEvent(state, messageAcknowledged);

  const ackedMessage = state.messages.get('msg-lifecycle-1');
  assert.equal(ackedMessage.acknowledged, true);
  assert.equal(ackedMessage.disposition, 'injected');
  assert.equal(ackedMessage.acknowledgedAt, '2026-01-01T00:02:31.000Z');

  const unknownAck = buildFleetEvent(
    'fleet.message.acknowledged',
    {
      projectId,
      traceId: 'trace-message-unknown',
      from: 'worker',
      to: 'captain',
      payload: { messageId: 'msg-never-sent', recipient: 'worker', disposition: 'injected' },
    },
    { id: 'fleet_lifecycle-message-unknown-ack', ts: '2026-01-01T00:02:32.000Z' },
  );

  const preUnknownAckMessages = structuredClone(state.messages);

  const unknownAckResult = reduceFleetEvent(state, unknownAck);

  assert.equal(unknownAckResult, state);
  assert.deepStrictEqual(state.messages, preUnknownAckMessages);
  assert.equal(state.messages.has('msg-never-sent'), false);
  assert.equal(state.cursor.afterId, 'fleet_lifecycle-message-unknown-ack');
  assert.equal(state.cursor.afterTs, '2026-01-01T00:02:32.000Z');
  assert.ok(state.recentEventIds.includes('fleet_lifecycle-message-unknown-ack'));
  assert.ok(state.recentEventIdSet.has('fleet_lifecycle-message-unknown-ack'));

  const recoverableOffered = buildFleetEvent(
    'fleet.task.offered',
    {
      projectId,
      traceId: 'trace-lifecycle-recoverable',
      from: 'captain',
      to: 'worker',
      payload: {
        taskId: 'task-lifecycle-recoverable',
        contract: { goal: 'ship it again', acceptance: ['it works again'] },
      },
    },
    { id: 'fleet_lifecycle-recoverable-offered', ts: '2026-01-01T00:04:00.000Z' },
  );

  const recoverableClaimed = buildFleetEvent(
    'fleet.task.claimed',
    {
      projectId,
      traceId: 'trace-lifecycle-recoverable',
      from: 'worker',
      to: 'captain',
      payload: { taskId: 'task-lifecycle-recoverable', attemptId: 'attempt2-1', ownerId: workerOwnerId },
    },
    { id: 'fleet_lifecycle-recoverable-claimed', ts: '2026-01-01T00:05:00.000Z' },
  );

  const recoveredOwnerId = buildProcessOwnerId({
    fleetId: 'worker',
    pid: 5252,
    processUuid: '44444444-4444-4444-8444-444444444444',
  });

  const recoverableRecovered = buildFleetEvent(
    'fleet.task.recovered',
    {
      projectId,
      traceId: 'trace-lifecycle-recoverable',
      from: 'worker',
      to: 'captain',
      payload: {
        taskId: 'task-lifecycle-recoverable',
        attemptId: 'attempt2-2',
        priorAttemptId: 'attempt2-1',
        ownerId: recoveredOwnerId,
        reason: 'flaky-network',
      },
    },
    { id: 'fleet_lifecycle-recoverable-recovered', ts: '2026-01-01T00:06:00.000Z' },
  );

  reduceFleetEvent(state, recoverableOffered);
  reduceFleetEvent(state, recoverableClaimed);

  const mismatchedCompletion = buildFleetEvent(
    'fleet.task.completed',
    {
      projectId,
      traceId: 'trace-lifecycle-recoverable',
      from: 'worker',
      to: 'captain',
      payload: {
        taskId: 'task-lifecycle-recoverable',
        attemptId: 'wrong-attempt',
        summary: 'should not apply',
        artifactUris: [],
      },
    },
    { id: 'fleet_lifecycle-recoverable-mismatched-completed', ts: '2026-01-01T00:05:30.000Z' },
  );

  const preMismatchSnapshot = structuredClone({
    peers: state.peers,
    messages: state.messages,
    tasks: state.tasks,
    recentEventIds: state.recentEventIds,
    recentEventIdSet: state.recentEventIdSet,
    cursor: state.cursor,
    errors: state.errors,
  });

  assert.throws(
    () => reduceFleetEvent(state, mismatchedCompletion),
    /does not match claimed attemptId/,
  );

  assert.deepStrictEqual(state.peers, preMismatchSnapshot.peers);
  assert.deepStrictEqual(state.messages, preMismatchSnapshot.messages);
  assert.deepStrictEqual(state.tasks, preMismatchSnapshot.tasks);
  assert.deepStrictEqual(state.recentEventIds, preMismatchSnapshot.recentEventIds);
  assert.deepStrictEqual(state.recentEventIdSet, preMismatchSnapshot.recentEventIdSet);
  assert.deepStrictEqual(state.cursor, preMismatchSnapshot.cursor);
  assert.deepStrictEqual(state.errors, preMismatchSnapshot.errors);

  reduceFleetEvent(state, recoverableRecovered);

  const recoveredTask = state.tasks.get('task-lifecycle-recoverable');
  assert.equal(recoveredTask.status, 'claimed');
  assert.equal(recoveredTask.recovered, true);
  assert.equal(recoveredTask.ownerId, recoveredOwnerId);
  assert.equal('owner' in recoveredTask, false);

  const recovered = buildFleetEvent(
    'fleet.task.recovered',
    {
      projectId,
      traceId: 'trace-lifecycle',
      from: 'worker',
      to: 'captain',
      payload: {
        taskId: 'task-lifecycle',
        attemptId: 'attempt-2',
        priorAttemptId: 'attempt-1',
        ownerId: workerOwnerId,
        reason: 'flaky-network',
      },
    },
    { id: 'fleet_lifecycle-recovered', ts: '2026-01-01T00:03:00.000Z' },
  );

  const preRejectSnapshot = structuredClone({
    peers: state.peers,
    messages: state.messages,
    tasks: state.tasks,
    recentEventIds: state.recentEventIds,
    recentEventIdSet: state.recentEventIdSet,
    cursor: state.cursor,
    errors: state.errors,
  });

  assert.throws(() => reduceFleetEvent(state, recovered), /outside claimed state/);

  assert.deepStrictEqual(state.peers, preRejectSnapshot.peers);
  assert.deepStrictEqual(state.messages, preRejectSnapshot.messages);
  assert.deepStrictEqual(state.tasks, preRejectSnapshot.tasks);
  assert.deepStrictEqual(state.recentEventIds, preRejectSnapshot.recentEventIds);
  assert.deepStrictEqual(state.recentEventIdSet, preRejectSnapshot.recentEventIdSet);
  assert.deepStrictEqual(state.cursor, preRejectSnapshot.cursor);
  assert.deepStrictEqual(state.errors, preRejectSnapshot.errors);
});

test('reduceFleetEvent ignores an otherwise-valid event for a foreign projectId', () => {
  const state = createFleetState('project_deadbeef');
  const captainOwnerId = buildProcessOwnerId({
    fleetId: 'captain',
    pid: 99,
    processUuid: '33333333-3333-4333-8333-333333333333',
  });

  const foreignJoin = buildFleetEvent(
    'fleet.peer.joined',
    {
      projectId: 'project_other',
      traceId: 'trace-foreign',
      from: 'captain',
      to: 'worker',
      payload: { ownerId: captainOwnerId },
    },
    { id: 'fleet_foreign-joined', ts: '2026-01-01T00:00:00.000Z' },
  );

  const result = reduceFleetEvent(state, foreignJoin);

  assert.equal(result, state);
  assert.equal(state.peers.size, 0);

  const workerOwnerId = buildProcessOwnerId({
    fleetId: 'worker',
    pid: 100,
    processUuid: '55555555-5555-4555-8555-555555555555',
  });

  const unknownLeave = buildFleetEvent(
    'fleet.peer.left',
    {
      projectId: 'project_deadbeef',
      traceId: 'trace-unknown-leave',
      from: 'worker',
      to: 'captain',
      payload: { ownerId: workerOwnerId },
    },
    { id: 'fleet_unknown-leave', ts: '2026-01-01T00:00:01.000Z' },
  );

  const afterLeave = reduceFleetEvent(state, unknownLeave);

  assert.equal(afterLeave, state);
  assert.equal(state.peers.size, 0);
  assert.equal(state.peers.has('worker'), false);
  assert.equal(state.cursor.afterId, 'fleet_unknown-leave');
  assert.equal(state.cursor.afterTs, '2026-01-01T00:00:01.000Z');
  assert.ok(state.recentEventIds.includes('fleet_unknown-leave'));
  assert.ok(state.recentEventIdSet.has('fleet_unknown-leave'));

  const recentLimitState = createFleetState('project_deadbeef');
  const recentLimitOwnerId = buildProcessOwnerId({
    fleetId: 'worker',
    pid: 200,
    processUuid: '66666666-6666-4666-8666-666666666666',
  });
  const recentLimitBaseTs = Date.parse('2026-06-01T00:00:00.000Z');
  const recentLimitEventIds = [];

  for (let i = 0; i < FLEET_LIMITS.recentEventIds + 1; i += 1) {
    const eventId = `fleet_recent-limit-${i}`;
    recentLimitEventIds.push(eventId);
    reduceFleetEvent(
      recentLimitState,
      buildFleetEvent(
        'fleet.peer.left',
        {
          projectId: 'project_deadbeef',
          traceId: `trace-recent-limit-${i}`,
          from: 'worker',
          to: 'captain',
          payload: { ownerId: recentLimitOwnerId },
        },
        { id: eventId, ts: new Date(recentLimitBaseTs + i * 1000).toISOString() },
      ),
    );
  }

  const oldestRecentLimitEventId = recentLimitEventIds[0];
  const newestRecentLimitEventId = recentLimitEventIds[recentLimitEventIds.length - 1];

  assert.equal(recentLimitState.recentEventIds.length, FLEET_LIMITS.recentEventIds);
  assert.equal(recentLimitState.recentEventIdSet.size, FLEET_LIMITS.recentEventIds);
  assert.equal(recentLimitState.recentEventIds.includes(oldestRecentLimitEventId), false);
  assert.equal(recentLimitState.recentEventIdSet.has(oldestRecentLimitEventId), false);
  assert.equal(
    recentLimitState.recentEventIds[recentLimitState.recentEventIds.length - 1],
    newestRecentLimitEventId,
  );
  assert.equal(recentLimitState.recentEventIdSet.has(newestRecentLimitEventId), true);
  assert.equal(recentLimitState.cursor.afterId, newestRecentLimitEventId);
  assert.equal(recentLimitState.peers.size, 0);
});

// ── delivery selection + recovery decisions ────────────────────────────────

test('cursor carries afterId and afterTs; duplicate events do not re-deliver; pending deliveries sort by ts then eventId and honor injectedMessageIds', () => {
  const message = buildFleetEvent('fleet.message.sent', {
    projectId: 'project_deadbeef', traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm1', body: 'hello', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e1', ts: '2026-07-15T15:00:00.000Z' });
  const earlier = buildFleetEvent('fleet.message.sent', {
    projectId: 'project_deadbeef', traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm0', body: 'earlier', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e0', ts: '2026-07-15T14:59:00.000Z' });
  const sameTsLaterEventId = buildFleetEvent('fleet.message.sent', {
    projectId: 'project_deadbeef', traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm2', body: 'same-ts', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e2', ts: '2026-07-15T15:00:00.000Z' });
  const injected = buildFleetEvent('fleet.message.sent', {
    projectId: 'project_deadbeef', traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm-injected', body: 'session-injected', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e3', ts: '2026-07-15T15:00:02.000Z' });
  const state = foldFleetEvents(
    [sameTsLaterEventId, message, message, earlier, injected],
    { projectId: 'project_deadbeef' },
  );
  assert.deepEqual(state.cursor, { afterId: 'e3', afterTs: '2026-07-15T15:00:02.000Z' });
  assert.deepEqual(
    selectPendingDeliveries(state, 'worker', new Set(['m-injected'])).map((entry) => entry.messageId),
    ['m0', 'm1', 'm2'],
  );

  const cursorBeforeInvalidSelect = { ...state.cursor };
  assert.throws(() => selectPendingDeliveries(state, 'Bad Fleet'), /Invalid fleet ID/);
  assert.deepEqual(state.cursor, cursorBeforeInvalidSelect);
  assert.equal(state.messages.size, 4);
});

test('acknowledged and foreign-recipient messages are excluded from delivery', () => {
  const sent = buildFleetEvent('fleet.message.sent', {
    projectId: 'project_deadbeef', traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm1', body: 'hello', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e1', ts: '2026-07-15T15:00:00.000Z' });
  const ack = buildFleetEvent('fleet.message.acknowledged', {
    projectId: 'project_deadbeef', traceId: 't1', from: 'worker', to: 'captain',
    payload: { messageId: 'm1', recipient: 'worker', disposition: 'injected' },
  }, { id: 'e2', ts: '2026-07-15T15:00:01.000Z' });
  const state = foldFleetEvents([sent, ack], { projectId: 'project_deadbeef' });
  assert.deepEqual(selectPendingDeliveries(state, 'worker'), []);
  assert.deepEqual(selectPendingDeliveries(state, 'captain'), []);
});

test('offered and recovered tasks are selected once per live session', () => {
  const state = createFleetState('project_deadbeef');
  state.tasks.set('offered', { status: 'offered', to: 'worker', attempt: 0 });
  state.tasks.set('recovered', {
    status: 'claimed',
    to: 'worker',
    ownerId: 'worker:new',
    attemptId: 'recovered-2',
    attempt: 2,
    recovered: true,
  });
  state.tasks.set('claimed-not-recovered', {
    status: 'claimed',
    to: 'worker',
    ownerId: 'worker:new',
    attemptId: 'claimed-not-recovered-1',
    attempt: 1,
  });
  state.tasks.set('claimed-recovered-mismatched-owner', {
    status: 'claimed',
    to: 'worker',
    ownerId: 'worker:other',
    attemptId: 'claimed-recovered-mismatched-owner-2',
    attempt: 2,
    recovered: true,
  });
  state.tasks.set('completed', {
    status: 'completed',
    to: 'worker',
    ownerId: 'worker:new',
    attemptId: 'completed-1',
    attempt: 1,
  });
  state.tasks.set('failed', {
    status: 'failed',
    to: 'worker',
    ownerId: 'worker:new',
    attemptId: 'failed-1',
    attempt: 1,
  });
  const injected = new Set(['offered:offer']);
  assert.deepEqual(
    selectPendingTaskDeliveries(state, 'worker', 'worker:new', injected).map((task) => task.deliveryId),
    ['recovered-2'],
  );
});

test('recovery is safe only for nonterminal task owned by dead prior process, and terminal tasks are never recovered', () => {
  const state = createFleetState('project_deadbeef');
  state.tasks.set('audit', {
    status: 'claimed',
    to: 'worker',
    ownerId: 'worker:7:123e4567-e89b-12d3-a456-426614174000:',
    attemptId: 'audit-1',
    attempt: 1,
  });
  state.tasks.set('done', {
    status: 'completed',
    to: 'worker',
    ownerId: 'worker:7:123e4567-e89b-12d3-a456-426614174000:',
    attemptId: 'done-1',
    attempt: 1,
  });
  assert.deepEqual(deriveRecoveryActions(state, {
    fleetId: 'worker',
    ownerAlive: () => false,
    newOwnerId: 'worker:8:223e4567-e89b-12d3-a456-426614174000:',
  }), [{
    taskId: 'audit',
    status: 'recover',
    priorAttemptId: 'audit-1',
    attemptId: 'audit-2',
    ownerId: 'worker:8:223e4567-e89b-12d3-a456-426614174000:',
    reason: 'prior process dead; no terminal task event',
  }]);
  assert.equal(deriveRecoveryActions(state, {
    fleetId: 'worker', ownerAlive: () => true, newOwnerId: 'new',
  })[0].status, 'needs-review');
});

// ── October worker identity ──────────────────────────────────────────────

test('deriveOctoberWorkerId produces worker-<slug>-<hash8>, deterministic, <=48 chars', () => {
  const id = deriveOctoberWorkerId('auth-helper');
  assert.match(id, /^worker-[a-z0-9-]+-[0-9a-f]{8}$/);
  assert.equal(id, 'worker-auth-helper-131ae90f');
  assert.equal(id, deriveOctoberWorkerId('auth-helper'));
  assert.ok(id.length <= 48, `expected <=48 chars, got ${id.length}`);
});

test('deriveOctoberWorkerId survives lossy normalization collisions via hash8', () => {
  // 'Auth Helper' and 'auth-helper' normalize to the same slug 'auth-helper'
  // but hash8 differs because the hash is over the trimmed raw node, not the slug.
  const idUpper = deriveOctoberWorkerId('Auth Helper');
  const idLower = deriveOctoberWorkerId('auth-helper');
  assert.notEqual(idUpper, idLower);
  assert.equal(idUpper, 'worker-auth-helper-af2d2bb8');
  assert.equal(idLower, 'worker-auth-helper-131ae90f');
});

test('deriveOctoberWorkerId bounds long inputs to <=48 chars', () => {
  const longNode = 'x'.repeat(200);
  const id = deriveOctoberWorkerId(longNode);
  assert.ok(id.length <= 48, `expected <=48 chars, got ${id.length}`);
  assert.match(id, /^worker-x{1,32}-[0-9a-f]{8}$/);
});

test('deriveOctoberWorkerId strips trailing hyphen after slug truncation', () => {
  // 'a'.repeat(31) + ' b' normalizes to 'aaa...aaa-b' (33 chars).
  // Slicing to 32 leaves a trailing hyphen that must be stripped
  // so the ID is a valid single-hyphen kebab.
  const id = deriveOctoberWorkerId('a'.repeat(31) + ' b');
  assert.ok(id.length <= 48);
  assert.ok(!id.includes('--'), `expected no double hyphen, got ${id}`);
  assert.equal(id, 'worker-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-53f877ca');
  assert.equal(isWorkerPeerId(id), true);
});

test('deriveOctoberWorkerId throws on empty or non-normalizable input', () => {
  assert.throws(() => deriveOctoberWorkerId(''), /Invalid October node/);
  assert.throws(() => deriveOctoberWorkerId('   '), /Invalid October node/);
  assert.throws(() => deriveOctoberWorkerId('!!!'), /Invalid October node/);
  assert.throws(() => deriveOctoberWorkerId('@@@'), /Invalid October node/);
});

test('octoberNodeLeaseId is deterministic, project-scoped, full SHA-256', () => {
  const projectId = 'project_deadbeef';
  const lease = octoberNodeLeaseId(projectId, 'auth-helper');
  const expectedHash = '131ae90f0febb828a6f63ec3a5fd581f17e3a7d9fac142804c1e6d1d5ded0596';
  assert.equal(lease, `fleet-node:${projectId}:${expectedHash}`);
  assert.equal(lease, octoberNodeLeaseId(projectId, 'auth-helper'));
  assert.notEqual(lease, octoberNodeLeaseId(projectId, 'auth-helper-2'));
  assert.throws(() => octoberNodeLeaseId('', 'auth-helper'), /Invalid project ID/);
  assert.throws(() => octoberNodeLeaseId('  ', 'auth-helper'), /Invalid project ID/);
  assert.throws(() => octoberNodeLeaseId(projectId, ''), /Invalid October node/);
  assert.throws(() => octoberNodeLeaseId(projectId, '   '), /Invalid October node/);
});

test('octoberNodeLeaseId differs across projects for the same node', () => {
  const hash = '131ae90f0febb828a6f63ec3a5fd581f17e3a7d9fac142804c1e6d1d5ded0596';
  const leaseA = octoberNodeLeaseId('project_aaa', 'auth-helper');
  const leaseB = octoberNodeLeaseId('project_bbb', 'auth-helper');
  assert.notEqual(leaseA, leaseB);
  assert.equal(leaseA, `fleet-node:project_aaa:${hash}`);
  assert.equal(leaseB, `fleet-node:project_bbb:${hash}`);
});

test('isWorkerPeerId accepts exact worker and validated worker-* only', () => {
  assert.equal(isWorkerPeerId('worker'), true);
  assert.equal(isWorkerPeerId('worker-7'), true);
  assert.equal(isWorkerPeerId('worker-foo-bar'), true);

  assert.equal(isWorkerPeerId('captain'), false);
  assert.equal(isWorkerPeerId('workers'), false);
  assert.equal(isWorkerPeerId('workerish'), false);
  assert.equal(isWorkerPeerId('Worker'), false);
  assert.equal(isWorkerPeerId('worker-'), false);
  assert.equal(isWorkerPeerId(''), false);
});

test('destinationMatchesPeer group-matches worker, exact-matches everything else', () => {
  assert.equal(destinationMatchesPeer('worker', 'worker'), true);
  assert.equal(destinationMatchesPeer('worker', 'worker-7'), true);
  assert.equal(destinationMatchesPeer('worker', 'worker-foo'), true);

  assert.equal(destinationMatchesPeer('worker-7', 'worker-7'), true);
  assert.equal(destinationMatchesPeer('worker-7', 'worker'), false);
  assert.equal(destinationMatchesPeer('captain', 'captain'), true);
  assert.equal(destinationMatchesPeer('captain', 'worker'), false);
  assert.equal(destinationMatchesPeer('workers', 'workers'), true);
  assert.equal(destinationMatchesPeer('workers', 'worker'), false);
});
