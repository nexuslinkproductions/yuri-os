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
const ENV_FILE = ['.', 'env'].join('');

export const PROTECTED_SURFACE_LABELS = Object.freeze([
  `${BACKEND_DATA}/`,
  `${CLAUDE_STATE}/`,
  `${CLAUDE_HISTORY}/`,
  ENV_FILE,
  `${NODE_MODULES}/`,
]);

export const ACTIVE_NIM_LANES = Object.freeze([
  'nvidia-llama-70b',
  'nvidia-qwen',
  'nvidia-mistral-medium',
  'nvidia-mistral-large',
  'nvidia-nemotron-120b',
  'nvidia-dracarys',
  'nvidia-glm',
  'nvidia-ising',
  'nvidia-gemma',
  'nvidia-qwen-coder',
  'nvidia-qwen3-next',
  'nvidia-vision',
]);

export const DEAD_NIM_LANES = Object.freeze([
  'nvidia-nemotron',
  'nvidia-phi',
  'nvidia-llama-405b',
  'nvidia-embed',
  'nvidia-gpt-oss-120b',
  'nvidia-kimi',
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
  'glm',
  'qwen3-next',
  'mistral-medium',
]);

export const SHINTAI_REQUIRED_MEMBER_IDS = Object.freeze(['deepseek']);

const BASE_FORBIDDEN_TOOLS = Object.freeze({
  edit: false,
  commit: false,
  push: false,
  protectedReads: false,
  protectedWrites: false,
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
    dispatchArgs: ['offload', '--model', 'nvidia-nemotron-120b', '--no-tools'],
    assignment: 'Long-horizon control-plane architecture and NeMo-style rail mapping.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: false, search: false, browser: false, gitnexus: false, shell: false },
  },
  'mistral-large': {
    id: 'mistral-large',
    lane: 'nvidia-mistral-large',
    model: 'mistralai/mistral-large-3-675b-instruct-2512',
    provider: 'nvidia',
    role: 'frontier-reasoning-reviewer',
    reasoning: 'high',
    contextTier: 'huge',
    dispatchArgs: ['offload', '--model', 'nvidia-mistral-large', '--no-tools'],
    assignment: 'Stress-test the full merge architecture, large-context contradictions, and failure modes.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: false, search: false, browser: false, gitnexus: false, shell: false },
  },
  'mistral-medium': {
    id: 'mistral-medium',
    lane: 'nvidia-mistral-medium',
    model: 'mistralai/mistral-medium-3.5-128b',
    provider: 'nvidia',
    role: 'system-audit-reviewer',
    reasoning: 'medium',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-mistral-medium', '--no-tools'],
    assignment: 'Review routing simplification, fallback policy, and operational clarity.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: false, search: false, browser: false, gitnexus: false, shell: false },
  },
  'qwen-coder': {
    id: 'qwen-coder',
    lane: 'nvidia-qwen-coder',
    model: 'qwen/qwen3-coder-480b-a35b-instruct',
    provider: 'nvidia',
    role: 'code-refactor-specialist',
    reasoning: 'high',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen-coder', '--no-tools'],
    assignment: 'Design the minimal refactor path and regression tests for the lane kernel merge.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: false, search: false, browser: false, gitnexus: false, shell: false },
  },
  glm: {
    id: 'glm',
    lane: 'nvidia-glm',
    model: 'z-ai/glm-5.1',
    provider: 'nvidia',
    role: 'long-document-memory-auditor',
    reasoning: 'medium',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-glm', '--no-tools'],
    assignment: 'Audit long-document memory, stale aliases, naming drift, and docs consistency.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: false, search: false, browser: false, gitnexus: false, shell: false },
  },
  'qwen3-next': {
    id: 'qwen3-next',
    lane: 'nvidia-qwen3-next',
    model: 'qwen/qwen3-next-80b-a3b-instruct',
    provider: 'nvidia',
    role: 'state-machine-specialist',
    reasoning: 'high',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'nvidia-qwen3-next', '--no-tools'],
    assignment: 'Renderer, PTY, stream batching, resize, and terminal-state regression design.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: false, search: false, browser: false, gitnexus: false, shell: false },
  },
  'nvidia-ising': {
    id: 'nvidia-ising',
    lane: 'nvidia-ising',
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    provider: 'nvidia',
    role: 'fast-classifier',
    reasoning: 'low',
    contextTier: 'small',
    dispatchArgs: ['offload', '--model', 'nvidia-ising', '--no-tools'],
    assignment: 'Fast routing and health triage only.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: false, search: false, browser: false, gitnexus: false, shell: false },
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
