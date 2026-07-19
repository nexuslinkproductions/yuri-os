#!/usr/bin/env node

/**
 * Owner-gated full backend runtime-data recovery wrapper.
 *
 * The CLI accepts a repository root on the pinned, read-only YURI backup image;
 * it never accepts an arbitrary source data directory or target. The canonical
 * live target is fixed. Restore is staged and byte-verified on the internal
 * APFS filesystem, preserves the old target by rename, and never deletes the
 * source, the old target, or a failed promoted target.
 *
 * @capability backend-data-recovery
 * @serves protected backend runtime recovery | internal APFS staging | rollback preservation
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  acquireBackendOperationLock,
  validateBackendOperationAcquisitionAttestation,
  validateBackendOperationReleaseEvidence,
  BACKEND_HELPER_BIN_ROOT,
  BACKEND_OPERATION_LOCK_PATH,
  BACKEND_OPERATION_LOCK_SOURCE,
} from './backend-operation-lock.mjs';
import {
  INTERNAL_APFS_EXPECTED_VOLUME_UUID,
  normalizeDiskutilMountInfo,
} from './backend-storage-guard.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
export const CANONICAL_TARGET = path.join(REPO_ROOT, '_SYSTEM/backend/data');
export const QUARANTINE_ROOT = path.join(REPO_ROOT, '_SYSTEM/recovery/backend-db');
export const RECEIPT_ROOT = path.join(REPO_ROOT, '_SYSTEM/state/backend-volume');
export const SWAP_HELPER_SOURCE_PATH = path.join(REPO_ROOT, '_SYSTEM/Scripts/backend-data-swap.c');
export const SWAP_HELPER_SOURCE_SHA256 = '4c17848556e1bbc29755a9169a380ee82cec3310da0094a9794dbe742d8a0fd8';
export const RECOVERY_LOCK_PATH = path.join(RECEIPT_ROOT, 'backend-data-recovery.lock');
export const BACKUP_IMAGE_PATH = '/Volumes/T7/YURI-OS-MUSUBI-Backup.sparsebundle';
export const RUNTIME_IMAGE_PATH = '/Volumes/T7/YURI-Backend-Runtime-v1.sparsebundle';
export const T7_MOUNT_POINT = '/Volumes/T7';
export const T7_VOLUME_UUID = '86791676-F5A1-3995-BA18-03186DC20969';
export const BACKUP_VOLUME_UUID = '68F64A84-0F8D-4F86-A4BB-821AFA93F835';
export const EXPECTED_SOURCE = Object.freeze({
  itemCount: 17,
  fileCount: 12,
  byteCount: 44_153_141_372,
});

export const RECOVERY_CHILD_ENVIRONMENT = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  LANG: 'C',
  LC_ALL: 'C',
  TMPDIR: '/private/tmp',
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const RECOVERY_TARGET_IDENTITY_KEYS = Object.freeze([
  'filesystem',
  'internal',
  'writable',
  'readOnly',
  'removableMedia',
  'deviceLocation',
  'volumeUuid',
  'mountPoint',
  'dfMountPoint',
  'deviceIdentifier',
  'dfDeviceIdentifier',
  'deviceId',
  'inspectedPath',
  'globalPermissionsEnabled',
  'ownersEnabled',
  'parseConflict',
  't7RequiredAtRuntime',
]);

const GIB = 1024n ** 3n;
const SQLITE_BIN = '/usr/bin/sqlite3';
const MAX_COMMAND_BUFFER = 64 * 1024 * 1024;
const MANIFEST_SCHEMA = 'yuri.backend-data-recovery.inspect.v1';
const INTERNAL_VOLUME_ATTESTATION_SCHEMA = 'yuri.backend-data-recovery.internal-apfs-attestation.v1';
const ACTIVE_MARKER_SCHEMA = 'yuri.backend-data-recovery.active.v2';
const TRANSACTION_SCHEMA = 'yuri.backend-data-recovery.transaction.v2';
const RESTORE_PHASE_A_SCHEMA = 'yuri.backend-data-recovery.restore.phase-a.v2';
const RESTORE_FINAL_SCHEMA = 'yuri.backend-data-recovery.restore.final.v2';
const VERIFY_SCHEMA = 'yuri.backend-data-recovery.verify.sealed.v2';
const VERIFY_FINAL_SCHEMA = 'yuri.backend-data-recovery.verify.final.v2';
const DESCRIPTOR_RELATIVE_RECEIPT_WRITER = String.raw`
import hashlib
import json
import os
import stat
import sys

MAX_RECEIPT_BYTES = 1024 * 1024

def abort(message):
    raise RuntimeError(message)

if len(sys.argv) != 5:
    abort('usage: <destination> <parent-dev> <parent-ino> <uid>')

destination = sys.argv[1]
expected_parent_dev = int(sys.argv[2])
expected_parent_ino = int(sys.argv[3])
expected_uid = int(sys.argv[4])
if not os.path.isabs(destination) or os.path.normpath(destination) != destination:
    abort('destination must be absolute and normalized')
components = destination.split('/')[1:]
if len(components) < 2 or any(not part or part in ('.', '..') for part in components):
    abort('destination has an invalid component')
leaf = components[-1]
if '/' in leaf or not leaf.startswith('internal-volume-attestation-') or not leaf.endswith('.json'):
    abort('destination leaf is outside the attestation namespace')

data = sys.stdin.buffer.read(MAX_RECEIPT_BYTES + 1)
if not data or len(data) > MAX_RECEIPT_BYTES:
    abort('receipt bytes are empty or exceed the bound')

directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
parent_fd = os.open('/', directory_flags)
try:
    for component in components[:-1]:
        next_fd = os.open(component, directory_flags, dir_fd=parent_fd)
        opened = os.fstat(next_fd)
        if not stat.S_ISDIR(opened.st_mode):
            os.close(next_fd)
            abort('path component is not a directory')
        os.close(parent_fd)
        parent_fd = next_fd

    parent_before = os.fstat(parent_fd)
    parent_mode = stat.S_IMODE(parent_before.st_mode)
    if (parent_before.st_dev != expected_parent_dev
            or parent_before.st_ino != expected_parent_ino
            or parent_before.st_uid != expected_uid
            or parent_mode & 0o077):
        abort('receipt parent identity or permissions changed')

    leaf_flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
    leaf_fd = os.open(leaf, leaf_flags, 0o600, dir_fd=parent_fd)
    try:
        os.fchmod(leaf_fd, 0o600)
        offset = 0
        while offset < len(data):
            written = os.write(leaf_fd, data[offset:])
            if written <= 0:
                abort('short receipt write')
            offset += written
        os.fsync(leaf_fd)
        os.lseek(leaf_fd, 0, os.SEEK_SET)
        reread = bytearray()
        while len(reread) < len(data):
            chunk = os.read(leaf_fd, len(data) - len(reread))
            if not chunk:
                break
            reread.extend(chunk)
        if bytes(reread) != data or os.read(leaf_fd, 1):
            abort('receipt bytes changed during descriptor reread')
        leaf_stat = os.fstat(leaf_fd)
        if (not stat.S_ISREG(leaf_stat.st_mode)
                or leaf_stat.st_dev != expected_parent_dev
                or leaf_stat.st_uid != expected_uid
                or stat.S_IMODE(leaf_stat.st_mode) != 0o600
                or leaf_stat.st_nlink != 1
                or leaf_stat.st_size != len(data)):
            abort('receipt file identity is unsafe')
        digest = hashlib.sha256(data).hexdigest()
    finally:
        os.close(leaf_fd)

    os.fsync(parent_fd)
    parent_after = os.fstat(parent_fd)
    if (parent_after.st_dev != parent_before.st_dev
            or parent_after.st_ino != parent_before.st_ino
            or parent_after.st_uid != parent_before.st_uid
            or stat.S_IMODE(parent_after.st_mode) != parent_mode):
        abort('receipt parent identity changed while held')
    print(json.dumps({
        'ok': True,
        'sha256': digest,
        'device': str(leaf_stat.st_dev),
        'inode': str(leaf_stat.st_ino),
        'uid': leaf_stat.st_uid,
        'mode': stat.S_IMODE(leaf_stat.st_mode),
        'nlink': leaf_stat.st_nlink,
        'size': leaf_stat.st_size,
        'parentDevice': str(parent_after.st_dev),
        'parentInode': str(parent_after.st_ino),
    }, separators=(',', ':')))
finally:
    os.close(parent_fd)
`;
const PRIVATE_FIXTURE_ROOT = '/private/tmp';
const PRODUCTION_EXECUTION_TOKEN = Object.freeze({ type: 'production-recovery-execution' });
const FIXTURE_EXECUTION_TOKENS = new WeakSet();

const PRODUCTION_INPUTS = Object.freeze({
  attestInternalVolume: new Set(['ownerApproved']),
  inspect: new Set(['ownerApproved', 'sourceRepo']),
  restore: new Set(['ownerApproved', 'sourceRepo', 'manifestPath', 'manifestSha256']),
  verify: new Set(['ownerApproved', 'manifestPath', 'manifestSha256']),
});

export class BackendDataRecoveryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BackendDataRecoveryError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new BackendDataRecoveryError(code, message, details);
}

function requireExecutionToken(token) {
  if (token !== PRODUCTION_EXECUTION_TOKEN && !FIXTURE_EXECUTION_TOKENS.has(token)) {
    fail('RECOVERY_EXECUTION_CONTEXT_REFUSED', 'recovery core requires a bound production or contained-fixture execution context');
  }
}

function requireOwnerApprovalFirst(options, message) {
  if (options?.ownerApproved !== true) fail('OWNER_APPROVAL_REQUIRED', message);
}

function rejectProductionOverrides(options, action) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('PRODUCTION_INPUT_INVALID', `${action} inputs must be a plain options object`);
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('PRODUCTION_INPUT_INVALID', `${action} inputs must not carry a custom prototype`);
  }
  const allowed = PRODUCTION_INPUTS[action];
  const keys = Reflect.ownKeys(options);
  const rejected = keys.find((key) => typeof key !== 'string' || !allowed.has(key));
  if (rejected !== undefined) {
    fail('PRODUCTION_OVERRIDE_REFUSED', `${action} production recovery rejects authority/test override inputs`, {
      option: typeof rejected === 'symbol' ? rejected.toString() : rejected,
    });
  }
}

function rejectFixtureCallOverrides(options, allowed, action) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('FIXTURE_INPUT_INVALID', `${action} fixture inputs must be a plain options object`);
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('FIXTURE_INPUT_INVALID', `${action} fixture inputs must not carry a custom prototype`);
  }
  const rejected = Reflect.ownKeys(options)
    .find((key) => typeof key !== 'string' || !allowed.has(key));
  if (rejected !== undefined) {
    fail('FIXTURE_OVERRIDE_REFUSED', `${action} fixture call rejects path/adapter authority overrides`, {
      option: typeof rejected === 'symbol' ? rejected.toString() : rejected,
    });
  }
}

function normalizeAbsolute(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\0')) {
    fail('PATH_INVALID', `${label} must be a non-empty absolute path`);
  }
  if (!path.isAbsolute(value) || path.resolve(value) !== value) {
    fail('PATH_INVALID', `${label} must be absolute and normalized`, { value });
  }
  return value;
}

function exactDirectory(value, label) {
  const absolute = normalizeAbsolute(value, label);
  let entry;
  try {
    entry = fs.lstatSync(absolute);
  } catch (error) {
    fail('PATH_UNAVAILABLE', `${label} is unavailable`, { path: absolute, cause: error.code || error.message });
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    fail('PATH_IDENTITY_MISMATCH', `${label} must be an exact directory without symlinks`, { path: absolute });
  }
  if (fs.realpathSync.native(absolute) !== absolute) {
    fail('PATH_IDENTITY_MISMATCH', `${label} traverses a symlink`, { path: absolute });
  }
  return { path: absolute, stat: entry };
}

function exactFile(value, label) {
  const absolute = normalizeAbsolute(value, label);
  let entry;
  try {
    entry = fs.lstatSync(absolute);
  } catch (error) {
    fail('PATH_UNAVAILABLE', `${label} is unavailable`, { path: absolute, cause: error.code || error.message });
  }
  if (!entry.isFile() || entry.isSymbolicLink() || fs.realpathSync.native(absolute) !== absolute) {
    fail('PATH_IDENTITY_MISMATCH', `${label} must be an exact regular file without symlinks`, { path: absolute });
  }
  return { path: absolute, stat: entry };
}

function sameUuid(left, right) {
  return typeof left === 'string' && left.toUpperCase() === right.toUpperCase();
}

function spawnRecoveryProcess(commandPath, args, options = {}) {
  return spawnSync(commandPath, args, {
    ...options,
    // Environment authority is closed at the only recovery spawn seam. Keep
    // this assignment last so no caller can reintroduce compiler, loader,
    // runtime, locale, or search-path variables from the parent process.
    env: RECOVERY_CHILD_ENVIRONMENT,
  });
}

function command(commandPath, args, options = {}) {
  const result = spawnRecoveryProcess(commandPath, args, {
    encoding: 'utf8',
    maxBuffer: MAX_COMMAND_BUFFER,
    timeout: options.timeout ?? 120_000,
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail('COMMAND_FAILED', `${commandPath} failed`, {
      args,
      status: result.status,
      stderr: result.stderr?.trim() || '',
      cause: result.error?.message || null,
    });
  }
  return result.stdout;
}

function plistJson(xml) {
  const json = command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: xml });
  try {
    return JSON.parse(json);
  } catch (error) {
    fail('PLIST_PARSE_FAILED', 'macOS storage evidence was not valid JSON', { cause: error.message });
  }
}

export function normalizeBackupSourceMountEvidence(sourceRepo, dfRecord, mounted) {
  const sourcePath = normalizeAbsolute(sourceRepo, 'source repository');
  const expectedSourceRepoName = 'YURI-OS-MUSUBI';
  const mountPoint = typeof dfRecord?.mountPoint === 'string'
    ? path.resolve(dfRecord.mountPoint)
    : '';
  const sourceDevice = typeof dfRecord?.sourceDevice === 'string'
    ? dfRecord.sourceDevice
    : '';
  if (!path.isAbsolute(mountPoint)
      || mountPoint !== dfRecord?.mountPoint
      || !sourceDevice.startsWith('/dev/')
      || !sameUuid(mounted?.VolumeUUID, BACKUP_VOLUME_UUID)
      || String(mounted?.FilesystemType || '').toLowerCase() !== 'apfs'
      || mounted?.Writable !== false
      || mounted?.WritableVolume !== false
      || mounted?.MountPoint !== mountPoint
      || mounted?.DeviceNode !== sourceDevice
      || sourcePath !== path.join(mountPoint, expectedSourceRepoName)) {
    fail('BACKUP_MOUNT_IDENTITY_MISMATCH', 'the recovery source is not coherently bound to the pinned read-only APFS backup volume', {
      sourceDevice: sourceDevice || null,
      sourcePath,
      dfMountPoint: mountPoint || null,
      diskutilMountPoint: mounted?.MountPoint ?? null,
      diskutilDeviceNode: mounted?.DeviceNode ?? null,
    });
  }
  return Object.freeze({
    mountPoint,
    volumeUuid: String(mounted.VolumeUUID).toUpperCase(),
    filesystem: String(mounted.FilesystemType).toLowerCase(),
    writable: false,
  });
}

function inspectSourceIdentitySystem(sourceRepo) {
  const source = exactDirectory(sourceRepo, 'source repository');
  const expectedSourceRepoName = 'YURI-OS-MUSUBI';
  if (path.basename(source.path) !== expectedSourceRepoName) {
    fail('SOURCE_REPO_REFUSED', `source repository basename must be ${expectedSourceRepoName}`);
  }

  const host = plistJson(command('/usr/sbin/diskutil', ['info', '-plist', T7_MOUNT_POINT]));
  if (!sameUuid(host.VolumeUUID, T7_VOLUME_UUID)
      || host.MountPoint !== T7_MOUNT_POINT
      || String(host.FilesystemType || '').toLowerCase() !== 'exfat'
      || host.Writable !== true) {
    fail('T7_IDENTITY_MISMATCH', 'the connected T7 does not match the pinned host identity');
  }

  const sourceMount = parseRecoveryDfMountRecord(command('/bin/df', ['-P', source.path]));
  const mounted = plistJson(command('/usr/sbin/diskutil', ['info', '-plist', sourceMount.mountPoint]));
  const backup = normalizeBackupSourceMountEvidence(source.path, sourceMount, mounted);

  const imageInfo = plistJson(command('/usr/bin/hdiutil', ['info', '-plist']));
  const images = Array.isArray(imageInfo.images) ? imageInfo.images : [];
  const backupImage = images.find((image) => image['image-path'] === BACKUP_IMAGE_PATH);
  if (!backupImage || backupImage.writeable !== false) {
    fail('BACKUP_IMAGE_IDENTITY_MISMATCH', 'the exact backup image is not attached read-only');
  }
  const mountedEntity = (backupImage['system-entities'] || []).find(
    (entity) => entity['mount-point'] === backup.mountPoint,
  );
  if (!mountedEntity) {
    fail('BACKUP_IMAGE_IDENTITY_MISMATCH', 'backup image mapping does not include the verified mountpoint');
  }
  if (images.some((image) => image['image-path'] === RUNTIME_IMAGE_PATH)) {
    fail('RUNTIME_IMAGE_MUST_STAY_DETACHED', 'the retired external-live runtime image is attached');
  }

  return Object.freeze({
    hostMountPoint: host.MountPoint,
    hostVolumeUuid: String(host.VolumeUUID).toUpperCase(),
    hostFilesystem: String(host.FilesystemType).toLowerCase(),
    imagePath: BACKUP_IMAGE_PATH,
    imageWritable: false,
    backupMountPoint: backup.mountPoint,
    backupVolumeUuid: backup.volumeUuid,
    backupFilesystem: backup.filesystem,
    backupWritable: backup.writable,
    sourceRepo: source.path,
    retiredRuntimeImageObservedDetachedAtInspection: true,
  });
}

export function normalizeRecoveryTargetIdentity(target, targetDeviceId, mounted) {
  const inspectedPath = normalizeAbsolute(target, 'canonical backend target');
  const expectedDeviceId = String(targetDeviceId ?? '');
  const volumeUuid = typeof mounted?.volumeUuid === 'string'
    ? mounted.volumeUuid.toUpperCase()
    : '';
  const mountPoint = mounted?.mountPoint;
  const dfMountPoint = mounted?.dfMountPoint;
  const deviceIdentifier = mounted?.deviceIdentifier;
  const dfDeviceIdentifier = mounted?.dfDeviceIdentifier;
  const coherent = mounted !== null
    && typeof mounted === 'object'
    && mounted.parseConflict === false
    && mounted.fsType === 'apfs'
    && mounted.internal === true
    && mounted.writable === true
    && mounted.readOnly !== true
    && mounted.ownersEnabled === true
    && mounted.removableMedia !== 'true'
    && mounted.inspectedPath === inspectedPath
    && /^\d+$/u.test(expectedDeviceId)
    && mounted.deviceId === expectedDeviceId
    && typeof mountPoint === 'string'
    && path.isAbsolute(mountPoint)
    && path.resolve(mountPoint) === mountPoint
    && mountPoint === dfMountPoint
    && typeof deviceIdentifier === 'string'
    && /^disk[0-9]+(?:s[0-9]+)*$/u.test(deviceIdentifier)
    && deviceIdentifier === dfDeviceIdentifier
    && UUID_PATTERN.test(volumeUuid)
    && sameUuid(volumeUuid, INTERNAL_APFS_EXPECTED_VOLUME_UUID)
    && !sameUuid(volumeUuid, T7_VOLUME_UUID)
    && !sameUuid(volumeUuid, BACKUP_VOLUME_UUID);
  if (!coherent) {
    fail(
      'INTERNAL_TARGET_IDENTITY_MISMATCH',
      'canonical backend target is not coherently bound to a writable internal APFS volume',
      {
        deviceIdentifier: deviceIdentifier ?? null,
        dfDeviceIdentifier: dfDeviceIdentifier ?? null,
        dfMountPoint: dfMountPoint ?? null,
        inspectedPath: mounted?.inspectedPath ?? null,
        mountPoint: mountPoint ?? null,
        parseConflict: mounted?.parseConflict ?? null,
      },
    );
  }
  return Object.freeze({
    filesystem: mounted.fsType,
    internal: true,
    writable: true,
    readOnly: false,
    removableMedia: mounted.removableMedia,
    deviceLocation: mounted.deviceLocation,
    volumeUuid,
    mountPoint,
    dfMountPoint,
    deviceIdentifier,
    dfDeviceIdentifier,
    deviceId: expectedDeviceId,
    inspectedPath,
    globalPermissionsEnabled: true,
    ownersEnabled: true,
    parseConflict: false,
    t7RequiredAtRuntime: false,
  });
}

function parseRecoveryDfMountRecord(output) {
  const lines = String(output).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 2) {
    fail('INTERNAL_TARGET_IDENTITY_MISMATCH', 'df returned an unexpected record count', {
      recordCount: lines.length,
    });
  }
  const fields = lines[1].split(/\s+/u);
  if (fields.length < 6
      || !/^\d+$/u.test(fields[1])
      || !/^\d+$/u.test(fields[2])
      || !/^\d+$/u.test(fields[3])
      || !/^\d+%$/u.test(fields[4])) {
    fail('INTERNAL_TARGET_IDENTITY_MISMATCH', 'df returned a malformed mount record');
  }
  return Object.freeze({
    sourceDevice: fields[0],
    mountPoint: fields.slice(5).join(' '),
  });
}

function inspectTargetIdentitySystem(target) {
  const exact = exactDirectory(target, 'canonical backend target');
  let mounted;
  try {
    const dfRecord = parseRecoveryDfMountRecord(command('/bin/df', ['-P', exact.path]));
    const info = plistJson(command('/usr/sbin/diskutil', [
      'info',
      '-plist',
      dfRecord.mountPoint,
    ]));
    mounted = normalizeDiskutilMountInfo(info, dfRecord, exact.path, exact.stat.dev);
  } catch (error) {
    fail(
      'INTERNAL_TARGET_IDENTITY_MISMATCH',
      'canonical backend target mount evidence could not be established',
      { cause: error?.message ?? String(error), causeCode: error?.code ?? null },
    );
  }
  return normalizeRecoveryTargetIdentity(exact.path, exact.stat.dev, mounted);
}

function copyTreeSystem(source, destination) {
  command('/usr/bin/ditto', [
    '--rsrc',
    '--extattr',
    '--acl',
    '--noqtn',
    '--nocache',
    source,
    destination,
  ], { timeout: 12 * 60 * 60 * 1000 });
}

function swapHelperBinarySystem(binRoot = path.join(RECEIPT_ROOT, 'bin')) {
  // Read source bytes ONCE, pin-check the bytes, then write them to a private 0400
  // snapshot (O_NOFOLLOW|O_EXCL) + fsync, and compile the SNAPSHOT - not the live source.
  // This closes the source TOCTOU (hash-then-compile-live-path would let a tamper land
  // between the pin check and clang). Mirrors the operation-lock compileFreshC discipline;
  // when the lock module freezes this is superseded by the shared compileFreshC.
  const source = exactFile(SWAP_HELPER_SOURCE_PATH, 'atomic swap helper source');
  const sourceBytes = fs.readFileSync(source.path);
  const sourceDigest = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  if (sourceDigest !== SWAP_HELPER_SOURCE_SHA256) {
    fail('SWAP_HELPER_SOURCE_PIN_MISMATCH', 'atomic swap helper source does not match the trusted canonical pin', {
      expected: SWAP_HELPER_SOURCE_SHA256,
      actual: sourceDigest,
    });
  }
  normalizeAbsolute(binRoot, 'swap helper binary root');
  fs.mkdirSync(binRoot, { recursive: true, mode: 0o700 });
  // Fresh private build root per call; no content-hash cache. A cached/reused binary is
  // never accepted on path/mode alone.
  const buildRoot = fs.mkdtempSync(path.join(binRoot, 'backend-data-swap-build-'));
  fs.chmodSync(buildRoot, 0o700);
  const snapshotPath = path.join(buildRoot, 'backend-data-swap.source.c');
  const snapshotFd = fs.openSync(
    snapshotPath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    0o400,
  );
  try {
    fs.writeFileSync(snapshotFd, sourceBytes);
    fs.fsyncSync(snapshotFd);
  } finally {
    fs.closeSync(snapshotFd);
  }
  // Compile the pinned snapshot, never the live source path.
  const temporary = path.join(buildRoot, 'backend-data-swap');
  command('/usr/bin/clang', [
    '-std=c11',
    '-Os',
    '-Wall',
    '-Wextra',
    '-Werror',
    snapshotPath,
    '-o', temporary,
  ], { timeout: 5 * 60 * 1000 });
  fs.chmodSync(temporary, 0o500);
  const binaryFd = fs.openSync(temporary, 'r');
  try { fs.fsyncSync(binaryFd); } finally { fs.closeSync(binaryFd); }
  fsyncDirectory(buildRoot);
  fsyncDirectory(binRoot);
  const exact = exactFile(temporary, 'compiled atomic swap helper');
  if (exact.stat.uid !== process.getuid() || (exact.stat.mode & 0o777) !== 0o500) {
    fail('SWAP_HELPER_IDENTITY_MISMATCH', 'compiled atomic swap helper owner or mode is not accepted');
  }
  // Defense-in-depth: re-hash the snapshot after compile to confirm clang read exactly
  // the pinned bytes (0400 + O_EXCL prevented overwrite, but attest rather than assume).
  const snapshotAttest = crypto.createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
  if (snapshotAttest !== SWAP_HELPER_SOURCE_SHA256) {
    fail('SWAP_HELPER_SNAPSHOT_DRIFT', 'private source snapshot digest changed after compile (tamper or race)');
  }
  return Object.freeze({
    path: exact.path,
    device: exact.stat.dev,
    inode: exact.stat.ino,
    uid: exact.stat.uid,
    mode: exact.stat.mode & 0o777,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(exact.path)).digest('hex'),
    sourceSha256: sourceDigest,
    snapshotPath,
    snapshotSha256: snapshotAttest,
  });
}

/* Re-attest a compiled swap helper immediately before each invocation: re-verify the
 * binary's owner/mode/dev/ino + SHA-256 against the identity recorded at compile time.
 * API-independent (the operation-lock verifyCompiledHelper will supersede this when the
 * lock module freezes). Catches a tamper/race that swaps the binary between compile and
 * spawn. The helper identity is tracked with Number stats (consistent compile<->re-attest);
 * only the C-CLI dev/ino handoff needs BigInt precision (see exactDirectoryIdentity64). */
function reattestSwapHelper(helper, trace = null, action = null, phase = null) {
  if (!helper || !helper.path) fail('SWAP_HELPER_INVALID', 'swap helper identity is missing for re-attestation');
  const exact = exactFile(helper.path, 'compiled atomic swap helper (re-attest)');
  if (exact.stat.uid !== helper.uid
      || (exact.stat.mode & 0o777) !== helper.mode
      || exact.stat.dev !== helper.device
      || exact.stat.ino !== helper.inode) {
    fail('SWAP_HELPER_IDENTITY_CHANGED', 'swap helper owner/mode/dev/ino changed since compile (tamper or race)');
  }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(exact.path)).digest('hex');
  if (digest !== helper.sha256) {
    fail('SWAP_HELPER_DIGEST_CHANGED', 'swap helper binary digest changed since compile (tamper or race)');
  }
  trace?.(Object.freeze({ event: 'helper-reattested', action, phase, helperPath: helper.path }));
}

/* Derive exact (dev, ino) for the descriptor-relative C CLI via BigInt stats, then
 * stringify. Default Number stats silently round APFS 64-bit inodes above 2^53; the C
 * helper parses exact 64-bit via strtoull + fstat, so a rounded JS value would mismatch
 * (or collide). Rejects symlinks/non-dirs; the C walk re-verifies each component via
 * openat(O_NOFOLLOW), so a symlinked path is rejected at the JS seam AND in the helper. */
function exactDirectoryIdentity64(target, label) {
  let stat;
  try {
    stat = fs.lstatSync(target, { bigint: true });
  } catch (error) {
    fail('PATH_UNAVAILABLE', `${label} is unavailable`, { path: target, cause: error.code || error.message });
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('PATH_IDENTITY_MISMATCH', `${label} must be an exact directory (no symlink) for descriptor-relative swap`, { path: target });
  }
  return { dev: stat.dev.toString(), ino: stat.ino.toString() };
}

function swapTreesSystem(left, right, helper, trace = null) {
  // G4: descriptor-relative swap via the authenticated helper. REQUIRE an authenticated
  // helper supplied by the caller (restoreRecovery compiles it before the post-stage
  // capacity sample so the build allocation is accounted for). Re-attest immediately
  // before the spawn, then pass exact BigInt (dev,ino) for both sides so the C helper's
  // identity pin is sound against APFS 64-bit inodes. No fallback compile.
  if (!helper || !helper.path) {
    fail('SWAP_HELPER_REQUIRED', 'an authenticated swap helper must be supplied (compiled before the post-stage capacity sample)');
  }
  reattestSwapHelper(helper, trace, 'swap', 'pre');
  const leftId = exactDirectoryIdentity64(left, 'swap left directory');
  const rightId = exactDirectoryIdentity64(right, 'swap right directory');
  const helperArgs = [
    'swap', left, right,
    leftId.dev, leftId.ino, rightId.dev, rightId.ino,
  ];
  trace?.(Object.freeze({ event: 'helper-invoke', action: 'swap', args: Object.freeze([...helperArgs]) }));
  let spawnError = null;
  try {
    command(helper.path, helperArgs, { timeout: 5 * 60 * 1000 });
  } catch (error) {
    spawnError = error;
  } finally {
    // Post-spawn attestation runs even if the swap failed (before+after requirement).
    // A binary change during the operation is tamper/race and trumps the spawn error as
    // the surfaced failure; the spawn error is preserved in the details for evidence.
    try {
      reattestSwapHelper(helper, trace, 'swap', 'post');
    } catch (attestError) {
      fail(attestError.code || 'SWAP_HELPER_POST_ATTEST_FAILED', attestError.message, {
        ...attestError.details,
        spawnError: spawnError ? spawnError.message : null,
      });
    }
  }
  if (spawnError) throw spawnError;
}

function fullSyncTreeSystem(stagingRoot, helper, trace = null) {
  if (!helper || !helper.path) {
    fail('FULL_SYNC_HELPER_INVALID', 'full-sync helper identity is missing');
  }
  // G4: recursive F_FULLFSYNC (files) + fsync (dirs deepest-first) via the helper's
  // full-sync subcommand, re-attested before spawn, with exact BigInt (dev,ino) for the
  // root. Must run before prepared/swap so the staged tree is durable before promotion.
  reattestSwapHelper(helper, trace, 'full-sync', 'pre');
  const rootId = exactDirectoryIdentity64(stagingRoot, 'full-sync root directory');
  const helperArgs = ['full-sync', stagingRoot, rootId.dev, rootId.ino];
  trace?.(Object.freeze({ event: 'helper-invoke', action: 'full-sync', args: Object.freeze([...helperArgs]) }));
  let spawnError = null;
  try {
    command(helper.path, helperArgs, { timeout: 5 * 60 * 1000 });
  } catch (error) {
    spawnError = error;
  } finally {
    // Post-spawn attestation runs even if full-sync failed (before+after requirement).
    try {
      reattestSwapHelper(helper, trace, 'full-sync', 'post');
    } catch (attestError) {
      fail(attestError.code || 'SWAP_HELPER_POST_ATTEST_FAILED', attestError.message, {
        ...attestError.details,
        spawnError: spawnError ? spawnError.message : null,
      });
    }
  }
  if (spawnError) throw spawnError;
}

function listOpenFilesSystem(target) {
  const result = spawnRecoveryProcess('/usr/sbin/lsof', ['+D', target], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || ![0, 1].includes(result.status)) {
    fail('WRITER_INSPECTION_FAILED', 'lsof could not establish writer quiescence', {
      status: result.status,
      stderr: result.stderr?.trim() || '',
      cause: result.error?.message || null,
    });
  }
  if (result.status === 1 && !result.stdout.trim() && !result.stderr.trim()) return [];
  if (result.status === 1 && !result.stdout.trim()) {
    fail('WRITER_INSPECTION_FAILED', 'lsof reported an error while establishing writer quiescence', {
      stderr: result.stderr.trim(),
    });
  }
  return result.stdout.trim().split(/\r?\n/u).filter(Boolean);
}

export function createSystemAdapters(overrides = {}) {
  return {
    now: () => new Date(),
    acquireOperationLock: acquireBackendOperationLock,
    validateOperationAcquisition: validateBackendOperationAcquisitionAttestation,
    validateOperationRelease: validateBackendOperationReleaseEvidence,
    inspectSourceIdentity: inspectSourceIdentitySystem,
    inspectTargetIdentity: inspectTargetIdentitySystem,
    copyTree: copyTreeSystem,
    swapTrees: swapTreesSystem,
    listOpenFiles: listOpenFilesSystem,
    sampleFilesystem: (targetRoot) => fs.statfsSync(targetRoot),
    compileSwapHelper: () => swapHelperBinarySystem(),
    fullSyncTree: fullSyncTreeSystem,
    afterOldTargetRenamed: () => {},
    ...overrides,
  };
}

async function hashFile(filePath) {
  const digest = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 });
  for await (const chunk of stream) digest.update(chunk);
  return digest.digest('hex');
}

function relativeUnix(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function extendedMetadata(absolute) {
  const namesOutput = command('/usr/bin/xattr', [absolute], { timeout: 30_000 });
  const names = namesOutput.split(/\r?\n/u)
    .map((name) => name.trim())
    .filter((name) => name && name !== 'com.apple.quarantine')
    .sort((left, right) => left.localeCompare(right, 'en'));
  const xattrs = names.map((name) => ({
    name,
    hex: command('/usr/bin/xattr', ['-px', name, absolute], { timeout: 30_000 })
      .replaceAll(/\s+/gu, '')
      .toLowerCase(),
  }));
  const listing = command('/bin/ls', ['-lde', absolute], { timeout: 30_000 });
  const acl = listing.split(/\r?\n/u).slice(1).map((line) => line.trim()).filter(Boolean);
  return {
    xattrSha256: crypto.createHash('sha256').update(JSON.stringify(xattrs)).digest('hex'),
    aclSha256: crypto.createHash('sha256').update(JSON.stringify(acl)).digest('hex'),
  };
}

export async function enumerateTree(root, options = {}) {
  const exact = exactDirectory(root, 'tree root');
  const entries = [{
    path: '.',
    type: 'directory',
    mode: exact.stat.mode & 0o7777,
    uid: exact.stat.uid,
    gid: exact.stat.gid,
    ...extendedMetadata(exact.path),
  }];
  let fileCount = 0;
  let byteCount = 0;

  async function walk(directory) {
    const names = fs.readdirSync(directory).sort((left, right) => left.localeCompare(right, 'en'));
    for (const name of names) {
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      const relative = relativeUnix(exact.path, absolute);
      if (stat.isSymbolicLink()) fail('SOURCE_SYMLINK_REFUSED', 'recovery trees must not contain symlinks', { relative });
      if (stat.isDirectory()) {
        entries.push({
          path: relative,
          type: 'directory',
          mode: stat.mode & 0o7777,
          uid: stat.uid,
          gid: stat.gid,
          ...extendedMetadata(absolute),
        });
        await walk(absolute);
        continue;
      }
      if (!stat.isFile()) fail('SOURCE_SPECIAL_FILE_REFUSED', 'recovery trees must contain only directories and regular files', { relative });
      options.progress?.({ event: 'hash-start', path: relative, bytes: stat.size });
      const sha256 = await hashFile(absolute);
      options.progress?.({ event: 'hash-done', path: relative, bytes: stat.size, sha256 });
      entries.push({
        path: relative,
        type: 'file',
        bytes: stat.size,
        sha256,
        mode: stat.mode & 0o7777,
        uid: stat.uid,
        gid: stat.gid,
        ...extendedMetadata(absolute),
      });
      fileCount += 1;
      byteCount += stat.size;
    }
  }

  await walk(exact.path);
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const treeDigest = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  return Object.freeze({
    root: exact.path,
    itemCount: entries.length,
    fileCount,
    byteCount,
    treeDigest,
    entries,
  });
}

function activeDatabaseEntries(tree) {
  return tree.entries.filter((entry) => entry.type === 'file'
    && /\.(?:db|sqlite|sqlite3)$/iu.test(entry.path)
    && !/(?:corrupt|quarantine|broken)/iu.test(entry.path));
}

function sqliteScalar(databasePath, sql, label) {
  const result = spawnRecoveryProcess(SQLITE_BIN, [
    '-readonly',
    '-batch',
    '-noheader',
    '-cmd', '.timeout 5000',
    databasePath,
    sql,
  ], {
    encoding: 'utf8',
    maxBuffer: MAX_COMMAND_BUFFER,
    timeout: 12 * 60 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      value: 'unavailable',
      error: result.error?.message || result.stderr.trim() || `${label} exit ${result.status}`,
    };
  }
  return { ok: true, value: result.stdout.trim(), error: null };
}

export function verifyDatabases(treeRoot, tree, options = {}) {
  const checks = [];
  for (const entry of activeDatabaseEntries(tree)) {
    const absolute = path.join(treeRoot, ...entry.path.split('/'));
    const integrity = sqliteScalar(absolute, 'PRAGMA integrity_check;', 'integrity_check');
    const quick = sqliteScalar(absolute, 'PRAGMA quick_check;', 'quick_check');
    const foreign = sqliteScalar(
      absolute,
      'SELECT count(*) FROM pragma_foreign_key_check;',
      'foreign_key_check',
    );
    const version = sqliteScalar(absolute, 'PRAGMA user_version;', 'user_version');
    const foreignCount = /^\d+$/u.test(foreign.value) ? Number(foreign.value) : -1;
    const schemaVersion = /^\d+$/u.test(version.value) ? Number(version.value) : -1;
    const expectedSchemaVersion = path.basename(entry.path) === 'yuri.db'
      ? Number(options.yuriSchemaVersion ?? 1)
      : null;
    const ok = integrity.ok
      && integrity.value === 'ok'
      && quick.ok
      && quick.value === 'ok'
      && foreign.ok
      && foreignCount === 0
      && version.ok
      && (expectedSchemaVersion === null || schemaVersion === expectedSchemaVersion);
    checks.push({
      path: entry.path,
      integrityCheck: integrity.value,
      quickCheck: quick.value,
      foreignKeyViolations: foreignCount,
      schemaVersion,
      expectedSchemaVersion,
      ok,
      errors: [integrity.error, quick.error, foreign.error, version.error].filter(Boolean),
    });
  }
  const requiredRootDatabase = checks.some((check) => check.path === 'yuri.db');
  return Object.freeze({
    count: checks.length,
    requiredRootDatabase,
    ok: requiredRootDatabase && checks.every((check) => check.ok),
    checks,
  });
}

export function capacityEvidence(payloadBytes, targetRoot = REPO_ROOT) {
  const stat = fs.statfsSync(targetRoot);
  const blockSize = BigInt(stat.bsize);
  const volumeBytes = BigInt(stat.blocks) * blockSize;
  const freeBytes = BigInt(stat.bavail) * blockSize;
  const payload = BigInt(payloadBytes);
  const reserveBytes = [volumeBytes / 10n, 2n * payload + 10n * GIB].sort((a, b) => (a < b ? -1 : 1))[1];
  const requiredStartFreeBytes = reserveBytes + payload;
  return Object.freeze({
    volumeBytes: volumeBytes.toString(),
    freeBytes: freeBytes.toString(),
    payloadBytes: payload.toString(),
    reserveBytes: reserveBytes.toString(),
    requiredStartFreeBytes: requiredStartFreeBytes.toString(),
    projectedPostRestoreFreeBytes: (freeBytes - payload).toString(),
    ok: freeBytes >= requiredStartFreeBytes,
  });
}

function assertCapacityEvidence(capacity, payloadBytes) {
  const keys = [
    'volumeBytes',
    'freeBytes',
    'payloadBytes',
    'reserveBytes',
    'requiredStartFreeBytes',
    'projectedPostRestoreFreeBytes',
  ];
  if (!capacity || typeof capacity !== 'object' || Array.isArray(capacity)
      || keys.some((key) => typeof capacity[key] !== 'string' || !/^-?\d+$/u.test(capacity[key]))) {
    fail('CAPACITY_EVIDENCE_INVALID', 'internal capacity evidence is malformed');
  }
  const values = Object.fromEntries(keys.map((key) => [key, BigInt(capacity[key])]));
  if (values.payloadBytes !== BigInt(payloadBytes)
      || values.volumeBytes <= 0n
      || values.freeBytes < 0n
      || values.reserveBytes < 0n
      || values.requiredStartFreeBytes !== values.reserveBytes + values.payloadBytes
      || values.projectedPostRestoreFreeBytes !== values.freeBytes - values.payloadBytes
      || capacity.ok !== (values.freeBytes >= values.requiredStartFreeBytes)) {
    fail('CAPACITY_EVIDENCE_INVALID', 'internal capacity evidence is internally inconsistent');
  }
  return capacity;
}

export function capacityEvidencePostStage(payloadBytes, stat) {
  if (!stat || typeof stat !== 'object') {
    fail('CAPACITY_EVIDENCE_INVALID', 'post-stage statfs sample is missing');
  }
  const blockSize = BigInt(stat.bsize);
  const volumeBytes = BigInt(stat.blocks) * blockSize;
  const freeBytes = BigInt(stat.bavail) * blockSize;
  const payload = BigInt(payloadBytes);
  // Reserve keeps its deliberate extra margin: max(volumeBytes/10, 2*payload + 10 GiB).
  // Post-stage required free is RESERVE ONLY: the payload is already on disk as the staged
  // tree, and the atomic RENAME_SWAP plus the quarantine rename are space-neutral. Reusing
  // the pre-stage `reserve + payload` threshold here would subtract the payload twice without
  // cause. This is the explicit stage-aware second threshold.
  const reserveBytes = [volumeBytes / 10n, 2n * payload + 10n * GIB].sort((a, b) => (a < b ? -1 : 1))[1];
  const requiredPostStageFreeBytes = reserveBytes;
  return Object.freeze({
    phase: 'post-stage',
    volumeBytes: volumeBytes.toString(),
    freeBytes: freeBytes.toString(),
    payloadBytes: payload.toString(),
    reserveBytes: reserveBytes.toString(),
    requiredPostStageFreeBytes: requiredPostStageFreeBytes.toString(),
    ok: freeBytes >= requiredPostStageFreeBytes,
  });
}

function assertCapacityEvidencePostStage(capacity, payloadBytes) {
  const keys = [
    'volumeBytes',
    'freeBytes',
    'payloadBytes',
    'reserveBytes',
    'requiredPostStageFreeBytes',
  ];
  if (!capacity || typeof capacity !== 'object' || Array.isArray(capacity)
      || typeof capacity.phase !== 'string' || capacity.phase !== 'post-stage'
      || keys.some((key) => typeof capacity[key] !== 'string' || !/^-?\d+$/u.test(capacity[key]))) {
    fail('CAPACITY_EVIDENCE_INVALID', 'post-stage capacity evidence is malformed');
  }
  const values = Object.fromEntries(keys.map((key) => [key, BigInt(capacity[key])]));
  if (values.payloadBytes !== BigInt(payloadBytes)
      || values.volumeBytes <= 0n
      || values.freeBytes < 0n
      || values.reserveBytes < 0n
      || values.requiredPostStageFreeBytes !== values.reserveBytes
      || capacity.ok !== (values.freeBytes >= values.requiredPostStageFreeBytes)) {
    fail('CAPACITY_EVIDENCE_INVALID', 'post-stage capacity evidence is internally inconsistent');
  }
  return capacity;
}

function expectedSourceRecord(value = EXPECTED_SOURCE) {
  for (const key of ['itemCount', 'fileCount', 'byteCount']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail('EXPECTED_SOURCE_INVALID', `${key} is invalid`);
  }
  return Object.freeze({ ...value });
}

function assertExpectedTree(tree, expected) {
  const mismatches = [];
  for (const key of ['itemCount', 'fileCount', 'byteCount']) {
    if (tree[key] !== expected[key]) mismatches.push({ key, actual: tree[key], expected: expected[key] });
  }
  if (mismatches.length) fail('SOURCE_PAYLOAD_MISMATCH', 'source payload does not match the pinned recovery receipt', { mismatches });
}

function validateManifestTree(tree) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree) || !Array.isArray(tree.entries)) {
    fail('MANIFEST_INVALID', 'manifest tree must be an object with entries');
  }
  const entries = tree.entries;
  const seen = new Set();
  let fileCount = 0;
  let byteCount = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('MANIFEST_INVALID', 'manifest tree entry must be an object', { index });
    }
    const relative = entry.path;
    if (typeof relative !== 'string'
        || (!relative || (relative !== '.' && (path.posix.isAbsolute(relative)
          || path.posix.normalize(relative) !== relative
          || relative.split('/').some((part) => !part || part === '.' || part === '..'))))) {
      fail('MANIFEST_INVALID', 'manifest tree entry path is not a normalized relative path', { index, relative });
    }
    if (seen.has(relative)) fail('MANIFEST_INVALID', 'manifest tree contains duplicate paths', { relative });
    seen.add(relative);
    if (index > 0 && entries[index - 1].path.localeCompare(relative, 'en') >= 0) {
      fail('MANIFEST_INVALID', 'manifest tree entries are not strictly sorted', { index, relative });
    }
    if (!Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777
        || !Number.isSafeInteger(entry.uid) || entry.uid < 0
        || !Number.isSafeInteger(entry.gid) || entry.gid < 0
        || !/^[0-9a-f]{64}$/u.test(entry.xattrSha256 || '')
        || !/^[0-9a-f]{64}$/u.test(entry.aclSha256 || '')) {
      fail('MANIFEST_INVALID', 'manifest tree metadata is invalid', { index, relative });
    }
    if (entry.type === 'directory') {
      if (relative === '.' && index !== 0) fail('MANIFEST_INVALID', 'manifest root directory must be first');
      continue;
    }
    if (entry.type !== 'file'
        || !Number.isSafeInteger(entry.bytes)
        || entry.bytes < 0
        || !/^[0-9a-f]{64}$/u.test(entry.sha256 || '')) {
      fail('MANIFEST_INVALID', 'manifest file entry is invalid', { index, relative });
    }
    fileCount += 1;
    byteCount += entry.bytes;
    if (!Number.isSafeInteger(byteCount)) fail('MANIFEST_INVALID', 'manifest byte aggregate exceeds safe integer range');
  }
  if (!entries.length || entries[0].path !== '.' || entries[0].type !== 'directory') {
    fail('MANIFEST_INVALID', 'manifest tree must include its root directory');
  }
  const treeDigest = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  if (tree.itemCount !== entries.length
      || tree.fileCount !== fileCount
      || tree.byteCount !== byteCount
      || tree.treeDigest !== treeDigest) {
    fail('MANIFEST_INVALID', 'manifest tree aggregates or digest do not match its entries');
  }
  return tree;
}

function fsyncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function writeJsonAtomic(destination, payload) {
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const bytes = `${JSON.stringify(payload, null, 2)}\n`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, destination);
  fs.chmodSync(destination, 0o600);
  fsyncDirectory(parent);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function timestampSlug(date) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function serializedJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size;
}

function readJsonArtifact(candidate, label, errorCode = 'RECOVERY_ARTIFACT_INVALID') {
  const absolute = normalizeAbsolute(candidate, label);
  let fd;
  try {
    const before = fs.lstatSync(absolute, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
        || fs.realpathSync.native(absolute) !== absolute) {
      fail(errorCode, `${label} must be an exact single-link regular file`, { path: absolute });
    }
    fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!sameFileIdentity(before, opened)) {
      fail(errorCode, `${label} changed while opening`, { path: absolute });
    }
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    const pathnameAfter = fs.lstatSync(absolute, { bigint: true });
    if (!sameFileIdentity(opened, after) || !sameFileIdentity(after, pathnameAfter)) {
      fail(errorCode, `${label} changed while reading`, { path: absolute });
    }
    let payload;
    try {
      payload = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      fail(errorCode, `${label} is not valid JSON`, { path: absolute, cause: error.message });
    }
    return Object.freeze({
      path: absolute,
      payload,
      bytes,
      sha256: sha256Bytes(bytes),
      device: after.dev.toString(),
      inode: after.ino.toString(),
      mode: Number(after.mode & 0o777n),
    });
  } catch (error) {
    if (error instanceof BackendDataRecoveryError) throw error;
    fail(errorCode, `${label} could not be read exactly`, {
      path: absolute,
      cause: error?.code || error?.message || String(error),
    });
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function writeJsonExclusiveDurable(destination, payload, existsCode = 'RECOVERY_PATH_EXISTS') {
  const absolute = normalizeAbsolute(destination, 'exclusive JSON destination');
  const parent = path.dirname(absolute);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(serializedJson(payload));
  let fd;
  try {
    fd = fs.openSync(
      absolute,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail(existsCode, 'exclusive recovery artifact already exists', { path: absolute });
    }
    throw error;
  }
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fsyncDirectory(parent);
  const exact = readJsonArtifact(absolute, 'exclusive recovery artifact');
  if (exact.sha256 !== sha256Bytes(bytes)) {
    fail('RECOVERY_ARTIFACT_DIGEST_MISMATCH', 'exclusive recovery artifact digest changed after creation', {
      path: absolute,
    });
  }
  return exact;
}

function writeAttestationReceiptDescriptorRelative(destination, payload, parent, parentIdentity64) {
  const bytes = Buffer.from(serializedJson(payload));
  const expectedSha256 = sha256Bytes(bytes);
  const result = spawnRecoveryProcess('/usr/bin/python3', [
    '-I',
    '-S',
    '-c',
    DESCRIPTOR_RELATIVE_RECEIPT_WRITER,
    destination,
    parentIdentity64.dev,
    parentIdentity64.ino,
    String(process.getuid()),
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    input: bytes,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: '/',
  });
  if (result.error || result.status !== 0) {
    fail('INTERNAL_VOLUME_ATTESTATION_WRITE_FAILED', 'descriptor-relative receipt writer failed closed', {
      status: result.status,
      stderr: result.stderr?.trim() || '',
      cause: result.error?.message || null,
    });
  }
  let evidence;
  try {
    evidence = JSON.parse(result.stdout);
  } catch (error) {
    fail('INTERNAL_VOLUME_ATTESTATION_WRITE_FAILED', 'descriptor-relative receipt writer returned invalid evidence', {
      cause: error.message,
    });
  }
  const expectedKeys = [
    'device',
    'inode',
    'mode',
    'nlink',
    'ok',
    'parentDevice',
    'parentInode',
    'sha256',
    'size',
    'uid',
  ];
  if (JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify(expectedKeys)
      || evidence.ok !== true
      || evidence.sha256 !== expectedSha256
      || evidence.device !== parentIdentity64.dev
      || evidence.parentDevice !== parentIdentity64.dev
      || evidence.parentInode !== parentIdentity64.ino
      || evidence.uid !== process.getuid()
      || evidence.mode !== 0o600
      || evidence.nlink !== 1
      || evidence.size !== bytes.length
      || !/^\d+$/u.test(evidence.inode || '')) {
    fail('INTERNAL_VOLUME_ATTESTATION_WRITE_FAILED', 'descriptor-relative receipt evidence is inconsistent');
  }

  const reboundParent = exactDirectory(parent.path, 'rebound recovery receipt root');
  const reboundParentIdentity64 = exactDirectoryIdentity64(reboundParent.path, 'rebound recovery receipt root');
  if (reboundParentIdentity64.dev !== parentIdentity64.dev
      || reboundParentIdentity64.ino !== parentIdentity64.ino) {
    fail('RECEIPT_ROOT_IDENTITY_MISMATCH', 'recovery receipt root changed after descriptor-relative creation');
  }
  const exact = readJsonArtifact(destination, 'internal APFS attestation receipt');
  if (exact.sha256 !== expectedSha256
      || exact.device !== evidence.device
      || exact.inode !== evidence.inode
      || exact.mode !== 0o600) {
    fail('INTERNAL_VOLUME_ATTESTATION_WRITE_FAILED', 'receipt pathname no longer binds to the written descriptor');
  }
  const reboundAfterRead = exactDirectory(parent.path, 'post-read recovery receipt root');
  const reboundAfterReadIdentity64 = exactDirectoryIdentity64(
    reboundAfterRead.path,
    'post-read recovery receipt root',
  );
  if (reboundAfterReadIdentity64.dev !== parentIdentity64.dev
      || reboundAfterReadIdentity64.ino !== parentIdentity64.ino) {
    fail('RECEIPT_ROOT_IDENTITY_MISMATCH', 'recovery receipt root changed during receipt verification');
  }
  return exact;
}

function writeTransaction(transactionPath, base, state, extra = {}) {
  return writeJsonAtomic(transactionPath, {
    ...base,
    state,
    updatedAt: extra.updatedAt ?? new Date().toISOString(),
    ...extra,
  });
}

function attestInternalApfsVolumeCore(options, executionToken) {
  requireExecutionToken(executionToken);
  if (options.ownerApproved !== true) {
    fail('OWNER_APPROVAL_REQUIRED', 'internal APFS attestation requires the explicit owner-approved gate');
  }
  const anchor = exactDirectory(options.anchorPath, 'internal APFS attestation anchor');
  const receiptRoot = exactDirectory(options.receiptRoot, 'recovery receipt root');
  const anchorIdentity64 = exactDirectoryIdentity64(anchor.path, 'internal APFS attestation anchor');
  const receiptRootIdentity64 = exactDirectoryIdentity64(receiptRoot.path, 'recovery receipt root');
  const receiptMode = receiptRoot.stat.mode & 0o7777;
  if (receiptRoot.stat.uid !== process.getuid() || (receiptMode & 0o077) !== 0) {
    fail('RECEIPT_ROOT_IDENTITY_MISMATCH', 'recovery receipt root must be uid-owned and private', {
      path: receiptRoot.path,
      uid: receiptRoot.stat.uid,
      mode: receiptMode,
    });
  }

  const identity = options.inspectIdentity(anchor.path);
  if (identity.inspectedPath !== anchor.path || String(identity.deviceId) !== String(anchor.stat.dev)) {
    fail('INTERNAL_TARGET_IDENTITY_MISMATCH', 'attested mount identity does not bind to the fixed non-protected anchor');
  }
  if (!sameUuid(identity.volumeUuid, INTERNAL_APFS_EXPECTED_VOLUME_UUID)
      || identity.filesystem !== 'apfs'
      || identity.internal !== true
      || identity.writable !== true
      || identity.readOnly !== false
      || identity.ownersEnabled !== true
      || identity.parseConflict !== false
      || identity.t7RequiredAtRuntime !== false) {
    fail('INTERNAL_TARGET_IDENTITY_MISMATCH', 'attested mount identity does not satisfy the pinned internal APFS policy');
  }
  if (receiptRootIdentity64.dev !== anchorIdentity64.dev) {
    fail('RECEIPT_ROOT_IDENTITY_MISMATCH', 'recovery receipt root is not on the attested internal APFS volume');
  }

  const generatedAt = options.now().toISOString();
  const payload = Object.freeze({
    schema: INTERNAL_VOLUME_ATTESTATION_SCHEMA,
    generatedAt,
    anchorPath: anchor.path,
    receiptRoot: receiptRoot.path,
    expectedVolumeUuid: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    observedVolumeUuid: identity.volumeUuid,
    identity,
    scope: Object.freeze({
      protectedBackendDataAccessed: false,
      claudeProjectsAccessed: false,
      t7Inspected: false,
      physicalT7ConnectedAtSummary: null,
      backendDataReadinessAttested: false,
    }),
    nextGate: 'inspectRecovery re-attests target identity and binds it to the protected-source manifest',
  });
  const receiptPath = path.join(
    receiptRoot.path,
    `internal-volume-attestation-${timestampSlug(new Date(generatedAt))}-${crypto.randomBytes(8).toString('hex')}.json`,
  );
  options.beforeReceiptWrite();
  const receipt = writeAttestationReceiptDescriptorRelative(
    receiptPath,
    payload,
    receiptRoot,
    receiptRootIdentity64,
  );
  return Object.freeze({
    ok: true,
    receiptPath: receipt.path,
    receiptSha256: receipt.sha256,
    payload,
  });
}

function createActiveRecoveryMarker({ receiptRoot, transactionId, manifest, target, acquisition, now }) {
  const markerPath = path.join(receiptRoot, path.basename(RECOVERY_LOCK_PATH));
  const payload = {
    schema: ACTIVE_MARKER_SCHEMA,
    state: 'active',
    startupBlocked: true,
    createdAt: now.toISOString(),
    transactionId,
    manifestPath: manifest.path,
    manifestSha256: manifest.sha256,
    canonicalTarget: target,
    operationLockPath: acquisition.lock.path,
    acquisition,
  };
  return writeJsonExclusiveDurable(markerPath, payload, 'RECOVERY_STATE_ACTIVE');
}

function assertMarkerIdentity(marker) {
  const exact = readJsonArtifact(marker.path, 'active recovery marker');
  if (exact.device !== marker.device || exact.inode !== marker.inode || exact.sha256 !== marker.sha256) {
    fail('RECOVERY_MARKER_IDENTITY_CHANGED', 'active recovery marker identity or digest changed', {
      path: marker.path,
    });
  }
  return exact;
}

function archiveActiveRecoveryMarker(marker, archivePath) {
  assertMarkerIdentity(marker);
  if (fs.existsSync(archivePath)) {
    fail('RECOVERY_MARKER_ARCHIVE_EXISTS', 'recovery marker archive already exists', { archivePath });
  }
  fs.renameSync(marker.path, archivePath);
  fsyncDirectory(path.dirname(marker.path));
  const archived = readJsonArtifact(archivePath, 'archived recovery marker');
  if (archived.device !== marker.device || archived.inode !== marker.inode
      || archived.sha256 !== marker.sha256) {
    fail('RECOVERY_MARKER_ARCHIVE_MISMATCH', 'archived marker is not the exact active marker', {
      archivePath,
    });
  }
  return archived;
}

function releaseExpectation(acquisition, purpose) {
  return {
    expectedPurpose: purpose,
    expectedNonce: acquisition.nonce,
    expectedAcquiredAt: acquisition.acquiredAt,
    expectedLockPath: acquisition.lock.path,
    expectedLockIdentity: acquisition.lock,
    expectedHelperEvidence: acquisition.helper,
    expectedSourcePath: acquisition.helper.source.path,
    expectedSourceSha256: acquisition.helper.expectedSourceSha256,
    expectedBinaryPath: acquisition.helper.binary.path,
    expectedBinarySha256: acquisition.helper.binary.sha256,
    expectedPid: acquisition.pid,
  };
}

function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function requireStateArtifact(receiptRoot, candidate, label, expectedSha256) {
  const absolute = normalizeAbsolute(candidate, label);
  if (!pathWithin(receiptRoot, absolute)) {
    fail('RECOVERY_STATE_CORRELATION_MISMATCH', `${label} escapes the recovery receipt root`, {
      path: absolute,
    });
  }
  const artifact = readJsonArtifact(absolute, label, 'RECOVERY_STATE_MALFORMED');
  if (artifact.sha256 !== expectedSha256) {
    fail('RECOVERY_STATE_CORRELATION_MISMATCH', `${label} digest does not match its transaction binding`, {
      path: absolute,
      expected: expectedSha256,
      actual: artifact.sha256,
    });
  }
  return artifact;
}

/**
 * Synchronous read-only writer barrier. The caller must hold the canonical
 * backend operation lease while invoking it. Absence of the active marker is
 * necessary but not sufficient: every durable restore transaction must have a
 * fully correlated Phase-B closure, clean native release evidence, and the
 * exact archived active marker.
 */
function lstatStateOrAbsent(candidate, label) {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail('RECOVERY_STATE_UNAVAILABLE', `${label} could not be inspected`, {
      path: candidate,
      cause: error?.code || error?.message || String(error),
    });
  }
}

function markerNotProvenAbsent(candidate) {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    return error?.code !== 'ENOENT';
  }
}

function assertRecoveryStateAllowsWriterCore({ receiptRoot, markerPath, validateRelease }) {
  normalizeAbsolute(receiptRoot, 'recovery receipt root');
  normalizeAbsolute(markerPath, 'active recovery marker path');
  if (!pathWithin(receiptRoot, markerPath)) {
    fail('RECOVERY_STATE_UNAVAILABLE', 'active recovery marker path escapes the receipt root');
  }
  // lstat, not existsSync: only ENOENT is absence. A dangling symlink is an
  // entry and therefore active; EACCES/EIO/other lookup failures are an
  // unavailable barrier state and must block writer startup.
  const markerEntry = lstatStateOrAbsent(markerPath, 'active recovery marker');
  if (markerEntry !== null) {
    fail('RECOVERY_STATE_ACTIVE', 'an active or interrupted backend recovery marker blocks writer startup', {
      markerPath,
    });
  }
  const rootEntry = lstatStateOrAbsent(receiptRoot, 'recovery receipt root');
  if (rootEntry === null) {
    return Object.freeze({ ok: true, markerAbsent: true, transactionsChecked: 0, finalClosuresChecked: 0 });
  }
  try {
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()
        || fs.realpathSync.native(receiptRoot) !== receiptRoot) {
      fail('RECOVERY_STATE_UNAVAILABLE', 'recovery receipt root is not an exact directory');
    }
  } catch (error) {
    if (error instanceof BackendDataRecoveryError) throw error;
    fail('RECOVERY_STATE_UNAVAILABLE', 'recovery receipt root could not be inspected', {
      cause: error?.code || error?.message || String(error),
    });
  }
  let transactionNames;
  try {
    transactionNames = fs.readdirSync(receiptRoot)
      .filter((name) => /^backend-data-transaction-[a-z0-9-]+\.json$/u.test(name))
      .sort((left, right) => left.localeCompare(right, 'en'));
  } catch (error) {
    fail('RECOVERY_STATE_UNAVAILABLE', 'recovery receipt root could not be enumerated', {
      cause: error?.code || error?.message || String(error),
    });
  }
  let finalClosuresChecked = 0;
  for (const name of transactionNames) {
    const transaction = readJsonArtifact(
      path.join(receiptRoot, name),
      'backend recovery transaction',
      'RECOVERY_STATE_MALFORMED',
    ).payload;
    if (transaction?.schema !== TRANSACTION_SCHEMA
        || transaction.state !== 'final'
        || transaction.finalized !== true
        || typeof transaction.transactionId !== 'string'
        || typeof transaction.finalClosurePath !== 'string'
        || !/^[a-f0-9]{64}$/u.test(transaction.finalClosureSha256 ?? '')) {
      fail('RECOVERY_STATE_INCOMPLETE', 'backend recovery transaction lacks a complete Phase-B closure', {
        transactionPath: path.join(receiptRoot, name),
        state: transaction?.state ?? null,
      });
    }
    const closureArtifact = requireStateArtifact(
      receiptRoot,
      transaction.finalClosurePath,
      'backend recovery Phase-B closure',
      transaction.finalClosureSha256,
    );
    const closure = closureArtifact.payload;
    if (closure?.schema !== RESTORE_FINAL_SCHEMA
        || closure.complete !== true
        || closure.transactionId !== transaction.transactionId
        || closure.manifestSha256 !== transaction.manifestSha256
        || !['complete', 'failed-safe', 'rolled-back'].includes(closure.outcome)
        || closure.outcome !== transaction.outcome
        || !closure.markerArchive
        || typeof closure.markerArchive.path !== 'string'
        || !/^[a-f0-9]{64}$/u.test(closure.markerArchive.sha256 ?? '')
        || !/^\d+$/u.test(closure.markerArchive.device ?? '')
        || !/^\d+$/u.test(closure.markerArchive.inode ?? '')
        || !closure.releaseEvidence
        || !/^[a-f0-9]{64}$/u.test(closure.acquisitionAttestationSha256 ?? '')) {
      fail('RECOVERY_STATE_CORRELATION_MISMATCH', 'Phase-B closure is not transaction-bound');
    }
    const markerArchive = requireStateArtifact(
      receiptRoot,
      closure.markerArchive.path,
      'archived active recovery marker',
      closure.markerArchive.sha256,
    );
    if (markerArchive.payload?.schema !== ACTIVE_MARKER_SCHEMA
        || markerArchive.payload.state !== 'active'
        || markerArchive.payload.startupBlocked !== true
        || markerArchive.payload.transactionId !== transaction.transactionId
        || markerArchive.payload.manifestSha256 !== transaction.manifestSha256
        || markerArchive.device !== closure.markerArchive.device
        || markerArchive.inode !== closure.markerArchive.inode) {
      fail('RECOVERY_STATE_CORRELATION_MISMATCH', 'archived marker is not exactly transaction-bound');
    }
    const acquisition = markerArchive.payload.acquisition;
    if (acquisition?.attestationSha256 !== closure.acquisitionAttestationSha256) {
      fail('RECOVERY_STATE_CORRELATION_MISMATCH', 'Phase-B closure is not acquisition-bound');
    }
    try {
      validateRelease(closure.releaseEvidence, releaseExpectation(acquisition, 'restore'));
    } catch (error) {
      fail('RECOVERY_STATE_CORRELATION_MISMATCH', 'Phase-B native release evidence is invalid', {
        cause: error?.code || error?.message,
      });
    }
    if (closure.outcome === 'complete') {
      if (!closure.phaseA
          || typeof closure.phaseA.path !== 'string'
          || !/^[a-f0-9]{64}$/u.test(closure.phaseA.sha256 ?? '')) {
        fail('RECOVERY_STATE_CORRELATION_MISMATCH', 'successful Phase-B closure lacks its Phase-A binding');
      }
      const phaseA = requireStateArtifact(
        receiptRoot,
        closure.phaseA.path,
        'backend recovery Phase-A receipt',
        closure.phaseA.sha256,
      );
      if (phaseA.payload?.schema !== RESTORE_PHASE_A_SCHEMA
          || phaseA.payload.sealed !== true
          || phaseA.payload.final !== false
          || phaseA.payload.transactionId !== transaction.transactionId
          || phaseA.payload.manifestSha256 !== transaction.manifestSha256) {
        fail('RECOVERY_STATE_CORRELATION_MISMATCH', 'Phase-A receipt is not exactly transaction-bound');
      }
    } else if (closure.phaseA !== null) {
      fail('RECOVERY_STATE_CORRELATION_MISMATCH', 'safe failure closure unexpectedly binds a Phase-A success receipt');
    }
    finalClosuresChecked += 1;
  }
  return Object.freeze({
    ok: true,
    markerAbsent: true,
    transactionsChecked: transactionNames.length,
    finalClosuresChecked,
  });
}

export function assertRecoveryStateAllowsWriter(...args) {
  if (args.length !== 0) {
    fail('PRODUCTION_OVERRIDE_REFUSED', 'production writer barrier is zero-argument and canonical');
  }
  return assertRecoveryStateAllowsWriterCore({
    receiptRoot: RECEIPT_ROOT,
    markerPath: RECOVERY_LOCK_PATH,
    validateRelease: validateBackendOperationReleaseEvidence,
  });
}

async function inspectRecoveryCore(options, executionToken) {
  requireExecutionToken(executionToken);
  if (options.ownerApproved !== true) {
    fail('OWNER_APPROVAL_REQUIRED', 'inspection requires the explicit owner-approved gate');
  }
  const adapters = options.adapters;
  const sourceRepo = normalizeAbsolute(options.sourceRepo, 'sourceRepo');
  const expected = expectedSourceRecord(options.expected);
  const sourceIdentity = adapters.inspectSourceIdentity(sourceRepo);
  const sourceData = path.join(sourceRepo, '_SYSTEM/backend/data');
  exactDirectory(sourceData, 'protected backup data source');
  const tree = await enumerateTree(sourceData, { progress: options.progress });
  assertExpectedTree(tree, expected);
  const databases = verifyDatabases(sourceData, tree, options);
  if (!databases.ok) fail('SOURCE_DATABASE_INVALID', 'one or more active source databases failed verification', { databases });
  const capacity = assertCapacityEvidence(
    options.capacity ?? capacityEvidence(tree.byteCount, options.capacityRoot),
    tree.byteCount,
  );
  if (!capacity.ok) fail('INSUFFICIENT_INTERNAL_CAPACITY', 'internal APFS capacity does not meet the recovery reserve');

  const generatedAt = adapters.now().toISOString();
  const target = exactDirectory(options.canonicalTarget, 'canonical backend target');
  const targetParent = exactDirectory(path.dirname(target.path), 'canonical backend parent');
  if (target.stat.dev !== targetParent.stat.dev) {
    fail('CANONICAL_TARGET_IS_MOUNTED', 'canonical backend target must be on the internal parent filesystem');
  }
  const targetIdentity = adapters.inspectTargetIdentity(target.path);
  const payload = {
    schema: MANIFEST_SCHEMA,
    generatedAt,
    sourceIdentity,
    sourceData,
    expected,
    tree,
    databases,
    capacity,
    canonicalTarget: target.path,
    canonicalTargetMetadata: {
      device: target.stat.dev,
      inode: target.stat.ino,
      mode: target.stat.mode & 0o7777,
      uid: target.stat.uid,
      gid: target.stat.gid,
    },
    targetIdentity,
    policy: {
      sourceReadOnly: true,
      internalTargetRequired: true,
      sourceRemovalForbidden: true,
      deleteFlagsForbidden: true,
      oldTargetQuarantineRequired: true,
      claudeProjectsAccessed: false,
      retiredRuntimeImageObservedDetachedAtInspection: true,
      runtimeStorageMode: 'internal-apfs',
      recoverySourceDriveRequiredAfterClosure: false,
    },
  };
  const receiptRoot = normalizeAbsolute(options.receiptRoot, 'recovery receipt root');
  const manifestPath = path.join(receiptRoot, `internal-inspect-${timestampSlug(adapters.now())}.json`);
  const manifestSha256 = writeJsonAtomic(manifestPath, payload);
  return Object.freeze({ ok: true, manifestPath, manifestSha256, payload });
}

function loadManifest(receiptRoot, manifestPath, expectedSha256) {
  const absolute = normalizeAbsolute(manifestPath, 'recovery manifest');
  if (!pathWithin(receiptRoot, absolute)) {
    fail('MANIFEST_PATH_REFUSED', 'recovery manifest must be an exact artifact inside the recovery receipt root', {
      receiptRoot,
      manifestPath: absolute,
    });
  }
  // The lexical root constraint is evaluated before any pathname access. The
  // artifact reader then performs lstat -> O_NOFOLLOW open -> fstat -> read ->
  // fstat/lstat identity checks, so an operator-reviewed manifest cannot be
  // redirected into the protected source or live target before the lease.
  const exact = readJsonArtifact(absolute, 'recovery manifest', 'MANIFEST_INVALID');
  const bytes = exact.bytes;
  const sha256 = exact.sha256;
  if (!/^[0-9a-f]{64}$/iu.test(expectedSha256 || '') || sha256 !== expectedSha256.toLowerCase()) {
    fail('MANIFEST_DIGEST_MISMATCH', 'recovery manifest digest does not match the operator-reviewed pin', { actual: sha256 });
  }
  const parsed = exact.payload;
  if (parsed.schema !== MANIFEST_SCHEMA
      || !parsed.sourceIdentity
      || !parsed.targetIdentity
      || !parsed.canonicalTargetMetadata
      || !parsed.tree
      || !Array.isArray(parsed.tree.entries)
      || typeof parsed.sourceData !== 'string'
      || typeof parsed.canonicalTarget !== 'string') {
    fail('MANIFEST_INVALID', 'recovery manifest schema or required fields are not accepted');
  }
  normalizeAbsolute(parsed.sourceData, 'manifest source data');
  normalizeAbsolute(parsed.canonicalTarget, 'manifest canonical target');
  validateManifestTree(parsed.tree);
  const manifestExpected = expectedSourceRecord(parsed.expected);
  assertExpectedTree(parsed.tree, manifestExpected);
  if (parsed.policy?.sourceReadOnly !== true
      || parsed.policy?.internalTargetRequired !== true
      || parsed.policy?.sourceRemovalForbidden !== true
      || parsed.policy?.deleteFlagsForbidden !== true
      || parsed.policy?.oldTargetQuarantineRequired !== true
      || parsed.policy?.claudeProjectsAccessed !== false
      || parsed.policy?.retiredRuntimeImageObservedDetachedAtInspection !== true
      || parsed.policy?.runtimeStorageMode !== 'internal-apfs'
      || parsed.policy?.recoverySourceDriveRequiredAfterClosure !== false) {
    fail('MANIFEST_INVALID', 'manifest recovery policy is incomplete or unsafe');
  }
  return Object.freeze({ path: exact.path, sha256, parsed });
}

function compareTrees(expected, actual) {
  if (expected.itemCount !== actual.itemCount
      || expected.fileCount !== actual.fileCount
      || expected.byteCount !== actual.byteCount
      || expected.treeDigest !== actual.treeDigest) {
    fail('STAGING_TREE_MISMATCH', 'staged recovery tree does not match the pinned source manifest', {
      expectedDigest: expected.treeDigest,
      actualDigest: actual.treeDigest,
    });
  }
}

function identitiesMatch(expected, actual, keys) {
  return keys.every((key) => expected?.[key] === actual?.[key]);
}

function ensureQuiescent(target, adapters) {
  const openFiles = adapters.listOpenFiles(target);
  if (openFiles.length) {
    fail('BACKEND_WRITERS_ACTIVE', 'canonical backend target has open file handles', {
      boundedEvidence: openFiles.slice(0, 20),
    });
  }
}

function observeSwapOutcome(target, oldLocation, expectedOldTargetIdentity, expectedStagedIdentity) {
  // C1: observe the ACTUAL post-failure state via exact BigInt identities. The C helper
  // (backend-data-swap.c) executes renameatx_np(RENAME_SWAP) BEFORE its post-exchange
  // identity check + parent fsyncs, so a nonzero exit (which swapTreesSystem's command()
  // wrapper rethrows) can leave the trees ALREADY EXCHANGED. A `swapped` boolean set only
  // after a clean return would read false in that window, causing rollback to skip and
  // leaving the failed promotion live (data-integrity hole). Observe the real identities
  // instead; compare exact 64-bit strings (APFS inodes round above 2^53 as Numbers).
  let targetId;
  let oldId;
  try {
    targetId = exactDirectoryIdentity64(target, 'rollback target observation');
    oldId = exactDirectoryIdentity64(oldLocation, 'rollback old-location observation');
  } catch (error) {
    return { outcome: 'unknown', error: error.message };
  }
  const targetIsOldTarget = targetId.dev === expectedOldTargetIdentity.dev
    && targetId.ino === expectedOldTargetIdentity.ino;
  const targetIsStaged = targetId.dev === expectedStagedIdentity.dev
    && targetId.ino === expectedStagedIdentity.ino;
  const oldIsOldTarget = oldId.dev === expectedOldTargetIdentity.dev
    && oldId.ino === expectedOldTargetIdentity.ino;
  const oldIsStaged = oldId.dev === expectedStagedIdentity.dev
    && oldId.ino === expectedStagedIdentity.ino;
  // After RENAME_SWAP(target, stagingData): target carries the staged identity, oldLocation
  // (= stagingData) carries the original target identity. No swap: the reverse.
  if (targetIsStaged && oldIsOldTarget) return { outcome: 'exchanged' };
  if (targetIsOldTarget && oldIsStaged) return { outcome: 'original' };
  return { outcome: 'unknown', target: targetId, old: oldId };
}

function assertHeldForRollbackMutation(assertHeld, stage) {
  if (typeof assertHeld !== 'function') {
    fail('RESTORE_FAIL_HOLD', 'rollback mutation was refused without a native lease assertion callback', { stage });
  }
  try {
    assertHeld();
  } catch (error) {
    fail('RESTORE_FAIL_HOLD', 'native operation lease was lost during rollback; startup remains blocked', {
      stage,
      cause: error?.message || String(error),
    });
  }
}

function rollbackPromotion({
  target,
  oldLocation,
  failedTarget,
  expectedOldTargetIdentity,
  expectedStagedIdentity,
  adapters,
  swapHelper,
  assertHeld,
}) {
  // C1 OBSERVATIONAL: do not trust a `swapped` boolean. Derive the actual outcome from
  // observed identities (observeSwapOutcome). Rollback ONLY on `exchanged` (the swap
  // happened, so target now holds the staged content and must be restored to the old target
  // content). On `original` (no swap occurred) there is nothing to undo. On `unknown` do
  // NOT touch the live state - surface for manual review.
  const observation = observeSwapOutcome(target, oldLocation, expectedOldTargetIdentity, expectedStagedIdentity);
  const result = {
    observedOutcome: observation.outcome,
    attempted: observation.outcome === 'exchanged',
    newQuarantined: false,
    oldRestored: false,
    preservedNewLocation: null,
    errors: observation.error ? [`observation: ${observation.error}`] : [],
  };
  if (observation.outcome !== 'exchanged') return result;
  if (!fs.existsSync(target) || !fs.existsSync(oldLocation)) {
    result.errors.push('atomic rollback candidates are incomplete despite exchanged observation');
    return result;
  }
  try {
    assertHeldForRollbackMutation(assertHeld, 'immediately-before-rollback-swap');
    adapters.swapTrees(target, oldLocation, swapHelper);
    assertHeldForRollbackMutation(assertHeld, 'immediately-after-rollback-swap');
    fsyncDirectory(path.dirname(target));
    fsyncDirectory(path.dirname(oldLocation));
    const restoredObservation = observeSwapOutcome(
      target,
      oldLocation,
      expectedOldTargetIdentity,
      expectedStagedIdentity,
    );
    if (restoredObservation.outcome !== 'original') {
      result.errors.push(`post-rollback topology: ${restoredObservation.outcome}`);
      return result;
    }
    result.oldRestored = true;
    result.preservedNewLocation = oldLocation;
  } catch (error) {
    if (error instanceof BackendDataRecoveryError && error.code === 'RESTORE_FAIL_HOLD') throw error;
    result.errors.push(`atomic old-target restore: ${error.message}`);
    return result;
  }
  try {
    assertHeldForRollbackMutation(assertHeld, 'immediately-before-failed-tree-rename');
    fs.renameSync(oldLocation, failedTarget);
    result.preservedNewLocation = failedTarget;
    fsyncDirectory(path.dirname(oldLocation));
    fsyncDirectory(path.dirname(failedTarget));
    const restoredTarget = exactDirectoryIdentity64(target, 'rolled-back canonical target');
    const preservedFailed = exactDirectoryIdentity64(failedTarget, 'preserved failed promoted target');
    if (restoredTarget.dev !== expectedOldTargetIdentity.dev
        || restoredTarget.ino !== expectedOldTargetIdentity.ino
        || preservedFailed.dev !== expectedStagedIdentity.dev
        || preservedFailed.ino !== expectedStagedIdentity.ino) {
      result.errors.push('post-quarantine identities do not match the observed rollback topology');
      return result;
    }
    result.newQuarantined = true;
  } catch (error) {
    if (error instanceof BackendDataRecoveryError && error.code === 'RESTORE_FAIL_HOLD') throw error;
    // The failed promoted tree remains preserved at oldLocation. The live old target has
    // already been restored atomically, so this is evidence noise, not data loss.
    result.errors.push(`failed-target finalization: ${error.message}`);
  }
  return result;
}

function validateHeldLease(lease, purpose, adapters) {
  if (!lease || typeof lease.assertHeld !== 'function' || typeof lease.release !== 'function'
      || !lease.acquisition) {
    fail('OPERATION_LOCK_INVALID', 'backend operation lock lease is missing required capabilities');
  }
  const acquisition = adapters.validateOperationAcquisition(lease.acquisition, {
    expectedPurpose: purpose,
    expectedMode: 'hold',
    expectedLockPath: lease.lockPath ?? lease.acquisition.lock?.path,
  });
  lease.assertHeld();
  return acquisition;
}

async function releaseHeldLease(lease, acquisition, purpose, adapters) {
  lease.assertHeld();
  const releaseEvidence = await lease.release();
  return adapters.validateOperationRelease(
    releaseEvidence,
    releaseExpectation(acquisition, purpose),
  );
}

function finalClosurePathFor(receiptRoot, transactionId, outcome) {
  return path.join(receiptRoot, `backend-data-final-${outcome}-${transactionId}.json`);
}

function markerArchivePathFor(receiptRoot, transactionId, outcome) {
  return path.join(receiptRoot, `backend-data-marker-${outcome}-${transactionId}.json`);
}

function finalizeRestoreState({
  adapters,
  receiptRoot,
  transactionPath,
  transactionBase,
  transactionId,
  manifest,
  marker,
  acquisition,
  releaseEvidence,
  outcome,
  phaseA,
  failure,
  rollback,
}) {
  writeTransaction(transactionPath, transactionBase, 'release-persisted', {
    updatedAt: adapters.now().toISOString(),
    outcome,
    phaseA: phaseA ? { path: phaseA.path, sha256: phaseA.sha256 } : null,
    releaseEvidence,
    releaseValidated: true,
    markerActive: true,
  });
  const archivePath = markerArchivePathFor(receiptRoot, transactionId, outcome);
  const markerArchive = archiveActiveRecoveryMarker(marker, archivePath);
  writeTransaction(transactionPath, transactionBase, 'marker-archived', {
    updatedAt: adapters.now().toISOString(),
    outcome,
    phaseA: phaseA ? { path: phaseA.path, sha256: phaseA.sha256 } : null,
    releaseEvidence,
    releaseValidated: true,
    markerActive: false,
    markerArchive: {
      path: markerArchive.path,
      sha256: markerArchive.sha256,
      device: markerArchive.device,
      inode: markerArchive.inode,
    },
  });
  const finalPayload = {
    schema: RESTORE_FINAL_SCHEMA,
    complete: true,
    final: true,
    generatedAt: adapters.now().toISOString(),
    transactionId,
    outcome,
    manifestPath: manifest.path,
    manifestSha256: manifest.sha256,
    acquisitionAttestationSha256: acquisition.attestationSha256,
    phaseA: phaseA ? { path: phaseA.path, sha256: phaseA.sha256 } : null,
    releaseEvidence,
    markerArchive: {
      path: markerArchive.path,
      sha256: markerArchive.sha256,
      device: markerArchive.device,
      inode: markerArchive.inode,
    },
    failure: failure ?? null,
    rollback: rollback ?? null,
    sourceRemoved: false,
    oldTargetDeleted: false,
    claudeProjectsAccessed: false,
  };
  const finalClosure = writeJsonExclusiveDurable(
    finalClosurePathFor(receiptRoot, transactionId, outcome),
    finalPayload,
  );
  writeTransaction(transactionPath, transactionBase, 'final', {
    updatedAt: adapters.now().toISOString(),
    outcome,
    finalized: true,
    finalClosurePath: finalClosure.path,
    finalClosureSha256: finalClosure.sha256,
    markerActive: false,
  });
  return Object.freeze({ markerArchive, finalClosure, finalPayload });
}

async function restoreRecoveryCore(options, executionToken) {
  requireExecutionToken(executionToken);
  if (options.ownerApproved !== true) fail('OWNER_APPROVAL_REQUIRED', 'restore requires the explicit owner-approved gate');
  const receiptRoot = normalizeAbsolute(options.receiptRoot, 'recovery receipt root');
  const manifest = loadManifest(receiptRoot, options.manifestPath, options.manifestSha256);
  const sourceRepo = normalizeAbsolute(options.sourceRepo, 'sourceRepo');
  const parsed = manifest.parsed;
  const expected = expectedSourceRecord(options.expected);
  assertExpectedTree(parsed.tree, expected);
  if (parsed.sourceIdentity.sourceRepo !== sourceRepo) fail('SOURCE_REPO_MISMATCH', 'source repository does not match the reviewed manifest');
  const expectedSourceData = path.join(sourceRepo, '_SYSTEM/backend/data');
  if (parsed.sourceData !== expectedSourceData) fail('SOURCE_DATA_MISMATCH', 'manifest source data path is not canonical for the pinned source repository');
  const target = normalizeAbsolute(options.canonicalTarget, 'canonical backend target');
  if (parsed.canonicalTarget !== target) fail('CANONICAL_TARGET_CHANGED', 'canonical target differs from the reviewed manifest');
  const quarantineRoot = normalizeAbsolute(options.quarantineRoot, 'recovery quarantine root');
  const adapters = options.adapters;
  const token = manifest.sha256.slice(0, 16);
  const stagingRoot = path.join(quarantineRoot, `full-data-stage-${token}`);
  const stagingData = path.join(stagingRoot, 'data');
  const quarantine = path.join(quarantineRoot, `old-data-${token}`);
  const failedTarget = path.join(quarantineRoot, `failed-data-${token}`);
  const operationLockOptions = {
    purpose: 'restore',
    lockPath: options.operationLockPath,
    binRoot: options.operationLockBinRoot,
    sourcePath: options.operationLockSourcePath,
  };
  const lease = await adapters.acquireOperationLock(operationLockOptions);
  const acquisition = validateHeldLease(lease, 'restore', adapters);
  try {
    assertRecoveryStateAllowsWriterCore({
      receiptRoot,
      markerPath: path.join(receiptRoot, path.basename(RECOVERY_LOCK_PATH)),
      validateRelease: adapters.validateOperationRelease,
    });
  } catch (error) {
    try { await releaseHeldLease(lease, acquisition, 'restore', adapters); } catch {}
    throw error;
  }
  const transactionId = `${token}-${acquisition.nonce.slice(0, 16)}`;
  const transactionPath = path.join(receiptRoot, `backend-data-transaction-${transactionId}.json`);
  let marker;
  try {
    marker = createActiveRecoveryMarker({
      receiptRoot,
      transactionId,
      manifest,
      target,
      acquisition,
      now: adapters.now(),
    });
  } catch (error) {
    try { await releaseHeldLease(lease, acquisition, 'restore', adapters); } catch {}
    throw error;
  }
  const transactionBase = {
    schema: TRANSACTION_SCHEMA,
    transactionId,
    purpose: 'restore',
    manifestPath: manifest.path,
    manifestSha256: manifest.sha256,
    canonicalTarget: target,
    stagingData,
    oldTargetQuarantine: quarantine,
    failedTarget,
    sourceRemoved: false,
    claudeProjectsAccessed: false,
  };
  let oldLocation = stagingData;
  let swapHelper = null;
  let preswapTargetIdentity64 = null;
  let preswapStagedIdentity64 = null;
  let promotionPossible = false;
  let phaseASealed = false;
  let releaseEvidence = null;
  try {
    lease.assertHeld();
    writeTransaction(transactionPath, transactionBase, 'active-marker-created', {
      updatedAt: adapters.now().toISOString(),
      activeMarker: { path: marker.path, sha256: marker.sha256 },
      acquisition,
    });

    // No source or live-target access occurs before the native hold is validated
    // and the exclusive durable active marker is installed.
    const sourceIdentity = adapters.inspectSourceIdentity(sourceRepo);
    if (!identitiesMatch(parsed.sourceIdentity, sourceIdentity, [
      'hostMountPoint',
      'hostVolumeUuid',
      'hostFilesystem',
      'imagePath',
      'imageWritable',
      'backupMountPoint',
      'backupVolumeUuid',
      'backupFilesystem',
      'backupWritable',
      'sourceRepo',
      'retiredRuntimeImageObservedDetachedAtInspection',
    ])) {
      fail('SOURCE_IDENTITY_CHANGED', 'source mount identity changed after inspection');
    }
    exactDirectory(expectedSourceData, 'protected backup data source');
    const capacity = assertCapacityEvidence(
      options.capacity ?? capacityEvidence(parsed.tree.byteCount, options.capacityRoot),
      parsed.tree.byteCount,
    );
    if (!capacity.ok) fail('INSUFFICIENT_INTERNAL_CAPACITY', 'internal APFS capacity no longer meets the recovery reserve');

    const targetEntry = exactDirectory(target, 'canonical backend target');
    const targetParent = exactDirectory(path.dirname(target), 'canonical backend parent');
    if (targetEntry.stat.dev !== targetParent.stat.dev) fail('CANONICAL_TARGET_IS_MOUNTED', 'canonical target is not on the internal parent filesystem');
    if (targetEntry.stat.dev !== parsed.canonicalTargetMetadata.device
        || targetEntry.stat.ino !== parsed.canonicalTargetMetadata.inode) {
      fail('CANONICAL_TARGET_CHANGED', 'canonical target identity changed after inspection');
    }
    const targetIdentity = adapters.inspectTargetIdentity(target);
    if (!identitiesMatch(parsed.targetIdentity, targetIdentity, RECOVERY_TARGET_IDENTITY_KEYS)) {
      fail('INTERNAL_TARGET_IDENTITY_CHANGED', 'internal target volume identity changed after inspection');
    }
    ensureQuiescent(target, adapters);

    fs.mkdirSync(quarantineRoot, { recursive: true, mode: 0o700 });
    const quarantineEntry = exactDirectory(quarantineRoot, 'recovery quarantine root');
    if (quarantineEntry.stat.dev !== targetParent.stat.dev) fail('STAGING_FILESYSTEM_MISMATCH', 'staging is not on the canonical internal filesystem');
    for (const candidate of [stagingRoot, quarantine, failedTarget]) {
      if (fs.existsSync(candidate)) fail('RECOVERY_PATH_EXISTS', 'a recovery transaction path already exists', { candidate });
    }
    fs.mkdirSync(stagingRoot, { mode: 0o700 });
    fsyncDirectory(quarantineRoot);

    adapters.copyTree(expectedSourceData, stagingData);
    const stagedTree = await enumerateTree(stagingData, { progress: options.progress });
    compareTrees(parsed.tree, stagedTree);
    const stagedDatabases = verifyDatabases(stagingData, stagedTree, options);
    if (!stagedDatabases.ok) fail('STAGING_DATABASE_INVALID', 'one or more staged databases failed verification', { stagedDatabases });
    const stagedEntry = exactDirectory(stagingData, 'staged backend data');
    if (stagedEntry.stat.dev !== targetParent.stat.dev) fail('STAGING_FILESYSTEM_MISMATCH', 'staged data is not on the canonical internal filesystem');
    // G5 exact order: compile/authenticate -> full-sync -> POST-SYNC staged re-enumerate/
    // hash+SQLite -> fresh statfs/reserve -> prepared. The fresh capacity sample is taken
    // AFTER full-sync (F_FULLFSYNC/fsync can allocate journal/extents that change the
    // capacity picture), and the prepared receipt carries the POST-sync staged digest
    // (the pre-sync digest alone would attest a state full-sync could have altered).
    swapHelper = adapters.compileSwapHelper();
    adapters.fullSyncTree(stagingData, swapHelper);
    // POST-sync re-enumerate + rehash + SQLite. full-sync is durability-only and must not
    // alter content, so the post-sync staged digest must equal the pre-sync staged digest;
    // a drift here means the sync (or a race) changed bytes - fail rather than promote.
    const syncedTree = await enumerateTree(stagingData, { progress: options.progress });
    if (syncedTree.treeDigest !== stagedTree.treeDigest) {
      fail('STAGED_TREE_DRIFTED_AFTER_SYNC', 'staged tree digest changed after full-sync (durability must not alter content)', {
        beforeSync: stagedTree.treeDigest,
        afterSync: syncedTree.treeDigest,
      });
    }
    const syncedDatabases = verifyDatabases(stagingData, syncedTree, options);
    if (!syncedDatabases.ok) fail('STAGED_DATABASE_INVALID_AFTER_SYNC', 'staged databases failed verification after full-sync', { syncedDatabases });
    // Fresh statfs capacity AFTER compile + full-sync so both allocations are accounted.
    const postStageCapacity = assertCapacityEvidencePostStage(
      capacityEvidencePostStage(parsed.tree.byteCount, adapters.sampleFilesystem(options.capacityRoot)),
      parsed.tree.byteCount,
    );
    if (!postStageCapacity.ok) fail('INSUFFICIENT_INTERNAL_CAPACITY_POST_STAGE', 'fresh post-stage free capacity no longer covers the reserve after staging + full-sync (payload already on disk; atomic swap is space-neutral)', { postStageCapacity });
    writeTransaction(transactionPath, transactionBase, 'prepared', {
      updatedAt: adapters.now().toISOString(),
      oldTargetIdentity: { device: targetEntry.stat.dev, inode: targetEntry.stat.ino },
      stagedIdentity: { device: stagedEntry.stat.dev, inode: stagedEntry.stat.ino },
      preSyncStagedTreeDigest: stagedTree.treeDigest,
      stagedTreeDigest: syncedTree.treeDigest,
      postStageCapacity,
      swapHelperIdentity: {
        path: swapHelper.path,
        device: swapHelper.device,
        inode: swapHelper.inode,
        uid: swapHelper.uid,
        mode: swapHelper.mode,
        sha256: swapHelper.sha256,
        sourceSha256: swapHelper.sourceSha256,
        snapshotSha256: swapHelper.snapshotSha256,
      },
      fullSyncCompleted: true,
    });

    const immediateTarget = exactDirectory(target, 'canonical backend target before atomic swap');
    const immediateStage = exactDirectory(stagingData, 'staged backend data before atomic swap');
    if (immediateTarget.stat.dev !== targetEntry.stat.dev || immediateTarget.stat.ino !== targetEntry.stat.ino) {
      fail('CANONICAL_TARGET_CHANGED', 'canonical target identity changed before atomic swap');
    }
    if (immediateStage.stat.dev !== stagedEntry.stat.dev || immediateStage.stat.ino !== stagedEntry.stat.ino) {
      fail('STAGING_IDENTITY_CHANGED', 'staged target identity changed before atomic swap');
    }
    preswapTargetIdentity64 = exactDirectoryIdentity64(target, 'pre-swap canonical backend target');
    preswapStagedIdentity64 = exactDirectoryIdentity64(stagingData, 'pre-swap staged backend data');
    promotionPossible = true;
    ensureQuiescent(target, adapters);
    lease.assertHeld();
    adapters.swapTrees(target, stagingData, swapHelper);
    lease.assertHeld();
    const swapObservation = observeSwapOutcome(
      target,
      oldLocation,
      preswapTargetIdentity64,
      preswapStagedIdentity64,
    );
    if (swapObservation.outcome !== 'exchanged') {
      fail('PROMOTION_TOPOLOGY_UNKNOWN', 'atomic swap returned without the exact exchanged identities', {
        swapObservation,
      });
    }
    fsyncDirectory(path.dirname(target));
    fsyncDirectory(path.dirname(stagingData));
    const promoted = exactDirectory(target, 'promoted backend data');
    const displacedOld = exactDirectory(stagingData, 'displaced old backend data');
    if (promoted.stat.dev !== stagedEntry.stat.dev || promoted.stat.ino !== stagedEntry.stat.ino) {
      fail('PROMOTION_IDENTITY_MISMATCH', 'atomic promotion did not preserve the staged directory identity');
    }
    if (displacedOld.stat.dev !== targetEntry.stat.dev || displacedOld.stat.ino !== targetEntry.stat.ino) {
      fail('PROMOTION_IDENTITY_MISMATCH', 'atomic promotion did not preserve the old target identity');
    }
    writeTransaction(transactionPath, transactionBase, 'swapped', {
      updatedAt: adapters.now().toISOString(),
      swapObservation,
      promotedIdentity: { device: promoted.stat.dev, inode: promoted.stat.ino },
      displacedOldIdentity: { device: displacedOld.stat.dev, inode: displacedOld.stat.ino },
    });

    ensureQuiescent(target, adapters);
    const promotedTree = await enumerateTree(target, { progress: options.progress });
    compareTrees(parsed.tree, promotedTree);
    const promotedDatabases = verifyDatabases(target, promotedTree, options);
    if (!promotedDatabases.ok) fail('PROMOTED_DATABASE_INVALID', 'promoted databases failed verification', { promotedDatabases });
    ensureQuiescent(target, adapters);
    writeTransaction(transactionPath, transactionBase, 'verified', {
      updatedAt: adapters.now().toISOString(),
      promotedTreeDigest: promotedTree.treeDigest,
      databaseCount: promotedDatabases.count,
    });

    // The promoted tree can take arbitrarily long to re-enumerate and verify.
    // Re-prove the native hold at the final mutation boundary, not merely at
    // the earlier atomic exchange.
    lease.assertHeld();
    fs.renameSync(stagingData, quarantine);
    oldLocation = quarantine;
    adapters.afterOldTargetRenamed?.({ target, oldLocation, quarantine });
    fsyncDirectory(path.dirname(stagingData));
    fsyncDirectory(path.dirname(quarantine));
    writeTransaction(transactionPath, transactionBase, 'old-target-quarantined', {
      updatedAt: adapters.now().toISOString(),
      oldTargetQuarantine: quarantine,
    });

    const generatedAt = adapters.now().toISOString();
    const phaseAPayload = {
      schema: RESTORE_PHASE_A_SCHEMA,
      sealed: true,
      final: false,
      transactionId,
      generatedAt,
      manifestPath: manifest.path,
      manifestSha256: manifest.sha256,
      acquisition,
      sourceIdentity,
      sourceAttachmentEvidence: {
        observedAtRecoveryTime: true,
        backupImageAttachedReadOnly: sourceIdentity.imageWritable === false,
        retiredRuntimeImageObservedDetached: sourceIdentity.retiredRuntimeImageObservedDetachedAtInspection === true,
      },
      sourceData: parsed.sourceData,
      canonicalTarget: target,
      targetIdentity,
      promotedIdentity: { device: promoted.stat.dev, inode: promoted.stat.ino },
      tree: promotedTree,
      databases: promotedDatabases,
      capacity,
      postStageCapacity,
      swapHelperIdentity: {
        path: swapHelper.path,
        device: swapHelper.device,
        inode: swapHelper.inode,
        uid: swapHelper.uid,
        mode: swapHelper.mode,
        sha256: swapHelper.sha256,
        sourceSha256: swapHelper.sourceSha256,
      },
      fullSyncCompleted: true,
      stagingRoot,
      oldTargetQuarantine: quarantine,
      sourceRemoved: false,
      oldTargetDeleted: false,
      writersStarted: false,
      claudeProjectsAccessed: false,
      runtimePolicy: {
        storageMode: 'internal-apfs',
        externalRuntimeImageRequired: false,
        recoverySourceDriveRequiredAfterClosure: false,
      },
      transactionPath,
    };
    lease.assertHeld();
    const phaseA = writeJsonExclusiveDurable(
      path.join(receiptRoot, `internal-restore-phase-a-${transactionId}.json`),
      phaseAPayload,
    );
    phaseASealed = true;
    writeTransaction(transactionPath, transactionBase, 'phase-a-sealed', {
      updatedAt: adapters.now().toISOString(),
      phaseAPath: phaseA.path,
      phaseASha256: phaseA.sha256,
      markerActive: true,
    });
    releaseEvidence = await releaseHeldLease(lease, acquisition, 'restore', adapters);
    const finalized = finalizeRestoreState({
      adapters,
      receiptRoot,
      transactionPath,
      transactionBase,
      transactionId,
      manifest,
      marker,
      acquisition,
      releaseEvidence,
      outcome: 'complete',
      phaseA,
      failure: null,
      rollback: null,
    });
    return Object.freeze({
      ok: true,
      receiptPath: phaseA.path,
      receiptSha256: phaseA.sha256,
      finalClosurePath: finalized.finalClosure.path,
      finalClosureSha256: finalized.finalClosure.sha256,
      lockArchive: finalized.markerArchive.path,
      releaseEvidence,
      receipt: phaseAPayload,
      finalClosure: finalized.finalPayload,
    });
  } catch (error) {
    if (phaseASealed) {
      fail('RESTORE_FINALIZATION_INCOMPLETE', 'Phase-A is sealed and rollback is forbidden; recovery state remains fail-closed until Phase-B is repaired', {
        cause: error.message,
        causeCode: error?.code ?? null,
        transactionPath,
        activeMarker: markerNotProvenAbsent(marker.path) ? marker.path : null,
        releasePersisted: releaseEvidence !== null,
      });
    }
    try {
      lease.assertHeld();
    } catch (leaseError) {
      fail('RESTORE_FAIL_HOLD', 'recovery failed after losing proof of the native operation lease; no rollback was attempted', {
        cause: error.message,
        causeCode: error?.code ?? null,
        leaseError: leaseError.message,
        activeMarker: marker.path,
      });
    }
    let rollback = {
      observedOutcome: 'not-possible',
      attempted: false,
      newQuarantined: false,
      oldRestored: false,
      preservedNewLocation: null,
      errors: [],
    };
    if (promotionPossible) {
      rollback = rollbackPromotion({
        target,
        oldLocation,
        failedTarget,
        expectedOldTargetIdentity: preswapTargetIdentity64,
        expectedStagedIdentity: preswapStagedIdentity64,
        adapters,
        swapHelper,
        assertHeld: () => lease.assertHeld(),
      });
      if (rollback.observedOutcome === 'unknown'
          || (rollback.observedOutcome === 'exchanged' && rollback.oldRestored !== true)
          || (rollback.preservedNewLocation === failedTarget && rollback.newQuarantined !== true)) {
        try { releaseEvidence = await releaseHeldLease(lease, acquisition, 'restore', adapters); } catch {}
        try {
          writeTransaction(transactionPath, transactionBase, 'fail-hold', {
            updatedAt: adapters.now().toISOString(),
            cause: error.message,
            causeCode: error?.code ?? null,
            rollback,
            markerActive: markerNotProvenAbsent(marker.path),
          });
        } catch {}
        fail('RESTORE_TOPOLOGY_UNKNOWN_HELD', 'restore topology is unknown or rollback could not restore the old target; startup remains blocked', {
          cause: error.message,
          causeCode: error?.code ?? null,
          rollback,
          activeMarker: markerNotProvenAbsent(marker.path) ? marker.path : null,
        });
      }
    }
    lease.assertHeld();
    const outcome = rollback.observedOutcome === 'exchanged' ? 'rolled-back' : 'failed-safe';
    try {
      writeTransaction(transactionPath, transactionBase, 'failure-pre-release', {
        updatedAt: adapters.now().toISOString(),
        cause: error.message,
        causeCode: error?.code ?? null,
        rollback,
        outcome,
        markerActive: true,
      });
      releaseEvidence = await releaseHeldLease(lease, acquisition, 'restore', adapters);
      const finalized = finalizeRestoreState({
        adapters,
        receiptRoot,
        transactionPath,
        transactionBase,
        transactionId,
        manifest,
        marker,
        acquisition,
        releaseEvidence,
        outcome,
        phaseA: null,
        failure: {
          code: error?.code ?? 'RESTORE_FAILED',
          message: error.message,
        },
        rollback,
      });
      fail(outcome === 'rolled-back' ? 'RESTORE_ROLLED_BACK' : (error?.code ?? 'RESTORE_FAILED'),
        outcome === 'rolled-back' ? 'restore failed and the old target was atomically restored' : error.message,
        {
          cause: error.message,
          causeCode: error?.code ?? null,
          rollback,
          finalClosurePath: finalized.finalClosure.path,
          finalClosureSha256: finalized.finalClosure.sha256,
          markerArchive: finalized.markerArchive.path,
        });
    } catch (finalizationError) {
      if (finalizationError instanceof BackendDataRecoveryError
          && [error?.code, 'RESTORE_ROLLED_BACK'].includes(finalizationError.code)) {
        throw finalizationError;
      }
      fail('RESTORE_FAILURE_FINALIZATION_INCOMPLETE', 'safe failure could not be closed with exact release/archive evidence; startup remains fail-closed', {
        cause: error.message,
        causeCode: error?.code ?? null,
        rollback,
        finalizationError: finalizationError.message,
        activeMarker: markerNotProvenAbsent(marker.path) ? marker.path : null,
      });
    }
  }
}

async function verifyRecoveryCore(options, executionToken) {
  requireExecutionToken(executionToken);
  if (options.ownerApproved !== true) fail('OWNER_APPROVAL_REQUIRED', 'protected verification requires the explicit owner-approved gate');
  const receiptRoot = normalizeAbsolute(options.receiptRoot, 'recovery receipt root');
  const manifest = loadManifest(receiptRoot, options.manifestPath, options.manifestSha256);
  const expected = expectedSourceRecord(options.expected);
  assertExpectedTree(manifest.parsed.tree, expected);
  const target = normalizeAbsolute(options.canonicalTarget, 'canonical backend target');
  if (manifest.parsed.canonicalTarget !== target) fail('CANONICAL_TARGET_CHANGED', 'canonical target differs from the reviewed manifest');
  const adapters = options.adapters;
  const lease = await adapters.acquireOperationLock({
    purpose: 'verify',
    lockPath: options.operationLockPath,
    binRoot: options.operationLockBinRoot,
    sourcePath: options.operationLockSourcePath,
  });
  const acquisition = validateHeldLease(lease, 'verify', adapters);
  let sealed = null;
  let releaseEvidence = null;
  try {
    assertRecoveryStateAllowsWriterCore({
      receiptRoot,
      markerPath: path.join(receiptRoot, path.basename(RECOVERY_LOCK_PATH)),
      validateRelease: adapters.validateOperationRelease,
    });
    lease.assertHeld();
    const targetIdentity = adapters.inspectTargetIdentity(target);
    if (!identitiesMatch(
      manifest.parsed.targetIdentity,
      targetIdentity,
      RECOVERY_TARGET_IDENTITY_KEYS,
    )) {
      fail('INTERNAL_TARGET_IDENTITY_CHANGED', 'internal target volume identity changed after inspection');
    }
    ensureQuiescent(target, adapters);
    const tree = await enumerateTree(target, { progress: options.progress });
    compareTrees(manifest.parsed.tree, tree);
    const databases = verifyDatabases(target, tree, options);
    if (!databases.ok) fail('LIVE_DATABASE_INVALID', 'one or more promoted databases failed verification', { databases });
    ensureQuiescent(target, adapters);
    lease.assertHeld();
    const generatedAt = adapters.now().toISOString();
    const payload = {
      schema: VERIFY_SCHEMA,
      sealed: true,
      final: false,
      generatedAt,
      manifestPath: manifest.path,
      manifestSha256: manifest.sha256,
      canonicalTarget: target,
      acquisition,
      targetIdentity,
      tree,
      databases,
      runtimePolicy: {
        storageMode: 'internal-apfs',
        externalRuntimeImageRequired: false,
        recoverySourceDriveRequired: false,
      },
      claudeProjectsAccessed: false,
    };
    sealed = writeJsonExclusiveDurable(
      path.join(receiptRoot, `internal-verify-sealed-${acquisition.nonce.slice(0, 16)}-${timestampSlug(adapters.now())}.json`),
      payload,
    );
    releaseEvidence = await releaseHeldLease(lease, acquisition, 'verify', adapters);
    const finalPayload = {
      schema: VERIFY_FINAL_SCHEMA,
      complete: true,
      final: true,
      generatedAt: adapters.now().toISOString(),
      manifestPath: manifest.path,
      manifestSha256: manifest.sha256,
      sealedReceipt: { path: sealed.path, sha256: sealed.sha256 },
      acquisitionAttestationSha256: acquisition.attestationSha256,
      releaseEvidence,
      claudeProjectsAccessed: false,
    };
    const finalCompletion = writeJsonExclusiveDurable(
      path.join(receiptRoot, `internal-verify-final-${acquisition.nonce.slice(0, 16)}-${timestampSlug(adapters.now())}.json`),
      finalPayload,
    );
    return Object.freeze({
      ok: true,
      receiptPath: sealed.path,
      receiptSha256: sealed.sha256,
      finalCompletionPath: finalCompletion.path,
      finalCompletionSha256: finalCompletion.sha256,
      releaseEvidence,
      payload,
      finalPayload,
    });
  } catch (error) {
    if (releaseEvidence === null) {
      try { releaseEvidence = await releaseHeldLease(lease, acquisition, 'verify', adapters); } catch {}
    }
    if (sealed !== null) {
      fail('VERIFY_FINALIZATION_INCOMPLETE', 'verification receipt was sealed but its exact release/final completion could not be established', {
        cause: error.message,
        causeCode: error?.code ?? null,
        sealedReceiptPath: sealed.path,
        releasePersisted: releaseEvidence !== null,
      });
    }
    throw error;
  }
}

function validatePrivateFixtureRoot(candidate) {
  const root = normalizeAbsolute(candidate, 'backend recovery fixture root');
  if (root === PRIVATE_FIXTURE_ROOT || !pathWithin(PRIVATE_FIXTURE_ROOT, root)) {
    fail('FIXTURE_ROOT_REFUSED', 'fixture root must be a strict descendant of /private/tmp', { root });
  }
  let entry;
  try {
    entry = fs.lstatSync(root, { bigint: true });
  } catch (error) {
    fail('FIXTURE_ROOT_REFUSED', 'fixture root must already exist as a private exact directory', {
      root,
      cause: error?.code || error?.message || String(error),
    });
  }
  let real;
  try {
    real = fs.realpathSync.native(root);
  } catch (error) {
    fail('FIXTURE_ROOT_REFUSED', 'fixture root realpath could not be proven', {
      root,
      cause: error?.code || error?.message || String(error),
    });
  }
  if (!entry.isDirectory() || entry.isSymbolicLink() || real !== root
      || entry.uid !== BigInt(process.getuid()) || Number(entry.mode & 0o7777n) !== 0o700) {
    fail('FIXTURE_ROOT_REFUSED', 'fixture root must be realpath-exact, owned by the current uid, mode 0700, and not a symlink', {
      root,
    });
  }
  return Object.freeze({ path: root, device: entry.dev.toString(), inode: entry.ino.toString() });
}

function assertFixtureContainedPath(root, candidate, label) {
  const absolute = normalizeAbsolute(candidate, label);
  if (!pathWithin(root, absolute)) {
    fail('FIXTURE_PATH_ESCAPE', `${label} escapes the private fixture root`, { root, path: absolute });
  }
  const relative = path.relative(root, absolute);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let entry;
    try {
      entry = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      fail('FIXTURE_PATH_UNAVAILABLE', `${label} path component could not be inspected`, {
        path: current,
        cause: error?.code || error?.message || String(error),
      });
    }
    if (entry.isSymbolicLink()) {
      fail('FIXTURE_PATH_ESCAPE', `${label} traverses a symlink inside the fixture root`, { path: current });
    }
  }
  return absolute;
}

function assertFixturePathEquals(root, actual, expected, label) {
  const safe = assertFixtureContainedPath(root, actual, label);
  if (safe !== expected) {
    fail('FIXTURE_PATH_REFUSED', `${label} is not the factory-bound fixture path`, {
      expected,
      actual: safe,
    });
  }
  return safe;
}

function assertFixtureHelperIdentity(root, helper, label) {
  if (!helper || typeof helper !== 'object') fail('FIXTURE_ADAPTER_INVALID', `${label} is missing`);
  assertFixtureContainedPath(root, helper.path, `${label} binary`);
  if (helper.snapshotPath !== undefined) {
    assertFixtureContainedPath(root, helper.snapshotPath, `${label} source snapshot`);
  }
  return helper;
}

function createContainedFixtureAdapters(root, paths, suppliedAdapters, nativeHelper, trace) {
  if (!suppliedAdapters || typeof suppliedAdapters !== 'object' || Array.isArray(suppliedAdapters)) {
    fail('FIXTURE_ADAPTER_INVALID', 'fixture adapters must be an explicit bound object');
  }
  const required = [
    'now',
    'acquireOperationLock',
    'validateOperationAcquisition',
    'validateOperationRelease',
    'inspectSourceIdentity',
    'inspectTargetIdentity',
    'copyTree',
    'swapTrees',
    'listOpenFiles',
    'sampleFilesystem',
    'compileSwapHelper',
    'fullSyncTree',
  ];
  for (const name of required) {
    if (typeof suppliedAdapters[name] !== 'function') {
      fail('FIXTURE_ADAPTER_INVALID', `fixture adapter ${name} must be callable`);
    }
  }
  const record = (event) => trace.push(Object.freeze({ sequence: trace.length + 1, ...event }));
  const adapterSource = nativeHelper
    ? {
      ...suppliedAdapters,
      compileSwapHelper() {
        const helper = swapHelperBinarySystem(paths.operationLockBinRoot);
        record({ event: 'helper-compiled', helperPath: helper.path });
        return helper;
      },
      fullSyncTree(stagingRoot, helper) {
        return fullSyncTreeSystem(stagingRoot, helper, record);
      },
      swapTrees(left, right, helper) {
        return swapTreesSystem(left, right, helper, record);
      },
      sampleFilesystem(targetRoot) {
        const sample = suppliedAdapters.sampleFilesystem(targetRoot);
        record({ event: 'post-stage-capacity-sampled', targetRoot });
        return sample;
      },
    }
    : suppliedAdapters;

  const validateAcquisitionPaths = (acquisition) => {
    if (!acquisition || typeof acquisition !== 'object') {
      fail('FIXTURE_ADAPTER_INVALID', 'fixture acquisition attestation is missing');
    }
    assertFixturePathEquals(root, acquisition.lock?.path, paths.operationLockPath, 'fixture acquisition lock');
    if (acquisition.helper?.source?.path !== BACKEND_OPERATION_LOCK_SOURCE) {
      fail('FIXTURE_PATH_REFUSED', 'fixture acquisition may reference only the frozen canonical lock helper source');
    }
    assertFixtureContainedPath(root, acquisition.helper?.binary?.path, 'fixture acquisition helper binary');
    return acquisition;
  };

  return Object.freeze({
    now: () => adapterSource.now(),
    async acquireOperationLock(options) {
      if (options?.sourcePath !== BACKEND_OPERATION_LOCK_SOURCE) {
        fail('FIXTURE_PATH_REFUSED', 'fixture operation lock source is not the frozen canonical helper source');
      }
      assertFixturePathEquals(root, options?.lockPath, paths.operationLockPath, 'fixture operation lock');
      assertFixturePathEquals(root, options?.binRoot, paths.operationLockBinRoot, 'fixture operation helper bin root');
      return adapterSource.acquireOperationLock(Object.freeze({ ...options }));
    },
    validateOperationAcquisition(value, expected) {
      return validateAcquisitionPaths(adapterSource.validateOperationAcquisition(value, expected));
    },
    validateOperationRelease(value, expected) {
      const release = adapterSource.validateOperationRelease(value, expected);
      if (release?.acquisition) validateAcquisitionPaths(release.acquisition);
      return release;
    },
    inspectSourceIdentity(sourceRepo) {
      assertFixturePathEquals(root, sourceRepo, paths.sourceRepo, 'fixture source repository');
      return adapterSource.inspectSourceIdentity(sourceRepo);
    },
    inspectTargetIdentity(target) {
      assertFixturePathEquals(root, target, paths.canonicalTarget, 'fixture canonical target');
      return adapterSource.inspectTargetIdentity(target);
    },
    inspectInternalVolumeIdentity(anchor) {
      assertFixturePathEquals(root, anchor, paths.internalVolumeAnchor, 'fixture internal APFS anchor');
      return adapterSource.inspectTargetIdentity(anchor);
    },
    beforeAttestationReceiptWrite() {
      return adapterSource.beforeAttestationReceiptWrite?.();
    },
    copyTree(source, destination) {
      assertFixturePathEquals(root, source, paths.sourceData, 'fixture protected-like source data');
      assertFixtureContainedPath(root, destination, 'fixture staging destination');
      return adapterSource.copyTree(source, destination);
    },
    swapTrees(left, right, helper) {
      assertFixtureContainedPath(root, left, 'fixture swap left');
      assertFixtureContainedPath(root, right, 'fixture swap right');
      assertFixtureHelperIdentity(root, helper, 'fixture swap helper');
      return adapterSource.swapTrees(left, right, helper);
    },
    listOpenFiles(target) {
      assertFixturePathEquals(root, target, paths.canonicalTarget, 'fixture writer-inspection target');
      return adapterSource.listOpenFiles(target);
    },
    sampleFilesystem(targetRoot) {
      assertFixturePathEquals(root, targetRoot, paths.capacityRoot, 'fixture capacity root');
      return adapterSource.sampleFilesystem(targetRoot);
    },
    compileSwapHelper() {
      return assertFixtureHelperIdentity(root, adapterSource.compileSwapHelper(), 'fixture compiled swap helper');
    },
    fullSyncTree(stagingRoot, helper) {
      assertFixtureContainedPath(root, stagingRoot, 'fixture full-sync tree');
      assertFixtureHelperIdentity(root, helper, 'fixture full-sync helper');
      return adapterSource.fullSyncTree(stagingRoot, helper);
    },
    afterOldTargetRenamed(details) {
      assertFixturePathEquals(root, details?.target, paths.canonicalTarget, 'fixture renamed target');
      const oldLocation = assertFixtureContainedPath(root, details?.oldLocation, 'fixture old-target quarantine');
      if (details?.quarantine !== oldLocation || path.dirname(oldLocation) !== paths.quarantineRoot
          || !/^old-data-[a-f0-9]{16}$/u.test(path.basename(oldLocation))) {
        fail('FIXTURE_PATH_REFUSED', 'fixture old-target quarantine is not the transaction-bound quarantine path');
      }
      return adapterSource.afterOldTargetRenamed?.(details);
    },
  });
}

function fixtureLayout(root) {
  const liveRoot = path.join(root, 'live');
  const sourceRepo = path.join(root, 'backup', 'YURI-OS-MUSUBI');
  const paths = {
    root,
    liveRoot,
    sourceRepo,
    sourceData: path.join(sourceRepo, '_SYSTEM/backend/data'),
    canonicalTarget: path.join(liveRoot, '_SYSTEM/backend/data'),
    internalVolumeAnchor: path.join(liveRoot, '_SYSTEM/backend'),
    quarantineRoot: path.join(liveRoot, '_SYSTEM/recovery/backend-db'),
    receiptRoot: path.join(liveRoot, '_SYSTEM/state/backend-volume'),
    capacityRoot: liveRoot,
    operationLockPath: path.join(root, 'backend-operation.lock'),
    operationLockBinRoot: path.join(root, 'bin'),
  };
  for (const [label, candidate] of Object.entries(paths)) {
    if (typeof candidate === 'string') assertFixtureContainedPath(root, candidate, `fixture ${label}`);
  }
  return Object.freeze(paths);
}

function revalidateFixtureRootBinding(rootBinding) {
  const current = validatePrivateFixtureRoot(rootBinding.path);
  if (current.device !== rootBinding.device || current.inode !== rootBinding.inode) {
    fail('FIXTURE_ROOT_REFUSED', 'fixture root identity changed after capability creation');
  }
}

function revalidateFixtureLayout(rootBinding, paths) {
  revalidateFixtureRootBinding(rootBinding);
  for (const [label, candidate] of Object.entries(paths)) {
    if (typeof candidate === 'string') assertFixtureContainedPath(rootBinding.path, candidate, `fixture ${label}`);
  }
}

/**
 * Explicit test-only capability. It has no CLI route and cannot redirect any
 * recovery path outside a private, exact, uid-owned mode-0700 /private/tmp
 * root. Adapters and an unexported execution token are captured by frozen
 * closures; operation methods accept data/fault evidence, never path authority.
 */
export function createBackendDataRecoveryFixtureApi(options = {}, ...extraArguments) {
  if (extraArguments.length !== 0) fail('FIXTURE_OVERRIDE_REFUSED', 'fixture factory accepts exactly one options object');
  rejectFixtureCallOverrides(options, new Set(['root', 'adapters', 'nativeHelper']), 'create');
  if (options.nativeHelper !== undefined && typeof options.nativeHelper !== 'boolean') {
    fail('FIXTURE_INPUT_INVALID', 'nativeHelper must be an explicit boolean when provided');
  }
  const rootBinding = validatePrivateFixtureRoot(options.root);
  const root = rootBinding.path;
  const paths = fixtureLayout(root);
  const token = Object.freeze({ type: 'contained-recovery-fixture', root, nonce: crypto.randomBytes(16).toString('hex') });
  FIXTURE_EXECUTION_TOKENS.add(token);
  const trace = [];
  const adapters = createContainedFixtureAdapters(root, paths, options.adapters, options.nativeHelper === true, trace);
  const fixtureInputs = Object.freeze({
    attestInternalVolume: new Set(['ownerApproved']),
    inspect: new Set(['ownerApproved', 'expected', 'capacity', 'progress']),
    restore: new Set(['ownerApproved', 'manifestPath', 'manifestSha256', 'expected', 'capacity', 'progress']),
    verify: new Set(['ownerApproved', 'manifestPath', 'manifestSha256', 'expected', 'progress']),
  });

  const attestInternalVolume = Object.freeze(async (input = {}, ...extraArguments) => {
    requireOwnerApprovalFirst(input, 'internal APFS attestation requires the explicit owner-approved gate');
    if (extraArguments.length !== 0) fail('FIXTURE_OVERRIDE_REFUSED', 'fixture attestation accepts exactly one input object');
    rejectFixtureCallOverrides(input, fixtureInputs.attestInternalVolume, 'attestInternalVolume');
    revalidateFixtureLayout(rootBinding, paths);
    return attestInternalApfsVolumeCore({
      ownerApproved: input.ownerApproved,
      anchorPath: paths.internalVolumeAnchor,
      receiptRoot: paths.receiptRoot,
      inspectIdentity: adapters.inspectInternalVolumeIdentity,
      now: adapters.now,
      beforeReceiptWrite: adapters.beforeAttestationReceiptWrite,
    }, token);
  });
  const inspect = Object.freeze(async (input = {}, ...extraArguments) => {
    requireOwnerApprovalFirst(input, 'inspection requires the explicit owner-approved gate');
    if (extraArguments.length !== 0) fail('FIXTURE_OVERRIDE_REFUSED', 'fixture inspect accepts exactly one input object');
    rejectFixtureCallOverrides(input, fixtureInputs.inspect, 'inspect');
    revalidateFixtureLayout(rootBinding, paths);
    return inspectRecoveryCore({
      ownerApproved: input.ownerApproved,
      sourceRepo: paths.sourceRepo,
      expected: input.expected,
      capacity: input.capacity,
      capacityRoot: paths.capacityRoot,
      canonicalTarget: paths.canonicalTarget,
      receiptRoot: paths.receiptRoot,
      adapters,
      progress: input.progress,
    }, token);
  });
  const restore = Object.freeze(async (input = {}, ...extraArguments) => {
    requireOwnerApprovalFirst(input, 'restore requires the explicit owner-approved gate');
    if (extraArguments.length !== 0) fail('FIXTURE_OVERRIDE_REFUSED', 'fixture restore accepts exactly one input object');
    rejectFixtureCallOverrides(input, fixtureInputs.restore, 'restore');
    revalidateFixtureLayout(rootBinding, paths);
    const manifestPath = assertFixtureContainedPath(root, input.manifestPath, 'fixture recovery manifest');
    return restoreRecoveryCore({
      ownerApproved: input.ownerApproved,
      sourceRepo: paths.sourceRepo,
      manifestPath,
      manifestSha256: input.manifestSha256,
      expected: input.expected,
      capacity: input.capacity,
      capacityRoot: paths.capacityRoot,
      canonicalTarget: paths.canonicalTarget,
      quarantineRoot: paths.quarantineRoot,
      receiptRoot: paths.receiptRoot,
      operationLockPath: paths.operationLockPath,
      operationLockBinRoot: paths.operationLockBinRoot,
      operationLockSourcePath: BACKEND_OPERATION_LOCK_SOURCE,
      adapters,
      progress: input.progress,
    }, token);
  });
  const verify = Object.freeze(async (input = {}, ...extraArguments) => {
    requireOwnerApprovalFirst(input, 'protected verification requires the explicit owner-approved gate');
    if (extraArguments.length !== 0) fail('FIXTURE_OVERRIDE_REFUSED', 'fixture verify accepts exactly one input object');
    rejectFixtureCallOverrides(input, fixtureInputs.verify, 'verify');
    revalidateFixtureLayout(rootBinding, paths);
    const manifestPath = assertFixtureContainedPath(root, input.manifestPath, 'fixture recovery manifest');
    return verifyRecoveryCore({
      ownerApproved: input.ownerApproved,
      manifestPath,
      manifestSha256: input.manifestSha256,
      expected: input.expected,
      canonicalTarget: paths.canonicalTarget,
      receiptRoot: paths.receiptRoot,
      operationLockPath: paths.operationLockPath,
      operationLockBinRoot: paths.operationLockBinRoot,
      operationLockSourcePath: BACKEND_OPERATION_LOCK_SOURCE,
      adapters,
      progress: input.progress,
    }, token);
  });
  const writerBarrier = Object.freeze((...args) => {
    if (args.length !== 0) fail('FIXTURE_OVERRIDE_REFUSED', 'fixture writer barrier is zero-argument and factory-bound');
    revalidateFixtureRootBinding(rootBinding);
    return assertRecoveryStateAllowsWriterCore({
      receiptRoot: paths.receiptRoot,
      markerPath: path.join(paths.receiptRoot, path.basename(RECOVERY_LOCK_PATH)),
      validateRelease: adapters.validateOperationRelease,
    });
  });
  const nativeTrace = Object.freeze(() => Object.freeze(trace.map((entry) => Object.freeze({
    ...entry,
    args: Array.isArray(entry.args) ? Object.freeze([...entry.args]) : entry.args,
  }))));
  return Object.freeze({
    paths,
    attestInternalVolume,
    inspect,
    restore,
    verify,
    assertRecoveryStateAllowsWriter: writerBarrier,
    nativeTrace,
  });
}

async function runProductionInspect(input, progress = null) {
  requireOwnerApprovalFirst(input, 'inspection requires the explicit owner-approved gate');
  return inspectRecoveryCore({
    ownerApproved: input.ownerApproved,
    sourceRepo: input.sourceRepo,
    expected: EXPECTED_SOURCE,
    capacityRoot: REPO_ROOT,
    canonicalTarget: CANONICAL_TARGET,
    receiptRoot: RECEIPT_ROOT,
    adapters: createSystemAdapters(),
    progress,
  }, PRODUCTION_EXECUTION_TOKEN);
}

async function runProductionAttestInternalVolume(input) {
  requireOwnerApprovalFirst(input, 'internal APFS attestation requires the explicit owner-approved gate');
  return attestInternalApfsVolumeCore({
    ownerApproved: input.ownerApproved,
    anchorPath: path.dirname(CANONICAL_TARGET),
    receiptRoot: RECEIPT_ROOT,
    inspectIdentity: inspectTargetIdentitySystem,
    now: () => new Date(),
    beforeReceiptWrite: () => {},
  }, PRODUCTION_EXECUTION_TOKEN);
}

async function runProductionRestore(input, progress = null) {
  requireOwnerApprovalFirst(input, 'restore requires the explicit owner-approved gate');
  return restoreRecoveryCore({
    ownerApproved: input.ownerApproved,
    sourceRepo: input.sourceRepo,
    manifestPath: input.manifestPath,
    manifestSha256: input.manifestSha256,
    expected: EXPECTED_SOURCE,
    capacityRoot: REPO_ROOT,
    canonicalTarget: CANONICAL_TARGET,
    quarantineRoot: QUARANTINE_ROOT,
    receiptRoot: RECEIPT_ROOT,
    operationLockPath: BACKEND_OPERATION_LOCK_PATH,
    operationLockBinRoot: BACKEND_HELPER_BIN_ROOT,
    operationLockSourcePath: BACKEND_OPERATION_LOCK_SOURCE,
    adapters: createSystemAdapters(),
    progress,
  }, PRODUCTION_EXECUTION_TOKEN);
}

async function runProductionVerify(input, progress = null) {
  requireOwnerApprovalFirst(input, 'protected verification requires the explicit owner-approved gate');
  return verifyRecoveryCore({
    ownerApproved: input.ownerApproved,
    manifestPath: input.manifestPath,
    manifestSha256: input.manifestSha256,
    expected: EXPECTED_SOURCE,
    canonicalTarget: CANONICAL_TARGET,
    receiptRoot: RECEIPT_ROOT,
    operationLockPath: BACKEND_OPERATION_LOCK_PATH,
    operationLockBinRoot: BACKEND_HELPER_BIN_ROOT,
    operationLockSourcePath: BACKEND_OPERATION_LOCK_SOURCE,
    adapters: createSystemAdapters(),
    progress,
  }, PRODUCTION_EXECUTION_TOKEN);
}

export async function inspectRecovery(options = {}, ...extraArguments) {
  requireOwnerApprovalFirst(options, 'inspection requires the explicit owner-approved gate');
  if (extraArguments.length !== 0) fail('PRODUCTION_OVERRIDE_REFUSED', 'inspect accepts exactly one production input object');
  rejectProductionOverrides(options, 'inspect');
  return runProductionInspect(options);
}

export async function attestInternalApfsVolume(options = {}, ...extraArguments) {
  requireOwnerApprovalFirst(options, 'internal APFS attestation requires the explicit owner-approved gate');
  if (extraArguments.length !== 0) fail('PRODUCTION_OVERRIDE_REFUSED', 'internal APFS attestation accepts exactly one production input object');
  rejectProductionOverrides(options, 'attestInternalVolume');
  return runProductionAttestInternalVolume(options);
}

export async function restoreRecovery(options = {}, ...extraArguments) {
  requireOwnerApprovalFirst(options, 'restore requires the explicit owner-approved gate');
  if (extraArguments.length !== 0) fail('PRODUCTION_OVERRIDE_REFUSED', 'restore accepts exactly one production input object');
  rejectProductionOverrides(options, 'restore');
  return runProductionRestore(options);
}

export async function verifyRecovery(options = {}, ...extraArguments) {
  requireOwnerApprovalFirst(options, 'protected verification requires the explicit owner-approved gate');
  if (extraArguments.length !== 0) fail('PRODUCTION_OVERRIDE_REFUSED', 'verify accepts exactly one production input object');
  rejectProductionOverrides(options, 'verify');
  return runProductionVerify(options);
}

function parseCli(argv) {
  const [action = 'help', ...rest] = argv;
  const parsed = {
    action,
    sourceRepo: null,
    manifestPath: null,
    manifestSha256: null,
    ownerApproved: false,
    json: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--source-repo') {
      if (parsed.sourceRepo || !rest[index + 1]) fail('CLI_USAGE', '--source-repo requires one path');
      parsed.sourceRepo = rest[index + 1];
      index += 1;
      continue;
    }
    if (argument === '--manifest') {
      if (parsed.manifestPath || !rest[index + 1]) fail('CLI_USAGE', '--manifest requires one path');
      parsed.manifestPath = rest[index + 1];
      index += 1;
      continue;
    }
    if (argument === '--manifest-sha256') {
      if (parsed.manifestSha256 || !rest[index + 1]) fail('CLI_USAGE', '--manifest-sha256 requires one digest');
      parsed.manifestSha256 = rest[index + 1];
      index += 1;
      continue;
    }
    if (argument === '--owner-approved') {
      if (parsed.ownerApproved) fail('CLI_USAGE', '--owner-approved may appear only once');
      parsed.ownerApproved = true;
      continue;
    }
    if (argument === '--json') {
      if (parsed.json) fail('CLI_USAGE', '--json may appear only once');
      parsed.json = true;
      continue;
    }
    fail('CLI_USAGE', `unknown argument: ${argument}`);
  }
  return parsed;
}

function printHelp() {
  process.stdout.write([
    'Usage:',
    '  backend-data-recovery.mjs attest-internal-volume --owner-approved [--json]',
    '  backend-data-recovery.mjs inspect --source-repo <mounted-backup-repo> --owner-approved [--json]',
    '  backend-data-recovery.mjs restore --source-repo <mounted-backup-repo> --manifest <file> --manifest-sha256 <sha256> --owner-approved [--json]',
    '  backend-data-recovery.mjs verify --manifest <file> --manifest-sha256 <sha256> --owner-approved [--json]',
    '',
  ].join('\n'));
}

function explicitBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

export function cliSummary(action, result) {
  const payload = result.payload ?? result.receipt;
  const inspectManifest = action === 'inspect' && payload?.schema === MANIFEST_SCHEMA;
  const restoreClosed = action === 'restore'
    && result.finalClosure?.complete === true
    && result.finalClosure?.outcome === 'complete';
  const verifyClosed = action === 'verify' && result.finalPayload?.complete === true;
  const runtimeClosed = restoreClosed || verifyClosed;
  const runtimePolicy = runtimeClosed ? payload?.runtimePolicy : null;
  const recoverySourceDriveRequiredAfterClosure = runtimePolicy?.recoverySourceDriveRequiredAfterClosure
    ?? runtimePolicy?.recoverySourceDriveRequired;
  return {
    ok: result.ok,
    action,
    manifestPath: result.manifestPath ?? payload?.manifestPath ?? null,
    manifestSha256: result.manifestSha256 ?? payload?.manifestSha256 ?? null,
    receiptPath: result.receiptPath ?? null,
    receiptSha256: result.receiptSha256 ?? null,
    lockArchive: result.lockArchive ?? null,
    itemCount: payload?.tree?.itemCount ?? null,
    fileCount: payload?.tree?.fileCount ?? null,
    byteCount: payload?.tree?.byteCount ?? null,
    treeDigest: payload?.tree?.treeDigest ?? null,
    databasesOk: payload?.databases?.ok ?? null,
    databaseCount: payload?.databases?.count ?? null,
    capacityOk: payload?.capacity?.ok ?? null,
    // These are deliberately action-qualified tri-state facts. Inspection can
    // attest only what it observed at source time. Runtime policy is surfaced
    // only after a correlated restore/verify closure. No action here samples
    // the current physical T7 connection state, so absence is never inferred.
    retiredRuntimeImageObservedDetachedAtInspection: inspectManifest
      ? explicitBoolean(payload?.sourceIdentity?.retiredRuntimeImageObservedDetachedAtInspection)
      : null,
    runtimeStorageModeAfterClosure: runtimeClosed && typeof runtimePolicy?.storageMode === 'string'
      ? runtimePolicy.storageMode
      : null,
    externalRuntimeImageRequiredAfterClosure: runtimeClosed
      ? explicitBoolean(runtimePolicy?.externalRuntimeImageRequired)
      : null,
    recoverySourceDriveRequiredAfterClosure: runtimeClosed
      ? explicitBoolean(recoverySourceDriveRequiredAfterClosure)
      : null,
    physicalT7ConnectedAtSummary: null,
    claudeProjectsAccessed: false,
  };
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseCli(argv);
  if (['help', '--help', '-h'].includes(parsed.action)) {
    printHelp();
    return 0;
  }
  const progress = parsed.json
    ? null
    : (event) => process.stderr.write(`BACKEND_DATA_RECOVERY_PROGRESS ${JSON.stringify(event)}\n`);
  let result;
  if (parsed.action === 'attest-internal-volume') {
    if (parsed.sourceRepo || parsed.manifestPath || parsed.manifestSha256) {
      fail('CLI_USAGE', 'attest-internal-volume accepts no source or manifest arguments');
    }
    result = await runProductionAttestInternalVolume({ ownerApproved: parsed.ownerApproved });
  } else if (parsed.action === 'inspect') {
    if (!parsed.sourceRepo) fail('CLI_USAGE', 'inspect requires --source-repo');
    result = await runProductionInspect({
      sourceRepo: parsed.sourceRepo,
      ownerApproved: parsed.ownerApproved,
    }, progress);
  } else if (parsed.action === 'restore') {
    if (!parsed.sourceRepo || !parsed.manifestPath || !parsed.manifestSha256) {
      fail('CLI_USAGE', 'restore requires --source-repo, --manifest, and --manifest-sha256');
    }
    result = await runProductionRestore({
      sourceRepo: parsed.sourceRepo,
      manifestPath: parsed.manifestPath,
      manifestSha256: parsed.manifestSha256,
      ownerApproved: parsed.ownerApproved,
    }, progress);
  } else if (parsed.action === 'verify') {
    if (!parsed.manifestPath || !parsed.manifestSha256) {
      fail('CLI_USAGE', 'verify requires --manifest and --manifest-sha256');
    }
    result = await runProductionVerify({
      manifestPath: parsed.manifestPath,
      manifestSha256: parsed.manifestSha256,
      ownerApproved: parsed.ownerApproved,
    }, progress);
  } else {
    fail('CLI_USAGE', `unknown action: ${parsed.action}`);
  }
  const marker = parsed.action.toUpperCase();
  const summary = cliSummary(parsed.action, result);
  if (parsed.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else process.stdout.write(`BACKEND_DATA_RECOVERY_${marker}_PASS ${JSON.stringify(summary)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${JSON.stringify({
        ok: false,
        code: error?.code || 'BACKEND_DATA_RECOVERY_FAILED',
        error: error instanceof Error ? error.message : String(error),
        details: error?.details || {},
      })}\n`);
      process.exitCode = 1;
    },
  );
}
