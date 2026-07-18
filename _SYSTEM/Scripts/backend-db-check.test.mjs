#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CHECK = path.join(ROOT, '_SYSTEM/Scripts/backend-db-check.mjs');
const SQLITE = '/usr/bin/sqlite3';

function run(args) {
  return spawnSync(process.execPath, [CHECK, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function createDb(root, schemaVersion = 1) {
  const db = path.join(root, `candidate-${schemaVersion}.db`);
  const created = spawnSync(SQLITE, [db, [
    'PRAGMA foreign_keys=ON;',
    `PRAGMA user_version=${schemaVersion};`,
    'CREATE TABLE parent(id INTEGER PRIMARY KEY);',
    'CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));',
    'INSERT INTO parent(id) VALUES (1);',
    'INSERT INTO child(id,parent_id) VALUES (1,1);',
  ].join(' ')], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(created.status, 0, created.stderr || created.stdout);
  return db;
}

test('accepts an exact read-only candidate with integrity, FK, and schema parity', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-backend-db-check-')));
  try {
    const db = createDb(root, 1);
    const result = run(['--db', db]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /BACKEND_DB_CHECK_PASS/);
    assert.match(result.stdout, /integrityCheck=ok/);
    assert.match(result.stdout, /quickCheck=ok/);
    assert.match(result.stdout, /foreignKeyViolations=0/);
    assert.match(result.stdout, /schemaVersion=1 latestSchemaVersion=1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects stale schema, corrupt input, symlinks, and ambiguous CLI', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-backend-db-check-')));
  try {
    const stale = run(['--db', createDb(root, 0)]);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /schemaVersion=0 latestSchemaVersion=1/);

    const corruptPath = path.join(root, 'corrupt.db');
    fs.writeFileSync(corruptPath, 'not sqlite');
    const corrupt = run(['--db', corruptPath]);
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /BACKEND_DB_CHECK_FAIL/);

    const good = createDb(root, 1);
    const link = path.join(root, 'candidate-link.db');
    fs.symlinkSync(good, link);
    const symlink = run(['--db', link]);
    assert.notEqual(symlink.status, 0);
    assert.match(symlink.stderr, /not an exact regular file|traverses a symlink/);

    const ambiguous = run(['--db', good, '--allow-live-db']);
    assert.notEqual(ambiguous.status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refuses an implicit live database before opening it', () => {
  const result = run([]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /implicit live DB check refused/);
});
