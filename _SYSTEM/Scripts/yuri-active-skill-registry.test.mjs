#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildActiveSkillRegistry } from './yuri-active-skill-registry.mjs';

const pulseSeed = {
  capabilityHints: ['intent-normalization', 'deep-decomposition', 'risk-review', 'code', 'deterministic-verification', 'reduce-and-learn'],
  workPackets: [
    { id: 'classify', capability: 'intent-normalization' },
    { id: 'decompose', capability: 'deep-decomposition' },
    { id: 'code', capability: 'code' },
    { id: 'verify', capability: 'deterministic-verification' },
    { id: 'merge', capability: 'reduce-and-learn' },
  ],
};

const context = {
  signals: ['campaign', 'code', 'risk'],
  code: true,
  risk: true,
  requiresHighReasoning: true,
};

const routePlan = {
  lane: 'swarm',
  scenario: 'high-stakes-review',
};

const rawSkillRegistry = {
  discovered_at: '2026-05-12T10:00:00.000Z',
  count: 10,
  skills: [
    skill('probabilistic-decision-core', 'hash-prob', 'PRIVATE BODY SHOULD NOT LEAK'),
    skill('adversarial-verification', 'hash-attack', 'ATTACK BODY SHOULD NOT LEAK'),
    skill('execution-domain-core', 'hash-exec', 'EXECUTION BODY SHOULD NOT LEAK'),
    skill('non-destructive-infinity-guard', 'hash-guard', 'GUARD BODY SHOULD NOT LEAK'),
    skill('failure-evolution-loop', 'hash-failure', 'FAILURE BODY SHOULD NOT LEAK'),
    skill('gitnexus-refactoring', 'hash-refactor', 'REFACTOR BODY SHOULD NOT LEAK'),
    skill('frontend-design', 'hash-design', 'DESIGN BODY SHOULD NOT LEAK'),
    skill('tokenmaxxing', 'hash-token', 'TOKEN BODY SHOULD NOT LEAK'),
    skill('unknown-risk-note', 'hash-unknown', 'risk review deterministic verification'),
    { ...skill('colliding-skill', 'hash-collide', 'COLLISION BODY SHOULD NOT LEAK'), collision: true, collision_with: '.claude/skills/other/SKILL.md' },
    skill('irrelevant-skill', 'hash-irrelevant', 'nothing matching the pulse seed'),
  ],
};

const first = buildActiveSkillRegistry({ pulseSeed, context, routePlan, rawSkillRegistry });
const second = buildActiveSkillRegistry({ pulseSeed, context, routePlan, rawSkillRegistry });

assert.deepEqual(second, first, 'active skill selection should be deterministic');
assert.equal(first.schema_version, 1, 'active skill registry schema mismatch');
assert.equal(first.source.loader, '_SYSTEM/Scripts/yuri-skill-loader.mjs --json', 'loader source mismatch');
assert.equal(first.source.disabled, false, 'source should not be disabled');
assert.equal(first.policy.advisoryOnly, true, 'skills must remain advisory only');
assert(first.active.length > 0, 'matching skills should be selected');
assert(first.active.length <= first.policy.maxActive, 'active skills should respect maxActive');
assert(first.active.some((item) => item.skill_id === 'probabilistic-decision-core'), 'probability skill should match risk planning');
assert(first.active.some((item) => item.skill_id === 'adversarial-verification'), 'adversarial skill should match verification/risk work');
assert(first.active.some((item) => item.skill_id === 'execution-domain-core'), 'execution skill should match verification');
assert(first.suppressed.some((item) => item.skill_id === 'colliding-skill' && item.reason === 'collision'), 'collisions should be suppressed');
assert(first.suppressed.some((item) => item.skill_id === 'irrelevant-skill' && item.reason === 'no_capability_match'), 'irrelevant skills should be suppressed');
assert.equal(first.trace.selectionHash, second.trace.selectionHash, 'selection hash should be stable');
assert.match(first.trace.selectionHash, /^[a-f0-9]{16}$/, 'selection hash should be a sha256-16 prefix');

for (const [stageId, skillIds] of Object.entries(first.stageBindings)) {
  assert(skillIds.length <= first.policy.maxPerStage, `${stageId} should respect maxPerStage`);
}

assert(first.stageBindings.intake_classify.includes('probabilistic-decision-core'), 'intake should bind planning skill');
assert(first.stageBindings.verify_local_truth.includes('execution-domain-core'), 'verify should bind execution skill');
assert(first.capabilityIndex['risk-review'].includes('probabilistic-decision-core'), 'capability index should map risk-review');

const outputLaneRegistry = buildActiveSkillRegistry({
  pulseSeed: {
    capabilityHints: ['output-organization', 'skill-recall'],
    workPackets: [{ id: 'lane', capability: 'output-organization' }],
  },
  context: { signals: ['docs', 'campaign'] },
  routePlan,
  rawSkillRegistry: {
    discovered_at: '2026-05-28T10:00:00.000Z',
    count: 2,
    skills: [
      skill('claude-output-lane', 'hash-output', 'OUTPUT LANE BODY SHOULD NOT LEAK'),
      skill('claude-codex-capability-bridge', 'hash-bridge', 'BRIDGE BODY SHOULD NOT LEAK'),
    ],
  },
});

assert(outputLaneRegistry.active.some((item) => item.skill_id === 'claude-output-lane'), 'Claude output lane should route output-organization work');
assert(outputLaneRegistry.active.some((item) => item.skill_id === 'claude-codex-capability-bridge'), 'Codex bridge should route capability/output work');
assert(outputLaneRegistry.capabilityIndex['output-organization'].includes('claude-output-lane'), 'capability index should map output-organization');

const serialized = JSON.stringify(first);
for (const forbidden of ['PRIVATE BODY SHOULD NOT LEAK', 'EXECUTION BODY SHOULD NOT LEAK', 'COLLISION BODY SHOULD NOT LEAK']) {
  assert(!serialized.includes(forbidden), `registry output leaked skill body: ${forbidden}`);
}

const disabled = buildActiveSkillRegistry({
  pulseSeed,
  context,
  routePlan,
  rawSkillRegistry,
  disabled: true,
});

assert.equal(disabled.source.disabled, true, 'disabled registry should report disabled source');
assert.equal(disabled.active.length, 0, 'disabled registry should not select skills');
assert(disabled.suppressed.every((item) => item.reason === 'disabled'), 'disabled registry should suppress all raw skills as disabled');

process.stdout.write('yuri-active-skill-registry: pass\n');

function skill(name, hash, body) {
  return {
    name,
    source_path: `.claude/skills/${name}/SKILL.md`,
    source_type: 'claude_skill',
    hash,
    loaded_at: '2026-05-12T10:00:00.000Z',
    body,
    body_length: body.length,
    bodyTruncated: false,
  };
}
