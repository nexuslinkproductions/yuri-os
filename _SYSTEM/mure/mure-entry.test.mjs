// Entry-guard tests for the MURE CLI (mure.mjs).
//
// The guard decides whether `main()` runs. It MUST fire for a direct CLI call
// and MUST stay silent when the module is merely imported. The old
// `import.meta.url === \`file://${process.argv[1]}\`` string check silently
// dropped direct invocation under macOS /tmp → /private/tmp, symlinked roots,
// and paths containing spaces (exit 0, zero output). These tests defend the
// canonical real-path fix by spawning the CLI through a noncanonical symlinked
// path (which also sits inside a directory whose name contains a space) and by
// proving an import produces no CLI side effects.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const TEST_FILE = fileURLToPath(import.meta.url);
const MODULE_PATH = path.join(path.dirname(TEST_FILE), 'mure.mjs');
const REAL_MODULE = fs.realpathSync(MODULE_PATH);

// A throwaway dir holding a symlink to the module. Invoking through it gives
// process.argv[1] a path that differs (as a raw string) from the module's real
// import.meta.url — exactly the case the broken guard failed on.
let tmpRoot;
let symlinkPath;       // symlink → REAL_MODULE, reached through a spaced dir
let importerPath;      // tiny script that imports mure.mjs (for the no-side-effect test)

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mure-entry-'));
  // A space in the path also covers the paths-with-spaces requirement.
  const linkDir = path.join(tmpRoot, 'sp ace');
  fs.mkdirSync(linkDir);
  symlinkPath = path.join(linkDir, 'mure-link.mjs');
  fs.symlinkSync(REAL_MODULE, symlinkPath);

  importerPath = path.join(tmpRoot, 'importer.mjs');
  fs.writeFileSync(importerPath,
    `import * as m from ${JSON.stringify(REAL_MODULE)};\n` +
    `process.stdout.write('EXPORTS=' + Object.keys(m).length + '\\n');\n`);
});

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
});

function runCli(target, args = []) {
  const res = spawnSync(process.execPath, [target, ...args], { encoding: 'utf8' });
  return { stdout: res.stdout || '', stderr: res.stderr || '', status: res.status };
}

test('direct invocation through a symlinked + spaced path runs --validate', () => {
  const { stdout, stderr, status } = runCli(symlinkPath, ['--validate']);
  assert.equal(status, 0, `expected exit 0, got ${status}\nstderr: ${stderr}`);
  // --validate prints JSON; the guard firing at all is the contract under test.
  const v = JSON.parse(stdout);
  assert.equal(v.ok, true);
  assert.ok(typeof v.roleCount === 'number' && v.roleCount > 0);
});

test('direct invocation through a symlinked + spaced path runs --demo', () => {
  const { stdout, status } = runCli(symlinkPath, ['--demo']);
  assert.equal(status, 0, `expected exit 0, got ${status}`);
  assert.match(stdout, /DISARMED plan/);
  assert.match(stdout, /CAST \(subtask/);
});

test('direct invocation via the canonical real path also runs main', () => {
  const { stdout, status } = runCli(REAL_MODULE, ['--validate']);
  assert.equal(status, 0);
  const v = JSON.parse(stdout);
  assert.equal(v.ok, true);
});

test('importing the module is side-effect-free (main never runs)', () => {
  const { stdout, status } = runCli(importerPath);
  assert.equal(status, 0);
  assert.match(stdout, /EXPORTS=\d+/);
  // Anything main() would print proves the guard leaked; their absence proves it held.
  assert.doesNotMatch(stdout, /DISARMED plan/);
  assert.doesNotMatch(stdout, /CAST \(subtask/);
});
