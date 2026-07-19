#!/usr/bin/env node

/**
 * Kernel-backed cross-process exclusion for backend recovery and writers.
 *
 * Recovery/verification use a native hold lease. A supervised writer instead
 * starts beneath a native guardian and an independent sentinel. The controller
 * and sentinel hold distinct OFD byte-range locks; the writer receives only an
 * anonymous pipe capability on fd 198. No lock description crosses a spawn or
 * fork boundary after acquisition.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const PROTOCOL_PREFIX = 'YURI_BACKEND_LOCK_V1';
const EVENT_NAMES = new Set([
  'READY',
  'PREPARED',
  'RUNNING',
  'EXEC_FAILED',
  'TERMINATING',
  'WRITER_EXITED',
  'PROTOCOL_ERROR',
  'HELPER_SIGNAL',
  'GUARDIAN_SIGNAL',
  'GROUP_STALLED',
  'LOCK_PATH_CHANGED',
  'CAPABILITY_CHANGED',
  'CAPABILITY_STALLED',
  'CONTROLLER_LOST',
  'SENTINEL_DIED',
  'DESCENDANT_UNPROVABLE',
  'SENTINEL_RELEASED',
  'IDENTITY_STALLED',
  'RELEASED',
]);
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;
const MAX_EVENT_LINE_BYTES = 4096;
const PURPOSES = new Set(['restore', 'verify', 'writer']);
const MAX_NATIVE_PID = 2_147_483_647;
const MAX_NATIVE_SIGNAL = 127;
const MAX_WRITER_ENV_BYTES = 64 * 1024;
const DARWIN_APFS_FS_TYPE = 0x1a;
const LOSS_EVENT_NAMES = new Set([
  'PROTOCOL_ERROR',
  'HELPER_SIGNAL',
  'GUARDIAN_SIGNAL',
  'GROUP_STALLED',
  'LOCK_PATH_CHANGED',
  'CAPABILITY_CHANGED',
  'CAPABILITY_STALLED',
  'CONTROLLER_LOST',
  'SENTINEL_DIED',
  'DESCENDANT_UNPROVABLE',
  'IDENTITY_STALLED',
]);
const DANGEROUS_ENVIRONMENT_KEYS = new Set([
  'CC', 'CXX', 'CPP', 'CFLAGS', 'CXXFLAGS', 'CPPFLAGS', 'LDFLAGS',
  'LIBRARY_PATH', 'CPATH', 'COMPILER_PATH', 'GCC_EXEC_PREFIX', 'SDKROOT',
  'NODE_OPTIONS', 'BUN_OPTIONS', 'PYTHONPATH', 'PYTHONHOME',
]);
const SEALED_PROCESS_ENV = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  LANG: 'C',
  LC_ALL: 'C',
  TMPDIR: '/private/tmp',
});
const EVENT_SCHEMAS = Object.freeze({
  PREPARED: Object.freeze([
    'nonce', 'event', 'sentinel_pid', 'sentinel_start_sec', 'sentinel_start_usec',
    'writer_pid', 'pgid', 'writer_start_sec', 'writer_start_usec', 'lease_fd',
    'capability_handle', 'capability_peer_handle',
    'exec_device', 'exec_inode', 'exec_uid', 'exec_mode',
  ]),
  RUNNING: Object.freeze([
    'nonce', 'event', 'sentinel_pid', 'sentinel_start_sec', 'sentinel_start_usec',
    'writer_pid', 'pgid', 'writer_start_sec', 'writer_start_usec', 'lease_fd',
    'capability_handle', 'capability_peer_handle',
    'exec_device', 'exec_inode', 'exec_uid', 'exec_mode',
  ]),
  EXEC_FAILED: Object.freeze(['nonce', 'event', 'error_number']),
  TERMINATING: Object.freeze(['nonce', 'event', 'reason', 'pgid']),
  WRITER_EXITED: Object.freeze(['nonce', 'event', 'exit_code', 'term_signal']),
  PROTOCOL_ERROR: Object.freeze(['nonce', 'event', 'phase']),
  HELPER_SIGNAL: Object.freeze(['nonce', 'event', 'signal', 'phase']),
  GUARDIAN_SIGNAL: Object.freeze(['nonce', 'event', 'signal', 'phase']),
  GROUP_STALLED: Object.freeze(['nonce', 'event', 'reason', 'pgid']),
  LOCK_PATH_CHANGED: Object.freeze(['nonce', 'event', 'phase']),
  CAPABILITY_CHANGED: Object.freeze(['nonce', 'event', 'writer_pid', 'lease_fd', 'matching_fds']),
  CAPABILITY_STALLED: Object.freeze(['nonce', 'event', 'reason']),
  CONTROLLER_LOST: Object.freeze(['nonce', 'event', 'phase', 'controller_pid']),
  SENTINEL_DIED: Object.freeze(['nonce', 'event', 'sentinel_pid', 'exit_code', 'term_signal', 'phase']),
  DESCENDANT_UNPROVABLE: Object.freeze([
    'nonce', 'event', 'reason', 'writer_pid', 'pgid', 'proc_fflags',
  ]),
  SENTINEL_RELEASED: Object.freeze(['nonce', 'event', 'sentinel_pid', 'reason']),
  IDENTITY_STALLED: Object.freeze(['nonce', 'event', 'writer_pid', 'pgid', 'phase']),
  RELEASED: Object.freeze(['nonce', 'event', 'reason']),
});
const READY_SCHEMAS = Object.freeze({
  hold: Object.freeze(['nonce', 'event', 'mode', 'helper_pid']),
  guardian: Object.freeze([
    'nonce', 'event', 'mode', 'helper_pid', 'sentinel_pid',
    'sentinel_start_sec', 'sentinel_start_usec', 'lock_device', 'lock_inode',
    'capability_handle', 'capability_peer_handle',
  ]),
});
const GUARDIAN_RELEASE_REASONS = new Set([
  'prepare_failed', 'event_channel_lost', 'guardian_signal',
  'control_eof_prepared', 'protocol_error_prepared', 'abort_prepared',
  'exec_signal_failed', 'exec_failed', 'writer_group_exit',
  'writer_descendants_lingering', 'writer_capability_changed', 'control_error',
  'control_eof_running', 'protocol_error_running', 'terminate_request',
  'controller_lost', 'sentinel_died', 'event_channel_lost',
  'descendant_unprovable',
]);
const HOLD_RELEASE_REASONS = new Set(['request', 'control_eof', 'protocol_error', 'helper_signal']);
const ALWAYS_UNEXPECTED_RELEASE_REASONS = new Set([
  'prepare_failed', 'event_channel_lost', 'guardian_signal',
  'control_eof_prepared', 'protocol_error_prepared', 'exec_signal_failed',
  'writer_descendants_lingering', 'writer_lease_changed', 'control_error',
  'control_eof_running', 'protocol_error_running', 'control_eof',
  'protocol_error', 'helper_signal', 'controller_lost', 'sentinel_died',
  'writer_capability_changed', 'event_channel_lost',
  'descendant_unprovable',
]);

export const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
export const BACKEND_OPERATION_LOCK_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM/state/backend-volume/backend-operation-lock-anchor/backend-operation.lock',
);
export const BACKEND_OPERATION_LOCK_SOURCE = path.join(
  REPO_ROOT,
  '_SYSTEM/Scripts/backend-operation-lock.c',
);
export const BACKEND_OPERATION_LOCK_SOURCE_SHA256 =
  '99c92d4beee6aedca30c020b29c1738a83e6c507a7a35f5cd73b779c40fdb381';
export const BACKEND_HELPER_BIN_ROOT = path.join(
  REPO_ROOT,
  '_SYSTEM/state/backend-volume/bin',
);
export const BACKEND_WRITER_LEASE_FD = 198;

export class BackendOperationLockError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BackendOperationLockError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new BackendOperationLockError(code, message, details);
}

function validatePurpose(value, allowed = PURPOSES) {
  if (typeof value !== 'string' || !PURPOSES.has(value) || !allowed.has(value)) {
    fail('LOCK_PURPOSE_INVALID', `backend operation purpose must be one of ${[...allowed].join('|')}`);
  }
  return value;
}

function exactAbsolute(value, label) {
  if (typeof value !== 'string'
      || !path.isAbsolute(value)
      || path.resolve(value) !== value
      || value.includes('\0')) {
    fail('PATH_INVALID', `${label} must be an absolute normalized path`);
  }
  return value;
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid
    && left.mode === right.mode
    && left.nlink === right.nlink;
}

function sameNodeIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function immutableClone(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => immutableClone(entry)));
  }
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, immutableClone(entry)]),
    ));
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(',')}}`;
  }
  fail('LOCK_RECEIPT_INVALID', 'receipt transcript contains a non-canonical value');
}

/** Deterministic verifier for the ordered native-event transcript in receipts. */
export function hashBackendOperationTranscript(transcript) {
  if (!Array.isArray(transcript)) {
    fail('LOCK_RECEIPT_INVALID', 'backend operation transcript must be an array');
  }
  return sha256(Buffer.from(canonicalJson(transcript), 'utf8'));
}

export function hashBackendOperationAcquisitionAttestation(attestation) {
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    fail('LOCK_ATTESTATION_INVALID', 'acquisition attestation must be an object');
  }
  const { attestationSha256, ...base } = attestation;
  return sha256(Buffer.from(canonicalJson(base), 'utf8'));
}

function evidenceEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function exactKeys(value, expected, code = 'LOCK_ATTESTATION_INVALID', label = 'record') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, `${label} has missing or extra keys`, { actual, expected: wanted });
  }
  return value;
}

function canonicalInteger(value, minimum, maximum, code, label) {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(code, `${label} must be a canonical integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(code, `${label} is outside its allowed numeric bound`);
  }
  return parsed;
}

function canonicalUnsigned64(value, code, label) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(code, `${label} must be a canonical unsigned integer`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    fail(code, `${label} exceeds uint64`);
  }
  return parsed;
}

function validateNativeEvent(event, mode, code = 'LOCK_PROTOCOL_ERROR') {
  const schema = event?.event === 'READY'
    ? READY_SCHEMAS[mode ?? event?.mode]
    : EVENT_SCHEMAS[event?.event];
  if (!schema) fail(code, 'native helper event name is invalid');
  exactKeys(event, schema, code, `native ${event.event} event`);
  const orderedKeys = Object.keys(event);
  if (orderedKeys.some((key, index) => key !== schema[index])) {
    fail(code, `native ${event.event} event fields are reordered`, {
      actualKeys: orderedKeys,
      expectedKeys: schema,
    });
  }
  if (!/^[a-f0-9]{64}$/u.test(event.nonce ?? '')) {
    fail(code, 'native event nonce is invalid');
  }
  const pid = (value, label) => canonicalInteger(value, 2, MAX_NATIVE_PID, code, label);
  const nonnegative = (value, label) => canonicalInteger(value, 0, Number.MAX_SAFE_INTEGER, code, label);
  switch (event.event) {
    case 'READY':
      if ((event.mode !== 'hold' && event.mode !== 'guardian')
          || (mode !== undefined && event.mode !== mode)) {
        fail(code, 'native READY mode is invalid');
      }
      pid(event.helper_pid, 'READY helper_pid');
      if (event.mode === 'guardian') {
        pid(event.sentinel_pid, 'READY sentinel_pid');
        canonicalUnsigned64(event.sentinel_start_sec, code, 'READY sentinel_start_sec');
        canonicalUnsigned64(event.sentinel_start_usec, code, 'READY sentinel_start_usec');
        canonicalUnsigned64(event.lock_device, code, 'READY lock_device');
        canonicalUnsigned64(event.lock_inode, code, 'READY lock_inode');
        canonicalUnsigned64(event.capability_handle, code, 'READY capability_handle');
        canonicalUnsigned64(event.capability_peer_handle, code, 'READY capability_peer_handle');
      }
      break;
    case 'PREPARED':
    case 'RUNNING': {
      const writerPid = pid(event.writer_pid, `${event.event} writer_pid`);
      if (pid(event.pgid, `${event.event} pgid`) !== writerPid
          || canonicalInteger(event.lease_fd, BACKEND_WRITER_LEASE_FD, BACKEND_WRITER_LEASE_FD, code, `${event.event} lease_fd`) !== BACKEND_WRITER_LEASE_FD) {
        fail(code, `${event.event} writer process-group or lease-fd identity is invalid`);
      }
      canonicalUnsigned64(event.exec_device, code, `${event.event} exec_device`);
      canonicalUnsigned64(event.exec_inode, code, `${event.event} exec_inode`);
      nonnegative(event.exec_uid, `${event.event} exec_uid`);
      const execMode = canonicalInteger(event.exec_mode, 1, 0o7777, code, `${event.event} exec_mode`);
      if ((execMode & 0o111) === 0) fail(code, `${event.event} executable mode is not executable`);
      pid(event.sentinel_pid, `${event.event} sentinel_pid`);
      canonicalUnsigned64(event.sentinel_start_sec, code, `${event.event} sentinel_start_sec`);
      canonicalUnsigned64(event.sentinel_start_usec, code, `${event.event} sentinel_start_usec`);
      canonicalUnsigned64(event.writer_start_sec, code, `${event.event} writer_start_sec`);
      canonicalUnsigned64(event.writer_start_usec, code, `${event.event} writer_start_usec`);
      canonicalUnsigned64(event.capability_handle, code, `${event.event} capability_handle`);
      canonicalUnsigned64(event.capability_peer_handle, code, `${event.event} capability_peer_handle`);
      break;
    }
    case 'EXEC_FAILED':
      canonicalInteger(event.error_number, 1, 4096, code, 'EXEC_FAILED error_number');
      break;
    case 'TERMINATING':
      if (!GUARDIAN_RELEASE_REASONS.has(event.reason)) fail(code, 'TERMINATING reason is invalid');
      pid(event.pgid, 'TERMINATING pgid');
      break;
    case 'WRITER_EXITED': {
      const exitCode = canonicalInteger(event.exit_code, -1, 255, code, 'WRITER_EXITED exit_code');
      const signal = canonicalInteger(event.term_signal, 0, MAX_NATIVE_SIGNAL, code, 'WRITER_EXITED term_signal');
      if ((exitCode === -1) === (signal === 0)) {
        fail(code, 'WRITER_EXITED must describe exactly one exit-code or signal result');
      }
      break;
    }
    case 'PROTOCOL_ERROR':
      if (!['hold', 'prepared', 'running'].includes(event.phase)) fail(code, 'PROTOCOL_ERROR phase is invalid');
      break;
    case 'HELPER_SIGNAL':
      canonicalInteger(event.signal, 1, MAX_NATIVE_SIGNAL, code, 'HELPER_SIGNAL signal');
      if (event.phase !== 'hold') fail(code, 'HELPER_SIGNAL phase is invalid');
      break;
    case 'GUARDIAN_SIGNAL':
      canonicalInteger(event.signal, 1, MAX_NATIVE_SIGNAL, code, 'GUARDIAN_SIGNAL signal');
      if (!['prepared', 'running'].includes(event.phase)) fail(code, 'GUARDIAN_SIGNAL phase is invalid');
      break;
    case 'GROUP_STALLED':
      if (![...GUARDIAN_RELEASE_REASONS, 'writer_reap_stalled'].includes(event.reason)) {
        fail(code, 'GROUP_STALLED reason is invalid');
      }
      pid(event.pgid, 'GROUP_STALLED pgid');
      break;
    case 'LOCK_PATH_CHANGED':
      if (![
        'hold', 'hold_release', 'guardian_release', 'guardian_release_probe',
        'guardian_group_stalled', 'guardian_reap_stalled', 'prepared', 'running',
      ].includes(event.phase)) fail(code, 'LOCK_PATH_CHANGED phase is invalid');
      break;
    case 'CAPABILITY_CHANGED':
      pid(event.writer_pid, 'CAPABILITY_CHANGED writer_pid');
      canonicalInteger(event.lease_fd, BACKEND_WRITER_LEASE_FD, BACKEND_WRITER_LEASE_FD, code, 'CAPABILITY_CHANGED lease_fd');
      canonicalInteger(event.matching_fds, -1, 1024, code, 'CAPABILITY_CHANGED matching_fds');
      break;
    case 'CAPABILITY_STALLED':
      if (event.reason !== 'escaped_capability') fail(code, 'CAPABILITY_STALLED reason is invalid');
      break;
    case 'CONTROLLER_LOST':
      if (!['sentinel_ready', 'prepared', 'running', 'releasing'].includes(event.phase)) {
        fail(code, 'CONTROLLER_LOST phase is invalid');
      }
      pid(event.controller_pid, 'CONTROLLER_LOST controller_pid');
      break;
    case 'SENTINEL_DIED': {
      pid(event.sentinel_pid, 'SENTINEL_DIED sentinel_pid');
      const sentinelExit = canonicalInteger(event.exit_code, -1, 255, code, 'SENTINEL_DIED exit_code');
      const sentinelSignal = canonicalInteger(event.term_signal, 0, MAX_NATIVE_SIGNAL, code, 'SENTINEL_DIED term_signal');
      if (sentinelExit !== -1 && sentinelSignal !== 0) fail(code, 'SENTINEL_DIED result is ambiguous');
      if (!['preparation', 'enrollment', 'prepared', 'running'].includes(event.phase)) {
        fail(code, 'SENTINEL_DIED phase is invalid');
      }
      break;
    }
    case 'DESCENDANT_UNPROVABLE':
      if (![
        'proc_fork', 'proc_exec', 'proc_trackerr', 'proc_child', 'proc_unknown',
        'proc_event_error', 'proc_event_unknown', 'exec_identity_mismatch', 'sentinel_lost',
      ].includes(event.reason)) {
        fail(code, 'DESCENDANT_UNPROVABLE reason is invalid');
      }
      pid(event.writer_pid, 'DESCENDANT_UNPROVABLE writer_pid');
      pid(event.pgid, 'DESCENDANT_UNPROVABLE pgid');
      canonicalInteger(
        event.proc_fflags,
        0,
        0xffff_ffff,
        code,
        'DESCENDANT_UNPROVABLE proc_fflags',
      );
      break;
    case 'SENTINEL_RELEASED':
      pid(event.sentinel_pid, 'SENTINEL_RELEASED sentinel_pid');
      if (!GUARDIAN_RELEASE_REASONS.has(event.reason)) fail(code, 'SENTINEL_RELEASED reason is invalid');
      break;
    case 'IDENTITY_STALLED':
      pid(event.writer_pid, 'IDENTITY_STALLED writer_pid');
      pid(event.pgid, 'IDENTITY_STALLED pgid');
      if (!['enrollment', 'term', 'kill', 'fallback_term', 'fallback_kill'].includes(event.phase)) {
        fail(code, 'IDENTITY_STALLED phase is invalid');
      }
      break;
    case 'RELEASED': {
      const reasons = mode === 'hold' ? HOLD_RELEASE_REASONS : GUARDIAN_RELEASE_REASONS;
      if (!reasons.has(event.reason)) fail(code, 'RELEASED reason is invalid for the lifecycle mode');
      break;
    }
    default:
      fail(code, 'native event schema is unsupported');
  }
  return event;
}

function eventFrameFromEvidence(event) {
  return `${PROTOCOL_PREFIX} ${Object.entries(event).map(([key, value]) => `${key}=${value}`).join(' ')}`;
}

function validateIdentityRecord(record, label, { mode, sha = false, linkCount = false } = {}) {
  exactKeys(
    record,
    ['path', 'device', 'inode', 'uid', 'mode', ...(sha ? ['sha256'] : []), ...(linkCount ? ['nlink'] : [])],
    'LOCK_ATTESTATION_INVALID',
    `${label} identity`,
  );
  if (!record || typeof record !== 'object'
      || typeof record.path !== 'string'
      || !path.isAbsolute(record.path)
      || path.resolve(record.path) !== record.path
      || !Number.isSafeInteger(record.device)
      || !Number.isSafeInteger(record.inode)
      || !Number.isSafeInteger(record.uid)
      || !Number.isSafeInteger(record.mode)
      || (mode !== undefined && record.mode !== mode)
      || (sha && !/^[a-f0-9]{64}$/u.test(record.sha256 ?? ''))
      || (linkCount && record.nlink !== 1)) {
    fail('LOCK_ATTESTATION_INVALID', `${label} identity record is invalid`);
  }
  return record;
}

function validateHelperEvidence(value) {
  exactKeys(
    value,
    ['schemaVersion', 'expectedSourceSha256', 'source', 'snapshot', 'binary', 'buildRoot'],
    'LOCK_ATTESTATION_INVALID',
    'helper evidence',
  );
  if (!value || value.schemaVersion !== 2
      || !/^[a-f0-9]{64}$/u.test(value.expectedSourceSha256 ?? '')) {
    fail('LOCK_ATTESTATION_INVALID', 'helper evidence header is invalid');
  }
  validateIdentityRecord(value.source, 'helper source', { sha: true });
  validateIdentityRecord(value.snapshot, 'helper snapshot', { mode: 0o400, sha: true });
  validateIdentityRecord(value.binary, 'helper binary', { mode: 0o500, sha: true });
  validateIdentityRecord(value.buildRoot, 'helper build root', { mode: 0o500 });
  if ((value.source.mode & 0o022) !== 0
      || value.source.sha256 !== value.expectedSourceSha256
      || value.snapshot.sha256 !== value.expectedSourceSha256) {
    fail('LOCK_ATTESTATION_INVALID', 'helper source trust chain is inconsistent');
  }
  return value;
}

function validateLockIdentity(value) {
  exactKeys(
    value,
    ['path', 'device', 'inode', 'uid', 'mode', 'nlink', 'size', 'immutable', 'anchor'],
    'LOCK_ATTESTATION_INVALID',
    'backend operation lock identity',
  );
  if (value.immutable !== false || value.size !== 2) {
    fail('LOCK_ATTESTATION_INVALID', 'backend operation lock must be a mutable two-byte file');
  }
  validateIdentityRecord(
    {
      path: value.path,
      device: value.device,
      inode: value.inode,
      uid: value.uid,
      mode: value.mode,
      nlink: value.nlink,
    },
    'backend operation lock',
    { mode: 0o600, linkCount: true },
  );
  exactKeys(
    value.anchor,
    ['path', 'device', 'inode', 'uid', 'mode', 'immutable'],
    'LOCK_ATTESTATION_INVALID',
    'backend operation lock anchor',
  );
  if (value.anchor.immutable !== true) {
    fail('LOCK_ATTESTATION_INVALID', 'backend operation lock anchor is not immutable-sealed');
  }
  validateIdentityRecord(
    {
      path: value.anchor.path,
      device: value.anchor.device,
      inode: value.anchor.inode,
      uid: value.anchor.uid,
      mode: value.anchor.mode,
    },
    'backend operation lock anchor',
    { mode: 0o500 },
  );
  if (path.dirname(value.path) !== value.anchor.path
      || value.device !== value.anchor.device) {
    fail('LOCK_ATTESTATION_INVALID', 'backend operation lock is not bound to its recorded anchor');
  }
  return value;
}

function validateWriterExecutableIdentity(value, label = 'writer executable') {
  exactKeys(
    value,
    ['path', 'device', 'inode', 'uid', 'mode', 'nlink'],
    'LOCK_ATTESTATION_INVALID',
    `${label} identity`,
  );
  if (typeof value.path !== 'string'
      || !path.isAbsolute(value.path)
      || path.resolve(value.path) !== value.path
      || canonicalUnsigned64(value.device, 'LOCK_ATTESTATION_INVALID', `${label} device`) < 0n
      || canonicalUnsigned64(value.inode, 'LOCK_ATTESTATION_INVALID', `${label} inode`) < 0n
      || !Number.isSafeInteger(value.uid)
      || value.uid < 0
      || !Number.isSafeInteger(value.mode)
      || value.mode < 0
      || value.mode > 0o7777
      || !Number.isSafeInteger(value.nlink)
      || value.nlink < 1) {
    fail('LOCK_ATTESTATION_INVALID', `${label} link count is invalid`);
  }
  if ((value.mode & 0o111) === 0) {
    fail('LOCK_ATTESTATION_INVALID', `${label} mode is not executable`);
  }
  return value;
}

function validateSentinelIdentity(value) {
  exactKeys(value, ['pid', 'startSec', 'startUsec'], 'LOCK_ATTESTATION_INVALID', 'sentinel identity');
  if (!Number.isSafeInteger(value.pid) || value.pid <= 1) {
    fail('LOCK_ATTESTATION_INVALID', 'sentinel pid is invalid');
  }
  canonicalUnsigned64(value.startSec, 'LOCK_ATTESTATION_INVALID', 'sentinel startSec');
  canonicalUnsigned64(value.startUsec, 'LOCK_ATTESTATION_INVALID', 'sentinel startUsec');
  return value;
}

function validateWriterProcessIdentity(value) {
  exactKeys(value, ['pid', 'pgid', 'startSec', 'startUsec'], 'LOCK_ATTESTATION_INVALID', 'writer process identity');
  if (!Number.isSafeInteger(value.pid) || value.pid <= 1 || value.pgid !== value.pid) {
    fail('LOCK_ATTESTATION_INVALID', 'writer process identity is invalid');
  }
  canonicalUnsigned64(value.startSec, 'LOCK_ATTESTATION_INVALID', 'writer startSec');
  canonicalUnsigned64(value.startUsec, 'LOCK_ATTESTATION_INVALID', 'writer startUsec');
  return value;
}

function validateCapabilityIdentity(value) {
  exactKeys(value, ['leaseFd', 'handle', 'peerHandle'], 'LOCK_ATTESTATION_INVALID', 'writer capability');
  if (value.leaseFd !== BACKEND_WRITER_LEASE_FD) {
    fail('LOCK_ATTESTATION_INVALID', 'writer capability lease fd is invalid');
  }
  canonicalUnsigned64(value.handle, 'LOCK_ATTESTATION_INVALID', 'capability handle');
  canonicalUnsigned64(value.peerHandle, 'LOCK_ATTESTATION_INVALID', 'capability peer handle');
  if (value.handle === value.peerHandle) {
    fail('LOCK_ATTESTATION_INVALID', 'capability pipe endpoints are not distinct');
  }
  return value;
}

function sameCapabilityPair(leftHandle, leftPeer, rightHandle, rightPeer) {
  return (leftHandle === rightHandle && leftPeer === rightPeer)
    || (leftHandle === rightPeer && leftPeer === rightHandle);
}

function validateEvidenceTranscript(transcript, nonce, mode) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    fail('LOCK_ATTESTATION_INVALID', 'ordered event transcript is empty or invalid');
  }
  const events = [];
  for (let index = 0; index < transcript.length; index += 1) {
    const entry = transcript[index];
    if (!entry || entry.sequence !== index + 1
        || !validIsoTimestamp(entry.observedAt)
        || typeof entry.nativeFrame !== 'string'
        || !entry.event || entry.event.nonce !== nonce
        || !EVENT_NAMES.has(entry.event.event)
        || entry.nativeFrame !== eventFrameFromEvidence(entry.event)) {
      fail('LOCK_ATTESTATION_INVALID', 'ordered event transcript entry is invalid', {
        sequence: index + 1,
      });
    }
    validateNativeEvent(entry.event, mode, 'LOCK_ATTESTATION_INVALID');
    validateEventTransition(mode, events, entry.event);
    events.push(entry.event);
  }
  return events;
}

/** Validate a READY-bound acquisition attestation without touching live state. */
export function validateBackendOperationAcquisitionAttestation(value, options = {}) {
  const expectedKeys = value?.mode === 'guardian'
    ? [
      'schemaVersion', 'type', 'mode', 'purpose', 'nonce', 'pid', 'acquiredAt',
      'readyEvent', 'readyFrame', 'preparedAt', 'preparedEvent', 'preparedFrame',
      'sentinelIdentity', 'writerIdentity', 'capability', 'writerExecutable',
      'helper', 'lock', 'attestationSha256',
    ]
    : [
      'schemaVersion', 'type', 'mode', 'purpose', 'nonce', 'pid', 'acquiredAt',
      'readyEvent', 'readyFrame', 'helper', 'lock', 'attestationSha256',
    ];
  exactKeys(value, expectedKeys, 'LOCK_ATTESTATION_INVALID', 'acquisition attestation');
  if (!value || value.schemaVersion !== 1
      || value.type !== 'backend-operation-lock-acquisition'
      || (value.mode !== 'hold' && value.mode !== 'guardian')
      || !/^[a-f0-9]{64}$/u.test(value.nonce ?? '')
      || !Number.isSafeInteger(value.pid)
      || value.pid <= 1
      || !validIsoTimestamp(value.acquiredAt)
      || value.readyEvent?.event !== 'READY'
      || value.readyEvent?.nonce !== value.nonce
      || value.readyEvent?.mode !== value.mode
      || canonicalInteger(
        value.readyEvent?.helper_pid,
        2,
        MAX_NATIVE_PID,
        'LOCK_ATTESTATION_INVALID',
        'READY helper_pid',
      ) !== value.pid
      || value.readyFrame !== eventFrameFromEvidence(value.readyEvent)) {
    fail('LOCK_ATTESTATION_INVALID', 'acquisition attestation header or READY binding is invalid');
  }
  const allowedPurposes = value.mode === 'hold'
    ? new Set(['restore', 'verify'])
    : new Set(['writer']);
  validatePurpose(value.purpose, allowedPurposes);
  if (options.expectedPurpose !== undefined && value.purpose !== options.expectedPurpose) {
    fail('LOCK_PURPOSE_MISMATCH', 'acquisition purpose does not match the consuming operation');
  }
  if (options.expectedMode !== undefined && value.mode !== options.expectedMode) {
    fail('LOCK_ATTESTATION_INVALID', 'acquisition mode does not match the consuming operation');
  }
  validateNativeEvent(value.readyEvent, value.mode, 'LOCK_ATTESTATION_INVALID');
  validateHelperEvidence(value.helper);
  validateLockIdentity(value.lock);
  if (value.mode === 'guardian') {
    validateNativeEvent(value.preparedEvent, 'guardian', 'LOCK_ATTESTATION_INVALID');
    validateSentinelIdentity(value.sentinelIdentity);
    validateWriterProcessIdentity(value.writerIdentity);
    validateCapabilityIdentity(value.capability);
    validateWriterExecutableIdentity(value.writerExecutable);
    if (!validIsoTimestamp(value.preparedAt)
        || value.acquiredAt > value.preparedAt
        || value.preparedEvent.event !== 'PREPARED'
        || value.preparedEvent.nonce !== value.nonce
        || value.preparedFrame !== eventFrameFromEvidence(value.preparedEvent)
        || value.preparedEvent.exec_device !== value.writerExecutable.device
        || value.preparedEvent.exec_inode !== value.writerExecutable.inode
        || Number(value.preparedEvent.exec_uid) !== value.writerExecutable.uid
        || Number(value.preparedEvent.exec_mode) !== value.writerExecutable.mode
        || Number(value.readyEvent.sentinel_pid) !== value.sentinelIdentity.pid
        || value.readyEvent.sentinel_start_sec !== value.sentinelIdentity.startSec
        || value.readyEvent.sentinel_start_usec !== value.sentinelIdentity.startUsec
        || Number(value.preparedEvent.sentinel_pid) !== value.sentinelIdentity.pid
        || value.preparedEvent.sentinel_start_sec !== value.sentinelIdentity.startSec
        || value.preparedEvent.sentinel_start_usec !== value.sentinelIdentity.startUsec
        || Number(value.preparedEvent.writer_pid) !== value.writerIdentity.pid
        || Number(value.preparedEvent.pgid) !== value.writerIdentity.pgid
        || value.preparedEvent.writer_start_sec !== value.writerIdentity.startSec
        || value.preparedEvent.writer_start_usec !== value.writerIdentity.startUsec
        || Number(value.preparedEvent.lease_fd) !== value.capability.leaseFd
        || !sameCapabilityPair(
          value.readyEvent.capability_handle,
          value.readyEvent.capability_peer_handle,
          value.capability.handle,
          value.capability.peerHandle,
        )
        || !sameCapabilityPair(
          value.preparedEvent.capability_handle,
          value.preparedEvent.capability_peer_handle,
          value.capability.handle,
          value.capability.peerHandle,
        )
        || value.readyEvent.lock_device !== String(value.lock.device)
        || value.readyEvent.lock_inode !== String(value.lock.inode)) {
      fail('LOCK_ATTESTATION_INVALID', 'guardian PREPARED or writer executable binding is invalid');
    }
  }
  const expectedPairs = [
    ['expectedNonce', value.nonce],
    ['expectedAcquiredAt', value.acquiredAt],
    ['expectedLockPath', value.lock.path],
    ['expectedSourcePath', value.helper.source.path],
    ['expectedSourceSha256', value.helper.expectedSourceSha256],
    ['expectedBinaryPath', value.helper.binary.path],
    ['expectedBinarySha256', value.helper.binary.sha256],
    ['expectedPid', value.pid],
  ];
  if (value.mode === 'guardian') {
    expectedPairs.push(
      ['expectedPreparedAt', value.preparedAt],
      ['expectedSentinelPid', value.sentinelIdentity.pid],
      ['expectedWriterStartSec', value.writerIdentity.startSec],
      ['expectedWriterStartUsec', value.writerIdentity.startUsec],
      ['expectedWriterPid', Number(value.preparedEvent.writer_pid)],
      ['expectedPgid', Number(value.preparedEvent.pgid)],
      ['expectedLeaseFd', Number(value.preparedEvent.lease_fd)],
    );
  }
  for (const [optionName, actual] of expectedPairs) {
    if (options[optionName] !== undefined && options[optionName] !== actual) {
      fail('LOCK_EXPECTATION_MISMATCH', `${optionName} does not match acquisition evidence`);
    }
  }
  if (options.expectedLockIdentity !== undefined
      && !evidenceEqual(options.expectedLockIdentity, value.lock)) {
    fail('LOCK_EXPECTATION_MISMATCH', 'expected lock identity does not match acquisition evidence');
  }
  if (options.expectedWriterExecutable !== undefined
      && !evidenceEqual(options.expectedWriterExecutable, value.writerExecutable)) {
      fail('LOCK_EXPECTATION_MISMATCH', 'expected writer executable does not match acquisition evidence');
  }
  if (options.expectedSentinelIdentity !== undefined
      && !evidenceEqual(options.expectedSentinelIdentity, value.sentinelIdentity)) {
    fail('LOCK_EXPECTATION_MISMATCH', 'expected sentinel identity does not match acquisition evidence');
  }
  if (options.expectedWriterIdentity !== undefined
      && !evidenceEqual(options.expectedWriterIdentity, value.writerIdentity)) {
    fail('LOCK_EXPECTATION_MISMATCH', 'expected writer identity does not match acquisition evidence');
  }
  if (options.expectedCapability !== undefined
      && !evidenceEqual(options.expectedCapability, value.capability)) {
    fail('LOCK_EXPECTATION_MISMATCH', 'expected capability does not match acquisition evidence');
  }
  if (options.expectedHelperEvidence !== undefined
      && !evidenceEqual(options.expectedHelperEvidence, value.helper)) {
    fail('LOCK_EXPECTATION_MISMATCH', 'expected helper evidence does not match acquisition evidence');
  }
  if (value.attestationSha256 !== hashBackendOperationAcquisitionAttestation(value)) {
    fail('LOCK_ATTESTATION_DIGEST_MISMATCH', 'acquisition attestation digest does not match');
  }
  return value;
}

function validateTerminalCommon(value, options) {
  const { expectedMode, expectedPurpose } = options;
  const expectedKeys = [
    'schemaVersion', 'type', 'mode', 'purpose', 'nonce', 'pid', 'acquisition',
    'requestedAt', 'terminalAt', 'releasedAt', 'released', 'releaseVerified',
    'releasedEvent', 'releasedFrame', 'exitCode', 'code', 'signal', 'unexpected',
    'helper', 'lock', 'orderedEventTranscript', 'events', 'transcriptSha256',
    'stderr', 'runningAt', 'runningEvent', 'runningFrame', 'writerExitCode',
    'writerTermSignal', 'writerSucceeded', 'sentinelReleasedAt',
    'sentinelReleasedEvent', 'sentinelReleasedFrame',
    ...(value?.type === 'backend-operation-lock-release-evidence' ? ['lockPath'] : []),
  ];
  exactKeys(value, expectedKeys, 'LOCK_ATTESTATION_INVALID', 'terminal evidence');
  if (!value || value.schemaVersion !== 1
      || value.mode !== expectedMode
      || value.purpose !== expectedPurpose
      || value.nonce !== value.acquisition?.nonce
      || value.pid !== value.acquisition?.pid
      || !validIsoTimestamp(value.terminalAt)
      || (value.requestedAt !== null && !validIsoTimestamp(value.requestedAt))
      || typeof value.unexpected !== 'boolean'
      || !(value.exitCode === null || Number.isSafeInteger(value.exitCode))
      || !(value.signal === null || /^SIG[A-Z0-9]+$/u.test(value.signal))
      || value.code !== value.exitCode
      || typeof value.stderr !== 'string'
      || Buffer.byteLength(value.stderr, 'utf8') > MAX_DIAGNOSTIC_BYTES
      || (value.type === 'backend-operation-lock-release-evidence'
        && value.lockPath !== value.acquisition?.lock?.path)
      || !evidenceEqual(value.helper, value.acquisition?.helper)
      || !evidenceEqual(value.lock, value.acquisition?.lock)) {
    fail('LOCK_ATTESTATION_INVALID', 'terminal evidence header is invalid');
  }
  validateBackendOperationAcquisitionAttestation(value.acquisition, {
    ...options,
    expectedMode,
    expectedPurpose,
  });
  const events = validateEvidenceTranscript(value.orderedEventTranscript, value.nonce, expectedMode);
  const first = value.orderedEventTranscript[0];
  if (!first
      || first.observedAt !== value.acquisition.acquiredAt
      || first.nativeFrame !== value.acquisition.readyFrame
      || !evidenceEqual(first.event, value.acquisition.readyEvent)) {
    fail('LOCK_ATTESTATION_INVALID', 'terminal READY evidence is not exactly acquisition-bound');
  }
  if (expectedMode === 'guardian') {
    const prepared = value.orderedEventTranscript[1];
    if (!prepared
        || prepared.observedAt !== value.acquisition.preparedAt
        || prepared.nativeFrame !== value.acquisition.preparedFrame
        || !evidenceEqual(prepared.event, value.acquisition.preparedEvent)) {
      fail('LOCK_ATTESTATION_INVALID', 'terminal PREPARED evidence is not exactly acquisition-bound');
    }
  }
  const nativeUnexpectedEvent = events.some((event) => LOSS_EVENT_NAMES.has(event.event));
  if (value.transcriptSha256 !== hashBackendOperationTranscript(value.orderedEventTranscript)
      || !evidenceEqual(value.events, events)) {
    fail('LOCK_ATTESTATION_DIGEST_MISMATCH', 'terminal transcript digest or event projection is invalid');
  }
  const releases = value.orderedEventTranscript.filter((entry) => entry.event.event === 'RELEASED');
  const release = releases.length === 1 ? releases[0] : null;
  const unsafeReleaseReason = release !== null
    && ALWAYS_UNEXPECTED_RELEASE_REASONS.has(release.event.reason);
  if ((nativeUnexpectedEvent || unsafeReleaseReason) && value.unexpected !== true) {
    fail(
      'LOCK_ATTESTATION_INVALID',
      'native loss/stall/control/protocol evidence cannot be classified as expected',
    );
  }
  const exactRelease = release !== null
    && release.sequence === value.orderedEventTranscript.length
    && release.event.nonce === value.nonce;
  const sentinelReleases = value.orderedEventTranscript.filter(
    (entry) => entry.event.event === 'SENTINEL_RELEASED',
  );
  const sentinelRelease = sentinelReleases.length === 1 ? sentinelReleases[0] : null;
  const sentinelAttestedRelease = expectedMode === 'guardian'
    && sentinelRelease !== null
    && exactRelease
    && sentinelRelease.sequence < release.sequence
    && Number(sentinelRelease.event.sentinel_pid) === value.acquisition.sentinelIdentity.pid
    && sentinelRelease.event.reason === release.event.reason;
  const releaseVerified = exactRelease
    && (expectedMode === 'hold' || sentinelAttestedRelease);
  if (value.released !== exactRelease
      || value.releaseVerified !== releaseVerified
      || (exactRelease && (!evidenceEqual(value.releasedEvent, release.event)
        || value.releasedFrame !== release.nativeFrame
        || value.releasedAt !== release.observedAt))
      || (!exactRelease && (value.releasedEvent !== null
        || value.releasedFrame !== null
        || value.releasedAt !== null))) {
    fail('LOCK_ATTESTATION_INVALID', 'terminal RELEASED evidence is inconsistent');
  }
  if ((sentinelRelease === null && (value.sentinelReleasedAt !== null
      || value.sentinelReleasedEvent !== null
      || value.sentinelReleasedFrame !== null))
      || (sentinelRelease !== null && (value.sentinelReleasedAt !== sentinelRelease.observedAt
        || value.sentinelReleasedFrame !== sentinelRelease.nativeFrame
        || !evidenceEqual(value.sentinelReleasedEvent, sentinelRelease.event)))) {
    fail('LOCK_ATTESTATION_INVALID', 'terminal sentinel release evidence is inconsistent');
  }
  if (expectedMode === 'hold' && sentinelRelease !== null) {
    fail('LOCK_ATTESTATION_INVALID', 'hold lifecycle cannot contain sentinel release evidence');
  }
  const runningEntries = value.orderedEventTranscript.filter((entry) => entry.event.event === 'RUNNING');
  const running = runningEntries.length === 1 ? runningEntries[0] : null;
  if ((running === null && (value.runningAt !== null
      || value.runningEvent !== null
      || value.runningFrame !== null))
      || (running !== null && (value.runningAt !== running.observedAt
        || value.runningFrame !== running.nativeFrame
        || !evidenceEqual(value.runningEvent, running.event)))) {
    fail('LOCK_ATTESTATION_INVALID', 'terminal RUNNING evidence is inconsistent');
  }
  if (running !== null && expectedMode !== 'guardian') {
    fail('LOCK_ATTESTATION_INVALID', 'hold lifecycle cannot contain RUNNING evidence');
  }
  if (running !== null) {
    const prepared = value.acquisition.preparedEvent;
    for (const key of [
      'sentinel_pid', 'sentinel_start_sec', 'sentinel_start_usec',
      'writer_pid', 'pgid', 'writer_start_sec', 'writer_start_usec', 'lease_fd',
      'capability_handle', 'capability_peer_handle',
      'exec_device', 'exec_inode', 'exec_uid', 'exec_mode',
    ]) {
      if (running.event[key] !== prepared[key]) {
        fail('LOCK_ATTESTATION_INVALID', `RUNNING ${key} is not PREPARED-bound`);
      }
    }
  }
  const writerExits = events.filter((event) => event.event === 'WRITER_EXITED');
  if (expectedMode === 'hold') {
    if (writerExits.length !== 0
        || value.writerExitCode !== null
        || value.writerTermSignal !== null
        || value.writerSucceeded !== null) {
      fail('LOCK_ATTESTATION_INVALID', 'hold terminal evidence cannot contain a writer result');
    }
  } else if (writerExits.length === 1) {
    const writerExitCode = Number(writerExits[0].exit_code);
    const writerTermSignal = Number(writerExits[0].term_signal);
    const writerSucceeded = writerExitCode === 0 && writerTermSignal === 0;
    if (value.writerExitCode !== writerExitCode
        || value.writerTermSignal !== writerTermSignal
        || value.writerSucceeded !== writerSucceeded) {
      fail('LOCK_ATTESTATION_INVALID', 'guardian writer result is not transcript-bound');
    }
  } else if (writerExits.length === 0 && !exactRelease && value.unexpected) {
    if (value.writerExitCode !== null
        || value.writerTermSignal !== null
        || value.writerSucceeded !== null) {
      fail('LOCK_ATTESTATION_INVALID', 'unreleased guardian loss has a fabricated writer result');
    }
  } else {
    fail('LOCK_ATTESTATION_INVALID', 'guardian terminal evidence must contain exactly one writer result');
  }
  return value;
}

/** Validate the exact clean evidence returned by hold.release(). */
export function validateBackendOperationReleaseEvidence(value, options = {}) {
  if (value?.type !== 'backend-operation-lock-release-evidence') {
    fail('LOCK_ATTESTATION_INVALID', 'hold release evidence type is invalid');
  }
  const purpose = validatePurpose(
    options.expectedPurpose ?? value.purpose,
    new Set(['restore', 'verify']),
  );
  validateTerminalCommon(value, {
    ...options,
    expectedMode: 'hold',
    expectedPurpose: purpose,
  });
  if (!value.released
      || value.releasedEvent?.reason !== 'request'
      || value.exitCode !== 0
      || value.signal !== null
      || value.unexpected !== false
      || !validIsoTimestamp(value.requestedAt)
      || !validIsoTimestamp(value.releasedAt)
      || value.requestedAt > value.releasedAt) {
    fail('LOCK_ATTESTATION_INVALID', 'hold release evidence is not an exact clean release');
  }
  return value;
}

/** Validate a guardian terminal record; requireCleanRelease is opt-in. */
export function validateBackendOperationGuardianTerminalEvidence(value, options = {}) {
  if (value?.type !== 'backend-operation-lock-terminal-evidence') {
    fail('LOCK_ATTESTATION_INVALID', 'guardian terminal evidence type is invalid');
  }
  validateTerminalCommon(value, {
    ...options,
    expectedMode: 'guardian',
    expectedPurpose: 'writer',
  });
  const requireWriterSuccess = options.requireWriterSuccess === true
    || options.requireCleanRelease === true;
  if (options.requireCleanRelease
      && (!value.released || !value.releaseVerified || value.sentinelReleasedEvent === null
        || value.exitCode !== 0 || value.signal !== null || value.unexpected)) {
    fail('LOCK_ATTESTATION_INVALID', 'guardian terminal evidence is not a clean release');
  }
  if (requireWriterSuccess && value.writerSucceeded !== true) {
    fail('LOCK_ATTESTATION_INVALID', 'guardian writer did not exit successfully');
  }
  return value;
}

function readExactFile(value, label) {
  const absolute = exactAbsolute(value, label);
  let pathnameBefore;
  let fd;
  try {
    pathnameBefore = fs.lstatSync(absolute);
    if (!pathnameBefore.isFile()
        || pathnameBefore.isSymbolicLink()
        || pathnameBefore.nlink !== 1
        || fs.realpathSync.native(absolute) !== absolute) {
      fail('PATH_IDENTITY_MISMATCH', `${label} must be an exact single-link regular file`);
    }
    fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const openedBefore = fs.fstatSync(fd);
    if (!sameIdentity(pathnameBefore, openedBefore)) {
      fail('PATH_IDENTITY_MISMATCH', `${label} changed while opening`);
    }
    const bytes = fs.readFileSync(fd);
    const openedAfter = fs.fstatSync(fd);
    const pathnameAfter = fs.lstatSync(absolute);
    if (!sameIdentity(openedBefore, openedAfter)
        || !sameIdentity(openedAfter, pathnameAfter)) {
      fail('PATH_IDENTITY_MISMATCH', `${label} changed while reading`);
    }
    return Object.freeze({
      path: absolute,
      stat: openedAfter,
      bytes,
      sha256: sha256(bytes),
    });
  } catch (error) {
    if (error instanceof BackendOperationLockError) throw error;
    fail('PATH_UNAVAILABLE', `${label} is unavailable`, {
      cause: error?.code || error?.message || String(error),
    });
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function openWriterExecutable(value) {
  const command = exactAbsolute(value, 'backend writer command');
  let pathname;
  let fd;
  try {
    pathname = fs.lstatSync(command, { bigint: true });
    if (!pathname.isFile()
        || pathname.isSymbolicLink()
        || fs.realpathSync.native(command) !== command
        || (pathname.mode & 0o111n) === 0n) {
      fail(
        'WRITER_EXECUTABLE_IDENTITY_INVALID',
        'backend writer command must be an exact non-symlink executable regular file',
      );
    }
    fs.accessSync(command, fs.constants.X_OK);
    fd = fs.openSync(command, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd, { bigint: true });
    const after = fs.lstatSync(command, { bigint: true });
    if (!sameIdentity(pathname, opened)
        || !sameIdentity(opened, after)
        || !opened.isFile()
        || (opened.mode & 0o111n) === 0n) {
      fail('WRITER_EXECUTABLE_IDENTITY_INVALID', 'backend writer executable changed while opening');
    }
    const identity = Object.freeze({
      path: command,
      device: opened.dev.toString(),
      inode: opened.ino.toString(),
      uid: Number(opened.uid),
      mode: Number(opened.mode & 0o7777n),
      nlink: Number(opened.nlink),
    });
    validateWriterExecutableIdentity(identity);
    return Object.freeze({ fd, identity });
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (error instanceof BackendOperationLockError) throw error;
    fail('WRITER_EXECUTABLE_IDENTITY_INVALID', 'backend writer executable is unavailable', {
      cause: error.code || error.message,
    });
  }
}

function exactDirectory(value, label, { requiredMode } = {}) {
  const absolute = exactAbsolute(value, label);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    fail('PATH_UNAVAILABLE', `${label} is unavailable`, { cause: error.code || error.message });
  }
  if (!stat.isDirectory()
      || stat.isSymbolicLink()
      || fs.realpathSync.native(absolute) !== absolute
      || stat.uid !== process.getuid()) {
    fail('PATH_IDENTITY_MISMATCH', `${label} must be an exact owner-controlled directory`);
  }
  if (requiredMode !== undefined && (stat.mode & 0o777) !== requiredMode) {
    fail('PATH_MODE_UNSAFE', `${label} must have mode ${requiredMode.toString(8).padStart(4, '0')}`);
  }
  return Object.freeze({ path: absolute, stat });
}

function fsyncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function assertLocalApfs(pathname, label) {
  let filesystem;
  try {
    filesystem = fs.statfsSync(pathname);
  } catch (error) {
    fail('LOCK_ANCHOR_ATTESTATION_FAILED', `${label} filesystem could not be attested`, {
      cause: error?.code || error?.message || String(error),
    });
  }
  if (filesystem.type !== DARWIN_APFS_FS_TYPE) {
    fail('LOCK_ANCHOR_ATTESTATION_FAILED', `${label} must reside on local APFS`);
  }
}

function immutableFlags(pathname, label) {
  const result = spawnSync('/usr/bin/stat', ['-f', '%Sf', pathname], {
    env: SEALED_PROCESS_ENV,
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 16 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail('LOCK_ANCHOR_ATTESTATION_FAILED', `${label} flags could not be attested`, {
      status: result.status,
      cause: result.error?.message || result.stderr?.trim() || null,
    });
  }
  return new Set(result.stdout.trim().split(',').map((entry) => entry.trim()).filter(Boolean));
}

function assertImmutable(pathname, label) {
  if (!immutableFlags(pathname, label).has('uchg')) {
    fail('LOCK_ANCHOR_ATTESTATION_FAILED', `${label} lacks the macOS user-immutable flag`);
  }
}

function assertMutable(pathname, label) {
  if (immutableFlags(pathname, label).has('uchg')) {
    fail('LOCK_ANCHOR_ATTESTATION_FAILED', `${label} must not carry the macOS user-immutable flag`);
  }
}

function setImmutable(pathname, label) {
  const result = spawnSync('/usr/bin/chflags', ['uchg', pathname], {
    env: SEALED_PROCESS_ENV,
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 16 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail('LOCK_ANCHOR_SEAL_FAILED', `${label} could not be immutable-sealed`, {
      status: result.status,
      cause: result.error?.message || result.stderr?.trim() || null,
    });
  }
  assertImmutable(pathname, label);
}

function ensurePrivateDirectory(directory, label) {
  const absolute = exactAbsolute(directory, label);
  fs.mkdirSync(absolute, { recursive: true, mode: 0o700 });
  return exactDirectory(absolute, label, { requiredMode: 0o700 });
}

function attestRecord(file, record, label, { requiredMode, expectedSha256 } = {}) {
  if (file.stat.uid !== process.getuid()
      || file.stat.dev !== record.device
      || file.stat.ino !== record.inode
      || file.stat.nlink !== 1
      || (file.stat.mode & 0o777) !== record.mode
      || (requiredMode !== undefined && (file.stat.mode & 0o777) !== requiredMode)
      || file.sha256 !== record.sha256
      || (expectedSha256 !== undefined && file.sha256 !== expectedSha256)) {
    fail('HELPER_IDENTITY_MISMATCH', `${label} identity, mode, or digest changed`, {
      path: file.path,
    });
  }
}

function recordFor(file) {
  return Object.freeze({
    path: file.path,
    device: file.stat.dev,
    inode: file.stat.ino,
    uid: file.stat.uid,
    mode: file.stat.mode & 0o777,
    sha256: file.sha256,
  });
}

function lockRecordFor(file, anchor) {
  return Object.freeze({
    path: file.path,
    device: file.stat.dev,
    inode: file.stat.ino,
    uid: file.stat.uid,
    mode: file.stat.mode & 0o777,
    nlink: file.stat.nlink,
    size: file.stat.size,
    immutable: false,
    anchor: Object.freeze({
      path: anchor.path,
      device: anchor.stat.dev,
      inode: anchor.stat.ino,
      uid: anchor.stat.uid,
      mode: anchor.stat.mode & 0o777,
      immutable: true,
    }),
  });
}

function helperEvidence(helper) {
  const evidence = immutableClone({
    schemaVersion: helper.schemaVersion,
    expectedSourceSha256: helper.expectedSourceSha256,
    source: helper.source,
    snapshot: helper.snapshot,
    binary: helper.binary,
    buildRoot: helper.buildRoot,
  });
  return evidence;
}

function assertExactLockIdentity(lockIdentity) {
  let current;
  let anchor;
  try {
    current = readExactFile(lockIdentity.path, 'backend operation lock');
    anchor = exactDirectory(
      lockIdentity.anchor.path,
      'backend operation lock anchor',
      { requiredMode: 0o500 },
    );
    assertLocalApfs(anchor.path, 'backend operation lock anchor');
    assertMutable(lockIdentity.path, 'backend operation lock');
    assertImmutable(lockIdentity.anchor.path, 'backend operation lock anchor');
  } catch (error) {
    fail('LOCK_IDENTITY_MISMATCH', 'backend operation lock path no longer has its acquired identity', {
      cause: error.code || error.message,
      expected: lockIdentity,
    });
  }
  if (current.stat.dev !== lockIdentity.device
      || current.stat.ino !== lockIdentity.inode
      || current.stat.uid !== lockIdentity.uid
      || (current.stat.mode & 0o777) !== lockIdentity.mode
      || current.stat.nlink !== lockIdentity.nlink
      || current.stat.size !== lockIdentity.size
      || anchor.stat.dev !== lockIdentity.anchor.device
      || anchor.stat.ino !== lockIdentity.anchor.inode
      || anchor.stat.uid !== lockIdentity.anchor.uid
      || (anchor.stat.mode & 0o777) !== lockIdentity.anchor.mode
      || current.stat.uid !== process.getuid()
      || (current.stat.mode & 0o777) !== 0o600
      || current.stat.nlink !== 1
      || current.stat.size !== 2) {
    fail('LOCK_IDENTITY_MISMATCH', 'backend operation lock identity changed after acquisition', {
      expected: lockIdentity,
      actual: {
        lock: {
          path: current.path,
          device: current.stat.dev,
          inode: current.stat.ino,
          uid: current.stat.uid,
          mode: current.stat.mode & 0o777,
          nlink: current.stat.nlink,
          size: current.stat.size,
        },
        anchor: {
          path: anchor.path,
          device: anchor.stat.dev,
          inode: anchor.stat.ino,
          uid: anchor.stat.uid,
          mode: anchor.stat.mode & 0o777,
        },
      },
    });
  }
  return lockIdentity;
}

/**
 * Compile from a private immutable-by-mode snapshot, never the live source.
 * Production defaults to a build-time source digest pin. Fixture sources must
 * supply their own expectedSourceSha256 explicitly.
 */
export function compileFreshC(options = {}) {
  const sourcePath = exactAbsolute(
    options.sourcePath ?? BACKEND_OPERATION_LOCK_SOURCE,
    'helper source',
  );
  const expectedSourceSha256 = options.expectedSourceSha256
    ?? (sourcePath === BACKEND_OPERATION_LOCK_SOURCE
      ? BACKEND_OPERATION_LOCK_SOURCE_SHA256
      : null);
  if (typeof expectedSourceSha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(expectedSourceSha256)) {
    fail(
      'HELPER_SOURCE_PIN_REQUIRED',
      'helper compilation requires an exact expectedSourceSha256 pin',
    );
  }

  const source = readExactFile(sourcePath, 'helper source');
  if (source.stat.uid !== process.getuid()
      || (source.stat.mode & 0o022) !== 0
      || source.sha256 !== expectedSourceSha256) {
    fail('HELPER_SOURCE_DIGEST_MISMATCH', 'helper source does not match its trusted digest pin', {
      expectedSourceSha256,
      actualSourceSha256: source.sha256,
    });
  }

  const binRoot = ensurePrivateDirectory(
    options.binRoot ?? BACKEND_HELPER_BIN_ROOT,
    'helper binary root',
  );
  const label = String(options.label || 'backend-helper').replace(/[^a-z0-9-]/giu, '-');
  const buildRootPath = fs.mkdtempSync(path.join(binRoot.path, `${label}-build-`));
  fs.chmodSync(buildRootPath, 0o700);
  const buildRoot = exactDirectory(
    buildRootPath,
    'helper private build root',
    { requiredMode: 0o700 },
  );
  const snapshotPath = path.join(buildRoot.path, `${label}.source.c`);
  const snapshotFd = fs.openSync(
    snapshotPath,
    fs.constants.O_WRONLY
      | fs.constants.O_CREAT
      | fs.constants.O_EXCL
      | fs.constants.O_NOFOLLOW,
    0o400,
  );
  try {
    fs.writeFileSync(snapshotFd, source.bytes);
    fs.fsyncSync(snapshotFd);
  } finally {
    fs.closeSync(snapshotFd);
  }
  fs.chmodSync(snapshotPath, 0o400);
  fsyncDirectory(buildRoot.path);

  const snapshotBefore = readExactFile(snapshotPath, 'helper source snapshot');
  if (snapshotBefore.stat.uid !== process.getuid()
      || (snapshotBefore.stat.mode & 0o777) !== 0o400
      || snapshotBefore.sha256 !== expectedSourceSha256) {
    fail('HELPER_SNAPSHOT_MISMATCH', 'private helper source snapshot is not authentic');
  }

  const binaryPath = path.join(buildRoot.path, label);
  const result = spawnSync('/usr/bin/clang', [
    '-std=c11',
    '-Os',
    '-Wall',
    '-Wextra',
    '-Werror',
    snapshotBefore.path,
    '-o',
    binaryPath,
  ], {
    env: SEALED_PROCESS_ENV,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 5 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail('HELPER_COMPILE_FAILED', 'backend helper compilation failed', {
      status: result.status,
      stderr: result.stderr?.trim() || '',
      cause: result.error?.message || null,
    });
  }

  fs.chmodSync(binaryPath, 0o500);
  const binaryFd = fs.openSync(binaryPath, 'r');
  try {
    fs.fsyncSync(binaryFd);
  } finally {
    fs.closeSync(binaryFd);
  }
  fsyncDirectory(buildRoot.path);
  fsyncDirectory(binRoot.path);

  const sourceAfter = readExactFile(sourcePath, 'helper source');
  const snapshotAfter = readExactFile(snapshotPath, 'helper source snapshot');
  const binary = readExactFile(binaryPath, 'compiled helper');
  if (!sameIdentity(source.stat, sourceAfter.stat)
      || sourceAfter.sha256 !== expectedSourceSha256
      || !sameIdentity(snapshotBefore.stat, snapshotAfter.stat)
      || snapshotAfter.sha256 !== expectedSourceSha256
      || binary.stat.uid !== process.getuid()
      || (binary.stat.mode & 0o777) !== 0o500) {
    fail('HELPER_IDENTITY_MISMATCH', 'helper inputs or binary changed during compilation');
  }

  const sourceRecord = recordFor(sourceAfter);
  const snapshotRecord = recordFor(snapshotAfter);
  const binaryRecord = recordFor(binary);
  fs.chmodSync(buildRoot.path, 0o500);
  fsyncDirectory(buildRoot.path);
  fsyncDirectory(binRoot.path);
  const frozenBuildRoot = exactDirectory(
    buildRoot.path,
    'helper frozen build root',
    { requiredMode: 0o500 },
  );
  return Object.freeze({
    schemaVersion: 2,
    expectedSourceSha256,
    source: sourceRecord,
    snapshot: snapshotRecord,
    binary: binaryRecord,
    buildRoot: Object.freeze({
      path: frozenBuildRoot.path,
      device: frozenBuildRoot.stat.dev,
      inode: frozenBuildRoot.stat.ino,
      uid: frozenBuildRoot.stat.uid,
      mode: frozenBuildRoot.stat.mode & 0o777,
    }),
    // Stable compatibility fields for existing recovery code.
    path: binaryRecord.path,
    device: binaryRecord.device,
    inode: binaryRecord.inode,
    uid: binaryRecord.uid,
    mode: binaryRecord.mode,
    sha256: binaryRecord.sha256,
    sourceSha256: sourceRecord.sha256,
    snapshotPath: snapshotRecord.path,
  });
}

/** Re-attest live source, private snapshot, private build root, and binary. */
export function verifyCompiledHelper(helper) {
  if (!helper || helper.schemaVersion !== 2
      || typeof helper.expectedSourceSha256 !== 'string'
      || !helper.source || !helper.snapshot || !helper.binary || !helper.buildRoot) {
    fail('HELPER_ATTESTATION_INVALID', 'compiled helper attestation is incomplete');
  }
  const buildRoot = exactDirectory(
    helper.buildRoot.path,
    'helper private build root',
    { requiredMode: 0o500 },
  );
  if (buildRoot.stat.dev !== helper.buildRoot.device
      || buildRoot.stat.ino !== helper.buildRoot.inode
      || buildRoot.stat.uid !== helper.buildRoot.uid
      || (buildRoot.stat.mode & 0o777) !== helper.buildRoot.mode) {
    fail('HELPER_IDENTITY_MISMATCH', 'helper private build root identity changed');
  }
  const source = readExactFile(helper.source.path, 'helper source');
  const snapshot = readExactFile(helper.snapshot.path, 'helper source snapshot');
  const binary = readExactFile(helper.binary.path, 'compiled helper');
  attestRecord(source, helper.source, 'helper source', {
    expectedSha256: helper.expectedSourceSha256,
  });
  if ((source.stat.mode & 0o022) !== 0) {
    fail('HELPER_IDENTITY_MISMATCH', 'helper source became group/world writable');
  }
  attestRecord(snapshot, helper.snapshot, 'helper source snapshot', {
    requiredMode: 0o400,
    expectedSha256: helper.expectedSourceSha256,
  });
  attestRecord(binary, helper.binary, 'compiled helper', { requiredMode: 0o500 });
  return helper.binary.path;
}

/**
 * Owner-gated, one-shot creation of a dedicated backend-operation lock anchor.
 * This never repairs, unseals, replaces, or deletes an existing path.
 */
export function bootstrapBackendOperationLockAnchor(options = {}) {
  if (options.ownerApproved !== true) {
    fail(
      'LOCK_BOOTSTRAP_OWNER_APPROVAL_REQUIRED',
      'backend operation lock bootstrap requires explicit ownerApproved=true',
    );
  }
  const absolute = exactAbsolute(
    options.lockPath ?? BACKEND_OPERATION_LOCK_PATH,
    'backend operation lock',
  );
  const parentPath = path.dirname(absolute);
  const basename = path.basename(absolute);
  const parentParentPath = path.dirname(parentPath);
  const parentParent = exactDirectory(
    parentParentPath,
    'backend operation lock anchor parent',
  );
  assertLocalApfs(parentParent.path, 'backend operation lock anchor parent');
  if ((parentParent.stat.mode & 0o022) !== 0) {
    fail(
      'LOCK_BOOTSTRAP_PARENT_UNSAFE',
      'backend operation lock anchor parent must not be group/world writable',
    );
  }
  try {
    fs.lstatSync(parentPath);
    fail(
      'LOCK_BOOTSTRAP_PATH_EXISTS',
      'backend operation lock bootstrap refuses an existing anchor path',
    );
  } catch (error) {
    if (error instanceof BackendOperationLockError) throw error;
    if (error?.code !== 'ENOENT') {
      fail('LOCK_BOOTSTRAP_PATH_UNAVAILABLE', 'backend operation lock anchor path cannot be checked', {
        cause: error?.code || error?.message || String(error),
      });
    }
  }

  let anchorFd;
  try {
    fs.mkdirSync(parentPath, { recursive: false, mode: 0o700 });
    fs.chmodSync(parentPath, 0o700);
    const parent = exactDirectory(
      parentPath,
      'new backend operation lock anchor',
      { requiredMode: 0o700 },
    );
    assertLocalApfs(parent.path, 'new backend operation lock anchor');
    anchorFd = fs.openSync(
      parentPath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    );
    const openedParent = fs.fstatSync(anchorFd);
    if (!sameIdentity(parent.stat, openedParent)) {
      fail('LOCK_BOOTSTRAP_IDENTITY_MISMATCH', 'new backend operation lock anchor changed while opening');
    }
    if (fs.readdirSync(parent.path).length !== 0) {
      fail('LOCK_BOOTSTRAP_ANCHOR_NOT_EMPTY', 'new backend operation lock anchor is not empty');
    }
    const fd = fs.openSync(
      absolute,
      fs.constants.O_RDWR
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | fs.constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const bytes = Buffer.alloc(2);
      if (fs.writeSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) {
        fail('LOCK_BOOTSTRAP_WRITE_FAILED', 'backend operation lock bootstrap wrote a short file');
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.chmodSync(absolute, 0o600);
    fsyncDirectory(parentPath);
    const exact = readExactFile(absolute, 'new backend operation lock');
    assertMutable(absolute, 'new backend operation lock');
    if (exact.stat.uid !== process.getuid()
        || exact.stat.nlink !== 1
        || (exact.stat.mode & 0o777) !== 0o600
        || exact.stat.size !== 2
        || fs.readdirSync(parentPath).length !== 1
        || fs.readdirSync(parentPath)[0] !== basename) {
      fail('LOCK_BOOTSTRAP_IDENTITY_MISMATCH', 'new backend operation lock identity is unsafe');
    }
    const beforeSeal = exactDirectory(
      parentPath,
      'new backend operation lock anchor before seal',
      { requiredMode: 0o700 },
    );
    if (!sameNodeIdentity(openedParent, beforeSeal.stat)
        || !sameNodeIdentity(openedParent, fs.fstatSync(anchorFd))) {
      fail('LOCK_BOOTSTRAP_IDENTITY_MISMATCH', 'new backend operation lock anchor changed before seal');
    }
    fs.chmodSync(parentPath, 0o500);
    fsyncDirectory(parentPath);
    setImmutable(parentPath, 'backend operation lock anchor');
    const sealedParent = exactDirectory(
      parentPath,
      'sealed backend operation lock anchor',
      { requiredMode: 0o500 },
    );
    if (!sameNodeIdentity(openedParent, sealedParent.stat)
        || !sameNodeIdentity(openedParent, fs.fstatSync(anchorFd))) {
      fail('LOCK_BOOTSTRAP_IDENTITY_MISMATCH', 'backend operation lock anchor changed while sealing');
    }
    fsyncDirectory(parentParent.path);
    fs.closeSync(anchorFd);
    anchorFd = undefined;
  } catch (error) {
    if (anchorFd !== undefined) fs.closeSync(anchorFd);
    if (error instanceof BackendOperationLockError) throw error;
    fail('LOCK_BOOTSTRAP_FAILED', 'backend operation lock bootstrap failed closed', {
      cause: error?.code || error?.message || String(error),
    });
  }
  return prepareLockFile(absolute);
}

function prepareLockFile(lockPath) {
  const absolute = exactAbsolute(lockPath, 'backend operation lock');
  const parentPath = path.dirname(absolute);
  const basename = path.basename(absolute);
  const parent = exactDirectory(
    parentPath,
    'backend operation lock anchor',
    { requiredMode: 0o500 },
  );
  assertLocalApfs(parent.path, 'backend operation lock anchor');
  assertImmutable(parentPath, 'backend operation lock anchor');
  const entries = fs.readdirSync(parentPath);
  if (entries.length !== 1 || entries[0] !== basename) {
    fail(
      'LOCK_ANCHOR_NOT_DEDICATED',
      'backend operation lock anchor must contain only its permanent lock file',
    );
  }
  const exact = readExactFile(absolute, 'backend operation lock');
  assertMutable(absolute, 'backend operation lock');
  if (exact.stat.uid !== process.getuid()
      || exact.stat.nlink !== 1
      || !exact.stat.isFile()
      || exact.stat.isSymbolicLink()
      || (exact.stat.mode & 0o777) !== 0o600
      || exact.stat.size !== 2) {
    fail(
      'LOCK_FILE_IDENTITY_MISMATCH',
      'backend operation lock owner, type, link count, mode, or size is unsafe',
    );
  }
  const record = lockRecordFor(exact, parent);
  validateLockIdentity(record);
  return record;
}

function makeDeferred() {
  let resolve;
  let reject;
  let settled = false;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = (value) => {
      if (settled) return;
      settled = true;
      resolveValue(value);
    };
    reject = (error) => {
      if (settled) return;
      settled = true;
      rejectValue(error);
    };
  });
  return {
    promise,
    resolve,
    reject,
    get settled() { return settled; },
  };
}

function parseEventFrame(line, nonce, mode) {
  if (Buffer.byteLength(line, 'utf8') > MAX_EVENT_LINE_BYTES) {
    fail('LOCK_PROTOCOL_ERROR', 'native helper event frame exceeded its bound');
  }
  const tokens = line.split(' ');
  if (tokens.length < 3 || tokens[0] !== PROTOCOL_PREFIX) {
    fail('LOCK_PROTOCOL_ERROR', 'native helper emitted an invalid event frame');
  }
  const fields = Object.create(null);
  for (const token of tokens.slice(1)) {
    const separator = token.indexOf('=');
    if (separator <= 0 || separator === token.length - 1) {
      fail('LOCK_PROTOCOL_ERROR', 'native helper emitted an invalid event field');
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (!/^[a-z_]+$/u.test(key)
        || !/^[A-Za-z0-9_.:-]+$/u.test(value)
        || fields[key] !== undefined) {
      fail('LOCK_PROTOCOL_ERROR', 'native helper emitted an unsafe or duplicate event field');
    }
    fields[key] = value;
  }
  if (fields.nonce !== nonce || !EVENT_NAMES.has(fields.event)) {
    fail('LOCK_PROTOCOL_ERROR', 'native helper event nonce or name is invalid');
  }
  const expectedKeys = fields.event === 'READY'
    ? READY_SCHEMAS[mode ?? fields.mode]
    : EVENT_SCHEMAS[fields.event];
  const actualKeys = Object.keys(fields);
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('LOCK_PROTOCOL_ERROR', 'native helper event fields are missing, extra, or reordered', {
      event: fields.event,
      actualKeys,
      expectedKeys,
    });
  }
  validateNativeEvent(fields, mode);
  return Object.freeze({ ...fields });
}

function validateEventTransition(mode, events, event) {
  const names = events.map((value) => value.event);
  if (names.includes(event.event)) {
    fail('LOCK_PROTOCOL_ERROR', `native helper duplicated ${event.event}`);
  }
  const previous = names.at(-1) ?? null;
  if (event.event === 'READY') {
    if (previous !== null || event.mode !== mode) {
      fail('LOCK_PROTOCOL_ERROR', 'native helper READY event is out of order');
    }
    return;
  }
  if (previous === null) {
    fail('LOCK_PROTOCOL_ERROR', 'native helper emitted lifecycle state before READY');
  }
  if (mode === 'hold') {
    if (event.event === 'PROTOCOL_ERROR' && previous === 'READY') return;
    if (event.event === 'HELPER_SIGNAL' && previous === 'READY') return;
    if (event.event === 'LOCK_PATH_CHANGED' && previous === 'READY') return;
    if (event.event === 'RELEASED'
        && ['READY', 'PROTOCOL_ERROR', 'HELPER_SIGNAL'].includes(previous)) return;
    fail('LOCK_PROTOCOL_ERROR', `native hold helper emitted out-of-order ${event.event}`);
  }
  if (event.event === 'PREPARED' && previous === 'READY') return;
  if ((event.event === 'RUNNING' || event.event === 'EXEC_FAILED') && previous === 'PREPARED') return;
  if (event.event === 'GUARDIAN_SIGNAL'
      && (previous === 'PREPARED' || previous === 'RUNNING')) return;
  if (event.event === 'CAPABILITY_CHANGED' && previous === 'RUNNING') return;
  if (event.event === 'CONTROLLER_LOST'
      && ['READY', 'PREPARED', 'RUNNING', 'EXEC_FAILED'].includes(previous)) return;
  if (event.event === 'SENTINEL_DIED'
      && ['READY', 'PREPARED', 'RUNNING', 'EXEC_FAILED', 'PROTOCOL_ERROR'].includes(previous)) return;
  if (event.event === 'DESCENDANT_UNPROVABLE'
      && ['PREPARED', 'RUNNING', 'SENTINEL_DIED'].includes(previous)) return;
  if (event.event === 'IDENTITY_STALLED'
      && ['READY', 'PREPARED', 'RUNNING', 'TERMINATING'].includes(previous)) return;
  if (event.event === 'TERMINATING'
      && (previous === 'READY'
        || previous === 'PREPARED'
        || previous === 'RUNNING'
        || previous === 'EXEC_FAILED'
        || previous === 'PROTOCOL_ERROR'
        || previous === 'GUARDIAN_SIGNAL'
        || previous === 'CAPABILITY_CHANGED'
        || previous === 'CONTROLLER_LOST'
        || previous === 'SENTINEL_DIED'
        || previous === 'DESCENDANT_UNPROVABLE'
        || previous === 'GROUP_STALLED'
        || previous === 'CAPABILITY_STALLED')) return;
  if (event.event === 'PROTOCOL_ERROR'
      && (previous === 'PREPARED' || previous === 'RUNNING')) return;
  if (event.event === 'GROUP_STALLED'
      && ['TERMINATING', 'RUNNING', 'CAPABILITY_CHANGED'].includes(previous)) return;
  if (event.event === 'CAPABILITY_STALLED'
      && ['TERMINATING', 'RUNNING', 'GROUP_STALLED', 'CAPABILITY_CHANGED'].includes(previous)) return;
  if (event.event === 'LOCK_PATH_CHANGED'
      && previous !== 'RELEASED' && previous !== 'LOCK_PATH_CHANGED') return;
  if (event.event === 'WRITER_EXITED'
      && [
        'PREPARED', 'RUNNING', 'EXEC_FAILED', 'TERMINATING', 'PROTOCOL_ERROR',
        'GUARDIAN_SIGNAL', 'GROUP_STALLED', 'CAPABILITY_CHANGED',
        'CAPABILITY_STALLED', 'SENTINEL_DIED', 'SENTINEL_RELEASED',
      ].includes(previous)) return;
  if (event.event === 'SENTINEL_RELEASED'
      && [
        'PREPARED', 'RUNNING', 'EXEC_FAILED', 'TERMINATING', 'GROUP_STALLED',
        'CAPABILITY_CHANGED', 'CAPABILITY_STALLED', 'CONTROLLER_LOST',
        'IDENTITY_STALLED',
      ].includes(previous)) return;
  if (event.event === 'RELEASED' && previous === 'WRITER_EXITED') return;
  fail('LOCK_PROTOCOL_ERROR', `native guardian emitted out-of-order ${event.event}`);
}

function boundedAppend(current, chunk) {
  if (current.length >= MAX_DIAGNOSTIC_BYTES) return current;
  return (current + chunk.toString('utf8')).slice(0, MAX_DIAGNOSTIC_BYTES);
}

function timeoutPromise(promise, timeoutMs, errorFactory) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(errorFactory()), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeEnvironment(environment) {
  const source = environment ?? process.env;
  const result = Object.create(null);
  for (const [key, rawValue] of Object.entries(source)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || key.includes('\0')) {
      fail('WRITER_ENV_INVALID', 'writer environment contains an invalid key');
    }
    if (key.startsWith('DYLD_')
        || key.startsWith('LD_')
        || DANGEROUS_ENVIRONMENT_KEYS.has(key)
        || key === 'YURI_BACKEND_OPERATION_LEASE_FD') {
      fail('WRITER_ENV_DANGEROUS', `writer environment key ${key} is forbidden`);
    }
    if (rawValue === undefined) continue;
    const value = String(rawValue);
    if (value.includes('\0')) {
      fail('WRITER_ENV_INVALID', `writer environment value for ${key} contains NUL`);
    }
    result[key] = value;
  }
  const serializedSize = Object.entries(result).reduce(
    (total, [key, value]) => total + Buffer.byteLength(`${key}=${value}\0`, 'utf8'),
    1,
  );
  if (serializedSize > MAX_WRITER_ENV_BYTES) {
    fail('WRITER_ENV_TOO_LARGE', 'writer environment exceeds the native transport bound');
  }
  return result;
}

function serializeWriterEnvironment(environment) {
  const entries = Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}\0`);
  return Buffer.from(`${entries.join('')}\0`, 'utf8');
}

function createNativeController({
  helper,
  mode,
  lockPath,
  writerCommand,
  writerArgs,
  writerExecutable,
  cwd,
  writerEnvironment,
}) {
  const executable = verifyCompiledHelper(helper);
  const nonce = crypto.randomBytes(32).toString('hex');
  const argv = [mode === 'guardian' ? 'guard' : mode, lockPath, nonce];
  if (writerCommand) argv.push(writerCommand, ...writerArgs);
  let child;
  try {
    child = spawn(executable, argv, {
      cwd,
      env: SEALED_PROCESS_ENV,
      stdio: mode === 'guardian'
        ? ['pipe', 'pipe', 'pipe', 'pipe', writerExecutable.fd, 'pipe']
        : ['pipe', 'pipe', 'pipe', 'pipe'],
    });
  } finally {
    if (writerExecutable?.fd !== undefined) fs.closeSync(writerExecutable.fd);
  }
  const eventStream = child.stdio[3];
  const events = [];
  const transcript = [];
  const eventWaiters = new Map();
  const closedDeferred = makeDeferred();
  const lossDeferred = makeDeferred();
  let eventBuffer = '';
  let stderr = '';
  let spawnError = null;
  let protocolError = null;
  let closedOutcome = null;
  let exitOutcome = null;
  let lossReported = false;
  let eventChannelEnded = false;
  let eventChannelClosed = false;

  function resolveLoss(message, details = {}) {
    if (lossReported) return;
    lossReported = true;
    lossDeferred.resolve(Object.freeze({
      code: 'BACKEND_OPERATION_LOCK_LOST',
      message,
      unexpected: true,
      observedAt: new Date().toISOString(),
      released: events.some((event) => event.event === 'RELEASED'),
      events: Object.freeze([...events]),
      transcript: immutableClone(transcript),
      ...details,
    }));
  }

  if (mode === 'guardian') {
    const serializedEnvironment = serializeWriterEnvironment(writerEnvironment);
    child.stdio[5].once('error', (error) => {
      spawnError = error;
      resolveLoss('native writer environment transport failed', { cause: error.message });
      child.kill('SIGKILL');
    });
    child.stdio[5].end(serializedEnvironment);
  }

  function eventDeferred(name) {
    if (!eventWaiters.has(name)) eventWaiters.set(name, makeDeferred());
    return eventWaiters.get(name);
  }

  function recordProtocolFailure(error) {
    if (protocolError) return;
    protocolError = error instanceof BackendOperationLockError
      ? error
      : new BackendOperationLockError('LOCK_PROTOCOL_ERROR', error.message || String(error));
    resolveLoss('native backend operation protocol was lost', {
      protocolError: protocolError.message,
    });
    child.kill('SIGKILL');
  }

  eventStream.setEncoding('utf8');
  eventStream.on('data', (chunk) => {
    eventBuffer += chunk;
    if (Buffer.byteLength(eventBuffer, 'utf8') > MAX_EVENT_LINE_BYTES * 2) {
      recordProtocolFailure(new BackendOperationLockError(
        'LOCK_PROTOCOL_ERROR',
        'native helper event stream exceeded its frame bound',
      ));
      return;
    }
    for (;;) {
      const newline = eventBuffer.indexOf('\n');
      if (newline < 0) break;
      const line = eventBuffer.slice(0, newline);
      eventBuffer = eventBuffer.slice(newline + 1);
      if (!line) {
        recordProtocolFailure(new BackendOperationLockError(
          'LOCK_PROTOCOL_ERROR',
          'native helper emitted an empty event frame',
        ));
        continue;
      }
      try {
        const event = parseEventFrame(line, nonce, mode);
        validateEventTransition(mode, events, event);
        events.push(event);
        transcript.push(immutableClone({
          sequence: transcript.length + 1,
          observedAt: new Date().toISOString(),
          nativeFrame: line,
          event,
        }));
        eventDeferred(event.event).resolve(event);
        if (LOSS_EVENT_NAMES.has(event.event)) {
          resolveLoss(`native backend operation helper reported ${event.event}`, {
            nativeEvent: event,
          });
        }
      } catch (error) {
        recordProtocolFailure(error);
      }
    }
  });
  eventStream.on('end', () => {
    eventChannelEnded = true;
    if (eventBuffer.length > 0) {
      recordProtocolFailure(new BackendOperationLockError(
        'LOCK_PROTOCOL_ERROR',
        'native helper event stream ended with a partial frame',
      ));
    }
    if (!events.some((event) => event.event === 'RELEASED')) {
      resolveLoss('native backend operation event channel ended before exact RELEASED');
    }
  });
  eventStream.on('error', (error) => {
    recordProtocolFailure(new BackendOperationLockError(
      'LOCK_EVENT_STREAM_ERROR',
      'native helper event stream failed',
      { cause: error.message },
    ));
  });
  eventStream.on('close', () => {
    eventChannelClosed = true;
    if (!eventChannelEnded && !events.some((event) => event.event === 'RELEASED')) {
      recordProtocolFailure(new BackendOperationLockError(
        'LOCK_EVENT_STREAM_CLOSED',
        'native helper event stream closed without deterministic end/release',
      ));
    }
  });
  child.stdin.on('error', (error) => {
    resolveLoss('native backend operation control channel failed', {
      controlError: error.message,
      controlErrorCode: error.code ?? null,
    });
  });
  child.stderr.on('data', (chunk) => { stderr = boundedAppend(stderr, chunk); });
  child.once('error', (error) => {
    spawnError = error;
    resolveLoss('native backend operation helper spawn failed', { cause: error.message });
  });
  child.once('exit', (code, signal) => {
    exitOutcome = Object.freeze({ code, signal, observedAt: new Date().toISOString() });
    // A signal-terminated guardian is definitively lost even when a live writer
    // keeps inherited stdout/stderr descriptors open and delays Node's `close`.
    if (signal !== null || code !== 0) {
      resolveLoss(
        signal !== null
          ? 'native backend operation guardian was terminated by signal'
          : 'native backend operation guardian exited nonzero',
        {
        signal,
        exitCode: code,
        protocolError: protocolError?.message || null,
        spawnError: spawnError?.message || null,
        },
      );
    }
  });
  child.once('close', (code, signal) => {
    const released = events.some((event) => event.event === 'RELEASED');
    const expectedExecFailure = events.some((event) => event.event === 'EXEC_FAILED');
    const nativeLossEvent = events.some((event) => LOSS_EVENT_NAMES.has(event.event));
    const releaseReason = events.find((event) => event.event === 'RELEASED')?.reason ?? null;
    const unexpected = Boolean(spawnError)
      || Boolean(protocolError)
      || nativeLossEvent
      || ALWAYS_UNEXPECTED_RELEASE_REASONS.has(releaseReason)
      || !released
      || (code !== 0 && !expectedExecFailure);
    closedOutcome = Object.freeze({
      code,
      signal,
      released,
      unexpected,
      spawnError: spawnError?.message || null,
      protocolError: protocolError?.message || null,
      stderr: stderr.trim(),
      events: Object.freeze([...events]),
      transcript: immutableClone(transcript),
      closedAt: new Date().toISOString(),
    });
    closedDeferred.resolve(closedOutcome);
    if (unexpected) {
      resolveLoss('native backend operation guardian exited unexpectedly', {
        exitCode: closedOutcome.code,
        signal: closedOutcome.signal,
        released: closedOutcome.released,
        unexpected: true,
        spawnError: closedOutcome.spawnError,
        protocolError: closedOutcome.protocolError,
        stderr: closedOutcome.stderr,
      });
    }
    for (const [awaitedEvent, deferred] of eventWaiters.entries()) {
      if (deferred.settled || events.some((event) => event.event === awaitedEvent)) continue;
      deferred.reject(protocolError ?? new BackendOperationLockError(
        'LOCK_HELPER_EXITED',
        'native backend operation helper exited before the expected lifecycle event',
        { ...closedOutcome, awaitedEvent },
      ));
    }
  });

  async function waitForEvent(name, timeoutMs) {
    const existing = events.find((event) => event.event === name);
    if (existing) return existing;
    if (closedOutcome) {
      fail(
        closedOutcome.code === 73 ? 'BACKEND_OPERATION_BUSY' : 'LOCK_HELPER_EXITED',
        closedOutcome.code === 73
          ? 'another backend writer or recovery transaction holds the kernel lock'
          : 'native backend operation helper exited before the expected lifecycle event',
        closedOutcome,
      );
    }
    return timeoutPromise(
      eventDeferred(name).promise,
      timeoutMs,
      () => new BackendOperationLockError(
        'LOCK_LIFECYCLE_TIMEOUT',
        `timed out waiting for native ${name} event`,
      ),
    );
  }

  async function waitForAny(names, timeoutMs) {
    const existing = events.find((event) => names.includes(event.event));
    if (existing) return existing;
    return timeoutPromise(
      Promise.race(names.map((name) => eventDeferred(name).promise)),
      timeoutMs,
      () => new BackendOperationLockError(
        'LOCK_LIFECYCLE_TIMEOUT',
        `timed out waiting for native ${names.join('/')} event`,
      ),
    );
  }

  async function send(command) {
    if (!/^[A-Z_]+$/u.test(command) || closedOutcome || child.stdin.destroyed) {
      fail('LOCK_CONTROL_UNAVAILABLE', 'native backend operation control channel is unavailable');
    }
    const frame = `${PROTOCOL_PREFIX} nonce=${nonce} command=${command}\n`;
    await new Promise((resolve, reject) => {
      child.stdin.write(frame, (error) => {
        if (error) {
          reject(new BackendOperationLockError(
            'LOCK_CONTROL_FAILED',
            'failed to write native backend operation control frame',
            { cause: error.message },
          ));
        } else {
          resolve();
        }
      });
    });
  }

  return Object.freeze({
    child,
    nonce,
    events: () => Object.freeze([...events]),
    transcript: () => immutableClone(transcript),
    get closedOutcome() { return closedOutcome; },
    get exitOutcome() { return exitOutcome; },
    get protocolError() { return protocolError; },
    get spawnError() { return spawnError; },
    get eventChannelEnded() { return eventChannelEnded; },
    get eventChannelClosed() { return eventChannelClosed; },
    loss: lossDeferred.promise,
    closed: closedDeferred.promise,
    waitForEvent,
    waitForAny,
    send,
  });
}

function helperForOptions(options, label) {
  if (options.helper) return options.helper;
  return compileFreshC({
    sourcePath: options.sourcePath ?? BACKEND_OPERATION_LOCK_SOURCE,
    expectedSourceSha256: options.expectedSourceSha256,
    binRoot: options.binRoot ?? BACKEND_HELPER_BIN_ROOT,
    label,
  });
}

async function waitForClosed(controller, timeoutMs) {
  return timeoutPromise(
    controller.closed,
    timeoutMs,
    () => new BackendOperationLockError(
      'LOCK_RELEASE_TIMEOUT',
      'native backend operation helper did not reach a terminal state',
    ),
  );
}

async function stopFailedAcquisition(controller, timeoutMs, originalError) {
  if (controller.exitOutcome === null && controller.closedOutcome === null) {
    controller.child.kill('SIGKILL');
  }
  try {
    return await waitForClosed(controller, timeoutMs);
  } catch (cleanupError) {
    controller.child.kill('SIGKILL');
    fail(
      'LOCK_ACQUISITION_CLEANUP_TIMEOUT',
      'failed acquisition helper did not close within the bounded cleanup window',
      {
        originalError: originalError?.code || originalError?.message || String(originalError),
        cleanupError: cleanupError?.code || cleanupError?.message || String(cleanupError),
        exitOutcome: controller.exitOutcome,
      },
    );
  }
}

function createAcquisitionAttestation({
  controller,
  mode,
  purpose,
  helper,
  lockIdentity,
  writerExecutable = null,
}) {
  const transcript = controller.transcript();
  const readyEntries = transcript.filter((entry) => entry.event.event === 'READY');
  if (readyEntries.length !== 1
      || readyEntries[0].sequence !== 1
      || readyEntries[0].event.nonce !== controller.nonce
      || readyEntries[0].event.mode !== mode
      || Number(readyEntries[0].event.helper_pid) !== controller.child.pid) {
    fail('LOCK_ACQUISITION_ATTESTATION_FAILED', 'native READY event did not exactly attest acquisition');
  }
  if (controller.exitOutcome !== null || controller.closedOutcome !== null
      || controller.protocolError || controller.spawnError) {
    fail('LOCK_NOT_OBSERVED_HELD', 'native helper exited or faulted during acquisition');
  }
  verifyCompiledHelper(helper);
  assertExactLockIdentity(lockIdentity);
  if (controller.exitOutcome !== null || controller.closedOutcome !== null
      || controller.protocolError || controller.spawnError) {
    fail('LOCK_NOT_OBSERVED_HELD', 'native helper exited or faulted during acquisition attestation');
  }
  const ready = readyEntries[0];
  const preparedEntries = transcript.filter((entry) => entry.event.event === 'PREPARED');
  const prepared = mode === 'guardian' && preparedEntries.length === 1
    && preparedEntries[0].sequence === 2
    ? preparedEntries[0]
    : null;
  if (mode === 'guardian' && prepared === null) {
    fail('LOCK_ACQUISITION_ATTESTATION_FAILED', 'native PREPARED event did not exactly attest guardian acquisition');
  }
  const base = {
    schemaVersion: 1,
    type: 'backend-operation-lock-acquisition',
    mode,
    purpose,
    nonce: controller.nonce,
    pid: controller.child.pid,
    acquiredAt: ready.observedAt,
    readyEvent: ready.event,
    readyFrame: ready.nativeFrame,
    ...(mode === 'guardian' ? {
      preparedAt: prepared.observedAt,
      preparedEvent: prepared.event,
      preparedFrame: prepared.nativeFrame,
      sentinelIdentity: {
        pid: Number(ready.event.sentinel_pid),
        startSec: ready.event.sentinel_start_sec,
        startUsec: ready.event.sentinel_start_usec,
      },
      writerIdentity: {
        pid: Number(prepared.event.writer_pid),
        pgid: Number(prepared.event.pgid),
        startSec: prepared.event.writer_start_sec,
        startUsec: prepared.event.writer_start_usec,
      },
      capability: {
        leaseFd: Number(prepared.event.lease_fd),
        handle: prepared.event.capability_handle,
        peerHandle: prepared.event.capability_peer_handle,
      },
      writerExecutable,
    } : {}),
    helper: helperEvidence(helper),
    lock: lockIdentity,
  };
  const attestation = immutableClone({
    ...base,
    attestationSha256: sha256(Buffer.from(canonicalJson(base), 'utf8')),
  });
  validateBackendOperationAcquisitionAttestation(attestation, {
    expectedMode: mode,
    expectedPurpose: purpose,
    expectedNonce: controller.nonce,
    expectedAcquiredAt: ready.observedAt,
    expectedLockPath: lockIdentity.path,
    expectedLockIdentity: lockIdentity,
    expectedHelperEvidence: helperEvidence(helper),
    expectedSourcePath: helper.source.path,
    expectedSourceSha256: helper.expectedSourceSha256,
    expectedBinaryPath: helper.binary.path,
    expectedBinarySha256: helper.binary.sha256,
    expectedPid: controller.child.pid,
    ...(mode === 'guardian' ? {
      expectedPreparedAt: prepared.observedAt,
      expectedSentinelPid: Number(ready.event.sentinel_pid),
      expectedSentinelIdentity: attestation.sentinelIdentity,
      expectedWriterIdentity: attestation.writerIdentity,
      expectedCapability: attestation.capability,
      expectedWriterPid: Number(prepared.event.writer_pid),
      expectedPgid: Number(prepared.event.pgid),
      expectedLeaseFd: Number(prepared.event.lease_fd),
      expectedWriterExecutable: writerExecutable,
    } : {}),
  });
  return attestation;
}

/**
 * Assert only what this process can observe now: the helper has no observed
 * exit/protocol fault, its compiled trust chain still attests, and the lock path
 * still resolves to the acquired inode. This is not a magical kernel-lock proof.
 */
function assertObservedHeld({ controller, helper, lockIdentity, acquisition }) {
  const assertControllerLive = () => {
    if (controller.exitOutcome !== null
        || controller.closedOutcome !== null
        || controller.protocolError
        || controller.spawnError
        || controller.eventChannelEnded
        || controller.child.exitCode !== null
        || controller.child.signalCode !== null
        || controller.events().some((event) => LOSS_EVENT_NAMES.has(event.event))
        || controller.events().some((event) => event.event === 'RELEASED')) {
      fail('LOCK_NOT_OBSERVED_HELD', 'backend operation lease is no longer observed live');
    }
  };
  assertControllerLive();
  verifyCompiledHelper(helper);
  assertExactLockIdentity(lockIdentity);
  assertControllerLive();
  const evidence = immutableClone({
    schemaVersion: 1,
    type: 'backend-operation-lock-observed-live-assertion',
    held: true,
    scope: 'observed-live-helper-and-exact-identity-not-kernel-proof',
    observedAt: new Date().toISOString(),
    nonce: acquisition.nonce,
    pid: acquisition.pid,
    purpose: acquisition.purpose,
    acquisitionAttestationSha256: acquisition.attestationSha256,
    helperBinarySha256: acquisition.helper.binary.sha256,
    lock: acquisition.lock,
  });
  return evidence;
}

function createTerminalEvidence({ controller, acquisition, closed, requestedAt }) {
  const transcript = closed.transcript ?? controller.transcript();
  const releaseEntries = transcript.filter((entry) => entry.event.event === 'RELEASED');
  const releaseEntry = releaseEntries.length === 1 ? releaseEntries[0] : null;
  const runningEntries = transcript.filter((entry) => entry.event.event === 'RUNNING');
  const runningEntry = runningEntries.length === 1 ? runningEntries[0] : null;
  const writerExitEntries = transcript.filter((entry) => entry.event.event === 'WRITER_EXITED');
  const writerExitEntry = writerExitEntries.length === 1 ? writerExitEntries[0] : null;
  const sentinelReleaseEntries = transcript.filter(
    (entry) => entry.event.event === 'SENTINEL_RELEASED',
  );
  const sentinelReleaseEntry = sentinelReleaseEntries.length === 1
    ? sentinelReleaseEntries[0]
    : null;
  const sentinelAttested = acquisition.mode === 'guardian'
    && sentinelReleaseEntry !== null
    && releaseEntry !== null
    && sentinelReleaseEntry.sequence < releaseEntry.sequence
    && Number(sentinelReleaseEntry.event.sentinel_pid) === acquisition.sentinelIdentity.pid
    && sentinelReleaseEntry.event.reason === releaseEntry.event.reason;
  const releaseVerified = releaseEntry !== null
    && releaseEntry.sequence === transcript.length
    && releaseEntry.event.nonce === acquisition.nonce
    && closed.released === true
    && (acquisition.mode === 'hold' || sentinelAttested);
  const evidence = immutableClone({
    schemaVersion: 1,
    type: 'backend-operation-lock-terminal-evidence',
    mode: acquisition.mode,
    purpose: acquisition.purpose,
    nonce: acquisition.nonce,
    pid: acquisition.pid,
    acquisition,
    requestedAt: requestedAt ?? null,
    terminalAt: closed.closedAt ?? new Date().toISOString(),
    releasedAt: releaseEntry?.observedAt ?? null,
    released: releaseEntry !== null
      && releaseEntry.sequence === transcript.length
      && releaseEntry.event.nonce === acquisition.nonce
      && closed.released === true,
    releaseVerified,
    releasedEvent: releaseEntry?.event ?? null,
    releasedFrame: releaseEntry?.nativeFrame ?? null,
    exitCode: closed.code,
    code: closed.code,
    signal: closed.signal,
    unexpected: closed.unexpected,
    helper: acquisition.helper,
    lock: acquisition.lock,
    orderedEventTranscript: transcript,
    events: closed.events,
    transcriptSha256: hashBackendOperationTranscript(transcript),
    stderr: closed.stderr,
    runningAt: runningEntry?.observedAt ?? null,
    runningEvent: runningEntry?.event ?? null,
    runningFrame: runningEntry?.nativeFrame ?? null,
    sentinelReleasedAt: sentinelReleaseEntry?.observedAt ?? null,
    sentinelReleasedEvent: sentinelReleaseEntry?.event ?? null,
    sentinelReleasedFrame: sentinelReleaseEntry?.nativeFrame ?? null,
    writerExitCode: writerExitEntry === null ? null : Number(writerExitEntry.event.exit_code),
    writerTermSignal: writerExitEntry === null ? null : Number(writerExitEntry.event.term_signal),
    writerSucceeded: writerExitEntry === null
      ? null
      : Number(writerExitEntry.event.exit_code) === 0
        && Number(writerExitEntry.event.term_signal) === 0,
  });
  validateTerminalCommon(evidence, {
    expectedMode: acquisition.mode,
    expectedPurpose: acquisition.purpose,
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
    ...(acquisition.mode === 'guardian' ? {
      expectedPreparedAt: acquisition.preparedAt,
      expectedSentinelPid: acquisition.sentinelIdentity.pid,
      expectedSentinelIdentity: acquisition.sentinelIdentity,
      expectedWriterIdentity: acquisition.writerIdentity,
      expectedCapability: acquisition.capability,
      expectedWriterPid: Number(acquisition.preparedEvent.writer_pid),
      expectedPgid: Number(acquisition.preparedEvent.pgid),
      expectedLeaseFd: Number(acquisition.preparedEvent.lease_fd),
      expectedWriterExecutable: acquisition.writerExecutable,
    } : {}),
  });
  return evidence;
}

/** Acquire a hold lease for recovery or verification. */
export async function acquireBackendOperationLock(options = {}) {
  const purpose = validatePurpose(options.purpose, new Set(['restore', 'verify']));
  const lockIdentity = prepareLockFile(options.lockPath ?? BACKEND_OPERATION_LOCK_PATH);
  const lockPath = lockIdentity.path;
  const helper = helperForOptions(options, 'backend-operation-lock');
  const controller = createNativeController({
    helper,
    mode: 'hold',
    lockPath,
    cwd: REPO_ROOT,
    writerCommand: null,
    writerArgs: [],
    writerExecutable: null,
    writerEnvironment: Object.create(null),
  });
  const timeoutMs = options.timeoutMs ?? 10_000;
  let acquisition;
  try {
    await controller.waitForEvent('READY', timeoutMs);
    acquisition = createAcquisitionAttestation({
      controller,
      mode: 'hold',
      purpose,
      helper,
      lockIdentity,
    });
  } catch (error) {
    const closed = await stopFailedAcquisition(
      controller,
      options.acquireCloseTimeoutMs ?? 5_000,
      error,
    );
    if (closed.code === 73) {
      fail(
        'BACKEND_OPERATION_BUSY',
        'another backend writer or recovery transaction holds the kernel lock',
        closed,
      );
    }
    throw error;
  }
  let releaseRequested = false;
  let requestedAt = null;
  const terminalEvidence = controller.closed.then((closed) => createTerminalEvidence({
    controller,
    acquisition,
    closed,
    requestedAt,
  }));
  const assertHeld = () => assertObservedHeld({
    controller,
    helper,
    lockIdentity,
    acquisition,
  });
  return Object.freeze({
    kind: 'hold',
    lockPath,
    lockIdentity,
    helper,
    pid: controller.child.pid,
    nonce: controller.nonce,
    acquisition,
    loss: controller.loss,
    closed: terminalEvidence,
    events: controller.events,
    transcript: controller.transcript,
    assertHeld,
    async release() {
      if (releaseRequested) fail('LOCK_RELEASE_DUPLICATE', 'backend operation lock release was already requested');
      assertHeld();
      releaseRequested = true;
      requestedAt = new Date().toISOString();
      await controller.send('RELEASE');
      const closed = await waitForClosed(controller, options.releaseTimeoutMs ?? 10_000);
      const terminal = await terminalEvidence;
      verifyCompiledHelper(helper);
      assertExactLockIdentity(lockIdentity);
      if (closed.unexpected
          || !terminal.releaseVerified
          || terminal.releasedEvent?.reason !== 'request'
          || terminal.exitCode !== 0
          || terminal.signal !== null
          || terminal.unexpected !== false) {
        fail('LOCK_RELEASE_FAILED', 'backend operation hold lease lacks exact clean release evidence', {
          terminal,
        });
      }
      const receipt = immutableClone({
        ...terminal,
        type: 'backend-operation-lock-release-evidence',
        released: true,
        code: terminal.exitCode,
        lockPath,
      });
      validateBackendOperationReleaseEvidence(receipt, {
        expectedPurpose: purpose,
        expectedNonce: acquisition.nonce,
        expectedAcquiredAt: acquisition.acquiredAt,
        expectedLockPath: lockIdentity.path,
        expectedLockIdentity: lockIdentity,
        expectedHelperEvidence: acquisition.helper,
        expectedSourcePath: helper.source.path,
        expectedSourceSha256: helper.expectedSourceSha256,
        expectedBinaryPath: helper.binary.path,
        expectedBinarySha256: helper.binary.sha256,
        expectedPid: controller.child.pid,
      });
      return receipt;
    },
  });
}

function validateWriterCommand(options) {
  const command = exactAbsolute(options.command, 'backend writer command');
  const args = options.args ?? [];
  if (!Array.isArray(args) || args.some((value) => typeof value !== 'string' || value.includes('\0'))) {
    fail('WRITER_ARGUMENTS_INVALID', 'backend writer args must be NUL-free strings');
  }
  const cwd = options.cwd === undefined
    ? REPO_ROOT
    : exactDirectory(options.cwd, 'backend writer cwd').path;
  return Object.freeze({
    command,
    args: Object.freeze([...args]),
    cwd,
    env: normalizeEnvironment(options.env),
  });
}

/**
 * Acquire the kernel lock and PREPARE a setsid writer without executing it.
 * Call start() only after the caller has installed its own fail-closed state.
 */
export async function prepareGuardedBackendWriter(options = {}) {
  const purpose = validatePurpose(options.purpose ?? 'writer', new Set(['writer']));
  const writer = validateWriterCommand(options);
  const lockIdentity = prepareLockFile(options.lockPath ?? BACKEND_OPERATION_LOCK_PATH);
  const lockPath = lockIdentity.path;
  const helper = helperForOptions(options, 'backend-operation-lock');
  const writerExecutable = openWriterExecutable(writer.command);
  const controller = createNativeController({
    helper,
    mode: 'guardian',
    lockPath,
    writerCommand: writer.command,
    writerArgs: writer.args,
    writerExecutable,
    cwd: writer.cwd,
    writerEnvironment: writer.env,
  });
  const timeoutMs = options.timeoutMs ?? 10_000;
  let prepared;
  let writerPid;
  let pgid;
  let leaseFd;
  let acquisition;
  try {
    await controller.waitForEvent('READY', timeoutMs);
    prepared = await controller.waitForEvent('PREPARED', timeoutMs);
    writerPid = Number(prepared.writer_pid);
    pgid = Number(prepared.pgid);
    leaseFd = Number(prepared.lease_fd);
    if (!Number.isSafeInteger(writerPid)
        || !Number.isSafeInteger(pgid)
        || writerPid <= 1
        || pgid !== writerPid
        || leaseFd !== BACKEND_WRITER_LEASE_FD) {
      fail('LOCK_PROTOCOL_ERROR', 'native guardian returned an unsafe writer identity');
    }
    acquisition = createAcquisitionAttestation({
      controller,
      mode: 'guardian',
      purpose,
      helper,
      lockIdentity,
      writerExecutable: writerExecutable.identity,
    });
  } catch (error) {
    const closed = await stopFailedAcquisition(
      controller,
      options.acquireCloseTimeoutMs ?? 5_000,
      error,
    );
    if (closed.code === 73) {
      fail(
        'BACKEND_OPERATION_BUSY',
        'another backend writer or recovery transaction holds the kernel lock',
        closed,
      );
    }
    throw error;
  }

  let phase = 'prepared';
  let requestedAt = null;
  const terminalEvidence = controller.closed.then((closed) => {
    const evidence = createTerminalEvidence({
      controller,
      acquisition,
      closed,
      requestedAt,
    });
    validateBackendOperationGuardianTerminalEvidence(evidence);
    return evidence;
  });
  const assertHeld = () => assertObservedHeld({
    controller,
    helper,
    lockIdentity,
    acquisition,
  });
  controller.closed.then(() => { phase = 'closed'; });
  async function terminate(optionsForTermination = {}) {
    if (phase === 'closed') return terminalEvidence;
    requestedAt = new Date().toISOString();
    if (controller.exitOutcome === null && controller.closedOutcome === null) {
      if (phase === 'prepared') await controller.send('ABORT');
      else if (phase === 'running' || phase === 'starting') await controller.send('TERMINATE');
    }
    try {
      await waitForClosed(controller, optionsForTermination.timeoutMs ?? 15_000);
    } catch (error) {
      throw new BackendOperationLockError(
        'NATIVE_SENTINEL_CLEANUP_STALLED',
        'native dual-escrow cleanup remains fail-closed and did not finish in time',
        { cause: error.message, writerPid, pgid },
      );
    }
    phase = 'closed';
    return terminalEvidence;
  }

  const guardian = {
    kind: 'writer-guardian',
    lockPath,
    lockIdentity,
    helper,
    guardianPid: controller.child.pid,
    sentinelPid: acquisition.sentinelIdentity.pid,
    pid: controller.child.pid,
    writerPid,
    pgid,
    leaseFd,
    nonce: controller.nonce,
    acquisition,
    stdout: controller.child.stdout,
    stderr: controller.child.stderr,
    loss: controller.loss,
    closed: terminalEvidence,
    events: controller.events,
    transcript: controller.transcript,
    assertHeld,
    get phase() { return phase; },
    async start() {
      if (phase !== 'prepared') {
        fail('WRITER_START_STATE_INVALID', `cannot start guarded writer from ${phase}`);
      }
      phase = 'starting';
      let event;
      try {
        await controller.send('EXEC');
        event = await controller.waitForAny(['RUNNING', 'EXEC_FAILED'], timeoutMs);
      } catch (error) {
        const cleanupErrors = [];
        try {
          if (controller.exitOutcome === null && controller.closedOutcome === null) {
            await controller.send('TERMINATE');
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError.code || cleanupError.message);
        }
        try {
          await waitForClosed(controller, options.startCleanupCloseTimeoutMs ?? 15_000);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError.code || cleanupError.message);
        }
        phase = 'closed';
        throw new BackendOperationLockError(
          'WRITER_START_FAILED_CLEANED',
          'guarded writer start failed; native sentinel cleanup was requested',
          {
            cause: error.code || error.message,
            cleanupErrors,
            writerPid,
            pgid,
          },
        );
      }
      if (event.event === 'EXEC_FAILED') {
        phase = 'closed';
        const closed = await terminalEvidence;
        fail('WRITER_EXEC_FAILED', 'guarded backend writer exec failed', {
          errorNumber: Number(event.error_number),
          closed,
        });
      }
      phase = controller.closedOutcome ? 'closed' : 'running';
      return Object.freeze({
        running: true,
        guardianPid: controller.child.pid,
        sentinelPid: acquisition.sentinelIdentity.pid,
        writerPid,
        pgid,
        leaseFd,
      });
    },
    async abort(optionsForTermination = {}) {
      if (phase !== 'prepared') {
        fail('WRITER_ABORT_STATE_INVALID', `cannot abort guarded writer from ${phase}`);
      }
      return terminate(optionsForTermination);
    },
    terminate,
    async terminateAfterLoss(optionsForTermination = {}) {
      await controller.loss;
      await waitForClosed(controller, optionsForTermination.timeoutMs ?? 15_000);
      const terminal = await terminalEvidence;
      phase = 'closed';
      return terminal;
    },
  };
  return Object.freeze(guardian);
}
