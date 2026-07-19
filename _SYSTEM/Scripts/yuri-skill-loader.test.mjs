import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { buildRegistry, enforceTotalBodyCap, recommendSkills, stableSkillBody } from './yuri-skill-loader.mjs';

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
  assert.match(result.active.find((entry) => entry.skill_id === 'oracle-memory').reason, /canonical coverage: memory/);
  assert.match(result.active.find((entry) => entry.skill_id === 'research-artifact-factory').reason, /canonical coverage: research/);
  assert.equal(ids.includes('ad-creative'), false);
  assert.equal(ids.includes('3-statement-model'), false);
  assert.equal(result.capabilityIndex['memory-navigation'].includes('oracle-memory'), true);
  assert.equal(result.capabilityIndex.research.includes('research-artifact-factory'), true);
  assert.doesNotMatch(serialized, /PRIVATE BODY SHOULD NOT LEAK|BODY SHOULD NOT LEAK/);
});

test('Humanizer is opt-in for explicit prose editing and absent from ordinary factual answers', () => {
  const registry = buildRegistry();
  const explicit = recommendSkills('humanize this cover letter while preserving citations and my voice', registry);
  const explicitPolish = recommendSkills('Polish this supplied paragraph', registry);
  const explicitSlash = recommendSkills('/humanizer Please revise this supplied email', registry);
  const explicitNamed = recommendSkills('Use Humanizer to edit this cover letter', registry);
  const ordinary = recommendSkills('answer a basic factual question', registry);
  const persona = recommendSkills('Tell me about Marcel persona preferences', registry);
  const research = recommendSkills('Summarize this research paper with citations', registry);
  const adversarialNegatives = [
    'Audit the Humanizer integration',
    'What is the Humanizer skill?',
    'Do not use Humanizer on this text',
    'Can Humanizer evade AI detectors?',
    'Explain how this text was humanized',
    'Is humanizing prose ethical?',
    'Tell me what humanizing means',
    'Avoid humanizing this paragraph',
  ].map((query) => recommendSkills(query, registry));

  assert(explicit.active.some((entry) => entry.skill_id === 'humanizer'), 'explicit humanize request should select Humanizer');
  assert(explicitPolish.active.some((entry) => entry.skill_id === 'humanizer'), 'explicit paragraph polish should select Humanizer');
  assert(explicitSlash.active.some((entry) => entry.skill_id === 'humanizer'), 'explicit /humanizer request should select Humanizer');
  assert(explicitNamed.active.some((entry) => entry.skill_id === 'humanizer'), 'explicit named invocation should select Humanizer');
  assert.equal(ordinary.active.some((entry) => entry.skill_id === 'humanizer'), false, 'ordinary answers must not select Humanizer');
  assert.equal(persona.active.some((entry) => entry.skill_id === 'humanizer'), false, 'generic persona queries must not select Humanizer');
  assert.equal(research.active.some((entry) => entry.skill_id === 'humanizer'), false, 'generic research summaries must not select Humanizer');
  for (const result of adversarialNegatives) {
    assert.equal(result.active.some((entry) => entry.skill_id === 'humanizer'), false, `Humanizer false-positive for: ${result.query}`);
  }
  assert(explicit.capabilityIndex.formatting.includes('humanizer'), 'Humanizer formatting capability should be indexed');
  assert(explicit.input.signals.includes('prose-editing'), 'explicit prose signal missing');
});

test('skill registry prunes loaded bodies under total cap while preserving metadata', () => {
  const registry = buildRegistry();
  const totalBody = registry.skills.reduce((sum, skill) => sum + String(skill.body || '').length, 0);

  assert.ok(totalBody <= 15_000);
  assert.ok(registry.skills.some((skill) => skill.bodyPruned === true));
  assert.ok(registry.skills.every((skill) => skill.name && skill.source_path && skill.hash));
});

test('total body cap prunes provider bodies before canonical source_type bodies regardless of discovery order', () => {
  const skills = [
    { name: 'provider-first', source_type: 'codex_plugin_cache_skill', body: 'p'.repeat(8) },
    { name: 'canonical-a', source_type: 'yuri_skill', body: 'a'.repeat(8) },
    { name: 'lab-canonical', source_type: 'yuri_labgated_skill', body: 'l'.repeat(8) },
    { name: 'canonical-b', source_type: 'yuri_skill', body: 'b'.repeat(8) },
  ];

  enforceTotalBodyCap(skills, 24);

  assert.equal(skills[0].body, '', 'provider body must be pruned first even when it appears first');
  assert.equal(skills[0].bodyPruned, true);
  assert.equal(skills[1].body.length, 8, 'canonical body A must be retained');
  assert.equal(skills[2].body.length, 8, 'lab-gated canonical body must be retained');
  assert.equal(skills[3].body.length, 8, 'canonical body B must be retained');
  assert.equal(skills.some((skill) => Object.hasOwn(skill, 'type')), false, 'regression must exercise source_type, not the prior nonexistent type field');
});

test('root skills are canonical and Superpowers imports are visible from skills root', () => {
  const registry = buildRegistry();
  const byName = new Map(registry.skills.map((skill) => [skill.name, skill]));

  assert.equal(byName.get('oracle-registry')?.source_path, 'skills/oracle-registry/SKILL.md');
  assert.equal(byName.get('brainstorming')?.source_path, 'skills/brainstorming/SKILL.md');
  assert.equal(byName.get('using-superpowers')?.source_path, 'skills/using-superpowers/SKILL.md');
  assert.equal(registry.skills.some((skill) => skill.source_path.startsWith('.agents/skills/')), false);
});

test('sparse-absent canonical skills are verified from Git index without materialization', (t) => {
  const registry = buildRegistry();
  const sparseSkillPaths = execFileSync('git', ['ls-files', '-v', '-z', '--', 'skills', '.claude/skills', '.codex/skills'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((record) => record.startsWith('S '))
    .map((record) => record.slice(2))
    .filter((file) => file.startsWith('skills/') && /(?:^|\/)SKILL\.md$/.test(file) && !existsSync(file));

  if (!sparseSkillPaths.length) {
    t.skip('full checkout has no sparse-absent SKILL.md fixture');
    return;
  }
  const bySource = new Map(registry.skills.map((skill) => [skill.source_path, skill]));
  for (const sourcePath of sparseSkillPaths) {
    const skill = bySource.get(sourcePath);
    assert.ok(skill, `sparse-absent skill should be discovered from Git index: ${sourcePath}`);
    assert.equal(skill.materialization, 'git-index', `sparse-absent skill must be labeled git-index: ${sourcePath}`);
    assert.equal(skill.hash, createHash('sha256').update(stableSkillBody(readWorktreeOrIndexFile(sourcePath))).digest('hex').slice(0, 16));
  }
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
      const rootFiles = existsSync(rootSkillDir) ? walkFiles(rootSkillDir) : trackedFiles(rootSkillDir);

      assert.deepEqual(rootFiles, pluginFiles, `${skillName} root clone must include every plugin support file`);
    }
  }

  const usingSuperpowers = readWorktreeOrIndexFile('skills/using-superpowers/SKILL.md');
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

function trackedFiles(base) {
  const prefix = `${base.replace(/\/+$/, '')}/`;
  return execFileSync('git', ['ls-files', '-z', '--', base], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((file) => file.startsWith(prefix) ? file.slice(prefix.length) : file)
    .sort();
}

function readWorktreeOrIndexFile(file) {
  return existsSync(file)
    ? readFileSync(file, 'utf8')
    : execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' });
}
