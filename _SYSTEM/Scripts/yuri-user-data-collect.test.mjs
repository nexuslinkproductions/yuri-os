import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectTraceForExport, collectDay } from './yuri-user-data-collect.mjs';
import { validateRecord } from './math/yuri-energy-trace.mjs';

const sampleTrace = {
  timestamp: '2026-05-30T10:00:00.000Z', runId: 'main-123', lane: 'main', user: 'mike',
  regime: 'action', event: 'Proposal Accepted',
  U_before: 0, U_after: -1.5, deltaU: -1.5,
  componentContributions: { evidence: -1.0, violations: 0 },
  decision: 'accept', dominantTerm: 'evidence', threshold: 0, weights: { a: 1 },
  stateBefore_summary: { verifiedEvidenceCount: 3 }, advisory_only: true,
};

test('projectTraceForExport keeps only gate-safe export fields', () => {
  const out = projectTraceForExport(sampleTrace);
  assert.deepEqual(Object.keys(out).sort(), [
    'U_after', 'U_before', 'componentContributions', 'decision', 'deltaU',
    'dominantTerm', 'event', 'lane', 'regime', 'timestamp', 'user',
  ].sort());
  assert.equal(out.user, 'mike');
  assert.equal(out.regime, 'action');
  assert.equal(out.event, 'Proposal Accepted');
  assert.doesNotThrow(() => validateRecord(out));
});

test('projectTraceForExport drops unknown / free-text fields (fail-closed)', () => {
  const out = projectTraceForExport({ ...sampleTrace, promptText: 'secret', filePath: '/Users/x', weights: { a: 1 } });
  assert.equal(out.promptText, undefined);
  assert.equal(out.filePath, undefined);
  assert.equal(out.weights, undefined);
});

test('projectTraceForExport coerces non-numeric energy fields to 0', () => {
  const out = projectTraceForExport({ ...sampleTrace, deltaU: 'NaN-ish', U_after: undefined });
  assert.equal(out.deltaU, 0);
  assert.equal(out.U_after, 0);
});

test('projectTraceForExport normalizes an unknown regime to observability', () => {
  const out = projectTraceForExport({ ...sampleTrace, regime: 'garbage' });
  assert.equal(out.regime, 'observability');
});

test('collectDay reads a raw jsonl, filters by user, returns projected records', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  const day = '2026-05-30';
  const lines = [
    { ...sampleTrace, user: 'mike', runId: 'a' },
    { ...sampleTrace, user: 'marcel', runId: 'b' },
    { ...sampleTrace, user: 'mike', runId: 'c' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, `${day}.jsonl`), lines);
  const out = collectDay({ traceDir: dir, day, user: 'mike' });
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.user === 'mike'));
  // projection stripped runId (not a gate-safe export field)
  assert.equal(out[0].runId, undefined);
});

test('collectDay returns [] when the day file is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  assert.deepEqual(collectDay({ traceDir: dir, day: '2099-01-01', user: 'mike' }), []);
});

test('collectDay skips malformed JSON lines without throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  const day = '2026-05-30';
  fs.writeFileSync(path.join(dir, `${day}.jsonl`),
    JSON.stringify({ ...sampleTrace, user: 'mike' }) + '\n{ broken json\n' + JSON.stringify({ ...sampleTrace, user: 'mike', runId: 'z' }) + '\n');
  const out = collectDay({ traceDir: dir, day, user: 'mike' });
  assert.equal(out.length, 2);
});
