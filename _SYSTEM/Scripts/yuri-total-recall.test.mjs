#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { decay, salience, selectRecall, totalRecall } from './yuri-total-recall.mjs';
import { recordEvent } from './yuri-nerve.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// --- decay: recency term, monotonic ---
ok(decay(0) === 1, 'decay(0) = 1');
ok(Math.abs(decay(72, 72) - 0.5) < 1e-9, 'decay(halfLife) = 0.5');
ok(decay(10) > decay(100), 'decay is monotonic decreasing in age');

// --- salience: recent+important > old+trivial; query relevance lifts it ---
const now = 1000 * 3600000;
const recentImportant = { title: 'fix the fail-open gate', timeMs: now - 1 * 3600000, weight: 0.9, infoGain: 0.8, terms: ['fix', 'the', 'fail', 'open', 'gate'], tokens: 20 };
const oldTrivial = { title: 'minor doc tweak', timeMs: now - 300 * 3600000, weight: 0.2, infoGain: 0.2, terms: ['minor', 'doc', 'tweak'], tokens: 12 };
ok(salience(recentImportant, '', now) > salience(oldTrivial, '', now), 'recent+important outranks old+trivial');
ok(salience(recentImportant, 'gate fix', now) > salience(recentImportant, '', now), 'query relevance raises salience');
ok(salience({ title: 'x', timeMs: null, weight: 0.5, infoGain: 0.4 }, '', now) > 0, 'undated event still scores (flat recency, not zero)');

// --- selectRecall: budget-constrained MMR (short + selective, de-dups near-duplicates) ---
const dup1 = { id: 'a', title: 'fix the gate', salience: 0.9, terms: ['fix', 'the', 'gate'], tokens: 50 };
const dup2 = { id: 'b', title: 'fix the gate now', salience: 0.85, terms: ['fix', 'the', 'gate', 'now'], tokens: 50 };
const diff = { id: 'c', title: 'total recall salience', salience: 0.7, terms: ['total', 'recall', 'salience'], tokens: 50 };
const sel = selectRecall([dup1, dup2, diff], { budgetTokens: 120, lambda: 0.7 });
ok(sel.items.length === 2, 'budget 120 with 50-token items fits exactly 2');
ok(sel.items[0].id === 'a', 'highest salience chosen first');
ok(sel.items.some((x) => x.id === 'c') && !sel.items.some((x) => x.id === 'b'), 'MMR prefers the diverse item over the near-duplicate');
ok(sel.budgetUsed <= 120, 'token budget respected');

// --- totalRecall integration: invariants hold regardless of live git content ---
const STORE = path.join('/tmp', 'tr-test-fixed.jsonl');
try { fs.unlinkSync(STORE); } catch { /* ignore */ }
recordEvent({ kind: 'fix', title: 'D-1 traversal fix at the protected gate', weight: 0.9, stamp: '2026-06-09T01:00:00Z' }, { store: STORE });
recordEvent({ kind: 'idea', title: 'some random low-value idea', weight: 0.2, stamp: '2026-06-09T00:00:00Z' }, { store: STORE });
const tr = totalRecall({ sinceHours: 99999, store: STORE, budgetTokens: 1200, nowMs: Date.parse('2026-06-09T02:00:00Z') });
ok(tr.op === 'total_recall' && Array.isArray(tr.items), 'totalRecall returns the recall envelope');
ok(tr.selectedCount <= tr.candidateCount, 'selected ≤ candidates');
ok(tr.budgetUsed <= tr.budgetTokens, 'budget respected end-to-end');
ok(tr.items.some((x) => x.id.startsWith('nerve.fix')), 'the nerve fix event is recallable');
// the high-value fix outranks the low-value idea
const fixRank = tr.items.findIndex((x) => x.kind === 'fix');
const ideaRank = tr.items.findIndex((x) => x.kind === 'idea');
ok(fixRank >= 0 && (ideaRank < 0 || fixRank < ideaRank), 'the important fix recalls above the trivial idea');
try { fs.unlinkSync(STORE); } catch { /* ignore */ }

// 10f (math-base wave): MMR stops at non-positive marginal — a redundant
// duplicate is never added just to fill budget.
{
  const a = { id: 'a', title: 'alpha beta gamma', terms: ['alpha', 'beta', 'gamma'], salience: 1, tokens: 10 };
  const b = { id: 'b', title: 'alpha beta gamma', terms: ['alpha', 'beta', 'gamma'], salience: 0.5, tokens: 10 };
  const r = selectRecall([a, b], { budgetTokens: 1000, lambda: 0.7 });
  ok(r.items.length === 1, `negative-marginal duplicate excluded (got ${r.items.length})`);
}

console.log(`\nyuri-total-recall.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
