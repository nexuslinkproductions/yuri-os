#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import {
  BACKEND_OPERATION_LOCK_SOURCE,
  BACKEND_OPERATION_LOCK_SOURCE_SHA256,
  BACKEND_WRITER_LEASE_FD,
  acquireBackendOperationLock as acquireRawBackendOperationLock,
  bootstrapBackendOperationLockAnchor,
  compileFreshC,
  hashBackendOperationAcquisitionAttestation,
  hashBackendOperationTranscript,
  prepareGuardedBackendWriter as prepareRawGuardedBackendWriter,
  validateBackendOperationAcquisitionAttestation,
  validateBackendOperationGuardianTerminalEvidence,
  validateBackendOperationReleaseEvidence,
  verifyCompiledHelper,
} from './backend-operation-lock.mjs';

const MODULE_URL = new URL('./backend-operation-lock.mjs', import.meta.url).href;

function bootstrapFixtureLock(options = {}) {
  const lockPath = options.lockPath;
  if (typeof lockPath !== 'string') return;
  if (!fs.existsSync(path.dirname(lockPath))) {
    bootstrapBackendOperationLockAnchor({ lockPath, ownerApproved: true });
  }
}

function sealMalformedFixtureAnchor(lockPath, populate) {
  const parent = path.dirname(lockPath);
  fs.mkdirSync(parent, { recursive: false, mode: 0o700 });
  fs.chmodSync(parent, 0o700);
  populate();
  fs.chmodSync(parent, 0o500);
  const sealed = spawnSync('/usr/bin/chflags', ['uchg', parent], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8',
  });
  assert.equal(sealed.status, 0, sealed.stderr);
}

function acquireBackendOperationLock(options = {}) {
  bootstrapFixtureLock(options);
  return acquireRawBackendOperationLock({ purpose: 'verify', ...options });
}

function prepareGuardedBackendWriter(options = {}) {
  bootstrapFixtureLock(options);
  return prepareRawGuardedBackendWriter(options);
}

function makeRoot(label) {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)));
}

function cleanup(root) {
  spawnSync('/usr/bin/chflags', ['-R', 'nouchg', root], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    stdio: 'ignore',
  });
  const thawDirectories = (directory) => {
    let stat;
    try {
      stat = fs.lstatSync(directory);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    fs.chmodSync(directory, 0o700);
    for (const entry of fs.readdirSync(directory)) {
      thawDirectories(path.join(directory, entry));
    }
  };
  thawDirectories(root);
  fs.rmSync(root, { recursive: true, force: true });
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function evidenceFrame(event) {
  return `YURI_BACKEND_LOCK_V1 ${Object.entries(event).map(
    ([key, value]) => `${key}=${value}`,
  ).join(' ')}`;
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const entry of Object.values(value)) assertDeepFrozen(entry);
}

function delay(milliseconds, value) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds, value));
}

async function withDeadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function assertPromiseStillPending(promise, milliseconds = 75) {
  const result = await Promise.race([
    promise.then(() => 'settled'),
    delay(milliseconds, 'pending'),
  ]);
  assert.equal(result, 'pending');
}

function assertExecFailedLifecycle(guardian, closed) {
  const events = guardian.events();
  const names = events.map((event) => event.event);
  const terminating = events.filter((event) => event.event === 'TERMINATING');
  assert.ok(terminating.length <= 1, 'exec failure may emit at most one TERMINATING frame');
  assert.equal(names.includes('RUNNING'), false, 'an exec failure must never reach RUNNING');
  assert.equal(closed.released, true);
  assert.equal(closed.releaseVerified, true);
  assert.equal(closed.writerSucceeded, false);

  const expected = ['READY', 'PREPARED', 'EXEC_FAILED'];
  if (terminating.length === 1) expected.push('TERMINATING');
  expected.push('SENTINEL_RELEASED', 'WRITER_EXITED', 'RELEASED');
  assert.deepEqual(names, expected);
  if (terminating.length === 1) {
    assert.equal(terminating[0].reason, 'exec_failed');
    assert.equal(Number(terminating[0].pgid), guardian.pgid);
  }
}

async function eventuallyAcquire(options, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await acquireBackendOperationLock(options);
    } catch (error) {
      if (error.code !== 'BACKEND_OPERATION_BUSY' || Date.now() >= deadline) throw error;
      await delay(25);
    }
  }
}

async function eventuallyObserve(observe, predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = observe();
    if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error(message);
    await delay(25);
  }
}

function groupIsAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

function killGroupIfAlive(pgid) {
  if (!Number.isSafeInteger(pgid) || pgid <= 1 || !groupIsAlive(pgid)) return;
  try {
    process.kill(-pgid, 'SIGKILL');
  } catch (error) {
    // A process group containing only an unreaped zombie can report EPERM on
    // Darwin even though there is no signalable process left to clean.
    if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error;
  }
}

function canonicalHelper(root, label = 'backend-operation-lock') {
  return compileFreshC({
    sourcePath: BACKEND_OPERATION_LOCK_SOURCE,
    expectedSourceSha256: BACKEND_OPERATION_LOCK_SOURCE_SHA256,
    binRoot: path.join(root, 'bin'),
    label,
  });
}

function compileOFDByteProbe(root) {
  const sourcePath = path.join(root, 'ofd-byte-probe.c');
  const source = Buffer.from([
    '#define _DARWIN_C_SOURCE 1',
    '#include <errno.h>',
    '#include <fcntl.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '#include <unistd.h>',
    'int main(int argc, char **argv) {',
    '  struct flock lock;',
    '  if (argc != 3) return 64;',
    '  int fd = open(argv[1], O_RDWR | O_NOFOLLOW | O_CLOEXEC);',
    '  if (fd < 0) return 67;',
    '  memset(&lock, 0, sizeof(lock));',
    '  lock.l_type = F_WRLCK;',
    '  lock.l_whence = SEEK_SET;',
    '  lock.l_start = (off_t)strtol(argv[2], NULL, 10);',
    '  lock.l_len = 1;',
    '  if (fcntl(fd, F_OFD_SETLK, &lock) != 0) {',
    '    int saved = errno;',
    '    close(fd);',
    '    return saved == EAGAIN || saved == EACCES ? 73 : 67;',
    '  }',
    '  close(fd);',
    '  return 0;',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(sourcePath, source, { mode: 0o644 });
  return compileFreshC({
    sourcePath,
    expectedSourceSha256: digest(source),
    binRoot: path.join(root, 'ofd-probe-bin'),
    label: 'ofd-byte-probe',
  }).path;
}

function probeOFDByte(probe, lockPath, byte) {
  return spawnSync(probe, [lockPath, String(byte)], {
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', TMPDIR: '/private/tmp' },
    stdio: 'ignore',
  }).status;
}

function compileTermIgnoringWriter(root) {
  const sourcePath = path.join(root, 'term-ignoring-writer.c');
  const source = Buffer.from([
    '#include <signal.h>',
    '#include <unistd.h>',
    'int main(void) {',
    '  if (signal(SIGTERM, SIG_IGN) == SIG_ERR) return 2;',
    '  sleep(30);',
    '  return 0;',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(sourcePath, source, { mode: 0o644 });
  return compileFreshC({
    sourcePath,
    expectedSourceSha256: digest(source),
    binRoot: path.join(root, 'term-ignore-bin'),
    label: 'term-ignoring-writer',
  }).path;
}

function compileImmediateNativeWriter(root, label, statement) {
  const sourcePath = path.join(root, `${label}.c`);
  const source = Buffer.from([
    '#include <signal.h>',
    'int main(void) {',
    `  ${statement}`,
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(sourcePath, source, { mode: 0o644 });
  return compileFreshC({
    sourcePath,
    expectedSourceSha256: digest(source),
    binRoot: path.join(root, `${label}-bin`),
    label,
  }).path;
}

function compileEscapingForkWriter(root) {
  const sourcePath = path.join(root, 'escaping-fork-writer.c');
  const source = Buffer.from([
    '#include <fcntl.h>',
    '#include <signal.h>',
    '#include <stdio.h>',
    '#include <stdlib.h>',
    '#include <unistd.h>',
    'static int write_all(int fd, const char *bytes, size_t length) {',
    '  while (length > 0) {',
    '    ssize_t count = write(fd, bytes, length);',
    '    if (count <= 0) return -1;',
    '    bytes += count;',
    '    length -= (size_t)count;',
    '  }',
    '  return 0;',
    '}',
    'int main(int argc, char **argv) {',
    '  if (argc != 3) return 64;',
    '  if (signal(SIGTERM, SIG_IGN) == SIG_ERR',
    '      || signal(SIGINT, SIG_IGN) == SIG_ERR',
    '      || signal(SIGHUP, SIG_IGN) == SIG_ERR) return 69;',
    '  pid_t child = fork();',
    '  if (child < 0) return 70;',
    '  if (child > 0) return 0;',
    '  if (setsid() < 0) _exit(71);',
    '  close(198);',
    '  char pid_bytes[64];',
    '  int pid_length = snprintf(pid_bytes, sizeof(pid_bytes), "%d\\n", getpid());',
    '  int pid_fd = open(argv[1], O_WRONLY | O_CREAT | O_TRUNC, 0600);',
    '  if (pid_fd < 0 || pid_length <= 0',
    '      || write_all(pid_fd, pid_bytes, (size_t)pid_length) != 0',
    '      || fsync(pid_fd) != 0 || close(pid_fd) != 0) _exit(72);',
    '  for (;;) {',
    '    int marker_fd = open(argv[2], O_WRONLY | O_CREAT | O_APPEND, 0600);',
    '    if (marker_fd < 0',
    '        || write_all(marker_fd, "escaped\\n", 8) != 0',
    '        || fsync(marker_fd) != 0 || close(marker_fd) != 0) _exit(73);',
    '    usleep(50000);',
    '  }',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(sourcePath, source, { mode: 0o644 });
  return compileFreshC({
    sourcePath,
    expectedSourceSha256: digest(source),
    binRoot: path.join(root, 'escaping-fork-bin'),
    label: 'escaping-fork-writer',
  }).path;
}

test('bootstrap is owner-gated, one-shot, and runtime acquisition is require-only', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-bootstrap');
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    await assert.rejects(
      acquireRawBackendOperationLock({ purpose: 'verify', lockPath, helper }),
      (error) => error.code === 'PATH_UNAVAILABLE',
    );
    assert.equal(fs.existsSync(path.dirname(lockPath)), false);
    assert.throws(
      () => bootstrapBackendOperationLockAnchor({ lockPath }),
      (error) => error.code === 'LOCK_BOOTSTRAP_OWNER_APPROVAL_REQUIRED',
    );
    assert.equal(fs.existsSync(path.dirname(lockPath)), false);

    const identity = bootstrapBackendOperationLockAnchor({ lockPath, ownerApproved: true });
    assert.equal(identity.path, lockPath);
    assert.equal(identity.mode, 0o600);
    assert.equal(identity.size, 2);
    assert.equal(identity.immutable, false);
    assert.equal(identity.anchor.mode, 0o500);
    assert.equal(identity.anchor.immutable, true);
    assert.deepEqual(fs.readdirSync(identity.anchor.path), [path.basename(lockPath)]);
    assert.equal(fs.statSync(lockPath).size, 2);
    const childFlags = spawnSync('/usr/bin/stat', ['-f', '%Sf', lockPath], { encoding: 'utf8' });
    const anchorFlags = spawnSync('/usr/bin/stat', ['-f', '%Sf', identity.anchor.path], { encoding: 'utf8' });
    assert.equal(childFlags.status, 0);
    assert.equal(anchorFlags.status, 0);
    assert.equal(childFlags.stdout.includes('uchg'), false);
    assert.equal(anchorFlags.stdout.includes('uchg'), true);
    assert.throws(
      () => bootstrapBackendOperationLockAnchor({ lockPath, ownerApproved: true }),
      (error) => error.code === 'LOCK_BOOTSTRAP_PATH_EXISTS',
    );

    const lease = await acquireRawBackendOperationLock({ purpose: 'verify', lockPath, helper });
    await lease.release();
  } finally {
    cleanup(root);
  }
});

test('native helper rejects stale PID-start identity and process creation precedes OFD acquisition', { timeout: 30_000 }, () => {
  const root = makeRoot('yuri-backend-operation-identity-selftest');
  try {
    const helper = canonicalHelper(root);
    const identityCheck = spawnSync(helper.path, ['identity-selftest'], { stdio: 'ignore' });
    assert.equal(identityCheck.status, 0);
    const source = fs.readFileSync(BACKEND_OPERATION_LOCK_SOURCE, 'utf8');
    assert.equal(source.includes('flock('), false);
    const guardStart = source.indexOf('static int run_guard(');
    const guardEnd = source.indexOf('\nstatic int run_identity_selftest(', guardStart);
    const guardBody = source.slice(guardStart, guardEnd);
    const spawnPosition = guardBody.indexOf('spawn_writer_bootstrap(');
    const forkPosition = guardBody.indexOf('sentinel_pid = fork()');
    const acquirePosition = guardBody.indexOf('acquire_lock_file(');
    assert.equal(spawnPosition > 0, true);
    assert.equal(forkPosition > spawnPosition, true);
    assert.equal(acquirePosition > forkPosition, true);
    assert.equal(guardBody.slice(acquirePosition).includes('fork()'), false);
    assert.equal(guardBody.slice(acquirePosition).includes('posix_spawn('), false);
    assert.match(source, /NOTE_EXIT \| NOTE_EXEC \| NOTE_FORK/);
    assert.equal(source.includes('NOTE_TRACK | NOTE_TRACKERR'), false);
    assert.match(source, /proc_fflags & NOTE_FORK/);
    assert.match(source, /proc_fflags & NOTE_TRACKERR/);
    assert.match(source, /proc_fflags & NOTE_CHILD/);
    assert.match(source, /descendant_unprovable = true;/);
    assert.match(
      source,
      /if \(!descendant_unprovable && \(running_requested \|\| cleanup\)[\s\S]*writer_exited && !other_members && capability_eof/,
    );
  } finally {
    cleanup(root);
  }
});

test('hold lease serializes owners and clean release does not report loss', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-hold');
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    assert.equal(helper.sourceSha256, BACKEND_OPERATION_LOCK_SOURCE_SHA256);
    assert.equal(helper.mode, 0o500);
    assert.equal(fs.statSync(helper.path).ino, helper.inode);

    const first = await acquireBackendOperationLock({ lockPath, helper });
    const held = first.assertHeld();
    assert.equal(held.held, true);
    assert.equal(held.scope, 'observed-live-helper-and-exact-identity-not-kernel-proof');
    assertDeepFrozen(first.acquisition);
    assert.equal(first.acquisition.readyEvent.event, 'READY');
    assert.equal(first.acquisition.readyEvent.nonce, first.nonce);
    assert.equal(Number(first.acquisition.readyEvent.helper_pid), first.pid);
    assert.equal(first.acquisition.helper.buildRoot.mode, 0o500);
    assert.equal(first.acquisition.lock.mode, 0o600);
    assert.equal(first.acquisition.lock.nlink, 1);
    await assert.rejects(
      acquireBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
    );
    const receipt = await first.release();
    assert.equal(receipt.released, true);
    assert.equal(receipt.releaseVerified, true);
    assert.equal(receipt.releasedEvent.event, 'RELEASED');
    assert.equal(receipt.releasedEvent.reason, 'request');
    assert.equal(receipt.exitCode, 0);
    assert.equal(receipt.signal, null);
    assert.equal(receipt.unexpected, false);
    assert.equal(typeof receipt.requestedAt, 'string');
    assert.equal(typeof receipt.releasedAt, 'string');
    assert.equal(receipt.requestedAt <= receipt.releasedAt, true);
    assert.equal(receipt.nonce, first.nonce);
    assert.equal(receipt.lock.inode, first.lockIdentity.inode);
    assert.equal(receipt.helper.source.sha256, BACKEND_OPERATION_LOCK_SOURCE_SHA256);
    assert.equal(receipt.helper.binary.sha256, helper.binary.sha256);
    assert.equal(receipt.helper.buildRoot.mode, 0o500);
    assert.equal(receipt.releasedFrame.includes(`nonce=${first.nonce} event=RELEASED`), true);
    assert.equal(
      hashBackendOperationTranscript(receipt.orderedEventTranscript),
      receipt.transcriptSha256,
    );
    assertDeepFrozen(receipt);
    assert.throws(
      () => first.assertHeld(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );
    await assertPromiseStillPending(first.loss);

    const second = await acquireBackendOperationLock({ lockPath, helper });
    await second.release();
    assert.deepEqual(second.events().map((event) => event.event), ['READY', 'RELEASED']);
  } finally {
    cleanup(root);
  }
});

test('purpose binding and exported attestation validators reject tamper even after digest recompute', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-evidence-validators');
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    await assert.rejects(
      acquireRawBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'LOCK_PURPOSE_INVALID',
    );
    await assert.rejects(
      acquireRawBackendOperationLock({ purpose: 'writer', lockPath, helper }),
      (error) => error.code === 'LOCK_PURPOSE_INVALID',
    );
    await assert.rejects(
      prepareGuardedBackendWriter({
        purpose: 'verify',
        lockPath,
        helper,
        command: '/bin/true',
        cwd: root,
        env: { PATH: '/usr/bin:/bin' },
      }),
      (error) => error.code === 'LOCK_PURPOSE_INVALID',
    );

    bootstrapFixtureLock({ lockPath });
    const lease = await acquireRawBackendOperationLock({
      purpose: 'verify',
      lockPath,
      helper,
    });
    assert.equal(lease.acquisition.purpose, 'verify');
    assert.strictEqual(
      validateBackendOperationAcquisitionAttestation(lease.acquisition, {
        expectedPurpose: 'verify',
        expectedMode: 'hold',
        expectedLockPath: lockPath,
        expectedLockIdentity: lease.lockIdentity,
        expectedSourcePath: helper.source.path,
        expectedSourceSha256: helper.expectedSourceSha256,
        expectedBinaryPath: helper.binary.path,
        expectedBinarySha256: helper.binary.sha256,
        expectedPid: lease.pid,
      }),
      lease.acquisition,
    );
    for (const mismatch of [
      { expectedNonce: '0'.repeat(64) },
      { expectedAcquiredAt: new Date(0).toISOString() },
      { expectedLockPath: `${lockPath}.wrong` },
      { expectedHelperEvidence: { ...lease.acquisition.helper, schemaVersion: 999 } },
      { expectedSourcePath: `${helper.source.path}.wrong` },
      { expectedSourceSha256: '0'.repeat(64) },
      { expectedBinaryPath: `${helper.binary.path}.wrong` },
      { expectedBinarySha256: 'f'.repeat(64) },
      { expectedPid: lease.pid + 1 },
    ]) {
      assert.throws(
        () => validateBackendOperationAcquisitionAttestation(lease.acquisition, mismatch),
        (error) => error.code === 'LOCK_EXPECTATION_MISMATCH',
      );
    }

    const reboundCases = [
      {
        mutate(value) {
          value.nonce = '0'.repeat(64);
          value.readyEvent.nonce = value.nonce;
          value.readyFrame = evidenceFrame(value.readyEvent);
        },
        expectations: { expectedNonce: lease.acquisition.nonce },
      },
      {
        mutate(value) { value.acquiredAt = new Date(0).toISOString(); },
        expectations: { expectedAcquiredAt: lease.acquisition.acquiredAt },
      },
      {
        mutate(value) { value.lock.inode += 1; },
        expectations: { expectedLockIdentity: lease.acquisition.lock },
      },
      {
        mutate(value) { value.helper.source.path = `${value.helper.source.path}.forged`; },
        expectations: { expectedSourcePath: lease.acquisition.helper.source.path },
      },
      {
        mutate(value) { value.helper.binary.sha256 = 'f'.repeat(64); },
        expectations: { expectedHelperEvidence: lease.acquisition.helper },
      },
    ];
    for (const { mutate, expectations } of reboundCases) {
      const rebound = JSON.parse(JSON.stringify(lease.acquisition));
      mutate(rebound);
      rebound.attestationSha256 = hashBackendOperationAcquisitionAttestation(rebound);
      assert.throws(
        () => validateBackendOperationAcquisitionAttestation(rebound, expectations),
        (error) => error.code === 'LOCK_EXPECTATION_MISMATCH',
      );
    }

    const reboundPurpose = JSON.parse(JSON.stringify(lease.acquisition));
    reboundPurpose.purpose = 'restore';
    reboundPurpose.attestationSha256 = hashBackendOperationAcquisitionAttestation(reboundPurpose);
    assert.throws(
      () => validateBackendOperationAcquisitionAttestation(reboundPurpose, {
        expectedPurpose: 'verify',
        expectedMode: 'hold',
      }),
      (error) => error.code === 'LOCK_PURPOSE_MISMATCH',
    );

    const forgedReady = JSON.parse(JSON.stringify(lease.acquisition));
    forgedReady.readyFrame = `${forgedReady.readyFrame} forged=1`;
    forgedReady.attestationSha256 = hashBackendOperationAcquisitionAttestation(forgedReady);
    assert.throws(
      () => validateBackendOperationAcquisitionAttestation(forgedReady, {
        expectedPurpose: 'verify',
        expectedMode: 'hold',
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );

    const receipt = await lease.release();
    assert.strictEqual(
      validateBackendOperationReleaseEvidence(receipt, { expectedPurpose: 'verify' }),
      receipt,
    );
    const forgedRelease = JSON.parse(JSON.stringify(receipt));
    const releaseIndex = forgedRelease.orderedEventTranscript.length - 1;
    const forgedReleaseEvent = {
      ...forgedRelease.orderedEventTranscript[releaseIndex].event,
      reason: 'forged',
    };
    forgedRelease.orderedEventTranscript[releaseIndex].event = forgedReleaseEvent;
    forgedRelease.orderedEventTranscript[releaseIndex].nativeFrame = evidenceFrame(forgedReleaseEvent);
    forgedRelease.events[releaseIndex] = forgedReleaseEvent;
    forgedRelease.releasedEvent = forgedReleaseEvent;
    forgedRelease.releasedFrame = evidenceFrame(forgedReleaseEvent);
    forgedRelease.transcriptSha256 = hashBackendOperationTranscript(
      forgedRelease.orderedEventTranscript,
    );
    assert.throws(
      () => validateBackendOperationReleaseEvidence(forgedRelease, {
        expectedPurpose: 'verify',
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );
  } finally {
    cleanup(root);
  }
});

test('hold assertHeld fails after helper loss and release cannot succeed without RELEASED', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-hold-loss');
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    const lease = await acquireBackendOperationLock({ lockPath, helper });
    assert.equal(typeof lease.lockPath, 'string');
    assert.equal(lease.lockIdentity.path, lease.lockPath);
    assert.equal(lease.assertHeld().held, true);

    process.kill(lease.pid, 'SIGKILL');
    const loss = await withDeadline(lease.loss, 5_000, 'hold-helper loss did not resolve');
    assert.equal(loss.unexpected, true);
    assert.equal(loss.released, false);
    assert.throws(
      () => lease.assertHeld(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );
    await assert.rejects(
      lease.release(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );
    const terminal = await lease.closed;
    assert.equal(terminal.released, false);
    assert.equal(terminal.releaseVerified, false);
    assert.equal(terminal.releasedEvent, null);
    assert.equal(terminal.unexpected, true);
    assert.equal(
      hashBackendOperationTranscript(terminal.orderedEventTranscript),
      terminal.transcriptSha256,
    );
    assertDeepFrozen(terminal);

    const after = await eventuallyAcquire({ lockPath, helper });
    await after.release();
  } finally {
    cleanup(root);
  }
});

test('sealed anchor blocks accidental replacement and native identity drift fails closed', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-lock-substitution');
  let lease;
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    const originalElsewhere = path.join(root, 'state', 'original.lock');
    lease = await acquireBackendOperationLock({ lockPath, helper });
    const acquiredInode = lease.lockIdentity.inode;
    assert.equal(fs.statSync(path.dirname(lockPath)).mode & 0o777, 0o500);
    assert.throws(
      () => fs.renameSync(lockPath, originalElsewhere),
      (error) => error.code === 'EPERM' || error.code === 'EACCES',
    );
    assert.equal(lease.assertHeld().lock.inode, acquiredInode);

    for (const pathname of [path.dirname(lockPath), lockPath]) {
      const thaw = spawnSync('/usr/bin/chflags', ['nouchg', pathname], {
        env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
        encoding: 'utf8',
      });
      assert.equal(thaw.status, 0, thaw.stderr);
    }
    fs.chmodSync(path.dirname(lockPath), 0o700);
    fs.renameSync(lockPath, originalElsewhere);
    fs.writeFileSync(lockPath, '', { mode: 0o600 });
    const loss = await withDeadline(lease.loss, 5_000, 'lock-path drift did not surface');
    assert.equal(loss.nativeEvent.event, 'LOCK_PATH_CHANGED');
    assert.throws(
      () => lease.assertHeld(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );
    await assertPromiseStillPending(lease.closed);
    process.kill(lease.pid, 'SIGKILL');
    const terminal = await withDeadline(lease.closed, 5_000, 'failed-closed helper did not terminate');
    assert.equal(terminal.released, false);
    assert.equal(terminal.unexpected, true);
  } finally {
    if (lease?.pid) {
      try { process.kill(lease.pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    cleanup(root);
  }
});

test('compile requires a trusted source pin and re-attests source, snapshot, and binary', { timeout: 30_000 }, () => {
  const root = makeRoot('yuri-backend-operation-attestation');
  try {
    const sourcePath = path.join(root, 'fixture.c');
    const sourceBytes = fs.readFileSync(BACKEND_OPERATION_LOCK_SOURCE);
    fs.writeFileSync(sourcePath, sourceBytes, { mode: 0o644 });
    assert.throws(
      () => compileFreshC({ sourcePath, binRoot: path.join(root, 'missing-pin-bin') }),
      (error) => error.code === 'HELPER_SOURCE_PIN_REQUIRED',
    );
    assert.throws(
      () => compileFreshC({
        sourcePath,
        expectedSourceSha256: '0'.repeat(64),
        binRoot: path.join(root, 'wrong-pin-bin'),
      }),
      (error) => error.code === 'HELPER_SOURCE_DIGEST_MISMATCH',
    );

    const helper = compileFreshC({
      sourcePath,
      expectedSourceSha256: digest(sourceBytes),
      binRoot: path.join(root, 'bin'),
      label: 'attested-helper',
    });
    assert.equal(helper.buildRoot.mode, 0o500);
    assert.equal(fs.statSync(path.join(root, 'bin')).mode & 0o777, 0o700);
    assert.equal(fs.statSync(helper.buildRoot.path).mode & 0o777, 0o500);
    assert.equal(verifyCompiledHelper(helper), helper.path);

    fs.appendFileSync(sourcePath, '\n/* source tamper */\n');
    assert.throws(
      () => verifyCompiledHelper(helper),
      (error) => error.code === 'HELPER_IDENTITY_MISMATCH',
    );
    fs.writeFileSync(sourcePath, sourceBytes);
    assert.equal(verifyCompiledHelper(helper), helper.path);

    const snapshotBytes = fs.readFileSync(helper.snapshot.path);
    fs.chmodSync(helper.snapshot.path, 0o600);
    fs.appendFileSync(helper.snapshot.path, '\n/* snapshot tamper */\n');
    assert.throws(
      () => verifyCompiledHelper(helper),
      (error) => error.code === 'HELPER_IDENTITY_MISMATCH',
    );
    fs.writeFileSync(helper.snapshot.path, snapshotBytes);
    fs.chmodSync(helper.snapshot.path, 0o400);
    assert.equal(verifyCompiledHelper(helper), helper.path);

    const binaryBytes = fs.readFileSync(helper.binary.path);
    fs.chmodSync(helper.binary.path, 0o700);
    fs.appendFileSync(helper.binary.path, Buffer.from([0]));
    assert.throws(
      () => verifyCompiledHelper(helper),
      (error) => error.code === 'HELPER_IDENTITY_MISMATCH',
    );
    fs.writeFileSync(helper.binary.path, binaryBytes);
    fs.chmodSync(helper.binary.path, 0o500);
    assert.equal(verifyCompiledHelper(helper), helper.path);

    fs.chmodSync(helper.buildRoot.path, 0o700);
    assert.throws(
      () => verifyCompiledHelper(helper),
      (error) => error.code === 'PATH_MODE_UNSAFE',
    );
    fs.chmodSync(helper.buildRoot.path, 0o500);
    assert.equal(verifyCompiledHelper(helper), helper.path);
  } finally {
    cleanup(root);
  }
});

test('compiler/helper environments are sealed while ordinary explicit writer env survives fd transport', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-environment');
  const previousDyld = process.env.DYLD_INSERT_LIBRARIES;
  try {
    process.env.DYLD_INSERT_LIBRARIES = path.join(root, 'must-not-load.dylib');
    const helper = canonicalHelper(root, 'sealed-compiler-helper');
    const guardian = await prepareGuardedBackendWriter({
      lockPath: path.join(root, 'state', 'backend-operation.lock'),
      helper,
      command: '/usr/bin/env',
      cwd: root,
      env: { PATH: '/usr/bin:/bin', APP_VALUE: 'preserved' },
    });
    let stdout = '';
    guardian.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    await guardian.start();
    const closed = await guardian.closed;
    assert.equal(closed.writerSucceeded, true);
    assert.match(stdout, /^APP_VALUE=preserved$/mu);
    assert.match(stdout, /^PATH=\/usr\/bin:\/bin$/mu);
    assert.match(stdout, /^YURI_BACKEND_OPERATION_LEASE_FD=198$/mu);
    assert.doesNotMatch(stdout, /^DYLD_/mu);
    assert.doesNotMatch(stdout, /^LC_ALL=/mu);

    for (const dangerous of ['DYLD_INSERT_LIBRARIES', 'LD_PRELOAD', 'CC', 'NODE_OPTIONS']) {
      await assert.rejects(
        prepareGuardedBackendWriter({
          lockPath: path.join(root, `${dangerous.toLowerCase()}-state`, 'backend-operation.lock'),
          helper,
          command: '/usr/bin/true',
          cwd: root,
          env: { PATH: '/usr/bin:/bin', [dangerous]: 'forbidden' },
        }),
        (error) => error.code === 'WRITER_ENV_DANGEROUS',
      );
    }
  } finally {
    if (previousDyld === undefined) delete process.env.DYLD_INSERT_LIBRARIES;
    else process.env.DYLD_INSERT_LIBRARIES = previousDyld;
    cleanup(root);
  }
});

test('lock path rejects symlink, unsafe mode, and hard-link identity', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-paths');
  try {
    const helper = canonicalHelper(root);
    const target = path.join(root, 'symlink-target.lock');
    const symlink = path.join(root, 'symlink-state', 'backend-operation.lock');
    fs.writeFileSync(target, Buffer.alloc(2), { mode: 0o600 });
    sealMalformedFixtureAnchor(symlink, () => fs.symlinkSync(target, symlink));
    await assert.rejects(
      acquireBackendOperationLock({ lockPath: symlink, helper }),
      (error) => error.code === 'PATH_IDENTITY_MISMATCH',
    );

    const unsafeMode = path.join(root, 'unsafe-state', 'backend-operation.lock');
    sealMalformedFixtureAnchor(unsafeMode, () => {
      fs.writeFileSync(unsafeMode, Buffer.alloc(2), { mode: 0o644 });
      fs.chmodSync(unsafeMode, 0o644);
    });
    await assert.rejects(
      acquireBackendOperationLock({ lockPath: unsafeMode, helper }),
      (error) => error.code === 'LOCK_FILE_IDENTITY_MISMATCH',
    );

    const hardLinkSource = path.join(root, 'hardlink-source.lock');
    const hardLink = path.join(root, 'hardlink-state', 'backend-operation.lock');
    fs.writeFileSync(hardLinkSource, Buffer.alloc(2), { mode: 0o600 });
    sealMalformedFixtureAnchor(hardLink, () => fs.linkSync(hardLinkSource, hardLink));
    await assert.rejects(
      acquireBackendOperationLock({ lockPath: hardLink, helper }),
      (error) => error.code === 'PATH_IDENTITY_MISMATCH',
    );
  } finally {
    cleanup(root);
  }
});

test('writer executable rejects symlinks and detects pathname swap before exec', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-writer-identity');
  try {
    const helper = canonicalHelper(root);
    const original = path.join(root, 'writer');
    const replacement = path.join(root, 'replacement');
    const originalAway = path.join(root, 'writer-original');
    const symlink = path.join(root, 'writer-link');
    fs.copyFileSync('/usr/bin/true', original);
    fs.copyFileSync('/usr/bin/false', replacement);
    fs.chmodSync(original, 0o500);
    fs.chmodSync(replacement, 0o500);
    fs.symlinkSync(original, symlink);
    await assert.rejects(
      prepareGuardedBackendWriter({
        lockPath: path.join(root, 'symlink-state', 'backend-operation.lock'),
        helper,
        command: symlink,
        cwd: root,
        env: { PATH: '/usr/bin:/bin' },
      }),
      (error) => error.code === 'WRITER_EXECUTABLE_IDENTITY_INVALID',
    );

    const guardian = await prepareGuardedBackendWriter({
      lockPath: path.join(root, 'swap-state', 'backend-operation.lock'),
      helper,
      command: original,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    fs.renameSync(original, originalAway);
    fs.renameSync(replacement, original);
    let execFailure;
    await assert.rejects(
      guardian.start(),
      (error) => {
        execFailure = error;
        return error.code === 'WRITER_EXEC_FAILED';
      },
    );
    assertExecFailedLifecycle(guardian, execFailure.details.closed);
  } finally {
    cleanup(root);
  }
});

test('writer receives an anonymous FD198 capability and same-vnode reopen without flock is rejected', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-writer-fd');
  let probe;
  let reused;
  try {
    const helper = canonicalHelper(root);
    const probeScript = path.join(root, 'fd-probe.mjs');
    fs.writeFileSync(probeScript, [
      "import fs from 'node:fs';",
      'const fd = Number(process.env.YURI_BACKEND_OPERATION_LEASE_FD);',
      'const stat = fs.fstatSync(fd);',
      'console.log(JSON.stringify({ fd, device: stat.dev, inode: stat.ino, fifo: stat.isFIFO(), regular: stat.isFile() }));',
    ].join('\n'));
    probe = await prepareGuardedBackendWriter({
      lockPath: path.join(root, 'probe-state', 'backend-operation.lock'),
      helper,
      command: process.execPath,
      args: [probeScript],
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    let stdout = '';
    probe.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    await probe.start();
    const probed = await probe.closed;
    const fdEvidence = JSON.parse(stdout.trim());
    assert.equal(probed.writerSucceeded, true);
    assert.equal(fdEvidence.fd, BACKEND_WRITER_LEASE_FD);
    assert.equal(fdEvidence.fifo, true);
    assert.equal(fdEvidence.regular, false);
    assert.notEqual(`${fdEvidence.device}:${fdEvidence.inode}`,
      `${probe.lockIdentity.device}:${probe.lockIdentity.inode}`);

    const reuseLockPath = path.join(root, 'reuse-state', 'backend-operation.lock');
    const reuseSource = path.join(root, 'fd-reuse.c');
    const reuseBytes = Buffer.from([
      '#define _DARWIN_C_SOURCE 1',
      '#include <fcntl.h>',
      '#include <signal.h>',
      '#include <unistd.h>',
      'static void ignore_signal(int value) { (void)value; }',
      'int main(int argc, char **argv) {',
      '  if (argc != 2 || signal(SIGTERM, ignore_signal) == SIG_ERR) return 91;',
      '  if (close(198) != 0) return 92;',
      '  for (;;) {',
      '    int fd = open(argv[1], O_RDONLY | O_NOFOLLOW);',
      '    if (fd < 0 || fd > 198) return 93;',
      '    if (fd == 198) break;',
      '  }',
      '  for (;;) pause();',
      '}',
      '',
    ].join('\n'));
    fs.writeFileSync(reuseSource, reuseBytes, { mode: 0o400 });
    const reuseWriter = compileFreshC({
      sourcePath: reuseSource,
      expectedSourceSha256: digest(reuseBytes),
      binRoot: path.join(root, 'fd-reuse-bin'),
      label: 'fd-reuse-writer',
    });
    reused = await prepareGuardedBackendWriter({
      lockPath: reuseLockPath,
      helper,
      command: reuseWriter.path,
      args: [reuseLockPath],
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await reused.start();
    const cleanupStartedAt = Date.now();
    const loss = await withDeadline(reused.loss, 5_000, 'FD198 capability reuse was not detected');
    assert.equal(loss.nativeEvent.event, 'CAPABILITY_CHANGED');
    assert.equal(Number(loss.nativeEvent.lease_fd), BACKEND_WRITER_LEASE_FD);
    const sentinelPid = reused.acquisition.sentinelIdentity.pid;
    const lsofBefore = spawnSync('/usr/sbin/lsof', [
      '-n', '-P', '-a', '-p', `${reused.guardianPid},${sentinelPid}`, '--', reuseLockPath,
    ], { encoding: 'utf8' });
    assert.equal(groupIsAlive(reused.pgid), true);
    assert.doesNotThrow(() => process.kill(reused.guardianPid, 0));
    assert.doesNotThrow(() => process.kill(sentinelPid, 0));
    assert.equal(lsofBefore.status, 0);
    assert.equal(lsofBefore.stdout.split(reuseLockPath).length - 1, 2);
    await assert.rejects(
      acquireBackendOperationLock({ lockPath: reuseLockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
    );
    const closed = await withDeadline(reused.closed, 10_000, 'FD198 reuse guardian did not close');
    assert.equal(Date.now() - cleanupStartedAt >= 2_750, true, 'HUP must not hot-spin the 3s TERM grace');
    assert.equal(closed.unexpected, true);
    assert.equal(closed.releasedEvent.reason, 'writer_capability_changed');
    assert.equal(closed.exitCode, 78);
  } finally {
    for (const guardian of [probe, reused]) {
      if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
      if (guardian?.guardianPid) {
        try { process.kill(guardian.guardianPid, 'SIGKILL'); } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    }
    cleanup(root);
  }
});

test('escaped and in-group writer forks both enter irreversible descendant fail-hold', { timeout: 45_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-stalls');
  const guardians = [];
  try {
    const helper = canonicalHelper(root);
    const probe = compileOFDByteProbe(root);
    const compileWriter = (label, body) => {
      const sourcePath = path.join(root, `${label}.c`);
      const bytes = Buffer.from([
        '#define _DARWIN_C_SOURCE 1',
        '#include <stdlib.h>',
        '#include <sys/types.h>',
        '#include <unistd.h>',
        'int main(void) {',
        body,
        '}',
        '',
      ].join('\n'));
      fs.writeFileSync(sourcePath, bytes, { mode: 0o644 });
      return compileFreshC({
        sourcePath,
        expectedSourceSha256: digest(bytes),
        binRoot: path.join(root, `${label}-bin`),
        label,
      }).path;
    };

    const escapedWriter = compileWriter('escaped-writer', [
      '  pid_t child = fork();',
      '  if (child < 0) return 2;',
      '  if (child == 0) {',
      '    if (setsid() < 0) _exit(3);',
      '    sleep(1);',
      '    _exit(0);',
      '  }',
      '  return 0;',
    ].join('\n'));
    const escapedLockPath = path.join(root, 'escaped-state', 'backend-operation.lock');
    const escaped = await prepareGuardedBackendWriter({
      lockPath: escapedLockPath,
      helper,
      command: escapedWriter,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    guardians.push(escaped);
    await escaped.start();
    const escapedLoss = await withDeadline(escaped.loss, 5_000, 'escaped fork did not fail-hold');
    assert.equal(escapedLoss.nativeEvent.event, 'DESCENDANT_UNPROVABLE');
    assert.equal(escapedLoss.nativeEvent.reason, 'proc_fork');
    await delay(1_100);
    await assertPromiseStillPending(escaped.closed, 100);
    assert.equal(probeOFDByte(probe, escapedLockPath, 0), 73);
    assert.equal(probeOFDByte(probe, escapedLockPath, 1), 73);

    const lingeringWriter = compileWriter('lingering-writer', [
      '  pid_t child = fork();',
      '  if (child < 0) return 2;',
      '  if (child == 0) { sleep(1); _exit(0); }',
      '  return 0;',
    ].join('\n'));
    const lingeringLockPath = path.join(root, 'lingering-state', 'backend-operation.lock');
    const lingering = await prepareGuardedBackendWriter({
      lockPath: lingeringLockPath,
      helper,
      command: lingeringWriter,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    guardians.push(lingering);
    await lingering.start();
    const lingeringLoss = await withDeadline(lingering.loss, 5_000, 'in-group fork did not fail-hold');
    assert.equal(lingeringLoss.nativeEvent.event, 'DESCENDANT_UNPROVABLE');
    assert.equal(lingeringLoss.nativeEvent.reason, 'proc_fork');
    await delay(1_100);
    await assertPromiseStillPending(lingering.closed, 100);
    assert.equal(probeOFDByte(probe, lingeringLockPath, 0), 73);
    assert.equal(probeOFDByte(probe, lingeringLockPath, 1), 73);

    for (const guardian of guardians) {
      const closedResult = guardian.closed.then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
      process.kill(guardian.guardianPid, 'SIGKILL');
      process.kill(guardian.sentinelPid, 'SIGKILL');
      const terminal = await withDeadline(closedResult, 5_000, 'explicit fork teardown did not close');
      assert.equal(terminal.ok, true);
      assert.equal(terminal.value.released, false);
      assert.equal(terminal.value.unexpected, true);
    }
  } finally {
    for (const guardian of guardians) {
      for (const pid of [guardian.guardianPid, guardian.sentinelPid]) {
        try { process.kill(pid, 'SIGKILL'); } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
      killGroupIfAlive(guardian.pgid);
    }
    cleanup(root);
  }
});

test('guardian PREPARES before exec, holds through RUNNING, and terminates the whole group before release', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-guardian');
  let guardian;
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: '/bin/sleep',
      args: ['30'],
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    assert.equal(typeof guardian.lockPath, 'string');
    assert.equal(guardian.lockIdentity.path, guardian.lockPath);
    assert.equal(guardian.phase, 'prepared');
    assert.equal(guardian.writerPid, guardian.pgid);
    assert.equal(guardian.leaseFd, BACKEND_WRITER_LEASE_FD);
    assert.equal(guardian.acquisition.purpose, 'writer');
    assert.equal(guardian.assertHeld().held, true);
    assertDeepFrozen(guardian.acquisition);
    await assert.rejects(
      acquireBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
    );

    await guardian.start();
    assert.equal(guardian.phase, 'running');
    assert.equal(groupIsAlive(guardian.pgid), true);
    assert.equal(guardian.assertHeld().held, true);
    await assert.rejects(
      acquireBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
    );

    const closed = await guardian.terminate();
    assert.equal(closed.unexpected, false);
    assert.equal(closed.released, true);
    assert.equal(closed.releaseVerified, true);
    assert.equal(closed.releasedEvent.reason, 'terminate_request');
    assert.equal(closed.exitCode, 0);
    assert.equal(closed.signal, null);
    assert.equal(typeof closed.requestedAt, 'string');
    assert.equal(typeof closed.releasedAt, 'string');
    assert.equal(closed.helper.source.sha256, BACKEND_OPERATION_LOCK_SOURCE_SHA256);
    assert.equal(closed.helper.binary.sha256, helper.binary.sha256);
    assert.equal(closed.lock.inode, guardian.lockIdentity.inode);
    assert.equal(closed.acquisition.attestationSha256, guardian.acquisition.attestationSha256);
    assert.equal(
      hashBackendOperationTranscript(closed.orderedEventTranscript),
      closed.transcriptSha256,
    );
    assert.strictEqual(
      validateBackendOperationGuardianTerminalEvidence(closed, {
        expectedPurpose: 'writer',
      }),
      closed,
    );
    assert.equal(closed.writerExitCode, -1);
    assert.equal(closed.writerTermSignal, 15);
    assert.equal(closed.writerSucceeded, false);
    assert.throws(
      () => validateBackendOperationGuardianTerminalEvidence(closed, {
        requireCleanRelease: true,
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );
    assert.strictEqual(await guardian.closed, closed);
    assertDeepFrozen(closed);
    assert.equal(groupIsAlive(guardian.pgid), false);
    assert.deepEqual(guardian.events().map((event) => event.event), [
      'READY',
      'PREPARED',
      'RUNNING',
      'TERMINATING',
      'SENTINEL_RELEASED',
      'WRITER_EXITED',
      'RELEASED',
    ]);
    assert.throws(
      () => guardian.assertHeld(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );
    await assertPromiseStillPending(guardian.loss);
    const after = await acquireBackendOperationLock({ lockPath, helper });
    await after.release();
  } finally {
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('PREPARED is a real pre-exec gate and ABORT cannot run the writer payload', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-prepared-abort');
  let guardian;
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    const marker = path.join(root, 'writer-ran');
    guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: '/usr/bin/touch',
      args: [marker],
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await delay(100);
    assert.equal(fs.existsSync(marker), false);
    const closed = await guardian.abort();
    assert.equal(closed.released, true);
    assert.equal(closed.unexpected, false);
    assert.equal(fs.existsSync(marker), false);
    assert.deepEqual(guardian.events().map((event) => event.event), [
      'READY',
      'PREPARED',
      'TERMINATING',
      'SENTINEL_RELEASED',
      'WRITER_EXITED',
      'RELEASED',
    ]);
  } finally {
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('native PREPARED rejects complete wrong, wrong-nonce, and partial control frames with nonzero protocol release', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-prepared-protocol');
  try {
    const helper = canonicalHelper(root);
    for (const invalidControl of [
      { frame: (nonce) => `YURI_BACKEND_LOCK_V1 nonce=${nonce} command=BOGUS\n`, end: true },
      { frame: () => `YURI_BACKEND_LOCK_V1 nonce=${'0'.repeat(64)} command=EXEC\n`, end: true },
      { frame: (nonce) => `YURI_BACKEND_LOCK_V1 nonce=${nonce} command=`, end: false },
    ]) {
      const lockPath = path.join(root, crypto.randomBytes(4).toString('hex'), 'backend-operation.lock');
      const initializer = await acquireBackendOperationLock({ lockPath, helper });
      await initializer.release();
      const nonce = crypto.randomBytes(32).toString('hex');
      const executableFd = fs.openSync('/bin/sleep', fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const child = spawn(
        helper.path,
        ['guard', lockPath, nonce, '/bin/sleep', '30'],
        {
          cwd: root,
          env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', TMPDIR: '/private/tmp' },
          stdio: ['pipe', 'ignore', 'pipe', 'pipe', executableFd, 'pipe'],
        },
      );
      fs.closeSync(executableFd);
      child.stdio[5].end(Buffer.from('PATH=/usr/bin:/bin\0\0', 'utf8'));
      let eventBuffer = '';
      const frames = [];
      const prepared = new Promise((resolve, reject) => {
        child.stdio[3].setEncoding('utf8');
        child.stdio[3].on('data', (chunk) => {
          eventBuffer += chunk;
          for (;;) {
            const newline = eventBuffer.indexOf('\n');
            if (newline < 0) break;
            const frame = eventBuffer.slice(0, newline);
            eventBuffer = eventBuffer.slice(newline + 1);
            frames.push(frame);
            if (frame.includes(' event=PREPARED ')) resolve();
          }
        });
        child.once('error', reject);
        child.once('exit', (code) => {
          if (!frames.some((frame) => frame.includes(' event=PREPARED '))) {
            reject(new Error(`native helper exited ${code} before PREPARED`));
          }
        });
      });
      await withDeadline(prepared, 5_000, 'native helper did not reach PREPARED');
      const closePromise = once(child, 'close');
      if (invalidControl.end) child.stdin.end(invalidControl.frame(nonce));
      else child.stdin.write(invalidControl.frame(nonce));
      const [exitCode, signal] = await withDeadline(
        closePromise,
        10_000,
        'native protocol helper did not close',
      );
      assert.equal(exitCode, 71);
      assert.equal(signal, null);
      assert.deepEqual(frames.map((frame) => frame.match(/ event=([A-Z_]+)/u)?.[1]), [
        'READY', 'PREPARED', 'PROTOCOL_ERROR', 'TERMINATING', 'SENTINEL_RELEASED',
        'WRITER_EXITED', 'RELEASED',
      ]);
      assert.match(frames.at(-1), / reason=protocol_error_prepared$/u);
    }
  } finally {
    cleanup(root);
  }
});

test('controller SIGKILL preserves sentinel byte one and contended byte-zero rollback', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-loss');
  let guardian;
  try {
    const helper = canonicalHelper(root);
    const probe = compileOFDByteProbe(root);
    const writer = compileTermIgnoringWriter(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: writer,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await guardian.start();
    assert.equal(guardian.assertHeld().held, true);
    process.kill(guardian.guardianPid, 'SIGKILL');
    const loss = await withDeadline(guardian.loss, 5_000, 'guardian loss did not resolve');
    assert.equal(loss.released, false);
    assert.equal(loss.unexpected, true);
    assert.equal(groupIsAlive(guardian.pgid), true);
    assert.doesNotThrow(() => process.kill(guardian.sentinelPid, 0));
    assert.equal(probeOFDByte(probe, lockPath, 0), 0);
    assert.equal(probeOFDByte(probe, lockPath, 1), 73);
    await assert.rejects(
      acquireBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
    );
    assert.equal(probeOFDByte(probe, lockPath, 0), 0);
    const terminated = await withDeadline(guardian.closed, 10_000, 'sentinel did not clean controller loss');
    assert.equal(terminated.events.some((event) => event.event === 'SENTINEL_RELEASED'), true);
    assert.equal(groupIsAlive(guardian.pgid), false);
    assert.equal(probeOFDByte(probe, lockPath, 0), 0);
    assert.equal(probeOFDByte(probe, lockPath, 1), 0);
    const after = await eventuallyAcquire({ lockPath, helper });
    await after.release();
  } finally {
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('sentinel SIGKILL permanently fail-holds controller byte zero until explicit teardown', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-sentinel-loss');
  let guardian;
  try {
    const helper = canonicalHelper(root);
    const probe = compileOFDByteProbe(root);
    const writer = compileTermIgnoringWriter(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: writer,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await guardian.start();
    const closedResult = guardian.closed.then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
    process.kill(guardian.sentinelPid, 'SIGKILL');
    const loss = await withDeadline(guardian.loss, 5_000, 'sentinel loss did not resolve');
    assert.equal(loss.nativeEvent.event, 'SENTINEL_DIED');
    const unprovable = await eventuallyObserve(
      () => guardian.events().find((event) => event.event === 'DESCENDANT_UNPROVABLE'),
      (event) => event !== undefined,
      5_000,
      'sentinel loss did not enter permanent descendant fail-hold',
    );
    assert.equal(unprovable.reason, 'sentinel_lost');
    assert.equal(probeOFDByte(probe, lockPath, 0), 73);
    assert.equal(probeOFDByte(probe, lockPath, 1), 0);
    await assert.rejects(
      acquireBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
    );
    await eventuallyObserve(
      () => groupIsAlive(guardian.pgid),
      (alive) => alive === false,
      10_000,
      'controller did not identity-safely clean the original writer group',
    );
    await assertPromiseStillPending(guardian.closed, 250);
    assert.doesNotThrow(() => process.kill(guardian.guardianPid, 0));
    assert.equal(probeOFDByte(probe, lockPath, 0), 73);
    assert.equal(probeOFDByte(probe, lockPath, 1), 0);
    process.kill(guardian.guardianPid, 'SIGTERM');
    await delay(150);
    let controllerAlive = true;
    try { process.kill(guardian.guardianPid, 0); } catch (error) {
      if (error.code === 'ESRCH') controllerAlive = false;
      else throw error;
    }
    assert.equal(controllerAlive, true, JSON.stringify(guardian.events()));
    assert.equal(probeOFDByte(probe, lockPath, 0), 73);

    process.kill(guardian.guardianPid, 'SIGKILL');
    const terminal = await withDeadline(closedResult, 5_000, 'explicit controller teardown did not close');
    assert.equal(terminal.ok, true);
    assert.equal(terminal.value.released, false);
    assert.equal(terminal.value.unexpected, true);
    assert.equal(probeOFDByte(probe, lockPath, 0), 0);
    assert.equal(probeOFDByte(probe, lockPath, 1), 0);
    const after = await eventuallyAcquire({ lockPath, helper });
    await after.release();
  } finally {
    if (guardian?.guardianPid) {
      try { process.kill(guardian.guardianPid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('fork setsid close-198 escape irreversibly fail-holds both escrow bytes', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-fork-escape');
  let guardian;
  let escapedPid = null;
  try {
    const helper = canonicalHelper(root);
    const probe = compileOFDByteProbe(root);
    const writer = compileEscapingForkWriter(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    const pidPath = path.join(root, 'escaped.pid');
    const markerPath = path.join(root, 'escaped.log');
    guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: writer,
      args: [pidPath, markerPath],
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    const startResult = guardian.start().then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
    const closedResult = guardian.closed.then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
    const loss = await withDeadline(guardian.loss, 5_000, 'fork escape did not report lock loss');
    assert.equal(loss.nativeEvent.event, 'DESCENDANT_UNPROVABLE');
    assert.equal(loss.nativeEvent.reason, 'proc_fork');

    escapedPid = await eventuallyObserve(
      () => {
        try { return Number(fs.readFileSync(pidPath, 'utf8').trim()); } catch { return null; }
      },
      (pid) => Number.isSafeInteger(pid) && pid > 1,
      5_000,
      'escaped child did not publish its pid',
    );
    assert.doesNotThrow(() => process.kill(escapedPid, 0));
    const leaseFd = spawnSync('/usr/sbin/lsof', ['-a', '-p', String(escapedPid), '-d', '198'], {
      encoding: 'utf8',
    });
    const listedLeaseFd = leaseFd.stdout.trim().split('\n').slice(1).some(
      (line) => /^198(?:[a-z]+)?$/iu.test(line.trim().split(/\s+/u)[3] ?? ''),
    );
    assert.equal(listedLeaseFd, false, `escaped child retained writer capability FD 198:\n${leaseFd.stdout}`);
    const firstMarkerSize = await eventuallyObserve(
      () => {
        try { return fs.statSync(markerPath).size; } catch { return 0; }
      },
      (size) => size > 0,
      5_000,
      'escaped child did not write after closing FD 198',
    );
    await delay(175);
    assert.equal(fs.statSync(markerPath).size > firstMarkerSize, true);
    assert.equal(probeOFDByte(probe, lockPath, 0), 73);
    assert.equal(probeOFDByte(probe, lockPath, 1), 73);
    await assert.rejects(
      acquireBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
    );
    await assertPromiseStillPending(guardian.closed, 200);

    process.kill(guardian.guardianPid, 'SIGTERM');
    await delay(150);
    let controllerAlive = true;
    try { process.kill(guardian.guardianPid, 0); } catch (error) {
      if (error.code === 'ESRCH') controllerAlive = false;
      else throw error;
    }
    assert.equal(controllerAlive, true, JSON.stringify(guardian.events()));
    assert.doesNotThrow(() => process.kill(guardian.sentinelPid, 0));
    assert.doesNotThrow(() => process.kill(escapedPid, 0));
    assert.equal(probeOFDByte(probe, lockPath, 0), 73);
    assert.equal(probeOFDByte(probe, lockPath, 1), 73);

    process.kill(escapedPid, 'SIGKILL');
    escapedPid = null;
    process.kill(guardian.guardianPid, 'SIGKILL');
    process.kill(guardian.sentinelPid, 'SIGKILL');
    const terminal = await withDeadline(closedResult, 5_000, 'explicit attack teardown did not close');
    assert.equal(terminal.ok, true);
    assert.equal(terminal.value.released, false);
    assert.equal(terminal.value.unexpected, true);
    const started = await withDeadline(startResult, 5_000, 'forked writer start promise did not settle');
    if (started.ok) assert.equal(started.value.running, true);
    else assert.equal(started.error.code, 'WRITER_START_FAILED_CLEANED');
    const after = await eventuallyAcquire({ lockPath, helper });
    await after.release();
  } finally {
    if (escapedPid) {
      try { process.kill(escapedPid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    for (const pid of [guardian?.guardianPid, guardian?.sentinelPid]) {
      if (!pid) continue;
      try { process.kill(pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('mandatory OFD A-F matrix covers hold, handoff, contention, rollback, and release', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-ofd-matrix');
  let guardian;
  try {
    const helper = canonicalHelper(root);
    const probe = compileOFDByteProbe(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');

    bootstrapFixtureLock({ lockPath });
    assert.equal(probeOFDByte(probe, lockPath, 0), 0, 'A: unheld controller byte');
    assert.equal(probeOFDByte(probe, lockPath, 1), 0, 'A: unheld sentinel byte');

    const hold = await acquireBackendOperationLock({ lockPath, helper });
    assert.equal(probeOFDByte(probe, lockPath, 0), 73, 'B: hold owns controller byte');
    assert.equal(probeOFDByte(probe, lockPath, 1), 73, 'B: hold owns sentinel byte');
    await hold.release();
    assert.equal(probeOFDByte(probe, lockPath, 0), 0, 'C: hold releases controller byte');
    assert.equal(probeOFDByte(probe, lockPath, 1), 0, 'C: hold releases sentinel byte');

    guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: '/usr/bin/true',
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    assert.equal(probeOFDByte(probe, lockPath, 0), 73, 'D: controller owns byte zero');
    assert.equal(probeOFDByte(probe, lockPath, 1), 73, 'D: sentinel owns byte one');
    await assert.rejects(
      acquireBackendOperationLock({ lockPath, helper }),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
      'E: ordered two-byte contender fails closed',
    );
    await guardian.abort();
    assert.equal(probeOFDByte(probe, lockPath, 0), 0, 'F: controller closes last after sentinel ACK');
    assert.equal(probeOFDByte(probe, lockPath, 1), 0, 'F: sentinel closes before controller release');
  } finally {
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('102-cycle OFD death, handoff, explicit fail-hold teardown, and fast-exit stress', { timeout: 120_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-ofd-stress');
  let active;
  try {
    const helper = canonicalHelper(root);
    const probe = compileOFDByteProbe(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    for (let cycle = 0; cycle < 102; cycle += 1) {
      active = await prepareGuardedBackendWriter({
        lockPath,
        helper,
        command: '/usr/bin/true',
        cwd: root,
        env: { PATH: '/usr/bin:/bin' },
      });
      if (cycle % 3 === 0) {
        await active.start();
      } else if (cycle % 3 === 1) {
        process.kill(active.guardianPid, 'SIGKILL');
      } else {
        process.kill(active.sentinelPid, 'SIGKILL');
        const loss = await withDeadline(active.loss, 5_000, `stress cycle ${cycle} missed sentinel loss`);
        assert.equal(loss.nativeEvent.event, 'SENTINEL_DIED');
        assert.equal(probeOFDByte(probe, lockPath, 0), 73, `cycle ${cycle} failed to hold byte zero`);
        assert.equal(probeOFDByte(probe, lockPath, 1), 0, `cycle ${cycle} retained dead sentinel byte`);
        process.kill(active.guardianPid, 'SIGKILL');
      }
      await withDeadline(active.closed, 10_000, `stress cycle ${cycle} did not close`);
      assert.equal(probeOFDByte(probe, lockPath, 0), 0, `cycle ${cycle} retained byte zero`);
      assert.equal(probeOFDByte(probe, lockPath, 1), 0, `cycle ${cycle} retained byte one`);
      active = null;
    }
  } finally {
    if (active?.pgid) killGroupIfAlive(active.pgid);
    cleanup(root);
  }
});

test('controller loss and independent sentinel cleanup both surface', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-helper-exit');
  let guardian;
  try {
    const helper = canonicalHelper(root);
    const writer = compileTermIgnoringWriter(root);
    guardian = await prepareGuardedBackendWriter({
      lockPath: path.join(root, 'state', 'backend-operation.lock'),
      helper,
      command: writer,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await guardian.start();
    process.kill(guardian.guardianPid, 'SIGKILL');
    const loss = await withDeadline(guardian.loss, 5_000, 'controller exit did not resolve loss');
    assert.equal(loss.unexpected, true);
    assert.equal(loss.released, false);
    const terminated = await withDeadline(guardian.closed, 10_000, 'sentinel cleanup did not close');
    assert.equal(terminated.released, false);
    assert.equal(terminated.unexpected, true);
    assert.equal(terminated.events.some((event) => event.event === 'SENTINEL_RELEASED'), true);
    assert.equal(groupIsAlive(guardian.pgid), false);
  } finally {
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('exec failure is an orderly guarded failure and releases only after the prepared child is gone', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-exec-failure');
  let guardian;
  try {
    const helper = canonicalHelper(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    const invalidExecutable = path.join(root, 'invalid-executable');
    fs.copyFileSync('/usr/bin/true', invalidExecutable);
    fs.chmodSync(invalidExecutable, 0o500);
    guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: invalidExecutable,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    fs.chmodSync(invalidExecutable, 0o700);
    fs.writeFileSync(invalidExecutable, 'not a native executable\n', { mode: 0o500 });
    fs.chmodSync(invalidExecutable, 0o500);
    let execFailure;
    await assert.rejects(
      guardian.start(),
      (error) => {
        execFailure = error;
        return error.code === 'WRITER_EXEC_FAILED'
          && error.details.closed.exitCode === 70
          && error.details.closed.unexpected === false;
      },
    );
    assertExecFailedLifecycle(guardian, execFailure.details.closed);
    const execLoss = await withDeadline(guardian.loss, 5_000, 'nonzero helper exit did not resolve loss');
    assert.equal(execLoss.exitCode, 70);
    assert.equal(execLoss.unexpected, true);
    const after = await acquireBackendOperationLock({ lockPath, helper });
    await after.release();
  } finally {
    if (guardian?.pgid) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('malformed nonce-framed lifecycle is rejected as protocol loss', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-protocol');
  try {
    const sourcePath = path.join(root, 'malformed-helper.c');
    const source = Buffer.from([
      '#include <unistd.h>',
      'int main(void) {',
      '  static const char frame[] = "BROKEN\\n";',
      '  (void)write(3, frame, sizeof(frame) - 1);',
      '  return 0;',
      '}',
      '',
    ].join('\n'));
    fs.writeFileSync(sourcePath, source, { mode: 0o644 });
    const helper = compileFreshC({
      sourcePath,
      expectedSourceSha256: digest(source),
      binRoot: path.join(root, 'bin'),
      label: 'malformed-helper',
    });
    await assert.rejects(
      acquireBackendOperationLock({
        lockPath: path.join(root, 'state', 'backend-operation.lock'),
        helper,
      }),
      (error) => error.code === 'LOCK_PROTOCOL_ERROR',
    );
  } finally {
    cleanup(root);
  }
});

test('native event schemas reject missing, extra, reordered, and out-of-bound READY fields', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-event-schema');
  try {
    const cases = [
      'nonce=%s event=READY mode=hold',
      'nonce=%s event=READY mode=hold helper_pid=%d extra=1',
      'event=READY nonce=%s mode=hold helper_pid=%d',
      'nonce=%s event=READY mode=hold helper_pid=1',
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const format = cases[index];
      const sourcePath = path.join(root, `schema-${index}.c`);
      const needsPid = format.includes('%d');
      const source = Buffer.from([
        '#include <stdio.h>',
        '#include <unistd.h>',
        'int main(int argc, char **argv) {',
        '  if (argc < 4) return 64;',
        `  dprintf(3, "YURI_BACKEND_LOCK_V1 ${format}\\n", argv[3]${needsPid ? ', getpid()' : ''});`,
        '  sleep(5);',
        '  return 0;',
        '}',
        '',
      ].join('\n'));
      fs.writeFileSync(sourcePath, source, { mode: 0o644 });
      const helper = compileFreshC({
        sourcePath,
        expectedSourceSha256: digest(source),
        binRoot: path.join(root, `bin-${index}`),
        label: `schema-${index}`,
      });
      await assert.rejects(
        acquireBackendOperationLock({
          lockPath: path.join(root, `state-${index}`, 'backend-operation.lock'),
          helper,
        }),
        (error) => error.code === 'LOCK_PROTOCOL_ERROR',
      );
    }
  } finally {
    cleanup(root);
  }
});

test('assertHeld fails after a protocol fault observed after an exact READY acquisition', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-post-ready-protocol');
  try {
    const sourcePath = path.join(root, 'post-ready-protocol-helper.c');
    const source = Buffer.from([
      '#define _DARWIN_C_SOURCE 1',
      '#include <fcntl.h>',
      '#include <stdio.h>',
      '#include <sys/file.h>',
      '#include <time.h>',
      '#include <unistd.h>',
      'int main(int argc, char **argv) {',
      '  struct timespec pause_time = { .tv_sec = 0, .tv_nsec = 200000000L };',
      '  if (argc < 4) return 64;',
      '  int fd = open(argv[2], O_RDONLY | O_NOFOLLOW);',
      '  if (fd < 0 || flock(fd, LOCK_EX | LOCK_NB) != 0) return 73;',
      '  dprintf(3, "YURI_BACKEND_LOCK_V1 nonce=%s event=READY mode=hold helper_pid=%d\\n", argv[3], getpid());',
      '  nanosleep(&pause_time, NULL);',
      '  (void)write(3, "BROKEN\\n", 7);',
      '  sleep(5);',
      '  close(fd);',
      '  return 0;',
      '}',
      '',
    ].join('\n'));
    fs.writeFileSync(sourcePath, source, { mode: 0o644 });
    const fixtureHelper = compileFreshC({
      sourcePath,
      expectedSourceSha256: digest(source),
      binRoot: path.join(root, 'bin'),
      label: 'post-ready-protocol-helper',
    });
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    const lease = await acquireBackendOperationLock({ lockPath, helper: fixtureHelper });
    assert.equal(lease.assertHeld().held, true);
    const loss = await withDeadline(lease.loss, 5_000, 'protocol loss did not resolve');
    assert.equal(loss.unexpected, true);
    assert.match(loss.protocolError, /invalid event frame/u);
    assert.throws(
      () => lease.assertHeld(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );
    await assert.rejects(
      lease.release(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );

    const canonical = canonicalHelper(root, 'post-protocol-canonical');
    const after = await eventuallyAcquire({ lockPath, helper: canonical });
    await after.release();
  } finally {
    cleanup(root);
  }
});

test('native PROTOCOL_ERROR plus RELEASED is never accepted as a clean terminal state', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-native-protocol-error');
  try {
    const sourcePath = path.join(root, 'native-protocol-error-helper.c');
    const source = Buffer.from([
      '#define _DARWIN_C_SOURCE 1',
      '#include <fcntl.h>',
      '#include <stdio.h>',
      '#include <sys/file.h>',
      '#include <unistd.h>',
      'int main(int argc, char **argv) {',
      '  char command[256];',
      '  if (argc < 4) return 64;',
      '  int fd = open(argv[2], O_RDONLY | O_NOFOLLOW);',
      '  if (fd < 0 || flock(fd, LOCK_EX | LOCK_NB) != 0) return 73;',
      '  dprintf(3, "YURI_BACKEND_LOCK_V1 nonce=%s event=READY mode=hold helper_pid=%d\\n", argv[3], getpid());',
      '  (void)read(STDIN_FILENO, command, sizeof(command));',
      '  dprintf(3, "YURI_BACKEND_LOCK_V1 nonce=%s event=PROTOCOL_ERROR phase=hold\\n", argv[3]);',
      '  close(fd);',
      '  dprintf(3, "YURI_BACKEND_LOCK_V1 nonce=%s event=RELEASED reason=protocol_error\\n", argv[3]);',
      '  return 0;',
      '}',
      '',
    ].join('\n'));
    fs.writeFileSync(sourcePath, source, { mode: 0o644 });
    const helper = compileFreshC({
      sourcePath,
      expectedSourceSha256: digest(source),
      binRoot: path.join(root, 'bin'),
      label: 'native-protocol-error-helper',
    });
    const lease = await acquireBackendOperationLock({
      lockPath: path.join(root, 'state', 'backend-operation.lock'),
      helper,
    });
    await assert.rejects(
      lease.release(),
      (error) => error.code === 'LOCK_RELEASE_FAILED',
    );
    const loss = await withDeadline(lease.loss, 5_000, 'native protocol loss did not resolve');
    assert.equal(loss.unexpected, true);
    assert.equal(loss.events.some((event) => event.event === 'PROTOCOL_ERROR'), true);
  } finally {
    cleanup(root);
  }
});

test('abrupt JavaScript supervisor exit closes control; native guardian stops the writer group before unlocking', { timeout: 45_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-js-exit');
  try {
    const helper = canonicalHelper(root, 'parent-helper');
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    bootstrapFixtureLock({ lockPath });
    const childCode = [
      `import { prepareGuardedBackendWriter } from ${JSON.stringify(MODULE_URL)};`,
      `const guardian = await prepareGuardedBackendWriter({`,
      `  lockPath: ${JSON.stringify(lockPath)},`,
      `  binRoot: ${JSON.stringify(path.join(root, 'child-bin'))},`,
      `  command: '/bin/sleep',`,
      `  args: ['30'],`,
      `  cwd: ${JSON.stringify(root)},`,
      `  env: { PATH: '/usr/bin:/bin' },`,
      `});`,
      `await guardian.start();`,
      `console.log(JSON.stringify({ guardianPid: guardian.guardianPid, pgid: guardian.pgid }));`,
      `process.exit(0);`,
    ].join('\n');
    const child = spawn(process.execPath, ['--input-type=module', '-e', childCode], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let identity;
    const identityPromise = new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
        const newline = stdout.indexOf('\n');
        if (newline >= 0) {
          try {
            identity = JSON.parse(stdout.slice(0, newline));
            resolve(identity);
          } catch (error) {
            reject(error);
          }
        }
      });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    });
    const observedIdentity = await withDeadline(
      identityPromise,
      20_000,
      `child did not prepare guardian: ${stderr}`,
    );
    await once(child, 'exit');
    assert.equal(Number.isSafeInteger(observedIdentity.pgid), true);

    const after = await eventuallyAcquire({ lockPath, helper }, 10_000);
    await after.release();
    assert.equal(groupIsAlive(observedIdentity.pgid), false);
  } finally {
    cleanup(root);
  }
});

test('natural nonzero writer exit is a closed writer result, not guardian loss', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-natural-exit');
  try {
    const helper = canonicalHelper(root);
    const writer = compileImmediateNativeWriter(root, 'native-exit-seven', 'return 7;');
    const guardian = await prepareGuardedBackendWriter({
      lockPath: path.join(root, 'state', 'backend-operation.lock'),
      helper,
      command: writer,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await guardian.start();
    let closed;
    try {
      closed = await withDeadline(guardian.closed, 5_000, 'natural-exit guardian did not close');
    } catch (error) {
      error.message = `${error.message}: ${JSON.stringify(guardian.events())}`;
      throw error;
    }
    assert.equal(closed.unexpected, false);
    assert.equal(closed.released, true);
    assert.equal(closed.releaseVerified, true);
    assert.equal(closed.writerExitCode, 7);
    assert.equal(closed.writerTermSignal, 0);
    assert.equal(closed.writerSucceeded, false);
    assert.equal(
      Number(closed.orderedEventTranscript.find(
        (entry) => entry.event.event === 'WRITER_EXITED',
      ).event.exit_code),
      7,
    );
    assert.equal(guardian.phase, 'closed');
    assert.throws(
      () => validateBackendOperationGuardianTerminalEvidence(closed, {
        requireWriterSuccess: true,
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );
    assert.throws(
      () => validateBackendOperationGuardianTerminalEvidence(closed, {
        requireCleanRelease: true,
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );
    await assertPromiseStillPending(guardian.loss);
  } finally {
    cleanup(root);
  }
});

test('writer success is receipt-bound: exit 0 accepts while signal rejects success gates', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-writer-success');
  try {
    const helper = canonicalHelper(root);
    const successful = await prepareGuardedBackendWriter({
      lockPath: path.join(root, 'success-state', 'backend-operation.lock'),
      helper,
      command: '/usr/bin/true',
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await successful.start();
    const success = await successful.closed;
    assert.equal(success.writerExitCode, 0);
    assert.equal(success.writerTermSignal, 0);
    assert.equal(success.writerSucceeded, true);
    assert.strictEqual(
      validateBackendOperationGuardianTerminalEvidence(success, {
        requireCleanRelease: true,
        requireWriterSuccess: true,
      }),
      success,
    );
    const boundSchemaEvents = ['PREPARED', 'RUNNING', 'WRITER_EXITED', 'RELEASED'];
    for (const eventName of boundSchemaEvents) {
      for (const mutation of ['missing', 'extra', 'reordered', 'out-of-bound']) {
        const invalid = JSON.parse(JSON.stringify(success));
        const transcriptIndex = invalid.orderedEventTranscript.findIndex(
          (entry) => entry.event.event === eventName,
        );
        const original = invalid.orderedEventTranscript[transcriptIndex].event;
        let event;
        if (mutation === 'missing') {
          event = Object.fromEntries(Object.entries(original).slice(0, -1));
        } else if (mutation === 'extra') {
          event = { ...original, extra: '1' };
        } else if (mutation === 'reordered') {
          const entries = Object.entries(original);
          event = Object.fromEntries([entries[1], entries[0], ...entries.slice(2)]);
        } else {
          event = { ...original };
          if (eventName === 'PREPARED' || eventName === 'RUNNING') event.writer_pid = '1';
          if (eventName === 'WRITER_EXITED') event.exit_code = '256';
          if (eventName === 'RELEASED') event.reason = 'not_allowed';
        }
        invalid.orderedEventTranscript[transcriptIndex].event = event;
        invalid.orderedEventTranscript[transcriptIndex].nativeFrame = evidenceFrame(event);
        invalid.events = invalid.orderedEventTranscript.map((entry) => entry.event);
        invalid.transcriptSha256 = hashBackendOperationTranscript(
          invalid.orderedEventTranscript,
        );
        assert.throws(
          () => validateBackendOperationGuardianTerminalEvidence(invalid),
          (error) => error.code === 'LOCK_ATTESTATION_INVALID',
          `${eventName} ${mutation} should be rejected`,
        );
      }
    }

    const reboundPreparedTime = JSON.parse(JSON.stringify(success.acquisition));
    reboundPreparedTime.preparedAt = new Date(
      new Date(reboundPreparedTime.preparedAt).valueOf() + 1_000,
    ).toISOString();
    reboundPreparedTime.attestationSha256 = hashBackendOperationAcquisitionAttestation(
      reboundPreparedTime,
    );
    assert.throws(
      () => validateBackendOperationAcquisitionAttestation(reboundPreparedTime, {
        expectedPreparedAt: success.acquisition.preparedAt,
      }),
      (error) => error.code === 'LOCK_EXPECTATION_MISMATCH',
    );
    const expectedWriterPid = Number(success.acquisition.preparedEvent.writer_pid);
    const forged = JSON.parse(JSON.stringify(success));
    forged.acquisition.preparedEvent.writer_pid = '99999';
    forged.acquisition.preparedEvent.pgid = '99999';
    forged.acquisition.preparedFrame = evidenceFrame(forged.acquisition.preparedEvent);
    forged.acquisition.attestationSha256 = hashBackendOperationAcquisitionAttestation(
      forged.acquisition,
    );
    const preparedIndex = forged.orderedEventTranscript.findIndex(
      (entry) => entry.event.event === 'PREPARED',
    );
    forged.orderedEventTranscript[preparedIndex].event = forged.acquisition.preparedEvent;
    forged.orderedEventTranscript[preparedIndex].nativeFrame = forged.acquisition.preparedFrame;
    const runningIndex = forged.orderedEventTranscript.findIndex(
      (entry) => entry.event.event === 'RUNNING',
    );
    forged.orderedEventTranscript[runningIndex].event.writer_pid = '99999';
    forged.orderedEventTranscript[runningIndex].event.pgid = '99999';
    forged.orderedEventTranscript[runningIndex].nativeFrame = evidenceFrame(
      forged.orderedEventTranscript[runningIndex].event,
    );
    forged.runningEvent = forged.orderedEventTranscript[runningIndex].event;
    forged.runningFrame = forged.orderedEventTranscript[runningIndex].nativeFrame;
    forged.events = forged.orderedEventTranscript.map((entry) => entry.event);
    forged.transcriptSha256 = hashBackendOperationTranscript(forged.orderedEventTranscript);
    assert.throws(
      () => validateBackendOperationAcquisitionAttestation(forged.acquisition, {
        expectedWriterPid,
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );
    assert.throws(
      () => validateBackendOperationGuardianTerminalEvidence(forged, {
        expectedWriterPid,
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );

    const signalWriter = compileImmediateNativeWriter(
      root,
      'native-signal-term',
      'raise(SIGTERM); return 1;',
    );
    const signaled = await prepareGuardedBackendWriter({
      lockPath: path.join(root, 'signal-state', 'backend-operation.lock'),
      helper,
      command: signalWriter,
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await signaled.start();
    const signal = await signaled.closed;
    assert.equal(signal.writerExitCode, -1);
    assert.equal(signal.writerTermSignal, 15);
    assert.equal(signal.writerSucceeded, false);
    assert.throws(
      () => validateBackendOperationGuardianTerminalEvidence(signal, {
        requireWriterSuccess: true,
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );
    assert.throws(
      () => validateBackendOperationGuardianTerminalEvidence(signal, {
        requireCleanRelease: true,
      }),
      (error) => error.code === 'LOCK_ATTESTATION_INVALID',
    );
  } finally {
    cleanup(root);
  }
});

test('caught SIGTERM, SIGINT, and SIGHUP are explicit guardian loss, never clean release', { timeout: 45_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-guardian-signals');
  const guardians = [];
  try {
    const helper = canonicalHelper(root);
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      const guardian = await prepareGuardedBackendWriter({
        lockPath: path.join(root, signal.toLowerCase(), 'backend-operation.lock'),
        helper,
        command: '/bin/sleep',
        args: ['30'],
        cwd: root,
        env: { PATH: '/usr/bin:/bin' },
      });
      guardians.push(guardian);
      await guardian.start();
      process.kill(guardian.guardianPid, signal);
      const loss = await withDeadline(guardian.loss, 5_000, `${signal} did not resolve guardian loss`);
      assert.equal(loss.nativeEvent.event, 'GUARDIAN_SIGNAL');
      assert.equal(Number(loss.nativeEvent.signal) > 0, true);
      const closed = await withDeadline(guardian.closed, 10_000, `${signal} guardian did not close`);
      assert.equal(closed.exitCode, 75);
      assert.equal(closed.signal, null);
      assert.equal(closed.unexpected, true);
      assert.equal(closed.released, true);
      assert.equal(closed.releasedEvent.reason, 'guardian_signal');
      assert.throws(
        () => validateBackendOperationGuardianTerminalEvidence(closed, {
          requireCleanRelease: true,
        }),
        (error) => error.code === 'LOCK_ATTESTATION_INVALID',
      );
      assert.equal(groupIsAlive(guardian.pgid), false);
    }
  } finally {
    for (const guardian of guardians) killGroupIfAlive(guardian.pgid);
    cleanup(root);
  }
});

test('completed guarded writer rejects a second start without retaining either OFD byte', { timeout: 30_000 }, async () => {
  const root = makeRoot('yuri-backend-operation-start-state');
  try {
    const helper = canonicalHelper(root);
    const probe = compileOFDByteProbe(root);
    const lockPath = path.join(root, 'state', 'backend-operation.lock');
    const guardian = await prepareGuardedBackendWriter({
      lockPath,
      helper,
      command: '/usr/bin/true',
      cwd: root,
      env: { PATH: '/usr/bin:/bin' },
    });
    await guardian.start();
    await guardian.closed;
    await assert.rejects(
      guardian.start(),
      (error) => error.code === 'WRITER_START_STATE_INVALID',
    );
    assert.equal(probeOFDByte(probe, lockPath, 0), 0);
    assert.equal(probeOFDByte(probe, lockPath, 1), 0);
  } finally {
    cleanup(root);
  }
});

test('module forbids a convenience spawn that could discard the guardian handle', async () => {
  const namespace = await import(MODULE_URL);
  assert.equal(Object.hasOwn(namespace, 'spawnGuardedBackendWriter'), false);
});
