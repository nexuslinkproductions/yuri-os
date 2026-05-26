import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  applyPatchDryRun,
  makeFilesystemReader,
  materializePatch,
  REPO_ROOT,
} from './yuri-workcell.mjs';

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

// ---------------------------------------------------------------------------
// applyPatchDryRun — helpers
// ---------------------------------------------------------------------------

const DR_FILE = '_SYSTEM/config/dry-run-fixture.txt';
const DR_FILE2 = '_SYSTEM/config/dry-run-fixture-b.txt';

// File content: 5 lines (0-indexed 0..4)
const FIXTURE = 'header_line\ncontext_before_line\nold_target_line\ncontext_after_line\nfooter_line';
// Lines: 0=header_line 1=context_before_line 2=old_target_line 3=context_after_line 4=footer_line

function mockReader(map) {
  return (relPath) => (Object.hasOwn(map, relPath) ? map[relPath] : null);
}

function drPatch(patchEntry, file = DR_FILE) {
  return {
    format: 'yuri-patch-v0',
    scope_declared: [file],
    patches: [{ file, ...patchEntry }],
  };
}

// ---------------------------------------------------------------------------
// applyPatchDryRun — replace_lines
// ---------------------------------------------------------------------------

test('replace_lines happy path with context_before and context_after', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    context_before: ['context_before_line'],
    old_lines: ['old_target_line'],
    new_lines: ['new_target_line'],
    context_after: ['context_after_line'],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'would-apply');
  assert.equal(result.results[0].anchorLine, 2);
  assert.equal(result.results[0].matchedOldLines, 1);
  assert.deepEqual(result.filesWouldChange, [DR_FILE]);
});

test('replace_lines anchor not found returns error', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    old_lines: ['nonexistent_line'],
    new_lines: ['x'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-not-found')));
  assert.equal(result.results[0].status, 'error');
});

test('replace_lines ambiguous anchor returns error with positions', () => {
  const content = 'dup_line\nmiddle\ndup_line';
  const reader = mockReader({ [DR_FILE]: content });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    old_lines: ['dup_line'],
    new_lines: ['replaced'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-ambiguity')));
});

test('context_before narrows ambiguous old_lines to unique match', () => {
  const content = 'unique_before\nold_target_line\nother_stuff\nother_before\nold_target_line';
  const reader = mockReader({ [DR_FILE]: content });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    context_before: ['unique_before'],
    old_lines: ['old_target_line'],
    new_lines: ['replaced'],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].anchorLine, 1);
});

test('context_before mismatch yields anchor-not-found', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    context_before: ['wrong_before_line'],
    old_lines: ['old_target_line'],
    new_lines: ['x'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-not-found')));
});

test('replace_lines with empty new_lines (deletion) succeeds when anchor found', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    old_lines: ['old_target_line'],
    new_lines: [],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'would-apply');
  assert.equal(result.results[0].matchedOldLines, 1);
});

// ---------------------------------------------------------------------------
// applyPatchDryRun — insert_before / insert_after
// ---------------------------------------------------------------------------

test('insert_before happy path', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_before',
    context_before: ['context_before_line'],
    new_lines: ['// inserted before'],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'would-apply');
  assert.equal(result.results[0].anchorLine, 1);
  assert.deepEqual(result.filesWouldChange, [DR_FILE]);
});

test('insert_after happy path', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_after',
    context_after: ['context_after_line'],
    new_lines: ['// inserted after'],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'would-apply');
  assert.equal(result.results[0].anchorLine, 3);
});

// ---------------------------------------------------------------------------
// applyPatchDryRun — line_hint
// ---------------------------------------------------------------------------

test('line_hint drift is reported as lineHintDrift when mismatched', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    old_lines: ['old_target_line'],
    new_lines: ['x'],
    line_hint: 10,  // actual anchorLine is 2, drift = |10-1 - 2| = 7
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].lineHintDrift, 7);
});

test('line_hint matching anchorLine produces no lineHintDrift field', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    old_lines: ['old_target_line'],
    new_lines: ['x'],
    line_hint: 3,   // 1-indexed; anchorLine=2 (0-indexed); drift = |3-1-2| = 0
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].lineHintDrift, undefined);
});

// ---------------------------------------------------------------------------
// applyPatchDryRun — create_file / delete_file
// ---------------------------------------------------------------------------

test('create_file succeeds when file does not exist', () => {
  const reader = mockReader({});  // file absent
  const result = applyPatchDryRun({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/brand-new.txt'],
    patches: [{ op: 'create_file', file: '_SYSTEM/config/brand-new.txt', new_lines: ['hello'] }],
  }, reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'would-apply');
  assert.deepEqual(result.filesWouldCreate, ['_SYSTEM/config/brand-new.txt']);
});

test('create_file errors when file already exists', () => {
  const reader = mockReader({ '_SYSTEM/config/brand-new.txt': 'existing' });
  const result = applyPatchDryRun({
    format: 'yuri-patch-v0',
    scope_declared: ['_SYSTEM/config/brand-new.txt'],
    patches: [{ op: 'create_file', file: '_SYSTEM/config/brand-new.txt', new_lines: ['hello'] }],
  }, reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('file-already-exists')));
});

test('delete_file succeeds when file exists', () => {
  const reader = mockReader({ [DR_FILE]: 'content' });
  const result = applyPatchDryRun({
    format: 'yuri-patch-v0',
    scope_declared: [DR_FILE],
    patches: [{ op: 'delete_file', file: DR_FILE }],
  }, reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'would-apply');
  assert.deepEqual(result.filesWouldDelete, [DR_FILE]);
});

test('delete_file errors when file does not exist', () => {
  const reader = mockReader({});
  const result = applyPatchDryRun({
    format: 'yuri-patch-v0',
    scope_declared: [DR_FILE],
    patches: [{ op: 'delete_file', file: DR_FILE }],
  }, reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('file-not-found')));
});

// ---------------------------------------------------------------------------
// applyPatchDryRun — fsReader contract enforcement
// ---------------------------------------------------------------------------

test('fsReader null does not throw and returns errors', () => {
  const result = applyPatchDryRun(drPatch({ op: 'replace_lines', old_lines: ['x'], new_lines: ['y'] }), null);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('fsReader must be a function')));
});

test('fsReader undefined does not throw and returns errors', () => {
  const result = applyPatchDryRun(drPatch({ op: 'replace_lines', old_lines: ['x'], new_lines: ['y'] }), undefined);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('fsReader must be a function')));
});

test('fsReader as non-function object does not throw and returns errors', () => {
  const result = applyPatchDryRun(drPatch({ op: 'replace_lines', old_lines: ['x'], new_lines: ['y'] }), { readFile: () => '' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('fsReader must be a function')));
});

test('fsReader returning non-string yields reader-contract-violation', () => {
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines', old_lines: ['x'], new_lines: ['y'],
  }), () => 42);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('reader-contract-violation')));
});

test('fsReader throwing yields reader-error returned, not thrown', () => {
  assert.doesNotThrow(() => {
    const result = applyPatchDryRun(drPatch({
      op: 'replace_lines', old_lines: ['x'], new_lines: ['y'],
    }), () => { throw new Error('BOOM'); });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('reader-error') && e.includes('BOOM')));
  });
});

// ---------------------------------------------------------------------------
// applyPatchDryRun — CRLF and empty file
// ---------------------------------------------------------------------------

test('CRLF file content is normalized and anchor matches', () => {
  const crlf = 'header_line\r\nold_target_line\r\nfooter_line';
  const reader = mockReader({ [DR_FILE]: crlf });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    old_lines: ['old_target_line'],
    new_lines: ['replaced'],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].anchorLine, 1);
});

test('empty file content yields anchor-not-found without crash', () => {
  const reader = mockReader({ [DR_FILE]: '' });
  const result = applyPatchDryRun(drPatch({
    op: 'replace_lines',
    old_lines: ['anything'],
    new_lines: ['x'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-not-found')));
});

// ---------------------------------------------------------------------------
// applyPatchDryRun — overlap and multi-file
// ---------------------------------------------------------------------------

test('two non-overlapping replace_lines same file — both would-apply, no overlap warning', () => {
  const content = 'aaa\nbbb\nccc\nddd\neee';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = {
    format: 'yuri-patch-v0',
    scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['aaa'], new_lines: ['AAA'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['eee'], new_lines: ['EEE'] },
    ],
  };
  const result = applyPatchDryRun(patch, reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'would-apply');
  assert.equal(result.results[1].status, 'would-apply');
  assert.equal(result.warnings.length, 0);
});

test('two overlapping replace_lines same file — both would-apply with overlap warning', () => {
  const content = 'aaa\nbbb\nccc\nddd\neee';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = {
    format: 'yuri-patch-v0',
    scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['bbb', 'ccc'], new_lines: ['X'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['ccc', 'ddd'], new_lines: ['Y'] },
    ],
  };
  const result = applyPatchDryRun(patch, reader);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('overlapping')));
});

test('create_file errors on existing file while replace_lines succeeds — no crash, results split', () => {
  // create_file and replace_lines targeting the same file cannot both be would-apply:
  // if the file exists, create_file errors; if it does not exist, replace_lines errors.
  // This test verifies the split is handled cleanly with no spurious warnings.
  const reader = mockReader({ [DR_FILE]: 'existing content\nsome_line' });
  const patch = {
    format: 'yuri-patch-v0',
    scope_declared: [DR_FILE],
    patches: [
      { op: 'create_file', file: DR_FILE, new_lines: ['fresh'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['some_line'], new_lines: ['x'] },
    ],
  };
  const result = applyPatchDryRun(patch, reader);
  assert.equal(result.results[0].status, 'error');
  assert.ok(result.errors.some((e) => e.includes('file-already-exists')));
  assert.equal(result.results[1].status, 'would-apply');
  assert.deepEqual(result.filesWouldChange, [DR_FILE]);
  assert.deepEqual(result.filesWouldCreate, []);
});

test('multi-file patch populates filesWouldChange/Create/Delete correctly', () => {
  const newFile = '_SYSTEM/config/to-create.txt';
  const delFile = '_SYSTEM/config/to-delete.txt';
  const editFile = '_SYSTEM/config/to-edit.txt';
  const reader = mockReader({
    [delFile]: 'bye',
    [editFile]: 'change_me',
  });
  const patch = {
    format: 'yuri-patch-v0',
    scope_declared: [newFile, delFile, editFile],
    patches: [
      { op: 'create_file', file: newFile, new_lines: ['hello'] },
      { op: 'delete_file', file: delFile },
      { op: 'replace_lines', file: editFile, old_lines: ['change_me'], new_lines: ['changed'] },
    ],
  };
  const result = applyPatchDryRun(patch, reader);
  assert.equal(result.ok, true);
  assert.deepEqual(result.filesWouldCreate, [newFile]);
  assert.deepEqual(result.filesWouldDelete, [delFile]);
  assert.deepEqual(result.filesWouldChange, [editFile]);
});

// ---------------------------------------------------------------------------
// makeFilesystemReader
// ---------------------------------------------------------------------------

test('makeFilesystemReader rejects protected path by returning null', () => {
  const reader = makeFilesystemReader(REPO_ROOT);
  assert.equal(reader('.env'), null);
  assert.equal(reader('.claude/state/foo.json'), null);
});

test('makeFilesystemReader returns null for absolute path', () => {
  const reader = makeFilesystemReader(REPO_ROOT);
  assert.equal(reader('/etc/passwd'), null);
});

test('makeFilesystemReader returns null for traversal path', () => {
  const reader = makeFilesystemReader(REPO_ROOT);
  assert.equal(reader('../../etc/shadow'), null);
});

test('makeFilesystemReader reads a known repo file as a string', () => {
  const reader = makeFilesystemReader(REPO_ROOT);
  const content = reader('_SYSTEM/Scripts/yuri-workcell.mjs');
  assert.ok(typeof content === 'string');
  assert.ok(content.includes('YURI_PATCH_FORMAT'));
  assert.ok(!content.includes('\r\n'));  // CRLF normalized
});

test('makeFilesystemReader returns null for missing file', () => {
  const reader = makeFilesystemReader(REPO_ROOT);
  assert.equal(reader('_SYSTEM/Scripts/definitely-does-not-exist-xyz.mjs'), null);
});

// ---------------------------------------------------------------------------
// Prime S5 — additional dry-run coverage
// ---------------------------------------------------------------------------

test('insert_before anchor not found returns error', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_before',
    context_before: ['nonexistent_anchor'],
    new_lines: ['// new'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-not-found')));
});

test('insert_after anchor not found returns error', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_after',
    context_after: ['nonexistent_anchor'],
    new_lines: ['// new'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-not-found')));
});

test('insert_after with multi-line context_after anchors to last matched line', () => {
  const content = 'aaa\nbbb\nccc\nddd';
  const reader = mockReader({ [DR_FILE]: content });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_after',
    context_after: ['bbb', 'ccc'],
    new_lines: ['// inserted'],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].anchorLine, 2);
});

test('insert_before with multi-line context_before anchors to first matched line', () => {
  const content = 'aaa\nbbb\nccc\nddd';
  const reader = mockReader({ [DR_FILE]: content });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_before',
    context_before: ['bbb', 'ccc'],
    new_lines: ['// inserted'],
  }), reader);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].anchorLine, 1);
});

test('early-return results arrays are independent across calls', () => {
  const r1 = applyPatchDryRun({}, null);
  const r2 = applyPatchDryRun({}, null);
  assert.equal(r1.ok, false);
  assert.equal(r2.ok, false);
  r1.warnings.push('mutated');
  assert.equal(r2.warnings.length, 0);
});

test('skipValidation malformed patch early-return does not reference stale empty result state', () => {
  assert.doesNotThrow(() => {
    const result = applyPatchDryRun({}, () => null, { skipValidation: true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('patch.patches must be a non-empty array')));
    result.warnings.push('mutated');

    const next = applyPatchDryRun({}, () => null, { skipValidation: true });
    assert.equal(next.warnings.length, 0);
  });
});

test('insert_before ambiguous anchor returns error', () => {
  const content = 'dup\nmiddle\ndup';
  const reader = mockReader({ [DR_FILE]: content });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_before',
    context_before: ['dup'],
    new_lines: ['// new'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-ambiguity')));
});

test('insert_after ambiguous anchor returns error', () => {
  const content = 'dup\nmiddle\ndup';
  const reader = mockReader({ [DR_FILE]: content });
  const result = applyPatchDryRun(drPatch({
    op: 'insert_after',
    context_after: ['dup'],
    new_lines: ['// new'],
  }), reader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('anchor-ambiguity')));
});

// ---------------------------------------------------------------------------
// materializePatch helpers
// ---------------------------------------------------------------------------

function testSha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

// ---------------------------------------------------------------------------
// materializePatch — core single-op
// ---------------------------------------------------------------------------

test('materializePatch single replace_lines produces correct afterContent', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['new_target_line'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.fileResults.length, 1);
  assert.equal(r.fileResults[0].action, 'modify');
  assert.equal(
    r.fileResults[0].afterContent,
    'header_line\ncontext_before_line\nnew_target_line\ncontext_after_line\nfooter_line',
  );
  assert.deepEqual(r.filesWouldModify, [DR_FILE]);
  assert.deepEqual(r.filesWouldCreate, []);
  assert.deepEqual(r.filesWouldDelete, []);
});

test('materializePatch single insert_before produces correct afterContent', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'insert_before', context_before: ['context_before_line'], new_lines: ['inserted_line'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(
    r.fileResults[0].afterContent,
    'header_line\ninserted_line\ncontext_before_line\nold_target_line\ncontext_after_line\nfooter_line',
  );
});

test('materializePatch single insert_after produces correct afterContent', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'insert_after', context_after: ['context_after_line'], new_lines: ['inserted_after'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(
    r.fileResults[0].afterContent,
    'header_line\ncontext_before_line\nold_target_line\ncontext_after_line\ninserted_after\nfooter_line',
  );
});

test('materializePatch insert_after last line appends correctly', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'insert_after', context_after: ['footer_line'], new_lines: ['appended_line'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.ok(r.fileResults[0].afterContent.endsWith('\nfooter_line\nappended_line'));
  assert.equal(r.fileResults[0].afterLines, 6);
});

test('materializePatch replace_lines with empty new_lines removes the old line', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: [] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.fileResults[0].afterContent, 'header_line\ncontext_before_line\ncontext_after_line\nfooter_line');
  assert.equal(r.fileResults[0].afterLines, 4);
});

test('materializePatch create_file produces joined afterContent', () => {
  const newFile = '_SYSTEM/config/mat-new.txt';
  const reader = mockReader({});
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [newFile],
    patches: [{ op: 'create_file', file: newFile, new_lines: ['line1', 'line2', 'line3'] }],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.fileResults[0].action, 'create');
  assert.equal(r.fileResults[0].afterContent, 'line1\nline2\nline3');
  assert.equal(r.fileResults[0].beforeHash, null);
  assert.deepEqual(r.filesWouldCreate, [newFile]);
});

test('materializePatch delete_file produces afterContent null and captures beforeContent', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = { format: 'yuri-patch-v0', scope_declared: [DR_FILE], patches: [{ op: 'delete_file', file: DR_FILE }] };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.fileResults[0].action, 'delete');
  assert.equal(r.fileResults[0].afterContent, null);
  assert.equal(r.fileResults[0].afterHash, null);
  assert.equal(r.baseState.files[DR_FILE].beforeContent, FIXTURE);
  assert.deepEqual(r.filesWouldDelete, [DR_FILE]);
});

test('materializePatch afterHash and beforeHash match SHA-256 values', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['replaced'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.fileResults[0].afterHash, testSha256(r.fileResults[0].afterContent));
  assert.equal(r.fileResults[0].beforeHash, testSha256(FIXTURE));
  assert.equal(r.baseState.files[DR_FILE].beforeHash, testSha256(FIXTURE));
});

// ---------------------------------------------------------------------------
// materializePatch — multi-entry same-file
// ---------------------------------------------------------------------------

test('materializePatch two non-overlapping replace_lines same file compose correctly', () => {
  const content = 'aaa\nbbb\nccc\nddd\neee';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['aaa'], new_lines: ['AAA'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['eee'], new_lines: ['EEE'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.fileResults[0].afterContent, 'AAA\nbbb\nccc\nddd\nEEE');
  assert.deepEqual(r.fileResults[0].appliedEntries, [0, 1]);
});

test('materializePatch replace + insert_before + insert_after same file compose correctly', () => {
  // FIXTURE lines: header(0) context_before(1) old_target(2) context_after(3) footer(4)
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['old_target_line'], new_lines: ['new_line'] },
      { op: 'insert_before', file: DR_FILE, context_before: ['header_line'], new_lines: ['before_header'] },
      { op: 'insert_after', file: DR_FILE, context_after: ['footer_line'], new_lines: ['after_footer'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(
    r.fileResults[0].afterContent,
    'before_header\nheader_line\ncontext_before_line\nnew_line\ncontext_after_line\nfooter_line\nafter_footer',
  );
});

test('materializePatch descending splice is correct regardless of patch entry order', () => {
  const content = 'aaa\nbbb\nccc\nddd\neee';
  const patchTopBottom = {
    format: 'yuri-patch-v0', scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['aaa'], new_lines: ['AAA'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['eee'], new_lines: ['EEE'] },
    ],
  };
  const patchBottomTop = {
    format: 'yuri-patch-v0', scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['eee'], new_lines: ['EEE'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['aaa'], new_lines: ['AAA'] },
    ],
  };
  const r1 = materializePatch(patchTopBottom, mockReader({ [DR_FILE]: content }));
  const r2 = materializePatch(patchBottomTop, mockReader({ [DR_FILE]: content }));
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r1.fileResults[0].afterContent, 'AAA\nbbb\nccc\nddd\nEEE');
  assert.equal(r2.fileResults[0].afterContent, 'AAA\nbbb\nccc\nddd\nEEE');
});

test('materializePatch overlapping replace_lines same file is a hard error', () => {
  const content = 'aaa\nbbb\nccc\nddd';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['bbb', 'ccc'], new_lines: ['X'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['ccc', 'ddd'], new_lines: ['Y'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('overlapping')));
  assert.equal(r.fileResults.length, 0);
});

test('materializePatch adjacent replace_lines produces warning and correct afterContent', () => {
  const content = 'aaa\nbbb\nccc\nddd';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['aaa'], new_lines: ['AAA'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['bbb'], new_lines: ['BBB'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('adjacent')));
  assert.equal(r.fileResults[0].afterContent, 'AAA\nBBB\nccc\nddd');
});

// ---------------------------------------------------------------------------
// materializePatch — rollback manifest
// ---------------------------------------------------------------------------

test('materializePatch rollback manifest stores beforeContent and afterHash for modify', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['replaced'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  const rm = r.rollbackManifest;
  assert.equal(rm.schema, 'yuri.workcell.rollback.v0');
  const entry = rm.files.find((f) => f.file === DR_FILE);
  assert.equal(entry.action, 'modify');
  assert.equal(entry.rollbackAction, 'restore');
  assert.equal(entry.beforeContent, FIXTURE);
  assert.equal(entry.beforeHash, testSha256(FIXTURE));
  assert.equal(entry.afterHash, r.fileResults[0].afterHash);
});

test('materializePatch rollback manifest for create_file has rollbackAction delete and null beforeContent', () => {
  const newFile = '_SYSTEM/config/mat-rm-new.txt';
  const reader = mockReader({});
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [newFile],
    patches: [{ op: 'create_file', file: newFile, new_lines: ['content'] }],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  const entry = r.rollbackManifest.files[0];
  assert.equal(entry.rollbackAction, 'delete');
  assert.equal(entry.beforeContent, null);
  assert.equal(entry.beforeHash, null);
});

test('materializePatch rollback manifest for delete_file has rollbackAction restore and beforeContent', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = { format: 'yuri-patch-v0', scope_declared: [DR_FILE], patches: [{ op: 'delete_file', file: DR_FILE }] };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  const entry = r.rollbackManifest.files[0];
  assert.equal(entry.rollbackAction, 'restore');
  assert.equal(entry.beforeContent, FIXTURE);
  assert.equal(entry.afterHash, null);
});

test('materializePatch patchHash and baseStateHash are stable across two calls', () => {
  const patch = drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['replaced'] });
  const r1 = materializePatch(patch, mockReader({ [DR_FILE]: FIXTURE }));
  const r2 = materializePatch(patch, mockReader({ [DR_FILE]: FIXTURE }));
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r1.rollbackManifest.patchHash, r2.rollbackManifest.patchHash);
  assert.equal(r1.rollbackManifest.baseStateHash, r2.rollbackManifest.baseStateHash);
});

// ---------------------------------------------------------------------------
// materializePatch — error propagation and edges
// ---------------------------------------------------------------------------

test('materializePatch propagates dry-run anchor-not-found error', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({ op: 'replace_lines', old_lines: ['nonexistent_line'], new_lines: ['x'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('anchor-not-found')));
  assert.equal(r.fileResults.length, 0);
  assert.equal(r.rollbackManifest, null);
});

test('materializePatch invalid fsReader propagates dry-run error', () => {
  const patch = drPatch({ op: 'replace_lines', old_lines: ['x'], new_lines: ['y'] });
  const r = materializePatch(patch, null);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('fsReader')));
  assert.ok(r.dryRun != null);
  assert.equal(r.baseState, null);
});

test('materializePatch malformed patch propagates dry-run validation error', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const r = materializePatch({ format: 'yuri-patch-v0', scope_declared: [DR_FILE], patches: [] }, reader);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('non-empty array')));
  assert.equal(r.fileResults.length, 0);
});

test('materializePatch multi-file patch creates independent fileResults and rollback entries', () => {
  const f1 = '_SYSTEM/config/mat-f1.txt';
  const f2 = '_SYSTEM/config/mat-f2.txt';
  const reader = mockReader({ [f1]: 'line_a\nline_b', [f2]: 'line_c\nline_d' });
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [f1, f2],
    patches: [
      { op: 'replace_lines', file: f1, old_lines: ['line_a'], new_lines: ['LINE_A'] },
      { op: 'replace_lines', file: f2, old_lines: ['line_c'], new_lines: ['LINE_C'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.fileResults.length, 2);
  assert.equal(r.rollbackManifest.files.length, 2);
  assert.equal(r.fileResults.find((fr) => fr.file === f1).afterContent, 'LINE_A\nline_b');
  assert.equal(r.fileResults.find((fr) => fr.file === f2).afterContent, 'LINE_C\nline_d');
});

test('materializePatch file without trailing newline preserves no trailing newline', () => {
  const content = 'first_line\nsecond_line';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = drPatch({ op: 'replace_lines', old_lines: ['first_line'], new_lines: ['replaced'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.ok(!r.fileResults[0].afterContent.endsWith('\n'));
  assert.equal(r.fileResults[0].afterContent, 'replaced\nsecond_line');
});

test('materializePatch file with trailing newline preserves trailing newline', () => {
  const content = 'first_line\nsecond_line\n';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = drPatch({ op: 'replace_lines', old_lines: ['first_line'], new_lines: ['replaced'] });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.ok(r.fileResults[0].afterContent.endsWith('\n'));
  assert.equal(r.fileResults[0].afterContent, 'replaced\nsecond_line\n');
});

test('materializePatch empty new_lines deletion plus insert_after same file compose correctly', () => {
  // replace [2,2] and insert_after anchor=3 [3,3] are adjacent — warning, ok:true
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['old_target_line'], new_lines: [] },
      { op: 'insert_after', file: DR_FILE, context_after: ['context_after_line'], new_lines: ['appended'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(
    r.fileResults[0].afterContent,
    'header_line\ncontext_before_line\ncontext_after_line\nappended\nfooter_line',
  );
});

test('materializePatch dryRun field is populated on dry-run failure', () => {
  const patch = drPatch({ op: 'replace_lines', old_lines: ['x'], new_lines: ['y'] });
  const r = materializePatch(patch, null);
  assert.ok(r.dryRun != null);
  assert.equal(typeof r.dryRun.ok, 'boolean');
  assert.ok(Array.isArray(r.dryRun.errors));
});

// ---------------------------------------------------------------------------
// materializePatch — Prime S5 additional coverage
// ---------------------------------------------------------------------------

test('materializePatch carries dry-run warnings and lineHintDrift through to result', () => {
  const reader = mockReader({ [DR_FILE]: FIXTURE });
  const patch = drPatch({
    op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'], line_hint: 99,
  });
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, true);
  assert.equal(r.dryRun.results[0].lineHintDrift, 96);
});

test('materializePatch carries dry-run overlap warnings into materializer warnings', () => {
  const content = 'aaa\nbbb\nccc\nddd\neee';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = {
    format: 'yuri-patch-v0',
    scope_declared: [DR_FILE],
    patches: [
      { op: 'replace_lines', file: DR_FILE, old_lines: ['bbb', 'ccc'], new_lines: ['X'] },
      { op: 'replace_lines', file: DR_FILE, old_lines: ['ccc', 'ddd'], new_lines: ['Y'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, false);
  assert.ok(r.dryRun.warnings.some((w) => w.includes('overlapping')));
  assert.ok(r.warnings.some((w) => w.includes('overlapping')));
});

test('materializePatch partial overlap: failed file excluded from fileResults but other files succeed, rollbackManifest present on ok:false', () => {
  const f1 = '_SYSTEM/config/overlap-file.txt';
  const f2 = '_SYSTEM/config/clean-file.txt';
  const reader = mockReader({
    [f1]: 'aaa\nbbb\nccc\nddd',
    [f2]: 'xxx\nyyy',
  });
  const patch = {
    format: 'yuri-patch-v0',
    scope_declared: [f1, f2],
    patches: [
      { op: 'replace_lines', file: f1, old_lines: ['bbb', 'ccc'], new_lines: ['X'] },
      { op: 'replace_lines', file: f1, old_lines: ['ccc', 'ddd'], new_lines: ['Y'] },
      { op: 'replace_lines', file: f2, old_lines: ['xxx'], new_lines: ['XXX'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('overlapping')));
  assert.equal(r.fileResults.length, 1);
  assert.equal(r.fileResults[0].file, f2);
  assert.equal(r.fileResults[0].afterContent, 'XXX\nyyy');
  assert.ok(r.rollbackManifest != null);
  assert.equal(r.rollbackManifest.files.length, 1);
  assert.equal(r.rollbackManifest.files[0].file, f2);
});

test('materializePatch two insert_before at same anchor line triggers overlap error', () => {
  const content = 'aaa\ntarget\nbbb';
  const reader = mockReader({ [DR_FILE]: content });
  const patch = {
    format: 'yuri-patch-v0',
    scope_declared: [DR_FILE],
    patches: [
      { op: 'insert_before', file: DR_FILE, context_before: ['target'], new_lines: ['first'] },
      { op: 'insert_before', file: DR_FILE, context_before: ['target'], new_lines: ['second'] },
    ],
  };
  const r = materializePatch(patch, reader);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('overlapping')));
});
