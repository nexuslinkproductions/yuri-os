#!/usr/bin/env node
/**
 * Tests for prose-claim-extractor.mjs (3b). Locks the invariants the Wave-3 keystone rests on,
 * INCLUDING the red-team hardening (2026-06-13, 50 confirmed findings → 6 clusters):
 *   core:      over-claim→RETRACT, disclaimer→neutralized, real evidence→pass, anchor stability,
 *              untrackedRetract===0, partition aggregate
 *   cluster A: modality (question/future/conditional/obligation/reported) → neutralized
 *   cluster B: function-word/anaphor subjects → dropped, not anchored as junk
 *   cluster C: forged prose evidence → RETRACT; only filesystem-RESOLVABLE refs lift a claim
 *   cluster D/E: separator spelling variants canonicalize to one anchor; retractsByTarget metric
 *   cluster F: zero-width / RTL injection does NOT manufacture churn
 *   cluster G: missing nowMs is fail-closed (throws)
 *
 * Run: node --test _SYSTEM/Scripts/prose-claim-extractor.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractClaims, measureClaims, statementHash, anchorIdentity, normalizeTarget, isModal, mergeLedgers,
} from './prose-claim-extractor.mjs';

const NOW = 1_781_000_000_000; // fixed injected clock (deterministic)
// a file that genuinely exists in the repo — used to test FS-resolved evidence.
const REAL_TEST_FILE = '_SYSTEM/Scripts/prose-claim-extractor.test.mjs';

test('canonical over-claim (high rung, no evidence) → RETRACT', () => {
  const claims = extractClaims('The widget-engine is fully verified.', { nowMs: NOW });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].claimedStatus, 'runtime_tested');
  assert.equal(claims[0].evidence.length, 0);
  assert.equal(measureClaims(claims, { nowMs: NOW }).assessments[0].verdict, 'RETRACT');
});

test('negation / disclaimer is neutralized (no claim)', () => {
  for (const s of [
    'gate-x is not wired — zero live callers.',
    'foo-bar is design-only and advisory-only.',
    'The drain-loop is dead and inert, never fired.',
    'The parser is WIP but is wired.',
  ]) assert.equal(extractClaims(s, { nowMs: NOW }).length, 0, `must neutralize: "${s}"`);
});

test('CLUSTER A — modality (question/future/conditional/obligation/reported) → neutralized', () => {
  const modal = [
    'Is the claim-cortex wired into the hot path?',
    'The energy-gate will be fully verified once the test suite runs.',
    'If the parser-core were verified, it would block all mutations.',
    'The gate-module must be fully tested before any promotion.',
    'We will verify the sync-engine and ship it once tests green.',
    'The spec says the auth-module is verified and production-ready.',
    'After the beta-core ships, we expect all claims to be verified.',
  ];
  for (const s of modal) {
    assert.ok(isModal(s), `isModal should fire: "${s}"`);
    assert.equal(extractClaims(s, { nowMs: NOW }).length, 0, `modality must neutralize: "${s}"`);
  }
});

test('CLUSTER B — function-word / anaphor subjects produce NO junk anchor', () => {
  // these must NOT yield anchors like if:, says:, we:, above:, call:, hot:
  for (const s of [
    'The above is now wired.',
    'It is now live and wired into the hot path.',
    'The gate fires on every tool call.',
  ]) {
    const claims = extractClaims(s, { nowMs: NOW });
    for (const c of claims) {
      assert.ok(!['if', 'says', 'we', 'above', 'call', 'hot', 'it', 'the'].includes(c.target),
        `junk target leaked: ${c.target} from "${s}"`);
    }
  }
});

test('CLUSTER C — forged prose evidence does NOT lift an over-claim off RETRACT', () => {
  for (const s of [
    'The auth-core is verified (12/12 tests pass, exit 0).',          // fake run output, no file
    'The claim-router is verified per claim-router.test.mjs.',         // nonexistent test file
    'The drain-loop is verified; PASS returned from the test runner.', // bare PASS
    'The auth-gate is owner-approved; Marcel confirmed.',              // fake operator note
  ]) {
    const claims = extractClaims(s, { nowMs: NOW });
    assert.equal(claims.length, 1, `one claim: "${s}"`);
    assert.equal(measureClaims(claims, { nowMs: NOW }).assessments[0].verdict, 'RETRACT',
      `forged evidence must NOT escape RETRACT: "${s}"`);
  }
});

test('CLUSTER C — a FILESYSTEM-RESOLVABLE, TARGET-RELATED test file + pass signal lifts off RETRACT', () => {
  // R2-A2: the resolved file must RELATE to the claim subject. prose-claim-extractor.test.mjs backs
  // a claim about the prose-claim-extractor (shared tokens), not about an unrelated "crypto-core".
  const s = `The prose-claim-extractor is verified per ${REAL_TEST_FILE}; 5/5 tests pass (exit 0).`;
  const claims = extractClaims(s, { nowMs: NOW });
  assert.equal(claims.length, 1);
  assert.ok(claims[0].evidence.some((e) => e.kind === 'test' || e.kind === 'runtime_trace'),
    'resolvable, target-related test file is real evidence');
  assert.notEqual(measureClaims(claims, { nowMs: NOW }).assessments[0].verdict, 'RETRACT');
});

test('CLUSTER D/E — separator spelling variants canonicalize to ONE anchor', () => {
  const ids = ['The foo-bar is now live.', 'The foo_bar is now live.', 'The foo bar is now live.']
    .map((s) => extractClaims(s, { nowMs: NOW })[0]?.id);
  assert.ok(ids.every(Boolean), `all three yield a claim: ${JSON.stringify(ids)}`);
  assert.equal(new Set(ids).size, 1, `spelling variants must unify: ${JSON.stringify(ids)}`);
  assert.equal(normalizeTarget('foo_bar'), normalizeTarget('foo-bar'));
  assert.equal(normalizeTarget('foo bar'), normalizeTarget('foo-bar'));
});

test('CLUSTER D — retractsByTarget metric makes multi-RETRACT-on-one-target visible', () => {
  const mk = (type) => ({ id: `foo:${type}`, target: 'foo', claimType: type, claimedStatus: 'runtime_tested', contentHash: `h-${type}`, evidence: [] });
  const { metrics } = measureClaims([mk('verified'), mk('live'), mk('works')], { nowMs: NOW });
  assert.equal(metrics.retracts, 3);
  assert.equal(metrics.maxRetractsPerTarget, 3, 'three RETRACTs on target foo are visible in the metric');
});

test('CLUSTER F — zero-width / RTL injection does NOT manufacture churn', () => {
  const clean = extractClaims('The sync-core is now live.', { nowMs: NOW });
  const zwj = extractClaims('The sync‍-core is now live.', { nowMs: NOW });
  const rtl = extractClaims('The ‮sync-core‬ is now live.', { nowMs: NOW });
  assert.ok(clean[0] && zwj[0] && rtl[0]);
  assert.equal(zwj[0].contentHash, clean[0].contentHash, 'ZWJ must not change the hash');
  assert.equal(rtl[0].contentHash, clean[0].contentHash, 'RTL override must not change the hash');
  const { metrics } = measureClaims(zwj, { nowMs: NOW, priorClaims: clean });
  assert.equal(metrics.churnedAnchors, 0, 'invisible-char injection cannot manufacture churn');
});

test('CLUSTER G — missing / non-finite nowMs is fail-closed (throws)', () => {
  assert.throws(() => extractClaims('The x-core is verified.', {}), /finite positive nowMs/);
  assert.throws(() => measureClaims([], {}), /finite positive nowMs/);
});

test('ANCHOR-BOUND IDENTITY is paraphrase-stable (veto-storm immunity)', () => {
  const a = extractClaims('The parser-core is now live.', { nowMs: NOW })[0];
  const b = extractClaims('parser-core is live and wired into the hot path.', { nowMs: NOW })[0];
  assert.ok(a && b);
  assert.equal(a.id, b.id, 'same target+type → same anchor id');
  assert.notEqual(a.contentHash, b.contentHash, 'paraphrase changes contentHash — contentHash identity WOULD churn');
});

test('every extracted claim carries an id → untrackedRetract === 0', () => {
  const claims = extractClaims('The alpha-mod is verified. The beta-mod is shipped. The gamma-mod is now live.', { nowMs: NOW });
  assert.ok(claims.length >= 3);
  for (const c of claims) assert.ok(c.id);
  assert.equal(measureClaims(claims, { nowMs: NOW }).metrics.untrackedRetract, 0);
});

test('partition: sub-RETRACT inversions on ONE target accumulate (aggregate-gate K input)', () => {
  const ev = (k) => [{ kind: k, capturedAt: NOW, reference: `ref-${k}` }];
  const claims = [
    { id: 'foo:built', target: 'foo', claimType: 'built', claimedStatus: 'fixture_ready', contentHash: 'h1', evidence: ev('advisory') },
    { id: 'foo:ready', target: 'foo', claimType: 'ready', claimedStatus: 'fixture_ready', contentHash: 'h2', evidence: ev('report') },
  ];
  assert.ok(measureClaims(claims, { nowMs: NOW }).metrics.maxAggregateInversionPerTarget >= 2);
});

test('anchorIdentity deterministic, target+type keyed; statementHash normalizes', () => {
  assert.equal(anchorIdentity('foo-bar', 'live'), anchorIdentity('foo-bar', 'live'));
  assert.equal(anchorIdentity('foo_bar', 'live'), anchorIdentity('foo-bar', 'live'), 'separator-canonical');
  assert.notEqual(anchorIdentity('foo-bar', 'live'), anchorIdentity('foo-bar', 'verified'));
  assert.equal(statementHash('Same Text.'), statementHash('same   text.'));
});

// ───────────────────────────────────────────────────────────────────────────
// RED-TEAM ROUND 2 regression (2026-06-13) — fix clusters R2-A (forgery re-open),
// R2-B (modality scope), R2-C (negation phantoms), R2-D (hygiene). Each test pins a
// vector the round-2 fan-out CONFIRMED would bypass / mis-fire the round-1 build.
// ───────────────────────────────────────────────────────────────────────────
const verdictOf = (s) => {
  const c = extractClaims(s, { nowMs: NOW });
  if (!c.length) return 'NO_CLAIM';
  return measureClaims(c, { nowMs: NOW }).assessments[0].verdict;
};
const nonAdvisoryEvidence = (s) =>
  (extractClaims(s, { nowMs: NOW })[0]?.evidence || []).filter((e) => e.kind !== 'advisory');

test('R2-A1 — a path-traversal evidence ref does NOT resolve (escapes the repo)', () => {
  // ../../package.json exists outside the repo; it must never count as work-product evidence.
  assert.equal(nonAdvisoryEvidence('The auth-core is verified per ../../package.json.').length, 0);
  assert.equal(verdictOf('The auth-core is verified per ../../package.json.'), 'RETRACT');
});

test('R2-A2 — a REAL but TARGET-UNRELATED test file cannot launder a claim', () => {
  const s = 'The energy-gate is verified per _SYSTEM/Scripts/memory-kernel.test.mjs; 12/12 pass.';
  const c = extractClaims(s, { nowMs: NOW });
  assert.equal(c.length, 1);
  assert.equal(c[0].evidence.filter((e) => e.kind === 'test' || e.kind === 'runtime_trace').length, 0,
    'unrelated real test file is not this claim\'s evidence');
  assert.equal(verdictOf(s), 'RETRACT');
});

test('R2-A3a — operator_note is ALWAYS advisory; a resolved file cannot upgrade "Marcel confirmed"', () => {
  const s = `The prose-claim-extractor is verified; Marcel confirmed it, see ${REAL_TEST_FILE}.`;
  const c = extractClaims(s, { nowMs: NOW });
  assert.equal(c.length, 1);
  assert.ok(!c[0].evidence.some((e) => e.kind === 'operator_note'), 'operator_note never minted from prose');
});

test('R2-A3b — a passive report does NOT bridge "12/12 pass" up to a runtime rung', () => {
  const s = 'The claim-wiring is verified; 12/12 pass, see _SYSTEM/reports/claim-wiring-ops-plan-2026-06-13.md.';
  const c = extractClaims(s, { nowMs: NOW });
  assert.equal(c.length, 1);
  assert.ok(!c[0].evidence.some((e) => e.kind === 'runtime_trace'),
    'report must not bridge prose run-output to runtime_trace');
  assert.equal(verdictOf(s), 'RETRACT', 'report (research rung) cannot lift a runtime_tested claim');
});

test('R2-B — a POST-verb future modal does NOT drop the present-tense over-claim', () => {
  // "X is production-ready, and will improve" — the future clause is after the claim verb.
  assert.equal(verdictOf('The auth-core is production-ready, and will improve next week.'), 'RETRACT');
});

test('R2-B — sentence-initial "Note that X is live" is KEPT; attributed "Marcel notes that…" drops', () => {
  assert.equal(verdictOf('Note that the gate is now live and wired into the hot path.'), 'RETRACT');
  assert.equal(extractClaims('Marcel notes that the gate is now live.', { nowMs: NOW }).length, 0,
    'attributed reported speech is neutralized');
});

test('R2-C — leading sentence negation is an honest non-claim', () => {
  assert.equal(extractClaims('Nothing is verified yet.', { nowMs: NOW }).length, 0);
  assert.equal(extractClaims('None of it is live.', { nowMs: NOW }).length, 0);
  assert.equal(extractClaims('Not a single module is wired.', { nowMs: NOW }).length, 0);
});

test('R2-C — about/node/nobody/none/neither never become claim anchors', () => {
  for (const s of ['About this is verified.', 'Node is now live.', 'Nobody is verified.']) {
    for (const c of extractClaims(s, { nowMs: NOW })) {
      assert.doesNotMatch(c.id || '', /^(?:about|node|nobody|none|neither):/, `junk anchor from "${s}"`);
    }
  }
});

test('R2-D — separator-only edits are NOT counted as substance churn', () => {
  const a = extractClaims('The energy-gate is now live.', { nowMs: NOW });
  const b = extractClaims('The energy_gate is now live.', { nowMs: NOW });
  assert.ok(a[0] && b[0]);
  assert.equal(a[0].id, b[0].id, 'same anchor across separators');
  assert.equal(a[0].contentHash, b[0].contentHash, 'separator-only edit is not substance churn');
  assert.equal(measureClaims(b, { nowMs: NOW, priorClaims: a }).metrics.churnedAnchors, 0);
});

test('PREARM — mergeLedgers enforces a bounded rolling window by recency (no unbounded growth)', () => {
  // default (no opts) = unchanged behavior: no cap, no _seenMs churn.
  const a = [{ id: 'x:live', target: 'x', claimType: 'live', claimedStatus: 'runtime_tested', contentHash: 'h', evidence: [] }];
  assert.equal(mergeLedgers(a, []).length, 1);
  // armed path: 6000 distinct prior + 10 fresh, cap 5000 → exactly 5000, and the FRESH ones survive.
  const prior = Array.from({ length: 6000 }, (_, i) => ({ id: `p${i}:live`, target: `p${i}`, claimType: 'live', claimedStatus: 'runtime_tested', contentHash: `h${i}`, evidence: [], _seenMs: 1000 + i }));
  const fresh = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}:live`, target: `f${i}`, claimType: 'live', claimedStatus: 'runtime_tested', contentHash: `g${i}`, evidence: [] }));
  const capped = mergeLedgers(prior, fresh, { nowMs: 9_999_999, maxClaims: 5000 });
  assert.equal(capped.length, 5000, 'ledger is bounded to the cap');
  for (let i = 0; i < 10; i += 1) assert.ok(capped.some((c) => c.id === `f${i}:live`), `fresh claim f${i} must survive eviction`);
});

test('PREARM — eviction PROTECTS inverting claims from a recency flood (Wave-3: signal not suppressible)', () => {
  // 3 OLD inverting claims (advisory-backed fixture_ready = depth-1) + a 6000-claim honest flood.
  // Under pure recency they'd evict; the hardened eviction must keep all 3 so the aggregate signal survives.
  const inv = Array.from({ length: 3 }, (_, i) => ({ id: `inv${i}:built`, target: `inv${i}`, claimType: 'built', claimedStatus: 'fixture_ready', contentHash: `iv${i}`, evidence: [{ kind: 'advisory', capturedAt: NOW, reference: `ia${i}` }], _seenMs: 1000 + i }));
  const flood = Array.from({ length: 6000 }, (_, i) => ({ id: `h${i}:built`, target: `h${i}`, claimType: 'built', claimedStatus: 'fixture_ready', contentHash: `hb${i}`, evidence: [{ kind: 'fixture', capturedAt: NOW, reference: `h${i}.mjs:1` }], _seenMs: 5000 + i }));
  const merged = mergeLedgers(inv, flood, { nowMs: NOW, maxClaims: 5000 });
  assert.equal(merged.length, 5000, 'still bounded');
  for (let i = 0; i < 3; i += 1) assert.ok(merged.some((c) => c.id === `inv${i}:built`), `inverting claim inv${i} must survive the flood`);
});

test('R2-D — a lowercase sentence continuation is split into its own statement', () => {
  const targets = extractClaims('The parser is done. now the gate is live.', { nowMs: NOW }).map((x) => x.target);
  assert.ok(targets.includes('parser') && targets.includes('gate'),
    `both fused statements extracted: ${JSON.stringify(targets)}`);
});

// Codex review 2026-06-13 (gpt-5.5 xhigh, via llm-compat): a single GENERIC shared token
// (claim/core/gate/…) must NOT relate an unrelated real test file to the target.
test('CODEX-R2A — one generic-token basename collision does NOT launder unrelated test evidence', () => {
  for (const s of [
    `The claim-router is verified per ${REAL_TEST_FILE}; 12/12 pass.`, // shares only "claim"
    `The claim-auth is verified per ${REAL_TEST_FILE}; 12/12 pass.`,
  ]) {
    const c = extractClaims(s, { nowMs: NOW });
    assert.equal(c.length, 1);
    assert.equal(c[0].evidence.filter((e) => e.kind === 'test' || e.kind === 'runtime_trace').length, 0,
      `generic-token collision must not credit real evidence: "${s}"`);
    assert.equal(measureClaims(c, { nowMs: NOW }).assessments[0].verdict, 'RETRACT');
  }
  // control: an EXACT-canonical / multi-token match still relates (no over-fix).
  const ok = extractClaims(`The prose-claim-extractor is verified per ${REAL_TEST_FILE}; 12/12 pass.`, { nowMs: NOW });
  assert.ok(ok[0].evidence.some((e) => e.kind === 'test' || e.kind === 'runtime_trace'),
    'a genuinely-related test file must still count');
});

test('RESID — a leading PREPOSITIONAL phrase does not over-drop; a real leading CLAUSE still does', () => {
  // "After much work," is a prep phrase (no verb before the comma) → the over-claim must be CAUGHT,
  // anchored on the REAL subject ("engine"), not the quantifier ("much").
  const c = extractClaims('After much work, the engine is production-ready.', { nowMs: NOW });
  assert.equal(c.length, 1);
  assert.equal(c[0].target, 'engine', `subject must be "engine", not a quantifier: got "${c[0].target}"`);
  assert.equal(measureClaims(c, { nowMs: NOW }).assessments[0].verdict, 'RETRACT');
  // "After the gate is armed," is a real temporal clause (copula) → neutralized.
  assert.equal(extractClaims('After the gate is armed, the engine is verified.', { nowMs: NOW }).length, 0);
  // "Once built," — status-verb participle clause → conditional → neutralized.
  assert.equal(extractClaims('Once built, the auth-core is fully verified.', { nowMs: NOW }).length, 0);
});
