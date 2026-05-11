#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_ROOT = path.join(REPO_ROOT, '_SYSTEM/recovery/backend-db');
const PROTECTED_DB_ROOT = path.join(REPO_ROOT, 'backend/data');

const require = createRequire(import.meta.url);
const Database = require(path.join(REPO_ROOT, 'backend/node_modules/better-sqlite3'));

const args = parseArgs(process.argv.slice(2));

if (!args.source) {
  process.stderr.write('BACKEND_DB_RECOVERY_FAIL reason="missing --source"\n');
  process.exit(1);
}

const sourcePath = path.resolve(REPO_ROOT, args.source);
const outDir = path.resolve(REPO_ROOT, args.outDir || path.join(DEFAULT_OUT_ROOT, timestampSlug()));
const candidatePath = path.join(outDir, 'candidate.db');
const manifestPath = path.join(outDir, 'manifest.json');

if (isInsidePath(sourcePath, PROTECTED_DB_ROOT) && !args.allowLiveSource) {
  process.stderr.write(
    'BACKEND_DB_RECOVERY_FAIL reason="protected live DB source refused" required="--allow-live-source"\n'
  );
  process.exit(1);
}

if (args.dryRun) {
  process.stdout.write(`BACKEND_DB_RECOVERY_DRY_RUN source=${sourcePath} outDir=${outDir} candidate=${candidatePath}\n`);
  process.exit(0);
}

if (!fs.existsSync(sourcePath)) {
  process.stderr.write(`BACKEND_DB_RECOVERY_FAIL reason="source missing" source=${sourcePath}\n`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const copiedFiles = copySourceFamily(sourcePath, outDir);
await createBackupCandidate(sourcePath, candidatePath);
const checks = verifyCandidate(candidatePath);

const manifest = {
  createdAt: new Date().toISOString(),
  sourcePath,
  outDir,
  candidatePath,
  copiedFiles,
  checks,
  promotionPolicy: 'Promote only after integrityCheck=ok, quickCheck=ok, foreignKeyViolations=0, and backend smoke passes.',
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (checks.integrityCheck !== 'ok' || checks.quickCheck !== 'ok' || checks.foreignKeyViolations !== 0) {
  process.stderr.write(
    `BACKEND_DB_RECOVERY_FAIL candidate=${candidatePath} manifest=${manifestPath} integrityCheck=${checks.integrityCheck} quickCheck=${checks.quickCheck} foreignKeyViolations=${checks.foreignKeyViolations}\n`
  );
  process.exit(1);
}

process.stdout.write(
  `BACKEND_DB_RECOVERY_PASS candidate=${candidatePath} manifest=${manifestPath} integrityCheck=${checks.integrityCheck} quickCheck=${checks.quickCheck} foreignKeyViolations=${checks.foreignKeyViolations}\n`
);

function parseArgs(argv) {
  const parsed = { source: null, outDir: null, dryRun: false, allowLiveSource: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source') {
      parsed.source = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (argv[index] === '--out-dir') {
      parsed.outDir = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (argv[index] === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (argv[index] === '--allow-live-source') {
      parsed.allowLiveSource = true;
    }
  }
  return parsed;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function copySourceFamily(source, destinationDir) {
  const files = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = `${source}${suffix}`;
    if (!fs.existsSync(filePath)) continue;
    const destination = path.join(destinationDir, `source.db${suffix}`);
    fs.copyFileSync(filePath, destination);
    files.push(destination);
  }
  return files;
}

function isInsidePath(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function createBackupCandidate(source, destination) {
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }
}

function verifyCandidate(candidate) {
  const db = new Database(candidate, { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.exec('REINDEX');
    db.pragma('wal_checkpoint(TRUNCATE)');
    return {
      integrityCheck: String(db.pragma('integrity_check', { simple: true }) || 'unknown'),
      quickCheck: String(db.pragma('quick_check', { simple: true }) || 'unknown'),
      foreignKeyViolations: (db.pragma('foreign_key_check') || []).length,
      schemaVersion: Number(db.pragma('user_version', { simple: true })) || 0,
    };
  } finally {
    db.close();
  }
}
