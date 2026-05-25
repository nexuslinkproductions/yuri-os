import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRegistry, recommendSkills } from './yuri-skill-loader.mjs';

test('skill recommendations are body-free and prefer canonical YURI memory/research skills', () => {
  const result = recommendSkills(
    'critical YURI memory RAG skill recall neurodivergence self improvement MSA supercharge',
    buildRegistry(),
  );
  const ids = result.active.map((entry) => entry.skill_id);
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.policy.noSkillBodies, true);
  assert.ok(ids.includes('oracle-memory'));
  assert.ok(ids.includes('pattern-mirror-core'));
  assert.ok(ids.includes('research-artifact-factory'));
  assert.ok(ids.includes('end-of-transmission'));
  assert.ok(ids.includes('execution-domain-core'));
  assert.equal(ids.includes('ad-creative'), false);
  assert.equal(ids.includes('3-statement-model'), false);
  assert.equal(result.capabilityIndex['memory-navigation'].includes('oracle-memory'), true);
  assert.equal(result.capabilityIndex.research.includes('research-artifact-factory'), true);
  assert.doesNotMatch(serialized, /PRIVATE BODY SHOULD NOT LEAK|BODY SHOULD NOT LEAK/);
});

test('skill registry prunes loaded bodies under total cap while preserving metadata', () => {
  const registry = buildRegistry();
  const totalBody = registry.skills.reduce((sum, skill) => sum + String(skill.body || '').length, 0);

  assert.ok(totalBody <= 15_000);
  assert.ok(registry.skills.some((skill) => skill.bodyPruned === true));
  assert.ok(registry.skills.every((skill) => skill.name && skill.source_path && skill.hash));
});

test('root skills are canonical and Superpowers imports are visible from skills root', () => {
  const registry = buildRegistry();
  const byName = new Map(registry.skills.map((skill) => [skill.name, skill]));

  assert.equal(byName.get('oracle-registry')?.source_path, 'skills/oracle-registry/SKILL.md');
  assert.equal(byName.get('brainstorming')?.source_path, 'skills/brainstorming/SKILL.md');
  assert.equal(byName.get('using-superpowers')?.source_path, 'skills/using-superpowers/SKILL.md');
  assert.equal(registry.skills.some((skill) => skill.source_path.startsWith('.agents/skills/')), false);
});
