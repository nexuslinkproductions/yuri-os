#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const Database = require(path.join(process.cwd(), '_SYSTEM/backend/node_modules/better-sqlite3'));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-db-live-restore-'));

try {
  const candidate = path.join(tmpDir, 'candidate.db');
  const target = path.join(tmpDir, 'target.db');
  const backupDir = path.join(tmpDir, 'backup');
  createDb(candidate, 'candidate');
  createDb(target, 'original');

  const protectedRefusal = spawnSync(process.execPath, [
    '_SYSTEM/Scripts/backend-db-live-restore.mjs',
    '--candidate',
    candidate,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.notEqual(protectedRefusal.status, 0, 'live restore should refuse the protected default target without override');
  assert.match(
    `${protectedRefusal.stdout}\n${protectedRefusal.stderr}`,
    /protected live DB target refused/,
    'protected target refusal should be explicit'
  );

  const restore = spawnSync(process.execPath, [
    '_SYSTEM/Scripts/backend-db-live-restore.mjs',
    '--candidate',
    candidate,
    '--target',
    target,
    '--backup-dir',
    backupDir,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(restore.status, 0, `restore should pass:\n${restore.stdout}\n${restore.stderr}`);
  const payload = JSON.parse(restore.stdout);
  assert.equal(payload.system, 'YURI_OS');
  assert.equal(payload.ok, true);
  assert.equal(fs.existsSync(path.join(backupDir, 'original.db')), true, 'restore should back up the previous target DB');
  assert.equal(readValue(target), 'candidate', 'restore should replace target content with candidate content');
  assert.equal(fs.existsSync(payload.manifestPath), true, 'restore should write a manifest');

  const dbCheck = spawnSync(process.execPath, ['_SYSTEM/Scripts/backend-db-check.mjs', '--db', target], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(dbCheck.status, 0, `restored target should pass db check:\n${dbCheck.stdout}\n${dbCheck.stderr}`);

  process.stdout.write('backend-db-live-restore: pass\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function createDb(dbPath, value) {
  const db = new Database(dbPath);
  try {
    db.pragma('user_version = 1');
    db.exec('CREATE TABLE proof (value TEXT NOT NULL)');
    db.prepare('INSERT INTO proof (value) VALUES (?)').run(value);
  } finally {
    db.close();
  }
}

function readValue(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT value FROM proof LIMIT 1').get().value;
  } finally {
    db.close();
  }
}
