#!/usr/bin/env node
/**
 * yuri-token-expand.test.mjs — full-surface unit + invariant + mutation-killing tests for the
 * embedding-free semantic bridging layer (yuri-token-expand.mjs). Covers EVERY export, determinism,
 * the namespaced FEATURE contract (tok:/c4:/sem:) that keeps the prefix-filter complete, the PPMI
 * math (ppmi(a,a)===0, symmetry, absent-pair zero), and the precision/perf guards (per-doc token
 * clamp, expWeight down-weighting). Folds the mutation-sweep survivors C3 #6–#14.
 *
 * House style: synchronous, no framework. `ok(cond, name)`; cold checks that can FAIL.
 */
import {
  charShingles, tokenCharSim, buildCooccurrence, ppmi, buildExpansionMap,
  expandTokenSet, weightedJaccard, features, makeFeatureFn, plainFeatureFn,
  buildPpmiProfiles, sparseCosine, buildSecondOrderMap,
} from './yuri-token-expand.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const setEq = (a, b) => { const A = new Set(a), B = new Set(b); if (A.size !== B.size) return false; for (const x of A) if (!B.has(x)) return false; return true; };

// ── charShingles ─────────────────────────────────────────────────────────────────────────────
ok(setEq(charShingles('cat'), ['^ca', 'cat', 'at$']), 'charShingles("cat") = {^ca,cat,at$} (padded 3-grams)');
ok(setEq(charShingles('a'), ['^a$']), 'charShingles short token (len ≤ k) → single padded gram');
ok(setEq(charShingles('cat'), charShingles('cat')), 'charShingles deterministic');
ok(charShingles('scripting', 4).size >= 1 && [...charShingles('scripting', 4)].every((g) => g.length === 4), 'charShingles honors k=4 gram length');

// ── tokenCharSim (morphology / spelling bridge) ──────────────────────────────────────────────
ok(tokenCharSim('script', 'script') === 1, 'tokenCharSim identical === 1');
// Deterministic → pin exact (C8 #9): a mutant returning a broad bucket value survives a loose >0.4/<0.2.
ok(tokenCharSim('script', 'scripting') === 0.5, 'tokenCharSim("script","scripting") === 0.5 exact (morphology bridge)');
ok(tokenCharSim('script', 'subdomain') === 0, 'tokenCharSim unrelated tokens === 0 exact');
ok(tokenCharSim('script', 'scripting') === tokenCharSim('scripting', 'script'), 'tokenCharSim symmetric');
{ const s = tokenCharSim('login', 'signin'); ok(s >= 0 && s <= 1, 'tokenCharSim ∈ [0,1]'); }

// ── buildCooccurrence + the per-doc token clamp (C3 #10, corrected vs live code) ───────────────
{
  const corpus = ['alpha beta gamma', 'alpha beta delta', 'alpha beta', 'epsilon zeta'];
  const stats = buildCooccurrence(corpus);
  ok(stats.N === 4, 'buildCooccurrence N === #docs');
  ok(stats.df.get('alpha') === 3 && stats.df.get('gamma') === 1, 'buildCooccurrence df (doc frequency) correct');
  ok(stats.cooc.get('alpha\x01beta') === 3, 'buildCooccurrence co-doc count correct (alpha\\x01beta in 3 docs — \\x01-delimited key, no concat ambiguity)');

  // 250 distinct len≥3 tokens in one doc → exercise the clamp. NOTE (verified vs live code):
  // maxTokensPerDoc = Math.min(isFinite(opt)&&opt>0 ? opt : 40, 200).
  //   • finite 5000 → min(5000,200) = 200  → df.size === 200 (hard clamp at 200)
  //   • Infinity    → isFinite false → 40   → df.size === 40  (NOT 200 — the C3 readout was wrong)
  const bigDoc = Array.from({ length: 250 }, (_, i) => 'wrd' + i).join(' ');
  ok(buildCooccurrence([bigDoc], { maxTokensPerDoc: 5000 }).df.size === 200, 'per-doc clamp caps at 200 for an oversized finite override');
  ok(buildCooccurrence([bigDoc], { maxTokensPerDoc: Infinity }).df.size === 40, 'non-finite (Infinity) override falls back to the 40 default — adversarial-input guard');
  ok(buildCooccurrence([bigDoc]).df.size === 40, 'default per-doc cap = 40');
}

// ── ppmi: ppmi(a,a)===0, symmetry, absent-pair zero, positive on real association (C3 #14) ─────
{
  const stats = buildCooccurrence(['alpha beta gamma', 'alpha beta delta', 'alpha beta', 'epsilon zeta']);
  ok(ppmi('alpha', 'alpha', stats) === 0, 'ppmi(a,a) === 0 (M23 — no self-information edge)');
  ok(ppmi('alpha', 'beta', stats) === ppmi('beta', 'alpha', stats), 'ppmi symmetric');
  // Pin the exact PPMI value (C8 #10): >0 alone survives a wrong log base / denominator / count formula.
  ok(approx(ppmi('alpha', 'beta', stats), 0.41503749927884376, 1e-12), 'ppmi(alpha,beta) === log2(4/3) exact (pins the formula)');
  ok(ppmi('alpha', 'epsilon', stats) === 0, 'ppmi === 0 for a never-co-occurring pair (no spurious edge)');
}

// ── doc-frequency invariant (C8 #11): df/cooc count DOCUMENTS, not in-doc token repeats ──────────
{
  const s = buildCooccurrence(['alpha alpha beta']);
  ok(s.df.get('alpha') === 1, 'buildCooccurrence df counts the doc once even with a repeated token (tokenize→Set)');
  ok(s.cooc.get('alpha\x01beta') === 1, 'buildCooccurrence co-doc count is 1 (not inflated by the repeat)');
}

// ── buildExpansionMap: minCooc exact boundary + topN cap + strongest-first ordering (C3 #11,#12) ─
{
  // alpha co-occurs with beta strongly (c=3) and gamma weakly (c=2, but gamma also appears solo →
  // lower PPMI). Lets us assert ordering (beta before gamma) and the minCooc boundary.
  const corpus = ['alpha beta', 'alpha beta', 'alpha beta', 'alpha gamma', 'alpha gamma', 'gamma', 'gamma', 'delta epsilon'];
  const stats = buildCooccurrence(corpus);
  const mapBoundary = buildExpansionMap(stats, { minCooc: 3, ppmiFloor: 0, topN: 4 }); // alphabeta c=3, 3<3 false → kept
  ok((mapBoundary.get('alpha') || []).includes('beta'), 'buildExpansionMap keeps a pair at the exact minCooc boundary (c === minCooc)');
  const mapAbove = buildExpansionMap(stats, { minCooc: 4, ppmiFloor: 0, topN: 4 }); // alphabeta c=3, 3<4 true → dropped
  ok(!(mapAbove.get('alpha') || []).includes('beta'), 'buildExpansionMap drops a pair below minCooc (c < minCooc)');
  const ranked = buildExpansionMap(stats, { minCooc: 2, ppmiFloor: 0, topN: 1 }).get('alpha');
  ok(ranked && ranked[0] === 'beta', 'buildExpansionMap returns strongest-PPMI neighbor first (topN cap respected)');
  ok((buildExpansionMap(stats, { minCooc: 2, ppmiFloor: 0, topN: 1 }).get('alpha') || []).length <= 1, 'buildExpansionMap honors topN cap');
}

// ── expandTokenSet: '~'-tagged neighbors + perToken cap + original tokens kept (C3 #13) ─────────
{
  const m = new Map([['login', ['password', 'token']]]);
  ok(setEq(expandTokenSet('login', m, { perToken: 1 }), ['login', '~password']), 'expandTokenSet tags neighbors with ~ and honors perToken=1');
  ok(setEq(expandTokenSet('login', m, { perToken: 2 }), ['login', '~password', '~token']), 'expandTokenSet adds up to perToken neighbors');
  ok(expandTokenSet('orphan', m).has('orphan'), 'expandTokenSet keeps original tokens with no neighbors');
}

// ── weightedJaccard: expansion (~) tokens down-weighted by expWeight (C3 #9) ────────────────────
ok(weightedJaccard(new Set(['a', '~x']), new Set(['b', '~x']), { expWeight: 0.5 }) === 0.2, 'weightedJaccard down-weights ~ tokens (0.5/2.5 === 0.2)');
ok(weightedJaccard(new Set(['a', 'b']), new Set(['a', 'b'])) === 1, 'weightedJaccard identical full-weight sets === 1');
ok(weightedJaccard(new Set(), new Set()) === 0, 'weightedJaccard of empties === 0');
ok(weightedJaccard(new Set(['a']), new Set(['~a']), { expWeight: 0.5 }) === 0, 'weightedJaccard treats "a" and "~a" as distinct features (no accidental match)');

// ── features: namespaced tok:/c4:/sem: contract + chargram boundary + cap + sem symmetry ────────
{
  const f1 = features('abcde'); // len-5 → c4 boundary (C3 #6)
  ok(f1.has('tok:abcde'), 'features emits tok: feature');
  ok(f1.has('c4:abcd') && f1.has('c4:bcde'), 'features emits c4 grams for a len-5 token (>=5 boundary, C3 #6)');
  ok(!features('abc').has('c4:abc'), 'features emits NO c4 for a sub-5-length token');

  const grams = [...features('abcdefghijk')].filter((x) => x.startsWith('c4:')); // CHARGRAM_MAX cap (C3 #7)
  ok(grams.length === 6, `features caps c4 grams at CHARGRAM_MAX=6 (got ${grams.length})`);
  ok(grams.includes('c4:abcd') && grams.includes('c4:fghi'), 'features c4 grams are the first 6 sliding windows');

  // sem: edge uses a SYMMETRIC ordered key so query/doc bridge the same edge regardless of side (C3 #8).
  // Assert BOTH directions produce the SAME ordered key (C8 #12) — a one-orientation mutant survives one-sided checks.
  const semFwd = features('signin', { expansionMap: new Map([['signin', ['login']]]) });
  const semRev = features('login', { expansionMap: new Map([['login', ['signin']]]) });
  ok(semFwd.has('sem:login~signin'), 'features sem: edge ordered (signin→login side) === login~signin');
  ok(semRev.has('sem:login~signin'), 'features sem: edge ordered (login→signin side) === login~signin (symmetric key both directions)');

  ok(setEq(features('login form'), features('login form')), 'features deterministic');
}

// ── makeFeatureFn + plainFeatureFn ───────────────────────────────────────────────────────────
{
  const items = [
    { id: '1', text: 'login requires a password and auth token' },
    { id: '2', text: 'signin requires a password and auth token' },
    { id: '3', text: 'subdomain takeover dangling dns record' },
  ];
  const { featureFn, stats, expansionMap } = makeFeatureFn(items, { minCooc: 2, ppmiFloor: 0.5, topN: 4 });
  ok(typeof featureFn === 'function' && stats && expansionMap instanceof Map, 'makeFeatureFn returns {featureFn, stats, expansionMap}');
  ok(setEq(featureFn('login password'), featureFn('login password')), 'makeFeatureFn featureFn deterministic');
  ok([...featureFn('login password')].some((x) => x.startsWith('tok:')), 'makeFeatureFn featureFn emits tok: features');

  const pf = plainFeatureFn('cross site scripting');
  ok([...pf].every((x) => !x.startsWith('sem:')), 'plainFeatureFn emits NO sem: features (no corpus dependency)');
  ok([...pf].some((x) => x.startsWith('tok:')) && [...pf].some((x) => x.startsWith('c4:')), 'plainFeatureFn emits tok: + c4: features');
}

// ── SECOND-ORDER PPMI-profile-cosine synonym bridge (the never-co-occur synonym layer) ──────────
{
  // login & signin NEVER co-occur in any doc, but share an identical context profile (password/auth/...).
  const corpus = [
    'login requires password auth token', 'login form credential check', 'login account password reset',
    'signin requires password auth token', 'signin form credential check', 'signin account password reset',
    'subdomain takeover dangling dns record',
  ];
  const stats = buildCooccurrence(corpus, { minCooc: 2 });
  const second = buildSecondOrderMap(stats, { minProfilePpmi: 0.1, minProfileDims: 2, secondOrderFloor: 0.7, secondOrderTopN: 3 });

  ok((second.get('login') || []).includes('signin'), 'buildSecondOrderMap bridges login→signin (never co-occur, shared profile)');
  ok((second.get('signin') || []).includes('login'), 'buildSecondOrderMap is symmetric: signin→login');
  ok(!(second.get('login') || []).includes('password'), 'excludeFirstOrder: login does NOT list password (they DO co-occur — first-order, not sem2)');

  // features() emits the symmetric sem2: edge from BOTH sides → prefix-filter stays complete.
  ok(features('login', { secondOrderMap: second }).has('sem2:login~signin'), 'features sem2 edge from login side');
  ok(features('signin', { secondOrderMap: second }).has('sem2:login~signin'), 'features sem2 edge from signin side (same ordered key)');
  ok(![...features('login')].some((f) => f.startsWith('sem2:')), 'features emits NO sem2 without a secondOrderMap (backward-compatible)');

  // determinism + precision gates
  ok(JSON.stringify([...buildSecondOrderMap(stats)]) === JSON.stringify([...buildSecondOrderMap(stats)]), 'buildSecondOrderMap deterministic');
  ok((buildSecondOrderMap(stats, { minProfilePpmi: 0.1, secondOrderFloor: 0.7, secondOrderTopN: 1 }).get('login') || []).length <= 1, 'secondOrderTopN caps synonyms per term');
  ok(buildSecondOrderMap(stats, { minProfilePpmi: 0.1, secondOrderFloor: 1.01 }).size === 0, 'secondOrderFloor > 1 → no synonyms (cosine ≤ 1, gate works)');

  // sparseCosine contract
  const prof = buildPpmiProfiles(stats, { minProfilePpmi: 0.1 });
  ok(sparseCosine(prof.get('login'), prof.get('login')) === 1, 'sparseCosine(x,x) === 1');
  ok(approx(sparseCosine(prof.get('login'), prof.get('signin')), 1, 1e-9), 'sparseCosine(login,signin) === 1 (identical context profiles here)');
  ok(sparseCosine(new Map(), prof.get('login')) === 0, 'sparseCosine with an empty profile === 0');
  ok(sparseCosine(new Map([['x', 1]]), new Map([['y', 1]])) === 0, 'sparseCosine of disjoint profiles === 0');
  ok((prof.get('login') || new Map()).has('password') && prof.get('login').has('auth'), 'buildPpmiProfiles: login profile carries password + auth context dims');

  // makeFeatureFn: second-order is OPT-IN (default off → shipped corpus-match feature space unchanged)
  const items = corpus.map((t, i) => ({ id: String(i), text: t }));
  ok(makeFeatureFn(items, { minCooc: 2 }).secondOrderMap === null, 'makeFeatureFn second-order OFF by default (no silent feature-space change)');
  const on = makeFeatureFn(items, { minCooc: 2, secondOrder: true, minProfilePpmi: 0.1, secondOrderFloor: 0.7 });
  ok(on.secondOrderMap instanceof Map && on.secondOrderMap.size > 0, 'makeFeatureFn { secondOrder:true } builds the map');
  ok([...on.featureFn('login')].some((f) => f.startsWith('sem2:')), 'makeFeatureFn opt-in featureFn emits sem2 edges');
}

console.log(`\nyuri-token-expand.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
