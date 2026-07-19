#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  createBackendDataRecoveryFixtureApi,
} from './backend-data-recovery.mjs';
import {
  BACKEND_OPERATION_LOCK_PATH,
  CANONICAL_BACKEND_SERVER_ARTIFACT,
  CANONICAL_BACKEND_SERVER_SHA256,
  CANONICAL_NODE_BINARY,
  FIXED_CONFIG_PATH,
  INTERNAL_APFS_EXPECTED_VOLUME_UUID,
  RECOVERY_MARKER_PATH,
  createSystemAdapters,
  decideInternalFromPlistInfo,
  ensureMounted,
  main,
  normalizeDiskutilMountInfo,
  superviseWriter,
  validateConfig,
  validateInternalApfsIdentity,
} from './backend-storage-guard.mjs';
import {
  BACKEND_OPERATION_LOCK_SOURCE,
  BACKEND_OPERATION_LOCK_SOURCE_SHA256,
  bootstrapBackendOperationLockAnchor,
  compileFreshC,
  prepareGuardedBackendWriter as prepareNativeGuardian,
} from './backend-operation-lock.mjs';

const SOURCE_PATH = new URL('./backend-storage-guard.mjs', import.meta.url);

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function makeRoot(label) {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)));
}

function makeRecoveryRoot(label) {
  return fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', `${label}-`)));
}

function recoveryFixtureAdapters() {
  const unexpected = (name) => () => {
    throw new Error(`unexpected recovery fixture adapter call: ${name}`);
  };
  return Object.freeze({
    now: () => new Date('2026-07-19T00:00:00.000Z'),
    acquireOperationLock: unexpected('acquireOperationLock'),
    validateOperationAcquisition: (value) => value,
    validateOperationRelease: (value) => value,
    inspectSourceIdentity: unexpected('inspectSourceIdentity'),
    inspectTargetIdentity: unexpected('inspectTargetIdentity'),
    copyTree: unexpected('copyTree'),
    swapTrees: unexpected('swapTrees'),
    listOpenFiles: unexpected('listOpenFiles'),
    sampleFilesystem: unexpected('sampleFilesystem'),
    compileSwapHelper: unexpected('compileSwapHelper'),
    fullSyncTree: unexpected('fullSyncTree'),
  });
}

function cleanup(root) {
  spawnSync('/usr/bin/chflags', ['-R', 'nouchg', root], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    stdio: 'ignore',
  });
  const thaw = (candidate) => {
    let entry;
    try { entry = fs.lstatSync(candidate); } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (!entry.isDirectory() || entry.isSymbolicLink()) return;
    fs.chmodSync(candidate, 0o700);
    for (const name of fs.readdirSync(candidate)) thaw(path.join(candidate, name));
  };
  thaw(root);
  fs.rmSync(root, { recursive: true, force: true });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function terminal({
  code = 0,
  signal = 0,
  running = true,
  unexpected = false,
  released = true,
  releaseVerified = true,
  releaseReason = 'writer_group_exit',
  helperExitCode = 0,
  helperSignal = null,
} = {}) {
  return {
    runningEvent: running ? { event: 'RUNNING' } : null,
    writerExitCode: code,
    writerTermSignal: signal,
    released,
    releaseVerified,
    releasedEvent: released ? { event: 'RELEASED', reason: releaseReason } : null,
    exitCode: helperExitCode,
    signal: helperSignal,
    unexpected,
  };
}

function makeFixture(root, serverSource = 'process.exit(0);\n') {
  const mountPoint = path.join(root, 'backend', 'data');
  fs.mkdirSync(mountPoint, { recursive: true, mode: 0o700 });
  const nodePath = fs.realpathSync.native(process.execPath);
  const serverPath = path.join(root, 'server.mjs');
  fs.writeFileSync(serverPath, serverSource, { mode: 0o600 });
  fs.chmodSync(serverPath, 0o600);
  const config = Object.freeze({
    schemaVersion: 2,
    mode: 'internal-apfs',
    mountPoint,
    expectedVolumeUuid: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
  });
  const fixtureWriterIdentity = Object.freeze({
    nodePath,
    serverPath,
    serverSha256: digest(fs.readFileSync(serverPath)),
  });
  return {
    config,
    mountPoint,
    nodePath,
    serverPath,
    writerArgv: [nodePath, serverPath],
    fixtureWriterIdentity,
  };
}

function identityFor(fixture, overrides = {}) {
  const parent = path.dirname(fixture.mountPoint);
  return {
    targetEntry: {
      exists: true,
      isDirectory: true,
      isFile: false,
      isSymbolicLink: false,
      realPath: fixture.mountPoint,
      deviceId: '42',
      mode: 0o40700,
      ...(overrides.targetEntry ?? {}),
    },
    parentEntry: {
      exists: true,
      isDirectory: true,
      isFile: false,
      isSymbolicLink: false,
      realPath: parent,
      deviceId: '42',
      mode: 0o40700,
      ...(overrides.parentEntry ?? {}),
    },
    parentMount: {
      deviceIdentifier: 'disk42',
      dfDeviceIdentifier: 'disk42',
      dfMountPoint: '/',
      inspectedPath: parent,
      mountPoint: '/',
      volumeUuid: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
      fsType: 'apfs',
      writable: true,
      readOnly: false,
      ownersEnabled: true,
      internal: true,
      parseConflict: false,
      deviceId: '42',
      ...(overrides.parentMount ?? {}),
    },
  };
}

function makeGuardian(options = {}) {
  const events = options.events ?? [];
  const closedDeferred = deferred();
  const lossDeferred = deferred();
  let phase = 'prepared';
  let abortCalls = 0;
  let terminateCalls = 0;
  let lossTerminateCalls = 0;
  let startCalls = 0;
  const clean = options.terminal ?? terminal();
  const stopped = options.stoppedTerminal ?? terminal({
    code: 0,
    signal: 15,
    releaseReason: 'terminate_request',
  });

  const close = (value) => {
    phase = 'closed';
    closedDeferred.resolve(value);
    return value;
  };
  const guardian = {
    events,
    stdout: null,
    stderr: null,
    get phase() { return phase; },
    get abortCalls() { return abortCalls; },
    get terminateCalls() { return terminateCalls; },
    get lossTerminateCalls() { return lossTerminateCalls; },
    get startCalls() { return startCalls; },
    get loss() { return options.preStartLoss ? Promise.resolve({ nativeEvent: 'HELPER_EXIT' }) : lossDeferred.promise; },
    get closed() { return closedDeferred.promise; },
    resolveLoss(value) { lossDeferred.resolve(value); },
    assertHeld() {
      events.push('held');
      if (options.throwHeldAt === events.filter((entry) => entry === 'held').length) {
        const error = new Error('held lease disappeared');
        error.code = 'LOCK_NOT_OBSERVED_HELD';
        throw error;
      }
    },
    async start() {
      startCalls += 1;
      events.push('start');
      phase = 'running';
      options.onStart?.();
      if (options.lossOnStart) lossDeferred.resolve({ nativeEvent: 'HELPER_EXIT' });
      if (options.closeOnStart !== false) close(clean);
      return { running: true };
    },
    async abort() {
      abortCalls += 1;
      events.push('abort');
      if (options.abortError) throw options.abortError;
      return close(options.abortTerminal ?? terminal({
        running: false,
        releaseReason: 'abort_prepared',
      }));
    },
    async terminate() {
      terminateCalls += 1;
      events.push('terminate');
      if (options.terminateError) throw options.terminateError;
      return close(stopped);
    },
    async terminateAfterLoss() {
      lossTerminateCalls += 1;
      events.push('terminate-after-loss');
      if (options.lossTerminateError) throw options.lossTerminateError;
      return close(terminal({
        code: null,
        signal: null,
        unexpected: true,
        released: false,
        releaseVerified: false,
        releaseReason: 'controller_lost',
        helperExitCode: 1,
      }));
    },
  };
  return guardian;
}

function makeAdapters(fixture, guardian, options = {}) {
  const events = options.events ?? guardian.events;
  const identity = identityFor(fixture, options.identityOverrides);
  let inspection = 0;
  const overrides = {
    prepareGuardian(input) {
      events.push('prepare');
      options.onPrepare?.(input);
      return guardian;
    },
    inspectEntry(candidate) {
      events.push(candidate === fixture.mountPoint ? 'target' : 'parent');
      return candidate === fixture.mountPoint ? identity.targetEntry : identity.parentEntry;
    },
    inspectMount() {
      inspection += 1;
      events.push(`mount-${inspection}`);
      if (options.failInspectionAt === inspection) {
        return { ...identity.parentMount, internal: false };
      }
      options.onInspectMount?.(inspection);
      return identity.parentMount;
    },
    validateGuardianTerminal(value) {
      if (options.terminalValidationError) throw options.terminalValidationError;
      return value;
    },
    pipeGuardianOutput() {
      events.push('pipe');
      if (options.invalidPipeCleanup) return true;
      return () => events.push('unpipe');
    },
    sleep() {
      events.push('sleep');
      return Promise.resolve();
    },
  };
  if (typeof options.recoveryBarrier === 'function') {
    overrides.assertRecoveryBarrier = () => {
      events.push('barrier');
      return options.recoveryBarrier();
    };
  } else {
    overrides.assertRecoveryBarrier = () => {
      events.push('barrier');
      options.onBarrier?.();
      if (options.recoveryError) throw options.recoveryError;
      return {
        ok: true,
        markerAbsent: true,
        transactionsChecked: 0,
        finalClosuresChecked: 0,
      };
    };
  }
  return createSystemAdapters(overrides);
}

function superviseOptions(fixture, adapters, signalSource = new EventEmitter()) {
  return {
    adapters,
    signalSource,
    expectedCanonicalMountPoint: fixture.mountPoint,
    expectedInternalVolumeUuid: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    allowFixtureWriterIdentity: true,
    fixtureWriterIdentity: fixture.fixtureWriterIdentity,
    monitorIntervalMs: 1,
  };
}

test('production schema is closed V2 internal-APFS only and uses distinct lock/barrier paths', () => {
  const root = makeRoot('yuri-storage-v2-schema');
  try {
    const fixture = makeFixture(root);
    assert.deepEqual(validateConfig(fixture.config, {
      expectedCanonicalMountPoint: fixture.mountPoint,
      expectedInternalVolumeUuid: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    }), fixture.config);
    for (const invalid of [
      { ...fixture.config, schemaVersion: 1 },
      { ...fixture.config, mode: 'external-runtime' },
      { ...fixture.config, imagePath: '/tmp/runtime.image' },
    ]) {
      assert.throws(
        () => validateConfig(invalid, { expectedCanonicalMountPoint: fixture.mountPoint }),
        (error) => error.code === 'SCHEMA_INVALID',
      );
    }
    assert.notEqual(BACKEND_OPERATION_LOCK_PATH, RECOVERY_MARKER_PATH);
    assert.equal(path.basename(BACKEND_OPERATION_LOCK_PATH), 'backend-operation.lock');
    assert.equal(path.basename(RECOVERY_MARKER_PATH), 'backend-data-recovery.lock');
  } finally {
    cleanup(root);
  }
});

test('production source has no legacy external-storage or raw writer-spawn surface', () => {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  for (const forbidden of [
    'spawnWriter',
    'killProcessGroup',
    'hdiutil',
    'sparsebundle',
    'YURI-Backend-Runtime',
    'volume-broker',
    'backend-storage-guard-legacy-v1-fixture',
    "require('node:",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.doesNotMatch(source, /\bspawn\s*\(/u);
  assert.doesNotMatch(source, /\bfork\s*\(/u);
  assert.match(source, /prepareGuardedBackendWriter/u);
  assert.match(source, /assertRecoveryStateAllowsWriter/u);
  assert.equal(
    (source.match(/timeout: SYSTEM_INSPECTION_TIMEOUT_MS/gu) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/killSignal: 'SIGKILL'/gu) ?? []).length,
    2,
  );
});

test('internal APFS identity accepts the exact pinned local topology with no external calls', async () => {
  const root = makeRoot('yuri-storage-v2-identity');
  try {
    const fixture = makeFixture(root);
    const guardian = makeGuardian();
    const adapters = makeAdapters(fixture, guardian);
    const ready = await ensureMounted(fixture.config, adapters);
    assert.equal(ready.mode, 'internal-apfs');
    assert.equal(ready.alreadyMounted, true);
    assert.equal(guardian.startCalls, 0);
  } finally {
    cleanup(root);
  }
});

test('internal APFS identity rejects a containing-volume record from another device', async () => {
  const root = makeRoot('yuri-storage-v2-device-binding');
  try {
    const fixture = makeFixture(root);
    const guardian = makeGuardian();
    const adapters = makeAdapters(fixture, guardian, {
      identityOverrides: { parentMount: { deviceId: '99' } },
    });
    await assert.rejects(
      ensureMounted(fixture.config, adapters),
      (error) => error.code === 'INTERNAL_MOUNTPOINT_INVALID',
    );
  } finally {
    cleanup(root);
  }
});

test('guardian is held before each recovery barrier and barrier+identity repeat immediately pre-start', async () => {
  const root = makeRoot('yuri-storage-v2-order');
  try {
    const fixture = makeFixture(root);
    const events = [];
    const guardian = makeGuardian({ events });
    let preparedInput;
    const adapters = makeAdapters(fixture, guardian, {
      events,
      onPrepare(input) { preparedInput = input; },
    });
    const result = await superviseWriter(
      fixture.config,
      fixture.writerArgv,
      superviseOptions(fixture, adapters),
    );
    assert.equal(result.code, 0);
    assert.equal(preparedInput.lockPath, BACKEND_OPERATION_LOCK_PATH);
    assert.notEqual(preparedInput.lockPath, RECOVERY_MARKER_PATH);
    assert.deepEqual(preparedInput.args, [fixture.serverPath]);
    assert.deepEqual(preparedInput.env, {
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      PATH: `${path.dirname(CANONICAL_NODE_BINARY)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    });
    assert.deepEqual(events.slice(0, 14), [
      'prepare',
      'held', 'barrier',
      'target', 'parent', 'mount-1',
      'held', 'barrier',
      'target', 'parent', 'mount-2',
      'held', 'pipe', 'start',
    ]);
    assert.equal(events.at(-1), 'unpipe');
  } finally {
    cleanup(root);
  }
});

test('writer environment is closed internally and arbitrary env overrides fail before prepare', async () => {
  const root = makeRoot('yuri-storage-v2-environment');
  const keys = [
    'NODE_OPTIONS',
    'NODE_PATH',
    'YURI_DB_PATH',
    'YURI_ROOT',
    'SYSTEM_ROOT',
    'DOTENV_CONFIG_PATH',
    'YURI_BACKEND_CONFIG',
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) process.env[key] = `/attacker/${key.toLowerCase()}`;
    const fixture = makeFixture(root);
    let observedEnvironment;
    const guardian = makeGuardian();
    const adapters = makeAdapters(fixture, guardian, {
      onPrepare(input) { observedEnvironment = input.env; },
    });
    const result = await superviseWriter(
      fixture.config,
      fixture.writerArgv,
      superviseOptions(fixture, adapters),
    );
    assert.equal(result.code, 0);
    assert.deepEqual(Object.keys(observedEnvironment).sort(), ['LANG', 'LC_ALL', 'PATH']);
    for (const key of keys) assert.equal(key in observedEnvironment, false, key);
    await assert.rejects(
      main(['supervise', '--config', FIXED_CONFIG_PATH, '--', ...fixture.writerArgv]),
      (error) => error.code === 'DIRECT_CLI_ENVIRONMENT_FORBIDDEN'
        && error.details.forbidden.includes('NODE_OPTIONS')
        && error.details.forbidden.includes('YURI_DB_PATH'),
    );

    const rejectedGuardian = makeGuardian();
    const rejectedAdapters = makeAdapters(fixture, rejectedGuardian);
    await assert.rejects(
      superviseWriter(fixture.config, fixture.writerArgv, {
        ...superviseOptions(fixture, rejectedAdapters),
        env: { NODE_OPTIONS: '--require=/attacker/preload.cjs' },
      }),
      (error) => error.code === 'WRITER_ENV_OVERRIDE_FORBIDDEN',
    );
    assert.equal(rejectedGuardian.startCalls, 0);
    assert.equal(rejectedGuardian.events.includes('prepare'), false);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    cleanup(root);
  }
});

test('contradictory writable, read-only, and ownership plist companions fail closed', () => {
  for (const info of [
    { Internal: true, Writable: true, WritableVolume: false, Owners: true },
    { Internal: true, Writable: true, ReadOnly: true, ReadOnlyVolume: false, Owners: true },
    { Internal: true, Writable: true, Owners: true, OwnershipEnabled: false },
  ]) {
    const decision = decideInternalFromPlistInfo(info);
    assert.equal(decision.parseConflict, true);
    assert.equal(decision.internal, false);
  }
});

test('diskutil string aliases and df evidence are contradiction-closed', () => {
  const inspectedPath = '/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/backend';
  const dfRecord = Object.freeze({ sourceDevice: '/dev/disk42', mountPoint: '/' });
  const baseline = Object.freeze({
    DeviceIdentifier: 'disk42',
    DeviceLocation: 'Internal',
    DeviceNode: '/dev/disk42',
    FileSystemPersonality: 'APFS',
    FilesystemType: 'apfs',
    Internal: true,
    MountPoint: '/',
    Owners: true,
    ReadOnly: false,
    Removable: false,
    TypeBundle: 'apple_apfs',
    VolumeUUID: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    Writable: true,
  });
  const accepted = normalizeDiskutilMountInfo(baseline, dfRecord, inspectedPath, '42');
  assert.equal(accepted.parseConflict, false);
  assert.equal(accepted.fsType, 'apfs');
  assert.equal(accepted.mountPoint, '/');
  assert.equal(accepted.deviceIdentifier, 'disk42');
  assert.equal(accepted.dfDeviceIdentifier, 'disk42');

  const conflictingUuid = '11111111-2222-3333-4444-555555555555';
  const cases = [
    { label: 'filesystem aliases', info: { ...baseline, TypeBundle: 'hfs' } },
    { label: 'diskutil versus df mountpoint', info: { ...baseline, MountPoint: '/contradictory' } },
    { label: 'mountpoint companions', info: { ...baseline, mountPoint: '/contradictory' } },
    { label: 'device aliases', info: { ...baseline, DeviceNode: '/dev/disk43' } },
    { label: 'uuid aliases', info: { ...baseline, APFSVolumeUUID: conflictingUuid } },
    { label: 'unknown device location', info: { ...baseline, DeviceLocation: 'Mystery' } },
    {
      label: 'lowercase removable location alias',
      info: {
        ...Object.fromEntries(Object.entries(baseline).filter(([key]) => key !== 'DeviceLocation')),
        deviceLocation: 'removable',
      },
    },
    { label: 'nonnormalized plist path', info: { ...baseline, MountPoint: '/private/tmp/../tmp' } },
    {
      label: 'nonnormalized df path',
      info: baseline,
      df: { ...dfRecord, mountPoint: '/System/Volumes/Data/' },
    },
    {
      label: 'matching trailing-slash paths remain noncanonical',
      info: { ...baseline, MountPoint: '/System/Volumes/Data/' },
      df: { ...dfRecord, mountPoint: '/System/Volumes/Data/' },
    },
    {
      label: 'unbound df device',
      info: baseline,
      df: { ...dfRecord, sourceDevice: '/dev/disk43' },
    },
    {
      label: 'missing required mountpoint',
      info: Object.fromEntries(Object.entries(baseline).filter(([key]) => key !== 'MountPoint')),
    },
  ];
  for (const candidate of cases) {
    const result = normalizeDiskutilMountInfo(
      candidate.info,
      candidate.df ?? dfRecord,
      inspectedPath,
      '42',
    );
    assert.equal(result.parseConflict, true, candidate.label);
    if (candidate.label === 'unknown device location') assert.equal(result.internal, false);
  }
});

test('production firmlink binds the logical backend path to the pinned Data volume', () => {
  const canonicalParent = '/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/backend';
  const canonicalTarget = path.join(canonicalParent, 'data');
  const deviceId = '16777232';
  const dfRecord = Object.freeze({
    sourceDevice: '/dev/disk3s5',
    mountPoint: '/System/Volumes/Data',
  });
  const diskutilInfo = Object.freeze({
    DeviceIdentifier: 'disk3s5',
    DeviceLocation: 'Internal',
    DeviceNode: '/dev/disk3s5',
    FilesystemType: 'apfs',
    GlobalPermissionsEnabled: true,
    Internal: true,
    MountPoint: '/System/Volumes/Data',
    Owners: true,
    ReadOnly: false,
    ReadOnlyVolume: false,
    Removable: false,
    VolumeUUID: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    Writable: true,
    WritableVolume: true,
  });
  const config = validateConfig({
    schemaVersion: 2,
    mode: 'internal-apfs',
    mountPoint: canonicalTarget,
    expectedVolumeUuid: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
  });
  const parentMount = normalizeDiskutilMountInfo(
    diskutilInfo,
    dfRecord,
    canonicalParent,
    deviceId,
  );
  const identity = {
    targetEntry: {
      exists: true,
      isDirectory: true,
      isFile: false,
      isSymbolicLink: false,
      realPath: canonicalTarget,
      deviceId,
      mode: 0o40700,
    },
    parentEntry: {
      exists: true,
      isDirectory: true,
      isFile: false,
      isSymbolicLink: false,
      realPath: canonicalParent,
      deviceId,
      mode: 0o40755,
    },
    parentMount,
  };

  assert.equal(parentMount.parseConflict, false);
  assert.equal(parentMount.inspectedPath, canonicalParent);
  assert.equal(parentMount.mountPoint, '/System/Volumes/Data');
  assert.equal(parentMount.dfMountPoint, '/System/Volumes/Data');
  assert.equal(parentMount.deviceIdentifier, 'disk3s5');
  assert.equal(parentMount.dfDeviceIdentifier, 'disk3s5');
  assert.equal(parentMount.volumeUuid, INTERNAL_APFS_EXPECTED_VOLUME_UUID);
  assert.equal(validateInternalApfsIdentity(config, identity), identity);

  const systemRootMismatch = normalizeDiskutilMountInfo(
    { ...diskutilInfo, MountPoint: '/' },
    dfRecord,
    canonicalParent,
    deviceId,
  );
  assert.equal(systemRootMismatch.parseConflict, true);
  assert.throws(
    () => validateInternalApfsIdentity(config, {
      ...identity,
      parentMount: systemRootMismatch,
    }),
    (error) => error?.code === 'INTERNAL_MOUNTPOINT_INVALID',
  );
});

test('internal APFS validator consumes exact mount, inspected-path, and device coherence', () => {
  const root = makeRoot('yuri-storage-identity-coherence');
  try {
    const fixture = makeFixture(root);
    const accepted = identityFor(fixture);
    assert.equal(validateInternalApfsIdentity(fixture.config, accepted), accepted);
    for (const [label, parentMount] of [
      ['inspected path', { inspectedPath: '/private/tmp/other-parent' }],
      ['diskutil mountpoint', { mountPoint: '/System/Volumes/Data' }],
      ['df mountpoint', { dfMountPoint: '/System/Volumes/Data' }],
      ['device identifier', { deviceIdentifier: 'disk43' }],
      ['df device identifier', { dfDeviceIdentifier: 'disk43' }],
    ]) {
      assert.throws(
        () => validateInternalApfsIdentity(
          fixture.config,
          identityFor(fixture, { parentMount }),
        ),
        (error) => error?.code === 'INTERNAL_MOUNTPOINT_INVALID',
        label,
      );
    }
  } finally {
    cleanup(root);
  }
});

test('recovery active, malformed, incomplete, and torn states abort before storage/start', async (t) => {
  for (const code of [
    'RECOVERY_STATE_ACTIVE',
    'RECOVERY_STATE_MALFORMED',
    'RECOVERY_STATE_INCOMPLETE',
    'RECOVERY_STATE_CORRELATION_MISMATCH',
  ]) {
    await t.test(code, async () => {
      const root = makeRoot(`yuri-storage-${code.toLowerCase()}`);
      try {
        const fixture = makeFixture(root);
        const events = [];
        const guardian = makeGuardian({ events });
        const recoveryError = new Error(code);
        recoveryError.code = code;
        const adapters = makeAdapters(fixture, guardian, { events, recoveryError });
        await assert.rejects(
          superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
          (error) => error.code === code,
        );
        assert.equal(guardian.abortCalls, 1);
        assert.equal(guardian.startCalls, 0);
        assert.equal(events.some((entry) => entry === 'target'), false);
      } finally {
        cleanup(root);
      }
    });
  }
});

test('the real recovery barrier rejects an active marker and malformed/torn transaction records', async (t) => {
  for (const fixtureState of ['active', 'malformed', 'torn']) {
    await t.test(fixtureState, async () => {
      const root = makeRecoveryRoot(`yuri-storage-real-recovery-${fixtureState}`);
      try {
        const fixture = makeFixture(root);
        const recoveryFixture = createBackendDataRecoveryFixtureApi({
          root,
          adapters: recoveryFixtureAdapters(),
        });
        const receipts = recoveryFixture.paths.receiptRoot;
        fs.mkdirSync(receipts, { recursive: true, mode: 0o700 });
        const markerPath = path.join(receipts, path.basename(RECOVERY_MARKER_PATH));
        if (fixtureState === 'active') fs.writeFileSync(markerPath, '{}', { mode: 0o600 });
        else {
          const transaction = path.join(receipts, 'backend-data-transaction-test.json');
          fs.writeFileSync(
            transaction,
            fixtureState === 'malformed' ? '{not-json' : JSON.stringify({ state: 'active' }),
            { mode: 0o600 },
          );
        }
        const guardian = makeGuardian();
        const adapters = makeAdapters(fixture, guardian, {
          recoveryBarrier: recoveryFixture.assertRecoveryStateAllowsWriter,
        });
        const options = superviseOptions(fixture, adapters);
        const expected = fixtureState === 'active'
          ? 'RECOVERY_STATE_ACTIVE'
          : fixtureState === 'malformed'
            ? 'RECOVERY_STATE_MALFORMED'
            : 'RECOVERY_STATE_INCOMPLETE';
        await assert.rejects(
          superviseWriter(fixture.config, fixture.writerArgv, options),
          (error) => error.code === expected,
        );
        assert.equal(guardian.abortCalls, 1);
        assert.equal(guardian.startCalls, 0);
      } finally {
        cleanup(root);
      }
    });
  }
});

test('missing adapters and malformed signal sources fail with typed errors before guardian preparation', async () => {
  const root = makeRoot('yuri-storage-adapter-errors');
  try {
    const fixture = makeFixture(root);
    await assert.rejects(
      superviseWriter(fixture.config, fixture.writerArgv, {
        ...superviseOptions(fixture, {}),
      }),
      (error) => error.code === 'ADAPTER_INVALID',
    );
    const guardian = makeGuardian();
    const adapters = makeAdapters(fixture, guardian);
    await assert.rejects(
      superviseWriter(fixture.config, fixture.writerArgv, {
        ...superviseOptions(fixture, adapters),
        signalSource: { on() {} },
      }),
      (error) => error.code === 'SUPERVISOR_SIGNAL_SOURCE_INVALID',
    );
    assert.equal(guardian.startCalls, 0);
  } finally {
    cleanup(root);
  }
});

test('writer supervision refuses caller-selected recovery barrier paths before guardian preparation', async () => {
  const root = makeRoot('yuri-storage-recovery-override');
  try {
    const fixture = makeFixture(root);
    const guardian = makeGuardian();
    const adapters = makeAdapters(fixture, guardian);
    await assert.rejects(
      superviseWriter(fixture.config, fixture.writerArgv, {
        ...superviseOptions(fixture, adapters),
        recoveryStateOptions: {
          markerPath: path.join(root, 'attacker-marker'),
          receiptRoot: root,
        },
      }),
      (error) => error?.code === 'RECOVERY_BARRIER_OVERRIDE_FORBIDDEN',
    );
    assert.equal(guardian.events.includes('prepare'), false);
    assert.equal(guardian.startCalls, 0);
  } finally {
    cleanup(root);
  }
});

test('pre-start and running supervisor signals use exact abort/terminate cleanup', async (t) => {
  await t.test('pre-start', async () => {
    const root = makeRoot('yuri-storage-prestart-signal');
    try {
      const fixture = makeFixture(root);
      const source = new EventEmitter();
      const guardian = makeGuardian();
      const adapters = makeAdapters(fixture, guardian, {
        onInspectMount(inspection) {
          if (inspection === 1) source.emit('SIGTERM');
        },
      });
      const result = await superviseWriter(
        fixture.config,
        fixture.writerArgv,
        superviseOptions(fixture, adapters, source),
      );
      assert.equal(result.supervisorSignal, 'SIGTERM');
      assert.equal(guardian.abortCalls, 1);
      assert.equal(guardian.terminateCalls, 0);
      assert.equal(guardian.startCalls, 0);
    } finally {
      cleanup(root);
    }
  });
  await t.test('running', async () => {
    const root = makeRoot('yuri-storage-running-signal');
    try {
      const fixture = makeFixture(root);
      const source = new EventEmitter();
      const guardian = makeGuardian({ closeOnStart: false, onStart: () => source.emit('SIGINT') });
      const adapters = makeAdapters(fixture, guardian);
      const result = await superviseWriter(
        fixture.config,
        fixture.writerArgv,
        superviseOptions(fixture, adapters, source),
      );
      assert.equal(result.supervisorSignal, 'SIGINT');
      assert.equal(guardian.abortCalls, 0);
      assert.equal(guardian.terminateCalls, 1);
      assert.equal(guardian.lossTerminateCalls, 0);
    } finally {
      cleanup(root);
    }
  });
});

test('guardian loss uses loss cleanup while storage identity loss uses ordinary terminate', async (t) => {
  await t.test('pre-start guardian loss', async () => {
    const root = makeRoot('yuri-storage-prestart-loss');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian({ preStartLoss: true });
      const adapters = makeAdapters(fixture, guardian);
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'OPERATION_LOCK_LOST',
      );
      assert.equal(guardian.startCalls, 0);
      assert.equal(guardian.lossTerminateCalls, 1);
    } finally {
      cleanup(root);
    }
  });
  await t.test('running guardian loss', async () => {
    const root = makeRoot('yuri-storage-running-loss');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian({ closeOnStart: false, lossOnStart: true });
      const adapters = makeAdapters(fixture, guardian);
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'OPERATION_LOCK_LOST',
      );
      assert.equal(guardian.lossTerminateCalls, 1);
      assert.equal(guardian.terminateCalls, 0);
    } finally {
      cleanup(root);
    }
  });
  await t.test('storage identity loss', async () => {
    const root = makeRoot('yuri-storage-identity-loss');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian({ closeOnStart: false });
      const adapters = makeAdapters(fixture, guardian, { failInspectionAt: 3 });
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'MOUNT_IDENTITY_LOST',
      );
      assert.equal(guardian.terminateCalls, 1);
      assert.equal(guardian.lossTerminateCalls, 0);
    } finally {
      cleanup(root);
    }
  });
});

test('fast clean and nonzero writer exits preserve exact terminal code semantics', async (t) => {
  for (const code of [0, 7]) {
    await t.test(`exit ${code}`, async () => {
      const root = makeRoot(`yuri-storage-fast-${code}`);
      try {
        const fixture = makeFixture(root);
        const guardian = makeGuardian({ terminal: terminal({ code }) });
        const adapters = makeAdapters(fixture, guardian);
        const result = await superviseWriter(
          fixture.config,
          fixture.writerArgv,
          superviseOptions(fixture, adapters),
        );
        assert.equal(result.code, code);
        assert.equal(result.signal, null);
        assert.equal(result.writerStarted, true);
      } finally {
        cleanup(root);
      }
    });
  }
});

test('malformed terminal evidence and cleanup failure surface exact typed errors', async (t) => {
  await t.test('terminal evidence', async () => {
    const root = makeRoot('yuri-storage-terminal-malformed');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian();
      const terminalError = new Error('invalid terminal');
      terminalError.code = 'LOCK_ATTESTATION_INVALID';
      const adapters = makeAdapters(fixture, guardian, { terminalValidationError: terminalError });
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'GUARDIAN_TERMINAL_INVALID',
      );
    } finally {
      cleanup(root);
    }
  });
  await t.test('cleanup', async () => {
    const root = makeRoot('yuri-storage-cleanup-failure');
    try {
      const fixture = makeFixture(root);
      const abortError = new Error('abort failed');
      abortError.code = 'NATIVE_SENTINEL_CLEANUP_STALLED';
      const guardian = makeGuardian({ abortError });
      const recoveryError = new Error('active');
      recoveryError.code = 'RECOVERY_STATE_ACTIVE';
      const adapters = makeAdapters(fixture, guardian, { recoveryError });
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'GUARDIAN_CLEANUP_FAILED'
          && error.details.causeCode === 'RECOVERY_STATE_ACTIVE',
      );
    } finally {
      cleanup(root);
    }
  });
});

test('ordinary abort/terminate never accept unsafe release evidence as cleanup success', async (t) => {
  const unsafe = terminal({
    unexpected: true,
    released: false,
    releaseVerified: false,
    helperExitCode: 1,
  });

  await t.test('pre-start signal abort', async () => {
    const root = makeRoot('yuri-storage-unsafe-abort');
    try {
      const fixture = makeFixture(root);
      const source = new EventEmitter();
      const guardian = makeGuardian({ abortTerminal: { ...unsafe, runningEvent: null } });
      const adapters = makeAdapters(fixture, guardian, {
        onInspectMount(inspection) {
          if (inspection === 1) source.emit('SIGTERM');
        },
      });
      await assert.rejects(
        superviseWriter(
          fixture.config,
          fixture.writerArgv,
          superviseOptions(fixture, adapters, source),
        ),
        (error) => error.code === 'GUARDIAN_CLEANUP_FAILED'
          && error.details.causeCode === 'GUARDIAN_TERMINAL_INVALID',
      );
      assert.equal(guardian.abortCalls, 1);
      assert.equal(guardian.startCalls, 0);
    } finally {
      cleanup(root);
    }
  });

  await t.test('running signal terminate', async () => {
    const root = makeRoot('yuri-storage-unsafe-signal-terminate');
    try {
      const fixture = makeFixture(root);
      const source = new EventEmitter();
      const guardian = makeGuardian({
        closeOnStart: false,
        onStart: () => source.emit('SIGINT'),
        stoppedTerminal: unsafe,
      });
      const adapters = makeAdapters(fixture, guardian);
      await assert.rejects(
        superviseWriter(
          fixture.config,
          fixture.writerArgv,
          superviseOptions(fixture, adapters, source),
        ),
        (error) => error.code === 'GUARDIAN_CLEANUP_FAILED'
          && error.details.causeCode === 'GUARDIAN_TERMINAL_INVALID',
      );
      assert.equal(guardian.terminateCalls, 1);
      assert.equal(guardian.lossTerminateCalls, 0);
    } finally {
      cleanup(root);
    }
  });

  await t.test('identity-loss terminate', async () => {
    const root = makeRoot('yuri-storage-unsafe-identity-terminate');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian({ closeOnStart: false, stoppedTerminal: unsafe });
      const adapters = makeAdapters(fixture, guardian, { failInspectionAt: 3 });
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'GUARDIAN_CLEANUP_FAILED'
          && error.details.causeCode === 'GUARDIAN_TERMINAL_INVALID',
      );
      assert.equal(guardian.terminateCalls, 1);
      assert.equal(guardian.lossTerminateCalls, 0);
    } finally {
      cleanup(root);
    }
  });

  await t.test('error unwind abort', async () => {
    const root = makeRoot('yuri-storage-unsafe-unwind-abort');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian({ abortTerminal: { ...unsafe, runningEvent: null } });
      const recoveryError = new Error('active');
      recoveryError.code = 'RECOVERY_STATE_ACTIVE';
      const adapters = makeAdapters(fixture, guardian, { recoveryError });
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'GUARDIAN_CLEANUP_FAILED'
          && error.details.causeCode === 'RECOVERY_STATE_ACTIVE',
      );
      assert.equal(guardian.abortCalls, 1);
    } finally {
      cleanup(root);
    }
  });

  await t.test('explicit loss cleanup remains typed loss', async () => {
    const root = makeRoot('yuri-storage-unsafe-loss-terminal');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian({ closeOnStart: false, lossOnStart: true });
      const adapters = makeAdapters(fixture, guardian);
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'OPERATION_LOCK_LOST',
      );
      assert.equal(guardian.lossTerminateCalls, 1);
      assert.equal(guardian.terminateCalls, 0);
    } finally {
      cleanup(root);
    }
  });
});

test('writer argv and server digest are exact, pinned, and re-attested', async (t) => {
  await t.test('extra argv rejected', async () => {
    const root = makeRoot('yuri-storage-argv');
    try {
      const fixture = makeFixture(root);
      await assert.rejects(
        superviseWriter(fixture.config, [...fixture.writerArgv, '--extra'], {
          ...superviseOptions(fixture, {}),
        }),
        (error) => error.code === 'WRITER_COMMAND_INVALID',
      );
    } finally {
      cleanup(root);
    }
  });
  await t.test('missing pin rejected', async () => {
    const root = makeRoot('yuri-storage-pin');
    try {
      const fixture = makeFixture(root);
      const guardian = makeGuardian();
      const adapters = makeAdapters(fixture, guardian);
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, {
          ...superviseOptions(fixture, adapters),
          fixtureWriterIdentity: { ...fixture.fixtureWriterIdentity, serverSha256: null },
        }),
        (error) => error.code === 'WRITER_ARTIFACT_PIN_MISSING',
      );
    } finally {
      cleanup(root);
    }
  });
  await t.test('digest drift rejected', async () => {
    const root = makeRoot('yuri-storage-digest');
    try {
      const fixture = makeFixture(root);
      fs.appendFileSync(fixture.serverPath, '\n// drift\n');
      const guardian = makeGuardian();
      const adapters = makeAdapters(fixture, guardian);
      await assert.rejects(
        superviseWriter(fixture.config, fixture.writerArgv, superviseOptions(fixture, adapters)),
        (error) => error.code === 'WRITER_ARTIFACT_DIGEST_MISMATCH',
      );
      assert.equal(guardian.startCalls, 0);
    } finally {
      cleanup(root);
    }
  });
});

test('production CLI fixes the config path and production artifact enrollment remains absent', async () => {
  assert.equal(FIXED_CONFIG_PATH, path.join(
    '/Users/marcelspatz/YURI-OS-MUSUBI',
    '_SYSTEM/state/backend-volume/config.json',
  ));
  assert.equal(CANONICAL_NODE_BINARY, '/opt/homebrew/Cellar/node/26.4.0/bin/node');
  assert.equal(CANONICAL_BACKEND_SERVER_ARTIFACT, path.join(
    '/Users/marcelspatz/YURI-OS-MUSUBI',
    '_SYSTEM/backend/dist/server.js',
  ));
  assert.equal(CANONICAL_BACKEND_SERVER_SHA256, null);
  await assert.rejects(
    main(['supervise', '--config', '/tmp/not-the-fixed-config.json', '--', '/usr/bin/node', '/tmp/server.js']),
    (error) => error.code === 'CONFIG_PATH_INVALID',
  );
});

test('real native guardian executes one no-fork fixture writer under the V2 barrier', { timeout: 30_000 }, async () => {
  const root = makeRecoveryRoot('yuri-storage-real-guardian');
  const injectedKeys = ['NODE_OPTIONS', 'NODE_PATH', 'YURI_DB_PATH', 'YURI_ROOT'];
  const previous = new Map(injectedKeys.map((key) => [key, process.env[key]]));
  try {
    const preloadMarker = path.join(root, 'malicious-preload-observed');
    const preload = path.join(root, 'malicious-preload.cjs');
    fs.writeFileSync(
      preload,
      `require('node:fs').writeFileSync(${JSON.stringify(preloadMarker)}, 'observed');\n`,
      { mode: 0o600 },
    );
    const fixture = makeFixture(root, [
      "for (const key of ['NODE_OPTIONS','NODE_PATH','YURI_DB_PATH','YURI_ROOT']) {",
      "  if (Object.hasOwn(process.env, key)) process.exit(91);",
      '}',
      'process.stdout.write("REAL_GUARDIAN_OK ENV_CLOSED\\n");',
      '',
    ].join('\n'));
    const recoveryFixture = createBackendDataRecoveryFixtureApi({
      root,
      adapters: recoveryFixtureAdapters(),
    });
    const lockPath = path.join(root, 'lock', 'backend-operation.lock');
    bootstrapBackendOperationLockAnchor({ lockPath, ownerApproved: true });
    const helper = compileFreshC({
      sourcePath: BACKEND_OPERATION_LOCK_SOURCE,
      expectedSourceSha256: BACKEND_OPERATION_LOCK_SOURCE_SHA256,
      binRoot: path.join(root, 'bin'),
      label: 'storage-guard-real-fixture',
    });
    let canonicalLockObserved = false;
    let output = '';
    const identity = identityFor(fixture);
    const adapters = createSystemAdapters({
      assertRecoveryBarrier: recoveryFixture.assertRecoveryStateAllowsWriter,
      prepareGuardian(input) {
        canonicalLockObserved = input.lockPath === BACKEND_OPERATION_LOCK_PATH;
        return prepareNativeGuardian({ ...input, lockPath, helper });
      },
      inspectEntry(candidate) {
        return candidate === fixture.mountPoint ? identity.targetEntry : identity.parentEntry;
      },
      inspectMount() { return identity.parentMount; },
      pipeGuardianOutput(stdout, stderr) {
        const onStdout = (chunk) => { output += chunk.toString('utf8'); };
        const onStderr = (chunk) => { output += chunk.toString('utf8'); };
        stdout.on('data', onStdout);
        stderr.on('data', onStderr);
        return () => {
          stdout.removeListener('data', onStdout);
          stderr.removeListener('data', onStderr);
        };
      },
    });
    process.env.NODE_OPTIONS = `--require=${preload}`;
    process.env.NODE_PATH = path.join(root, 'attacker-node-path');
    process.env.YURI_DB_PATH = path.join(root, 'attacker.db');
    process.env.YURI_ROOT = path.join(root, 'attacker-root');
    const result = await superviseWriter(fixture.config, fixture.writerArgv, {
      ...superviseOptions(fixture, adapters),
      cwd: root,
      guardianTimeoutMs: 10_000,
    });
    assert.equal(canonicalLockObserved, true);
    assert.equal(result.code, 0);
    assert.equal(result.terminal.writerSucceeded, true);
    assert.equal(result.terminal.releaseVerified, true);
    assert.equal(result.terminal.unexpected, false);
    assert.match(output, /REAL_GUARDIAN_OK ENV_CLOSED/u);
    assert.equal(fs.existsSync(preloadMarker), false, 'inherited NODE_OPTIONS preload ran');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    cleanup(root);
  }
});
