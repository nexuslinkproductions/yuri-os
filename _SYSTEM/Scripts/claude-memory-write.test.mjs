import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectIdFromCwd,
  assertSafeName,
  assertSafePath,
  handleFromNameAndType,
  parseEntryMeta,
  VALID_TYPES,
  VALID_TIERS,
  VALID_SCOPES,
  HANDLE_PREFIX,
  FORBIDDEN_SEGMENTS,
} from './claude-memory-write.mjs';

test('projectIdFromCwd produces Claude Code project-id convention', () => {
  assert.equal(
    projectIdFromCwd('/example/path/sample-repo'),
    '-example-path-sample-repo'
  );
});

test('projectIdFromCwd trims trailing slash', () => {
  assert.equal(
    projectIdFromCwd('/example/path/sample-repo/'),
    '-example-path-sample-repo'
  );
});

test('projectIdFromCwd handles single-segment path', () => {
  assert.equal(projectIdFromCwd('/repo'), '-repo');
});

test('assertSafeName accepts kebab-case', () => {
  assert.doesNotThrow(() => assertSafeName('feedback-tool-routing-heuristic'));
  assert.doesNotThrow(() => assertSafeName('project_paper_sprint'));
  assert.doesNotThrow(() => assertSafeName('a'));
});

test('assertSafeName rejects path traversal', () => {
  assert.throws(() => assertSafeName('../../etc/passwd'));
  assert.throws(() => assertSafeName('a/b'));
  assert.throws(() => assertSafeName('a\\b'));
});

test('assertSafeName rejects uppercase and special chars', () => {
  assert.throws(() => assertSafeName('CamelCase'));
  assert.throws(() => assertSafeName('with space'));
  assert.throws(() => assertSafeName('with.dot'));
});

test('assertSafePath rejects escape from root', () => {
  const root = '/tmp/fake-memory-root';
  assert.throws(() => assertSafePath('/tmp/elsewhere/file.md', root));
  assert.throws(() => assertSafePath('/etc/passwd', root));
});

test('assertSafePath accepts paths under root', () => {
  const root = '/tmp/fake-memory-root';
  assert.doesNotThrow(() => assertSafePath('/tmp/fake-memory-root/entry.md', root));
});

test('assertSafePath rejects forbidden segments', () => {
  const root = '/tmp/fake-memory-root';
  for (const seg of FORBIDDEN_SEGMENTS) {
    assert.throws(
      () => assertSafePath(`/tmp/fake-memory-root/${seg}/entry.md`, root),
      `must reject forbidden segment "${seg}"`
    );
  }
});

test('VALID_TYPES covers the documented four memory types', () => {
  assert.equal(VALID_TYPES.size, 4);
  for (const t of ['feedback', 'reference', 'project', 'user']) {
    assert.ok(VALID_TYPES.has(t), `must include "${t}"`);
  }
});

test('FORBIDDEN_SEGMENTS protects sensitive Claude project subdirs', () => {
  for (const seg of ['history', 'state', 'file-history', 'worktrees', 'transcripts']) {
    assert.ok(FORBIDDEN_SEGMENTS.has(seg), `must forbid "${seg}"`);
  }
});

// v3 format tests

test('handleFromNameAndType strips type prefix and uppercases the slug', () => {
  assert.equal(handleFromNameAndType('feedback-route-to-quantum', 'feedback'), 'FB:ROUTE-TO-QUANTUM');
  assert.equal(handleFromNameAndType('reference-jan-meister', 'reference'), 'REF:JAN-MEISTER');
  assert.equal(handleFromNameAndType('project-paper-sprint', 'project'), 'PROJ:PAPER-SPRINT');
  assert.equal(handleFromNameAndType('user-likes-pasta', 'user'), 'USR:LIKES-PASTA');
});

test('handleFromNameAndType normalizes legacy underscore separators', () => {
  assert.equal(handleFromNameAndType('feedback_codex_powerhouse_nim_scope', 'feedback'), 'FB:CODEX-POWERHOUSE-NIM-SCOPE');
  assert.equal(handleFromNameAndType('project_kagami_audit_template', 'project'), 'PROJ:KAGAMI-AUDIT-TEMPLATE');
});

test('handleFromNameAndType handles names without type prefix', () => {
  assert.equal(handleFromNameAndType('codex-engineering-lessons', 'feedback'), 'FB:CODEX-ENGINEERING-LESSONS');
});

test('handleFromNameAndType throws on unknown type', () => {
  assert.throws(() => handleFromNameAndType('foo-bar', 'invalid'));
});

test('parseEntryMeta extracts description and type from frontmatter', () => {
  const sample = [
    '---',
    'name: feedback-foo',
    'description: A feedback entry about foo',
    'metadata:',
    '  type: feedback',
    '  tier: working',
    '---',
    '',
    'RULE  Do the thing.',
  ].join('\n');
  const meta = parseEntryMeta(sample);
  assert.equal(meta.description, 'A feedback entry about foo');
  assert.equal(meta.type, 'feedback');
});

test('parseEntryMeta returns nulls for malformed input', () => {
  assert.deepEqual(parseEntryMeta('no frontmatter here'), { description: null, type: null });
});

test('VALID_TIERS covers the three documented memory tiers', () => {
  assert.equal(VALID_TIERS.size, 3);
  for (const t of ['working', 'episodic', 'semantic']) {
    assert.ok(VALID_TIERS.has(t));
  }
});

test('VALID_SCOPES covers main/all/claude', () => {
  assert.equal(VALID_SCOPES.size, 3);
  for (const s of ['main', 'all', 'claude']) {
    assert.ok(VALID_SCOPES.has(s));
  }
});

test('HANDLE_PREFIX maps all four types', () => {
  assert.equal(HANDLE_PREFIX.feedback, 'FB');
  assert.equal(HANDLE_PREFIX.reference, 'REF');
  assert.equal(HANDLE_PREFIX.project, 'PROJ');
  assert.equal(HANDLE_PREFIX.user, 'USR');
});
