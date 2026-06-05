#!/usr/bin/env node
// Negative + positive tests for the canonical protected-surface matcher (lane-kernel.mjs).
// Purpose: prove that single-sourcing protected paths never silently UNPROTECTS a surface.
// Run: node _SYSTEM/Scripts/protected-surfaces.test.mjs
import assert from 'node:assert';
import {
  PROTECTED_SURFACE_PREFIXES,
  CONTROL_FILE_PREFIXES,
  isProtectedPath,
} from './lane-kernel.mjs';

let failures = 0;
function check(label, fn) {
  try { fn(); console.log(`PASS ${label}`); }
  catch (e) { console.error(`FAIL ${label}: ${e.message}`); failures++; }
}

// ── Canonical source integrity ────────────────────────────────────────────────
check('PROTECTED_SURFACE_PREFIXES is a frozen non-empty array', () => {
  assert.ok(Array.isArray(PROTECTED_SURFACE_PREFIXES) && PROTECTED_SURFACE_PREFIXES.length >= 10);
  assert.ok(Object.isFrozen(PROTECTED_SURFACE_PREFIXES), 'must be frozen so consumers cannot mutate enforcement');
});
check('CONTROL_FILE_PREFIXES is a frozen non-empty array', () => {
  assert.ok(Array.isArray(CONTROL_FILE_PREFIXES) && CONTROL_FILE_PREFIXES.length >= 5);
  assert.ok(Object.isFrozen(CONTROL_FILE_PREFIXES));
  for (const f of ['SOUL.md', 'CLAUDE.md', '.claude/settings.json', '.claude/hooks/']) {
    assert.ok(CONTROL_FILE_PREFIXES.includes(f), `control list must include ${f}`);
  }
});

// ── NEGATIVE: every protected surface MUST be blocked (relative + absolute) ─────
const MUST_BLOCK = [
  'backend/data/sensitive-cache.json',
  '.claude/state/session-state.json',
  '.claude/history/2026-05-29.json',
  '.claude/history.jsonl',
  '.claude/file-history/changes.log',
  '.claude/projects/my-project/state/index.json',
  '.env',
  'node_modules/lodash/index.js',
  '.amp/something.txt',
  '.claude/credentials.json',
  '.claude/.credentials.json',
  '.claude/lane-sessions/session-123.json',
  '.claude/paste-cache/paste-123.txt',
  '_SYSTEM/tools/browser-harness/runner.js',
  '_SYSTEM/tools/nemo-guardrails/policy.json',
  '_SYSTEM/tools/MSA/endpoint.mjs',
];
for (const p of MUST_BLOCK) {
  check(`BLOCK relative: ${p}`, () => assert.ok(isProtectedPath(p), `expected blocked, got allowed: ${p}`));
  check(`BLOCK absolute: /Users/x/repo/${p}`, () => assert.ok(isProtectedPath(`/Users/x/repo/${p}`), `expected blocked (absolute): ${p}`));
}

// ── POSITIVE: lookalikes that must NOT be blocked (no false positives) ──────────
const MUST_ALLOW = [
  'backend/database.js',        // "backend/data" is a substring but not the "backend/data/" prefix
  'backend/datasource/init.ts',
  'claude/state/x.json',        // missing leading dot
  '.claude-project/state.json', // not the .claude/ dir
  'src/env.config.ts',          // not the .env file
  'docs/node_modules_guide.md', // not the node_modules/ dir
  '_SYSTEM/Scripts/llm-compat-contract.mjs',
  'README.md',
];
for (const p of MUST_ALLOW) {
  check(`ALLOW: ${p}`, () => assert.ok(!isProtectedPath(p), `expected allowed, got blocked: ${p}`));
}

// ── Empty / junk input is not protected (and never throws) ──────────────────────
check('empty/garbage input is safe', () => {
  assert.equal(isProtectedPath(''), false);
  assert.equal(isProtectedPath(null), false);
  assert.equal(isProtectedPath(undefined), false);
});

if (failures === 0) {
  console.log('\n✓ protected-surfaces: all tests PASSED.');
  process.exit(0);
} else {
  console.error(`\n✗ protected-surfaces: ${failures} test(s) FAILED.`);
  process.exit(1);
}
