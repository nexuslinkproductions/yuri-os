#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateToolCall } from './yuri-safety-core.mjs';
import { repoIntegrityCommandHit } from './repo-integrity-guard.mjs';

const ROOT = '/Users/example/YURI-OS-MUSUBI';
const hit = (command, cwd = ROOT) => repoIntegrityCommandHit(command, { cwd, repoRoot: ROOT });

test('blocks dynamic interpreter deletion and rename APIs', () => {
  for (const command of [
    'node -e "require(\'fs\').rmSync(process.cwd(), {recursive:true, force:true})"',
    'node -e "fs.promises.rm(process.cwd(), {recursive:true})"',
    'python3 -c "import shutil; shutil.rmtree(\'.\')"',
    'python -c "import os; os.rename(os.getcwd(), \'/tmp/gone\')"',
    'ruby -e "FileUtils.rm_rf(Dir.pwd)"',
  ]) assert.ok(hit(command), command);
});

test('blocks find, rsync, and option-prefixed destructive Git forms', () => {
  for (const command of [
    'find . -depth -delete',
    'rsync -a --delete /tmp/empty/ ./',
    'git -C . reset --hard',
    'git -c core.quotePath=false clean -fdx',
    'git --work-tree=. --git-dir=.git worktree remove --force .',
    'git -C . checkout -- README.md',
    'git -C . restore --source=HEAD -- README.md',
  ]) assert.ok(hit(command), command);
  assert.equal(hit('git clean -ndx'), null, 'dry-run clean remains allowed');
});

test('blocks move/remove of root, .git, root-wide globs, ancestors, and unresolved targets', () => {
  for (const command of [
    `mv ${ROOT} /tmp/gone`,
    'mv . ../gone',
    'mv "$PWD" /tmp/gone',
    'mv .git /tmp/git-gone',
    'rmdir ..',
    'mv * /tmp/gone',
    'mv "$TARGET" /tmp/gone',
  ]) assert.ok(hit(command), command);
});

test('allows bounded normal development commands', () => {
  for (const command of [
    'git status --short',
    'git commit -m scoped',
    'mv report.tmp report.md',
    'rsync -a source/ destination/',
    'node --test _SYSTEM/Scripts/example.test.mjs',
    'python3 -m pytest tests/unit',
    'rm /tmp/one-owned-scratch-file',
  ]) assert.equal(hit(command), null, command);
});

test('shared Codex safety core denies the newly covered bypass classes', () => {
  for (const command of [
    'node -e "require(\'fs\').rmSync(process.cwd(), {recursive:true, force:true})"',
    'python3 -c "import shutil; shutil.rmtree(\'.\')"',
    'find . -delete',
    'rsync --delete /tmp/empty/ ./',
    'git -C . reset --hard',
    `mv ${process.env.HOME}/YURI-OS-MUSUBI /tmp/gone`,
  ]) {
    const decision = evaluateToolCall('exec_command', { cmd: command, workdir: process.env.HOME + '/YURI-OS-MUSUBI' });
    assert.equal(decision.allowed, false, command);
  }
});
