#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const agentIndex = readJson('.agents/agent-index.json');
const skillIndex = readJson('skills/skill-index.json');
const domainIndex = readJson('skills/domain-index.json');

const skillIds = new Set(skillIndex.skills.map((skill) => skill.id));

assert.equal(agentIndex.canonicalSkillRoot, 'skills');
assert.equal(skillIndex.canonicalRoot, 'skills');
assert.equal(domainIndex.canonicalRoot, 'skills');
assert.equal(existsSync(path.join(REPO, '.agents/skills')), false, '.agents/skills must not be recreated as canonical source');
assert.equal(existsSync(path.join(REPO, 'skills')), true, 'skills root must exist');

for (const skill of skillIndex.skills) {
  assert.match(skill.id, /^[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/, `bad skill id: ${skill.id}`);
  assert.equal(skill.path, `skills/${skill.id}/SKILL.md`, `bad skill path for ${skill.id}`);
  assert.equal(existsSync(path.join(REPO, skill.path)), true, `missing indexed skill: ${skill.path}`);
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

process.stdout.write(`yuri-agent-index: pass agents=${agentIndex.agents.length} skills=${skillIndex.skills.length} domains=${domainIndex.domains.length}\n`);

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO, relPath), 'utf8'));
}
