#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BROKER_PURPOSE,
  BROKER_EXEC_TIMEOUT_MS,
  BackendStorageGuardError,
  attachThroughBroker,
  brokerArgs,
  inspectEntrySystem,
  isDirectoryEmptySystem,
  runBroker,
  superviseWriter,
  validateBackingIdentity,
  validateConfig,
  validateDetachedIdentity,
  validateIdentity,
  validateMountIdentity,
} from './backend-storage-guard.mjs';

const HOST_UUID = '11111111-2222-4333-8444-555555555555';
const VOLUME_UUID = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';

function fixture() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-backend-storage-guard-')));
  const hostMount = path.join(root, 'T7');
  const imagePath = path.join(hostMount, 'YURI-Backend-Runtime-v1.sparsebundle');
  const mountPoint = path.join(root, 'repo', '_SYSTEM', 'backend', 'data');
  const brokerPath = path.join(root, 'backend-storage-broker');
  fs.mkdirSync(imagePath, { recursive: true });
  fs.mkdirSync(mountPoint, { recursive: true });
  fs.writeFileSync(brokerPath, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const expectedBrokerSha256 = crypto.createHash('sha256').update(fs.readFileSync(brokerPath)).digest('hex');

  const raw = {
    schemaVersion: 1,
    expectedBrokerSha256,
    expectedHostUuid: HOST_UUID,
    imagePath,
    expectedVolumeUuid: VOLUME_UUID,
    mountPoint,
    brokerPath,
  };
  const validationOptions = {
    expectedCanonicalMountPoint: mountPoint,
    expectedImagePath: imagePath,
    expectedBrokerPath: brokerPath,
  };
  const config = validateConfig(raw, validationOptions);
  return {
    root,
    hostMount,
    config,
    validationOptions,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function validIdentity(fx) {
  return {
    backing: {
      imageEntry: {
        exists: true,
        isDirectory: true,
        isFile: false,
        isSymbolicLink: false,
        realPath: fx.config.imagePath,
        deviceId: 'host-device',
        mode: 0o40700,
      },
      brokerEntry: {
        exists: true,
        isDirectory: false,
        isFile: true,
        isSymbolicLink: false,
        realPath: fx.config.brokerPath,
        deviceId: 'parent-device',
        mode: 0o100700,
        sha256: fx.config.expectedBrokerSha256,
      },
      hostMount: {
        mountPoint: fx.hostMount,
        volumeUuid: HOST_UUID,
        fsType: 'exfat',
        writable: true,
        readOnly: false,
        ownersEnabled: false,
        deviceIdentifier: 'disk9s1',
        deviceId: 'host-device',
      },
    },
    mounted: {
      targetEntry: {
        exists: true,
        isDirectory: true,
        isFile: false,
        isSymbolicLink: false,
        realPath: fx.config.mountPoint,
        deviceId: 'inner-device',
        mode: 0o40700,
      },
      parentEntry: {
        exists: true,
        isDirectory: true,
        isFile: false,
        isSymbolicLink: false,
        realPath: path.dirname(fx.config.mountPoint),
        deviceId: 'parent-device',
        mode: 0o40700,
      },
      targetMount: {
        mountPoint: fx.config.mountPoint,
        volumeUuid: VOLUME_UUID,
        fsType: 'apfs',
        writable: true,
        readOnly: false,
        ownersEnabled: true,
        deviceIdentifier: 'disk11s1',
        deviceId: 'inner-device',
      },
    },
  };
}

function bareIdentity(fx) {
  const identity = validIdentity(fx);
  identity.mounted.targetEntry.isEmpty = true;
  identity.mounted.targetEntry.deviceId = 'parent-device';
  identity.mounted.targetEntry.mode = 0o40000;
  identity.mounted.targetMount.mountPoint = path.dirname(fx.config.mountPoint);
  identity.mounted.targetMount.deviceId = 'parent-device';
  identity.mounted.targetMount.volumeUuid = '99999999-8888-4777-8666-555555555555';
  identity.mounted.targetMount.fsType = 'apfs';
  return identity;
}

function realBareIdentity(fx) {
  const identity = bareIdentity(fx);
  identity.mounted.targetEntry = inspectEntrySystem(fx.config.mountPoint);
  identity.mounted.parentEntry = inspectEntrySystem(path.dirname(fx.config.mountPoint));
  identity.mounted.targetMount.mountPoint = path.dirname(fx.config.mountPoint);
  identity.mounted.targetMount.deviceId = identity.mounted.targetEntry.deviceId;
  delete identity.mounted.targetEntry.isEmpty;
  return identity;
}

function attachResponse(fx, overrides = {}) {
  return {
    ok: true,
    purpose: BROKER_PURPOSE,
    imagePath: fx.config.imagePath,
    mountPoint: fx.config.mountPoint,
    deviceIdentifier: 'disk11s1',
    volumeUUID: VOLUME_UUID,
    hostVolumeUUID: HOST_UUID,
    ...overrides,
  };
}

function detachResponse(fx, overrides = {}) {
  return {
    ok: true,
    mountPoint: fx.config.mountPoint,
    deviceIdentifier: 'disk11s1',
    volumeUUID: VOLUME_UUID,
    hostVolumeUUID: HOST_UUID,
    ...overrides,
  };
}

function brokerAdapter(fx, identities, calls, options = {}) {
  let index = 0;
  return {
    inspectEntry(candidate) {
      assert.equal(candidate, fx.config.brokerPath);
      return structuredClone(validIdentity(fx).backing.brokerEntry);
    },
    collectIdentity() {
      const value = identities[Math.min(index, identities.length - 1)];
      index += 1;
      return structuredClone(value);
    },
    execBroker(command, args, execOptions) {
      calls.push({ command, args, execOptions });
      const action = args[0];
      const response = action === 'attach'
        ? attachResponse(fx, options.attachOverrides)
        : detachResponse(fx, options.detachOverrides);
      return { status: 0, stdout: JSON.stringify(response), stderr: '' };
    },
    sleep() {
      return new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('closed config schema pins host, image, inner UUID, mountpoint, and broker', () => {
  const fx = fixture();
  try {
    assert.equal(fx.config.mountPoint.endsWith('/_SYSTEM/backend/data'), true);
    assert.equal(fx.config.expectedHostUuid, HOST_UUID);
    assert.equal(fx.config.expectedVolumeUuid, VOLUME_UUID);

    assert.throws(
      () => validateConfig({ ...fx.config, unexpected: true }, fx.validationOptions),
      (error) => error instanceof BackendStorageGuardError && error.code === 'SCHEMA_INVALID',
    );
    assert.throws(
      () => validateConfig({ ...fx.config, mountPoint: `${fx.config.mountPoint}-other` }, {
        ...fx.validationOptions,
      }),
      /exact canonical backend mountpoint/,
    );
    assert.throws(
      () => validateConfig({ ...fx.config, imagePath: `${fx.hostMount}/wrong.img` }, {
        ...fx.validationOptions,
      }),
      /exact enrolled Phase-1 image path/,
    );
  } finally {
    fx.cleanup();
  }
});

test('identity validation accepts exFAT backing only with exact host pin and strict APFS inner mount', () => {
  const fx = fixture();
  try {
    const identity = validIdentity(fx);
    assert.equal(validateIdentity(fx.config, identity), identity);

    const failures = [
      ['symlink', (copy) => { copy.mounted.targetEntry.isSymbolicLink = true; }],
      ['wrong target', (copy) => { copy.mounted.targetMount.mountPoint = path.dirname(fx.config.mountPoint); }],
      ['wrong filesystem', (copy) => { copy.mounted.targetMount.fsType = 'exfat'; }],
      ['read only', (copy) => { copy.mounted.targetMount.writable = false; }],
      ['ownership disabled', (copy) => { copy.mounted.targetMount.ownersEnabled = false; }],
      ['same parent device', (copy) => { copy.mounted.targetEntry.deviceId = 'parent-device'; copy.mounted.targetMount.deviceId = 'parent-device'; }],
      ['wrong inner UUID', (copy) => { copy.mounted.targetMount.volumeUuid = HOST_UUID; }],
    ];
    for (const [label, mutate] of failures) {
      const copy = structuredClone(identity);
      mutate(copy);
      assert.throws(() => validateMountIdentity(fx.config, copy.mounted), undefined, label);
    }

    const wrongHost = structuredClone(identity.backing);
    wrongHost.hostMount.volumeUuid = VOLUME_UUID;
    assert.throws(() => validateBackingIdentity(fx.config, wrongHost), /T7 pin/);
  } finally {
    fx.cleanup();
  }
});

test('broker argv and attach JSON are pinned; mismatched attach is detached and refused', async () => {
  const fx = fixture();
  try {
    assert.deepEqual(brokerArgs(fx.config, 'attach'), [
      'attach',
      '--image', fx.config.imagePath,
      '--mountpoint', fx.config.mountPoint,
      '--expected-volume-uuid', VOLUME_UUID,
      '--expected-host-uuid', HOST_UUID,
      '--json',
    ]);
    assert.deepEqual(brokerArgs(fx.config, 'detach'), [
      'detach',
      '--mountpoint', fx.config.mountPoint,
      '--expected-volume-uuid', VOLUME_UUID,
      '--expected-host-uuid', HOST_UUID,
      '--json',
    ]);

    const alreadyCalls = [];
    const already = await attachThroughBroker(
      fx.config,
      brokerAdapter(fx, [validIdentity(fx), bareIdentity(fx), bareIdentity(fx), validIdentity(fx)], alreadyCalls),
    );
    assert.equal(already.alreadyMounted, false);
    assert.deepEqual(
      alreadyCalls.map((call) => call.args[0]),
      ['detach', 'attach'],
      'an inherited mount must be reset and reattached through the exact enrolled image broker',
    );

    const calls = [];
    const wrongMounted = validIdentity(fx);
    wrongMounted.mounted.targetMount.volumeUuid = HOST_UUID;
    const adapters = brokerAdapter(fx, [bareIdentity(fx), wrongMounted, bareIdentity(fx)], calls);
    await assert.rejects(
      attachThroughBroker(fx.config, adapters),
      (error) => error.code === 'ATTACH_VALIDATION_FAILED' && error.details.detach.ok === true,
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args[0], 'attach');
    assert.equal(calls[0].execOptions.timeoutMs, BROKER_EXEC_TIMEOUT_MS);
    assert.equal(calls[1].args[0], 'detach');

    const responseMismatchCalls = [];
    const responseMismatchAdapters = brokerAdapter(
      fx,
      [bareIdentity(fx), bareIdentity(fx)],
      responseMismatchCalls,
      { attachOverrides: { purpose: 'wrong-purpose' } },
    );
    await assert.rejects(attachThroughBroker(fx.config, responseMismatchAdapters), /purpose/);
    assert.equal(responseMismatchCalls.at(-1).args[0], 'detach');

    const nonEmptyCalls = [];
    const nonEmpty = bareIdentity(fx);
    nonEmpty.mounted.targetEntry.isEmpty = false;
    await assert.rejects(
      attachThroughBroker(fx.config, brokerAdapter(fx, [nonEmpty], nonEmptyCalls)),
      (error) => error.code === 'BARE_MOUNTPOINT_NOT_EMPTY',
    );
    assert.equal(nonEmptyCalls.length, 0, 'guard must refuse non-empty bare target before broker attach');
  } finally {
    fx.cleanup();
  }
});

test('real mode-000 bare and detached directories validate without reopening the EACCES seal', async () => {
  const fx = fixture();
  try {
    fs.chmodSync(fx.config.mountPoint, 0o000);
    if (process.geteuid?.() !== 0) {
      assert.throws(
        () => fs.opendirSync(fx.config.mountPoint),
        (error) => error?.code === 'EACCES',
        'fixture must reproduce the production EACCES behavior',
      );
      assert.throws(
        () => isDirectoryEmptySystem(fx.config.mountPoint),
        (error) => error?.code === 'SYSTEM_INSPECTION_FAILED'
          && String(error.details?.cause).includes('EACCES'),
      );
    }

    const locked = realBareIdentity(fx);
    assert.equal(locked.mounted.targetEntry.realPath, fx.config.mountPoint);
    assert.equal(locked.mounted.targetEntry.mode & 0o7777, 0);
    assert.equal(
      locked.mounted.targetEntry.deviceId,
      locked.mounted.parentEntry.deviceId,
      'real bare target must be on the parent device',
    );

    let forbiddenOpenCalls = 0;
    const calls = [];
    const adapters = {
      ...brokerAdapter(fx, [locked, validIdentity(fx)], calls),
      isDirectoryEmpty() {
        forbiddenOpenCalls += 1;
        return isDirectoryEmptySystem(fx.config.mountPoint);
      },
    };
    const attached = await attachThroughBroker(fx.config, adapters);
    assert.equal(attached.broker.ok, true);
    assert.deepEqual(calls.map((call) => call.args[0]), ['attach']);

    const detached = await validateDetachedIdentity(fx.config, locked, adapters);
    assert.equal(detached, locked);
    assert.equal(forbiddenOpenCalls, 0, 'mode-000 validation must never call opendir');

    for (const [label, mutate] of [
      ['different device', (copy) => { copy.mounted.targetEntry.deviceId = 'other-device'; }],
      ['exact mount remains', (copy) => { copy.mounted.targetMount.mountPoint = fx.config.mountPoint; }],
      ['writable mode', (copy) => { copy.mounted.targetEntry.mode = 0o40700; }],
      ['special mode bit', (copy) => { copy.mounted.targetEntry.mode = 0o41000; }],
    ]) {
      const unsafe = structuredClone(locked);
      mutate(unsafe);
      await assert.rejects(
        validateDetachedIdentity(fx.config, unsafe, adapters),
        (error) => error.code === 'POST_DETACH_VALIDATION_FAILED',
        label,
      );
    }
    assert.equal(forbiddenOpenCalls, 0, 'refused post-detach identities must not call opendir');
  } finally {
    try { fs.chmodSync(fx.config.mountPoint, 0o700); } catch {}
    fx.cleanup();
  }
});

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
  }

  exit(code, signal) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }
}

test('signal during broker attach is latched, followed by controlled detach, and never spawns a writer', async () => {
  const fx = fixture();
  try {
    const signalSource = new EventEmitter();
    const brokerCalls = [];
    let spawnCalls = 0;
    const adapters = brokerAdapter(
      fx,
      [bareIdentity(fx), validIdentity(fx), bareIdentity(fx)],
      brokerCalls,
    );
    const originalExecBroker = adapters.execBroker;
    adapters.execBroker = (command, args, execOptions) => {
      if (args[0] === 'attach') signalSource.emit('SIGTERM');
      return originalExecBroker(command, args, execOptions);
    };
    adapters.spawnWriter = () => {
      spawnCalls += 1;
      throw new Error('writer must not spawn after an attach-phase signal');
    };

    const result = await superviseWriter(fx.config, ['/usr/bin/true'], {
      adapters,
      ...fx.validationOptions,
      signalSource,
    });
    assert.equal(result.supervisorSignal, 'SIGTERM');
    assert.equal(result.signal, 'SIGTERM');
    assert.equal(result.writerStarted, false);
    assert.equal(result.termination, null);
    assert.equal(result.detach.ok, true);
    assert.equal(spawnCalls, 0);
    assert.deepEqual(brokerCalls.map((call) => call.args[0]), ['attach', 'detach']);
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      assert.equal(signalSource.listenerCount(signal), 0, `${signal} listener must be removed`);
    }
  } finally {
    fx.cleanup();
  }
});

test('signal during fresh pre-spawn validation detaches and cannot be followed by writer spawn', async () => {
  const fx = fixture();
  try {
    const signalSource = new EventEmitter();
    const brokerCalls = [];
    let spawnCalls = 0;
    let identityCalls = 0;
    const adapters = brokerAdapter(
      fx,
      [bareIdentity(fx), validIdentity(fx), validIdentity(fx), bareIdentity(fx)],
      brokerCalls,
    );
    const originalCollectIdentity = adapters.collectIdentity;
    adapters.collectIdentity = (config) => {
      identityCalls += 1;
      const identity = originalCollectIdentity(config);
      if (identityCalls === 3) signalSource.emit('SIGINT');
      return identity;
    };
    adapters.spawnWriter = () => {
      spawnCalls += 1;
      throw new Error('writer must not spawn after a pre-spawn signal');
    };

    const result = await superviseWriter(fx.config, ['/usr/bin/true'], {
      adapters,
      ...fx.validationOptions,
      signalSource,
    });
    assert.equal(result.supervisorSignal, 'SIGINT');
    assert.equal(result.signal, 'SIGINT');
    assert.equal(result.writerStarted, false);
    assert.equal(result.termination, null);
    assert.equal(result.detach.ok, true);
    assert.equal(spawnCalls, 0);
    assert.equal(identityCalls, 4);
    assert.deepEqual(brokerCalls.map((call) => call.args[0]), ['attach', 'detach']);
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      assert.equal(signalSource.listenerCount(signal), 0, `${signal} listener must be removed`);
    }
  } finally {
    fx.cleanup();
  }
});

test('supervision uses one detached process group, stops it on identity loss, detaches, and never restarts', async () => {
  const fx = fixture();
  try {
    const invalid = validIdentity(fx);
    invalid.mounted.targetMount.ownersEnabled = false;
    const brokerCalls = [];
    const child = new FakeChild(43210);
    const spawns = [];
    const kills = [];
    const adapters = {
      ...brokerAdapter(fx, [bareIdentity(fx), validIdentity(fx), validIdentity(fx), invalid, bareIdentity(fx)], brokerCalls),
      spawnWriter(command, args, options) {
        spawns.push({ command, args, options });
        return child;
      },
      killProcessGroup(pid, signal) {
        kills.push({ pid, signal });
        if (signal === 'SIGKILL') child.exit(null, 'SIGKILL');
      },
    };

    await assert.rejects(
      superviseWriter(fx.config, ['/usr/bin/true', '--fixture'], {
        adapters,
        ...fx.validationOptions,
        monitorIntervalMs: 1,
        termGraceMs: 1,
        killGraceMs: 1,
      }),
      (error) => error.code === 'MOUNT_IDENTITY_LOST'
        && error.details.termination.escalated === true
        && error.details.detach.ok === true,
    );
    assert.equal(spawns.length, 1, 'writer must never restart inside one supervision run');
    assert.equal(spawns[0].options.detached, true, 'writer must lead its own process group');
    assert.deepEqual(kills, [
      { pid: 43210, signal: 'SIGTERM' },
      { pid: 43210, signal: 'SIGKILL' },
    ]);
    assert.deepEqual(brokerCalls.map((call) => call.args[0]), ['attach', 'detach']);
  } finally {
    fx.cleanup();
  }
});

test('supervisor termination signals are forwarded to the isolated writer group', async () => {
  const fx = fixture();
  try {
    const brokerCalls = [];
    const child = new FakeChild(43211);
    const signalSource = new EventEmitter();
    const kills = [];
    const adapters = {
      ...brokerAdapter(fx, [bareIdentity(fx), validIdentity(fx), validIdentity(fx), bareIdentity(fx)], brokerCalls),
      spawnWriter() {
        setImmediate(() => signalSource.emit('SIGTERM'));
        return child;
      },
      killProcessGroup(pid, signal) {
        kills.push({ pid, signal });
        child.exit(0, signal);
      },
    };
    const result = await superviseWriter(fx.config, ['/usr/bin/true'], {
      adapters,
      ...fx.validationOptions,
      signalSource,
      monitorIntervalMs: 50,
      termGraceMs: 1,
      killGraceMs: 1,
    });
    assert.equal(result.supervisorSignal, 'SIGTERM');
    assert.deepEqual(kills, [{ pid: 43211, signal: 'SIGTERM' }]);
    assert.equal(signalSource.listenerCount('SIGTERM'), 0);
    assert.deepEqual(
      brokerCalls.map((call) => call.args[0]),
      ['attach', 'detach'],
      'normal supervisor shutdown must detach after writer exit',
    );
  } finally {
    fx.cleanup();
  }
});

test('normal writer exit is followed by controlled detach', async () => {
  const fx = fixture();
  try {
    const brokerCalls = [];
    const child = new FakeChild(43212);
    const adapters = {
      ...brokerAdapter(fx, [bareIdentity(fx), validIdentity(fx), validIdentity(fx), bareIdentity(fx)], brokerCalls),
      spawnWriter() {
        setImmediate(() => child.exit(0, null));
        return child;
      },
      killProcessGroup() {
        throw Object.assign(new Error('no such process group'), { code: 'ESRCH' });
      },
    };
    const result = await superviseWriter(fx.config, ['/usr/bin/true'], {
      adapters,
      ...fx.validationOptions,
      signalSource: null,
      monitorIntervalMs: 50,
    });
    assert.equal(result.code, 0);
    assert.equal(result.detach.ok, true);
    assert.deepEqual(brokerCalls.map((call) => call.args[0]), ['attach', 'detach']);
  } finally {
    fx.cleanup();
  }
});

test('controlled detach fails if the underlying mountpoint is writable afterward', async () => {
  const fx = fixture();
  try {
    const unsafeDetached = bareIdentity(fx);
    unsafeDetached.mounted.targetEntry.mode = 0o40700;
    const child = new FakeChild(43214);
    const calls = [];
    const adapters = {
      ...brokerAdapter(
        fx,
        [bareIdentity(fx), validIdentity(fx), validIdentity(fx), unsafeDetached],
        calls,
      ),
      spawnWriter() {
        setImmediate(() => child.exit(0, null));
        return child;
      },
      killProcessGroup() {
        throw Object.assign(new Error('no such process group'), { code: 'ESRCH' });
      },
    };
    await assert.rejects(
      superviseWriter(fx.config, ['/usr/bin/true'], {
        adapters,
        ...fx.validationOptions,
        signalSource: null,
      }),
      (error) => error.code === 'CONTROLLED_DETACH_FAILED'
        && error.details.causeCode === 'POST_DETACH_VALIDATION_FAILED',
    );
  } finally {
    fx.cleanup();
  }
});

test('invalid PID and asynchronous child spawn errors both detach before failure', async () => {
  const fx = fixture();
  try {
    const invalidCalls = [];
    const invalidAdapters = {
      ...brokerAdapter(fx, [bareIdentity(fx), validIdentity(fx), validIdentity(fx), bareIdentity(fx)], invalidCalls),
      spawnWriter() {
        return { pid: undefined, exitCode: null, signalCode: null };
      },
    };
    await assert.rejects(
      superviseWriter(fx.config, ['/usr/bin/false'], {
        adapters: invalidAdapters,
        ...fx.validationOptions,
        signalSource: null,
      }),
      (error) => error.code === 'WRITER_SPAWN_FAILED' && error.details.detach.ok === true,
    );
    assert.equal(invalidCalls.at(-1).args[0], 'detach');

    const errorCalls = [];
    const child = new FakeChild(43213);
    const kills = [];
    const errorAdapters = {
      ...brokerAdapter(fx, [bareIdentity(fx), validIdentity(fx), validIdentity(fx), bareIdentity(fx)], errorCalls),
      spawnWriter() {
        setImmediate(() => child.emit('error', new Error('fixture spawn error')));
        return child;
      },
      killProcessGroup(pid, signal) {
        kills.push({ pid, signal });
        child.exit(null, signal);
      },
    };
    await assert.rejects(
      superviseWriter(fx.config, ['/usr/bin/false'], {
        adapters: errorAdapters,
        ...fx.validationOptions,
        signalSource: null,
        monitorIntervalMs: 50,
        termGraceMs: 1,
        killGraceMs: 1,
      }),
      (error) => error.code === 'WRITER_SPAWN_FAILED',
    );
    assert.deepEqual(kills, [{ pid: 43213, signal: 'SIGTERM' }]);
    assert.equal(errorCalls.at(-1).args[0], 'detach');
  } finally {
    fx.cleanup();
  }
});

test('broker attach requires exact purpose, image, UUIDs, mountpoint, and closed response keys', async () => {
  const fx = fixture();
  try {
    for (const overrides of [
      { imagePath: `${fx.config.imagePath}.other` },
      { volumeUUID: HOST_UUID },
      { hostVolumeUUID: VOLUME_UUID },
      { mountPoint: path.dirname(fx.config.mountPoint) },
      { deviceIdentifier: '' },
    ]) {
      const calls = [];
      const adapters = brokerAdapter(
        fx,
        [bareIdentity(fx), validIdentity(fx)],
        calls,
        { attachOverrides: overrides },
      );
      await assert.rejects(attachThroughBroker(fx.config, adapters));
      assert.equal(calls.at(-1).args[0], 'detach');
    }

    const calls = [];
    const adapters = brokerAdapter(fx, [bareIdentity(fx), validIdentity(fx)], calls);
    const originalExec = adapters.execBroker;
    adapters.execBroker = (command, args) => {
      const result = originalExec(command, args);
      if (args[0] === 'attach') {
        const payload = JSON.parse(result.stdout);
        payload.unknown = true;
        result.stdout = JSON.stringify(payload);
      }
      return result;
    };
    await assert.rejects(attachThroughBroker(fx.config, adapters), /closed schema/);
    assert.equal(calls.at(-1).args[0], 'detach');
  } finally {
    fx.cleanup();
  }
});

test('detach response pins device and both UUIDs before post-detach acceptance', () => {
  const fx = fixture();
  try {
    const calls = [];
    const adapters = brokerAdapter(fx, [bareIdentity(fx)], calls, {
      detachOverrides: { hostVolumeUUID: VOLUME_UUID },
    });
    assert.throws(
      () => runBroker(fx.config, 'detach', adapters),
      /detach host UUID does not match the pin/,
    );
  } finally {
    fx.cleanup();
  }
});
