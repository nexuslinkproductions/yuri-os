#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildActiveSkillRegistry } from './yuri-active-skill-registry.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const PLAN_SCHEMA_VERSION = 2;

const CAPABILITY_TRAITS = {
  'triage-local': {
    capabilities: ['classification', 'small-decision', 'intent-normalization'],
    cost: 'low',
    latency: 'low',
    privacy: 'local',
    memoryLoad: 'low',
    contextSize: 'small',
    concurrency: 'serial-local',
    traits: ['local', 'cheap', 'classification', 'small-decision'],
  },
  'summarize-local': {
    capabilities: ['summarization', 'extraction', 'condensation'],
    cost: 'low',
    latency: 'low',
    privacy: 'local',
    memoryLoad: 'low',
    contextSize: 'small',
    concurrency: 'serial-local',
    traits: ['local', 'cheap', 'summarization', 'extraction'],
  },
  'code-local': {
    capabilities: ['code', 'patch-shape', 'debugging', 'test-repair'],
    cost: 'low',
    latency: 'medium',
    privacy: 'local',
    memoryLoad: 'medium',
    contextSize: 'medium',
    concurrency: 'serial-local',
    traits: ['local', 'code', 'patch-shape', 'debugging'],
  },
  'ollama-local': {
    capabilities: ['private-utility', 'bounded-local-reasoning'],
    cost: 'low',
    latency: 'medium',
    privacy: 'local',
    memoryLoad: 'medium',
    contextSize: 'medium',
    concurrency: 'serial-local',
    traits: ['local', 'private', 'bounded-utility'],
  },
  'gpt-oss': {
    capabilities: ['formatting', 'synthesis', 'template-generation'],
    cost: 'low',
    latency: 'medium',
    privacy: 'local',
    memoryLoad: 'medium',
    contextSize: 'medium',
    concurrency: 'serial-local',
    traits: ['local', 'formatting', 'synthesis', 'template'],
  },
  deepseek: {
    capabilities: ['reasoning', 'analysis', 'multi-step'],
    cost: 'medium',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'reasoning', 'analysis', 'multi-step'],
  },
  'deepseek-v4-pro': {
    capabilities: ['deep-reasoning', 'decomposition', 'architecture-review', 'risk-review', 'deep-code-analysis'],
    cost: 'high',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'high-reasoning', 'architecture', 'risk', 'pulse', 'code', 'deep-analysis'],
  },
  'deepseek-v4-flash': {
    capabilities: ['fast-triage', 'condensation', 'sanity-review'],
    cost: 'medium',
    latency: 'low',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'fast-triage', 'condensation', 'sanity-review'],
  },
  kimi: {
    capabilities: ['long-context', 'deep-synthesis'],
    cost: 'high',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'long-context', 'deep-synthesis'],
  },
  'reason-cloud': {
    capabilities: ['reasoning', 'large-model'],
    cost: 'high',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'reasoning', 'large-model'],
  },
  'code-cloud': {
    capabilities: ['code', 'large-code-model'],
    cost: 'high',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'code', 'large-model'],
  },
  'nvidia-deepseek': {
    capabilities: ['hosted-deep-reasoning', 'architecture-review'],
    cost: 'high',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'high-reasoning', 'hosted-deepseek'],
  },
  'gemma-local': {
    capabilities: ['multimodal', 'inspection'],
    cost: 'low',
    latency: 'medium',
    privacy: 'local',
    memoryLoad: 'medium',
    contextSize: 'medium',
    concurrency: 'serial-local',
    traits: ['local', 'multimodal', 'inspection'],
  },
  'gemma-cloud': {
    capabilities: ['multimodal', 'inspection'],
    cost: 'medium',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'multimodal', 'inspection'],
  },
  gemma: {
    capabilities: ['multimodal', 'inspection'],
    cost: 'medium',
    latency: 'medium',
    privacy: 'cloud-or-local',
    memoryLoad: 'varies',
    contextSize: 'medium',
    concurrency: 'cloud-bounded',
    traits: ['cloud-or-local', 'multimodal', 'inspection'],
  },
  'openrouter-free': {
    capabilities: ['fallback', 'research-scout'],
    cost: 'free-or-low',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'medium',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'fallback', 'free-router'],
  },
  codex: {
    capabilities: ['executor-adjacent', 'responses', 'deep-code-reasoning'],
    cost: 'high',
    latency: 'medium',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'executor-adjacent', 'responses'],
  },
  'codex-mini': {
    capabilities: ['small-reasoning', 'responses'],
    cost: 'medium',
    latency: 'low',
    privacy: 'cloud',
    memoryLoad: 'none-local',
    contextSize: 'medium',
    concurrency: 'cloud-bounded',
    traits: ['cloud', 'small-reasoning', 'responses'],
  },
  claude: {
    capabilities: ['advisory-dissent', 'architecture-review', 'risk-review'],
    cost: 'external',
    latency: 'medium',
    privacy: 'external',
    memoryLoad: 'none-local',
    contextSize: 'large',
    concurrency: 'external-bounded',
    traits: ['external', 'advisory-dissent', 'architecture', 'risk'],
  },
  shell: {
    capabilities: ['deterministic-verification', 'source-truth'],
    cost: 'none',
    latency: 'low',
    privacy: 'local',
    memoryLoad: 'none',
    contextSize: 'n/a',
    concurrency: 'native',
    traits: ['native', 'deterministic', 'verification'],
  },
  tests: {
    capabilities: ['regression-verification'],
    cost: 'none',
    latency: 'varies',
    privacy: 'local',
    memoryLoad: 'varies',
    contextSize: 'n/a',
    concurrency: 'native',
    traits: ['native', 'deterministic', 'tests'],
  },
  git: {
    capabilities: ['change-state', 'local-truth'],
    cost: 'none',
    latency: 'low',
    privacy: 'local',
    memoryLoad: 'none',
    contextSize: 'n/a',
    concurrency: 'native',
    traits: ['native', 'deterministic', 'git'],
  },
  memory: {
    capabilities: ['trace-ledger', 'learning-capture'],
    cost: 'none',
    latency: 'low',
    privacy: 'local',
    memoryLoad: 'none',
    contextSize: 'n/a',
    concurrency: 'native',
    traits: ['native', 'memory', 'trace'],
  },
};

const EXTERNAL_LANES = {
  claude: {
    command: process.env.CLAUDE_BIN || 'claude',
    kind: 'external',
    model: 'claude-sonnet-4-6',
  },
};

const LEGACY_ALIAS_PATTERNS = [
  { id: 'council', pattern: /\bcouncil\b|model council/i, normalizedTo: 'symbioticPulse' },
  { id: 'workhorse', pattern: /\bworkhorse\b|deepseek-workhorse/i, normalizedTo: 'symbioticPulse' },
  { id: 'swarm', pattern: /@swarm|\bswarm\b|fan[- ]out|parallel/i, normalizedTo: 'symbioticPulse' },
  { id: 'offload', pattern: /\boffload\b|btw offload this/i, normalizedTo: 'symbioticPulse' },
];

const argv = process.argv.slice(2);
const options = parseArgs(argv);

if (options.help) {
  printHelp();
  process.exit(0);
}

if (!options.intent) {
  printHelp();
  process.exit(1);
}

const routePlan = runJson(['Scripts/offload-contract.mjs', 'route-plan', options.intent]);
const inventory = runJson(['Scripts/offload-runner.mjs', '--inventory']);
const plan = buildPulsePlan(options.intent, routePlan, inventory, options);

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

function parseArgs(args) {
  const out = {
    command: 'plan',
    intentParts: [],
    help: false,
    intent: '',
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (arg === 'plan' || arg === 'observe') {
      out.command = arg;
      continue;
    }
    out.intentParts.push(arg);
  }

  out.intent = collapse(out.intentParts.join(' '));
  return out;
}

function printHelp() {
  process.stdout.write([
    'Usage:',
    '  node Scripts/yuri-symbiotic-pulse.mjs plan "<campaign or task>"',
    '  node Scripts/yuri-symbiotic-pulse.mjs observe "<campaign or task>"',
    '',
    'Builds PulsePlan v2 from a Pulse Seed, the route contract, and live LLM/tool inventory.',
  ].join('\n') + '\n');
}

function runJson(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${args.join(' ')} returned non-JSON output`);
  }
}

function buildPulsePlan(intent, routePlan, inventory, options) {
  const aliasContext = detectLegacyAliases(intent);
  const context = analyzeIntent(intent, routePlan);
  const pulseSeed = buildPulseSeed(intent, routePlan, context, aliasContext);
  const skillLoaderDisabled = process.env.YURI_SKILL_LOADER_DISABLE === '1';
  const rawSkillRegistry = skillLoaderDisabled ? { skills: [], discovered_at: null, count: 0 } : runJson(['Scripts/yuri-skill-loader.mjs', '--json']);
  const activeSkillRegistry = buildActiveSkillRegistry({
    pulseSeed,
    context,
    routePlan,
    rawSkillRegistry,
    disabled: skillLoaderDisabled,
  });
  const arsenalRegistry = buildArsenalRegistry(inventory);
  const stageBuilder = createStageBuilder(arsenalRegistry, activeSkillRegistry);
  const stages = [];

  const classifyEntry = stageBuilder.firstAvailable(['triage-local', 'summarize-local', 'deepseek-v4-flash', 'deepseek']);
  stageBuilder.addStage(stages, {
    id: 'intake_classify',
    capability: 'intent-normalization',
    purpose: 'Normalize the Pulse Seed, classify scenario, and decide whether deeper fan-out is justified.',
    candidates: ['triage-local', 'summarize-local', 'deepseek-v4-flash', 'deepseek'],
    laneIds: classifyEntry ? [classifyEntry] : [],
    skillIds: activeSkillRegistry.stageBindings.intake_classify || [],
    dependsOn: [],
  });

  if (context.requiresHighReasoning) {
    const plannerEntry = stageBuilder.firstAvailable(['deepseek-v4-pro', 'kimi', 'nvidia-deepseek', 'deepseek']);
    stageBuilder.addStage(stages, {
      id: 'campaign_decompose',
      capability: 'deep-decomposition',
      purpose: 'Dissect the Pulse Seed into independent work packets, constraints, success criteria, and stop conditions.',
      candidates: ['deepseek-v4-pro', 'kimi', 'nvidia-deepseek', 'deepseek'],
      laneIds: plannerEntry ? [plannerEntry] : [],
      skillIds: activeSkillRegistry.stageBindings.campaign_decompose || [],
      dependsOn: ['intake_classify'],
    });
  }

  const specialistCandidates = buildSpecialistCandidates(context, routePlan);
  const specialistLaneIds = stageBuilder.uniqueFirstAvailable(specialistCandidates);
  stageBuilder.addStage(stages, {
    id: 'specialist_fanout',
    capability: 'bounded-specialist-work',
    purpose: 'Activate only specialist entries matching the decomposed work packets.',
    candidates: specialistCandidates.flat(),
    laneIds: specialistLaneIds,
    skillIds: activeSkillRegistry.stageBindings.specialist_fanout || [],
    dependsOn: context.requiresHighReasoning ? ['campaign_decompose'] : ['intake_classify'],
  });

  stageBuilder.addStage(stages, {
    id: 'verify_local_truth',
    capability: 'deterministic-verification',
    purpose: 'Verify claims with deterministic local tools before any result can influence final work.',
    candidates: ['shell', 'tests', 'git'],
    laneIds: ['main-session'],
    nativeEntries: ['shell', 'tests', 'git'],
    skillIds: activeSkillRegistry.stageBindings.verify_local_truth || [],
    dependsOn: ['specialist_fanout'],
    nativeOnly: true,
  });

  stageBuilder.addStage(stages, {
    id: 'merge_learn',
    capability: 'reduce-and-learn',
    purpose: 'Merge accepted outputs, reject unverified claims, and capture reusable route learning.',
    candidates: ['main-session', 'memory'],
    laneIds: ['main-session'],
    nativeEntries: ['memory'],
    skillIds: activeSkillRegistry.stageBindings.merge_learn || [],
    dependsOn: ['verify_local_truth'],
    nativeOnly: true,
  });

  const activationGraph = buildActivationGraph(stages, context);
  const selectedLaneIds = stages.flatMap((stage) => stage.laneIds).filter((lane) => lane !== 'main-session');
  const selectedCapabilities = unique(stages.map((stage) => stage.capability));
  const availableArsenal = Object.values(arsenalRegistry.entries)
    .filter((entry) => entry.availability.available)
    .sort((a, b) => a.id.localeCompare(b.id));

  const pulseTrace = buildPulseTrace(intent, pulseSeed, stages, stageBuilder, routePlan, aliasContext, activeSkillRegistry);

  return {
    schema_version: PLAN_SCHEMA_VERSION,
    contract: 'PulsePlan',
    mode: options.command === 'observe' ? 'observe_only' : 'plan_only',
    generated_at: new Date().toISOString(),
    intent: {
      text: intent,
      sha256: sha256(intent),
    },
    pulseSeed,
    route: {
      lane: routePlan.lane,
      scenario: routePlan.scenario,
      title: routePlan.title,
      dispatch: routePlan.dispatch,
      compatibility_only: true,
    },
    symbioticPulse: {
      status: 'active',
      unit: 'symbioticPulse',
      nativeModules: ['ai-pipeline-offloading', 'swarm-coordination', 'offload-runner'],
      arsenalScope: 'all_available_lanes',
      triggerAllAtOnce: false,
      reasoningMode: context.requiresHighReasoning ? 'high' : 'bounded',
      selectionBasis: context.signals,
      selectedCapabilities,
      activationPolicy: {
        initialStageMaxLanes: 1,
        localConcurrency: 1,
        cloudConcurrency: context.requiresHighReasoning ? 3 : 2,
        fanoutRequiresPriorStage: true,
        skipUnavailableLanes: true,
        stopWhenDeterministicAnswerFound: !context.requiresHighReasoning,
        hiddenReasoningStorage: false,
      },
      selectedLanes: unique(selectedLaneIds),
      availableArsenal: availableArsenal.map(publicArsenalEntry),
      arsenalRegistry,
      activeSkillRegistry,
      skippedCandidates: stageBuilder.skipped,
      stages,
      activationGraph,
      pulseTrace,
      outputRule: 'LLM output remains advisory until deterministic local verification accepts it; traces store decisions and evidence, not hidden chain-of-thought.',
    },
    pulseTrace,
  };
}

function buildPulseSeed(intent, routePlan, context, aliasContext) {
  const objective = inferObjective(intent, routePlan);
  const constraints = inferConstraints(intent, context);
  const assets = inferAssets(intent, context);
  const risks = inferRisks(intent, context);
  const workPackets = inferWorkPackets(intent, context);
  const capabilityHints = inferCapabilityHints(context);
  const privacyClass = context.private ? 'local-sensitive' : 'standard';

  return {
    schema_version: 1,
    definition: 'Pulse Seed is a structured intent genome: raw braindump normalized into objective, constraints, context, risk, success criteria, work packets, and model-affinity signals.',
    objective,
    constraints,
    assets,
    risks,
    successCriteria: inferSuccessCriteria(context),
    workPackets,
    capabilityHints,
    privacyClass,
    legacyAliases: aliasContext.detected.map((alias) => ({
      alias,
      normalizedTo: 'symbioticPulse',
      parserOnly: true,
    })),
  };
}

function inferObjective(intent, routePlan) {
  const text = collapse(intent);
  if (!text) return routePlan.title || 'Process request through symbioticPulse.';
  return text.length <= 180 ? text : `${text.slice(0, 177)}...`;
}

function inferConstraints(intent, context) {
  const constraints = [
    'Do not trigger all available models at once.',
    'Keep local memory-heavy models serialized.',
    'Treat model output as advisory until local verification accepts it.',
  ];
  if (context.private) constraints.push('Prefer local/private lanes and avoid cloud unless explicitly needed.');
  if (context.requiresHighReasoning) constraints.push('Use deep reasoning only after intake classification justifies it.');
  if (/no cloud|local only|local-only/i.test(intent)) constraints.push('Cloud lanes blocked by user wording.');
  return constraints;
}

function inferAssets(intent, context) {
  const assets = ['route contract', 'live model inventory', 'local deterministic tools'];
  if (context.code) assets.push('source tree', 'tests');
  if (context.docs) assets.push('documents', 'notes');
  if (context.research) assets.push('web/research lane');
  if (context.design || context.multimodal) assets.push('visual artifact surface');
  return unique(assets);
}

function inferRisks(intent, context) {
  const risks = [];
  if (context.risk) risks.push('architecture/security/protocol risk');
  if (context.research) risks.push('stale external facts');
  if (context.code) risks.push('behavioral regression');
  if (context.private) risks.push('sensitive local context leakage');
  if (/commit|stage|write|delete|migrate/i.test(intent)) risks.push('mutation requires deterministic local verification');
  return risks.length ? risks : ['low-risk advisory output drift'];
}

function inferWorkPackets(intent, context) {
  const packets = [{ id: 'classify', capability: 'intent-normalization', summary: 'Classify the incoming Pulse Seed and bound execution.' }];
  if (context.requiresHighReasoning) packets.push({ id: 'decompose', capability: 'deep-decomposition', summary: 'Break broad intent into independently verifiable work.' });
  if (context.code) packets.push({ id: 'code', capability: 'code', summary: 'Inspect implementation/test implications.' });
  if (context.docs) packets.push({ id: 'docs', capability: 'summarization', summary: 'Condense or structure document output.' });
  if (context.research) packets.push({ id: 'research', capability: 'research-scout', summary: 'Gather current source-backed context.' });
  if (context.design) packets.push({ id: 'design', capability: 'formatting', summary: 'Shape visual/story artifact requirements.' });
  if (context.multimodal) packets.push({ id: 'multimodal', capability: 'multimodal', summary: 'Inspect image/PDF/visual inputs.' });
  packets.push({ id: 'verify', capability: 'deterministic-verification', summary: 'Confirm claims locally before merge.' });
  packets.push({ id: 'merge', capability: 'reduce-and-learn', summary: 'Reduce accepted outputs and capture route learning.' });
  return packets;
}

function inferCapabilityHints(context) {
  const hints = ['intent-normalization'];
  if (context.requiresHighReasoning) hints.push('deep-decomposition');
  if (context.code) hints.push('code');
  if (context.docs) hints.push('summarization');
  if (context.research) hints.push('research-scout');
  if (context.design) hints.push('formatting');
  if (context.risk) hints.push('risk-review');
  if (context.private) hints.push('private-utility');
  if (context.multimodal) hints.push('multimodal');
  hints.push('deterministic-verification', 'reduce-and-learn');
  return unique(hints);
}

function inferSuccessCriteria(context) {
  const criteria = [
    'A bounded activation graph is produced.',
    'Unavailable or frozen local models are skipped.',
    'No stage triggers every model at once.',
  ];
  if (context.code) criteria.push('Code claims are backed by source/test evidence.');
  if (context.research) criteria.push('Current external claims cite fresh sources before use.');
  if (context.risk) criteria.push('High-risk outputs pass local verification before merge.');
  return criteria;
}

function analyzeIntent(intent, routePlan) {
  const text = intent.toLowerCase();
  const signals = [];
  const checks = [
    ['campaign', /campaign|large|broad|multi|orchestrat|chainreaction|symbiotic|pulse|arsenal|many llm|numerous llm|braindump|brain dump/],
    ['code', /code|implement|debug|test|patch|refactor|typescript|javascript|backend|frontend|api/],
    ['docs', /summarize|summary|extract|document|docs|notes|brief|report|copy|rewrite|presentation|launch/],
    ['research', /latest|current|today|web|research|citation|source|market|competitor|nvidia|anthropic|tencent/],
    ['design', /design|ui|ux|frontend|interface|visual|layout|brand|animated|animation|graph|deck/],
    ['risk', /risk|security|audit|review|architecture|protocol|policy|governance|high-stakes/],
    ['private', /private|offline|local-only|local only|sensitive/],
    ['multimodal', /image|screenshot|vision|multimodal|pdf|diagram/],
  ];

  for (const [signal, pattern] of checks) {
    if (pattern.test(text)) signals.push(signal);
  }

  if (!signals.length) signals.push(routePlan.scenario || 'general');

  return {
    signals,
    code: signals.includes('code'),
    docs: signals.includes('docs'),
    research: signals.includes('research'),
    design: signals.includes('design'),
    risk: signals.includes('risk'),
    private: signals.includes('private'),
    multimodal: signals.includes('multimodal'),
    requiresHighReasoning: signals.some((signal) => ['campaign', 'risk', 'research'].includes(signal)) ||
      ['swarm', 'deepseek-v4-pro', 'kimi'].includes(routePlan.lane),
  };
}

function buildSpecialistCandidates(context, routePlan) {
  const groups = [];

  if (context.code) groups.push(['code-local', 'deepseek-v4-pro', 'code-cloud']);
  if (context.docs) groups.push(['summarize-local', 'deepseek-v4-flash', 'gpt-oss']);
  if (context.research) groups.push(['openrouter-free', 'deepseek-v4-flash', 'kimi']);
  if (context.design) groups.push(['gpt-oss', 'gemma', 'gemma-cloud']);
  if (context.risk) groups.push(['deepseek-v4-pro', 'claude', 'kimi']);
  if (context.private) groups.push(['ollama-local', 'triage-local']);
  if (context.multimodal) groups.push(['gemma-local', 'gemma-cloud', 'gemma']);

  groups.push(['deepseek-v4-pro', 'deepseek-v4-flash']);
  if (routePlan.lane && routePlan.lane !== 'swarm') groups.push([routePlan.lane]);

  return groups;
}

function buildArsenalRegistry(inventory) {
  const entries = {};
  const lanes = inventory?.lanes || {};
  const localPolicy = inventory?.localPolicy || {};
  const frozenModels = new Set([...(localPolicy.frozen || []), ...(localPolicy.manualOnly || [])]);

  for (const [id, lane] of Object.entries(lanes)) {
    entries[id] = buildArsenalEntry(id, lane, frozenModels);
  }

  for (const [id, external] of Object.entries(EXTERNAL_LANES)) {
    if (entries[id]) continue;
    const available = commandAvailable(external.command);
    entries[id] = buildArsenalEntry(id, {
      kind: external.kind,
      model: external.model,
      executable: available,
      error: available ? '' : `missing command: ${external.command}`,
    }, frozenModels);
  }

  for (const id of ['shell', 'tests', 'git', 'memory']) {
    entries[id] = buildArsenalEntry(id, {
      kind: 'native',
      model: '',
      executable: true,
      requiresKey: false,
    }, frozenModels);
  }

  return {
    schema_version: 1,
    source: 'offload-runner --inventory + native deterministic tools',
    localPolicy,
    entries,
  };
}

function buildArsenalEntry(id, lane, frozenModels) {
  const profile = CAPABILITY_TRAITS[id] || {
    capabilities: ['general'],
    cost: lane?.kind === 'cloud' ? 'medium' : 'low',
    latency: 'medium',
    privacy: lane?.kind === 'cloud' ? 'cloud' : 'local',
    memoryLoad: lane?.kind === 'local' ? 'medium' : 'none-local',
    contextSize: 'medium',
    concurrency: lane?.kind === 'local' ? 'serial-local' : 'cloud-bounded',
    traits: [],
  };
  const frozen = lane?.frozen === true || (lane?.kind === 'local' && lane?.model && frozenModels.has(lane.model));
  const availability = {
    available: laneAvailable(lane) && !frozen,
    reason: frozen ? `frozen local model: ${lane.model}` : laneUnavailableReason(lane),
    frozen,
  };

  return {
    schema_version: 1,
    id,
    kind: lane?.kind || 'unknown',
    model: lane?.model || '',
    endpoint: lane?.endpoint || '',
    protocol: lane?.protocol || '',
    thinking: lane?.thinking || '',
    reasoningEffort: lane?.reasoningEffort || '',
    maxTokens: lane?.maxTokens || null,
    timeoutMs: lane?.timeout || null,
    capabilities: profile.capabilities,
    traits: profile.traits,
    cost: profile.cost,
    latency: profile.latency,
    privacy: profile.privacy,
    memoryLoad: profile.memoryLoad,
    contextSize: profile.contextSize,
    concurrency: profile.concurrency,
    availability,
  };
}

function laneAvailable(lane) {
  if (!lane || lane.error) return false;
  if (lane.executable === false) return false;
  if (lane.status && String(lane.status).startsWith('SKIPPED')) return false;
  if (lane.status && String(lane.status).startsWith('BLOCKED')) return false;
  if (lane.kind === 'cloud') return lane.hasKey === true || lane.requiresKey === false;
  if (lane.kind === 'local') return !!lane.model;
  if (lane.kind === 'native') return true;
  return !!lane.model;
}

function laneUnavailableReason(lane) {
  if (!lane) return 'missing inventory entry';
  if (lane.error) return lane.error;
  if (lane.executable === false) return lane.error || 'not executable';
  if (lane.kind === 'cloud' && lane.hasKey === false && lane.requiresKey !== false) return 'missing API key';
  if (lane.kind === 'local' && !lane.model) return 'missing local model';
  return '';
}

function createStageBuilder(arsenalRegistry, activeSkillRegistry = {}) {
  const arsenal = arsenalRegistry.entries;
  const activeSkills = new Map((activeSkillRegistry.active || []).map((skill) => [skill.skill_id, skill]));
  return {
    skipped: [],
    firstAvailable(candidates) {
      for (const id of candidates) {
        if (id === 'main-session') return id;
        const entry = arsenal[id];
        if (entry?.availability?.available) return id;
        this.skipped.push({ id, reason: entry?.availability?.reason || 'not in inventory' });
      }
      return '';
    },
    uniqueFirstAvailable(groups) {
      const out = [];
      for (const group of groups) {
        const lane = this.firstAvailable(group);
        if (lane && !out.includes(lane)) out.push(lane);
      }
      return out;
    },
    addStage(stages, stage) {
      const laneIds = stage.laneIds || stage.lanes || [];
      const skillIds = stage.skillIds || [];
      const execution = stage.nativeOnly ? 'native-serial' : executionMode(laneIds, arsenal);
      stages.push({
        ...stage,
        laneIds,
        lanes: laneIds,
        entries: laneIds.map((id) => publicArsenalEntry(arsenal[id])).filter(Boolean),
        skillIds,
        skills: skillIds.map((id) => publicActiveSkillEntry(activeSkills.get(id))).filter(Boolean),
        executionMode: execution,
        triggerAllAtOnce: false,
      });
    },
  };
}

function executionMode(laneIds, arsenal) {
  if (!laneIds || laneIds.length <= 1) return 'serial';
  const localCount = laneIds.filter((id) => arsenal[id]?.kind === 'local').length;
  if (localCount > 0) return 'mixed-cloud-parallel-local-serial';
  return 'parallel';
}

function buildActivationGraph(stages, context) {
  return {
    schema_version: 1,
    type: 'bounded_dag',
    triggerAllAtOnce: false,
    reasoningMode: context.requiresHighReasoning ? 'high' : 'bounded',
    nodes: stages.map((stage) => ({
      id: stage.id,
      capability: stage.capability,
      laneIds: stage.laneIds,
      skillIds: stage.skillIds || [],
      executionMode: stage.executionMode,
      nativeOnly: !!stage.nativeOnly,
    })),
    edges: stages.flatMap((stage) => stage.dependsOn.map((from) => ({ from, to: stage.id }))),
    stopConditions: [
      'deterministic answer found for bounded tasks',
      'all selected specialist packets verified or rejected',
      'verification conflict requires rescope before merge',
    ],
  };
}

function buildPulseTrace(intent, pulseSeed, stages, stageBuilder, routePlan, aliasContext, activeSkillRegistry = {}) {
  return {
    schema_version: 1,
    traceId: `pulse-${Date.now()}-${sha256(intent).slice(0, 10)}`,
    status: 'planned',
    storesHiddenReasoning: false,
    decisionTrace: {
      pulseSeedSha256: sha256(JSON.stringify(pulseSeed)),
      compatibilityRoute: routePlan.lane || '',
      aliasInputs: aliasContext.detected,
      stageCount: stages.length,
      selectedLaneIds: unique(stages.flatMap((stage) => stage.laneIds).filter((lane) => lane !== 'main-session')),
      selectedSkillIds: (activeSkillRegistry.active || []).map((skill) => skill.skill_id),
      activeSkillSelectionHash: activeSkillRegistry.trace?.selectionHash || '',
      skippedCount: stageBuilder.skipped.length,
    },
    evidence: [],
    scores: {
      acceptedClaims: 0,
      rejectedClaims: 0,
      verificationStatus: 'not_run',
      failures: [],
    },
    stageLedger: stages.map((stage) => ({
      stageId: stage.id,
      capability: stage.capability,
      laneIds: stage.laneIds,
      skillIds: stage.skillIds || [],
      status: 'planned',
      evidenceRefs: [],
    })),
  };
}

function publicArsenalEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    kind: entry.kind,
    model: entry.model || null,
    capabilities: entry.capabilities,
    traits: entry.traits,
    cost: entry.cost,
    latency: entry.latency,
    privacy: entry.privacy,
    memoryLoad: entry.memoryLoad,
    contextSize: entry.contextSize,
    concurrency: entry.concurrency,
    availability: entry.availability,
  };
}

function publicActiveSkillEntry(entry) {
  if (!entry) return null;
  return {
    skill_id: entry.skill_id,
    source_path: entry.source_path,
    hash: entry.hash,
    capabilities: entry.capabilities,
    stage_ids: entry.stage_ids,
    score: entry.score,
    reason: entry.reason,
  };
}

function detectLegacyAliases(intent) {
  const detected = String(process.env.PULSE_LEGACY_ALIAS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const alias of LEGACY_ALIAS_PATTERNS) {
    if (alias.pattern.test(intent)) detected.push(alias.id);
  }
  return { detected: unique(detected) };
}

function commandAvailable(command) {
  const result = spawnSync('/bin/sh', ['-lc', 'command -v "$1"', 'sh', command], {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
