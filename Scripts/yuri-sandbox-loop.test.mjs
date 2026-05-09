#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-sandbox-loop-test-'));
const dbPath = path.join(tempRoot, 'learning.db');
let snapshot;

try {
  snapshot = createHermeticRepoSnapshot(tempRoot);
  const dryReportPath = run(snapshot.repoRoot, [
    '--dry-run',
    '--mock',
    '--artifact-root',
    snapshot.artifactRoot,
    '--db',
    dbPath,
    '--prompt',
    'sandbox loop regression dry run',
  ]);
  const dryDir = path.dirname(dryReportPath);
  const dryVerification = readJson(path.join(dryDir, 'verification.json'));
  assert.equal(dryVerification.ok, true, 'dry-run should pass verification');
  assert(fs.existsSync(path.join(dryDir, 'route-plan.json')), 'route plan artifact missing');

  const liveReportPath = run(snapshot.repoRoot, [
    '--live',
    '--mock',
    '--artifact-root',
    snapshot.artifactRoot,
    '--db',
    dbPath,
    '--prompt',
    'sandbox loop regression live run',
  ]);
  const liveDir = path.dirname(liveReportPath);
  const rawOutput = fs.readFileSync(path.join(liveDir, 'raw-output.md'), 'utf8');
  const learningSummary = readJson(path.join(liveDir, 'learning-summary.json'));
  const finalReport = fs.readFileSync(path.join(liveDir, 'final-report.md'), 'utf8');

  assert(rawOutput.includes('MOCK_YURI_SANDBOX_OK'), 'mock raw output missing');
  assert.equal(learningSummary.raw_output_artifact.endsWith('raw-output.md'), true, 'learning summary should point at raw artifact');
  assert.equal(finalReport.includes('raw_output_artifact_only: true'), true, 'final report should mark raw artifact only');

  const rawHash = learningSummary.raw_output_sha256;
  const dbBytes = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : Buffer.alloc(0);
  assert.equal(dbBytes.includes(Buffer.from('MOCK_YURI_SANDBOX_OK')), false, 'raw output leaked into learning db');
  assert.equal(dbBytes.includes(Buffer.from(rawHash)), true, 'raw output hash should be captured');

  const failedReportPath = run(
    snapshot.repoRoot,
    [
      '--live',
      '--mock',
      '--force-probe-failure',
      '--artifact-root',
      snapshot.artifactRoot,
      '--db',
      dbPath,
      '--prompt',
      'sandbox loop regression probe failure',
    ],
    { expectFailure: true },
  );
  const failedVerification = readJson(path.join(path.dirname(failedReportPath), 'verification.json'));
  assert.equal(failedVerification.ok, false, 'forced probe failure should fail closed');

  const selftest = execFileSync(
    process.execPath,
    [path.join(snapshot.repoRoot, 'Scripts', 'yuri-sandbox-loop.mjs'), '--selftest'],
    { cwd: snapshot.repoRoot, encoding: 'utf8' },
  );
  assert(selftest.includes('YURI_SANDBOX_LOOP_SELFTEST_PASS'), 'selftest marker missing');

  process.stdout.write('yuri-sandbox-loop: pass\n');
} finally {
  snapshot?.cleanup();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function run(cwd, args, options = {}) {
  const scriptPath = path.join(cwd, 'Scripts', 'yuri-sandbox-loop.mjs');
  try {
    return execFileSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' }).trim();
  } catch (error) {
    if (!options.expectFailure) throw error;
    return String(error.stdout || '').trim();
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createHermeticRepoSnapshot(rootDir) {
  const snapshotRoot = path.join(rootDir, 'repo-snapshot');
  execFileSync('git', ['worktree', 'add', '--detach', snapshotRoot, 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const dirtyEntries = parseDirtyEntries(
    execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }),
  );

  for (const entry of dirtyEntries) {
    const sourcePath = path.join(repoRoot, entry.path);
    const destPath = path.join(snapshotRoot, entry.path);

    if (entry.renamedFrom) {
      fs.rmSync(path.join(snapshotRoot, entry.renamedFrom), { recursive: true, force: true });
    }

    if (entry.deleted) {
      fs.rmSync(destPath, { recursive: true, force: true });
      continue;
    }

    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.cpSync(sourcePath, destPath, { recursive: true, force: true, dereference: false });
  }

  ensureBackendNodeModulesLink(snapshotRoot);

  execFileSync('git', ['add', '-A'], {
    cwd: snapshotRoot,
    encoding: 'utf8',
  });
  execFileSync(
    'git',
    ['-c', 'user.name=Codex', '-c', 'user.email=codex@openai.com', 'commit', '--quiet', '--no-gpg-sign', '-m', 'Sandbox loop hermetic snapshot'],
    {
      cwd: snapshotRoot,
      encoding: 'utf8',
    },
  );

  const snapshotStatus = execFileSync('git', ['status', '--porcelain=v1'], {
    cwd: snapshotRoot,
    encoding: 'utf8',
  }).trim();
  assert.equal(snapshotStatus, '', 'hermetic snapshot must be clean');

  return {
    repoRoot: snapshotRoot,
    artifactRoot: path.join(rootDir, 'artifacts'),
    cleanup() {
      fs.rmSync(snapshotRoot, { recursive: true, force: true });
      try {
        execFileSync('git', ['worktree', 'prune'], {
          cwd: repoRoot,
          encoding: 'utf8',
        });
      } catch (_) {
        // Best effort cleanup only.
      }
    },
  };
}

function parseDirtyEntries(statusOutput) {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3);
      const renamedFromTo = rawPath.includes(' -> ') ? rawPath.split(' -> ') : null;
      return {
        status,
        path: renamedFromTo ? renamedFromTo[1] : rawPath,
        renamedFrom: renamedFromTo ? renamedFromTo[0] : '',
        deleted: status.includes('D'),
      };
    });
}

function ensureBackendNodeModulesLink(snapshotRoot) {
  const source = path.join(repoRoot, 'backend', 'node_modules');
  const dest = path.join(snapshotRoot, 'backend', 'node_modules');
  if (!fs.existsSync(source)) {
    throw new Error('backend/node_modules is required for the sandbox harness');
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.symlinkSync(source, dest, 'dir');
}
