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

try {
  const sourceDb = path.join(tmpDir, 'source.db');
  const outDir = path.join(tmpDir, 'recovery');
  createHealthySource(sourceDb);

  const dryRun = spawnSync(process.execPath, [
    'Scripts/backend-db-recovery.mjs',
    '--source',
    sourceDb,
    '--out-dir',
    outDir,
    '--dry-run',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(dryRun.status, 0, `dry run should pass:\n${dryRun.stdout}\n${dryRun.stderr}`);
  assert.match(dryRun.stdout, /BACKEND_DB_RECOVERY_DRY_RUN/, 'dry run should emit stable marker');
  assert.equal(fs.existsSync(outDir), false, 'dry run should not create recovery directory');

  const recovery = spawnSync(process.execPath, [
    'Scripts/backend-db-recovery.mjs',
    '--source',
    sourceDb,
    '--out-dir',
    outDir,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(recovery.status, 0, `recovery should pass:\n${recovery.stdout}\n${recovery.stderr}`);
  assert.match(recovery.stdout, /BACKEND_DB_RECOVERY_PASS/, 'recovery should emit pass marker');
  assert.match(recovery.stdout, /integrityCheck=ok/, 'recovery should report integrity check');
  assert.match(recovery.stdout, /foreignKeyViolations=0/, 'recovery should report FK check');

  const candidatePath = path.join(outDir, 'candidate.db');
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

  process.stdout.write('backend-db-recovery: pass\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
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
