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

// --- CONTAINMENT GUARD (PORT-01 hardening): traversal / NUL / relative -----
// Refute-by-default red-team finding: env/config-derived overrides were returned
// RAW (no normalization, no traversal/NUL rejection), so a hostile value could
// escape the install base. Guard must fail CLOSED: reject the hostile value and
// fall back to the deterministic default (never throw — the module's hard rule).
const NUL = '\u0000'; // escape only — no literal NUL byte in this source file

test('GUARD: traversal in env override is rejected, falls back to default', () => {
  const noCfg = () => null;
  const safe = path.join(REPO, '_SYSTEM', 'state');
  for (const evil of [
    safe + '/../../../../../../etc',     // climb out via env
    '/opt/yuri/../../../../etc/cron.d',  // absolute but escapes
    '/a/b/../../../../../root',          // deep climb
  ]) {
    withEnv('YURI_STATE_DIR', evil, () => {
      assert.doesNotThrow(() => stateDir({ configReader: noCfg }));
      assert.equal(stateDir({ configReader: noCfg }), safe,
        `traversal env not rejected: ${evil}`);
    });
  }
});

test('GUARD: traversal in config override is rejected, falls back to default', () => {
  const safe = path.join(REPO, '_SYSTEM', 'OS_KERNEL');
  withEnv('YURI_KERNEL_DIR', undefined, () => {
    for (const evil of ['/opt/yuri/../../../../etc', '/x/../../../../../etc/passwd']) {
      const reader = () => ({ kernelDir: evil });
      assert.doesNotThrow(() => kernelDbDir({ configReader: reader }));
      assert.equal(kernelDbDir({ configReader: reader }), safe,
        `traversal config not rejected: ${evil}`);
    }
  });
});

test('GUARD: NUL byte in config override is rejected, falls back to default', () => {
  // process.env truncates at NUL before our code sees it, so the load-bearing
  // path for a surviving NUL is the config reader (JSON.parse preserves it) and
  // direct programmatic callers. The guard must reject it outright.
  const safe = path.join(REPO, '_SYSTEM', 'state');
  withEnv('YURI_STATE_DIR', undefined, () => {
    const reader = () => ({ stateDir: '/opt/yuri' + NUL + '/../../etc' });
    assert.doesNotThrow(() => stateDir({ configReader: reader }));
    const got = stateDir({ configReader: reader });
    assert.equal(got, safe, 'NUL config override not rejected');
    assert.equal(got.indexOf(NUL), -1, 'NUL byte leaked into resolved path');
  });
});

test('GUARD: relative env override is rejected (must be absolute), falls back', () => {
  const safe = path.join(REPO, '_SYSTEM', 'state');
  for (const rel of ['../../../../tmp/escape', 'relative/dir', './x', '..']) {
    withEnv('YURI_STATE_DIR', rel, () => {
      assert.doesNotThrow(() => stateDir({ configReader: () => null }));
      assert.equal(stateDir({ configReader: () => null }), safe,
        `relative env not rejected: ${rel}`);
    });
  }
});

test('GUARD over-fix check: legitimate absolute overrides STILL honored', () => {
  // The documented portability purpose — operator/CI points a write surface at an
  // absolute install location — must keep working. These are clean (no .. / NUL).
  withEnv('YURI_STATE_DIR', '/tmp/x', () => {
    assert.equal(stateDir({ configReader: () => null }), '/tmp/x');
  });
  withEnv('YURI_STATE_DIR', undefined, () => {
    const reader = () => ({ stateDir: '/opt/yuri/state' });
    assert.equal(stateDir({ configReader: reader }), '/opt/yuri/state');
    // A single internal '.' segment normalizes but the path is still honored.
    const dotReader = () => ({ stateDir: '/opt/yuri/./state' });
    assert.equal(stateDir({ configReader: dotReader }), path.join('/opt/yuri', 'state'));
  });
  // A dir literally named 'a..b' CONTAINS '..' but is NOT a traversal segment.
  withEnv('YURI_STATE_DIR', '/opt/a..b/state', () => {
    assert.equal(stateDir({ configReader: () => null }), '/opt/a..b/state');
  });
});
