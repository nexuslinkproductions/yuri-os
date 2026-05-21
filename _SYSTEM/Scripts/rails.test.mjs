import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appendMemoryEntry } from './memory-kernel.mjs';
import {
  detectLaneMentions,
  detectShellBlocks,
  enforceOutputRails,
  evaluateDialogRails,
  evaluateExecutionRails,
  evaluateHealthRails,
  evaluateInputRails,
  evaluateNeurodivergenceRails,
  evaluateOutputRails,
  evaluateRetrievalRails,
  evaluateToolInputRails,
  writeRailViolation,
} from './rails.mjs';

test('input rail detects slash commands, lane mentions, and shell blocks', () => {
  const input = '/goal @shintai\n```bash\nnode --check _SYSTEM/Scripts/rick-repl.mjs\n```';
  const result = evaluateInputRails(input, { noexec: true });

  assert.equal(result.ok, true);
  assert.equal(result.severity, 'warn');
  assert.match(result.reasons.join('\n'), /prompt text/);
  assert.equal(result.evidence.slashCommand, '/goal');
  assert.deepEqual(result.evidence.laneMentions, ['@shintai']);
  assert.equal(result.evidence.autoExecutableShellBlocks, false);
  assert.deepEqual(detectLaneMentions(input), ['@shintai']);
  assert.deepEqual(detectShellBlocks(input), ['node --check _SYSTEM/Scripts/rick-repl.mjs']);
});

test('assistant shell blocks may auto-execute only when noexec is off', () => {
  const input = '```bash\nnode --version\n```';
  const execOn = evaluateInputRails(input, { source: 'assistant', noexec: false });
  const execOff = evaluateInputRails(input, { source: 'assistant', noexec: true });

  assert.equal(execOn.evidence.autoExecutableShellBlocks, true);
  assert.equal(execOff.evidence.autoExecutableShellBlocks, false);
  assert.equal(execOff.severity, 'warn');
});

test('path-like input is not mistaken for a slash command', () => {
  const result = evaluateInputRails('/tmp/yuri/fixture.txt is the file path', { source: 'user', noexec: true });

  assert.equal(result.ok, true);
  assert.equal(result.evidence.slashCommand, null);
  assert.doesNotMatch(result.reasons.join('\n'), /slash command/);
});

test('retrieval rail blocks protected surfaces', () => {
  const protectedPath = ['.claude', 'state', 'pulse-bus.jsonl'].join('/');
  const result = evaluateRetrievalRails({ path: protectedPath });

  assert.equal(result.ok, false);
  assert.equal(result.severity, 'block');
  assert.match(result.reasons.join('\n'), /protected retrieval path denied/);
});

test('retrieval rail performs lightweight memory recall when query is present', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-rails-memory-'));
  const logPath = path.join(dir, 'memory-ledger.jsonl');
  const previousLedgerPath = process.env.YURI_MEMORY_LEDGER_PATH;
  process.env.YURI_MEMORY_LEDGER_PATH = logPath;
  try {
    appendMemoryEntry({
      originLane: 'codex',
      type: 'evidence',
      scope: 'session',
      content: 'browser harness should use DOM before screenshots',
    }, { logPath });

    const result = evaluateRetrievalRails({ query: 'DOM screenshots', scope: 'session' });

    assert.equal(result.ok, true);
    assert.equal(result.evidence.memoryRecall.ok, true);
    assert.match(result.evidence.memoryRecall.entries[0].content, /DOM before screenshots/);
  } finally {
    if (previousLedgerPath === undefined) delete process.env.YURI_MEMORY_LEDGER_PATH;
    else process.env.YURI_MEMORY_LEDGER_PATH = previousLedgerPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('execution rail blocks destructive shell commands and protected targets', () => {
  const protectedPath = ['backend', 'data', 'snapshot.db'].join('/');
  const result = evaluateExecutionRails({
    kind: 'shell',
    command: `git commit -am test && cat ${protectedPath}`,
  });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /git-commit/);
  assert.match(result.reasons.join('\n'), /protected execution path denied/);
});

test('execution rail evaluates NeMo-style sub-rails', () => {
  const missingHealth = evaluateExecutionRails(
    { kind: 'shell', command: 'node --version' },
    { requireHealthPreflight: true },
  );
  const timeout = evaluateExecutionRails({
    kind: 'shell',
    command: 'node --version',
    timeoutMs: 120_000,
    healthProbe: { ok: true },
  });
  const protectedEnv = evaluateExecutionRails({
    kind: 'shell',
    command: 'cat .env && ls .amp/settings.json',
    healthProbe: { ok: true },
  });

  assert.equal(missingHealth.ok, false);
  assert.match(missingHealth.reasons.join('\n'), /missing health preflight/);
  assert.equal(timeout.ok, false);
  assert.match(timeout.reasons.join('\n'), /timeout cap exceeded/);
  assert.equal(protectedEnv.ok, false);
  assert.match(protectedEnv.reasons.join('\n'), /\.env/);
  assert.match(protectedEnv.reasons.join('\n'), /\.amp/);
  assert.ok(timeout.evidence.subRailResults.some((result) => result.rail === 'timeout-caps'));
});

test('tool input rail keeps tools available while denying unsafe inputs', () => {
  const allowed = evaluateToolInputRails({ command: 'node --check _SYSTEM/Scripts/rails.mjs' });
  const denied = evaluateToolInputRails({ command: 'git push origin main' });

  assert.equal(allowed.ok, true);
  assert.equal(denied.ok, false);
  assert.match(denied.reasons.join('\n'), /git-push/);
});

test('output rail warns on repo truth claims without evidence', () => {
  const result = evaluateOutputRails('all tests pass and repo is clean', { requireEvidence: true });

  assert.equal(result.ok, true);
  assert.equal(result.severity, 'warn');
  assert.match(result.reasons.join('\n'), /requires local evidence/);
});

test('output rail blocks missing required evidence ids for Shintai packets', () => {
  const result = evaluateOutputRails('verified packet', {
    requiredEvidenceIds: ['shintai-roster', 'memory-rag-skill-research'],
    evidenceSources: [{ id: 'shintai-roster' }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.evidence.missingEvidenceIds, ['memory-rag-skill-research']);
  assert.match(result.reasons.join('\n'), /required output evidence missing/);
});

test('output enforcement marks missing evidence and caps long text', () => {
  const result = enforceOutputRails('implemented ' + 'x'.repeat(100), {
    requireEvidence: true,
    maxOutputChars: 20,
  });

  assert.match(result.text, /\[EVIDENCE_MISSING\]/);
  assert.match(result.text, /\[OUTPUT_TRUNCATED\]/);
  assert.equal(result.evidence.truncated, true);
});

test('dialog rail enforces Shintai tier caps and Spark ban', () => {
  const trivial = evaluateDialogRails({
    task: 'small typo',
    members: [{ id: 'deepseek' }, { id: 'qwen-coder' }],
  });
  const spark = evaluateDialogRails({
    task: 'critical guardrail sprint',
    members: [{ id: 'deepseek' }, { id: 'codex-spark' }],
  });

  assert.equal(trivial.ok, false);
  assert.match(trivial.reasons.join('\n'), /team size exceeds trivial cap/);
  assert.equal(spark.ok, false);
  assert.match(spark.reasons.join('\n'), /Spark member forbidden/);
});

test('health rail blocks failed required targets', () => {
  const result = evaluateHealthRails([
    { id: 'deepseek', ok: true },
    { id: 'nemotron', ok: false, error: 'timeout' },
  ], { required: ['deepseek', 'nemotron'] });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /nemotron/);
});

test('neurodivergence rail turns messy critical input into mechanical behaviors', () => {
  const result = evaluateNeurodivergenceRails('critical Shintai supercharge memory/RAG skill recall clusterfuck with too much scattered input');

  assert.equal(result.ok, true);
  assert.equal(result.evidence.active, true);
  assert.ok(result.evidence.activations.some((entry) => entry.id === 'monotropic-depth'));
  assert.ok(result.evidence.activations.some((entry) => entry.id === 'pattern-first-decode'));
  assert.ok(result.evidence.activations.some((entry) => entry.id === 'durable-correction-capture'));
  assert.ok(result.evidence.sourceDocs.includes('SOUL.md'));
});

test('rail violations write only to caller-approved runtime paths', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-rails-'));
  const logPath = path.join(dir, 'violations.jsonl');
  try {
    const result = writeRailViolation(evaluateExecutionRails({ command: 'git push' }), { logPath });
    assert.equal(result.ok, true);
    assert.match(readFileSync(logPath, 'utf8'), /git-push/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
