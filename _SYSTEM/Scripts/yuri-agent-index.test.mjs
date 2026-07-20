#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const agentIndex = readJson('.agents/agent-index.json');
const skillIndex = readJson('skills/skill-index.json');
const domainIndex = readJson('skills/domain-index.json');
const projection = readJson('.agents/skills/.yuri-projection.json');
const NATIVE_POLICY_MARKER = '# GENERATED:YURI-CODEX-SKILL-POLICY:v1';
const NATIVE_POLICY_RELATIVE_PATH = 'agents/openai.yaml';
const NATIVE_IMPLICIT_SKILL_ID = 'activate-yuri-skills';

const skillIds = new Set(skillIndex.skills.map((skill) => skill.id));
const projectionRoot = path.join(REPO, '.agents/skills');
const projectionById = new Map(projection.skills.map((skill) => [skill.id, skill]));
const gitIndex = readGitIndex();

assert.equal(agentIndex.canonicalSkillRoot, 'skills');
assert.equal(skillIndex.canonicalRoot, 'skills');
assert.equal(domainIndex.canonicalRoot, 'skills');
assert.equal(existsSync(projectionRoot), true, '.agents/skills generated discovery projection is missing');
assert.equal(existsSync(path.join(projectionRoot, '.yuri-projection.json')), true, 'Codex skill projection manifest is missing');
assert.equal(agentIndex.rules.skillBodiesInAgents, false, '.agents must never own canonical skill bodies');
assert.equal(existsSync(path.join(REPO, 'skills')), true, 'skills root must exist');
assert.equal(skillIndex.count, skillIndex.skills.length, 'skill-index count must match entries');
assert.equal(projection.projection.count, projection.skills.length, 'projection count must match entries');
assert.equal(projection.canonical.count, skillIndex.count, 'projection canonical count must match skill-index');
assert.equal(projection.cyber.armed.count, 300, 'armed cybersecurity projection count drifted');
assert.equal(projection.cyber.labgated.count, 39, 'lab-gated cybersecurity projection count drifted');
assert.equal(projection.skills.length, 464, 'governed Codex projection must be exact');
assert.equal(new Set(projection.skills.map((skill) => skill.id)).size, projection.skills.length, 'projection IDs must be unique');
assert.equal(projection.skills.every((skill) => skill.tracked === true && skill.durability === 'git-index'), true, 'all projected sources must be tracked');
assert.deepEqual(projection.projection.nativeInvocation, {
  sidecarRelativePath: NATIVE_POLICY_RELATIVE_PATH,
  provenance: '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs',
  implicit: { count: 1, ids: [NATIVE_IMPLICIT_SKILL_ID] },
  explicitOnly: { count: 463 },
}, 'native invocation budget must keep exactly one eager YURI meta-router');

for (const projected of projection.skills) {
  const expectedImplicit = projected.id === NATIVE_IMPLICIT_SKILL_ID;
  const expectedSidecarPath = `.agents/skills/${projected.id}/${NATIVE_POLICY_RELATIVE_PATH}`;
  assert.equal(projected.nativeInvocation?.allowImplicitInvocation, expectedImplicit, `native invocation policy mismatch for ${projected.id}`);
  assert.equal(projected.nativeInvocation?.sidecarPath, expectedSidecarPath, `native sidecar path mismatch for ${projected.id}`);
  assert.equal(projected.nativeInvocation?.provenance?.generatedBy, '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs');
  assert.equal(projected.nativeInvocation?.provenance?.governedSkillId, projected.id);
  assert.equal(projected.nativeInvocation?.provenance?.policyClass, expectedImplicit ? 'implicit-meta-router' : 'explicit-only');
  if (projected.sourceClass === 'labgated') {
    assert.equal(projected.nativeInvocation.allowImplicitInvocation, false, `lab-gated skill must remain explicit-only: ${projected.id}`);
  }

  const adapterDirectory = path.join(projectionRoot, projected.id);
  const adapterPath = path.join(adapterDirectory, 'SKILL.md');
  const sidecarDirectory = path.join(adapterDirectory, 'agents');
  const sidecarPath = path.join(sidecarDirectory, 'openai.yaml');
  for (const [label, target] of [['adapter', adapterPath], ['native policy', sidecarPath]]) {
    assert.equal(existsSync(target), true, `${label} is missing for ${projected.id}`);
    const stat = lstatSync(target);
    assert.equal(stat.isFile(), true, `${label} must be a regular file: ${projected.id}`);
    assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symlink: ${projected.id}`);
  }
  const sidecarDirectoryStat = lstatSync(sidecarDirectory);
  assert.equal(sidecarDirectoryStat.isDirectory(), true, `native policy parent must be a directory: ${projected.id}`);
  assert.equal(sidecarDirectoryStat.isSymbolicLink(), false, `native policy parent must not be a symlink: ${projected.id}`);
  assert.deepEqual(readdirSync(sidecarDirectory), ['openai.yaml'], `native policy directory must remain policy-only: ${projected.id}`);

  const sidecar = readFileSync(sidecarPath, 'utf8');
  assert.equal(
    sidecar,
    `${NATIVE_POLICY_MARKER}\npolicy:\n  allow_implicit_invocation: ${expectedImplicit ? 'true' : 'false'}\n`,
    `native policy must remain minimal and deterministic: ${projected.id}`,
  );
  assert.equal(
    createHash('sha256').update(sidecar).digest('hex'),
    projected.nativeInvocation.sidecarSha256,
    `native policy hash mismatch for ${projected.id}`,
  );
}

for (const skill of skillIndex.skills) {
  assert.match(skill.id, /^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, `bad skill id: ${skill.id}`);
  assert.equal(skill.path, `skills/${skill.id}/SKILL.md`, `bad skill path for ${skill.id}`);
  const source = readGoverned(skill.path);
  const projected = projectionById.get(skill.id);
  assert.ok(projected, `missing projection entry for ${skill.id}`);
  assert.equal(projected.sourcePath, skill.path, `projection source mismatch for ${skill.id}`);
  assert.equal(projected.sourceSha256, createHash('sha256').update(source).digest('hex'), `projection hash mismatch for ${skill.id}`);
  const adapterPath = path.join(projectionRoot, skill.id, 'SKILL.md');
  assert.equal(existsSync(adapterPath), true, `missing Codex adapter for ${skill.id}`);
  const adapterStat = lstatSync(adapterPath);
  assert.equal(adapterStat.isFile(), true, `adapter must be a regular file: ${skill.id}`);
  assert.equal(adapterStat.isSymbolicLink(), false, `adapter must not be a symlink: ${skill.id}`);
  const adapter = readFileSync(adapterPath, 'utf8');
  assert.match(adapter, /GENERATED:YURI-CODEX-SKILL-ADAPTER:v1/, `adapter marker missing for ${skill.id}`);
  assert.ok(adapter.includes(skill.path), `adapter source pointer missing for ${skill.id}`);
  assert.ok(adapter.includes(projected.sourceSha256), `adapter source hash missing for ${skill.id}`);
  assert.notEqual(adapter, source, `adapter must not duplicate the canonical body for ${skill.id}`);
  for (const support of skill.supportFiles || []) {
    assert.ok(support.path.startsWith(`skills/${skill.id}/`), `support file escapes its skill directory: ${support.path}`);
    assert.match(support.sha256, /^[a-f0-9]{64}$/, `support file hash is invalid: ${support.path}`);
    const supportBody = readGoverned(support.path);
    assert.equal(
      createHash('sha256').update(supportBody).digest('hex'),
      support.sha256,
      `support file hash mismatch: ${support.path}`,
    );
  }
}

for (const agent of agentIndex.agents) {
  assert(agent.agentId, 'agent missing agentId');
  assert(Array.isArray(agent.skillIds), `${agent.agentId} missing skillIds`);
  for (const skillId of agent.skillIds) {
    assert.equal(skillIds.has(skillId), true, `${agent.agentId} references unknown skill ${skillId}`);
  }
}

for (const domain of domainIndex.domains) {
  assert(domain.domainId, 'domain missing domainId');
  assert(Array.isArray(domain.skillIds), `${domain.domainId} missing skillIds`);
  for (const skillId of domain.skillIds) {
    assert.equal(skillIds.has(skillId), true, `${domain.domainId} references unknown skill ${skillId}`);
  }
}

const domainSkillIds = domainIndex.domains.flatMap((domain) => domain.skillIds);
assert.equal(new Set(domainSkillIds).size, domainSkillIds.length, 'a skill may belong to only one ordered domain');
assert.deepEqual([...new Set(domainSkillIds)].sort(), [...skillIds].sort(), 'domain and canonical skill indexes must be exact sets');

process.stdout.write(`yuri-agent-index: pass agents=${agentIndex.agents.length} skills=${skillIndex.skills.length} projection=${projection.skills.length} domains=${domainIndex.domains.length}\n`);

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO, relPath), 'utf8'));
}

function readGitIndex() {
  const raw = execFileSync('git', ['ls-files', '-s', '-z', '--', 'skills'], { cwd: REPO, encoding: 'utf8' });
  const entries = new Map();
  for (const record of raw.split('\0').filter(Boolean)) {
    const match = record.match(/^(\d{6}) ([a-f0-9]+) (\d)\t([\s\S]+)$/);
    assert.ok(match, `invalid Git index record: ${record}`);
    assert.equal(match[3], '0', `unmerged Git index entry refused: ${match[4]}`);
    entries.set(match[4], { mode: match[1], objectId: match[2] });
  }
  return entries;
}

function readGoverned(relativePath) {
  const absolute = path.join(REPO, ...relativePath.split('/'));
  const indexed = gitIndex.get(relativePath);
  assert.ok(indexed, `missing governed Git index entry: ${relativePath}`);
  assert.ok(indexed.mode === '100644' || indexed.mode === '100755', `non-file Git mode for ${relativePath}: ${indexed.mode}`);
  if (existsSync(absolute)) {
    const stat = lstatSync(absolute);
    assert.equal(stat.isFile(), true, `governed worktree source is not a file: ${relativePath}`);
    assert.equal(stat.isSymbolicLink(), false, `governed worktree source is a symlink: ${relativePath}`);
    const body = readFileSync(absolute, 'utf8');
    const indexedBody = execFileSync('git', ['cat-file', 'blob', indexed.objectId], { cwd: REPO, encoding: 'utf8' });
    assert.equal(body, indexedBody, `governed worktree source differs from Git index: ${relativePath}`);
    return body;
  }
  return execFileSync('git', ['cat-file', 'blob', indexed.objectId], { cwd: REPO, encoding: 'utf8' });
}
