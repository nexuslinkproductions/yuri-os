#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND_ROOT = path.join(REPO_ROOT, '_SYSTEM/backend');
const DEFAULT_TARGET = path.join(BACKEND_ROOT, 'data/yuri.db');
const DEFAULT_BACKUP_ROOT = path.join(REPO_ROOT, '_SYSTEM/recovery/backend-db');
const PROTECTED_DB_ROOTS = [
  path.join(REPO_ROOT, 'backend/data'),
  path.join(BACKEND_ROOT, 'data'),
];
const DATABASE_SOURCE = path.join(BACKEND_ROOT, 'src/models/database.ts');

const require = createRequire(import.meta.url);
const Database = require(path.join(BACKEND_ROOT, 'node_modules/better-sqlite3'));

const args = parseArgs(process.argv.slice(2));
const candidatePath = args.candidate ? path.resolve(REPO_ROOT, args.candidate) : null;
const targetPath = path.resolve(REPO_ROOT, args.target || DEFAULT_TARGET);
const backupDir = path.resolve(REPO_ROOT, args.backupDir || path.join(DEFAULT_BACKUP_ROOT, `live-restore-${timestampSlug()}`));
const manifestPath = path.join(backupDir, 'manifest.json');

try {
  const payload = restoreLiveDatabase();
  finish(payload, 0);
} catch (error) {
  finish({
    system: 'YURI_OS',
    ok: false,
    candidatePath,
    targetPath,
    backupDir,
    manifestPath: null,
    error: error instanceof Error ? error.message : String(error),
  }, 1);
}

function restoreLiveDatabase() {
  if (!candidatePath) throw new Error('missing --candidate');
  if (!fs.existsSync(candidatePath)) throw new Error(`candidate missing: ${candidatePath}`);
  if (path.resolve(candidatePath) === targetPath) throw new Error('candidate and target must be different paths');
  if (isInsideAnyPath(targetPath, PROTECTED_DB_ROOTS) && !args.allowLiveTarget) {
    throw new Error('protected live DB target refused; pass --allow-live-target for an operator-controlled recovery window');
  }

  const candidateBefore = verifyDatabase(candidatePath);
  if (!candidateBefore.ok) {
    throw new Error(`candidate failed verification: ${candidateBefore.issues.join('; ')}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const backedUpFiles = backupExistingFamily(targetPath, backupDir);
  checkpointAndClose(candidatePath);

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${targetPath}${suffix}`, { force: true });
  }
  fs.copyFileSync(candidatePath, targetPath);

  const targetAfter = verifyDatabase(targetPath);
  if (!targetAfter.ok) {
    throw new Error(`target failed verification after restore: ${targetAfter.issues.join('; ')}`);
  }

  const manifest = {
    system: 'YURI_OS',
    createdAt: new Date().toISOString(),
    candidatePath,
    targetPath,
    backupDir,
    backedUpFiles,
    candidateBefore,
    targetAfter,
    promotionPolicy: 'Live restore is allowed only after candidate integrity, quick_check, FK, and schema version pass.',
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    system: 'YURI_OS',
    ok: true,
    candidatePath,
    targetPath,
    backupDir,
    manifestPath,
    backedUpFiles,
    targetAfter,
  };
}

function parseArgs(argv) {
  const parsed = {
    candidate: null,
    target: null,
    backupDir: null,
    allowLiveTarget: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--candidate') {
      parsed.candidate = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (argv[index] === '--target') {
      parsed.target = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (argv[index] === '--backup-dir') {
      parsed.backupDir = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (argv[index] === '--allow-live-target') {
      parsed.allowLiveTarget = true;
      continue;
    }
    if (argv[index] === '--json') {
      parsed.json = true;
    }
  }
  return parsed;
}

function verifyDatabase(dbPath) {
  const latestSchemaVersion = readLatestSchemaVersion();
  const result = {
    path: dbPath,
    exists: fs.existsSync(dbPath),
    integrityCheck: 'unavailable',
    quickCheck: 'unavailable',
    foreignKeyViolations: -1,
    schemaVersion: -1,
    latestSchemaVersion,
    issues: [],
    ok: false,
  };

  if (!result.exists) {
    result.issues.push(`missing: ${dbPath}`);
    return result;
  }

  let db = null;
  try {
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma('foreign_keys = ON');
    db.pragma('wal_checkpoint(TRUNCATE)');
    result.integrityCheck = String(db.pragma('integrity_check', { simple: true }) || 'unknown');
    result.quickCheck = String(db.pragma('quick_check', { simple: true }) || 'unknown');
    result.foreignKeyViolations = (db.pragma('foreign_key_check') || []).length;
    result.schemaVersion = Number(db.pragma('user_version', { simple: true })) || 0;
  } catch (error) {
    result.issues.push(`db verification failed: ${error.message}`);
  } finally {
    if (db) db.close();
  }

  if (result.integrityCheck !== 'ok') result.issues.push(`integrityCheck=${result.integrityCheck}`);
  if (result.quickCheck !== 'ok') result.issues.push(`quickCheck=${result.quickCheck}`);
  if (result.foreignKeyViolations !== 0) result.issues.push(`foreignKeyViolations=${result.foreignKeyViolations}`);
  if (result.schemaVersion !== latestSchemaVersion) {
    result.issues.push(`schemaVersion=${result.schemaVersion} latestSchemaVersion=${latestSchemaVersion}`);
  }
  result.ok = result.issues.length === 0;
  return result;
}

function checkpointAndClose(dbPath) {
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

function backupExistingFamily(target, destinationDir) {
  const backedUpFiles = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${target}${suffix}`;
    if (!fs.existsSync(source)) continue;
    const destination = path.join(destinationDir, `original.db${suffix}`);
    fs.copyFileSync(source, destination);
    backedUpFiles.push(destination);
  }
  return backedUpFiles;
}

function readLatestSchemaVersion() {
  const source = fs.readFileSync(DATABASE_SOURCE, 'utf8');
  const match = source.match(/export\s+const\s+LATEST_SCHEMA_VERSION\s*=\s*(\d+)/);
  if (!match) throw new Error(`Unable to read LATEST_SCHEMA_VERSION from ${DATABASE_SOURCE}`);
  return Number(match[1]);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isInsidePath(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isInsideAnyPath(candidate, parents) {
  return parents.some((parent) => isInsidePath(candidate, parent));
}

function finish(payload, status) {
  if (args.json) {
    const stream = status === 0 ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(status);
  }

  const marker = status === 0 ? 'BACKEND_DB_LIVE_RESTORE_PASS' : 'BACKEND_DB_LIVE_RESTORE_FAIL';
  const fields = [
    `ok=${payload.ok}`,
    `candidate=${payload.candidatePath || 'none'}`,
    `target=${payload.targetPath || 'none'}`,
    `backupDir=${payload.backupDir || 'none'}`,
  ];
  if (payload.error) fields.push(`error="${payload.error}"`);
  process[status === 0 ? 'stdout' : 'stderr'].write(`${marker} ${fields.join(' ')}\n`);
  process.exit(status);
}
