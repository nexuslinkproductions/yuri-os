import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  appendMemoryEntry,
  auditMemoryEvent,
  evictMemory,
  listMemorySurfaces,
  loadControlPlaneEvidence,
  promoteMemoryProposal,
  proposeMemoryWrite,
  recallEntries,
  recallMemory,
  validatePacketEvidence,
} from './memory-kernel.mjs';

test('memory surfaces are YURI-owned or import-only, never protected writable surfaces', () => {
  const surfaces = listMemorySurfaces();

  assert.ok(surfaces.some((surface) => surface.id === 'yuri-memory' && surface.owner === 'yuri'));
  assert.ok(surfaces.some((surface) => surface.id === 'legacy-claude-project-memory' && surface.writable === false));
  assert.equal(surfaces.some((surface) => surface.protected && surface.writable), false);
});

test('recall reads YURI-owned memory root and ranks matching context', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-'));
  try {
    writeFileSync(path.join(dir, 'a.md'), 'Rick harness uses Gate 0 and Shintai evidence.');
    writeFileSync(path.join(dir, 'b.md'), 'Browser harness docs crawl.');
    const result = recallMemory('shintai gate evidence', { root: dir });

    assert.equal(result.ok, true);
    assert.equal(result.contexts[0].id, 'a.md');
    assert.match(result.contexts[0].content, /Gate 0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('memory write proposal does not promote without explicit approval', () => {
  const proposalResult = proposeMemoryWrite({
    content: 'Future Shintai dispatch must load Gate 0 evidence before fan-out.',
    tags: ['shintai', 'gate0'],
  });
  assert.equal(proposalResult.ok, true);
  assert.equal(proposalResult.proposal.promoteable, false);

  const blocked = promoteMemoryProposal(proposalResult.proposal);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /explicit approval/);
});

test('control-plane memory evidence loads and validates current hashes', () => {
  const evidence = loadControlPlaneEvidence();
  const validation = validatePacketEvidence({
    evidenceSources: evidence.sources,
    hashes: evidence.hashes,
    loadedTemplates: evidence.loadedTemplates,
    protectedSurfaceExclusions: evidence.protectedSurfaceExclusions,
  });

  assert.equal(evidence.ok, true, JSON.stringify(evidence.missing.concat(evidence.blocked), null, 2));
  assert.ok(evidence.sources.some((source) => source.id === 'shintai-roster'));
  assert.ok(evidence.sources.some((source) => source.id === 'extraction-sprint-template'));
  assert.equal(validation.ok, true, validation.reasons.join('\n'));
});

test('packet evidence validation rejects stale hashes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-evidence-'));
  try {
    const file = path.join(dir, 'fixture.md');
    writeFileSync(file, 'before');
    const evidence = loadControlPlaneEvidence({
      sources: [{ id: 'fixture', path: file, type: 'template', required: true }],
    });
    writeFileSync(file, 'after');

    const validation = validatePacketEvidence({
      evidenceSources: evidence.sources,
      hashes: evidence.hashes,
      loadedTemplates: evidence.loadedTemplates,
      protectedSurfaceExclusions: evidence.protectedSurfaceExclusions,
    }, { requiredIds: ['fixture'] });

    assert.equal(validation.ok, false);
    assert.match(validation.reasons.join('\n'), /hash mismatch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('append-only ledger enforces lane authority and recall scopes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-ledger-'));
  const logPath = path.join(dir, 'memory-ledger.jsonl');
  try {
    const deepseek = appendMemoryEntry({
      originLane: 'deepseek-v4-pro',
      type: 'evidence',
      scope: 'permanent',
      content: 'alpha DeepSeek project evidence',
    }, { logPath });
    const rick = appendMemoryEntry({
      originLane: 'rick',
      type: 'task',
      scope: 'project',
      content: 'alpha Rick session task',
    }, { logPath });

    assert.equal(deepseek.ok, true);
    assert.equal(deepseek.entry.scope, 'project');
    assert.match(deepseek.warnings.join('\n'), /scope downgraded/);
    assert.equal(rick.entry.scope, 'session');
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 2);

    const projectRecall = recallEntries('alpha', { scope: 'project', logPath });
    const sessionRecall = recallEntries('alpha', { scope: 'session', logPath });
    assert.deepEqual(projectRecall.entries.map((entry) => entry.originLane), ['deepseek-v4-pro']);
    assert.deepEqual(sessionRecall.entries.map((entry) => entry.originLane), ['rick']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('append-only ledger rejects protected path references', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-protected-'));
  try {
    const result = appendMemoryEntry({
      originLane: 'codex',
      type: 'evidence',
      scope: 'session',
      content: 'must not write protected references',
      path: ['backend', 'data', 'anything'].join('/'),
    }, { logPath: path.join(dir, 'memory-ledger.jsonl') });

    assert.equal(result.ok, false);
    assert.match(result.error, /PROTECTED_SURFACE_ACCESS_DENIED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('import-only legacy Claude memory surface cannot receive writes', () => {
  const result = proposeMemoryWrite({
    surface: 'legacyClaudeProjectMemory',
    content: 'do not write here',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /import-only/);
});

test('memory audit supports dry-run and protected eviction denial', () => {
  const audit = auditMemoryEvent({ action: 'lane-session-summary', dryRun: true });
  const protectedPath = ['.claude', 'history', 'session.jsonl'].join('/');
  const eviction = evictMemory({ path: protectedPath });

  assert.equal(audit.ok, true);
  assert.equal(audit.dryRun, true);
  assert.equal(eviction.ok, false);
  assert.match(eviction.error, /protected eviction target/);
});
