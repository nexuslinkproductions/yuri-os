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
  const dryProbePreview = readJson(path.join(dryDir, 'probe', 'dry-run.json'));
  assert.equal(dryVerification.ok, true, 'dry-run should pass verification');
  assert.equal(dryProbePreview.env_redirects.NUDIMMUD_DB_PATH, dbPath, 'sandbox runner should inherit temp DB path');
  assert(fs.existsSync(path.join(dryDir, 'route-plan.json')), 'route plan artifact missing');
  assert(fs.existsSync(path.join(dryDir, 'normalized-intent.json')), 'normalized intent artifact missing');
  assert(fs.existsSync(path.join(dryDir, 'graph-plan.json')), 'graph plan artifact missing');
  assert(fs.existsSync(path.join(dryDir, 'node-verifications', 'verify.verification.json')), 'per-node verification artifact missing');

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
  const graphPlan = readJson(path.join(liveDir, 'graph-plan.json'));
  const finalReport = fs.readFileSync(path.join(liveDir, 'final-report.md'), 'utf8');

  assert(rawOutput.includes('MOCK_YURI_SANDBOX_OK'), 'mock raw output missing');
  assert.equal(learningSummary.raw_output_artifact.endsWith('raw-output.md'), true, 'learning summary should point at raw artifact');
  assert.equal(Boolean(learningSummary.graph_id), true, 'learning summary should include graph id');
  assert.equal(graphPlan.canonical_state_policy.raw_output_may_enter_memory, false, 'graph policy should keep raw output out of memory');
  assert.equal(finalReport.includes('raw_output_artifact_only: true'), true, 'final report should mark raw artifact only');
  assert.equal(finalReport.includes('graph_policy_raw_output_may_enter_memory: false'), true, 'final report should include graph memory policy');
  assert.equal(finalReport.includes('learning_start_ok: true'), true, 'final report should expose learning start gate');
  assert.equal(finalReport.includes('learning_finalize_ok: true'), true, 'final report should expose learning finalize gate');

  const rawHash = learningSummary.raw_output_sha256;
  const dbBytes = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : Buffer.alloc(0);
  assert.equal(dbBytes.includes(Buffer.from('MOCK_YURI_SANDBOX_OK')), false, 'raw output leaked into learning db');
  assert.equal(dbBytes.includes(Buffer.from(rawHash)), true, 'raw output hash should be captured');

  const invalidDbReportPath = run(
    snapshot.repoRoot,
    [
      '--live',
      '--mock',
      '--artifact-root',
      snapshot.artifactRoot,
      '--db',
      path.join(tempRoot, 'missing-parent', 'learning.db'),
      '--prompt',
      'sandbox loop regression learning capture failure',
    ],
    { expectFailure: true },
  );
  const invalidDbVerification = readJson(path.join(path.dirname(invalidDbReportPath), 'verification.json'));
  assert.equal(invalidDbVerification.ok, false, 'failed learning capture should fail the live run gate');
  assert(invalidDbVerification.failures.some((failure) => failure.includes('learning-capture-start-ok')), 'learning start failure should be explicit');

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
    {
      cwd: snapshot.repoRoot,
      encoding: 'utf8',
      env: { ...process.env, YURI_BACKEND_REQUIRE_ROOT: path.join(repoRoot, 'backend') },
    },
  );
  assert(selftest.includes('YURI_SANDBOX_LOOP_SELFTEST_PASS'), 'selftest marker missing');

  const tokenHookPath = path.join(snapshot.repoRoot, '.claude', 'hooks', 'token-status.js');
  fs.mkdirSync(path.dirname(tokenHookPath), { recursive: true });
  fs.appendFileSync(tokenHookPath, '\n// sandbox regression dirty token hook\n');
  const tokenDirtyReportPath = run(snapshot.repoRoot, [
    '--dry-run',
    '--mock',
    '--artifact-root',
    snapshot.artifactRoot,
    '--db',
    dbPath,
    '--prompt',
    'sandbox loop dirty token hook regression',
  ]);
  const tokenDirtyVerification = readJson(path.join(path.dirname(tokenDirtyReportPath), 'verification.json'));
  assert.equal(tokenDirtyVerification.ok, true, 'dirty token hook files should not trip protected path matching');

  const protectedFixturePath = path.join(snapshot.repoRoot, '.env');
  fs.writeFileSync(protectedFixturePath, 'SECRET_SHOULD_BLOCK=baseline\n');
  execFileSync('git', ['add', '--force', '.env'], {
    cwd: snapshot.repoRoot,
    encoding: 'utf8',
  });
  execFileSync(
    'git',
    ['-c', 'user.name=Codex', '-c', 'user.email=codex@openai.com', 'commit', '--quiet', '--no-gpg-sign', '--only', '.env', '-m', 'Track protected fixture'],
    {
      cwd: snapshot.repoRoot,
      encoding: 'utf8',
    },
  );

  const zeroWidthEnvPath = path.join(snapshot.repoRoot, '.e\u200bnv');
  fs.writeFileSync(zeroWidthEnvPath, 'SECRET_SHOULD_BLOCK=zero-width\n');
  assertProtectedDryRunFails(snapshot, dbPath, 'sandbox loop zero-width env regression');
  fs.rmSync(zeroWidthEnvPath, { force: true });

  const fullwidthEnvPath = path.join(snapshot.repoRoot, '.ｅnv');
  fs.writeFileSync(fullwidthEnvPath, 'SECRET_SHOULD_BLOCK=fullwidth\n');
  assertProtectedDryRunFails(snapshot, dbPath, 'sandbox loop fullwidth env regression');
  fs.rmSync(fullwidthEnvPath, { force: true });

  const symlinkPath = path.join(snapshot.repoRoot, 'visible-env-link');
  fs.symlinkSync('.env', symlinkPath);
  assertProtectedDryRunFails(snapshot, dbPath, 'sandbox loop protected symlink regression');
  fs.rmSync(symlinkPath, { force: true });

  fs.writeFileSync(protectedFixturePath, 'SECRET_SHOULD_BLOCK=mutated\n');
  assertProtectedDryRunFails(snapshot, dbPath, 'sandbox loop protected env regression');

  process.stdout.write('yuri-sandbox-loop: pass\n');
} finally {
  snapshot?.cleanup();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function run(cwd, args, options = {}) {
  const scriptPath = path.join(cwd, 'Scripts', 'yuri-sandbox-loop.mjs');
  const env = {
    ...process.env,
    YURI_BACKEND_REQUIRE_ROOT: path.join(repoRoot, 'backend'),
    ...(options.env || {}),
  };
  try {
    return execFileSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8', env }).trim();
  } catch (error) {
    if (!options.expectFailure) throw error;
    return String(error.stdout || '').trim();
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertProtectedDryRunFails(snapshot, dbPath, prompt) {
  const protectedDirtyReportPath = run(
    snapshot.repoRoot,
    [
      '--dry-run',
      '--mock',
      '--artifact-root',
      snapshot.artifactRoot,
      '--db',
      dbPath,
      '--prompt',
      prompt,
    ],
    { expectFailure: true },
  );
  const protectedDirtyVerification = readJson(path.join(path.dirname(protectedDirtyReportPath), 'verification.json'));
  assert.equal(protectedDirtyVerification.ok, false, `${prompt} should fail closed`);
  assert(protectedDirtyVerification.failures.some((failure) => failure.includes('Protected paths dirty before run')), 'protected path failure should be explicit');
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

  assert.equal(fs.existsSync(path.join(snapshotRoot, 'backend', 'node_modules')), false, 'snapshot should use dependency-root env, not copied backend node_modules');

  execFileSync('git', ['add', '-A'], {
    cwd: snapshotRoot,
    encoding: 'utf8',
  });

  const stagedSnapshotStatus = execFileSync('git', ['status', '--porcelain=v1'], {
    cwd: snapshotRoot,
    encoding: 'utf8',
  });
  if (stagedSnapshotStatus !== '') {
    execFileSync(
      'git',
      ['-c', 'user.name=Codex', '-c', 'user.email=codex@openai.com', 'commit', '--quiet', '--no-gpg-sign', '-m', 'Sandbox loop hermetic snapshot'],
      {
        cwd: snapshotRoot,
        encoding: 'utf8',
      },
    );
  }

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
