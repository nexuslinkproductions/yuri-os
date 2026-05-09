#!/usr/bin/env node

const OFFLOAD_CONTRACT = {
  version: 3,
  activation: {
    mode: 'automatic',
    triggerless: true,
    startupDefault: true,
    master: ['/tokenmaxxing', 'tokenmaxxing'],
    legacyDelegation: ['btw offload this'],
    steeringPrefixes: ['btw', '/btw'],
    compatibilityOnly: ['@lane', '/tokenmaxxing', 'btw', '/btw', 'btw offload this']
  },
  routingPriority: ['@code-local', '@deepseek', '@triage-local', '@summarize-local', '@gpt-oss', '@swarm', '@kimi', '@claude'],
  universalWorkflow: [
    {
      phase: 'intake',
      owner: 'main-session',
      rule: 'Classify every user request automatically. Do not wait for trigger words.'
    },
    {
      phase: 'route',
      owner: 'shared-contract',
      rule: 'Use this contract to choose the smallest lane that can produce reliable evidence.'
    },
    {
      phase: 'delegate',
      owner: 'lane',
      rule: 'Send bounded work to the selected lane with file boundaries, output cap, and success criteria.'
    },
    {
      phase: 'verify',
      owner: 'local-tools',
      rule: 'Use shell, tests, GitNexus, browser, or other deterministic checks for claims that matter.'
    },
    {
      phase: 'merge',
      owner: 'main-session',
      rule: 'Main session integrates lane output, handles policy, writes final patches, and reports only the result.'
    },
    {
      phase: 'learn',
      owner: 'memory',
      rule: 'Record route, evidence, correction, failure, and reusable pattern in the shared memory surface.'
    }
  ],
  lanes: {
    codeLocal: {
      alias: '@code-local',
      description: 'Qwen-backed local coding lane',
      preferredUsage: ['implementation', 'debugging', 'patch planning', 'test repair']
    },
    deepseek: {
      alias: '@deepseek',
      description: 'DeepSeek reasoning lane',
      preferredUsage: ['reasoning', 'analysis', 'multi-step logic', 'code review']
    },
    triageLocal: {
      alias: '@triage-local',
      description: 'Qwen-backed local triage lane',
      preferredUsage: ['classification', 'quick read', 'initial sort', 'small decisions']
    },
    summarizeLocal: {
      alias: '@summarize-local',
      description: 'Qwen-backed local summarization lane',
      preferredUsage: ['summarization', 'extraction', 'condensation', 'note cleanup']
    },
    gptOss: {
      alias: '@gpt-oss',
      description: 'Formatting and synthesis lane',
      preferredUsage: ['formatting', 'template generation', 'ui text']
    },
    swarm: {
      alias: '@swarm',
      description: 'Ruflo-backed swarm orchestration',
      preferredUsage: ['consensus', 'parallel checks', 'high-stakes review']
    },
    kimi: {
      alias: '@kimi',
      description: 'Remote high-grade reasoning',
      preferredUsage: ['cloud reasoning', 'deep context', 'heavy synthesis']
    },
    comet: {
      alias: '@comet',
      description: 'Browser interaction lane',
      preferredUsage: ['screenshot', 'click', 'type', 'browser control']
    },
    perplexity: {
      alias: '@perplexity',
      description: 'Browser research lane',
      preferredUsage: ['web research', 'latest facts', 'citations']
    }
  },
  swarm: {
    defaultModels: ['deepseek-v4-pro-lite-budget', 'deepseek-v4-flash'],
    workhorseModels: ['deepseek-v4-pro-lite-budget', 'deepseek-v4-flash'],
    description: 'Shared swarm default for Ruflo-backed workhorse fan-out'
  },
  deepseekCodexQualityGate: {
    authority: {
      executor: 'Codex/main-session',
      localTruth: 'shell/tests/GitNexus/source reads',
      modelOutput: 'advisory_only=true; local_truth_claim=false'
    },
    roles: {
      flash: {
        model: 'deepseek-v4-flash',
        use: ['noisy input condensation', 'first-pass triage', 'candidate generation', 'cheap sanity review'],
        outputCapLines: 80
      },
      pro: {
        model: 'deepseek-v4-pro',
        use: ['architecture review', 'protocol review', 'security/risk review', 'ambiguous high-cost planning'],
        outputCapLines: 80
      },
      swarm: {
        models: ['deepseek-v4-pro-lite-budget', 'deepseek-v4-flash'],
        use: ['high-stakes review', 'audit', 'architecture/protocol consensus', 'material uncertainty after local inspection'],
        outputCapLines: 80
      }
    },
    skipWhenAll: [
      'Task is clear enough to implement directly.',
      'Expected edit is under about 50 LOC or one small file.',
      'Target files and symbols are already known.',
      'Deterministic verification is obvious.',
      'No architecture, security, protocol, or routing risk exists.',
      'DeepSeek would add more than 20% task time.'
    ],
    discardWhenAny: [
      'Claims repo state without exact file/path evidence.',
      'Suggests writes, staging, commits, broad search, secrets access, DB reads, or protected path access.',
      'Contradicts deterministic local evidence.',
      'Produces unbounded prose instead of the requested schema.',
      'Expands scope beyond the user request.',
      'Gives more than 5 alternatives without ranking.',
      'Cannot state acceptance criteria or test ideas.',
      'Adds uncertainty without a concrete decision.'
    ],
    blockInfluenceWhenAny: [
      'Two or more material repo claims are unverifiable.',
      'One claim conflicts with deterministic local evidence.',
      'A forbidden operation is recommended.',
      'Flash and Pro disagree and local evidence cannot resolve it.',
      'Review adds no actionable finding within 10 minutes or 20% task time.'
    ],
    disableForTaskClassWhenAny: [
      'Fewer than 2 accepted improvements across 5 similar uses.',
      'False or irrelevant findings exceed 20%.',
      'Average latency exceeds 15 minutes.',
      'Codex must redo the plan from scratch more than once.'
    ],
    promoteForTaskClassWhenAny: [
      'DeepSeek catches at least 2 locally confirmed issues across 5 similar uses.',
      'Rework loops drop.',
      'Test coverage improves.',
      'Codex final diffs become smaller or cleaner.',
      'User corrections decrease.'
    ],
    metrics: ['latency_added_minutes', 'accepted_findings', 'rejected_claims', 'verified_issues_caught', 'tests_affected']
  },
  learningLoop: {
    memorySurface: '_SYSTEM/OS_KERNEL/memory.db',
    durableSeed: '.claude/nisaba/learning/global.md',
    capture: ['request_class', 'chosen_lane', 'fallbacks', 'evidence_used', 'files_touched', 'tests_run', 'user_correction', 'next_rule_candidate'],
    promoteRuleWhen: [
      'The same correction repeats.',
      'A route wins repeatedly for the same task class.',
      'A failure exposes a missing guardrail.',
      'A scenario example would prevent future ambiguity.'
    ]
  },
  scenarios: [
    {
      id: 'code-change',
      title: 'Implement or fix code',
      match: ['implement', 'fix', 'debug', 'patch', 'refactor', 'test'],
      defaultLane: 'code-local',
      lifecycle: [
        'Intake: identify target files, symbols, and expected behavior.',
        'Impact: run GitNexus impact before editing indexed symbols.',
        'Delegate: ask code-local for focused analysis or patch shape.',
        'Edit: main session applies minimal patch.',
        'Verify: run targeted tests, syntax checks, and detect-changes before commit.',
        'Learn: record route, failures, and reusable fix pattern.'
      ]
    },
    {
      id: 'high-stakes-review',
      title: 'Review, audit, security, or architecture check',
      match: ['review', 'audit', 'security', 'architecture', 'risk', 'high-stakes'],
      defaultLane: 'swarm',
      lifecycle: [
        'Intake: define verdict, risk categories, and files/processes in scope.',
        'Fan-out: run shared swarm pair for independent reads.',
        'Verify: check claims with local source, tests, GitNexus, or browser evidence.',
        'Merge: main session reports findings first, ordered by severity.',
        'Learn: promote repeated risks into guardrails or scenario examples.'
      ]
    },
    {
      id: 'research-latest',
      title: 'Current research or external facts',
      match: ['latest', 'current', 'today', 'research', 'web', 'citation'],
      defaultLane: 'perplexity',
      lifecycle: [
        'Intake: mark volatile facts and required source quality.',
        'Delegate: use browser research lane for current evidence.',
        'Verify: compare dates, primary sources, and contradictions.',
        'Merge: separate facts, inference, and recommendation.',
        'Learn: store durable source patterns, not transient facts.'
      ]
    },
    {
      id: 'protocol-change',
      title: 'Rules, protocols, IDE sync, or agent harness behavior',
      match: ['protocol', 'rule', 'ide', 'agent', 'harness', 'workflow', 'offload', 'routing'],
      defaultLane: 'swarm',
      lifecycle: [
        'Intake: identify every rule surface that must stay aligned.',
        'Impact: inspect existing protocol inheritance and stale wording.',
        'Edit: update the shared contract first, then dependent docs.',
        'Verify: search for old lane tables, trigger-only wording, and syntax errors.',
        'Learn: add scenario examples when they reduce future routing ambiguity.'
      ]
    },
    {
      id: 'document-synthesis',
      title: 'Summarize, extract, format, or synthesize text',
      match: ['summarize', 'summary', 'extract', 'format', 'template', 'table'],
      defaultLane: 'summarize-local',
      lifecycle: [
        'Intake: define input boundary and output shape.',
        'Delegate: use summarize-local or gpt-oss depending on whether content or formatting dominates.',
        'Verify: check that key facts survived and invented details did not appear.',
        'Merge: main session returns compact final output.',
        'Learn: store useful output templates only when reused.'
      ]
    }
  ],
  harnessContract: {
    appliesTo: ['Codex', 'Claude Code', 'Cursor', 'VS Code', 'Antigravity', 'Gemini', 'OpenClaw', 'future CLI agents'],
    requiredBehavior: [
      'Load OPERATOR_PROTOCOL.md or an inheriting rule file at startup.',
      'Treat offload routing as automatic for every non-trivial task.',
      'Use Scripts/offload-contract.mjs as the only lane and scenario source.',
      'Use ./Scripts/ai auto "<prompt>" as the execution entrypoint for automatic classification and dispatch.',
      'Keep explicit triggers as compatibility aliases only.',
      'Log durable corrections and route outcomes to the shared memory surface.',
      'Add new IDEs by inheriting the protocol, not by copying lane tables.'
    ]
  }
};

function normalizePrompt(input) {
  return String(input || '').trim().toLowerCase();
}

function selectSteeringLane(prompt) {
  const text = normalizePrompt(prompt);

  if (!text) return 'triage-local';

  if (text.includes('/tokenmaxxing') || text.includes('tokenmaxxing')) {
    return 'swarm';
  }

  if (text.includes('btw offload this') || text.startsWith('offload this')) {
    return 'swarm';
  }

  if (text.includes('@swarm') || text.includes('swarm') || text.includes('fan out') || text.includes('parallel') || text.includes('compare') || text.includes('consensus')) {
    return 'swarm';
  }

  if (text.includes('architecture') || text.includes('review') || text.includes('audit') || text.includes('security') || text.includes('high-stakes')) {
    return 'swarm';
  }

  if (text.includes('protocol') || text.includes('ide') || text.includes('agent harness') || text.includes('workflow') || text.includes('routing') || text.includes('offload')) {
    return 'swarm';
  }

  if (text.includes('@kimi') || text.includes('kimi') || text.includes('moonshot') || text.includes('cloud')) {
    return 'kimi';
  }

  if (text.includes('@code-local') || text.includes('implement') || text.includes('build') || text.includes('compile') || text.includes('typescript') || text.includes('javascript') || text.includes('function') || text.includes('class') || text.includes('test') || text.includes('debug') || text.includes('fix') || text.includes('refactor') || text.includes('patch') || text.includes('coding')) {
    return 'code-local';
  }

  if (text.includes('@deepseek') || text.includes('deepseek') || text.includes('reasoning') || text.includes('analysis') || text.includes('multi-step')) {
    return 'deepseek';
  }

  if (text.includes('@qwen') || text.includes('summarize') || text.includes('summary') || text.includes('condense') || text.includes('extract') || text.includes('extraction') || text.includes('triage') || text.includes('general task')) {
    return text.includes('summarize') || text.includes('summary') || text.includes('condense') ? 'summarize-local' : 'triage-local';
  }

  if (text.includes('@gpt-oss') || text.includes('gpt-oss') || text.includes('format') || text.includes('formatting') || text.includes('template') || text.includes('ui ') || text.includes('frontend') || text.includes('design') || text.includes('react') || text.includes('interface')) {
    return 'gpt-oss';
  }

  if (text.includes('@comet')) return 'comet';
  if (text.includes('@perplexity')) return 'perplexity';

  return 'triage-local';
}

function getSwarmModels(kind = 'default') {
  if (kind === 'workhorse' || kind === 'default') {
    return OFFLOAD_CONTRACT.swarm.defaultModels.slice();
  }
  return OFFLOAD_CONTRACT.swarm.defaultModels.slice();
}

function includesAny(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

function assessDeepseekAdvisory(prompt, lane, scenario) {
  const text = normalizePrompt(prompt);
  const policy = OFFLOAD_CONTRACT.deepseekCodexQualityGate;
  const proSignals = [
    'architecture', 'protocol', 'security', 'audit', 'review', 'risk', 'high-stakes',
    'routing', 'offload', 'agent harness', 'workflow', 'protected', 'memory', 'policy',
    'contract', 'shared behavior', 'cross-file', 'tradeoff', 'trade-off', 'rework'
  ];
  const flashSignals = [
    'log', 'logs', 'notes', 'long context', 'noisy', 'triage', 'classify',
    'classification', 'summarize', 'summary', 'candidate', 'options', 'sanity',
    'first-pass', 'session history', 'brief'
  ];
  const ambiguousBugSignals = [
    'ambiguous bug', 'unclear bug', 'flaky', 'intermittent', 'unknown failure',
    'root cause', 'hypothesis', 'diagnose'
  ];
  const postReproSignals = [
    'after one reproduction', 'after reproduction', 'first verification failed',
    'still unclear', 'could not isolate', 'material uncertainty'
  ];

  if (lane === 'swarm') {
    return {
      decision: 'use-swarm',
      models: getSwarmModels('default'),
      role: 'independent advisory review',
      reason: scenario.id === 'protocol-change' ? 'protocol_or_routing_quality_risk' : 'high_stakes_review_threshold_met',
      preflight: true,
      postflight: true,
      outputCapLines: policy.roles.swarm.outputCapLines,
      localTruthRequired: true,
      codexFinalAuthority: true,
      discardWhenAny: policy.discardWhenAny,
      blockInfluenceWhenAny: policy.blockInfluenceWhenAny
    };
  }

  if (includesAny(text, proSignals) || includesAny(text, postReproSignals)) {
    return {
      decision: 'use-pro',
      models: [policy.roles.pro.model],
      role: 'deep planning/review advisory',
      reason: includesAny(text, postReproSignals) ? 'local_reproduction_did_not_isolate_cause' : 'architecture_protocol_or_risk_threshold_met',
      preflight: true,
      postflight: scenario.id === 'code-change',
      outputCapLines: policy.roles.pro.outputCapLines,
      localTruthRequired: true,
      codexFinalAuthority: true,
      discardWhenAny: policy.discardWhenAny,
      blockInfluenceWhenAny: policy.blockInfluenceWhenAny
    };
  }

  if (scenario.id === 'document-synthesis' || includesAny(text, flashSignals) || includesAny(text, ambiguousBugSignals)) {
    return {
      decision: 'use-flash',
      models: [policy.roles.flash.model],
      role: 'fast scout/triage advisory',
      reason: includesAny(text, ambiguousBugSignals) ? 'ambiguous_bug_first_pass' : 'noisy_or_broad_input_threshold_met',
      preflight: true,
      postflight: false,
      outputCapLines: policy.roles.flash.outputCapLines,
      localTruthRequired: true,
      codexFinalAuthority: true,
      discardWhenAny: policy.discardWhenAny,
      blockInfluenceWhenAny: policy.blockInfluenceWhenAny
    };
  }

  return {
    decision: 'skip',
    models: [],
    role: 'none',
    reason: 'clear_execution_task_below_deepseek_threshold',
    preflight: false,
    postflight: false,
    outputCapLines: 0,
    localTruthRequired: true,
    codexFinalAuthority: true,
    skipWhenAll: policy.skipWhenAll
  };
}

function selectScenario(prompt, lane = '') {
  const text = normalizePrompt(prompt);
  const matches = OFFLOAD_CONTRACT.scenarios.filter((scenario) => (
    scenario.match.some((marker) => text.includes(marker))
  ));
  return matches.find((scenario) => scenario.defaultLane === lane) ||
    matches[0] ||
    OFFLOAD_CONTRACT.scenarios.find((scenario) => scenario.id === 'document-synthesis');
}

function buildRoutePlan(prompt) {
  const lane = selectSteeringLane(prompt);
  const scenario = selectScenario(prompt, lane);
  const deepseekAdvisory = assessDeepseekAdvisory(prompt, lane, scenario);
  return {
    prompt,
    lane,
    scenario: scenario.id,
    title: scenario.title,
    automatic: OFFLOAD_CONTRACT.activation.triggerless,
    entrypoint: './Scripts/ai auto',
    qualityGate: 'main-session',
    dispatch: lane === 'swarm' ? 'parallel-fan-out' : 'single-lane',
    deepseekAdvisory,
    lifecycle: scenario.lifecycle,
    learningCapture: OFFLOAD_CONTRACT.learningLoop.capture,
    memorySurface: OFFLOAD_CONTRACT.learningLoop.memorySurface
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const [, , command = 'contract', ...args] = process.argv;

switch (command) {
  case 'contract':
    printJson(OFFLOAD_CONTRACT);
    break;
  case 'steer':
    process.stdout.write(`${selectSteeringLane(args.join(' '))}\n`);
    break;
  case 'route-plan':
    printJson(buildRoutePlan(args.join(' ')));
    break;
  case 'examples':
    printJson(OFFLOAD_CONTRACT.scenarios);
    break;
  case 'swarm-default':
  case 'swarm-workhorse':
    process.stdout.write(`${getSwarmModels(command === 'swarm-workhorse' ? 'workhorse' : 'default').join(',')}\n`);
    break;
  default:
    console.error(`Unknown offload contract command: ${command}`);
    process.exit(1);
}
