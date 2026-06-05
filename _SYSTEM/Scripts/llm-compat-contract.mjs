#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRuntimePath } from './lane-kernel.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_SH = path.join(__dirname, 'ai');

const LLM_COMPAT_CONTRACT = {
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
  // HARD RULE (2026-05-14): Codex is Claude's permanent implementation co-pilot.
  // Codex (gpt-5.5 / gpt-5.4-mini) is ALWAYS first for implementation tasks.
  // DeepSeek = on-call only when explicitly named or for analysis-only work.
  // Symbiotic Pulse = Claude (control) + Codex (implementation) + Shintai/NIM/DeepSeek advisory lanes.
  routingPriority: ['@gpt-5.5', '@gpt-5.4-mini', '@nvidia', '@codex-spark', '@code-local', '@ollama-local', '@triage-local', '@summarize-local', '@gpt-oss', '@native', '@kimi', '@deepseek'],
  routingPriorityAnalysis: ['@deepseek-v4-pro', '@deepseek-v4-flash', '@gpt-5.5'],
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
      dispatchTokens: ['code-local', 'code-cloud', 'reason-cloud', 'gemma', 'gemma-local'],
      description: 'Qwen-backed local coding lane',
      preferredUsage: ['implementation', 'debugging', 'patch planning', 'test repair']
    },
    deepseek: {
      alias: '@deepseek',
      dispatchTokens: ['deepseek', 'deepseek-v4-flash', 'deepseek-v4-pro'],
      description: 'Direct paid DeepSeek V4 reasoning lane through api.deepseek.com. NVIDIA DeepSeek fallback is retired.',
      toolsByDefault: true,
      preferredUsage: ['reasoning', 'analysis', 'multi-step logic', 'code review', 'autonomous file edits', 'multi-file refactors', 'parallel implementer during Codex rate-limit windows']
    },
    triageLocal: {
      alias: '@triage-local',
      dispatchTokens: ['triage-local'],
      description: 'Qwen-backed local triage lane',
      preferredUsage: ['classification', 'quick read', 'initial sort', 'small decisions']
    },
    summarizeLocal: {
      alias: '@summarize-local',
      dispatchTokens: ['summarize-local'],
      description: 'Qwen-backed local summarization lane',
      preferredUsage: ['summarization', 'extraction', 'condensation', 'note cleanup']
    },
    ollamaLocal: {
      alias: '@ollama-local',
      dispatchTokens: ['ollama-local', 'needle'],
      description: 'Additive Ollama local utility lane',
      preferredUsage: ['private utility work', 'bounded summarization', 'low-risk extraction', 'embeddings', 'offline-friendly triage']
    },
    ollama: {
      alias: '@ollama',
      dispatchTokens: ['ollama'],
      description: 'Ollama auto lane, local first with cloud fallback',
      preferredUsage: ['explicit Ollama requests', 'local/private task trials', 'low-risk utility prompts']
    },
    gptOss: {
      alias: '@gpt-oss',
      dispatchTokens: ['gpt-oss', 'gpt-oss:20b', 'gpt-oss:120b'],
      description: 'Formatting and synthesis lane',
      preferredUsage: ['formatting', 'template generation', 'ui text']
    },
    nvidia: {
      alias: '@nvidia',
      dispatchTokens: ['nvidia', 'nemotron', 'nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-ultra-550b-a55b'],
      description: 'NVIDIA NIM offload lane restricted to Nemotron 3 Ultra. Other NIM catalogue entries are removed from offload reasoning routing.',
      envKey: 'NVIDIA_API_KEY',
      toolsByDefault: true,
      defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b',
      note: '2026-06-05 offload consolidation: no NVIDIA cross-lane fallback or catalogue expansion.',
      liveStatus: {
        live: ['nemotron-3-ultra-550b-a55b'],
        dead: [],
      },
      deadModelFallbacks: {},
      modelTimeouts: {
        default: 240000,
        perModel: {
          'nemotron-3-ultra-550b-a55b': 240000,
        },
      },
      extremeLoadFallback: '',
      longContextFallback: '',
      routing: {
        frontier_reasoning: 'nemotron-3-ultra-550b-a55b',
      },
      models: {
        'nemotron-3-ultra-550b-a55b': 'nvidia/nemotron-3-ultra-550b-a55b',
      },
      preferredUsage: ['frontier offload reasoning via Nemotron 3 Ultra']
    },
    codexSpark: {
      alias: '@codex-spark',
      dispatchTokens: ['codex-spark', 'spark', 'fast-codex', 'gpt-5.3-codex-spark', 'gpt-5.3-codex'],
      description: 'Bounded Codex Spark sandbox lane — gpt-5.3-codex-spark, read-only sandbox',
      preferredUsage: ['sandbox improvement', 'read-only experiments', 'isolated verification', 'live operational trials']
    },
    gpt54Mini: {
      alias: '@gpt-5.4-mini',
      dispatchTokens: ['gpt-5.4-mini', 'gpt-5.4', 'codex-mini'],
      model: 'gpt-5.4-mini',
      sandbox: 'workspace-write',
      defaultReasoning: 'high',
      description: 'Codex mini tier — gpt-5.4-mini, workspace-write, reasoning=high default',
      preferredUsage: ['bounded implementation', 'fast coding tasks', 'file edits with write access', 'mid-weight reasoning']
    },
    gpt55: {
      alias: '@gpt-5.5',
      dispatchTokens: ['gpt-5.5', 'codex', 'codex-high', 'codex-full'],
      model: 'gpt-5.5',
      sandbox: 'workspace-write',
      defaultReasoning: 'high',
      maxReasoning: 'xhigh',
      description: 'Codex full tier — gpt-5.5, workspace-write, reasoning=high (escalates to xhigh), project rules enabled',
      preferredUsage: ['full implementation', 'complex multi-step coding', 'deep reasoning tasks', 'maximum codex features', 'high-stakes code generation']
    },
    native: {
      alias: '@native',
      dispatchTokens: ['native', 'main', 'workflow'],
      description: 'Main-session Opus 4.8 dynamic Workflow orchestration — replaces the deprecated parallel swarm fan-out; spawns no parallel DeepSeek pair. Optional advisory is a single sequential DeepSeek-pro call.',
      preferredUsage: ['consensus', 'orchestration', 'high-stakes review', 'native fan-out via the Workflow tool']
    },
    kimi: {
      alias: '@kimi',
      dispatchTokens: ['kimi', 'kimi-k2.6', 'moonshotai/kimi-k2.6', 'kimi-k2.5-liberated', 'kimi-k2.5', 'moonshot'],
      description: 'Remote high-grade reasoning',
      preferredUsage: ['cloud reasoning', 'deep context', 'heavy synthesis']
    },
    claude: {
      alias: '@claude',
      dispatchTokens: ['claude', 'claude-3-5-sonnet', 'claude-3-5-sonnet-liberated', 'claude-3-opus'],
      description: 'Bounded Claude Sonnet advisory lane',
      preferredUsage: ['architecture review', 'risk review', 'protocol review', 'model council']
    }
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
        use: ['architecture review', 'protocol review', 'security/risk review', 'ambiguous high-cost planning', 'high-stakes review', 'audit', 'architecture/protocol consensus'],
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
  claudeCouncilQualityGate: {
    authority: {
      executor: 'Codex/main-session',
      localTruth: 'shell/tests/GitNexus/source reads',
      modelOutput: 'advisory_only=true; local_truth_claim=false'
    },
    role: {
      model: 'deepseek-v4-pro',
      reasoning: 'xhigh',
      use: ['architecture review', 'protocol review', 'risk review', 'council dissent'],
      outputCapLines: 80,
      requiredSections: [
        'findings',
        'risks',
        'upgrade_candidates',
        'tests_needed',
        'reject_or_accept_reasoning'
      ]
    },
    useWhenAny: [
      'High-stakes architecture, protocol, security, memory, routing, or sandbox decision.',
      'Model council requested.',
      'DeepSeek advisory is active and independent dissent can improve the decision.',
      'Local evidence is enough to bound the prompt but not enough to settle design risk.'
    ],
    discardWhenAny: [
      'Claims repo state without exact file/path evidence.',
      'Suggests writes, staging, commits, broad search, secrets access, DB reads, or protected path access.',
      'Contradicts deterministic local evidence.',
      'Expands scope beyond the requested risk review.',
      'Omits any required council section.',
      'Exceeds the configured output cap.'
    ]
  },
  claudeProtocolGate: {
    mode: 'warn-first',
    mainSessionFinalAuthority: true,
    scope: 'repo-local Claude Code control-plane work',
    codexSpecCompatibility: {
      requiredSpec: '## CODEX TASK SPEC',
      source: 'CODEX_PROTOCOL.md',
      appliesTo: ['codex exec', '_SYSTEM/Scripts/ai codex', 'codex-spark', '_SYSTEM/Scripts/codex-offload-runner.mjs'],
      rule: 'Codex-bound work keeps the Codex task spec unchanged; Claude control-plane work uses a broader CLAUDE CONTROL PACKET.'
    },
    claudeControlPacket: {
      requiredFields: [
        'Goal',
        'Target files',
        'Constraints',
        'Acceptance criteria',
        'Test command',
        'Rollback boundary',
        'Route-plan classification',
        'GitNexus impact for symbol edits',
        'Verification before merge or promotion'
      ],
      routePlanEvidence: '_SYSTEM/Scripts/ai route-plan output for protocol, routing, memory, promotion, protected-path, or high-stakes work',
      advisoryExpectations: ['symbioticPulse routing', 'DeepSeek Pro/Flash advisory for protocol/high-risk work']
    },
    nativeFunctionGates: {
      argus: 'always-on',
      obliteratus: 'conditional-high-risk'
    },
    openClaw: {
      authority: 'native-integrated',
      status: 'absorbed-2026-05-17',
      note: 'OpenClaw/09OC fully absorbed into Musubi as Yuri Sentinel. The 09OC research lane is now @deepseek-flash. The daemon heartbeat is _SYSTEM/Scripts/yuri-sentinel.mjs running every 33min via LaunchAgent. No quarantine — Yuri Sentinel operates under the same native gates as all other Musubi components.',
      gatewayPort: 18789,
      sentinel: '_SYSTEM/Scripts/yuri-sentinel.mjs',
      launchAgent: 'com.yuri-os-musubi.yuri-sentinel'
    },
    hardBlocksRemainOwnedBy: 'bash-security-guard.js',
    denyPermissionDecision: false
  },
  nativeFunctionGates: {
    authority: {
      executor: 'Codex/main-session',
      localTruth: 'shell/tests/GitNexus/source reads/artifact reads',
      nativeOutput: 'deterministic_gate_metadata=true; model_output=false',
      promotion: 'no canonical promotion without verified artifacts'
    },
    alwaysOn: {
      argus: {
        runtime: 'native_function',
        activation: 'PostToolUse scout dispatcher',
        role: 'logic and sequencing check for meaningful tool calls',
        linkedSkills: ['oracle-router', 'gitnexus-impact-analysis', 'non-destructive-infinity-guard']
      }
    },
    obliteratus: {
      runtime: 'native_function',
      alias: 'obliteratus',
      doc: '.claude/agents/obliteratus-qa.md',
      stage: 'pre-promotion',
      role: 'adversarial promotion gate for high-stakes artifacts',
      output: 'structured_adversarial_audit',
      linkedSkills: ['gitnexus-impact-analysis', 'gitnexus-pr-review', 'codex-security:security-scan', 'failure-evolution-loop'],
      requireWhenAny: [
        'high-stakes review or protocol change',
        'control-plane orchestration plan',
        'sandbox promotion candidate',
        'canonical state or memory promotion',
        'protected path or governance mutation'
      ]
    }
  },
  pulseGovernanceSkeleton: {
    id: 'pulse-governance-skeleton',
    description: 'Shared lifecycle skeleton for native gates and OpenClaw-derived operating patterns. Profiles attach checkpoints to the same main-session pulse spine instead of acting as standalone agents.',
    authority: {
      entryBranch: 'main',
      entrySession: 'main-session',
      exitBranch: 'main',
      finalAuthority: 'Codex/main-session',
      downstreamOnly: ['branches', 'worktrees', 'agents', 'lanes', 'tools', 'advisory models']
    },
    phaseOrder: [
      'intake_classify',
      'campaign_decompose',
      'specialist_fanout',
      'verify_local_truth',
      'merge_learn'
    ],
    checkpointProfiles: {
      argus: {
        kind: 'native_gate_profile',
        activation: 'always-on',
        focus: 'tool sequencing, meaningful tool use, failed-edit assumptions, evidence-before-commit',
        checkpoints: [
          { phase: 'intake_classify', action: 'route_and_tool_sequence_sanity', severity: 'guard' },
          { phase: 'specialist_fanout', action: 'meaningful_call_and_failed_edit_check', severity: 'guard' },
          { phase: 'verify_local_truth', action: 'canonical_touch_and_evidence_check', severity: 'blocker' },
          { phase: 'merge_learn', action: 'scope_and_commit_evidence_integrity', severity: 'guard' }
        ]
      },
      obliteratus: {
        kind: 'native_gate_profile',
        activation: 'conditional-high-risk',
        focus: 'adversarial pre-promotion review for high-stakes, protected, protocol, sandbox, and canonical memory changes',
        checkpoints: [
          { phase: 'campaign_decompose', action: 'adversarial_plan_review', severity: 'adversarial' },
          { phase: 'specialist_fanout', action: 'protected_state_and_sandbox_promotion_check', severity: 'adversarial' },
          { phase: 'verify_local_truth', action: 'protocol_control_plane_and_governance_audit', severity: 'blocker' },
          { phase: 'merge_learn', action: 'durable_promotion_gate', severity: 'blocker' }
        ]
      },
      'openclaw-derived': {
        kind: 'pattern_profile',
        activation: 'reference-pattern',
        focus: 'manifest-first capabilities, SKILL.md convention, tool profiles, session isolation, sandbox doctrine',
        rejects: ['channel_sprawl', 'chat_first_identity', 'multi_tenant_gateway', 'in_process_host_trust_plugins', 'host_first_exec_default'],
        checkpoints: [
          { phase: 'intake_classify', action: 'manifest_first_capability_load_pattern', severity: 'pattern' },
          { phase: 'campaign_decompose', action: 'session_model_and_tool_profile_pattern', severity: 'pattern' },
          { phase: 'specialist_fanout', action: 'sandbox_and_plugin_routing_pattern', severity: 'pattern' },
          { phase: 'merge_learn', action: 'skill_fragment_promotion_pattern', severity: 'pattern' }
        ]
      }
    }
  },
  learningLoop: {
    memorySurface: '_SYSTEM/OS_KERNEL/memory.db',
    durableSeed: '.claude/yuri-sentinel/learning/global.md',
    capture: ['request_class', 'chosen_lane', 'fallbacks', 'evidence_used', 'files_touched', 'tests_run', 'user_correction', 'canonical_tags', 'bridge_domains', 'next_rule_candidate', 'prevention_rule_candidate'],
    promoteRuleWhen: [
      'The same correction repeats.',
      'A route wins repeatedly for the same task class.',
      'A failure exposes a missing guardrail.',
      'A scenario example would prevent future ambiguity.'
    ]
  },
  crossReference: {
    taxonomySurface: '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-taxonomy.md',
    indexSurface: '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-index.md',
    rulesSurface: '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md'
  },
  scenarios: [
    {
      id: 'control-plane-orchestration',
      title: 'Durable orchestration control plane',
      match: [
        'brain dump', 'control plane', 'control-plane', 'graph plan', 'graph-plan',
        'task graph', 'structured task graph', 'durable orchestration',
        'intake normalize graph plan', 'verify sanitize promote',
        'sanitize promote', 'artifact-driven verification', 'canonical state'
      ],
      defaultLane: 'native',
      lifecycle: [
        'Intake: capture raw brain dump as tainted artifact-only input.',
        'Normalize: compile typed intent with constraints, risk, uncertainty, mutation policy, artifact policy, and verifier requirements.',
        'Graph plan: emit graph-plan.json with task nodes, dependencies, capabilities, permissions, artifacts, verifiers, and promotion gates.',
        'Route: bind each node to the smallest reliable lane through this shared contract.',
        'Execute: run nodes through existing sandbox, guarded executor, offload lanes, and read-only skill context.',
        'Verify: require deterministic local evidence before upgrading any executor claim.',
        'Sanitize: hash raw output and summarize only verified facts.',
        'Promote: send only sanitized reviewed lessons through existing promotion gates.'
      ]
    },
    {
      id: 'sandbox-improvement',
      title: 'Sandboxed improvement or operational trial',
      match: [
        'sandbox', 'isolate', 'isolated', 'experiment', 'improvement loop',
        'sandbox loop', 'live test', 'test run', 'operational trial',
        'promote-check', 'proving run', 'beta-readiness', 'beta readiness',
        'source manifest', 'reference registry', 'section manifest',
        'md-vs-html', 'html control surface', 'control surface',
        'artifact audit', 'promotion candidates'
      ],
      defaultLane: 'native',
      lifecycle: [
        'Detect: classify scope, route, branch, and canonical-state risk.',
        'Isolate: create an artifact-only run directory outside tracked repo state.',
        'Self-probe: verify runner availability, artifact writes, and no repo mutation.',
        'Run: execute through primary Codex plus advisory gates; use Codex Spark only when explicitly requested.',
        'Verify: check artifacts, status, tests, and protected-state invariants.',
        'Sanitize: reduce raw output into a verified learning summary.',
        'Log: write only sanitized verified summaries through the learning capture path.',
        'Promote-check: inspect existing review gates without auto-approving lessons.'
      ]
    },
    {
      id: 'cross-domain-lesson-work',
      title: 'Cross-domain lesson indexing and prevention rule promotion',
      match: [
        'cross-reference',
        'cross reference',
        'cross-domain',
        'cross domain',
        'canonical tag',
        'canonical tags',
        'taxonomy',
        'prevention rule',
        'prevention rules',
        'lesson index',
        'bridge map',
        'alias map'
      ],
      defaultLane: 'summarize-local',
      lifecycle: [
        'Intake: capture the raw lesson and the source domain.',
        'Normalize: resolve canonical tags and alias matches.',
        'Bridge: find the same mechanism in other domains.',
        'Consolidate: rewrite repeated lessons into prevention rules.',
        'Archive: move raw notes aside once the bridge is recorded.',
        'Verify: keep the cross-reference index and prevention rules consistent.',
        'Learn: preserve reusable tags, not just topic-specific wording.'
      ]
    },
    {
      id: 'analysis-council',
      title: 'Multi-model analysis and council review',
      match: [
        'assess', 'analyze', 'analyse', 'fan out', 'council',
        'deep analysis', 'deep-analysis', 'deep dive',
        'evaluate', 'compare approaches', 'what can be improved',
        'what are the flaws', 'whats wrong', 'brain dump', 'braindump',
        'recommend', 'architectural review', 'system audit',
        'what do you think', 'opinion on', 'thoughts on'
      ],
      defaultLane: 'native',
      lifecycle: [
        'Intake: identify the artifact, system, or question to be analyzed.',
        'Fan-out: dispatch multi-model council (DeepSeek-pro + NVIDIA + SHURA) in parallel.',
        'Verify: ground claims in source, git, or deterministic local evidence.',
        'Merge: main session synthesizes findings ordered by severity.',
        'Learn: promote repeated findings into prevention rules.'
      ]
    },
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
      id: 'strategic-review',
      title: 'Strategic architecture, refactor, or deployment review',
      match: ['strategic review', 'architecture review', 'should we refactor', 'deployment plan', 'before we ship'],
      defaultLane: 'native',
      lifecycle: [
        'Intake: define the decision, options, and irreversible risks.',
        'Fan-out: run Yuri Shura perspectives in addition to the pulse ensemble.',
        'Verify: ground claims in source, tests, GitNexus, or deployment evidence.',
        'Merge: main session consolidates assessment, risks, and recommendation.',
        'Learn: promote repeated strategic risks into routing guardrails.'
      ]
    },
    {
      id: 'high-stakes-review',
      title: 'Review, audit, security, or architecture check',
      match: ['review', 'audit', 'security', 'architecture', 'risk', 'high-stakes'],
      defaultLane: 'native',
      lifecycle: [
        'Intake: define verdict, risk categories, and files/processes in scope.',
        'Advisory scan: main session runs a single sequential DeepSeek-pro advisory for an independent read; no parallel swarm pair.',
        'Verify: check claims with local source, tests, GitNexus, or browser evidence.',
        'Merge: main session reports findings first, ordered by severity.',
        'Learn: promote repeated risks into guardrails or scenario examples.'
      ]
    },
    {
      id: 'research-latest',
      title: 'Current research or external facts',
      match: ['latest', 'current', 'today', 'research', 'web', 'citation'],
      defaultLane: 'native',
      lifecycle: [
        'Intake: mark volatile facts and required source quality.',
        'Delegate: gather current evidence with the main-session deep-research skill (WebSearch + WebFetch first-party tooling); offload model lanes cannot browse live web.',
        'Verify: compare dates, primary sources, and contradictions.',
        'Merge: separate facts, inference, and recommendation.',
        'Learn: store durable source patterns, not transient facts.'
      ]
    },
    {
      id: 'protocol-change',
      title: 'Rules, protocols, IDE sync, or agent harness behavior',
      match: ['protocol', 'rule', 'ide', 'agent', 'harness', 'workflow', 'offload', 'routing'],
      defaultLane: 'native',
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
    appliesTo: ['Codex', 'Claude Code', 'VS Code', 'Kagami', 'Rick', 'DeepSeek', 'Qwen/Alibaba', 'future CLI agents'],
    requiredBehavior: [
      'Load OPERATOR_PROTOCOL.md or an inheriting rule file at startup.',
      'Treat offload routing as automatic for every non-trivial task.',
      'Use _SYSTEM/Scripts/llm-compat-contract.mjs as the only lane and scenario source.',
      'Use ./_SYSTEM/Scripts/ai auto "<prompt>" as the execution entrypoint for automatic classification and dispatch.',
      'Keep explicit triggers as compatibility aliases only.',
      'Log durable corrections and route outcomes to the shared memory surface.',
      'Add new IDEs by inheriting the protocol, not by copying lane tables.'
    ]
  }
};

function normalizePrompt(input) {
  return String(input || '').trim().toLowerCase();
}

function explicitlyRequestsCodexSpark(text) {
  return /(^|\s)@codex-spark\b/.test(text) ||
    /(^|\s)@spark\b/.test(text) ||
    /\bcodex\s+spark\b/.test(text) ||
    /\bspark\s+lane\b/.test(text) ||
    /\buse\s+spark\b/.test(text) ||
    /\bgpt-5\.3-codex(?:-spark)?\b/.test(text);
}

function hasSandboxImprovementSignal(text) {
  return text.includes('sandbox') ||
    text.includes('isolated') ||
    text.includes('isolate') ||
    text.includes('improvement loop') ||
    text.includes('sandbox loop') ||
    text.includes('operational trial') ||
    text.includes('live test') ||
    text.includes('proving run') ||
    text.includes('beta-readiness') ||
    text.includes('beta readiness') ||
    text.includes('source manifest') ||
    text.includes('reference registry') ||
    text.includes('section manifest') ||
    text.includes('md-vs-html') ||
    text.includes('control surface') ||
    text.includes('artifact audit');
}

function selectSteeringLane(prompt) {
  const text = normalizePrompt(prompt);

  if (!text) return 'triage-local';

  if (text.includes('/tokenmaxxing') || text.includes('tokenmaxxing')) {
    return 'native';
  }

  if (text.includes('btw offload this') || text.startsWith('offload this')) {
    return 'native';
  }

  if (text.includes('@claude') || text.includes('claude sonnet')) {
    return 'claude';
  }

  if (explicitlyRequestsCodexSpark(text)) {
    return 'codex-spark';
  }

  if (hasSandboxImprovementSignal(text)) {
    return 'native';
  }

  if (text.includes('control plane') || text.includes('control-plane') || text.includes('graph plan') || text.includes('graph-plan') || text.includes('task graph') || text.includes('brain dump') || text.includes('durable orchestration') || text.includes('verify sanitize promote') || text.includes('sanitize promote') || text.includes('canonical state')) {
    return 'native';
  }

  if (text.includes('@native') || text.includes('fan out') || text.includes('parallel') || text.includes('compare') || text.includes('consensus')) {
    return 'native';
  }

  // Analysis council — explicit fan-out, assess, deep analysis (before generic architecture catch)
  if (
    text.includes('fan out') || text.includes('council') ||
    text.includes('deep analysis') || text.includes('deep dive') ||
    text.includes('braindump') || text.includes('brain dump') ||
    text.includes('assess') || text.includes('analyze') || text.includes('analyse') ||
    text.includes('what can be improved') || text.includes('what are the flaws') ||
    text.includes('whats wrong') || text.includes('thoughts on') || text.includes('opinion on')
  ) {
    return 'native';
  }

  if (text.includes('architecture') || text.includes('review') || text.includes('audit') || text.includes('security') || text.includes('high-stakes')) {
    return 'native';
  }

  if (text.includes('protocol') || text.includes('ide') || text.includes('agent harness') || text.includes('workflow') || text.includes('routing') || text.includes('offload')) {
    return 'native';
  }

  if (text.includes('@ollama-local') || text.includes('ollama local')) return 'ollama-local';
  if (text.includes('@ollama') || text.includes('use ollama') || text.includes('try ollama')) return 'ollama';

  if (
    (text.includes('local private') || text.includes('offline') || text.includes('private local')) &&
    (text.includes('summarize') || text.includes('extract') || text.includes('triage') || text.includes('draft cleanup'))
  ) {
    return 'ollama-local';
  }

  if (
    text.includes('cross-reference') ||
    text.includes('cross reference') ||
    text.includes('cross-domain') ||
    text.includes('cross domain') ||
    text.includes('canonical tag') ||
    text.includes('canonical tags') ||
    text.includes('prevention rule') ||
    text.includes('prevention rules') ||
    text.includes('lesson index') ||
    text.includes('bridge map') ||
    text.includes('alias map')
  ) {
    return 'summarize-local';
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

  // design/ui/frontend/visual work → Codex (powerhouse default for all work, not NIM)
  if (text.includes('ui ') || text.includes('frontend') || text.includes('design') || text.includes('react') || text.includes('interface') || text.includes('visual') || text.includes('html report') || text.includes('css') || text.includes('layout')) {
    return 'codex';
  }

  if (text.includes('@gpt-oss') || text.includes('gpt-oss') || text.includes('format') || text.includes('formatting') || text.includes('template')) {
    return 'gpt-oss';
  }


  return 'triage-local';
}

function includesAny(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

function assessDeepseekAdvisory(prompt, lane, scenario) {
  const text = normalizePrompt(prompt);
  const policy = LLM_COMPAT_CONTRACT.deepseekCodexQualityGate;
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

  if (lane === 'native') {
    return {
      decision: 'use-native',
      models: [policy.roles.pro.model],
      role: 'main-session native orchestration with a single sequential DeepSeek-pro advisory (no parallel fan-out)',
      reason: scenario.id === 'protocol-change' ? 'protocol_or_routing_quality_risk' : 'high_stakes_review_threshold_met',
      preflight: true,
      postflight: true,
      outputCapLines: policy.roles.pro.outputCapLines,
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

function assessClaudeAdvisory(prompt, lane, scenario, deepseekAdvisory = {}) {
  const text = normalizePrompt(prompt);
  const policy = LLM_COMPAT_CONTRACT.claudeCouncilQualityGate;
  const councilSignals = [
    'model council', 'council', 'claude', 'sonnet', 'architecture', 'protocol',
    'security', 'audit', 'risk', 'high-stakes', 'routing', 'offload', 'memory',
    'sandbox', 'protected', 'beta', 'proving run'
  ];
  const scenarioRequiresReview = [
    'control-plane-orchestration',
    'sandbox-improvement',
    'high-stakes-review',
    'protocol-change'
  ].includes(scenario.id);
  const deepseekActive = deepseekAdvisory.decision && deepseekAdvisory.decision !== 'skip';

  if (lane === 'claude' || scenarioRequiresReview || deepseekActive || includesAny(text, councilSignals)) {
    return {
      decision: 'use-sonnet',
      models: [policy.role.model],
      reasoning: policy.role.reasoning,
      role: 'bounded architecture/risk/protocol advisory review',
      advisoryOnly: true,
      localTruthRequired: true,
      codexFinalAuthority: true,
      outputCapLines: policy.role.outputCapLines,
      requiredSections: policy.role.requiredSections,
      discardWhenAny: policy.discardWhenAny
    };
  }

  return {
    decision: 'skip',
    models: [],
    role: 'none',
    advisoryOnly: true,
    localTruthRequired: true,
    codexFinalAuthority: true,
    outputCapLines: 0,
    requiredSections: []
  };
}

function assessNativeFunctionGates(prompt, lane, scenario) {
  const text = normalizePrompt(prompt);
  const policy = LLM_COMPAT_CONTRACT.nativeFunctionGates;
  const promotionSignals = [
    'promote', 'promotion', 'promotion candidate', 'promotion gate',
    'canonical state', 'canonical memory', 'memory.db', 'protected path',
    'verified promotion', 'governance', 'owner approval', 'durable learning'
  ];
  const gatedScenarios = [
    'control-plane-orchestration',
    'sandbox-improvement',
    'high-stakes-review',
    'protocol-change'
  ];
  const useObliteratus = gatedScenarios.includes(scenario.id) ||
    lane === 'native' ||
    includesAny(text, promotionSignals);

  return {
    argus: {
      decision: 'always-on',
      ...policy.alwaysOn.argus
    },
    obliteratus: useObliteratus
      ? {
          decision: 'use-native-gate',
          ...policy.obliteratus,
          localTruthRequired: true,
          codexFinalAuthority: true,
          reason: gatedScenarios.includes(scenario.id)
            ? `scenario:${scenario.id}`
            : 'promotion_or_protected_state_signal'
        }
      : {
          decision: 'skip',
          runtime: policy.obliteratus.runtime,
          alias: policy.obliteratus.alias,
          stage: policy.obliteratus.stage,
          role: policy.obliteratus.role,
          localTruthRequired: true,
          codexFinalAuthority: true,
          reason: 'below_native_promotion_gate_threshold'
        }
  };
}

// =====================================================================
// PATCH 030 — Pulse Cortex classifier extensions
// =====================================================================
// Adds the four cortex fields (complexityTier, ensemble, beaconLevel,
// codexPolicy) plus the OpenClaw advisory assessor. All advisory-only;
// none of these grant write or canonical authority. The orchestrator
// at _SYSTEM/Scripts/pulse-orchestrator.mjs consumes these to fan out advisors.

function assessOpenClawAdvisory(prompt, lane, scenario) {
  const ocConfig = LLM_COMPAT_CONTRACT.claudeProtocolGate.openClaw;
  // OpenClaw absorbed as Nisaba Sentinel (native-integrated) — no longer a separate bridge lane
  if (ocConfig.authority === 'native-integrated') {
    return {
      decision: 'skip',
      role: 'nisaba-sentinel-native',
      preflight: false,
      postflight: false,
      runtimeKind: 'native_integrated',
      authority: 'native-integrated',
      reason: 'openclaw_absorbed_as_nisaba_sentinel'
    };
  }
  // Legacy bridge-only-advisory path (kept for backward compat)
  const text = normalizePrompt(prompt);
  const eligibleScenarios = [
    'control-plane-orchestration', 'protocol-change',
    'high-stakes-review', 'sandbox-improvement',
    'cross-domain-lesson-work'
  ];
  const patternSignals = [
    'pattern', 'architecture', 'design', 'system', 'cross-cutting',
    'refactor', 'protocol', 'governance', 'cortex'
  ];
  const shouldFire = lane === 'native' ||
    eligibleScenarios.includes(scenario.id) ||
    includesAny(text, patternSignals);

  if (!shouldFire) {
    return {
      decision: 'skip', role: 'none', preflight: false, postflight: false,
      runtimeKind: 'bridge_advisory', authority: ocConfig.authority,
      reason: 'below_pattern_advisory_threshold'
    };
  }
  return {
    decision: 'use-bridge',
    role: 'pattern advisory (bridge-only, advisory-only)',
    model: 'deepseek-v4-flash',
    preflight: true,
    postflight: scenario.id === 'code-change',
    outputCapLines: 60,
    runtimeKind: 'bridge_advisory',
    authority: ocConfig.authority,
    reason: lane === 'native' ? 'native_orchestration_pattern_lens' : `scenario:${scenario.id}_or_pattern_signal`,
    bridgeCommand: 'echo "<payload>" | bash _SYSTEM/OS_KERNEL/openclaw-bridge.sh',
    localTruthRequired: true,
    codexFinalAuthority: true
  };
}

function classifyComplexity(prompt, lane, scenario) {
  const text = normalizePrompt(prompt);
  const length = text.length;
  const mutateVerbs = /(implement|fix|patch|refactor|debug|rename|delete|migrate|audit|review|deploy|create|add|remove|build|wire|extend|promote)/i;
  const analysisVerbs = /\b(assess|analyze|analyse|evaluate|compare|recommend|braindump|brain dump|fan out|council|deep analysis|deep dive|what can be improved|what are the flaws|whats wrong|thoughts on|opinion on)\b/i;
  const hasMutate = mutateVerbs.test(text);
  const hasAnalysis = analysisVerbs.test(text);
  const hasFilePath = /[/][\w-]+\.[a-z]+/i.test(text);
  const hasLane = /@\w+/.test(text);
  const hasQuestion = /\?/.test(text);

  // trivial: zero actionable signal
  if (length < 60 && !hasMutate && !hasFilePath && !hasLane && !hasAnalysis && !hasQuestion) {
    return 'trivial';
  }

  // critical: governance / protected surfaces always win
  const criticalSignals = [
    'memory.db', 'protected path', 'promotion', 'canonical', 'governance',
    'launchd', 'production', 'rollout', 'migrate', 'kernel', 'protected'
  ];
  const protocolNative = lane === 'native' &&
    ['protocol-change', 'control-plane-orchestration', 'high-stakes-review', 'strategic-review'].includes(scenario.id);
  if (protocolNative || includesAny(text, criticalSignals)) {
    return 'critical';
  }

  // complex: multi-file mutations OR audit/arch/protocol/security signals
  const complexSignals = ['audit', 'review', 'architecture', 'refactor', 'protocol', 'security', 'cortex'];
  const fileCount = (text.match(/[/][\w-]+\.[a-z]+/gi) || []).length;
  if (fileCount > 1 || includesAny(text, complexSignals) || scenario.id === 'protocol-change' || scenario.id === 'analysis-council') {
    return 'complex';
  }

  // analysis: pure advisory questions without mutation — gets NVIDIA + DeepSeek, no heavy gates
  if ((hasQuestion || hasAnalysis) && !hasMutate && !hasFilePath) {
    return 'analysis';
  }

  return 'standard';
}

// Council composition — decides which DeepSeek tier and whether Codex fires as advisor.
// Replaces static "always DeepSeek-flash" with model-matched council selection.
//
// DeepSeek-pro: architecture, protocol, security reasoning, cross-domain analysis
// DeepSeek-flash: quick triage, noisy input, fast first-pass, code-adjacent context
// Codex gpt-5.5: deep code review, security+code, complex impl planning
// Codex gpt-5.4-mini: fast code advisory, style review, bounded impl feedback
function assessCouncilComposition(prompt, complexityTier, scenario) {
  const text = normalizePrompt(prompt);

  const hasCode      = /(implement|fix|patch|refactor|debug|build|create|write|function|class|component|script|hook|test|generate code)/i.test(text);
  const hasArch      = /(architecture|protocol|design pattern|philosophy|approach|strategy|trade-?off|system design|how does|why does)/i.test(text);
  const hasReasoning = /\b(why|explain|how does|analyze|analyse|assess|evaluate|what are the flaws|what is wrong|whats wrong|thoughts on|opinion on|deep analysis|braindump)\b/i.test(text);
  const hasSecurity  = /(security|audit|vulnerability|risk|threat|exploit|injection|xss|csrf|auth|permission|access control)/i.test(text);
  const hasFileCode  = /[/][\w-]+\.(ts|js|tsx|jsx|py|go|rb|rs|mjs|cjs|sh)/.test(text) && hasCode;
  const hasLargeCtx  = text.length > 400;

  // DeepSeek model selection
  let deepseekModel = 'deepseek-v4-flash'; // default: fast
  if (hasArch || hasReasoning || hasSecurity || hasLargeCtx ||
      complexityTier === 'complex' || complexityTier === 'critical') {
    deepseekModel = 'deepseek-v4-pro';
  }

  // Codex advisory model selection (advisory only — separate from impl queue-emit)
  let codexModel = null;
  let codexReason = 'skip';
  if (hasFileCode || (hasCode && (complexityTier === 'complex' || complexityTier === 'critical'))) {
    codexModel = complexityTier === 'critical' || hasSecurity ? 'gpt-5.5' : 'gpt-5.4-mini';
    codexReason = hasSecurity ? 'security+code requires gpt-5.5 review' : `code task at ${complexityTier} tier`;
  }
  if (complexityTier === 'trivial' || scenario.id === 'document-synthesis') {
    codexModel = null; // never fire Codex for trivial or pure text synthesis
  }

  const reason = `ds=${deepseekModel} codex=${codexModel || 'skip'} (arch=${hasArch} code=${hasCode} sec=${hasSecurity})`;
  return { deepseekModel, codexModel, codexReason, reason };
}

function buildEnsemble(complexityTier, scenario, openClawAdvisory, prompt = '', codexDispatch = null, councilComposition = null) {
  const ensemble = [];
  if (complexityTier === 'trivial') return ensemble;

  const t = normalizePrompt(prompt);

  // analysis tier: advisory council only — DeepSeek + NVIDIA + optional SHURA + optional Codex
  if (complexityTier === 'analysis') {
    ensemble.push('deepseek-preflight');
    ensemble.push('nvidia-preflight');
    // Codex advisory fires if code signals present even at analysis tier
    if (councilComposition && councilComposition.codexModel) {
      ensemble.push('codex-advisory');
    }
    // SHURA fires when user explicitly asks for council / fan-out / deep analysis
    if (
      t.includes('council') || t.includes('fan out') ||
      t.includes('deep analysis') || t.includes('deep dive') ||
      t.includes('shura') || t.includes('braindump') || t.includes('brain dump')
    ) {
      ensemble.push('shura-review');
    }
    return ensemble;
  }

  // standard+: DeepSeek + NVIDIA + Codex advisory (when code signals present)
  ensemble.push('deepseek-preflight');
  ensemble.push('nvidia-preflight');
  if (councilComposition && councilComposition.codexModel) {
    ensemble.push('codex-advisory');
  }

  if (complexityTier === 'complex' || complexityTier === 'critical') {
    if (openClawAdvisory && openClawAdvisory.decision !== 'skip') {
      ensemble.push('openclaw-preflight');
    }
    ensemble.push('yuri-risk');
    // SHURA fires at complex+ (was: strategic-review only)
    ensemble.push('shura-review');
  }

  // strategic-review always gets SHURA even at standard
  if (scenario.id === 'strategic-review' && !ensemble.includes('shura-review')) {
    ensemble.push('shura-review');
  }

  // Codex queue-emit: any impl task (standard+) with a Codex model assigned gets queued
  // Sequential execution gate — queue-runner.mjs drains one at a time
  if (
    complexityTier !== 'trivial' && complexityTier !== 'analysis' &&
    codexDispatch && ['full-impl', 'mini-impl'].includes(codexDispatch.tier)
  ) {
    ensemble.push('codex-queue-emit');
  }

  if (complexityTier === 'critical') {
    ensemble.push('obliteratus-hint');
  }
  return ensemble;
}

// Codex dispatch — maps complexity tier + task signals to the right Codex model
// gpt-5.5 = full impl (reasoning=high, workspace-write)
// gpt-5.4-mini = fast impl / advisory review (reasoning=high)
// gpt-5.3-codex-spark = sandboxed experiment (read-only sandbox)
function buildCodexDispatch(prompt, complexityTier, scenario) {
  const text = normalizePrompt(prompt);
  const codeSignals = /(implement|fix|patch|refactor|debug|build|create|add|remove|wire|extend|write|generate|function|class|test|component|script|hook|migration)/i;
  const hasCode = codeSignals.test(text);
  const hasFilePath = /[/][\w-]+\.[a-z]+/i.test(text);
  const sandboxSignals = ['sandbox', 'experiment', 'try', 'test run', 'isolated', 'proving'];
  const hasSandbox = sandboxSignals.some(s => text.includes(s));
  const explicitSpark = explicitlyRequestsCodexSpark(text);

  if (complexityTier === 'trivial') {
    return { model: null, tier: 'skip', reason: 'trivial — no Codex needed' };
  }
  if (complexityTier === 'analysis') {
    return { model: 'gpt-5.4-mini', tier: 'advisory-review', reasoning: 'high', reason: 'fast analysis review pass' };
  }
  if (explicitSpark) {
    return { model: 'gpt-5.3-codex-spark', tier: 'spark-sandbox', sandbox: 'read-only', reason: 'sandboxed experiment — Spark lane' };
  }
  if (hasSandbox || scenario.id === 'sandbox-improvement') {
    return { model: 'gpt-5.5', tier: 'full-impl', reasoning: 'xhigh', sandbox: 'workspace-write', reason: 'sandbox/proving task — primary Codex unless Spark is explicitly requested' };
  }
  if (complexityTier === 'critical') {
    return { model: 'gpt-5.5', tier: 'full-impl', reasoning: 'xhigh', sandbox: 'workspace-write', reason: 'critical tier — max Codex capacity' };
  }
  if (complexityTier === 'complex' || (hasCode && hasFilePath)) {
    return { model: 'gpt-5.5', tier: 'full-impl', reasoning: 'high', sandbox: 'workspace-write', reason: 'complex impl or multi-file code task' };
  }
  if (hasCode || hasFilePath) {
    return { model: 'gpt-5.4-mini', tier: 'mini-impl', reasoning: 'high', sandbox: 'workspace-write', reason: 'standard code task — mini lane' };
  }
  return { model: null, tier: 'skip', reason: 'no code task detected' };
}

function pickBeaconLevel(complexityTier, scenario) {
  if (complexityTier === 'critical') return 'notify+obsidian';
  if (complexityTier === 'complex' &&
      ['protocol-change', 'high-stakes-review', 'strategic-review', 'control-plane-orchestration'].includes(scenario.id)) {
    return 'notify';
  }
  return 'none';
}

function pickCodexPolicy(prompt, scenario, complexityTier) {
  if (complexityTier === 'critical' || complexityTier === 'trivial') return 'none';
  const text = normalizePrompt(prompt);
  const hasFilePath = /[/][\w-]+\.[a-z]+/i.test(text);
  const mutateVerbs = /(implement|fix|patch|refactor|rename|add|remove|extend|wire|create)/i;
  if (hasFilePath && mutateVerbs.test(text) && complexityTier === 'standard') {
    return 'dry-run-only';
  }
  return 'none';
}

function buildPulseGovernanceSkeleton(nativeFunctionGates) {
  const skeleton = LLM_COMPAT_CONTRACT.pulseGovernanceSkeleton;
  const profileStatus = {
    argus: nativeFunctionGates.argus?.decision || 'skip',
    obliteratus: nativeFunctionGates.obliteratus?.decision || 'skip',
    'openclaw-derived': 'reference-pattern'
  };
  const activeProfiles = Object.entries(profileStatus)
    .filter(([, status]) => status !== 'skip')
    .map(([profile]) => profile);
  const phaseCheckpoints = {};

  for (const phase of skeleton.phaseOrder) {
    const checkpoints = [];
    for (const [profile, config] of Object.entries(skeleton.checkpointProfiles)) {
      const status = profileStatus[profile] || 'skip';
      if (status === 'skip') continue;
      for (const checkpoint of config.checkpoints) {
        if (checkpoint.phase !== phase) continue;
        checkpoints.push({
          profile,
          action: checkpoint.action,
          severity: checkpoint.severity,
          status
        });
      }
    }
    phaseCheckpoints[phase] = checkpoints;
  }

  return {
    id: skeleton.id,
    authority: skeleton.authority,
    phaseOrder: skeleton.phaseOrder,
    activeProfiles,
    profileStatus,
    phaseCheckpoints
  };
}

function selectScenario(prompt, lane = '') {
  const text = normalizePrompt(prompt);
  const scored = LLM_COMPAT_CONTRACT.scenarios
    .map((scenario) => {
      const hits = scenario.match.filter((marker) => text.includes(marker)).length;
      return { scenario, hits };
    })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits); // highest hit count first

  const matches = scored.map(({ scenario }) => scenario);
  return matches.find((scenario) => scenario.defaultLane === lane) ||
    matches[0] ||
    LLM_COMPAT_CONTRACT.scenarios.find((scenario) => scenario.id === 'document-synthesis');
}

function readCalibration() {
  try {
    const calibPath = safeRuntimePath(
      'YURI_LANE_CALIBRATION_PATH',
      path.join(process.env.HOME || '/tmp', '.yuri', 'lane-calibration.json'),
    );
    if (!calibPath) return {};
    if (!existsSync(calibPath)) return {};
    return JSON.parse(readFileSync(calibPath, 'utf8')).lanes || {};
  } catch { return {}; }
}

function applyCalibrationToLane(lane, calibData) {
  const calib = calibData[lane] || {};
  const warnings = [];
  if (calib.overconfidence_gap > 0.15) {
    warnings.push(`${lane}: overconfidence_gap=${calib.overconfidence_gap.toFixed(2)} (claimed vs actual success rate spread)`);
  }
  if (calib.actual_success_rate < 0.5 && (calib.n || 0) >= 50) {
    warnings.push(`${lane}: DEGRADED actual_success_rate=${calib.actual_success_rate.toFixed(2)} over ${calib.n} calls`);
  }
  return { degraded: warnings.some(w => w.includes('DEGRADED')), warnings };
}

function buildRoutePlan(prompt) {
  const calibData = readCalibration();
  const lane = selectSteeringLane(prompt);
  const calibStatus = applyCalibrationToLane(lane, calibData);
  const scenario = selectScenario(prompt, lane);
  const deepseekAdvisory = assessDeepseekAdvisory(prompt, lane, scenario);
  const claudeAdvisory = assessClaudeAdvisory(prompt, lane, scenario, deepseekAdvisory);
  const nativeFunctionGates = assessNativeFunctionGates(prompt, lane, scenario);
  const pulseGovernanceSkeleton = buildPulseGovernanceSkeleton(nativeFunctionGates);
  // PATCH 030 — Pulse Cortex extensions
  const openClawAdvisory = assessOpenClawAdvisory(prompt, lane, scenario);
  const complexityTier = classifyComplexity(prompt, lane, scenario);
  const codexDispatch = buildCodexDispatch(prompt, complexityTier, scenario);
  const councilComposition = assessCouncilComposition(prompt, complexityTier, scenario);
  const ensemble = buildEnsemble(complexityTier, scenario, openClawAdvisory, prompt, codexDispatch, councilComposition);
  const beaconLevel = pickBeaconLevel(complexityTier, scenario);
  const codexPolicy = pickCodexPolicy(prompt, scenario, complexityTier);
  return {
    prompt,
    lane,
    scenario: scenario.id,
    title: scenario.title,
    automatic: LLM_COMPAT_CONTRACT.activation.triggerless,
    entrypoint: './_SYSTEM/Scripts/ai auto',
    qualityGate: 'main-session',
    dispatch: lane === 'native' ? 'native-orchestration' : 'single-lane',
    // PATCH 030 — Pulse Cortex fields (consumed by pulse-orchestrator.mjs)
    complexityTier,
    ensemble,
    beaconLevel,
    codexPolicy,
    codexDispatch,
    councilComposition,
    openClawAdvisory,
    // existing fields
    deepseekAdvisory,
    claudeAdvisory,
    claudeProtocolGate: LLM_COMPAT_CONTRACT.claudeProtocolGate,
    nativeFunctionGates,
    pulseGovernanceSkeleton,
    lifecycle: scenario.lifecycle,
    crossReference: LLM_COMPAT_CONTRACT.crossReference,
    learningCapture: LLM_COMPAT_CONTRACT.learningLoop.capture,
    memorySurface: LLM_COMPAT_CONTRACT.learningLoop.memorySurface,
    calibrationStatus: calibStatus,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function healthProbe(laneName, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15_000);
  const startedAt = Date.now();
  const lane = String(laneName || '').replace(/^@/, '');
  const prompt = 'Health check. Reply exactly PONG and nothing else.';
  if (!lane) {
    return Promise.resolve({ ok: false, pong: null, ms: 0, error: 'missing lane' });
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn('bash', [AI_SH, lane, prompt], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        LLM_COMPAT_PROMPT_TEXT: prompt,
        LLM_COMPAT_STREAM: '0',
        LANE_SESSION: 'health-probe',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const done = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ms: Date.now() - startedAt, ...payload });
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {}
      done({ ok: false, pong: null, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 20_000) stdout = stdout.slice(-20_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 10_000) stderr = stderr.slice(-10_000);
    });
    child.on('error', (error) => {
      done({ ok: false, pong: null, error: error.message || String(error) });
    });
    child.on('close', (code) => {
      const pong = /\bPONG\b/i.test(stdout);
      done({
        ok: code === 0 && pong,
        pong: pong ? 'PONG' : null,
        error: code === 0 && pong ? null : (stderr.trim() || stdout.trim() || `exit ${code}`).slice(0, 1000),
      });
    });
  });
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === __filename;
}

if (isCliEntrypoint()) {
  const [, , command = 'contract', ...args] = process.argv;

  switch (command) {
    case 'contract':
      printJson(LLM_COMPAT_CONTRACT);
      break;
    case 'steer':
      process.stdout.write(`${selectSteeringLane(args.join(' '))}\n`);
      break;
    case 'route-plan':
      printJson(buildRoutePlan(args.join(' ')));
      break;
    case 'examples':
      printJson(LLM_COMPAT_CONTRACT.scenarios);
      break;
    case 'swarm-default':
    case 'swarm-workhorse':
      // DEPRECATED compatibility shim (2026-05-29). The parallel swarm fan-out is retired; Opus 4.8's
      // native Workflow orchestration replaces it. Emits a SINGLE advisory lane (no DeepSeek pair) so
      // legacy `ai` callers (run_codex_swarm / triage) degrade safely without doubling DeepSeek.
      // Full removal of the ai-CLI swarm surface is a flagged phase-2 follow-up.
      process.stdout.write('deepseek-v4-pro\n');
      break;
    default:
      console.error(`Unknown offload contract command: ${command}`);
      process.exit(1);
  }
}
