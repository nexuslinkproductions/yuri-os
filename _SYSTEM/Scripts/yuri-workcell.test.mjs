import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  makeFilesystemWriter,
  makeFilesystemDeleter,
  materializePatch,
  applyMaterializedPatch,
  rollbackMaterializedPatch,
  REPO_ROOT,
  WORKCELL_MEMORY_AUTHORITY,
  WORKCELL_MEMORY_OPERATIONS,
  isMemoryAllowed,
  validateMemoryCapsule,
  readPoolOutput,
  estimateWorkcellTokens,
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

// ---------------------------------------------------------------------------
// Phase 3B helpers
// ---------------------------------------------------------------------------

function mockWriter(callLog = []) {
  return (relPath, content) => { callLog.push({ op: 'write', relPath, content }); };
}
function mockDeleter(callLog = []) {
  return (relPath) => { callLog.push({ op: 'delete', relPath }); };
}
function throwingWriter(msg = 'WRITE_FAIL') {
  return () => { throw new Error(msg); };
}
function throwingDeleter(msg = 'DELETE_FAIL') {
  return () => { throw new Error(msg); };
}

// ---------------------------------------------------------------------------
// makeFilesystemWriter — guard chain
// ---------------------------------------------------------------------------

test('makeFilesystemWriter rejects non-string relPath', () => {
  const writer = makeFilesystemWriter(REPO_ROOT);
  assert.throws(() => writer(null, 'x'), /non-empty string/);
  assert.throws(() => writer(42, 'x'), /non-empty string/);
});

test('makeFilesystemWriter rejects absolute path', () => {
  const writer = makeFilesystemWriter(REPO_ROOT);
  assert.throws(() => writer('/etc/passwd', 'x'), /absolute/);
});

test('makeFilesystemWriter rejects traversal path', () => {
  const writer = makeFilesystemWriter(REPO_ROOT);
  assert.throws(() => writer('../../etc/shadow', 'x'), /escapes/);
});

test('makeFilesystemWriter rejects protected path', () => {
  const writer = makeFilesystemWriter(REPO_ROOT);
  assert.throws(() => writer('.env', 'x'), /protected/);
  assert.throws(() => writer('.claude/state/foo.json', 'x'), /protected/);
});

test('makeFilesystemWriter creates parent dirs and writes file in tmpdir', () => {
  const testRoot = mkdtempSync(path.join(tmpdir(), 'yuri-fw-'));
  try {
    const writer = makeFilesystemWriter(testRoot);
    writer('subdir/nested/file.txt', 'hello world');
    const full = path.join(testRoot, 'subdir/nested/file.txt');
    assert.ok(existsSync(full));
    assert.equal(readFileSync(full, 'utf8'), 'hello world');
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// makeFilesystemDeleter — guard chain
// ---------------------------------------------------------------------------

test('makeFilesystemDeleter rejects non-string relPath', () => {
  const deleter = makeFilesystemDeleter(REPO_ROOT);
  assert.throws(() => deleter(null), /non-empty string/);
});

test('makeFilesystemDeleter rejects absolute path', () => {
  const deleter = makeFilesystemDeleter(REPO_ROOT);
  assert.throws(() => deleter('/etc/passwd'), /absolute/);
});

test('makeFilesystemDeleter rejects traversal path', () => {
  const deleter = makeFilesystemDeleter(REPO_ROOT);
  assert.throws(() => deleter('../../../etc/shadow'), /escapes/);
});

test('makeFilesystemDeleter rejects protected path', () => {
  const deleter = makeFilesystemDeleter(REPO_ROOT);
  assert.throws(() => deleter('.env'), /protected/);
});

test('makeFilesystemDeleter deletes a real file in tmpdir', () => {
  const testRoot = mkdtempSync(path.join(tmpdir(), 'yuri-fd-'));
  try {
    const writer = makeFilesystemWriter(testRoot);
    const deleter = makeFilesystemDeleter(testRoot);
    writer('to-delete.txt', 'ephemeral');
    const full = path.join(testRoot, 'to-delete.txt');
    assert.ok(existsSync(full));
    deleter('to-delete.txt');
    assert.ok(!existsSync(full));
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

test('reader + writer + deleter round trip in tmpdir', () => {
  const testRoot = mkdtempSync(path.join(tmpdir(), 'yuri-rt-'));
  try {
    const reader = makeFilesystemReader(testRoot);
    const writer = makeFilesystemWriter(testRoot);
    const deleter = makeFilesystemDeleter(testRoot);
    const relPath = 'roundtrip/file.txt';
    const content = 'round\ntrip\ncontent';
    assert.equal(reader(relPath), null);
    writer(relPath, content);
    assert.equal(reader(relPath), content);
    deleter(relPath);
    assert.equal(reader(relPath), null);
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// applyMaterializedPatch — approval and input validation
// ---------------------------------------------------------------------------

test('applyMaterializedPatch not approved returns error and no writes', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const writes = [];
  const r = applyMaterializedPatch(mat, mockReader({ [DR_FILE]: FIXTURE }), mockWriter(writes), mockDeleter(), {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('approved')));
  assert.equal(writes.length, 0);
  assert.equal(r.rollbackAttempted, false);
});

test('applyMaterializedPatch with materialized.ok false returns error', () => {
  const badMat = { ok: false, fileResults: [], rollbackManifest: null };
  const r = applyMaterializedPatch(badMat, mockReader({}), mockWriter(), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('ok:true')));
});

test('applyMaterializedPatch with null materialized returns error', () => {
  const r = applyMaterializedPatch(null, mockReader({}), mockWriter(), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test('applyMaterializedPatch with invalid fsWriter returns error', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const r = applyMaterializedPatch(mat, mockReader({}), null, mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('fsWriter')));
});

test('applyMaterializedPatch with invalid fsDeleter returns error', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const r = applyMaterializedPatch(mat, mockReader({}), mockWriter(), 'not-a-function', { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('fsDeleter')));
});

test('applyMaterializedPatch with invalid fsReader returns error', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const r = applyMaterializedPatch(mat, 42, mockWriter(), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('fsReader')));
});

// ---------------------------------------------------------------------------
// applyMaterializedPatch — preflight
// ---------------------------------------------------------------------------

test('applyMaterializedPatch beforeHash mismatch on modify blocks all writes', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const writes = [];
  const r = applyMaterializedPatch(mat, mockReader({ [DR_FILE]: 'completely_different' }), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('beforeHash mismatch')));
  assert.equal(writes.length, 0);
});

test('applyMaterializedPatch create target already exists blocks all writes', () => {
  const newFile = '_SYSTEM/config/amp-exists.txt';
  const mat = materializePatch(
    { format: 'yuri-patch-v0', scope_declared: [newFile], patches: [{ op: 'create_file', file: newFile, new_lines: ['line1'] }] },
    mockReader({}),
  );
  assert.equal(mat.ok, true);
  const writes = [];
  const r = applyMaterializedPatch(mat, mockReader({ [newFile]: 'already there' }), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('already exists')));
  assert.equal(writes.length, 0);
});

test('applyMaterializedPatch tampered afterContent/afterHash mismatch blocks writes', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['replaced'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const tampered = { ...mat, fileResults: [{ ...mat.fileResults[0], afterContent: 'TAMPERED' }] };
  const writes = [];
  const r = applyMaterializedPatch(tampered, mockReader({ [DR_FILE]: FIXTURE }), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('afterContent/afterHash mismatch')));
  assert.equal(writes.length, 0);
});

// ---------------------------------------------------------------------------
// applyMaterializedPatch — successful apply
// ---------------------------------------------------------------------------

test('applyMaterializedPatch successful modify calls fsWriter with correct args', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['new_line'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const writes = [];
  const r = applyMaterializedPatch(mat, mockReader({ [DR_FILE]: FIXTURE }), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].relPath, DR_FILE);
  assert.equal(writes[0].content, mat.fileResults[0].afterContent);
  assert.equal(r.appliedFiles.length, 1);
  assert.equal(r.appliedFiles[0].file, DR_FILE);
  assert.equal(r.appliedFiles[0].action, 'modify');
  assert.equal(r.rollbackAttempted, false);
});

test('applyMaterializedPatch successful create calls fsWriter with correct args', () => {
  const newFile = '_SYSTEM/config/amp-create-ok.txt';
  const mat = materializePatch(
    { format: 'yuri-patch-v0', scope_declared: [newFile], patches: [{ op: 'create_file', file: newFile, new_lines: ['created'] }] },
    mockReader({}),
  );
  const writes = [];
  const r = applyMaterializedPatch(mat, mockReader({}), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, true);
  assert.equal(writes[0].relPath, newFile);
  assert.equal(writes[0].content, 'created');
  assert.deepEqual(r.skippedFiles, []);
});

test('applyMaterializedPatch successful delete calls fsDeleter with correct relPath', () => {
  const mat = materializePatch(
    { format: 'yuri-patch-v0', scope_declared: [DR_FILE], patches: [{ op: 'delete_file', file: DR_FILE }] },
    mockReader({ [DR_FILE]: FIXTURE }),
  );
  const deleteCalls = [];
  const r = applyMaterializedPatch(mat, mockReader({ [DR_FILE]: FIXTURE }), mockWriter(), mockDeleter(deleteCalls), { approved: true });
  assert.equal(r.ok, true);
  assert.equal(deleteCalls[0].relPath, DR_FILE);
  assert.equal(r.appliedFiles[0].action, 'delete');
});

test('applyMaterializedPatch enforces create→modify→delete order regardless of fileResults order', () => {
  const fCreate = '_SYSTEM/config/amp-ord-c.txt';
  const fModify = '_SYSTEM/config/amp-ord-m.txt';
  const fDelete = '_SYSTEM/config/amp-ord-d.txt';
  const beforeMod = 'mod_before';
  const beforeDel = 'del_before';
  // Patch order: modify, delete, create — apply must reorder
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [fCreate, fModify, fDelete],
    patches: [
      { op: 'replace_lines', file: fModify, old_lines: ['mod_before'], new_lines: ['mod_after'] },
      { op: 'delete_file', file: fDelete },
      { op: 'create_file', file: fCreate, new_lines: ['created'] },
    ],
  };
  const mat = materializePatch(patch, mockReader({ [fModify]: beforeMod, [fDelete]: beforeDel }));
  assert.equal(mat.ok, true);
  const opLog = [];
  const writer = (relPath, content) => opLog.push({ type: 'write', relPath });
  const deleter = (relPath) => opLog.push({ type: 'delete', relPath });
  const r = applyMaterializedPatch(mat, mockReader({ [fModify]: beforeMod, [fDelete]: beforeDel }), writer, deleter, { approved: true });
  assert.equal(r.ok, true);
  assert.equal(opLog.length, 3);
  assert.equal(opLog[0].relPath, fCreate);   // create first
  assert.equal(opLog[1].relPath, fModify);   // modify second
  assert.equal(opLog[2].type, 'delete');
  assert.equal(opLog[2].relPath, fDelete);   // delete last
});

// ---------------------------------------------------------------------------
// applyMaterializedPatch — failure, rollback, skippedFiles
// ---------------------------------------------------------------------------

test('applyMaterializedPatch writer failure after one success triggers rollback', () => {
  const fCreate = '_SYSTEM/config/amp-rb-c.txt';
  const fModify = '_SYSTEM/config/amp-rb-m.txt';
  const beforeMod = 'before_rb_mod';
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [fCreate, fModify],
    patches: [
      { op: 'create_file', file: fCreate, new_lines: ['content_c'] },
      { op: 'replace_lines', file: fModify, old_lines: ['before_rb_mod'], new_lines: ['after_mod'] },
    ],
  };
  const mat = materializePatch(patch, mockReader({ [fModify]: beforeMod }));
  assert.equal(mat.ok, true);

  let writeCount = 0;
  const partialWriter = (relPath, content) => { if (++writeCount > 1) throw new Error('FAIL_SECOND_WRITE'); };
  const delCalls = [];
  const r = applyMaterializedPatch(mat, mockReader({ [fModify]: beforeMod }), partialWriter, mockDeleter(delCalls), { approved: true });

  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('FAIL_SECOND_WRITE')));
  assert.equal(r.rollbackAttempted, true);
  assert.equal(r.rollbackOk, true);
  // Rollback: create fCreate rolled back via fsDeleter (rollbackAction=delete)
  assert.ok(delCalls.some((d) => d.relPath === fCreate));
  assert.equal(r.appliedFiles.length, 1);
  assert.equal(r.appliedFiles[0].file, fCreate);
  assert.ok(r.skippedFiles.some((s) => s.file === fModify));
});

test('applyMaterializedPatch rollback failure sets rollbackOk false with rollbackErrors', () => {
  const fCreate = '_SYSTEM/config/amp-rbfail-c.txt';
  const fModify = '_SYSTEM/config/amp-rbfail-m.txt';
  const beforeMod = 'before_rbfail_mod';
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [fCreate, fModify],
    patches: [
      { op: 'create_file', file: fCreate, new_lines: ['content_c'] },
      { op: 'replace_lines', file: fModify, old_lines: ['before_rbfail_mod'], new_lines: ['after_mod'] },
    ],
  };
  const mat = materializePatch(patch, mockReader({ [fModify]: beforeMod }));
  let writeCount2 = 0;
  const partialWriter2 = (relPath, content) => { if (++writeCount2 > 1) throw new Error('FAIL_SECOND'); };
  const r = applyMaterializedPatch(mat, mockReader({ [fModify]: beforeMod }), partialWriter2, throwingDeleter('ROLLBACK_DELETER_FAIL'), { approved: true });
  assert.equal(r.rollbackAttempted, true);
  assert.equal(r.rollbackOk, false);
  assert.ok(r.rollbackErrors.some((e) => e.includes('ROLLBACK_DELETER_FAIL')));
});

test('applyMaterializedPatch skippedFiles have aborted-on-prior-error reason', () => {
  const fCreate = '_SYSTEM/config/amp-skip-c.txt';
  const fModify = '_SYSTEM/config/amp-skip-m.txt';
  const fDelete = '_SYSTEM/config/amp-skip-d.txt';
  const beforeContent = 'before_skip_content';
  const patch = {
    format: 'yuri-patch-v0', scope_declared: [fCreate, fModify, fDelete],
    patches: [
      { op: 'create_file', file: fCreate, new_lines: ['content'] },
      { op: 'replace_lines', file: fModify, old_lines: ['before_skip_content'], new_lines: ['after'] },
      { op: 'delete_file', file: fDelete },
    ],
  };
  const mat = materializePatch(patch, mockReader({ [fModify]: beforeContent, [fDelete]: beforeContent }));
  const r = applyMaterializedPatch(
    mat,
    mockReader({ [fModify]: beforeContent, [fDelete]: beforeContent }),
    throwingWriter('FAIL_ALL'),
    mockDeleter(),
    { approved: true },
  );
  assert.equal(r.ok, false);
  assert.equal(r.appliedFiles.length, 0);
  assert.ok(r.skippedFiles.some((s) => s.reason.includes('aborted-on-prior-error')));
});

test('applyMaterializedPatch appliedFiles accurate on full success', () => {
  const mat = materializePatch(drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }), mockReader({ [DR_FILE]: FIXTURE }));
  const r = applyMaterializedPatch(mat, mockReader({ [DR_FILE]: FIXTURE }), mockWriter(), mockDeleter(), { approved: true });
  assert.equal(r.ok, true);
  assert.equal(r.appliedFiles.length, 1);
  assert.equal(r.appliedFiles[0].afterHash, mat.fileResults[0].afterHash);
  assert.equal(r.skippedFiles.length, 0);
});

// ---------------------------------------------------------------------------
// rollbackMaterializedPatch — validation
// ---------------------------------------------------------------------------

test('rollbackMaterializedPatch fsWriter not a function returns error', () => {
  const r = rollbackMaterializedPatch({ files: [] }, null, mockDeleter());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('fsWriter')));
});

test('rollbackMaterializedPatch fsDeleter not a function returns error', () => {
  const r = rollbackMaterializedPatch({ files: [] }, mockWriter(), 'bad');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('fsDeleter')));
});

test('rollbackMaterializedPatch null manifest returns error', () => {
  const r = rollbackMaterializedPatch(null, mockWriter(), mockDeleter());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('files must be an array')));
});

test('rollbackMaterializedPatch empty files array is a no-op returning ok:true', () => {
  const r = rollbackMaterializedPatch({ files: [] }, mockWriter(), mockDeleter());
  assert.equal(r.ok, true);
  assert.equal(r.restoredFiles.length, 0);
  assert.equal(r.deletedFiles.length, 0);
});

// ---------------------------------------------------------------------------
// rollbackMaterializedPatch — restore and delete
// ---------------------------------------------------------------------------

test('rollbackMaterializedPatch restore calls fsWriter with file and beforeContent', () => {
  const calls = [];
  const manifest = {
    files: [{ file: DR_FILE, rollbackAction: 'restore', beforeContent: FIXTURE, beforeHash: testSha256(FIXTURE), afterHash: 'x' }],
  };
  const r = rollbackMaterializedPatch(manifest, (rp, c) => calls.push({ rp, c }), mockDeleter());
  assert.equal(r.ok, true);
  assert.equal(r.restoredFiles[0], DR_FILE);
  assert.equal(calls[0].rp, DR_FILE);
  assert.equal(calls[0].c, FIXTURE);
});

test('rollbackMaterializedPatch delete calls fsDeleter with file', () => {
  const delCalls = [];
  const manifest = {
    files: [{ file: DR_FILE, rollbackAction: 'delete', beforeContent: null, beforeHash: null, afterHash: 'x' }],
  };
  const r = rollbackMaterializedPatch(manifest, mockWriter(), (rp) => delCalls.push(rp));
  assert.equal(r.ok, true);
  assert.equal(r.deletedFiles[0], DR_FILE);
  assert.equal(delCalls[0], DR_FILE);
});

test('rollbackMaterializedPatch appliedFiles scope filters and reverses order (LIFO)', () => {
  const calls = [];
  const manifest = {
    files: [
      { file: '_SYSTEM/config/rb-a.txt', rollbackAction: 'restore', beforeContent: 'a', beforeHash: 'x', afterHash: 'y' },
      { file: '_SYSTEM/config/rb-b.txt', rollbackAction: 'restore', beforeContent: 'b', beforeHash: 'x', afterHash: 'y' },
      { file: '_SYSTEM/config/rb-c.txt', rollbackAction: 'restore', beforeContent: 'c', beforeHash: 'x', afterHash: 'y' },
    ],
  };
  const r = rollbackMaterializedPatch(
    manifest,
    (rp, c) => calls.push(rp),
    mockDeleter(),
    { appliedFiles: ['_SYSTEM/config/rb-a.txt', '_SYSTEM/config/rb-b.txt'] },
  );
  assert.equal(r.ok, true);
  assert.equal(r.restoredFiles.length, 2);
  assert.equal(calls[0], '_SYSTEM/config/rb-b.txt');  // LIFO: b before a
  assert.equal(calls[1], '_SYSTEM/config/rb-a.txt');
  assert.ok(!calls.includes('_SYSTEM/config/rb-c.txt')); // c not in scope
});

test('rollbackMaterializedPatch fsWriter failure returns rollbackOk false with errors', () => {
  const manifest = {
    files: [{ file: DR_FILE, rollbackAction: 'restore', beforeContent: FIXTURE, beforeHash: testSha256(FIXTURE), afterHash: 'x' }],
  };
  const r = rollbackMaterializedPatch(manifest, throwingWriter('ROLLBACK_WRITE_FAIL'), mockDeleter());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('ROLLBACK_WRITE_FAIL')));
  assert.equal(r.restoredFiles.length, 0);
});

// ---------------------------------------------------------------------------
// Prime S5 — Phase 3B supercharge tests
// ---------------------------------------------------------------------------

test('applyMaterializedPatch inherits materialized.warnings', () => {
  const content = 'aaa\nbbb\nccc\nddd\neee';
  const mat = materializePatch(
    {
      format: 'yuri-patch-v0',
      scope_declared: [DR_FILE],
      patches: [
        { op: 'replace_lines', file: DR_FILE, old_lines: ['aaa'], new_lines: ['AAA'] },
        { op: 'replace_lines', file: DR_FILE, old_lines: ['bbb'], new_lines: ['BBB'] },
      ],
    },
    mockReader({ [DR_FILE]: content }),
  );
  assert.equal(mat.ok, true);
  assert.ok(mat.warnings.some((w) => w.includes('adjacent')));
  const r = applyMaterializedPatch(mat, mockReader({ [DR_FILE]: content }), mockWriter(), mockDeleter(), { approved: true });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('adjacent')));
});

test('applyMaterializedPatch first write failure with zero applied sets rollbackAttempted false', () => {
  const mat = materializePatch(
    drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }),
    mockReader({ [DR_FILE]: FIXTURE }),
  );
  const r = applyMaterializedPatch(mat, mockReader({ [DR_FILE]: FIXTURE }), throwingWriter('FIRST_FAIL'), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.equal(r.appliedFiles.length, 0);
  assert.equal(r.rollbackAttempted, false);
  assert.equal(r.rollbackOk, null);
});

test('applyMaterializedPatch unknown fileResult.action is rejected in preflight', () => {
  const mat = materializePatch(
    drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }),
    mockReader({ [DR_FILE]: FIXTURE }),
  );
  const tampered = { ...mat, fileResults: [{ ...mat.fileResults[0], action: 'explode' }] };
  const writes = [];
  const r = applyMaterializedPatch(tampered, mockReader({ [DR_FILE]: FIXTURE }), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('unknown fileResult action')));
  assert.equal(writes.length, 0);
});

test('applyMaterializedPatch null afterContent on create is rejected in preflight', () => {
  const newFile = '_SYSTEM/config/null-content.txt';
  const mat = materializePatch(
    { format: 'yuri-patch-v0', scope_declared: [newFile], patches: [{ op: 'create_file', file: newFile, new_lines: ['x'] }] },
    mockReader({}),
  );
  const tampered = { ...mat, fileResults: [{ ...mat.fileResults[0], afterContent: null }] };
  const writes = [];
  const r = applyMaterializedPatch(tampered, mockReader({}), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('string afterContent')));
  assert.equal(writes.length, 0);
});

test('applyMaterializedPatch preflights rollbackManifest before writes', () => {
  const mat = materializePatch(
    drPatch({ op: 'replace_lines', old_lines: ['old_target_line'], new_lines: ['x'] }),
    mockReader({ [DR_FILE]: FIXTURE }),
  );
  const tampered = { ...mat, rollbackManifest: { files: [{ file: DR_FILE, rollbackAction: 'restore', beforeContent: 42 }] } };
  const writes = [];
  const r = applyMaterializedPatch(tampered, mockReader({ [DR_FILE]: FIXTURE }), mockWriter(writes), mockDeleter(), { approved: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('rollbackManifest') && e.includes('beforeContent')));
  assert.equal(writes.length, 0);
});

test('rollbackMaterializedPatch rejects protected path in manifest entry', () => {
  const manifest = {
    files: [{ file: '.env', rollbackAction: 'restore', beforeContent: 'SECRET=x' }],
  };
  const r = rollbackMaterializedPatch(manifest, mockWriter(), mockDeleter());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('protected')));
  assert.equal(r.restoredFiles.length, 0);
});

test('makeFilesystemWriter rejects non-string content', () => {
  const writer = makeFilesystemWriter(REPO_ROOT);
  assert.throws(() => writer('_SYSTEM/INDEX.md', 42), /content must be a string/);
  assert.throws(() => writer('_SYSTEM/INDEX.md', null), /content must be a string/);
});

// ---------------------------------------------------------------------------
// Phase 4A — Memory authority (isMemoryAllowed / WORKCELL_MEMORY_AUTHORITY)
// ---------------------------------------------------------------------------

test('WORKCELL_MEMORY_OPERATIONS contains recall/propose/promote', () => {
  assert.ok(WORKCELL_MEMORY_OPERATIONS.includes('recall'));
  assert.ok(WORKCELL_MEMORY_OPERATIONS.includes('propose'));
  assert.ok(WORKCELL_MEMORY_OPERATIONS.includes('promote'));
});

// Acceptance gate 1
test('isMemoryAllowed builder recall returns false', () => {
  assert.equal(isMemoryAllowed('builder', 'recall'), false);
});

// Acceptance gate 2
test('isMemoryAllowed scout recall returns true', () => {
  assert.equal(isMemoryAllowed('scout', 'recall'), true);
});

// Acceptance gate 3
test('isMemoryAllowed builder propose returns false', () => {
  assert.equal(isMemoryAllowed('builder', 'propose'), false);
});

// Acceptance gate 4
test('isMemoryAllowed orchestrator propose returns true', () => {
  assert.equal(isMemoryAllowed('orchestrator', 'propose'), true);
});

test('isMemoryAllowed orchestrator promote returns true', () => {
  assert.equal(isMemoryAllowed('orchestrator', 'promote'), true);
});

test('isMemoryAllowed orchestrator recall returns true', () => {
  assert.equal(isMemoryAllowed('orchestrator', 'recall'), true);
});

test('isMemoryAllowed guardrail recall returns false', () => {
  assert.equal(isMemoryAllowed('guardrail', 'recall'), false);
});

test('isMemoryAllowed registry propose returns false', () => {
  assert.equal(isMemoryAllowed('registry', 'propose'), false);
});

test('isMemoryAllowed supercharger recall returns false', () => {
  assert.equal(isMemoryAllowed('supercharger', 'recall'), false);
});

test('isMemoryAllowed unknown role returns false', () => {
  assert.equal(isMemoryAllowed('overlord', 'recall'), false);
  assert.equal(isMemoryAllowed('', 'recall'), false);
  assert.equal(isMemoryAllowed(null, 'recall'), false);
});

test('isMemoryAllowed unknown operation returns false', () => {
  assert.equal(isMemoryAllowed('orchestrator', 'delete'), false);
  assert.equal(isMemoryAllowed('scout', 'promote'), false);
});

test('WORKCELL_MEMORY_AUTHORITY worker roles are all empty', () => {
  for (const role of ['builder', 'guardrail', 'registry', 'supercharger']) {
    assert.deepEqual(Array.from(WORKCELL_MEMORY_AUTHORITY[role]), []);
  }
});

// ---------------------------------------------------------------------------
// Phase 4A — validateMemoryCapsule
// ---------------------------------------------------------------------------

function validCapsule(overrides = {}) {
  return {
    version: 'workcell.capsule.v0',
    assembledAt: '2026-05-26T12:00:00Z',
    assembledBy: 'orchestrator',
    contexts: [],
    policy: { readOnly: true, writeAllowed: false, promoteAllowed: false },
    ...overrides,
  };
}

test('validateMemoryCapsule accepts a valid minimal capsule', () => {
  const r = validateMemoryCapsule(validCapsule());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('validateMemoryCapsule accepts capsule with populated contexts', () => {
  const r = validateMemoryCapsule(validCapsule({
    contexts: [{ id: 'feedback_codex.md', path: '_SYSTEM/memory/feedback_codex.md', bytes: 800 }],
    maxTotalBytes: 24000,
  }));
  assert.equal(r.ok, true);
});

// Acceptance gate 12
test('validateMemoryCapsule rejects missing version', () => {
  const r = validateMemoryCapsule(validCapsule({ version: undefined }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('version')));
});

test('validateMemoryCapsule rejects missing assembledAt', () => {
  const r = validateMemoryCapsule(validCapsule({ assembledAt: '' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('assembledAt')));
});

test('validateMemoryCapsule rejects missing assembledBy', () => {
  const r = validateMemoryCapsule(validCapsule({ assembledBy: null }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('assembledBy')));
});

test('validateMemoryCapsule rejects missing contexts', () => {
  const r = validateMemoryCapsule(validCapsule({ contexts: 'not-an-array' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('contexts')));
});

test('validateMemoryCapsule rejects missing policy', () => {
  const r = validateMemoryCapsule(validCapsule({ policy: null }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('policy')));
});

// Acceptance gate 13
test('validateMemoryCapsule rejects writeAllowed true', () => {
  const r = validateMemoryCapsule(validCapsule({
    policy: { readOnly: true, writeAllowed: true, promoteAllowed: false },
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('writeAllowed')));
});

test('validateMemoryCapsule rejects promoteAllowed true', () => {
  const r = validateMemoryCapsule(validCapsule({
    policy: { readOnly: true, writeAllowed: false, promoteAllowed: true },
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('promoteAllowed')));
});

test('validateMemoryCapsule rejects readOnly false', () => {
  const r = validateMemoryCapsule(validCapsule({
    policy: { readOnly: false, writeAllowed: false, promoteAllowed: false },
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('readOnly')));
});

// Acceptance gate 14
test('validateMemoryCapsule rejects protected context path', () => {
  const r = validateMemoryCapsule(validCapsule({
    contexts: [{ id: 'env-leak', path: '.env' }],
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('protected')));
});

test('validateMemoryCapsule rejects absolute context path', () => {
  const r = validateMemoryCapsule(validCapsule({
    contexts: [{ id: 'abs', path: '/etc/passwd' }],
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('absolute')));
});

test('validateMemoryCapsule rejects traversal context path', () => {
  const r = validateMemoryCapsule(validCapsule({
    contexts: [{ id: 'trav', path: '../../etc/passwd' }],
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('escapes')));
});

// Acceptance gate 15
test('validateMemoryCapsule warns above 80% maxTotalBytes', () => {
  const r = validateMemoryCapsule(validCapsule({
    contexts: [{ id: 'large', path: '_SYSTEM/INDEX.md', bytes: 8500 }],
    maxTotalBytes: 10000,
  }));
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.some((w) => w.includes('80%')));
});

test('validateMemoryCapsule errors above maxTotalBytes', () => {
  const r = validateMemoryCapsule(validCapsule({
    contexts: [{ id: 'oversized', path: '_SYSTEM/INDEX.md', bytes: 11000 }],
    maxTotalBytes: 10000,
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('exceeds maxTotalBytes')));
});

test('validateMemoryCapsule rejects null input without throwing', () => {
  const r = validateMemoryCapsule(null);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test('validateMemoryCapsule rejects array input without throwing', () => {
  const r = validateMemoryCapsule([]);
  assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// Phase 4A — validateWorkerOutput extensions (memorySignals/riskNotes/testCommands)
// ---------------------------------------------------------------------------

const SCOPE_FILE = '_SYSTEM/Scripts/yuri-workcell.mjs';

// Acceptance gate 5
test('validateWorkerOutput rejects non-array memorySignals.proposals', () => {
  const r = validateWorkerOutput(
    { memorySignals: { proposals: 'not-an-array' } },
    { filesInScope: [SCOPE_FILE] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('proposals') && e.includes('array')));
});

// Acceptance gate 6
test('validateWorkerOutput rejects non-object memorySignals.capsuleUsage', () => {
  const r = validateWorkerOutput(
    { memorySignals: { capsuleUsage: ['not', 'an', 'object'] } },
    { filesInScope: [SCOPE_FILE] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('capsuleUsage') && e.includes('object')));
});

// Acceptance gate 7
test('validateWorkerOutput accepts well-formed memorySignals', () => {
  const r = validateWorkerOutput(
    {
      outputs: [],
      memorySignals: {
        proposals: [
          {
            type: 'rule',
            scope: 'project',
            content: 'always check token budget before dispatch',
            confidence: 0.8,
            reason: 'prevents silent budget overruns',
          },
        ],
        capsuleUsage: {
          contextsUsed: ['feedback_codex.md'],
          contextsIgnored: [],
          staleContexts: [],
          contradictionsDetected: [],
        },
        recallLog: [],
      },
    },
    { filesInScope: [SCOPE_FILE] },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

// Acceptance gate 8
test('validateWorkerOutput rejects proposal confidence greater than 1', () => {
  const r = validateWorkerOutput(
    { memorySignals: { proposals: [{ type: 'rule', scope: 'session', content: 'x', confidence: 1.5, reason: 'y' }] } },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('confidence')));
});

test('validateWorkerOutput rejects proposal confidence below 0', () => {
  const r = validateWorkerOutput(
    { memorySignals: { proposals: [{ type: 'rule', scope: 'session', content: 'x', confidence: -0.1, reason: 'y' }] } },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('confidence')));
});

// Acceptance gate 9
test('validateWorkerOutput rejects proposal missing reason', () => {
  const r = validateWorkerOutput(
    { memorySignals: { proposals: [{ type: 'rule', scope: 'session', content: 'x', confidence: 0.5 }] } },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('reason')));
});

// Acceptance gate 10
test('validateWorkerOutput rejects proposal scope permanent', () => {
  const r = validateWorkerOutput(
    { memorySignals: { proposals: [{ type: 'rule', scope: 'permanent', content: 'x', confidence: 0.5, reason: 'y' }] } },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('permanent')));
});

// Acceptance gate 11
test('validateWorkerOutput rejects non-array riskNotes', () => {
  const r = validateWorkerOutput(
    { riskNotes: 'should be array' },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('riskNotes')));
});

test('validateWorkerOutput rejects non-array testCommands', () => {
  const r = validateWorkerOutput(
    { testCommands: 42 },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('testCommands')));
});

test('validateWorkerOutput accepts valid riskNotes and testCommands', () => {
  const r = validateWorkerOutput(
    {
      riskNotes: ['No protected surface access requested.'],
      testCommands: ['node --test _SYSTEM/Scripts/yuri-workcell.test.mjs'],
    },
    { filesInScope: [] },
  );
  assert.equal(r.ok, true);
});

test('validateWorkerOutput rejects non-string riskNotes entry', () => {
  const r = validateWorkerOutput(
    { riskNotes: ['ok', 42] },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('riskNotes[1]')));
});

test('validateWorkerOutput rejects contradictionsDetected entry missing required fields', () => {
  const r = validateWorkerOutput(
    {
      memorySignals: {
        capsuleUsage: {
          contradictionsDetected: [{ capsuleContextId: 'x', contradiction: 'y' }],
        },
      },
    },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('currentEvidence') || e.includes('severity')));
});

test('validateWorkerOutput rejects non-array capsuleUsage.contextsUsed', () => {
  const r = validateWorkerOutput(
    { memorySignals: { capsuleUsage: { contextsUsed: 'not-array' } } },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('contextsUsed')));
});

test('validateWorkerOutput rejects non-array memorySignals.recallLog', () => {
  const r = validateWorkerOutput(
    { memorySignals: { recallLog: {} } },
    { filesInScope: [] },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('recallLog')));
});

test('validateWorkerOutput accepts empty memorySignals object', () => {
  const r = validateWorkerOutput({ memorySignals: {} }, { filesInScope: [] });
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// Phase 4A — JSON schema files parse and have required top-level fields
// ---------------------------------------------------------------------------

// Acceptance gate 16
test('yuri.workcell-packet.v0.schema.json is valid JSON with required fields', () => {
  const raw = readFileSync(
    path.join(REPO_ROOT, '_SYSTEM/config/schemas/yuri.workcell-packet.v0.schema.json'),
    'utf8',
  );
  const schema = JSON.parse(raw);
  assert.ok(schema.$schema, '$schema missing');
  assert.ok(schema.$id, '$id missing');
  assert.ok(schema.title, 'title missing');
  assert.equal(schema.type, 'object');
  assert.equal(schema.$id, 'yuri.workcell-packet.v0');
});

test('yuri.workcell-output.v0.schema.json is valid JSON with required fields', () => {
  const raw = readFileSync(
    path.join(REPO_ROOT, '_SYSTEM/config/schemas/yuri.workcell-output.v0.schema.json'),
    'utf8',
  );
  const schema = JSON.parse(raw);
  assert.ok(schema.$schema, '$schema missing');
  assert.ok(schema.$id, '$id missing');
  assert.ok(schema.title, 'title missing');
  assert.equal(schema.type, 'object');
  assert.equal(schema.$id, 'yuri.workcell-output.v0');
});

test('yuri.workcell-capsule.v0.schema.json is valid JSON with required fields', () => {
  const raw = readFileSync(
    path.join(REPO_ROOT, '_SYSTEM/config/schemas/yuri.workcell-capsule.v0.schema.json'),
    'utf8',
  );
  const schema = JSON.parse(raw);
  assert.ok(schema.$schema, '$schema missing');
  assert.ok(schema.$id, '$id missing');
  assert.ok(schema.title, 'title missing');
  assert.equal(schema.type, 'object');
  assert.equal(schema.$id, 'yuri.workcell-capsule.v0');
});

// ---------------------------------------------------------------------------
// Prime S5 — Phase 4A supercharge tests
// ---------------------------------------------------------------------------

test('isMemoryAllowed rejects invalid operation name even for orchestrator', () => {
  assert.equal(isMemoryAllowed('orchestrator', 'evict'), false);
  assert.equal(isMemoryAllowed('orchestrator', 'write'), false);
  assert.equal(isMemoryAllowed('orchestrator', 'delete'), false);
});

test('isMemoryAllowed rejects non-string role and operation', () => {
  assert.equal(isMemoryAllowed(42, 'recall'), false);
  assert.equal(isMemoryAllowed('scout', 42), false);
  assert.equal(isMemoryAllowed(null, null), false);
});

test('validateMemoryCapsule rejects non-boolean proposalAllowed', () => {
  const r = validateMemoryCapsule({
    version: 'workcell.capsule.v0',
    assembledAt: '2026-05-26T00:00:00Z',
    assembledBy: 'orchestrator',
    contexts: [],
    policy: { readOnly: true, writeAllowed: false, promoteAllowed: false, proposalAllowed: 'yes' },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('proposalAllowed') && e.includes('boolean')));
});

test('validateMemoryCapsule rejects non-boolean recallAllowed', () => {
  const r = validateMemoryCapsule({
    version: 'workcell.capsule.v0',
    assembledAt: '2026-05-26T00:00:00Z',
    assembledBy: 'orchestrator',
    contexts: [],
    policy: { readOnly: true, writeAllowed: false, promoteAllowed: false, recallAllowed: 1 },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('recallAllowed') && e.includes('boolean')));
});

test('validateMemoryCapsule accepts valid boolean proposalAllowed and recallAllowed', () => {
  const r = validateMemoryCapsule({
    version: 'workcell.capsule.v0',
    assembledAt: '2026-05-26T00:00:00Z',
    assembledBy: 'orchestrator',
    contexts: [],
    policy: { readOnly: true, writeAllowed: false, promoteAllowed: false, proposalAllowed: true, recallAllowed: false },
  });
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// Phase 4B helpers
// ---------------------------------------------------------------------------

function makePoolFixture(runId, role, content) {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'yuri-pool-'));
  const dir = path.join(tmpRoot, '_SYSTEM', 'state', 'workcell', runId, role);
  mkdirSync(dir, { recursive: true });
  if (content !== undefined) {
    writeFileSync(path.join(dir, 'output.json'), content);
  }
  return tmpRoot;
}

// ---------------------------------------------------------------------------
// Phase 4B — readPoolOutput
// ---------------------------------------------------------------------------

test('readPoolOutput valid fixture returns ok:true with parsed output', () => {
  const tmpRoot = makePoolFixture('wc_valid', 'builder', JSON.stringify({ outputs: [], evidenceRefs: [] }));
  try {
    const r = readPoolOutput('wc_valid', 'builder', { root: tmpRoot });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.ok(r.output !== null);
    assert.equal(r.runId, 'wc_valid');
    assert.equal(r.role, 'builder');
    assert.ok(r.relPath.endsWith('output.json'));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('readPoolOutput missing output.json returns ok:false, output:null, no throw', () => {
  const tmpRoot = makePoolFixture('wc_miss', 'builder', undefined);
  try {
    assert.doesNotThrow(() => {
      const r = readPoolOutput('wc_miss', 'builder', { root: tmpRoot });
      assert.equal(r.ok, false);
      assert.equal(r.output, null);
      assert.ok(r.errors.some((e) => e.includes('not found')));
    });
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('readPoolOutput malformed JSON returns ok:false, output:null, no throw', () => {
  const tmpRoot = makePoolFixture('wc_bad', 'builder', '{ not valid json !!!');
  try {
    assert.doesNotThrow(() => {
      const r = readPoolOutput('wc_bad', 'builder', { root: tmpRoot });
      assert.equal(r.ok, false);
      assert.equal(r.output, null);
      assert.ok(r.errors.some((e) => e.includes('malformed')));
    });
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('readPoolOutput traversal runId is rejected', () => {
  const r = readPoolOutput('../escape', 'builder');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('runId')));
});

test('readPoolOutput traversal role is rejected', () => {
  const r = readPoolOutput('wc_ok', '../escape');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('role')));
});

test('readPoolOutput empty or non-string runId is rejected', () => {
  assert.equal(readPoolOutput('', 'builder').ok, false);
  assert.ok(readPoolOutput('', 'builder').errors.some((e) => e.includes('runId')));
  assert.equal(readPoolOutput(42, 'builder').ok, false);
  assert.equal(readPoolOutput(null, 'builder').ok, false);
});

test('readPoolOutput empty or non-string role is rejected', () => {
  assert.equal(readPoolOutput('wc_ok', '').ok, false);
  assert.ok(readPoolOutput('wc_ok', '').errors.some((e) => e.includes('role')));
  assert.equal(readPoolOutput('wc_ok', null).ok, false);
  assert.equal(readPoolOutput('wc_ok', 99).ok, false);
});

test('readPoolOutput non-standard role warns but does not error when file exists', () => {
  const tmpRoot = makePoolFixture('wc_prime', 'prime', JSON.stringify({ outputs: [], evidenceRefs: [] }));
  try {
    const r = readPoolOutput('wc_prime', 'prime', { root: tmpRoot });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.includes('prime') || w.includes('not a standard')));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('readPoolOutput validation enabled includes validation result', () => {
  const tmpRoot = makePoolFixture('wc_valok', 'builder', JSON.stringify({ outputs: [], evidenceRefs: [] }));
  try {
    const r = readPoolOutput('wc_valok', 'builder', { root: tmpRoot });
    assert.equal(r.ok, true);
    assert.ok(r.validation !== null);
    assert.equal(r.validation.ok, true);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('readPoolOutput validate:false skips validation, validation is null', () => {
  const tmpRoot = makePoolFixture('wc_skipval', 'builder', JSON.stringify({ outputs: 'not-an-array' }));
  try {
    const r = readPoolOutput('wc_skipval', 'builder', { root: tmpRoot, validate: false });
    assert.equal(r.ok, true);
    assert.equal(r.validation, null);
    assert.ok(r.output !== null);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Phase 4B — estimateWorkcellTokens
// ---------------------------------------------------------------------------

test('estimateWorkcellTokens valid 3-node decomposition returns correct totals', () => {
  const decomp = buildDecomposition({
    goal: 'estimate 3 nodes',
    nodes: [
      { id: 'n1', role: 'scout', filesInScope: ['_SYSTEM/INDEX.md'] },
      { id: 'n2', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md', '_SYSTEM/Scripts/yuri-workcell.mjs'] },
      { id: 'n3', role: 'guardrail', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.test.mjs'] },
    ],
    edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }],
  });
  const r = estimateWorkcellTokens(decomp);
  assert.equal(r.ok, true);
  assert.equal(r.estimatorVersion, 'chars_div_4_v1');
  assert.equal(r.nodes.length, 3);
  assert.equal(r.totalTokens, r.totalInputTokens + r.totalOutputTokens);
  assert.ok(r.totalTokens > 0);
  assert.equal(r.budget, null);
});

test('estimateWorkcellTokens single node math matches chars_div_4_v1', () => {
  const decomp = buildDecomposition({
    goal: 'single node math',
    nodes: [{ id: 'solo', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });
  const r = estimateWorkcellTokens(decomp);
  assert.equal(r.ok, true);
  assert.equal(r.nodes.length, 1);
  // inputTokens = ceil((24000 + 4000 + 1*8000) / 4) = 9000
  assert.equal(r.nodes[0].inputTokens, 9000);
  // outputTokens = ceil(12000 / 4) = 3000
  assert.equal(r.nodes[0].outputTokens, 3000);
  assert.equal(r.nodes[0].totalTokens, 12000);
  assert.equal(r.totalTokens, 12000);
});

test('estimateWorkcellTokens null or missing dagValidation returns ok:false', () => {
  assert.equal(estimateWorkcellTokens(null).ok, false);
  assert.equal(estimateWorkcellTokens({}).ok, false);
  const noNodes = { dagValidation: { ok: true }, nodes: [], edges: [] };
  assert.equal(estimateWorkcellTokens(noNodes).ok, false);
  assert.ok(estimateWorkcellTokens(noNodes).errors.some((e) => e.includes('node')));
});

test('estimateWorkcellTokens failed dagValidation returns ok:false', () => {
  const decomp = buildDecomposition({
    goal: 'cyclic fail',
    nodes: [
      { id: 'a', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] },
      { id: 'b', role: 'guardrail', filesInScope: ['_SYSTEM/Scripts/yuri-workcell.test.mjs'] },
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  });
  assert.equal(decomp.dagValidation.ok, false);
  const r = estimateWorkcellTokens(decomp);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('dagValidation')));
});

test('estimateWorkcellTokens custom capsuleBytesPerNode changes inputTokens', () => {
  const decomp = buildDecomposition({
    goal: 'custom capsule',
    nodes: [{ id: 'n', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });
  const rDefault = estimateWorkcellTokens(decomp);
  // 0 capsule: ceil((0 + 4000 + 8000) / 4) = 3000
  const rCustom = estimateWorkcellTokens(decomp, { capsuleBytesPerNode: 0 });
  assert.equal(rCustom.nodes[0].inputTokens, 3000);
  assert.ok(rCustom.nodes[0].inputTokens < rDefault.nodes[0].inputTokens);
});

test('estimateWorkcellTokens custom fileSizeEstimate scales with filesInScope count', () => {
  const decomp = buildDecomposition({
    goal: 'scale test',
    nodes: [{ id: 'n', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md', '_SYSTEM/Scripts/yuri-workcell.mjs'] }],
    edges: [],
  });
  // fileSizeEstimate=0: contextBytes=0, inputTokens=ceil((24000+4000+0)/4)=7000
  const rZero = estimateWorkcellTokens(decomp, { fileSizeEstimate: 0 });
  // fileSizeEstimate=16000: contextBytes=2*16000=32000, inputTokens=ceil((24000+4000+32000)/4)=15000
  const rLarge = estimateWorkcellTokens(decomp, { fileSizeEstimate: 16000 });
  assert.equal(rZero.nodes[0].inputTokens, 7000);
  assert.equal(rLarge.nodes[0].inputTokens, 15000);
});

test('estimateWorkcellTokens budget ceiling above totalTokens passes with withinBudget:true', () => {
  const decomp = buildDecomposition({
    goal: 'budget pass',
    nodes: [{ id: 'n', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });
  const r = estimateWorkcellTokens(decomp, { budget: { ceiling: 1000000 } });
  assert.equal(r.ok, true);
  assert.ok(r.budget !== null);
  assert.equal(r.budget.withinBudget, true);
  assert.equal(r.budget.actual, r.totalTokens);
  assert.equal(r.budget.ceiling, 1000000);
});

test('estimateWorkcellTokens budget ceiling below totalTokens fails with withinBudget:false', () => {
  const decomp = buildDecomposition({
    goal: 'budget fail',
    nodes: [{ id: 'n', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });
  // totalTokens = 12000, ceiling = 1 → 12000 >= 1 → withinBudget:false
  const r = estimateWorkcellTokens(decomp, { budget: { ceiling: 1 } });
  assert.equal(r.ok, false);
  assert.ok(r.budget !== null);
  assert.equal(r.budget.withinBudget, false);
  assert.ok(r.errors.some((e) => e.includes('ceiling')));
});

test('estimateWorkcellTokens warnAt breached but under ceiling produces ok:true with warning', () => {
  const decomp = buildDecomposition({
    goal: 'warnAt test',
    nodes: [{ id: 'n', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });
  // totalTokens = 12000, warnAt = 1 < 12000 < ceiling = 1000000
  const r = estimateWorkcellTokens(decomp, { budget: { ceiling: 1000000, warnAt: 1 } });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('warnAt') || w.includes('threshold')));
  assert.equal(r.budget.withinBudget, true);
});

// ---------------------------------------------------------------------------
// Prime S5 — Phase 4B supercharge tests
// ---------------------------------------------------------------------------

test('readPoolOutput validation failure propagates errors to top-level', () => {
  const badOutput = { outputs: 'not-an-array', evidenceRefs: [] };
  const tmpRoot = makePoolFixture('wc_valfail', 'builder', JSON.stringify(badOutput));
  try {
    const r = readPoolOutput('wc_valfail', 'builder', { root: tmpRoot });
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
    assert.ok(r.errors.some((e) => e.includes('validation:')));
    assert.ok(r.validation !== null);
    assert.equal(r.validation.ok, false);
    assert.ok(r.output !== null);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('estimateWorkcellTokens budget ceiling exactly equals totalTokens fails', () => {
  const decomp = buildDecomposition({
    goal: 'boundary test',
    nodes: [{ id: 'n', role: 'builder', filesInScope: ['_SYSTEM/INDEX.md'] }],
    edges: [],
  });
  // totalTokens = 12000, ceiling = 12000 → 12000 < 12000 is false → withinBudget:false
  const r = estimateWorkcellTokens(decomp, { budget: { ceiling: 12000 } });
  assert.equal(r.ok, false);
  assert.equal(r.budget.withinBudget, false);
});

test('estimateWorkcellTokens earlyFail returns independent arrays', () => {
  const r1 = estimateWorkcellTokens(null);
  const r2 = estimateWorkcellTokens(null);
  r1.warnings.push('mutated');
  assert.equal(r2.warnings.length, 0);
});
