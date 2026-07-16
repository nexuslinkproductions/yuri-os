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
  electFleetIdentity,
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

// ── closed schema: reject unknown keys (Gap A) ────────────────────────────

test('validateFleetEvent rejects an unknown top-level key and accepts the closed event shape', () => {
  const base = buildFleetEvent(
    'fleet.message.sent',
    {
      projectId: PROJECT_ID,
      traceId: 'trace-topkey',
      from: 'captain',
      to: 'worker',
      payload: {
        messageId: 'msg-topkey',
        body: 'hello',
        replyTo: null,
        artifactUris: [],
        authority: 'peer',
      },
    },
    { id: 'fleet_topkey', ts: '2026-01-01T00:00:00.000Z' },
  );

  // Exact closed top-level shape is accepted unchanged.
  assert.equal(validateFleetEvent(base), base);

  // A single extra top-level key is rejected even when every declared field is valid.
  const withExtra = { ...base, extra: 'sneaky' };
  assert.throws(() => validateFleetEvent(withExtra), /Unknown fleet event key/);
});

test('validateFleetEvent rejects unknown payload keys for every event kind', () => {
  const captainOwner = buildProcessOwnerId({
    fleetId: 'captain', pid: 1, processUuid: '11111111-1111-4111-8111-111111111111',
  });
  const workerOwner = buildProcessOwnerId({
    fleetId: 'worker', pid: 2, processUuid: '22222222-2222-4222-8222-222222222222',
  });

  const cases = [
    {
      kind: 'fleet.peer.joined',
      from: 'captain', to: 'worker',
      payload: { ownerId: captainOwner },
    },
    {
      kind: 'fleet.peer.left',
      from: 'worker', to: 'captain',
      payload: { ownerId: workerOwner },
    },
    {
      kind: 'fleet.message.sent',
      from: 'captain', to: 'worker',
      payload: { messageId: 'm', body: 'b', replyTo: null, artifactUris: [], authority: 'peer' },
    },
    {
      kind: 'fleet.message.acknowledged',
      from: 'worker', to: 'captain',
      payload: { messageId: 'm', recipient: 'worker', disposition: 'injected' },
    },
    {
      kind: 'fleet.task.offered',
      from: 'captain', to: 'worker',
      payload: { taskId: 'task-x', contract: { goal: 'g', acceptance: ['a'] } },
    },
    {
      kind: 'fleet.task.claimed',
      from: 'worker', to: 'captain',
      payload: { taskId: 'task-x', attemptId: 'task-x-1', ownerId: workerOwner },
    },
    {
      kind: 'fleet.task.completed',
      from: 'worker', to: 'captain',
      payload: { taskId: 'task-x', attemptId: 'task-x-1', summary: 'done', artifactUris: [] },
    },
    {
      kind: 'fleet.task.failed',
      from: 'worker', to: 'captain',
      payload: { taskId: 'task-x', attemptId: 'task-x-1', summary: 'nope', artifactUris: [] },
    },
    {
      kind: 'fleet.task.recovered',
      from: 'worker', to: 'captain',
      payload: {
        taskId: 'task-x', attemptId: 'task-x-2',
        priorAttemptId: 'task-x-1', ownerId: workerOwner, reason: 'dead',
      },
    },
  ];

  for (const { kind, from, to, payload } of cases) {
    const valid = buildFleetEvent(
      kind,
      { projectId: PROJECT_ID, traceId: 'trace-payloadkey', from, to, payload },
      { id: `fleet_payloadkey-${kind}`, ts: '2026-01-01T00:00:00.000Z' },
    );
    // Exact closed payload shape is accepted.
    assert.equal(validateFleetEvent(valid), valid);

    // A single extra payload key is rejected for this kind.
    const poisoned = { ...valid, payload: { ...valid.payload, rogueField: 1 } };
    assert.throws(
      () => validateFleetEvent(poisoned),
      /Invalid fleet event payload/,
      `kind ${kind} should reject an unknown payload key`,
    );
  }
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

  const forgedCompletion = buildFleetEvent(
    'fleet.task.completed',
    {
      projectId,
      traceId: 'trace-lifecycle',
      from: 'worker-intruder',
      to: 'captain',
      payload: {
        taskId: 'task-lifecycle',
        attemptId: 'attempt-1',
        summary: 'forged',
        artifactUris: [],
      },
    },
    { id: 'fleet_lifecycle-forged-completed', ts: '2026-01-01T00:01:30.000Z' },
  );
  const preForgedCompletionSnapshot = structuredClone({
    peers: state.peers,
    messages: state.messages,
    tasks: state.tasks,
    recentEventIds: state.recentEventIds,
    recentEventIdSet: state.recentEventIdSet,
    cursor: state.cursor,
    errors: state.errors,
  });

  assert.throws(
    () => reduceFleetEvent(state, forgedCompletion),
    /sender "worker-intruder" does not own task "task-lifecycle"/,
  );
  assert.deepStrictEqual(state.peers, preForgedCompletionSnapshot.peers);
  assert.deepStrictEqual(state.messages, preForgedCompletionSnapshot.messages);
  assert.deepStrictEqual(state.tasks, preForgedCompletionSnapshot.tasks);
  assert.deepStrictEqual(state.recentEventIds, preForgedCompletionSnapshot.recentEventIds);
  assert.deepStrictEqual(state.recentEventIdSet, preForgedCompletionSnapshot.recentEventIdSet);
  assert.deepStrictEqual(state.cursor, preForgedCompletionSnapshot.cursor);
  assert.deepStrictEqual(state.errors, preForgedCompletionSnapshot.errors);

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

test('deriveRecoveryActions returns needs-review when a claimed record has missing, non-string, or empty ownership fields', () => {
  const state = createFleetState('project_deadbeef');
  // Well-formed control: a dead prior owner on a complete record must still recover.
  state.tasks.set('well-formed', {
    status: 'claimed', to: 'worker',
    ownerId: 'worker:7:123e4567-e89b-12d3-a456-426614174000:',
    attemptId: 'well-formed-1', attempt: 1,
  });
  // ownerId omitted entirely.
  state.tasks.set('missing-owner', {
    status: 'claimed', to: 'worker', attemptId: 'missing-owner-1', attempt: 1,
  });
  // attemptId omitted entirely.
  state.tasks.set('missing-attempt', {
    status: 'claimed', to: 'worker',
    ownerId: 'worker:7:123e4567-e89b-12d3-a456-426614174000:', attempt: 1,
  });
  // ownerId present but not a string.
  state.tasks.set('null-owner', {
    status: 'claimed', to: 'worker', ownerId: null, attemptId: 'null-owner-1', attempt: 1,
  });
  // attemptId present but not a string.
  state.tasks.set('numeric-attempt', {
    status: 'claimed', to: 'worker',
    ownerId: 'worker:7:123e4567-e89b-12d3-a456-426614174000:', attemptId: 42, attempt: 1,
  });
  state.tasks.set('empty-owner', {
    status: 'claimed', to: 'worker', ownerId: '', attemptId: 'empty-owner-1', attempt: 1,
  });
  state.tasks.set('blank-attempt', {
    status: 'claimed', to: 'worker',
    ownerId: 'worker:7:123e4567-e89b-12d3-a456-426614174000:', attemptId: '   ', attempt: 1,
  });

  const actions = deriveRecoveryActions(state, {
    fleetId: 'worker',
    ownerAlive: () => false, // dead — would recover if the record were well-formed
    newOwnerId: 'worker:8:223e4567-e89b-12d3-a456-426614174000:',
  });
  const byTask = new Map(actions.map((a) => [a.taskId, a]));

  // Control: the well-formed dead task still recovers.
  assert.equal(byTask.get('well-formed').status, 'recover');

  // Every ill-formed claimed record is flagged for human review, never auto-recovered.
  for (const taskId of [
    'missing-owner',
    'missing-attempt',
    'null-owner',
    'numeric-attempt',
    'empty-owner',
    'blank-attempt',
  ]) {
    const action = byTask.get(taskId);
    assert.equal(action.status, 'needs-review', `${taskId} should be needs-review`);
    assert.ok(action.reason && action.reason.length > 0, `${taskId} should carry a reason`);
  }
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


// ── dynamic worker authorization + recipient-aware delivery (Task 3) ──────

const DYN_PROJECT = 'project_deadbeef';
const dynOwnerId = (fleetId) =>
  buildProcessOwnerId({ fleetId, pid: 1, processUuid: '123e4567-e89b-12d3-a456-426614174000' });

test('dynamic worker-* senders are authorized for worker event kinds and rejected for captain-only kinds', () => {
  // worker-* may emit a worker-authorized kind (message.sent)
  const sent = buildFleetEvent('fleet.message.sent', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'worker-delivery-a1b2', to: 'captain',
    payload: { messageId: 'm-dyn', body: 'hi', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-dyn-1', ts: '2026-07-16T00:00:00.000Z' });
  assert.equal(sent.from, 'worker-delivery-a1b2');

  // worker-* may emit another worker-authorized kind (peer.joined)
  const joined = buildFleetEvent('fleet.peer.joined', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'worker-delivery-a1b2', to: 'captain',
    payload: { ownerId: dynOwnerId('worker-delivery-a1b2') },
  }, { id: 'e-dyn-2', ts: '2026-07-16T00:00:01.000Z' });
  assert.equal(joined.from, 'worker-delivery-a1b2');

  // captain-only kind still rejects a validated worker-* sender
  assert.throws(() =>
    buildFleetEvent('fleet.task.offered', {
      projectId: DYN_PROJECT, traceId: 't1', from: 'worker-delivery-a1b2', to: 'captain',
      payload: { taskId: 'task-dyn', contract: { goal: 'g', acceptance: ['a'] } },
    }),
    /not authorized to emit/,
  );

  // near-prefix sender is rejected outright (not treated as a worker peer)
  assert.throws(() =>
    buildFleetEvent('fleet.message.sent', {
      projectId: DYN_PROJECT, traceId: 't1', from: 'workers', to: 'captain',
      payload: { messageId: 'm-near', body: 'hi', replyTo: null, artifactUris: [], authority: 'peer' },
    }),
    /not authorized to emit/,
  );
});

test('captain-only operations stay captain-only for exact worker and dynamic worker-* actors', () => {
  assert.equal(authorizeFleetOperation('captain', 'offerTask'), true);
  // exact worker still cannot offer
  assert.equal(authorizeFleetOperation('worker', 'offerTask'), false);
  // dynamic worker-* still cannot offer (captain-only preserved)
  assert.equal(authorizeFleetOperation('worker-delivery-a1b2', 'offerTask'), false);
  // dynamic worker-* gains the worker role's non-captain operations
  assert.equal(authorizeFleetOperation('worker-delivery-a1b2', 'send'), true);
  assert.equal(authorizeFleetOperation('worker-delivery-a1b2', 'claimTask'), true);
  assert.equal(authorizeFleetOperation('worker-delivery-a1b2', 'completeTask'), true);
  // near-prefix actor is refused everything
  assert.equal(authorizeFleetOperation('workers', 'send'), false);
  // captain stays unable to perform worker-only operations
  assert.equal(authorizeFleetOperation('captain', 'claimTask'), false);
});

test('a to:worker group message is pending for each worker-role peer', () => {
  const sent = buildFleetEvent('fleet.message.sent', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm-group', body: 'hi team', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-grp-1', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([sent], { projectId: DYN_PROJECT });
  assert.deepEqual(selectPendingDeliveries(state, 'worker-a').map((m) => m.messageId), ['m-group']);
  assert.deepEqual(selectPendingDeliveries(state, 'worker-b').map((m) => m.messageId), ['m-group']);
  assert.deepEqual(selectPendingDeliveries(state, 'worker').map((m) => m.messageId), ['m-group']);
  // a non-recipient peer receives nothing
  assert.deepEqual(selectPendingDeliveries(state, 'captain'), []);
});

test('an acknowledgement from worker-a does not suppress delivery to worker-b', () => {
  const sent = buildFleetEvent('fleet.message.sent', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm-group', body: 'hi team', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-ack-1', ts: '2026-07-16T00:00:00.000Z' });
  const ack = buildFleetEvent('fleet.message.acknowledged', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'worker-a', to: 'captain',
    payload: { messageId: 'm-group', recipient: 'worker-a', disposition: 'injected' },
  }, { id: 'e-ack-2', ts: '2026-07-16T00:00:01.000Z' });
  const state = foldFleetEvents([sent, ack], { projectId: DYN_PROJECT });
  // acker is excluded
  assert.deepEqual(selectPendingDeliveries(state, 'worker-a'), []);
  // the other worker peer still owes the message
  assert.deepEqual(selectPendingDeliveries(state, 'worker-b').map((m) => m.messageId), ['m-group']);
  // legacy boolean still flips once any recipient acks
  assert.equal(state.messages.get('m-group').acknowledged, true);
});

test('a direct to:worker-* message delivers only to that exact peer', () => {
  const sent = buildFleetEvent('fleet.message.sent', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'captain', to: 'worker-delivery-a1b2',
    payload: { messageId: 'm-direct', body: 'only you', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-dir-1', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([sent], { projectId: DYN_PROJECT });
  assert.deepEqual(selectPendingDeliveries(state, 'worker-delivery-a1b2').map((m) => m.messageId), ['m-direct']);
  // other worker peers do not receive a direct address
  assert.deepEqual(selectPendingDeliveries(state, 'worker-b'), []);
  assert.deepEqual(selectPendingDeliveries(state, 'worker'), []);
});

test('near-prefix destinations like "workers" exact-match only and never group-match', () => {
  const toWorkers = buildFleetEvent('fleet.message.sent', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'captain', to: 'workers',
    payload: { messageId: 'm-workers', body: 'x', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-near-1', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([toWorkers], { projectId: DYN_PROJECT });
  // 'workers' is an exact destination, not a group — only a peer literally named 'workers' gets it
  assert.deepEqual(selectPendingDeliveries(state, 'workers').map((m) => m.messageId), ['m-workers']);
  assert.deepEqual(selectPendingDeliveries(state, 'worker'), []);
  assert.deepEqual(selectPendingDeliveries(state, 'worker-a'), []);
});

test('a to:worker task offer is selectable by each worker-role peer', () => {
  const offered = buildFleetEvent('fleet.task.offered', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'captain', to: 'worker',
    payload: { taskId: 'task-group', contract: { goal: 'g', acceptance: ['a'] } },
  }, { id: 'e-tgrp-1', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([offered], { projectId: DYN_PROJECT });
  assert.deepEqual(
    selectPendingTaskDeliveries(state, 'worker-a', dynOwnerId('worker-a')).map((t) => t.deliveryId),
    ['task-group:offer'],
  );
  assert.deepEqual(
    selectPendingTaskDeliveries(state, 'worker-b', dynOwnerId('worker-b')).map((t) => t.deliveryId),
    ['task-group:offer'],
  );
});

test('a direct to:worker-* task offer selects only for that exact peer', () => {
  const offered = buildFleetEvent('fleet.task.offered', {
    projectId: DYN_PROJECT, traceId: 't1', from: 'captain', to: 'worker-delivery-a1b2',
    payload: { taskId: 'task-direct', contract: { goal: 'g', acceptance: ['a'] } },
  }, { id: 'e-tdir-1', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([offered], { projectId: DYN_PROJECT });
  assert.deepEqual(
    selectPendingTaskDeliveries(state, 'worker-delivery-a1b2', dynOwnerId('worker-delivery-a1b2')).map((t) => t.deliveryId),
    ['task-direct:offer'],
  );
  // a different worker peer does not see a direct task offer
  assert.deepEqual(
    selectPendingTaskDeliveries(state, 'worker-b', dynOwnerId('worker-b')),
    [],
  );
});

// ── October fleet identity election (electFleetIdentity) ─────────────────

const ELECTION_PROJECT = 'project_election';
const ELECTION_OWNER = buildProcessOwnerId({
  fleetId: 'election-fixture', pid: 7,
  processUuid: '11111111-1111-4111-8111-111111111111',
});
const OTHER_OWNER = buildProcessOwnerId({
  fleetId: 'other-process', pid: 99,
  processUuid: '22222222-2222-4222-8222-222222222222',
});

// In-memory lease substrate: tracks held leases and an ordered op log so
// tests assert not only outcomes but also that no lease was touched when
// validation should have short-circuited.
function makeLeaseSubstrate() {
  const held = new Map();
  const ops = [];
  return {
    ops,
    acquire(id, owner, { ttlMs } = {}) {
      ops.push({ op: 'acquire', id, owner });
      const existing = held.get(id);
      if (existing && existing.owner !== owner) {
        return { ok: false, reason: 'live-holder', heldBy: existing.owner, since: existing.since };
      }
      held.set(id, { owner, since: Date.now(), ttlMs });
      return { ok: true };
    },
    release(id, owner) {
      ops.push({ op: 'release', id, owner });
      const existing = held.get(id);
      if (existing && existing.owner === owner) held.delete(id);
      return true;
    },
  };
}

test('electFleetIdentity explicit override wins and skips October leases entirely', () => {
  const substrate = makeLeaseSubstrate();
  const result = electFleetIdentity({
    projectId: ELECTION_PROJECT,
    ownerId: ELECTION_OWNER,
    explicitFleetId: 'my-explicit-fleet',
    octoberNode: 'backend',
    acquireLease: substrate.acquire,
    releaseLease: substrate.release,
  });
  assert.equal(result.fleetId, 'my-explicit-fleet');
  assert.equal(result.identitySource, 'explicit');
  assert.equal(result.peerLeaseId, peerLeaseId(ELECTION_PROJECT, 'my-explicit-fleet'));
  assert.equal(result.nodeLeaseId, undefined);
  // Only the explicit peer lease was acquired — October never touched.
  const acquireIds = substrate.ops.filter(o => o.op === 'acquire').map(o => o.id);
  assert.deepEqual(acquireIds, [peerLeaseId(ELECTION_PROJECT, 'my-explicit-fleet')]);
});

test('electFleetIdentity auto captain acquires node then captain lease', () => {
  const substrate = makeLeaseSubstrate();
  const result = electFleetIdentity({
    projectId: ELECTION_PROJECT,
    ownerId: ELECTION_OWNER,
    octoberNode: 'backend',
    acquireLease: substrate.acquire,
    releaseLease: substrate.release,
  });
  assert.equal(result.fleetId, 'captain');
  assert.equal(result.identitySource, 'october-auto');
  assert.equal(result.nodeLeaseId, octoberNodeLeaseId(ELECTION_PROJECT, 'backend'));
  assert.equal(result.peerLeaseId, peerLeaseId(ELECTION_PROJECT, 'captain'));
});

test('electFleetIdentity auto worker derives worker ID when captain is live-held', () => {
  const substrate = makeLeaseSubstrate();
  // Pre-hold the captain lease by another owner.
  substrate.acquire(
    peerLeaseId(ELECTION_PROJECT, 'captain'), OTHER_OWNER,
    { ttlMs: FLEET_LIMITS.peerLeaseTtlMs },
  );

  const result = electFleetIdentity({
    projectId: ELECTION_PROJECT,
    ownerId: ELECTION_OWNER,
    octoberNode: 'frontend',
    acquireLease: substrate.acquire,
    releaseLease: substrate.release,
  });
  const expectedWorker = deriveOctoberWorkerId('frontend');
  assert.equal(result.fleetId, expectedWorker);
  assert.equal(result.identitySource, 'october-auto');
  assert.equal(result.nodeLeaseId, octoberNodeLeaseId(ELECTION_PROJECT, 'frontend'));
  assert.equal(result.peerLeaseId, peerLeaseId(ELECTION_PROJECT, expectedWorker));
});

test('electFleetIdentity duplicate node throws without attempting captain', () => {
  const substrate = makeLeaseSubstrate();
  const nodeLease = octoberNodeLeaseId(ELECTION_PROJECT, 'backend');
  // Pre-hold the node lease by another process.
  substrate.acquire(nodeLease, OTHER_OWNER, { ttlMs: FLEET_LIMITS.peerLeaseTtlMs });

  assert.throws(
    () => electFleetIdentity({
      projectId: ELECTION_PROJECT,
      ownerId: ELECTION_OWNER,
      octoberNode: 'backend',
      acquireLease: substrate.acquire,
      releaseLease: substrate.release,
    }),
    (err) => err.message.includes(nodeLease) && err.message.includes('live-holder'),
  );
  // Captain was never attempted — the election's own acquire log is
  // exactly [nodeLease] (the pre-hold setup call is by OTHER_OWNER).
  const acquireIds = substrate.ops
    .filter(o => o.op === 'acquire' && o.owner === ELECTION_OWNER)
    .map(o => o.id);
  assert.deepEqual(acquireIds, [nodeLease]);
});

test('electFleetIdentity neither explicit nor October throws Invalid fleet ID', () => {
  const substrate = makeLeaseSubstrate();
  assert.throws(
    () => electFleetIdentity({
      projectId: ELECTION_PROJECT,
      ownerId: ELECTION_OWNER,
      acquireLease: substrate.acquire,
      releaseLease: substrate.release,
    }),
    { message: 'Invalid fleet ID' },
  );
  assert.equal(substrate.ops.length, 0);
});

test('electFleetIdentity invalid node with free captain throws before any lease acquisition', () => {
  const substrate = makeLeaseSubstrate();
  // '!!!' trims to non-empty but slug-normalizes to empty — invalid, yet
  // octoberNodeLeaseId alone would accept it (only checks trim). The fix
  // ensures deriveOctoberWorkerId validates BEFORE the node lease is acquired.
  assert.throws(
    () => electFleetIdentity({
      projectId: ELECTION_PROJECT,
      ownerId: ELECTION_OWNER,
      octoberNode: '!!!',
      acquireLease: substrate.acquire,
      releaseLease: substrate.release,
    }),
    { message: 'Invalid October node' },
  );
  // Validation short-circuited BEFORE any lease acquisition — zero ops.
  assert.equal(substrate.ops.length, 0);
});

test('electFleetIdentity non-live captain contention throws without worker fallback', () => {
  const substrate = makeLeaseSubstrate();
  const nodeLease = octoberNodeLeaseId(ELECTION_PROJECT, 'backend');
  const captainLease = peerLeaseId(ELECTION_PROJECT, 'captain');

  // Custom acquire: node succeeds, captain fails with a NON-live reason.
  const acquireCalls = [];
  const acquireLease = (id, owner, opts) => {
    acquireCalls.push(id);
    if (id === captainLease) {
      return { ok: false, reason: 'reacquire-race', heldBy: 'unknown' };
    }
    return substrate.acquire(id, owner, opts);
  };

  assert.throws(
    () => electFleetIdentity({
      projectId: ELECTION_PROJECT,
      ownerId: ELECTION_OWNER,
      octoberNode: 'backend',
      acquireLease,
      releaseLease: substrate.release,
    }),
    (err) => err.message.includes(captainLease) && err.message.includes('reacquire-race'),
  );
  // Worker lease was never attempted.
  const workerLease = peerLeaseId(ELECTION_PROJECT, deriveOctoberWorkerId('backend'));
  assert.ok(!acquireCalls.includes(workerLease), 'worker lease was never attempted');
  // Node lease was rolled back on failure.
  assert.ok(
    substrate.ops.some(o => o.op === 'release' && o.id === nodeLease),
    'node lease was released on failure',
  );
});

// ── reducer resource authorization (Sentinel gaps) ──────────────────────

const RES_PROJECT = 'project_deadbeef';
const resOwner = (fleetId, pid) =>
  buildProcessOwnerId({ fleetId, pid, processUuid: '11111111-1111-4111-8111-111111111111' });

test('applyMessageAcknowledged rejects a forged cross-recipient ack and preserves state', () => {
  const sent = buildFleetEvent('fleet.message.sent', {
    projectId: RES_PROJECT, traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm-forged', body: 'b', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-forged-sent', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([sent], { projectId: RES_PROJECT });

  // worker-b forges an ack claiming worker-a acknowledged the message.
  const forgedAck = buildFleetEvent('fleet.message.acknowledged', {
    projectId: RES_PROJECT, traceId: 't1', from: 'worker-b', to: 'captain',
    payload: { messageId: 'm-forged', recipient: 'worker-a', disposition: 'injected' },
  }, { id: 'e-forged-ack', ts: '2026-07-16T00:00:01.000Z' });

  const snapshot = structuredClone(state.messages);
  assert.throws(() => reduceFleetEvent(state, forgedAck), /is not recipient/);
  assert.deepStrictEqual(state.messages, snapshot);
  assert.equal(state.cursor.afterId, 'e-forged-sent');
  assert.equal(state.recentEventIdSet.has('e-forged-ack'), false);
});

test('applyMessageSent rejects a duplicate messageId and preserves prior ack state', () => {
  const sent = buildFleetEvent('fleet.message.sent', {
    projectId: RES_PROJECT, traceId: 't1', from: 'captain', to: 'worker',
    payload: { messageId: 'm-dup', body: 'first', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-dup-1', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([sent], { projectId: RES_PROJECT });

  const ack = buildFleetEvent('fleet.message.acknowledged', {
    projectId: RES_PROJECT, traceId: 't1', from: 'worker', to: 'captain',
    payload: { messageId: 'm-dup', recipient: 'worker', disposition: 'injected' },
  }, { id: 'e-dup-ack', ts: '2026-07-16T00:00:01.000Z' });
  reduceFleetEvent(state, ack);
  assert.equal(state.messages.get('m-dup').acknowledged, true);

  // A second sent event with the same messageId must not overwrite/reset ack state.
  const resend = buildFleetEvent('fleet.message.sent', {
    projectId: RES_PROJECT, traceId: 't2', from: 'captain', to: 'worker',
    payload: { messageId: 'm-dup', body: 'hijack', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'e-dup-2', ts: '2026-07-16T00:00:02.000Z' });

  const snapshot = structuredClone(state.messages);
  assert.throws(() => reduceFleetEvent(state, resend), /already exists/);
  assert.deepStrictEqual(state.messages, snapshot);
  assert.equal(state.messages.get('m-dup').acknowledged, true);
  assert.equal(state.messages.get('m-dup').body, 'first');
  assert.equal(state.recentEventIdSet.has('e-dup-2'), false);
});

test('applyTaskClaimed and applyTaskRecovered reject a sender who is not the task recipient', () => {
  // Direct offer to worker-a only — isolates the destination check.
  const offered = buildFleetEvent('fleet.task.offered', {
    projectId: RES_PROJECT, traceId: 't1', from: 'captain', to: 'worker-a',
    payload: { taskId: 'task-r2', contract: { goal: 'g', acceptance: ['a'] } },
  }, { id: 'e-r2-offer', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([offered], { projectId: RES_PROJECT });

  // worker-b (ownerId fleetId worker-b, so only the destination check fails) claims worker-a's task.
  const wrongClaim = buildFleetEvent('fleet.task.claimed', {
    projectId: RES_PROJECT, traceId: 't1', from: 'worker-b', to: 'captain',
    payload: { taskId: 'task-r2', attemptId: 'task-r2-1', ownerId: resOwner('worker-b', 2) },
  }, { id: 'e-r2-claim', ts: '2026-07-16T00:00:01.000Z' });
  const claimSnap = structuredClone(state.tasks);
  assert.throws(() => reduceFleetEvent(state, wrongClaim), /not a recipient/);
  assert.deepStrictEqual(state.tasks, claimSnap);

  // Recover path: a claimed task scoped to worker-a cannot be recovered by worker-b.
  state.tasks.set('task-r2-recover', {
    status: 'claimed', to: 'worker-a', ownerId: resOwner('worker-a', 3),
    attemptId: 'task-r2-recover-1', attempt: 1,
  });
  const wrongRecover = buildFleetEvent('fleet.task.recovered', {
    projectId: RES_PROJECT, traceId: 't1', from: 'worker-b', to: 'captain',
    payload: {
      taskId: 'task-r2-recover', attemptId: 'task-r2-recover-2',
      priorAttemptId: 'task-r2-recover-1', ownerId: resOwner('worker-b', 2), reason: 'dead',
    },
  }, { id: 'e-r2-recover', ts: '2026-07-16T00:00:02.000Z' });
  const recoverSnap = structuredClone(state.tasks);
  assert.throws(() => reduceFleetEvent(state, wrongRecover), /not a recipient/);
  assert.deepStrictEqual(state.tasks, recoverSnap);
});

test('applyTaskClaimed and applyTaskRecovered reject an ownerId whose fleetId is not the sender', () => {
  // Group offer to worker — any worker passes the destination check, isolating the fleetId check.
  const offered = buildFleetEvent('fleet.task.offered', {
    projectId: RES_PROJECT, traceId: 't1', from: 'captain', to: 'worker',
    payload: { taskId: 'task-r3', contract: { goal: 'g', acceptance: ['a'] } },
  }, { id: 'e-r3-offer', ts: '2026-07-16T00:00:00.000Z' });
  const state = foldFleetEvents([offered], { projectId: RES_PROJECT });

  // worker-b claims but attributes ownership to worker-a's process.
  const wrongClaim = buildFleetEvent('fleet.task.claimed', {
    projectId: RES_PROJECT, traceId: 't1', from: 'worker-b', to: 'captain',
    payload: { taskId: 'task-r3', attemptId: 'task-r3-1', ownerId: resOwner('worker-a', 4) },
  }, { id: 'e-r3-claim', ts: '2026-07-16T00:00:01.000Z' });
  const claimSnap = structuredClone(state.tasks);
  assert.throws(() => reduceFleetEvent(state, wrongClaim), /fleetId does not match/);
  assert.deepStrictEqual(state.tasks, claimSnap);

  // Recover path: worker-b recovers a group task but claims worker-a's ownerId.
  state.tasks.set('task-r3-recover', {
    status: 'claimed', to: 'worker', ownerId: resOwner('worker-a', 5),
    attemptId: 'task-r3-recover-1', attempt: 1,
  });
  const wrongRecover = buildFleetEvent('fleet.task.recovered', {
    projectId: RES_PROJECT, traceId: 't1', from: 'worker-b', to: 'captain',
    payload: {
      taskId: 'task-r3-recover', attemptId: 'task-r3-recover-2',
      priorAttemptId: 'task-r3-recover-1', ownerId: resOwner('worker-a', 5), reason: 'dead',
    },
  }, { id: 'e-r3-recover', ts: '2026-07-16T00:00:02.000Z' });
  const recoverSnap = structuredClone(state.tasks);
  assert.throws(() => reduceFleetEvent(state, wrongRecover), /fleetId does not match/);
  assert.deepStrictEqual(state.tasks, recoverSnap);
});

// ── election precedence lock-in (coverage gaps) ──────────────────────────

test('electFleetIdentity invalid explicit with valid October fails without fallback or lease', () => {
  const substrate = makeLeaseSubstrate();
  assert.throws(
    () => electFleetIdentity({
      projectId: ELECTION_PROJECT, ownerId: ELECTION_OWNER,
      explicitFleetId: 'Bad Fleet', octoberNode: 'backend',
      acquireLease: substrate.acquire, releaseLease: substrate.release,
    }),
    { message: 'Invalid fleet ID' },
  );
  // validateFleetId threw BEFORE any lease acquisition — no fallback to October.
  assert.equal(substrate.ops.length, 0);
});

test('electFleetIdentity duplicate node while captain is live-held fails before any worker lease', () => {
  const substrate = makeLeaseSubstrate();
  const nodeLease = octoberNodeLeaseId(ELECTION_PROJECT, 'backend');
  const captainLease = peerLeaseId(ELECTION_PROJECT, 'captain');
  const workerLease = peerLeaseId(ELECTION_PROJECT, deriveOctoberWorkerId('backend'));
  // Pre-hold BOTH the node and the captain lease by another process — the
  // captain-live-held path would normally route to worker fallback.
  substrate.acquire(nodeLease, OTHER_OWNER, { ttlMs: FLEET_LIMITS.peerLeaseTtlMs });
  substrate.acquire(captainLease, OTHER_OWNER, { ttlMs: FLEET_LIMITS.peerLeaseTtlMs });

  assert.throws(
    () => electFleetIdentity({
      projectId: ELECTION_PROJECT, ownerId: ELECTION_OWNER,
      octoberNode: 'backend',
      acquireLease: substrate.acquire, releaseLease: substrate.release,
    }),
    (err) => err.message.includes(nodeLease) && err.message.includes('live-holder'),
  );
  // Node-duplicate short-circuited before captain/worker: only the node lease
  // was attempted by ELECTION_OWNER, and the worker lease was never touched.
  const acquireIds = substrate.ops
    .filter((o) => o.op === 'acquire' && o.owner === ELECTION_OWNER)
    .map((o) => o.id);
  assert.deepEqual(acquireIds, [nodeLease]);
  assert.ok(!substrate.ops.some((o) => o.id === workerLease), 'worker lease was never attempted');
});

test('validateTaskOfferedPayload rejects an unknown contract key (closed contract shape)', () => {
  const valid = buildFleetEvent(
    'fleet.task.offered',
    {
      projectId: PROJECT_ID, traceId: 'trace-contractkey', from: 'captain', to: 'worker',
      payload: { taskId: 'task-c', contract: { goal: 'g', acceptance: ['a'] } },
    },
    { id: 'fleet_contractkey', ts: '2026-01-01T00:00:00.000Z' },
  );
  assert.equal(validateFleetEvent(valid), valid);
  // A contract carrying an extra key is rejected — the contract is a closed shape.
  const poisoned = {
    ...valid,
    payload: { ...valid.payload, contract: { ...valid.payload.contract, rogue: 1 } },
  };
  assert.throws(() => validateFleetEvent(poisoned), /Invalid fleet event payload/);
});

// ── defect 3: recovery evidence preservation ──────────────────────────────

test('deriveRecoveryActions preserves prior owner/attempt evidence on needs-review', () => {
  const state = createFleetState('project_deadbeef');
  const priorOwner = 'worker:7:123e4567-e89b-12d3-a456-426614174000:';
  // Alive prior owner on a well-formed record → needs-review WITH evidence.
  state.tasks.set('alive-task', {
    status: 'claimed', to: 'worker',
    ownerId: priorOwner, attemptId: 'alive-task-1', attempt: 1,
  });
  // Partially ill-formed: valid ownerId, empty attemptId → preserve ownerId
  // evidence only (never fabricate an attemptId).
  state.tasks.set('partial-attempt', {
    status: 'claimed', to: 'worker', ownerId: priorOwner, attemptId: '', attempt: 1,
  });
  // Partially ill-formed: valid attemptId, missing ownerId → preserve
  // attemptId evidence only (never fabricate an ownerId).
  state.tasks.set('partial-owner', {
    status: 'claimed', to: 'worker', attemptId: 'partial-owner-1', attempt: 1,
  });

  const actions = deriveRecoveryActions(state, {
    fleetId: 'worker',
    ownerAlive: (id) => id === priorOwner, // alive-task alive; others dead
    newOwnerId: 'worker:8:223e4567-e89b-12d3-a456-426614174000:',
  });
  const byTask = new Map(actions.map((a) => [a.taskId, a]));

  // Alive prior owner: needs-review carrying the EXACT prior owner/attempt.
  const alive = byTask.get('alive-task');
  assert.equal(alive.status, 'needs-review');
  assert.equal(alive.ownerId, priorOwner, 'alive needs-review preserves ownerId');
  assert.equal(alive.priorAttemptId, 'alive-task-1', 'alive needs-review preserves priorAttemptId');

  // Partial: ownerId valid, attemptId empty → preserve ownerId only.
  const partialAttempt = byTask.get('partial-attempt');
  assert.equal(partialAttempt.status, 'needs-review');
  assert.equal(partialAttempt.ownerId, priorOwner, 'partial preserves valid ownerId');
  assert.ok(!('priorAttemptId' in partialAttempt), 'no fabricated priorAttemptId');

  // Partial: attemptId valid, ownerId missing → preserve attemptId only.
  const partialOwner = byTask.get('partial-owner');
  assert.equal(partialOwner.status, 'needs-review');
  assert.equal(partialOwner.priorAttemptId, 'partial-owner-1', 'partial preserves valid attemptId');
  assert.ok(!('ownerId' in partialOwner), 'no fabricated ownerId');
});

// ── defect 4: closed-schema validation never mutates caller objects ────────

test('validateFleetEvent and buildFleetEvent never mutate the caller objects', () => {
  const payload = {
    messageId: 'msg-nomut', body: 'hi', replyTo: null, artifactUris: [], authority: 'peer',
  };
  const event = {
    id: 'fleet_nomut', ts: '2026-01-01T00:00:00.000Z', schemaVersion: FLEET_PROTOCOL_VERSION,
    kind: 'fleet.message.sent', projectId: PROJECT_ID, traceId: 'trace-nomut',
    from: 'captain', to: 'worker', payload,
  };
  const eventSnapshot = JSON.parse(JSON.stringify(event));
  const payloadSnapshot = JSON.parse(JSON.stringify(payload));
  // validateFleetEvent returns the event unchanged and must not mutate it.
  assert.equal(validateFleetEvent(event), event);
  assert.deepEqual(event, eventSnapshot, 'event object untouched');
  assert.deepEqual(payload, payloadSnapshot, 'payload object untouched');

  // An event carrying an unknown key is REJECTED but still not mutated.
  const poisoned = { ...event, rogue: 1 };
  const poisonedSnapshot = JSON.parse(JSON.stringify(poisoned));
  assert.throws(() => validateFleetEvent(poisoned), /Unknown fleet event key/);
  assert.deepEqual(poisoned, poisonedSnapshot, 'rejected event object untouched');

  // buildFleetEvent must not mutate its `fields` argument either.
  const fields = {
    projectId: PROJECT_ID, traceId: 'trace-build-nomut', from: 'captain', to: 'worker',
    payload: { taskId: 'task-nomut', contract: { goal: 'g', acceptance: ['a'] } },
  };
  const fieldsSnapshot = JSON.parse(JSON.stringify(fields));
  buildFleetEvent('fleet.task.offered', fields, { id: 'fleet_build_nomut', ts: '2026-01-01T00:00:00.000Z' });
  assert.deepEqual(fields, fieldsSnapshot, 'buildFleetEvent fields argument untouched');
});
