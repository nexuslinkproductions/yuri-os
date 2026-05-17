#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const scriptDir = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
const repoRoot = path.resolve(scriptDir, '..');
const statePath = path.resolve(repoRoot, '.claude/state/branch-lock.json');
const ttlMs = Number.parseInt(process.env.BRANCH_LOCK_TTL_MS || '60000', 10) || 60000;

function usage() {
  process.stdout.write(
    'Usage:\n' +
      '  branch-lock.mjs --register [branchId] <file1> [file2 ...]\n' +
      '  branch-lock.mjs --release <branchId>\n' +
      '  branch-lock.mjs --check <file>\n' +
      '  branch-lock.mjs --list\n' +
      '  branch-lock.mjs --gc\n'
  );
}

function ensureStateFile() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  if (!fs.existsSync(statePath)) {
    writeState({ locks: [] });
  }
}

function readState() {
  ensureStateFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const locks = Array.isArray(parsed?.locks) ? parsed.locks : [];
    return { locks };
  } catch {
    return { locks: [] };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, statePath);
}

function activeLocks(state, now = Date.now()) {
  return state.locks.filter((lock) => Number.isFinite(lock?.ts) && now - lock.ts <= ttlMs);
}

function canonicalFile(file) {
  const abs = path.resolve(repoRoot, file);
  const rel = path.relative(repoRoot, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join('/');
  }
  return abs;
}

function looksLikePathToken(token) {
  return token.includes('/') || token.includes('\\') || token.startsWith('.') || token.includes('.');
}

function hashArgs(args) {
  return crypto.createHash('sha256').update(args.join('\0')).digest('hex').slice(0, 12);
}

function emitJson(payload, enabled) {
  if (enabled) {
    process.stderr.write(`${JSON.stringify(payload)}\n`);
  }
}

function parseArgs(argv) {
  const args = [];
  let json = false;
  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
    } else {
      args.push(arg);
    }
  }
  return { args, json };
}

function main() {
  const { args, json } = parseArgs(process.argv.slice(2));
  const command = args[0];

  if (!command) {
    usage();
    process.exit(1);
  }

  const state = readState();
  const now = Date.now();
  const active = activeLocks(state, now);

  if (command === '--register') {
    const rest = args.slice(1);
    if (rest.length === 0) {
      usage();
      process.exit(1);
    }

    let branchId = process.env.BRANCH_LOCK_ID || '';
    let files = rest;

    if (rest.length >= 2 && !looksLikePathToken(rest[0])) {
      branchId = branchId || rest[0];
      files = rest.slice(1);
    }

    if (!branchId) {
      branchId = hashArgs(args);
    }

    files = [...new Set(files.map(canonicalFile).filter(Boolean))];
    const updated = active.filter((lock) => lock.id !== branchId);
    const entry = { id: branchId, files, ts: now, pid: process.pid };
    updated.push(entry);
    writeState({ locks: updated });
    process.stdout.write(`OK ${branchId}\n`);
    emitJson({ command: 'register', entry }, json);
    return;
  }

  if (command === '--release') {
    const branchId = args[1];
    if (!branchId) {
      usage();
      process.exit(1);
    }

    const updated = active.filter((lock) => lock.id !== branchId);
    const removed = updated.length !== active.length;
    writeState({ locks: updated });
    process.stdout.write('OK\n');
    emitJson({ command: 'release', id: branchId, removed }, json);
    return;
  }

  if (command === '--check') {
    const file = args[1];
    if (!file) {
      usage();
      process.exit(1);
    }

    const target = canonicalFile(file);
    const conflict = active.find((lock) => Array.isArray(lock.files) && lock.files.map(canonicalFile).includes(target));
    const status = conflict ? 'LOCKED' : 'FREE';
    process.stdout.write(`${status}\n`);
    emitJson({ command: 'check', file: target, status, conflict: conflict || null }, json);
    process.exit(0);
  }

  if (command === '--list') {
    const lines = active
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .map((lock) => `${lock.id} pid=${lock.pid ?? 'unknown'} ts=${lock.ts ?? 'unknown'} files=${(lock.files || []).join(',')}`);
    process.stdout.write(`${lines.length ? `${lines.join('\n')}\n` : 'OK\n'}`);
    emitJson({ command: 'list', locks: active }, json);
    return;
  }

  if (command === '--gc') {
    const kept = active;
    const removedCount = state.locks.length - kept.length;
    if (removedCount > 0 || state.locks.length !== kept.length) {
      writeState({ locks: kept });
    }
    process.stdout.write(`OK ${removedCount}\n`);
    emitJson({ command: 'gc', removed: removedCount, locks: kept }, json);
    return;
  }

  usage();
  process.exit(1);
}

main();
