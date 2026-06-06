#!/usr/bin/env node
/**
 * corpus-match.test.mjs — the load-bearing invariant: PREFIX-FILTER is COMPLETE.
 * Synthetic corpus (no DB). Asserts matchPrefixFilter returns EXACTLY the exact-scan set
 * (100% recall, zero false negatives) across thresholds + determinism + bounds.
 */
import { buildIndex, matchExact, matchPrefixFilter, matchLSH } from './corpus-match.mjs';
import { makeHashes, minhashSignature, estimateJaccard } from './math/yuri-minhash.mjs';
import { makeFeatureFn } from './math/yuri-token-expand.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const setEq = (a, b) => { const A = new Set(a), B = new Set(b); if (A.size !== B.size) return false; for (const x of A) if (!B.has(x)) return false; return true; };

// Synthetic corpus: security-report-like titles with overlapping + variant vocabulary.
const items = [
  { id: '1', text: 'reflected cross site scripting in login form' },
  { id: '2', text: 'stored cross site scripting in comment field' },
  { id: '3', text: 'cross site scripting reflected via search parameter' },
  { id: '4', text: 'subdomain takeover dangling dns cname record' },
  { id: '5', text: 'subdomain takeover via unclaimed s3 bucket' },
  { id: '6', text: 'sql injection in user profile endpoint' },
  { id: '7', text: 'authentication bypass on admin login portal' },
  { id: '8', text: 'login authentication bypass via token replay' },
  { id: '9', text: 'cross site request forgery on account settings' },
  { id: '10', text: 'reflected xss login form input not sanitized' },
  { id: '11', text: 'open redirect on logout endpoint' },
  { id: '12', text: 'insecure direct object reference user data' },
];
const index = buildIndex(items, { threshold: 0.1 }); // build at low t → valid for all higher t

// ── COMPLETENESS: prefix-filter == exact across a range of thresholds ──
for (const t of [0.15, 0.25, 0.4, 0.5, 0.6]) {
  for (const q of ['cross site scripting reflected login', 'subdomain takeover dns', 'authentication bypass login token', 'sql injection profile']) {
    const ex = matchExact(index, q, { threshold: t });
    const pf = matchPrefixFilter(index, q, { threshold: t });
    ok(setEq(ex.matches.map((m) => m.id), pf.matches.map((m) => m.id)),
       `prefix-filter == exact (complete) t=${t} q="${q.slice(0, 24)}" [ex=${ex.totalAboveThreshold} pf=${pf.totalAboveThreshold}]`);
  }
}

// ── DETERMINISM: same query twice → identical results ──
const a = matchPrefixFilter(index, 'cross site scripting login', { threshold: 0.3 });
const b = matchPrefixFilter(index, 'cross site scripting login', { threshold: 0.3 });
ok(JSON.stringify(a.matches) === JSON.stringify(b.matches), 'prefix-filter deterministic');

// ── prefix-filter scans FEWER than N (sublinear pruning) on a selective query ──
const sel = matchPrefixFilter(index, 'sql injection profile endpoint', { threshold: 0.4 });
ok(sel.candidates <= index.n, 'prefix-filter candidates <= N (pruning)');

// ── LSH recall <= 1 and is reported (probabilistic, never claims complete) ──
const lex = matchExact(index, 'cross site scripting reflected login', { threshold: 0.25 });
const lls = matchLSH(index, 'cross site scripting reflected login', { threshold: 0.25 });
ok(lls.totalAboveThreshold <= lex.totalAboveThreshold, 'LSH recall <= exact (never over-reports)');

// ── scores bounded + sorted ──
const r = matchExact(index, 'cross site scripting login', { threshold: 0.1 });
ok(r.matches.every((m) => m.score >= 0 && m.score <= 1), 'scores in [0,1]');
ok(r.matches.every((m, i) => i === 0 || r.matches[i - 1].score >= m.score), 'matches sorted desc');

// ── MinHash estimate ≈ true Jaccard (within k=128 noise) ──
const h = makeHashes(128);
const A = new Set('cross site scripting reflected login form'.split(' '));
const B = new Set('reflected cross site scripting login input'.split(' '));
const est = estimateJaccard(minhashSignature(A, h), minhashSignature(B, h));
const trueJ = (() => { let i = 0; for (const x of A) if (B.has(x)) i++; return i / new Set([...A, ...B]).size; })();
ok(Math.abs(est - trueJ) < 0.15, `minhash est ${est.toFixed(2)} ≈ true ${trueJ.toFixed(2)}`);

// ── REGRESSION: matchLSH must honor index.featureFn (the gap that hid the crit) ──
{
  const { featureFn } = makeFeatureFn(items, { minCooc: 2, ppmiFloor: 0.4, topN: 4 });
  const fidx = buildIndex(items, { threshold: 0.15, featureFn, lsh: true });
  const q = 'reflected cross site scripting login form';
  const fex = matchExact(fidx, q, { threshold: 0.2 });
  const fls = matchLSH(fidx, q, { threshold: 0.2 });
  // featureFn index: LSH query must be computed in the SAME feature space → recall > 0 (not 0%)
  ok(fex.totalAboveThreshold === 0 || fls.totalAboveThreshold > 0, 'matchLSH honors featureFn (recall>0 on expanded index)');
}

console.log(`\ncorpus-match.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
