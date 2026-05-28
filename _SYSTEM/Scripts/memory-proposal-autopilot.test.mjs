import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  applyReviewDecision,
  deterministicReviewProposal,
  hasUnnegatedProtectedMutationIntent,
  neutralizePeerLaneBlame,
  pendingMemoryProposals,
  processPendingProposals,
  validateCommitPaths,
} from './memory-proposal-autopilot.mjs';
import {
  listMemoryProposals,
  proposeMemoryWrite,
} from './memory-kernel.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, '_SYSTEM/Scripts/memory-proposal-autopilot.mjs');

function tempLogs() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-autopilot-'));
  return {
    dir,
    proposalLogPath: path.join(dir, 'memory-proposals.jsonl'),
    decisionLogPath: path.join(dir, 'memory-proposal-decisions.jsonl'),
  };
}

function makeProposal(logs, content, fields = {}) {
  const result = proposeMemoryWrite({
    content,
    tags: fields.tags || ['feedback'],
    confidence: fields.confidence ?? 0.9,
    reason: fields.reason || 'test proposal',
    surface: fields.surface || 'yuri-memory',
  }, {
    record: true,
    proposalLogPath: logs.proposalLogPath,
  });
  assert.equal(result.ok, true);
  return result.proposal;
}

test('deterministic review keeps durable safe memory', () => {
  const proposal = {
    id: 'mem-proposal-safe',
    surface: 'yuri-memory',
    tags: ['feedback', 'review-discipline'],
    confidence: 0.9,
    content: 'RULE: Treat first-run success as a hypothesis until local evidence verifies it.',
  };

  const review = deterministicReviewProposal(proposal);
  assert.equal(review.decision, 'keep');
  assert.match(review.reason, /safety checks/);
});

test('deterministic review rewrites peer-lane blame language', () => {
  const content = 'RULE: Claude made a mistake, so future reviews should be harsher.';
  const neutralized = neutralizePeerLaneBlame(content);

  assert.match(neutralized, /concurrent lane output had an issue/);
  assert.doesNotMatch(neutralized, /Claude made a mistake/);

  const review = deterministicReviewProposal({
    id: 'mem-proposal-blame',
    surface: 'yuri-memory',
    tags: ['feedback'],
    confidence: 0.9,
    content,
  });
  assert.equal(review.decision, 'rewrite');
  assert.match(review.content, /shared-integration|concurrent lane output/);
});

test('protected mutation intent rejects direct access but allows negated policy', () => {
  assert.equal(hasUnnegatedProtectedMutationIntent('RULE: Never read .env or .claude/history directly.'), false);
  assert.equal(hasUnnegatedProtectedMutationIntent('TASK: Read .env and import backend/data for memory.'), true);

  const review = deterministicReviewProposal({
    id: 'mem-proposal-protected',
    surface: 'yuri-memory',
    tags: ['feedback'],
    confidence: 0.9,
    content: 'TASK: Read .env and import backend/data for memory.',
  });
  assert.equal(review.decision, 'reject');
});

test('processPendingProposals records keep decisions and clears pending queue', () => {
  const logs = tempLogs();
  try {
    makeProposal(logs, 'RULE: Preserve memory proposals as reviewable queue entries.');
    const before = pendingMemoryProposals(logs);
    assert.equal(before.ok, true);
    assert.equal(before.proposals.length, 1);

    const processed = processPendingProposals({
      ...logs,
      reviewer: 'deterministic',
      limit: 2,
    });
    assert.equal(processed.ok, true);
    assert.equal(processed.processed.length, 1);
    assert.equal(processed.processed[0].review.decision, 'keep');

    const after = pendingMemoryProposals(logs);
    assert.equal(after.proposals.length, 0);
  } finally {
    rmSync(logs.dir, { recursive: true, force: true });
  }
});

test('rewrite decisions create a rewritten kept proposal by default', () => {
  const logs = tempLogs();
  try {
    const original = makeProposal(logs, 'RULE: Claude made a mistake and must be blamed less ambiguously.');
    const review = deterministicReviewProposal(original);
    assert.equal(review.decision, 'rewrite');

    const applied = applyReviewDecision(original, review, logs);
    assert.equal(applied.ok, true);
    assert.equal(applied.decision.decision, 'rewrite');
    assert.equal(applied.rewriteDecision.decision, 'keep');

    const proposals = listMemoryProposals('concurrent lane output', logs);
    assert.equal(proposals.proposals.some((proposal) => proposal.id === applied.rewrite.id && proposal.status === 'keep'), true);
  } finally {
    rmSync(logs.dir, { recursive: true, force: true });
  }
});

test('commit path validation refuses runtime state and protected paths', () => {
  const runtime = validateCommitPaths(['_SYSTEM/state/memory-proposal-decisions.jsonl']);
  assert.equal(runtime.ok, false);
  assert.match(runtime.errors.join('\n'), /runtime state commit path denied/);

  const protectedPath = validateCommitPaths(['.claude/history/transcript.jsonl']);
  assert.equal(protectedPath.ok, false);
  assert.match(protectedPath.errors.join('\n'), /protected commit path denied|outside source/);

  const allowed = validateCommitPaths(['_SYSTEM/memory/memory-core.md']);
  assert.equal(allowed.ok, true);
});

test('CLI dry-run reviews without writing decisions', () => {
  const logs = tempLogs();
  try {
    makeProposal(logs, 'RULE: Dry-run should not write a memory decision.');
    const result = spawnSync(process.execPath, [
      SCRIPT,
      'once',
      '--dry-run',
      '--proposal-log',
      logs.proposalLogPath,
      '--decision-log',
      logs.decisionLogPath,
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.processed.length, 1);
    assert.equal(parsed.processed[0].applied.dryRun, true);
    assert.throws(() => readFileSync(logs.decisionLogPath, 'utf8'), /ENOENT/);
  } finally {
    rmSync(logs.dir, { recursive: true, force: true });
  }
});

test('CLI dry-run disables commit even when commit flags are present', () => {
  const logs = tempLogs();
  try {
    makeProposal(logs, 'RULE: Dry-run with commit flags should still avoid mutation.');
    const result = spawnSync(process.execPath, [
      SCRIPT,
      'once',
      '--dry-run',
      '--commit',
      '--proposal-log',
      logs.proposalLogPath,
      '--decision-log',
      logs.decisionLogPath,
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.commit.reason, 'dry-run disables commit');
    assert.throws(() => readFileSync(logs.decisionLogPath, 'utf8'), /ENOENT/);
  } finally {
    rmSync(logs.dir, { recursive: true, force: true });
  }
});
