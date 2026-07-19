import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  GENERATED_ADAPTER_MARKER,
  assertUniqueSourceIds,
  buildProjectionPlan,
  checkProjection,
  normalizeAdapterFrontmatter,
  readGitIndex,
  readSource,
  syncProjection,
} from './yuri-codex-skill-projector.mjs';
import { showSkill } from './skill-recall.mjs';
import { stableSkillBody } from './yuri-skill-loader.mjs';

const TMP_PREFIX = '/private/tmp/yuri-codex-skill-projector-';
const SMALL_COUNTS = { expectedArmedCount: 1, expectedGatedCount: 1 };

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input: options.input,
    stdio: options.input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function write(root, relativePath, body) {
  const absolute = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, body, 'utf8');
}

function writeJson(root, relativePath, value) {
  write(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function stableHash(body) {
  return createHash('sha256').update(stableSkillBody(body)).digest('hex').slice(0, 16);
}

function skill(name, description, body = '') {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`;
}

function initRepo(prefix = TMP_PREFIX) {
  const root = mkdtempSync(prefix);
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@yuri.invalid']);
  git(root, ['config', 'user.name', 'YURI fixture']);
  return root;
}

function writeControlFiles(root, { canonical, armed = [], gated = [], integrity = {} }) {
  writeJson(root, 'skills/skill-index.json', {
    schemaVersion: 1,
    canonicalRoot: 'skills',
    count: canonical.length,
    skills: canonical.map((value) => {
      const entry = typeof value === 'string' ? { id: value } : value;
      return { ...entry, path: `skills/${entry.id}/SKILL.md`, sourceFamily: 'fixture' };
    }),
  });
  writeJson(root, '_SYSTEM/config/cyber-skill-registry.json', {
    version: 'cyber-v1',
    source: 'fixture',
    license: 'fixture-only',
    generated: '2026-07-19T00:00:00Z',
    armedCount: armed.length,
    gatedCount: gated.length,
    armed,
    gated,
  });
  writeJson(root, '_SYSTEM/config/codex-skill-collision-registry.json', {
    schemaVersion: 1,
    resolution: 'exact-user-config-disable',
    rules: { runtimeProof: 'fixture' },
    collisions: [],
  });
  writeJson(root, '_SYSTEM/skill-hash-registry.json', integrity);
}

function normalFixture() {
  const root = initRepo();
  const bodies = {
    alpha: skill('alpha', 'Canonical alpha fixture.', 'SOURCE_ALPHA_ONLY'),
    pending: skill('pending', 'Untracked canonical fixture.', 'SOURCE_PENDING_ONLY'),
    'cyber-network-audit': skill('cyber-network-audit', 'Defensive network audit fixture.', 'SOURCE_ARMED_ONLY'),
    'cyber-dual-lab': skill('cyber-dual-lab', 'Authorized laboratory fixture.', 'SOURCE_LAB_ONLY'),
  };
  write(root, 'skills/alpha/SKILL.md', bodies.alpha);
  write(root, 'skills/alpha/scripts/tool.sh', '#!/bin/sh\nexit 0\n');
  write(root, 'skills/pending/SKILL.md', bodies.pending);
  write(root, '.claude/skills/cyber-network-audit/SKILL.md', bodies['cyber-network-audit']);
  write(root, '.claude/skills-labgated/cyber-dual-lab/SKILL.md', bodies['cyber-dual-lab']);

  const integrity = Object.fromEntries(Object.entries(bodies).map(([id, body]) => [id, {
    source_path: id === 'alpha' || id === 'pending'
      ? `skills/${id}/SKILL.md`
      : id === 'cyber-network-audit'
        ? '.claude/skills/cyber-network-audit/SKILL.md'
        : '.claude/skills-labgated/cyber-dual-lab/SKILL.md',
    hash: stableHash(body),
  }]));
  writeControlFiles(root, {
    canonical: [{
      id: 'alpha',
      operationalStatus: 'quarantined-stale',
      statusReason: 'fixture stale doctrine',
    }, 'pending'],
    armed: [{ name: 'network-audit', path: 'skills/network-audit', description: 'Defensive network audit fixture.' }],
    gated: [{
      name: 'dual-lab',
      path: 'skills/dual-lab',
      description: 'Authorized laboratory fixture.',
      reason: 'owner lab only\n`INJECT` <unsafe>',
    }],
    integrity,
  });

  git(root, ['add', '--',
    'skills/alpha/SKILL.md',
    '.claude/skills/cyber-network-audit/SKILL.md',
    '.claude/skills-labgated/cyber-dual-lab/SKILL.md',
    'skills/skill-index.json',
    '_SYSTEM/config/cyber-skill-registry.json',
    '_SYSTEM/config/codex-skill-collision-registry.json',
    '_SYSTEM/skill-hash-registry.json',
  ]);
  return { root, bodies };
}

function minimalFixture(canonicalId) {
  const root = initRepo();
  writeControlFiles(root, { canonical: [canonicalId], integrity: {} });
  git(root, ['add', '--',
    'skills/skill-index.json',
    '_SYSTEM/config/cyber-skill-registry.json',
    '_SYSTEM/config/codex-skill-collision-registry.json',
    '_SYSTEM/skill-hash-registry.json',
  ]);
  return root;
}

test('adapter metadata is bounded and normalized IDs collide before unsafe publication', () => {
  const frontmatter = '---\nname: upstream-name\ndescription: >\n  A long fixture description.\n---';
  const normalized = normalizeAdapterFrontmatter(frontmatter, 'governed-name', {
    sourceClass: 'labgated',
    riskReason: 'lab only\n`IGNORE` <tag>',
  });
  assert.match(normalized, /^---\nname: governed-name\ndescription: /);
  const description = JSON.parse(normalized.match(/^description: (.+)$/m)[1]);
  assert.ok(description.length <= 1024);
  assert.equal(description.includes('\n'), false);
  assert.equal(description.includes('`'), false);
  assert.equal(description.includes('<'), false);
  assert.throws(
    () => assertUniqueSourceIds([{ id: 'foo-bar' }, { id: 'foo_bar' }]),
    (error) => error?.code === 'SOURCE_ID_COLLISION',
  );
});

test('projection is exact, pointer-only, and honest for tracked plus pending sources', () => {
  const { root, bodies } = normalFixture();
  const before = buildProjectionPlan(root, SMALL_COUNTS);
  assert.deepEqual(before.counts, { canonical: 2, armed: 1, labgated: 1, total: 4 });
  assert.equal(before.integrityMismatches.length, 0);
  assert.equal(before.unresolvedLegacyConflicts.length, 0);
  assert.equal(before.labgatedBannerDrift.length, 1, 'historical source-banner drift is warning-only');

  const synced = syncProjection(root, SMALL_COUNTS);
  assert.equal(synced.ok, true);
  assert.equal(synced.written.length, 5, 'four adapters plus one manifest');
  const checked = checkProjection(root, SMALL_COUNTS);
  assert.equal(checked.ok, true);

  const manifest = JSON.parse(readFileSync(path.join(root, '.agents/skills/.yuri-projection.json'), 'utf8'));
  assert.equal(manifest.projection.count, 4);
  const pending = manifest.skills.find((entry) => entry.id === 'pending');
  assert.equal(pending.tracked, false);
  assert.equal(pending.durability, 'pending-commit');
  assert.equal(pending.provenanceSource, 'worktree-prospective');
  assert.equal(pending.sourceMatchesGitIndex, null);
  assert.match(pending.gitBlobOid, /^[a-f0-9]{40,64}$/);
  assert.equal(pending.gitMode, '100644');
  const tracked = manifest.skills.find((entry) => entry.id === 'alpha');
  assert.equal(tracked.tracked, true);
  assert.equal(tracked.durability, 'git-index');
  assert.equal(tracked.sourceMatchesGitIndex, true);
  assert.equal(tracked.operationalStatus, 'quarantined-stale');
  assert.equal(tracked.statusReason, 'fixture stale doctrine');

  for (const entry of manifest.skills) {
    const adapterPath = path.join(root, '.agents/skills', entry.id, 'SKILL.md');
    const adapter = readFileSync(adapterPath, 'utf8');
    assert.equal(lstatSync(adapterPath).isFile(), true);
    assert.equal(lstatSync(adapterPath).isSymbolicLink(), false);
    assert.deepEqual(readdirSync(path.dirname(adapterPath)), ['SKILL.md']);
    assert.ok(adapter.includes(GENERATED_ADAPTER_MARKER));
    assert.ok(adapter.includes(entry.sourcePath));
    assert.ok(adapter.includes(entry.sourceSha256));
    assert.equal(adapter.includes('SOURCE_ALPHA_ONLY'), false);
    assert.equal(adapter.includes('SOURCE_PENDING_ONLY'), false);
    assert.equal(adapter.includes('SOURCE_ARMED_ONLY'), false);
    assert.equal(adapter.includes('SOURCE_LAB_ONLY'), false);
  }
  const labAdapter = readFileSync(path.join(root, '.agents/skills/cyber-dual-lab/SKILL.md'), 'utf8');
  assert.ok(labAdapter.includes('Runtime/action authorization: `false`'));
  assert.equal(labAdapter.includes('`INJECT`'), false);
  assert.equal(labAdapter.includes('<unsafe>'), false);
  const quarantinedAdapter = readFileSync(path.join(root, '.agents/skills/alpha/SKILL.md'), 'utf8');
  assert.match(quarantinedAdapter, /QUARANTINED STALE DOCTRINE/);
  assert.match(quarantinedAdapter, /Do not use the source as current operational doctrine/);
  assert.doesNotMatch(quarantinedAdapter, /Follow that source as the skill body/);
  assert.equal(existsSync(path.join(root, '.agents/skills/alpha/scripts')), false, 'support files are never copied');

  const shown = showSkill('pending', { root });
  assert.equal(shown.content, bodies.pending);
  assert.equal(shown.skill.tracked, false);
  assert.equal(shown.skill.durability, 'pending-commit');
});

test('sparse-hidden Git mode 120000 skill sources fail closed', () => {
  const root = minimalFixture('linked');
  const objectId = git(root, ['hash-object', '-w', '--stdin'], { input: '../target/SKILL.md\n' });
  git(root, ['update-index', '--add', '--cacheinfo', `120000,${objectId},skills/linked/SKILL.md`]);
  assert.throws(
    () => buildProjectionPlan(root, { expectedArmedCount: 0, expectedGatedCount: 0 }),
    (error) => error?.code === 'SYMLINK_REFUSED',
  );
  assert.throws(
    () => readSource(root, 'skills/linked/SKILL.md', readGitIndex(root)),
    (error) => error?.code === 'SYMLINK_REFUSED',
  );
});

test('worktree symlink components fail closed', () => {
  const root = minimalFixture('linked');
  write(root, 'fixture-target/SKILL.md', skill('linked', 'Linked fixture must be refused.'));
  mkdirSync(path.join(root, 'skills'), { recursive: true });
  symlinkSync('../fixture-target', path.join(root, 'skills/linked'));
  assert.throws(
    () => buildProjectionPlan(root, { expectedArmedCount: 0, expectedGatedCount: 0 }),
    (error) => error?.code === 'SYMLINK_REFUSED',
  );
});

test('tracked source drift is rejected instead of projected as staged truth', () => {
  const { root } = normalFixture();
  write(root, 'skills/alpha/SKILL.md', skill('alpha', 'Changed after staging.'));
  assert.throws(
    () => buildProjectionPlan(root, SMALL_COUNTS),
    (error) => error?.code === 'TRACKED_SOURCE_DRIFT',
  );
});

test('unmanaged destinations are never overwritten', () => {
  const { root } = normalFixture();
  write(root, '.agents/skills/alpha/SKILL.md', 'owner content\n');
  assert.throws(
    () => buildProjectionPlan(root, SMALL_COUNTS),
    (error) => error?.code === 'UNMANAGED_OVERWRITE_REFUSED',
  );
  assert.equal(readFileSync(path.join(root, '.agents/skills/alpha/SKILL.md'), 'utf8'), 'owner content\n');
});

test('integrity mismatch blocks sync', () => {
  const { root } = normalFixture();
  writeJson(root, '_SYSTEM/skill-hash-registry.json', {});
  assert.throws(
    () => syncProjection(root, SMALL_COUNTS),
    (error) => error?.code === 'INTEGRITY_MISMATCH' && error.detail.mismatches.length === 4,
  );
  assert.equal(existsSync(path.join(root, '.agents/skills/alpha/SKILL.md')), false);
});

test('stale managed adapters are reported and preserved, never removed', () => {
  const { root } = normalFixture();
  assert.equal(syncProjection(root, SMALL_COUNTS).ok, true);
  write(root, '.agents/skills/old-skill/SKILL.md', `---\nname: old-skill\ndescription: stale fixture\n---\n\n${GENERATED_ADAPTER_MARKER}\n`);
  const checked = checkProjection(root, SMALL_COUNTS);
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.drift.staleAdapters.map((entry) => entry.id), ['old-skill']);
  const synced = syncProjection(root, SMALL_COUNTS);
  assert.equal(synced.ok, false);
  assert.equal(existsSync(path.join(root, '.agents/skills/old-skill/SKILL.md')), true);
});

test('path traversal and non-canonical cyber registry names fail closed', () => {
  const { root } = normalFixture();
  assert.throws(
    () => readSource(root, '../escape/SKILL.md', readGitIndex(root)),
    (error) => error?.code === 'PATH_TRAVERSAL',
  );
  const registryPath = path.join(root, '_SYSTEM/config/cyber-skill-registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  registry.armed[0].name = 'Network_Audit';
  writeJson(root, '_SYSTEM/config/cyber-skill-registry.json', registry);
  assert.throws(
    () => buildProjectionPlan(root, SMALL_COUNTS),
    (error) => error?.code === 'INVALID_CYBER_MANIFEST',
  );
});
