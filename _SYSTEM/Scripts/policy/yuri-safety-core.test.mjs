import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateHookEvent, evaluateToolCall } from './yuri-safety-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');

test('direct Read denies repo-protected files without opening them', () => {
  const decision = evaluateToolCall('Read', { file_path: '.env' }, { cwd: ROOT });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /read of protected target blocked: \.env/u);
});

test('direct Read denies paths nested beneath protected directories', () => {
  const decision = evaluateToolCall('read_file', { path: '.claude/projects/session.json' }, { cwd: ROOT });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /\.claude\/projects/u);
});

test('direct Read denies home credential paths without opening them', () => {
  const target = path.join(os.homedir(), '.aws', 'credentials');
  const decision = evaluateToolCall('Read', { file_path: target }, { cwd: ROOT });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /~\/\.aws/u);
});

test('read-like search tools deny protected roots', () => {
  const decision = evaluateToolCall('Grep', { pattern: 'token', path: 'backend/data' }, { cwd: ROOT });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /backend\/data/u);
});

test('read-like tools with implicit cwd deny protected working directories', () => {
  const decision = evaluateToolCall('Grep', { pattern: 'token' }, { cwd: path.join(ROOT, '.claude/projects') });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /\.claude\/projects/u);
});

test('array path inputs deny when any target is protected', () => {
  const decision = evaluateToolCall('search_files', { paths: ['_SYSTEM/INDEX.md', '.claude/state/runtime.json'] }, { cwd: ROOT });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /\.claude\/state/u);
});

test('ordinary direct reads remain allowed', () => {
  const decision = evaluateToolCall('Read', { file_path: '_SYSTEM/INDEX.md' }, { cwd: ROOT });
  assert.equal(decision.allowed, true);
});

test('non-path Read fields do not create false protected hits', () => {
  const decision = evaluateToolCall('Read', { offset: 5, limit: 20 }, { cwd: ROOT });
  assert.equal(decision.allowed, true);
});

test('malformed hook events fail closed without crashing the Codex hook', () => {
  for (const event of [null, [], 'not-an-event']) {
    const decision = evaluateHookEvent(event);
    assert.equal(decision.allowed, false);
    assert.equal(decision.decision, 'deny');
    assert.equal(decision.reason, 'invalid hook event: expected object');
  }
});

test('Codex PreToolUse hook turns a null event into a deterministic deny response', () => {
  const hookPath = path.join(ROOT, '.codex/hooks/pre-tool-use.mjs');
  const result = spawnSync(process.execPath, [hookPath], {
    cwd: ROOT,
    input: 'null',
    encoding: 'utf8',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const response = JSON.parse(result.stdout);
  assert.equal(response.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(response.hookSpecificOutput.permissionDecisionReason, 'invalid hook event: expected object');
});
