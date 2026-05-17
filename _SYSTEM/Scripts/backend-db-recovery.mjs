#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
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

const sourcePath = args.source ? path.resolve(REPO_ROOT, args.source) : null;
const candidatePath = path.resolve(
  REPO_ROOT,
  args.target || path.join(args.outDir || path.join(DEFAULT_OUT_ROOT, timestampSlug()), 'candidate.db')
);
const outDir = path.dirname(candidatePath);
const manifestPath = path.join(outDir, 'manifest.json');
const sourceExists = sourcePath ? fs.existsSync(sourcePath) : false;
const targetExists = fs.existsSync(candidatePath);

if (!args.source) {
  finish(buildPayload({ refusalReason: 'missing --source' }), 1, 'FAIL');
}

if (isInsidePath(sourcePath, PROTECTED_DB_ROOT) && !args.allowLiveSource) {
  finish(buildPayload({ refusalReason: 'protected live DB source refused', required: '--allow-live-source' }), 1, 'FAIL');
}

if (isInsidePath(candidatePath, PROTECTED_DB_ROOT) && !args.allowLiveTarget) {
  finish(buildPayload({ refusalReason: 'protected live DB target refused', required: '--allow-live-target' }), 1, 'FAIL');
}

if (args.dryRun) {
  const integrity = sourceExists
    ? await verifyDryRunCandidate(sourcePath)
    : unavailableIntegrity('source missing');
  const payload = buildPayload({ integrity });
  payload.recoveryReady = isRecoveryReady(payload);
  finish(payload, payload.recoveryReady ? 0 : 1, 'DRY_RUN');
}

if (!sourceExists) {
  finish(buildPayload({ refusalReason: 'source missing' }), 1, 'FAIL');
}

if (targetExists) {
  finish(buildPayload({ refusalReason: 'target already exists; choose a new --target path' }), 1, 'FAIL');
}

fs.mkdirSync(outDir, { recursive: true });

const copiedFiles = copySourceFamily(sourcePath, outDir);
await createBackupCandidate(sourcePath, candidatePath);
const checks = verifyCandidate(candidatePath);
const payload = buildPayload({ integrity: checks, copiedFiles });
payload.recoveryReady = isRecoveryReady(payload);

const manifest = {
  system: 'YURI_OS',
  createdAt: new Date().toISOString(),
  sourcePath,
  targetPath: candidatePath,
  candidatePath,
  dryRun: false,
  sourceExists,
  targetExists,
  wouldCreate: !targetExists,
  copiedFiles,
  integrity: checks,
  checks,
  recoveryReady: payload.recoveryReady,
  promotionPolicy: 'Promote only after integrityCheck=ok, quickCheck=ok, foreignKeyViolations=0, and backend smoke passes.',
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

payload.manifestPath = manifestPath;
finish(payload, payload.recoveryReady ? 0 : 1, payload.recoveryReady ? 'PASS' : 'FAIL');

function parseArgs(argv) {
  const parsed = {
    source: null,
    target: null,
    outDir: null,
    dryRun: false,
    json: false,
    allowLiveSource: false,
    allowLiveTarget: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source') {
      parsed.source = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (argv[index] === '--target') {
      parsed.target = argv[index + 1] || null;
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
    if (argv[index] === '--json') {
      parsed.json = true;
      continue;
    }
    if (argv[index] === '--allow-live-source') {
      parsed.allowLiveSource = true;
      continue;
    }
    if (argv[index] === '--allow-live-target') {
      parsed.allowLiveTarget = true;
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

async function verifyDryRunCandidate(source) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-db-recovery-dry-run-'));
  const tempCandidate = path.join(tempDir, 'candidate.db');
  try {
    await createBackupCandidate(source, tempCandidate);
    return verifyCandidate(tempCandidate);
  } catch (error) {
    return unavailableIntegrity(error.message);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
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

function buildPayload(overrides = {}) {
  const integrity = overrides.integrity || unavailableIntegrity(null);
  return {
    system: 'YURI_OS',
    sourcePath,
    targetPath: candidatePath,
    dryRun: args.dryRun,
    sourceExists,
    targetExists,
    wouldCreate: !targetExists,
    integrity,
    recoveryReady: false,
    refusalReason: overrides.refusalReason || null,
    required: overrides.required || null,
    manifestPath: args.dryRun ? null : manifestPath,
    copiedFiles: overrides.copiedFiles || [],
  };
}

function unavailableIntegrity(error) {
  return {
    integrityCheck: 'unavailable',
    quickCheck: 'unavailable',
    foreignKeyViolations: -1,
    schemaVersion: -1,
    error,
  };
}

function isRecoveryReady(payload) {
  return Boolean(
    !payload.refusalReason &&
    payload.sourceExists &&
    !payload.targetExists &&
    payload.wouldCreate &&
    payload.integrity.integrityCheck === 'ok' &&
    payload.integrity.quickCheck === 'ok' &&
    payload.integrity.foreignKeyViolations === 0
  );
}

function finish(payload, status, marker) {
  if (args?.json) {
    const stream = status === 0 ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(status);
  }

  const fields = [
    'system=YURI_OS',
    `source=${payload.sourcePath || 'none'}`,
    `target=${payload.targetPath || 'none'}`,
    `dryRun=${payload.dryRun}`,
    `sourceExists=${payload.sourceExists}`,
    `targetExists=${payload.targetExists}`,
    `wouldCreate=${payload.wouldCreate}`,
    `integrityCheck=${payload.integrity.integrityCheck}`,
    `quickCheck=${payload.integrity.quickCheck}`,
    `foreignKeyViolations=${payload.integrity.foreignKeyViolations}`,
    `recoveryReady=${payload.recoveryReady}`,
  ];
  if (payload.required) fields.push(`required="${payload.required}"`);
  if (payload.refusalReason) fields.push(`refusalReason="${payload.refusalReason}"`);
  if (payload.manifestPath) fields.push(`manifest=${payload.manifestPath}`);
  process[status === 0 ? 'stdout' : 'stderr'].write(`BACKEND_DB_RECOVERY_${marker} ${fields.join(' ')}\n`);
  process.exit(status);
}
