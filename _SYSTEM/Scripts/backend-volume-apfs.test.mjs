#!/usr/bin/env node
/**
 * Opt-in, real-volume acceptance for the Phase-1 backend APFS image.
 *
 * Default execution is a skip.  The enabled test creates fixtures only below a
 * fresh /private/tmp mountpoint and delegates image attach/detach to the
 * separately reviewed broker.  It never creates an image, reads Keychain
 * directly, or discovers the protected runtime dataset; only the fixed broker
 * may retrieve its enrolled secret while attaching the dedicated fixture.
 *
 * Broker contract:
 *   <broker> attach --image ABS --mountpoint ABS
 *     --expected-volume-uuid UUID --expected-host-uuid UUID --json
 *   <broker> detach --mountpoint ABS --expected-volume-uuid UUID
 *     --expected-host-uuid UUID --json
 *
 * Each command must exit zero and emit exactly one JSON object.  Attach returns
 * { ok, purpose, imagePath, mountPoint, deviceIdentifier, volumeUUID,
 *   hostVolumeUUID }.  The purpose is exactly "yuri-backend-phase1".
 *
 * Guard-supervision acceptance is deliberately a separate seam: once the guard
 * CLI is stable, its fixture writer must run immediately before the first
 * detach below, prove writer exit before invoking broker detach, and emit its
 * ordered shutdown evidence.  This file does not guess or bypass that contract.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { superviseWriter } from './backend-storage-guard-legacy-v1-fixture.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const PYTHON_WORKER = path.join(SCRIPT_DIR, 'backend-volume-sqlite-worker.py');
const CANONICAL_BROKER = path.join(
  REPO_ROOT,
  '_SYSTEM/state/backend-volume/bin/backend-volume-broker',
);
const BROKER_CHILD_TIMEOUT_MS = 600_000;
const BROKER_HARNESS_TIMEOUT_MS = 660_000;
const PHASE1_LIFECYCLE_TIMEOUT_MS = (2 * BROKER_HARNESS_TIMEOUT_MS) + 60_000;
const LAUNCHD_BOOTSTRAP_ATTEMPTS = 2;
const LAUNCHD_BOOTSTRAP_RETRY_DELAY_MS = 1_000;
const LAUNCHD_SERVICE_POLL_MS = 1_000;
const LAUNCHD_BOOTOUT_RETRY_MS = 5_000;
const LAUNCHD_BOOTOUT_MAX_ATTEMPTS = 2;
const LAUNCHD_INSPECTION_COMMAND_TIMEOUT_MS = 30_000;
// The real acceptance runs guarded supervision, two complete launchd cycles,
// four direct broker operations, and final failure cleanup sequentially. Keep
// the node:test ceiling above every nested lifecycle bound so it cannot abort
// the cleanup that those lower-level bounds guarantee.
const REAL_TEST_TIMEOUT_MS = (32 * PHASE1_LIFECYCLE_TIMEOUT_MS) + 60_000;
const PRIVATE_TMP = '/private/tmp';
const ENABLED = process.env.YURI_PHASE1_REAL === '1';
const realTest = ENABLED ? test : test.skip;

const PROTECTED_ROOTS = [
  path.join(REPO_ROOT, 'backend', 'data'),
  path.join(REPO_ROOT, '_SYSTEM', 'backend', 'data'),
  path.join(REPO_ROOT, '.claude', 'projects'),
  path.join(REPO_ROOT, '.claude', 'state'),
  path.join(REPO_ROOT, '.claude', 'history'),
  path.join(REPO_ROOT, '.claude', 'file-history'),
  path.join(REPO_ROOT, '.amp'),
  path.join(REPO_ROOT, 'node_modules'),
];

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  assert.ok(value, name + ' is required when YURI_PHASE1_REAL=1');
  return value;
}

function normalizedUuid(value) {
  return String(value || '').trim().toUpperCase();
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function assertOutsideProtected(candidate, label) {
  const absolute = path.resolve(candidate);
  assert.equal(isWithin(absolute, REPO_ROOT), false, label + ' must be outside the repository');
  for (const protectedRoot of PROTECTED_ROOTS) {
    assert.equal(isWithin(absolute, protectedRoot), false, label + ' resolves inside a protected root');
  }
}

function assertExistingNoSymlink(candidate, label) {
  const absolute = path.resolve(candidate);
  assert.equal(fs.realpathSync(absolute), absolute, label + ' or one of its ancestors is a symlink');
  assert.equal(fs.lstatSync(absolute).isSymbolicLink(), false, label + ' must not be a symlink');
  return absolute;
}

function assertPrivateFixturePath(candidate, ownedRoot) {
  const absolute = path.resolve(candidate);
  assert.ok(
    absolute.startsWith(PRIVATE_TMP + path.sep + 'yuri-phase1-apfs-'),
    'fixture path must use the owned /private/tmp prefix',
  );
  assert.ok(isWithin(absolute, ownedRoot), 'fixture path escapes the owned temporary root');
  assertOutsideProtected(absolute, 'fixture path');
  return absolute;
}

function commandForBroker(broker, args) {
  if (/\.[cm]?js$/u.test(broker)) {
    return { command: process.execPath, args: [broker, ...args] };
  }
  return { command: broker, args };
}

function parseOneJson(stdout, label) {
  const trimmed = String(stdout || '').trim();
  assert.ok(trimmed, label + ' produced no JSON');
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(trimmed);
  }, label + ' must emit exactly one JSON object');
  assert.equal(parsed && typeof parsed, 'object', label + ' JSON must be an object');
  return parsed;
}

function runBroker(broker, action, args) {
  const invocation = commandForBroker(broker, [action, ...args, '--json']);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: BROKER_HARNESS_TIMEOUT_MS,
    env: { ...process.env },
  });
  assert.equal(
    result.status,
    0,
    'broker ' + action + ' failed: ' + String(result.stderr || result.stdout || '').slice(0, 2000),
  );
  const payload = parseOneJson(result.stdout, 'broker ' + action);
  assert.equal(payload.ok, true, 'broker ' + action + ' did not report ok=true');
  return payload;
}

test('broker harness timeout remains above the broker child-operation bound', () => {
  assert.ok(
    BROKER_HARNESS_TIMEOUT_MS > BROKER_CHILD_TIMEOUT_MS,
    'outer harness timeout must not terminate the broker before its bounded child cleanup',
  );
  assert.ok(
    PHASE1_LIFECYCLE_TIMEOUT_MS > 2 * BROKER_HARNESS_TIMEOUT_MS,
    'one lifecycle must cover an attach attempt plus bounded failure cleanup',
  );
  assert.ok(
    REAL_TEST_TIMEOUT_MS > 30 * PHASE1_LIFECYCLE_TIMEOUT_MS,
    'the real-test timeout must cover every sequential lifecycle and final cleanup',
  );
});

function launchctlResultText(result) {
  return String(result?.error?.message || result?.stderr || result?.stdout || '').trim();
}

function classifyLaunchctlServiceInspection(result) {
  if (result?.error || !Number.isInteger(result?.status)) return 'ambiguous';
  if (result.status === 0) return 'loaded';
  const text = launchctlResultText(result);
  if (result.status === 113 || /could not find service|service not found|no such process/i.test(text)) {
    return 'absent';
  }
  return 'ambiguous';
}

async function waitForKnownServiceAbsence({
  inspect,
  requestBootout,
  context,
  timeoutMs = PHASE1_LIFECYCLE_TIMEOUT_MS,
  pollMs = LAUNCHD_SERVICE_POLL_MS,
  bootoutRetryMs = LAUNCHD_BOOTOUT_RETRY_MS,
  maxBootoutAttempts = LAUNCHD_BOOTOUT_MAX_ATTEMPTS,
}) {
  const deadline = Date.now() + timeoutMs;
  let bootoutAttempts = 0;
  let nextBootoutAt = 0;
  let lastInspection = null;

  while (Date.now() <= deadline) {
    try {
      lastInspection = inspect();
    } catch (error) {
      lastInspection = { state: 'ambiguous', result: { status: null, error } };
    }
    if (lastInspection.state === 'absent') {
      return { inspection: lastInspection, bootoutAttempts };
    }

    const now = Date.now();
    if (bootoutAttempts < maxBootoutAttempts && now >= nextBootoutAt) {
      requestBootout();
      bootoutAttempts += 1;
      nextBootoutAt = Date.now() + bootoutRetryMs;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(pollMs, remaining));
  }

  throw new Error(
    context + ': exact launchd service never became known absent before the lifecycle deadline; '
      + 'last_state=' + String(lastInspection?.state || 'ambiguous') + '; '
      + launchctlResultText(lastInspection?.result),
  );
}

test('launchctl service inspection distinguishes absence from EIO and execution errors', () => {
  assert.equal(classifyLaunchctlServiceInspection({ status: 0 }), 'loaded');
  assert.equal(
    classifyLaunchctlServiceInspection({ status: 113, stderr: 'Could not find service' }),
    'absent',
  );
  assert.equal(classifyLaunchctlServiceInspection({ status: 5, stderr: 'Input/output error' }), 'ambiguous');
  assert.equal(
    classifyLaunchctlServiceInspection({ status: null, error: new Error('timed out') }),
    'ambiguous',
  );
});

test('launchctl absence polling tolerates SIGTERMed and ambiguous states without a process storm', async () => {
  const states = ['loaded', 'ambiguous', 'loaded', 'absent'];
  let inspections = 0;
  let bootouts = 0;
  const result = await waitForKnownServiceAbsence({
    inspect() {
      const state = states[Math.min(inspections, states.length - 1)];
      inspections += 1;
      return { state, result: { status: state === 'loaded' ? 0 : 5 } };
    },
    requestBootout() { bootouts += 1; },
    context: 'fixture',
    timeoutMs: 100,
    pollMs: 2,
    bootoutRetryMs: 2,
    maxBootoutAttempts: 2,
  });
  assert.equal(result.inspection.state, 'absent');
  assert.ok(inspections <= 4, 'service inspection loop ran more often than the bounded sequence');
  assert.ok(bootouts >= 1 && bootouts <= 2, 'bootout attempts escaped their bounded budget');
});

function plistToJson(buffer, label) {
  const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], {
    input: buffer,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, label + ' plist conversion failed: ' + String(result.stderr || ''));
  return JSON.parse(result.stdout);
}

function diskutilInfo(target) {
  const result = spawnSync('/usr/sbin/diskutil', ['info', '-plist', target], {
    encoding: null,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, 'diskutil info failed for acceptance target');
  return plistToJson(result.stdout, 'diskutil info');
}

function assertHdiutilImageDeviceMapping(image, mountPoint, deviceIdentifier) {
  const result = spawnSync('/usr/bin/hdiutil', ['info', '-plist'], {
    encoding: null,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, 'hdiutil info failed during independent mapping verification');
  const root = plistToJson(result.stdout, 'hdiutil info');
  const expectedDevice = '/dev/' + deviceIdentifier;
  const matched = (root.images || []).some((candidate) => {
    const reportedImage = candidate['image-path'] || candidate.imagePath;
    if (!reportedImage || path.resolve(reportedImage) !== image) return false;
    return (candidate['system-entities'] || []).some((entity) => (
      (entity['dev-entry'] || entity['device-entry']) === expectedDevice
        && (entity['mount-point'] || entity.mountPoint) === mountPoint
    ));
  });
  assert.equal(matched, true, 'mounted APFS device is not independently mapped to the exact sparsebundle');
}

function assertImageEncrypted(image) {
  const result = spawnSync('/usr/bin/hdiutil', ['isencrypted', '-plist', image], {
    encoding: null,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, 'hdiutil could not verify image encryption');
  const evidence = plistToJson(result.stdout, 'hdiutil isencrypted');
  assertEncryptionEvidence(evidence);
}

function assertEncryptionEvidence(evidence) {
  assert.equal(typeof evidence.encrypted, 'boolean', 'hdiutil encryption evidence lacks the exact boolean field');
  assert.equal(evidence.encrypted, true, 'hdiutil did not report the image as encrypted');
}

test('encryption evidence requires the exact root encrypted=true field', () => {
  assert.doesNotThrow(() => assertEncryptionEvidence({ encrypted: true }));
  assert.throws(() => assertEncryptionEvidence({ encrypted: false }));
  assert.throws(() => assertEncryptionEvidence({ nested: { encrypted: true } }));
  assert.throws(() => assertEncryptionEvidence({ encrypted: 'true' }));
});

function filesystemMountFor(candidate) {
  const result = spawnSync('/bin/df', ['-P', candidate], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, 'df failed while resolving the image host volume');
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.ok(lines.length >= 2, 'df returned no filesystem row');
  const fields = lines.at(-1).trim().split(/\s+/u);
  assert.ok(fields.length >= 6, 'df filesystem row is malformed');
  return fields.slice(5).join(' ');
}

function validateHostVolume(image, expectedHostUuid) {
  const hostMount = path.resolve(filesystemMountFor(image));
  assert.ok(hostMount.startsWith('/Volumes' + path.sep), 'image host must be an external /Volumes mount');
  assert.ok(isWithin(image, hostMount), 'image is not inside the resolved host mount');
  const info = diskutilInfo(hostMount);
  assert.equal(normalizedUuid(info.VolumeUUID), normalizedUuid(expectedHostUuid), 'T7 UUID mismatch');
  assert.equal(path.resolve(info.MountPoint), hostMount, 'T7 mountpoint mismatch');
  assert.equal(String(info.FilesystemType || '').toLowerCase(), 'exfat', 'T7 host filesystem must be exFAT');
  assert.equal(info.Writable, true, 'T7 host volume must be writable');
  return { hostMount, info };
}

function validateMountedVolume(
  mountPoint,
  expectedVolumeUuid,
  expectedHostUuid,
  expectedImage,
  attachPayload,
) {
  assert.equal(fs.lstatSync(mountPoint).isSymbolicLink(), false, 'mountpoint must not be a symlink');
  assert.equal(fs.realpathSync(mountPoint), mountPoint, 'mountpoint ancestry changed through a symlink');

  const info = diskutilInfo(mountPoint);
  assert.equal(String(info.FilesystemType || '').toLowerCase(), 'apfs', 'mounted filesystem must be APFS');
  assert.equal(normalizedUuid(info.VolumeUUID), normalizedUuid(expectedVolumeUuid), 'APFS volume UUID mismatch');
  assert.equal(path.resolve(info.MountPoint), mountPoint, 'APFS exact mountpoint mismatch');
  assert.equal(info.Writable, true, 'APFS device must be writable');
  assert.equal(info.WritableVolume, true, 'APFS volume must be writable');
  assert.equal(info.GlobalPermissionsEnabled, true, 'APFS ownership enforcement must be enabled');

  const mountedStat = fs.statSync(mountPoint);
  const parentStat = fs.statSync(path.dirname(mountPoint));
  assert.notEqual(mountedStat.dev, parentStat.dev, 'same-device bare directory is not an attached image');

  assert.equal(path.resolve(attachPayload.mountPoint), mountPoint, 'broker mountpoint evidence mismatch');
  assert.equal(attachPayload.purpose, 'yuri-backend-phase1', 'broker purpose evidence mismatch');
  assert.equal(path.resolve(attachPayload.imagePath), expectedImage, 'broker image path evidence mismatch');
  assert.equal(normalizedUuid(attachPayload.volumeUUID), normalizedUuid(expectedVolumeUuid), 'broker APFS UUID mismatch');
  assert.equal(normalizedUuid(attachPayload.hostVolumeUUID), normalizedUuid(expectedHostUuid), 'broker host UUID mismatch');
  assert.equal(
    String(attachPayload.deviceIdentifier || ''),
    String(info.DeviceIdentifier || ''),
    'broker device identifier mismatch',
  );
  assertHdiutilImageDeviceMapping(expectedImage, mountPoint, info.DeviceIdentifier);
  return info;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function durableAtomicReplace(directory, name, content, mode = 0o640) {
  const target = path.join(directory, name);
  const temporary = path.join(
    directory,
    '.' + name + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp',
  );
  let fileDescriptor;
  let directoryDescriptor;
  try {
    fileDescriptor = fs.openSync(temporary, 'wx', mode);
    fs.writeFileSync(fileDescriptor, content);
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(temporary, target);
    fs.chmodSync(target, mode);
    directoryDescriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(directoryDescriptor);
    fs.closeSync(directoryDescriptor);
    directoryDescriptor = undefined;
  } finally {
    if (fileDescriptor !== undefined) {
      try { fs.closeSync(fileDescriptor); } catch { /* cleanup only */ }
    }
    if (directoryDescriptor !== undefined) {
      try { fs.closeSync(directoryDescriptor); } catch { /* cleanup only */ }
    }
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  assert.equal(sha256(fs.readFileSync(target)), sha256(content), 'atomic replacement hash mismatch');
  return target;
}

function assertCrossDeviceRenameFails(sourceRoot, targetRoot) {
  const token = crypto.randomBytes(6).toString('hex');
  const source = path.join(sourceRoot, 'cross-device-' + token + '.bin');
  const destination = path.join(targetRoot, 'cross-device-' + token + '.bin');
  fs.writeFileSync(source, crypto.randomBytes(4096), { mode: 0o600, flag: 'wx' });
  assert.notEqual(fs.statSync(sourceRoot).dev, fs.statSync(targetRoot).dev, 'cross-device fixture roots share a device');

  let error;
  try {
    fs.renameSync(source, destination);
  } catch (caught) {
    error = caught;
  }

  assert.ok(error, 'cross-device rename unexpectedly succeeded');
  assert.equal(error.code, 'EXDEV', 'cross-device rename must fail with EXDEV');
  assert.equal(fs.existsSync(source), true, 'failed rename removed the source');
  assert.equal(fs.existsSync(destination), false, 'failed rename created a destination fallback');
  fs.unlinkSync(source);
}

function runXattr(args, label) {
  const result = spawnSync('/usr/bin/xattr', args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, label + ' failed: ' + String(result.stderr || ''));
  return result.stdout.trim();
}

function pythonBinary() {
  return String(process.env.YURI_PHASE1_PYTHON || 'python3');
}

function workerArgs(command, allowedRoot, extra = []) {
  return [PYTHON_WORKER, command, '--allowed-root', allowedRoot, ...extra];
}

function runWorkerRaw(command, allowedRoot, extra = []) {
  const result = spawnSync(pythonBinary(), workerArgs(command, allowedRoot, extra), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(
    result.status,
    0,
    'Python worker ' + command + ' failed: ' + String(result.stderr || result.stdout || '').slice(0, 2000),
  );
  return result;
}

function runWorker(command, allowedRoot, extra = []) {
  const result = runWorkerRaw(command, allowedRoot, extra);
  return parseOneJson(result.stdout, 'Python worker ' + command);
}

function spawnWorker(command, allowedRoot, extra = []) {
  const child = spawn(pythonBinary(), workerArgs(command, allowedRoot, extra), {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const jsonLines = [];
  const waiters = [];

  function drainLines() {
    let newline;
    while ((newline = stdout.indexOf('\n')) !== -1) {
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      if (!line) continue;
      const parsed = JSON.parse(line);
      jsonLines.push(parsed);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(parsed);
    }
  }

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    drainLines();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      drainLines();
      if (code !== 0) {
        const error = new Error(
          'Python worker ' + command + ' exited code=' + code + ' signal=' + signal + ': ' + stderr.slice(0, 2000),
        );
        for (const waiter of waiters.splice(0)) waiter.reject(error);
        reject(error);
        return;
      }
      if (waiters.length > 0) {
        const error = new Error('Python worker ' + command + ' exited before emitting expected JSON');
        for (const waiter of waiters.splice(0)) waiter.reject(error);
      }
      resolve({ jsonLines, stderr });
    });
  });

  const nextJson = () => {
    if (jsonLines.length > 0) return Promise.resolve(jsonLines.shift());
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  };

  return { child, closed, nextJson };
}

function assertHealthySqlite(check, requiredIds) {
  assert.equal(check.integrity_check, 'ok', 'SQLite integrity_check failed');
  assert.equal(check.quick_check, 'ok', 'SQLite quick_check failed');
  assert.equal(check.foreign_key_violations, 0, 'SQLite foreign key violations detected');
  assert.equal(String(check.journal_mode).toLowerCase(), 'wal', 'SQLite journal mode drifted from WAL');
  assert.deepEqual(check.checkpoint, [0, 0, 0], 'SQLite WAL checkpoint did not fully truncate');
  for (const id of requiredIds) {
    assert.ok(check.event_ids.includes(id), 'SQLite committed event missing: ' + id);
  }
}

async function exerciseAdvisoryLock(fixtureRoot) {
  const lockPath = path.join(fixtureRoot, 'advisory.lock');
  const holder = spawnWorker('lock-hold', fixtureRoot, ['--path', lockPath]);
  assert.equal((await holder.nextJson()).event, 'lock-held', 'lock holder did not acquire');
  const denied = runWorker('lock-try', fixtureRoot, ['--path', lockPath]);
  assert.equal(denied.acquired, false, 'second advisory-lock holder must be refused');
  holder.child.stdin.end('\n');
  await holder.closed;
  const acquired = runWorker('lock-try', fixtureRoot, ['--path', lockPath]);
  assert.equal(acquired.acquired, true, 'advisory lock must be acquirable after release');
}

async function exerciseSqlite(fixtureRoot) {
  const dbPath = path.join(fixtureRoot, 'phase1.sqlite');
  const initialized = runWorker('sqlite-init', fixtureRoot, ['--db', dbPath]);
  assert.equal(String(initialized.journal_mode).toLowerCase(), 'wal', 'SQLite did not enable WAL');
  assertHealthySqlite(initialized, ['baseline']);

  const holder = spawnWorker('sqlite-hold', fixtureRoot, [
    '--db', dbPath,
    '--event-id', 'holder-commit',
  ]);
  assert.equal((await holder.nextJson()).event, 'transaction-held', 'SQLite holder did not acquire write transaction');

  const reader = runWorker('sqlite-read', fixtureRoot, ['--db', dbPath]);
  assert.ok(reader.event_ids.includes('baseline'), 'WAL reader lost committed baseline');
  assert.equal(reader.event_ids.includes('holder-commit'), false, 'WAL reader observed an uncommitted row');

  const contender = spawnWorker('sqlite-insert', fixtureRoot, [
    '--db', dbPath,
    '--event-id', 'contender-commit',
    '--timeout-ms', '5000',
  ]);
  assert.equal((await contender.nextJson()).event, 'write-attempt', 'SQLite contender did not reach the contention barrier');
  await new Promise((resolve) => setTimeout(resolve, 250));
  holder.child.stdin.end('\n');
  await holder.closed;
  const contenderResult = await contender.closed;
  const committed = contenderResult.jsonLines.find((line) => line.committed === true);
  assert.ok(committed, 'SQLite contender did not commit after the holder released');
  assert.ok(committed.waited_ms >= 150, 'SQLite busy_timeout path was not exercised');
  assert.ok(committed.waited_ms < 5000, 'SQLite contender exceeded busy_timeout');

  runWorkerRaw('sqlite-abrupt', fixtureRoot, [
    '--db', dbPath,
    '--event-id', 'abrupt-commit',
  ]);
  const checked = runWorker('sqlite-check', fixtureRoot, ['--db', dbPath]);
  assertHealthySqlite(checked, ['baseline', 'holder-commit', 'contender-commit', 'abrupt-commit']);
  return { dbPath, requiredIds: ['baseline', 'holder-commit', 'contender-commit', 'abrupt-commit'] };
}

function assertNoBareFallback(mountPoint) {
  const probe = path.join(mountPoint, '.must-not-land-locally-' + crypto.randomBytes(4).toString('hex'));
  let descriptor;
  let error;
  try {
    descriptor = fs.openSync(probe, 'wx', 0o600);
  } catch (caught) {
    error = caught;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  if (!error && fs.existsSync(probe)) fs.unlinkSync(probe);
  assert.ok(error, 'detached mountpoint accepted a bare-local write');
  assert.ok(
    ['EACCES', 'EPERM', 'EROFS'].includes(error.code),
    'bare-local write failed for an unexpected reason: ' + error.code,
  );
  assert.equal(fs.existsSync(probe), false, 'bare-local fallback probe was created');
}

function attach(broker, image, mountPoint, expectedVolumeUuid, expectedHostUuid) {
  return runBroker(broker, 'attach', [
    '--image', image,
    '--mountpoint', mountPoint,
    '--expected-volume-uuid', expectedVolumeUuid,
    '--expected-host-uuid', expectedHostUuid,
  ]);
}

function detach(broker, mountPoint, expectedVolumeUuid, expectedHostUuid) {
  return runBroker(broker, 'detach', [
    '--mountpoint', mountPoint,
    '--expected-volume-uuid', expectedVolumeUuid,
    '--expected-host-uuid', expectedHostUuid,
  ]);
}

function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error('operation aborted');
}

function delay(ms, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    let timer;
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortReason(signal));
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitFor(
  predicate,
  message,
  timeoutMs = PHASE1_LIFECYCLE_TIMEOUT_MS,
  options = {},
) {
  const signal = options.signal ?? null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortReason(signal);
    if (predicate()) return;
    await delay(Math.min(50, Math.max(1, deadline - Date.now())), signal);
  }
  throw new Error(message);
}

function observeSupervision(supervision) {
  let state = { settled: false, ok: false, value: null, error: null };
  const outcome = Promise.resolve(supervision).then(
    (value) => {
      state = { settled: true, ok: true, value, error: null };
      return state;
    },
    (error) => {
      state = { settled: true, ok: false, value: null, error };
      return state;
    },
  );
  return {
    outcome,
    get state() { return state; },
  };
}

async function stopObservedSupervision(observer, signalSource, retryMs = 250) {
  if (observer.state.settled) return observer.outcome;
  const requestStop = () => signalSource.emit('SIGTERM');
  requestStop();
  const retry = setInterval(requestStop, retryMs);
  try {
    return await observer.outcome;
  } finally {
    clearInterval(retry);
  }
}

test('supervision cancellation survives a pre-subscription signal and awaits settlement', async () => {
  const signalSource = new EventEmitter();
  let settle;
  const observer = observeSupervision(new Promise((resolve) => { settle = resolve; }));
  const stopping = stopObservedSupervision(observer, signalSource, 5);
  await delay(15);
  signalSource.once('SIGTERM', () => settle({ detached: true }));
  const outcome = await stopping;
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.value, { detached: true });
});

async function exerciseRealGuardSupervision({
  broker,
  image,
  mountPoint,
  expectedVolumeUuid,
  expectedHostUuid,
  expectedBrokerSha256,
}) {
  const counter = path.join(mountPoint, 'guard-supervision-counter.log');
  const pidEvidence = path.join(mountPoint, 'guard-supervision-pids.json');
  const config = {
    schemaVersion: 1,
    expectedBrokerSha256,
    expectedHostUuid,
    imagePath: image,
    expectedVolumeUuid,
    mountPoint,
    brokerPath: broker,
  };
  const grandchildSource = [
    "const fs=require('node:fs')",
    'const target=process.argv[1]',
    "setInterval(()=>fs.appendFileSync(target,'g'),25)",
  ].join(';');
  const writer = [
    process.execPath,
    '-e',
    [
      "const fs=require('node:fs')",
      "const {spawn}=require('node:child_process')",
      'const counter=process.argv[1]',
      'const evidence=process.argv[2]',
      'const node=process.argv[3]',
      'const grandchildSource=process.argv[4]',
      "const grandchild=spawn(node,['-e',grandchildSource,counter],{stdio:'ignore'})",
      "fs.writeFileSync(evidence,JSON.stringify({leader:process.pid,grandchild:grandchild.pid}),{flag:'wx',mode:0o600})",
      "setInterval(()=>fs.appendFileSync(counter,'l'),25)",
    ].join(';'),
    counter,
    pidEvidence,
    process.execPath,
    grandchildSource,
  ];
  const signalSource = new EventEmitter();
  const observer = observeSupervision(superviseWriter(config, writer, {
    expectedCanonicalMountPoint: mountPoint,
    expectedImagePath: image,
    expectedBrokerPath: broker,
    signalSource,
    stdio: 'ignore',
  }));

  try {
    const readinessAbort = new AbortController();
    let readiness;
    try {
      readiness = await Promise.race([
        waitFor(
          () => fs.existsSync(pidEvidence)
            && fs.existsSync(counter)
            && fs.statSync(counter).size >= 8,
          'guard writer did not become ready within the attach-plus-cleanup lifecycle bound',
          PHASE1_LIFECYCLE_TIMEOUT_MS,
          { signal: readinessAbort.signal },
        ).then(() => ({ kind: 'ready' })),
        observer.outcome.then((outcome) => ({ kind: 'supervision', outcome })),
      ]);
    } finally {
      readinessAbort.abort(new Error('guard readiness race settled'));
    }

    if (readiness.kind === 'supervision') {
      if (!readiness.outcome.ok) throw readiness.outcome.error;
      throw new Error('guard supervision exited before the fixture writer became ready');
    }

    assert.equal(fs.existsSync(pidEvidence), true, 'guard writer did not publish process evidence');
    assert.ok(fs.statSync(counter).size >= 8, 'guard writer tree did not remain active');
    const pids = JSON.parse(fs.readFileSync(pidEvidence, 'utf8'));
    const sizeAtSignal = fs.statSync(counter).size;
    const outcome = await stopObservedSupervision(observer, signalSource);
    if (!outcome.ok) throw outcome.error;
    const result = outcome.value;
    assert.equal(result.supervisorSignal, 'SIGTERM', 'guard did not process the controlled shutdown signal');
    assert.equal(result.detach.ok, true, 'guard did not detach after the fixture writer exited');
    for (const [role, pid] of Object.entries(pids)) {
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === 'ESRCH') alive = false;
        else throw error;
      }
      assert.equal(alive, false, role + ' remained alive after guarded process-group shutdown');
    }
    assertNoBareFallback(mountPoint);
    return { counter, pidEvidence, sizeAtSignal };
  } catch (primaryError) {
    const cleanup = await stopObservedSupervision(observer, signalSource);
    if (!cleanup.ok && cleanup.error !== primaryError) {
      throw new AggregateError(
        [primaryError, cleanup.error],
        'guard readiness failed and supervised cleanup also failed',
      );
    }
    throw primaryError;
  }
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function exerciseTemporaryLaunchdPersistence({
  ownedRoot,
  broker,
  image,
  mountPoint,
  expectedVolumeUuid,
  expectedHostUuid,
  expectedBrokerSha256,
}) {
  const token = crypto.randomBytes(6).toString('hex');
  const label = 'com.yuri-os-musubi.backend-volume-phase1-' + token;
  const domain = 'gui/' + process.getuid();
  const service = domain + '/' + label;
  const configPath = path.join(ownedRoot, 'launchd-fixture-config.json');
  const plistPath = path.join(ownedRoot, label + '.plist');
  const stdoutPath = path.join(ownedRoot, label + '.out.log');
  const stderrPath = path.join(ownedRoot, label + '.err.log');
  const ready = path.join(mountPoint, 'launchd-persistence-ready.log');
  const counter = path.join(mountPoint, 'launchd-persistence-counter.log');
  const runner = path.join(SCRIPT_DIR, 'backend-volume-launchd-fixture.mjs');
  const config = {
    schemaVersion: 1,
    expectedBrokerSha256,
    expectedHostUuid,
    imagePath: image,
    expectedVolumeUuid,
    mountPoint,
    brokerPath: broker,
  };
  const writerSource = [
    "const fs=require('node:fs')",
    'const ready=process.argv[1]',
    'const counter=process.argv[2]',
    "fs.appendFileSync(ready,'r')",
    "setInterval(()=>fs.appendFileSync(counter,'c'),25)",
  ].join(';');
  const programArguments = [
    process.execPath,
    runner,
    configPath,
    '--',
    process.execPath,
    '-e',
    writerSource,
    ready,
    counter,
  ];
  const argumentXml = programArguments.map((argument) => `      <string>${xmlEscape(argument)}</string>`).join('\n');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${xmlEscape(label)}</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>5</integer>
    <key>ProgramArguments</key>
    <array>
${argumentXml}
    </array>
    <key>WorkingDirectory</key><string>${xmlEscape(REPO_ROOT)}</string>
    <key>StandardOutPath</key><string>${xmlEscape(stdoutPath)}</string>
    <key>StandardErrorPath</key><string>${xmlEscape(stderrPath)}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>YURI_PHASE1_REAL</key><string>1</string>
      <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
  </dict>
</plist>
`;
  let loaded = false;
  let completed = false;
  let primaryError = null;
  const cleanupErrors = [];

  const detachedAndSealed = () => (
    fs.statSync(mountPoint).dev === fs.statSync(path.dirname(mountPoint)).dev
      && (fs.statSync(mountPoint).mode & 0o7777) === 0
  );

  const launchctl = (
    args,
    allowFailure = false,
    timeoutMs = PHASE1_LIFECYCLE_TIMEOUT_MS,
  ) => {
    const result = spawnSync('/bin/launchctl', args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
    if (!allowFailure) {
      assert.equal(
        result.status,
        0,
        'launchctl ' + args[0] + ' failed: ' + launchctlResultText(result),
      );
    }
    return result;
  };

  const inspectService = () => {
    const result = launchctl(
      ['print', service],
      true,
      LAUNCHD_INSPECTION_COMMAND_TIMEOUT_MS,
    );
    return { state: classifyLaunchctlServiceInspection(result), result };
  };

  const requestBootout = () => launchctl(['bootout', service], true);

  const proveServiceAbsentAndDetached = async (context) => {
    await waitForKnownServiceAbsence({
      inspect: inspectService,
      requestBootout,
      context: context + ' service drain',
    });

    await waitFor(
      detachedAndSealed,
      context + ': mount did not return to the exact detached mode-000 state',
      PHASE1_LIFECYCLE_TIMEOUT_MS,
    );
    assertNoBareFallback(mountPoint);

    await waitForKnownServiceAbsence({
      inspect: inspectService,
      requestBootout,
      context: context + ' final absence revalidation',
      maxBootoutAttempts: 0,
    });
    loaded = false;
  };

  const bootstrapWithRetry = async (context) => {
    const failures = [];
    for (let attempt = 1; attempt <= LAUNCHD_BOOTSTRAP_ATTEMPTS; attempt += 1) {
      const result = launchctl(['bootstrap', domain, plistPath], true);
      const inspection = inspectService();
      if (!result.error && result.status === 0 && inspection.state === 'loaded') {
        loaded = true;
        return;
      }

      const attemptFailure = new Error(
        context + ' bootstrap attempt ' + attempt + ' failed or was not exactly registered: '
          + launchctlResultText(result) + '; service=' + inspection.state,
      );
      failures.push(attemptFailure);
      try {
        await proveServiceAbsentAndDetached(
          context + ' bootstrap attempt ' + attempt + ' rollback',
        );
      } catch (cleanupError) {
        throw new AggregateError(
          [...failures, cleanupError],
          context + ' bootstrap failed and rollback state is ambiguous; retry refused',
        );
      }

      if (attempt === LAUNCHD_BOOTSTRAP_ATTEMPTS) {
        throw new AggregateError(failures, context + ' bootstrap retry budget exhausted');
      }
      await delay(LAUNCHD_BOOTSTRAP_RETRY_DELAY_MS);
    }
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config) + '\n', { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(plistPath, plist, { mode: 0o600, flag: 'wx' });
    await proveServiceAbsentAndDetached('temporary launchd initial pre-bootstrap gate');
    await bootstrapWithRetry('first temporary launchd cycle');
    await waitFor(
      () => fs.existsSync(ready) && fs.readFileSync(ready, 'utf8').length >= 1
        && fs.existsSync(counter) && fs.statSync(counter).size >= 4,
      'temporary launchd fixture did not start its guarded writer',
    );
    await proveServiceAbsentAndDetached('first temporary launchd cycle bootout');

    await bootstrapWithRetry('second temporary launchd cycle');
    await waitFor(
      () => fs.existsSync(ready) && fs.readFileSync(ready, 'utf8').length >= 2
        && fs.existsSync(counter) && fs.statSync(counter).size >= 8,
      'temporary launchd fixture did not persist through guarded reattach',
    );
    await proveServiceAbsentAndDetached('second temporary launchd cycle bootout');
    completed = true;
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await proveServiceAbsentAndDetached(
        'temporary launchd fixture final cleanup',
      );
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (completed && primaryError === null && cleanupErrors.length === 0) {
      for (const candidate of [plistPath, configPath, stdoutPath, stderrPath]) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    }
  }

  const failures = [primaryError, ...cleanupErrors].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'temporary launchd persistence lifecycle and cleanup failed');
  }
  assert.equal(completed, true, 'temporary launchd persistence test did not unload cleanly');
  return { ready, counter };
}

realTest('real encrypted APFS image preserves Phase-1 filesystem and SQLite semantics', { timeout: REAL_TEST_TIMEOUT_MS }, async () => {
  assert.equal(process.platform, 'darwin', 'real APFS acceptance requires macOS');

  const image = assertExistingNoSymlink(requiredEnv('YURI_PHASE1_IMAGE'), 'image');
  const broker = assertExistingNoSymlink(requiredEnv('YURI_PHASE1_BROKER'), 'broker');
  const expectedBrokerSha256 = requiredEnv('YURI_PHASE1_BROKER_SHA256').toLowerCase();
  const expectedVolumeUuid = normalizedUuid(requiredEnv('YURI_PHASE1_EXPECTED_UUID'));
  const expectedHostUuid = normalizedUuid(requiredEnv('YURI_PHASE1_T7_UUID'));

  assert.equal(broker, CANONICAL_BROKER, 'broker is not the canonical enrolled executable');
  assert.match(expectedBrokerSha256, /^[0-9a-f]{64}$/u, 'broker SHA-256 pin is invalid');
  assert.equal(
    sha256(fs.readFileSync(broker)),
    expectedBrokerSha256,
    'broker SHA-256 does not match the independent acceptance pin',
  );

  assert.equal(
    path.basename(image),
    'YURI-Backend-Runtime-v1.sparsebundle',
    'image basename is not the dedicated Phase-1 runtime image',
  );
  assert.equal(fs.statSync(image).isDirectory(), true, 'sparsebundle must be a directory bundle');
  assertOutsideProtected(image, 'image');
  for (const protectedRoot of PROTECTED_ROOTS) {
    assert.equal(isWithin(broker, protectedRoot), false, 'broker must not resolve inside a protected root');
  }
  validateHostVolume(image, expectedHostUuid);
  assertImageEncrypted(image);

  const ownedRoot = fs.mkdtempSync(path.join(PRIVATE_TMP, 'yuri-phase1-apfs-'));
  const mountPoint = assertPrivateFixturePath(path.join(ownedRoot, 'mount'), ownedRoot);
  fs.mkdirSync(mountPoint, { mode: 0o700 });
  fs.chmodSync(mountPoint, 0o000);
  assert.equal(fs.realpathSync(ownedRoot), ownedRoot, 'temporary root ancestry contains a symlink');

  const fixtureName = 'acceptance-' + crypto.randomBytes(6).toString('hex');
  const fixtureRoot = assertPrivateFixturePath(path.join(mountPoint, fixtureName), ownedRoot);
  let attached = false;
  let happyPathDetached = false;

  try {
    const guardEvidence = await exerciseRealGuardSupervision({
      broker,
      image,
      mountPoint,
      expectedVolumeUuid,
      expectedHostUuid,
      expectedBrokerSha256,
    });
    const launchdEvidence = await exerciseTemporaryLaunchdPersistence({
      ownedRoot,
      broker,
      image,
      mountPoint,
      expectedVolumeUuid,
      expectedHostUuid,
      expectedBrokerSha256,
    });

    const firstAttach = attach(broker, image, mountPoint, expectedVolumeUuid, expectedHostUuid);
    attached = true;
    validateMountedVolume(mountPoint, expectedVolumeUuid, expectedHostUuid, image, firstAttach);
    const stoppedSize = fs.statSync(guardEvidence.counter).size;
    assert.ok(stoppedSize >= guardEvidence.sizeAtSignal, 'guard counter regressed after shutdown');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      fs.statSync(guardEvidence.counter).size,
      stoppedSize,
      'writer tree continued writing after shutdown completed',
    );
    fs.unlinkSync(guardEvidence.counter);
    fs.unlinkSync(guardEvidence.pidEvidence);
    assert.equal(fs.readFileSync(launchdEvidence.ready, 'utf8').length, 2, 'launchd did not run twice');
    const launchdStoppedSize = fs.statSync(launchdEvidence.counter).size;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      fs.statSync(launchdEvidence.counter).size,
      launchdStoppedSize,
      'launchd writer continued after bootout and guarded detach',
    );
    fs.unlinkSync(launchdEvidence.ready);
    fs.unlinkSync(launchdEvidence.counter);

    fs.mkdirSync(fixtureRoot, { mode: 0o750 });
    fs.chmodSync(fixtureRoot, 0o750);
    const firstPayload = crypto.randomBytes(1024 * 1024);
    const secondPayload = crypto.randomBytes(1024 * 1024);
    const atomicPath = durableAtomicReplace(fixtureRoot, 'atomic.bin', firstPayload);
    durableAtomicReplace(fixtureRoot, 'atomic.bin', secondPayload);
    const expectedHash = sha256(secondPayload);
    assert.equal(sha256(fs.readFileSync(atomicPath)), expectedHash, 'final atomic file hash mismatch');
    assertCrossDeviceRenameFails(fixtureRoot, ownedRoot);

    const expectedUid = process.getuid();
    const expectedGid = process.getgid();
    const directoryStat = fs.statSync(fixtureRoot);
    const fileStat = fs.statSync(atomicPath);
    assert.equal(directoryStat.uid, expectedUid, 'fixture directory UID mismatch');
    assert.equal(directoryStat.gid, expectedGid, 'fixture directory GID mismatch');
    assert.equal(directoryStat.mode & 0o777, 0o750, 'fixture directory mode mismatch');
    assert.equal(fileStat.uid, expectedUid, 'fixture file UID mismatch');
    assert.equal(fileStat.gid, expectedGid, 'fixture file GID mismatch');
    assert.equal(fileStat.mode & 0o777, 0o640, 'fixture file mode mismatch');

    const xattrName = 'com.yuri.phase1.fixture';
    const xattrValue = crypto.randomBytes(12).toString('hex');
    runXattr(['-w', xattrName, xattrValue, atomicPath], 'xattr write');
    assert.equal(runXattr(['-p', xattrName, atomicPath], 'xattr read'), xattrValue, 'xattr value mismatch');

    await exerciseAdvisoryLock(fixtureRoot);
    const sqlite = await exerciseSqlite(fixtureRoot);

    detach(broker, mountPoint, expectedVolumeUuid, expectedHostUuid);
    attached = false;
    assertNoBareFallback(mountPoint);

    const secondAttach = attach(broker, image, mountPoint, expectedVolumeUuid, expectedHostUuid);
    attached = true;
    validateMountedVolume(mountPoint, expectedVolumeUuid, expectedHostUuid, image, secondAttach);
    assert.equal(sha256(fs.readFileSync(atomicPath)), expectedHash, 'atomic file hash changed after reattach');
    assert.equal(fs.statSync(fixtureRoot).mode & 0o777, 0o750, 'directory mode changed after reattach');
    assert.equal(fs.statSync(atomicPath).mode & 0o777, 0o640, 'file mode changed after reattach');
    assert.equal(fs.statSync(atomicPath).uid, expectedUid, 'file UID changed after reattach');
    assert.equal(fs.statSync(atomicPath).gid, expectedGid, 'file GID changed after reattach');
    assert.equal(runXattr(['-p', xattrName, atomicPath], 'xattr reread'), xattrValue, 'xattr changed after reattach');

    const reopened = runWorker('sqlite-check', fixtureRoot, ['--db', sqlite.dbPath]);
    assertHealthySqlite(reopened, sqlite.requiredIds);
    await exerciseAdvisoryLock(fixtureRoot);

    validateMountedVolume(mountPoint, expectedVolumeUuid, expectedHostUuid, image, secondAttach);
    assertPrivateFixturePath(fixtureRoot, ownedRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: false });
    detach(broker, mountPoint, expectedVolumeUuid, expectedHostUuid);
    attached = false;
    assertNoBareFallback(mountPoint);
    happyPathDetached = true;
  } finally {
    if (attached) {
      try {
        detach(broker, mountPoint, expectedVolumeUuid, expectedHostUuid);
        attached = false;
      } catch {
        // Leave the owned mountpoint in place if the broker cannot detach safely.
      }
    }

    if (!attached && happyPathDetached) {
      fs.chmodSync(mountPoint, 0o700);
      fs.rmdirSync(mountPoint);
      fs.rmdirSync(ownedRoot);
    }
  }

  assert.equal(attached, false, 'acceptance image remained attached');
  assert.equal(happyPathDetached, true, 'acceptance did not complete a normal final detach');
});
