#!/usr/bin/env node
/**
 * Kagami Claude/Codex control-domain contract.
 *
 * This is intentionally declarative. Rick, worker bridges, Shintai dispatch,
 * and future Claude Code adapters can consume one domain map instead of
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
  'EVIDENCE_GATE_PASSED',
  'AUTHORIZATION_REQUIRED',
  'ENGAGEMENT_SCOPE_BOUND',
  'LANE_HEALTH_PREFLIGHT',
  'CONTEXT_PACKET_BUILT',
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
    ],
  },
  claudeOpusComain: {
    id: 'claude-opus-comain',
    authority: 'co-main-architect-and-coder',
    mutatesRepo: 'allowed-only-through-scoped-packets',
    canonicalDuties: [
      'long-context-architecture',
      'high-reasoning-implementation',
      'contradiction-synthesis',
      'patch-proposal',
      'self-check-before-handoff',
    ],
    verificationRule: 'Codex/main independently verifies every Claude mutation before trust.',
    compatibilityAliases: ['claude-opus-audit', '@claude-opus-comain'],
  },
  deepseek: {
    id: 'deepseek',
    authority: 'synthesis-and-eot-workhorse',
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
    authority: 'health-and-lifecycle-spine',
    mutatesRepo: false,
    canonicalDuties: [
      'launchd-health',
      'tmux-worker-liveness',
      'pong-probes',
      'stale-agent-repair',
      'daemon-reporting',
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
    purpose: 'Attach or resume the continuous Claude Code session without starting heavy work.',
  },
  {
    command: '/claude opus',
    purpose: 'Escalate a scoped packet to Claude Opus co-main when task tier and budget allow.',
  },
  {
    command: '/claude send',
    purpose: 'Send a bounded packet to the current Claude session and stream deltas into Kagami events.',
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
    'claude_rule=Claude Opus may co-build, but Codex/main verifies every mutation before trust.',
    'protected_rule=Claude runtime state remains compatibility-only, never YURI canonical state.',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const domain = buildKagamiControlDomain();
  assertNoProtectedCanonicalState(domain.stateFiles);
  console.log(JSON.stringify(domain, null, 2));
}
