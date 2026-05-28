import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
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

test('Superpowers imports are cloned into root skills without first-response queue jump wording', () => {
  const pluginRoot = '.codex/plugins/cache/openai-curated/superpowers/6188456f/skills';
  const rootSkills = 'skills';

  if (existsSync(pluginRoot)) {
    const pluginSkillNames = readdirSync(pluginRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.equal(pluginSkillNames.length > 0, true);

    for (const skillName of pluginSkillNames) {
      const pluginFiles = walkFiles(path.join(pluginRoot, skillName));
      const rootSkillDir = path.join(rootSkills, skillName);
      const rootFiles = existsSync(rootSkillDir) ? walkFiles(rootSkillDir) : [];

      assert.deepEqual(rootFiles, pluginFiles, `${skillName} root clone must include every plugin support file`);
    }
  }

  const usingSuperpowers = readFileSync('skills/using-superpowers/SKILL.md', 'utf8');
  assert.doesNotMatch(usingSuperpowers, /before any response or action/i);
  assert.doesNotMatch(usingSuperpowers, /before any response\/action/i);
});

test('skill validation treats plugin cache drift as reference-only advisory state', () => {
  const output = execFileSync(
    process.execPath,
    ['_SYSTEM/Scripts/yuri-skill-loader.mjs', '--validate', '--json'],
    { encoding: 'utf8' },
  );
  const result = JSON.parse(output);

  assert.equal(result.summary.drift, 0, 'canonical skill drift should still fail validation');
  assert.equal(result.summary.missing, 0, 'canonical missing skills should still fail validation');
  assert.equal(result.collisions_detected, false, 'skill collisions should remain visible');
  assert(
    result.results.some((entry) => String(entry.status).startsWith('REFERENCE_')),
    'provider/plugin cache drift should be reported as reference-only state',
  );
});

function walkFiles(base, relativeDir = '') {
  return readdirSync(path.join(base, relativeDir), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(base, relativePath);

      if (entry.isDirectory()) {
        return walkFiles(base, relativePath);
      }

      if (!statSync(absolutePath).isFile()) {
        return [];
      }

      return [relativePath];
    })
    .sort();
}
