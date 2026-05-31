import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rankRecall, recall, renderRecallBlock } from './yuri-recall.mjs';
import { openColdStore, upsertCold } from './memory-cold-store.mjs';
import { buildUsageIndex } from './memory-usage.mjs';

const DAY = 86400000;

test('rankRecall: salience + recency lift score; recent beats stale at equal bm25', () => {
  const now = 10 * DAY;
  const hits = [
    { slug: 'old', bm25: -1, salience: 0, crosslinks: '' },
    { slug: 'recent', bm25: -1, salience: 0, crosslinks: '' },
    { slug: 'salient', bm25: -1, salience: 5, crosslinks: '' },
  ];
  const usageIndex = { recent: { lastUsedMs: now }, old: { lastUsedMs: 0 } };
  const ranked = rankRecall(hits, { usageIndex, nowMs: now, topK: 3 });
  assert.equal(ranked[0].slug, 'salient');
  assert.ok(ranked.findIndex((r) => r.slug === 'recent') < ranked.findIndex((r) => r.slug === 'old'));
});

test('rankRecall: a high relevance floor surfaces nothing; topK caps the count', () => {
  assert.equal(rankRecall([{ slug: 'a', bm25: -0.1 }, { slug: 'b', bm25: -0.05 }], { relevanceFloor: 1 }).length, 0);
  assert.equal(rankRecall([{ slug: 'a', bm25: -1 }, { slug: 'b', bm25: -1 }, { slug: 'c', bm25: -1 }], { topK: 2 }).length, 2);
});

test('rankRecall: 1-hop spreading activation boosts a crosslinked-to item', () => {
  const hits = [
    { slug: 'hub', bm25: -1, crosslinks: 'spoke' },
    { slug: 'spoke', bm25: -1, crosslinks: '' },
    { slug: 'lone', bm25: -1, crosslinks: '' },
  ];
  const ranked = rankRecall(hits, { topK: 3, weights: { crosslink: 1.0 } });
  const spoke = ranked.find((r) => r.slug === 'spoke');
  const lone = ranked.find((r) => r.slug === 'lone');
  assert.ok(spoke.score > lone.score);
});

test('recall: surfaces from cold store AND bumps the ledger (reactivation strengthens the trace)', () => {
  const ledgerFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rec-')), 'memory-usage.jsonl');
  const db = openColdStore(':memory:');
  upsertCold(db, { slug: 'lyap', title: 'Lyapunov', body: 'the lyapunov energy gate', trig: 'energy gate lyapunov' });
  const ranked = recall('lyapunov gate', { coldDb: db, ledgerFile, nowMs: 1000 });
  assert.ok(ranked.some((r) => r.slug === 'lyap'));
  assert.equal(buildUsageIndex({ ledgerFile }).lyap.useCount, 1);
  db.close();
});

test('renderRecallBlock: empty when nothing surfaced, wrapped otherwise', () => {
  assert.equal(renderRecallBlock([]), '');
  assert.ok(renderRecallBlock([{ slug: 'x', snip: 'hi' }]).includes('<subconscious-recall>'));
});
