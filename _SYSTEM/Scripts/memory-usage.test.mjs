import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordUse, buildUsageIndex, usageFor } from './memory-usage.mjs';

const tmpLedger = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'usage-')), 'memory-usage.jsonl');

test('recordUse appends and buildUsageIndex replays useCount + lastUsed', () => {
  const f = tmpLedger();
  recordUse('alpha', { event: 'recall', nowMs: 1000, ledgerFile: f });
  recordUse('alpha', { event: 'recall', nowMs: 5000, ledgerFile: f });
  const idx = buildUsageIndex({ ledgerFile: f });
  assert.equal(idx.alpha.useCount, 2);
  assert.equal(idx.alpha.lastUsedMs, 5000);     // latest wins
  assert.equal(idx.alpha.firstSeenMs, 1000);
});

test('reinforce counts as use AND advances lastReinforced', () => {
  const f = tmpLedger();
  recordUse('beta', { event: 'recall', nowMs: 1000, ledgerFile: f });
  recordUse('beta', { event: 'reinforce', nowMs: 2000, ledgerFile: f });
  const idx = buildUsageIndex({ ledgerFile: f });
  assert.equal(idx.beta.useCount, 2);
  assert.equal(idx.beta.lastReinforcedMs, 2000);
  assert.equal(idx.beta.lastUsedMs, 2000);
});

test('usageFor returns {} for an unknown slug; missing ledger fails safe', () => {
  const f = tmpLedger();
  assert.deepEqual(usageFor('ghost', { ledgerFile: f }), {});
  assert.deepEqual(buildUsageIndex({ ledgerFile: path.join(os.tmpdir(), 'does-not-exist-xyz.jsonl') }), {});
});

test('malformed lines are skipped, valid ones still parse (fail-safe replay)', () => {
  const f = tmpLedger();
  recordUse('gamma', { event: 'recall', nowMs: 100, ledgerFile: f });
  fs.appendFileSync(f, '{ broken json\n');                       // garbage line
  fs.appendFileSync(f, JSON.stringify({ slug: 'gamma', t: 'NaN', event: 'recall' }) + '\n'); // bad t
  recordUse('gamma', { event: 'recall', nowMs: 300, ledgerFile: f });
  const idx = buildUsageIndex({ ledgerFile: f });
  assert.equal(idx.gamma.useCount, 2);                           // only the 2 valid events
  assert.equal(idx.gamma.lastUsedMs, 300);
});

test('recordUse rejects a bad slug and never throws', () => {
  const f = tmpLedger();
  assert.equal(recordUse('', { ledgerFile: f }), false);
  assert.equal(recordUse(null, { ledgerFile: f }), false);
});
