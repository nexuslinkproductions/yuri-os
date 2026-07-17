#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SOURCE = path.resolve('_SYSTEM/Scripts/backend-volume-broker.swift');

test('Swift broker compiles and exposes only the fixed secret-safe surface', {
  skip: process.platform !== 'darwin',
  timeout: 60_000,
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-volume-broker-test-'));
  const binary = path.join(root, 'backend-volume-broker');
  try {
    const compiled = spawnSync('/usr/bin/xcrun', [
      'swiftc',
      '-O',
      '-framework', 'Security',
      '-o', binary,
      SOURCE,
    ], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    const help = spawnSync(binary, ['help'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(help.status, 0, help.stderr || help.stdout);
    assert.match(help.stdout, /provision --json/);
    assert.match(help.stdout, /key-status --json/);
    assert.match(help.stdout, /YURI-Backend-Runtime-v1\.sparsebundle/);
    assert.doesNotMatch(help.stdout, /delete|export|rotate|erase/i);

    const status = spawnSync(binary, ['key-status', '--json'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(status.status, 0, status.stderr || status.stdout);
    const statusPayload = JSON.parse(status.stdout);
    assert.deepEqual(Object.keys(statusPayload).sort(), ['account', 'ok', 'present', 'service']);
    assert.equal(statusPayload.ok, true);
    assert.equal(typeof statusPayload.present, 'boolean');

    const refused = spawnSync(binary, [
      'create-image',
      '--image', '/Volumes/T7/YURI-OS-MUSUBI-Backup.sparsebundle',
      '--volume-name', 'YURI Backend Runtime',
      '--size', '256g',
      '--expected-host-uuid', '86791676-F5A1-3995-BA18-03186DC20969',
      '--json',
    ], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(refused.status, 0, 'existing backup image path must be categorically refused');
    const refusedPayload = JSON.parse(refused.stderr);
    assert.equal(refusedPayload.ok, false);
    assert.equal(refusedPayload.code, 'IMAGE_PATH_REFUSED');

    const source = fs.readFileSync(SOURCE, 'utf8');
    assert.match(source, /"AES-256"/);
    assert.match(source, /SecRandomCopyBytes/);
    assert.match(source, /SecItemAdd/);
    assert.match(source, /SecItemCopyMatching/);
    assert.doesNotMatch(source, /\/usr\/bin\/security|\s-ov[\s"']/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fixture broker inspects real mode-000 mountpoints and reseals every unmounted outcome', {
  skip: process.platform !== 'darwin',
  timeout: 60_000,
}, () => {
  const root = fs.mkdtempSync('/private/tmp/yuri-phase1-apfs-');
  const mountPoint = path.join(root, 'mount');
  const binary = path.join(root, 'backend-volume-broker-fixture');
  try {
    const compiled = spawnSync('/usr/bin/xcrun', [
      'swiftc',
      '-warnings-as-errors',
      '-D', 'BACKEND_VOLUME_BROKER_MOUNTPOINT_TEST',
      '-framework', 'Security',
      '-o', binary,
      SOURCE,
    ], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

    fs.mkdirSync(mountPoint, { mode: 0o700 });
    fs.chmodSync(mountPoint, 0o000);
    if (process.geteuid?.() !== 0) {
      assert.throws(
        () => fs.opendirSync(mountPoint),
        (error) => error?.code === 'EACCES',
        'the fixture must reproduce the production mode-000 EACCES condition',
      );
    }
    const emptyLocked = spawnSync(binary, [mountPoint], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(emptyLocked.status, 0, emptyLocked.stderr || emptyLocked.stdout);
    assert.equal(fs.lstatSync(mountPoint).mode & 0o7777, 0, 'successful inspection must finish sealed');

    fs.chmodSync(mountPoint, 0o700);
    const marker = path.join(mountPoint, 'do-not-hide.txt');
    fs.writeFileSync(marker, 'preserve me');
    fs.chmodSync(mountPoint, 0o000);
    const nonEmptyLocked = spawnSync(binary, [mountPoint], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(nonEmptyLocked.status, 0);
    assert.equal(JSON.parse(nonEmptyLocked.stderr).code, 'MOUNTPOINT_NOT_EMPTY');
    assert.equal(fs.lstatSync(mountPoint).mode & 0o7777, 0, 'refused inspection must finish sealed');
    fs.chmodSync(mountPoint, 0o700);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve me', 'non-empty content must remain untouched');
    fs.rmSync(marker);

    const accessibleEmpty = spawnSync(binary, [mountPoint], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(accessibleEmpty.status, 0, accessibleEmpty.stderr || accessibleEmpty.stdout);
    assert.equal(fs.lstatSync(mountPoint).mode & 0o7777, 0, 'an accessible fixture is sealed before attach');

    fs.chmodSync(mountPoint, 0o700);
    fs.rmdirSync(mountPoint);
    const alternate = path.join(root, 'alternate');
    fs.mkdirSync(alternate, { mode: 0o700 });
    fs.symlinkSync(alternate, mountPoint);
    const symlink = spawnSync(binary, [mountPoint], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(symlink.status, 0);
    assert.equal(JSON.parse(symlink.stderr).code, 'PATH_SYMLINK_REFUSED');
    assert.equal(fs.lstatSync(alternate).mode & 0o7777, 0o700, 'refused symlink target must not be chmodded');
  } finally {
    try {
      if (fs.existsSync(mountPoint) && !fs.lstatSync(mountPoint).isSymbolicLink()) {
        fs.chmodSync(mountPoint, 0o700);
      }
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});
