#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requiredEvidenceIdsForTask } from './evidence-contract.mjs';
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
  { id: 'yuri-memory-index', path: '_SYSTEM/memory/MEMORY.md', type: 'memory' },
  { id: 'codex-primary-partner', path: '_SYSTEM/memory/feedback_codex_primary_partner.md', type: 'memory' },
  { id: 'deepseek-tool-unblock', path: '_SYSTEM/memory/feedback_deepseek_tool_unblock.md', type: 'memory' },
  { id: 'self-improvement-memory-rag-goal', path: '_SYSTEM/docs/YURI_OS_SELF_IMPROVEMENT_MEMORY_RAG_SHINTAI_GOAL_2026-05-21.md', type: 'doc' },
  { id: 'memory-rag-skill-research', path: '_SYSTEM/docs/YURI_MEMORY_RAG_SKILL_RESEARCH_2026-05-21.md', type: 'research' },
  { id: 'research-to-runtime-ledger', path: '_SYSTEM/docs/YURI_RESEARCH_TO_RUNTIME_LEDGER_2026-05-22.md', type: 'doc' },
  { id: 'protected-surfaces-plan', path: '_SYSTEM/docs/YURI_OS_PROTECTED_SURFACES_MIGRATION_PLAN_2026-05-21.md', type: 'doc' },
  { id: 'design-system-plan', path: '_SYSTEM/docs/YURI_DESIGN_SYSTEM_SUPERCHARGE_PLAN_2026-05-21.md', type: 'doc' },
  { id: 'soul-persona', path: 'SOUL.md', type: 'persona' },
  { id: 'neurodivergent-engine-handoff', path: '_SYSTEM/HANDOFF-musubi-intelligence-sprint-v2.md', type: 'neurodivergence' },
  { id: 'memory-kernel-source', path: '_SYSTEM/Scripts/memory-kernel.mjs', type: 'source' },
  { id: 'skill-loader-source', path: '_SYSTEM/Scripts/yuri-skill-loader.mjs', type: 'source' },
  { id: 'shintai-dispatch-source', path: '_SYSTEM/Scripts/shintai-dispatch.mjs', type: 'source' },
  { id: 'rails-source', path: '_SYSTEM/Scripts/rails.mjs', type: 'source' },
  { id: 'cyber-company-goal', path: '_SYSTEM/docs/YURI_OS_CYBERSECURITY_COMPANY_SUPERCHARGE_GOAL_2026-05-22.md', type: 'doc' },
  { id: 'cyber-intel-matrix', path: '_SYSTEM/docs/YURI_CYBER_INTELLIGENCE_MATRIX_2026-05-22.md', type: 'doc' },
  { id: 'cyber-intel-ingestion-protocol', path: '_SYSTEM/docs/YURI_GLOBAL_CYBER_THREAT_INTEL_INGESTION_PROTOCOL_2026-05-22.md', type: 'doc' },
  { id: 'cyber-capability-audit', path: '_SYSTEM/session-outputs/YURI-AI-CYBERSECURITY-CAPABILITY-AUDIT.md', type: 'research' },
  { id: 'cyber-research-sprint', path: '_SYSTEM/session-outputs/YURI-OS-GLOBAL-CYBERSECURITY-INTELLIGENCE-SPRINT-2026-05-21.md', type: 'research' },
  { id: 'threat-intel-kernel-source', path: '_SYSTEM/Scripts/threat-intel-kernel.mjs', type: 'source' },
  { id: 'security-lens-source', path: '_SYSTEM/Scripts/security-lens.mjs', type: 'source' },
  { id: 'security-lens-report', path: '_SYSTEM/reports/YURI_SECURITY_LENS_V0_2026-05-22.md', type: 'report' },
  { id: 'cyber-lab-harness-source', path: '_SYSTEM/Scripts/cyber-lab-harness.mjs', type: 'source' },
  { id: 'cyber-lab-runner-source', path: '_SYSTEM/Scripts/cyber-lab-runner.mjs', type: 'source' },
  { id: 'cyber-lab-manifest', path: '_SYSTEM/labs/cyber/lab-manifest.json', type: 'lab-manifest' },
  { id: 'cyber-guardrail-proof-source', path: '_SYSTEM/Scripts/cyber-guardrail-proof.mjs', type: 'source' },
  { id: 'cyber-guardrail-proof-matrix', path: '_SYSTEM/data/cyber-intel/guardrail-proof-matrix.json', type: 'guardrail-proof' },
  { id: 'cyber-guardrail-proof-report', path: '_SYSTEM/reports/YURI_GUARDRAIL_PROOF_MATRIX_2026-05-22.md', type: 'report' },
  { id: 'cyber-pilot-pack-source', path: '_SYSTEM/Scripts/cyber-pilot-pack.mjs', type: 'source' },
  { id: 'upgreat-pilot-readiness', path: '_SYSTEM/reports/YURI_UPGREAT_PILOT_READINESS_2026-05-22.md', type: 'report' },
  { id: 'regional-intelligence-packs', path: '_SYSTEM/reports/YURI_REGIONAL_INTELLIGENCE_PACKS_2026-05-22.md', type: 'report' },
  { id: 'managed-ops-pre-study', path: '_SYSTEM/docs/YURI_MANAGED_OPERATIONS_PRE_STUDY_2026-05-22.md', type: 'doc' },
  { id: 'weft-audit-pack', path: '_SYSTEM/research-archive/yuri-cybersecurity-pivot-2026-05/weft_audit_pack.md', type: 'research' },
  { id: 'asi-evolve-pack', path: '_SYSTEM/research-archive/yuri-cybersecurity-pivot-2026-05/ASI-EVOLVE-FULL-PACK.md', type: 'research' },
  { id: 'nemo-guardrails-readme', path: '_SYSTEM/tools/nemo-guardrails/README.md', type: 'upstream-source' },
  { id: 'nemo-guardrails-pyproject', path: '_SYSTEM/tools/nemo-guardrails/pyproject.toml', type: 'upstream-source' },
  { id: 'nemo-guardrails-rail-types', path: '_SYSTEM/tools/nemo-guardrails/docs/about/rail-types.md', type: 'upstream-source' },
  { id: 'nemo-guardrails-config-reference', path: '_SYSTEM/tools/nemo-guardrails/docs/configure-rails/configuration-reference.md', type: 'upstream-source' },
  { id: 'nemo-guardrails-llmrails', path: '_SYSTEM/tools/nemo-guardrails/nemoguardrails/rails/llm/llmrails.py', type: 'upstream-source' },
  { id: 'msa-readme', path: '_SYSTEM/tools/MSA/README.md', type: 'upstream-source' },
  { id: 'msa-memory-sparse-attention', path: '_SYSTEM/tools/MSA/src/msa/memory_sparse_attention.py', type: 'upstream-source' },
  { id: 'msa-service', path: '_SYSTEM/tools/MSA/src/msa_service.py', type: 'upstream-source' },
  { id: 'legacy-shintai-team-sizing', path: path.relative(REPO_ROOT, path.join(LEGACY_CLAUDE_PROJECT_MEMORY_DIR, 'feedback_shintai_team_sizing.md')), type: 'legacy-memory' },
  { id: 'legacy-shintai-main-thread-role', path: path.relative(REPO_ROOT, path.join(LEGACY_CLAUDE_PROJECT_MEMORY_DIR, 'feedback_shintai_main_thread_role.md')), type: 'legacy-memory' },
  { id: 'legacy-rick-persona-dispatch', path: path.relative(REPO_ROOT, path.join(LEGACY_CLAUDE_PROJECT_MEMORY_DIR, 'feedback_rick_persona_every_dispatch.md')), type: 'legacy-memory' },
  { id: 'extraction-sprint-template', path: '.claude/skills/extraction-sprint/SKILL.md', type: 'template' },
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
  const evidenceSources = [...coreFiles, ...optionalFiles];

  for (const source of evidenceSources) {
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
  const loadedIds = new Set(loaded.map((entry) => entry.id));
  const sourceById = new Map(evidenceSources.map((source) => [source.id, source]));
  const requiredMissing = constraints.requiredEvidenceIds
    .filter((id) => !loadedIds.has(id))
    .map((id) => ({
      id,
      ...(sourceById.get(id) || {}),
      required: true,
      error: 'required task evidence missing',
    }));
  const ok = inputRail.ok && missing.length === 0 && blocked.length === 0 && requiredMissing.length === 0;

  return {
    ok,
    gate: 'gate0-evidence',
    task: String(task || ''),
    timestamp: new Date().toISOString(),
    inputRail,
    loaded,
    missing,
    requiredMissing,
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
      ...gate0.requiredMissing.map((entry) => ({
        ok: false,
        rail: 'gate0-evidence',
        severity: 'block',
        reasons: [`required task evidence missing: ${entry.id}`],
        evidence: { id: entry.id, path: entry.path || null },
      })),
      ...gate0.blocked.map((entry) => entry.rail),
    ],
  };
}

export function buildConstraintBlock(gateOrPreflight) {
  const gate = gateOrPreflight?.gate0 || gateOrPreflight;
  const constraints = gate?.constraints || buildConstraints({ task: gate?.task || '', loaded: gate?.loaded || [] });
  const loadedIds = (gate?.loaded || []).map((entry) => `${entry.id}:${entry.sha256}`).join(', ');
  const missingOptional = (gate?.warnings || []).map((entry) => entry.id).join(', ');
  const requiredMissing = (gate?.requiredMissing || []).map((entry) => entry.id).join(', ');
  return [
    '[YURI CONTROL PLANE GATE 0]',
    `gate_ok=${Boolean(gate?.ok)}`,
    `task_tier_hint=${constraints.taskTierHint}`,
    `loaded_evidence=${loadedIds || 'none'}`,
    requiredMissing ? `required_missing=${requiredMissing}` : '',
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
    protectedSurfaces: [...new Set(PROTECTED_SURFACE_LABELS)],
    laneKernelIds: Object.keys(LANE_KERNEL),
    superauditMemberIds: deployment.members.map((member) => member.id),
    evidenceIds: loaded.map((entry) => entry.id),
    requiredCoreIds: CORE_EVIDENCE_FILES.map((entry) => entry.id),
    requiredEvidenceIds: requiredEvidenceIdsForTask(task),
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
