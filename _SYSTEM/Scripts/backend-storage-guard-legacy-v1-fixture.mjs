#!/usr/bin/env node

// FIXTURE/RECOVERY ONLY: retained legacy schema-v1 T7/image/broker acceptance.
// Production launchers MUST NOT import this module.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  prepareGuardedBackendWriter as upstreamPrepareGuardedBackendWriter,
  validateBackendOperationGuardianTerminalEvidence as upstreamValidateBackendOperationGuardianTerminalEvidence,
  BACKEND_WRITER_LEASE_FD as UPSTREAM_BACKEND_WRITER_LEASE_FD,
} from './backend-operation-lock.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '../..');

export const CANONICAL_MOUNT_POINT = path.join(REPO_ROOT, '_SYSTEM/backend/data');
export const INTERNAL_APFS_EXPECTED_VOLUME_UUID = '72584B80-CAD6-4B42-B491-ED5369347294';

export const BACKEND_WRITER_LEASE_FD = UPSTREAM_BACKEND_WRITER_LEASE_FD;
export const prepareGuardedBackendWriter = upstreamPrepareGuardedBackendWriter;
export const validateBackendOperationGuardianTerminalEvidence = upstreamValidateBackendOperationGuardianTerminalEvidence;
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1, 2]);
export const CANONICAL_BROKER_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM/state/backend-volume/bin/backend-volume-broker',
);
export const CANONICAL_IMAGE_PATH = '/Volumes/T7/YURI-Backend-Runtime-v1.sparsebundle';
export const RECOVERY_LOCK_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM/state/backend-volume/backend-data-recovery.lock',
);
export const SCHEMA_KEYS_V1 = Object.freeze([
  'brokerPath',
  'expectedBrokerSha256',
  'expectedHostUuid',
  'expectedVolumeUuid',
  'imagePath',
  'mountPoint',
  'schemaVersion',
]);
export const SCHEMA_KEYS_V2 = Object.freeze([
  'expectedVolumeUuid',
  'mode',
  'mountPoint',
  'schemaVersion',
]);
// Backwards-compatible default for v1 callers that import CONFIG_KEYS directly.
export const CONFIG_KEYS = SCHEMA_KEYS_V1;
export const BROKER_PURPOSE = 'yuri-backend-phase1';
export const BROKER_ATTACH_RESPONSE_KEYS = Object.freeze([
  'deviceIdentifier',
  'hostVolumeUUID',
  'imagePath',
  'mountPoint',
  'ok',
  'purpose',
  'volumeUUID',
]);
export const BROKER_DETACH_RESPONSE_KEYS = Object.freeze([
  'deviceIdentifier',
  'hostVolumeUUID',
  'mountPoint',
  'ok',
  'volumeUUID',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_MONITOR_INTERVAL_MS = 1_000;
const DEFAULT_TERM_GRACE_MS = 5_000;
const DEFAULT_KILL_GRACE_MS = 2_000;
// The broker owns a 10-minute child timeout and cleanup; the outer guard waits
// one additional minute so it never orphans a live hdiutil operation.
export const BROKER_EXEC_TIMEOUT_MS = 660_000;

export class BackendStorageGuardError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BackendStorageGuardError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new BackendStorageGuardError(code, message, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail('SCHEMA_INVALID', `${label} must be a JSON object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('SCHEMA_INVALID', `${label} keys do not match the closed schema`, {
      actual,
      expected: wanted,
    });
  }
}

function exactAbsolutePath(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    fail('SCHEMA_INVALID', `${field} must be a non-empty absolute path`);
  }
  if (!path.isAbsolute(value) || path.resolve(value) !== value) {
    fail('SCHEMA_INVALID', `${field} must be absolute and normalized`, { value });
  }
  return value;
}

function exactUuid(value, field) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail('SCHEMA_INVALID', `${field} must be a UUID`, { value });
  }
  return value.toUpperCase();
}

function sameUuid(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.toUpperCase() === right.toUpperCase();
}

export function assertRecoveryUnlocked(adapters = createSystemAdapters(), lockPath = RECOVERY_LOCK_PATH) {
  const exists = typeof adapters.recoveryLockExists === 'function'
    ? adapters.recoveryLockExists(lockPath)
    : (() => {
      try { fs.lstatSync(lockPath); return true; } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    })();
  if (exists) {
    fail('RECOVERY_LOCK_ACTIVE', 'backend writer startup is blocked by an active or interrupted data-recovery transaction', {
      lockPath,
    });
  }
  return true;
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateConfigV1(raw, options) {
  const expectedCanonicalMountPoint = exactAbsolutePath(
    options.expectedCanonicalMountPoint ?? CANONICAL_MOUNT_POINT,
    'expectedCanonicalMountPoint',
  );
  const mountPoint = exactAbsolutePath(raw.mountPoint, 'mountPoint');
  const imagePath = exactAbsolutePath(raw.imagePath, 'imagePath');
  const brokerPath = exactAbsolutePath(raw.brokerPath, 'brokerPath');
  const expectedImagePath = exactAbsolutePath(
    options.expectedImagePath ?? CANONICAL_IMAGE_PATH,
    'expectedImagePath',
  );
  const expectedBrokerPath = exactAbsolutePath(
    options.expectedBrokerPath ?? CANONICAL_BROKER_PATH,
    'expectedBrokerPath',
  );

  if (mountPoint !== expectedCanonicalMountPoint) {
    fail('SCHEMA_INVALID', 'mountPoint is not the exact canonical backend mountpoint', {
      actual: mountPoint,
      expected: expectedCanonicalMountPoint,
    });
  }
  if (imagePath !== expectedImagePath) {
    fail('SCHEMA_INVALID', 'imagePath is not the exact enrolled Phase-1 image path', {
      actual: imagePath,
      expected: expectedImagePath,
    });
  }
  if (brokerPath !== expectedBrokerPath) {
    fail('SCHEMA_INVALID', 'brokerPath is not the exact enrolled broker path', {
      actual: brokerPath,
      expected: expectedBrokerPath,
    });
  }
  if (!imagePath.endsWith('.sparsebundle')) {
    fail('SCHEMA_INVALID', 'imagePath must identify a .sparsebundle', { imagePath });
  }
  if (within(mountPoint, imagePath) || within(imagePath, mountPoint)) {
    fail('SCHEMA_INVALID', 'imagePath and mountPoint must not contain one another');
  }
  if (brokerPath === imagePath || brokerPath === mountPoint) {
    fail('SCHEMA_INVALID', 'brokerPath must be distinct from imagePath and mountPoint');
  }

  return Object.freeze({
    schemaVersion: 1,
    expectedBrokerSha256: (() => {
      if (typeof raw.expectedBrokerSha256 !== 'string'
          || !/^[0-9a-f]{64}$/i.test(raw.expectedBrokerSha256)) {
        fail('SCHEMA_INVALID', 'expectedBrokerSha256 must be a SHA-256 digest');
      }
      return raw.expectedBrokerSha256.toLowerCase();
    })(),
    expectedHostUuid: exactUuid(raw.expectedHostUuid, 'expectedHostUuid'),
    imagePath,
    expectedVolumeUuid: exactUuid(raw.expectedVolumeUuid, 'expectedVolumeUuid'),
    mountPoint,
    brokerPath,
  });
}

function validateConfigV2(raw, options) {
  // Internal-APFS mode: the canonical backend directory lives on the host's
  // internal APFS volume at exactly the canonical mountpoint path. The pinned
  // UUID identifies the volume; the mountpoint must be a real directory on the
  // SAME st_dev as its parent (no overlay/mount) and have ownership enabled.
  // T7, sparsebundle, and broker are entirely unused in this mode.
  if (raw.mode !== 'internal-apfs') {
    fail('SCHEMA_INVALID', "mode must equal 'internal-apfs'", { value: raw.mode });
  }
  const mountPoint = exactAbsolutePath(raw.mountPoint, 'mountPoint');
  const expectedCanonicalMountPoint = exactAbsolutePath(
    options.expectedCanonicalMountPoint ?? CANONICAL_MOUNT_POINT,
    'expectedCanonicalMountPoint',
  );
  if (mountPoint !== expectedCanonicalMountPoint) {
    fail('SCHEMA_INVALID', 'mountPoint is not the exact canonical backend mountpoint', {
      actual: mountPoint,
      expected: expectedCanonicalMountPoint,
    });
  }
  const expectedVolumeUuid = exactUuid(raw.expectedVolumeUuid, 'expectedVolumeUuid');
  // The enrolled internal APFS UUID is canonical. By default the V2 config
  // must pin to it; callers may override only by passing the same constant
  // back through options.expectedInternalVolumeUuid. Any other value (or
  // missing pin) is a SCHEMA_INVALID rejection at config-validation time so
  // production cannot accidentally bind to a different host volume.
  const pinOverride = typeof options.expectedInternalVolumeUuid === 'string'
    ? options.expectedInternalVolumeUuid
    : INTERNAL_APFS_EXPECTED_VOLUME_UUID;
  if (!sameUuid(pinOverride, INTERNAL_APFS_EXPECTED_VOLUME_UUID)) {
    fail('SCHEMA_INVALID', "options.expectedInternalVolumeUuid must equal the canonical INTERNAL_APFS_EXPECTED_VOLUME_UUID pin", {
      actual: pinOverride,
      expected: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    });
  }
  if (!sameUuid(expectedVolumeUuid, INTERNAL_APFS_EXPECTED_VOLUME_UUID)) {
    fail('SCHEMA_INVALID', "expectedVolumeUuid must equal the canonical internal APFS UUID pin", {
      actual: expectedVolumeUuid,
      expected: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    });
  }
  return Object.freeze({
    schemaVersion: 2,
    mode: 'internal-apfs',
    mountPoint,
    expectedVolumeUuid,
  });
}

export function validateConfig(raw, options = {}) {
  const schemaVersion = raw?.schemaVersion;
  if (schemaVersion === 1) {
    exactKeys(raw, SCHEMA_KEYS_V1, 'backend storage config');
    return validateConfigV1(raw, options);
  }
  if (schemaVersion === 2) {
    exactKeys(raw, SCHEMA_KEYS_V2, 'backend storage config');
    return validateConfigV2(raw, options);
  }
  fail('SCHEMA_INVALID', `schemaVersion must be one of ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`, {
    value: schemaVersion,
  });
}

export function loadConfig(configPath, options = {}) {
  const absolute = exactAbsolutePath(configPath, 'configPath');
  let parsed;
  try {
    const entry = fs.lstatSync(absolute);
    if (!entry.isFile() || entry.isSymbolicLink() || fs.realpathSync.native(absolute) !== absolute) {
      fail('CONFIG_READ_FAILED', 'config path must be an exact regular file without symlinks');
    }
    if ((entry.mode & 0o022) !== 0) {
      fail('CONFIG_READ_FAILED', 'config path must not be group- or world-writable');
    }
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    if (error instanceof BackendStorageGuardError) throw error;
    fail('CONFIG_READ_FAILED', `unable to read backend storage config: ${absolute}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return validateConfig(parsed, options);
}

function commandResult(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    fail('SYSTEM_INSPECTION_FAILED', `${command} failed`, {
      args,
      status: result.status,
      stderr: String(result.stderr || '').trim(),
      cause: result.error?.message ?? null,
    });
  }
  return String(result.stdout || '');
}

function parseDfMountPoint(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dataLine = lines.at(-1);
  if (!dataLine) fail('SYSTEM_INSPECTION_FAILED', 'df returned no mount record');
  const fields = dataLine.split(/\s+/);
  if (fields.length < 6) {
    fail('SYSTEM_INSPECTION_FAILED', 'df returned an unrecognized mount record', { dataLine });
  }
  return fields.slice(5).join(' ');
}

function plistToJson(plist) {
  const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], {
    input: plist,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail('SYSTEM_INSPECTION_FAILED', 'plutil failed to decode diskutil output', {
      status: result.status,
      stderr: String(result.stderr || '').trim(),
      cause: result.error?.message ?? null,
    });
  }
  try {
    return JSON.parse(String(result.stdout));
  } catch (error) {
    fail('SYSTEM_INSPECTION_FAILED', 'diskutil returned invalid plist JSON', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function inspectEntrySystem(target) {
  try {
    const lstat = fs.lstatSync(target);
    const stat = fs.statSync(target);
    return {
      exists: true,
      isSymbolicLink: lstat.isSymbolicLink(),
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      realPath: fs.realpathSync.native(target),
      deviceId: String(stat.dev),
      mode: stat.mode,
      sha256: stat.isFile()
        ? crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
        : null,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        isSymbolicLink: false,
        isDirectory: false,
        isFile: false,
        realPath: null,
        deviceId: null,
        mode: 0,
      };
    }
    fail('SYSTEM_INSPECTION_FAILED', `unable to inspect ${target}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

// Each plist signal is normalized INDEPENDENTLY. Disagreement on the same field
// (e.g. Removable vs RemovableMedia both present with different truth values)
// is recorded as a fail-closed parse conflict and NEVER inferred to either
// side. The accept rule for `internal` requires an explicit positive signal
// (Internal=true plist boolean OR DeviceLocation === 'internal' with no
// contradicting signal); Removable=false or fixed-media strings are NOT by
// themselves proof of internal storage.
function normalizeTristateBool(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
}

function normalizeRemovableFromLocation(deviceLocation) {
  if (typeof deviceLocation !== 'string') return 'unknown';
  const token = deviceLocation.trim().toLowerCase();
  if (token === 'removable') return 'true';
  if (token === 'fixed') return 'false';
  // 'Internal' is not a removability signal; do not coerce it.
  return 'unknown';
}

function normalizeDeviceLocationToken(value) {
  if (typeof value !== 'string') return null;
  return value.trim().toLowerCase() || null;
}

// Closed normalization for the internal/removable media signals. ANY present
// field that is neither `true` nor `false` is recorded as a fail-closed
// conflict for the field set, regardless of how many companion entries are
// also present. Missing values never produce a conflict; only PRESENT-but-
// non-boolean values do. This is the only path that can move plist inputs
// from a parser to a verdict; if it does not return conflict:false, the
// caller's verdict MUST fail closed.
function assertNoBooleanConflict(fieldName, values) {
  const seenBooleans = new Set();
  let sawAny = false;
  let sawInvalid = false;
  for (const v of values) {
    if (v === undefined) continue;
    sawAny = true;
    if (v === true) seenBooleans.add('true');
    else if (v === false) seenBooleans.add('false');
    else sawInvalid = true;
  }
  if (!sawAny) return { conflict: false };
  if (sawInvalid) return { conflict: true, signals: [fieldName, 'present-non-boolean'] };
  if (seenBooleans.size > 1) {
    return { conflict: true, signals: [fieldName, ...Array.from(seenBooleans)] };
  }
  return { conflict: false };
}


// Pure: take already-normalized candidate signals and the per-field conflict
// flags, return the verdict. Exported so unit tests can drive the decision
// without the full plist pipeline.
export function decideInternalSignalForInspection(signals, internalConflict, removableConflict) {
  const claimsInternal = signals.plistInternalTrue === true
    || signals.deviceLocationInternal === true;
  const claimsExternal = signals.plistInternalFalse === true
    || signals.removableTrue === true
    || signals.deviceLocationExternal === true;
  const parseConflict = internalConflict === true
    || removableConflict === true
    || (claimsInternal && claimsExternal);
  const internal = !parseConflict && claimsInternal && signals.removableTrue !== true;
  return { internal, parseConflict };
}
// Pure: derive the candidate signal set + decision from a raw diskutil info
// plist. Exported so unit tests can drive inspectMountSystem's normalizer
// without spawning diskutil/plutil/df. Returns { signals, internalConflict,
// removableConflict, internal, parseConflict }.
export function decideInternalFromPlistInfo(info) {
  const rawInternalValues = [info.Internal, info.internal].filter((v) => v !== undefined);
  const internalConflict = assertNoBooleanConflict('Internal', rawInternalValues);
  const plistInternal = rawInternalValues.length === 0
    ? 'unknown'
    : (internalConflict.conflict ? 'unknown' : normalizeTristateBool(rawInternalValues[0]));

  const rawRemovableValues = [info.Removable, info.RemovableMedia].filter((v) => v !== undefined);
  const removableConflict = assertNoBooleanConflict('Removable', rawRemovableValues);
  const plistRemovableFromBool = rawRemovableValues.length === 0
    ? 'unknown'
    : (removableConflict.conflict ? 'unknown' : normalizeTristateBool(rawRemovableValues[0]));

  const deviceLocation = normalizeDeviceLocationToken(info.DeviceLocation);
  const removableFromLocation = normalizeRemovableFromLocation(info.DeviceLocation);
  const removableMedia = plistRemovableFromBool !== 'unknown'
    ? plistRemovableFromBool
    : removableFromLocation;

  const signals = {
    plistInternalTrue: plistInternal === 'true',
    plistInternalFalse: plistInternal === 'false',
    removableTrue: removableMedia === 'true',
    removableFalse: removableMedia === 'false',
    deviceLocationInternal: deviceLocation === 'internal',
    deviceLocationExternal: deviceLocation === 'external',
  };
  const decision = decideInternalSignalForInspection(
    signals,
    internalConflict.conflict,
    removableConflict.conflict,
  );
  return {
    signals,
    internalConflict: internalConflict.conflict,
    removableConflict: removableConflict.conflict,
    plistInternal,
    removableMedia,
    deviceLocation,
    ...decision,
  };
}

export function inspectMountSystem(target) {
  const df = commandResult('/bin/df', ['-P', target]);
  const dfMountPoint = parseDfMountPoint(df);
  const plist = commandResult('/usr/sbin/diskutil', ['info', '-plist', dfMountPoint]);
  const info = plistToJson(plist);
  const entry = inspectEntrySystem(target);
  const fsType = info.FilesystemType
    ?? info.TypeBundle
    ?? info.FileSystemPersonality
    ?? info['File System Personality']
    ?? null;
  const writable = info.Writable === true || info.WritableVolume === true;
  const readOnly = info.ReadOnlyVolume === true || info.ReadOnly === true;
  const ownersEnabled = info.Owners === true
    || info.GlobalPermissionsEnabled === true
    || info.OwnershipEnabled === true;
  // Delegate the closed-set Internal/Removable/DeviceLocation normalization and
  // decision logic to the pure helper so that decision rules and conflict
  // detection are tested without spawning diskutil/plutil/df.
  const decision = decideInternalFromPlistInfo(info);
  return {
    mountPoint: info.MountPoint ?? dfMountPoint,
    volumeUuid: info.VolumeUUID ?? null,
    fsType,
    writable,
    readOnly,
    ownersEnabled,
    ...decision,
    deviceIdentifier: info.DeviceIdentifier ?? null,
    deviceId: entry.deviceId,
  };
}
export async function validateInternalApfsIdentity(config, mounted, adapters = createSystemAdapters()) {
  if (typeof adapters.inspectMount !== 'function' || typeof adapters.inspectEntry !== 'function') {
    fail('INTERNAL_IDENTITY_INVALID', 'internal-apfs validation requires inspectMount and inspectEntry');
  }
  const expectedCanonicalMountPoint = exactAbsolutePath(
    config.mountPoint ?? CANONICAL_MOUNT_POINT,
    'mountPoint',
  );
  const targetEntry = mounted?.targetEntry;
  const parentEntry = mounted?.parentEntry;
  const targetMount = mounted?.targetMount;
  const parentMount = mounted?.parentMount;

  if (!targetEntry?.exists || !targetEntry.isDirectory || targetEntry.isSymbolicLink
      || targetEntry.realPath !== expectedCanonicalMountPoint) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'canonical mountpoint is missing, a symlink, or not the exact real directory');
  }

  // Internal-APFS target lives on the SAME st_dev as its parent directory;
  // equality here means no overlay/mount wraps the canonical path.
  const targetDevice = String(targetEntry.deviceId ?? '');
  const parentDevice = String(parentEntry?.deviceId ?? '');
  if (!targetDevice || !parentDevice || targetDevice !== parentDevice) {
    fail('BARE_LOCAL_OVERLAY', 'canonical mountpoint is wrapped by a different filesystem or overlay', {
      targetDevice,
      parentDevice,
    });
  }

  // The brief mandates the PARENT (containing) volume record; inspectMount on
  // the parent path must return diskutil info for that volume. Falling back
  // to the target record would defeat the pin if any overlay slips through.
  if (!parentMount) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'parent volume record was not returned; inspectMount must target the parent path');
  }
  // Fail closed on any parse conflict surfaced by inspectMountSystem before
  // accepting the volume as internal. A malformed plist must never reach
  // the validator as a false-clean record.
  if (parentMount.parseConflict === true) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'parent volume record carries an unresolved plist parse conflict', {
      plistInternal: parentMount.plistInternal ?? null,
      removableMedia: parentMount.removableMedia ?? null,
      deviceLocation: parentMount.deviceLocation ?? null,
    });
  }
  const fsType = normalizedFsType(parentMount.fsType);
  if (fsType !== 'apfs' && !fsType.includes('apple_apfs')) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing filesystem is not APFS', { fsType });
  }
  if (parentMount.readOnly === true || parentMount.writable !== true) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing APFS volume is not writable');
  }
  if (parentMount.ownersEnabled !== true) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing APFS volume does not have ownership enabled');
  }
  if (parentMount.internal !== true) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing volume is not internal APFS (DeviceLocation must be internal and media fixed)', {
      deviceLocation: parentMount.deviceLocation ?? null,
      removableMedia: parentMount.removableMedia ?? null,
    });
  }
  if (!sameUuid(parentMount.volumeUuid, config.expectedVolumeUuid)) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing APFS UUID does not match the pin', {
      actual: parentMount.volumeUuid ?? null,
      expected: config.expectedVolumeUuid,
    });
  }
  return mounted;
}
export function isDirectoryEmptySystem(target) {
  let directory;
  try {
    directory = fs.opendirSync(target);
    return directory.readSync() === null;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    fail('SYSTEM_INSPECTION_FAILED', `unable to test mountpoint emptiness: ${target}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    directory?.closeSync();
  }
}

export function createSystemAdapters(overrides = {}) {
  return {
    inspectEntry: inspectEntrySystem,
    inspectMount: inspectMountSystem,
    isDirectoryEmpty: isDirectoryEmptySystem,
    execBroker(brokerPath, args, execOptions = {}) {
      return spawnSync(brokerPath, args, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: execOptions.timeoutMs ?? BROKER_EXEC_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });
    },
    spawnWriter(command, args, spawnOptions) {
      return spawn(command, args, spawnOptions);
    },
    killProcessGroup(pid, signal) {
      process.kill(-pid, signal);
    },
    processGroupAlive(pid) {
      try {
        process.kill(-pid, 0);
        return true;
      } catch (error) {
        if (error?.code === 'ESRCH') return false;
        throw error;
      }
    },
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    recoveryLockExists(lockPath) {
      try { fs.lstatSync(lockPath); return true; } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    },
    ...overrides,
  };
}

export async function collectIdentity(config, adapters = createSystemAdapters()) {
  if (typeof adapters.collectIdentity === 'function') {
    return adapters.collectIdentity(config);
  }
  const [imageEntry, brokerEntry, hostMount, targetEntry, parentEntry] = await Promise.all([
    adapters.inspectEntry(config.imagePath),
    adapters.inspectEntry(config.brokerPath),
    adapters.inspectMount(config.imagePath),
    adapters.inspectEntry(config.mountPoint),
    adapters.inspectEntry(path.dirname(config.mountPoint)),
  ]);
  const targetIsBare = targetEntry?.exists
    && parentEntry?.exists
    && String(targetEntry.deviceId) === String(parentEntry.deviceId);
  const targetMount = await adapters.inspectMount(
    targetIsBare ? path.dirname(config.mountPoint) : config.mountPoint,
  );
  return {
    backing: { imageEntry, brokerEntry, hostMount },
    mounted: { targetEntry, parentEntry, targetMount },
  };
}

export function validateBackingIdentity(config, backing) {
  const { imageEntry, brokerEntry, hostMount } = backing ?? {};
  if (!imageEntry?.exists || !imageEntry.isDirectory) {
    fail('BACKING_IMAGE_INVALID', 'sparsebundle does not exist as a directory');
  }
  if (imageEntry.isSymbolicLink || imageEntry.realPath !== config.imagePath) {
    fail('BACKING_IMAGE_INVALID', 'sparsebundle path must not traverse a symlink', {
      realPath: imageEntry.realPath,
    });
  }
  validateBrokerIdentity(config, brokerEntry);
  if (!hostMount || !sameUuid(hostMount.volumeUuid, config.expectedHostUuid)) {
    fail('HOST_IDENTITY_MISMATCH', 'backing image host UUID does not match the T7 pin', {
      actual: hostMount?.volumeUuid ?? null,
      expected: config.expectedHostUuid,
    });
  }
  if (hostMount.readOnly === true || hostMount.writable !== true) {
    fail('HOST_IDENTITY_MISMATCH', 'backing image host is not writable');
  }
  if (typeof hostMount.mountPoint !== 'string' || !within(hostMount.mountPoint, config.imagePath)) {
    fail('HOST_IDENTITY_MISMATCH', 'image path is not contained by the pinned host mount', {
      hostMountPoint: hostMount?.mountPoint ?? null,
      imagePath: config.imagePath,
    });
  }
  return backing;
}

export function validateBrokerIdentity(config, brokerEntry) {
  if (!brokerEntry?.exists || !brokerEntry.isFile) {
    fail('BROKER_INVALID', 'broker path does not identify a regular file');
  }
  if (brokerEntry.isSymbolicLink || brokerEntry.realPath !== config.brokerPath) {
    fail('BROKER_INVALID', 'broker path must not traverse a symlink', {
      realPath: brokerEntry.realPath,
    });
  }
  if ((Number(brokerEntry.mode) & 0o111) === 0) {
    fail('BROKER_INVALID', 'broker must be executable');
  }
  if ((Number(brokerEntry.mode) & 0o022) !== 0) {
    fail('BROKER_INVALID', 'broker must not be group- or world-writable');
  }
  if (brokerEntry.sha256 !== config.expectedBrokerSha256) {
    fail('BROKER_INVALID', 'broker SHA-256 does not match the enrolled digest');
  }
  return brokerEntry;
}

function normalizedFsType(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateMountIdentity(config, mounted) {
  const { targetEntry, parentEntry, targetMount } = mounted ?? {};
  if (!targetEntry?.exists || !targetEntry.isDirectory) {
    fail('MOUNT_IDENTITY_MISMATCH', 'canonical mountpoint is absent');
  }
  if (targetEntry.isSymbolicLink || targetEntry.realPath !== config.mountPoint) {
    fail('MOUNT_IDENTITY_MISMATCH', 'canonical mountpoint must not traverse a symlink', {
      realPath: targetEntry.realPath,
    });
  }
  if (targetMount?.mountPoint !== config.mountPoint) {
    fail('MOUNT_IDENTITY_MISMATCH', 'target is not an exact filesystem mountpoint', {
      actual: targetMount?.mountPoint ?? null,
      expected: config.mountPoint,
    });
  }
  const fsType = normalizedFsType(targetMount.fsType);
  if (fsType !== 'apfs' && !fsType.includes('apple_apfs')) {
    fail('MOUNT_IDENTITY_MISMATCH', 'mounted filesystem is not APFS', { fsType });
  }
  if (targetMount.readOnly === true || targetMount.writable !== true) {
    fail('MOUNT_IDENTITY_MISMATCH', 'mounted APFS volume is not writable');
  }
  if (targetMount.ownersEnabled !== true) {
    fail('MOUNT_IDENTITY_MISMATCH', 'mounted APFS volume does not have ownership enabled');
  }
  if (!sameUuid(targetMount.volumeUuid, config.expectedVolumeUuid)) {
    fail('MOUNT_IDENTITY_MISMATCH', 'mounted APFS UUID does not match the pin', {
      actual: targetMount?.volumeUuid ?? null,
      expected: config.expectedVolumeUuid,
    });
  }
  if (!targetMount.deviceIdentifier || typeof targetMount.deviceIdentifier !== 'string') {
    fail('MOUNT_IDENTITY_MISMATCH', 'mounted APFS device identifier is missing');
  }
  const targetDevice = String(targetEntry.deviceId ?? targetMount.deviceId ?? '');
  const parentDevice = String(parentEntry?.deviceId ?? '');
  if (!targetDevice || !parentDevice || targetDevice === parentDevice) {
    fail('BARE_LOCAL_FALLBACK', 'canonical mountpoint is on the parent filesystem');
  }
  if (targetMount.deviceId !== undefined
      && targetMount.deviceId !== null
      && String(targetMount.deviceId) !== targetDevice) {
    fail('MOUNT_IDENTITY_MISMATCH', 'mount record and target device do not agree');
  }
  return mounted;
}

export function validateIdentity(config, identity) {
  validateBackingIdentity(config, identity?.backing);
  validateMountIdentity(config, identity?.mounted);
  return identity;
}

function parseBrokerResponse(stdout, action) {
  const text = String(stdout ?? '').trim();
  if (!text) fail('BROKER_PROTOCOL_ERROR', 'broker returned no JSON response');
  let response;
  try {
    response = JSON.parse(text);
  } catch (error) {
    fail('BROKER_PROTOCOL_ERROR', 'broker returned invalid JSON', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  exactKeys(
    response,
    action === 'attach' ? BROKER_ATTACH_RESPONSE_KEYS : BROKER_DETACH_RESPONSE_KEYS,
    `broker ${action} response`,
  );
  return response;
}

function validateBrokerResponse(config, action, response) {
  if (response.ok !== true) fail('BROKER_REJECTED', `broker ${action} did not report success`);
  if (response.mountPoint !== config.mountPoint) {
    fail('BROKER_PROTOCOL_ERROR', `broker ${action} mountPoint does not match the pin`);
  }
  if (action === 'attach') {
    if (response.purpose !== BROKER_PURPOSE) {
      fail('BROKER_PROTOCOL_ERROR', 'broker attach purpose does not match the Phase-1 contract');
    }
    if (response.imagePath !== config.imagePath) {
      fail('BROKER_PROTOCOL_ERROR', 'broker attach imagePath does not match the pin');
    }
    if (typeof response.deviceIdentifier !== 'string' || response.deviceIdentifier.length === 0) {
      fail('BROKER_PROTOCOL_ERROR', 'broker attach deviceIdentifier is missing');
    }
    if (!sameUuid(response.volumeUUID, config.expectedVolumeUuid)) {
      fail('BROKER_PROTOCOL_ERROR', 'broker attach volume UUID does not match the pin');
    }
    if (!sameUuid(response.hostVolumeUUID, config.expectedHostUuid)) {
      fail('BROKER_PROTOCOL_ERROR', 'broker attach host UUID does not match the pin');
    }
  } else {
    if (typeof response.deviceIdentifier !== 'string' || response.deviceIdentifier.length === 0) {
      fail('BROKER_PROTOCOL_ERROR', 'broker detach deviceIdentifier is missing');
    }
    if (!sameUuid(response.volumeUUID, config.expectedVolumeUuid)) {
      fail('BROKER_PROTOCOL_ERROR', 'broker detach volume UUID does not match the pin');
    }
    if (!sameUuid(response.hostVolumeUUID, config.expectedHostUuid)) {
      fail('BROKER_PROTOCOL_ERROR', 'broker detach host UUID does not match the pin');
    }
  }
  return response;
}

export function brokerArgs(config, action) {
  if (action === 'attach') {
    return [
      'attach',
      '--image', config.imagePath,
      '--mountpoint', config.mountPoint,
      '--expected-volume-uuid', config.expectedVolumeUuid,
      '--expected-host-uuid', config.expectedHostUuid,
      '--json',
    ];
  }
  if (action === 'detach') {
    return [
      'detach',
      '--mountpoint', config.mountPoint,
      '--expected-volume-uuid', config.expectedVolumeUuid,
      '--expected-host-uuid', config.expectedHostUuid,
      '--json',
    ];
  }
  fail('BROKER_PROTOCOL_ERROR', `unsupported broker action: ${action}`);
}

export function runBroker(config, action, adapters = createSystemAdapters()) {
  if (typeof adapters.inspectEntry !== 'function') {
    fail('BROKER_INVALID', 'broker execution requires a fresh executable identity probe');
  }
  validateBrokerIdentity(config, adapters.inspectEntry(config.brokerPath));
  const result = adapters.execBroker(
    config.brokerPath,
    brokerArgs(config, action),
    { timeoutMs: BROKER_EXEC_TIMEOUT_MS },
  );
  if (result?.error || result?.status !== 0) {
    fail('BROKER_EXEC_FAILED', `broker ${action} failed`, {
      status: result?.status ?? null,
      stderr: String(result?.stderr || '').trim(),
      cause: result?.error?.message ?? null,
    });
  }
  return validateBrokerResponse(config, action, parseBrokerResponse(result.stdout, action));
}

async function bestEffortDetach(config, adapters) {
  try {
    const response = await runBroker(config, 'detach', adapters);
    const identity = await collectIdentity(config, adapters);
    await validateDetachedIdentity(config, identity, adapters);
    return { ok: true, response, identity };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: error?.code ?? null,
    };
  }
}

async function detachRequired(config, adapters, context) {
  try {
    const response = await runBroker(config, 'detach', adapters);
    const identity = await collectIdentity(config, adapters);
    await validateDetachedIdentity(config, identity, adapters);
    return response;
  } catch (error) {
    throw new BackendStorageGuardError(
      'CONTROLLED_DETACH_FAILED',
      `${context}: broker detach failed: ${error instanceof Error ? error.message : String(error)}`,
      { causeCode: error?.code ?? null },
    );
  }
}

export async function validateDetachedIdentity(config, identity, adapters = createSystemAdapters()) {
  validateBackingIdentity(config, identity?.backing);
  const entry = identity?.mounted?.targetEntry;
  const parent = identity?.mounted?.parentEntry;
  const mount = identity?.mounted?.targetMount;
  if (!entry?.exists || !entry.isDirectory || entry.isSymbolicLink || entry.realPath !== config.mountPoint) {
    fail('POST_DETACH_VALIDATION_FAILED', 'detached mountpoint is not the exact underlying directory');
  }
  if (!parent?.exists || String(entry.deviceId) !== String(parent.deviceId)) {
    fail('POST_DETACH_VALIDATION_FAILED', 'APFS device remains mounted after broker detach');
  }
  if (mount?.mountPoint === config.mountPoint) {
    fail('POST_DETACH_VALIDATION_FAILED', 'exact APFS mountpoint remains present after broker detach');
  }
  if ((Number(entry.mode) & 0o7777) !== 0) {
    fail('POST_DETACH_VALIDATION_FAILED', 'underlying mountpoint mode is not exactly 000 after detach');
  }
  // The broker proves emptiness through a stable descriptor immediately before
  // attach. The hidden underlying directory remains mode 000 for the complete
  // mounted lifetime, so reopening it here would only turn the required seal
  // into EACCES. Preserve explicit closed-fixture evidence when it is present.
  if (entry.isEmpty === false) {
    fail('POST_DETACH_VALIDATION_FAILED', 'underlying mountpoint is not empty after detach');
  }
  return identity;
}

export async function attachThroughBroker(config, adapters = createSystemAdapters()) {
  let before = await collectIdentity(config, adapters);
  validateBackingIdentity(config, before.backing);

  try {
    validateMountIdentity(config, before.mounted);
    await detachRequired(config, adapters, 'already-mounted identity reset');
    before = await collectIdentity(config, adapters);
    validateBackingIdentity(config, before.backing);
  } catch (error) {
    if (error?.code === 'CONTROLLED_DETACH_FAILED') throw error;
    if (looksLikeExactMount(config, before)) {
      const detach = await bestEffortDetach(config, adapters);
      throw new BackendStorageGuardError(
        'MOUNT_MISMATCH_DETACHED',
        `an unexpected exact mount was detached and refused: ${error.message}`,
        { causeCode: error?.code ?? null, detach },
      );
    }
  }

  await assertBareMountpointSafeForAttach(config, before.mounted, adapters);

  let attachStarted = false;
  try {
    attachStarted = true;
    const broker = await runBroker(config, 'attach', adapters);
    const identity = await collectIdentity(config, adapters);
    validateIdentity(config, identity);
    if (identity.mounted.targetMount.deviceIdentifier !== broker.deviceIdentifier) {
      fail('BROKER_PROTOCOL_ERROR', 'broker and local device identifiers do not agree', {
        broker: broker.deviceIdentifier,
        local: identity.mounted.targetMount.deviceIdentifier,
      });
    }
    return { broker, identity, alreadyMounted: false };
  } catch (error) {
    const detach = attachStarted ? await bestEffortDetach(config, adapters) : null;
    throw new BackendStorageGuardError(
      'ATTACH_VALIDATION_FAILED',
      `broker attach was not accepted: ${error instanceof Error ? error.message : String(error)}`,
      { causeCode: error?.code ?? null, detach },
    );
  }
}

function looksLikeExactMount(config, identity) {
  return identity?.mounted?.targetMount?.mountPoint === config.mountPoint
    && identity?.mounted?.targetEntry?.deviceId !== identity?.mounted?.parentEntry?.deviceId;
}

async function assertBareMountpointSafeForAttach(config, mounted, adapters) {
  const entry = mounted?.targetEntry;
  const parent = mounted?.parentEntry;
  if (!entry?.exists) {
    fail('BARE_MOUNTPOINT_UNSAFE', 'bare canonical mountpoint does not exist');
  }
  if (!entry.isDirectory || entry.isSymbolicLink || entry.realPath !== config.mountPoint) {
    fail('BARE_MOUNTPOINT_UNSAFE', 'bare canonical mountpoint is not an exact real directory');
  }
  if (!parent?.exists || String(entry.deviceId) !== String(parent.deviceId)) {
    fail('BARE_MOUNTPOINT_UNSAFE', 'bare canonical mountpoint is not on its parent filesystem');
  }
  if ((Number(entry.mode) & 0o7777) !== 0) {
    fail('BARE_MOUNTPOINT_UNSAFE', 'bare canonical mountpoint mode is not exactly 000');
  }
  // A real mode-000 directory cannot be opened by the guard. The broker owns
  // the authoritative descriptor-based emptiness check and reseals before
  // hdiutil starts; explicit negative evidence is still rejected here.
  if (entry.isEmpty === false) {
    fail('BARE_MOUNTPOINT_NOT_EMPTY', 'refusing to hide a non-empty bare canonical mountpoint');
  }
}

export async function ensureMounted(config, adapters = createSystemAdapters()) {
  if (config?.mode === 'internal-apfs') {
    // Internal-apfs mode: the canonical mountpoint is already a real directory
    // on the host's internal APFS volume. No broker, no attach, no detach.
    const [targetEntry, parentEntry, parentMount, targetMount] = await Promise.all([
      adapters.inspectEntry(config.mountPoint),
      adapters.inspectEntry(path.dirname(config.mountPoint)),
      adapters.inspectMount(path.dirname(config.mountPoint)),
      adapters.inspectMount(config.mountPoint),
    ]);
    const identity = { mounted: { targetEntry, parentEntry, parentMount, targetMount } };
    await validateInternalApfsIdentity(config, identity.mounted, adapters);
    return { broker: null, identity, alreadyMounted: true };
  }
  return attachThroughBroker(config, adapters);
}

function childExitPromise(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode, error: null });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      resolve(value);
    };
    const onExit = (code, signal) => finish({ code, signal, error: null });
    const onError = (error) => finish({ code: null, signal: null, error });
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function waitForExit(exitPromise, timeoutMs, adapters) {
  return Promise.race([
    exitPromise.then((exit) => ({ exited: true, exit })),
    adapters.sleep(timeoutMs).then(() => ({ exited: false, exit: null })),
  ]);
}

function processGroupAlive(adapters, child) {
  if (typeof adapters.processGroupAlive === 'function') {
    return adapters.processGroupAlive(child.pid);
  }
  return child.exitCode === null && child.signalCode === null;
}

async function waitForProcessGroupGone(adapters, child, timeoutMs) {
  if (!processGroupAlive(adapters, child)) return true;
  if (typeof adapters.processGroupAlive !== 'function') return false;
  const intervalMs = 50;
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await adapters.sleep(Math.min(intervalMs, timeoutMs));
    if (!processGroupAlive(adapters, child)) return true;
  }
  return !processGroupAlive(adapters, child);
}

export async function terminateWriterProcessGroup(child, options = {}) {
  const adapters = options.adapters ?? createSystemAdapters();
  const termGraceMs = options.termGraceMs ?? DEFAULT_TERM_GRACE_MS;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  if (!Number.isInteger(child?.pid) || child.pid <= 0) {
    fail('WRITER_PROCESS_INVALID', 'writer child has no valid process-group leader PID');
  }
  const exitPromise = options.exitPromise ?? childExitPromise(child);
  if (child.exitCode !== null || child.signalCode !== null) {
    const exit = await exitPromise;
    if (!processGroupAlive(adapters, child)) {
      return { terminated: true, escalated: false, exit };
    }
  }

  try {
    adapters.killProcessGroup(child.pid, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  const graceful = await waitForExit(exitPromise, termGraceMs, adapters);
  const gracefulGroupGone = await waitForProcessGroupGone(adapters, child, termGraceMs);
  if (gracefulGroupGone) {
    return { terminated: true, escalated: false, exit: graceful.exit };
  }

  try {
    adapters.killProcessGroup(child.pid, 'SIGKILL');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  const forced = await waitForExit(exitPromise, killGraceMs, adapters);
  const forcedGroupGone = await waitForProcessGroupGone(adapters, child, killGraceMs);
  if (!forcedGroupGone || (!forced.exited && child.exitCode === null && child.signalCode === null)) {
    fail('WRITER_TERMINATION_FAILED', 'writer process group did not exit after SIGKILL', {
      pid: child.pid,
    });
  }
  return { terminated: true, escalated: true, exit: forced.exit };
}

function writerSpawnOptions(options) {
  return {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
    detached: true,
  };
}

function subscribeSupervisorSignals(source) {
  if (!source || typeof source.on !== 'function' || typeof source.removeListener !== 'function') {
    return { promise: new Promise(() => {}), signal: null, cleanup() {} };
  }
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  let settled = false;
  let receivedSignal = null;
  let resolveSignal;
  const promise = new Promise((resolve) => { resolveSignal = resolve; });
  const handlers = new Map(signals.map((signal) => [signal, () => {
    if (settled) return;
    settled = true;
    receivedSignal = signal;
    resolveSignal(signal);
  }]));
  for (const [signal, handler] of handlers) source.on(signal, handler);
  return {
    promise,
    get signal() { return receivedSignal; },
    cleanup() {
      for (const [signal, handler] of handlers) source.removeListener(signal, handler);
    },
  };
}

async function shutdownBeforeWriter(config, adapters, ready, signal, context) {
  const detach = await detachRequired(config, adapters, `${context} signal cleanup`);
  return {
    code: null,
    signal,
    supervisorSignal: signal,
    termination: null,
    detach,
    alreadyMounted: ready.alreadyMounted,
    stoppedForIdentityLoss: false,
    writerStarted: false,
  };
}

export async function superviseWriter(config, writerArgv, options = {}) {
  if (!Array.isArray(writerArgv) || writerArgv.length === 0
      || writerArgv.some((arg) => typeof arg !== 'string' || arg.length === 0)) {
    fail('WRITER_COMMAND_INVALID', 'writer command must be a non-empty argv array');
  }
  const checkedConfig = validateConfig(config, {
    expectedCanonicalMountPoint: options.expectedCanonicalMountPoint ?? CANONICAL_MOUNT_POINT,
    expectedImagePath: options.expectedImagePath ?? CANONICAL_IMAGE_PATH,
    expectedBrokerPath: options.expectedBrokerPath ?? CANONICAL_BROKER_PATH,
  });
  const adapters = options.adapters ?? createSystemAdapters();
  const monitorIntervalMs = options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS;
  const supervisorSignals = subscribeSupervisorSignals(options.signalSource ?? process);

  try {
    const ready = await ensureMounted(checkedConfig, adapters);
    if (supervisorSignals.signal) {
      return await shutdownBeforeWriter(
        checkedConfig,
        adapters,
        ready,
        supervisorSignals.signal,
        'attach-phase shutdown',
      );
    }

    try {
      const freshIdentity = await collectIdentity(checkedConfig, adapters);
      validateIdentity(checkedConfig, freshIdentity);
    } catch (error) {
      const detach = await bestEffortDetach(checkedConfig, adapters);
      throw new BackendStorageGuardError(
        'PRESPAWN_IDENTITY_FAILED',
        `fresh storage validation failed before writer spawn: ${error.message}`,
        { causeCode: error?.code ?? null, detach },
      );
    }

    if (supervisorSignals.signal) {
      return await shutdownBeforeWriter(
        checkedConfig,
        adapters,
        ready,
        supervisorSignals.signal,
        'pre-spawn shutdown',
      );
    }

    let child;
    try {
      child = adapters.spawnWriter(
        writerArgv[0],
        writerArgv.slice(1),
        writerSpawnOptions(options),
      );
      if (!Number.isInteger(child?.pid) || child.pid <= 0) {
        fail('WRITER_SPAWN_FAILED', 'writer did not return a process-group leader PID');
      }
    } catch (error) {
      const detach = await bestEffortDetach(checkedConfig, adapters);
      throw new BackendStorageGuardError(
        'WRITER_SPAWN_FAILED',
        `writer spawn failed; storage detached: ${error instanceof Error ? error.message : String(error)}`,
        { causeCode: error?.code ?? null, detach },
      );
    }
    const exitPromise = childExitPromise(child);
    let stoppedForIdentityLoss = false;

    while (true) {
      const outcome = await Promise.race([
        exitPromise.then((exit) => ({ kind: 'exit', exit })),
        supervisorSignals.promise.then((signal) => ({ kind: 'supervisor-signal', signal })),
        adapters.sleep(monitorIntervalMs).then(() => ({ kind: 'probe' })),
      ]);
      if (outcome.kind === 'exit') {
        const termination = await terminateWriterProcessGroup(child, {
          adapters,
          exitPromise,
          termGraceMs: options.termGraceMs,
          killGraceMs: options.killGraceMs,
        });
        const detach = await detachRequired(checkedConfig, adapters, 'writer exit cleanup');
        if (outcome.exit.error) {
          throw new BackendStorageGuardError(
            'WRITER_SPAWN_FAILED',
            `writer process emitted an error: ${outcome.exit.error.message}`,
            { termination, detach },
          );
        }
        return {
          ...outcome.exit,
          termination,
          detach,
          alreadyMounted: ready.alreadyMounted,
          stoppedForIdentityLoss,
        };
      }
      if (outcome.kind === 'supervisor-signal') {
        const termination = await terminateWriterProcessGroup(child, {
          adapters,
          exitPromise,
          termGraceMs: options.termGraceMs,
          killGraceMs: options.killGraceMs,
        });
        const detach = await detachRequired(checkedConfig, adapters, 'supervisor signal cleanup');
        return {
          code: termination.exit?.code ?? null,
          signal: termination.exit?.signal ?? outcome.signal,
          supervisorSignal: outcome.signal,
          termination,
          detach,
          alreadyMounted: ready.alreadyMounted,
          stoppedForIdentityLoss,
        };
      }

      try {
        const identity = await collectIdentity(checkedConfig, adapters);
        validateIdentity(checkedConfig, identity);
      } catch (error) {
        stoppedForIdentityLoss = true;
        const termination = await terminateWriterProcessGroup(child, {
          adapters,
          exitPromise,
          termGraceMs: options.termGraceMs,
          killGraceMs: options.killGraceMs,
        });
        const detach = await bestEffortDetach(checkedConfig, adapters);
        throw new BackendStorageGuardError(
          'MOUNT_IDENTITY_LOST',
          `storage identity changed; writer stopped and will not restart: ${error.message}`,
          {
            causeCode: error?.code ?? null,
            termination,
            detach,
          },
        );
      }
    }
  } finally {
    supervisorSignals.cleanup();
  }
}

function parseCli(argv) {
  const [command = 'help', ...rest] = argv;
  let configPath = null;
  let separator = -1;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--config') {
      configPath = rest[index + 1] ?? null;
      index += 1;
    } else if (rest[index] === '--') {
      separator = index;
      break;
    } else {
      fail('CLI_USAGE', `unknown argument: ${rest[index]}`);
    }
  }
  const writerArgv = separator >= 0 ? rest.slice(separator + 1) : [];
  return { command, configPath, writerArgv };
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseCli(argv);
  if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
    process.stdout.write([
      'Usage:',
      '  backend-storage-guard.mjs supervise --config <absolute-json> -- <writer> [args...]',
      '',
    ].join('\n'));
    return 0;
  }
  if (!parsed.configPath) fail('CLI_USAGE', '--config is required');
  const config = loadConfig(parsed.configPath, {
    expectedCanonicalMountPoint: options.expectedCanonicalMountPoint,
    expectedImagePath: options.expectedImagePath,
    expectedBrokerPath: options.expectedBrokerPath,
  });
  const adapters = options.adapters ?? createSystemAdapters();

  if (parsed.command === 'supervise') {
    if (parsed.writerArgv.length === 0) fail('CLI_USAGE', 'supervise requires a writer after --');
    const result = await superviseWriter(config, parsed.writerArgv, {
      ...options,
      adapters,
    });
    return Number.isInteger(result.code) ? result.code : (result.signal ? 1 : 0);
  }
  fail('CLI_USAGE', `unknown command: ${parsed.command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      const payload = {
        ok: false,
        code: error?.code ?? 'BACKEND_STORAGE_GUARD_FAILED',
        error: error instanceof Error ? error.message : String(error),
        details: error?.details ?? {},
      };
      process.stderr.write(`${JSON.stringify(payload)}\n`);
      process.exitCode = 1;
    },
  );
}

async function collectInternalIdentity(config, adapters) {
  const [targetEntry, parentEntry, parentMount, targetMount] = await Promise.all([
    adapters.inspectEntry(config.mountPoint),
    adapters.inspectEntry(path.dirname(config.mountPoint)),
    adapters.inspectMount(path.dirname(config.mountPoint)),
    adapters.inspectMount(config.mountPoint),
  ]);
  return {
    mounted: { targetEntry, parentEntry, parentMount, targetMount },
  };
}
