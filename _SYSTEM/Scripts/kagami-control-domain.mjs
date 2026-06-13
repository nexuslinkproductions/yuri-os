#!/usr/bin/env node
/**
 * Kagami Claude/Codex control-domain contract.
 *
 * This is intentionally declarative. Rick, worker bridges, Shintai dispatch,
 * and future Claude CLI adapters can consume one domain map instead of
 * rebuilding authority rules in separate scripts.
 */

import { PROTECTED_SURFACE_LABELS } from './lane-kernel.mjs';

export const KAGAMI_CONTROL_DOMAIN_VERSION = 'yuri.kagami-control.v1';

export const KAGAMI_CANONICAL_STATE_ROOT = '_SYSTEM/state/kagami-control';

export const KAGAMI_CANONICAL_STATE_FILES = Object.freeze([
  `${KAGAMI_CANONICAL_STATE_ROOT}/events.jsonl`,
  `${KAGAMI_CANONICAL_STATE_ROOT}/sessions.json`,
  `${KAGAMI_CANONICAL_STATE_ROOT}/findings.jsonl`,
  `${KAGAMI_CANONICAL_STATE_ROOT}/decision-ledger.jsonl`,
  `${KAGAMI_CANONICAL_STATE_ROOT}/cost-ledger.jsonl`,
  `${KAGAMI_CANONICAL_STATE_ROOT}/lane-health.json`,
  `${KAGAMI_CANONICAL_STATE_ROOT}/engagements/index.json`,
  `${KAGAMI_CANONICAL_STATE_ROOT}/proofs/index.json`,
]);

export const KAGAMI_EVENT_KINDS = Object.freeze([
  'INTAKE_RECORDED',
  'GOAL_BOUND',
  'ROUTE_DECISION_RECORDED',
  'EVIDENCE_GATE_PASSED',
  'AUTHORIZATION_REQUIRED',
  'ENGAGEMENT_SCOPE_BOUND',
  'LANE_HEALTH_PREFLIGHT',
  'XREF_PREFLIGHT_RECORDED',
  'LANE_DISPATCHED',
  'LANE_OUTPUT_DELTA',
  'PATCH_PROPOSED',
  'CODEX_VERIFICATION_STARTED',
  'CODEX_VERIFICATION_PASSED',
  'CODEX_VERIFICATION_FAILED',
  'MEMORY_CANDIDATE_PROPOSED',
  'PROOF_ARTIFACT_PROMOTED',
  'COST_GOVERNOR_TRIPPED',
  'HANDOFF_RECORDED',
  // NANO SWARM lease lifecycle (owner-approved 2026-06-13) — the audit trail of work-unit leases.
  'LEASE_CLAIMED',
  'LEASE_RELEASED',
  'LEASE_RENEWED',
  'LEASE_EXPIRED',
  'LEASE_CONTENDED',
  // NANO SWARM supervisor cycle — reap/rotate/liveness summary for the swarm board.
  'SWARM_SUPERVISION_CYCLE',
]);

export const KAGAMI_DOMAIN_ROLES = Object.freeze({
  kagami: {
    id: 'kagami',
    authority: 'operator-kernel',
    mutatesRepo: false,
    canonicalDuties: [
      'own-intake',
      'bind-goal',
      'load-evidence',
      'route-lanes',
      'record-events',
      'enforce-authorization',
      'coordinate-verification',
    ],
  },
  codexMain: {
    id: 'codex-main',
    authority: 'final-implementation-arbiter',
    mutatesRepo: true,
    canonicalDuties: [
      'apply-reviewed-changes',
      'verify-claude-output',
      'resolve-shintai-contradictions',
      'run-release-gates',
      'commit-when-authorized',
      'keep-private-persona-overlays-out-of-shipping-labels',
    ],
  },
  codexFamily: {
    id: 'codex-family',
    authority: 'implementation-and-verification-family',
    mutatesRepo: 'allowed-through-scoped-codex-sessions',
    canonicalDuties: [
      'gpt-5.5-full-implementation',
      'gpt-5.4-mini-focused-code-and-review',
      'spark-low-risk-sandbox-experiments',
      'rick-lane-collaboration-when-private-overlay-enabled',
      'local-truth-verification',
      'release-gate-participation',
    ],
    routingRule: 'Use gpt-5.5 for hard code, gpt-5.4-mini for focused code/review, Spark only for explicit cheap or low-risk experiments.',
  },
  claudeOpusComain: {
    id: 'claude-opus-comain',
    authority: 'intentional-coding-escalation-rick',
    mutatesRepo: 'allowed-only-through-scoped-packets',
    launchRule: 'Persistent CLI/tmux/PTY session only. No SDK, no claude -p, no --print prompt calls.',
    canonicalDuties: [
      'long-context-architecture',
      'high-reasoning-implementation',
      'heavy-coding-escalation',
      'contradiction-synthesis',
      'patch-proposal',
      'self-check-before-handoff',
    ],
    verificationRule: 'Codex/main independently verifies every Claude mutation before trust.',
    compatibilityAliases: ['claude-opus-audit', '@claude-opus-comain'],
  },
  claudeSonnetCode: {
    id: 'claude-sonnet-code',
    authority: 'regular-rick-collaboration-lane',
    mutatesRepo: 'allowed-only-through-scoped-packets',
    launchRule: 'Persistent CLI/tmux/PTY session only. No SDK, no claude -p, no --print prompt calls.',
    canonicalDuties: [
      'regular-rick-to-rick-collaboration',
      'planning-and-critique',
      'operator-synthesis',
      'medium-complexity-code',
      'focused-tests',
      'refactor-cleanup',
      'docs-to-code-translation',
      'self-check-before-codex-verification',
    ],
    verificationRule: 'Codex/main independently verifies every Sonnet mutation before trust.',
    routingRule: 'Use Sonnet aggressively for regular collaboration and advisory work; escalate to Opus intentionally for heavier coding or architecture.',
    compatibilityAliases: ['@sonnet-code', '@claude-code', '@sonnet'],
  },
  deepseek: {
    id: 'deepseek',
    authority: 'persistent-rick-synthesis-and-eot-workhorse',
    mutatesRepo: false,
    canonicalDuties: [
      'root-cause-synthesis',
      'micro-eot',
      'threat-intel-summarization',
      'cheap-deep-reasoning',
    ],
    dispatchRule: 'Mention tools and skills in prompts; do not force CLI --tools.',
  },
  shintaiNim: {
    id: 'shintai-nim',
    authority: 'advisory-council',
    mutatesRepo: false,
    canonicalDuties: [
      'specialist-fanout',
      'adversarial-review',
      'regional-threat-intel',
      'model-specific-critique',
      'guardrail-design-pressure-test',
    ],
  },
  memoryKernel: {
    id: 'memory-kernel',
    authority: 'retrieval-and-promotion-broker',
    mutatesRepo: false,
    canonicalDuties: [
      'recall-with-provenance',
      'write-memory-candidates',
      'promote-only-after-verification',
      'keep-protected-runtime-sealed',
    ],
  },
  automationKernel: {
    id: 'automation-kernel',
    authority: 'health-lifecycle-and-private-overlay-spine',
    mutatesRepo: false,
    canonicalDuties: [
      'launchd-health',
      'tmux-worker-liveness',
      'pong-probes',
      'stale-agent-repair',
      'daemon-reporting',
      'cache-stable-packet-preamble',
    ],
  },
});

export const KAGAMI_CONTROL_COMMANDS = Object.freeze([
  {
    command: '/goal',
    purpose: 'Bind the current operator objective, evidence requirements, and exit criteria.',
  },
  {
    command: '/claude wake',
    purpose: 'Attach or resume the continuous Claude CLI session without starting heavy work.',
  },
  {
    command: '/claude sonnet',
    purpose: 'Run Claude Sonnet xhigh as a bounded implementation partner for scoped code and tests.',
  },
  {
    command: '/claude opus',
    purpose: 'Escalate a scoped packet to Claude Opus co-main when task tier and budget allow.',
  },
  {
    command: '/fanout',
    purpose: 'Preview the adaptive lane plan: solo, pair, trio, or council before dispatch.',
  },
  {
    command: '/claude send',
    purpose: 'Send a bounded packet to the current persistent Claude session and stream deltas into Kagami events.',
  },
  {
    command: '/codex review',
    purpose: 'Force Codex/main verification of a Claude, Shintai, or NIM proposal.',
  },
  {
    command: '/shintai deploy',
    purpose: 'Assemble a task-fit council from roster, health, and evidence gates.',
  },
  {
    command: '/verify',
    purpose: 'Run the release/test gate attached to the active goal or lane output.',
  },
  {
    command: '/release',
    purpose: 'Promote verified artifacts and optionally commit authorized source changes.',
  },
  {
    command: '/eot',
    purpose: 'Run DeepSeek-backed reflection and memory proposal after a sealed checkpoint.',
  },
  {
    command: '/handoff',
    purpose: 'Record exact continuation state for the next session or lane.',
  },
  {
    command: '/cost',
    purpose: 'Show token, subscription, and lane-budget state before expensive dispatch.',
  },
]);

export const KAGAMI_CYBER_PIPELINE = Object.freeze([
  'intake',
  'classify',
  'authorize',
  'scope-bind',
  'evidence-gate',
  'dispatch',
  'lab-or-scan',
  'verify',
  'proof-package',
  'client-ready-output',
  'memory-proposal',
]);

export const KAGAMI_FANOUT_PROFILES = Object.freeze({
  solo: {
    id: 'solo',
    useWhen: 'simple answer, status, cheap synthesis, or low-risk single-file work',
    lanes: ['@deepseek-v4-flash'],
    mergeRule: 'single-lane output accepted after normal local sanity check',
  },
  pair: {
    id: 'pair',
    useWhen: 'focused implementation or review where a second pass improves quality',
    lanes: ['@codex-mini', '@claude-sonnet-code'],
    mergeRule: 'primary implementation plus independent second-pass correction',
  },
  trio: {
    id: 'trio',
    useWhen: 'non-trivial code, harness, memory, automation, guardrails, or cyber product work',
    lanes: ['@codex', '@claude-sonnet-code', '@deepseek-v4-pro'],
    mergeRule: 'Codex/main integrates; Sonnet codes/reviews; DeepSeek challenges root cause and risks',
  },
  council: {
    id: 'council',
    useWhen: 'critical architecture, security, long-context, design, or release-risk work',
    lanes: ['@codex', '@opus', '@sonnet', '@deepseek-v4-pro', '@shintai'],
    mergeRule: 'Kagami records fan-out, contradictions are written down, Codex verifies every mutation',
  },
  experiment: {
    id: 'experiment',
    useWhen: 'cheap hypothesis, isolated patch idea, or read-only code sketch',
    lanes: ['@codex-spark', '@deepseek-v4-flash'],
    mergeRule: 'output is advisory until a stronger lane or Codex verifies it',
  },
});

export const KAGAMI_EXECUTION_RAILS = Object.freeze({
  input: [
    'slash-command-parse',
    'lane-mention-parse',
    'task-tier-classification',
    'cyber-intent-classification',
  ],
  retrieval: [
    'load-goal-before-dispatch',
    'recall-memory-with-provenance',
    'exclude-protected-runtime-raw-content',
    'prefer-yuri-owned-state',
  ],
  authorization: [
    'external-cyber-target-requires-engagement-record',
    'offensive-lab-work-stays-owned-or-sandboxed',
    'protected-surface-access-requires-wrapper',
  ],
  execution: [
    'health-preflight-before-fanout',
    'single-terminal-writer',
    'claude-opus-cost-governor',
    'no-auto-push',
    'no-unverified-auto-commit',
  ],
  output: [
    'role-prefixed-streams',
    'patches-are-proposals-until-verified',
    'proof-artifacts-need-source-links-or-local-evidence',
    'memory-writes-are-candidates-before-promotion',
  ],
});

export const KAGAMI_IMPLEMENTATION_WAVES = Object.freeze([
  {
    id: 'wave-1-event-bus',
    objective: 'Add YURI-owned append-only Kagami event bus and session registry.',
    tests: ['state path rejects protected surfaces', 'events validate kind/schema', 'restart reconstructs current session'],
  },
  {
    id: 'wave-2-claude-bridge',
    objective: 'Attach Claude Code through a streaming PTY/tmux bridge with reusable sessions.',
    tests: ['dry-run packet streams deltas', 'cost ledger updates', 'SIGINT restores terminal state'],
  },
  {
    id: 'wave-3-session-controller',
    objective: 'Make Kagami the entry point for /goal, lane dispatch, handoff, and verification.',
    tests: ['goal required before high-tier fanout', 'dispatch emits evidence-gate event', 'handoff contains exact resume packet'],
  },
  {
    id: 'wave-4-worker-migration',
    objective: 'Move worker-bridge pulse writes to YURI-owned events and mirror legacy Claude state only if needed.',
    tests: ['no new canonical writes under .claude/state', 'worker queue dispatch uses lane kernel', 'DeepSeek is not forced with CLI --tools'],
  },
  {
    id: 'wave-5-rick-kagami-ui',
    objective: 'Expose control-domain phase, first-token wait, cost, and verification status in Rick/Kagami.',
    tests: ['two-turn PTY regression', 'status bar never corrupts transcript', 'phase events appear while lanes run'],
  },
  {
    id: 'wave-6-cost-governor',
    objective: 'Gate Opus, Codex, and paid routes by task tier, budget, and existing session context.',
    tests: ['critical tasks may request Opus', 'cheap tasks default away from Opus', 'over-budget lane freezes cleanly'],
  },
  {
    id: 'wave-7-cyber-pilot-mode',
    objective: 'Bind Security Lens, Cyber Lab Harness, Guardrail Proof, and client reporting into one authorized cyber flow.',
    tests: ['external target blocked without engagement', 'owned lab allowed', 'proof package maps findings to defensive deliverables'],
  },
  {
    id: 'wave-8-release-and-memory',
    objective: 'Promote verified source, proofs, and memory candidates through a single release gate.',
    tests: ['memory candidate requires verification', 'release gate summarizes changed files', 'dirty protected runtime stays unstaged'],
  },
]);

const CYBER_AUTH_MARKERS = Object.freeze([
  'scan',
  'exploit',
  'breach',
  'red team',
  'pentest',
  'phishing',
  'ddos',
  'malware',
  'infostealer',
  'client',
  'upgreat',
  'external target',
]);

const STRUCTURAL_COMPLEXITY_MARKERS = Object.freeze([
  'architecture',
  'control plane',
  'symbiotic',
  'memory',
  'claude',
  'codex',
  'shintai',
  'automation',
  'cybersecurity',
  'guardrail',
]);

const CODE_MARKERS = Object.freeze([
  'code',
  'coding',
  'implement',
  'fix',
  'test',
  'refactor',
  'script',
  'runtime',
  'harness',
  'kernel',
]);

const EXPERIMENT_MARKERS = Object.freeze([
  'try',
  'experiment',
  'prototype',
  'sketch',
  'cheap',
  'low risk',
  'read-only',
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function includesMarker(text, markers) {
  const lowered = text.toLowerCase();
  return markers.some((marker) => lowered.includes(marker));
}

export function buildKagamiControlDomain() {
  return {
    version: KAGAMI_CONTROL_DOMAIN_VERSION,
    stateRoot: KAGAMI_CANONICAL_STATE_ROOT,
    stateFiles: [...KAGAMI_CANONICAL_STATE_FILES],
    eventKinds: [...KAGAMI_EVENT_KINDS],
    roles: KAGAMI_DOMAIN_ROLES,
    commands: [...KAGAMI_CONTROL_COMMANDS],
    cyberPipeline: [...KAGAMI_CYBER_PIPELINE],
    fanoutProfiles: KAGAMI_FANOUT_PROFILES,
    rails: KAGAMI_EXECUTION_RAILS,
    waves: [...KAGAMI_IMPLEMENTATION_WAVES],
  };
}

export function listCanonicalStateFiles() {
  return [...KAGAMI_CANONICAL_STATE_FILES];
}

export function assertNoProtectedCanonicalState(stateFiles = KAGAMI_CANONICAL_STATE_FILES) {
  const blocked = [];
  for (const file of stateFiles) {
    const normalized = String(file).replaceAll('\\', '/');
    for (const protectedLabel of PROTECTED_SURFACE_LABELS) {
      const label = protectedLabel.replace(/\/$/, '');
      if (normalized === label || normalized.startsWith(`${label}/`)) {
        blocked.push({ file: normalized, protectedLabel });
      }
    }
  }

  if (blocked.length) {
    const error = new Error('Kagami canonical state cannot live under protected runtime surfaces.');
    error.blocked = blocked;
    throw error;
  }

  return { ok: true, blocked };
}

export function classifyKagamiTask(input = '') {
  const text = normalizeText(input);
  const requiresCyberEngagement = includesMarker(text, CYBER_AUTH_MARKERS);
  const structurallyComplex = includesMarker(text, STRUCTURAL_COMPLEXITY_MARKERS);
  const taskTier = requiresCyberEngagement || structurallyComplex ? 'critical' : 'standard';
  const recommendedPrimary = structurallyComplex ? 'claude-opus-comain' : 'codex-main';
  const advisoryLanes = taskTier === 'critical'
    ? ['deepseek', 'shintai-nim', 'claude-opus-comain']
    : ['deepseek'];

  return {
    input: text,
    taskTier,
    requiresCyberEngagement,
    recommendedPrimary,
    advisoryLanes,
    authorizationState: requiresCyberEngagement ? 'engagement-required' : 'local-or-internal-ok',
  };
}

export function recommendKagamiFanout(input = '') {
  const text = normalizeText(input);
  const lowered = text.toLowerCase();
  const task = classifyKagamiTask(text);
  const hasCode = includesMarker(lowered, CODE_MARKERS);
  const isExperiment = includesMarker(lowered, EXPERIMENT_MARKERS);
  const isCritical = task.taskTier === 'critical';
  const isHuge = /(opus|huge|massive|forensic|company|cyber|security|architecture|release|memory|rag|automation|guardrail|shintai)/u.test(lowered);

  let profile = 'solo';
  let reason = 'simple or cheap work';

  if (isExperiment && !isCritical) {
    profile = 'experiment';
    reason = 'low-risk hypothesis or read-only sketch';
  } else if (isHuge) {
    profile = 'council';
    reason = 'critical/large-context/system-risk work';
  } else if (hasCode && isCritical) {
    profile = 'trio';
    reason = 'non-trivial code with system risk';
  } else if (hasCode) {
    profile = 'pair';
    reason = 'focused implementation benefits from a second coding pass';
  }

  const selected = KAGAMI_FANOUT_PROFILES[profile];
  return {
    input: text,
    profile,
    reason,
    lanes: [...selected.lanes],
    mergeRule: selected.mergeRule,
    taskTier: task.taskTier,
    authorizationState: task.authorizationState,
    codexRule: 'Codex family codes and verifies; gpt-5.5 for hard work, gpt-5.4-mini for focused work, Spark only for explicit cheap experiments.',
    claudeRule: 'Sonnet is the regular peer collaboration lane; Opus is intentional coding/architecture escalation; private Rick references remain opt-in dev aliases; Codex verifies all mutations.',
    parallelismRule: profile === 'solo' ? 'no fan-out' : 'parallel only when lane outputs do not fight over the same file; otherwise stage sequentially',
  };
}

export function buildClaudeControlPacket({
  objective,
  taskTier = 'critical',
  allowedFiles = [],
  forbiddenPaths = PROTECTED_SURFACE_LABELS,
  acceptanceCriteria = [],
  verificationOwner = 'codex-main',
  mutationPolicy = 'scoped-edits-allowed-after-packet',
} = {}) {
  const cleanObjective = normalizeText(objective) || 'Process Kagami control-domain task.';
  return {
    packetVersion: `${KAGAMI_CONTROL_DOMAIN_VERSION}.claude-packet`,
    lane: 'claude-opus-comain',
    objective: cleanObjective,
    taskTier,
    mutationPolicy,
    allowedFiles: [...allowedFiles],
    forbiddenPaths: [...forbiddenPaths],
    acceptanceCriteria: [...acceptanceCriteria],
    requiredOutput: [
      'findings',
      'proposed-edits-or-patch',
      'risks',
      'tests-run-or-needed',
      'codex-verification-notes',
    ],
    verificationOwner,
    rails: {
      noProtectedReads: true,
      noCommit: true,
      noPush: true,
      codexDoubleCheckRequired: true,
      costGovernorRequired: true,
    },
  };
}

export function summarizeDomainForPrompt(domain = buildKagamiControlDomain()) {
  const roles = Object.values(domain.roles)
    .map((role) => `${role.id}:${role.authority}`)
    .join(', ');
  return [
    `domain=${domain.version}`,
    `state_root=${domain.stateRoot}`,
    `roles=${roles}`,
    `cyber_pipeline=${domain.cyberPipeline.join('>')}`,
    'claude_rule=Claude Sonnet collaborates as the regular peer lane; Opus escalates hard coding/architecture; private Rick aliases remain opt-in and non-shipping; Codex/main verifies every mutation before trust.',
    'protected_rule=Claude runtime state remains compatibility-only, never YURI canonical state.',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const domain = buildKagamiControlDomain();
  assertNoProtectedCanonicalState(domain.stateFiles);
  console.log(JSON.stringify(domain, null, 2));
}
