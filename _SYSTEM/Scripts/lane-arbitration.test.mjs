import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendKagamiEvent, readKagamiEvents } from './kagami-event-bus.mjs';
import {
  arbitrateLatestLaneEvidence,
  evaluateCapturedLaneEvidence,
  findLatestCapturedLaneEvent,
  parseWorkerCaptureEvidence,
  resolveEvidencePath,
} from './lane-arbitration.mjs';
import { writeWorkerCaptureEvidence } from './worker-capture-once.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'yuri-lane-arbitration-'));
}

function seedCapture({ repoRoot, eventRoot, taskId = 'task-1', text = 'YURI_OK', model = 'sonnet' }) {
  const evidence = writeWorkerCaptureEvidence({
    root: repoRoot,
    worker: 'claude',
    taskId,
    model,
    text,
    ts: '2026-05-26T00:00:00.000Z',
  });
  return appendKagamiEvent('LANE_OUTPUT_DELTA', {
    source: 'worker-capture-once',
    worker: 'claude',
    lane: 'claude',
    session: 'marcel-claude',
    taskId,
    model,
    ok: true,
    status: 'captured',
    captureHash: evidence.captureHash,
    evidenceRefs: [evidence.relPath],
  }, { root: eventRoot });
}

test('capture parser separates headers from captured body', () => {
  const parsed = parseWorkerCaptureEvidence('taskId: abc\ncaptureHash: hash\n\nbody text');

  assert.equal(parsed.headers.taskId, 'abc');
  assert.equal(parsed.body, 'body text');
});

test('evidence path resolver rejects protected refs and escapes', () => {
  assert.throws(() => resolveEvidencePath('.claude/state/x', { repoRoot: '/tmp/yuri' }), /protected/);
  assert.throws(() => resolveEvidencePath('../escape.txt', { repoRoot: '/tmp/yuri' }), /escapes repo root/);
});

test('arbitration accepts captured evidence with expected marker and dedupes repeat runs', () => {
  const repoRoot = tempRoot();
  const eventRoot = path.join(repoRoot, 'kagami');
  try {
    seedCapture({ repoRoot, eventRoot, text: 'Rick output\nYURI_ARBITRATION_OK\n' });

    const result = arbitrateLatestLaneEvidence({
      eventRoot,
      repoRoot,
      worker: 'claude',
      expected: 'YURI_ARBITRATION_OK',
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'accepted');

    const duplicate = arbitrateLatestLaneEvidence({
      eventRoot,
      repoRoot,
      worker: 'claude',
      expected: 'YURI_ARBITRATION_OK',
    });
    assert.equal(duplicate.deduped, true);

    const events = readKagamiEvents({ root: eventRoot });
    assert.equal(events.filter((event) => event.kind === 'CODEX_VERIFICATION_PASSED').length, 1);
    assert.equal(events.at(-1).payload.model, 'sonnet');
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('arbitration rejects capture evidence when expected marker is absent', () => {
  const repoRoot = tempRoot();
  const eventRoot = path.join(repoRoot, 'kagami');
  try {
    const captureEvent = seedCapture({ repoRoot, eventRoot, text: 'still deliberating' });
    const evaluation = evaluateCapturedLaneEvidence(captureEvent, {
      repoRoot,
      expected: 'YURI_ARBITRATION_OK',
    });
    assert.equal(evaluation.ok, false);
    assert.ok(evaluation.issues.includes('expected marker not found in capture body'));

    const result = arbitrateLatestLaneEvidence({
      eventRoot,
      repoRoot,
      worker: 'claude',
      expected: 'YURI_ARBITRATION_OK',
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'rejected');
    assert.equal(readKagamiEvents({ root: eventRoot }).at(-1).kind, 'CODEX_VERIFICATION_FAILED');
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('latest capture lookup can target a task id', () => {
  const repoRoot = tempRoot();
  const eventRoot = path.join(repoRoot, 'kagami');
  try {
    seedCapture({ repoRoot, eventRoot, taskId: 'first', text: 'one' });
    seedCapture({ repoRoot, eventRoot, taskId: 'second', text: 'two' });
    const events = readKagamiEvents({ root: eventRoot });

    assert.equal(findLatestCapturedLaneEvent(events, { worker: 'claude' }).payload.taskId, 'second');
    assert.equal(findLatestCapturedLaneEvent(events, { worker: 'claude', taskId: 'first' }).payload.taskId, 'first');
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
