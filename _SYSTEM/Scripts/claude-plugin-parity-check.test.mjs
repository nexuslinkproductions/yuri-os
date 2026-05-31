#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { REQUIRED_SKILLS, REPO_ROOT, runClaudePluginParityCheck } from './claude-plugin-parity-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('current repository passes Claude plugin parity check', () => {
  const result = runClaudePluginParityCheck({ repoRoot: ROOT });
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
});

test('required Claude skill shims are symbolic links to root skills', () => {
  for (const skill of REQUIRED_SKILLS) {
    const shim = path.join(REPO_ROOT, '.claude/skills', skill, 'SKILL.md');
    const target = path.resolve(path.dirname(shim), fs.readlinkSync(shim));
    assert.equal(fs.lstatSync(shim).isSymbolicLink(), true, `${skill} shim must be a symlink`);
    assert.equal(target, path.join(REPO_ROOT, 'skills', skill, 'SKILL.md'));
  }
});

test('parity check fails closed on copied skill shim', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-claude-parity-'));
  copyTreeMinimal(tmpRoot);
  const copiedSkill = path.join(tmpRoot, '.claude/skills/adversarial-verification/SKILL.md');
  fs.rmSync(copiedSkill);
  fs.copyFileSync(path.join(tmpRoot, 'skills/adversarial-verification/SKILL.md'), copiedSkill);

  const result = runClaudePluginParityCheck({ repoRoot: tmpRoot });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('must be symlink')));
});

test('parity check catches stale local Claude settings drift', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-claude-parity-'));
  copyTreeMinimal(tmpRoot);
  fs.writeFileSync(
    path.join(tmpRoot, '.claude/settings.local.json'),
    JSON.stringify({ permissions: { allow: ['Read(//Users/marcelspatz/NUDIMMUD/.claude/**)'] } }, null, 2),
  );

  const result = runClaudePluginParityCheck({ repoRoot: tmpRoot });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('NUDIMMUD')));
});

test('parity check rejects broken user-selected model sentinel', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-claude-parity-'));
  copyTreeMinimal(tmpRoot);
  const settingsPath = path.join(tmpRoot, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.model = 'user-selected';
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

  const result = runClaudePluginParityCheck({ repoRoot: tmpRoot });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('broken model sentinel')));
});

function copyTreeMinimal(tmpRoot) {
  const paths = [
    'CLAUDE.md',
    '.claude/CLAUDE.md',
    '.claude/settings.json',
    '.claude/settings.local.json',
    '_SYSTEM/config/folder-registry.json',
    '_SYSTEM/config/artifact-registry.json',
    '_SYSTEM/Scripts/lane-persona-map.mjs',
    '_SYSTEM/Scripts/gitnexus-mcp.mjs',
    '_SYSTEM/Scripts/gitnexus-mcp-check.mjs',
    '_SYSTEM/Scripts/ollama-bridge-mcp-check.mjs',
    '.claude/mcp-servers/ollama-bridge/index.js',
  ];
  for (const relPath of paths) copyFile(relPath, tmpRoot);
  for (const skill of REQUIRED_SKILLS) {
    copyFile(`skills/${skill}/SKILL.md`, tmpRoot);
    const shimDir = path.join(tmpRoot, '.claude/skills', skill);
    fs.mkdirSync(shimDir, { recursive: true });
    fs.symlinkSync(path.join(tmpRoot, 'skills', skill, 'SKILL.md'), path.join(shimDir, 'SKILL.md'));
  }
}

function copyFile(relPath, tmpRoot) {
  const source = path.join(REPO_ROOT, relPath);
  const target = path.join(tmpRoot, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
