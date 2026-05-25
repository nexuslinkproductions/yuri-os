import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildWorkerCaptureEvidence,
  sanitizeCaptureToken,
  writeWorkerCaptureEvidence,
} from './worker-capture-once.mjs';

test('worker capture evidence sanitizes file tokens', () => {
  assert.equal(sanitizeCaptureToken('../claude live lane'), 'claude-live-lane');
  assert.equal(sanitizeCaptureToken('', 'fallback'), 'fallback');
});

test('worker capture evidence writes runtime file under _SYSTEM/state', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'yuri-worker-capture-'));
  try {
    const evidence = writeWorkerCaptureEvidence({
      root,
      worker: 'claude',
      taskId: 'task/one',
      model: 'sonnet',
      text: 'YURI_GOVERNED_AUTONOMY_SMOKE_OK',
      ts: '2026-05-25T00:00:00.000Z',
    });

    assert.equal(evidence.relPath, path.join('_SYSTEM', 'state', 'worker-captures', 'claude-task-one.txt'));
    assert.equal(evidence.bytes, Buffer.byteLength('YURI_GOVERNED_AUTONOMY_SMOKE_OK', 'utf8'));
    assert.equal(evidence.model, 'sonnet');
    assert.match(evidence.captureHash, /^[a-f0-9]{64}$/);
    const text = readFileSync(evidence.absPath, 'utf8');
    assert.match(text, /model: sonnet/);
    assert.match(text, /YURI_GOVERNED_AUTONOMY_SMOKE_OK/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('worker capture evidence builder does not use protected paths', () => {
  const evidence = buildWorkerCaptureEvidence({
    root: '/tmp/yuri-root',
    worker: 'claude',
    taskId: 'abc',
    text: 'ok',
  });

  assert.equal(evidence.relPath.startsWith('.claude/'), false);
  assert.equal(evidence.relPath.includes('backend/data'), false);
});
