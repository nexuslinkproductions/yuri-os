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
const CLAUDE_CREDENTIALS = [CLAUDE_DIR, '.credentials.json'].join('/');
const CLAUDE_CREDENTIALS_ALT = [CLAUDE_DIR, 'credentials.json'].join('/');
const CLAUDE_FILE_HISTORY = [CLAUDE_DIR, 'file-history'].join('/');
const CLAUDE_STATE = [CLAUDE_DIR, 'state'].join('/');
const CLAUDE_HISTORY = [CLAUDE_DIR, 'history'].join('/');
const CLAUDE_HISTORY_JSONL = [CLAUDE_DIR, 'history.jsonl'].join('/');
const CLAUDE_LANE_SESSIONS = [CLAUDE_DIR, 'lane-sessions'].join('/');
const CLAUDE_PASTE_CACHE = [CLAUDE_DIR, 'paste-cache'].join('/');
const CLAUDE_PROJECTS = [CLAUDE_DIR, 'projects'].join('/');
const BACKEND_DATA = ['backend', 'data'].join('/');
const NODE_MODULES = ['node', 'modules'].join('_');
const NODE_MODULES_DIR = ['node', 'modules'].join('_');
const AMP_DIR = ['.', 'amp'].join('');
const ENV_FILE = ['.', 'env'].join('');

export const PROTECTED_SURFACE_PREFIXES = Object.freeze([
  `${BACKEND_DATA}/`,
  `${CLAUDE_CREDENTIALS}`,
  `${CLAUDE_CREDENTIALS_ALT}`,
  `${CLAUDE_FILE_HISTORY}/`,
  `${CLAUDE_STATE}/`,
  `${CLAUDE_HISTORY}/`,
  CLAUDE_HISTORY_JSONL,
  `${CLAUDE_LANE_SESSIONS}/`,
  `${CLAUDE_PASTE_CACHE}/`,
  `${CLAUDE_PROJECTS}/`,
  ENV_FILE,
  `${NODE_MODULES_DIR}/`,
  `${AMP_DIR}/`,
  '_SYSTEM/tools/browser-harness/',
  '_SYSTEM/tools/nemo-guardrails/',
  '_SYSTEM/tools/MSA/',
]);

export const PROTECTED_SURFACE_LABELS = PROTECTED_SURFACE_PREFIXES;

// Canonical role/credential/guard TRUST surface — semantically DISTINCT from
// PROTECTED_SURFACE_PREFIXES. PROTECTED_SURFACE_PREFIXES is a UNIVERSAL read/write
// block (data + secrets) enforced for everyone via isProtectedPath(). ROLE_TRUST_SURFACES
// is a COWORKER-ONLY mutation block: the role resolver, the credential hash, and every
// enforcement hook. The dev/owner role edits these freely (e.g. this guard-hardening work),
// so they MUST NOT be folded into PROTECTED_SURFACE_PREFIXES or the owner could never edit a
// hook again. Single-sourced here so bash-security-guard.js (PROTECTED_ROLE_PATHS) and
// operator-write-guard.js (PROTECTED_ROLE_FILES/DIRS) stop maintaining divergent copies.
// `files` = exact-path targets; `dirs` = directory prefixes (entry may not exist yet).
// This is the UNION (fail-closed): operator-write-guard's list was already the superset, so
// folding bash-security-guard onto it EXPANDS bash coverage from 4 -> the full surface.
export const ROLE_TRUST_SURFACES = Object.freeze({
  files: Object.freeze([
    // trust roots — role resolver + credential hash + this kernel itself.
    // lane-kernel.mjs DEFINES this surface, so it must be a member: otherwise a
    // coworker could rm/rewrite the kernel to shrink the protected set out from
    // under both role guards. Self-protect the trust root.
    '_SYSTEM/Scripts/lane-kernel.mjs',
    '_SYSTEM/Scripts/yuri-operator.cjs',
    '_SYSTEM/SELF/dev-credential.json',
    // enforcement guards — every PreToolUse hook whose job is enforcement, so a coworker
    // cannot Edit/Bash-mutate one guard to neuter it. Includes the guards themselves.
    '.claude/hooks/bash-security-guard.js',
    '.claude/hooks/operator-write-guard.js',
    '.claude/hooks/claude-protocol-guard.js',
    '.claude/hooks/claude-protocol-guard.mjs',
    '.claude/hooks/agent-spawn-guard.js',
    '.claude/hooks/pre-tool-gate.js',
    '.claude/hooks/musubi-protocol-enforce.js',
    '.claude/hooks/tirith-url-guard.js',
  ]),
  dirs: Object.freeze([
    '.claude/hooks/operator-guard',
  ]),
});

// Canonical control-file surfaces — distinct from PROTECTED_SURFACE_PREFIXES (which are
// read/write BLOCK surfaces like backend/data and secrets). These are core governance files
// that may be edited, but a direct mutation should carry a control packet. Single-sourced here
// so the ESM protocol-guard hook and any future consumer share one list instead of drifting.
export const CONTROL_FILE_PREFIXES = Object.freeze([
  '.claude/hooks/',
  '.claude/settings.json',
  'SOUL.md',
  'AGENTS.md',
  'CODEX_PROTOCOL.md',
  'CLAUDE.md',
  '_SYSTEM/Scripts/pulse-orchestrator',
  '_SYSTEM/Scripts/offload-contract',
  '_SYSTEM/Scripts/lane-kernel',
  '_SYSTEM/Scripts/neuron-loop',
]);

export const ACTIVE_NIM_LANES = Object.freeze([
  'nemotron-3-ultra-550b-a55b',
  'kimi-k2.6',
]);

export const DEAD_NIM_LANES = Object.freeze([
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
  'kimi',
]);

export const SHINTAI_MEMORY_RAG_MEMBER_IDS = Object.freeze([
  'codex',
  'deepseek',
  'claude-opus-audit',
  'nemotron',
  'kimi',
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
    lane: 'deepseek-v4-pro',
    model: 'deepseek-v4-pro',
    provider: 'deepseek',
    role: 'gate-1-synthesizer',
    reasoning: 'xhigh',
    contextTier: 'large',
    dispatchArgs: ['offload', '--model', 'deepseek-v4-pro'],
    assignment: 'First synthesis gate via direct DeepSeek V4 Pro: decide model duties, tool policy, contradictions, and dispatch order before broad fan-out. NVIDIA DeepSeek fallback is retired.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: true, search: true, browser: false, gitnexus: false, shell: false },
  },
  'claude-opus-audit': {
    id: 'claude-opus-audit',
    lane: 'claude-opus-4-7-comain',
    model: 'claude-opus-4-7',
    provider: 'anthropic',
    role: 'co-main-coding-architect',
    reasoning: 'max',
    contextTier: 'million',
    wakeModel: 'claude-haiku-4-5',
    dispatchArgs: ['@claude-opus-comain'],
    assignment: 'Wake Claude with Haiku, continue Opus 4.7 max-reasoning co-main session, draft or apply scoped code/tests/docs. Codex must independently verify every Opus change before trust.',
    tools: { ...BASE_FORBIDDEN_TOOLS, read: true, search: true, browser: false, gitnexus: false, shell: true, edit: true },
  },
  nemotron: {
    id: 'nemotron',
    lane: 'nemotron-3-ultra-550b-a55b',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    provider: 'nvidia',
    role: 'long-horizon-orchestrator',
    reasoning: 'xhigh',
    contextTier: 'million',
    dispatchArgs: ['offload', '--model', 'nemotron-3-ultra-550b-a55b'],
    assignment: 'Long-horizon control-plane architecture and NeMo-style rail mapping through Nemotron 3 Ultra.',
    tools: FULL_ADVISORY_TOOLS,
  },
  kimi: {
    id: 'kimi',
    lane: 'kimi-k2.6',
    model: 'moonshotai/kimi-k2.6',
    provider: 'nvidia',
    role: 'context-keeper',
    reasoning: 'xhigh',
    contextTier: 'million',
    dispatchArgs: ['offload', '--model', 'kimi-k2.6'],
    assignment: 'Long-context synthesis and continuity review through Kimi K2.6 on NVIDIA NIM.',
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
  // Derive enforcement from the single frozen source of truth so a path can never
  // be DECLARED protected (PROTECTED_SURFACE_PREFIXES) yet silently unguarded here.
  // Directory prefixes (trailing '/') match anywhere in the path (handles absolute
  // paths); file surfaces match the exact path or an absolute path ending in it.
  return PROTECTED_SURFACE_PREFIXES.some((prefix) => {
    if (prefix.endsWith('/')) {
      return withSlash.includes(prefix);
    }
    return normalized === prefix || normalized.endsWith(`/${prefix}`);
  });
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
      coMain: 'claude-opus-4-7-comain',
      finalDecision: 'codex-main-after-independent-verification',
      advisoryOnly: members.filter((member) => !['codex', 'claude-opus-audit'].includes(member.id)).map((member) => member.id),
      verification: 'Opus and Codex may both do heavy lifting, but each output must be independently checked against repo truth, rails, and tests before promotion.',
    },
    rails: NEMO_STYLE_RAILS,
    activeNimLanes: ACTIVE_NIM_LANES,
    deadNimLanes: DEAD_NIM_LANES,
    sequence: [
      'safe-telemetry-preflight',
      'deepseek-gate-1-synthesis',
      'codex-updates-deployment-packet',
      'claude-haiku-wake',
      'claude-opus-comain',
      'parallel-nim-shintai-fanout',
      'codex-synthesis-local-verification-and-opus-double-check',
    ],
    members,
  };
}
