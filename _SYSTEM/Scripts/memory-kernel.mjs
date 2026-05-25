#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROTECTED_SURFACE_EXCLUSIONS, requiredEvidenceIdsForTask } from './evidence-contract.mjs';
import { appendKagamiEvent } from './kagami-event-bus.mjs';
import { isProtectedPath, safeRuntimePath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const MEMORY_ROOT = path.join(REPO_ROOT, '_SYSTEM', 'memory');
export const MEMORY_AUDIT_LOG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-kernel-audit.jsonl');
export const MEMORY_LEDGER_LOG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-ledger.jsonl');
export const SEMANTIC_MODES = Object.freeze(['lexical', 'embedding', 'msa']);

export const CONTROL_PLANE_EVIDENCE_SOURCES = Object.freeze([
  { id: 'shintai-roster', path: '_SYSTEM/kagami/shintai-team.json', type: 'roster', required: true },
  { id: 'yuri-memory-index', path: '_SYSTEM/memory/MEMORY.md', type: 'memory', required: true },
  { id: 'extraction-sprint-template', path: 'skills/extraction-sprint/SKILL.md', type: 'template', required: true },
  { id: 'offload-contract', path: '_SYSTEM/Scripts/offload-contract.mjs', type: 'source', required: true },
  { id: 'lane-kernel', path: '_SYSTEM/Scripts/lane-kernel.mjs', type: 'source', required: true },
  { id: 'self-improvement-memory-rag-goal', path: '_SYSTEM/docs/YURI_OS_SELF_IMPROVEMENT_MEMORY_RAG_SHINTAI_GOAL_2026-05-21.md', type: 'doc', required: true },
  { id: 'memory-rag-skill-research', path: '_SYSTEM/docs/YURI_MEMORY_RAG_SKILL_RESEARCH_2026-05-21.md', type: 'research', required: true },
  { id: 'protected-surfaces-plan', path: '_SYSTEM/docs/YURI_OS_PROTECTED_SURFACES_MIGRATION_PLAN_2026-05-21.md', type: 'doc', required: true },
  { id: 'soul-persona', path: 'SOUL.md', type: 'persona', required: true },
  { id: 'neurodivergent-engine-handoff', path: '_SYSTEM/HANDOFF-musubi-intelligence-sprint-v2.md', type: 'neurodivergence', required: true },
  { id: 'msa-readme', path: '_SYSTEM/tools/MSA/README.md', type: 'upstream-source', required: true },
  { id: 'memory-kernel-source', path: '_SYSTEM/Scripts/memory-kernel.mjs', type: 'source', required: true },
  { id: 'skill-loader-source', path: '_SYSTEM/Scripts/yuri-skill-loader.mjs', type: 'source', required: true },
  { id: 'shintai-dispatch-source', path: '_SYSTEM/Scripts/shintai-dispatch.mjs', type: 'source', required: true },
  { id: 'rails-source', path: '_SYSTEM/Scripts/rails.mjs', type: 'source', required: true },
]);

export const MEMORY_ENTRY_TYPES = Object.freeze(['rule', 'feedback', 'contract', 'evidence', 'task']);
export const MEMORY_SCOPES = Object.freeze(['session', 'project', 'permanent']);
export const MEMORY_AUTHORITY = Object.freeze({
  codex: ['session', 'project', 'permanent'],
  'gpt-5.5': ['session', 'project', 'permanent'],
  deepseek: ['session', 'project'],
  'deepseek-v4-pro': ['session', 'project'],
  'deepseek-v4-flash': ['session', 'project'],
});

export const MEMORY_ACTIONS = Object.freeze([
  'recall',
  'write-proposal',
  'promote',
  'evict',
  'audit',
  'lane-session-summary',
  'legacy-claude-import',
]);

export const MEMORY_SURFACES = Object.freeze({
  yuriMemory: {
    id: 'yuri-memory',
    owner: 'yuri',
    kind: 'durable-context',
    root: '_SYSTEM/memory',
    writable: true,
    actions: ['recall', 'write-proposal', 'promote', 'evict', 'audit'],
  },
  yuriStateAudit: {
    id: 'yuri-state-audit',
    owner: 'yuri',
    kind: 'runtime-audit',
    root: '_SYSTEM/state',
    writable: true,
    actions: ['audit', 'lane-session-summary'],
  },
  laneSession: {
    id: 'lane-session',
    owner: 'yuri',
    kind: 'session-summary',
    root: '_SYSTEM/state/lane-sessions',
    writable: true,
    actions: ['lane-session-summary'],
  },
  legacyClaudeProjectMemory: {
    id: 'legacy-claude-project-memory',
    owner: 'claude-importable',
    kind: 'legacy-context',
    root: '.claude/projects/*/memory',
    writable: false,
    actions: ['legacy-claude-import'],
  },
});

export function listMemorySurfaces() {
  return Object.values(MEMORY_SURFACES).map((surface) => ({
    ...surface,
    protected: isProtectedPath(surface.root),
  }));
}

export function recallMemory(query = '', options = {}) {
  const maxFiles = Number(options.maxFiles || 8);
  const maxBytes = Number(options.maxBytes || 40_000);
  const scorer = resolveMemoryScorer(options.scorer || options.mode || 'lexical');
  const root = path.resolve(options.root || MEMORY_ROOT);
  if (isProtectedPath(root)) {
    return {
      ok: false,
      query,
      contexts: [],
      error: `protected memory root denied: ${root}`,
    };
  }
  if (!existsSync(root)) {
    return { ok: true, query, contexts: [], warning: 'memory root missing' };
  }

  const tokens = tokenize(query);
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:md|json|txt)$/i.test(entry.name))
    .map((entry) => {
      const absPath = path.join(root, entry.name);
      const text = readFileSync(absPath, 'utf8');
      const score = scorer.score(text, tokens, query);
      return {
        id: path.basename(entry.name),
        path: path.relative(REPO_ROOT, absPath),
        bytes: Buffer.byteLength(text),
        score,
        content: text.slice(0, Math.min(maxBytes, text.length)),
        truncated: text.length > maxBytes,
        sha256: hashText(text),
      };
    })
    .filter((entry) => entry.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, maxFiles);

  return {
    ok: true,
    query,
    contexts: candidates,
    policy: {
      recallBeforeDispatch: true,
      writeRequiresProposal: true,
      promotionRequiresAudit: true,
      legacyClaudeMemoryImportOnly: true,
      scorer: scorer.mode,
      scorerActive: scorer.active,
      scorerFallback: scorer.fallback,
      scorerWarning: scorer.warning,
    },
  };
}

export function loadControlPlaneEvidence(options = {}) {
  const sources = options.sources || CONTROL_PLANE_EVIDENCE_SOURCES;
  const loaded = [];
  const missing = [];
  const blocked = [];

  for (const source of sources) {
    const relPath = String(source.path || '');
    const absPath = path.resolve(REPO_ROOT, relPath);
    if (assertNoProtectedSurface(relPath).ok === false || assertNoProtectedSurface(absPath).ok === false) {
      blocked.push({ ...source, absPath, error: 'protected evidence source denied' });
      continue;
    }
    if (!existsSync(absPath)) {
      missing.push({ ...source, absPath });
      continue;
    }
    const content = readFileSync(absPath, 'utf8');
    loaded.push({
      id: source.id,
      path: relPath,
      absPath,
      type: source.type || 'evidence',
      required: source.required !== false,
      bytes: Buffer.byteLength(content),
      sha256: hashFull(content),
    });
  }

  return {
    ok: missing.filter((entry) => entry.required !== false).length === 0 && blocked.length === 0,
    timestamp: new Date().toISOString(),
    sources: loaded,
    hashes: Object.fromEntries(loaded.map((entry) => [entry.id, entry.sha256])),
    loadedTemplates: loaded.filter((entry) => entry.type === 'template').map((entry) => entry.id),
    protectedSurfaceExclusions: [...PROTECTED_SURFACE_EXCLUSIONS],
    missing,
    blocked,
  };
}

export function validatePacketEvidence(packet = {}, options = {}) {
  const evidence = packet.evidence || packet;
  const sources = evidence.sources || evidence.evidenceSources || [];
  const hashes = evidence.hashes || Object.fromEntries(sources.map((entry) => [entry.id, entry.sha256]));
  const loadedTemplates = evidence.loadedTemplates || [];
  const protectedSurfaceExclusions = evidence.protectedSurfaceExclusions || [];
  const reasons = [];

  if (!Array.isArray(sources) || sources.length === 0) reasons.push('missing evidence sources');
  if (!hashes || Object.keys(hashes).length === 0) reasons.push('missing evidence hashes');
  if (!Array.isArray(loadedTemplates) || loadedTemplates.length === 0) reasons.push('missing loaded templates');
  if (!Array.isArray(protectedSurfaceExclusions) || protectedSurfaceExclusions.length === 0) {
    reasons.push('missing protected surface exclusions');
  }

  for (const source of sources) {
    const relPath = String(source.path || '');
    const absPath = path.resolve(REPO_ROOT, relPath);
    const protectedCheck = assertNoProtectedSurface(relPath);
    if (!protectedCheck.ok) {
      reasons.push(protectedCheck.error);
      continue;
    }
    if (!existsSync(absPath)) {
      reasons.push(`evidence source missing: ${source.id || relPath}`);
      continue;
    }
    const currentHash = hashFull(readFileSync(absPath, 'utf8'));
    const expectedHash = hashes[source.id] || source.sha256;
    if (!expectedHash || currentHash !== expectedHash) {
      reasons.push(`evidence hash mismatch: ${source.id || relPath}`);
    }
  }

  const requiredIds = new Set((options.requiredIds || requiredEvidenceIdsForTask(evidence.task || packet.task || '')));
  const sourceIds = new Set(sources.map((entry) => entry.id));
  for (const requiredId of requiredIds) {
    if (!sourceIds.has(requiredId)) reasons.push(`required evidence source missing from packet: ${requiredId}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    checkedAt: new Date().toISOString(),
    sourceCount: sources.length,
  };
}

function resolveMemoryScorer(mode) {
  const requested = String(mode || 'lexical').toLowerCase();
  const normalized = SEMANTIC_MODES.includes(requested) ? requested : 'lexical';
  if (normalized === 'lexical') {
    return {
      mode: 'lexical',
      active: true,
      fallback: false,
      warning: null,
      score: scoreText,
    };
  }
  if (normalized === 'embedding') {
    return {
      mode: 'embedding',
      active: false,
      fallback: true,
      warning: 'embedding scorer not configured; lexical fallback used',
      score: scoreText,
    };
  }
  return {
    mode: 'msa',
    active: false,
    fallback: true,
    warning: 'MSA scorer is research-only; lexical fallback used',
    score: scoreText,
  };
}

export function appendMemoryEntry(entry = {}, options = {}) {
  const originLane = normalizeOriginLane(entry.originLane || entry.origin_lane || entry.lane || entry.origin || '');
  const type = String(entry.type || '').trim();
  const requestedScope = String(entry.scope || 'session').trim().toLowerCase();
  const content = String(entry.content || '').trim();
  const pathCheck = assertNoProtectedSurface([
    entry.path,
    entry.sourcePath,
    entry.source_path,
    entry.target,
    entry.targetPath,
    ...(Array.isArray(entry.paths) ? entry.paths : []),
  ]);

  if (!originLane) return { ok: false, error: 'missing memory origin lane' };
  if (!MEMORY_ENTRY_TYPES.includes(type)) return { ok: false, error: `invalid memory entry type: ${type || 'missing'}` };
  if (!MEMORY_SCOPES.includes(requestedScope)) return { ok: false, error: `invalid memory scope: ${requestedScope || 'missing'}` };
  if (!content) return { ok: false, error: 'empty memory entry content' };
  if (!pathCheck.ok) return pathCheck;

  const allowedScopes = MEMORY_AUTHORITY[originLane] || ['session'];
  const scope = allowedScopes.includes(requestedScope) ? requestedScope : strongestAllowedScope(requestedScope, allowedScopes);
  const warnings = scope === requestedScope ? [] : [`scope downgraded from ${requestedScope} to ${scope} for ${originLane}`];
  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    originLane,
    type,
    scope,
    requestedScope,
    content,
    contentSha256: hashFull(content),
    metadata: entry.metadata || {},
    warnings,
  };

  const logPath = safeRuntimePath('YURI_MEMORY_LEDGER_PATH', options.logPath || MEMORY_LEDGER_LOG);
  if (!logPath) return { ok: false, error: 'memory ledger path is protected' };
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(payload)}\n`);
  return { ok: true, path: logPath, entry: payload, warnings };
}

export function recallEntries(query = '', options = {}) {
  const logPath = safeRuntimePath('YURI_MEMORY_LEDGER_PATH', options.logPath || MEMORY_LEDGER_LOG);
  if (!logPath) return { ok: false, query, entries: [], error: 'memory ledger path is protected' };
  if (!existsSync(logPath)) return { ok: true, query, entries: [] };

  const scope = options.scope ? String(options.scope).toLowerCase() : '';
  const tokens = tokenize(query);
  const maxEntries = Number(options.maxEntries || 20);
  const entries = readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => !scope || entry.scope === scope)
    .filter((entry) => tokens.length === 0 || scoreText(`${entry.content}\n${JSON.stringify(entry.metadata || {})}`, tokens) > 0)
    .slice(-maxEntries)
    .reverse();

  return { ok: true, query, scope: scope || null, entries };
}

export function proposeMemoryWrite(entry = {}, options = {}) {
  const text = String(entry.content || entry.text || '').trim();
  if (!text) return { ok: false, error: 'empty memory proposal' };
  const targetSurface = entry.surface || 'yuri-memory';
  const surface = getMemorySurface(targetSurface) || MEMORY_SURFACES.yuriMemory;
  if (!surface.writable) return { ok: false, error: `memory surface is import-only: ${surface.id}` };
  if (isProtectedPath(surface.root)) return { ok: false, error: `protected memory surface denied: ${surface.root}` };
  const result = {
    ok: true,
    proposal: {
      id: `mem-proposal-${hashText(`${Date.now()}:${text}`)}`,
      createdAt: new Date().toISOString(),
      surface: surface.id,
      action: 'write-proposal',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      confidence: Number(entry.confidence ?? 0.7),
      content: text,
      reason: entry.reason || options.reason || 'operator-approved memory proposal required before promotion',
      promoteable: false,
    },
  };
  appendMemoryKagamiEvent('MEMORY_CANDIDATE_PROPOSED', {
    source: 'memory-kernel:propose',
    session: options.session || entry.session || 'memory-kernel',
    lane: options.lane || entry.originLane || 'memory-kernel',
    proposalId: result.proposal.id,
    surface: surface.id,
    action: result.proposal.action,
    contentHash: hashText(text),
    tags: result.proposal.tags,
    confidence: result.proposal.confidence,
    promoteable: result.proposal.promoteable,
  });
  return result;
}

export function promoteMemoryProposal(proposal = {}, options = {}) {
  if (!proposal.id || !proposal.content) return { ok: false, error: 'invalid memory proposal' };
  if (options.approved !== true) {
    return {
      ok: false,
      error: 'memory promotion requires explicit approval',
      proposalId: proposal.id,
    };
  }
  const surface = getMemorySurface(proposal.surface) || MEMORY_SURFACES.yuriMemory;
  if (!surface.writable) return { ok: false, error: `memory surface is import-only: ${surface.id}` };
  const result = {
    ok: true,
    event: auditMemoryEvent({
      action: 'promote',
      proposalId: proposal.id,
      surface: surface.id,
      contentHash: hashText(proposal.content),
      dryRun: options.dryRun !== false,
    }, { dryRun: options.dryRun !== false }),
  };
  appendMemoryKagamiEvent('MEMORY_CANDIDATE_PROPOSED', {
    source: 'memory-kernel:promote',
    session: options.session || 'memory-kernel',
    lane: options.lane || 'codex-main',
    proposalId: proposal.id,
    surface: surface.id,
    action: 'promote',
    approved: true,
    dryRun: options.dryRun !== false,
    contentHash: hashText(proposal.content),
  });
  return result;
}

export function evictMemory(target = {}, options = {}) {
  const targetPath = target.path || target.id || '';
  if (!targetPath) return { ok: false, error: 'missing memory eviction target' };
  if (isProtectedPath(targetPath)) return { ok: false, error: `protected eviction target denied: ${targetPath}` };
  return auditMemoryEvent({
    action: 'evict',
    target: targetPath,
    reason: target.reason || 'eviction proposal',
    dryRun: options.dryRun !== false,
  }, { dryRun: options.dryRun !== false });
}

export function auditMemoryEvent(event = {}, options = {}) {
  const payload = {
    ts: new Date().toISOString(),
    action: event.action || 'audit',
    ...event,
  };
  if (options.dryRun === true || event.dryRun === true) {
    return { ok: true, dryRun: true, event: payload };
  }
  const logPath = safeRuntimePath('YURI_MEMORY_AUDIT_LOG', options.logPath || MEMORY_AUDIT_LOG);
  if (!logPath) return { ok: false, error: 'memory audit log path is protected' };
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(payload)}\n`);
  return { ok: true, path: logPath, event: payload };
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length >= 3);
}

function getMemorySurface(idOrKey) {
  if (!idOrKey) return null;
  if (MEMORY_SURFACES[idOrKey]) return MEMORY_SURFACES[idOrKey];
  return Object.values(MEMORY_SURFACES).find((surface) => surface.id === idOrKey) || null;
}

function scoreText(text, tokens) {
  if (!tokens.length) return 1;
  const lowered = String(text || '').toLowerCase();
  return tokens.reduce((score, token) => score + (lowered.includes(token) ? 1 : 0), 0);
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function appendMemoryKagamiEvent(kind, payload = {}) {
  try {
    appendKagamiEvent(kind, payload);
  } catch {
    // Memory proposals remain reviewable through memory ledgers even if telemetry is unavailable.
  }
}

function hashFull(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function assertNoProtectedSurface(value) {
  const candidates = Array.isArray(value) ? value : [value];
  const blocked = candidates.filter(Boolean).find((candidate) => {
    const normalized = String(candidate || '');
    return isProtectedPath(normalized) || normalized.replaceAll('\\', '/').includes('.amp/');
  });
  if (blocked) return { ok: false, error: `PROTECTED_SURFACE_ACCESS_DENIED: ${blocked}` };
  return { ok: true };
}

function normalizeOriginLane(value) {
  return String(value || '').replace(/^@/, '').toLowerCase();
}

function strongestAllowedScope(requestedScope, allowedScopes) {
  if (allowedScopes.includes(requestedScope)) return requestedScope;
  if (requestedScope === 'permanent' && allowedScopes.includes('project')) return 'project';
  return allowedScopes.includes('session') ? 'session' : allowedScopes[0];
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write([
    'YURI Memory Kernel',
    '',
    'Usage:',
    '  node _SYSTEM/Scripts/memory-kernel.mjs surfaces',
    '  node _SYSTEM/Scripts/memory-kernel.mjs recall <query>',
    '  node _SYSTEM/Scripts/memory-kernel.mjs ledger <query>',
    '  node _SYSTEM/Scripts/memory-kernel.mjs evidence',
  ].join('\n') + '\n');
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === 'help') {
    printHelp();
  } else if (cmd === 'surfaces') {
    printJson({ ok: true, surfaces: listMemorySurfaces() });
  } else if (cmd === 'recall') {
    printJson(recallMemory(rest.join(' ')));
  } else if (cmd === 'ledger') {
    printJson(recallEntries(rest.join(' ')));
  } else if (cmd === 'evidence') {
    printJson(loadControlPlaneEvidence());
  } else {
    process.stderr.write(`unknown memory-kernel command: ${cmd}\n`);
    process.exit(1);
  }
}
