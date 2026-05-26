import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildWorkcellCaptureArtifact,
  readCaptureFile,
  writeWorkcellCaptureArtifact,
} from './yuri-workcell-capture.mjs';

test('workcell capture artifact sanitizes run and role paths', () => {
  const artifact = buildWorkcellCaptureArtifact({
    root: '/tmp/yuri-root',
    runId: '../math prime run',
    role: 'supercharger / prime',
    worker: 'rick-prime',
    text: 'Prime finding: approve',
    ts: '2026-05-26T10:00:00.000Z',
  });

  assert.equal(artifact.runId, 'math-prime-run');
  assert.equal(artifact.role, 'supercharger-prime');
  assert.equal(
    artifact.relOutputPath,
    path.join('_SYSTEM', 'state', 'workcell', 'math-prime-run', 'supercharger-prime', 'output.json'),
  );
  assert.match(artifact.captureHash, /^[a-f0-9]{64}$/);
  assert.equal(artifact.output.memorySignals.proposals.length, 0);
  assert.deepEqual(artifact.output.evidenceRefs, [artifact.relCapturePath]);
});

test('workcell capture artifact writes output json and raw capture markdown', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'yuri-workcell-capture-'));
  try {
    const artifact = writeWorkcellCaptureArtifact({
      root,
      runId: 'run-1',
      role: 'supercharger',
      worker: 'rick-prime',
      model: 'claude-opus',
      source: 'tmux:%3',
      text: 'remaining_findings:\\n- none\\nverdict:\\n- approve',
      ts: '2026-05-26T10:00:00.000Z',
    });

    const output = JSON.parse(readFileSync(artifact.absOutputPath, 'utf8'));
    const markdown = readFileSync(artifact.absCapturePath, 'utf8');

    assert.equal(output.schema, 'yuri.workcell.output.v0');
    assert.equal(output.captureSchema, 'yuri.workcell.capture.v0');
    assert.equal(output.role, 'supercharger');
    assert.equal(output.model, 'claude-opus');
    assert.equal(output.source, 'tmux:%3');
    assert.match(markdown, /schema: yuri\.workcell\.capture\.v0/);
    assert.match(markdown, /remaining_findings:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workcell capture refuses protected capture inputs', () => {
  assert.throws(
    () => readCaptureFile(path.resolve('.env')),
    /protected path/,
  );
});

test('workcell capture reads safe repo-local capture inputs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'yuri-workcell-input-'));
  try {
    const file = path.join(root, 'safe-capture.txt');
    writeFileSync(file, 'captured worker output');
    assert.equal(readCaptureFile(file, root), 'captured worker output');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
