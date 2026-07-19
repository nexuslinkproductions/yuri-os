#!/usr/bin/env node

/**
 * Production backend writer guard.
 *
 * This module accepts only the canonical schema-v2 internal-APFS topology.
 * Legacy external-storage acceptance is isolated in a fixture-only module
 * and is never imported here.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BACKEND_OPERATION_LOCK_PATH,
  BACKEND_WRITER_LEASE_FD,
  prepareGuardedBackendWriter,
  validateBackendOperationGuardianTerminalEvidence,
} from './backend-operation-lock.mjs';
import {
  assertRecoveryStateAllowsWriter,
  RECOVERY_LOCK_PATH as RECOVERY_MARKER_PATH,
} from './backend-data-recovery.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
export const CANONICAL_MOUNT_POINT = path.join(REPO_ROOT, '_SYSTEM/backend/data');
export const FIXED_CONFIG_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM/state/backend-volume/config.json',
);
export const INTERNAL_APFS_EXPECTED_VOLUME_UUID = '72584B80-CAD6-4B42-B491-ED5369347294';
export const CANONICAL_NODE_BINARY = '/opt/homebrew/Cellar/node/26.4.0/bin/node';
export const CANONICAL_BACKEND_SERVER_ARTIFACT = path.join(
  REPO_ROOT,
  '_SYSTEM/backend/dist/server.js',
);
// Enrollment is deliberately absent until a reviewed prebuilt artifact lands.
export const CANONICAL_BACKEND_SERVER_SHA256 = null;
export const CONFIG_KEYS = Object.freeze([
  'expectedVolumeUuid',
  'mode',
  'mountPoint',
  'schemaVersion',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DEFAULT_MONITOR_INTERVAL_MS = 1_000;
const SIGNALS = Object.freeze(['SIGTERM', 'SIGINT', 'SIGHUP']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SYSTEM_INSPECTION_TIMEOUT_MS = 5_000;
const PRODUCTION_WRITER_ENVIRONMENT = Object.freeze({
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  PATH: [path.dirname(CANONICAL_NODE_BINARY), '/usr/bin', '/bin', '/usr/sbin', '/sbin']
    .join(path.delimiter),
});
const DIRECT_CLI_FORBIDDEN_ENVIRONMENT_KEYS = new Set([
  'BACKEND_CONFIG_PATH',
  'BACKEND_DATA_PATH',
  'DOTENV_CONFIG_PATH',
  'NODE_OPTIONS',
  'NODE_PATH',
  'SYSTEM_ROOT',
  'YURI_BACKEND_CONFIG',
  'YURI_BACKEND_DATA_PATH',
  'YURI_DB_PATH',
  'YURI_MEMORY_DB_PATH',
  'YURI_ROOT',
]);

export {
  BACKEND_OPERATION_LOCK_PATH,
  BACKEND_WRITER_LEASE_FD,
  prepareGuardedBackendWriter,
  validateBackendOperationGuardianTerminalEvidence,
  RECOVERY_MARKER_PATH,
};

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
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    fail('SCHEMA_INVALID', `${label} keys do not match the closed schema`, {
      actual,
      expected: wanted,
    });
  }
}

function exactAbsolutePath(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')
      || !path.isAbsolute(value) || path.resolve(value) !== value) {
    fail('SCHEMA_INVALID', `${field} must be a non-empty normalized absolute path`, {
      value,
    });
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

export function validateConfig(raw, options = {}) {
  exactKeys(raw, CONFIG_KEYS, 'backend storage config');
  if (raw.schemaVersion !== 2) {
    fail('SCHEMA_INVALID', 'production backend storage requires schemaVersion 2', {
      value: raw.schemaVersion,
    });
  }
  if (raw.mode !== 'internal-apfs') {
    fail('SCHEMA_INVALID', "production backend storage mode must equal 'internal-apfs'", {
      value: raw.mode,
    });
  }
  const mountPoint = exactAbsolutePath(raw.mountPoint, 'mountPoint');
  const expectedMountPoint = exactAbsolutePath(
    options.expectedCanonicalMountPoint ?? CANONICAL_MOUNT_POINT,
    'expectedCanonicalMountPoint',
  );
  if (mountPoint !== expectedMountPoint) {
    fail('SCHEMA_INVALID', 'mountPoint is not the exact canonical backend data path', {
      actual: mountPoint,
      expected: expectedMountPoint,
    });
  }
  const expectedVolumeUuid = exactUuid(raw.expectedVolumeUuid, 'expectedVolumeUuid');
  const pin = exactUuid(
    options.expectedInternalVolumeUuid ?? INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    'expectedInternalVolumeUuid',
  );
  if (!sameUuid(pin, INTERNAL_APFS_EXPECTED_VOLUME_UUID)
      || !sameUuid(expectedVolumeUuid, pin)) {
    fail('SCHEMA_INVALID', 'expectedVolumeUuid does not equal the canonical internal APFS pin', {
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

export function loadConfig(configPath, options = {}) {
  const absolute = exactAbsolutePath(configPath, 'configPath');
  let parsed;
  try {
    const entry = fs.lstatSync(absolute);
    if (!entry.isFile() || entry.isSymbolicLink()
        || fs.realpathSync.native(absolute) !== absolute) {
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
    timeout: SYSTEM_INSPECTION_TIMEOUT_MS,
    killSignal: 'SIGKILL',
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

function parseDfMountRecord(output) {
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const dataLine = lines.at(-1);
  if (!dataLine) fail('SYSTEM_INSPECTION_FAILED', 'df returned no mount record');
  const fields = dataLine.split(/\s+/u);
  if (fields.length < 6) {
    fail('SYSTEM_INSPECTION_FAILED', 'df returned an unrecognized mount record', {
      dataLine,
    });
  }
  return Object.freeze({
    sourceDevice: fields[0],
    mountPoint: fields.slice(5).join(' '),
  });
}

function plistToJson(plist) {
  const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], {
    input: plist,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: SYSTEM_INSPECTION_TIMEOUT_MS,
    killSignal: 'SIGKILL',
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
    const link = fs.lstatSync(target);
    const entry = fs.statSync(target);
    return Object.freeze({
      exists: true,
      isSymbolicLink: link.isSymbolicLink(),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      realPath: fs.realpathSync.native(target),
      deviceId: String(entry.dev),
      mode: entry.mode,
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return Object.freeze({
        exists: false,
        isSymbolicLink: false,
        isDirectory: false,
        isFile: false,
        realPath: null,
        deviceId: null,
        mode: 0,
      });
    }
    fail('SYSTEM_INSPECTION_FAILED', `unable to inspect ${target}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

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
  return 'unknown';
}

function booleanConflict(values) {
  const present = values.filter((value) => value !== undefined);
  if (present.some((value) => value !== true && value !== false)) return true;
  return new Set(present).size > 1;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizedAliasFamily(info, keys, normalize, options = {}) {
  const present = keys.filter((key) => hasOwn(info, key));
  if (present.length === 0) {
    return Object.freeze({
      conflict: options.required === true,
      keys: Object.freeze([]),
      value: null,
    });
  }
  const values = present.map((key) => normalize(info[key]));
  const conflict = values.some((value) => value === null)
    || new Set(values).size !== 1;
  return Object.freeze({
    conflict,
    keys: Object.freeze([...present]),
    value: conflict ? null : values[0],
  });
}

function normalizeFilesystemAlias(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0
      || value.includes('\0')) return null;
  const token = value.toLowerCase();
  if (!/^[a-z0-9][a-z0-9._ -]*$/u.test(token)) return null;
  if (token === 'apfs' || token === 'apple_apfs' || token === 'apple apfs') return 'apfs';
  return token;
}

function normalizeMountPathAlias(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0
      || value.includes('\0') || !path.isAbsolute(value)
      || path.resolve(value) !== value) return null;
  return value;
}

function normalizeDeviceIdentifierAlias(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0
      || value.includes('\0')) return null;
  const token = value.startsWith('/dev/') ? value.slice('/dev/'.length) : value;
  return /^disk[0-9]+(?:s[0-9]+)*$/u.test(token) ? token : null;
}

function normalizeUuidAlias(value) {
  if (typeof value !== 'string' || value !== value.trim() || !UUID_PATTERN.test(value)) {
    return null;
  }
  return value.toUpperCase();
}

function normalizeDeviceLocationAlias(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0) return null;
  const token = value.toLowerCase();
  return ['external', 'fixed', 'internal', 'removable'].includes(token) ? token : null;
}

export function decideInternalSignalForInspection(signals, internalConflict, removableConflict) {
  const claimsInternal = signals.plistInternalTrue === true
    || signals.deviceLocationInternal === true;
  const claimsExternal = signals.plistInternalFalse === true
    || signals.removableTrue === true
    || signals.deviceLocationExternal === true;
  const parseConflict = internalConflict === true
    || removableConflict === true
    || (claimsInternal && claimsExternal);
  return Object.freeze({
    internal: !parseConflict && claimsInternal && signals.removableTrue !== true,
    parseConflict,
  });
}

export function decideInternalFromPlistInfo(info) {
  if (!isPlainObject(info)) {
    fail('SYSTEM_INSPECTION_FAILED', 'diskutil plist must decode to a JSON object');
  }
  const internalValues = [info.Internal, info.internal].filter((value) => value !== undefined);
  const removableValues = [info.Removable, info.RemovableMedia]
    .filter((value) => value !== undefined);
  const writableValues = [info.Writable, info.WritableVolume]
    .filter((value) => value !== undefined);
  const readOnlyValues = [info.ReadOnlyVolume, info.ReadOnly]
    .filter((value) => value !== undefined);
  const ownershipValues = [info.Owners, info.GlobalPermissionsEnabled, info.OwnershipEnabled]
    .filter((value) => value !== undefined);
  const internalConflict = booleanConflict(internalValues);
  const removableConflict = booleanConflict(removableValues);
  const writableConflict = booleanConflict(writableValues);
  const readOnlyConflict = booleanConflict(readOnlyValues);
  const ownershipConflict = booleanConflict(ownershipValues);
  const plistInternal = internalValues.length === 0 || internalConflict
    ? 'unknown'
    : normalizeTristateBool(internalValues[0]);
  const plistRemovable = removableValues.length === 0 || removableConflict
    ? 'unknown'
    : normalizeTristateBool(removableValues[0]);
  const deviceLocationAlias = normalizedAliasFamily(
    info,
    ['DeviceLocation', 'deviceLocation'],
    normalizeDeviceLocationAlias,
  );
  const deviceLocation = deviceLocationAlias.value;
  const locationRemovable = normalizeRemovableFromLocation(deviceLocation);
  const deviceLocationRemovableConflict = plistRemovable !== 'unknown'
    && locationRemovable !== 'unknown'
    && plistRemovable !== locationRemovable;
  const removableMedia = plistRemovable !== 'unknown'
    ? plistRemovable
    : locationRemovable;
  const signals = Object.freeze({
    plistInternalTrue: plistInternal === 'true',
    plistInternalFalse: plistInternal === 'false',
    removableTrue: removableMedia === 'true',
    removableFalse: removableMedia === 'false',
    deviceLocationInternal: deviceLocation === 'internal',
    deviceLocationExternal: deviceLocation === 'external',
  });
  return Object.freeze({
    signals,
    internalConflict,
    removableConflict,
    plistInternal,
    removableMedia,
    deviceLocation,
    ...decideInternalSignalForInspection(
      signals,
      internalConflict || writableConflict || readOnlyConflict || ownershipConflict
        || deviceLocationAlias.conflict || deviceLocationRemovableConflict,
      removableConflict || deviceLocationRemovableConflict,
    ),
    writable: writableValues.length > 0 && writableValues.every((value) => value === true),
    readOnly: readOnlyValues.some((value) => value === true),
    ownersEnabled: ownershipValues.length > 0
      && ownershipValues.every((value) => value === true),
    writableConflict,
    readOnlyConflict,
    ownershipConflict,
    deviceLocationConflict: deviceLocationAlias.conflict,
    deviceLocationRemovableConflict,
  });
}

export function normalizeDiskutilMountInfo(info, dfRecord, inspectedPath, deviceId) {
  if (!isPlainObject(info) || !isPlainObject(dfRecord)) {
    fail('SYSTEM_INSPECTION_FAILED', 'mount inspection evidence must be plain objects');
  }
  const decision = decideInternalFromPlistInfo(info);
  const filesystem = normalizedAliasFamily(
    info,
    ['FilesystemType', 'TypeBundle', 'FileSystemPersonality', 'File System Personality'],
    normalizeFilesystemAlias,
    { required: true },
  );
  const mount = normalizedAliasFamily(
    info,
    ['MountPoint', 'mountPoint'],
    normalizeMountPathAlias,
    { required: true },
  );
  const device = normalizedAliasFamily(
    info,
    ['DeviceIdentifier', 'DeviceNode', 'deviceIdentifier'],
    normalizeDeviceIdentifierAlias,
    { required: true },
  );
  const volumeUuid = normalizedAliasFamily(
    info,
    ['VolumeUUID', 'APFSVolumeUUID', 'volumeUUID'],
    normalizeUuidAlias,
    { required: true },
  );
  const dfMountPoint = normalizeMountPathAlias(dfRecord.mountPoint);
  const dfDeviceIdentifier = normalizeDeviceIdentifierAlias(dfRecord.sourceDevice);
  const exactInspectedPath = normalizeMountPathAlias(inspectedPath);
  const aliasConflict = filesystem.conflict || mount.conflict || device.conflict
    || volumeUuid.conflict || dfMountPoint === null || dfDeviceIdentifier === null
    || exactInspectedPath === null || mount.value !== dfMountPoint
    || device.value !== dfDeviceIdentifier;
  return Object.freeze({
    ...decision,
    aliasConflicts: Object.freeze({
      device: device.conflict,
      filesystem: filesystem.conflict,
      mountPoint: mount.conflict || mount.value !== dfMountPoint,
      volumeUuid: volumeUuid.conflict,
    }),
    deviceId: deviceId === null || deviceId === undefined ? null : String(deviceId),
    deviceIdentifier: device.value,
    dfDeviceIdentifier,
    dfMountPoint,
    fsType: filesystem.value,
    inspectedPath: exactInspectedPath,
    mountPoint: mount.value,
    parseConflict: decision.parseConflict || aliasConflict,
    volumeUuid: volumeUuid.value,
  });
}

export function inspectMountSystem(target) {
  const dfRecord = parseDfMountRecord(commandResult('/bin/df', ['-P', target]));
  const info = plistToJson(commandResult('/usr/sbin/diskutil', [
    'info',
    '-plist',
    dfRecord.mountPoint,
  ]));
  const entry = inspectEntrySystem(target);
  return normalizeDiskutilMountInfo(info, dfRecord, target, entry.deviceId);
}

function normalizedFsType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateInternalApfsIdentity(config, identity) {
  const target = identity?.targetEntry;
  const parent = identity?.parentEntry;
  const volume = identity?.parentMount;
  const expectedParent = path.dirname(config.mountPoint);
  if (!target?.exists || !target.isDirectory || target.isSymbolicLink
      || target.realPath !== config.mountPoint) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'canonical backend data path is not an exact real directory');
  }
  if (!parent?.exists || !parent.isDirectory || parent.isSymbolicLink
      || parent.realPath !== expectedParent) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'canonical backend parent is not an exact real directory');
  }
  if (!target.deviceId || !parent.deviceId
      || String(target.deviceId) !== String(parent.deviceId)) {
    fail('BARE_LOCAL_OVERLAY', 'canonical backend data path is wrapped by another filesystem');
  }
  if (!volume || volume.parseConflict === true) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing-volume identity is missing or contradictory');
  }
  const inspectedPath = normalizeMountPathAlias(volume.inspectedPath);
  const volumeMountPoint = normalizeMountPathAlias(volume.mountPoint);
  const dfMountPoint = normalizeMountPathAlias(volume.dfMountPoint);
  const deviceIdentifier = normalizeDeviceIdentifierAlias(volume.deviceIdentifier);
  const dfDeviceIdentifier = normalizeDeviceIdentifierAlias(volume.dfDeviceIdentifier);
  if (inspectedPath !== expectedParent || volumeMountPoint === null
      || dfMountPoint === null || volumeMountPoint !== dfMountPoint
      || deviceIdentifier === null || dfDeviceIdentifier === null
      || deviceIdentifier !== dfDeviceIdentifier) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing-volume mount or device evidence is not coherently bound', {
      deviceIdentifier,
      dfDeviceIdentifier,
      dfMountPoint,
      inspectedPath,
      volumeMountPoint,
    });
  }
  if (!volume.deviceId || String(volume.deviceId) !== String(parent.deviceId)) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing-volume inspection is not bound to the backend parent device');
  }
  const fsType = normalizedFsType(volume.fsType);
  if (fsType !== 'apfs') {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing filesystem is not APFS', { fsType });
  }
  if (volume.readOnly === true || volume.writable !== true
      || volume.ownersEnabled !== true || volume.internal !== true) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing APFS volume is not internal, writable, and ownership-enabled');
  }
  if (!sameUuid(volume.volumeUuid, config.expectedVolumeUuid)) {
    fail('INTERNAL_MOUNTPOINT_INVALID', 'containing APFS UUID does not match the canonical pin', {
      actual: volume.volumeUuid ?? null,
      expected: config.expectedVolumeUuid,
    });
  }
  return identity;
}

export async function collectInternalIdentity(config, adapters) {
  const parentPath = path.dirname(config.mountPoint);
  const [targetEntry, parentEntry, parentMount] = await Promise.all([
    adapters.inspectEntry(config.mountPoint),
    adapters.inspectEntry(parentPath),
    adapters.inspectMount(parentPath),
  ]);
  return Object.freeze({ targetEntry, parentEntry, parentMount });
}

export async function ensureMounted(config, adapters = createSystemAdapters()) {
  const identity = await collectInternalIdentity(config, adapters);
  validateInternalApfsIdentity(config, identity);
  return Object.freeze({
    alreadyMounted: true,
    identity,
    mode: 'internal-apfs',
  });
}

function pipeGuardianOutput(stdout, stderr) {
  if (stdout && typeof stdout.pipe === 'function') stdout.pipe(process.stdout, { end: false });
  if (stderr && typeof stderr.pipe === 'function') stderr.pipe(process.stderr, { end: false });
  return () => {
    stdout?.unpipe?.(process.stdout);
    stderr?.unpipe?.(process.stderr);
  };
}

export function createSystemAdapters(overrides = {}) {
  return Object.freeze({
    inspectEntry: inspectEntrySystem,
    inspectMount: inspectMountSystem,
    prepareGuardian(options) {
      return prepareGuardedBackendWriter(options);
    },
    assertRecoveryBarrier() {
      return assertRecoveryStateAllowsWriter();
    },
    validateGuardianTerminal(evidence, options) {
      return validateBackendOperationGuardianTerminalEvidence(evidence, options);
    },
    pipeGuardianOutput,
    sleep(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
    ...overrides,
  });
}

function assertAdapters(adapters) {
  const required = [
    'inspectEntry',
    'inspectMount',
    'prepareGuardian',
    'assertRecoveryBarrier',
    'validateGuardianTerminal',
    'pipeGuardianOutput',
    'sleep',
  ];
  const missing = required.filter((name) => typeof adapters?.[name] !== 'function');
  if (missing.length > 0) {
    fail('ADAPTER_INVALID', 'backend storage adapters are incomplete', { missing });
  }
  return adapters;
}

function subscribeSupervisorSignals(source) {
  if (!source || typeof source.on !== 'function'
      || typeof source.removeListener !== 'function') {
    fail('SUPERVISOR_SIGNAL_SOURCE_INVALID', 'signal source must implement on/removeListener');
  }
  let receivedSignal = null;
  let resolveSignal;
  const promise = new Promise((resolve) => { resolveSignal = resolve; });
  const handlers = new Map(SIGNALS.map((signal) => [signal, () => {
    if (receivedSignal !== null) return;
    receivedSignal = signal;
    resolveSignal(signal);
  }]));
  try {
    for (const [signal, handler] of handlers) source.on(signal, handler);
  } catch (error) {
    for (const [signal, handler] of handlers) {
      try { source.removeListener(signal, handler); } catch {}
    }
    fail('SUPERVISOR_SIGNAL_SOURCE_INVALID', 'unable to subscribe supervisor signals', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return Object.freeze({
    promise,
    get signal() { return receivedSignal; },
    cleanup() {
      for (const [signal, handler] of handlers) source.removeListener(signal, handler);
    },
  });
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function exactWriterFile(candidate, label, executable, hashContents = false) {
  let fd;
  try {
    const pathnameBefore = fs.lstatSync(candidate);
    if (pathnameBefore.isSymbolicLink() || !pathnameBefore.isFile()
        || pathnameBefore.nlink !== 1
        || fs.realpathSync.native(candidate) !== candidate
        || (pathnameBefore.mode & 0o022) !== 0
        || (executable && (pathnameBefore.mode & 0o111) === 0)) {
      fail(
        label === 'prebuilt backend server'
          ? 'WRITER_ARTIFACT_INVALID'
          : 'WRITER_EXECUTABLE_INVALID',
        `${label} failed exact file identity validation`,
        { path: candidate },
      );
    }
    if (executable) fs.accessSync(candidate, fs.constants.X_OK);
    fd = fs.openSync(
      candidate,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const openedBefore = fs.fstatSync(fd);
    if (!sameFileIdentity(pathnameBefore, openedBefore)) {
      fail(
        label === 'prebuilt backend server'
          ? 'WRITER_ARTIFACT_INVALID'
          : 'WRITER_EXECUTABLE_INVALID',
        `${label} changed while opening`,
        { path: candidate },
      );
    }
    const digest = hashContents
      ? crypto.createHash('sha256').update(fs.readFileSync(fd)).digest('hex')
      : null;
    const openedAfter = fs.fstatSync(fd);
    const pathnameAfter = fs.lstatSync(candidate);
    if (!sameFileIdentity(openedBefore, openedAfter)
        || !sameFileIdentity(openedAfter, pathnameAfter)) {
      fail(
        label === 'prebuilt backend server'
          ? 'WRITER_ARTIFACT_INVALID'
          : 'WRITER_EXECUTABLE_INVALID',
        `${label} changed while reading`,
        { path: candidate },
      );
    }
    return Object.freeze({ digest, stat: openedAfter });
  } catch (error) {
    if (error instanceof BackendStorageGuardError) throw error;
    fail(
      label === 'prebuilt backend server'
        ? 'WRITER_ARTIFACT_MISSING'
        : 'WRITER_EXECUTABLE_INVALID',
      `${label} is unavailable`,
      { path: candidate, cause: error?.code ?? error?.message },
    );
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function validateWriterArgv(writerArgv, options = {}) {
  if (!Array.isArray(writerArgv) || writerArgv.length !== 2
      || writerArgv.some((argument) => typeof argument !== 'string'
        || argument.length === 0 || argument.includes('\0'))) {
    fail('WRITER_COMMAND_INVALID', 'writer argv must be exactly direct Node + prebuilt server');
  }
  if (!path.isAbsolute(writerArgv[0]) || path.resolve(writerArgv[0]) !== writerArgv[0]
      || !path.isAbsolute(writerArgv[1]) || path.resolve(writerArgv[1]) !== writerArgv[1]) {
    fail('WRITER_COMMAND_INVALID', 'writer executable and prebuilt server must be normalized absolute paths');
  }
  const fixture = options.fixtureWriterIdentity;
  if (fixture !== undefined && options.allowFixtureWriterIdentity !== true) {
    fail('WRITER_COMMAND_INVALID', 'fixture writer identity requires explicit test-only enablement');
  }
  const expectedNode = fixture?.nodePath ?? CANONICAL_NODE_BINARY;
  const expectedServer = fixture?.serverPath ?? CANONICAL_BACKEND_SERVER_ARTIFACT;
  const expectedSha256 = fixture?.serverSha256 ?? CANONICAL_BACKEND_SERVER_SHA256;
  if (writerArgv[0] !== expectedNode || writerArgv[1] !== expectedServer) {
    fail('WRITER_COMMAND_INVALID', 'writer argv does not match the enrolled direct Node/server pair', {
      expectedNode,
      expectedServer,
    });
  }
  exactWriterFile(expectedNode, 'enrolled Node executable', true);
  const server = exactWriterFile(expectedServer, 'prebuilt backend server', false, true);
  if (typeof expectedSha256 !== 'string' || !SHA256_PATTERN.test(expectedSha256)) {
    fail('WRITER_ARTIFACT_PIN_MISSING', 'prebuilt backend server has no reviewed SHA-256 pin');
  }
  const actualSha256 = server.digest;
  if (actualSha256 !== expectedSha256) {
    fail('WRITER_ARTIFACT_DIGEST_MISMATCH', 'prebuilt backend server digest drifted', {
      expectedSha256,
      actualSha256,
    });
  }
  return Object.freeze({
    argv: Object.freeze([...writerArgv]),
    nodePath: expectedNode,
    serverPath: expectedServer,
    serverSha256: actualSha256,
  });
}

function writerEnvironment(options = {}) {
  if (Object.hasOwn(options, 'env')) {
    fail(
      'WRITER_ENV_OVERRIDE_FORBIDDEN',
      'arbitrary writer environment overrides are forbidden',
    );
  }
  if (options.fixtureWriterEnvironment === undefined) {
    return PRODUCTION_WRITER_ENVIRONMENT;
  }
  if (options.allowFixtureWriterEnvironment !== true
      || options.allowFixtureWriterIdentity !== true
      || options.fixtureWriterIdentity === undefined
      || options.adapters === undefined
      || !isPlainObject(options.fixtureWriterEnvironment)) {
    fail(
      'WRITER_ENV_OVERRIDE_FORBIDDEN',
      'fixture writer environment requires the complete explicit test-only seam',
    );
  }
  const environment = Object.create(null);
  for (const [key, value] of Object.entries(options.fixtureWriterEnvironment)) {
    if (typeof value !== 'string' || value.includes('\0')) {
      fail('WRITER_ENV_OVERRIDE_FORBIDDEN', 'fixture writer environment is malformed');
    }
    environment[key] = value;
  }
  return Object.freeze(environment);
}

function assertDirectCliEnvironmentSafe(environment = process.env) {
  const forbidden = Object.keys(environment).filter((key) => (
    DIRECT_CLI_FORBIDDEN_ENVIRONMENT_KEYS.has(key)
      || key.startsWith('DYLD_')
      || key.startsWith('LD_')
  ));
  if (forbidden.length > 0) {
    fail(
      'DIRECT_CLI_ENVIRONMENT_FORBIDDEN',
      'direct production CLI refuses inherited preload or backend path overrides',
      { forbidden: forbidden.sort() },
    );
  }
}

function assertGuardianShape(guardian) {
  const methods = ['assertHeld', 'start', 'abort', 'terminate', 'terminateAfterLoss'];
  const missing = methods.filter((name) => typeof guardian?.[name] !== 'function');
  if (!guardian || missing.length > 0
      || guardian.phase !== 'prepared'
      || typeof guardian.loss?.then !== 'function'
      || typeof guardian.closed?.then !== 'function') {
    fail('GUARDIAN_ADAPTER_INVALID', 'prepareGuardian returned an incomplete guardian', {
      missing,
    });
  }
  return guardian;
}

async function assertRecoveryBarrier(adapters) {
  const receipt = await adapters.assertRecoveryBarrier();
  if (!receipt || receipt.ok !== true || receipt.markerAbsent !== true
      || !Number.isSafeInteger(receipt.transactionsChecked)
      || receipt.transactionsChecked < 0
      || !Number.isSafeInteger(receipt.finalClosuresChecked)
      || receipt.finalClosuresChecked < 0) {
    fail('RECOVERY_BARRIER_INVALID', 'recovery-state adapter returned malformed acceptance evidence');
  }
  return receipt;
}

function resultFromTerminal(terminal, ready, extras = {}) {
  const termSignal = terminal.writerTermSignal;
  const exitCode = terminal.writerExitCode;
  return Object.freeze({
    code: Number.isInteger(exitCode) && exitCode >= 0 ? exitCode : null,
    signal: Number.isInteger(termSignal) && termSignal > 0 ? termSignal : null,
    writerStarted: terminal.runningEvent !== null,
    alreadyMounted: ready.alreadyMounted,
    stoppedForIdentityLoss: false,
    terminal,
    ...extras,
  });
}

async function validateTerminal(adapters, terminal, options = {}) {
  try {
    const validated = await adapters.validateGuardianTerminal(terminal);
    const allowedReleaseReasons = options.allowedReleaseReasons ?? [];
    if (options.requireExactRelease === true
        && (validated.released !== true
          || validated.releaseVerified !== true
          || validated.releasedEvent === null
          || validated.exitCode !== 0
          || validated.signal !== null
          || validated.unexpected !== false
          || !allowedReleaseReasons.includes(validated.releasedEvent?.reason))) {
      fail('GUARDIAN_TERMINAL_INVALID', 'guardian did not provide an exact non-loss release');
    }
    return validated;
  } catch (error) {
    throw new BackendStorageGuardError(
      'GUARDIAN_TERMINAL_INVALID',
      'guardian terminal evidence failed exact validation',
      { causeCode: error?.code ?? null },
    );
  }
}

async function cleanupGuardian(guardian, adapters, writerStarted, reason) {
  try {
    let terminal;
    let allowedReleaseReasons;
    if (guardian.phase === 'closed') {
      terminal = await guardian.closed;
      allowedReleaseReasons = ['abort_prepared', 'terminate_request', 'writer_group_exit'];
    } else if (writerStarted) {
      terminal = await guardian.terminate();
      allowedReleaseReasons = ['terminate_request'];
    } else {
      terminal = await guardian.abort();
      allowedReleaseReasons = ['abort_prepared'];
    }
    await validateTerminal(adapters, terminal, {
      requireExactRelease: true,
      allowedReleaseReasons,
    });
    return terminal;
  } catch (error) {
    throw new BackendStorageGuardError(
      'GUARDIAN_CLEANUP_FAILED',
      `guardian cleanup failed during ${reason}`,
      { causeCode: error?.code ?? null },
    );
  }
}

async function lossAlreadySettled(lossPromise) {
  return Promise.race([
    lossPromise.then(() => true, () => true),
    new Promise((resolve) => setTimeout(resolve, 0, false)),
  ]);
}

async function terminalSettledWithinTick(closedPromise) {
  return Promise.race([
    closedPromise.then((terminal) => ({ settled: true, terminal })),
    new Promise((resolve) => setTimeout(resolve, 0, { settled: false, terminal: null })),
  ]);
}

export async function superviseWriter(config, writerArgv, options = {}) {
  if (hasOwn(options, 'recoveryStateOptions')) {
    fail(
      'RECOVERY_BARRIER_OVERRIDE_FORBIDDEN',
      'writer supervision accepts only the canonical or factory-bound zero-argument recovery barrier',
    );
  }
  const checkedConfig = validateConfig(config, {
    expectedCanonicalMountPoint: options.expectedCanonicalMountPoint,
    expectedInternalVolumeUuid: options.expectedInternalVolumeUuid,
  });
  const writerIdentity = validateWriterArgv(writerArgv, options);
  const argv = writerIdentity.argv;
  const guardedWriterEnvironment = writerEnvironment(options);
  const adapters = assertAdapters(options.adapters ?? createSystemAdapters());
  const supervisorSignals = subscribeSupervisorSignals(options.signalSource ?? process);
  const monitorIntervalMs = options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS;
  let guardian = null;
  let writerStarted = false;
  let cleanupAttempted = false;
  let ready = null;
  let outputCleanup = () => {};

  try {
    guardian = assertGuardianShape(await adapters.prepareGuardian({
      purpose: 'writer',
      lockPath: BACKEND_OPERATION_LOCK_PATH,
      command: argv[0],
      args: argv.slice(1),
      cwd: options.cwd ?? REPO_ROOT,
      env: guardedWriterEnvironment,
      timeoutMs: options.guardianTimeoutMs,
      acquireCloseTimeoutMs: options.guardianAcquireCloseTimeoutMs,
      startCleanupCloseTimeoutMs: options.guardianStartCleanupCloseTimeoutMs,
    }));
    guardian.assertHeld();
    await assertRecoveryBarrier(adapters);

    ready = await ensureMounted(checkedConfig, adapters);
    if (supervisorSignals.signal !== null) {
      cleanupAttempted = true;
      const terminal = await cleanupGuardian(
        guardian,
        adapters,
        false,
        'pre-start supervisor signal',
      );
      return resultFromTerminal(terminal, ready, {
        supervisorSignal: supervisorSignals.signal,
      });
    }

    guardian.assertHeld();
    await assertRecoveryBarrier(adapters);
    const freshIdentity = await collectInternalIdentity(checkedConfig, adapters);
    validateInternalApfsIdentity(checkedConfig, freshIdentity);
    if (supervisorSignals.signal !== null) {
      cleanupAttempted = true;
      const terminal = await cleanupGuardian(
        guardian,
        adapters,
        false,
        'final pre-start supervisor signal',
      );
      return resultFromTerminal(terminal, ready, {
        supervisorSignal: supervisorSignals.signal,
      });
    }
    guardian.assertHeld();
    validateWriterArgv(argv, options);
    if (await lossAlreadySettled(guardian.loss)) {
      cleanupAttempted = true;
      let cleanupError = null;
      try { await guardian.terminateAfterLoss(); } catch (error) { cleanupError = error; }
      fail('OPERATION_LOCK_LOST', 'operation guardian reported loss before writer start', {
        cleanupCode: cleanupError?.code ?? null,
      });
    }

    const cleanupOutput = adapters.pipeGuardianOutput(guardian.stdout, guardian.stderr);
    if (cleanupOutput !== undefined && typeof cleanupOutput !== 'function') {
      fail('ADAPTER_INVALID', 'pipeGuardianOutput must return a cleanup function or undefined');
    }
    outputCleanup = cleanupOutput ?? (() => {});
    try {
      await guardian.start();
    } catch (error) {
      throw new BackendStorageGuardError(
        'WRITER_START_FAILED',
        'operation guardian could not start the direct writer',
        { causeCode: error?.code ?? null },
      );
    }
    writerStarted = true;
    const closed = guardian.closed.then((terminal) => ({ kind: 'closed', terminal }));
    const loss = guardian.loss.then((evidence) => ({ kind: 'loss', evidence }));

    for (;;) {
      const outcome = await Promise.race([
        closed,
        loss,
        supervisorSignals.promise.then((signal) => ({ kind: 'supervisor-signal', signal })),
        adapters.sleep(monitorIntervalMs).then(() => ({ kind: 'probe' })),
      ]);
      if (outcome.kind === 'closed') {
        cleanupAttempted = true;
        const terminal = await validateTerminal(adapters, outcome.terminal, {
          requireExactRelease: true,
          allowedReleaseReasons: ['writer_group_exit'],
        });
        return resultFromTerminal(terminal, ready);
      }
      if (outcome.kind === 'loss') {
        cleanupAttempted = true;
        let terminal = null;
        let cleanupError = null;
        try {
          terminal = await guardian.terminateAfterLoss({
            timeoutMs: options.guardianLossCleanupTimeoutMs,
          });
          await validateTerminal(adapters, terminal);
        } catch (error) {
          cleanupError = error;
        }
        throw new BackendStorageGuardError(
          'OPERATION_LOCK_LOST',
          'operation guardian reported loss while the writer was active',
          {
            nativeEvent: outcome.evidence?.nativeEvent ?? null,
            terminal,
            cleanupCode: cleanupError?.code ?? null,
          },
        );
      }
      if (outcome.kind === 'supervisor-signal') {
        cleanupAttempted = true;
        const terminal = await cleanupGuardian(
          guardian,
          adapters,
          true,
          'supervisor signal',
        );
        return resultFromTerminal(terminal, ready, {
          supervisorSignal: outcome.signal,
        });
      }

      try {
        guardian.assertHeld();
        const currentIdentity = await collectInternalIdentity(checkedConfig, adapters);
        validateInternalApfsIdentity(checkedConfig, currentIdentity);
      } catch (error) {
        const concurrentClose = await terminalSettledWithinTick(guardian.closed);
        if (concurrentClose.settled) {
          cleanupAttempted = true;
          const terminal = await validateTerminal(adapters, concurrentClose.terminal, {
            requireExactRelease: true,
            allowedReleaseReasons: ['writer_group_exit'],
          });
          return resultFromTerminal(terminal, ready);
        }
        if (await lossAlreadySettled(guardian.loss)) {
          cleanupAttempted = true;
          let terminal = null;
          let cleanupError = null;
          try {
            terminal = await guardian.terminateAfterLoss({
              timeoutMs: options.guardianLossCleanupTimeoutMs,
            });
            await validateTerminal(adapters, terminal);
          } catch (lossCleanupError) {
            cleanupError = lossCleanupError;
          }
          throw new BackendStorageGuardError(
            'OPERATION_LOCK_LOST',
            'operation guardian lost the lease during an identity probe',
            {
              causeCode: error?.code ?? null,
              terminal,
              cleanupCode: cleanupError?.code ?? null,
            },
          );
        }
        cleanupAttempted = true;
        const terminal = await cleanupGuardian(
          guardian,
          adapters,
          true,
          'storage identity loss',
        );
        throw new BackendStorageGuardError(
          error?.code === 'LOCK_NOT_OBSERVED_HELD'
            ? 'OPERATION_LOCK_LOST'
            : 'MOUNT_IDENTITY_LOST',
          'backend writer stopped after guarded identity validation failed',
          { causeCode: error?.code ?? null, terminal },
        );
      }
    }
  } catch (error) {
    if (guardian && !cleanupAttempted && guardian.phase !== 'closed') {
      cleanupAttempted = true;
      try {
        await cleanupGuardian(
          guardian,
          adapters,
          writerStarted,
          'error unwind',
        );
      } catch (cleanupError) {
        throw new BackendStorageGuardError(
          'GUARDIAN_CLEANUP_FAILED',
          'guardian cleanup failed while preserving an earlier error',
          {
            causeCode: error?.code ?? null,
            cleanupCode: cleanupError?.code ?? null,
          },
        );
      }
    }
    throw error;
  } finally {
    try { outputCleanup(); } catch {}
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
  return Object.freeze({
    command,
    configPath,
    writerArgv: separator >= 0 ? rest.slice(separator + 1) : [],
  });
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCli(argv);
  if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
    process.stdout.write([
      'Usage:',
      `  backend-storage-guard.mjs supervise --config ${FIXED_CONFIG_PATH} -- <node> <prebuilt-server>`,
      '',
    ].join('\n'));
    return 0;
  }
  assertDirectCliEnvironmentSafe();
  if (parsed.configPath !== FIXED_CONFIG_PATH) {
    fail('CONFIG_PATH_INVALID', 'production guard requires the fixed backend config path', {
      actual: parsed.configPath,
      expected: FIXED_CONFIG_PATH,
    });
  }
  const config = loadConfig(parsed.configPath);
  if (parsed.command !== 'supervise' || parsed.writerArgv.length < 2) {
    fail('CLI_USAGE', 'supervise requires direct Node + prebuilt server argv');
  }
  const result = await superviseWriter(config, parsed.writerArgv);
  if (result.signal || result.supervisorSignal) return 1;
  if (Number.isInteger(result.code) && result.code >= 0 && result.code <= 255) {
    return result.code;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${JSON.stringify({
        ok: false,
        code: error?.code ?? 'BACKEND_STORAGE_GUARD_FAILED',
        error: error instanceof Error ? error.message : String(error),
        details: error?.details ?? {},
      })}\n`);
      process.exitCode = 1;
    },
  );
}
