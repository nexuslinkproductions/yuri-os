#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const Database = require(path.join(process.cwd(), 'backend/node_modules/better-sqlite3'));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudimmud-db-check-'));
const checkSource = fs.readFileSync(path.join(process.cwd(), 'Scripts/backend-db-check.mjs'), 'utf8');

assert.match(checkSource, /--allow-live-db/, 'DB check must require an explicit override for protected live DB checks');
assert.match(checkSource, /implicit live DB check refused/, 'DB check must fail before opening the protected default DB');

try {
  const healthyDb = path.join(tmpDir, 'healthy.db');
  createDb(healthyDb, { schemaVersion: 1 });

  const healthy = runCheck(healthyDb);
  assert.equal(healthy.status, 0, `healthy DB should pass:\n${healthy.stdout}\n${healthy.stderr}`);
  assert.match(healthy.stdout, /BACKEND_DB_CHECK_PASS/, 'healthy DB should emit pass marker');
  assert.match(healthy.stdout, /schemaVersion=1/, 'healthy DB should report schema version');
  assert.match(healthy.stdout, /integrityCheck=ok/, 'healthy DB should report integrity_check result');
  assert.match(healthy.stdout, /quickCheck=ok/, 'healthy DB should report quick_check result');
  assert.match(healthy.stdout, /foreignKeyViolations=0/, 'healthy DB should report foreign key violations');

  const oldSchemaDb = path.join(tmpDir, 'old-schema.db');
  createDb(oldSchemaDb, { schemaVersion: 0 });

  const oldSchema = runCheck(oldSchemaDb);
  assert.notEqual(oldSchema.status, 0, 'old schema DB should fail');
  assert.match(`${oldSchema.stdout}\n${oldSchema.stderr}`, /schemaVersion=0/, 'old schema failure should report actual schema version');

  const fkViolationDb = path.join(tmpDir, 'fk-violation.db');
  createDb(fkViolationDb, { schemaVersion: 1, fkViolation: true });

  const fkViolation = runCheck(fkViolationDb);
  assert.notEqual(fkViolation.status, 0, 'foreign key violation DB should fail');
  assert.match(`${fkViolation.stdout}\n${fkViolation.stderr}`, /foreignKeyViolations=1/, 'FK failure should report violation count');

  process.stdout.write('backend-db-check: pass\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function createDb(dbPath, options) {
  const db = new Database(dbPath);
  try {
    db.pragma(`user_version = ${options.schemaVersion}`);
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE parent (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER REFERENCES parent(id)
      );
    `);

    if (options.fkViolation) {
      db.prepare('INSERT INTO child (id, parent_id) VALUES (?, ?)').run(1, 99);
    } else {
      db.prepare('INSERT INTO parent (id) VALUES (?)').run(1);
      db.prepare('INSERT INTO child (id, parent_id) VALUES (?, ?)').run(1, 1);
    }
  } finally {
    db.close();
  }
}

function runCheck(dbPath) {
  return spawnSync(process.execPath, ['Scripts/backend-db-check.mjs', '--db', dbPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}
