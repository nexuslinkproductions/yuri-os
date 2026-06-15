import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  runFreshness, SURFACES,
  discoverArtifacts, coverageAudit,
  PATH_RULES, affectedSurfaces,
  readDirty, markSurfacesDirty, clearDirty, tickFreshness
} from './yuri-freshness.mjs';

function makeSpawn(log) {
  return (cmd, args, opts) => {
    log.push({ cmd, args: args.slice(), opts: { cwd: opts?.cwd, timeout: opts?.timeout } });
    if (cmd === 'node' && (args.includes('--check') || args.includes('--validate')))
      return { status: 0, stdout: 'OK', stderr: '' };
    if (cmd === 'bash' && args.includes('reindex'))
      return { status: 0, stdout: 'reindexed', stderr: '' };
    if (cmd === 'find')
      return { status: 0, stdout: '_SYSTEM/capabilities.json\n_SYSTEM/foo-registry.json\n', stderr: '' };
    return { status: -1, stdout: '', stderr: 'unexpected' };
  };
}

// ── EXISTING TESTS (preserved, adapted) ─────────────────────────────────────────

test('registry-driven: one row per surface, valid shape', () => {
  const r = runFreshness({ _spawn: makeSpawn([]) });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, SURFACES.length);
  for (const row of r.rows) {
    assert.ok(row.surface && typeof row.surface === 'string');
    assert.ok(['fresh', 'stale', 'unknown'].includes(row.status));
    assert.equal(typeof row.detail, 'string');
    assert.equal(typeof row.healable, 'boolean');
    assert.equal(typeof row.action, 'string');
  }
});

test('shared surfaces are FLAG-not-heal even under --heal', () => {
  const calls = [];
  const r = runFreshness({ heal: true, _spawn: makeSpawn(calls) });
  const git = r.rows.find((x) => x.surface === 'gitnexus-graph');
  const cap = r.rows.find((x) => x.surface === 'capabilities.json');
  assert.equal(git.healable, false);
  assert.equal(cap.healable, false);
  // capability-scan is only ever invoked with --check (detect); skill-loader with --validate (detect)
  // gitnexus never spawned
  assert.ok(calls.filter((c) => c.cmd === 'node').every((c) => c.args.includes('--check') || c.args.includes('--validate')));
  assert.ok(!calls.some((c) => c.args.some((a) => String(a).includes('gitnexus'))));
});

test('--heal triggers reindex (auto surface only)', () => {
  const calls = [];
  runFreshness({ heal: true, _spawn: makeSpawn(calls) });
  assert.ok(calls.find((c) => c.cmd === 'bash' && c.args.includes('reindex')), 'expected ai reindex under --heal');
});

test('no --heal = zero heal subprocesses (DISARMED detect-only)', () => {
  const calls = [];
  runFreshness({ _spawn: makeSpawn(calls) });
  assert.ok(!calls.some((c) => c.cmd === 'bash' && c.args.includes('reindex')), 'must not heal without --heal');
});

test('a throwing detector degrades to unknown, never crashes', () => {
  SURFACES.push({ id: '__throwtest', safety: 'flag', detect: () => { throw new Error('boom'); }, action: 'x' });
  try {
    const r = runFreshness({ _spawn: makeSpawn([]) });
    const t = r.rows.find((x) => x.surface === '__throwtest');
    assert.equal(t.status, 'unknown');
    assert.ok(t.detail.includes('threw'));
  } finally { SURFACES.pop(); }
});

// ── NEW TESTS ────────────────────────────────────────────────────────────────────

test('affectedSurfaces: pure function, no fs', () => {
  const skill = affectedSurfaces('.claude/skills/foo/SKILL.md');
  assert.ok(skill.includes('skill-hash-registry'), `expected skill-hash-registry, got ${skill}`);

  const mjs = affectedSurfaces('x.mjs');
  assert.ok(mjs.includes('gitnexus-graph'), `expected gitnexus-graph, got ${mjs}`);
  assert.ok(mjs.includes('search-index'), `expected search-index, got ${mjs}`);

  const empty = affectedSurfaces('');
  assert.deepEqual(empty, [], `expected [] for empty string, got ${empty}`);

  const nonString = affectedSurfaces(42);
  assert.deepEqual(nonString, [], `expected [] for non-string, got ${nonString}`);
});

test('coverageAudit: stubbed find discovers registered + unregistered', () => {
  const stubSpawn = (cmd, args, opts) => {
    if (cmd === 'find') {
      return {
        status: 0,
        stdout: '_SYSTEM/capabilities.json\n_SYSTEM/foo-registry.json\n',
        stderr: '',
      };
    }
    // fallback for detect calls
    if (cmd === 'node' && (args.includes('--check') || args.includes('--validate')))
      return { status: 0, stdout: 'OK', stderr: '' };
    if (cmd === 'bash' && args.includes('reindex'))
      return { status: 0, stdout: 'reindexed', stderr: '' };
    return { status: -1, stdout: '', stderr: '' };
  };
  const cov = coverageAudit({ spawn: stubSpawn });
  assert.ok(cov.discovered >= 2, `expected >=2 discovered, got ${cov.discovered}`);
  assert.ok(cov.unregisteredCount >= 1, `expected >=1 unregistered, got ${cov.unregisteredCount}`);
  assert.ok(cov.coverage < 1, `expected coverage <1, got ${cov.coverage}`);
  // capabilities.json is registered → should NOT appear in unregistered
  assert.ok(!cov.unregistered.some(u => u.startsWith('_SYSTEM/capabilities.json')),
    'registered surface should not be in unregistered list');
});

test('markSurfacesDirty / readDirty / clearDirty / tickFreshness with temp file', () => {
  const tmpFile = path.join(os.tmpdir(), `freshness-dirty-test-${process.pid}.json`);
  try {
    // tickFreshness marks dirty
    const tick1 = tickFreshness('a.mjs', { file: tmpFile, now: 123 });
    assert.ok(tick1.dirty.length > 0, `expected dirty surfaces for a.mjs, got ${tick1.dirty}`);

    // readDirty shows the ids
    const dirty = readDirty({ file: tmpFile });
    assert.ok(typeof dirty === 'object', 'readDirty should return object');
    // at least one key from the tick
    for (const id of tick1.dirty) {
      assert.equal(dirty[id], 123, `expected dirty[${id}]=123, got ${dirty[id]}`);
    }

    // clearDirty with no ids empties all
    const cleared = clearDirty(undefined, { file: tmpFile });
    assert.deepEqual(cleared, {}, 'clearDirty(undefined) should empty the map');

    // verify empty
    const after = readDirty({ file: tmpFile });
    assert.deepEqual(after, {}, 'should be empty after clear');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
  }
});