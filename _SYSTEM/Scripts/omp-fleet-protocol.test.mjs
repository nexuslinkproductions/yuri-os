import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FLEET_LIMITS,
  canonicalProjectId,
  validateFleetId,
  buildProcessOwnerId,
  peerLeaseId,
  taskLeaseId,
  parseProcessOwnerId,
} from './omp-fleet-protocol.mjs';

// ── isolated temp root ──────────────────────────────────────────────────

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-fleet-protocol-'));

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
