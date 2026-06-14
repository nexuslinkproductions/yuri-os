import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runFreshness, SURFACES } from './yuri-freshness.mjs';

function makeSpawn(log) {
  return (cmd, args, opts) => {
    log.push({ cmd, args: args.slice(), opts: { cwd: opts?.cwd, timeout: opts?.timeout } });
    if (cmd === 'node' && args.includes('--check')) return { status: 0, stdout: 'OK', stderr: '' };
    if (cmd === 'bash' && args.includes('reindex')) return { status: 0, stdout: 'reindexed', stderr: '' };
    return { status: -1, stdout: '', stderr: 'unexpected' };
  };
}

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
  // capability-scan is only ever invoked with --check (detect), never a bare regen; gitnexus never spawned
  assert.ok(calls.filter((c) => c.cmd === 'node').every((c) => c.args.includes('--check')));
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
