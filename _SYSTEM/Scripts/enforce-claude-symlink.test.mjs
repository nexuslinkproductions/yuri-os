#!/usr/bin/env node
// Tests for enforce-claude-symlink.mjs. ALL fixtures live under a temp dir — never touches
// the real ~/.claude or the real repo root. Run with: node --test enforce-claude-symlink.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { classify, main, resolveRepoRoot } from './enforce-claude-symlink.mjs';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-symlink-test-'));
  const repoRoot = path.join(root, 'repo');
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(repoRoot, '.claude'), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { root, repoRoot, home, expectedTarget: path.join(repoRoot, '.claude') };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('resolveRepoRoot derives two levels up from _SYSTEM/Scripts', () => {
  const fakeScriptDir = '/tmp/some-repo/_SYSTEM/Scripts';
  assert.equal(resolveRepoRoot(fakeScriptDir), '/tmp/some-repo');
});

test('CASE correct: symlink already points at expected target -> classify=correct, main reports OK, no changes', () => {
  const { root, repoRoot, home, expectedTarget } = makeFixture();
  try {
    const homeClaudePath = path.join(home, '.claude');
    fs.symlinkSync(expectedTarget, homeClaudePath, 'dir');

    const verdict = classify(homeClaudePath, expectedTarget);
    assert.equal(verdict.state, 'correct');

    const exitCode = main([`--home=${home}`, `--repo-root=${repoRoot}`]);
    assert.equal(exitCode, 0);

    // Still correct and untouched.
    const lst = fs.lstatSync(homeClaudePath);
    assert.ok(lst.isSymbolicLink());
    assert.equal(fs.realpathSync(homeClaudePath), fs.realpathSync(expectedTarget));
  } finally {
    cleanup(root);
  }
});

test('CASE missing: ~/.claude does not exist -> classify=missing, default run creates symlink (HEALED)', () => {
  const { root, repoRoot, home, expectedTarget } = makeFixture();
  try {
    const homeClaudePath = path.join(home, '.claude');
    assert.ok(!fs.existsSync(homeClaudePath));

    const verdict = classify(homeClaudePath, expectedTarget);
    assert.equal(verdict.state, 'missing');

    const exitCode = main([`--home=${home}`, `--repo-root=${repoRoot}`]);
    assert.equal(exitCode, 0);

    const lst = fs.lstatSync(homeClaudePath);
    assert.ok(lst.isSymbolicLink());
    assert.equal(fs.realpathSync(homeClaudePath), fs.realpathSync(expectedTarget));
  } finally {
    cleanup(root);
  }
});

test('CASE missing + --dry-run: reports intended action, does NOT create anything', () => {
  const { root, repoRoot, home, expectedTarget } = makeFixture();
  try {
    const homeClaudePath = path.join(home, '.claude');

    const exitCode = main([`--home=${home}`, `--repo-root=${repoRoot}`, '--dry-run']);
    assert.equal(exitCode, 0);
    assert.ok(!fs.existsSync(homeClaudePath), 'dry-run must not create the symlink');
  } finally {
    cleanup(root);
  }
});

test('CASE wrong: symlink points elsewhere -> classify=wrong, default run repoints (HEALED)', () => {
  const { root, repoRoot, home, expectedTarget } = makeFixture();
  try {
    const homeClaudePath = path.join(home, '.claude');
    const elsewhere = path.join(root, 'elsewhere');
    fs.mkdirSync(elsewhere, { recursive: true });
    fs.symlinkSync(elsewhere, homeClaudePath, 'dir');

    const verdict = classify(homeClaudePath, expectedTarget);
    assert.equal(verdict.state, 'wrong');
    assert.equal(fs.realpathSync(verdict.currentTarget), fs.realpathSync(elsewhere));

    const exitCode = main([`--home=${home}`, `--repo-root=${repoRoot}`]);
    assert.equal(exitCode, 0);

    const lst = fs.lstatSync(homeClaudePath);
    assert.ok(lst.isSymbolicLink());
    assert.equal(fs.realpathSync(homeClaudePath), fs.realpathSync(expectedTarget));
  } finally {
    cleanup(root);
  }
});

test('CASE wrong (broken symlink target) -> classify=wrong broken:true, default run repoints (HEALED)', () => {
  const { root, repoRoot, home, expectedTarget } = makeFixture();
  try {
    const homeClaudePath = path.join(home, '.claude');
    const ghost = path.join(root, 'does-not-exist');
    fs.symlinkSync(ghost, homeClaudePath, 'dir');

    const verdict = classify(homeClaudePath, expectedTarget);
    assert.equal(verdict.state, 'wrong');
    assert.equal(verdict.broken, true);

    const exitCode = main([`--home=${home}`, `--repo-root=${repoRoot}`]);
    assert.equal(exitCode, 0);

    const lst = fs.lstatSync(homeClaudePath);
    assert.ok(lst.isSymbolicLink());
    assert.equal(fs.realpathSync(homeClaudePath), fs.realpathSync(expectedTarget));
  } finally {
    cleanup(root);
  }
});

test('CASE real directory: ~/.claude is a REAL dir -> classify=real, BLOCKED, non-zero exit, NEVER deleted', () => {
  const { root, repoRoot, home, expectedTarget } = makeFixture();
  try {
    const homeClaudePath = path.join(home, '.claude');
    fs.mkdirSync(homeClaudePath, { recursive: true });
    const sentinelFile = path.join(homeClaudePath, 'precious-state.txt');
    fs.writeFileSync(sentinelFile, 'do not delete me');

    const verdict = classify(homeClaudePath, expectedTarget);
    assert.equal(verdict.state, 'real');
    assert.equal(verdict.isDirectory, true);

    const exitCode = main([`--home=${home}`, `--repo-root=${repoRoot}`]);
    assert.equal(exitCode, 1, 'real-directory case must exit non-zero (BLOCKED)');

    // Must still be a real directory with the sentinel file intact — never touched.
    const lst = fs.lstatSync(homeClaudePath);
    assert.ok(lst.isDirectory() && !lst.isSymbolicLink());
    assert.equal(fs.readFileSync(sentinelFile, 'utf8'), 'do not delete me');
  } finally {
    cleanup(root);
  }
});

test('CASE real file: ~/.claude is a REAL file -> classify=real, BLOCKED, non-zero exit, NEVER deleted', () => {
  const { root, repoRoot, home, expectedTarget } = makeFixture();
  try {
    const homeClaudePath = path.join(home, '.claude');
    fs.writeFileSync(homeClaudePath, 'precious file content');

    const verdict = classify(homeClaudePath, expectedTarget);
    assert.equal(verdict.state, 'real');
    assert.equal(verdict.isFile, true);

    const exitCode = main([`--home=${home}`, `--repo-root=${repoRoot}`]);
    assert.equal(exitCode, 1, 'real-file case must exit non-zero (BLOCKED)');

    const lst = fs.lstatSync(homeClaudePath);
    assert.ok(lst.isFile() && !lst.isSymbolicLink());
    assert.equal(fs.readFileSync(homeClaudePath, 'utf8'), 'precious file content');
  } finally {
    cleanup(root);
  }
});

test('log file gets a JSON line appended on each run', () => {
  const { root, repoRoot, home } = makeFixture();
  try {
    main([`--home=${home}`, `--repo-root=${repoRoot}`]);
    const logPath = path.join(repoRoot, '_SYSTEM', 'state', 'claude-symlink-enforce.log');
    assert.ok(fs.existsSync(logPath));
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.ok(lines.length >= 1);
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.ok(entry.ts);
    assert.ok(entry.home);
  } finally {
    cleanup(root);
  }
});
