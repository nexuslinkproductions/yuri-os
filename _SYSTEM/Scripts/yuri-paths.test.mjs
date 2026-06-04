#!/usr/bin/env node
/**
 * Tests for the central path resolver (PORT-01).
 * Run: node --test _SYSTEM/Scripts/yuri-paths.test.mjs
 *
 * Covers the 5 mandated cases (env override wins, config-file fallback,
 * deterministic default, junk-config fail-safe, no-machine-id canary) plus
 * adversarial cases: empty/whitespace env, non-object config JSON, every
 * exported surface, and a config-reader that throws.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  repoRoot,
  stateDir,
  claudeMemoryDir,
  kernelDbDir,
  selfDir,
  auditLog,
  configHome,
  projectSlugFromCwd,
  CONFIG_FILE,
} from './yuri-paths.mjs';

// Helper: run fn with a temporarily-set env var, always restoring after.
function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { return fn(); } finally {
    if (had) process.env[name] = prev;
    else delete process.env[name];
  }
}

const REPO = repoRoot();

// --- CASE 1: env override wins -------------------------------------------
test('env override wins (YURI_STATE_DIR)', () => {
  withEnv('YURI_STATE_DIR', '/tmp/x', () => {
    assert.equal(stateDir(), '/tmp/x');
  });
});

test('env override wins over a config file value', () => {
  withEnv('YURI_STATE_DIR', '/tmp/env-wins', () => {
    const reader = () => ({ stateDir: '/tmp/config-loses' });
    assert.equal(stateDir({ configReader: reader }), '/tmp/env-wins');
  });
});

// --- CASE 2: config-file fallback ----------------------------------------
test('config-file fallback when env unset', () => {
  withEnv('YURI_STATE_DIR', undefined, () => {
    const reader = () => ({ stateDir: '/opt/yuri/state' });
    assert.equal(stateDir({ configReader: reader }), '/opt/yuri/state');
  });
  withEnv('YURI_KERNEL_DIR', undefined, () => {
    const reader = () => ({ kernelDir: '/opt/yuri/kernel' });
    assert.equal(kernelDbDir({ configReader: reader }), '/opt/yuri/kernel');
  });
});

// --- CASE 3: deterministic default ---------------------------------------
test('deterministic default when env + config both absent', () => {
  const noCfg = () => null;
  withEnv('YURI_STATE_DIR', undefined, () => {
    assert.equal(stateDir({ configReader: noCfg }), path.join(REPO, '_SYSTEM', 'state'));
  });
  withEnv('YURI_KERNEL_DIR', undefined, () => {
    assert.equal(kernelDbDir({ configReader: noCfg }), path.join(REPO, '_SYSTEM', 'OS_KERNEL'));
  });
  withEnv('YURI_SELF_DIR', undefined, () => {
    assert.equal(selfDir({ configReader: noCfg }), path.join(REPO, '_SYSTEM', 'SELF'));
  });
  withEnv('YURI_AUDIT_LOG', undefined, () => {
    assert.equal(auditLog({ configReader: noCfg }), path.join(os.homedir(), '.yuri-audit.log'));
  });
  withEnv('YURI_CONFIG_HOME', undefined, () => {
    assert.equal(configHome({ configReader: noCfg }), path.join(os.homedir(), '.config', 'yuri'));
  });
});

// --- CASE 4: junk-config fail-safe (falls back, never throws) -------------
test('junk-config fail-safe: malformed reader falls back, never throws', () => {
  const noCfg = () => null;
  withEnv('YURI_STATE_DIR', undefined, () => {
    // reader returns non-object JSON shapes
    for (const junk of [42, 'a string', [], true, NaN]) {
      const reader = () => junk;
      assert.doesNotThrow(() => stateDir({ configReader: reader }));
      assert.equal(stateDir({ configReader: reader }), path.join(REPO, '_SYSTEM', 'state'));
    }
    // reader returns an object whose field is junk (empty / whitespace / wrong type)
    for (const badField of ['', '   ', 0, null, undefined, {}]) {
      const reader = () => ({ stateDir: badField });
      assert.doesNotThrow(() => stateDir({ configReader: reader }));
      assert.equal(stateDir({ configReader: reader }), path.join(REPO, '_SYSTEM', 'state'));
    }
    // reader itself throws — resolver must swallow and fall back
    const thrower = () => { throw new Error('disk on fire'); };
    assert.doesNotThrow(() => stateDir({ configReader: thrower }));
    assert.equal(stateDir({ configReader: thrower }), path.join(REPO, '_SYSTEM', 'state'));
  });

  // empty / whitespace ENV must be ignored too, not treated as a valid override
  for (const badEnv of ['', '   ', '\t']) {
    withEnv('YURI_STATE_DIR', badEnv, () => {
      assert.equal(stateDir({ configReader: noCfg }), path.join(REPO, '_SYSTEM', 'state'));
    });
  }
});

// --- CASE 5: CANARY — no baked machine-id literal ------------------------
test('CANARY: claudeMemoryDir contains no literal -Users-marcelspatz- substring', () => {
  const noCfg = () => null;
  withEnv('YURI_MEMORY_DIR', undefined, () => {
    // Derived from an arbitrary cwd: must NOT leak the build-machine operator.
    const derived = claudeMemoryDir({ configReader: noCfg, cwd: '/home/someone/proj' });
    assert.ok(!derived.includes('-Users-marcelspatz-'),
      `leaked machine-id literal: ${derived}`);
    assert.ok(derived.includes('-home-someone-proj'),
      `slug not derived from given cwd: ${derived}`);
    // And the default (real cwd) is still runtime-derived, not a constant.
    const defaultDir = claudeMemoryDir({ configReader: noCfg });
    assert.equal(defaultDir, path.join(
      os.homedir(), '.claude', 'projects', projectSlugFromCwd(), 'memory'));
  });
});

test('CANARY hard: module SOURCE contains no -Users-marcelspatz- literal', () => {
  // Defense in depth: even a future edit must not bake the operator path in.
  const moduleFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'yuri-paths.mjs');
  const src = fs.readFileSync(moduleFile, 'utf8');
  assert.ok(!src.includes('-Users-marcelspatz-'),
    'yuri-paths.mjs source contains a baked operator-machine literal');
});

// --- slug derivation edge cases ------------------------------------------
test('projectSlugFromCwd: leading -, alnum runs collapsed, no trailing -', () => {
  assert.equal(projectSlugFromCwd('/Users/alice/My Repo.git'), '-Users-alice-My-Repo-git');
  assert.equal(projectSlugFromCwd('/a//b/'), '-a-b');
  // bad input falls back to real cwd-derived slug, still leading -
  assert.ok(projectSlugFromCwd(null).startsWith('-'));
  assert.ok(projectSlugFromCwd(42).startsWith('-'));
});

// --- env override applies to every surface -------------------------------
test('env override wins on every exported path surface', () => {
  const cases = [
    ['YURI_STATE_DIR', stateDir],
    ['YURI_MEMORY_DIR', claudeMemoryDir],
    ['YURI_KERNEL_DIR', kernelDbDir],
    ['YURI_SELF_DIR', selfDir],
    ['YURI_AUDIT_LOG', auditLog],
    ['YURI_CONFIG_HOME', configHome],
  ];
  for (const [env, fn] of cases) {
    withEnv(env, '/tmp/override-me', () => {
      assert.equal(fn(), '/tmp/override-me', `${env} not honored`);
    });
  }
});

test('repoRoot is absolute and is the parent dir of _SYSTEM/Scripts', () => {
  assert.ok(path.isAbsolute(REPO), 'repoRoot must be absolute');
  // This module lives at <repo>/_SYSTEM/Scripts; repoRoot must be two up from it.
  const moduleDir = path.dirname(fileURLToPath(import.meta.url)); // <repo>/_SYSTEM/Scripts
  assert.equal(REPO, path.resolve(moduleDir, '..', '..'),
    'repoRoot is not two segments above _SYSTEM/Scripts');
  // All composed defaults must live under repoRoot.
  assert.ok(stateDir({ configReader: () => null }).startsWith(REPO));
  assert.ok(kernelDbDir({ configReader: () => null }).startsWith(REPO));
});
