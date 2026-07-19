#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  attestInternalApfsVolume as productionAttestInternalApfsVolume,
  assertRecoveryStateAllowsWriter as productionWriterBarrier,
  cliSummary,
  createBackendDataRecoveryFixtureApi,
  createSystemAdapters,
  enumerateTree,
  inspectRecovery as productionInspectRecovery,
  normalizeRecoveryTargetIdentity,
  RECOVERY_CHILD_ENVIRONMENT,
  restoreRecovery as productionRestoreRecovery,
  verifyRecovery as productionVerifyRecovery,
  SWAP_HELPER_SOURCE_PATH,
} from './backend-data-recovery.mjs';
import {
  bootstrapBackendOperationLockAnchor,
  BACKEND_OPERATION_LOCK_SOURCE,
} from './backend-operation-lock.mjs';
import {
  INTERNAL_APFS_EXPECTED_VOLUME_UUID,
  normalizeDiskutilMountInfo,
} from './backend-storage-guard.mjs';

function fixture() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-backend-data-recovery-')));
  const sourceRepo = path.join(root, 'backup', 'YURI-OS-MUSUBI');
  const sourceData = path.join(sourceRepo, '_SYSTEM/backend/data');
  const liveRoot = path.join(root, 'live');
  const target = path.join(liveRoot, '_SYSTEM/backend/data');
  const quarantineRoot = path.join(liveRoot, '_SYSTEM/recovery/backend-db');
  const receiptRoot = path.join(liveRoot, '_SYSTEM/state/backend-volume');
  const claudeSentinel = path.join(liveRoot, '.claude/projects/sentinel.txt');
  fs.mkdirSync(path.join(sourceData, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(sourceData, 'payload.bin'), Buffer.from('payload'));
  fs.writeFileSync(path.join(sourceData, 'nested', 'asset.txt'), 'asset');
  const db = path.join(sourceData, 'yuri.db');
  const created = spawnSync('/usr/bin/sqlite3', [db, [
    'PRAGMA user_version=1;',
    'PRAGMA foreign_keys=ON;',
    'CREATE TABLE parent(id INTEGER PRIMARY KEY);',
    'CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));',
    'INSERT INTO parent VALUES(1);',
    'INSERT INTO child VALUES(1,1);',
  ].join(' ')], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr || created.stdout);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'old.txt'), 'preserve-old');
  fs.mkdirSync(path.dirname(claudeSentinel), { recursive: true });
  fs.writeFileSync(claudeSentinel, 'untouched');
  const identity = Object.freeze({
    hostMountPoint: '/Volumes/T7',
    hostVolumeUuid: '86791676-F5A1-3995-BA18-03186DC20969',
    hostFilesystem: 'exfat',
    imagePath: '/Volumes/T7/YURI-OS-MUSUBI-Backup.sparsebundle',
    imageWritable: false,
    backupMountPoint: path.dirname(sourceRepo),
    backupVolumeUuid: '68F64A84-0F8D-4F86-A4BB-821AFA93F835',
    backupFilesystem: 'apfs',
    backupWritable: false,
    sourceRepo,
    retiredRuntimeImageObservedDetachedAtInspection: true,
  });
  const targetIdentity = Object.freeze({
    filesystem: 'apfs',
    internal: true,
    writable: true,
    readOnly: false,
    removableMedia: 'false',
    deviceLocation: 'internal',
    volumeUuid: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    mountPoint: '/',
    dfMountPoint: '/',
    deviceIdentifier: 'disk42s1',
    dfDeviceIdentifier: 'disk42s1',
    deviceId: String(fs.lstatSync(target).dev),
    inspectedPath: target,
    globalPermissionsEnabled: true,
    ownersEnabled: true,
    parseConflict: false,
    t7RequiredAtRuntime: false,
  });
  const lockEvents = [];
  let leaseSequence = 0;
  const acquireOperationLock = async ({ purpose, lockPath = path.join(root, 'backend-operation.lock') }) => {
    leaseSequence += 1;
    let held = true;
    const nonce = leaseSequence.toString(16).padStart(64, '0');
    const acquisition = Object.freeze({
      schemaVersion: 1,
      type: 'backend-operation-lock-acquisition',
      mode: 'hold',
      purpose,
      nonce,
      pid: 9000 + leaseSequence,
      acquiredAt: new Date(Date.UTC(2026, 6, 18, 11, 59, leaseSequence)).toISOString(),
      lock: Object.freeze({ path: lockPath, device: '1', inode: String(100 + leaseSequence) }),
      helper: Object.freeze({
        source: Object.freeze({ path: BACKEND_OPERATION_LOCK_SOURCE }),
        expectedSourceSha256: '1'.repeat(64),
        binary: Object.freeze({ path: path.join(root, 'bin/backend-operation-lock'), sha256: '2'.repeat(64) }),
      }),
      attestationSha256: '3'.repeat(64),
    });
    lockEvents.push(`acquire:${purpose}`);
    return Object.freeze({
      lockPath,
      acquisition,
      assertHeld() {
        lockEvents.push(`assert:${purpose}`);
        if (!held) throw new Error('fixture lease is not held');
        return true;
      },
      async release() {
        if (!held) throw new Error('fixture duplicate release');
        held = false;
        lockEvents.push(`release:${purpose}`);
        return Object.freeze({
          type: 'backend-operation-lock-release-evidence',
          purpose,
          nonce,
          acquisition,
          released: true,
        });
      },
    });
  };
  const adapters = {
    now: (() => {
      let n = 0;
      return () => new Date(Date.UTC(2026, 6, 18, 12, 0, n++));
    })(),
    acquireOperationLock,
    validateOperationAcquisition: (value) => value,
    validateOperationRelease: (value) => value,
    inspectSourceIdentity: () => identity,
    inspectTargetIdentity: (targetPath) => Object.freeze({
      ...targetIdentity,
      inspectedPath: targetPath,
      deviceId: String(fs.lstatSync(targetPath).dev),
    }),
    copyTree: (source, destination) => fs.cpSync(source, destination, { recursive: true, preserveTimestamps: true }),
    swapTrees: (left, right) => {
      const temporary = `${left}.unit-swap`;
      fs.renameSync(left, temporary);
      fs.renameSync(right, left);
      fs.renameSync(temporary, right);
    },
    listOpenFiles: () => [],
    sampleFilesystem: (targetRoot) => fs.statfsSync(targetRoot),
    compileSwapHelper: () => Object.freeze({ path: path.join(root, 'bin/backend-data-swap'), device: 0, inode: 0, uid: process.getuid(), mode: 0o500, sha256: 'stub-helper-sha256', sourceSha256: 'stub-source-sha256' }),
    fullSyncTree: () => {},
  };
  const recoveryWith = (adapterOverrides = {}, factoryOptions = {}) => createBackendDataRecoveryFixtureApi({
    root,
    adapters: { ...adapters, ...adapterOverrides },
    ...factoryOptions,
  });
  const recovery = recoveryWith();
  return {
    root,
    sourceRepo,
    sourceData,
    target,
    quarantineRoot,
    receiptRoot,
    claudeSentinel,
    adapters,
    recovery,
    recoveryWith,
    lockEvents,
    targetIdentity,
  };
}

test('Darwin helper atomically exchanges two real same-filesystem directories', {
  skip: process.platform !== 'darwin',
}, () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-backend-data-swap-')));
  try {
    const left = path.join(root, 'left');
    const right = path.join(root, 'right');
    fs.mkdirSync(left);
    fs.mkdirSync(right);
    fs.writeFileSync(path.join(left, 'old.txt'), 'old');
    fs.writeFileSync(path.join(right, 'new.txt'), 'new');
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    const beforeLeft = fs.lstatSync(left, { bigint: true });
    const beforeRight = fs.lstatSync(right, { bigint: true });
    const swapped = spawnSync(binary, [
      'swap', left, right,
      beforeLeft.dev.toString(), beforeLeft.ino.toString(),
      beforeRight.dev.toString(), beforeRight.ino.toString(),
    ], { encoding: 'utf8' });
    assert.equal(swapped.status, 0, swapped.stderr || swapped.stdout);
    assert.equal(fs.readFileSync(path.join(left, 'new.txt'), 'utf8'), 'new');
    assert.equal(fs.readFileSync(path.join(right, 'old.txt'), 'utf8'), 'old');
    assert.equal(fs.lstatSync(left, { bigint: true }).ino.toString(), beforeRight.ino.toString());
    assert.equal(fs.lstatSync(right, { bigint: true }).ino.toString(), beforeLeft.ino.toString());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recovery target identity consumes contradiction-closed APFS mount evidence', () => {
  const target = '/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/backend/data';
  const df = Object.freeze({ sourceDevice: '/dev/disk42s1', mountPoint: '/' });
  const baseline = Object.freeze({
    APFSVolumeUUID: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    DeviceIdentifier: 'disk42s1',
    DeviceLocation: 'Internal',
    DeviceNode: '/dev/disk42s1',
    FileSystemPersonality: 'APFS',
    FilesystemType: 'apfs',
    GlobalPermissionsEnabled: true,
    Internal: true,
    MountPoint: '/',
    Owners: true,
    OwnershipEnabled: true,
    ReadOnly: false,
    ReadOnlyVolume: false,
    Removable: false,
    RemovableMedia: false,
    TypeBundle: 'apple_apfs',
    VolumeUUID: INTERNAL_APFS_EXPECTED_VOLUME_UUID,
    Writable: true,
    WritableVolume: true,
  });
  const acceptedMount = normalizeDiskutilMountInfo(baseline, df, target, '42');
  const accepted = normalizeRecoveryTargetIdentity(target, '42', acceptedMount);
  assert.equal(accepted.parseConflict, false);
  assert.equal(accepted.inspectedPath, target);
  assert.equal(accepted.mountPoint, '/');
  assert.equal(accepted.dfMountPoint, '/');
  assert.equal(accepted.deviceIdentifier, 'disk42s1');
  assert.equal(accepted.dfDeviceIdentifier, 'disk42s1');
  assert.equal(accepted.removableMedia, 'false');

  const cases = [
    { label: 'internal plus removable', info: { ...baseline, Removable: true } },
    { label: 'internal plus external location', info: { ...baseline, DeviceLocation: 'External' } },
    { label: 'writable aliases', info: { ...baseline, WritableVolume: false } },
    { label: 'read-only aliases', info: { ...baseline, ReadOnly: true } },
    { label: 'ownership aliases', info: { ...baseline, OwnershipEnabled: false } },
    { label: 'filesystem aliases', info: { ...baseline, TypeBundle: 'hfs' } },
    {
      label: 'wrong but otherwise internal APFS UUID',
      info: {
        ...baseline,
        APFSVolumeUUID: '11111111-2222-3333-4444-555555555555',
        VolumeUUID: '11111111-2222-3333-4444-555555555555',
      },
    },
    { label: 'diskutil/df mount coherence', info: { ...baseline, MountPoint: '/System/Volumes/Data' } },
    { label: 'diskutil/df device coherence', info: { ...baseline, DeviceIdentifier: 'disk43s1' } },
    { label: 'inspected path binding', info: baseline, inspectedPath: '/private/tmp/other-target' },
    { label: 'inspected device binding', info: baseline, evidenceDeviceId: '43' },
  ];
  for (const candidate of cases) {
    const mounted = normalizeDiskutilMountInfo(
      candidate.info,
      df,
      candidate.inspectedPath ?? target,
      candidate.evidenceDeviceId ?? '42',
    );
    assert.throws(
      () => normalizeRecoveryTargetIdentity(target, '42', mounted),
      (error) => error?.code === 'INTERNAL_TARGET_IDENTITY_MISMATCH',
      candidate.label,
    );
  }
});

test('Darwin swap helper boundary: full-sync positive + dev/ino/path/argc/symlink negatives (hermetic)', {
  skip: process.platform !== 'darwin',
}, () => {
  // Hermetic boundary coverage for backend-data-swap.c. Compile once, exercise the CLI
  // surface: positive full-sync, then identity/path/argc/symlink rejections. readdir I/O
  // errors and parent-fsync faults are NOT covered here (no hermetic injection seam
  // exists without kernel fault injection); the descriptor-relative walk's per-component
  // O_NOFOLLOW rejection IS covered deterministically via an in-test symlink.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-backend-data-swap-boundary-')));
  try {
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    const run = (...args) => {
      const r = spawnSync(binary, args, { encoding: 'utf8' });
      return { status: r.status, stderr: (r.stderr || '').trim() };
    };
    const expectOk = (desc, r) => assert.equal(r.status, 0, `${desc}: expected exit 0, got ${r.status}: ${r.stderr}`);
    const expectReject = (desc, r) => assert.notEqual(r.status, 0, `${desc}: expected non-zero exit, got 0`);

    // --- positive full-sync: real dev+ino, nested file + subdir (F_FULLFSYNC + dir fsync) ---
    const syncRoot = path.join(root, 'syncroot');
    fs.mkdirSync(path.join(syncRoot, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(syncRoot, 'a.txt'), 'a');
    fs.writeFileSync(path.join(syncRoot, 'sub', 'b.txt'), 'b');
    const syncStat = fs.lstatSync(syncRoot, { bigint: true });
    expectOk('full-sync positive', run('full-sync', syncRoot, syncStat.dev.toString(), syncStat.ino.toString()));

    // --- identity negatives: stale ino, malformed dev (-1/+5/non-numeric) ---
    const staleSyncIno = syncStat.ino === 0n ? 1n : syncStat.ino - 1n;
    expectReject('full-sync stale ino', run('full-sync', syncRoot, syncStat.dev.toString(), staleSyncIno.toString()));
    expectReject('full-sync malformed dev x', run('full-sync', syncRoot, 'x', syncStat.ino.toString()));
    expectReject('full-sync negative dev -1', run('full-sync', syncRoot, '-1', syncStat.ino.toString()));
    expectReject('full-sync plus dev +5', run('full-sync', syncRoot, '+5', syncStat.ino.toString()));
    expectReject('full-sync leading-space dev', run('full-sync', syncRoot, ' 12', syncStat.ino.toString()));

    // --- path negatives: relative, trailing slash ---
    expectReject('full-sync relative path', run('full-sync', 'syncroot', syncStat.dev.toString(), syncStat.ino.toString()));
    expectReject('full-sync trailing slash', run('full-sync', `${syncRoot}/`, syncStat.dev.toString(), syncStat.ino.toString()));

    // --- intermediate-symlink-component negative (deterministic; created inside the test tree) ---
    // linkparent -> realparent (symlink as an INTERMEDIATE path component). full-sync through
    // linkparent/target forces walk_to_parent to openat(root, "linkparent", O_NOFOLLOW) which
    // rejects the symlink per-component. Deterministic regardless of host /tmp symlink state.
    const realParent = path.join(root, 'realparent');
    const linkParent = path.join(root, 'linkparent');
    fs.mkdirSync(path.join(realParent, 'target'), { recursive: true });
    fs.symlinkSync(realParent, linkParent);
    const targetThruLink = path.join(linkParent, 'target');
    const tStat = fs.lstatSync(targetThruLink, { bigint: true });
    expectReject('intermediate symlink component', run('full-sync', targetThruLink, tStat.dev.toString(), tStat.ino.toString()));

    // --- argc negatives ---
    expectReject('swap bad argc (2 args)', run('swap', syncRoot, syncRoot));
    expectReject('no args', run());
    expectReject('unknown subcommand', run('frobnicate', syncRoot, '1', '2'));

    // --- swap identity negative: stale left ino ---
    const left = path.join(root, 'left');
    const right = path.join(root, 'right');
    fs.mkdirSync(left);
    fs.mkdirSync(right);
    const leftStat = fs.lstatSync(left, { bigint: true });
    const rightStat = fs.lstatSync(right, { bigint: true });
    const staleLeftIno = leftStat.ino === 0n ? 1n : leftStat.ino - 1n;
    expectReject('swap stale left ino', run('swap', left, right, leftStat.dev.toString(), staleLeftIno.toString(), rightStat.dev.toString(), rightStat.ino.toString()));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function roomyCapacity(bytes) {
  return {
    volumeBytes: String(bytes * 100),
    freeBytes: String(bytes * 50),
    payloadBytes: String(bytes),
    reserveBytes: String(bytes * 2),
    requiredStartFreeBytes: String(bytes * 3),
    projectedPostRestoreFreeBytes: String(bytes * 49),
    ok: true,
  };
}

function fixtureApiForOptions(options, factoryOptions = {}) {
  const receiptRoot = options.receiptRoot;
  assert.equal(typeof receiptRoot, 'string', 'fixture call must identify its factory-bound receipt root');
  const root = path.resolve(receiptRoot, '../../../..');
  const api = createBackendDataRecoveryFixtureApi({
    root,
    adapters: options.adapters,
    ...factoryOptions,
  });
  const expectedPaths = {
    sourceRepo: api.paths.sourceRepo,
    canonicalTarget: api.paths.canonicalTarget,
    quarantineRoot: api.paths.quarantineRoot,
    receiptRoot: api.paths.receiptRoot,
    capacityRoot: api.paths.capacityRoot,
    operationLockPath: api.paths.operationLockPath,
    operationLockBinRoot: api.paths.operationLockBinRoot,
    operationLockSourcePath: BACKEND_OPERATION_LOCK_SOURCE,
  };
  for (const [key, expected] of Object.entries(expectedPaths)) {
    if (options[key] !== undefined) assert.equal(options[key], expected, `legacy fixture ${key} must match factory binding`);
  }
  return api;
}

async function fixtureInspectRecovery(options) {
  const api = fixtureApiForOptions(options);
  return api.inspect({
    ownerApproved: options.ownerApproved,
    expected: options.expected,
    capacity: options.capacity,
    progress: options.progress,
  });
}

async function fixtureRestoreRecovery(options) {
  const api = fixtureApiForOptions(options);
  return api.restore({
    ownerApproved: options.ownerApproved,
    manifestPath: options.manifestPath,
    manifestSha256: options.manifestSha256,
    expected: options.expected,
    capacity: options.capacity,
    progress: options.progress,
  });
}

async function fixtureVerifyRecovery(options) {
  const api = fixtureApiForOptions(options);
  return api.verify({
    ownerApproved: options.ownerApproved,
    manifestPath: options.manifestPath,
    manifestSha256: options.manifestSha256,
    expected: options.expected,
    progress: options.progress,
  });
}

// Existing behavioral cases retain their readable call sites, but every
// successful/fault-injected execution now traverses the contained fixture
// factory above rather than the production exports.
const inspectRecovery = fixtureInspectRecovery;
const restoreRecovery = fixtureRestoreRecovery;
const verifyRecovery = fixtureVerifyRecovery;

function rewriteManifest(manifestPath, mutate) {
  const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  mutate(payload);
  const bytes = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(manifestPath, bytes, { mode: 0o600 });
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function inspectFixture(fx) {
  const sourceTree = await enumerateTree(fx.sourceData);
  const expected = {
    itemCount: sourceTree.itemCount,
    fileCount: sourceTree.fileCount,
    byteCount: sourceTree.byteCount,
  };
  const capacity = roomyCapacity(sourceTree.byteCount);
  const inspected = await fixtureInspectRecovery({
    ownerApproved: true,
    sourceRepo: fx.sourceRepo,
    expected,
    capacity,
    canonicalTarget: fx.target,
    receiptRoot: fx.receiptRoot,
    adapters: fx.adapters,
  });
  return { sourceTree, expected, capacity, inspected };
}

test('inspect owner approval is the first gate and the CLI requires --owner-approved', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-inspect-owner-gate-')));
  try {
    let nonApprovalAccesses = 0;
    const options = { ownerApproved: false };
    for (const property of [
      'adapters',
      'sourceRepo',
      'expected',
      'capacity',
      'capacityRoot',
      'canonicalTarget',
      'receiptRoot',
      'progress',
    ]) {
      Object.defineProperty(options, property, {
        enumerable: true,
        get() {
          nonApprovalAccesses += 1;
          throw new Error(`owner gate touched ${property}`);
        },
      });
    }
    await assert.rejects(
      productionInspectRecovery(options),
      (error) => error.code === 'OWNER_APPROVAL_REQUIRED',
    );
    assert.equal(nonApprovalAccesses, 0, 'approval rejection must precede every adapter/path/capacity/receipt access');
    assert.deepEqual(fs.readdirSync(root), [], 'approval rejection must not create a receipt artifact');

    const script = path.join(path.dirname(SWAP_HELPER_SOURCE_PATH), 'backend-data-recovery.mjs');
    const cli = spawnSync(process.execPath, [
      script,
      'inspect',
      '--source-repo', path.join(root, 'must-not-be-opened'),
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.equal(JSON.parse(cli.stderr).code, 'OWNER_APPROVAL_REQUIRED');
    assert.deepEqual(fs.readdirSync(root), [], 'CLI rejection must precede source or receipt access');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('internal APFS attestation is owner-gated, override-closed, T7-free, and durably sealed', async () => {
  let deniedGetterCalls = 0;
  const denied = { ownerApproved: false };
  for (const property of ['anchorPath', 'receiptRoot', 'adapters']) {
    Object.defineProperty(denied, property, {
      enumerable: true,
      get() {
        deniedGetterCalls += 1;
        throw new Error(`owner gate touched ${property}`);
      },
    });
  }
  await assert.rejects(
    productionAttestInternalApfsVolume(denied),
    (error) => error.code === 'OWNER_APPROVAL_REQUIRED',
  );
  assert.equal(deniedGetterCalls, 0);

  let overrideGetterCalls = 0;
  const overridden = { ownerApproved: true };
  Object.defineProperty(overridden, 'receiptRoot', {
    enumerable: true,
    get() {
      overrideGetterCalls += 1;
      return '/private/tmp/forbidden-attestation-root';
    },
  });
  await assert.rejects(
    productionAttestInternalApfsVolume(overridden),
    (error) => error.code === 'PRODUCTION_OVERRIDE_REFUSED' && error.details.option === 'receiptRoot',
  );
  assert.equal(overrideGetterCalls, 0);
  await assert.rejects(
    productionAttestInternalApfsVolume({ ownerApproved: true }, { adapters: 'forbidden' }),
    (error) => error.code === 'PRODUCTION_OVERRIDE_REFUSED',
  );

  const script = path.join(path.dirname(SWAP_HELPER_SOURCE_PATH), 'backend-data-recovery.mjs');
  const cli = spawnSync(process.execPath, [script, 'attest-internal-volume', '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(JSON.parse(cli.stderr).code, 'OWNER_APPROVAL_REQUIRED');

  const fx = fixture();
  let sourceTouches = 0;
  let targetTouches = 0;
  try {
    fs.mkdirSync(fx.receiptRoot, { recursive: true, mode: 0o700 });
    fs.chmodSync(fx.receiptRoot, 0o700);
    const api = fx.recoveryWith({
      inspectSourceIdentity() {
        sourceTouches += 1;
        throw new Error('T7/source identity must not be inspected');
      },
      inspectTargetIdentity(anchor) {
        targetTouches += 1;
        assert.equal(anchor, path.dirname(fx.target));
        return Object.freeze({
          ...fx.targetIdentity,
          inspectedPath: anchor,
          deviceId: String(fs.lstatSync(anchor).dev),
        });
      },
    });
    const attestation = await api.attestInternalVolume({ ownerApproved: true });
    assert.equal(sourceTouches, 0);
    assert.equal(targetTouches, 1);
    assert.equal(attestation.ok, true);
    assert.match(path.basename(attestation.receiptPath), /^internal-volume-attestation-.+-[a-f0-9]{16}\.json$/u);
    const bytes = fs.readFileSync(attestation.receiptPath);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), attestation.receiptSha256);
    assert.equal(fs.lstatSync(attestation.receiptPath).mode & 0o777, 0o600);
    const payload = JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.schema, 'yuri.backend-data-recovery.internal-apfs-attestation.v1');
    assert.equal(payload.anchorPath, path.dirname(fx.target));
    assert.equal(payload.expectedVolumeUuid, INTERNAL_APFS_EXPECTED_VOLUME_UUID);
    assert.equal(payload.observedVolumeUuid, INTERNAL_APFS_EXPECTED_VOLUME_UUID);
    assert.deepEqual(payload.scope, {
      protectedBackendDataAccessed: false,
      claudeProjectsAccessed: false,
      t7Inspected: false,
      physicalT7ConnectedAtSummary: null,
      backendDataReadinessAttested: false,
    });

    fs.chmodSync(fx.receiptRoot, 0o755);
    await assert.rejects(
      api.attestInternalVolume({ ownerApproved: true }),
      (error) => error.code === 'RECEIPT_ROOT_IDENTITY_MISMATCH',
    );
    fs.chmodSync(fx.receiptRoot, 0o700);
    const wrongUuidApi = fx.recoveryWith({
      inspectTargetIdentity(anchor) {
        return Object.freeze({
          ...fx.targetIdentity,
          inspectedPath: anchor,
          deviceId: String(fs.lstatSync(anchor).dev),
          volumeUuid: '00000000-0000-0000-0000-000000000000',
        });
      },
    });
    await assert.rejects(
      wrongUuidApi.attestInternalVolume({ ownerApproved: true }),
      (error) => error.code === 'INTERNAL_TARGET_IDENTITY_MISMATCH',
    );

    const heldReceiptRoot = `${fx.receiptRoot}.held`;
    const parentSwapApi = fx.recoveryWith({
      beforeAttestationReceiptWrite() {
        fs.renameSync(fx.receiptRoot, heldReceiptRoot);
        fs.mkdirSync(fx.receiptRoot, { mode: 0o700 });
      },
    });
    await assert.rejects(
      parentSwapApi.attestInternalVolume({ ownerApproved: true }),
      (error) => error.code === 'INTERNAL_VOLUME_ATTESTATION_WRITE_FAILED',
    );
    assert.deepEqual(
      fs.readdirSync(fx.receiptRoot),
      [],
      'a replacement receipt directory must remain untouched after the identity mismatch',
    );
    assert.equal(
      fs.readdirSync(heldReceiptRoot).filter((name) => name.startsWith('internal-volume-attestation-')).length,
      1,
      'the descriptor-bound original directory retains only the already-sealed receipt',
    );
  } finally {
    fs.chmodSync(fx.receiptRoot, 0o700);
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('internal APFS receipt writer isolates Python startup from hostile cwd and user import state', async () => {
  const source = fs.readFileSync(path.join(path.dirname(SWAP_HELPER_SOURCE_PATH), 'backend-data-recovery.mjs'), 'utf8');
  assert.equal(
    source.includes("spawnRecoveryProcess('/usr/bin/python3', [\n    '-I',\n    '-S',\n    '-c',"),
    true,
    'the embedded descriptor writer must use isolated, no-site Python startup',
  );
  assert.match(source, /stdio: \['pipe', 'pipe', 'pipe'\],\n\s+cwd: '\/',/u);

  const fx = fixture();
  const originalCwd = process.cwd();
  const hostileEnvironment = new Map([
    ['PYTHONPATH', process.env.PYTHONPATH],
    ['PYTHONHOME', process.env.PYTHONHOME],
    ['PYTHONSTARTUP', process.env.PYTHONSTARTUP],
    ['PYTHONUSERBASE', process.env.PYTHONUSERBASE],
  ]);
  try {
    fs.mkdirSync(fx.receiptRoot, { recursive: true, mode: 0o700 });
    fs.chmodSync(fx.receiptRoot, 0o700);
    for (const moduleName of ['hashlib.py', 'json.py', 'sitecustomize.py', 'usercustomize.py']) {
      fs.writeFileSync(path.join(fx.root, moduleName), `raise RuntimeError('loaded ${moduleName}')\n`);
    }
    process.env.PYTHONPATH = fx.root;
    process.env.PYTHONHOME = fx.root;
    process.env.PYTHONSTARTUP = path.join(fx.root, 'sitecustomize.py');
    process.env.PYTHONUSERBASE = fx.root;
    process.chdir(fx.root);
    const attestation = await fx.recovery.attestInternalVolume({ ownerApproved: true });
    assert.equal(attestation.ok, true);
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of hostileEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('production recovery APIs and writer barrier reject every authority override before getters or paths', async () => {
  const cases = [
    [productionInspectRecovery, 'inspect', 'adapters'],
    [productionInspectRecovery, 'inspect', 'capacity'],
    [productionInspectRecovery, 'inspect', 'expected'],
    [productionInspectRecovery, 'inspect', 'receiptRoot'],
    [productionInspectRecovery, 'inspect', 'progress'],
    [productionInspectRecovery, 'inspect', 'yuriSchemaVersion'],
    [productionRestoreRecovery, 'restore', 'canonicalTarget'],
    [productionRestoreRecovery, 'restore', 'quarantineRoot'],
    [productionRestoreRecovery, 'restore', 'operationLockPath'],
    [productionRestoreRecovery, 'restore', 'operationLockBinRoot'],
    [productionRestoreRecovery, 'restore', 'operationLockSourcePath'],
    [productionRestoreRecovery, 'restore', 'binRoot'],
    [productionRestoreRecovery, 'restore', 'sourcePath'],
    [productionVerifyRecovery, 'verify', 'capacityRoot'],
  ];
  for (const [call, action, forbidden] of cases) {
    let getterCalls = 0;
    const options = { ownerApproved: true };
    const allowed = action === 'inspect'
      ? ['sourceRepo']
      : (action === 'restore'
        ? ['sourceRepo', 'manifestPath', 'manifestSha256']
        : ['manifestPath', 'manifestSha256']);
    for (const property of allowed) {
      Object.defineProperty(options, property, {
        enumerable: true,
        get() {
          getterCalls += 1;
          throw new Error(`allowed getter ${property} must not run before override rejection`);
        },
      });
    }
    Object.defineProperty(options, forbidden, {
      enumerable: true,
      get() {
        getterCalls += 1;
        if (forbidden === 'receiptRoot') return path.join('/private/tmp', 'protected-like-target', '_SYSTEM/backend/data/state');
        return `forbidden-${forbidden}`;
      },
    });
    await assert.rejects(
      call(options),
      (error) => error.code === 'PRODUCTION_OVERRIDE_REFUSED' && error.details.option === forbidden,
      `${action} must reject ${forbidden}`,
    );
    assert.equal(getterCalls, 0, `${action}/${forbidden} must reject by own-key before evaluating any getter`);
  }

  let extraArgumentGetterCalls = 0;
  const otherwiseValidInspect = { ownerApproved: true };
  Object.defineProperty(otherwiseValidInspect, 'sourceRepo', {
    enumerable: true,
    get() {
      extraArgumentGetterCalls += 1;
      throw new Error('sourceRepo must not be evaluated before extra-argument rejection');
    },
  });
  await assert.rejects(
    productionInspectRecovery(otherwiseValidInspect, { adapters: 'forbidden-second-argument' }),
    (error) => error.code === 'PRODUCTION_OVERRIDE_REFUSED',
  );
  assert.equal(extraArgumentGetterCalls, 0);

  for (const forbidden of ['receiptRoot', 'markerPath', 'validateReleaseEvidence']) {
    let barrierGetterCalls = 0;
    const barrierOverride = {};
    Object.defineProperty(barrierOverride, forbidden, {
      enumerable: true,
      get() {
        barrierGetterCalls += 1;
        return '/private/tmp/must-not-be-read';
      },
    });
    assert.throws(
      () => productionWriterBarrier(barrierOverride),
      (error) => error.code === 'PRODUCTION_OVERRIDE_REFUSED',
    );
    assert.equal(barrierGetterCalls, 0, `zero-argument production barrier must not read ${forbidden}`);
  }
});

test('fixture factory rejects non-private roots, symlink roots, call overrides, and path escape', async () => {
  const fx = fixture();
  const symlink = path.join('/private/tmp', `yuri-recovery-fixture-link-${process.pid}-${Date.now()}`);
  try {
    const workspaceRoot = path.resolve(path.dirname(SWAP_HELPER_SOURCE_PATH), '../..');
    assert.throws(
      () => createBackendDataRecoveryFixtureApi({ root: workspaceRoot, adapters: fx.adapters }),
      (error) => error.code === 'FIXTURE_ROOT_REFUSED',
      'a workspace/outside-private-tmp root is rejected lexically before access',
    );
    fs.symlinkSync(fx.root, symlink);
    assert.throws(
      () => createBackendDataRecoveryFixtureApi({ root: symlink, adapters: fx.adapters }),
      (error) => error.code === 'FIXTURE_ROOT_REFUSED',
      'a symlink root is never a fixture capability',
    );
    await assert.rejects(
      fx.recovery.inspect({ ownerApproved: true, canonicalTarget: fx.target }),
      (error) => error.code === 'FIXTURE_OVERRIDE_REFUSED',
    );
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter({ receiptRoot: fx.receiptRoot }),
      (error) => error.code === 'FIXTURE_OVERRIDE_REFUSED',
    );
    const escapedManifest = path.join('/private/tmp', `outside-fixture-${process.pid}.json`);
    await assert.rejects(
      fx.recovery.restore({
        ownerApproved: true,
        manifestPath: escapedManifest,
        manifestSha256: '0'.repeat(64),
      }),
      (error) => error.code === 'FIXTURE_PATH_ESCAPE',
      'fixture manifest paths are rejected before pathname access when they escape the private root',
    );
  } finally {
    try { fs.unlinkSync(symlink); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('CLI summary exposes only action-qualified tri-state storage facts', () => {
  const inspection = cliSummary('inspect', {
    ok: true,
    manifestPath: '/receipt/inspect.json',
    manifestSha256: 'a'.repeat(64),
    payload: {
      schema: 'yuri.backend-data-recovery.inspect.v1',
      sourceIdentity: { retiredRuntimeImageObservedDetachedAtInspection: true },
      policy: {
        runtimeStorageMode: 'internal-apfs',
        recoverySourceDriveRequiredAfterClosure: false,
      },
    },
  });
  assert.equal(inspection.retiredRuntimeImageObservedDetachedAtInspection, true);
  assert.equal(inspection.runtimeStorageModeAfterClosure, null, 'inspection policy is not a completed runtime closure');
  assert.equal(inspection.externalRuntimeImageRequiredAfterClosure, null);
  assert.equal(inspection.recoverySourceDriveRequiredAfterClosure, null);
  assert.equal(inspection.physicalT7ConnectedAtSummary, null, 'summary must not infer current physical T7 state');
  assert.equal('t7RequiredAtRuntime' in inspection, false);

  const unclosed = cliSummary('restore', {
    ok: false,
    receipt: {
      runtimePolicy: {
        storageMode: 'internal-apfs',
        externalRuntimeImageRequired: false,
        recoverySourceDriveRequiredAfterClosure: false,
      },
    },
  });
  assert.equal(unclosed.retiredRuntimeImageObservedDetachedAtInspection, null);
  assert.equal(unclosed.runtimeStorageModeAfterClosure, null);
  assert.equal(unclosed.externalRuntimeImageRequiredAfterClosure, null);
  assert.equal(unclosed.recoverySourceDriveRequiredAfterClosure, null);
  assert.equal(unclosed.physicalT7ConnectedAtSummary, null);

  const closed = cliSummary('restore', {
    ok: true,
    receipt: {
      runtimePolicy: {
        storageMode: 'internal-apfs',
        externalRuntimeImageRequired: false,
        recoverySourceDriveRequiredAfterClosure: false,
      },
    },
    finalClosure: { complete: true, outcome: 'complete' },
  });
  assert.equal(closed.retiredRuntimeImageObservedDetachedAtInspection, null, 'source-time observation is inspect-only');
  assert.equal(closed.runtimeStorageModeAfterClosure, 'internal-apfs');
  assert.equal(closed.externalRuntimeImageRequiredAfterClosure, false, 'explicit false must not collapse to absent');
  assert.equal(closed.recoverySourceDriveRequiredAfterClosure, false, 'explicit false must not collapse to absent');
  assert.equal(closed.physicalT7ConnectedAtSummary, null, 'runtime policy does not prove physical drive absence');
});

test('inspects, stages, verifies, atomically promotes, and preserves the old target', async () => {
  const fx = fixture();
  try {
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const capacity = roomyCapacity(sourceTree.byteCount);
    const inspected = await inspectRecovery({
      ownerApproved: true,
      sourceRepo: fx.sourceRepo,
      expected,
      capacity,
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    assert.equal(inspected.payload.tree.treeDigest, sourceTree.treeDigest);
    assert.equal(inspected.payload.policy.claudeProjectsAccessed, false);
    assert.equal(inspected.payload.targetIdentity.t7RequiredAtRuntime, false);

    const restoreOrder = [];
    const restored = await restoreRecovery({
      sourceRepo: fx.sourceRepo,
      manifestPath: inspected.manifestPath,
      manifestSha256: inspected.manifestSha256,
      ownerApproved: true,
      expected,
      capacity,
      canonicalTarget: fx.target,
      quarantineRoot: fx.quarantineRoot,
      receiptRoot: fx.receiptRoot,
      adapters: {
        ...fx.adapters,
        inspectSourceIdentity(sourceRepo) {
          restoreOrder.push('source');
          assert.equal(
            fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')),
            true,
            'exclusive active marker must precede source inspection',
          );
          return fx.adapters.inspectSourceIdentity(sourceRepo);
        },
        inspectTargetIdentity(target) {
          restoreOrder.push('target');
          assert.equal(
            fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')),
            true,
            'exclusive active marker must precede live-target inspection',
          );
          return fx.adapters.inspectTargetIdentity(target);
        },
      },
    });
    assert.deepEqual(restoreOrder.slice(0, 2), ['source', 'target']);
    assert.equal(fs.readFileSync(path.join(fx.target, 'payload.bin'), 'utf8'), 'payload');
    assert.equal(fs.readFileSync(path.join(restored.receipt.oldTargetQuarantine, 'old.txt'), 'utf8'), 'preserve-old');
    assert.equal(fs.readFileSync(fx.claudeSentinel, 'utf8'), 'untouched');
    assert.equal(restored.receipt.sourceRemoved, false);
    assert.equal(restored.receipt.oldTargetDeleted, false);
    assert.equal(restored.receipt.schema, 'yuri.backend-data-recovery.restore.phase-a.v2');
    assert.equal(restored.receipt.sealed, true);
    assert.equal(restored.receipt.final, false);
    assert.equal('recoveryLockReleasedAfterReceipt' in restored.receipt, false);
    assert.equal('runtimeImageDetached' in restored.receipt, false);
    assert.equal(restored.receipt.runtimePolicy.storageMode, 'internal-apfs');
    assert.equal(restored.finalClosure.complete, true);
    assert.equal(restored.finalClosure.outcome, 'complete');
    assert.equal(restored.finalClosure.phaseA.sha256, restored.receiptSha256);
    assert.equal(fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')), false);
    assert.equal(fs.existsSync(restored.lockArchive), true);
    const barrier = fx.recovery.assertRecoveryStateAllowsWriter();
    assert.equal(barrier.transactionsChecked, 1);
    assert.equal(barrier.finalClosuresChecked, 1);

    const verified = await verifyRecovery({
      manifestPath: inspected.manifestPath,
      manifestSha256: inspected.manifestSha256,
      ownerApproved: true,
      expected,
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    assert.equal(verified.payload.tree.treeDigest, sourceTree.treeDigest);
    assert.equal(verified.payload.databases.ok, true);
    assert.equal(verified.payload.schema, 'yuri.backend-data-recovery.verify.sealed.v2');
    assert.equal(verified.finalPayload.schema, 'yuri.backend-data-recovery.verify.final.v2');
    assert.equal(fs.existsSync(verified.finalCompletionPath), true);
    fs.appendFileSync(restored.finalClosurePath, ' ');
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_CORRELATION_MISMATCH',
      'a post-closure byte change must fail the writer barrier',
    );
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('rejects payload drift before staging and requires owner approval for restore', async () => {
  const fx = fixture();
  try {
    const sourceTree = await enumerateTree(fx.sourceData);
    await assert.rejects(
      inspectRecovery({
        ownerApproved: true,
        sourceRepo: fx.sourceRepo,
        expected: {
          itemCount: sourceTree.itemCount,
          fileCount: sourceTree.fileCount,
          byteCount: sourceTree.byteCount + 1,
        },
        capacity: roomyCapacity(sourceTree.byteCount),
        canonicalTarget: fx.target,
        receiptRoot: fx.receiptRoot,
        adapters: fx.adapters,
      }),
      (error) => error.code === 'SOURCE_PAYLOAD_MISMATCH',
    );

    const inspected = await inspectRecovery({
      ownerApproved: true,
      sourceRepo: fx.sourceRepo,
      expected: {
        itemCount: sourceTree.itemCount,
        fileCount: sourceTree.fileCount,
        byteCount: sourceTree.byteCount,
      },
      capacity: roomyCapacity(sourceTree.byteCount),
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    await assert.rejects(
      productionRestoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: false,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: fx.adapters,
      }),
      (error) => error.code === 'OWNER_APPROVAL_REQUIRED',
    );
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('refuses active writers before promotion and preserves the live target', async () => {
  const fx = fixture();
  try {
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const capacity = roomyCapacity(sourceTree.byteCount);
    const inspected = await inspectRecovery({
      ownerApproved: true,
      sourceRepo: fx.sourceRepo,
      expected,
      capacity,
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: { ...fx.adapters, listOpenFiles: () => ['COMMAND PID USER FD TYPE NAME'] },
      }),
      (error) => error.code === 'BACKEND_WRITERS_ACTIVE',
    );
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('rejects a digest-valid manifest that redirects the protected source path', async () => {
  const fx = fixture();
  try {
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const capacity = roomyCapacity(sourceTree.byteCount);
    const inspected = await inspectRecovery({
      ownerApproved: true,
      sourceRepo: fx.sourceRepo,
      expected,
      capacity,
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    const craftedDigest = rewriteManifest(inspected.manifestPath, (payload) => {
      payload.sourceData = path.join(fx.root, '.claude/projects');
    });
    let acquireCalls = 0;
    let liveInspectionCalls = 0;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: craftedDigest,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          async acquireOperationLock(options) {
            acquireCalls += 1;
            return fx.adapters.acquireOperationLock(options);
          },
          inspectSourceIdentity() {
            liveInspectionCalls += 1;
            throw new Error('source inspection must not occur for a rejected manifest');
          },
          inspectTargetIdentity() {
            liveInspectionCalls += 1;
            throw new Error('target inspection must not occur for a rejected manifest');
          },
        },
      }),
      (error) => error.code === 'SOURCE_DATA_MISMATCH',
    );
    assert.equal(acquireCalls, 0, 'manifest path validation must precede native acquisition');
    assert.equal(liveInspectionCalls, 0, 'rejected manifest must not touch source or live target');
    assert.equal(fs.readFileSync(fx.claudeSentinel, 'utf8'), 'untouched');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('restore and verify reject a manifest inside a protected-like live target before opening or acquiring', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    const protectedLikeManifest = path.join(fx.target, 'operator-manifest.json');
    const invalidBytes = Buffer.from('{not-json-and-must-not-be-read\n');
    fs.writeFileSync(protectedLikeManifest, invalidBytes, { mode: 0o000 });
    const invalidDigest = crypto.createHash('sha256').update(invalidBytes).digest('hex');
    let acquireCalls = 0;
    let identityCalls = 0;
    const adapters = {
      ...fx.adapters,
      async acquireOperationLock(options) {
        acquireCalls += 1;
        return fx.adapters.acquireOperationLock(options);
      },
      inspectSourceIdentity() {
        identityCalls += 1;
        throw new Error('source identity must not be inspected');
      },
      inspectTargetIdentity() {
        identityCalls += 1;
        throw new Error('target identity must not be inspected');
      },
    };
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: protectedLikeManifest,
        manifestSha256: invalidDigest,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters,
      }),
      (error) => error.code === 'MANIFEST_PATH_REFUSED',
    );
    await assert.rejects(
      verifyRecovery({
        manifestPath: protectedLikeManifest,
        manifestSha256: invalidDigest,
        ownerApproved: true,
        expected,
        canonicalTarget: fx.target,
        receiptRoot: fx.receiptRoot,
        adapters,
      }),
      (error) => error.code === 'MANIFEST_PATH_REFUSED',
    );
    assert.equal(acquireCalls, 0, 'manifest root constraint must precede native lock acquisition');
    assert.equal(identityCalls, 0, 'manifest root constraint must precede source/live identity adapters');
    assert.equal(fs.readFileSync(inspected.manifestPath, 'utf8').includes('inspect.v1'), true);
  } finally {
    fs.chmodSync(path.join(fx.target, 'operator-manifest.json'), 0o600);
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('rejects malformed manifest aggregates even when the caller supplies their digest', async () => {
  const fx = fixture();
  try {
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const inspected = await inspectRecovery({
      ownerApproved: true,
      sourceRepo: fx.sourceRepo,
      expected,
      capacity: roomyCapacity(sourceTree.byteCount),
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    const craftedDigest = rewriteManifest(inspected.manifestPath, (payload) => {
      payload.tree.byteCount += 1;
      payload.expected.byteCount += 1;
    });
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: craftedDigest,
        ownerApproved: true,
        expected,
        capacity: roomyCapacity(sourceTree.byteCount),
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: fx.adapters,
      }),
      (error) => error.code === 'MANIFEST_INVALID',
    );
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('stale manifest cannot replace a different target inode', async () => {
  const fx = fixture();
  try {
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const capacity = roomyCapacity(sourceTree.byteCount);
    const inspected = await inspectRecovery({
      ownerApproved: true,
      sourceRepo: fx.sourceRepo,
      expected,
      capacity,
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    const original = `${fx.target}.original`;
    fs.renameSync(fx.target, original);
    fs.mkdirSync(fx.target);
    fs.writeFileSync(path.join(fx.target, 'replacement.txt'), 'do-not-replace');
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: fx.adapters,
      }),
      (error) => error.code === 'CANONICAL_TARGET_CHANGED',
    );
    assert.equal(fs.readFileSync(path.join(fx.target, 'replacement.txt'), 'utf8'), 'do-not-replace');
    assert.equal(fs.readFileSync(path.join(original, 'old.txt'), 'utf8'), 'preserve-old');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('post-swap writer detection atomically restores old target and preserves failed new tree', async () => {
  const fx = fixture();
  try {
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const capacity = roomyCapacity(sourceTree.byteCount);
    const inspected = await inspectRecovery({
      ownerApproved: true,
      sourceRepo: fx.sourceRepo,
      expected,
      capacity,
      canonicalTarget: fx.target,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    let quiescenceChecks = 0;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          listOpenFiles: () => {
            quiescenceChecks += 1;
            return quiescenceChecks === 3 ? ['COMMAND PID USER FD TYPE NAME'] : [];
          },
        },
      }),
      (error) => error.code === 'RESTORE_ROLLED_BACK',
    );
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
    const failed = path.join(fx.quarantineRoot, `failed-data-${inspected.manifestSha256.slice(0, 16)}`);
    assert.equal(fs.readFileSync(path.join(failed, 'payload.bin'), 'utf8'), 'payload');
    assert.equal(fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')), false);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('writer barrier blocks active, incomplete, and malformed recovery state', () => {
  const fx = fixture();
  const root = fx.receiptRoot;
  try {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const markerPath = path.join(root, 'backend-data-recovery.lock');
    fs.symlinkSync(path.join(root, 'missing-marker-target'), markerPath);
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_ACTIVE',
      'a dangling marker symlink is an active entry, never absence',
    );
    fs.unlinkSync(markerPath);

    const transactionPath = path.join(root, 'backend-data-transaction-deadbeef.json');
    fs.writeFileSync(transactionPath, `${JSON.stringify({
      schema: 'yuri.backend-data-recovery.transaction.v2',
      state: 'prepared',
      transactionId: 'deadbeef',
    })}\n`, { mode: 0o600 });
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_INCOMPLETE',
    );

    fs.writeFileSync(transactionPath, '{not-json\n', { mode: 0o600 });
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_MALFORMED',
    );

    fs.unlinkSync(transactionPath);
    fs.rmdirSync(root);
    fs.writeFileSync(root, 'not-a-directory', { mode: 0o600 });
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_UNAVAILABLE',
      'ENOTDIR is an unavailable state, never marker absence',
    );
    fs.unlinkSync(root);
    fs.symlinkSync(fx.target, root);
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_UNAVAILABLE',
      'a symlink receipt root must block rather than appear absent',
    );
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('full-sync drift is rehashed before the fresh capacity sample and never promotes', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    let postSyncCapacitySamples = 0;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          fullSyncTree: (stagingData) => fs.appendFileSync(path.join(stagingData, 'payload.bin'), '-drift'),
          sampleFilesystem: (targetRoot) => {
            postSyncCapacitySamples += 1;
            return fs.statfsSync(targetRoot);
          },
        },
      }),
      (error) => error.code === 'STAGED_TREE_DRIFTED_AFTER_SYNC',
    );
    assert.equal(postSyncCapacitySamples, 0, 'fresh capacity must occur only after the post-sync rehash succeeds');
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
    assert.equal(fx.recovery.assertRecoveryStateAllowsWriter().ok, true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('contained native workflow proves G4/G5 exact dev/ino args, re-attestation, and ordering', {
  skip: process.platform !== 'darwin',
}, async () => {
  const fx = fixture();
  try {
    const native = fx.recoveryWith({}, { nativeHelper: true });
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const capacity = roomyCapacity(sourceTree.byteCount);
    const inspected = await native.inspect({ ownerApproved: true, expected, capacity });
    const restored = await native.restore({
      ownerApproved: true,
      manifestPath: inspected.manifestPath,
      manifestSha256: inspected.manifestSha256,
      expected,
      capacity,
    });
    const trace = native.nativeTrace();
    const signature = trace.map((entry) => [entry.event, entry.action ?? null, entry.phase ?? null]);
    assert.deepEqual(signature, [
      ['helper-compiled', null, null],
      ['helper-reattested', 'full-sync', 'pre'],
      ['helper-invoke', 'full-sync', null],
      ['helper-reattested', 'full-sync', 'post'],
      ['post-stage-capacity-sampled', null, null],
      ['helper-reattested', 'swap', 'pre'],
      ['helper-invoke', 'swap', null],
      ['helper-reattested', 'swap', 'post'],
    ], 'compile -> full-sync pre/invoke/post -> fresh capacity -> swap pre/invoke/post is exact');

    const fullSync = trace.find((entry) => entry.event === 'helper-invoke' && entry.action === 'full-sync');
    assert.equal(fullSync.args.length, 4);
    assert.equal(fullSync.args[0], 'full-sync');
    assert.match(fullSync.args[2], /^\d+$/u);
    assert.match(fullSync.args[3], /^\d+$/u);
    const promotedIdentity = fs.lstatSync(fx.target, { bigint: true });
    assert.equal(fullSync.args[2], promotedIdentity.dev.toString(), 'full-sync receives the exact staged dev');
    assert.equal(fullSync.args[3], promotedIdentity.ino.toString(), 'full-sync receives the exact staged inode');

    const swap = trace.find((entry) => entry.event === 'helper-invoke' && entry.action === 'swap');
    assert.equal(swap.args.length, 7);
    assert.equal(swap.args[0], 'swap');
    for (const identityArgument of swap.args.slice(3)) assert.match(identityArgument, /^\d+$/u);
    const oldIdentity = fs.lstatSync(restored.receipt.oldTargetQuarantine, { bigint: true });
    assert.equal(swap.args[3], oldIdentity.dev.toString(), 'swap left dev pins the displaced old target');
    assert.equal(swap.args[4], oldIdentity.ino.toString(), 'swap left inode pins the displaced old target');
    assert.equal(swap.args[5], promotedIdentity.dev.toString(), 'swap right dev pins the staged/promoted tree');
    assert.equal(swap.args[6], promotedIdentity.ino.toString(), 'swap right inode pins the staged/promoted tree');
    assert.equal(restored.receipt.fullSyncCompleted, true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('native recovery subprocesses remain hermetic under a hostile parent environment', {
  skip: process.platform !== 'darwin',
}, async () => {
  const fx = fixture();
  const hostile = Object.freeze({
    PATH: path.join(fx.root, 'poison-bin'),
    LANG: 'hostile_LOCALE',
    LC_ALL: 'hostile_LOCALE',
    TMPDIR: path.join(fx.root, 'poison-tmp'),
    CC: path.join(fx.root, 'poison-cc'),
    CFLAGS: '-include must-not-be-included.h',
    CPATH: path.join(fx.root, 'poison-include'),
    COMPILER_PATH: path.join(fx.root, 'poison-compiler-path'),
    GCC_EXEC_PREFIX: path.join(fx.root, 'poison-gcc-prefix'),
    LDFLAGS: '-Wl,-must-not-link',
    LIBRARY_PATH: path.join(fx.root, 'poison-library'),
    SDKROOT: path.join(fx.root, 'poison-sdk'),
    DYLD_INSERT_LIBRARIES: path.join(fx.root, 'must-not-load.dylib'),
    DYLD_LIBRARY_PATH: path.join(fx.root, 'poison-dyld-library'),
    LD_PRELOAD: path.join(fx.root, 'must-not-load.so'),
  });
  const previous = new Map(Object.keys(hostile).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, hostile);
    assert.equal(Object.isFrozen(RECOVERY_CHILD_ENVIRONMENT), true);
    assert.deepEqual(RECOVERY_CHILD_ENVIRONMENT, {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      LANG: 'C',
      LC_ALL: 'C',
      TMPDIR: '/private/tmp',
    });
    for (const key of Object.keys(hostile)) {
      if (!['PATH', 'LANG', 'LC_ALL', 'TMPDIR'].includes(key)) {
        assert.equal(key in RECOVERY_CHILD_ENVIRONMENT, false, `${key} must not cross the recovery spawn seam`);
      }
    }

    const systemAdapters = createSystemAdapters();
    assert.deepEqual(
      systemAdapters.listOpenFiles(fx.target),
      [],
      'the direct lsof seam must remain usable with a poisoned parent environment',
    );

    const native = fx.recoveryWith({}, { nativeHelper: true });
    const sourceTree = await enumerateTree(fx.sourceData);
    const expected = {
      itemCount: sourceTree.itemCount,
      fileCount: sourceTree.fileCount,
      byteCount: sourceTree.byteCount,
    };
    const capacity = roomyCapacity(sourceTree.byteCount);
    const inspected = await native.inspect({ ownerApproved: true, expected, capacity });
    const restored = await native.restore({
      ownerApproved: true,
      manifestPath: inspected.manifestPath,
      manifestSha256: inspected.manifestSha256,
      expected,
      capacity,
    });
    assert.equal(restored.finalClosure.complete, true);
    assert.equal(fs.readFileSync(path.join(fx.target, 'payload.bin'), 'utf8'), 'payload');
    assert.deepEqual(
      native.nativeTrace()
        .filter((entry) => entry.event === 'helper-invoke')
        .map((entry) => entry.action),
      ['full-sync', 'swap'],
      'sealed compile and both native helper execution modes must complete',
    );
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('helper error after a real exchange is observed and rolled back without a swapped flag', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    let swapCalls = 0;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          swapTrees(left, right) {
            swapCalls += 1;
            fx.adapters.swapTrees(left, right);
            if (swapCalls === 1) throw new Error('fixture helper failed after exchange');
          },
        },
      }),
      (error) => error.code === 'RESTORE_ROLLED_BACK',
    );
    assert.equal(swapCalls, 2, 'one observed exchange plus one rollback exchange');
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
    const failed = path.join(fx.quarantineRoot, `failed-data-${inspected.manifestSha256.slice(0, 16)}`);
    assert.equal(fs.readFileSync(path.join(failed, 'payload.bin'), 'utf8'), 'payload');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('oldLocation changes immediately after quarantine rename so a following fault rolls back safely', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    let observedOldLocation = null;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          afterOldTargetRenamed({ oldLocation }) {
            observedOldLocation = oldLocation;
            throw new Error('fixture fault immediately after old-target rename');
          },
        },
      }),
      (error) => error.code === 'RESTORE_ROLLED_BACK',
    );
    assert.match(observedOldLocation, /old-data-/u);
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('Phase-A seal forbids rollback when native release cannot be proven', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    const acquire = fx.adapters.acquireOperationLock;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          async acquireOperationLock(options) {
            const lease = await acquire(options);
            return Object.freeze({ ...lease, async release() { throw new Error('fixture release evidence lost'); } });
          },
        },
      }),
      (error) => error.code === 'RESTORE_FINALIZATION_INCOMPLETE',
    );
    assert.equal(fs.readFileSync(path.join(fx.target, 'payload.bin'), 'utf8'), 'payload');
    assert.equal(fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')), true);
    assert.throws(
      () => fx.recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_ACTIVE',
    );
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('lease loss after exchange causes fail-hold and no unleased rollback mutation', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    const acquire = fx.adapters.acquireOperationLock;
    let lost = false;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          async acquireOperationLock(options) {
            const lease = await acquire(options);
            return Object.freeze({
              ...lease,
              assertHeld() {
                if (lost) throw new Error('fixture native lease lost');
                return lease.assertHeld();
              },
            });
          },
          swapTrees(left, right) {
            fx.adapters.swapTrees(left, right);
            lost = true;
            throw new Error('fixture failure after exchange and lease loss');
          },
        },
      }),
      (error) => error.code === 'RESTORE_FAIL_HOLD',
    );
    assert.equal(fs.readFileSync(path.join(fx.target, 'payload.bin'), 'utf8'), 'payload');
    assert.equal(fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')), true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('lease loss immediately after rollback swap stops before failed-tree rename and retains the marker', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    const acquire = fx.adapters.acquireOperationLock;
    let lost = false;
    let swapCalls = 0;
    let quiescenceChecks = 0;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          async acquireOperationLock(options) {
            const lease = await acquire(options);
            return Object.freeze({
              ...lease,
              assertHeld() {
                if (lost) throw new Error('fixture lease lost after rollback swap');
                return lease.assertHeld();
              },
            });
          },
          listOpenFiles() {
            quiescenceChecks += 1;
            return quiescenceChecks === 3 ? ['fixture post-swap writer'] : [];
          },
          swapTrees(left, right) {
            swapCalls += 1;
            fx.adapters.swapTrees(left, right);
            if (swapCalls === 2) lost = true;
          },
        },
      }),
      (error) => error.code === 'RESTORE_FAIL_HOLD'
        && error.details.stage === 'immediately-after-rollback-swap',
    );
    assert.equal(swapCalls, 2, 'promotion and rollback swaps both occurred under the native hold');
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
    const token = inspected.manifestSha256.slice(0, 16);
    const displacedFailedTree = path.join(fx.quarantineRoot, `full-data-stage-${token}`, 'data');
    assert.equal(fs.readFileSync(path.join(displacedFailedTree, 'payload.bin'), 'utf8'), 'payload');
    assert.equal(fs.existsSync(path.join(fx.quarantineRoot, `failed-data-${token}`)), false,
      'failed-tree rename must not occur after post-swap lease loss');
    assert.equal(fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')), true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('lease loss at the successful quarantine boundary stops the rename and retains the marker', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    const acquire = fx.adapters.acquireOperationLock;
    let heldAssertions = 0;
    let swapCalls = 0;
    await assert.rejects(
      restoreRecovery({
        sourceRepo: fx.sourceRepo,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        capacity,
        canonicalTarget: fx.target,
        quarantineRoot: fx.quarantineRoot,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          async acquireOperationLock(options) {
            const lease = await acquire(options);
            return Object.freeze({
              ...lease,
              assertHeld() {
                heldAssertions += 1;
                if (heldAssertions >= 5) throw new Error('fixture lease lost before old-target quarantine rename');
                return lease.assertHeld();
              },
            });
          },
          swapTrees(left, right) {
            swapCalls += 1;
            fx.adapters.swapTrees(left, right);
          },
        },
      }),
      (error) => error.code === 'RESTORE_FAIL_HOLD',
    );
    assert.equal(heldAssertions, 6, 'fifth assertion is the rename boundary; catch recheck must also fail');
    assert.equal(swapCalls, 1, 'no rollback mutation may follow loss at the quarantine boundary');
    assert.equal(fs.readFileSync(path.join(fx.target, 'payload.bin'), 'utf8'), 'payload');
    const token = inspected.manifestSha256.slice(0, 16);
    const displacedOldTree = path.join(fx.quarantineRoot, `full-data-stage-${token}`, 'data');
    assert.equal(fs.readFileSync(path.join(displacedOldTree, 'old.txt'), 'utf8'), 'preserve-old');
    assert.equal(fs.existsSync(path.join(fx.quarantineRoot, `old-data-${token}`)), false,
      'old-target quarantine rename must not occur without a fresh held assertion');
    assert.equal(fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')), true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('verify seals under its lease and reports incomplete finalization without a startup marker', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    await restoreRecovery({
      sourceRepo: fx.sourceRepo,
      manifestPath: inspected.manifestPath,
      manifestSha256: inspected.manifestSha256,
      ownerApproved: true,
      expected,
      capacity,
      canonicalTarget: fx.target,
      quarantineRoot: fx.quarantineRoot,
      receiptRoot: fx.receiptRoot,
      adapters: fx.adapters,
    });
    const acquire = fx.adapters.acquireOperationLock;
    await assert.rejects(
      verifyRecovery({
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        ownerApproved: true,
        expected,
        canonicalTarget: fx.target,
        receiptRoot: fx.receiptRoot,
        adapters: {
          ...fx.adapters,
          async acquireOperationLock(options) {
            const lease = await acquire(options);
            return Object.freeze({ ...lease, async release() { throw new Error('fixture verify release lost'); } });
          },
        },
      }),
      (error) => error.code === 'VERIFY_FINALIZATION_INCOMPLETE',
    );
    assert.equal(fs.existsSync(path.join(fx.receiptRoot, 'backend-data-recovery.lock')), false);
    assert.equal(
      fs.readdirSync(fx.receiptRoot).some((name) => name.startsWith('internal-verify-sealed-')),
      true,
    );
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('real native recovery adapter acquires and validates a temporary verify hold', {
  skip: process.platform !== 'darwin',
}, async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-recovery-native-lock-')));
  try {
    const lockPath = path.join(root, 'anchor', 'backend-operation.lock');
    const binRoot = path.join(root, 'bin');
    fs.mkdirSync(binRoot, { mode: 0o700 });
    bootstrapBackendOperationLockAnchor({ ownerApproved: true, lockPath });
    const adapters = createSystemAdapters();
    const lease = await adapters.acquireOperationLock({ purpose: 'verify', lockPath, binRoot });
    const acquisition = adapters.validateOperationAcquisition(lease.acquisition, {
      expectedPurpose: 'verify',
      expectedMode: 'hold',
      expectedLockPath: lockPath,
    });
    lease.assertHeld();
    const release = await lease.release();
    const validated = adapters.validateOperationRelease(release, {
      expectedPurpose: 'verify',
      expectedNonce: acquisition.nonce,
      expectedLockPath: lockPath,
    });
    assert.equal(validated.released, true);
    assert.equal(validated.unexpected, false);
  } finally {
    // The native anchor deliberately seals its directory with uchg + mode 0500.
    // This is a private disposable fixture root, so unseal only that exact root
    // before removing it; production anchor state is never addressed here.
    spawnSync('/usr/bin/chflags', ['-R', 'nouchg', root], { encoding: 'utf8' });
    spawnSync('/bin/chmod', ['-R', 'u+w', root], { encoding: 'utf8' });
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('tree enumeration rejects symlinks and special files', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-backend-tree-reject-')));
  try {
    const symlinkRoot = path.join(root, 'symlink-tree');
    fs.mkdirSync(symlinkRoot);
    fs.writeFileSync(path.join(root, 'outside.txt'), 'outside');
    fs.symlinkSync(path.join(root, 'outside.txt'), path.join(symlinkRoot, 'link'));
    await assert.rejects(enumerateTree(symlinkRoot), (error) => error.code === 'SOURCE_SYMLINK_REFUSED');

    const specialRoot = path.join(root, 'special-tree');
    fs.mkdirSync(specialRoot);
    const fifo = path.join(specialRoot, 'pipe');
    const made = spawnSync('/usr/bin/mkfifo', [fifo], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr || made.stdout);
    await assert.rejects(enumerateTree(specialRoot), (error) => error.code === 'SOURCE_SPECIAL_FILE_REFUSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
