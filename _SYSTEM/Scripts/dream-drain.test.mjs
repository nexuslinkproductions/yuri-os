import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadQueue, loadProcessedLedger, selectBatch, hashPromptFile, dedupBatch,
  categorizeEntry, extractRuleCandidates, dedupAgainstGlobal, appendToGlobal,
  appendProcessedLedger, previewBatch, runOnce, getStatus,
} from './dream-drain.mjs';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dream-drain-'));
}

function writeQueueLines(file, entries) {
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

function writePromptFile(dir, name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

// ─── loadQueue ────────────────────────────────────────────────────────────────

test('loadQueue: parses valid jsonl, skips malformed lines without throwing', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  fs.writeFileSync(queueFile, [
    JSON.stringify({ ts: '2026-01-01T00:00:00Z', promptFile: '/x', status: 'pending' }),
    'not valid json {{{',
    JSON.stringify({ ts: '2026-01-02T00:00:00Z', promptFile: '/x', status: 'processed' }),
  ].join('\n') + '\n');
  const entries = loadQueue(queueFile);
  assert.equal(entries.length, 2, 'malformed line skipped, both valid lines kept');
  fs.rmSync(root, { recursive: true, force: true });
});

test('loadQueue: missing file returns empty array (never throws)', () => {
  const entries = loadQueue('/tmp/does-not-exist-dream-drain-test.jsonl');
  assert.deepEqual(entries, []);
});

// ─── selectBatch ──────────────────────────────────────────────────────────────

test('selectBatch: oldest-first, only pending, excludes already-consumed', () => {
  const entries = [
    { ts: 't1', status: 'pending' },
    { ts: 't2', status: 'processed' },
    { ts: 't3', status: 'pending' },
    { ts: 't4', status: 'pending' },
  ];
  const consumed = new Set(['t1']);
  const batch = selectBatch(entries, consumed, 10);
  assert.deepEqual(batch.map((e) => e.ts), ['t3', 't4'], 't1 consumed, t2 not pending, t3+t4 eligible');
});

test('selectBatch: respects batchSize cap', () => {
  const entries = Array.from({ length: 10 }, (_, i) => ({ ts: `t${i}`, status: 'pending' }));
  const batch = selectBatch(entries, new Set(), 3);
  assert.equal(batch.length, 3);
  assert.deepEqual(batch.map((e) => e.ts), ['t0', 't1', 't2'], 'oldest 3 by array order');
});

// ─── hashPromptFile + dedupBatch ──────────────────────────────────────────────

test('hashPromptFile: same content -> same hash; missing file -> null', () => {
  const root = tmpRoot();
  const p1 = writePromptFile(root, 'a.txt', 'identical content here');
  const p2 = writePromptFile(root, 'b.txt', 'identical content here');
  const p3 = writePromptFile(root, 'c.txt', 'different content');
  const h1 = hashPromptFile(p1);
  const h2 = hashPromptFile(p2);
  const h3 = hashPromptFile(p3);
  assert.equal(h1.hash, h2.hash, 'identical file content hashes identically');
  assert.notEqual(h1.hash, h3.hash, 'different content hashes differently');
  assert.equal(hashPromptFile(path.join(root, 'missing.txt')), null, 'missing file -> null, not a crash');
  fs.rmSync(root, { recursive: true, force: true });
});

test('dedupBatch: entries sharing one promptFile collapse into ONE bucket (the real-world 1488-entries-2-files case)', () => {
  const root = tmpRoot();
  const shared = writePromptFile(root, 'shared.txt', 'the current ephemeral prompt content');
  const batch = [
    { ts: 't1', promptFile: shared, status: 'pending' },
    { ts: 't2', promptFile: shared, status: 'pending' },
    { ts: 't3', promptFile: shared, status: 'pending' },
  ];
  const { buckets, unreadable } = dedupBatch(batch);
  assert.equal(buckets.length, 1, 'all three collapse to one content-hash bucket');
  assert.equal(buckets[0].entries.length, 3);
  assert.equal(unreadable.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('dedupBatch: missing promptFile lands in unreadable, never silently dropped from the count', () => {
  const batch = [
    { ts: 't1', promptFile: '/nonexistent/path/x.txt', status: 'pending' },
  ];
  const { buckets, unreadable } = dedupBatch(batch);
  assert.equal(buckets.length, 0);
  assert.equal(unreadable.length, 1);
  assert.equal(unreadable[0].ts, 't1');
});

// ─── categorizeEntry ──────────────────────────────────────────────────────────

test('categorizeEntry: detects CORRECTIONS DETECTED marker', () => {
  const content = 'some session log\nCORRECTIONS DETECTED:\n  - fixed a bug\n';
  const cat = categorizeEntry(content);
  assert.equal(cat.hasCorrections, true);
});

test('categorizeEntry: no marker -> false', () => {
  const cat = categorizeEntry('plain session content, no signal here');
  assert.equal(cat.hasCorrections, false);
});

// ─── extractRuleCandidates ────────────────────────────────────────────────────

test('extractRuleCandidates: pulls bullets from a CORRECTIONS DETECTED block', () => {
  const content = [
    'Human messages: blah blah',
    'CORRECTIONS DETECTED:',
    '  - Always verify the file exists before reading it',
    '  - Never use a bare git commit in a multi-session repo',
    '',
    'general-purpose output: unrelated prose that is not a rule',
  ].join('\n');
  const candidates = extractRuleCandidates(content);
  assert.ok(candidates.some((c) => /verify the file exists/i.test(c)), 'first correction extracted');
  assert.ok(candidates.some((c) => /bare git commit/i.test(c)), 'second correction extracted');
});

test('extractRuleCandidates: pulls imperative-shaped bullets outside corrections blocks too', () => {
  const content = [
    '- Always check the test suite before claiming done',
    '- Never delete a file without a rollback path',
    '- narrative recap of what happened during the earlier build session today',
  ].join('\n');
  const candidates = extractRuleCandidates(content);
  assert.ok(candidates.some((c) => /check the test suite/i.test(c)));
  assert.ok(candidates.some((c) => /delete a file without a rollback/i.test(c)));
  assert.ok(!candidates.some((c) => /narrative recap/i.test(c)), 'plain descriptive bullet excluded (no imperative opener, no modal)');
});

test('extractRuleCandidates: conservative — free prose with no rule-shape yields nothing', () => {
  const content = 'This is just a narrative description of what happened during the session with no imperative structure at all, purely descriptive prose.';
  const candidates = extractRuleCandidates(content);
  assert.equal(candidates.length, 0, 'no rule-shaped lines -> no candidates (better fewer than noise)');
});

// REGRESSION (found against the REAL dream-queue corpus 2026-07-04): the upstream
// corrections-detector that writes .dream-prompt.txt is itself noisy — it flagged a quoted
// skill-loader boilerplate line ("Base directory for this skill: /Users/.../opus-fleet") as
// a "correction" purely because it opens a paragraph inside a quoted human message. A first
// draft of extractRuleCandidates trusted the CORRECTIONS DETECTED marker alone and passed
// this straight into global.md as a "learned rule". The marker must never be trusted without
// the same rule-shape gate applied to free bullets.
test('extractRuleCandidates: REGRESSION — a path/header-shaped line under CORRECTIONS DETECTED is rejected, not promoted to a rule', () => {
  const content = [
    'CORRECTIONS DETECTED:',
    '  - "Base directory for this skill: /Users/marcelspatz/.claude/skills/opus-fleet',
    '',
    '# opus-fleet — Opus orchestrates, Sonnet/Haiku agents execute',
  ].join('\n');
  const candidates = extractRuleCandidates(content);
  assert.equal(candidates.length, 0, 'the marker alone does not bypass the rule-shape gate — path-declaration line rejected');
});

test('extractRuleCandidates: caps output per bucket (maxPerBucket)', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `- Always do distinct thing number ${i} in this test`);
  const content = lines.join('\n');
  const candidates = extractRuleCandidates(content, { maxPerBucket: 5 });
  assert.equal(candidates.length, 5, 'capped at maxPerBucket even with 20 eligible lines');
});

test('extractRuleCandidates: dedups identical candidates within one bucket', () => {
  const content = [
    '- Always verify before committing',
    '- Always verify before committing',
  ].join('\n');
  const candidates = extractRuleCandidates(content);
  assert.equal(candidates.length, 1, 'identical line appearing twice yields one candidate');
});

// ─── dedupAgainstGlobal ────────────────────────────────────────────────────────

test('dedupAgainstGlobal: filters candidates already present verbatim in global.md', () => {
  const root = tmpRoot();
  const globalFile = path.join(root, 'global.md');
  fs.writeFileSync(globalFile, '# Global\n- Always verify before committing\n');
  const candidates = ['Always verify before committing', 'Never skip the rollback check'];
  const novel = dedupAgainstGlobal(candidates, globalFile);
  assert.deepEqual(novel, ['Never skip the rollback check'], 'already-present rule filtered out');
  fs.rmSync(root, { recursive: true, force: true });
});

test('dedupAgainstGlobal: missing global.md -> everything is novel', () => {
  const novel = dedupAgainstGlobal(['a rule'], '/tmp/nonexistent-global-dream-drain.md');
  assert.deepEqual(novel, ['a rule']);
});

// ─── appendToGlobal ────────────────────────────────────────────────────────────

test('appendToGlobal: writes a dated section with bullet-per-rule shape', () => {
  const root = tmpRoot();
  const globalFile = path.join(root, 'global.md');
  fs.writeFileSync(globalFile, '# Existing\n');
  const result = appendToGlobal(['Rule one', 'Rule two'], { globalFile, dateStr: '2026-07-04' });
  assert.equal(result.appended, true);
  assert.equal(result.count, 2);
  const content = fs.readFileSync(globalFile, 'utf8');
  assert.ok(content.includes('### Auto-synthesized 2026-07-04'));
  assert.ok(content.includes('- Rule one'));
  assert.ok(content.includes('- Rule two'));
  assert.ok(content.startsWith('# Existing'), 'append-only, original content preserved');
  fs.rmSync(root, { recursive: true, force: true });
});

test('appendToGlobal: empty rules array -> no write, appended:false', () => {
  const root = tmpRoot();
  const globalFile = path.join(root, 'global.md');
  fs.writeFileSync(globalFile, '# Existing\n');
  const before = fs.readFileSync(globalFile, 'utf8');
  const result = appendToGlobal([], { globalFile });
  assert.equal(result.appended, false);
  const after = fs.readFileSync(globalFile, 'utf8');
  assert.equal(before, after, 'file untouched when there is nothing to append');
  fs.rmSync(root, { recursive: true, force: true });
});

// ─── previewBatch (DISARMED) ───────────────────────────────────────────────────

test('previewBatch: DISARMED — never writes global.md or the processed ledger', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  const processedFile = path.join(root, 'processed.jsonl');
  const globalFile = path.join(root, 'global.md');
  const promptFile = writePromptFile(root, 'prompt.txt', 'CORRECTIONS DETECTED:\n  - Always check twice\n');
  writeQueueLines(queueFile, [
    { ts: 't1', promptFile, status: 'pending' },
    { ts: 't2', promptFile, status: 'pending' },
  ]);

  const preview = previewBatch({ queueFile, processedFile, batchSize: 50 });
  assert.equal(preview.totalPending, 2);
  assert.equal(preview.batchEntryCount, 2);
  assert.equal(preview.uniqueBuckets, 1, 'both entries share the same promptFile -> 1 bucket');
  assert.ok(!fs.existsSync(processedFile), 'preview never creates the processed ledger');
  assert.ok(!fs.existsSync(globalFile), 'preview never creates/touches global.md');
  fs.rmSync(root, { recursive: true, force: true });
});

test('previewBatch: reports sample candidates without writing them anywhere', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  const promptFile = writePromptFile(root, 'prompt.txt', 'CORRECTIONS DETECTED:\n  - Always verify twice before shipping\n');
  writeQueueLines(queueFile, [{ ts: 't1', promptFile, status: 'pending' }]);
  const preview = previewBatch({ queueFile, processedFile: path.join(root, 'processed.jsonl') });
  assert.ok(preview.buckets[0].sampleCandidates.some((c) => /verify twice before shipping/i.test(c)));
  fs.rmSync(root, { recursive: true, force: true });
});

// ─── runOnce (--once) ──────────────────────────────────────────────────────────

test('runOnce: processes a batch, appends rules, writes the processed ledger, never touches the queue file', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  const processedFile = path.join(root, 'processed.jsonl');
  const globalFile = path.join(root, 'global.md');
  const eventsFile = path.join(root, 'events.jsonl');
  const promptFile = writePromptFile(root, 'prompt.txt', 'CORRECTIONS DETECTED:\n  - Always run the test suite before claiming done\n');
  const queueContentBefore = [
    { ts: 't1', promptFile, status: 'pending' },
    { ts: 't2', promptFile, status: 'pending' },
  ];
  writeQueueLines(queueFile, queueContentBefore);
  const rawQueueBefore = fs.readFileSync(queueFile, 'utf8');

  const result = runOnce({ queueFile, processedFile, globalFile, eventsFile, batchSize: 50 });
  assert.equal(result.ok, true);
  assert.equal(result.drained, 2);
  assert.equal(result.uniqueBuckets, 1);
  assert.ok(result.rulesAppended >= 1);

  const rawQueueAfter = fs.readFileSync(queueFile, 'utf8');
  assert.equal(rawQueueBefore, rawQueueAfter, 'dream-queue.jsonl is NEVER rewritten by the drain');

  assert.ok(fs.existsSync(processedFile), 'processed ledger created');
  assert.ok(fs.existsSync(globalFile), 'global.md created/appended');
  assert.ok(fs.existsSync(eventsFile), 'event emitted');
  const event = JSON.parse(fs.readFileSync(eventsFile, 'utf8').trim().split('\n')[0]);
  assert.equal(event.comp, 'dream-drain');
  assert.equal(event.event, 'drain-batch');

  fs.rmSync(root, { recursive: true, force: true });
});

test('runOnce: idempotent — re-running with no new entries advances to the NEXT batch, does not reprocess', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  const processedFile = path.join(root, 'processed.jsonl');
  const globalFile = path.join(root, 'global.md');
  const eventsFile = path.join(root, 'events.jsonl');
  const promptFileA = writePromptFile(root, 'a.txt', 'CORRECTIONS DETECTED:\n  - Always do the first thing\n');
  const promptFileB = writePromptFile(root, 'b.txt', 'CORRECTIONS DETECTED:\n  - Never skip the second thing\n');
  writeQueueLines(queueFile, [
    { ts: 't1', promptFile: promptFileA, status: 'pending' },
    { ts: 't2', promptFile: promptFileB, status: 'pending' },
  ]);

  // batchSize=1 forces two separate batches across two runs.
  const r1 = runOnce({ queueFile, processedFile, globalFile, eventsFile, batchSize: 1 });
  assert.equal(r1.drained, 1);
  const r2 = runOnce({ queueFile, processedFile, globalFile, eventsFile, batchSize: 1 });
  assert.equal(r2.drained, 1);
  assert.notEqual(r1.batchId, r2.batchId, 'second run is a genuinely different batch');

  // A third run has nothing left to consume.
  const r3 = runOnce({ queueFile, processedFile, globalFile, eventsFile, batchSize: 1 });
  assert.equal(r3.drained, 0);
  assert.equal(r3.reason, 'no eligible pending entries');

  const { consumed } = loadProcessedLedger(processedFile);
  assert.equal(consumed.size, 2, 'both entries marked consumed exactly once');
  fs.rmSync(root, { recursive: true, force: true });
});

test('runOnce: same batch is never double-counted even if called again on an unchanged queue (true idempotency)', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  const processedFile = path.join(root, 'processed.jsonl');
  const globalFile = path.join(root, 'global.md');
  const eventsFile = path.join(root, 'events.jsonl');
  const promptFile = writePromptFile(root, 'prompt.txt', 'CORRECTIONS DETECTED:\n  - Always be idempotent\n');
  writeQueueLines(queueFile, [{ ts: 't1', promptFile, status: 'pending' }]);

  runOnce({ queueFile, processedFile, globalFile, eventsFile, batchSize: 50 });
  const globalAfterFirst = fs.readFileSync(globalFile, 'utf8');

  const second = runOnce({ queueFile, processedFile, globalFile, eventsFile, batchSize: 50 });
  assert.equal(second.drained, 0, 't1 already consumed, nothing left to drain');
  const globalAfterSecond = fs.readFileSync(globalFile, 'utf8');
  assert.equal(globalAfterFirst, globalAfterSecond, 'global.md unchanged by the no-op second run');
  fs.rmSync(root, { recursive: true, force: true });
});

test('runOnce: empty queue is a clean no-op, not an error', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  writeQueueLines(queueFile, []);
  const result = runOnce({ queueFile, processedFile: path.join(root, 'processed.jsonl'), globalFile: path.join(root, 'global.md'), eventsFile: path.join(root, 'events.jsonl') });
  assert.equal(result.ok, true);
  assert.equal(result.drained, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('runOnce: entries whose promptFile is missing are counted as unreadable, never crash the batch', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  const processedFile = path.join(root, 'processed.jsonl');
  const globalFile = path.join(root, 'global.md');
  const eventsFile = path.join(root, 'events.jsonl');
  writeQueueLines(queueFile, [
    { ts: 't1', promptFile: path.join(root, 'ghost.txt'), status: 'pending' },
  ]);
  const result = runOnce({ queueFile, processedFile, globalFile, eventsFile });
  assert.equal(result.ok, true);
  assert.equal(result.drained, 1, 'entry still counted as drained (consumed) even though unreadable');
  assert.equal(result.unreadableCount, 1);
  assert.equal(result.rulesAppended, 0, 'no content to extract rules from');
  fs.rmSync(root, { recursive: true, force: true });
});

// ─── getStatus ─────────────────────────────────────────────────────────────────

test('getStatus: reports pending/consumed/eligible counts consistent with the ledger', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  const processedFile = path.join(root, 'processed.jsonl');
  const globalFile = path.join(root, 'global.md');
  const eventsFile = path.join(root, 'events.jsonl');
  const promptFile = writePromptFile(root, 'prompt.txt', 'CORRECTIONS DETECTED:\n  - Always report status accurately\n');
  writeQueueLines(queueFile, [
    { ts: 't1', promptFile, status: 'pending' },
    { ts: 't2', promptFile, status: 'pending' },
    { ts: 't3', promptFile, status: 'processed' },
  ]);

  const before = getStatus({ queueFile, processedFile });
  assert.equal(before.pendingEntries, 2);
  assert.equal(before.eligibleForNextBatch, 2);
  assert.equal(before.batchesRun, 0);

  runOnce({ queueFile, processedFile, globalFile, eventsFile, batchSize: 1 });
  const after = getStatus({ queueFile, processedFile });
  assert.equal(after.consumedByPriorBatches, 1);
  assert.equal(after.eligibleForNextBatch, 1);
  assert.equal(after.batchesRun, 1);
  assert.ok(after.totalRulesAppended >= 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('getStatus: on a totally fresh (no ledger) queue, everything pending is eligible', () => {
  const root = tmpRoot();
  const queueFile = path.join(root, 'queue.jsonl');
  writeQueueLines(queueFile, [{ ts: 't1', promptFile: '/x', status: 'pending' }]);
  const status = getStatus({ queueFile, processedFile: path.join(root, 'nonexistent-ledger.jsonl') });
  assert.equal(status.consumedByPriorBatches, 0);
  assert.equal(status.eligibleForNextBatch, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

// ─── appendProcessedLedger (direct) ────────────────────────────────────────────

test('appendProcessedLedger: appends one jsonl line per call, loadProcessedLedger reads them all back', () => {
  const root = tmpRoot();
  const processedFile = path.join(root, 'processed.jsonl');
  appendProcessedLedger({ batchId: 'b1', consumedTs: ['t1', 't2'] }, processedFile);
  appendProcessedLedger({ batchId: 'b2', consumedTs: ['t3'] }, processedFile);
  const { consumed, records } = loadProcessedLedger(processedFile);
  assert.equal(records.length, 2);
  assert.deepEqual([...consumed].sort(), ['t1', 't2', 't3']);
  fs.rmSync(root, { recursive: true, force: true });
});
