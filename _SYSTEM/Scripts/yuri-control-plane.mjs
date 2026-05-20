#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_NIM_LANES,
  DEAD_NIM_LANES,
  LANE_KERNEL,
  NEMO_STYLE_RAILS,
  PROTECTED_SURFACE_LABELS,
  buildSuperauditDeployment,
} from './lane-kernel.mjs';
import { evaluateInputRails, evaluateRetrievalRails } from './rails.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const CONTROL_PLANE_GATE_SEQUENCE = Object.freeze([
  'gate0-evidence',
  'gate1-classify-and-assemble',
  'gate2-health-preflight',
  'gate3-fanout',
  'gate4-critique',
  'gate5-synthesis',
  'gate6-codex-arbitration',
]);

const LEGACY_CLAUDE_PROJECT_MEMORY_DIR = path.join(
  REPO_ROOT,
  '.claude',
  'projects',
  '-Users-marcelspatz-YURI-OS-MUSUBI',
  'memory',
);

export const CORE_EVIDENCE_FILES = Object.freeze([
  { id: 'shintai-roster', path: '_SYSTEM/kagami/shintai-team.json', required: true, type: 'json' },
  { id: 'lane-kernel', path: '_SYSTEM/Scripts/lane-kernel.mjs', required: true, type: 'source' },
  { id: 'offload-contract', path: '_SYSTEM/Scripts/offload-contract.mjs', required: true, type: 'source' },
  { id: 'goal', path: '_SYSTEM/docs/YURI_OS_FORENSIC_SUPERCHARGE_GOAL_2026-05-20.md', required: true, type: 'doc' },
  { id: 'nemo-matrix', path: '_SYSTEM/docs/YURI_OS_NEMO_GUARDRAIL_MATRIX_2026-05-20.md', required: true, type: 'doc' },
  { id: 'patch-waves', path: '_SYSTEM/docs/YURI_OS_SUPERCHARGE_PATCH_WAVES_2026-05-20.md', required: true, type: 'doc' },
]);

export const OPTIONAL_MEMORY_FILES = Object.freeze([
  { id: 'yuri-memory', path: '_SYSTEM/memory/MEMORY.md', type: 'memory' },
  { id: 'codex-primary-partner', path: '_SYSTEM/memory/feedback_codex_primary_partner.md', type: 'memory' },
  { id: 'deepseek-tool-unblock', path: '_SYSTEM/memory/feedback_deepseek_tool_unblock.md', type: 'memory' },
  { id: 'legacy-shintai-team-sizing', path: path.relative(REPO_ROOT, path.join(LEGACY_CLAUDE_PROJECT_MEMORY_DIR, 'feedback_shintai_team_sizing.md')), type: 'legacy-memory' },
  { id: 'legacy-shintai-main-thread-role', path: path.relative(REPO_ROOT, path.join(LEGACY_CLAUDE_PROJECT_MEMORY_DIR, 'feedback_shintai_main_thread_role.md')), type: 'legacy-memory' },
  { id: 'legacy-rick-persona-dispatch', path: path.relative(REPO_ROOT, path.join(LEGACY_CLAUDE_PROJECT_MEMORY_DIR, 'feedback_rick_persona_every_dispatch.md')), type: 'legacy-memory' },
  { id: 'extraction-sprint-skill', path: '.claude/skills/extraction-sprint/SKILL.md', type: 'template' },
  { id: 'luminous-fountain-plan', path: '.claude/plans/shintai-has-to-fix-luminous-fountain.md', type: 'template' },
]);

export function loadEvidenceGate(task = '', options = {}) {
  const maxBytes = Number(options.maxBytes || 200_000);
  const coreFiles = options.coreFiles || CORE_EVIDENCE_FILES;
  const optionalFiles = options.optionalFiles || OPTIONAL_MEMORY_FILES;
  const inputRail = evaluateInputRails(task, options.inputContext || {});
  const loaded = [];
  const missing = [];
  const blocked = [];
  const warnings = [];

  for (const source of [...coreFiles, ...optionalFiles]) {
    const absPath = path.resolve(REPO_ROOT, source.path);
    const retrieval = evaluateRetrievalRails({ path: absPath, source: source.id });
    if (!retrieval.ok) {
      blocked.push({ ...source, absPath, rail: retrieval });
      continue;
    }
    if (!existsSync(absPath)) {
      const entry = { ...source, absPath };
      if (source.required) missing.push(entry);
      else warnings.push({ ...entry, warning: 'optional evidence missing' });
      continue;
    }
    const content = readFileSync(absPath, 'utf8');
    loaded.push({
      ...source,
      absPath,
      bytes: Buffer.byteLength(content),
      sha256: hashText(content),
      excerpt: summarizeEvidenceContent(content, source),
      truncated: content.length > maxBytes,
    });
  }

  const constraints = buildConstraints({ task, loaded });
  const ok = inputRail.ok && missing.length === 0 && blocked.length === 0;

  return {
    ok,
    gate: 'gate0-evidence',
    task: String(task || ''),
    timestamp: new Date().toISOString(),
    inputRail,
    loaded,
    missing,
    blocked,
    warnings,
    constraints,
    gateSequence: CONTROL_PLANE_GATE_SEQUENCE,
  };
}

export function preflightControlPlane(task = '', options = {}) {
  const gate0 = loadEvidenceGate(task, options);
  return {
    ok: gate0.ok,
    gate0,
    constraints: gate0.constraints,
    violations: [
      ...(gate0.inputRail.ok ? [] : [gate0.inputRail]),
      ...gate0.blocked.map((entry) => entry.rail),
    ],
  };
}

export function buildConstraintBlock(gateOrPreflight) {
  const gate = gateOrPreflight?.gate0 || gateOrPreflight;
  const constraints = gate?.constraints || buildConstraints({ task: gate?.task || '', loaded: gate?.loaded || [] });
  const loadedIds = (gate?.loaded || []).map((entry) => `${entry.id}:${entry.sha256}`).join(', ');
  const missingOptional = (gate?.warnings || []).map((entry) => entry.id).join(', ');
  return [
    '[YURI CONTROL PLANE GATE 0]',
    `gate_ok=${Boolean(gate?.ok)}`,
    `task_tier_hint=${constraints.taskTierHint}`,
    `loaded_evidence=${loadedIds || 'none'}`,
    missingOptional ? `optional_missing=${missingOptional}` : '',
    `active_nim=${constraints.activeNimLanes.join(', ')}`,
    `dead_nim=${constraints.deadNimLanes.join(', ')}`,
    `rails=${Object.entries(constraints.rails).map(([kind, items]) => `${kind}:${items.join('|')}`).join('; ')}`,
    `protected_surfaces=${constraints.protectedSurfaces.join(', ')}`,
    'authority=Codex/main assembles, arbitrates, verifies, and commits; Shintai lanes advise only.',
    'forbidden=no protected reads/writes, no commit/push by lanes, no hardcoded Spark fallback, no DeepSeek CLI --tools forcing.',
    'memory=YURI-owned memory contracts first; Claude project memory is importable context only, never ownership.',
    'evidence_excerpts:',
    ...(gate?.loaded || []).map((entry) => `- ${entry.id}: ${entry.excerpt}`),
  ].filter(Boolean).join('\n');
}

export function buildConstraints({ task = '', loaded = [] } = {}) {
  const deployment = buildSuperauditDeployment();
  return {
    taskTierHint: classifyTaskTierHint(task),
    rails: NEMO_STYLE_RAILS,
    activeNimLanes: [...ACTIVE_NIM_LANES],
    deadNimLanes: [...DEAD_NIM_LANES],
    protectedSurfaces: [...PROTECTED_SURFACE_LABELS, '.amp/'],
    laneKernelIds: Object.keys(LANE_KERNEL),
    superauditMemberIds: deployment.members.map((member) => member.id),
    evidenceIds: loaded.map((entry) => entry.id),
    requiredCoreIds: CORE_EVIDENCE_FILES.map((entry) => entry.id),
    gateSequence: CONTROL_PLANE_GATE_SEQUENCE,
  };
}

export function classifyTaskTierHint(task = '') {
  const text = String(task || '').toLowerCase();
  if (/(critical|supercharge|forensic|control plane|shintai|guardrail|production|release|harness|automation|memory|backend)/.test(text)) {
    return 'critical';
  }
  if (/(refactor|architecture|audit|multi-file|lane|offload|browser-harness)/.test(text)) return 'complex';
  if (text.trim().length > 120) return 'standard';
  return 'standard';
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function summarizeEvidenceContent(content, source) {
  const text = String(content || '');
  if (source.type === 'json') {
    try {
      const parsed = JSON.parse(text);
      const top = Object.keys(parsed).slice(0, 10).join(', ');
      const members = parsed.members ? Object.keys(parsed.members).slice(0, 14).join(', ') : '';
      return trimExcerpt(`json keys: ${top}${members ? `; members: ${members}` : ''}`);
    } catch {
      return trimExcerpt(text);
    }
  }
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#{1,4}\s+/.test(line) || /^-\s+/.test(line) || /^export\s+/.test(line) || /^const\s+[A-Z0-9_]+\s*=/.test(line))
    .slice(0, 12);
  return trimExcerpt(lines.join(' | ') || text);
}

function trimExcerpt(value, max = 1400) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'gate0' || cmd === 'preflight') {
    const task = rest.filter((arg) => arg !== '--json').join(' ');
    const result = cmd === 'preflight' ? preflightControlPlane(task) : loadEvidenceGate(task);
    printJson(result);
    process.exit(result.ok ? 0 : 1);
  }
  process.stdout.write('Usage: node _SYSTEM/Scripts/yuri-control-plane.mjs gate0 <task>\n');
}
