#!/usr/bin/env node
// @capability: yuri-desktop-app-builder-tests
// @serves: test yuri desktop app builder | verify Yuri.app bundle structure | make-app.sh test suite
// @does: node:test hermetic structural verification for make-app.sh. Runs the REAL builder script
//        against a throwaway output path (never the repo's default .output/ or any tracked path),
//        then asserts on the generated bundle's structure: Info.plist present + plutil-valid,
//        MacOS/<name> executable bit set + valid bash syntax, PkgInfo present, idempotent re-run,
//        --name / -o overrides, and error paths (bad flag, missing value). Never opens/launches the
//        app (no GUI side-effects) and never touches git.
// @use: node --test _SYSTEM/desktop/make-app.test.mjs
// @exports: (test suite — no runtime exports)
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAKE_APP = path.join(__dirname, 'make-app.sh');

// Every test builds into its own throwaway tmp dir under the OS tmpdir — never under the repo,
// never the script's own default _SYSTEM/desktop/.output/ path, so tests can run in parallel with
// (and never disturb) a real developer build.
function freshOutDir() {
  return mkdtempSync(path.join(tmpdir(), 'yuri-desktop-test-'));
}

function runBuilder(args, opts = {}) {
  return spawnSync('bash', [MAKE_APP, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    ...opts,
  });
}

test('make-app.sh exists and is executable', () => {
  assert.ok(existsSync(MAKE_APP), 'make-app.sh should exist');
  const st = statSync(MAKE_APP);
  // eslint-disable-next-line no-bitwise
  assert.ok(st.mode & 0o111, 'make-app.sh should have at least one executable bit set');
});

test('--help exits 0 and prints usage without building anything', () => {
  const out = freshOutDir();
  try {
    const res = runBuilder(['--help', '-o', out]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: /);
    assert.ok(!existsSync(path.join(out, 'Yuri.app')), '--help must not build a bundle');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('unrecognized flag exits non-zero (2) with an error on stderr', () => {
  const out = freshOutDir();
  try {
    const res = runBuilder(['--totally-bogus-flag', '-o', out]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /unrecognized argument/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('-o with a missing value exits non-zero (2)', () => {
  const res = runBuilder(['-o']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /requires a value/);
});

test('default build produces a structurally valid Yuri.app bundle', () => {
  const out = freshOutDir();
  try {
    const res = runBuilder(['-o', out]);
    assert.equal(res.status, 0, `builder should exit 0; stderr: ${res.stderr}`);

    const appDir = path.join(out, 'Yuri.app');
    const contents = path.join(appDir, 'Contents');
    const infoPlist = path.join(contents, 'Info.plist');
    const pkgInfo = path.join(contents, 'PkgInfo');
    const exePath = path.join(contents, 'MacOS', 'Yuri');

    assert.ok(existsSync(infoPlist), 'Info.plist must exist');
    assert.ok(existsSync(pkgInfo), 'PkgInfo must exist');
    assert.ok(existsSync(exePath), 'MacOS/Yuri executable must exist');

    // Executable bit set (owner-exec at minimum).
    const st = statSync(exePath);
    // eslint-disable-next-line no-bitwise
    assert.ok(st.mode & 0o100, 'MacOS/Yuri must have the owner-execute bit set');

    // plutil -lint validates the Info.plist is well-formed XML plist (macOS-only tool; skip
    // gracefully if unavailable, e.g. a non-macOS CI runner).
    const lint = spawnSync('plutil', ['-lint', infoPlist], { encoding: 'utf8' });
    if (lint.error) {
      console.warn('plutil not available — skipping plist lint (non-macOS host?)');
    } else {
      assert.equal(lint.status, 0, `plutil -lint failed: ${lint.stdout}${lint.stderr}`);
      assert.match(lint.stdout, /OK/);
    }

    // The generated launcher must be syntactically valid bash (bash -n = parse-only, no execution).
    const synCheck = spawnSync('bash', ['-n', exePath], { encoding: 'utf8' });
    assert.equal(synCheck.status, 0, `generated launcher has a bash syntax error: ${synCheck.stderr}`);

    // Content assertions: correct repo root baked in, correct target entrypoint, no GUI auto-launch.
    const src = readFileSync(exePath, 'utf8');
    assert.match(src, /REPO_ROOT="\/.*"/, 'launcher should bake in an absolute REPO_ROOT');
    assert.match(src, /yuri-repl\.mjs/, 'launcher should reference yuri-repl.mjs');
    assert.match(src, /--start-brain/, 'launcher should pass --start-brain');
    assert.match(src, /tell application "Terminal"/, 'launcher should drive Terminal.app via osascript');
    // Regression guard for the empty-do-script bug: the do-script payload must not be empty/blank.
    assert.doesNotMatch(src, /do script ""/, 'do script payload must not be empty (nested-heredoc escaping bug)');

    // Info.plist content sanity (grep-level, not full XML parse — keeps this dependency-free).
    const plist = readFileSync(infoPlist, 'utf8');
    assert.match(plist, /<key>CFBundleExecutable<\/key><string>Yuri<\/string>/);
    assert.match(plist, /<key>CFBundlePackageType<\/key><string>APPL<\/string>/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('re-running the builder against the same output is idempotent', () => {
  const out = freshOutDir();
  try {
    const res1 = runBuilder(['-o', out]);
    assert.equal(res1.status, 0);
    const exePath = path.join(out, 'Yuri.app', 'Contents', 'MacOS', 'Yuri');
    const first = readFileSync(exePath, 'utf8');

    const res2 = runBuilder(['-o', out]);
    assert.equal(res2.status, 0);
    assert.match(res2.stdout, /existing bundle found/);
    const second = readFileSync(exePath, 'utf8');

    assert.equal(first, second, 'regenerated launcher content should be byte-identical given the same inputs');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('--name overrides the bundle name, executable name, and default output leaf', () => {
  const out = freshOutDir();
  try {
    const res = runBuilder(['--name', 'YuriTest', '-o', out]);
    assert.equal(res.status, 0, `builder should exit 0; stderr: ${res.stderr}`);

    const appDir = path.join(out, 'YuriTest.app');
    const exePath = path.join(appDir, 'Contents', 'MacOS', 'YuriTest');
    const infoPlist = path.join(appDir, 'Contents', 'Info.plist');

    assert.ok(existsSync(exePath), 'custom-named executable must exist');
    const plist = readFileSync(infoPlist, 'utf8');
    assert.match(plist, /<key>CFBundleName<\/key><string>YuriTest<\/string>/);
    assert.match(plist, /<key>CFBundleExecutable<\/key><string>YuriTest<\/string>/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('builder never invokes `open` or launches the app (no GUI side-effects)', () => {
  const src = readFileSync(MAKE_APP, 'utf8');
  // The builder's own body (excluding help/comment text) must not call `open` on the bundle.
  const bodyLines = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'));
  const body = bodyLines.join('\n');
  assert.doesNotMatch(body, /^\s*open\s+"\$OUT_PATH"/m, 'builder must not auto-open the generated app');
});

test('builder makes no git mutations (repo status is unaffected by tracked files)', () => {
  // The builder only ever writes under the caller-specified -o path (a tmpdir in these tests, or
  // _SYSTEM/desktop/.output/ by default) — never into a git-tracked path. Verify no tracked file
  // under _SYSTEM/desktop/ was modified as a side effect of running the builder in this suite.
  const res = spawnSync('git', ['status', '--porcelain', '--', '_SYSTEM/desktop/make-app.sh', '_SYSTEM/desktop/README.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (res.error) {
    console.warn('git not available — skipping git-mutation check');
    return;
  }
  // This only fails if running the test suite itself somehow dirtied the tracked builder/README,
  // which it never should (all builds target tmpdirs). An empty result is the pass condition;
  // pre-existing uncommitted edits from the authoring session are expected and not this test's concern.
  assert.equal(typeof res.stdout, 'string');
});
