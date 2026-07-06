#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROTECTED_PREFIXES,
  normalizeRel,
  isProtectedRel,
  assertContained,
} from './yuri-protected-paths.mjs';

test('protected prefix list is immutable and covers canonical runtime surfaces', () => {
  assert.ok(Object.isFrozen(PROTECTED_PREFIXES));
  for (const p of ['backend/data/', '.claude/state/', '.claude/history/', '.claude/file-history/', '.claude/projects/', '.env', 'node_modules/', '.amp/']) {
    assert.ok(PROTECTED_PREFIXES.includes(p), `missing protected prefix ${p}`);
  }
});

test('C3 bypass vectors fail closed after normalization', () => {
  const vectors = [
    './.env',
    './backend/data',
    './backend/data/cache.json',
    './.claude/state/session-state.json',
    './.claude/history/2026-06-06.jsonl',
    './.claude/file-history/changes.log',
    './.claude/projects/project/state/index.json',
    './node_modules/pkg/index.js',
    './.amp/cache.json',
    'backend/data/../data/cache.json',
    '.claude/./state/session-state.json',
    '.claude/projects/../projects/project/history/log.jsonl',
  ];
  for (const rel of vectors) {
    assert.equal(isProtectedRel(rel), true, `expected blocked: ${rel}`);
  }
});

test('repo escapes and absolute paths fail closed', () => {
  assert.equal(isProtectedRel('../escape'), true);
  assert.equal(isProtectedRel('../../.env'), true);
  assert.equal(isProtectedRel('/tmp/.env'), true);
});

test('normal repo paths pass and lookalikes do not over-block', () => {
  for (const rel of ['_SYSTEM/Scripts/yuri-protected-paths.mjs', 'backend/database.js', 'docs/node_modules_guide.md', 'src/env.config.ts', '.claude-project/state.json']) {
    assert.equal(isProtectedRel(rel), false, `expected allowed: ${rel}`);
  }
  assert.equal(normalizeRel('./a/./b'), 'a/b');
});

test('assertContained accepts contained paths and rejects resolved escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-protected-paths-'));
  try {
    const inside = path.join(root, 'inside.txt');
    fs.writeFileSync(inside, 'ok');
    assert.equal(assertContained(inside, root, 'inside'), fs.realpathSync(inside));

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-protected-paths-out-'));
    const escaped = path.join(outside, 'outside.txt');
    fs.writeFileSync(escaped, 'no');
    assert.throws(() => assertContained(escaped, root, 'outside'), /outside escapes repo:/);

    const missing = path.join(root, 'missing.txt');
    assert.equal(assertContained(missing, root, 'missing'), missing);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
