#!/usr/bin/env node
/**
 * Canonical lane kernel for YURI OS orchestration.
 *
 * This file is intentionally data-heavy: offload, Shintai, Rick, worker health,
 * and future control-plane code should consume this surface instead of each
 * inventing lane truth.
 */

import path from 'node:path';

const CLAUDE_DIR = '.claude';
const CLAUDE_STATE = [CLAUDE_DIR, 'state'].join('/');
const CLAUDE_HISTORY = [CLAUDE_DIR, 'history'].join('/');
const BACKEND_DATA = ['backend', 'data'].join('/');
const NODE_MODULES = ['node', 'modules'].join('_');
const AMP_DIR = ['.', 'amp'].join('');
const ENV_FILE = ['.', 'env'].join('');

export const PROTECTED_SURFACE_LABELS = Object.freeze([
  `${BACKEND_DATA}/`,
  `${CLAUDE_STATE}/`,
  `${CLAUDE_HISTORY}/`,
  ENV_FILE,
  `${NODE_MODULES}/`,
  `${AMP_DIR}/`,
]);

export const ACTIVE_NIM_LANES = Object.freeze([
  'nvidia-llama-70b',
  'nvidia-qwen',
  'nvidia-mistral-medium',
  'nvidia-mistral-large',
  'nvidia-nemotron-120b',
  'nvidia-nemotron-nano-30b',
  'nvidia-dracarys',
  'nvidia-minimax-m27',
  'nvidia-gpt-oss-120b',
  'nvidia-ising',
  'nvidia-gemma',
  'nvidia-kimi',
  'nvidia-qwen-coder',
  'nvidia-qwen-397b',
  'nvidia-qwen3-next',
  'nvidia-vision',
]);

export const DEAD_NIM_LANES = Object.freeze([
  'nvidia-nemotron',
  'nvidia-phi',
  'nvidia-llama-405b',
  'nvidia-embed',
]);

export const NEMO_STYLE_RAILS = Object.freeze({
  input: ['slash-command-parse', 'lane-mention-parse', 'shell-block-detect', 'noexec-toggle'],
  retrieval: ['memory-recall-before-dispatch', 'browser-harness-dom-first', 'protected-surface-exclusion'],
  dialog: ['task-tier-classification', 'codex-owned-shintai-assembly', 'deepseek-gate-1-synthesis'],
  execution: ['health-preflight', 'tool-policy-enforcement', 'timeout-caps', 'no-auto-commit-or-push'],
  output: ['role-prefixes', 'ansi-safe-streaming', 'output-caps', 'evidence-required-for-repo-claims'],
});

export const SHINTAI_SUPERAUDIT_MEMBER_IDS = Object.freeze([
  'codex',
  'deepseek',
  'claude-opus-audit',
  'nemotron',
  'mistral-large',
  'qwen-coder',
  'minimax-m27',
  'qwen3-next',
  'mistral-medium',
]);

export const SHINTAI_MEMORY_RAG_MEMBER_IDS = Object.freeze([
  'codex',
  'deepseek',
  'claude-opus-audit',
  'nemotron',
  'qwen-397b',
  'mistral-large',
  'gpt-oss-120b',
  'minimax-m27',
  'qwen-coder',
]);

export const SHINTAI_REQUIRED_MEMBER_IDS = Object.freeze(['codex', 'deepseek']);

const BASE_FORBIDDEN_TOOLS = Object.freeze({
  edit: false,
  commit: false,
  push: false,
  protectedReads: false,
  protectedWrites: false,
});

const FULL_ADVISORY_TOOLS = Object.freeze({
  ...BASE_FORBIDDEN_TOOLS,
  read: true,
  search: true,
  browser: true,
  gitnexus: true,
  shell: true,
  edit: true,
});

export const LANE_KERNEL = Object.freeze({
  codex: {
    id: 'codex',
    lane: 'gpt-5.5',
    model: 'gpt-5.5',
    provider: 'openai',
    role: 'main-orchestrator',
    reasoning: 'xhigh',
    contextTier: 'extended',
    dispatchMode: 'main-session',
    dispatchArgs: ['offload', '--model', 'gpt-5.5', '--reasoning', 'xhigh'],
    assignment: 'Codex/main assembles Shintai, owns implementation, resolves contradictions, and keeps final authority.',
    tools: { read: true, search: true, browser: true, gitnexus: true, shell: true, edit: true, commit: false, push: false, protectedReads: false, protectedWrites: false },
  },
  deepseek: {
    id: 'deepseek',
    lane: 'deepseek-v4-pro:max-reasoning',
    model: 'deepseek-v4-pro',
    provider: 'deepseek',
    role: 'gate-1-synthesizer',
    reasoning: 'xhigh',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'deepseek-v4-pro:max-reasoning'],
    assignment: 'First synthesis gate: decide model duties, tool policy, contradictions, and dispatch order before broad fan-out.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: true, search: true, browser: false, gitnexus: false, shell: false },
  },
  'claude-opus-audit': {
    id: 'claude-opus-audit',
    lane: 'claude-opus-4-7-audit',
    model: 'claude-opus-4-7',
    provider: 'anthropic',
    role: 'million-context-auditor',
    reasoning: 'high',
    contextTier: 'million',
    wakeModel: 'claude-haiku-4-5',
    dispatchArgs: ['@claude-opus-audit'],
    assignment: 'Wake Claude with Haiku, switch to Opus 4.7 high reasoning, audit and synthesize only; no edits or policy authority.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: true, search: true, browser: false, gitnexus: false, shell: false },
  },
  nemotron: {
    id: 'nemotron',
    lane: 'nvidia-nemotron-120b',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    provider: 'nvidia',
    role: 'long-horizon-orchestrator',
    reasoning: 'high',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-nemotron-120b'],
    assignment: 'Long-horizon control-plane architecture and NeMo-style rail mapping.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'nemotron-nano-30b': {
    id: 'nemotron-nano-30b',
    lane: 'nvidia-nemotron-nano-30b',
    model: 'nvidia/nemotron-3-nano-30b-a3b',
    provider: 'nvidia',
    role: 'fast-reasoning-orchestrator',
    reasoning: 'medium',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-nemotron-nano-30b'],
    assignment: 'Fast Nemotron reasoning lane for triage, contradiction checks, and lightweight guardrail audits.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'mistral-large': {
    id: 'mistral-large',
    lane: 'nvidia-mistral-large',
    model: 'mistralai/mistral-large-3-675b-instruct-2512',
    provider: 'nvidia',
    role: 'frontier-reasoning-reviewer',
    reasoning: 'high',
    contextTier: 'huge',
    dispatchArgs: ['offload', '--model', 'nvidia-mistral-large'],
    assignment: 'Stress-test the full merge architecture, large-context contradictions, and failure modes.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'mistral-medium': {
    id: 'mistral-medium',
    lane: 'nvidia-mistral-medium',
    model: 'mistralai/mistral-medium-3.5-128b',
    provider: 'nvidia',
    role: 'system-audit-reviewer',
    reasoning: 'medium',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-mistral-medium'],
    assignment: 'Review routing simplification, fallback policy, and operational clarity.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'qwen-coder': {
    id: 'qwen-coder',
    lane: 'nvidia-qwen-coder',
    model: 'qwen/qwen3-coder-480b-a35b-instruct',
    provider: 'nvidia',
    role: 'code-refactor-specialist',
    reasoning: 'high',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen-coder'],
    assignment: 'Design the minimal refactor path and regression tests for the lane kernel merge.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'qwen-397b': {
    id: 'qwen-397b',
    lane: 'nvidia-qwen-397b',
    model: 'qwen/qwen3.5-397b-a17b',
    provider: 'nvidia',
    role: 'large-reasoning-generalist',
    reasoning: 'high',
    contextTier: 'huge',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen-397b'],
    assignment: 'Large Qwen reasoning lane for broad architecture review, synthesis pressure, and code-adjacent audit.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'gpt-oss-120b': {
    id: 'gpt-oss-120b',
    lane: 'nvidia-gpt-oss-120b',
    model: 'openai/gpt-oss-120b',
    provider: 'nvidia',
    role: 'deep-generalist',
    reasoning: 'high',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-gpt-oss-120b'],
    assignment: 'Adversarial large-model reviewer for memory/RAG simplification, skill recall drift, and overcoupled system plans.',
    tools: FULL_ADVISORY_TOOLS,
  },
  glm: {
    id: 'glm',
    lane: 'nvidia-glm',
    model: 'z-ai/glm-5.1',
    provider: 'nvidia',
    role: 'long-document-memory-auditor',
    reasoning: 'medium',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-glm'],
    assignment: 'Explicit-only legacy long-document lane. Do not use in default Shintai council until reliability is reprobed.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'minimax-m27': {
    id: 'minimax-m27',
    lane: 'nvidia-minimax-m27',
    model: 'minimaxai/minimax-m2.7',
    provider: 'nvidia',
    role: 'long-context-replacement-auditor',
    reasoning: 'high',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-minimax-m27'],
    assignment: 'Replace unreliable GLM in Shintai long-document and memory/RAG audits; challenge naming drift, docs consistency, and evidence contracts.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'qwen3-next': {
    id: 'qwen3-next',
    lane: 'nvidia-qwen3-next',
    model: 'qwen/qwen3-next-80b-a3b-instruct',
    provider: 'nvidia',
    role: 'state-machine-specialist',
    reasoning: 'high',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen3-next'],
    assignment: 'Renderer, PTY, stream batching, resize, and terminal-state regression design.',
    tools: FULL_ADVISORY_TOOLS,
  },
  'nvidia-ising': {
    id: 'nvidia-ising',
    lane: 'nvidia-ising',
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    provider: 'nvidia',
    role: 'fast-classifier',
    reasoning: 'low',
    contextTier: 'small',
    dispatchArgs: ['offload', '--model', 'nvidia-ising'],
    assignment: 'Fast routing and health triage only.',
    tools: FULL_ADVISORY_TOOLS,
  },
});

export function normalizePathForPolicy(candidate) {
  return String(candidate || '').replaceAll('\\', '/');
}

export function isProtectedPath(candidate) {
  const normalized = normalizePathForPolicy(candidate);
  if (!normalized) return false;
  const withSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
  return (
    withSlash.includes(`${BACKEND_DATA}/`) ||
    withSlash.includes(`${CLAUDE_STATE}/`) ||
    withSlash.includes(`${CLAUDE_HISTORY}/`) ||
    withSlash.includes(`${NODE_MODULES}/`) ||
    withSlash.includes(`${AMP_DIR}/`) ||
    path.basename(normalized) === ENV_FILE
  );
}

export function safeRuntimePath(envName, fallbackPath) {
  const requested = process.env[envName] || fallbackPath;
  const resolved = path.resolve(requested);
  if (isProtectedPath(resolved)) return '';
  return resolved;
}

export function getLaneKernelEntry(id) {
  return LANE_KERNEL[String(id || '').replace(/^@/, '')] || null;
}

export function selectSuperauditMemberIds(rosterMembers = {}) {
  const available = new Set(Object.keys(rosterMembers));
  return SHINTAI_SUPERAUDIT_MEMBER_IDS.filter((id) => available.has(id) || LANE_KERNEL[id]);
}

export function selectMemoryRagMemberIds(rosterMembers = {}) {
  const available = new Set(Object.keys(rosterMembers));
  return SHINTAI_MEMORY_RAG_MEMBER_IDS.filter((id) => available.has(id) || LANE_KERNEL[id]);
}

export function buildSuperauditDeployment() {
  const members = SHINTAI_SUPERAUDIT_MEMBER_IDS
    .map((id) => getLaneKernelEntry(id))
    .filter(Boolean);
  return {
    id: 'yuri-symbiotic-lane-kernel-superaudit',
    authority: {
      orchestrator: 'codex-main',
      finalDecision: 'codex-main',
      advisoryOnly: members.filter((member) => member.id !== 'codex').map((member) => member.id),
    },
    rails: NEMO_STYLE_RAILS,
    activeNimLanes: ACTIVE_NIM_LANES,
    deadNimLanes: DEAD_NIM_LANES,
    sequence: [
      'safe-telemetry-preflight',
      'deepseek-gate-1-synthesis',
      'codex-updates-deployment-packet',
      'claude-haiku-wake',
      'claude-opus-audit',
      'parallel-nim-shintai-fanout',
      'codex-synthesis-and-local-verification',
    ],
    members,
  };
}
