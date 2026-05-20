#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isProtectedPath, safeRuntimePath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const MEMORY_ROOT = path.join(REPO_ROOT, '_SYSTEM', 'memory');
export const MEMORY_AUDIT_LOG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-kernel-audit.jsonl');

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
      const score = scoreText(text, tokens);
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
    },
  };
}

export function proposeMemoryWrite(entry = {}, options = {}) {
  const text = String(entry.content || entry.text || '').trim();
  if (!text) return { ok: false, error: 'empty memory proposal' };
  const targetSurface = entry.surface || 'yuri-memory';
  const surface = getMemorySurface(targetSurface) || MEMORY_SURFACES.yuriMemory;
  if (!surface.writable) return { ok: false, error: `memory surface is import-only: ${surface.id}` };
  if (isProtectedPath(surface.root)) return { ok: false, error: `protected memory surface denied: ${surface.root}` };
  return {
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
  return {
    ok: true,
    event: auditMemoryEvent({
      action: 'promote',
      proposalId: proposal.id,
      surface: surface.id,
      contentHash: hashText(proposal.content),
      dryRun: options.dryRun !== false,
    }, { dryRun: options.dryRun !== false }),
  };
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
