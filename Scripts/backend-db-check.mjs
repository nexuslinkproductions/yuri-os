#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'backend/data/nudimmud.db');
const DATABASE_SOURCE = path.join(REPO_ROOT, 'backend/src/models/database.ts');

const require = createRequire(import.meta.url);
const Database = require(path.join(REPO_ROOT, 'backend/node_modules/better-sqlite3'));

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(REPO_ROOT, args.db || process.env.NUDIMMUD_DB_PATH || DEFAULT_DB_PATH);
const latestSchemaVersion = readLatestSchemaVersion();
const issues = [];

let result = {
  dbPath,
  integrityCheck: 'unavailable',
  quickCheck: 'unavailable',
  foreignKeyViolations: -1,
  schemaVersion: -1,
  latestSchemaVersion,
};

if (!fs.existsSync(dbPath)) {
  issues.push(`dbPath missing: ${dbPath}`);
} else {
  let db = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    result = {
      ...result,
      integrityCheck: String(db.pragma('integrity_check', { simple: true }) || 'unknown'),
      quickCheck: String(db.pragma('quick_check', { simple: true }) || 'unknown'),
      foreignKeyViolations: (db.pragma('foreign_key_check') || []).length,
      schemaVersion: Number(db.pragma('user_version', { simple: true })) || 0,
    };
  } catch (error) {
    issues.push(`db open/check failed: ${error.message}`);
  } finally {
    if (db) db.close();
  }
}

if (result.integrityCheck !== 'ok') issues.push(`integrityCheck=${result.integrityCheck}`);
if (result.quickCheck !== 'ok') issues.push(`quickCheck=${result.quickCheck}`);
if (result.foreignKeyViolations !== 0) issues.push(`foreignKeyViolations=${result.foreignKeyViolations}`);
if (result.schemaVersion !== result.latestSchemaVersion) {
  issues.push(`schemaVersion=${result.schemaVersion} latestSchemaVersion=${result.latestSchemaVersion}`);
}

const fields = [
  `db=${path.relative(REPO_ROOT, dbPath) || dbPath}`,
  `integrityCheck=${result.integrityCheck}`,
  `quickCheck=${result.quickCheck}`,
  `foreignKeyViolations=${result.foreignKeyViolations}`,
  `schemaVersion=${result.schemaVersion}`,
  `latestSchemaVersion=${result.latestSchemaVersion}`,
];

if (issues.length === 0) {
  process.stdout.write(`BACKEND_DB_CHECK_PASS ${fields.join(' ')}\n`);
  process.exit(0);
}

process.stderr.write(`BACKEND_DB_CHECK_FAIL ${fields.join(' ')} issues="${issues.join('; ')}"\n`);
process.exit(1);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--db') {
      parsed.db = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function readLatestSchemaVersion() {
  const source = fs.readFileSync(DATABASE_SOURCE, 'utf8');
  const match = source.match(/export\s+const\s+LATEST_SCHEMA_VERSION\s*=\s*(\d+)/);
  if (!match) {
    throw new Error(`Unable to read LATEST_SCHEMA_VERSION from ${DATABASE_SOURCE}`);
  }
  return Number(match[1]);
}
