#!/usr/bin/env node
'use strict';

/**
 * Tests for operator-write-guard.js (hardening 2026-05-30, finding #2).
 * Two layers:
 *   1. Pure-function unit tests of inspectMutation (role injected).
 *   2. Parity test: every file in bash-security-guard.js PROTECTED_ROLE_PATHS
 *      is covered by the new guard (lists cannot silently drift).
 *   3. End-to-end spawn: a forced-coworker process denies/allows correctly.
 */

const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', 'operator-write-guard.js');
const guard = require(HOOK);
const REPO_ROOT = guard.REPO_ROOT;

const CRED = '_SYSTEM/SELF/dev-credential.json';
const OPERATOR = '_SYSTEM/Scripts/yuri-operator.cjs';
const BASH_GUARD = '.claude/hooks/bash-security-guard.js';
const SELF = '.claude/hooks/operator-write-guard.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed++;
}

// ── 1. pure-function unit tests ──────────────────────────────────────────────

// coworker is blocked on every protected file, via every mutating tool
ok('coworker Write cred (relative) denied',
  guard.inspectMutation('Write', { file_path: CRED }, 'coworker'));
ok('coworker Write cred (absolute) denied',
  guard.inspectMutation('Write', { file_path: path.resolve(REPO_ROOT, CRED) }, 'coworker'));
ok('coworker Edit operator module denied',
  guard.inspectMutation('Edit', { file_path: OPERATOR }, 'coworker'));
ok('coworker Edit bash-security-guard denied',
  guard.inspectMutation('Edit', { file_path: BASH_GUARD }, 'coworker'));
ok('coworker Write self (guard) denied',
  guard.inspectMutation('Write', { file_path: SELF }, 'coworker'));
ok('coworker MultiEdit cred denied',
  guard.inspectMutation('MultiEdit', { file_path: CRED }, 'coworker'));

// path-traversal normalization still resolves onto the protected target
ok('coworker Write cred via ../ traversal denied',
  guard.inspectMutation('Write', { file_path: '_SYSTEM/SELF/../SELF/dev-credential.json' }, 'coworker'));

// operator-guard dir prefix (forward-looking) is protected
ok('coworker NotebookEdit under operator-guard dir denied',
  guard.inspectMutation('NotebookEdit', { notebook_path: '.claude/hooks/operator-guard/x.ipynb' }, 'coworker'));

// full enforcement-guard surface (owner-approved scope 2026-05-30) -> all denied for coworker
for (const rel of [
  '.claude/hooks/claude-protocol-guard.js',
  '.claude/hooks/claude-protocol-guard.mjs',
  '.claude/hooks/agent-spawn-guard.js',
  '.claude/hooks/pre-tool-gate.js',
  '.claude/hooks/musubi-protocol-enforce.js',
  '.claude/hooks/tirith-url-guard.js',
]) {
  ok(`coworker Edit ${rel} denied`, guard.inspectMutation('Edit', { file_path: rel }, 'coworker'));
}
// operational hooks stay editable by coworker (not enforcement surface)
ok('coworker Edit token-budget-check allowed (operational, null)',
  guard.inspectMutation('Edit', { file_path: '.claude/hooks/token-budget-check.js' }, 'coworker') === null);

// case-insensitive FS bypass (macOS/APFS) — same file via case variants -> denied
ok('coworker Write cred mixed-case denied',
  guard.inspectMutation('Write', { file_path: '_SYSTEM/SELF/Dev-Credential.json' }, 'coworker'));
ok('coworker Write cred lower-dir denied',
  guard.inspectMutation('Write', { file_path: '_SYSTEM/self/dev-credential.json' }, 'coworker'));
ok('coworker Edit bash-guard upper-ext denied',
  guard.inspectMutation('Edit', { file_path: '.claude/hooks/Bash-Security-Guard.JS' }, 'coworker'));

// dev (owner) is never restricted
ok('dev Write cred allowed (null)',
  guard.inspectMutation('Write', { file_path: CRED }, 'dev') === null);

// non-protected paths pass for coworker
ok('coworker Write README allowed (null)',
  guard.inspectMutation('Write', { file_path: 'README.md' }, 'coworker') === null);
ok('coworker Edit normal source allowed (null)',
  guard.inspectMutation('Edit', { file_path: '_SYSTEM/Scripts/yuri-energy-trace.mjs' }, 'coworker') === null);

// non-mutating tools are out of scope (Bash handled by bash-security-guard.js)
ok('coworker Bash on cred is not this guard\'s job (null)',
  guard.inspectMutation('Bash', { command: 'cat ' + CRED }, 'coworker') === null);
ok('coworker Read cred allowed by this guard (null)',
  guard.inspectMutation('Read', { file_path: CRED }, 'coworker') === null);

// missing/blank path does not throw and does not deny
ok('coworker Write with no file_path allowed (null)',
  guard.inspectMutation('Write', {}, 'coworker') === null);

// ── 2. parity with bash-security-guard.js PROTECTED_ROLE_PATHS ────────────────
const bashSrc = fs.readFileSync(path.resolve(REPO_ROOT, BASH_GUARD), 'utf8');
const block = bashSrc.match(/PROTECTED_ROLE_PATHS\s*=\s*\[([\s\S]*?)\]/);
assert.ok(block, 'could not locate PROTECTED_ROLE_PATHS in bash-security-guard.js');
const bashEntries = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
assert.ok(bashEntries.length >= 4, 'expected >=4 PROTECTED_ROLE_PATHS entries');
for (const rel of bashEntries) {
  const abs = path.resolve(REPO_ROOT, rel);
  const coveredAsFile = guard.PROTECTED_ROLE_FILES.includes(abs);
  const coveredAsDir = guard.PROTECTED_ROLE_DIRS.some((d) => abs === d || abs.startsWith(d + path.sep));
  ok(`parity: ${rel} covered by new guard`, coveredAsFile || coveredAsDir);
}

// ── 3. end-to-end spawn (force coworker with a deliberately-wrong dev key) ─────
function runHook(input, role) {
  const env = { ...process.env };
  if (role === 'coworker') env.YURI_DEV_KEY = 'wrong-key-force-coworker-' + 'x'.repeat(8);
  const r = spawnSync('node', [HOOK], { input: JSON.stringify(input), encoding: 'utf8', timeout: 8000, env });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

const denyRun = runHook({ tool_name: 'Write', tool_input: { file_path: CRED, content: '{}' } }, 'coworker');
assert.equal(denyRun.status, 0, denyRun.stderr);
const denyOut = denyRun.stdout ? JSON.parse(denyRun.stdout) : null;
ok('e2e coworker Write cred -> deny',
  denyOut && denyOut.hookSpecificOutput && denyOut.hookSpecificOutput.permissionDecision === 'deny');

const passRun = runHook({ tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'x' } }, 'coworker');
assert.equal(passRun.status, 0, passRun.stderr);
ok('e2e coworker Write README -> silent pass', passRun.stdout === '');

console.log(`operator-write-guard.test.js: ${passed} checks passed`);
