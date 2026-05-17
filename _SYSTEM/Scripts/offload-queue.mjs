#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import { hashPayload, recordTokenEvent } from './token-ledger.mjs';

const LEASE_ROOT = process.env.OFFLOAD_LEASE_DIR || path.join(os.tmpdir(), 'yuri-offload-leases');
const HARD_MAX = parsePositiveInt(process.env.OFFLOAD_HARD_MAX_CONCURRENT_LANES, 14);
const MAX_LANES = Math.min(parsePositiveInt(process.env.OFFLOAD_MAX_CONCURRENT_LANES, 10), HARD_MAX);
const WAIT_MS = parsePositiveInt(process.env.OFFLOAD_QUEUE_WAIT_MS, 0);
const POLL_MS = parsePositiveInt(process.env.OFFLOAD_QUEUE_POLL_MS, 500);
const LEASE_TTL_MS = parsePositiveInt(process.env.OFFLOAD_LEASE_TTL_MS, 30 * 60 * 1000);

const argv = process.argv.slice(2);
const command = argv.shift();

if (command === 'status') {
  ensureLeaseRoot();
  cleanupStaleLeases();
  console.log(JSON.stringify(readLeases(), null, 2));
  process.exit(0);
}

if (command !== 'run') usage();

const { lane, cmd } = parseRunArgs(argv);
if (cmd.length === 0) usage();

ensureLeaseRoot();
const lease = acquireLease(lane);
if (!lease) {
  await recordQueueLedger({
    lane,
    status: 'error',
    operation: 'offload_queue_rejected',
    metadata: { reason: 'OFFLOAD_LANE_CEILING_REACHED', max_lanes: MAX_LANES, lease_root_hash: hashPayload(LEASE_ROOT) },
  });
  console.error(`OFFLOAD_LANE_CEILING_REACHED lane=${lane} max=${MAX_LANES} lease_dir=${LEASE_ROOT}`);
  process.exit(75);
}

let exitCode = 1;
try {
  await recordQueueLedger({
    lane,
    status: 'ok',
    operation: 'offload_queue_acquire',
    lease,
    metadata: { max_lanes: MAX_LANES, hard_max: HARD_MAX },
  });
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.error) {
    console.error(result.error.message);
    exitCode = 1;
  } else {
    exitCode = result.status ?? 0;
  }
} finally {
  releaseLease(lease);
  await recordQueueLedger({
    lane,
    status: exitCode === 0 ? 'ok' : 'error',
    operation: 'offload_queue_release',
    lease,
    metadata: { exit_code: exitCode, command_hash: hashPayload(cmd.join(' ')) },
  });
}

process.exit(exitCode);

function parseRunArgs(args) {
  let lane = 'cloud';
  const cmd = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--lane' && args[i + 1]) {
      lane = args[++i];
      continue;
    }
    if (token === '--') {
      cmd.push(...args.slice(i + 1));
      break;
    }
    cmd.push(token);
  }
  return { lane, cmd };
}

function acquireLease(lane) {
  const deadline = Date.now() + WAIT_MS;
  while (true) {
    cleanupStaleLeases();
    for (let i = 0; i < MAX_LANES; i += 1) {
      const leaseDir = path.join(LEASE_ROOT, `slot-${i}`);
      try {
        mkdirSync(leaseDir);
        const lease = {
          dir: leaseDir,
          lane,
          pid: process.pid,
          taskId: process.env.OFFLOAD_TASK_ID || '',
          acquiredAt: new Date().toISOString(),
          timeoutMs: LEASE_TTL_MS,
        };
        writeFileSync(path.join(leaseDir, 'lease.json'), JSON.stringify(lease, null, 2));
        return lease;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }

    if (Date.now() >= deadline) return null;
    sleep(Math.max(50, POLL_MS));
  }
}

function releaseLease(lease) {
  try {
    rmSync(lease.dir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup; stale leases are reaped by age on next acquire.
  }
}

function cleanupStaleLeases() {
  const now = Date.now();
  for (const name of safeReadDir(LEASE_ROOT)) {
    if (!name.startsWith('slot-')) continue;
    const leaseDir = path.join(LEASE_ROOT, name);
    const stat = safeStat(leaseDir);
    if (!stat || now - stat.mtimeMs <= LEASE_TTL_MS) continue;
    const lease = readLease(leaseDir);
    if (lease?.pid && isPidAlive(lease.pid)) continue;
    rmSync(leaseDir, { recursive: true, force: true });
  }
}

function readLeases() {
  return {
    leaseRoot: LEASE_ROOT,
    maxLanes: MAX_LANES,
    hardMax: HARD_MAX,
    leases: safeReadDir(LEASE_ROOT)
      .filter(name => name.startsWith('slot-'))
      .sort()
      .map(name => readLease(path.join(LEASE_ROOT, name)) || { slot: name }),
  };
}

function ensureLeaseRoot() {
  if (!existsSync(LEASE_ROOT)) mkdirSync(LEASE_ROOT, { recursive: true });
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function safeReadDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function safeStat(target) {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function readLease(leaseDir) {
  try {
    return JSON.parse(readFileSync(path.join(leaseDir, 'lease.json'), 'utf8'));
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function recordQueueLedger({ lane, status, operation, lease = {}, metadata = {} }) {
  await recordTokenEvent({
    trace_id: process.env.TOKEN_LEDGER_TRACE_ID || process.env.OFFLOAD_TASK_ID || lease.taskId || `offload-queue-${Date.now()}-${process.pid}`,
    session_id: process.env.OFFLOAD_TASK_ID || '',
    source_path: '_SYSTEM/Scripts/offload-queue.mjs',
    lane,
    provider: 'local',
    operation_type: operation,
    status,
    measurement_type: 'unobservable',
    accuracy_class: 'not_measurable',
    payload_hash: hashPayload({ lane, operation, taskId: lease.taskId || '', pid: lease.pid || process.pid }),
    metadata: {
      pid: process.pid,
      lease_pid: lease.pid || '',
      acquired_at: lease.acquiredAt || '',
      timeout_ms: lease.timeoutMs || LEASE_TTL_MS,
      ...metadata,
    },
  });
}

function usage() {
  console.error('Usage: offload-queue.mjs run --lane <id> -- <command> [args...]');
  console.error('       offload-queue.mjs status');
  process.exit(64);
}
