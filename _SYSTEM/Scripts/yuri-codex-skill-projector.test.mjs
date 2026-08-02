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
  GENERATED_NATIVE_POLICY_MARKER,
  LABGATED_BANNER,
  NATIVE_IMPLICIT_SKILL_ID,
  NATIVE_POLICY_RELATIVE_PATH,
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

function nativeInvocationFixture() {
  const root = initRepo();
  const bodies = {
    [NATIVE_IMPLICIT_SKILL_ID]: skill(NATIVE_IMPLICIT_SKILL_ID, 'Recall governed YURI skills before substantive work.'),
    alpha: skill('alpha', 'Explicit-only alpha fixture.', 'SOURCE_ALPHA_ONLY'),
  };
  for (const [id, body] of Object.entries(bodies)) write(root, `skills/${id}/SKILL.md`, body);
  writeControlFiles(root, {
    canonical: [NATIVE_IMPLICIT_SKILL_ID, 'alpha'],
    integrity: Object.fromEntries(Object.entries(bodies).map(([id, body]) => [id, {
      source_path: `skills/${id}/SKILL.md`,
      hash: stableHash(body),
    }])),
  });
  git(root, ['add', '--',
    `skills/${NATIVE_IMPLICIT_SKILL_ID}/SKILL.md`,
    'skills/alpha/SKILL.md',
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
  assert.deepEqual(before.counts, {
    canonical: 2,
    armed: 1,
    labgated: 1,
    total: 4,
    nativeImplicit: 0,
    nativeExplicitOnly: 4,
  });
  assert.equal(before.integrityMismatches.length, 0);
  assert.equal(before.unresolvedLegacyConflicts.length, 0);
  assert.equal(before.labgatedBannerDrift.length, 1, 'historical source-banner drift is warning-only');

  const synced = syncProjection(root, SMALL_COUNTS);
  assert.equal(synced.ok, true);
  assert.equal(synced.written.length, 9, 'four adapters plus four native policies plus one manifest');
  const checked = checkProjection(root, SMALL_COUNTS);
  assert.equal(checked.ok, true);

  const manifest = JSON.parse(readFileSync(path.join(root, '.agents/skills/.yuri-projection.json'), 'utf8'));
  assert.equal(manifest.projection.count, 4);
  assert.deepEqual(manifest.projection.nativeInvocation, {
    sidecarRelativePath: NATIVE_POLICY_RELATIVE_PATH,
    provenance: '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs',
    implicit: { count: 0, ids: [] },
    explicitOnly: { count: 4 },
  });
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
    assert.deepEqual(readdirSync(path.dirname(adapterPath)).sort(), ['SKILL.md', 'agents']);
    assert.ok(adapter.includes(GENERATED_ADAPTER_MARKER));
    assert.ok(adapter.includes(entry.sourcePath));
    assert.ok(adapter.includes(entry.sourceSha256));
    assert.equal(adapter.includes('SOURCE_ALPHA_ONLY'), false);
    assert.equal(adapter.includes('SOURCE_PENDING_ONLY'), false);
    assert.equal(adapter.includes('SOURCE_ARMED_ONLY'), false);
    assert.equal(adapter.includes('SOURCE_LAB_ONLY'), false);

    const nativePolicyPath = path.join(root, entry.nativeInvocation.sidecarPath);
    const nativePolicyDirectory = path.dirname(nativePolicyPath);
    const nativePolicy = readFileSync(nativePolicyPath, 'utf8');
    assert.equal(lstatSync(nativePolicyDirectory).isDirectory(), true);
    assert.equal(lstatSync(nativePolicyDirectory).isSymbolicLink(), false);
    assert.equal(lstatSync(nativePolicyPath).isFile(), true);
    assert.equal(lstatSync(nativePolicyPath).isSymbolicLink(), false);
    assert.deepEqual(readdirSync(nativePolicyDirectory), ['openai.yaml']);
    assert.equal(nativePolicy, `${GENERATED_NATIVE_POLICY_MARKER}\npolicy:\n  allow_implicit_invocation: false\n`);
    assert.equal(createHash('sha256').update(nativePolicy).digest('hex'), entry.nativeInvocation.sidecarSha256);
    assert.equal(entry.nativeInvocation.allowImplicitInvocation, false);
    assert.equal(entry.nativeInvocation.provenance.governedSkillId, entry.id);
    assert.equal(entry.nativeInvocation.provenance.policyClass, 'explicit-only');
    assert.equal(nativePolicy.includes('SOURCE_'), false, 'native policy must never duplicate skill instructions');
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

test('native policy keeps only the recall meta-router implicit and detects sidecar drift without deletion', () => {
  const root = nativeInvocationFixture();
  const options = { expectedArmedCount: 0, expectedGatedCount: 0 };
  const before = checkProjection(root, options);
  assert.equal(before.ok, false);
  assert.equal(before.drift.missingNativePolicySidecars.length, 2);

  const synced = syncProjection(root, options);
  assert.equal(synced.ok, true);
  assert.deepEqual(synced.counts, {
    canonical: 2,
    armed: 0,
    labgated: 0,
    total: 2,
    nativeImplicit: 1,
    nativeExplicitOnly: 1,
  });
  const manifest = JSON.parse(readFileSync(path.join(root, '.agents/skills/.yuri-projection.json'), 'utf8'));
  assert.deepEqual(manifest.projection.nativeInvocation.implicit, {
    count: 1,
    ids: [NATIVE_IMPLICIT_SKILL_ID],
  });
  assert.deepEqual(manifest.projection.nativeInvocation.explicitOnly, { count: 1 });

  const implicitPolicyPath = path.join(
    root,
    '.agents/skills',
    NATIVE_IMPLICIT_SKILL_ID,
    ...NATIVE_POLICY_RELATIVE_PATH.split('/'),
  );
  assert.equal(
    readFileSync(implicitPolicyPath, 'utf8'),
    `${GENERATED_NATIVE_POLICY_MARKER}\npolicy:\n  allow_implicit_invocation: true\n`,
  );

  const explicitPolicyPath = path.join(root, '.agents/skills/alpha', ...NATIVE_POLICY_RELATIVE_PATH.split('/'));
  writeFileSync(explicitPolicyPath, `${GENERATED_NATIVE_POLICY_MARKER}\npolicy:\n  allow_implicit_invocation: true\n`, 'utf8');
  const drifted = checkProjection(root, options);
  assert.equal(drifted.ok, false);
  assert.deepEqual(drifted.drift.driftedNativePolicySidecars, ['.agents/skills/alpha/agents/openai.yaml']);
  assert.equal(existsSync(explicitPolicyPath), true, 'check must preserve a drifted managed policy');

  const repaired = syncProjection(root, options);
  assert.equal(repaired.ok, true);
  assert.equal(existsSync(explicitPolicyPath), true, 'sync repairs in place and never deletes the policy');
  assert.equal(
    readFileSync(explicitPolicyPath, 'utf8'),
    `${GENERATED_NATIVE_POLICY_MARKER}\npolicy:\n  allow_implicit_invocation: false\n`,
  );
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

test('repo-relative collision entries resolve against the ACTIVE repoRoot, never a hard-coded canonical path', () => {
  const { root } = normalFixture();
  write(root, '.codex/skills/alpha/SKILL.md', skill('alpha', 'Native collision fixture.', 'NATIVE_ALPHA'));
  const registryPath = path.join(root, '_SYSTEM/config/codex-skill-collision-registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  registry.collisions = [{
    adapterId: 'alpha',
    legacyPath: '.codex/skills/alpha/SKILL.md',
    state: 'current',
    requiredEnabled: true,
  }];
  writeJson(root, '_SYSTEM/config/codex-skill-collision-registry.json', registry);
  const plan = buildProjectionPlan(root, SMALL_COUNTS);
  assert.deepEqual(plan.unresolvedLegacyConflicts, [], 'relative entry must cover the local candidate');
  const entry = plan.legacyConflicts.find((conflict) => conflict.id === 'alpha');
  assert.ok(entry, 'alpha collision must appear in the ledger');
  assert.equal(entry.legacyPath, '.codex/skills/alpha/SKILL.md', 'ledger must keep the raw registry-relative value for the byte-for-byte manifest ledger contract');
  const manifest = typeof plan.manifest === 'string' ? JSON.parse(plan.manifest) : plan.manifest;
  const ledgerEntry = manifest.externalNativeCollisionLedger?.find((ledger) => ledger.id === 'alpha');
  assert.equal(ledgerEntry?.legacyPath, '.codex/skills/alpha/SKILL.md', 'projection-manifest collision ledger must carry the raw relative value');
});

test('machine-global absolute collision entries are preserved verbatim', () => {
  const { root } = normalFixture();
  const registryPath = path.join(root, '_SYSTEM/config/codex-skill-collision-registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  registry.collisions = [{
    adapterId: 'alpha',
    legacyPath: '/Users/marcelspatz/.codex/skills/.system/alpha/SKILL.md',
    state: 'current',
    requiredEnabled: true,
  }];
  writeJson(root, '_SYSTEM/config/codex-skill-collision-registry.json', registry);
  const plan = buildProjectionPlan(root, SMALL_COUNTS);
  const entry = plan.legacyConflicts.find((conflict) => conflict.id === 'alpha');
  assert.ok(entry, 'alpha collision must appear in the ledger');
  assert.equal(entry.legacyPath, '/Users/marcelspatz/.codex/skills/.system/alpha/SKILL.md', 'machine-global path must stay absolute');
  assert.equal(plan.unresolvedLegacyConflicts.length, 0);
});

test('traversal or malformed collision legacyPath entries fail closed', () => {
  const { root } = normalFixture();
  const registryPath = path.join(root, '_SYSTEM/config/codex-skill-collision-registry.json');
  const badPaths = [
    '../escape/SKILL.md',
    'a/../../escape/SKILL.md',
    '.codex/../escape/SKILL.md',
    '/Users/marcelspatz/../.codex/x/SKILL.md',
    '.codex//skills/alpha/SKILL.md',
    'a//b/SKILL.md',
    '/Users//marcelspatz/.codex/x/SKILL.md',
  ];
  for (const legacyPath of badPaths) {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    registry.collisions = [{ adapterId: 'alpha', legacyPath, state: 'current', requiredEnabled: true }];
    writeJson(root, '_SYSTEM/config/codex-skill-collision-registry.json', registry);
    assert.throws(
      () => buildProjectionPlan(root, SMALL_COUNTS),
      (error) => error?.code === 'PATH_TRAVERSAL',
      `expected PATH_TRAVERSAL for ${JSON.stringify(legacyPath)}`,
    );
  }
  for (const legacyPath of [42, '']) {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    registry.collisions = [{ adapterId: 'alpha', legacyPath, state: 'current', requiredEnabled: true }];
    writeJson(root, '_SYSTEM/config/codex-skill-collision-registry.json', registry);
    assert.throws(
      () => buildProjectionPlan(root, SMALL_COUNTS),
      (error) => error?.code === 'INVALID_COLLISION_REGISTRY',
      `expected INVALID_COLLISION_REGISTRY for ${JSON.stringify(legacyPath)}`,
    );
  }
  const unprojectedRegistry = JSON.parse(readFileSync(registryPath, 'utf8'));
  unprojectedRegistry.collisions = [{
    adapterId: 'ghost',
    legacyPath: 'a//b/SKILL.md',
    state: 'current',
    requiredEnabled: true,
  }];
  writeJson(root, '_SYSTEM/config/codex-skill-collision-registry.json', unprojectedRegistry);
  assert.throws(
    () => buildProjectionPlan(root, SMALL_COUNTS),
    (error) => error?.code === 'PATH_TRAVERSAL',
    'malformed paths must fail closed before an unprojected adapter is filtered from the ledger',
  );
});


// ===== Phase-B lab-gate banner reachability + pointer-purity suite =====
// Authoritative source for the canonical constant: projector.mjs:35 (exported).
// Per the advisory, the test fixture must alter the canonical .claude/skills-labgated/ source
// (NOT the .agents/ adapter) to exercise the real labgatedBannerDrift detector at projector.mjs:357.

test('labgated adapter body includes the exact canonical LABGATED_BANNER and is pointer-only', () => {
  const { root, bodies } = normalFixture();
  const synced = syncProjection(root, SMALL_COUNTS);
  assert.equal(synced.ok, true);
  const adapterPath = path.join(root, '.agents/skills/cyber-dual-lab/SKILL.md');
  const adapter = readFileSync(adapterPath, 'utf8');
  // Positive: exact canonical constant present in the adapter body.
  assert.ok(adapter.includes(LABGATED_BANNER), 'adapter body must include the exact canonical LABGATED_BANNER');
  // Pointer-only: adapter must NOT contain the source body content.
  const sourceBody = bodies['cyber-dual-lab'];
  const sourceBodyStripped = sourceBody.replace(/^---\n[\s\S]*?\n---\n/, '');
  assert.equal(adapter.includes(sourceBodyStripped), false, 'adapter must be pointer-only, not a source-body copy');
  // Adapter still emits the lab metadata block (backward-compatible).
  assert.ok(adapter.includes('Source class: `labgated`'));
  assert.ok(adapter.includes('Runtime/action authorization: `false`'));
  assert.ok(adapter.includes('Discovery does not authorize execution'));
});

test('non-labgated adapters do NOT include the canonical banner', () => {
  const { root } = normalFixture();
  syncProjection(root, SMALL_COUNTS);
  // Canonical (alpha) and armed (cyber-network-audit) adapters must stay clean.
  for (const id of ['alpha', 'cyber-network-audit']) {
    const adapterPath = path.join(root, '.agents/skills', id, 'SKILL.md');
    const adapter = readFileSync(adapterPath, 'utf8');
    assert.equal(adapter.includes(LABGATED_BANNER), false, `${id} adapter must NOT include the canonical banner`);
  }
});

test('source-layer banner drift is detected against canonical .claude/skills-labgated content, not against generated adapters', () => {
  // Fixture: replace the labgated source body's safety line with an ALTERNATE wording
  // (the historical partial banner observed in real labgated sources). The canonical
  // constant must be ABSENT from the source for the drift detector to fire.
  const { root } = normalFixture();
  const sourcePath = path.join(root, '.claude/skills-labgated/cyber-dual-lab/SKILL.md');
  const sourceBody = readFileSync(sourcePath, 'utf8');
  const alteredSource = sourceBody.replace(
    /AUTHORIZED-LAB ONLY[\s\S]*?authorized-engagement flag/,
    'AUTHORIZED-LAB ONLY. Alternate partial wording that does not include the canonical additional metadata-discovery clause.',
  );
  assert.equal(alteredSource.includes(LABGATED_BANNER), false, 'fixture setup: altered source must NOT contain the canonical constant');
  write(root, '.claude/skills-labgated/cyber-dual-lab/SKILL.md', alteredSource);
  // Keep the integrity registry coherent with the altered source so only the
  // bannerDrift detector (not TRACKED_SOURCE_DRIFT) is exercised.
  const integrityPath = path.join(root, '_SYSTEM/skill-hash-registry.json');
  const integrity = JSON.parse(readFileSync(integrityPath, 'utf8'));
  integrity['cyber-dual-lab'].hash = stableHash(alteredSource);
  integrity['cyber-dual-lab'].source_path = '.claude/skills-labgated/cyber-dual-lab/SKILL.md';
  writeJson(root, '_SYSTEM/skill-hash-registry.json', integrity);
  // Re-stage the altered source so the Git index sees the new content.
  git(root, ['add', '--update', '.claude/skills-labgated/cyber-dual-lab/SKILL.md', '_SYSTEM/skill-hash-registry.json']);
  // The drift detector must fire on the canonical-source layer.
  const plan = buildProjectionPlan(root, SMALL_COUNTS);
  assert.equal(plan.labgatedBannerDrift.length, 1, 'canonical-source banner drift must be detected');
  assert.ok(plan.labgatedBannerDrift[0].endsWith('.claude/skills-labgated/cyber-dual-lab/SKILL.md'));
  // The generated adapter still gets the canonical banner injected (the fix is generator-side).
  syncProjection(root, SMALL_COUNTS);
  const adapter = readFileSync(path.join(root, '.agents/skills/cyber-dual-lab/SKILL.md'), 'utf8');
  assert.ok(adapter.includes(LABGATED_BANNER), 'adapter must carry the canonical banner even when the source drifts');
});

test('projector sync is idempotent across consecutive runs', () => {
  const { root } = normalFixture();
  const first = syncProjection(root, SMALL_COUNTS);
  assert.equal(first.ok, true);
  const firstManifest = readFileSync(path.join(root, '.agents/skills/.yuri-projection.json'), 'utf8');
  const firstAdapter = readFileSync(path.join(root, '.agents/skills/cyber-dual-lab/SKILL.md'), 'utf8');
  const second = syncProjection(root, SMALL_COUNTS);
  assert.equal(second.ok, true);
  const secondManifest = readFileSync(path.join(root, '.agents/skills/.yuri-projection.json'), 'utf8');
  const secondAdapter = readFileSync(path.join(root, '.agents/skills/cyber-dual-lab/SKILL.md'), 'utf8');
  assert.equal(firstManifest, secondManifest, 'manifest must be byte-identical across consecutive syncs');
  assert.equal(firstAdapter, secondAdapter, 'adapter must be byte-identical across consecutive syncs');
});

test('skill-recall --show on a labgated source returns the canonical source projection, not execution authorization', () => {
  const { root } = normalFixture();
  syncProjection(root, SMALL_COUNTS);
  const shown = showSkill('cyber-dual-lab', { root });
  assert.ok(shown, 'showSkill must return a result for the labgated source');
  // Return shape: { content: <source raw>, skill: <frontmatter-derived skill> }.
  // Per skill-recall.mjs:307-324, showSkill returns the SOURCE body content + the bare
  // frontmatter object — NOT the generated adapter body. This is the discoverability surface.
  assert.ok(typeof shown.content === 'string' && shown.content.length > 0, 'showSkill must return source content');
  assert.ok(shown.skill && typeof shown.skill.path === 'string', 'showSkill must return skill.path');
  // The skill path must point at the CANONICAL labgated source (not the generated adapter).
  assert.equal(
    shown.skill.path,
    '.claude/skills-labgated/cyber-dual-lab/SKILL.md',
    'showSkill must point at the canonical source, not the generated .agents/skills/ adapter',
  );
  // The content must include the fixture's source body (SOURCE_LAB_ONLY marker is the
  // fixture's body content; the discoverability surface IS the source — there is no
  // pointer-only invariant on showSkill because the entire purpose is to expose the source).
  assert.ok(shown.content.includes('SOURCE_LAB_ONLY'), 'showSkill must return the canonical source body');
  // Non-authorization: the returned content is the source procedural text, NOT an authorization
  // grant. The 'Discovery does not authorize execution' wording lives in the ADAPTER body
  // (the model-visible implicit-discovery surface), not in the source. Asserting the
  // adapter carries that wording keeps the discovery-not-authorization invariant grounded
  // in the right layer.
  const adapter = readFileSync(path.join(root, '.agents/skills/cyber-dual-lab/SKILL.md'), 'utf8');
  assert.ok(adapter.includes('Discovery does not authorize execution'), 'adapter (model-visible surface) must carry the non-authorization wording');
});

test('hide:true source frontmatter propagates to the adapter and projection manifest for cyber skills, and canonical stays visible', () => {
  const { root } = normalFixture();
  const integrityPath = path.join(root, '_SYSTEM/skill-hash-registry.json');
  const integrity = JSON.parse(readFileSync(integrityPath, 'utf8'));
  // Add hide:true to the armed + labgated cyber sources; leave canonical alpha visible.
  const hideTargets = [
    { id: 'cyber-network-audit', rel: '.claude/skills/cyber-network-audit/SKILL.md' },
    { id: 'cyber-dual-lab', rel: '.claude/skills-labgated/cyber-dual-lab/SKILL.md' },
  ];
  for (const { id, rel } of hideTargets) {
    const src = readFileSync(path.join(root, rel), 'utf8');
    const end = src.indexOf('\n---', 3);
    const hidden = `${src.slice(0, end)}\nhide: true${src.slice(end)}`;
    write(root, rel, hidden);
    integrity[id].hash = stableHash(hidden);
    integrity[id].source_path = rel;
  }
  writeJson(root, '_SYSTEM/skill-hash-registry.json', integrity);
  git(root, ['add', '--update',
    '.claude/skills/cyber-network-audit/SKILL.md',
    '.claude/skills-labgated/cyber-dual-lab/SKILL.md',
    '_SYSTEM/skill-hash-registry.json',
  ]);
  const synced = syncProjection(root, SMALL_COUNTS);
  assert.equal(synced.ok, true, 'sync must succeed with hide:true sources');
  // Adapter frontmatter: cyber sources carry hide:true; canonical alpha does not.
  for (const { id } of hideTargets) {
    const adapter = readFileSync(path.join(root, '.agents/skills', id, 'SKILL.md'), 'utf8');
    assert.ok(/^hide: true$/m.test(adapter), `${id} adapter frontmatter must carry hide: true`);
  }
  const alphaAdapter = readFileSync(path.join(root, '.agents/skills/alpha/SKILL.md'), 'utf8');
  assert.equal(/^hide: true$/m.test(alphaAdapter), false, 'canonical alpha adapter must NOT be hidden');
  // Projection manifest: hidden flag matches source class; no non-cyber leak.
  const manifest = JSON.parse(readFileSync(path.join(root, '.agents/skills/.yuri-projection.json'), 'utf8'));
  const byId = Object.fromEntries(manifest.skills.map((s) => [s.id, s]));
  assert.equal(byId['cyber-network-audit'].hidden, true, 'armed cyber manifest entry must be hidden');
  assert.equal(byId['cyber-dual-lab'].hidden, true, 'labgated cyber manifest entry must be hidden');
  assert.equal(byId['alpha'].hidden, false, 'canonical alpha manifest entry must not be hidden');
});