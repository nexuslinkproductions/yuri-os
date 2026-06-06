#!/usr/bin/env node
/**
 * corpus-match.collapse.mjs — prove the TOKENIZATION-COLLAPSE fix.
 * Before: raw-token Jaccard scores a synonym/paraphrase pair with DISJOINT tokens as 0 (collapse).
 * After:  the expanded-feature engine (tok:+c4:+sem: via corpus PPMI) bridges it — and the
 * prefix-filter stays COMPLETE (== exact) over the expanded features. Also a precision check.
 */
import { buildIndex, matchExact, matchPrefixFilter } from './corpus-match.mjs';
import { makeFeatureFn } from './math/yuri-token-expand.mjs';
import { jaccard, tokenize } from './math/yuri-jaccard.mjs';

// Corpus: context docs make cortex~circuitry + plan~blueprint strong PPMI edges; the TARGET doc
// uses only the OTHER side of each synonym vs the query (fully disjoint surface tokens).
const items = [
  { id: 'ctx1', text: 'the cortex is the circuitry of the system mapping plan and blueprint' },
  { id: 'ctx2', text: 'cortex circuitry interplay plan blueprint design mapping' },
  { id: 'ctx3', text: 'cortex and circuitry plan blueprint architecture mapping' },
  { id: 'ctx4', text: 'cortex circuitry plan blueprint module mapping layout' },
  { id: 'TARGET', text: 'circuitry blueprint design module' },              // ← the collapse target (no "cortex"/"plan")
  { id: 'distract1', text: 'subdomain takeover dangling dns record alert' },
  { id: 'distract2', text: 'sql injection user profile endpoint database' },
  { id: 'distract3', text: 'reflected cross site scripting login form input' },
];
const QUERY = 'cortex plan';   // disjoint from TARGET's surface tokens ("circuitry blueprint design module")

// plain raw-token Jaccard of query vs TARGET (the collapse)
const plainQ = tokenize(QUERY), plainT = tokenize('circuitry blueprint design module');
const plainJac = jaccard(plainQ, plainT);

// build BOTH indexes
// feature-space threshold is recalibrated LOWER than raw-token t: the expanded feature set grows
// the Jaccard denominator (DeepSeek's denominator-balloon), so the operating point shifts down.
const t = 0.08;
const plainIdx = buildIndex(items, { threshold: t });
const { featureFn, expansionMap } = makeFeatureFn(items, { minCooc: 3, ppmiFloor: 0.5, topN: 4 });
const featIdx = buildIndex(items, { threshold: t, featureFn });
const plainHit = matchExact(plainIdx, QUERY, { threshold: t }).matches.find((m) => m.id === 'TARGET');
const featExact = matchExact(featIdx, QUERY, { threshold: t });
const featPF = matchPrefixFilter(featIdx, QUERY, { threshold: t });
const featHit = featExact.matches.find((m) => m.id === 'TARGET');

console.log('\n══ TOKENIZATION-COLLAPSE FIX ══');
console.log(`  query="${QUERY}"  target="circuitry blueprint design module" (disjoint surface tokens)`);
console.log(`  learned PPMI edges: cortex→[${(expansionMap.get('cortex') || []).join(',')}]  plan→[${(expansionMap.get('plan') || []).join(',')}]`);
console.log(`  PLAIN raw-token Jaccard(query,target) = ${plainJac.toFixed(3)}  → ${plainJac === 0 ? 'COLLAPSE (invisible)' : 'visible'}`);
console.log(`  PLAIN matchExact finds TARGET?   ${plainHit ? 'yes' : 'NO (collapsed)'}`);
console.log(`  FEATURE matchExact finds TARGET? ${featHit ? 'YES score=' + featHit.score : 'no'}  (bridged via sem:/c4: features)`);

// completeness: prefix-filter == exact over the expanded features
const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const complete = setEq(featExact.matches.map((m) => m.id).sort(), featPF.matches.map((m) => m.id).sort());
console.log(`\n  COMPLETENESS (feature prefix-filter == exact): ${complete ? 'PASS' : 'FAIL'}  (exact ${featExact.totalAboveThreshold}, pf ${featPF.totalAboveThreshold}, recall ${featExact.totalAboveThreshold ? (featPF.totalAboveThreshold / featExact.totalAboveThreshold * 100).toFixed(0) : 100}%)`);

// precision: the bridge must NOT pull in unrelated distractors
const pulledDistractor = featExact.matches.some((m) => m.id.startsWith('distract'));
console.log(`  PRECISION (no unrelated distractor matched): ${pulledDistractor ? 'FAIL' : 'PASS'}  (matches: ${featExact.matches.map((m) => m.id).join(', ')})`);

const ok = !plainHit && featHit && complete && !pulledDistractor;
console.log(`\n  ${ok ? 'COLLAPSE FIXED ✓ — bridged + complete + precise' : 'NOT fixed ✗'}`);
process.exitCode = ok ? 0 : 1;
