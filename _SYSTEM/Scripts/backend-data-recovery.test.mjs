#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import {
  attestInternalApfsVolume as productionAttestInternalApfsVolume,
  assertRecoveryStateAllowsWriter as productionWriterBarrier,
  cliSummary,
  createBackendDataRecoveryFixtureApi,
  createSystemAdapters,
  enumerateTree,
  inspectRecovery as productionInspectRecovery,
  normalizeBackupSourceMountEvidence,
  normalizeRecoveryTargetIdentity,
  RECOVERY_CHILD_ENVIRONMENT,
  restoreRecovery as productionRestoreRecovery,
  verifyRecovery as productionVerifyRecovery,
  SWAP_HELPER_SOURCE_PATH,
  SWAP_HELPER_SOURCE_SHA256,
} from './backend-data-recovery.mjs';
import {
  acquireBackendOperationLock,
  bootstrapBackendOperationLockAnchor,
  BACKEND_OPERATION_LOCK_SOURCE,
  compileFreshC,
} from './backend-operation-lock.mjs';
import {
  INTERNAL_APFS_EXPECTED_VOLUME_UUID,
  normalizeDiskutilMountInfo,
} from './backend-storage-guard.mjs';

const OPERATION_LOCK_MODULE_URL = new URL('./backend-operation-lock.mjs', import.meta.url).href;

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
    compileSwapHelper: () => Object.freeze({
      path: path.join(root, 'bin/backend-data-swap'),
      device: 0,
      inode: 0,
      uid: process.getuid(),
      mode: 0o500,
      sha256: 'stub-helper-sha256',
      sourceSha256: 'stub-source-sha256',
      snapshotSha256: 'stub-source-snapshot-sha256',
    }),
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

function removeFixtureRoot(root) {
  const makeWritable = (candidate) => {
    let entry;
    try {
      entry = fs.lstatSync(candidate);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (entry.isSymbolicLink()) return;
    if (entry.isDirectory()) {
      fs.chmodSync(candidate, 0o700);
      for (const name of fs.readdirSync(candidate)) makeWritable(path.join(candidate, name));
      return;
    }
    if (entry.isFile()) fs.chmodSync(candidate, 0o600);
  };
  makeWritable(root);
  fs.rmSync(root, { recursive: true, force: true });
}

function compileNativeSwapHelperFixture(root) {
  const helperPath = path.join(root, 'backend-data-swap');
  const compiled = spawnSync('/usr/bin/clang', [
    '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', helperPath,
  ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
  fs.chmodSync(helperPath, 0o500);
  const helperStat = fs.lstatSync(helperPath);
  return Object.freeze({
    path: helperPath,
    device: helperStat.dev,
    inode: helperStat.ino,
    uid: helperStat.uid,
    mode: helperStat.mode & 0o777,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex'),
    sourceSha256: SWAP_HELPER_SOURCE_SHA256,
    snapshotSha256: SWAP_HELPER_SOURCE_SHA256,
  });
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

test('backup source identity resolves diskutil at the df mountpoint, not the nested repository path', () => {
  const mountPoint = '/private/tmp/yuri-backup-readonly-fixture';
  const sourceRepo = path.join(mountPoint, 'YURI-OS-MUSUBI');
  const dfRecord = Object.freeze({
    sourceDevice: '/dev/disk5s1',
    mountPoint,
  });
  const mounted = Object.freeze({
    DeviceNode: '/dev/disk5s1',
    FilesystemType: 'apfs',
    MountPoint: mountPoint,
    VolumeUUID: '68F64A84-0F8D-4F86-A4BB-821AFA93F835',
    Writable: false,
    WritableVolume: false,
  });
  assert.deepEqual(
    normalizeBackupSourceMountEvidence(sourceRepo, dfRecord, mounted),
    {
      mountPoint,
      volumeUuid: '68F64A84-0F8D-4F86-A4BB-821AFA93F835',
      filesystem: 'apfs',
      writable: false,
    },
  );

  for (const [label, candidate] of [
    ['nested diskutil mountpoint', { ...mounted, MountPoint: sourceRepo }],
    ['df/diskutil device mismatch', { ...mounted, DeviceNode: '/dev/disk9s1' }],
    ['writable source', { ...mounted, Writable: true, WritableVolume: true }],
  ]) {
    assert.throws(
      () => normalizeBackupSourceMountEvidence(sourceRepo, dfRecord, candidate),
      (error) => error?.code === 'BACKUP_MOUNT_IDENTITY_MISMATCH',
      label,
    );
  }

  const source = fs.readFileSync(path.join(path.dirname(SWAP_HELPER_SOURCE_PATH), 'backend-data-recovery.mjs'), 'utf8');
  assert.match(
    source,
    /diskutil', \['info', '-plist', sourceMount\.mountPoint\]/u,
    'production must ask diskutil about the df-derived mountpoint',
  );
  assert.doesNotMatch(
    source,
    /diskutil', \['info', '-plist', source\.path\]/u,
    'production must never pass the nested source repository to diskutil',
  );
});

test('Darwin swap helper boundary: full-sync positive + dev/ino/path/argc/symlink/hardlink/cross-device negatives (hermetic)', {
  skip: process.platform !== 'darwin',
}, () => {
  // Hermetic boundary coverage for backend-data-swap.c. Compile once, exercise the CLI
  // surface: positive full-sync, then identity/path/argc/symlink/hardlink/cross-device
  // rejections. readdir I/O errors and parent-fsync faults are NOT covered here (no
  // hermetic injection seam exists without kernel fault injection); the
  // descriptor-relative walk's per-component O_NOFOLLOW rejection IS covered
  // deterministically via an in-test symlink. Cross-device prefers mount_tmpfs under
  // /private/tmp; never probes /Volumes/T7 or hdiutil.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-backend-data-swap-boundary-')));
  const mountedTmpfs = [];
  try {
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    const run = (...args) => {
      const r = spawnSync(binary, args, { encoding: 'utf8' });
      return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
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

    // --- native fclonefileat producer: exact source + pinned destination parent ---
    const cloneSource = path.join(root, 'clone-source.db');
    const cloneParent = path.join(root, 'clone-destination');
    const cloneDestination = path.join(cloneParent, 'snapshot.db');
    fs.writeFileSync(cloneSource, Buffer.from('native-fclonefileat-boundary'));
    fs.mkdirSync(cloneParent);
    const cloneSourceStat = fs.lstatSync(cloneSource, { bigint: true });
    const cloneParentStat = fs.lstatSync(cloneParent, { bigint: true });
    const cloneArgs = (destination, overrides = {}) => [
      'clone-file',
      overrides.source ?? cloneSource,
      destination,
      overrides.sourceDev ?? cloneSourceStat.dev.toString(),
      overrides.sourceIno ?? cloneSourceStat.ino.toString(),
      overrides.parentDev ?? cloneParentStat.dev.toString(),
      overrides.parentIno ?? cloneParentStat.ino.toString(),
      overrides.sourceSize ?? cloneSourceStat.size.toString(),
    ];
    const cloned = run(...cloneArgs(cloneDestination));
    expectOk('clone-file positive', cloned);
    assert.equal(cloned.stdout, 'BACKEND_DATA_CLONE_PASS');
    assert.deepEqual(fs.readFileSync(cloneDestination), fs.readFileSync(cloneSource));
    const cloneDestinationStat = fs.lstatSync(cloneDestination, { bigint: true });
    assert.equal(cloneDestinationStat.dev, cloneSourceStat.dev);
    assert.notEqual(cloneDestinationStat.ino, cloneSourceStat.ino);
    assert.equal(cloneDestinationStat.size, cloneSourceStat.size);

    const rejectClone = (description, leaf, overrides = {}) => {
      const destination = path.join(cloneParent, leaf);
      const result = run(...cloneArgs(destination, overrides));
      expectReject(description, result);
      assert.equal(fs.existsSync(destination), false, `${description}: failed clone cannot create destination`);
      return result;
    };
    rejectClone('clone stale source dev', 'stale-source-dev.db', {
      sourceDev: (cloneSourceStat.dev + 1n).toString(),
    });
    rejectClone('clone stale source ino', 'stale-source-ino.db', {
      sourceIno: (cloneSourceStat.ino + 1n).toString(),
    });
    rejectClone('clone stale source size', 'stale-source-size.db', {
      sourceSize: (cloneSourceStat.size + 1n).toString(),
    });
    rejectClone('clone stale destination parent dev', 'stale-parent-dev.db', {
      parentDev: (cloneParentStat.dev + 1n).toString(),
    });
    rejectClone('clone stale destination parent ino', 'stale-parent-ino.db', {
      parentIno: (cloneParentStat.ino + 1n).toString(),
    });
    expectReject('clone destination exists', run(...cloneArgs(cloneDestination)));

    // --- SYMLINK negative (swap.c S_ISLNK / identity mismatch) ---
    const cloneSourceLink = path.join(root, 'clone-source-link.db');
    fs.symlinkSync(cloneSource, cloneSourceLink);
    const symlinkReject = rejectClone('clone source symlink', 'source-symlink.db', { source: cloneSourceLink });
    assert.match(symlinkReject.stderr, /clone source identity mismatch|BACKEND_DATA_SWAP_FAILED/u);

    // --- HARD-LINK negative: outside-EPH twin shares inode; nlink>1 must reject ---
    const outsideEph = path.join(root, 'outside-eph');
    const insideEph = path.join(root, 'inside-eph');
    fs.mkdirSync(outsideEph);
    fs.mkdirSync(insideEph);
    const outsideTarget = path.join(outsideEph, 'shared-target.db');
    const hardlinkSource = path.join(insideEph, 'hardlink-source.db');
    fs.writeFileSync(outsideTarget, Buffer.from('hardlink-escape-payload'));
    fs.linkSync(outsideTarget, hardlinkSource);
    const hardlinkStat = fs.lstatSync(hardlinkSource, { bigint: true });
    assert.equal(hardlinkStat.nlink, 2n, 'fixture must present a multi-link inode');
    assert.equal(hardlinkStat.ino, fs.lstatSync(outsideTarget, { bigint: true }).ino);
    const hardlinkParent = path.join(insideEph, 'clone-parent');
    fs.mkdirSync(hardlinkParent);
    const hardlinkParentStat = fs.lstatSync(hardlinkParent, { bigint: true });
    const hardlinkDest = path.join(hardlinkParent, 'must-not-exist.db');
    const hardlinkReject = run(
      'clone-file',
      hardlinkSource,
      hardlinkDest,
      hardlinkStat.dev.toString(),
      hardlinkStat.ino.toString(),
      hardlinkParentStat.dev.toString(),
      hardlinkParentStat.ino.toString(),
      hardlinkStat.size.toString(),
    );
    expectReject('clone source hardlink outside-EPH twin', hardlinkReject);
    assert.match(
      hardlinkReject.stderr,
      /clone source must be a single-link regular file/u,
      'hardlink reject must hit native nlink guard',
    );
    assert.equal(fs.existsSync(hardlinkDest), false);

    // --- CROSS-DEVICE negative: real distinct st_dev (tmpfs preferred; never T7/hdiutil) ---
    const tmpfsDir = path.join(root, 'tmpfs-cross-dev');
    fs.mkdirSync(tmpfsDir);
    const tmpfsMount = spawnSync('/sbin/mount_tmpfs', ['-s', '8m', tmpfsDir], { encoding: 'utf8' });
    let crossSource;
    let crossCleanup = null;
    if (tmpfsMount.status === 0) {
      mountedTmpfs.push(tmpfsDir);
      crossSource = path.join(tmpfsDir, 'cross-source.db');
      fs.writeFileSync(crossSource, Buffer.from('cross-device-source'));
      crossCleanup = 'tmpfs';
    } else {
      // Opportunistic synthetic: locate a readable regular file already on a different
      // st_dev (e.g. AppTranslocation nullfs). Never /Volumes/T7, never hdiutil.
      // Note: Node readdir on some AppTranslocation roots returns ERANGE; use find(1).
      const destDev = cloneParentStat.dev;
      const isForbidden = (p) => /\/Volumes\/T7(?:\/|$)/u.test(p);
      const candidates = [];
      const mountText = spawnSync('/sbin/mount', [], { encoding: 'utf8' }).stdout || '';
      for (const line of mountText.split('\n')) {
        const m = line.match(/\son\s+(\/private\/var\/folders\/[^\s]+)\s+\(/u);
        if (m && !isForbidden(m[1])) candidates.push(m[1]);
      }
      for (const candidate of candidates.slice(0, 8)) {
        if (crossSource) break;
        const found = spawnSync('/usr/bin/find', [candidate, '-type', 'f', '-maxdepth', '10'], {
          encoding: 'utf8',
          timeout: 8000,
        });
        if (found.status !== 0) continue;
        for (const full of (found.stdout || '').split('\n')) {
          if (!full || isForbidden(full)) continue;
          let st;
          try { st = fs.lstatSync(full, { bigint: true }); } catch { continue; }
          if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1n || st.size <= 0n) continue;
          if (st.dev === destDev) continue;
          crossSource = full;
          crossCleanup = 'opportunistic';
          break;
        }
      }
      assert.ok(
        crossSource,
        `cross-device fixture unavailable (mount_tmpfs rc=${tmpfsMount.status}: ${(tmpfsMount.stderr || '').trim()}); no alternate non-T7 different-st_dev regular file found`,
      );
    }
    const crossSourceStat = fs.lstatSync(crossSource, { bigint: true });
    assert.notEqual(crossSourceStat.dev, cloneParentStat.dev, 'cross-device fixture must differ in st_dev');
    const crossDest = path.join(cloneParent, 'cross-device.db');
    const crossReject = run(
      'clone-file',
      crossSource,
      crossDest,
      crossSourceStat.dev.toString(),
      crossSourceStat.ino.toString(),
      cloneParentStat.dev.toString(),
      cloneParentStat.ino.toString(),
      crossSourceStat.size.toString(),
    );
    expectReject('clone cross-device source vs destination parent', crossReject);
    assert.match(
      crossReject.stderr,
      /clone source and destination are not on the same filesystem/u,
      'cross-device must hit swap.c same-filesystem FAIL',
    );
    assert.equal(fs.existsSync(crossDest), false);
    assert.ok(!String(crossSource).includes('/Volumes/T7'), 'cross-device source must be T7-free');
    assert.ok(crossCleanup === 'tmpfs' || crossCleanup === 'opportunistic');

    const realCloneParent = path.join(root, 'real-clone-parent');
    const linkCloneParent = path.join(root, 'link-clone-parent');
    fs.mkdirSync(realCloneParent);
    fs.symlinkSync(realCloneParent, linkCloneParent);
    const realCloneParentStat = fs.lstatSync(realCloneParent, { bigint: true });
    const linkedDestination = path.join(linkCloneParent, 'through-link.db');
    expectReject('clone destination intermediate symlink', run(...cloneArgs(linkedDestination, {
      parentDev: realCloneParentStat.dev.toString(),
      parentIno: realCloneParentStat.ino.toString(),
    })));
    assert.equal(fs.existsSync(path.join(realCloneParent, 'through-link.db')), false);

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
    for (const mnt of mountedTmpfs) {
      spawnSync('/sbin/umount', [mnt], { encoding: 'utf8' });
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('native clone post-create failure retains forensic evidence and a fresh path remains usable', {
  skip: process.platform !== 'darwin',
}, () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-clone-retention-boundary-')));
  try {
    const source = path.join(root, 'source.db');
    const destinationRoot = path.join(root, 'snapshot');
    const destination = path.join(destinationRoot, 'source.db');
    const freshDestination = path.join(destinationRoot, 'source-fresh-nonce.db');
    fs.writeFileSync(source, Buffer.from('post-clone-retained-forensics'));
    fs.mkdirSync(destinationRoot, { mode: 0o700 });
    const faultBinary = path.join(root, 'backend-data-swap-fault');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror',
      '-DBACKEND_DATA_SWAP_CLONE_TEST_FAIL_AFTER_CREATE',
      SWAP_HELPER_SOURCE_PATH, '-o', faultBinary,
    ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    const sourceStat = fs.lstatSync(source, { bigint: true });
    const parentStat = fs.lstatSync(destinationRoot, { bigint: true });
    const args = [
      'clone-file', source, destination,
      sourceStat.dev.toString(), sourceStat.ino.toString(),
      parentStat.dev.toString(), parentStat.ino.toString(), sourceStat.size.toString(),
    ];
    const failed = spawnSync(faultBinary, args, { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.notEqual(failed.status, 0, 'fault injection must fail after creating the clone');
    assert.match(failed.stderr, /injected post-clone failure: Input\/output error/u);
    assert.match(failed.stderr, /clone retained for forensics/u);
    assert.match(
      failed.stderr,
      /destination-close=0\/0; source-close=0\/0; parent-fsync=0\/0/u,
      'failure telemetry must record bounded descriptor-close and parent-fsync outcomes',
    );
    assert.equal(fs.existsSync(destination), true, 'the partial clone is retained as forensic evidence');
    assert.deepEqual(fs.readFileSync(destination), fs.readFileSync(source));

    const helper = compileNativeSwapHelperFixture(root);
    const sameDestinationRetry = spawnSync(helper.path, args, {
      encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT,
    });
    assert.notEqual(sameDestinationRetry.status, 0, 'same-destination retry must fail closed');
    assert.match(sameDestinationRetry.stderr, /destination must be absent/u);
    assert.deepEqual(fs.readFileSync(destination), fs.readFileSync(source), 'failed retry preserves evidence');

    const freshArgs = [...args];
    freshArgs[2] = freshDestination;
    const recovered = spawnSync(helper.path, freshArgs, { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
    assert.equal(recovered.stdout.trim(), 'BACKEND_DATA_CLONE_PASS');
    assert.deepEqual(fs.readFileSync(freshDestination), fs.readFileSync(source));
    assert.deepEqual(fs.readFileSync(destination), fs.readFileSync(source));

    const helperSource = fs.readFileSync(SWAP_HELPER_SOURCE_PATH, 'utf8');
    assert.doesNotMatch(
      helperSource,
      /unlinkat\s*\(\s*destination_parent_fd/u,
      'post-create clone failures must never delete a destination name',
    );
  } finally {
    removeFixtureRoot(root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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

test('production database verification copy seam requires the authenticated native fclonefileat helper', {
  skip: process.platform !== 'darwin',
}, () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-database-snapshot-cow-')));
  try {
    const source = path.join(root, 'source.db');
    const destination = path.join(root, 'snapshot.db');
    fs.writeFileSync(source, Buffer.from('forced-cow-snapshot'));
    const adapters = createSystemAdapters();
    assert.equal(adapters.databaseVerificationCopyMode, 'native-fclonefileat-authenticated');
    assert.throws(
      () => adapters.copyDatabaseVerificationFile(source, destination),
      (error) => error?.code === 'DATABASE_SNAPSHOT_HELPER_REQUIRED',
    );
    assert.equal(fs.existsSync(destination), false);

    const unavailablePath = path.join(root, 'backend-data-swap-unavailable');
    fs.writeFileSync(unavailablePath, '#!/bin/sh\nexit 73\n', { mode: 0o500 });
    const unavailableStat = fs.lstatSync(unavailablePath);
    const unavailableHelper = Object.freeze({
      path: unavailablePath,
      device: unavailableStat.dev,
      inode: unavailableStat.ino,
      uid: unavailableStat.uid,
      mode: unavailableStat.mode & 0o777,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(unavailablePath)).digest('hex'),
      sourceSha256: SWAP_HELPER_SOURCE_SHA256,
      snapshotSha256: SWAP_HELPER_SOURCE_SHA256,
    });
    assert.throws(
      () => adapters.copyDatabaseVerificationFile(source, destination, unavailableHelper),
      (error) => error?.code === 'DATABASE_SNAPSHOT_REFLINK_UNAVAILABLE'
        && error?.details?.commandDetails?.status === 73,
    );
    assert.equal(fs.existsSync(destination), false, 'native producer failure cannot fall back to a byte copy');

    const helper = compileNativeSwapHelperFixture(root);
    adapters.copyDatabaseVerificationFile(source, destination, helper);
    assert.deepEqual(fs.readFileSync(destination), fs.readFileSync(source));
    const sourceStat = fs.lstatSync(source, { bigint: true });
    const destinationStat = fs.lstatSync(destination, { bigint: true });
    assert.equal(destinationStat.dev, sourceStat.dev);
    assert.notEqual(destinationStat.ino, sourceStat.ino, 'clone must be a newly created inode');
    assert.equal(destinationStat.size, sourceStat.size);
    assert.throws(
      () => adapters.copyDatabaseVerificationFile(source, destination, helper),
      (error) => error?.code === 'DATABASE_SNAPSHOT_DESTINATION_EXISTS',
      'an existing destination must fail before native invocation',
    );
    const moduleSource = fs.readFileSync(new URL('./backend-data-recovery.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(moduleSource, /COPYFILE_FICLONE_FORCE/u, 'Node clone flags are not the production producer');
    assert.match(moduleSource, /'clone-file'/u, 'production cloning must invoke the authenticated native helper');
  } finally {
    removeFixtureRoot(root);
  }
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
    removeFixtureRoot(fx.root);
  }
});

test('WAL verification snapshots preserve uncheckpointed committed data without touching source families', {
  timeout: 30_000,
}, async () => {
  const fx = fixture();
  let writer = null;
  try {
    const databasePath = path.join(fx.sourceData, 'wal-only.db');
    assert.equal(fs.existsSync(databasePath), false, 'WAL fixture path must be fresh and non-colliding');
    const baseline = spawnSync('/usr/bin/sqlite3', [databasePath, [
      'PRAGMA user_version=0;',
      'CREATE TABLE baseline(id INTEGER PRIMARY KEY);',
      'INSERT INTO baseline VALUES(1);',
    ].join(' ')], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);
    writer = spawn('/usr/bin/sqlite3', [databasePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: RECOVERY_CHILD_ENVIRONMENT,
    });
    writer.stdout.setEncoding('utf8');
    writer.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`WAL fixture did not become ready: ${stderr}`)), 5000);
      writer.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.includes('WAL_READY')) {
          clearTimeout(timer);
          resolve();
        }
      });
      writer.stderr.on('data', (chunk) => { stderr += chunk; });
      writer.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      writer.once('exit', (code, signal) => {
        if (!stdout.includes('WAL_READY')) {
          clearTimeout(timer);
          reject(new Error(`WAL fixture exited before ready: code=${code} signal=${signal} stderr=${stderr}`));
        }
      });
    });
    writer.stdin.write([
      '.bail on',
      '.timeout 5000',
      'PRAGMA journal_mode=WAL;',
      'PRAGMA wal_autocheckpoint=0;',
      'PRAGMA wal_checkpoint(TRUNCATE);',
      'BEGIN IMMEDIATE;',
      'CREATE TABLE wal_only_sentinel(value TEXT NOT NULL);',
      "INSERT INTO wal_only_sentinel VALUES('snapshot-visible');",
      'PRAGMA user_version=1;',
      'COMMIT;',
      '.print WAL_READY',
      '',
    ].join('\n'));
    await ready;
    writer.kill('SIGKILL');
    await once(writer, 'close');
    writer = null;

    const familyPaths = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
    for (const candidate of familyPaths) {
      assert.equal(fs.existsSync(candidate), true, `${path.basename(candidate)} must exist`);
      assert.equal(fs.lstatSync(candidate).isFile(), true);
    }
    assert.ok(fs.statSync(`${databasePath}-wal`).size > 0, 'the committed WAL must be non-empty');
    const mainOnly = path.join(fx.root, 'main-without-wal.db');
    const mainOnlyBytes = fs.readFileSync(databasePath);
    assert.equal(mainOnlyBytes.readUInt32BE(60), 0, 'the main-file header must retain user_version zero');
    // Make the disposable control copy rollback-journal readable without its WAL.
    // Production never rewrites a database header and never uses immutable=1.
    mainOnlyBytes[18] = 1;
    mainOnlyBytes[19] = 1;
    fs.writeFileSync(mainOnly, mainOnlyBytes, { mode: 0o400 });
    const mainOnlyVersion = spawnSync('/usr/bin/sqlite3', [
      '-readonly', '-batch', '-noheader', mainOnly,
      'PRAGMA user_version;',
    ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.equal(mainOnlyVersion.status, 0, mainOnlyVersion.stderr || mainOnlyVersion.stdout);
    assert.equal(mainOnlyVersion.stdout.trim(), '0', 'main-only baseline must remain at schema version zero');
    const absentWithoutWal = spawnSync('/usr/bin/sqlite3', [
      '-readonly', '-batch', '-noheader', mainOnly,
      "SELECT value FROM wal_only_sentinel;",
    ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.notEqual(absentWithoutWal.status, 0, 'the sentinel schema must be committed only in the WAL');

    for (const candidate of familyPaths) fs.chmodSync(candidate, 0o400);
    for (const candidate of [path.join(fx.sourceData, 'nested'), fx.sourceData]) fs.chmodSync(candidate, 0o500);
    const familyHashes = () => Object.fromEntries(familyPaths.map((candidate) => [
      path.basename(candidate),
      crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex'),
    ]));
    const before = familyHashes();
    const { expected, capacity, inspected } = await inspectFixture(fx);
    assert.deepEqual(familyHashes(), before, 'read-only backup inspection must not change main/WAL/SHM bytes');
    assert.equal(
      (await enumerateTree(fx.sourceData)).treeDigest,
      inspected.payload.tree.treeDigest,
      'read-only backup inspection must preserve the exact source-tree digest',
    );

    let snapshotCopyCount = 0;
    let snapshotObservedAtCapacitySample = false;
    const walRecovery = fx.recoveryWith({
      copyTree(source, destination) {
        const copied = spawnSync('/usr/bin/ditto', [
          '--rsrc', '--extattr', '--acl', '--noqtn', '--nocache', source, destination,
        ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
        assert.equal(copied.status, 0, copied.stderr || copied.stdout);
      },
      swapTrees(left, right) {
        const stagedMode = fs.lstatSync(right).mode & 0o7777;
        fs.chmodSync(right, 0o700);
        fx.adapters.swapTrees(left, right);
        fs.chmodSync(left, stagedMode);
      },
      copyDatabaseVerificationFile(source, destination) {
        snapshotCopyCount += 1;
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      },
      sampleFilesystem(targetRoot) {
        snapshotObservedAtCapacitySample = fs.readdirSync(fx.quarantineRoot)
          .some((name) => name.startsWith('database-verification-restore-'));
        return fs.statfsSync(targetRoot);
      },
    });
    const restored = await walRecovery.restore({
      ownerApproved: true,
      manifestPath: inspected.manifestPath,
      manifestSha256: inspected.manifestSha256,
      expected,
      capacity,
    });
    const restoreSnapshot = restored.receipt.databaseVerificationSnapshot;
    assert.equal(restoreSnapshot.schema, 'yuri.backend-data-recovery.database-verification-snapshot.v1');
    assert.equal(restoreSnapshot.copyMode, 'fixture-byte-copy');
    assert.deepEqual(restoreSnapshot.helperIdentity, {
      path: path.join(fx.root, 'bin/backend-data-swap'),
      device: 0,
      inode: 0,
      uid: process.getuid(),
      mode: 0o500,
      sha256: 'stub-helper-sha256',
      sourceSha256: 'stub-source-sha256',
      snapshotSha256: 'stub-source-snapshot-sha256',
    });
    assert.equal(restoreSnapshot.retainedForForensics, true);
    assert.equal(restoreSnapshot.sourceTreeUnchanged, true);
    assert.equal(restoreSnapshot.directoryMode, 0o500);
    assert.equal(restoreSnapshot.fileMode, 0o400);
    assert.equal(restoreSnapshot.databases.ok, true);
    const walFamily = restoreSnapshot.families.find((family) => family.mainPath === 'wal-only.db');
    assert.equal(walFamily?.fileCount, 3, 'the WAL fixture is snapshotted as exact main/WAL/SHM');
    assert.deepEqual(walFamily?.companionPaths, ['wal-only.db-wal', 'wal-only.db-shm']);
    assert.equal(snapshotCopyCount, 4, 'restore clones the three-file WAL family plus the unchanged default database');
    assert.equal(snapshotObservedAtCapacitySample, true, 'post-stage statfs runs after snapshot allocation');
    assert.equal(
      restoreSnapshot.databases.checks.find((check) => check.path === 'wal-only.db')?.schemaVersion,
      1,
      'the database verdict must observe the schema version committed only in WAL',
    );
    const restoreSnapshotDatabase = path.join(restoreSnapshot.snapshotRoot, 'wal-only.db');
    const restoreSentinel = spawnSync('/usr/bin/sqlite3', [
      '-readonly', '-batch', '-noheader', restoreSnapshotDatabase,
      "SELECT value FROM wal_only_sentinel;",
    ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.equal(restoreSentinel.status, 0, restoreSentinel.stderr || restoreSentinel.stdout);
    assert.equal(restoreSentinel.stdout.trim(), 'snapshot-visible');
    for (const suffix of ['', '-wal', '-shm']) {
      assert.equal(fs.lstatSync(`${restoreSnapshotDatabase}${suffix}`).mode & 0o7777, 0o400);
    }
    assert.deepEqual(
      Object.fromEntries(familyPaths.map((candidate) => {
        const promoted = path.join(fx.target, path.basename(candidate));
        return [path.basename(candidate), crypto.createHash('sha256').update(fs.readFileSync(promoted)).digest('hex')];
      })),
      before,
      'the exact promoted main/WAL/SHM family remains byte-identical to the source tree',
    );

    const verified = await walRecovery.verify({
      ownerApproved: true,
      manifestPath: inspected.manifestPath,
      manifestSha256: inspected.manifestSha256,
      expected,
    });
    const verifySnapshot = verified.payload.databaseVerificationSnapshot;
    assert.notEqual(verifySnapshot.snapshotRoot, restoreSnapshot.snapshotRoot, 'verify must create a fresh snapshot');
    assert.deepEqual(verifySnapshot.helperIdentity, restoreSnapshot.helperIdentity);
    assert.equal(snapshotCopyCount, 8, 'verify adds one fresh four-file snapshot; restore never re-snapshots after sync/promotion');
    assert.equal(verifySnapshot.retainedForForensics, true);
    const verifySentinel = spawnSync('/usr/bin/sqlite3', [
      '-readonly', '-batch', '-noheader', path.join(verifySnapshot.snapshotRoot, 'wal-only.db'),
      "SELECT value FROM wal_only_sentinel;",
    ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.equal(verifySentinel.status, 0, verifySentinel.stderr || verifySentinel.stdout);
    assert.equal(verifySentinel.stdout.trim(), 'snapshot-visible');
    assert.deepEqual(familyHashes(), before, 'snapshot-only restore and verify never change the backup family');

    const moduleSource = fs.readFileSync(new URL('./backend-data-recovery.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(moduleSource, /immutable=1/u, 'WAL visibility must not be bypassed with SQLite immutable mode');
  } finally {
    if (writer && writer.exitCode === null && writer.signalCode === null) writer.kill('SIGKILL');
    removeFixtureRoot(fx.root);
  }
});

test('lone SHM without WAL fails the database-family gate before cloning or promotion', async () => {
  const fx = fixture();
  try {
    const databasePath = path.join(fx.sourceData, 'yuri.db');
    const loneShm = `${databasePath}-shm`;
    fs.writeFileSync(loneShm, Buffer.alloc(32 * 1024), { mode: 0o400 });
    assert.equal(fs.existsSync(`${databasePath}-wal`), false);
    assert.equal(fs.existsSync(loneShm), true);
    fs.chmodSync(databasePath, 0o400);
    fs.chmodSync(path.join(fx.sourceData, 'nested'), 0o500);
    fs.chmodSync(fx.sourceData, 0o500);
    const sourceBefore = await enumerateTree(fx.sourceData);
    const { expected, capacity, inspected } = await inspectFixture(fx);
    assert.equal(inspected.payload.tree.treeDigest, sourceBefore.treeDigest);
    assert.equal((await enumerateTree(fx.sourceData)).treeDigest, sourceBefore.treeDigest);

    let cloneCount = 0;
    const incomplete = fx.recoveryWith({
      copyTree(source, destination) {
        const copied = spawnSync('/usr/bin/ditto', [
          '--rsrc', '--extattr', '--acl', '--noqtn', '--nocache', source, destination,
        ], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
        assert.equal(copied.status, 0, copied.stderr || copied.stdout);
      },
      copyDatabaseVerificationFile() {
        cloneCount += 1;
        throw new Error('incomplete family must be rejected before the clone seam');
      },
    });
    await assert.rejects(
      incomplete.restore({
        ownerApproved: true,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        expected,
        capacity,
      }),
      (error) => {
        assert.equal(error?.code, 'DATABASE_FAMILY_INCOMPLETE');
        assert.equal(error?.details?.causeCode, 'DATABASE_FAMILY_INCOMPLETE');
        return true;
      },
    );
    assert.equal(cloneCount, 0, 'no family member is cloned after incomplete-family detection');
    assert.equal(
      fs.readdirSync(fx.quarantineRoot).some((name) => name.startsWith('database-verification-')),
      false,
      'the private snapshot namespace is not allocated for an incomplete family',
    );
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
    assert.equal(fs.existsSync(path.join(fx.target, 'payload.bin')), false, 'incomplete staging is never promoted');
    assert.equal(fx.recovery.assertRecoveryStateAllowsWriter().ok, true);
    assert.equal((await enumerateTree(fx.sourceData)).treeDigest, sourceBefore.treeDigest);
  } finally {
    removeFixtureRoot(fx.root);
  }
});

test('database-family source drift between clone seams fails closed before promotion', async () => {
  const fx = fixture();
  try {
    const auxiliaryDatabase = path.join(fx.sourceData, 'nested', 'aux.sqlite');
    const created = spawnSync('/usr/bin/sqlite3', [auxiliaryDatabase, [
      'PRAGMA user_version=2;',
      'CREATE TABLE auxiliary(value TEXT NOT NULL);',
      "INSERT INTO auxiliary VALUES('stable-before-snapshot');",
    ].join(' ')], { encoding: 'utf8', env: RECOVERY_CHILD_ENVIRONMENT });
    assert.equal(created.status, 0, created.stderr || created.stdout);
    const { expected, capacity, inspected } = await inspectFixture(fx);
    let cloneCount = 0;
    let mutatedStagedDatabase = null;
    const racing = fx.recoveryWith({
      copyDatabaseVerificationFile(source, destination) {
        cloneCount += 1;
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
        if (cloneCount === 1) {
          const firstIsAuxiliary = path.basename(source) === 'aux.sqlite';
          mutatedStagedDatabase = firstIsAuxiliary
            ? path.join(path.dirname(path.dirname(source)), 'yuri.db')
            : path.join(path.dirname(source), 'nested', 'aux.sqlite');
          assert.equal(fs.existsSync(mutatedStagedDatabase), true);
          fs.appendFileSync(mutatedStagedDatabase, Buffer.from('between-family-clones'));
        }
      },
    });
    await assert.rejects(
      racing.restore({
        ownerApproved: true,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        expected,
        capacity,
      }),
      (error) => error?.code === 'DATABASE_SNAPSHOT_CONTENT_MISMATCH',
      'a later family changed after the first clone must invalidate the whole snapshot verdict',
    );
    assert.ok(cloneCount >= 2, 'the injected mutation occurs strictly between family clones');
    assert.match(mutatedStagedDatabase, /\/full-data-stage-[^/]+\/data\//u);
    assert.equal(fs.readFileSync(path.join(fx.target, 'old.txt'), 'utf8'), 'preserve-old');
    assert.equal(fs.existsSync(path.join(fx.target, 'payload.bin')), false, 'unverified staging is never promoted');
    assert.equal(fx.recovery.assertRecoveryStateAllowsWriter().ok, true);
  } finally {
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
  }
});

test('unknown promotion topology retains the native lease and active marker in fail-hold', {
  timeout: 45_000,
}, async () => {
  const fx = fixture();
  let ownerProcess = null;
  let postMortemLease = null;
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    const markerPath = path.join(fx.receiptRoot, 'backend-data-recovery.lock');
    const acquire = fx.adapters.acquireOperationLock;
    let nativeLeaseHeld = false;
    let releaseCalls = 0;
    let acquisitionCalls = 0;
    let swapCalls = 0;
    let oldTargetRenameHooks = 0;
    let markerBeforeFailure = null;
    let targetBeforePromotion = null;
    let dataTopologyAfterInjectedFault = null;
    let preservedPromotedTree = null;
    let preservedOldTargetTree = null;

    const stableIdentity = (candidate) => {
      const stat = fs.lstatSync(candidate, { bigint: true });
      return {
        device: stat.dev.toString(),
        inode: stat.ino.toString(),
        mode: Number(stat.mode),
        size: stat.size.toString(),
        mtimeNs: stat.mtimeNs.toString(),
        ctimeNs: stat.ctimeNs.toString(),
      };
    };
    const captureTopology = (root) => {
      const records = [];
      const visit = (candidate) => {
        const stat = fs.lstatSync(candidate, { bigint: true });
        const relative = path.relative(root, candidate) || '.';
        const record = {
          relative,
          device: stat.dev.toString(),
          inode: stat.ino.toString(),
          mode: Number(stat.mode),
          size: stat.size.toString(),
          type: stat.isDirectory() ? 'directory' : (stat.isFile() ? 'file' : 'other'),
        };
        if (stat.isFile()) {
          record.sha256 = crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
        }
        records.push(record);
        if (stat.isDirectory()) {
          for (const name of fs.readdirSync(candidate).sort()) visit(path.join(candidate, name));
        }
      };
      visit(root);
      return records;
    };

    const recovery = fx.recoveryWith({
      ...fx.adapters,
      async acquireOperationLock(options) {
        acquisitionCalls += 1;
        if (nativeLeaseHeld) {
          const error = new Error('fixture native lease remains held by the unknown-topology restore');
          error.code = 'OPERATION_LOCK_HELD';
          throw error;
        }
        const lease = await acquire(options);
        nativeLeaseHeld = true;
        return Object.freeze({
          ...lease,
          async release() {
            releaseCalls += 1;
            const evidence = await lease.release();
            nativeLeaseHeld = false;
            return evidence;
          },
        });
      },
      swapTrees(left, right) {
        swapCalls += 1;
        assert.equal(left, fx.target);
        assert.equal(fs.existsSync(markerPath), true, 'active marker must precede the promotion seam');
        markerBeforeFailure = {
          identity: stableIdentity(markerPath),
          bytes: fs.readFileSync(markerPath),
        };
        targetBeforePromotion = {
          identity: stableIdentity(left),
          oldPayload: fs.readFileSync(path.join(left, 'old.txt'), 'utf8'),
        };
        fx.adapters.swapTrees(left, right);
        preservedOldTargetTree = right;
        preservedPromotedTree = `${left}.unknown-promoted`;
        fs.renameSync(left, preservedPromotedTree);
        fs.mkdirSync(left, { mode: 0o700 });
        dataTopologyAfterInjectedFault = {
          backend: captureTopology(path.dirname(fx.target)),
          quarantine: captureTopology(fx.quarantineRoot),
        };
        throw new Error('fixture injected an unknown post-helper topology');
      },
      afterOldTargetRenamed() {
        oldTargetRenameHooks += 1;
      },
    });

    await assert.rejects(
      recovery.restore({
        ownerApproved: true,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        expected,
        capacity,
      }),
      (error) => error.code === 'RESTORE_TOPOLOGY_UNKNOWN_HELD'
        && error.details.activeMarker === markerPath
        && error.details.markerActive === true
        && error.details.markerIdentityVerified === true
        && error.details.releaseRequested === false
        && error.details.rollback.observedOutcome === 'unknown',
    );

    assert.equal(acquisitionCalls, 1);
    assert.equal(releaseCalls, 0, 'unknown topology must never release its native lease');
    assert.equal(nativeLeaseHeld, true);
    assert.equal(swapCalls, 1, 'no rollback swap may follow an unknown observation');
    assert.equal(oldTargetRenameHooks, 0, 'no archive/quarantine rename may follow an unknown observation');
    assert.deepEqual(stableIdentity(markerPath), markerBeforeFailure.identity);
    assert.deepEqual(fs.readFileSync(markerPath), markerBeforeFailure.bytes, 'active marker bytes stay unchanged');
    const preservedOldIdentity = stableIdentity(preservedOldTargetTree);
    assert.deepEqual(
      { device: preservedOldIdentity.device, inode: preservedOldIdentity.inode },
      { device: targetBeforePromotion.identity.device, inode: targetBeforePromotion.identity.inode },
      'the original target identity remains preserved at the exchanged staging path',
    );
    assert.equal(fs.readFileSync(path.join(preservedOldTargetTree, 'old.txt'), 'utf8'), targetBeforePromotion.oldPayload);
    assert.equal(fs.readFileSync(path.join(preservedPromotedTree, 'payload.bin'), 'utf8'), 'payload');
    assert.deepEqual(fs.readdirSync(fx.target), [], 'the unknown replacement target stays untouched');
    assert.deepEqual(
      {
        backend: captureTopology(path.dirname(fx.target)),
        quarantine: captureTopology(fx.quarantineRoot),
      },
      dataTopologyAfterInjectedFault,
      'no recovery mutation may follow the injected unknown topology',
    );

    const transactionNames = fs.readdirSync(fx.receiptRoot)
      .filter((name) => /^backend-data-transaction-[a-z0-9-]+\.json$/u.test(name));
    assert.equal(transactionNames.length, 1);
    const transaction = JSON.parse(fs.readFileSync(path.join(fx.receiptRoot, transactionNames[0]), 'utf8'));
    assert.equal(transaction.state, 'fail-hold');
    assert.equal(transaction.markerActive, true);
    assert.equal(transaction.activeMarker, markerPath);
    assert.equal(transaction.markerIdentityVerified, true);
    assert.equal(transaction.releaseRequested, false);
    assert.equal(transaction.rollback.observedOutcome, 'unknown');
    assert.equal(transaction.rollback.attempted, false);
    assert.equal(
      fs.readdirSync(fx.receiptRoot).some((name) => /^backend-data-(?:marker|final)-/u.test(name)
        || /^internal-restore-phase-a-/u.test(name)),
      false,
      'fail-hold must not archive the marker or emit final closure evidence',
    );

    assert.throws(
      () => recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_ACTIVE',
      'the active marker independently blocks writers',
    );
    await assert.rejects(
      recovery.restore({
        ownerApproved: true,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        expected,
        capacity,
      }),
      (error) => error.code === 'OPERATION_LOCK_HELD',
      'a fresh restore is blocked by the retained native lease',
    );
    assert.equal(acquisitionCalls, 2);
    assert.equal(releaseCalls, 0, 'blocked follow-up attempts cannot release the retained lease');
    assert.deepEqual(stableIdentity(markerPath), markerBeforeFailure.identity);
    assert.deepEqual(fs.readFileSync(markerPath), markerBeforeFailure.bytes);
    assert.deepEqual(
      {
        backend: captureTopology(path.dirname(fx.target)),
        quarantine: captureTopology(fx.quarantineRoot),
      },
      dataTopologyAfterInjectedFault,
    );

    // Part B: the in-process invariant above does not make the native mutex
    // immortal. A real owner first proves live contention, then exits when its
    // supervisor closes stdin. The kernel lock becomes acquirable again while
    // the durable marker remains the recovery/writer exclusion layer.
    if (process.platform !== 'darwin') return;
    const withDeadline = async (promise, timeoutMs, label) => {
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(label)), timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    const nativeLockPath = fx.recovery.paths.operationLockPath;
    bootstrapBackendOperationLockAnchor({ ownerApproved: true, lockPath: nativeLockPath });
    const ownerBinRoot = path.join(fx.root, 'owner-lock-bin');
    const ownerCode = [
      "import fs from 'node:fs';",
      `import { acquireBackendOperationLock } from ${JSON.stringify(OPERATION_LOCK_MODULE_URL)};`,
      'const lease = await acquireBackendOperationLock({',
      "  purpose: 'restore',",
      `  lockPath: ${JSON.stringify(nativeLockPath)},`,
      `  binRoot: ${JSON.stringify(ownerBinRoot)},`,
      '  timeoutMs: 5000,',
      '});',
      "fs.writeSync(1, `${JSON.stringify({ event: 'OWNER_READY', ownerPid: process.pid, helperPid: lease.pid, nonce: lease.nonce })}\\n`);",
      'process.stdin.resume();',
      "await new Promise((resolve, reject) => { process.stdin.once('end', resolve); process.stdin.once('error', reject); });",
      'process.exit(0);',
    ].join('\n');
    ownerProcess = spawn(process.execPath, ['--input-type=module', '-e', ownerCode], {
      cwd: fx.root,
      env: {
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        LANG: 'C',
        LC_ALL: 'C',
        TMPDIR: '/private/tmp',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let ownerStdout = '';
    let ownerStderr = '';
    let ownerReadySettled = false;
    const ownerReadyPromise = new Promise((resolve, reject) => {
      ownerProcess.stdout.on('data', (chunk) => {
        ownerStdout += chunk.toString('utf8');
        const newline = ownerStdout.indexOf('\n');
        if (ownerReadySettled || newline < 0) return;
        try {
          ownerReadySettled = true;
          resolve(JSON.parse(ownerStdout.slice(0, newline)));
        } catch (error) {
          ownerReadySettled = true;
          reject(error);
        }
      });
      ownerProcess.once('error', (error) => {
        if (!ownerReadySettled) {
          ownerReadySettled = true;
          reject(error);
        }
      });
      ownerProcess.once('exit', (code, signal) => {
        if (!ownerReadySettled) {
          ownerReadySettled = true;
          reject(new Error(`spawned lock owner exited before readiness: code=${code} signal=${signal}`));
        }
      });
    });
    ownerProcess.stderr.on('data', (chunk) => { ownerStderr += chunk.toString('utf8'); });
    const ownerExitPromise = once(ownerProcess, 'exit');
    const ownerReady = await withDeadline(
      ownerReadyPromise,
      15_000,
      'spawned lock owner did not attest readiness within the bounded deadline',
    );
    assert.equal(ownerReady.event, 'OWNER_READY');
    assert.equal(Number.isSafeInteger(ownerReady.ownerPid), true);
    assert.equal(Number.isSafeInteger(ownerReady.helperPid), true);
    assert.equal(ownerProcess.exitCode, null, 'OWNER_READY must describe a still-live lock owner');
    assert.equal(ownerProcess.signalCode, null);

    const supervisorHelper = compileFreshC({
      binRoot: path.join(fx.root, 'supervisor-lock-bin'),
      label: 'recovery-owner-exit-probe',
    });
    await assert.rejects(
      withDeadline(
        acquireBackendOperationLock({
          purpose: 'restore',
          lockPath: nativeLockPath,
          helper: supervisorHelper,
          timeoutMs: 1_000,
          acquireCloseTimeoutMs: 1_000,
        }),
        5_000,
        'same-path contention probe exceeded its bounded deadline',
      ),
      (error) => error.code === 'BACKEND_OPERATION_BUSY',
      'a third party must observe the live owner holding this exact kernel lock',
    );
    assert.equal(ownerProcess.exitCode, null, 'contention is proved while the owner remains alive');
    ownerProcess.stdin.end();
    const [ownerExitCode, ownerSignal] = await withDeadline(
      ownerExitPromise,
      10_000,
      'spawned lock owner did not exit after its supervisor closed stdin',
    );
    assert.equal(ownerExitCode, 0, ownerStderr);
    assert.equal(ownerSignal, null);
    const ownerLines = ownerStdout.trim().split('\n').filter(Boolean);
    assert.equal(ownerLines.length, 1, 'dead owner reports readiness only; no post-mortem release frame is expected');
    assert.doesNotMatch(ownerStdout, /RELEASED/u);

    const acquireAfterOwnerExit = async () => {
      const deadline = Date.now() + 10_000;
      let lastBusy = null;
      while (Date.now() < deadline) {
        try {
          return await acquireBackendOperationLock({
            purpose: 'restore',
            lockPath: nativeLockPath,
            helper: supervisorHelper,
            timeoutMs: 1_000,
            acquireCloseTimeoutMs: 1_000,
          });
        } catch (error) {
          if (error?.code !== 'BACKEND_OPERATION_BUSY') throw error;
          lastBusy = error;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      throw new Error(`kernel lock remained unavailable after owner exit: ${lastBusy?.message ?? 'timeout'}`);
    };
    postMortemLease = await withDeadline(
      acquireAfterOwnerExit(),
      12_000,
      'third-party lock-availability probe exceeded its bounded deadline',
    );
    assert.equal(postMortemLease.assertHeld().held, true);

    let freshLeaseDelivered = false;
    let freshReleaseCalls = 0;
    let postMortemCopyCalls = 0;
    let postMortemSwapCalls = 0;
    const postMortemRecovery = fx.recoveryWith({
      ...fx.adapters,
      async acquireOperationLock(options) {
        assert.equal(options.lockPath, nativeLockPath);
        assert.equal(freshLeaseDelivered, false, 'the fresh native lease is a single-use capability');
        freshLeaseDelivered = true;
        return Object.freeze({
          ...postMortemLease,
          async release() {
            freshReleaseCalls += 1;
            return postMortemLease.release();
          },
        });
      },
      copyTree(...args) {
        postMortemCopyCalls += 1;
        return fx.adapters.copyTree(...args);
      },
      swapTrees(...args) {
        postMortemSwapCalls += 1;
        return fx.adapters.swapTrees(...args);
      },
    });
    assert.throws(
      () => postMortemRecovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_ACTIVE',
      'the persistent marker blocks writers after the dead owner kernel lock is available',
    );
    await assert.rejects(
      postMortemRecovery.restore({
        ownerApproved: true,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        expected,
        capacity,
      }),
      (error) => error.code === 'RECOVERY_STATE_ACTIVE',
      'fresh restore acquires and then releases the kernel lease without reaching staging',
    );
    assert.equal(freshLeaseDelivered, true);
    assert.equal(freshReleaseCalls, 1, 'the fresh post-mortem lease is explicitly released');
    assert.equal(postMortemCopyCalls, 0);
    assert.equal(postMortemSwapCalls, 0);
    assert.throws(
      () => postMortemLease.assertHeld(),
      (error) => error.code === 'LOCK_NOT_OBSERVED_HELD',
    );
    assert.deepEqual(stableIdentity(markerPath), markerBeforeFailure.identity);
    assert.deepEqual(fs.readFileSync(markerPath), markerBeforeFailure.bytes);
    assert.deepEqual(
      {
        backend: captureTopology(path.dirname(fx.target)),
        quarantine: captureTopology(fx.quarantineRoot),
      },
      dataTopologyAfterInjectedFault,
    );
  } finally {
    if (ownerProcess?.exitCode === null && ownerProcess?.signalCode === null) ownerProcess.kill('SIGKILL');
    if (postMortemLease) {
      try {
        postMortemLease.assertHeld();
        await postMortemLease.release();
      } catch {}
    }
    if (process.platform === 'darwin') {
      spawnSync('/usr/bin/chflags', ['-R', 'nouchg', fx.root], { encoding: 'utf8' });
      spawnSync('/bin/chmod', ['-R', 'u+w', fx.root], { encoding: 'utf8' });
    }
    await fs.promises.rm(fx.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('unknown topology with a marker identity contradiction preserves the incomplete transaction', async () => {
  const fx = fixture();
  try {
    const { expected, capacity, inspected } = await inspectFixture(fx);
    const markerPath = path.join(fx.receiptRoot, 'backend-data-recovery.lock');
    const movedMarkerPath = `${markerPath}.contradiction`;
    const acquire = fx.adapters.acquireOperationLock;
    let leaseHeld = false;
    let releaseCalls = 0;
    let swapCalls = 0;
    let markerIdentityBefore = null;
    let markerBytesBefore = null;
    let transactionPath = null;
    let transactionBytesBefore = null;
    let preservedPromotedTree = null;
    let preservedOldTargetTree = null;

    const recovery = fx.recoveryWith({
      ...fx.adapters,
      async acquireOperationLock(options) {
        const lease = await acquire(options);
        leaseHeld = true;
        return Object.freeze({
          ...lease,
          async release() {
            releaseCalls += 1;
            const evidence = await lease.release();
            leaseHeld = false;
            return evidence;
          },
        });
      },
      swapTrees(left, right) {
        swapCalls += 1;
        fx.adapters.swapTrees(left, right);
        preservedOldTargetTree = right;
        preservedPromotedTree = `${left}.unknown-promoted`;
        fs.renameSync(left, preservedPromotedTree);
        fs.mkdirSync(left, { mode: 0o700 });

        const transactionNames = fs.readdirSync(fx.receiptRoot)
          .filter((name) => /^backend-data-transaction-[a-z0-9-]+\.json$/u.test(name));
        assert.equal(transactionNames.length, 1);
        transactionPath = path.join(fx.receiptRoot, transactionNames[0]);
        transactionBytesBefore = fs.readFileSync(transactionPath);
        const markerStat = fs.lstatSync(markerPath, { bigint: true });
        markerIdentityBefore = {
          device: markerStat.dev.toString(),
          inode: markerStat.ino.toString(),
        };
        markerBytesBefore = fs.readFileSync(markerPath);
        fs.renameSync(markerPath, movedMarkerPath);
        throw new Error('fixture injected unknown topology plus marker-path contradiction');
      },
    });

    await assert.rejects(
      recovery.restore({
        ownerApproved: true,
        manifestPath: inspected.manifestPath,
        manifestSha256: inspected.manifestSha256,
        expected,
        capacity,
      }),
      (error) => error.code === 'RESTORE_TOPOLOGY_UNKNOWN_HELD'
        && error.details.markerIdentityVerified === false
        && error.details.markerActive === null
        && error.details.activeMarker === null
        && error.details.incompleteTransaction === transactionPath
        && error.details.markerObservationError.expectedPath === markerPath
        && error.details.releaseRequested === false,
    );

    assert.equal(swapCalls, 1);
    assert.equal(releaseCalls, 0, 'marker contradiction must preserve the owning native lease');
    assert.equal(leaseHeld, true);
    assert.equal(fs.existsSync(markerPath), false);
    const movedMarkerStat = fs.lstatSync(movedMarkerPath, { bigint: true });
    assert.deepEqual(
      { device: movedMarkerStat.dev.toString(), inode: movedMarkerStat.ino.toString() },
      markerIdentityBefore,
      'the contradictory marker remains preserved at its sibling identity',
    );
    assert.deepEqual(fs.readFileSync(movedMarkerPath), markerBytesBefore);
    assert.deepEqual(
      fs.readFileSync(transactionPath),
      transactionBytesBefore,
      'unverified marker evidence must not rewrite the last durable transaction state',
    );
    const transaction = JSON.parse(transactionBytesBefore.toString('utf8'));
    assert.equal(transaction.state, 'prepared');
    assert.equal(fs.readFileSync(path.join(preservedOldTargetTree, 'old.txt'), 'utf8'), 'preserve-old');
    assert.equal(fs.readFileSync(path.join(preservedPromotedTree, 'payload.bin'), 'utf8'), 'payload');
    assert.deepEqual(fs.readdirSync(fx.target), []);
    assert.throws(
      () => recovery.assertRecoveryStateAllowsWriter(),
      (error) => error.code === 'RECOVERY_STATE_INCOMPLETE',
      'the unchanged non-final transaction remains the persistent writer barrier',
    );
  } finally {
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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
    removeFixtureRoot(fx.root);
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

test('production source path rejects hardlinks in enumerateTree and copyTree (recovery-grade)', async () => {
  // PRODUCTION-path negatives. Cross-device real mount remains environment-HOLD.
  // copyTree now consumes swap.c copy-tree (descriptor-relative) — not pathname ditto.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-backend-prod-isolation-')));
  try {
    const outside = path.join(root, 'outside-eph');
    const tree = path.join(root, 'source-tree');
    fs.mkdirSync(outside);
    fs.mkdirSync(tree);
    const outsideFile = path.join(outside, 'shared.db');
    const insideLink = path.join(tree, 'alias.db');
    fs.writeFileSync(outsideFile, Buffer.from('prod-hardlink-escape'));
    fs.linkSync(outsideFile, insideLink);
    assert.equal(fs.lstatSync(insideLink).nlink, 2);

    await assert.rejects(
      enumerateTree(tree),
      (error) => error.code === 'SOURCE_HARDLINK_REFUSED' && error.details?.relative === 'alias.db',
      'enumerateTree must refuse outside-reachable hardlink',
    );

    const dest = path.join(root, 'copy-dest');
    const adapters = createSystemAdapters();
    assert.throws(
      () => adapters.copyTree(tree, dest),
      (error) => error.code === 'COPY_TREE_HELPER_FAILED'
        && /hardlink rejected/iu.test(error.details?.commandDetails?.stderr || ''),
      'copyTree must refuse hardlink via descriptor-relative copy-tree',
    );
    assert.equal(fs.existsSync(dest), false, 'failed copyTree must not create destination');

    const twinTree = path.join(root, 'twin-tree');
    fs.mkdirSync(twinTree);
    const a = path.join(twinTree, 'a.db');
    const b = path.join(twinTree, 'b.db');
    fs.writeFileSync(a, Buffer.from('twins'));
    fs.linkSync(a, b);
    await assert.rejects(enumerateTree(twinTree), (error) => error.code === 'SOURCE_HARDLINK_REFUSED');
    assert.throws(
      () => adapters.copyTree(twinTree, path.join(root, 'twin-dest')),
      (error) => error.code === 'COPY_TREE_HELPER_FAILED'
        && /hardlink rejected/iu.test(error.details?.commandDetails?.stderr || ''),
    );

    const deviceTree = path.join(root, 'device-tree');
    fs.mkdirSync(deviceTree);
    const foreign = path.join(deviceTree, 'foreign.db');
    fs.writeFileSync(foreign, Buffer.from('same-fs-bytes'));
    const realLstat = fs.lstatSync;
    const rootDev = realLstat(deviceTree).dev;
    fs.lstatSync = (target, options) => {
      const stat = realLstat(target, options);
      if (path.resolve(String(target)) === path.resolve(foreign)) {
        return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
          dev: rootDev + 1,
        });
      }
      return stat;
    };
    try {
      await assert.rejects(
        enumerateTree(deviceTree),
        (error) => error.code === 'SOURCE_DEVICE_MISMATCH' && error.details?.relative === 'foreign.db',
      );
    } finally {
      fs.lstatSync = realLstat;
    }

    const tmpfsProbe = path.join(root, 'tmpfs-probe');
    fs.mkdirSync(tmpfsProbe);
    const tmpfsMount = spawnSync('/sbin/mount_tmpfs', ['-s', '8m', tmpfsProbe], { encoding: 'utf8' });
    assert.notEqual(tmpfsMount.status, 0);
    assert.match(tmpfsMount.stderr || '', /Operation not permitted|not permitted/iu);

    const moduleSource = fs.readFileSync(new URL('./backend-data-recovery.mjs', import.meta.url), 'utf8');
    assert.match(moduleSource, /stat\.nlink !== 1n/u);
    assert.match(moduleSource, /SOURCE_HARDLINK_REFUSED/u);
    assert.match(moduleSource, /'copy-tree'/u);
    assert.match(moduleSource, /pathname ditto fallback is forbidden/u);
    assert.doesNotMatch(moduleSource, /command\(\s*'\/usr\/bin\/ditto'/u, 'copyTree must not invoke pathname ditto');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copyTree rejects symlink and special-file sources via descriptor-relative helper', {
  skip: process.platform !== 'darwin',
}, () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-backend-copytree-reject-')));
  try {
    const adapters = createSystemAdapters();

    const symlinkTree = path.join(root, 'symlink-tree');
    fs.mkdirSync(symlinkTree);
    fs.writeFileSync(path.join(root, 'outside.txt'), 'outside');
    fs.symlinkSync(path.join(root, 'outside.txt'), path.join(symlinkTree, 'link'));
    const symlinkDest = path.join(root, 'symlink-dest');
    assert.throws(
      () => adapters.copyTree(symlinkTree, symlinkDest),
      (error) => error.code === 'COPY_TREE_HELPER_FAILED'
        && /symlink rejected/iu.test(error.details?.commandDetails?.stderr || ''),
    );
    assert.equal(fs.existsSync(symlinkDest), false);

    const specialTree = path.join(root, 'special-tree');
    fs.mkdirSync(specialTree);
    const fifo = path.join(specialTree, 'pipe');
    const made = spawnSync('/usr/bin/mkfifo', [fifo], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr || made.stdout);
    const specialDest = path.join(root, 'special-dest');
    assert.throws(
      () => adapters.copyTree(specialTree, specialDest),
      (error) => error.code === 'COPY_TREE_HELPER_FAILED'
        && /special file rejected/iu.test(error.details?.commandDetails?.stderr || ''),
    );
    assert.equal(fs.existsSync(specialDest), false);

    const cleanTree = path.join(root, 'clean-tree');
    const cleanDest = path.join(root, 'clean-dest');
    fs.mkdirSync(cleanTree);
    fs.writeFileSync(path.join(cleanTree, 'ok.db'), Buffer.from('ok'));
    adapters.copyTree(cleanTree, cleanDest);
    assert.equal(fs.readFileSync(path.join(cleanDest, 'ok.db'), 'utf8'), 'ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-tree swap-at-boundary: post-pin symlink swap fails closed (descriptor-relative)', {
  skip: process.platform !== 'darwin',
}, () => {
  // Atlas acceptance: after identity pins are observed, swap a validated file to a
  // symlink BEFORE the copy runs; fd-based copy-tree must fail closed (not follow swap).
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-swap-boundary-')));
  try {
    const src = path.join(root, 'src');
    const destParent = path.join(root, 'dest-parent');
    fs.mkdirSync(src);
    fs.mkdirSync(destParent);
    const leaf = path.join(src, 'leaf.db');
    fs.writeFileSync(leaf, Buffer.from('original-pinned-bytes'));
    const outside = path.join(root, 'outside.db');
    fs.writeFileSync(outside, Buffer.from('swapped-target-bytes'));

    const srcStat = fs.lstatSync(src, { bigint: true });
    const parentStat = fs.lstatSync(destParent, { bigint: true });
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    // Boundary swap AFTER pin observation, BEFORE copy-tree invoke.
    fs.unlinkSync(leaf);
    fs.symlinkSync(outside, leaf);

    const dest = path.join(destParent, 'out');
    const ran = spawnSync(binary, [
      'copy-tree',
      src,
      dest,
      srcStat.dev.toString(),
      srcStat.ino.toString(),
      parentStat.dev.toString(),
      parentStat.ino.toString(),
    ], { encoding: 'utf8' });
    assert.notEqual(ran.status, 0, 'copy-tree must fail closed after symlink swap');
    assert.match(ran.stderr || '', /symlink rejected/iu);
    // Helper may leave an empty mkdirat root for forensics; must NOT contain swapped content.
    assert.equal(fs.existsSync(path.join(dest, 'leaf.db')), false, 'must not copy through swapped symlink');
    if (fs.existsSync(dest)) {
      const names = fs.readdirSync(dest);
      assert.deepEqual(names, [], 'partial destination must not contain copied entries');
    }
    assert.equal(fs.lstatSync(leaf).isSymbolicLink(), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-tree same-class regular-file swap after PIN copies original inode bytes', {
  skip: process.platform !== 'darwin',
}, async () => {
  // Atlas SHARPER GAP: pre/post walks without per-entry baseline miss I1->I2 same-class swap.
  // Two-phase pin+emit: swap foo (I1) -> different same-device single-link regular (I2) BETWEEN
  // PIN and EMIT. Held fd must emit I1 bytes (or fail-closed) — never promote I2.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-same-class-')));
  try {
    const src = path.join(root, 'src');
    const destParent = path.join(root, 'dest-parent');
    fs.mkdirSync(src);
    fs.mkdirSync(destParent);
    const foo = path.join(src, 'foo.db');
    const i1Bytes = Buffer.from('I1-ORIGINAL-PINNED-BYTES');
    const i2Bytes = Buffer.from('I2-SWAPPED-BYTES-DIFFERENT');
    fs.writeFileSync(foo, i1Bytes);
    const i1 = fs.lstatSync(foo, { bigint: true });
    assert.equal(i1.nlink, 1n);
    const i2Path = path.join(root, 'i2-donor.db');
    fs.writeFileSync(i2Path, i2Bytes);
    const i2 = fs.lstatSync(i2Path, { bigint: true });
    assert.equal(i2.nlink, 1n);
    assert.equal(i1.dev, i2.dev, 'same-device required');
    assert.notEqual(i1.ino, i2.ino, 'distinct inodes required');

    const barrier = path.join(root, 'PIN_BARRIER');
    const ready = path.join(root, 'PIN_READY');
    fs.writeFileSync(barrier, 'hold');

    const srcStat = fs.lstatSync(src, { bigint: true });
    const parentStat = fs.lstatSync(destParent, { bigint: true });
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    const dest = path.join(destParent, 'out');
    const child = spawn(binary, [
      'copy-tree',
      src,
      dest,
      srcStat.dev.toString(),
      srcStat.ino.toString(),
      parentStat.dev.toString(),
      parentStat.ino.toString(),
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        YURI_COPY_TREE_PIN_BARRIER: barrier,
        YURI_COPY_TREE_PIN_READY: ready,
      },
    });

    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(ready) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(fs.existsSync(ready), 'PIN_READY must appear after pin phase');

    // Same-class swap at PIN/EMIT boundary: pathname foo now names I2.
    fs.unlinkSync(foo);
    fs.renameSync(i2Path, foo);
    const swapped = fs.lstatSync(foo, { bigint: true });
    assert.equal(swapped.ino, i2.ino);
    assert.equal(fs.readFileSync(foo).equals(i2Bytes), true);

    fs.unlinkSync(barrier);
    const [code, stdout, stderr] = await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (status) => resolve([status, out, err]));
    });
    assert.equal(code, 0, `copy-tree must succeed via held I1 fd; stderr=${stderr} stdout=${stdout}`);
    const copied = fs.readFileSync(path.join(dest, 'foo.db'));
    assert.equal(copied.equals(i1Bytes), true, 'must copy pinned I1 bytes, not swapped I2');
    assert.equal(copied.equals(i2Bytes), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-tree preserves file and directory metadata (xattr/mode/mtime parity)', {
  skip: process.platform !== 'darwin',
}, () => {
  // Atlas metadata contract: mkdirat alone would regress dir xattrs/ACLs vs ditto.
  // fcopyfile(COPYFILE_METADATA) on dir fds + fclonefileat for files must preserve parity.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-meta-')));
  try {
    const src = path.join(root, 'src');
    const destParent = path.join(root, 'dest-parent');
    const nested = path.join(src, 'nested');
    fs.mkdirSync(src);
    fs.mkdirSync(nested);
    fs.mkdirSync(destParent);
    const leaf = path.join(nested, 'leaf.db');
    fs.writeFileSync(leaf, Buffer.from('meta-payload'));
    fs.chmodSync(src, 0o750);
    fs.chmodSync(nested, 0o700);
    fs.chmodSync(leaf, 0o640);

    const xattrSet = spawnSync('/usr/bin/xattr', ['-w', 'com.yuri.copytree.test', 'dir-root-xattr', src], {
      encoding: 'utf8',
    });
    assert.equal(xattrSet.status, 0, xattrSet.stderr || xattrSet.stdout);
    const xattrNested = spawnSync('/usr/bin/xattr', ['-w', 'com.yuri.copytree.test', 'dir-nested-xattr', nested], {
      encoding: 'utf8',
    });
    assert.equal(xattrNested.status, 0, xattrNested.stderr || xattrNested.stdout);
    const xattrFile = spawnSync('/usr/bin/xattr', ['-w', 'com.yuri.copytree.test', 'file-xattr', leaf], {
      encoding: 'utf8',
    });
    assert.equal(xattrFile.status, 0, xattrFile.stderr || xattrFile.stdout);

    const past = new Date('2020-01-15T12:00:00Z');
    fs.utimesSync(src, past, past);
    fs.utimesSync(nested, past, past);
    fs.utimesSync(leaf, past, past);

    const srcStat = fs.lstatSync(src, { bigint: true });
    const parentStat = fs.lstatSync(destParent, { bigint: true });
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    const dest = path.join(destParent, 'out');
    const ran = spawnSync(binary, [
      'copy-tree',
      src,
      dest,
      srcStat.dev.toString(),
      srcStat.ino.toString(),
      parentStat.dev.toString(),
      parentStat.ino.toString(),
    ], { encoding: 'utf8' });
    assert.equal(ran.status, 0, ran.stderr || ran.stdout);

    const readXattr = (target) => {
      const got = spawnSync('/usr/bin/xattr', ['-p', 'com.yuri.copytree.test', target], { encoding: 'utf8' });
      assert.equal(got.status, 0, got.stderr || got.stdout);
      return (got.stdout || '').trim();
    };

    assert.equal(readXattr(dest), 'dir-root-xattr');
    assert.equal(readXattr(path.join(dest, 'nested')), 'dir-nested-xattr');
    assert.equal(readXattr(path.join(dest, 'nested', 'leaf.db')), 'file-xattr');

    assert.equal(fs.lstatSync(dest).mode & 0o777, 0o750);
    assert.equal(fs.lstatSync(path.join(dest, 'nested')).mode & 0o777, 0o700);
    assert.equal(fs.lstatSync(path.join(dest, 'nested', 'leaf.db')).mode & 0o777, 0o640);

    const destMtime = fs.lstatSync(dest).mtimeMs;
    const nestedMtime = fs.lstatSync(path.join(dest, 'nested')).mtimeMs;
    const leafMtime = fs.lstatSync(path.join(dest, 'nested', 'leaf.db')).mtimeMs;
    assert.ok(Math.abs(destMtime - past.getTime()) < 2000, `root mtime parity got=${destMtime}`);
    assert.ok(Math.abs(nestedMtime - past.getTime()) < 2000, `nested mtime parity got=${nestedMtime}`);
    assert.ok(Math.abs(leafMtime - past.getTime()) < 2000, `file mtime parity got=${leafMtime}`);
    assert.equal(fs.readFileSync(path.join(dest, 'nested', 'leaf.db'), 'utf8'), 'meta-payload');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-tree content-mutation on pinned inode fails closed', {
  skip: process.platform !== 'darwin',
}, async () => {
  // Apollo/Draco gap: holding an fd pins the inode, not a byte snapshot unless we hash.
  // Mutate foo's bytes via pathname AFTER PIN; EMIT must fail closed (not promote mutated bytes).
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-content-mut-')));
  try {
    const src = path.join(root, 'src');
    const destParent = path.join(root, 'dest-parent');
    fs.mkdirSync(src);
    fs.mkdirSync(destParent);
    const foo = path.join(src, 'foo.db');
    const original = Buffer.from('PINNED-ORIGINAL-BYTES');
    const mutated = Buffer.from('MUTATED-AFTER-PIN-XX');
    fs.writeFileSync(foo, original);
    const i1 = fs.lstatSync(foo, { bigint: true });

    const barrier = path.join(root, 'PIN_BARRIER');
    const ready = path.join(root, 'PIN_READY');
    fs.writeFileSync(barrier, 'hold');

    const srcStat = fs.lstatSync(src, { bigint: true });
    const parentStat = fs.lstatSync(destParent, { bigint: true });
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    const dest = path.join(destParent, 'out');
    const child = spawn(binary, [
      'copy-tree',
      src,
      dest,
      srcStat.dev.toString(),
      srcStat.ino.toString(),
      parentStat.dev.toString(),
      parentStat.ino.toString(),
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        YURI_COPY_TREE_PIN_BARRIER: barrier,
        YURI_COPY_TREE_PIN_READY: ready,
      },
    });

    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(ready) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(fs.existsSync(ready), 'PIN_READY must appear after pin phase');

    // Same inode, mutated bytes (pathname write through to pinned inode).
    fs.writeFileSync(foo, mutated);
    const after = fs.lstatSync(foo, { bigint: true });
    assert.equal(after.ino, i1.ino, 'mutation must keep same inode');
    assert.equal(fs.readFileSync(foo).equals(mutated), true);

    fs.unlinkSync(barrier);
    const [code, stdout, stderr] = await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (status) => resolve([status, out, err]));
    });
    assert.notEqual(code, 0, `must fail closed on content mutation; stdout=${stdout}`);
    assert.match(stderr || '', /content mutated/iu);
    assert.equal(fs.existsSync(path.join(dest, 'foo.db')), false, 'must not emit mutated bytes');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-tree append-growth during EMIT hash fails closed (bounded hash liveness)', {
  skip: process.platform !== 'darwin',
}, async () => {
  // Apollo REQUIRE-FIX (Atlas continuous-append residual): unbounded EOF-read in
  // hash_fd_sha256 could hang under concurrent append. Fix reads at most pinned
  // st_size then probes one more byte — growth fail-closes; loop stays bounded.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-hash-grow-')));
  try {
    const src = path.join(root, 'src');
    const destParent = path.join(root, 'dest-parent');
    fs.mkdirSync(src);
    fs.mkdirSync(destParent);
    const foo = path.join(src, 'foo.db');
    const original = Buffer.from('HASH-GROW-BASELINE');
    fs.writeFileSync(foo, original);
    const i1 = fs.lstatSync(foo, { bigint: true });

    const barrier = path.join(root, 'HASH_BARRIER');
    const ready = path.join(root, 'HASH_READY');
    fs.writeFileSync(barrier, 'hold');

    const srcStat = fs.lstatSync(src, { bigint: true });
    const parentStat = fs.lstatSync(destParent, { bigint: true });
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    const dest = path.join(destParent, 'out');
    const child = spawn(binary, [
      'copy-tree',
      src,
      dest,
      srcStat.dev.toString(),
      srcStat.ino.toString(),
      parentStat.dev.toString(),
      parentStat.ino.toString(),
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        YURI_COPY_TREE_HASH_BARRIER: barrier,
        YURI_COPY_TREE_HASH_READY: ready,
      },
    });

    const deadline = Date.now() + 15_000;
    while (!fs.existsSync(ready) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(fs.existsSync(ready), 'HASH_READY must appear after bounded EMIT read, before growth probe');

    // Append on same inode while helper holds the growth-probe window open.
    fs.appendFileSync(foo, Buffer.from('+GROW'));
    assert.equal(fs.lstatSync(foo, { bigint: true }).ino, i1.ino);
    assert.ok(fs.lstatSync(foo).size > original.length);

    fs.unlinkSync(barrier);
    const [code, stdout, stderr] = await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (status) => resolve([status, out, err]));
    });
    assert.notEqual(code, 0, `must fail closed on append-growth; stdout=${stdout}`);
    assert.match(stderr || '', /content mutated \(grew during hash\)|content mutated/iu);
    assert.equal(fs.existsSync(path.join(dest, 'foo.db')), false, 'must not emit grown content');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-tree preserves ACL on files and directories', {
  skip: process.platform !== 'darwin',
}, () => {
  // Atlas residual: exact ACL parity (not presence-only /allow/).
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-acl-')));
  try {
    const src = path.join(root, 'src');
    const nested = path.join(src, 'nested');
    const destParent = path.join(root, 'dest-parent');
    fs.mkdirSync(src);
    fs.mkdirSync(nested);
    fs.mkdirSync(destParent);
    const leaf = path.join(nested, 'leaf.db');
    fs.writeFileSync(leaf, Buffer.from('acl-payload'));

    const addAcl = (target, entry) => {
      const ran = spawnSync('/bin/chmod', ['+a', entry, target], { encoding: 'utf8' });
      assert.equal(ran.status, 0, `chmod +a ${target}: ${ran.stderr || ran.stdout}`);
    };
    const user = process.env.USER || 'marcelspatz';
    addAcl(src, `${user} allow read,write,execute`);
    addAcl(nested, `${user} allow read,execute`);
    addAcl(leaf, `${user} allow read,write`);

    const readAcl = (target, { dir = false } = {}) => {
      const args = dir ? ['-l', '-e', '-d', target] : ['-l', '-e', target];
      const ran = spawnSync('/bin/ls', args, { encoding: 'utf8' });
      assert.equal(ran.status, 0, ran.stderr || ran.stdout);
      return ran.stdout || '';
    };
    const aclEntries = (text) => text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+:/.test(line))
      .sort();

    const srcAcl = readAcl(src, { dir: true });
    const nestedAcl = readAcl(nested, { dir: true });
    const leafAcl = readAcl(leaf);
    assert.ok(aclEntries(srcAcl).length > 0, 'source root must have ACL entries');
    assert.ok(aclEntries(nestedAcl).length > 0, 'source nested must have ACL entries');
    assert.ok(aclEntries(leafAcl).length > 0, 'source leaf must have ACL entries');
    assert.notDeepEqual(aclEntries(srcAcl), aclEntries(nestedAcl));
    assert.notDeepEqual(aclEntries(nestedAcl), aclEntries(leafAcl));
    assert.notDeepEqual(aclEntries(srcAcl), aclEntries(leafAcl));

    const srcStat = fs.lstatSync(src, { bigint: true });
    const parentStat = fs.lstatSync(destParent, { bigint: true });
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    const dest = path.join(destParent, 'out');
    const ran = spawnSync(binary, [
      'copy-tree',
      src,
      dest,
      srcStat.dev.toString(),
      srcStat.ino.toString(),
      parentStat.dev.toString(),
      parentStat.ino.toString(),
    ], { encoding: 'utf8' });
    assert.equal(ran.status, 0, ran.stderr || ran.stdout);

    const destAcl = readAcl(dest, { dir: true });
    const destNestedAcl = readAcl(path.join(dest, 'nested'), { dir: true });
    const destLeafAcl = readAcl(path.join(dest, 'nested', 'leaf.db'));
    assert.deepEqual(aclEntries(destAcl), aclEntries(srcAcl), 'root dir ACL exact parity');
    assert.deepEqual(aclEntries(destNestedAcl), aclEntries(nestedAcl), 'nested dir ACL exact parity');
    assert.deepEqual(aclEntries(destLeafAcl), aclEntries(leafAcl), 'file ACL exact parity');
    assert.equal(fs.readFileSync(path.join(dest, 'nested', 'leaf.db'), 'utf8'), 'acl-payload');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-tree in-window mutation (post-hash pre-clone) detect-and-fail-closed + staging discard', {
  skip: process.platform !== 'darwin',
}, async () => {
  // Atlas residual: mutation between EMIT hash and fclonefileat is DETECT-AND-FAIL-CLOSED
  // (dest digest/size mismatch), not prevented. Helper unlinkat discards the bad clone
  // entry; copyTreeSystem removeCopyTreeDestinationBestEffort discards the staging tree.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-inwindow-')));
  try {
    const src = path.join(root, 'src');
    const destParent = path.join(root, 'dest-parent');
    fs.mkdirSync(src);
    fs.mkdirSync(destParent);
    const foo = path.join(src, 'foo.db');
    const original = Buffer.from('INWINDOW-ORIGINAL-BYTES');
    const mutated = Buffer.from('INWINDOW-MUTATED-BYTES!');
    fs.writeFileSync(foo, original);
    const i1 = fs.lstatSync(foo, { bigint: true });

    const barrier = path.join(root, 'PRE_CLONE_BARRIER');
    const ready = path.join(root, 'PRE_CLONE_READY');
    fs.writeFileSync(barrier, 'hold');

    const srcStat = fs.lstatSync(src, { bigint: true });
    const parentStat = fs.lstatSync(destParent, { bigint: true });
    const binary = path.join(root, 'backend-data-swap');
    const compiled = spawnSync('/usr/bin/clang', [
      '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', SWAP_HELPER_SOURCE_PATH, '-o', binary,
    ], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    const dest = path.join(destParent, 'out');
    const child = spawn(binary, [
      'copy-tree',
      src,
      dest,
      srcStat.dev.toString(),
      srcStat.ino.toString(),
      parentStat.dev.toString(),
      parentStat.ino.toString(),
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        YURI_COPY_TREE_PRE_CLONE_BARRIER: barrier,
        YURI_COPY_TREE_PRE_CLONE_READY: ready,
      },
    });

    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(ready) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(fs.existsSync(ready), 'PRE_CLONE_READY must appear after emit hash');

    fs.writeFileSync(foo, mutated);
    assert.equal(fs.lstatSync(foo, { bigint: true }).ino, i1.ino);
    fs.unlinkSync(barrier);

    const [code, stdout, stderr] = await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (status) => resolve([status, out, err]));
    });
    assert.notEqual(code, 0, `helper must fail-closed; stdout=${stdout}`);
    assert.match(
      stderr || '',
      /destination content mismatch|destination identity mismatch/iu,
    );
    assert.equal(fs.existsSync(path.join(dest, 'foo.db')), false, 'bad clone entry must be unlinkat-discarded');

    // Production caller path: copyTreeSystem discards staging tree on helper failure.
    // Prove via a second failing copyTree into a fresh dest (symlink reject) that dest is removed.
    const badSrc = path.join(root, 'bad-src');
    const badDest = path.join(destParent, 'bad-out');
    fs.mkdirSync(badSrc);
    fs.symlinkSync(foo, path.join(badSrc, 'link'));
    const adapters = createSystemAdapters();
    assert.throws(
      () => adapters.copyTree(badSrc, badDest),
      (error) => error.code === 'COPY_TREE_HELPER_FAILED',
    );
    assert.equal(fs.existsSync(badDest), false, 'copyTreeSystem must discard staging on helper failure');
    assert.match(
      fs.readFileSync(new URL('./backend-data-recovery.mjs', import.meta.url), 'utf8'),
      /removeCopyTreeDestinationBestEffort/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copyTreeSystem production path: in-window PRE_CLONE mutation discards staging dest', {
  skip: process.platform !== 'darwin',
}, () => {
  // Draco R3 HOLD gap: helper-level in-window + symlink-reject discard were proven
  // separately; production adapters.copyTree + YURI_COPY_TREE_PRE_CLONE_* together
  // (dest created, then discarded after in-window mutation) was untested.
  //
  // copyTreeSystem uses spawnSync, so the mutator MUST be a separate OS process —
  // same-process async coordination deadlocks the event loop behind the barrier.
  //
  // Atlas V3c T3: mutated bytes MUST be same-length as original. Different length
  // trips swap.c st_size check (stderr: destination identity mismatch) BEFORE the
  // digest check (destination content mismatch) — proving only size-mismatch cleanup,
  // not the harder same-length content-mutation path.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join('/private/tmp', 'yuri-copytree-prod-inwindow-')));
  const prevBarrier = process.env.YURI_COPY_TREE_PRE_CLONE_BARRIER;
  const prevReady = process.env.YURI_COPY_TREE_PRE_CLONE_READY;
  let mutator = null;
  let watchdog = null;
  try {
    const src = path.join(root, 'src');
    const destParent = path.join(root, 'dest-parent');
    fs.mkdirSync(src);
    fs.mkdirSync(destParent);
    const foo = path.join(src, 'foo.db');
    const original = Buffer.from('PROD-INWINDOW-ORIGINAL');
    const mutated = Buffer.from('PROD-INWINDOW-MUTATED!'); // 22B == original.length
    assert.equal(original.length, mutated.length, 'same-length mutation required to hit digest path');
    assert.notEqual(original.equals(mutated), true);
    fs.writeFileSync(foo, original);

    const barrier = path.join(root, 'PRE_CLONE_BARRIER');
    const ready = path.join(root, 'PRE_CLONE_READY');
    const sawDest = path.join(root, 'SAW_DEST_AT_READY');
    const mutatorDone = path.join(root, 'MUTATOR_DONE');
    fs.writeFileSync(barrier, 'hold');
    process.env.YURI_COPY_TREE_PRE_CLONE_BARRIER = barrier;
    process.env.YURI_COPY_TREE_PRE_CLONE_READY = ready;

    const dest = path.join(destParent, 'out');
    // Atlas V3e liveness: NEVER process.exit() inside try — it skips finally.
    // Pattern: IIFE + exitCode/return so finally ALWAYS releaseBarrier.
    // Atlas (4): parent copy-deadline watchdog bounds spawnSync (else 12h on leak).
    mutator = spawn(process.execPath, ['-e', `
const fs = require('fs');
const ready = ${JSON.stringify(ready)};
const barrier = ${JSON.stringify(barrier)};
const dest = ${JSON.stringify(dest)};
const foo = ${JSON.stringify(foo)};
const sawDest = ${JSON.stringify(sawDest)};
const mutatorDone = ${JSON.stringify(mutatorDone)};
const mutated = Buffer.from('PROD-INWINDOW-MUTATED!');
function releaseBarrier() {
  try { if (fs.existsSync(barrier)) fs.unlinkSync(barrier); } catch { /* ENOENT-tolerant */ }
}
(function main() {
  let status = 'error';
  try {
    const deadline = Date.now() + 60_000;
    while (!fs.existsSync(ready) && Date.now() < deadline) {
      const end = Date.now() + 10;
      while (Date.now() < end) { /* spin */ }
    }
    if (!fs.existsSync(ready)) {
      status = 'ready-timeout';
      process.exitCode = 2;
      return; // exits THROUGH finally — never process.exit()
    }
    if (fs.existsSync(dest)) fs.writeFileSync(sawDest, 'yes');
    fs.writeFileSync(foo, mutated);
    status = 'ok';
  } catch (err) {
    status = 'error:' + (err && err.message ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    releaseBarrier();
    try { fs.writeFileSync(mutatorDone, status); } catch { /* ignore */ }
  }
})();
`], { stdio: 'ignore', detached: false });
    mutator.unref();

    // Deterministic no-hang (Atlas §4): if barrier leaks, fail in seconds not ~12h.
    // 15s: unlink barrier (helper barrier-wait resumes). Helper-SIGKILL not required —
    // Atlas/Athena: barrier-wait is the helper's only indefinite path closed by release;
    // continuous-append hang is closed by bounded hash_fd_sha256 (V3g).
    const copyDeadlineMs = 15_000;
    watchdog = spawn(process.execPath, ['-e', `
const fs = require('fs');
const barrier = ${JSON.stringify(barrier)};
const mutatorDone = ${JSON.stringify(mutatorDone)};
const copyDeadlineMs = ${copyDeadlineMs};
const start = Date.now();
while (Date.now() - start < copyDeadlineMs) {
  if (fs.existsSync(mutatorDone)) {
    // Happy path: mutator finished; still ensure barrier is gone.
    try { if (fs.existsSync(barrier)) fs.unlinkSync(barrier); } catch { /* ignore */ }
    process.exit(0);
  }
  const end = Date.now() + 50;
  while (Date.now() < end) { /* spin */ }
}
try { if (fs.existsSync(barrier)) fs.unlinkSync(barrier); } catch { /* ignore */ }
try {
  if (!fs.existsSync(mutatorDone)) fs.writeFileSync(mutatorDone, 'watchdog-barrier-release');
} catch { /* ignore */ }
`], { stdio: 'ignore', detached: false });
    watchdog.unref();

    const adapters = createSystemAdapters();
    let copyError = null;
    const copyStarted = Date.now();
    try {
      adapters.copyTree(src, dest);
    } catch (error) {
      copyError = error;
    }
    const copyElapsedMs = Date.now() - copyStarted;
    assert.ok(
      copyElapsedMs < 60_000,
      `copyTree must fail-fast on barrier races (elapsed ${copyElapsedMs}ms; 12h hang is a defect)`,
    );

    // Event loop was blocked in spawnSync; poll filesystem for mutator completion.
    const joinDeadline = Date.now() + 5_000;
    while (!fs.existsSync(mutatorDone) && Date.now() < joinDeadline) {
      spawnSync('/bin/sleep', ['0.05']);
    }
    assert.equal(
      fs.existsSync(mutatorDone) ? fs.readFileSync(mutatorDone, 'utf8') : 'missing',
      'ok',
      'mutator must observe READY, mutate, and release barrier',
    );

    assert.ok(copyError, 'copyTreeSystem must fail closed on in-window mutation');
    assert.equal(copyError.code, 'COPY_TREE_HELPER_FAILED');
    // Must be the digest path (swap.c @ content mismatch), NOT size/identity @848.
    assert.match(
      copyError.details?.commandDetails?.stderr || copyError.message || '',
      /destination content mismatch/iu,
    );
    assert.doesNotMatch(
      copyError.details?.commandDetails?.stderr || copyError.message || '',
      /destination identity mismatch/iu,
    );
    assert.equal(
      fs.existsSync(sawDest),
      true,
      'staging dest must exist at PRE_CLONE_READY (created then discarded)',
    );
    assert.equal(
      fs.existsSync(dest),
      false,
      'production removeCopyTreeDestinationBestEffort must discard staging after in-window fail',
    );
    assert.equal(fs.readFileSync(foo).equals(mutated), true);
  } finally {
    if (mutator && mutator.exitCode === null && mutator.signalCode === null) {
      try { mutator.kill('SIGKILL'); } catch { /* ignore */ }
    }
    if (watchdog && watchdog.exitCode === null && watchdog.signalCode === null) {
      try { watchdog.kill('SIGKILL'); } catch { /* ignore */ }
    }
    if (prevBarrier === undefined) delete process.env.YURI_COPY_TREE_PRE_CLONE_BARRIER;
    else process.env.YURI_COPY_TREE_PRE_CLONE_BARRIER = prevBarrier;
    if (prevReady === undefined) delete process.env.YURI_COPY_TREE_PRE_CLONE_READY;
    else process.env.YURI_COPY_TREE_PRE_CLONE_READY = prevReady;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
