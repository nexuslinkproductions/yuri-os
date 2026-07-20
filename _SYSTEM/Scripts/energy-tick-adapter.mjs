#!/usr/bin/env node
// @capability: yuri-energy-post-tool-adapter
// @serves: PostToolUse | energy tick | delta U trace | energy circuit breaker | session energy snapshot
// @does: Converts one harness PostToolUse JSON event into the provider-neutral energy core, persists an atomic bounded session snapshot, and always fails soft.
// @use: Register as the repository-owned PostToolUse command. Set YURI_ENERGY_OBSERVABILITY=1 to enable; disabled mode performs zero filesystem I/O.
// @exports: atomicWrite, processEnergyEvent, runCli, sanitizeSessionId

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  evaluateGate,
  loadBreakerCfg,
  normBreaker,
  transitionOnVerdict,
} from './energy-breaker.mjs';
import {
  classifyTransition,
  freshState,
  isProtectedPath,
  shouldGate,
  tickAndTrace,
} from './energy-tick-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const MAX_SESSION_ID_LENGTH = 80;

export function sanitizeSessionId(value) {
  const clean = (typeof value === 'string' ? value : '')
    .replace(/[^A-Za-z0-9_-]/gu, '')
    .slice(0, MAX_SESSION_ID_LENGTH);
  return clean || 'default';
}

function readBoundedText(file, maxBytes) {
  try {
    const stat = fs.fstatSync(file);
    if (stat.isFile() && stat.size > maxBytes) return null;
  } catch {
    // Pipes commonly have no useful size; the post-read bound remains authoritative.
  }
  const chunks = [];
  let total = 0;
  try {
    while (total <= maxBytes) {
      const remaining = maxBytes + 1 - total;
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const bytesRead = fs.readSync(file, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) return null;
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } catch {
    return null;
  }
}

function assertPlainFileOrMissing(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('snapshot target is not a plain file');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function ensurePlainDirectory(directory, mode = 0o700) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    fs.mkdirSync(directory, { recursive: true, mode });
    stat = fs.lstatSync(directory);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('state path is not a plain directory');
}

function readSnapshot(snapshotPath) {
  let descriptor;
  try {
    assertPlainFileOrMissing(snapshotPath);
    descriptor = fs.openSync(
      snapshotPath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* fail-soft telemetry */ }
    }
  }
}

export function atomicWrite(target, data) {
  if (Buffer.byteLength(data, 'utf8') > MAX_SNAPSHOT_BYTES) throw new Error('snapshot exceeds size limit');
  ensurePlainDirectory(path.dirname(target));
  assertPlainFileOrMissing(target);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, data, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, target);
}

export function processEnergyEvent(event, {
  env = process.env,
  nowIso = new Date().toISOString(),
  repoRoot = REPO_ROOT,
} = {}) {
  if (env.YURI_ENERGY_OBSERVABILITY !== '1') return { status: 'disabled', traced: false };
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { status: 'invalid-event', traced: false };
  if (!shouldGate(classifyTransition(event))) return { status: 'skipped', traced: false };

  const sessionId = sanitizeSessionId(event.session_id);
  const stateRoot = env.YURI_STATE_DIR
    ? path.resolve(env.YURI_STATE_DIR)
    : path.join(repoRoot, '_SYSTEM/state');
  const stateRelative = path.relative(repoRoot, stateRoot);
  if (!stateRelative.startsWith(`..${path.sep}`) && stateRelative !== '..'
      && isProtectedPath(`${stateRelative}/energy-session/probe.json`)) {
    throw new Error('energy state root cannot be a protected surface');
  }
  const snapshotDir = path.join(stateRoot, 'energy-session');
  const traceDir = path.join(stateRoot, 'energy-trace');
  const snapshotPath = path.join(snapshotDir, `${sessionId}.json`);
  ensurePlainDirectory(stateRoot);
  ensurePlainDirectory(snapshotDir);
  assertPlainFileOrMissing(snapshotPath);
  ensurePlainDirectory(traceDir);
  const snapshot = readSnapshot(snapshotPath);
  const previousState = snapshot?.state && typeof snapshot.state === 'object'
    ? snapshot.state
    : freshState();
  const depth = Number.isFinite(snapshot?.depth) ? snapshot.depth : 0;
  const recentAbs = Array.isArray(snapshot?.recentAbs) ? snapshot.recentAbs : [];
  const recentSigned = Array.isArray(snapshot?.recentSigned) ? snapshot.recentSigned : [];
  const ledger = Array.isArray(snapshot?.ledger?.claims) ? snapshot.ledger : undefined;
  const claimFieldFailures = Number.isFinite(snapshot?.claimFieldFailures)
    ? snapshot.claimFieldFailures
    : 0;

  const result = tickAndTrace(previousState, event, {
    runId: `session-${sessionId}-${depth}`,
    nowIso,
    depth,
    recentAbs,
    recentSigned,
    ledger,
    claimFieldFailures,
    traceOptions: { traceDir },
  });
  if (!result.traced) return { status: 'skipped', traced: false, sessionId };

  let breaker;
  try {
    const nowMs = Date.parse(nowIso) || Date.now();
    const decayed = evaluateGate(snapshot?.breaker, nowMs, loadBreakerCfg(env)).breaker;
    breaker = transitionOnVerdict(decayed, result.verdict, nowMs);
  } catch {
    breaker = normBreaker(snapshot?.breaker);
  }

  atomicWrite(snapshotPath, `${JSON.stringify({
    state: result.state,
    depth: result.depth,
    recentAbs: result.recentAbs,
    recentSigned: result.recentSigned,
    surpriseEngaged: result.surpriseEngaged,
    deepEngaged: result.deepEngaged,
    shadowTrend: result.shadowTrend,
    breaker,
    ledger: result.ledger,
    claimFieldFailures: result.claimFieldFailures,
    sessionId,
    updatedAt: nowIso,
  })}\n`);
  return { status: 'traced', traced: true, sessionId, snapshotPath };
}

export function runCli({ env = process.env, stdin = 0 } = {}) {
  if (env.YURI_ENERGY_OBSERVABILITY !== '1') return 0;
  const source = readBoundedText(stdin, MAX_INPUT_BYTES);
  if (source === null) return 0;
  let event;
  try {
    event = JSON.parse(source || '{}');
  } catch {
    return 0;
  }
  try {
    processEnergyEvent(event, { env });
  } catch {
    // Telemetry cannot block or fail a user tool transition.
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
