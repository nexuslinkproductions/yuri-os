#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const Database = require(path.join(process.cwd(), 'backend/node_modules/better-sqlite3'));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudimmud-db-recovery-'));
const retiredIdentityPattern = new RegExp([
  ['exeo', 'flow'].join(''),
  ['exeo', '-flow'].join(''),
  ['exeo', ' flow'].join(''),
].join('|'), 'i');

try {
  const protectedLiveSource = spawnSync(
    process.execPath,
    ['Scripts/backend-db-recovery.mjs', '--dry-run', '--source', 'backend/data/nudimmud.db'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );

  assert.notEqual(protectedLiveSource.status, 0, 'recovery should refuse protected live DB sources without explicit override');
  assert.match(
    `${protectedLiveSource.stdout}\n${protectedLiveSource.stderr}`,
    /BACKEND_DB_RECOVERY_FAIL.*--allow-live-source/,
    'protected source refusal should explain the explicit override'
  );

  const sourceDb = path.join(tmpDir, 'source.db');
  const outDir = path.join(tmpDir, 'recovery');
  const targetDb = path.join(outDir, 'candidate.db');
  createHealthySource(sourceDb);

  const protectedTarget = spawnSync(process.execPath, [
    'Scripts/backend-db-recovery.mjs',
    '--source',
    sourceDb,
    '--target',
    'backend/data/recovered-candidate.db',
    '--dry-run',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(protectedTarget.status, 0, 'recovery should refuse protected live DB targets without explicit override');
  const protectedTargetJson = parseJsonOutput(protectedTarget);
  assert.equal(protectedTargetJson.system, 'YURI_OS', 'protected target refusal should use Yuri OS naming');
  assert.match(protectedTargetJson.refusalReason, /protected live DB target refused/, 'protected target refusal should be explicit');

  const dryRun = spawnSync(process.execPath, [
    'Scripts/backend-db-recovery.mjs',
    '--source',
    sourceDb,
    '--target',
    targetDb,
    '--dry-run',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(dryRun.status, 0, `dry run should pass:\n${dryRun.stdout}\n${dryRun.stderr}`);
  const dryRunJson = parseJsonOutput(dryRun);
  assert.equal(dryRunJson.system, 'YURI_OS', 'dry run JSON should use Yuri OS naming');
  assert.equal(dryRunJson.sourcePath, sourceDb, 'dry run JSON should record source path');
  assert.equal(dryRunJson.targetPath, targetDb, 'dry run JSON should record target path');
  assert.equal(dryRunJson.dryRun, true, 'dry run JSON should record dryRun=true');
  assert.equal(dryRunJson.sourceExists, true, 'dry run JSON should report source existence');
  assert.equal(dryRunJson.targetExists, false, 'dry run JSON should report missing target');
  assert.equal(dryRunJson.wouldCreate, true, 'dry run JSON should report candidate creation plan');
  assert.equal(dryRunJson.integrity.integrityCheck, 'ok', 'dry run should verify candidate integrity');
  assert.equal(dryRunJson.integrity.quickCheck, 'ok', 'dry run should verify candidate quick_check');
  assert.equal(dryRunJson.integrity.foreignKeyViolations, 0, 'dry run should verify FK integrity');
  assert.equal(dryRunJson.recoveryReady, true, 'dry run should mark healthy candidate recovery ready');
  assert.equal(fs.existsSync(outDir), false, 'dry run should not create recovery directory');

  const recovery = spawnSync(process.execPath, [
    'Scripts/backend-db-recovery.mjs',
    '--source',
    sourceDb,
    '--target',
    targetDb,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(recovery.status, 0, `recovery should pass:\n${recovery.stdout}\n${recovery.stderr}`);
  const recoveryJson = parseJsonOutput(recovery);
  assert.equal(recoveryJson.system, 'YURI_OS', 'recovery JSON should use Yuri OS naming');
  assert.equal(recoveryJson.dryRun, false, 'recovery JSON should record dryRun=false');
  assert.equal(recoveryJson.recoveryReady, true, 'recovery JSON should mark healthy candidate recovery ready');
  assert.equal(recoveryJson.integrity.integrityCheck, 'ok', 'recovery should report integrity check');
  assert.equal(recoveryJson.integrity.foreignKeyViolations, 0, 'recovery should report FK check');

  const candidatePath = targetDb;
  const manifestPath = path.join(outDir, 'manifest.json');
  assert.equal(fs.existsSync(candidatePath), true, 'recovery should write candidate DB');
  assert.equal(fs.existsSync(manifestPath), true, 'recovery should write manifest');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.sourcePath, sourceDb, 'manifest should record source path');
  assert.equal(manifest.candidatePath, candidatePath, 'manifest should record candidate path');
  assert.equal(manifest.checks.integrityCheck, 'ok', 'manifest should record integrity_check');
  assert.equal(manifest.checks.foreignKeyViolations, 0, 'manifest should record FK violations');

  const dbCheck = spawnSync(process.execPath, ['Scripts/backend-db-check.mjs', '--db', candidatePath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(dbCheck.status, 0, `candidate should pass backend DB gate:\n${dbCheck.stdout}\n${dbCheck.stderr}`);

  const runbookPath = path.join(process.cwd(), 'docs/BACKEND_DATABASE_RECOVERY_RUNBOOK.md');
  assert.equal(fs.existsSync(runbookPath), true, 'database recovery runbook should exist');
  const runbook = fs.readFileSync(runbookPath, 'utf8');
  assert.match(runbook, /Yuri OS/, 'runbook should use Yuri OS naming');
  assert.match(runbook, /--dry-run/, 'runbook should include safe dry-run command');
  assert.match(runbook, /--source/, 'runbook should document source path');
  assert.match(runbook, /--target/, 'runbook should document target path');
  assert.match(runbook, /--allow-live-source/, 'runbook should warn about live source override');
  assert.match(runbook, /backend:release-gate/, 'runbook should document release gate integration');
  assert.match(runbook, /recoveryReady/, 'runbook should explain JSON fields');
  assert.doesNotMatch(runbook, retiredIdentityPattern, 'runbook should not expose retired flow identity');

  process.stdout.write('backend-db-recovery: pass\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function parseJsonOutput(result) {
  const text = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  assert.ok(text, 'expected JSON output');
  return JSON.parse(text.slice(text.indexOf('{')));
}

function createHealthySource(dbPath) {
  const db = new Database(dbPath);
  try {
    db.pragma('user_version = 1');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE parent (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER REFERENCES parent(id)
      );
      CREATE INDEX idx_child_parent ON child(parent_id);
    `);
    db.prepare('INSERT INTO parent (id) VALUES (?)').run(1);
    db.prepare('INSERT INTO child (id, parent_id) VALUES (?, ?)').run(1, 1);
  } finally {
    db.close();
  }
}
