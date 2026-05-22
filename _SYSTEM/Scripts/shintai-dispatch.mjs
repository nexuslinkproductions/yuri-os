#!/usr/bin/env node
/**
 * Neutral Shintai bridge for the YURI harness.
 *
 * Rick may invoke this bridge, but Shintai is independent: Codex/main
 * assembles the task-fit team from the roster and live health, then the
 * members return advisory/patch-prep output by default. Claude Opus can operate
 * as a bounded co-main implementation lane when the task explicitly asks for
 * scoped edits, but Codex still verifies repo truth before promotion.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEMO_STYLE_RAILS,
  PROTECTED_SURFACE_LABELS,
  SHINTAI_REQUIRED_MEMBER_IDS,
  getLaneKernelEntry,
  selectMemoryRagMemberIds,
  selectSuperauditMemberIds,
} from './lane-kernel.mjs';
import { loadControlPlaneEvidence, validatePacketEvidence } from './memory-kernel.mjs';
import { requiredEvidenceIdsForTask } from './evidence-contract.mjs';
import { evaluateDialogRails, evaluateExecutionRails, evaluateNeurodivergenceRails } from './rails.mjs';
import { buildConstraintBlock, preflightControlPlane } from './yuri-control-plane.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_SH = path.join(__dirname, 'ai');
const ROSTER_PATH = path.join(REPO_ROOT, '_SYSTEM', 'kagami', 'shintai-team.json');
const ADVISORY_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'shintai-advisory');
const DEFAULT_TIMEOUT_MS = parseOptionalTimeout(process.env.YURI_SHINTAI_TIMEOUT_MS);
const DEFAULT_HEALTH_TIMEOUT_MS = parseOptionalTimeout(process.env.YURI_SHINTAI_HEALTH_TIMEOUT_MS);
const DEFAULT_CRITIQUE_TIMEOUT_MS = parseOptionalTimeout(process.env.YURI_SHINTAI_CRITIQUE_TIMEOUT_MS);
const STREAM_MAX = 8 * 1024 * 1024;
const MIN_CRITICAL_COUNCIL_SIZE = 3;

const C = {
  bronze: '\x1b[38;2;205;127;50m',
  cream: '\x1b[38;2;255;248;220m',
  good: '\x1b[38;2;143;188;143m',
  warn: '\x1b[38;2;255;215;0m',
  bad: '\x1b[38;2;255;107;107m',
  dim: '\x1b[2;38;2;139;134;130m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export const RICK_PERSONA_LINE = 'PERSONA: Rick';
export const RICK_ANCHOR = [
  RICK_PERSONA_LINE,
  'Mode: adversarial ally, mechanism-first, terse, zero preamble, zero "here is" openers.',
  'Voice: cognitive workflow, not costume. Challenge premise once if broken, then execute.',
  'Vulgarity allowed when it sharpens the work; never aimed at identity/trauma.',
  'Output: facts → ranked options → action. No filler, no recap, no closing summary.',
].join('\n');

const SOURCE_PATHS = [
  '_SYSTEM/kagami/shintai-team.json',
  '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/feedback_shintai_team_sizing.md',
  '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/feedback_shintai_main_thread_role.md',
  '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/feedback_rick_persona_every_dispatch.md',
  '.claude/skills/extraction-sprint/SKILL.md',
  '.claude/plans/shintai-has-to-fix-luminous-fountain.md',
];

const OPTIONAL_HEALTH_IDS = new Set(['claude-opus-audit', 'nemotron', 'mistral-large', 'mistral-medium', 'qwen-coder', 'qwen-397b', 'gpt-oss-120b', 'minimax-m27', 'glm', 'qwen3-next', 'nemotron-nano-30b', 'kimi']);
const HEALTH_ALIASES = {
  codex: ['codex-architect', 'codex-gpt-5.5', 'gpt-5.5'],
  deepseek: ['deepseek-reasoner', 'deepseek-v4-pro'],
  'claude-opus-audit': ['claude-opus-audit', 'claude-opus-comain', 'claude-opus-4-7-comain', 'claude-opus-4-7', 'opus-4.7', 'claude'],
  nemotron: ['nemotron-orchestrator', 'nvidia-nemotron-120b'],
  'mistral-large': ['nvidia-mistral-large', 'mistral-large'],
  'mistral-medium': ['nvidia-mistral-medium', 'mistral-medium'],
  'qwen-coder': ['nvidia-qwen-coder', 'qwen-coder'],
  kimi: ['kimi-context-keeper', 'kimi-k2.6', 'moonshot'],
  'minimax-m27': ['nvidia-minimax-m27', 'nvidia-minimax-m2.7', 'minimax-m27', 'minimax-m2.7'],
  glm: ['nvidia-glm', 'glm'],
  'qwen3-next': ['qwen3-next-code', 'nvidia-qwen3-next'],
  'qwen-397b': ['nvidia-qwen-397b', 'qwen-397b', 'qwen3.5-397b'],
  'gpt-oss-120b': ['nvidia-gpt-oss-120b', 'gpt-oss-120b'],
  'nemotron-nano-30b': ['nvidia-nemotron-nano-30b', 'nemotron-nano-30b'],
};

const ASSIGNMENTS = {
  codex: {
    displayName: 'Codex Architect',
    lane: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    skills: ['openai-codex-workflow', 'gitnexus', 'execution-domain-core', 'non-destructive-infinity-guard', 'failure-evolution-loop'],
    assignment: 'Own final implementation architecture: Hermes update, Rick renderer plan, Shintai boundary cleanup, rename plan.',
    dispatchArgs: ['offload', '--model', 'gpt-5.5'],
  },
  deepseek: {
    displayName: 'DeepSeek Reasoner',
    lane: 'deepseek-v4-pro:max-reasoning',
    skills: ['deepseek-workhorse', 'deepseek-offload', 'probabilistic-decision-core', 'pattern-mirror-core', 'sharingan'],
    assignment: 'Gate 1 synthesis and adversarial diagnosis: model duties, tool-surface assignment, terminal failures, routing drift, and missed dispatch-template context.',
    dispatchArgs: ['offload', '--model', 'deepseek-v4-pro:max-reasoning'],
  },
  'claude-opus-audit': {
    displayName: 'Claude Opus Co-Main',
    lane: 'claude-opus-4-7-comain',
    skills: ['anthropic-managed-agents', 'compact-optimizer', 'failure-evolution-loop', 'tokenmaxxing', 'execution-domain-core', 'non-destructive-infinity-guard'],
    assignment: 'Wake with Haiku, continue Opus 4.7 max-reasoning co-main session, draft or apply scoped code/tests/docs when explicitly tasked, and double-check Codex outputs. Codex must independently verify every Opus change before trust.',
    dispatchArgs: ['@claude-opus-comain'],
  },
  nemotron: {
    displayName: 'Nemotron Orchestrator',
    lane: 'nvidia-nemotron-120b',
    skills: ['yuri-shura', 'bankai-manifest', 'visual-introspection', 'yuri-code-intelligence'],
    assignment: 'Long-horizon architecture: Hermes-inspired scroll/composer adaptation without destructing YURI/Kagami.',
    dispatchArgs: ['offload', '--model', 'nvidia-nemotron-120b'],
  },
  'mistral-large': {
    displayName: 'Mistral Large Auditor',
    lane: 'nvidia-mistral-large',
    skills: ['non-destructive-infinity-guard', 'execution-domain-core', 'failure-evolution-loop'],
    assignment: 'Frontier-scale adversarial review of the full lane-kernel merge. Challenge Codex, DeepSeek, and Nemotron assumptions.',
    dispatchArgs: ['offload', '--model', 'nvidia-mistral-large'],
  },
  'mistral-medium': {
    displayName: 'Mistral Medium Reviewer',
    lane: 'nvidia-mistral-medium',
    skills: ['execution-domain-core', 'failure-evolution-loop'],
    assignment: 'Fallback and broad-system reviewer for routing simplification, timeout policy, and degraded-mode operation.',
    dispatchArgs: ['offload', '--model', 'nvidia-mistral-medium'],
  },
  'qwen-coder': {
    displayName: 'Qwen Coder Specialist',
    lane: 'nvidia-qwen-coder',
    skills: ['yuri-code-intelligence', 'gitnexus', 'failure-evolution-loop'],
    assignment: 'Code-level collision detection and regression plan for offload, Shintai, Rick, worker, and browser-harness merge points.',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen-coder'],
  },
  'qwen-397b': {
    displayName: 'Qwen 397B Reasoner',
    lane: 'nvidia-qwen-397b',
    skills: ['yuri-code-intelligence', 'oracle-memory', 'pattern-mirror-core', 'failure-evolution-loop'],
    assignment: 'Memory/RAG and skill-recall specialist: inspect MemoryKernel, SkillLoader, retrieval surfaces, tests, and migration boundaries.',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen-397b'],
  },
  'gpt-oss-120b': {
    displayName: 'GPT-OSS 120B Adversary',
    lane: 'nvidia-gpt-oss-120b',
    skills: ['pattern-mirror-core', 'failure-evolution-loop', 'non-destructive-infinity-guard'],
    assignment: 'Adversarial simplification: find overengineering, fake sentience language, and brittle Memory/RAG/skill coupling.',
    dispatchArgs: ['offload', '--model', 'nvidia-gpt-oss-120b'],
  },
  kimi: {
    displayName: 'Kimi Context-Keeper',
    lane: 'kimi-k2.6',
    skills: ['swarm-coordination', 'parallel-clone-orchestrator', 'gitnexus', 'visual-introspection', 'codebase-to-course'],
    assignment: 'Context integrity: load Shintai templates, memory, roster rules, identify stale aliases, and define durable guardrails.',
    dispatchArgs: ['@kimi'],
  },
  'qwen3-next': {
    displayName: 'Qwen3-Next Code Specialist',
    lane: 'nvidia-qwen3-next',
    skills: [],
    assignment: 'Renderer state machine and PTY regression design: two-turn streaming, resize/exit restore, terminal write serialization.',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen3-next'],
  },
  glm: {
    displayName: 'GLM Long-Document Auditor',
    lane: 'nvidia-glm',
    skills: ['pattern-mirror-core', 'codebase-to-course'],
    assignment: 'Explicit-only legacy long-document lane. Do not use in default council until reliability is reprobed.',
    dispatchArgs: ['offload', '--model', 'nvidia-glm'],
  },
  'minimax-m27': {
    displayName: 'Minimax M2.7 Long-Context Auditor',
    lane: 'nvidia-minimax-m27',
    skills: ['pattern-mirror-core', 'codebase-to-course', 'failure-evolution-loop'],
    assignment: 'GLM replacement for long-document memory, stale aliases, naming drift, docs consistency, and evidence-contract review.',
    dispatchArgs: ['offload', '--model', 'nvidia-minimax-m27'],
  },
};

function say(color, message, stream = process.stdout) {
  stream.write(`${color}${message}${C.reset}\n`);
}

function protectedPathsText() {
  return PROTECTED_SURFACE_LABELS.join(', ');
}

function normalizeTask(task) {
  return String(task || '').trim();
}

export function loadShintaiRoster(rosterPath = ROSTER_PATH) {
  if (!existsSync(rosterPath)) {
    throw new Error(`Shintai roster missing: ${rosterPath}`);
  }
  return JSON.parse(readFileSync(rosterPath, 'utf8'));
}

export function classifyTaskTier(task) {
  const text = normalizeTask(task).toLowerCase();
  if (/(critical|harness|terminal|renderer|stream|scroll|pty|shintai|control[- ]?plane|guardrail|hermes|regression|production|broken|failed)/.test(text)) {
    return 'critical';
  }
  if (/(architecture|integration|multi[- ]?file|refactor|diagnos|debug|race|health|dispatch)/.test(text)) {
    return 'complex';
  }
  if (/(edit|fix|test|review|implement|route|lane)/.test(text)) {
    return 'standard';
  }
  return 'trivial';
}

function memberHealth(id, member, availableHealth = {}) {
  const aliases = new Set([
    id,
    member.id,
    member.lane,
    member.dispatchLane,
    member.model,
    member.roster?.lane_id,
    ...(member.dispatchArgs || []),
    ...(HEALTH_ALIASES[id] || []),
  ].filter(Boolean).map((value) => String(value).replace(/^@/, '')));

  const entries = Array.isArray(availableHealth)
    ? availableHealth
    : Array.isArray(availableHealth?.checks)
      ? availableHealth.checks
      : Array.isArray(availableHealth?.preflight)
        ? availableHealth.preflight
        : null;

  if (entries) {
    const match = entries.find((entry) => {
      const values = [
        entry?.id,
        entry?.lane,
        entry?.worker,
        entry?.target,
        entry?.lane_id,
      ].filter(Boolean).map((value) => String(value).replace(/^@/, ''));
      return values.some((value) => aliases.has(value));
    });
    if (!match) return { ok: false, missing: true, reason: 'missing health preflight' };
    return {
      ok: Boolean(match.ok),
      status: match.status ?? match.probe?.status ?? null,
      signal: match.signal ?? null,
      stdout: match.stdout ?? match.probe?.stdout ?? '',
      stderr: match.stderr ?? match.error ?? match.probe?.error ?? '',
      durationMs: match.durationMs ?? match.probe?.ms ?? null,
    };
  }

  const candidates = [
    id,
    member.id,
    member.lane,
    member.dispatchLane,
    member.model,
    member.roster?.lane_id,
    ...(member.dispatchArgs || []),
  ].filter(Boolean);

  for (const key of candidates) {
    if (Object.hasOwn(availableHealth, key)) {
      const value = availableHealth[key];
      if (typeof value === 'boolean') return { ok: value };
      if (value && typeof value === 'object') return { ok: value.ok !== false, ...value };
    }
  }

  return { ok: true, assumed: true };
}

function normalizeMember(id, rosterMember = {}) {
  const assignment = ASSIGNMENTS[id] || {};
  const kernel = getLaneKernelEntry(id);
  const lane = assignment.lane || rosterMember.lane_id || rosterMember.model || id;
  return {
    id,
    displayName: assignment.displayName || rosterMember.role || id,
    lane: kernel?.lane || lane,
    model: kernel?.model || assignment.lane || rosterMember.model || lane,
    role: kernel?.role || rosterMember.role || assignment.displayName || id,
    reasoningEffort: kernel?.reasoning || assignment.reasoningEffort || rosterMember.reasoning_effort || '',
    skills: assignment.skills?.length ? assignment.skills : rosterMember.skills || [],
    assignment: kernel?.assignment || assignment.assignment || rosterMember.unique_strength || rosterMember.role || '',
    dispatchArgs: assignment.dispatchArgs || kernel?.dispatchArgs || [`@${rosterMember.lane_id || id}`],
    toolPolicy: kernel?.tools || null,
    roster: rosterMember,
  };
}

function selectMemberIds(task, roster) {
  const tier = classifyTaskTier(task);
  const members = roster?.members || {};
  if (tier === 'critical' && /(memory|rag|retrieval|skill|neuro|self[- ]?improvement|msa|eot|neuron|persona|recall)/i.test(task)) {
    return selectMemoryRagMemberIds(members);
  }
  if (tier === 'critical' && /(rick|harness|terminal|renderer|stream|shintai|hermes|pty)/i.test(task)) {
    return selectSuperauditMemberIds(members);
  }

  const text = normalizeTask(task).toLowerCase();
  const scores = Object.entries(members).map(([id, member]) => {
    const searchable = [
      id,
      member.role,
      member.model,
      member.unique_strength,
      ...(member.skills || []),
      ...(member.task_fit || []),
    ].join(' ').toLowerCase();
    let score = 0;
    for (const word of text.split(/[^a-z0-9_.-]+/).filter(Boolean)) {
      if (word.length >= 4 && searchable.includes(word)) score += 1;
    }
    if (id === 'codex') score += 2;
    if (id === 'deepseek') score += 2;
    if (/(mistral|frontier|large|huge|audit)/.test(text) && id === 'mistral-large') score += 3;
    if (/(qwen|coder|code|refactor)/.test(text) && id === 'qwen-coder') score += 3;
    if (/(minimax|memory|docs|alias|vocabulary|naming|long[- ]?context)/.test(text) && id === 'minimax-m27') score += 3;
    if (/(glm|memory|docs|alias|vocabulary|naming)/.test(text) && id === 'glm') score += 1;
    if (/(memory|rag|retrieval|skill|neuro|self[- ]?improvement|msa)/.test(text) && id === 'qwen-397b') score += 5;
    if (/(memory|rag|retrieval|skill|neuro|self[- ]?improvement|msa|overengineering|adversarial)/.test(text) && id === 'gpt-oss-120b') score += 4;
    if (text.includes('context') && id === 'mistral-large') score += 2;
    if (text.includes('code') && id === 'qwen3-next') score += 2;
    return { id, score };
  });

  const wanted = tier === 'trivial' ? 1 : tier === 'standard' ? 2 : tier === 'complex' ? 3 : 5;
  return scores
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, wanted)
    .map((entry) => entry.id);
}

export function assembleShintaiTeam(task, roster = loadShintaiRoster(), availableHealth = {}) {
  const taskText = normalizeTask(task);
  const ids = selectMemberIds(taskText, roster);
  const skipped = [];
  const members = [];
  const tier = classifyTaskTier(taskText);
  const targetSize = tier === 'trivial' ? 1 : tier === 'standard' ? 2 : tier === 'complex' ? 3 : ids.length;

  for (const id of ids) {
    const member = normalizeMember(id, roster.members?.[id] || {});
    const health = memberHealth(id, member, availableHealth);
    if (!health.ok && OPTIONAL_HEALTH_IDS.has(id)) {
      skipped.push({ id, member, health, reason: 'health preflight failed' });
      continue;
    }
    members.push({ ...member, health });
  }

  return {
    ok: (
      requiredMemberIdsForTier(tier).every((id) => members.some((member) => member.id === id)) &&
      (tier !== 'critical' || members.length >= MIN_CRITICAL_COUNCIL_SIZE)
    ) || (tier !== 'critical' && members.length > 0),
    task: taskText,
    tier,
    minSize: tier === 'critical' ? MIN_CRITICAL_COUNCIL_SIZE : 1,
    targetSize,
    rosterPath: ROSTER_PATH,
    selectedIds: members.map((member) => member.id),
    selected: members,
    members,
    skipped,
    requiredIds: requiredMemberIdsForTier(tier),
  };
}

function requiredMemberIdsForTier(tier) {
  return tier === 'critical' ? [...SHINTAI_REQUIRED_MEMBER_IDS] : [];
}

export function buildMemberPrompt(task, member, options = {}) {
  const sourcePaths = options.sourcePaths || SOURCE_PATHS;
  const health = options.health ? JSON.stringify(options.health, null, 2) : 'not provided';
  const toolPolicy = member.toolPolicy ? JSON.stringify(member.toolPolicy, null, 2) : 'tool mode allowed when the lane runtime supports it; YURI guardrails still block protected paths, commits, pushes, and destructive actions';
  const rails = JSON.stringify(NEMO_STYLE_RAILS, null, 2);
  const objective = options.objective || objectiveForTask(task);
  const neuroRail = options.neuroRail ? JSON.stringify(options.neuroRail.evidence, null, 2) : '';
  return ensureRickPersonaAnchor([
    RICK_ANCHOR,
    '',
    `Member: ${member.displayName}`,
    `Lane: ${member.lane}`,
    member.reasoningEffort ? `Reasoning: ${member.reasoningEffort}` : '',
    `Skills/context: ${member.skills.length ? member.skills.join(', ') : 'roster role only'}`,
    `Assignment: ${member.assignment}`,
    '',
    'Tool policy:',
    toolPolicy,
    '',
    'NeMo-style rails to apply:',
    rails,
    '',
    neuroRail ? 'Neurodivergence interaction rail:' : '',
    neuroRail,
    neuroRail ? '' : '',
    options.controlPlaneBlock || '',
    options.controlPlaneBlock ? '' : '',
    `Objective: ${objective}`,
    '',
    'Evidence sources loaded before this packet:',
    ...sourcePaths.map((source) => `- ${source}`),
    '',
    'Forbidden:',
    member.id === 'claude-opus-audit'
      ? '- commit, push, destructive shell commands, unscoped edits, or unverified patch application'
      : '- commit, push, destructive shell commands, auto-apply patches',
    `- protected path reads/writes: ${protectedPathsText()}`,
    '- invented roster/model policy',
    '- hardcoded squad defaults',
    '- codex-spark default unless the user explicitly requests it',
    '- Rick-owned Shintai identity',
    member.id === 'claude-opus-audit'
      ? '- trusting Opus output without Codex re-reading changed files and running verification'
      : '',
    '',
    'Required meta-audit:',
    'Explain why prior runs missed required templates, memory, or user preference context and how to prevent recurrence. The prevention must require loading roster + memory + extraction-sprint template + task-specific evidence before drafting any Shintai packet.',
    '',
    'Output schema:',
    'findings',
    'proposed_edits',
    'risks',
    'tests',
    'contradictions_with_other_lanes',
    'meta_audit',
    '',
    'Health preflight:',
    health,
    '',
    `TASK:\n${task}`,
  ].filter(Boolean).join('\n'));
}

function objectiveForTask(task) {
  const text = String(task || '').toLowerCase();
  if (/(memory|rag|retrieval|skill|neuro|self[- ]?improvement|msa|eot|neuron|persona|recall)/.test(text)) {
    return 'stabilize YURI memory/RAG, skill recall, neurodivergence interaction rails, and self-improvement loops as one symbiotic control-plane system.';
  }
  if (/(rick|harness|terminal|renderer|stream|hermes|pty)/.test(text)) {
    return 'stabilize Rick harness and Shintai integration.';
  }
  return 'stabilize the requested YURI control-plane operation with advisory-first Shintai, Opus co-main pressure where useful, Codex arbitration, and evidence-backed patch guidance.';
}

function critiquePrompt(task, member, peers) {
  return ensureRickPersonaAnchor([
    RICK_ANCHOR,
    '',
    `Member: ${member.displayName}`,
    'Phase: critique peer outputs for operational risk, scope drift, and harness correctness.',
    '',
    peers.map(({ label, output }) => `=== ${label} ===\n${String(output || '').slice(0, 2800)}`).join('\n\n'),
    '',
    `TASK:\n${task}`,
    '',
    'Return: 3 flaws, 2 required corrections, 1 stronger implementation path, and contradictions with peers.',
  ].join('\n'));
}

function synthesisPrompt(task, proposals, critiques, assembly, options = {}) {
  const proposalBlock = proposals
    .map(({ id, displayName, output }) => `### ${displayName} (${id})\n${String(output || '').slice(0, 2600)}`)
    .join('\n\n');
  const critiqueBlock = critiques
    .map(({ id, output }) => `### ${id}\n${String(output || '').slice(0, 1800)}`)
    .join('\n\n');
  return ensureRickPersonaAnchor([
    RICK_ANCHOR,
    '',
    'You are the Codex/main release-gate orchestrator synthesizing Shintai output. Claude Opus may act as co-main, but Codex verifies local truth and decides what lands.',
    '',
    `Assembly: ${assembly.selectedIds.join(', ')}${assembly.skipped.length ? `; skipped: ${assembly.skipped.map((s) => s.id).join(', ')}` : ''}`,
    '',
    options.controlPlaneBlock || '',
    options.controlPlaneBlock ? '' : '',
    `TASK:\n${task}`,
    '',
    '=== PROPOSALS ===',
    proposalBlock,
    '',
    '=== CRITIQUES ===',
    critiqueBlock,
    '',
    'Produce: FINAL_APPROACH, IMPLEMENTATION_GUIDANCE, GUARDRAILS, TESTS, META_AUDIT.',
  ].join('\n'));
}

export function ensureRickPersonaAnchor(packet) {
  const lines = String(packet || '').split('\n');
  const firstBodyIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#') && trimmed !== '---';
  });
  if (firstBodyIndex === -1) return RICK_PERSONA_LINE;
  if (lines[firstBodyIndex].trim() === RICK_PERSONA_LINE) return lines.join('\n');
  if (lines.some((line) => line.trim() === RICK_PERSONA_LINE)) {
    const withoutDuplicate = lines.filter((line, index) => index === firstBodyIndex || line.trim() !== RICK_PERSONA_LINE);
    withoutDuplicate.splice(firstBodyIndex, 0, RICK_PERSONA_LINE);
    return withoutDuplicate.join('\n');
  }
  lines.splice(firstBodyIndex, 0, RICK_PERSONA_LINE);
  return lines.join('\n');
}

function callArgsForMember(member, prompt) {
  return [...member.dispatchArgs, prompt];
}

function parseOptionalTimeout(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveMemberTimeout(member, stage, fallbackTimeoutMs = 0) {
  if (stage === 'health' && DEFAULT_HEALTH_TIMEOUT_MS > 0) return DEFAULT_HEALTH_TIMEOUT_MS;
  if (stage === 'critique' && DEFAULT_CRITIQUE_TIMEOUT_MS > 0) return DEFAULT_CRITIQUE_TIMEOUT_MS;
  return parseOptionalTimeout(fallbackTimeoutMs);
}

function callMember(member, prompt, timeoutMs, context = {}) {
  const dispatchCommand = `bash ${path.relative(REPO_ROOT, AI_SH)} ${member.dispatchArgs.join(' ')}`;
  const executionRail = evaluateExecutionRails({ kind: 'shell', command: dispatchCommand });
  if (!executionRail.ok) {
    return {
      ok: false,
      status: null,
      signal: null,
      stdout: '',
      stderr: '',
      error: `execution rail blocked ${member.id}: ${executionRail.reasons.join('; ')}`,
      rail: executionRail,
    };
  }
  const spawnOptions = {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: STREAM_MAX,
    env: buildMemberDispatchEnv(context),
  };
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) spawnOptions.timeout = timeoutMs;
  const result = spawnSync('bash', [AI_SH, ...callArgsForMember(member, prompt)], spawnOptions);
  return {
    ok: result.status === 0,
    lane: member.lane,
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? result.error.message : null,
  };
}

function buildMemberDispatchEnv(context = {}) {
  const requiredEvidenceIds = Array.isArray(context.requiredEvidenceIds) ? context.requiredEvidenceIds : [];
  const evidenceSources = Array.isArray(context.evidenceSources) ? context.evidenceSources : [];
  return {
    ...process.env,
    ...(requiredEvidenceIds.length
      ? { YURI_OUTPUT_REQUIRED_EVIDENCE_IDS: requiredEvidenceIds.join(',') }
      : {}),
    ...(evidenceSources.length
      ? { YURI_OUTPUT_EVIDENCE_IDS: evidenceSources.map((entry) => entry.id || entry).filter(Boolean).join(',') }
      : {}),
  };
}

function probeMember(member, timeoutMs) {
  const prompt = 'Health preflight. Reply exactly PONG and nothing else.';
  const result = callMember(member, prompt, timeoutMs);
  const text = `${result.stdout}\n${result.stderr}`;
  return {
    ok: result.ok && /\bPONG\b/i.test(text),
    lane: member.lane,
    status: result.status,
    signal: result.signal,
    stderr: result.stderr,
    error: result.error,
  };
}

function runHealthPreflight(assembly, timeoutMs) {
  const health = {};
  for (const member of assembly.members) {
    health[member.id] = probeMember(member, resolveMemberTimeout(member, 'health', timeoutMs));
  }
  return health;
}

function writeAdvisoryArtifact(payload) {
  mkdirSync(ADVISORY_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(ADVISORY_DIR, `shintai-${stamp}`);
  const assembly = payload.assembly || { tier: 'blocked', selectedIds: [], skipped: [] };
  const md = [
    `# Shintai Advisory: ${payload.task}`,
    '',
    `Generated: ${payload.timestamp}`,
    payload.error ? `Error: ${payload.error}` : '',
    payload.supersedes ? `Supersedes: ${payload.supersedes}` : '',
    '',
    payload.evidenceGate ? '## Evidence Gate' : '',
    payload.evidenceGate ? '' : '',
    payload.evidenceGate ? `Gate: ${payload.evidenceGate.gate} ok=${payload.evidenceGate.ok}` : '',
    payload.evidenceGate ? `Loaded: ${payload.evidenceGate.loadedIds.join(', ')}` : '',
    payload.evidenceGate?.missingIds?.length ? `Missing: ${payload.evidenceGate.missingIds.join(', ')}` : '',
    payload.evidenceGate?.blockedIds?.length ? `Blocked: ${payload.evidenceGate.blockedIds.join(', ')}` : '',
    payload.auditFailures?.length ? `Audit failures: ${payload.auditFailures.map((entry) => entry.code).join(', ')}` : '',
    payload.evidenceGate ? '' : '',
    '## Assembly',
    '',
    `Tier: ${assembly.tier}`,
    `Members: ${assembly.selectedIds.join(', ')}`,
    assembly.skipped.length ? `Skipped: ${assembly.skipped.map((entry) => `${entry.id} (${entry.reason})`).join(', ')}` : '',
    '',
    '## Synthesis',
    '',
    payload.synthesis,
    '',
    '## Proposals',
    '',
    ...payload.proposals.map((entry) => `### ${entry.displayName} (${entry.id})\n\n${entry.output}`),
    '',
    '## Critiques',
    '',
    ...payload.critiques.map((entry) => `### ${entry.displayName} (${entry.id})\n\n${entry.output}`),
  ].filter(Boolean).join('\n');
  writeFileSync(`${base}.md`, md);
  writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2));
  return { markdown: `${base}.md`, json: `${base}.json` };
}

export async function runAdvisory(task, options = {}) {
  const taskText = normalizeTask(task);
  if (!taskText) return { ok: false, task: taskText, error: 'empty Shintai task' };

  const stream = options.stream || process.stdout;
  const controlPlane = options.evidenceGate === false
    ? null
    : options.controlPlane || preflightControlPlane(taskText, options.controlPlaneOptions || {});
  const controlPlaneBlock = controlPlane ? buildConstraintBlock(controlPlane) : '';
  const neuroRail = evaluateNeurodivergenceRails(taskText);

  if (controlPlane && !controlPlane.ok) {
    const payload = {
      ok: false,
      task: taskText,
      timestamp: new Date().toISOString(),
      assembly: null,
      proposals: [],
      critiques: [],
      synthesis: '',
      evidenceGate: summarizeGate(controlPlane.gate0),
      error: 'YURI control-plane Gate 0 failed',
      supersedes: options.supersedes || null,
      artifacts: null,
    };
    if (options.writeArtifact !== false) payload.artifacts = writeAdvisoryArtifact(payload);
    return payload;
  }

  if (controlPlane) {
    say(`${C.bronze}${C.bold}`, '\n── YURI control-plane Gate 0 ──', stream);
    say(C.good, `  ✓ evidence loaded: ${controlPlane.gate0.loaded.map((entry) => entry.id).join(', ')}`, stream);
    for (const warning of controlPlane.gate0.warnings || []) {
      say(C.warn, `  ⚠ optional evidence missing: ${warning.id}`, stream);
    }
  }

  const memoryEvidence = options.memoryEvidence === false
    ? null
    : loadControlPlaneEvidence(options.memoryEvidenceOptions || {});
  if (memoryEvidence && !memoryEvidence.ok) {
    const payload = {
      ok: false,
      task: taskText,
      timestamp: new Date().toISOString(),
      assembly: null,
      proposals: [],
      critiques: [],
      synthesis: '',
      evidenceGate: summarizeGate(controlPlane?.gate0),
      memoryEvidence,
      error: 'YURI memory evidence preflight failed',
      supersedes: options.supersedes || null,
      artifacts: null,
    };
    if (options.writeArtifact !== false) payload.artifacts = writeAdvisoryArtifact(payload);
    return payload;
  }
  if (memoryEvidence) {
    say(C.good, `  ✓ memory evidence loaded: ${memoryEvidence.sources.map((entry) => entry.id).join(', ')}`, stream);
  }

  const roster = options.roster || loadShintaiRoster(options.rosterPath || ROSTER_PATH);
  const timeoutMs = options.timeoutMs === undefined
    ? DEFAULT_TIMEOUT_MS
    : parseOptionalTimeout(options.timeoutMs);
  let assembly = options.assembly || assembleShintaiTeam(taskText, roster, options.availableHealth || {});
  const initialDialogRail = evaluateDialogRails({
    task: taskText,
    tier: assembly.tier,
    members: assembly.members,
  }, { maxMembers: assembly.targetSize });
  const packetEvidence = memoryEvidence ? buildPacketEvidence(taskText, assembly, memoryEvidence) : null;
  const packetValidation = packetEvidence ? validatePacketEvidence(packetEvidence) : { ok: true, reasons: [] };
  const outputEvidenceContext = packetEvidence ? {
    requiredEvidenceIds: requiredEvidenceIdsForTask(taskText),
    evidenceSources: packetEvidence.evidenceSources,
  } : {};

  if (!packetValidation.ok) {
    const payload = {
      ok: false,
      task: taskText,
      timestamp: new Date().toISOString(),
      assembly,
      proposals: [],
      critiques: [],
      synthesis: '',
      evidenceGate: summarizeGate(controlPlane?.gate0),
      memoryEvidence,
      packetEvidence,
      packetValidation,
      error: `Shintai packet evidence validation failed: ${packetValidation.reasons.join('; ')}`,
      supersedes: options.supersedes || null,
      artifacts: null,
    };
    if (options.writeArtifact !== false) payload.artifacts = writeAdvisoryArtifact(payload);
    return payload;
  }

  if (options.healthCheck !== false && !options.availableHealth) {
    say(`${C.bronze}${C.bold}`, '\n── Shintai health preflight ──', stream);
    const health = runHealthPreflight(assembly, resolveMemberTimeout(null, 'health', timeoutMs));
    assembly = assembleShintaiTeam(taskText, roster, health);
    const healthDialogRail = evaluateDialogRails({
      task: taskText,
      tier: assembly.tier,
      members: assembly.members,
    }, { maxMembers: assembly.targetSize });
    if (!healthDialogRail.ok) {
      const payload = {
        ok: false,
        task: taskText,
        timestamp: new Date().toISOString(),
        assembly,
        proposals: [],
        critiques: [],
        synthesis: '',
        evidenceGate: summarizeGate(controlPlane?.gate0),
        memoryEvidence,
        packetEvidence,
        packetValidation,
        error: `dialog rail failed after health preflight: ${healthDialogRail.reasons.join('; ')}`,
        supersedes: options.supersedes || null,
        artifacts: null,
      };
      if (options.writeArtifact !== false) payload.artifacts = writeAdvisoryArtifact(payload);
      return payload;
    }
    for (const member of assembly.members) {
      const h = health[member.id];
      say(h?.ok ? C.good : C.warn, `  ${h?.ok ? '✓' : '⚠'} ${member.displayName} · ${member.lane}`, stream);
    }
    for (const skipped of assembly.skipped) {
      say(C.warn, `  ⚠ skipped ${skipped.member.displayName} · ${skipped.member.lane}`, stream);
    }
  }

  if (!initialDialogRail.ok) {
    const payload = {
      ok: false,
      task: taskText,
      timestamp: new Date().toISOString(),
      assembly,
      proposals: [],
      critiques: [],
      synthesis: '',
      evidenceGate: summarizeGate(controlPlane?.gate0),
      memoryEvidence,
      packetEvidence,
      packetValidation,
      error: `dialog rail failed: ${initialDialogRail.reasons.join('; ')}`,
      supersedes: options.supersedes || null,
      artifacts: null,
    };
    if (options.writeArtifact !== false) payload.artifacts = writeAdvisoryArtifact(payload);
    return payload;
  }

  if (!assembly.ok) {
    const payload = {
      ok: false,
      task: taskText,
      timestamp: new Date().toISOString(),
      assembly,
      proposals: [],
      critiques: [],
      synthesis: '',
      evidenceGate: summarizeGate(controlPlane?.gate0),
      memoryEvidence,
      packetEvidence,
      packetValidation,
      error: assembly.tier === 'critical' && assembly.members.length < MIN_CRITICAL_COUNCIL_SIZE
        ? `CRITICAL_COUNCIL_DEGRADED: ${assembly.members.length} healthy members < ${MIN_CRITICAL_COUNCIL_SIZE}`
        : 'no healthy Shintai members selected',
      supersedes: options.supersedes || null,
      artifacts: null,
    };
    if (options.writeArtifact !== false) payload.artifacts = writeAdvisoryArtifact(payload);
    return payload;
  }

  say(`${C.bronze}${C.bold}`, '\n── Shintai advisory: fan-out ──', stream);
  const sourcePaths = options.sourcePaths || controlPlane?.gate0?.loaded?.map((entry) => path.relative(REPO_ROOT, entry.absPath)) || SOURCE_PATHS;
  const proposals = assembly.members.map((member) => {
    say(C.dim, `  ${member.displayName} · ${member.lane}`, stream);
    const result = callMember(member, buildMemberPrompt(taskText, member, {
      health: member.health,
      sourcePaths,
      controlPlaneBlock,
      neuroRail,
    }), timeoutMs, outputEvidenceContext);
    say(result.ok ? C.good : C.warn, `  ${result.ok ? '✓' : '⚠'} ${member.displayName}`, stream);
    return {
      id: member.id,
      displayName: member.displayName,
      lane: member.lane,
      output: result.stdout || result.stderr || result.error || '',
      result,
    };
  });

  say(`${C.bronze}${C.bold}`, '\n── Shintai advisory: critique ──', stream);
  const critiques = assembly.members.map((member) => {
    const peers = proposals
      .filter((entry) => entry.id !== member.id)
      .map((entry) => ({ label: `${entry.displayName} (${entry.id})`, output: entry.output }));
    const result = callMember(
      member,
      critiquePrompt(taskText, member, peers),
      resolveMemberTimeout(member, 'critique', timeoutMs),
      outputEvidenceContext,
    );
    say(result.ok ? C.good : C.warn, `  ${result.ok ? '✓' : '⚠'} critique ${member.displayName}`, stream);
    return {
      id: member.id,
      displayName: member.displayName,
      lane: member.lane,
      output: result.stdout || result.stderr || result.error || '',
      result,
    };
  });

  say(`${C.bronze}${C.bold}`, '\n── Shintai advisory: synthesis ──', stream);
  const synthMember = assembly.members.find((member) => member.id === 'deepseek') || assembly.members[0];
  const synthesisResult = callMember(
    synthMember,
    synthesisPrompt(taskText, proposals, critiques, assembly, { controlPlaneBlock }),
    timeoutMs,
    outputEvidenceContext,
  );
  const synthesis = synthesisResult.stdout || synthesisResult.stderr || synthesisResult.error || '';
  const postDispatchPacketValidation = packetEvidence
    ? validatePacketEvidence(packetEvidence)
    : { ok: true, reasons: [], checkedAt: new Date().toISOString(), sourceCount: 0 };
  const auditFailures = postDispatchPacketValidation.ok
    ? []
    : [{
        code: 'evidence_modified_during_council',
        reasons: postDispatchPacketValidation.reasons,
        checkedAt: postDispatchPacketValidation.checkedAt,
      }];
  if (auditFailures.length) {
    say(C.warn, `  ⚠ post-dispatch evidence audit failed: ${postDispatchPacketValidation.reasons.join('; ')}`, stream);
  }

  const payload = {
    ok: proposals.some((entry) => entry.result.ok) && Boolean(synthesis),
    task: taskText,
    timestamp: new Date().toISOString(),
    assembly,
    proposals,
    critiques,
    synthesis,
    evidenceGate: summarizeGate(controlPlane?.gate0),
    neuroRail,
    memoryEvidence,
    packetEvidence,
    packetValidation,
    postDispatchPacketValidation,
    auditFailures,
    supersedes: options.supersedes || null,
    artifacts: null,
  };

  if (options.writeArtifact !== false) {
    payload.artifacts = writeAdvisoryArtifact(payload);
  }

  return payload;
}

function summarizeGate(gate0) {
  if (!gate0) return null;
  return {
    gate: gate0.gate,
    ok: gate0.ok,
    timestamp: gate0.timestamp,
    loadedIds: gate0.loaded.map((entry) => entry.id),
    hashes: Object.fromEntries(gate0.loaded.map((entry) => [entry.id, entry.sha256])),
    missingIds: gate0.missing.map((entry) => entry.id),
    blockedIds: gate0.blocked.map((entry) => entry.id),
    warnings: gate0.warnings.map((entry) => entry.id),
  };
}

function buildPacketEvidence(task, assembly, memoryEvidence) {
  return {
    task,
    tier: assembly?.tier || 'unknown',
    memberIds: assembly?.selectedIds || [],
    evidenceSources: memoryEvidence.sources.map((entry) => ({
      id: entry.id,
      path: entry.path,
      type: entry.type,
      sha256: entry.sha256,
    })),
    hashes: memoryEvidence.hashes,
    loadedTemplates: memoryEvidence.loadedTemplates,
    protectedSurfaceExclusions: memoryEvidence.protectedSurfaceExclusions,
  };
}

export async function run(taskSummary, options = {}) {
  const result = await runAdvisory(taskSummary, options);
  if (!result.ok) {
    say(C.bad, `Shintai advisory failed: ${result.error || 'unknown error'}`);
    if (result.assembly) process.stdout.write(`${JSON.stringify(result.assembly, null, 2)}\n`);
    return result;
  }
  process.stdout.write(`\n${C.cream}${result.synthesis}${C.reset}\n`);
  if (result.artifacts?.markdown) say(C.dim, `advisory saved -> ${result.artifacts.markdown}`);
  return result;
}

if (process.argv[2] === 'run') {
  const task = process.argv.slice(3).join(' ');
  run(task).then((result) => {
    process.exit(result.ok ? 0 : 1);
  }).catch((err) => {
    process.stderr.write(`fatal: ${err.message}\n`);
    process.exit(1);
  });
}
