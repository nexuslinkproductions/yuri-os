import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  detectLaneMentions,
  detectShellBlocks,
  evaluateExecutionRails,
  evaluateHealthRails,
  evaluateInputRails,
  evaluateOutputRails,
  evaluateRetrievalRails,
  evaluateToolInputRails,
  writeRailViolation,
} from './rails.mjs';

test('input rail detects slash commands, lane mentions, and shell blocks', () => {
  const input = '/goal @shintai\n```bash\nnode --check _SYSTEM/Scripts/rick-repl.mjs\n```';
  const result = evaluateInputRails(input, { noexec: true });

  assert.equal(result.ok, true);
  assert.equal(result.severity, 'warn');
  assert.equal(result.evidence.slashCommand, '/goal');
  assert.deepEqual(result.evidence.laneMentions, ['@shintai']);
  assert.deepEqual(detectLaneMentions(input), ['@shintai']);
  assert.deepEqual(detectShellBlocks(input), ['node --check _SYSTEM/Scripts/rick-repl.mjs']);
});

test('retrieval rail blocks protected surfaces', () => {
  const protectedPath = ['.claude', 'state', 'pulse-bus.jsonl'].join('/');
  const result = evaluateRetrievalRails({ path: protectedPath });

  assert.equal(result.ok, false);
  assert.equal(result.severity, 'block');
  assert.match(result.reasons.join('\n'), /protected retrieval path denied/);
});

test('execution rail blocks destructive shell commands and protected targets', () => {
  const protectedPath = ['backend', 'data', 'snapshot.db'].join('/');
  const result = evaluateExecutionRails({
    kind: 'shell',
    command: `git commit -am test && cat ${protectedPath}`,
  });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /git-commit/);
  assert.match(result.reasons.join('\n'), /protected execution path denied/);
});

test('tool input rail keeps tools available while denying unsafe inputs', () => {
  const allowed = evaluateToolInputRails({ command: 'node --check _SYSTEM/Scripts/rails.mjs' });
  const denied = evaluateToolInputRails({ command: 'git push origin main' });

  assert.equal(allowed.ok, true);
  assert.equal(denied.ok, false);
  assert.match(denied.reasons.join('\n'), /git-push/);
});

test('output rail warns on repo truth claims without evidence', () => {
  const result = evaluateOutputRails('all tests pass and repo is clean', { requireEvidence: true });

  assert.equal(result.ok, true);
  assert.equal(result.severity, 'warn');
  assert.match(result.reasons.join('\n'), /requires local evidence/);
});

test('health rail blocks failed required targets', () => {
  const result = evaluateHealthRails([
    { id: 'deepseek', ok: true },
    { id: 'nemotron', ok: false, error: 'timeout' },
  ], { required: ['deepseek', 'nemotron'] });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /nemotron/);
});

test('rail violations write only to caller-approved runtime paths', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-rails-'));
  const logPath = path.join(dir, 'violations.jsonl');
  try {
    const result = writeRailViolation(evaluateExecutionRails({ command: 'git push' }), { logPath });
    assert.equal(result.ok, true);
    assert.match(readFileSync(logPath, 'utf8'), /git-push/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
