import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  appendMemoryEntry,
  auditMemoryEvent,
  evictMemory,
  listMemoryProposalDecisions,
  listMemoryProposals,
  listMemorySurfaces,
  loadControlPlaneEvidence,
  promoteMemoryProposal,
  proposeMemoryWrite,
  recordMemoryProposalDecision,
  recallEntries,
  recallMemory,
  SEMANTIC_MODES,
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

test('memory scorer modes expose lexical fallback for embedding and MSA research modes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-scorer-'));
  try {
    writeFileSync(path.join(dir, 'a.md'), 'MSA sparse memory research and RAG recall.');
    const embedding = recallMemory('MSA recall', { root: dir, scorer: 'embedding' });
    const msa = recallMemory('MSA recall', { root: dir, scorer: 'msa' });

    assert.deepEqual(SEMANTIC_MODES, ['lexical', 'embedding', 'msa']);
    assert.equal(embedding.contexts[0].id, 'a.md');
    assert.equal(embedding.policy.scorer, 'embedding');
    assert.equal(embedding.policy.scorerFallback, true);
    assert.match(embedding.policy.scorerWarning, /lexical fallback/);
    assert.equal(msa.policy.scorer, 'msa');
    assert.match(msa.policy.scorerWarning, /research-only/);
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

test('memory write proposals can be recorded and reviewed without promotion', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-proposals-'));
  const proposalLogPath = path.join(dir, 'memory-proposals.jsonl');
  const decisionLogPath = path.join(dir, 'memory-proposal-decisions.jsonl');
  try {
    const result = proposeMemoryWrite({
      content: 'Marcel prefers reviewable memory proposals before durable profile changes.',
      tags: ['user-profile', 'review'],
      reason: 'capture a sensitive preference as pending memory, not promoted truth',
    }, { record: true, proposalLogPath });

    assert.equal(result.ok, true);
    assert.equal(result.proposal.promoteable, false);
    assert.equal(result.recorded.proposal.status, 'pending');
    assert.equal(readFileSync(proposalLogPath, 'utf8').trim().split('\n').length, 1);

    const proposals = listMemoryProposals('profile', { proposalLogPath });
    assert.equal(proposals.ok, true);
    assert.equal(proposals.proposals.length, 1);
    assert.match(proposals.proposals[0].content, /reviewable memory proposals/);
    assert.equal(proposals.proposals[0].promotionRequiresApproval, true);

    const decision = recordMemoryProposalDecision({
      proposalId: result.proposal.id,
      decision: 'keep',
      reason: 'clear operator preference, but still needs explicit promotion later',
      decidedBy: 'Marcel',
    }, { proposalLogPath, decisionLogPath });
    assert.equal(decision.ok, true);
    assert.equal(decision.decision.promotionPerformed, false);

    const decisions = listMemoryProposalDecisions('operator', { decisionLogPath });
    assert.equal(decisions.proposals, undefined);
    assert.equal(decisions.decisions.length, 1);

    const afterDecision = listMemoryProposals('profile', { proposalLogPath, decisionLogPath });
    assert.equal(afterDecision.proposals[0].status, 'keep');
    assert.equal(afterDecision.proposals[0].decision.decidedBy, 'Marcel');
    assert.equal(afterDecision.proposals[0].promotionRequiresApproval, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('memory proposal decisions require an existing proposal and valid decision', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-decision-invalid-'));
  try {
    const missing = recordMemoryProposalDecision({
      proposalId: 'mem-proposal-missing',
      decision: 'keep',
      reason: 'not present',
    }, {
      proposalLogPath: path.join(dir, 'memory-proposals.jsonl'),
      decisionLogPath: path.join(dir, 'memory-proposal-decisions.jsonl'),
    });
    const invalid = recordMemoryProposalDecision({
      proposalId: 'mem-proposal-missing',
      decision: 'promote-now',
      reason: 'invalid decision',
    }, {
      proposalLogPath: path.join(dir, 'memory-proposals.jsonl'),
      decisionLogPath: path.join(dir, 'memory-proposal-decisions.jsonl'),
    });

    assert.equal(missing.ok, false);
    assert.match(missing.error, /not found/);
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /invalid memory proposal decision/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  assert.ok(evidence.sources.some((source) => source.id === 'memory-rag-skill-research'));
  assert.ok(evidence.sources.some((source) => source.id === 'msa-readme'));
  assert.ok(evidence.sources.some((source) => source.id === 'neurodivergent-engine-handoff'));
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
