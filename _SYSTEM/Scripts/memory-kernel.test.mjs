import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  auditMemoryEvent,
  evictMemory,
  listMemorySurfaces,
  promoteMemoryProposal,
  proposeMemoryWrite,
  recallMemory,
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
