#!/usr/bin/env node
/**
 * OMP Fleet Task 9 smoke harness.
 *
 * `--substrate` exercises the real Kagami JSONL bus and nano-lease filesystem
 * directly. `--live` supervises exactly two owned OMP RPC children at a time,
 * using structured JSONL frames only (never TUI/ANSI scraping).
 *
 * The live loader flag is deliberately pinned to the installed OMP contract:
 * `--extension .omp/extensions/fleet-bridge.ts` (short alias `-e` is not used).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const HELP = `Usage: node _SYSTEM/Scripts/omp-fleet-smoke.mjs [--substrate|--live]

Modes:
  (no flag)   Run automatic October identity and isolation gates.
  --substrate  Exercise the real Kagami/nano-lease paths without a model call.
  --live       Start two owned OMP RPC children with -e, then restart worker.
  --help       Show this help.

Live extension flag: -e .omp/extensions/fleet-bridge.ts (installed alias for --extension)
`;

if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}

const mode = argv[0] || '--legacy';
if (mode !== '--legacy' && mode !== '--substrate' && mode !== '--live') {
  process.stderr.write(HELP);
  process.exitCode = 2;
  process.exit();
}


// These roots are created before any dynamic substrate import. nano-lease
// captures YURI_NANO_LEASES_DIR during module evaluation.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `omp-fleet-smoke-${process.pid}-`));
const EVENT_ROOT = path.join(ROOT, 'events');
const LEASE_ROOT = path.join(ROOT, 'leases');
fs.mkdirSync(EVENT_ROOT, { recursive: true });
fs.mkdirSync(LEASE_ROOT, { recursive: true });
process.env.KAGAMI_CONTROL_STATE_ROOT = EVENT_ROOT;
process.env.YURI_NANO_LEASES_DIR = LEASE_ROOT;
const childEnv = {
  ...process.env,
  KAGAMI_CONTROL_STATE_ROOT: EVENT_ROOT,
  YURI_NANO_LEASES_DIR: LEASE_ROOT,
};
childEnv.PI_CODING_AGENT_DIR = path.join(ROOT, 'omp-profile');
fs.mkdirSync(childEnv.PI_CODING_AGENT_DIR, { recursive: true });

let rootCleaned = false;
process.on('exit', () => {
  if (!rootCleaned) {
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort at process exit */ }
  }
});

const GLOBAL_TIMEOUT_MS = 60_000;
const START_TIMEOUT_MS = 15_000;
const POLL_MS = 40;
const OMP_BIN = '/Users/marcelspatz/.bun/bin/omp';
const LIVE_EXTENSION = '.omp/extensions/fleet-bridge.ts';
const liveChildren = new Set();
const heldLeases = [];
let failureReported = false;

const bus = await import('./kagami-event-bus.mjs');
const leases = await import('./nano-lease.mjs');
const protocol = await import('./omp-fleet-protocol.mjs');

function reportFailure(message) {
  if (!failureReported) {
    failureReported = true;
    process.stderr.write(`FAIL ${message}\n`);
  }
}

function pass(message) {
  process.stdout.write(`PASS ${message}\n`);
}

function gate(label, fn) {
  try {
    fn();
    pass(label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportFailure(`${label}: ${message}`);
    throw error;
  }
}

async function gateAsync(label, fn) {
  try {
    await fn();
    pass(label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportFailure(`${label}: ${message}`);
    throw error;
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function owner(fleetId) {
  return protocol.buildProcessOwnerId({
    fleetId,
    pid: process.pid,
    processUuid: crypto.randomUUID(),
    sessionId: `smoke-${fleetId}`,
  });
}

function rememberLease(leaseId, nanoId) {
  heldLeases.push({ leaseId, nanoId });
}

function releaseRememberedLeases() {
  for (const { leaseId, nanoId } of heldLeases.splice(0).reverse()) {
    try { leases.releaseLease(leaseId, nanoId); } catch { /* cleanup is best effort */ }
  }
  try { leases.reclaimLeases(); } catch { /* cleanup is best effort */ }
}

function fleetEventRows() {
  return bus.readKagamiEventsSince({}, { root: EVENT_ROOT })
    .map((row) => row && row.payload && typeof row.payload === 'object' ? row.payload : null)
    .filter((event) => event && typeof event.kind === 'string' && event.kind.startsWith('fleet.'));
}

async function waitUntil(predicate, label, timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  const leaseListing = (() => { try { return fs.readdirSync(LEASE_ROOT); } catch (error) { return [`<lease-read:${error.message}>`]; } })();
  const childDiagnostics = [...liveChildren].map((peer) => ({ fleetId: peer.fleetId, stderr: peer.stderr.slice(-2000), frames: peer.frames.slice(-10) }));
  throw new Error(`${label} timed out after ${timeoutMs}ms; leases=${JSON.stringify(leaseListing)} children=${JSON.stringify(childDiagnostics)}`);
}

async function runSubstrate() {
  const projectId = protocol.canonicalProjectId(ROOT);
  const captainOwner = owner('captain');
  const workerOwner = owner('worker');
  const duplicateWorkerOwner = owner('worker');

  const captainLease = protocol.peerLeaseId(projectId, 'captain');
  const workerLease = protocol.peerLeaseId(projectId, 'worker');
  const captain = leases.acquireLease(captainLease, captainOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
  const worker = leases.acquireLease(workerLease, workerOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
  if (captain.ok) rememberLease(captainLease, captainOwner);
  if (worker.ok) rememberLease(workerLease, workerOwner);

  gate('distinct peers acquired', () => {
    assert.equal(captain.ok, true, 'captain lease must be acquired');
    assert.equal(worker.ok, true, 'worker lease must be acquired');
    assert.notEqual(captainOwner, workerOwner, 'peer owners must be unique');
    const live = leases.listLeases().filter((entry) => entry.leaseId === captainLease || entry.leaseId === workerLease);
    assert.equal(live.length, 2, 'both peer leases must be visible');
  });

  gate('duplicate worker rejected', () => {
    assert.equal(duplicateWorkerOwner !== workerOwner, true);
    const duplicate = leases.acquireLease(workerLease, duplicateWorkerOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
    assert.equal(duplicate.ok, false, 'duplicate worker claim must fail');
    assert.equal(duplicate.heldBy, workerOwner, 'failure must identify current holder');
  });

  const sent = protocol.buildFleetEvent('fleet.message.sent', {
    projectId,
    traceId: 'smoke-message-trace',
    from: 'captain',
    to: 'worker',
    payload: {
      messageId: 'smoke-message-1',
      body: 'substrate smoke',
      replyTo: null,
      artifactUris: [],
      authority: 'peer',
    },
  }, { id: 'fleet_smoke-message-sent', ts: '2026-01-01T00:00:00.000Z' });
  const acknowledged = protocol.buildFleetEvent('fleet.message.acknowledged', {
    projectId,
    traceId: sent.traceId,
    from: 'worker',
    to: 'captain',
    payload: { messageId: 'smoke-message-1', recipient: 'worker', disposition: 'injected' },
  }, { id: 'fleet_smoke-message-ack', ts: '2026-01-01T00:00:00.001Z' });
  bus.appendKagamiEvent('fleet.message.sent', sent, {
    root: EVENT_ROOT, allowUnknownKind: true, id: sent.id, ts: sent.ts,
  });
  bus.appendKagamiEvent('fleet.message.acknowledged', acknowledged, {
    root: EVENT_ROOT, allowUnknownKind: true, id: acknowledged.id, ts: acknowledged.ts,
  });
  const afterMessage = bus.readKagamiEventsSince(
    { afterId: sent.id, afterTs: sent.ts },
    { root: EVENT_ROOT },
  );
  const afterEvents = afterMessage
    .map((row) => row && row.payload && typeof row.payload === 'object' ? row.payload : null)
    .filter(Boolean);
  const folded = protocol.foldFleetEvents([sent, acknowledged], { projectId });
  gate('message acknowledged', () => {
    assert.equal(afterEvents.some((event) => event.id === acknowledged.id), true, 'afterId+afterTs must return ack');
    assert.equal(folded.messages.get('smoke-message-1')?.acknowledged, true, 'protocol must fold acknowledgement');
  });

  const taskId = protocol.taskLeaseId(projectId, 'smoke-task');
  const taskOwner = owner('worker');
  const taskCompetitor = owner('worker');
  const taskClaim = leases.acquireLease(taskId, taskOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
  if (taskClaim.ok) rememberLease(taskId, taskOwner);
  const competingClaim = leases.acquireLease(taskId, taskCompetitor, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
  gate('task claim exclusive', () => {
    assert.equal(taskClaim.ok, true, 'first task claim must win');
    assert.equal(competingClaim.ok, false, 'competitor must be rejected');
    assert.equal(competingClaim.heldBy, taskOwner, 'task rejection must identify holder');
  });

  const deadLease = 'fleet-smoke:dead-holder';
  const deadOwner = owner('worker');
  const reacquiredOwner = owner('worker');
  const deadClaim = leases.acquireLease(deadLease, deadOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
  if (deadClaim.ok) rememberLease(deadLease, deadOwner);
  gate('restart owner reacquired', () => {
    assert.equal(deadClaim.ok, true, 'simulated dead holder must start with a lease');
    const ownerFile = path.join(deadClaim.dir, '.owner');
    const stale = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    stale.pid = 99_999_999;
    stale.renewedAt = 0;
    fs.writeFileSync(ownerFile, JSON.stringify(stale));
    const reclaimed = leases.acquireLease(deadLease, reacquiredOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
    assert.equal(reclaimed.ok, true, 'dead holder must be reclaimable');
    heldLeases.splice(heldLeases.findIndex((entry) => entry.leaseId === deadLease && entry.nanoId === deadOwner), 1);
    rememberLease(deadLease, reacquiredOwner);
    assert.equal(leases.listLeases().find((entry) => entry.leaseId === deadLease)?.nanoId, reacquiredOwner);
  });
}

const FORBIDDEN_MODEL_TYPES = new Set([
  'agent_start', 'agent_end', 'agent_event',
  'model_start', 'model_end', 'model_delta',
  'message_start', 'message_update', 'message_end',
  'assistant_message', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
]);

class ChildExitError extends Error {
  constructor(label, code, signal) {
    super(`${label} exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    this.name = 'ChildExitError';
    this.exitCode = Number.isInteger(code) ? code : 1;
  }
}

function startPeer(fleetId) {
  const child = spawn(OMP_BIN, [
    '--mode', 'rpc',
    '--no-rules',
    '--no-title',
    '-e', LIVE_EXTENSION,
    '--profile', 'omp-fleet-smoke',
  ], {
    cwd: process.cwd(),
    env: { ...childEnv, YURI_FLEET_ID: fleetId },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    throw new Error(`OMP ${fleetId} child did not expose an owned pid`);
  }

  const peer = {
    fleetId,
    child,
    pid: child.pid,
    owned: true,
    stopping: false,
    frames: [],
    listeners: new Set(),
    fatalError: null,
    stderr: '',
    stdoutBuffer: '',
    exit: null,
  };
  peer.exit = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      peer.exitResult = { code, signal };
      resolve(peer.exitResult);
      if (!peer.stopping && !peer.fatalError) {
        peer.fail(new ChildExitError(`OMP ${fleetId}`, code, signal));
      }
      for (const listener of peer.listeners) listener();
    });
  });
  peer.fail = (error) => {
    if (!peer.fatalError) {
      peer.fatalError = error instanceof Error ? error : new Error(String(error));
      for (const listener of peer.listeners) listener();
    }
  };

  child.once('error', (error) => peer.fail(new Error(`OMP ${fleetId} child error: ${error.message}`)));
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    peer.stderr += text.slice(0, 8192);
    if (/extension[_ -]?error|uncaught|fatal|error:/i.test(text)) {
      peer.fail(new Error(`OMP ${fleetId} stderr diagnostic: ${text.trim().split('\n')[0]}`));
    }
  });
  child.stdout.on('data', (chunk) => {
    peer.stdoutBuffer += chunk.toString();
    for (;;) {
      const newline = peer.stdoutBuffer.indexOf('\n');
      if (newline < 0) break;
      const line = peer.stdoutBuffer.slice(0, newline).trim();
      peer.stdoutBuffer = peer.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let frame;
      try { frame = JSON.parse(line); } catch (error) {
        peer.fail(new Error(`OMP ${fleetId} emitted non-JSON stdout: ${line.slice(0, 180)}`));
        continue;
      }
      if (FORBIDDEN_MODEL_TYPES.has(frame?.type) || frame?.type === 'extension_error' || frame?.method === 'extension_error') {
        peer.fail(new Error(`OMP ${fleetId} emitted forbidden frame type ${frame?.type || frame?.method}`));
      }
      if (frame?.type === 'response' && frame?.command === 'prompt') {
        peer.fail(new Error(`OMP ${fleetId} emitted a model prompt response`));
      }
      peer.frames.push(frame);
      for (const listener of peer.listeners) listener();
    }
  });
  child.stdout.once('end', () => {
    if (peer.stdoutBuffer.trim()) peer.fail(new Error(`OMP ${fleetId} ended with an incomplete JSONL frame`));
  });
  liveChildren.add(peer);
  return peer;
}

function waitForFrame(peer, predicate, label, timeoutMs = START_TIMEOUT_MS) {
  const scan = () => peer.frames.find(predicate);
  const immediate = scan();
  if (immediate) return Promise.resolve(immediate);
  return withTimeout(new Promise((resolve, reject) => {
    const check = () => {
      if (peer.fatalError) {
        peer.listeners.delete(check);
        reject(peer.fatalError);
        return;
      }
      const frame = scan();
      if (frame) {
        peer.listeners.delete(check);
        resolve(frame);
      }
    };
    peer.listeners.add(check);
    check();
  }), timeoutMs, `${peer.fleetId} ${label}`);
}

function sendFrame(peer, frame) {
  if (peer.fatalError) throw peer.fatalError;
  if (peer.child.stdin.destroyed || peer.child.stdin.writableEnded) throw new Error(`OMP ${peer.fleetId} stdin is closed`);
  peer.child.stdin.write(`${JSON.stringify(frame)}\n`);
}

function killOwnedProcessTree(peer, signal) {
  if (!peer.owned || !Number.isInteger(peer.pid) || peer.pid <= 0) {
    throw new Error(`refusing to kill unowned OMP handle ${peer?.fleetId || 'unknown'}`);
  }
  peer.stopping = true;
  try { process.kill(-peer.pid, signal); }
  catch (error) {
    if (error?.code !== 'ESRCH') {
      try { peer.child.kill(signal); } catch { /* cleanup continues */ }
    }
  }
}

async function stopPeer(peer, { strict = false } = {}) {
  if (!peer || !peer.owned) return { code: 0, signal: null };
  if (!peer.exitResult) {
    peer.stopping = true;
    try { peer.child.stdin.end(); } catch { /* already closed */ }
    try {
      await withTimeout(peer.exit, 8_000, `graceful OMP ${peer.fleetId} exit`);
    } catch (error) {
      killOwnedProcessTree(peer, 'SIGTERM');
      try { await withTimeout(peer.exit, 2_000, `OMP ${peer.fleetId} SIGTERM exit`); }
      catch { killOwnedProcessTree(peer, 'SIGKILL'); }
      if (strict) throw error;
    }
  }
  const result = peer.exitResult || { code: null, signal: null };
  if (strict && (result.code !== 0 || result.signal !== null)) {
    throw new ChildExitError(`OMP ${peer.fleetId} graceful stop`, result.code, result.signal);
  }
  liveChildren.delete(peer);
  return result;
}

function peerLeaseOwner(projectId, fleetId) {
  const leaseId = protocol.peerLeaseId(projectId, fleetId);
  return leases.listLeases().find((entry) => entry.leaseId === leaseId)?.nanoId;
}
async function initializeLivePeer(peer) {
  sendFrame(peer, { type: 'get_state' });
  sendFrame(peer, { type: 'new_session' });
  await waitForFrame(peer, (frame) => frame?.type === 'response' && frame.command === 'get_state' && frame.success === true, 'get_state response');
}

async function runLegacy() {
  const projectId = protocol.canonicalProjectId(ROOT);
  const captainOwner = owner('captain');
  const workerOwner = owner('worker');
  const captainLease = protocol.peerLeaseId(projectId, 'captain');
  const workerLease = protocol.peerLeaseId(projectId, 'worker');
  const captain = leases.acquireLease(captainLease, captainOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
  const worker = leases.acquireLease(workerLease, workerOwner, { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
  if (captain.ok) rememberLease(captainLease, captainOwner);
  if (worker.ok) rememberLease(workerLease, workerOwner);
  gate('automatic identity captain + worker', () => {
    assert.equal(captain.ok, true);
    assert.equal(worker.ok, true);
  });
  const link = path.join(ROOT, 'project-link');
  fs.symlinkSync(ROOT, link, 'dir');
  gate('canonical project identity follows symlink', () => {
    assert.equal(protocol.canonicalProjectId(link), projectId);
  });
  const otherRoot = fs.mkdtempSync(path.join(ROOT, 'other-project-'));
  gate('separate project IDs isolate same fleet ID', () => {
    assert.notEqual(protocol.canonicalProjectId(otherRoot), projectId);
    const otherLease = protocol.peerLeaseId(protocol.canonicalProjectId(otherRoot), 'worker');
    const other = leases.acquireLease(otherLease, owner('worker'), { ttlMs: protocol.FLEET_LIMITS.peerLeaseTtlMs });
    assert.equal(other.ok, true);
    if (other.ok) rememberLease(otherLease, other.nanoId || '');
  });
  const ghost = protocol.buildFleetEvent('fleet.message.sent', {
    projectId, traceId: 'ghost-trace', from: 'captain', to: 'worker',
    payload: { messageId: 'ghost-message', body: 'ghost', replyTo: null, artifactUris: [], authority: 'peer' },
  }, { id: 'fleet_ghost', ts: '2026-01-01T00:00:02.000Z' });
  bus.appendKagamiEvent('fleet.message.sent', ghost, { root: EVENT_ROOT, allowUnknownKind: true, id: ghost.id, ts: ghost.ts });
  gate('same-repo peer discovery and ghost remains unacknowledged', () => {
    const rows = fleetEventRows();
    assert.ok(rows.some((event) => event.id === ghost.id));
    assert.equal(rows.some((event) => event.kind === 'fleet.message.acknowledged' && event.payload?.messageId === ghost.payload.messageId), false);
    assert.equal(leases.listLeases().filter((entry) => entry.leaseId.startsWith(`fleet-peer:${projectId}:`)).length, 2);
  });
  const derivedWorker = protocol.deriveOctoberWorkerId('node-b');
  gate('automatic worker identity is deterministic', () => {
    assert.equal(derivedWorker, protocol.deriveOctoberWorkerId('node-b'));
    assert.match(derivedWorker, /^worker-[a-z0-9-]+-[0-9a-f]{8}$/);
  });
  gate('automatic node lease identity is stable', () => {
    assert.equal(protocol.octoberNodeLeaseId(projectId, 'node-a'), protocol.octoberNodeLeaseId(projectId, 'node-a'));
    assert.notEqual(protocol.octoberNodeLeaseId(projectId, 'node-a'), protocol.octoberNodeLeaseId(projectId, 'node-b'));
  });
  gate('owner IDs are unique across restart', () => {
    assert.notEqual(owner('worker'), owner('worker'));
  });
  gate('explicit peer lease resource is stable', () => {
    assert.equal(captainLease, protocol.peerLeaseId(projectId, 'captain'));
    assert.equal(workerLease, protocol.peerLeaseId(projectId, 'worker'));
  });
  gate('same-repo peers remain discoverable', () => {
    assert.equal(leases.listLeases().filter((entry) => entry.leaseId.startsWith(`fleet-peer:${projectId}:`)).length, 2);
  });
  gate('identity owner IDs encode fleet role', () => {
    assert.equal(protocol.parseProcessOwnerId(captainOwner).fleetId, 'captain');
    assert.equal(protocol.parseProcessOwnerId(workerOwner).fleetId, 'worker');
  });
  gate('automatic identity rejects invalid fleet labels', () => {
    assert.throws(() => protocol.peerLeaseId(projectId, 'Worker'), /Invalid fleet ID/);
  });
  gate('automatic identity rejects malformed owner IDs', () => {
    assert.throws(() => protocol.parseProcessOwnerId('worker:not-an-owner'), /Invalid process owner ID/);
  });
  gate('automatic identity preserves ghost event until acknowledgement', () => {
    const rows = fleetEventRows();
    assert.ok(rows.some((event) => event.id === ghost.id));
    assert.equal(rows.filter((event) => event.kind === 'fleet.message.acknowledged').length, 0);
  });
  gate('automatic identity keeps project event root isolated', () => {
    const foreignRoot = path.join(ROOT, 'foreign-events');
    bus.appendKagamiEvent('foreign.kind', { marker: 'foreign' }, { root: foreignRoot, allowUnknownKind: true, id: 'foreign-1', ts: '2026-01-01T00:00:03.000Z' });
    assert.equal(bus.readKagamiEventsSince({}, { root: EVENT_ROOT }).some((event) => event.id === 'foreign-1'), false);
  });
}
async function runLive() {
  const projectId = protocol.canonicalProjectId(process.cwd());
  const captain = startPeer('captain');
  await initializeLivePeer(captain);
  const worker = startPeer('worker');
  await initializeLivePeer(worker);
  gate('live peers ready', () => {
    assert.equal(captain.frames.some((frame) => frame.type === 'ready'), true);
    assert.equal(worker.frames.some((frame) => frame.type === 'ready'), true);
  });
  await waitUntil(() => peerLeaseOwner(projectId, 'captain') && peerLeaseOwner(projectId, 'worker'), 'live peer leases');
  gate('live leases acquired', () => {
    assert.equal(typeof peerLeaseOwner(projectId, 'captain'), 'string');
    assert.equal(typeof peerLeaseOwner(projectId, 'worker'), 'string');
  });
  await waitUntil(() => {
    const rows = fleetEventRows();
    return rows.find((event) => event.kind === 'fleet.peer.joined' && event.from === 'captain') &&
      rows.find((event) => event.kind === 'fleet.peer.joined' && event.from === 'worker');
  }, 'fleet extension peer events');
  gate('live extension observed', () => {
    const rows = fleetEventRows();
    assert.ok(rows.some((event) => event.kind === 'fleet.peer.joined' && event.from === 'captain'));
    assert.ok(rows.some((event) => event.kind === 'fleet.peer.joined' && event.from === 'worker'));
  });

  const oldWorkerOwner = peerLeaseOwner(projectId, 'worker');
  await stopPeer(worker, { strict: true });
  await waitUntil(() => !peerLeaseOwner(projectId, 'worker'), 'worker lease release');
  const restartedWorker = startPeer('worker');
  await initializeLivePeer(restartedWorker);
  await waitUntil(() => peerLeaseOwner(projectId, 'worker'), 'worker lease reacquisition');
  const newWorkerOwner = peerLeaseOwner(projectId, 'worker');
  gate('restart owner reacquired', () => {
    assert.equal(typeof oldWorkerOwner, 'string');
    assert.equal(typeof newWorkerOwner, 'string');
    assert.notEqual(newWorkerOwner, oldWorkerOwner, 'restart must create a new process ownerId');
    assert.equal(protocol.peerLeaseId(projectId, 'worker'), protocol.peerLeaseId(projectId, 'worker'), 'stable worker lease identity');
    assert.ok(fleetEventRows().some((event) => event.kind === 'fleet.peer.joined' && event.from === 'worker' && event.payload?.ownerId === newWorkerOwner));
  });
}

async function cleanupChildren() {
  for (const peer of [...liveChildren].reverse()) {
    try { await stopPeer(peer, { strict: false }); } catch { /* cleanup must continue */ }
  }
}

async function cleanupRoot() {
  await cleanupChildren();
  releaseRememberedLeases();
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* exit hook retries */ }
  rootCleaned = !fs.existsSync(ROOT);
  if (!rootCleaned) throw new Error('smoke temp root was not removed');
}
async function main() {
  try {
    await withTimeout(mode === '--substrate' ? runSubstrate() : mode === '--live' ? runLive() : runLegacy(), GLOBAL_TIMEOUT_MS, `${mode} smoke`);
  } catch (error) {
    reportFailure(error instanceof Error ? error.message : String(error));
    process.exitCode = error?.exitCode || 1;
  } finally {
    try { await cleanupRoot(); }
    catch (error) {
      reportFailure(error instanceof Error ? error.message : String(error));
      process.exitCode = process.exitCode || 1;
    }
  }
}

await main();
