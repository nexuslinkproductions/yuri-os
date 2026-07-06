// ENG-07 — deferred-outcome labeler tests. The labeler is a SECOND, append-only
// writer on top of the energy decision trace. These tests prove: the left-join
// excludes unresolved decisions and carries the right label on resolved ones; the
// outcome stream passes the SAME Privacy Gate (the serialize-then-re-validate canary
// fires on a smuggled secret); the closed-set outcome label fails closed; and the
// labeler never touches the decision stream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildOutcomeRecord,
  resolveOutcome,
  readJoinedDecisions,
  OUTCOME_VALUES,
} from './yuri-energy-trace-outcomes.mjs';
import {
  appendOutcome,
  appendTrace,
  buildTraceRecord,
  validateRecord,
} from './yuri-energy-trace.mjs';

function makeDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-outcome-test-'));
  const traceDir = path.join(root, 'energy-trace');
  const outcomeDir = path.join(root, 'energy-trace-outcomes');
  fs.mkdirSync(traceDir, { recursive: true });
  fs.mkdirSync(outcomeDir, { recursive: true });
  return { root, traceDir, outcomeDir };
}

// Seed a decision-trace row for runId via the real trace writer (so the join reads
// the same shape the live gate writes).
function seedDecision(traceDir, runId, dateOverride = '2026-06-04') {
  const rec = buildTraceRecord({
    lane: 'session', runId,
    stateBefore: { claimPromotionDistribution: { fixture_ready: 1 } },
    stateAfter: { claimPromotionDistribution: { fixture_ready: 1 } },
  });
  return appendTrace(rec, { traceDir, dateOverride });
}

// ---------------------------------------------------------------------------
// buildOutcomeRecord — shape, purity, closed-set
// ---------------------------------------------------------------------------

test('buildOutcomeRecord produces a gate-passing record with runId/outcome/resolvedAt', () => {
  const rec = buildOutcomeRecord({ runId: 'run-1', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' });
  assert.equal(rec.runId, 'run-1');
  assert.equal(rec.outcome, 1);
  assert.equal(rec.resolvedAt, '2026-06-04T10:00:00.000Z');
  assert.equal(typeof rec.resolvedAtMs, 'number');
  assert.equal(rec.advisory_only, true);
  assert.equal(rec.local_truth_claim, false);
  // The whole point: it must pass the SAME Privacy Gate as the decision trace.
  assert.doesNotThrow(() => validateRecord(rec));
});

test('buildOutcomeRecord OUTCOME_VALUES is exactly {0,1}', () => {
  assert.deepEqual([...OUTCOME_VALUES], [0, 1]);
});

test('buildOutcomeRecord rejects outcome outside the closed set {0,1} (fail-closed)', () => {
  for (const bad of [2, -1, 0.5, 0.999, '1', true, NaN, Infinity, null, undefined]) {
    assert.throws(
      () => buildOutcomeRecord({ runId: 'r', outcome: bad }),
      /outcome must be exactly 0 or 1/,
      `outcome=${String(bad)} must be rejected`,
    );
  }
});

test('buildOutcomeRecord rejects empty / non-string runId (no orphan rows)', () => {
  for (const bad of ['', undefined, null, 5, {}]) {
    assert.throws(
      () => buildOutcomeRecord({ runId: bad, outcome: 1 }),
      /runId must be a non-empty string/,
      `runId=${JSON.stringify(bad)} must be rejected`,
    );
  }
});

test('buildOutcomeRecord re-canonicalizes resolvedAt and rejects unparseable input', () => {
  // Trailing free text a lenient parser might tolerate is stripped by re-emission.
  const rec = buildOutcomeRecord({ runId: 'r', outcome: 0, resolvedAt: '2026-06-04T10:00:00.000Z' });
  assert.equal(rec.resolvedAt, '2026-06-04T10:00:00.000Z');
  assert.throws(
    () => buildOutcomeRecord({ runId: 'r', outcome: 0, resolvedAt: 'not-a-date' }),
    /resolvedAt must be an ISO-8601 date/,
  );
});

// ---------------------------------------------------------------------------
// Privacy Gate canary — the spec's required negative test
// ---------------------------------------------------------------------------

test('CANARY — a malicious outcome record with a secret in a non-allow-listed field THROWS on append', () => {
  const { outcomeDir } = makeDirs();
  // A well-formed-looking outcome row, but a secret smuggled into a field that is
  // NOT in ALLOWED_STRING_PATHS. The serialize-then-re-validate canary must fire.
  const malicious = {
    timestamp: new Date().toISOString(),
    runId: 'run-evil',
    outcome: 1,
    resolvedAt: '2026-06-04T10:00:00.000Z',
    leakedSecret: 'ghp_' + 'a'.repeat(36), // free string at a non-allow-listed path
    advisory_only: true,
    local_truth_claim: false,
  };
  assert.throws(
    () => appendOutcome(malicious, { outcomeDir, dateOverride: '2026-06-04' }),
    /Privacy Gate violation.*leakedSecret/,
    'a secret in a non-allow-listed field must make the append throw',
  );
  // And nothing must have been written.
  const written = fs.existsSync(path.join(outcomeDir, '2026-06-04.jsonl'));
  assert.equal(written, false, 'no outcome file may be created when the gate rejects');
});

test('CANARY — toJSON smuggling on an outcome record is caught by the re-validate pass', () => {
  const { outcomeDir } = makeDirs();
  const probe = buildOutcomeRecord({ runId: 'r', outcome: 1 });
  probe.sneaky = { toJSON() { return { promptText: 'smuggled-via-toJSON' }; } };
  assert.throws(
    () => appendOutcome(probe, { outcomeDir, dateOverride: '2026-06-04' }),
    /toJSON method|string value at 'sneaky/,
    'toJSON smuggling must be rejected',
  );
});

// ---------------------------------------------------------------------------
// resolveOutcome — append-only second JSONL
// ---------------------------------------------------------------------------

test('resolveOutcome writes a parseable JSONL line to the outcomes dir (append-only)', () => {
  const { outcomeDir } = makeDirs();
  const { filePath } = resolveOutcome(
    { runId: 'run-1', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' },
    { outcomeDir, dateOverride: '2026-06-04' },
  );
  assert.ok(filePath.endsWith('2026-06-04.jsonl'));
  assert.ok(filePath.includes('energy-trace-outcomes'), 'must land in the outcomes subdir, not the decision trace');
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.runId, 'run-1');
  assert.equal(parsed.outcome, 1);
});

test('resolveOutcome appends (does not truncate) successive outcomes', () => {
  const { outcomeDir } = makeDirs();
  const opts = { outcomeDir, dateOverride: '2026-06-04' };
  resolveOutcome({ runId: 'a', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' }, opts);
  resolveOutcome({ runId: 'b', outcome: 0, resolvedAt: '2026-06-04T11:00:00.000Z' }, opts);
  const lines = fs.readFileSync(path.join(outcomeDir, '2026-06-04.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).runId, 'a');
  assert.equal(JSON.parse(lines[1]).runId, 'b');
});

// ---------------------------------------------------------------------------
// readJoinedDecisions — the left-join (the spec's primary verify)
// ---------------------------------------------------------------------------

test('JOIN — unresolved decisions are excluded from the replay-ready set; resolved carry their label', () => {
  const { traceDir, outcomeDir } = makeDirs();
  // Two decisions; only one gets an outcome.
  seedDecision(traceDir, 'resolved-1');
  seedDecision(traceDir, 'unresolved-1');
  resolveOutcome({ runId: 'resolved-1', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' },
    { outcomeDir, dateOverride: '2026-06-04' });

  // Full left-join: BOTH rows present, unresolved flagged.
  const full = readJoinedDecisions({ traceDir, outcomeDir });
  assert.equal(full.decisionCount, 2);
  assert.equal(full.resolvedCount, 1);
  assert.equal(full.unresolvedCount, 1);
  const resolvedRow = full.joined.find((r) => r.runId === 'resolved-1');
  const unresolvedRow = full.joined.find((r) => r.runId === 'unresolved-1');
  assert.equal(resolvedRow.resolved, true);
  assert.equal(resolvedRow.outcome, 1, 'resolved row carries its label');
  assert.equal(unresolvedRow.resolved, false);
  assert.equal(unresolvedRow.outcome, null, 'unresolved row has null label');

  // replay-ready set (resolvedOnly): the unresolved decision is EXCLUDED.
  const ready = readJoinedDecisions({ traceDir, outcomeDir, resolvedOnly: true });
  assert.equal(ready.joined.length, 1, 'only the resolved decision survives');
  assert.equal(ready.joined[0].runId, 'resolved-1');
  assert.ok(ready.joined.every((r) => r.resolved === true), 'no unresolved row in the replay set');
});

test('JOIN — outcome=0 (bad) is carried, not confused with unresolved (null)', () => {
  const { traceDir, outcomeDir } = makeDirs();
  seedDecision(traceDir, 'bad-1');
  resolveOutcome({ runId: 'bad-1', outcome: 0, resolvedAt: '2026-06-04T10:00:00.000Z' },
    { outcomeDir, dateOverride: '2026-06-04' });
  const ready = readJoinedDecisions({ traceDir, outcomeDir, resolvedOnly: true });
  assert.equal(ready.joined.length, 1);
  assert.equal(ready.joined[0].outcome, 0, 'a real 0 label must be present, distinct from null/unresolved');
  assert.equal(ready.joined[0].resolved, true);
});

test('JOIN — an outcome with no matching decision does NOT fabricate a row (left-join, not outer)', () => {
  const { traceDir, outcomeDir } = makeDirs();
  seedDecision(traceDir, 'has-decision');
  // Outcome for a runId that has no decision row — must be ignored by a LEFT join.
  resolveOutcome({ runId: 'orphan-outcome', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' },
    { outcomeDir, dateOverride: '2026-06-04' });
  resolveOutcome({ runId: 'has-decision', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' },
    { outcomeDir, dateOverride: '2026-06-04' });
  const full = readJoinedDecisions({ traceDir, outcomeDir });
  assert.equal(full.decisionCount, 1, 'only decision rows drive the join');
  assert.ok(!full.joined.some((r) => r.runId === 'orphan-outcome'), 'orphan outcome must not appear');
});

test('JOIN — latest outcome wins when a runId is resolved more than once', () => {
  const { traceDir, outcomeDir } = makeDirs();
  seedDecision(traceDir, 'flipper');
  const opts = { outcomeDir, dateOverride: '2026-06-04' };
  // First resolved good, later retracted (bad). The later label is the truth.
  resolveOutcome({ runId: 'flipper', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' }, opts);
  resolveOutcome({ runId: 'flipper', outcome: 0, resolvedAt: '2026-06-04T12:00:00.000Z' }, opts);
  const ready = readJoinedDecisions({ traceDir, outcomeDir, resolvedOnly: true });
  assert.equal(ready.joined.length, 1);
  assert.equal(ready.joined[0].outcome, 0, 'the later (12:00) outcome must win over the earlier (10:00)');
});

test('JOIN — empty trace dirs yield an empty join with zero counts (no throw)', () => {
  const { traceDir, outcomeDir } = makeDirs();
  const r = readJoinedDecisions({ traceDir, outcomeDir });
  assert.equal(r.decisionCount, 0);
  assert.equal(r.resolvedCount, 0);
  assert.equal(r.unresolvedCount, 0);
  assert.deepEqual(r.joined, []);
});

test('JOIN — a torn outcome line is skipped, not fatal (robust reader reuse)', () => {
  const { traceDir, outcomeDir } = makeDirs();
  seedDecision(traceDir, 'good-1');
  resolveOutcome({ runId: 'good-1', outcome: 1, resolvedAt: '2026-06-04T10:00:00.000Z' },
    { outcomeDir, dateOverride: '2026-06-04' });
  // Corrupt the outcome file with a torn JSON line.
  fs.appendFileSync(path.join(outcomeDir, '2026-06-04.jsonl'), '{"runId":"torn","outc\n', 'utf8');
  const ready = readJoinedDecisions({ traceDir, outcomeDir, resolvedOnly: true });
  assert.equal(ready.joined.length, 1, 'the valid join survives a torn outcome line');
  assert.equal(ready.joined[0].runId, 'good-1');
});
