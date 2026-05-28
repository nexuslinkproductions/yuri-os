#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, '_SYSTEM/Scripts/claude-codex-final-pass.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-codex-final-pass-'));
const packetRel = `_SYSTEM/reports/claude-final-pass-test-${process.pid}.md`;
const packetPath = path.join(REPO_ROOT, packetRel);

try {
  fs.writeFileSync(packetPath, [
    '# Final Pass Test Packet',
    '',
    'task: test packet',
    'files_changed: none',
    'checks_run: dry-run only',
    'residual_risk: none',
    '',
  ].join('\n'));

  const artifactDir = path.join(tempRoot, 'artifacts');
  execFileSync(process.execPath, [
    SCRIPT,
    '--packet', packetRel,
    '--artifact-dir', artifactDir,
    '--task', 'dry-run test',
  ], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const handoff = JSON.parse(fs.readFileSync(path.join(artifactDir, 'handoff.json'), 'utf8'));
  assert.equal(handoff.status, 'DRY_RUN');
  assert.equal(handoff.packet, packetRel);
  assert.equal(handoff.model, 'codex-spark');
  assert.ok(handoff.command.includes('--dry-run'));

  const prompt = fs.readFileSync(path.join(artifactDir, 'prompt.md'), 'utf8');
  assert.match(prompt, /CODEX FINAL PASS PACKET/);
  assert.match(prompt, /Do not edit files/);
  assert.match(prompt, /Final Pass Test Packet/);

  let protectedFailure = null;
  try {
    execFileSync(process.execPath, [SCRIPT, '--packet', 'backend/data/fake.md'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    protectedFailure = error;
  }
  assert(protectedFailure, 'protected packet path should be rejected');
  assert.match(protectedFailure.stderr, /Refusing protected packet path/);

  let locationFailure = null;
  try {
    execFileSync(process.execPath, [SCRIPT, '--packet', 'CLAUDE.md'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    locationFailure = error;
  }
  assert(locationFailure, 'non-report packet path should be rejected');
  assert.match(locationFailure.stderr, /must live under _SYSTEM\/reports/);

  process.stdout.write('claude-codex-final-pass: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.rmSync(packetPath, { force: true });
}
