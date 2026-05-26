import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  validateDecompositionDag,
  buildWorkerPacket,
  validateWorkerOutput,
  buildDecomposition,
} from './yuri-workcell.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const RUNNER = path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-workcell.mjs');

// ---------------------------------------------------------------------------
// DAG validation — hard gate
// ---------------------------------------------------------------------------

test('valid DAG produces topological order and proof', () => {
  const result = validateDecompositionDag({
    nodes: [
      { id: 'scout-ctx', role: 'scout', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
      { id: 'build-impl', role: 'builder', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
      { id: 'guard-tests', role: 'guardrail', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.test.mjs'] },
      { id: 'reg-docs', role: 'registry', filesInScope: ['_SYSTEM/config/artifact-registry.json'] },
    ],
    edges: [
      { from: 'scout-ctx', to: 'build-impl' },
      { from: 'build-impl', to: 'guard-tests' },
      { from: 'build-impl', to: 'reg-docs' },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.gate, 'dag-validation');
  assert.deepEqual(result.errors, []);
  assert.ok(Array.isArray(result.order));
  assert.equal(result.order.length, 4);
  assert.ok(result.order.indexOf('scout-ctx') < result.order.indexOf('build-impl'));
  assert.ok(result.order.indexOf('build-impl') < result.order.indexOf('guard-tests'));
  assert.ok(result.order.indexOf('build-impl') < result.order.indexOf('reg-docs'));
  assert.equal(result.proof.algorithm, 'kahn');
  assert.deepEqual(result.dagRoots, ['scout-ctx']);
});

test('cyclic DAG is rejected as hard gate failure', () => {
  const result = validateDecompositionDag({
    nodes: [
      { id: 'a', role: 'builder', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
      { id: 'b', role: 'guardrail', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.test.mjs'] },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.gate, 'dag-cycle-detection');
  assert.ok(result.errors[0].includes('cycle'));
  assert.equal(result.order, null);
});

test('single-node DAG with no edges is valid', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'solo', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.order, ['solo']);
  assert.deepEqual(result.dagRoots, ['solo']);
});

test('multiple independent leaves are identified', () => {
  const result = validateDecompositionDag({
    nodes: [
      { id: 'a', role: 'builder', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
      { id: 'b', role: 'guardrail', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.test.mjs'] },
      { id: 'c', role: 'registry', filesInScope: ['_SYSTEM/config/artifact-registry.json'] },
    ],
    edges: [
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
    ],
  });

  assert.equal(result.ok, true);
  assert.ok(result.dagRoots.includes('a'));
  assert.ok(result.dagRoots.includes('b'));
  assert.ok(!result.dagRoots.includes('c'));
});

test('protected path in filesInScope is rejected', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'bad', role: 'builder', filesInScope: ['.env'] }],
    edges: [],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('protected path')));
});

test('duplicate node ids are rejected', () => {
  const result = validateDecompositionDag({
    nodes: [
      { id: 'dup', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] },
      { id: 'dup', role: 'scout', filesInScope: ['_SYSTEM/INDEX.md'] },
    ],
    edges: [],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate')));
});

test('unknown role is rejected', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'x', role: 'hacker', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('unknown role')));
});

test('edge referencing unknown node is rejected', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'a', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [{ from: 'a', to: 'ghost' }],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('unknown target')));
});

test('empty or null decomposition is rejected', () => {
  assert.equal(validateDecompositionDag(null).ok, false);
  assert.equal(validateDecompositionDag({}).ok, false);
  assert.equal(validateDecompositionDag({ nodes: [] }).ok, false);
});

// ---------------------------------------------------------------------------
// Packet assembly
// ---------------------------------------------------------------------------

test('buildWorkerPacket produces valid packet with constraints', () => {
  const packet = buildWorkerPacket({
    id: 'build-impl',
    role: 'builder',
    goal: 'implement DAG validation',
    filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'],
  });

  assert.equal(packet.schema, 'yuri.workcell.packet.v0');
  assert.equal(packet.packetId, 'build-impl');
  assert.equal(packet.role, 'builder');
  assert.equal(packet.constraints.noCommit, true);
  assert.equal(packet.constraints.noProtectedAccess, true);
  assert.equal(packet.constraints.noSdkCalls, true);
});

test('buildWorkerPacket rejects protected path in scope', () => {
  assert.throws(
    () => buildWorkerPacket({
      id: 'bad',
      role: 'builder',
      filesInScope: ['backend/data/secrets.json'],
    }),
    /protected path/,
  );
});

test('buildWorkerPacket rejects unknown role', () => {
  assert.throws(
    () => buildWorkerPacket({ id: 'x', role: 'overlord', filesInScope: ['_SYSTEM/INDEX.md'] }),
    /unknown worker role/,
  );
});

// ---------------------------------------------------------------------------
// Output scope check
// ---------------------------------------------------------------------------

test('output within scope passes validation', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: '_SYSTEM/Scripts/yuri-workcell.mjs', action: 'edit' }], evidenceRefs: [] },
    { filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
  );
  assert.equal(result.ok, true);
});

test('output outside scope is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: 'SOUL.md', action: 'edit' }], evidenceRefs: [] },
    { filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('not in filesInScope'));
});

test('output targeting protected path is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: '.env', action: 'edit' }], evidenceRefs: [] },
    { filesInScope: ['.env'] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('protected'));
});

test('evidence ref targeting protected path is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [], evidenceRefs: ['.claude/state/foo.json'] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('protected'));
});

// ---------------------------------------------------------------------------
// Decomposition builder
// ---------------------------------------------------------------------------

test('buildDecomposition produces runId and validates DAG', () => {
  const decomp = buildDecomposition({
    goal: 'implement workcell DAG validation',
    nodes: [
      { id: 'scout', role: 'scout', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
      { id: 'build', role: 'builder', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.mjs'] },
    ],
    edges: [{ from: 'scout', to: 'build' }],
  });

  assert.equal(decomp.schema, 'yuri.workcell.decomposition.v0');
  assert.ok(decomp.runId.startsWith('wc_'));
  assert.equal(decomp.dagValidation.ok, true);
  assert.deepEqual(decomp.dispatchOrder, ['scout', 'build']);
  assert.deepEqual(decomp.dagRoots, ['scout']);
});

test('buildDecomposition with cyclic DAG records failure', () => {
  const decomp = buildDecomposition({
    goal: 'cyclic test',
    nodes: [
      { id: 'a', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] },
      { id: 'b', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
  });

  assert.equal(decomp.dagValidation.ok, false);
  assert.equal(decomp.dispatchOrder, null);
});

test('buildDecomposition rejects empty goal', () => {
  assert.throws(() => buildDecomposition({ goal: '' }), /goal/);
});

// ---------------------------------------------------------------------------
// Unsafe scope paths — absolute and traversal
// ---------------------------------------------------------------------------

test('absolute path in filesInScope is rejected by DAG validation', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'a', role: 'builder', filesInScope: ['/etc/passwd'] }],
    edges: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('absolute')));
});

test('traversal path in filesInScope is rejected by DAG validation', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'a', role: 'builder', filesInScope: ['../../etc/passwd'] }],
    edges: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('escapes')));
});

test('buildWorkerPacket rejects absolute path in scope', () => {
  assert.throws(
    () => buildWorkerPacket({
      id: 'bad',
      role: 'builder',
      filesInScope: ['/tmp/exploit.json'],
    }),
    /absolute path/,
  );
});

test('buildWorkerPacket rejects traversal path in scope', () => {
  assert.throws(
    () => buildWorkerPacket({
      id: 'bad',
      role: 'builder',
      filesInScope: ['../../../etc/shadow'],
    }),
    /escapes/,
  );
});

// ---------------------------------------------------------------------------
// CLI — protected and outside-repo file args
// ---------------------------------------------------------------------------

test('CLI validate-dag rejects protected file path', () => {
  const result = spawnSync(process.execPath, [
    RUNNER, 'validate-dag', '.claude/state/exploit.json',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /protected/);
});

test('CLI validate-dag rejects outside-repo file path', () => {
  const result = spawnSync(process.execPath, [
    RUNNER, 'validate-dag', '/etc/passwd',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside repo/);
});

test('CLI build-packet rejects protected file path', () => {
  const result = spawnSync(process.execPath, [
    RUNNER, 'build-packet', '.claude/state/node.json',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /protected/);
});

// ---------------------------------------------------------------------------
// Non-string and empty filesInScope entries
// ---------------------------------------------------------------------------

test('non-string filesInScope entry is rejected by DAG validation', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'a', role: 'builder', filesInScope: [42] }],
    edges: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty string')));
});

test('empty string filesInScope entry is rejected by DAG validation', () => {
  const result = validateDecompositionDag({
    nodes: [{ id: 'a', role: 'builder', filesInScope: [''] }],
    edges: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty string')));
});

test('null filesInScope entry is rejected by buildWorkerPacket', () => {
  assert.throws(
    () => buildWorkerPacket({
      id: 'bad',
      role: 'builder',
      filesInScope: [null],
    }),
    /non-empty string/,
  );
});

// ---------------------------------------------------------------------------
// Output path safety — absolute, traversal, non-string
// ---------------------------------------------------------------------------

test('absolute output path is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: '/etc/passwd', action: 'create' }], evidenceRefs: [] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('absolute')));
});

test('traversal output path is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: '../../etc/shadow', action: 'create' }], evidenceRefs: [] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('escapes')));
});

test('empty output path is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: '', action: 'edit' }], evidenceRefs: [] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty string')));
});

// ---------------------------------------------------------------------------
// Evidence ref safety — absolute, traversal, protected
// ---------------------------------------------------------------------------

test('absolute evidence ref is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [], evidenceRefs: ['/tmp/leak.json'] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('absolute')));
});

test('traversal evidence ref is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [], evidenceRefs: ['../../../etc/passwd'] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('escapes')));
});

test('non-string evidence ref is rejected', () => {
  const result = validateWorkerOutput(
    { outputs: [], evidenceRefs: [123] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty string')));
});

// ---------------------------------------------------------------------------
// Malformed worker output — must return ok:false, never throw
// ---------------------------------------------------------------------------

test('null output entry does not throw', () => {
  const result = validateWorkerOutput(
    { outputs: [null], evidenceRefs: [] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-null object')));
});

test('non-array outputs does not throw', () => {
  const result = validateWorkerOutput(
    { outputs: 'not-an-array', evidenceRefs: [] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('outputs must be an array')));
});

test('non-array evidenceRefs does not throw', () => {
  const result = validateWorkerOutput(
    { outputs: [], evidenceRefs: 42 },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('evidenceRefs must be an array')));
});

test('output entry without string path does not throw', () => {
  const result = validateWorkerOutput(
    { outputs: [{ action: 'edit' }], evidenceRefs: [] },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty string')));
});

test('mixed valid and malformed entries collects all errors', () => {
  const result = validateWorkerOutput(
    {
      outputs: [null, { path: '/etc/passwd', action: 'create' }, { action: 'edit' }],
      evidenceRefs: [42, '../../../shadow'],
    },
    { filesInScope: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 4);
});
