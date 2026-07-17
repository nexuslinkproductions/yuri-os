import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 1;
const MAX_ACTIVE = 18;
const MAX_PER_STAGE = 7;
const LOADER_SOURCE = '_SYSTEM/Scripts/yuri-skill-loader.mjs --json';
const MANIFEST_SOURCE = '_SYSTEM/skill-hash-registry.json';

const STAGE_IDS = Object.freeze([
  'intake_classify',
  'campaign_decompose',
  'specialist_fanout',
  'verify_local_truth',
  'merge_learn',
]);

const LEGACY_PARSER_ONLY_SKILLS = Object.freeze({
  'deepseek-workhorse': 'workhorse',
  'deepseek-offload': 'offload',
  'openclaw-offload': 'offload',
});

const CANONICAL_COLLISION_SOURCES = new Set([
  'yuri_skill',
  'yuri_agent_skill',
  'codex_skill',
  'codex_system_skill',
]);

const CAPABILITY_TO_STAGE = Object.freeze({
  'intent-normalization': ['intake_classify'],
  'deep-decomposition': ['campaign_decompose'],
  'risk-review': ['intake_classify', 'campaign_decompose'],
  'decision-calibration': ['intake_classify', 'campaign_decompose'],
  code: ['specialist_fanout'],
  debugging: ['specialist_fanout'],
  refactoring: ['specialist_fanout'],
  summarization: ['specialist_fanout', 'merge_learn'],
  formatting: ['specialist_fanout', 'merge_learn'],
  design: ['specialist_fanout'],
  'private-utility': ['intake_classify', 'specialist_fanout'],
  'memory-navigation': ['intake_classify', 'merge_learn'],
  retrieval: ['intake_classify', 'specialist_fanout'],
  'skill-recall': ['intake_classify', 'campaign_decompose', 'specialist_fanout'],
  'persona-alignment': ['intake_classify', 'merge_learn'],
  research: ['specialist_fanout', 'merge_learn'],
  'deterministic-verification': ['verify_local_truth'],
  'mutation-guard': ['verify_local_truth'],
  'failure-learning': ['verify_local_truth', 'merge_learn'],
  'reduce-and-learn': ['merge_learn'],
  'token-efficiency': ['intake_classify', 'merge_learn'],
  orchestration: ['campaign_decompose', 'specialist_fanout'],
  'output-organization': ['intake_classify', 'campaign_decompose', 'merge_learn'],
});

// PROFILE KEY CONTRACT (wave-2 C.4): every key must resolve to a SKILL.md in at
// least ONE of the two skill roots — `.claude/skills/<id>/` (Claude-facing) or
// `skills/<id>/` (agents-facing; the Matt Pocock pack, gitnexus deep-dives and
// oracle-memory live there deliberately, referenced by CLAUDE.md as skills/…).
// Zero-disk-presence keys are removed, never stubbed (a stub that does nothing
// is deceptive). Lint: node _SYSTEM/Scripts/skills-registry-lint.mjs
const SKILL_CAPABILITY_PROFILES = Object.freeze({
  'probabilistic-decision-core': {
    capabilities: ['risk-review', 'decision-calibration'],
    traits: ['risk', 'planning', 'calibration'],
    signals: ['risk', 'campaign'],
  },
  'haki-intent': {
    capabilities: ['intent-normalization', 'skill-recall'],
    traits: ['intent', 'classification'],
    signals: ['campaign', 'risk'],
  },
  'nen-phase-detector': {
    capabilities: ['intent-normalization', 'decision-calibration'],
    traits: ['phase', 'routing'],
    signals: ['campaign'],
  },
  'bankai-manifest': {
    capabilities: ['deep-decomposition', 'risk-review', 'summarization'],
    traits: ['manifest', 'critical-work'],
    signals: ['campaign', 'risk', 'docs'],
  },
  'izanagi-simulator': {
    capabilities: ['decision-calibration', 'risk-review', 'deep-decomposition'],
    traits: ['simulation', 'counterfactual'],
    signals: ['campaign', 'risk'],
  },
  'geass-lock': {
    capabilities: ['mutation-guard', 'deterministic-verification'],
    traits: ['constraint', 'policy'],
    signals: ['risk'],
  },
  'execution-domain-core': {
    capabilities: ['deterministic-verification', 'mutation-guard', 'risk-review'],
    traits: ['verification', 'execution-policy'],
    signals: ['risk', 'code'],
  },
  'non-destructive-infinity-guard': {
    capabilities: ['risk-review', 'mutation-guard', 'deterministic-verification'],
    traits: ['safety', 'verification'],
    signals: ['risk', 'code'],
  },
  'adversarial-verification': {
    capabilities: ['risk-review', 'mutation-guard', 'failure-learning'],
    traits: ['adversarial-checks', 'negative-case', 'completion-gate', 'agent-output-review'],
    signals: ['risk', 'code'],
  },
  'failure-evolution-loop': {
    capabilities: ['failure-learning', 'reduce-and-learn'],
    traits: ['learning', 'regression'],
    signals: ['code', 'risk'],
  },
  'gitnexus-refactoring': {
    capabilities: ['code', 'refactoring'],
    traits: ['code', 'impact-analysis'],
    signals: ['code'],
  },
  'gitnexus-debugging': {
    capabilities: ['code', 'debugging'],
    traits: ['code', 'debugging'],
    signals: ['code'],
  },
  'gitnexus-impact-analysis': {
    capabilities: ['risk-review', 'code'],
    traits: ['impact-analysis', 'risk'],
    signals: ['code', 'risk'],
  },
  diagnose: {
    capabilities: ['debugging', 'deterministic-verification', 'failure-learning'],
    traits: ['diagnosis', 'root-cause'],
    signals: ['code', 'risk'],
  },
  tdd: {
    capabilities: ['code', 'deterministic-verification', 'failure-learning'],
    traits: ['tests', 'red-green-refactor'],
    signals: ['code'],
  },
  'test-driven-development': {
    capabilities: ['code', 'deterministic-verification', 'failure-learning'],
    traits: ['tests', 'red-green-refactor'],
    signals: ['code'],
  },
  'systematic-debugging': {
    capabilities: ['debugging', 'deterministic-verification', 'failure-learning'],
    traits: ['debugging', 'root-cause'],
    signals: ['code', 'risk'],
  },
  'using-git-worktrees': {
    capabilities: ['code', 'risk-review', 'mutation-guard'],
    traits: ['worktree', 'isolation'],
    signals: ['code', 'risk'],
  },
  'frontend-design': {
    capabilities: ['design', 'formatting'],
    traits: ['frontend', 'visual'],
    signals: ['design'],
  },
  'design-master': {
    capabilities: ['design', 'formatting'],
    traits: ['design', 'visual'],
    signals: ['design'],
  },
  // 'swarm-coordination' removed (wave-2 D-C4): zero disk presence anywhere —
  // a profile key that cannot be dispatched fails closed by absence.
  'parallel-clone-orchestrator': {
    capabilities: ['orchestration', 'deep-decomposition'],
    traits: ['parallel', 'coordination'],
    signals: ['campaign'],
  },
  'dispatching-parallel-agents': {
    capabilities: ['orchestration', 'deep-decomposition'],
    traits: ['parallel', 'coordination'],
    signals: ['campaign'],
  },
  'subagent-driven-development': {
    capabilities: ['orchestration', 'deep-decomposition', 'code'],
    traits: ['subagents', 'execution'],
    signals: ['campaign', 'code'],
  },
  // 'ai-pipeline-offloading' removed (wave-2 D-C4): zero disk presence anywhere.
  'claude-output-lane': {
    capabilities: ['output-organization', 'skill-recall', 'summarization'],
    traits: ['claude-output', 'lane-taxonomy', 'advisory-sorting'],
    signals: ['docs', 'campaign'],
  },
  'claude-codex-capability-bridge': {
    capabilities: ['output-organization', 'orchestration', 'skill-recall'],
    traits: ['codex-plugin-bridge', 'claude-lane', 'capability-routing'],
    signals: ['campaign', 'code'],
  },
  tokenmaxxing: {
    capabilities: ['token-efficiency', 'reduce-and-learn'],
    traits: ['budget', 'compression'],
    signals: ['campaign'],
  },
  'compact-optimizer': {
    capabilities: ['token-efficiency', 'summarization'],
    traits: ['compression'],
    signals: ['docs', 'campaign'],
  },
  'codebase-to-course': {
    capabilities: ['summarization', 'formatting'],
    traits: ['docs', 'teaching'],
    signals: ['docs'],
  },
  humanizer: {
    capabilities: ['formatting', 'persona-alignment', 'summarization'],
    traits: ['prose-editing', 'voice-preservation', 'citation-preservation'],
    signals: ['prose-editing'],
    requiredSignals: ['prose-editing'],
  },
  // wave-3 S.3: 16 .claude/skills dirs had no profile entry — capped at score=18 and
  // suppressed in competitive contexts. Profiled from each SKILL.md description.
  'anthropic-managed-agents': {
    capabilities: ['skill-recall', 'orchestration'],
    traits: ['agents', 'sessions'],
    signals: ['docs', 'campaign'],
  },
  bg: {
    capabilities: ['orchestration'],
    traits: ['background', 'dispatch'],
    signals: ['campaign'],
  },
  'design-source-pack': {
    capabilities: ['design', 'skill-recall'],
    traits: ['catalog', 'extraction'],
    signals: ['design'],
  },
  'extraction-sprint': {
    capabilities: ['orchestration', 'deep-decomposition'],
    traits: ['extraction', 'synthesis'],
    signals: ['campaign', 'docs'],
  },
  gitnexus: {
    capabilities: ['code', 'risk-review'],
    traits: ['code-intelligence', 'impact'],
    signals: ['code'],
  },
  'organ-discovery-precision-gate': {
    capabilities: ['risk-review', 'deterministic-verification'],
    traits: ['gate', 'scope'],
    signals: ['risk'],
  },
  'organ-filing-assessor': {
    capabilities: ['output-organization'],
    traits: ['filing', 'placement'],
    signals: ['docs'],
  },
  'organ-formula-foundry': {
    capabilities: ['decision-calibration', 'deterministic-verification'],
    traits: ['math', 'typing'],
    signals: ['code'],
  },
  'organ-formula-foundry-bakeoff': {
    capabilities: ['decision-calibration', 'deterministic-verification'],
    traits: ['math', 'promotion'],
    signals: ['code', 'risk'],
  },
  'organ-lane-telemetry-cockpit': {
    capabilities: ['output-organization', 'summarization'],
    traits: ['telemetry', 'cockpit'],
    signals: ['docs'],
  },
  'organ-openprocess-pool': {
    capabilities: ['output-organization', 'skill-recall'],
    traits: ['open-loops', 'memory'],
    signals: ['campaign'],
  },
  'organ-yuri-decode': {
    capabilities: ['decision-calibration'],
    traits: ['decoder', 'math'],
    signals: ['code'],
  },
  'organ-yuri-nerve': {
    capabilities: ['orchestration', 'output-organization'],
    traits: ['nerve', 'events'],
    signals: ['campaign'],
  },
  'yuri-code-intelligence': {
    capabilities: ['code', 'risk-review'],
    traits: ['refactoring', 'review'],
    signals: ['code'],
  },
  'yuri-sales-intelligence': {
    capabilities: ['summarization', 'output-organization'],
    traits: ['sales', 'outreach'],
    signals: ['docs'],
  },
  'yuri-shura': {
    capabilities: ['risk-review', 'orchestration'],
    traits: ['adversarial', 'perspectives'],
    signals: ['risk', 'campaign'],
  },
  brainstorming: {
    capabilities: ['intent-normalization', 'deep-decomposition'],
    traits: ['ideation', 'options'],
    signals: ['campaign', 'docs'],
  },
  'writing-plans': {
    capabilities: ['deep-decomposition', 'summarization', 'deterministic-verification'],
    traits: ['planning', 'implementation-plan'],
    signals: ['campaign', 'docs'],
  },
  'executing-plans': {
    capabilities: ['orchestration', 'code', 'deterministic-verification'],
    traits: ['plan-execution', 'verification'],
    signals: ['campaign', 'code'],
  },
  'verification-before-completion': {
    capabilities: ['deterministic-verification', 'risk-review'],
    traits: ['completion-gate', 'evidence'],
    signals: ['risk', 'code'],
  },
  'requesting-code-review': {
    capabilities: ['risk-review', 'deterministic-verification', 'code'],
    traits: ['review', 'quality-gate'],
    signals: ['code', 'risk'],
  },
  'receiving-code-review': {
    capabilities: ['risk-review', 'deterministic-verification', 'code'],
    traits: ['review', 'feedback'],
    signals: ['code', 'risk'],
  },
  'writing-skills': {
    capabilities: ['skill-recall', 'deterministic-verification', 'summarization'],
    traits: ['skill-authoring', 'process-docs'],
    signals: ['docs', 'campaign'],
  },
  'write-a-skill': {
    capabilities: ['skill-recall', 'deterministic-verification', 'summarization'],
    traits: ['skill-authoring', 'process-docs'],
    signals: ['docs', 'campaign'],
  },
  'oracle-memory': {
    capabilities: ['memory-navigation', 'retrieval', 'reduce-and-learn'],
    traits: ['memory', 'recall', 'context'],
    signals: ['memory', 'docs', 'campaign'],
    coverageSignals: ['memory'],
  },
  'research-artifact-factory': {
    capabilities: ['research', 'summarization', 'formatting'],
    traits: ['research', 'artifacts', 'docs'],
    signals: ['research', 'docs'],
    coverageSignals: ['research'],
  },
  'visual-introspection': {
    capabilities: ['design', 'risk-review', 'deterministic-verification'],
    traits: ['visual', 'perception', 'audit'],
    signals: ['design', 'risk'],
  },
  'pattern-mirror-core': {
    capabilities: ['risk-review', 'memory-navigation', 'reduce-and-learn'],
    traits: ['pattern', 'failure', 'recall'],
    signals: ['risk', 'memory', 'campaign'],
  },
  sharingan: {
    capabilities: ['research', 'risk-review', 'summarization'],
    traits: ['reverse-engineering', 'deep-read'],
    signals: ['research', 'risk'],
  },
  'prompt-engineering': {
    capabilities: ['skill-recall', 'persona-alignment', 'deterministic-verification'],
    traits: ['prompt-contract', 'output-schema', 'evidence'],
    signals: ['campaign', 'risk'],
  },
  'openai-codex-workflow': {
    capabilities: ['orchestration', 'deterministic-verification', 'skill-recall'],
    traits: ['codex', 'workflow', 'verification'],
    signals: ['code', 'campaign'],
  },
  'end-of-transmission': {
    capabilities: ['memory-navigation', 'reduce-and-learn', 'summarization'],
    traits: ['eot', 'closeout', 'checkpoint', 'continuity'],
    signals: ['memory', 'docs'],
  },
});

export function buildActiveSkillRegistry({
  pulseSeed = {},
  context = {},
  routePlan = {},
  rawSkillRegistry = {},
  disabled = false,
} = {}) {
  const skills = Array.isArray(rawSkillRegistry.skills) ? rawSkillRegistry.skills : [];
  const capabilityHints = new Set(asStrings(pulseSeed.capabilityHints));
  const workCapabilities = new Set(asStrings(pulseSeed.workPackets?.map((packet) => packet?.capability)));
  const signals = new Set(asStrings(context.signals));
  const legacyAliases = new Set(asStrings(pulseSeed.legacyAliases?.map((alias) => alias?.alias)));
  const suppressed = [];

  const candidates = [];
  for (const skill of skills) {
    const skillId = String(skill?.name || '').trim();
    if (!skillId) continue;
    if (isSuppressedLegacySkill(skillId, legacyAliases)) continue;

    if (disabled) {
      suppressed.push(suppressedSkill(skillId, 'disabled'));
      continue;
    }

    if (skill.collision && !isCanonicalCollision(skill)) {
      suppressed.push(suppressedSkill(skillId, 'collision'));
      continue;
    }

    const profile = profileSkill(skill);
    if (profile.requiredSignals.length && !profile.requiredSignals.some((signal) => signals.has(signal))) {
      suppressed.push(suppressedSkill(skillId, 'required_signal_missing'));
      continue;
    }
    const matchedCapabilities = profile.capabilities.filter((capability) =>
      capabilityHints.has(capability) || workCapabilities.has(capability));
    const matchedSignals = profile.signals.filter((signal) => signals.has(signal));
    const matchedCoverageSignals = profile.coverageSignals.filter((signal) => signals.has(signal));

    if (!matchedCapabilities.length && !matchedSignals.length) {
      suppressed.push(suppressedSkill(skillId, 'no_capability_match'));
      continue;
    }
    if (!profile.knownProfile && matchedCapabilities.length < 2) {
      suppressed.push(suppressedSkill(skillId, 'weak_inferred_match'));
      continue;
    }

    candidates.push({
      skill,
      profile,
      matchedCapabilities,
      matchedSignals,
      matchedCoverageSignals,
      score: scoreSkill({
        profile,
        matchedCapabilities,
        matchedSignals,
        capabilityHints,
        workCapabilities,
        routePlan,
        context,
      }),
    });
  }

  // A directly requested semantic domain keeps one declared canonical anchor
  // ahead of generic high-scoring helpers. This is a coverage guarantee, not
  // an unbounded score bonus: hard filters and the same stage budgets still
  // apply, and profiles opt in by semantic signal rather than runtime/model id.
  candidates.sort((a, b) =>
    b.matchedCoverageSignals.length - a.matchedCoverageSignals.length ||
    b.score - a.score ||
    String(a.skill.name).localeCompare(String(b.skill.name)));

  const active = [];
  const stageBindings = Object.fromEntries(STAGE_IDS.map((stageId) => [stageId, []]));

  for (const candidate of candidates) {
    if (active.length >= MAX_ACTIVE) {
      suppressed.push(suppressedSkill(candidate.skill.name, 'stage_budget_exceeded'));
      continue;
    }

    const stageIds = selectedStageIds(candidate.profile, stageBindings);
    if (!stageIds.length) {
      suppressed.push(suppressedSkill(candidate.skill.name, 'stage_budget_exceeded'));
      continue;
    }

    for (const stageId of stageIds) {
      stageBindings[stageId].push(candidate.skill.name);
    }

    active.push({
      skill_id: candidate.skill.name,
      source_path: candidate.skill.source_path || '',
      hash: candidate.skill.hash || '',
      capabilities: candidate.profile.capabilities,
      stage_ids: stageIds,
      score: candidate.score,
      reason: reasonFor(candidate),
    });
  }

  const compactStageBindings = Object.fromEntries(
    Object.entries(stageBindings).filter(([, skillIds]) => skillIds.length > 0),
  );
  const capabilityIndex = buildCapabilityIndex(active);
  const selectionHash = hashSelection({ active, suppressed });

  return {
    schema_version: SCHEMA_VERSION,
    source: {
      loader: LOADER_SOURCE,
      manifest: MANIFEST_SOURCE,
      disabled,
      discovered_at: rawSkillRegistry.discovered_at || null,
    },
    policy: {
      advisoryOnly: true,
      maxActive: MAX_ACTIVE,
      maxPerStage: MAX_PER_STAGE,
      hardFilters: ['no_collision', 'not_disabled', 'has_capability_match'],
      rankKeys: ['canonical_signal_coverage', 'stage_fit', 'capability_fit', 'risk_fit', 'stable_name'],
      collisionPolicy: 'canonical YURI skill roots win over migrated duplicate shadows',
      canonicalSkillRoot: 'skills',
    },
    active,
    suppressed,
    capabilityIndex,
    stageBindings: compactStageBindings,
    trace: {
      selectionHash,
      selectedCount: active.length,
      suppressedCount: suppressed.length,
    },
  };
}

function isCanonicalCollision(skill) {
  const sourcePath = String(skill?.source_path || '');
  if (sourcePath.startsWith('skills/')) return true;
  return CANONICAL_COLLISION_SOURCES.has(String(skill?.source_type || ''));
}

function isSuppressedLegacySkill(skillId, legacyAliases) {
  const alias = LEGACY_PARSER_ONLY_SKILLS[skillId];
  return !!alias && !legacyAliases.has(alias);
}

function profileSkill(skill) {
  const skillId = String(skill?.name || '');
  const known = SKILL_CAPABILITY_PROFILES[skillId];
  if (known) {
    return {
      capabilities: unique(known.capabilities),
      traits: unique(known.traits),
      signals: unique(known.signals),
      requiredSignals: unique(known.requiredSignals || []),
      coverageSignals: unique(known.coverageSignals || []),
      stageAffinity: stageAffinityFor(known.capabilities),
      knownProfile: true,
    };
  }

  const text = `${skillId} ${skill?.source_path || ''} ${skill?.body || ''}`.toLowerCase();
  const capabilities = [];
  const signals = [];

  addIf(text, capabilities, ['risk', 'security', 'audit', 'review', 'policy'], 'risk-review');
  addIf(text, capabilities, ['probability', 'uncertainty', 'calibration', 'decision'], 'decision-calibration');
  addIf(text, capabilities, ['verify', 'verification', 'deterministic', 'test'], 'deterministic-verification');
  addIf(text, capabilities, ['code', 'refactor', 'debug', 'typescript', 'javascript'], 'code');
  addIf(text, capabilities, ['summarize', 'summary', 'document', 'docs'], 'summarization');
  addIf(text, capabilities, ['memory', 'recall', 'rag', 'retrieve', 'retrieval', 'context'], 'memory-navigation');
  addIf(text, capabilities, ['vector', 'search', 'index', 'semantic', 'hybrid'], 'retrieval');
  addIf(text, capabilities, ['skill', 'skills', 'capability', 'routing', 'trigger'], 'skill-recall');
  addIf(text, capabilities, ['persona', 'preference', 'neurodivergent', 'cognitive', 'interaction'], 'persona-alignment');
  addIf(text, capabilities, ['research', 'source', 'citation', 'paper'], 'research');
  addIf(text, capabilities, ['design', 'frontend', 'visual', 'ui', 'ux'], 'design');
  addIf(text, capabilities, ['orchestrate', 'swarm', 'parallel', 'fanout', 'decompose'], 'orchestration');
  addIf(text, capabilities, ['token', 'compact', 'compression'], 'token-efficiency');
  addIf(text, capabilities, ['learn', 'memory', 'trace'], 'reduce-and-learn');

  addIf(text, signals, ['risk', 'security', 'audit'], 'risk');
  addIf(text, signals, ['code', 'refactor', 'debug'], 'code');
  addIf(text, signals, ['docs', 'document', 'summarize'], 'docs');
  addIf(text, signals, ['memory', 'recall', 'rag', 'retrieval', 'context'], 'memory');
  addIf(text, signals, ['research', 'source', 'citation', 'paper'], 'research');
  addIf(text, signals, ['design', 'frontend', 'ui', 'ux'], 'design');
  addIf(text, signals, ['campaign', 'swarm', 'orchestration', 'parallel'], 'campaign');

  return {
    capabilities: unique(capabilities),
    traits: unique(signals),
    signals: unique(signals),
    requiredSignals: [],
    coverageSignals: [],
    stageAffinity: stageAffinityFor(capabilities),
    knownProfile: false,
  };
}

function scoreSkill({ profile, matchedCapabilities, matchedSignals, capabilityHints, workCapabilities, routePlan, context }) {
  let score = 0;
  if (profile.knownProfile) score += 30;
  score += matchedCapabilities.length * 8;
  score += profile.capabilities.filter((capability) => workCapabilities.has(capability)).length * 5;
  score += profile.capabilities.filter((capability) => capabilityHints.has(capability)).length * 3;
  score += matchedSignals.length * 4;
  score += profile.stageAffinity.length * 2;
  if (context.risk && profile.capabilities.includes('risk-review')) score += 6;
  if (context.risk && profile.capabilities.includes('decision-calibration')) score += 12;
  if (context.code && profile.capabilities.includes('code')) score += 4;
  if (context.memory && profile.capabilities.includes('memory-navigation')) score += 12;
  if (context.research && profile.capabilities.includes('research')) score += 8;
  if (context.skillRecall && profile.capabilities.includes('skill-recall')) score += 12;
  if (context.persona && profile.capabilities.includes('persona-alignment')) score += 8;
  if (context.requiresHighReasoning && profile.capabilities.includes('deep-decomposition')) score += 4;
  if (profile.capabilities.includes('deterministic-verification')) score += 10;
  if (capabilityHints.has('output-organization') && profile.traits.includes('lane-taxonomy')) score += 28;
  if (capabilityHints.has('failure-learning') && profile.traits.includes('adversarial-checks')) score += 28;
  if (routePlan?.scenario && profile.signals.includes(String(routePlan.scenario))) score += 2;
  return profile.knownProfile ? score : Math.min(score, 18);
}

function selectedStageIds(profile, stageBindings) {
  return profile.stageAffinity
    .filter((stageId) => stageBindings[stageId] && stageBindings[stageId].length < MAX_PER_STAGE)
    .slice(0, 3);
}

function stageAffinityFor(capabilities) {
  const stageIds = [];
  for (const capability of capabilities || []) {
    stageIds.push(...(CAPABILITY_TO_STAGE[capability] || []));
  }
  return unique(stageIds).filter((stageId) => STAGE_IDS.includes(stageId));
}

function buildCapabilityIndex(active) {
  const index = {};
  for (const skill of active) {
    for (const capability of skill.capabilities) {
      if (!index[capability]) index[capability] = [];
      index[capability].push(skill.skill_id);
    }
  }
  return Object.fromEntries(
    Object.entries(index).sort(([a], [b]) => a.localeCompare(b)).map(([capability, skillIds]) => [
      capability,
      unique(skillIds).sort(),
    ]),
  );
}

function reasonFor(candidate) {
  const parts = [];
  if (candidate.matchedCoverageSignals.length) parts.push(`canonical coverage: ${candidate.matchedCoverageSignals.join(', ')}`);
  if (candidate.matchedCapabilities.length) parts.push(`matched capabilities: ${candidate.matchedCapabilities.join(', ')}`);
  if (candidate.matchedSignals.length) parts.push(`matched signals: ${candidate.matchedSignals.join(', ')}`);
  return parts.join('; ') || 'Matched active pulse context.';
}

function suppressedSkill(skillId, reason) {
  return { skill_id: skillId, reason };
}

function hashSelection({ active, suppressed }) {
  const stable = {
    active: active.map((item) => ({
      skill_id: item.skill_id,
      hash: item.hash,
      stage_ids: item.stage_ids,
      score: item.score,
    })),
    suppressed: suppressed.map((item) => ({
      skill_id: item.skill_id,
      reason: item.reason,
    })).sort((a, b) => a.skill_id.localeCompare(b.skill_id) || a.reason.localeCompare(b.reason)),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

function addIf(text, out, needles, value) {
  if (needles.some((needle) => text.includes(needle))) out.push(value);
}

function asStrings(values) {
  return (Array.isArray(values) ? values : []).map((value) => String(value || '')).filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
