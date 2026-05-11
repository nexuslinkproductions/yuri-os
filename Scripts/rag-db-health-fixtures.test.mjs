#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inspectDatabaseHealth } from './lib/db-health.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Database = require(path.join(REPO_ROOT, 'backend/node_modules/better-sqlite3'));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-rag-db-health-'));

try {
  const cleanPath = path.join(tempDir, 'clean.db');
  createCleanDatabase(cleanPath);
  const clean = inspectDatabaseHealth(cleanPath);
  assert.equal(clean.path, cleanPath);
  assert.equal(clean.exists, true);
  assert.equal(clean.integrityCheck, 'ok');
  assert.equal(clean.quickCheck, 'ok');
  assert.equal(clean.foreignKeyViolations, 0);
  assert.equal(clean.healthy, true);
  assert.equal(clean.error, null);

  const missingPath = path.join(tempDir, 'missing.db');
  const missing = inspectDatabaseHealth(missingPath);
  assert.equal(missing.path, missingPath);
  assert.equal(missing.exists, false);
  assert.equal(missing.healthy, false);
  assert.match(missing.error, /not_found/);

  const foreignKeyPath = path.join(tempDir, 'foreign-key.db');
  createForeignKeyViolationDatabase(foreignKeyPath);
  const foreignKey = inspectDatabaseHealth(foreignKeyPath);
  assert.equal(foreignKey.exists, true);
  assert.equal(foreignKey.integrityCheck, 'ok');
  assert.equal(foreignKey.quickCheck, 'ok');
  assert.ok(foreignKey.foreignKeyViolations > 0, 'foreign_key_check violations should be counted');
  assert.equal(foreignKey.healthy, false);

  const corruptPath = path.join(tempDir, 'corrupt.db');
  createCorruptDatabase(corruptPath);
  const corrupt = inspectDatabaseHealth(corruptPath);
  assert.equal(corrupt.exists, true);
  assert.equal(corrupt.healthy, false);
  assert.ok(
    corrupt.error || corrupt.integrityCheck !== 'ok' || corrupt.quickCheck !== 'ok',
    'corrupt database should fail integrity, quick check, or open with an error'
  );

  const scriptResult = spawnSync(process.execPath, ['Scripts/prompt-rag-health.mjs'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NUDIMMUD_DB_PATH: cleanPath,
    },
    encoding: 'utf8',
  });
  assert.notEqual(scriptResult.stdout.trim(), '', 'prompt RAG health should print JSON even when fixture content is incomplete');
  const summary = JSON.parse(scriptResult.stdout);
  assert.equal(summary.database.path, cleanPath);
  assert.equal(summary.database.available, true);
  assert.equal(summary.database.integrityCheck, 'ok');
  assert.equal(summary.database.quickCheck, 'ok');
  assert.equal(summary.database.foreignKeyViolations, 0);
  assert.ok(!summary.database.path.includes('backend/data'), 'fixture run must not require the protected backend/data DB');

  process.stdout.write('rag-db-health-fixtures: pass\n');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function createCleanDatabase(dbPath) {
  const db = new Database(dbPath);
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parent(id)
      );
      INSERT INTO parent (id) VALUES (1);
      INSERT INTO child (id, parent_id) VALUES (1, 1);
    `);
  } finally {
    db.close();
  }
}

function createForeignKeyViolationDatabase(dbPath) {
  const db = new Database(dbPath);
  try {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parent(id)
      );
      INSERT INTO child (id, parent_id) VALUES (1, 404);
    `);
  } finally {
    db.close();
  }
}

function createCorruptDatabase(dbPath) {
  createCleanDatabase(dbPath);
  fs.writeFileSync(dbPath, 'YURI_CORRUPT_FIXTURE');
}
