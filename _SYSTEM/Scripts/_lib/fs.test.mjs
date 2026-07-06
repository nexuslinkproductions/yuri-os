#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { readJsonOrNull } from './fs.mjs';

function tmpDir() {
  const d = path.join(os.tmpdir(), `fslib-test-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

test('readJsonOrNull: parses a valid JSON file', () => {
  const d = tmpDir();
  const p = path.join(d, 'ok.json');
  fs.writeFileSync(p, JSON.stringify({ a: 1, b: [2, 3] }));
  assert.deepEqual(readJsonOrNull(p), { a: 1, b: [2, 3] });
});

test('readJsonOrNull: missing file -> null (fail-open, no throw)', () => {
  assert.equal(readJsonOrNull(path.join(tmpDir(), 'does-not-exist.json')), null);
});

test('readJsonOrNull: malformed JSON -> null', () => {
  const p = path.join(tmpDir(), 'bad.json');
  fs.writeFileSync(p, '{ not: valid json,,, ');
  assert.equal(readJsonOrNull(p), null);
});

test('readJsonOrNull: 0-byte/empty file -> null (JSON.parse("") throws, caught)', () => {
  const p = path.join(tmpDir(), 'empty.json');
  fs.writeFileSync(p, '');
  assert.equal(readJsonOrNull(p), null);
});

test('readJsonOrNull: a directory path -> null (readFileSync throws, caught)', () => {
  const d = tmpDir();
  assert.equal(readJsonOrNull(d), null);
});

test('readJsonOrNull: matches the original local readJson contract exactly', () => {
  // the 5 migrated sites each had: if(!existsSync) return null; try{JSON.parse(readFileSync)}catch{null}
  const original = (p) => {
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
  };
  const d = tmpDir();
  const good = path.join(d, 'g.json'); fs.writeFileSync(good, '{"x":42}');
  const bad = path.join(d, 'b.json'); fs.writeFileSync(bad, 'nope');
  for (const p of [good, bad, path.join(d, 'missing.json'), d]) {
    assert.deepEqual(readJsonOrNull(p), original(p), `divergence on ${p}`);
  }
});

import { atomicWriteFile } from './fs.mjs';

function noTmpOrphans(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
}

test('atomicWriteFile: writes content that reads back exactly', () => {
  const d = tmpDir();
  const p = path.join(d, 'out.json');
  atomicWriteFile(p, JSON.stringify({ a: 1 }, null, 2));
  assert.equal(fs.readFileSync(p, 'utf8'), '{\n  "a": 1\n}');
  assert.deepEqual(noTmpOrphans(d), [], 'no .tmp orphan after a successful write');
});

test('atomicWriteFile: mkdir:true (default) creates a missing parent dir', () => {
  const p = path.join(tmpDir(), 'nested', 'deep', 'f.txt');
  atomicWriteFile(p, 'hi');
  assert.equal(fs.readFileSync(p, 'utf8'), 'hi');
});

test('atomicWriteFile: mkdir:false throws on a missing parent dir (preserves the throw contract)', () => {
  const p = path.join(tmpDir(), 'does-not-exist-dir', 'f.txt');
  assert.throws(() => atomicWriteFile(p, 'x', { mkdir: false }), /atomicWriteFile\(/);
});

test('atomicWriteFile: fsync:true writes correctly (durability path)', () => {
  const d = tmpDir();
  const p = path.join(d, 'durable.txt');
  atomicWriteFile(p, 'durable-bytes', { fsync: true });
  assert.equal(fs.readFileSync(p, 'utf8'), 'durable-bytes');
  assert.deepEqual(noTmpOrphans(d), [], 'fsync path leaves no orphan');
});

test('atomicWriteFile: on failure throws a WRAPPED error AND cleans up the tmp (no orphan leak)', () => {
  // target is an existing NON-EMPTY directory -> renameSync(file, dir) fails -> must throw + cleanup.
  const d = tmpDir();
  const target = path.join(d, 'iam-a-dir');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'child'), 'x'); // non-empty so rename can't succeed
  assert.throws(
    () => atomicWriteFile(target, 'content', { mkdir: false }),
    (e) => e.message.startsWith('atomicWriteFile(') && e.cause !== undefined,
    'error must be wrapped with the path + carry a cause',
  );
  assert.deepEqual(noTmpOrphans(d), [], 'the tmp file must be unlinked on rename failure (no orphan)');
});

test('atomicWriteFile: a wrapped failure preserves the system-error identity (.code/.errno/.syscall)', () => {
  // rename(file -> non-empty dir) fails with a real fs error; the wrapper must carry its identity
  // so a caller doing `if (err.code === 'ENOENT')` still matches (regression guard for the cause-only wrap).
  const d = tmpDir();
  const target = path.join(d, 'iam-a-dir');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'child'), 'x');
  assert.throws(
    () => atomicWriteFile(target, 'content', { mkdir: false }),
    (e) => {
      assert.equal(typeof e.code, 'string', 'wrapper carries a string .code (not undefined)');
      assert.ok(e.code.length > 0, 'code is a non-empty fs code (EISDIR/ENOTEMPTY/…)');
      assert.equal(e.code, e.cause.code, 'wrapper .code mirrors the underlying cause .code');
      assert.equal(e.errno, e.cause.errno, 'wrapper .errno mirrors the cause');
      assert.equal(e.syscall, e.cause.syscall, 'wrapper .syscall mirrors the cause');
      return true;
    },
  );
});

test('atomicWriteFile: overwrites an existing file atomically', () => {
  const d = tmpDir();
  const p = path.join(d, 'x.txt');
  fs.writeFileSync(p, 'old');
  atomicWriteFile(p, 'new', { mkdir: false });
  assert.equal(fs.readFileSync(p, 'utf8'), 'new');
});
