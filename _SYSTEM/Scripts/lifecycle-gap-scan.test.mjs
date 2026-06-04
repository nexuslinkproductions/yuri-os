// lifecycle-gap-scan.test.mjs — node:test suite for the LRN loop-closer.
//
// Verifies the SEAM-2 contract end to end:
//   - a KNOWN gap (under-propagated mechanismPattern) IS surfaced
//   - an organ with zero cards IS surfaced (GAP_ORGAN_NO_CARDS)
//   - an EXCLUDED non-math sector is NEVER flagged (the false-gap flood is gone)
//   - a card requiring an UNBUILT kernel primitive is marked UNACTIONABLE
//   - a target already in the dedup set is DEDUPED (not re-emitted)
//   - graceful degrade: missing domain / malformed bank / empty banks
//   - read-only: a CLI run touches ONLY its own report; the graph stays clean

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  scanLifecycle,
  classifyDomain,
  deriveOrgan,
  isMathBearingOrgan,
  isExcludedSector,
  loadCardBanks,
  readBuiltPrimitives,
  loadDedupKeys,
  validateConfig,
} from './lifecycle-gap-scan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'lifecycle-gap-scan.mjs');

const ONE_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-04T00:00:00.000Z');

// A built-primitive set standing in for the proof-gate FORMULA_IMPLEMENTATIONS.
const BUILT = new Set(['shannon-entropy', 'brier-score', 'cosine-similarity']);

test('deriveOrgan: maps real domains; returns null for every non-mapped outcome (NO unmapped:<x> token)', () => {
  assert.equal(deriveOrgan('information-theory'), 'pulse_cortex');
  assert.equal(deriveOrgan('vector-geometry'), 'self_improvement');
  assert.equal(deriveOrgan(null), null);
  assert.equal(deriveOrgan('   '), null);
  // CONTRACT CHANGE (closed-set fail-loud): an unknown domain no longer fabricates
  // a silent `unmapped:<x>` pseudo-organ — it returns null and the SCAN raises it
  // as a LOUD GAP_UNMAPPED_DOMAIN instead. Assert the old token is GONE.
  assert.equal(deriveOrgan('not-a-real-domain'), null);
  assert.notEqual(deriveOrgan('not-a-real-domain'), 'unmapped:not-a-real-domain');
  // An excluded sector carried as a card domain is also not a math organ -> null.
  assert.equal(deriveOrgan('services'), null);
});

test('classifyDomain: closed-set three-state — mapped | excluded | unmapped | no_domain', () => {
  // mapped
  assert.deepEqual(classifyDomain('information-theory'), { kind: 'mapped', key: 'information-theory', organ: 'pulse_cortex' });
  assert.deepEqual(classifyDomain('Vector-Geometry'), { kind: 'mapped', key: 'vector-geometry', organ: 'self_improvement' });
  // excluded (legal non-math sector carried as a card domain)
  for (const s of ['unassigned', 'services', 'operator_io', 'control_plane', 'prompt_hooks', 'command_registry']) {
    assert.equal(classifyDomain(s).kind, 'excluded', `${s} must classify as excluded`);
  }
  // no_domain (null / empty / whitespace) — graceful, distinct from unmapped
  assert.equal(classifyDomain(null).kind, 'no_domain');
  assert.equal(classifyDomain(undefined).kind, 'no_domain');
  assert.equal(classifyDomain('').kind, 'no_domain');
  assert.equal(classifyDomain('   ').kind, 'no_domain');
  // unmapped — present, NEITHER mapped NOR excluded -> LOUD
  assert.equal(classifyDomain('topology').kind, 'unmapped');
  assert.equal(classifyDomain('topology').key, 'topology');
  // whitespace AROUND a legal token is trimmed (so it resolves), but the token
  // itself must match exactly — verified in the near-miss test below.
  assert.equal(classifyDomain('  services  ').kind, 'excluded', 'surrounding whitespace trims to the excluded "services"');
  assert.equal(classifyDomain('  information-theory  ').kind, 'mapped', 'surrounding whitespace trims to a mapped domain');
});

test('classifyDomain: near-miss of an excluded/mapped value never leaks into a legal bucket', () => {
  // After trim+lowercase, "services " === "services" (excluded). But a genuine
  // near-miss (extra char inside the token) must be UNMAPPED, not silently passed.
  assert.equal(classifyDomain('services').kind, 'excluded');
  assert.equal(classifyDomain('service').kind, 'unmapped', 'singular "service" is NOT the excluded "services"');
  assert.equal(classifyDomain('services-x').kind, 'unmapped', 'suffixed "services-x" is NOT excluded');
  assert.equal(classifyDomain('control-plane').kind, 'unmapped', 'hyphen form is NOT the underscore "control_plane"');
  assert.equal(classifyDomain('information_theory').kind, 'unmapped', 'underscore form is NOT the hyphen "information-theory"');
});

test('allowlist: excluded non-math sectors are recognized and never math-bearing', () => {
  for (const s of ['unassigned', 'services', 'operator_io', 'control_plane', 'prompt_hooks', 'command_registry']) {
    assert.equal(isExcludedSector(s), true, `${s} must be excluded`);
    assert.equal(isMathBearingOrgan(s), false, `${s} must NOT be math-bearing`);
  }
  assert.equal(isMathBearingOrgan('pulse_cortex'), true);
});

test('scan: surfaces a known under-propagated pattern AND a zero-card organ; never flags excluded sectors', () => {
  const cards = [
    // pulse_cortex: 2 cards (organ NOT empty)
    { id: 'shannon-entropy', domain: 'information-theory', promotionStatus: 'verified-baseline', mechanismPattern: 'read-lower-bound-not-point', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'probability-calibration', promotionStatus: 'verified-baseline', mechanismPattern: 'read-lower-bound-not-point', _bankMtimeMs: NOW },
    // self_improvement: 1 card -> organ NOT empty, but its pattern is a singleton (KNOWN GAP b)
    { id: 'cosine-similarity', domain: 'vector-geometry', promotionStatus: 'verified-baseline', mechanismPattern: 'compose-readonly-analyzer', _bankMtimeMs: NOW },
  ];
  const r = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });

  // classification organ has 0 cards here -> GAP_ORGAN_NO_CARDS surfaced for it.
  const emptyOrgans = r.gaps.organ_no_cards.map((g) => g.organ);
  assert.ok(emptyOrgans.includes('classification'), 'classification (math-bearing, 0 cards) must be surfaced');

  // KNOWN under-propagated pattern surfaced.
  const underPatterns = r.gaps.pattern_under_propagated.map((g) => g.pattern);
  assert.ok(underPatterns.includes('compose-readonly-analyzer'), 'singleton pattern must be surfaced');
  // The 2-instance pattern must NOT be flagged.
  assert.ok(!underPatterns.includes('read-lower-bound-not-point'), '2-instance pattern must NOT be flagged');

  // CRITICAL: not a single gap references an excluded non-math sector.
  const allGaps = [...r.gaps.organ_no_cards, ...r.gaps.pattern_under_propagated, ...r.gaps.stale_baseline];
  const excluded = ['unassigned', 'services', 'operator_io', 'control_plane', 'prompt_hooks', 'command_registry'];
  for (const g of allGaps) {
    const blob = JSON.stringify(g);
    for (const s of excluded) {
      assert.ok(!new RegExp(`"organ":"${s}"`).test(blob), `gap must not target excluded sector ${s}`);
    }
  }
});

test('scan: stale verified-baseline requiring an UNBUILT primitive is marked UNACTIONABLE', () => {
  const cards = [
    // stale (40d old) verified-baseline whose id IS built -> actionable stale gap
    { id: 'shannon-entropy', domain: 'information-theory', promotionStatus: 'verified-baseline', _bankFile: 'info.v0.json', _bankMtimeMs: NOW - 40 * ONE_DAY },
    // stale verified-baseline whose id is NOT in BUILT -> UNACTIONABLE (owner-gated MINT)
    { id: 'riemann-zeta-regularization', domain: 'information-theory', promotionStatus: 'verified-baseline', _bankFile: 'info.v0.json', _bankMtimeMs: NOW - 40 * ONE_DAY },
    // fill the other math-bearing organs so we isolate the stale assertion
    { id: 'cosine-similarity', domain: 'vector-geometry', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'statistics', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
  ];
  const r = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });

  const staleIds = r.gaps.stale_baseline.map((g) => g.cardId);
  assert.ok(staleIds.includes('shannon-entropy'), 'built stale card surfaced');
  assert.ok(staleIds.includes('riemann-zeta-regularization'), 'unbuilt stale card surfaced');

  const unbuilt = r.gaps.stale_baseline.find((g) => g.cardId === 'riemann-zeta-regularization');
  assert.equal(unbuilt.unactionable, true, 'unbuilt-primitive card must be UNACTIONABLE');
  assert.equal(unbuilt.reason, 'requires-unbuilt-kernel-primitive');

  const builtStale = r.gaps.stale_baseline.find((g) => g.cardId === 'shannon-entropy');
  assert.equal(builtStale.unactionable, false, 'built stale card stays actionable');

  // Routing buckets reflect it.
  assert.ok(r.unactionable.some((g) => g.target === 'riemann-zeta-regularization'));
  assert.ok(r.actionable.some((g) => g.target === 'shannon-entropy'));
  assert.ok(!r.actionable.some((g) => g.target === 'riemann-zeta-regularization'),
    'an UNACTIONABLE target must never appear in the actionable list (no infinite re-notify)');
});

test('dedup: a target already in the backlog/hypotheses set is suppressed, not re-emitted', () => {
  const cards = [
    { id: 'shannon-entropy', domain: 'information-theory', promotionStatus: 'verified-baseline', mechanismPattern: 'lone-pattern', _bankMtimeMs: NOW },
    { id: 'cosine-similarity', domain: 'vector-geometry', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'statistics', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
  ];
  // No dedup -> the singleton pattern gap is actionable.
  const fresh = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });
  const freshActionablePatterns = fresh.actionable.filter((g) => g.class === 'GAP_PATTERN_UNDER_PROPAGATED');
  assert.equal(freshActionablePatterns.length, 1, 'singleton pattern actionable without dedup');

  // With the pattern key in the dedup set -> it is DEDUPED, not actionable.
  const dedupKeys = new Set(['pattern-under:lone-pattern']);
  const deduped = scanLifecycle({ cards, built: BUILT, dedupKeys, nowMs: NOW, staleDays: 30 });
  assert.ok(deduped.deduped.some((g) => g.key === 'pattern-under:lone-pattern'), 'pattern gap moved to deduped bucket');
  assert.ok(!deduped.actionable.some((g) => g.key === 'pattern-under:lone-pattern'), 'deduped gap not re-emitted as actionable');
});

test('graceful: missing-domain cards do not crash and are counted apart, NOT confused with unmapped', () => {
  const cards = [
    { id: 'no-domain-fixture' }, // business-fixtures-style: no domain field
    { id: 'shannon-entropy', domain: 'information-theory', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
    { id: 'cosine-similarity', domain: 'vector-geometry', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'statistics', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
  ];
  const r = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });
  assert.equal(r.counts.no_domain_cards, 1);
  assert.ok(r.no_domain_cards.includes('no-domain-fixture'));
  // A genuinely-absent domain is no_domain — NOT an unmapped-domain gap.
  assert.equal(r.counts.gap_unmapped_domain, 0, 'absent domain must not become a GAP_UNMAPPED_DOMAIN');
});

// ===========================================================================
// CLOSED-SET FAIL-LOUD REGRESSION — the blind-spot this rebuild had to kill.
// An unknown card domain (neither mapped nor excluded) MUST surface as a LOUD,
// ACTIONABLE GAP_UNMAPPED_DOMAIN — never silently dropped into a "0 gaps" report.
// ===========================================================================

test('FAIL-LOUD: an injected unknown domain surfaces as GAP_UNMAPPED_DOMAIN (actionable), never silently swallowed', () => {
  const cards = [
    // a brand-new organ lands carrying an un-enumerated domain
    { id: 'persistent-homology', domain: 'topology', promotionStatus: 'verified-baseline', _bankFile: 'mystery.v0.json', _bankMtimeMs: NOW },
    { id: 'betti-number', domain: 'Topology', promotionStatus: 'verified-baseline', _bankFile: 'mystery.v0.json', _bankMtimeMs: NOW }, // case-folds to same domain
    // legal cards so the organ-no-cards noise does not mask the assertion
    { id: 'shannon-entropy', domain: 'information-theory', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
    { id: 'cosine-similarity', domain: 'vector-geometry', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'statistics', promotionStatus: 'verified-baseline', _bankMtimeMs: NOW },
  ];
  const r = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });

  // The unknown domain is surfaced exactly once (deduped by domain, case-folded).
  assert.equal(r.counts.gap_unmapped_domain, 1, 'one distinct unknown domain -> one gap');
  const g = r.gaps.unmapped_domain.find((x) => x.domain === 'topology');
  assert.ok(g, 'GAP_UNMAPPED_DOMAIN for "topology" must exist');
  assert.deepEqual(g.cards.sort(), ['betti-number', 'persistent-homology'], 'both carrying cards named');
  assert.equal(g.unactionable, false, 'an unmapped domain is ACTIONABLE (forces an owner decision)');
  assert.match(g.owner_choice, /map domain "topology"/, 'owner choice names the map-or-exclude decision');

  // It REACHES the actionable list — the whole point: it cannot vanish.
  assert.ok(r.actionable.some((x) => x.class === 'GAP_UNMAPPED_DOMAIN' && x.domain === 'topology'),
    'unmapped-domain gap MUST appear in the actionable list (never silently dropped)');

  // It is NOT miscounted as no_domain.
  assert.equal(r.counts.no_domain_cards, 0, 'a present-but-unknown domain is not no_domain');
});

test('FAIL-LOUD: empty / null / whitespace / near-miss domains never silently vanish', () => {
  const cards = [
    { id: 'c-null', domain: null },               // -> no_domain (counted)
    { id: 'c-empty', domain: '' },                // -> no_domain (counted)
    { id: 'c-ws', domain: '   ' },                // -> no_domain (counted)
    { id: 'c-nearmiss-1', domain: 'service' },    // near-miss of excluded "services" -> UNMAPPED
    { id: 'c-nearmiss-2', domain: 'control-plane' }, // hyphen near-miss of "control_plane" -> UNMAPPED
    { id: 'c-nearmiss-3', domain: 'information_theory' }, // underscore near-miss of mapped -> UNMAPPED
    // legal anchors
    { id: 'shannon-entropy', domain: 'information-theory', _bankMtimeMs: NOW },
    { id: 'cosine-similarity', domain: 'vector-geometry', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'statistics', _bankMtimeMs: NOW },
  ];
  const r = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });

  // The 3 absent-domain cards are accounted for as no_domain (not lost).
  assert.equal(r.counts.no_domain_cards, 3);

  // Every near-miss is a LOUD unmapped gap — 3 distinct unknown domains.
  assert.equal(r.counts.gap_unmapped_domain, 3, 'three distinct near-miss domains each surface');
  const domains = r.gaps.unmapped_domain.map((g) => g.domain).sort();
  assert.deepEqual(domains, ['control-plane', 'information_theory', 'service']);

  // CONSERVATION LAW: every scanned card is accounted for in exactly one disposition
  // (no_domain, an unmapped gap, or a legal mapped/excluded card). Nothing vanishes.
  const unmappedCardCount = r.gaps.unmapped_domain.reduce((n, g) => n + g.cards.length, 0);
  const legalCards = cards.length - r.counts.no_domain_cards - unmappedCardCount;
  assert.equal(unmappedCardCount, 3, 'three near-miss cards captured');
  assert.equal(legalCards, 3, 'three legal anchor cards remain — accounting is complete, none dropped');
});

test('FAIL-LOUD: an EXCLUDED sector carried as a card domain is legal — never a gap', () => {
  const cards = [
    { id: 'fixture-1', domain: 'services' },       // legal non-math -> excluded, no gap
    { id: 'fixture-2', domain: 'operator_io' },    // legal non-math -> excluded, no gap
    { id: 'fixture-3', domain: 'command_registry' },
    // legal anchors so organ_no_cards does not flood the assertion
    { id: 'shannon-entropy', domain: 'information-theory', _bankMtimeMs: NOW },
    { id: 'cosine-similarity', domain: 'vector-geometry', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'statistics', _bankMtimeMs: NOW },
  ];
  const r = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });
  assert.equal(r.counts.gap_unmapped_domain, 0, 'an excluded sector domain is legal, never unmapped');
  assert.equal(r.counts.no_domain_cards, 0, 'an excluded sector domain is not no_domain');
  // And no gap of ANY class references an excluded sector as its target.
  const allGaps = [...r.gaps.organ_no_cards, ...r.gaps.pattern_under_propagated, ...r.gaps.stale_baseline, ...r.gaps.unmapped_domain];
  for (const g of allGaps) {
    for (const s of ['services', 'operator_io', 'command_registry', 'control_plane', 'prompt_hooks', 'unassigned']) {
      assert.notEqual(g.domain, s, `excluded sector ${s} must never be a gap domain`);
    }
  }
});

test('FAIL-LOUD: an unmapped-domain gap is dedup-aware (a reconciled-pending domain is suppressed, not re-spammed)', () => {
  const cards = [
    { id: 'persistent-homology', domain: 'topology', _bankMtimeMs: NOW },
    { id: 'shannon-entropy', domain: 'information-theory', _bankMtimeMs: NOW },
    { id: 'cosine-similarity', domain: 'vector-geometry', _bankMtimeMs: NOW },
    { id: 'brier-score', domain: 'statistics', _bankMtimeMs: NOW },
  ];
  // Without dedup -> actionable.
  const fresh = scanLifecycle({ cards, built: BUILT, nowMs: NOW, staleDays: 30 });
  assert.ok(fresh.actionable.some((g) => g.key === 'unmapped-domain:topology'));

  // With the key in the dedup set -> moved to deduped, not re-emitted as actionable.
  const dedupKeys = new Set(['unmapped-domain:topology']);
  const deduped = scanLifecycle({ cards, built: BUILT, dedupKeys, nowMs: NOW, staleDays: 30 });
  assert.ok(deduped.deduped.some((g) => g.key === 'unmapped-domain:topology'), 'reconciled-pending unmapped domain is deduped');
  assert.ok(!deduped.actionable.some((g) => g.key === 'unmapped-domain:topology'), 'deduped unmapped gap not re-spammed as actionable');
});

test('LIVE BANKS: every real card domain resolves to MAPPED or EXCLUDED — zero silent unmapped today', () => {
  const banksDir = path.resolve(HERE, '..', 'data', 'math', 'formula-banks');
  if (!existsSync(banksDir)) return; // skip if path drifts; CLI live-run covers it
  const { cards } = loadCardBanks(banksDir);
  assert.ok(cards.length > 0, 'live banks must load at least one card');

  // Drive the REAL scan over the REAL cards. The closed set must be complete today.
  const built = readBuiltPrimitives(path.resolve(HERE, 'math', 'math-proof-gate.mjs')).built;
  const r = scanLifecycle({ cards, built, nowMs: NOW, staleDays: 30 });
  assert.equal(r.counts.gap_unmapped_domain, 0,
    `live banks must have ZERO unmapped domains (closed set complete). Got: ${JSON.stringify(r.gaps.unmapped_domain.map((g) => g.domain))}`);

  // Belt-and-suspenders: classify every live domain directly; none may be 'unmapped'.
  const offenders = [];
  for (const c of cards) {
    const cls = classifyDomain(c.domain);
    if (cls.kind === 'unmapped') offenders.push({ id: c.id, domain: c.domain });
  }
  assert.deepEqual(offenders, [], `no live card may carry an unmapped domain: ${JSON.stringify(offenders)}`);
});

test('loadCardBanks: malformed bank is skipped with a warning, never fatal; empty dir -> empty', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lgs-banks-'));
  try {
    // empty dir
    let res = loadCardBanks(dir);
    assert.equal(res.cards.length, 0);

    // a valid bank + a malformed bank + a non-array bank
    writeFileSync(path.join(dir, 'good.v0.json'), JSON.stringify({ formulas: [{ id: 'a', domain: 'statistics' }] }));
    writeFileSync(path.join(dir, 'broken.v0.json'), '{ this is not json ');
    writeFileSync(path.join(dir, 'shape.v0.json'), JSON.stringify({ notFormulas: true }));
    res = loadCardBanks(dir);
    assert.equal(res.cards.length, 1, 'only the valid card loads');
    assert.ok(res.warnings.some((w) => w.startsWith('bank-not-json:broken.v0.json')));
    assert.ok(res.warnings.some((w) => w.startsWith('bank-no-card-array:shape.v0.json')));

    // missing dir entirely
    const missing = loadCardBanks(path.join(dir, 'does-not-exist'));
    assert.equal(missing.cards.length, 0);
    assert.ok(missing.warnings.some((w) => w.startsWith('banks-dir-missing')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readBuiltPrimitives: parses the live proof-gate registry (>= the 20 known bindings)', () => {
  const proofGate = path.resolve(HERE, 'math', 'math-proof-gate.mjs');
  if (!existsSync(proofGate)) return; // skip if path drifts; live-run test covers it
  const { built } = readBuiltPrimitives(proofGate);
  assert.ok(built.has('shannon-entropy'));
  assert.ok(built.has('cosine-similarity'));
  assert.ok(built.size >= 20, `expected >=20 built primitives, got ${built.size}`);
});

test('loadDedupKeys: pulls hypotheses active+validated and prior-report gap keys', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lgs-dedup-'));
  try {
    const hyp = path.join(dir, 'hypotheses.json');
    writeFileSync(hyp, JSON.stringify({
      active: [{ id: 'H-1', hypothesis: 'Improve organ X', metric: 'improvement_score' }],
      validated: [{ id: 'H-2', hypothesis: 'Pattern Y propagates' }],
    }));
    const backlog = path.join(dir, 'prior.json');
    writeFileSync(backlog, JSON.stringify({ gaps: { organ_no_cards: [{ key: 'organ-no-cards:classification' }] } }));
    const keys = loadDedupKeys({ backlogPath: backlog, hypothesesPath: hyp });
    assert.ok(keys.has('organ-no-cards:classification'), 'prior-report gap key pulled');
    assert.ok(keys.has('hyp:improve organ x'), 'active hypothesis text pulled');
    assert.ok(keys.has('hyp:pattern y propagates'), 'validated hypothesis text pulled');
    assert.ok(keys.has('hyp-metric:improvement_score'), 'hypothesis metric pulled');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: empty banks dir -> exit 0, writes ONLY its own report, never touches the graph', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'lgs-cli-'));
  try {
    const emptyBanks = path.join(work, 'banks'); // does not exist
    const out = path.join(work, 'report.json');
    // a sentinel "graph" file we can prove is untouched (byte-identical)
    const fakeGraph = path.join(work, 'graph.json');
    writeFileSync(fakeGraph, JSON.stringify({ nodes: [{ id: 'N', sector: 'control_plane' }] }));
    const graphBefore = readFileSync(fakeGraph, 'utf8');

    const stdout = execFileSync('node', [
      SCRIPT, '--banks', emptyBanks, '--graph', fakeGraph,
      '--hypotheses', path.join(work, 'no-hyp.json'), '--out', out,
    ], { encoding: 'utf8' });

    assert.match(stdout, /TERM_COUNT term=cards_scanned count=0/);
    assert.match(stdout, /LRN loop-closer, read-only/);
    assert.ok(existsSync(out), 'report written');

    // The graph sentinel is byte-identical (read-only contract honored).
    assert.equal(readFileSync(fakeGraph, 'utf8'), graphBefore, 'graph must be untouched');

    const written = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(written.tool, 'lifecycle-gap-scan');
    assert.equal(written.advisory_only, true);
    assert.deepEqual(written.inputs.allowlist_leak, [], 'allowlist must not leak an excluded sector');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('CLI: malformed bank -> exit 0 advisory, warning surfaced, no crash', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'lgs-bad-'));
  try {
    const banks = path.join(work, 'banks');
    mkdirSync(banks, { recursive: true });
    writeFileSync(path.join(banks, 'broken.v0.json'), 'not json at all');
    const out = path.join(work, 'r.json');
    const stdout = execFileSync('node', [SCRIPT, '--banks', banks, '--out', out, '--hypotheses', path.join(work, 'x.json')], { encoding: 'utf8' });
    assert.match(stdout, /WARN bank-not-json:broken\.v0\.json/);
    assert.match(stdout, /TERM_COUNT term=cards_scanned count=0/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// --- CONFIG INVARIANT (fail-loud siblings of the unmapped blind-spot) -------

test('validateConfig: LIVE config is clean — every DOMAIN_TO_ORGAN target is math-bearing, no allowlist leak', () => {
  const r = validateConfig();
  assert.equal(r.ok, true, `live config drift: ${JSON.stringify(r)}`);
  assert.deepEqual(r.mapTargetDrift, []);
  assert.deepEqual(r.allowlistLeak, []);
});

test('validateConfig: map-target drift caught LOUD — a domain mapped to a non-allowlisted organ', () => {
  const r = validateConfig({
    domainMap: { 'information-theory': 'pulse_cortex', 'ghost-domain': 'not_a_math_organ' },
    mathOrgans: new Set(['pulse_cortex', 'classification', 'self_improvement']),
    excluded: new Set(['services']),
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.mapTargetDrift, ['ghost-domain -> not_a_math_organ']);
  // the silent-degrade sibling: this card would classify 'mapped' yet be skipped by the organ walk
});

test('validateConfig: allowlist leak caught LOUD — a math organ that is also an excluded sector', () => {
  const r = validateConfig({
    domainMap: { 'scoring': 'classification' },
    mathOrgans: new Set(['classification', 'services']),
    excluded: new Set(['services', 'operator_io']),
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.allowlistLeak, ['services']);
});
