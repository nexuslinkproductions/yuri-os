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

test('memory scorer modes: embedding is live (static encoder), MSA stays research-only fallback', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-scorer-'));
  try {
    writeFileSync(path.join(dir, 'a.md'), 'MSA sparse memory research and RAG recall.');
    const embedding = recallMemory('MSA recall', { root: dir, scorer: 'embedding' });
    const msa = recallMemory('MSA recall', { root: dir, scorer: 'msa' });

    assert.deepEqual(SEMANTIC_MODES, ['lexical', 'embedding', 'msa']);
    assert.equal(embedding.contexts[0].id, 'a.md');
    assert.equal(embedding.policy.scorer, 'embedding');
    assert.equal(embedding.policy.scorerFallback, false);
    assert.equal(embedding.policy.scorerWarning, null);
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
  // Stale assertions removed (wave-2): 'shintai-roster' (shintai retired, never
  // in the source list), 'msa-readme' (loader-blocked vendored repo),
  // 'neurodivergent-engine-handoff' (doc purged in babd5977). This test had
  // been silently RED on HEAD — the memory domain's own regression gate rot.
  assert.ok(evidence.sources.some((source) => source.id === 'extraction-sprint-template'));
  assert.ok(evidence.sources.some((source) => source.id === 'memory-rag-skill-research'));
  assert.ok(evidence.sources.some((source) => source.id === 'yuri-memory-index'));
  assert.ok(evidence.sources.some((source) => source.id === 'memory-kernel-source'));
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


test('ledger dedup never re-appends an identical re-submission past the recent tail (WP-M.14)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-dedup-full-'));
  const logPath = path.join(dir, 'memory-ledger.jsonl');
  try {
    // 51 DISTINCT entries (distinct content -> distinct contentSha256). The
    // oldest sits one row BEYOND a 50-row recent-tail window.
    for (let i = 0; i < 51; i += 1) {
      appendMemoryEntry({
        originLane: 'codex',
        type: 'evidence',
        scope: 'session',
        content: `unique-entry-${i}`,
      }, { logPath });
    }
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 51);

    // Re-submit content identical to the OLDEST entry. The WP-M.14 contract
    // ("identical re-submissions are acknowledged, never re-appended") requires
    // dedup — a 50-row window would miss it and append a duplicate ledger row.
    const dup = appendMemoryEntry({
      originLane: 'codex',
      type: 'evidence',
      scope: 'session',
      content: 'unique-entry-0',
    }, { logPath });

    assert.equal(dup.ok, true);
    assert.equal(dup.duplicate, true, 'identical re-submission must be acknowledged as a duplicate, not re-appended');
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 51, 'no duplicate ledger row appended');

    // Negative path: a genuinely NOVEL entry is still appended (dedup must not over-suppress the primary write).
    const fresh = appendMemoryEntry({
      originLane: 'codex',
      type: 'evidence',
      scope: 'session',
      content: 'unique-entry-novel-not-seen-before',
    }, { logPath });
    assert.equal(fresh.ok, true);
    assert.equal(fresh.duplicate, undefined, 'a novel entry is appended, not falsely deduped');
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 52, 'novel entry appended exactly once');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('ledger dedup matches durable semantic identity (type/scope/source), not content hash alone', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-dedup-semantic-'));
  const logPath = path.join(dir, 'memory-ledger.jsonl');
  try {
    const text = 'identical canonical text shared across submissions';

    // Baseline: codex holds 'permanent'. Effective scope = 'permanent'.
    const base = appendMemoryEntry({
      originLane: 'codex', type: 'evidence', scope: 'permanent', source: 'model', content: text,
    }, { logPath });
    assert.equal(base.ok, true);
    assert.equal(base.entry.scope, 'permanent');
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 1);

    // (1) Effective-scope proof: deepseek requests 'permanent' but is authority-downgraded to
    // 'project'. Dedup MUST key on the effective scope ('project'), not requestedScope
    // ('permanent') — keying on requestedScope would collide with baseline. Since
    // {evidence,project,model} is not yet recorded, this APPENDS, proving effective scope is
    // the match key.
    const downgraded = appendMemoryEntry({
      originLane: 'deepseek', type: 'evidence', scope: 'permanent', source: 'model', content: text,
    }, { logPath });
    assert.equal(downgraded.ok, true);
    assert.equal(downgraded.entry.scope, 'project');
    assert.match(downgraded.warnings.join('\n'), /scope downgraded/);
    assert.equal(downgraded.duplicate, undefined, 'effective scope differs from baseline -> appended, not deduped');
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 2);

    // (2) Same content, DIFFERENT type -> independently recordable.
    const diffType = appendMemoryEntry({
      originLane: 'codex', type: 'task', scope: 'permanent', source: 'model', content: text,
    }, { logPath });
    assert.equal(diffType.ok, true);
    assert.equal(diffType.duplicate, undefined, 'same text with a different type is NOT a duplicate');

    // (3) Same content+type+scope, DIFFERENT source -> independently recordable.
    const diffSource = appendMemoryEntry({
      originLane: 'codex', type: 'evidence', scope: 'permanent', source: 'user', content: text,
    }, { logPath });
    assert.equal(diffSource.ok, true);
    assert.equal(diffSource.duplicate, undefined, 'same text with a different source is NOT a duplicate');

    // Four distinct semantic identities persisted.
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 4);

    // (4) Exact semantic resubmission from a DIFFERENT origin lane -> STILL a duplicate.
    // Origin lane is not part of durable identity; matching content+type+scope+source wins.
    const resubmitDifferentLane = appendMemoryEntry({
      originLane: 'gpt-5.5', type: 'evidence', scope: 'permanent', source: 'model', content: text,
    }, { logPath });
    assert.equal(resubmitDifferentLane.ok, true);
    assert.equal(resubmitDifferentLane.duplicate, true, 'exact semantic match dedupes even from a different origin lane');

    // (5) Exact semantic resubmission of the downgraded 'project' row, also from a different
    // lane, must dedupe across full history (not just the recent tail).
    const resubmitProject = appendMemoryEntry({
      originLane: 'gpt-5.5', type: 'evidence', scope: 'project', source: 'model', content: text,
    }, { logPath });
    assert.equal(resubmitProject.duplicate, true, 'non-baseline identity also dedupes across full history');

    // No new rows beyond the four distinct identities.
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ledger dedup stays compatible with pre-DBarr3 rows lacking the source field', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-dedup-legacy-'));
  const logPath = path.join(dir, 'memory-ledger.jsonl');
  try {
    const text = 'legacy row content predating source provenance';
    // Seed a real row, then strip `source` to emulate a pre-DBarr3 (2026-06-17) ledger row.
    // Such rows predated source provenance and defaulted to agent-authored ('model').
    appendMemoryEntry({
      originLane: 'codex', type: 'evidence', scope: 'session', source: 'model', content: text,
    }, { logPath });
    const seeded = JSON.parse(readFileSync(logPath, 'utf8').trim());
    delete seeded.source;
    writeFileSync(logPath, `${JSON.stringify(seeded)}\n`);

    // Default 'model' source -> dedupes (a legacy row with no source reads as 'model').
    const modelResubmit = appendMemoryEntry({
      originLane: 'codex', type: 'evidence', scope: 'session', source: 'model', content: text,
    }, { logPath });
    assert.equal(modelResubmit.duplicate, true, 'default-source resubmission dedupes against a legacy row (source defaults to model)');

    // 'user' source -> distinct; the legacy row is treated as model-authored.
    const userEntry = appendMemoryEntry({
      originLane: 'codex', type: 'evidence', scope: 'session', source: 'user', content: text,
    }, { logPath });
    assert.equal(userEntry.duplicate, undefined, 'a user-planted entry is distinct from a model-authored legacy row');
    assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
