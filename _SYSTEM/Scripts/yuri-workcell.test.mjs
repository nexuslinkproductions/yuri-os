import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  validateDecompositionDag,
  buildWorkerPacket,
  validateWorkerOutput,
  buildDecomposition,
  validatePatch,
  YURI_PATCH_FORMAT,
  YURI_PATCH_OPS,
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

// ---------------------------------------------------------------------------
// Patch constants
// ---------------------------------------------------------------------------

test('YURI_PATCH_FORMAT is the correct string literal', () => {
  assert.equal(YURI_PATCH_FORMAT, 'yuri-patch-v0');
});

test('YURI_PATCH_OPS contains all expected ops and is frozen', () => {
  for (const op of ['replace_lines', 'insert_before', 'insert_after', 'create_file', 'delete_file']) {
    assert.ok(YURI_PATCH_OPS.includes(op), `expected op '${op}' in YURI_PATCH_OPS`);
  }
  assert.ok(Object.isFrozen(YURI_PATCH_OPS));
});

// ---------------------------------------------------------------------------
// validatePatch — helpers
// ---------------------------------------------------------------------------

const VALID_FILE = '_SYSTEM/Scripts/yuri-workcell.mjs';

function basePatch(patchEntry) {
  return {
    format: 'yuri-patch-v0',
    scope_declared: [VALID_FILE],
    patches: [patchEntry],
    test_commands: [],
    risk_notes: [],
  };
}

// ---------------------------------------------------------------------------
// validatePatch — valid cases
// ---------------------------------------------------------------------------

test('valid replace_lines patch passes and returns filesAffected', () => {
  const result = validatePatch(basePatch({
    op: 'replace_lines',
    file: VALID_FILE,
    context_before: ['// before'],
    old_lines: ['const X = 1;'],
    new_lines: ['const X = 2;'],
    context_after: ['// after'],
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.filesAffected, [VALID_FILE]);
});

test('replace_lines with empty new_lines (deletion) passes', () => {
  const result = validatePatch(basePatch({
    op: 'replace_lines',
    file: VALID_FILE,
    old_lines: ['const DEAD = true;'],
    new_lines: [],
  }));
  assert.equal(result.ok, true);
});

test('valid create_file patch passes', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/new-file.json'],
    patches: [{ op: 'create_file', file: '_SYSTEM/config/new-file.json', new_lines: ['{}'] }],
    test_commands: [],
    risk_notes: [],
  });
  assert.equal(result.ok, true);
});

test('valid delete_file patch passes', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/old-file.json'],
    patches: [{ op: 'delete_file', file: '_SYSTEM/config/old-file.json' }],
    test_commands: [],
    risk_notes: [],
  });
  assert.equal(result.ok, true);
});

test('valid insert_before patch passes with context_before', () => {
  const result = validatePatch(basePatch({
    op: 'insert_before',
    file: VALID_FILE,
    context_before: ['export function foo() {'],
    new_lines: ['// inserted comment'],
  }));
  assert.equal(result.ok, true);
});

test('valid insert_after patch passes with context_after', () => {
  const result = validatePatch(basePatch({
    op: 'insert_after',
    file: VALID_FILE,
    context_after: ['} // end foo'],
    new_lines: ['// inserted after'],
  }));
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// validatePatch — scope and path errors
// ---------------------------------------------------------------------------

test('missing file field is rejected', () => {
  const result = validatePatch(basePatch({ op: 'replace_lines', old_lines: ['x'], new_lines: ['y'] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty string')));
});

test('absolute path in patch.file is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['/etc/passwd'],
    patches: [{ op: 'delete_file', file: '/etc/passwd' }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('absolute')));
});

test('traversal path in patch.file is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['../../etc/shadow'],
    patches: [{ op: 'delete_file', file: '../../etc/shadow' }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('escapes')));
});

test('protected path in patch.file is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['.env'],
    patches: [{ op: 'replace_lines', file: '.env', old_lines: ['S=x'], new_lines: ['S=y'] }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('protected')));
});

test('file not in scope_declared is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/INDEX.md'],
    patches: [{ op: 'replace_lines', file: VALID_FILE, old_lines: ['x'], new_lines: ['y'] }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('not in scope_declared')));
});

test('scope_declared path outside packet scopeFiles is rejected', () => {
  const result = validatePatch(
    {
      format: 'yuri-patch-v0',
      scope_declared: ['_SYSTEM/INDEX.md'],
      patches: [{ op: 'replace_lines', file: '_SYSTEM/INDEX.md', old_lines: ['x'], new_lines: ['y'] }],
    },
    [VALID_FILE],
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('not in packet scope')));
});

test('empty patches array is rejected', () => {
  const result = validatePatch({ format: 'yuri-patch-v0', scope_declared: [VALID_FILE], patches: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty array')));
});

// ---------------------------------------------------------------------------
// validatePatch — op-specific errors
// ---------------------------------------------------------------------------

test('unknown op is rejected', () => {
  const result = validatePatch(basePatch({ op: 'nuke_file', file: VALID_FILE }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('nuke_file')));
});

test('replace_lines without old_lines is rejected', () => {
  const result = validatePatch(basePatch({ op: 'replace_lines', file: VALID_FILE, new_lines: ['y'] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines')));
});

test('replace_lines with empty old_lines array is rejected', () => {
  const result = validatePatch(basePatch({
    op: 'replace_lines', file: VALID_FILE, old_lines: [], new_lines: ['y'],
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines')));
});

test('replace_lines with new_lines as string shorthand is rejected', () => {
  const result = validatePatch(basePatch({
    op: 'replace_lines', file: VALID_FILE, old_lines: ['x'], new_lines: 'y',
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('new_lines')));
});

test('non-string member in old_lines is rejected', () => {
  const result = validatePatch(basePatch({
    op: 'replace_lines', file: VALID_FILE, old_lines: [42], new_lines: ['y'],
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines[0]') && e.includes('string')));
});

test('create_file with non-empty old_lines is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/new.json'],
    patches: [{
      op: 'create_file', file: '_SYSTEM/config/new.json',
      old_lines: ['existing line'], new_lines: ['{}'],
    }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines') && e.includes('create_file')));
});

test('create_file with old_lines string shorthand is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/new.json'],
    patches: [{
      op: 'create_file', file: '_SYSTEM/config/new.json',
      old_lines: 'existing line', new_lines: ['{}'],
    }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines') && e.includes('create_file')));
});

test('delete_file with non-empty new_lines is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/old.json'],
    patches: [{ op: 'delete_file', file: '_SYSTEM/config/old.json', new_lines: ['oops'] }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('new_lines') && e.includes('delete_file')));
});

test('delete_file with new_lines string shorthand is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/old.json'],
    patches: [{ op: 'delete_file', file: '_SYSTEM/config/old.json', new_lines: 'oops' }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('new_lines') && e.includes('delete_file')));
});

test('insert_before without context_before is rejected', () => {
  const result = validatePatch(basePatch({
    op: 'insert_before', file: VALID_FILE, new_lines: ['// new'],
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('context_before')));
});

test('insert_before with empty context_before is rejected', () => {
  const result = validatePatch(basePatch({
    op: 'insert_before', file: VALID_FILE, context_before: [], new_lines: ['// new'],
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('context_before')));
});

test('insert_after without context_after is rejected', () => {
  const result = validatePatch(basePatch({
    op: 'insert_after', file: VALID_FILE, new_lines: ['// new'],
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('context_after')));
});

test('non-string member in new_lines is rejected', () => {
  const result = validatePatch(basePatch({
    op: 'insert_after', file: VALID_FILE, context_after: ['// end'], new_lines: [99],
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('new_lines[0]') && e.includes('string')));
});

test('malformed patch entry (null) does not throw', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: [VALID_FILE],
    patches: [null],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-null object')));
});

// ---------------------------------------------------------------------------
// validateWorkerOutput — format routing
// ---------------------------------------------------------------------------

test('validateWorkerOutput routes valid yuri-patch-v0 entry through validatePatch', () => {
  const result = validateWorkerOutput(
    {
      outputs: [{
        format: 'yuri-patch-v0',
        scope_declared: [VALID_FILE],
        patches: [{
          op: 'replace_lines', file: VALID_FILE,
          old_lines: ['const X = 1;'], new_lines: ['const X = 2;'],
        }],
        test_commands: [], risk_notes: [],
      }],
      evidenceRefs: [],
    },
    { filesInScope: [VALID_FILE] },
  );
  assert.equal(result.ok, true);
});

test('validateWorkerOutput rejects invalid yuri-patch-v0 entry via validatePatch', () => {
  const result = validateWorkerOutput(
    {
      outputs: [{
        format: 'yuri-patch-v0',
        scope_declared: [VALID_FILE],
        patches: [{ op: 'replace_lines', file: VALID_FILE, new_lines: ['y'] }],
      }],
      evidenceRefs: [],
    },
    { filesInScope: [VALID_FILE] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines')));
});

test('validateWorkerOutput still passes legacy unified-diff entry', () => {
  const result = validateWorkerOutput(
    {
      outputs: [{ path: VALID_FILE, action: 'edit', format: 'unified-diff', content: '--- a\n+++ b\n' }],
      evidenceRefs: [],
    },
    { filesInScope: [VALID_FILE] },
  );
  assert.equal(result.ok, true);
});

test('validateWorkerOutput still passes entry with missing format (legacy behavior)', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: VALID_FILE, action: 'edit' }], evidenceRefs: [] },
    { filesInScope: [VALID_FILE] },
  );
  assert.equal(result.ok, true);
});

test('validateWorkerOutput rejects entry with unknown format', () => {
  const result = validateWorkerOutput(
    { outputs: [{ path: VALID_FILE, format: 'xml-patch' }], evidenceRefs: [] },
    { filesInScope: [VALID_FILE] },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('unknown format')));
});

// ---------------------------------------------------------------------------
// Prime S5 — additional coverage
// ---------------------------------------------------------------------------

test('validatePatch tolerates non-array scopeFiles without throwing', () => {
  const result = validatePatch(basePatch({
    op: 'replace_lines', file: VALID_FILE, old_lines: ['x'], new_lines: ['y'],
  }), 'not-an-array');
  assert.equal(result.ok, true);
});

test('delete_file with non-empty old_lines is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/old.json'],
    patches: [{ op: 'delete_file', file: '_SYSTEM/config/old.json', old_lines: ['leaked'] }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines') && e.includes('delete_file')));
});

test('delete_file with old_lines string shorthand is rejected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/old.json'],
    patches: [{ op: 'delete_file', file: '_SYSTEM/config/old.json', old_lines: 'leaked' }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('old_lines') && e.includes('delete_file')));
});

test('multi-file patch returns deduped filesAffected', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: [VALID_FILE, '_SYSTEM/INDEX.md'],
    patches: [
      { op: 'replace_lines', file: VALID_FILE, old_lines: ['a'], new_lines: ['b'] },
      { op: 'replace_lines', file: VALID_FILE, old_lines: ['c'], new_lines: ['d'] },
      { op: 'replace_lines', file: '_SYSTEM/INDEX.md', old_lines: ['e'], new_lines: ['f'] },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.filesAffected, [VALID_FILE, '_SYSTEM/INDEX.md']);
});

test('harmless extras on create_file are tolerated', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/new.json'],
    patches: [{
      op: 'create_file', file: '_SYSTEM/config/new.json',
      new_lines: ['{}'],
      context_before: ['ignored'], context_after: ['also ignored'],
      intent: 'test tolerant extras',
    }],
  });
  assert.equal(result.ok, true);
});

test('harmless extras on delete_file are tolerated', () => {
  const result = validatePatch({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/old.json'],
    patches: [{
      op: 'delete_file', file: '_SYSTEM/config/old.json',
      context_before: ['ignored'],
      intent: 'removing obsolete config',
    }],
  });
  assert.equal(result.ok, true);
});
