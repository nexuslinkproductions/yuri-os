#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND_ROOT = path.join(REPO_ROOT, '_SYSTEM/backend');
const DEFAULT_DB_PATH = path.join(BACKEND_ROOT, 'data/yuri.db');
const PROTECTED_DB_ROOTS = [
  path.join(REPO_ROOT, 'backend/data'),
  path.join(BACKEND_ROOT, 'data'),
];
const DATABASE_SOURCE = path.join(BACKEND_ROOT, 'src/models/database.ts');
const SQLITE_BIN = '/usr/bin/sqlite3';
const SQLITE_TIMEOUT_MS = 120_000;

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(REPO_ROOT, args.db || process.env.YURI_DB_PATH || DEFAULT_DB_PATH);

if (isInsideAnyPath(dbPath, PROTECTED_DB_ROOTS) && !args.allowLiveDb) {
  process.stderr.write(
    'BACKEND_DB_CHECK_FAIL reason="implicit live DB check refused" required="--db <candidate> or --allow-live-db"\n',
  );
  process.exit(1);
}

const issues = [];
let latestSchemaVersion = -1;
let result = {
  dbPath,
  integrityCheck: 'unavailable',
  quickCheck: 'unavailable',
  foreignKeyViolations: -1,
  schemaVersion: -1,
};

try {
  latestSchemaVersion = readLatestSchemaVersion();
} catch (error) {
  issues.push(`latest schema read failed: ${error.message}`);
}

const entry = inspectCandidate(dbPath, issues);
if (entry) {
  result = {
    ...result,
    integrityCheck: sqliteScalar(dbPath, 'PRAGMA integrity_check;', 'integrity_check', issues),
    quickCheck: sqliteScalar(dbPath, 'PRAGMA quick_check;', 'quick_check', issues),
    foreignKeyViolations: sqliteInteger(
      dbPath,
      'SELECT count(*) FROM pragma_foreign_key_check;',
      'foreign_key_check',
      issues,
    ),
    schemaVersion: sqliteInteger(dbPath, 'PRAGMA user_version;', 'user_version', issues),
  };
}

if (result.integrityCheck !== 'ok') issues.push(`integrityCheck=${result.integrityCheck}`);
if (result.quickCheck !== 'ok') issues.push(`quickCheck=${result.quickCheck}`);
if (result.foreignKeyViolations !== 0) {
  issues.push(`foreignKeyViolations=${result.foreignKeyViolations}`);
}
if (result.schemaVersion !== latestSchemaVersion) {
  issues.push(`schemaVersion=${result.schemaVersion} latestSchemaVersion=${latestSchemaVersion}`);
}

const fields = [
  `db=${path.relative(REPO_ROOT, dbPath) || dbPath}`,
  `integrityCheck=${result.integrityCheck}`,
  `quickCheck=${result.quickCheck}`,
  `foreignKeyViolations=${result.foreignKeyViolations}`,
  `schemaVersion=${result.schemaVersion}`,
  `latestSchemaVersion=${latestSchemaVersion}`,
];

if (issues.length === 0) {
  process.stdout.write(`BACKEND_DB_CHECK_PASS ${fields.join(' ')}\n`);
  process.exit(0);
}

process.stderr.write(`BACKEND_DB_CHECK_FAIL ${fields.join(' ')} issues="${issues.join('; ')}"\n`);
process.exit(1);

function parseArgs(argv) {
  const parsed = { allowLiveDb: false, db: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--db') {
      if (parsed.db || !argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw new Error('--db requires exactly one path');
      }
      parsed.db = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === '--allow-live-db') {
      if (parsed.allowLiveDb) throw new Error('--allow-live-db may appear only once');
      parsed.allowLiveDb = true;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  if (parsed.db && parsed.allowLiveDb) {
    throw new Error('--db and --allow-live-db are mutually exclusive');
  }
  return parsed;
}

function inspectCandidate(candidate, candidateIssues) {
  try {
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      candidateIssues.push(`dbPath is not an exact regular file: ${candidate}`);
      return null;
    }
    if (fs.realpathSync.native(candidate) !== candidate) {
      candidateIssues.push(`dbPath traverses a symlink: ${candidate}`);
      return null;
    }
    return stat;
  } catch (error) {
    candidateIssues.push(`dbPath unavailable: ${candidate} (${error.code || error.message})`);
    return null;
  }
}

function sqliteScalar(candidate, query, label, candidateIssues) {
  const result = spawnSync(SQLITE_BIN, [
    '-readonly',
    '-batch',
    '-noheader',
    '-cmd', '.timeout 5000',
    candidate,
    query,
  ], {
    encoding: 'utf8',
    timeout: SQLITE_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr.trim() || `exit ${result.status}`;
    candidateIssues.push(`${label} failed: ${detail}`);
    return 'unavailable';
  }
  return result.stdout.trim();
}

function sqliteInteger(candidate, query, label, candidateIssues) {
  const value = sqliteScalar(candidate, query, label, candidateIssues);
  if (!/^-?\d+$/u.test(value)) {
    if (value !== 'unavailable') candidateIssues.push(`${label} returned a non-integer: ${value}`);
    return -1;
  }
  return Number(value);
}

function isInsidePath(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isInsideAnyPath(candidate, parents) {
  return parents.some((parent) => isInsidePath(candidate, parent));
}

function readLatestSchemaVersion() {
  const source = fs.readFileSync(DATABASE_SOURCE, 'utf8');
  const match = source.match(/export\s+const\s+LATEST_SCHEMA_VERSION\s*=\s*(\d+)/u);
  if (!match) throw new Error(`Unable to read LATEST_SCHEMA_VERSION from ${DATABASE_SOURCE}`);
  return Number(match[1]);
}
