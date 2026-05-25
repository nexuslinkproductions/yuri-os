#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  buildInputGenome,
  classifyInputMode,
  isProtectedPath,
  renderInputGenomeBlock,
  validateInputGenome,
} from './yuri-input-genome.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./yuri-input-genome.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('input genome turns messy operator braindump into local operating packet', () => {
  const genome = buildInputGenome([
    'rick, before commit we need deep coding inspection and hardening.',
    'No commits, no pushes. Work with DeepSeek as advisory if useful,',
    'but this must work even when no other lanes are available.',
  ].join(' '), {
    source: 'test',
    target: 'local',
  });

  assert.equal(genome.schema, 'yuri.input-genome.v0');
  assert.equal(genome.routeHints.primaryAuthority, 'codex-main');
  assert.equal(genome.routeHints.localBaseRequired, true);
  assert.equal(genome.validation.inputGenome.ok, true);
  assert.equal(validateInputGenome(genome).ok, true);
  assert.ok(genome.constraints.some((entry) => entry.id === 'no-commit'));
  assert.ok(genome.constraints.some((entry) => entry.id === 'no-push'));
  assert.ok(genome.constraints.some((entry) => entry.id === 'local-first'));
  assert.ok(genome.routeHints.optionalReviewLanes.includes('deepseek'));
  assert.ok(genome.promptBlock.includes('[YURI Input Genome v0]'));
});

test('input genome preserves command inputs but still compiles structure', () => {
  const genome = buildInputGenome('@shintai audit guardrail proofs and produce risks/tests', {
    source: 'test',
    target: 'shintai',
    routePlan: { lane: 'shintai', scenario: 'advisory' },
  });

  assert.equal(classifyInputMode('@shintai audit guardrail proofs'), 'command');
  assert.equal(genome.inputMode, 'command');
  assert.equal(genome.routeHints.primaryAuthority, 'codex-main');
  assert.equal(genome.normalizedIntent.execution_mode, 'dry_run');
  assert.equal(genome.validation.normalizedIntent.ok, true);
  assert.ok(genome.promptContract.compiled_prompt.includes('ONE_TRANSACTION'));
});

test('input genome surfaces protected paths without reading them', () => {
  const genome = buildInputGenome('Please inspect .env and backend/data for tokens, but do not leak anything.', {
    source: 'test',
  });

  assert.equal(isProtectedPath('.env', { repoRoot: REPO_ROOT }).protected, true);
  assert.ok(genome.protectedSurfaceWarnings.some((entry) => entry.marker === '.env'));
  assert.ok(genome.riskSignals.some((entry) => entry.id === 'protected-surface'));
  assert.ok(genome.verificationNeeds.some((entry) => entry.includes('protected paths')));
});

test('rendered genome block is compact and explicit about authority', () => {
  const genome = buildInputGenome('Implement the universal braindump normalizer and test it.', {
    source: 'test',
  });
  const block = renderInputGenomeBlock(genome, { target: 'rick' });

  assert.match(block, /primary_authority: codex-main/);
  assert.match(block, /local_base_required: true/);
  assert.match(block, /work_packets:/);
  assert.ok(block.length < 3500);
});

test('CLI refuses protected paths before read', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--path', '.env', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing protected path before read/);
});

test('CLI emits JSON genome for plain text input', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--text', 'review the edited files with no commit', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 'yuri.input-genome.v0');
  assert.ok(parsed.constraints.some((entry) => entry.id === 'no-commit'));
});
