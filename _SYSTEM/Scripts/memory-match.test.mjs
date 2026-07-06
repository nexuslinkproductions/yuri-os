#!/usr/bin/env node
import { openColdStore, upsertCold, queryCold } from './memory-cold-store.mjs';
import { blendMemoryRecall, buildMemoryIndex, coldStoreToRecords, recallMemory } from './memory-match.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const hasAll = (haystack, needles) => {
  const s = new Set(haystack);
  return needles.every((n) => s.has(n));
};

const db = openColdStore(':memory:');
const relevant = Array.from({ length: 8 }, (_, i) => `memory-${i + 1}`);
for (const slug of relevant) {
  upsertCold(db, {
    slug,
    title: `Authentication bypass recall ${slug}`,
    body: 'authentication bypass login token recall gate subconscious memory',
    trig: 'auth bypass recall',
  });
}
upsertCold(db, {
  slug: 'unrelated',
  title: 'Archive cleanup',
  body: 'calendar archive rendering css notes',
  trig: 'archive css',
});

const records = coldStoreToRecords(db);
ok(records.length === 9, 'coldStoreToRecords reads every cold_docs row as {id,text}');
ok(records.every((r) => r.id && r.text.includes(r.id)), 'coldStoreToRecords includes slug in text');

const index = buildMemoryIndex(records, { threshold: 0.25 });
const recall = recallMemory(index, 'authentication bypass login token recall', { threshold: 0.25 });
const recallIds = recall.matches.map((m) => m.id);
ok(recall.complete === true, 'recallMemory uses a complete prefix-filter index');
ok(recall.totalAboveThreshold === 8, 'matcher reports the full above-threshold memory count');
ok(hasAll(recallIds, relevant), 'matcher returns every relevant memory above threshold');
ok(!recallIds.includes('unrelated'), 'matcher excludes unrelated memory below threshold');

const exactTruth = relevant;
const bm25TopFive = queryCold(db, 'authentication bypass login token recall', { topK: 2 }).slice(0, 5);
ok(bm25TopFive.length === 5, 'BM25 surfaced top-K fixture contains five rows');
ok(recall.totalAboveThreshold > bm25TopFive.length, 'completeness proof is non-vacuous: truth set is larger than BM25 top-K');
ok(hasAll(recallIds, exactTruth), 'matcher recall is a superset of the full truth set that BM25 top-K truncates');

const blended = blendMemoryRecall(bm25TopFive, recall.matches);
const blendedIds = blended.map((x) => x.id);
ok(blended.length === 8, 'blendMemoryRecall returns the union, not BM25-only truncation');
ok(hasAll(blendedIds, relevant), 'blendMemoryRecall preserves matcher-only memories');
ok(blended.find((x) => x.id === bm25TopFive[0].slug)?.provenance.includes('bm25'), 'blendMemoryRecall marks BM25 provenance');
ok(blended.find((x) => x.id === relevant[7])?.provenance.includes('matcher'), 'blendMemoryRecall marks matcher provenance');

db.close();

console.log(`\nmemory-match.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
