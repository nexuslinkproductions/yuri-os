import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LADDER,
  DEPRECATED,
  VERDICTS,
  DEFAULT_EVIDENCE_HALFLIFE_DAYS,
  normalizeEvidence,
  evidenceStatusRank,
  beliefVector,
  assessClaim,
  cortexSnapshot,
  gateClaimTransition,
  evidenceNecessity,
} from './claim-cortex.mjs';
import { computeU, gateProposal, maxEntBelief } from './math/yuri-energy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = '_SYSTEM/Scripts/claim-cortex.mjs';

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;
// An evidence record captured `days` ago.
const ev = (kind, days = 1, extra = {}) => ({ kind, capturedAt: NOW - days * DAY, ...extra });
const assess = (claim) => assessClaim(claim, { nowMs: NOW });

// ---------------------------------------------------------------------------
// Ladder shape
// ---------------------------------------------------------------------------

test('LADDER is the canonical ladder minus the deprecated sink', () => {
  assert.deepEqual(LADDER, ['draft', 'research', 'fixture_ready', 'runtime_tested', 'operator_validated', 'trusted']);
  assert.equal(LADDER.includes(DEPRECATED), false);
});

// ---------------------------------------------------------------------------
// Verdict policy — one assertion per verdict branch
// ---------------------------------------------------------------------------

test('ASSERT — claim at a rung fresh evidence earns', () => {
  const a = assess({ id: 'x', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] });
  assert.equal(a.verdict, VERDICTS.ASSERT);
  assert.equal(a.deltaRank, 0);
  assert.equal(a.inversions, 0);
  assert.ok(a.U < 0, 'an honest, evidence-backed claim earns net credit (U < 0)');
});

test('HEDGE — supported but the best evidence has aged past one half-life', () => {
  // fixture aged 45d, halfLife 30 -> decayed 0.5^1.5 = 0.354: fresh (>=0.25) but <0.5.
  const a = assess({ id: 'x', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 45)] });
  assert.equal(a.verdict, VERDICTS.HEDGE);
  assert.equal(a.deltaRank, 0);
});

test('VERIFY-FIRST — claimed exactly one rung above evidence', () => {
  const a = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1)] });
  assert.equal(a.verdict, VERDICTS.VERIFY_FIRST);
  assert.equal(a.deltaRank, 1);
  assert.equal(a.inversions, 1);
});

test('RETRACT — claimed two or more rungs above evidence', () => {
  const a = assess({ id: 'x', claimedStatus: 'operator_validated', evidence: [ev('fixture', 1)] });
  assert.equal(a.verdict, VERDICTS.RETRACT);
  assert.equal(a.deltaRank, 2);
});

test('RETRACT — verified-tier claim with no fresh evidence', () => {
  const a = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [] });
  assert.equal(a.verdict, VERDICTS.RETRACT);
  assert.ok(a.U > 0, 'an over-claim with no support raises energy');
});

test('EXPLORE — hypothesis rung (research/draft) with no evidence is self-supporting', () => {
  const research = assess({ id: 'r', claimedStatus: 'research', evidence: [] });
  assert.equal(research.verdict, VERDICTS.EXPLORE);
  assert.equal(research.deltaRank, 0, 'research needs no executable evidence — never an inversion');
  assert.equal(research.U, 0);

  const draft = assess({ id: 'd', claimedStatus: 'draft', evidence: [] });
  assert.equal(draft.verdict, VERDICTS.EXPLORE);
});

// ---------------------------------------------------------------------------
// evidenceStatusRank — kind ceilings, recurrence, staleness
// ---------------------------------------------------------------------------

test('evidence kind ceilings map to the right rungs', () => {
  const rankFor = (kind) => evidenceStatusRank([normalizeEvidence(ev(kind, 0), NOW)]);
  assert.equal(rankFor('advisory'), LADDER.indexOf('research'));
  assert.equal(rankFor('report'), LADDER.indexOf('research'));
  assert.equal(rankFor('fixture'), LADDER.indexOf('fixture_ready'));
  assert.equal(rankFor('schema'), LADDER.indexOf('fixture_ready'));
  assert.equal(rankFor('test'), LADDER.indexOf('runtime_tested'));
  assert.equal(rankFor('runtime_trace'), LADDER.indexOf('runtime_tested'));
  assert.equal(rankFor('operator_note'), LADDER.indexOf('operator_validated'));
});

test('trusted is reachable ONLY via operator note + recurring executable checks', () => {
  const operatorOnly = [normalizeEvidence(ev('operator_note', 1), NOW)];
  assert.equal(evidenceStatusRank(operatorOnly), LADDER.indexOf('operator_validated'),
    'operator note alone caps at operator_validated');

  const operatorPlusOneTest = [ev('operator_note', 1), ev('test', 1)].map((e) => normalizeEvidence(e, NOW));
  assert.equal(evidenceStatusRank(operatorPlusOneTest), LADDER.indexOf('operator_validated'),
    'one recurring check is not enough for trusted');

  const trustedSet = [ev('operator_note', 1), ev('test', 1, { reference: 'suite-A' }), ev('runtime_trace', 1, { reference: 'trace-B' })].map((e) => normalizeEvidence(e, NOW));
  assert.equal(evidenceStatusRank(trustedSet), LADDER.indexOf('trusted'),
    'operator note + two distinct executable checks WITH non-empty references earns trusted (red-team #10)');
});

test('stale evidence drops out of the supported rank (degrade, do not persist)', () => {
  // a test aged 120d (4 half-lives) decays to 0.0625 < 0.25 freshness floor -> not fresh.
  const stale = [normalizeEvidence(ev('test', 120), NOW)];
  assert.equal(evidenceStatusRank(stale), 0, 'a fully-decayed test supports nothing');
  // and the claim that rode on it now inverts.
  const a = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 120)] });
  assert.equal(a.verdict, VERDICTS.RETRACT);
  assert.ok(a.inversions >= 1);
});

// ---------------------------------------------------------------------------
// normalizeEvidence — fail-closed input hygiene
// ---------------------------------------------------------------------------

test('normalizeEvidence clamps strength into [0,1] and defaults half-life', () => {
  assert.equal(normalizeEvidence({ kind: 'test', strength: 5 }, NOW).base, 1);
  assert.equal(normalizeEvidence({ kind: 'test', strength: -3 }, NOW).base, 0);
  assert.equal(normalizeEvidence({ kind: 'test', strength: NaN }, NOW).base, 0);
  assert.equal(normalizeEvidence({ kind: 'test' }, NOW).halfLifeDays, DEFAULT_EVIDENCE_HALFLIFE_DAYS);
});

test('normalizeEvidence — unknown kind proves nothing (ceiling 0, not fresh)', () => {
  const n = normalizeEvidence({ kind: 'totally_made_up', capturedAt: NOW }, NOW);
  assert.equal(n.ceiling, 0);
  assert.equal(n.base, 0);
  assert.equal(n.fresh, false);
});

test('normalizeEvidence — a future capturedAt is rejected as forged provenance (fail-closed)', () => {
  // A record captured in the future cannot exist — it must NOT read as maximally fresh.
  const n = normalizeEvidence({ kind: 'test', capturedAt: NOW + 10 * DAY }, NOW);
  assert.equal(n.fresh, false, 'future-dated evidence proves nothing');
});

// ---------------------------------------------------------------------------
// Fail-closed adversarial — a malformed claim can never quietly lower U
// ---------------------------------------------------------------------------

test('FAIL-CLOSED — an unrecognized claimedStatus is treated as the maximal over-claim', () => {
  const a = assess({ id: 'x', claimedStatus: 'production_ready_obviously', evidence: [ev('fixture', 1)] });
  assert.equal(a.claimedRank, LADDER.indexOf('trusted'), 'unknown status pins to top of ladder');
  assert.equal(a.verdict, VERDICTS.RETRACT);
  assert.ok(a.inversions >= 2);
});

test('an over-claim has strictly higher U than the honest version of the same claim', () => {
  const honest = assess({ id: 'h', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] });
  const overclaim = assess({ id: 'o', claimedStatus: 'trusted', evidence: [ev('fixture', 1)] });
  assert.ok(overclaim.U > honest.U, 'claiming higher than evidence earns must cost energy');
});

test('determinism — same nowMs + same claims produce identical assessments', () => {
  const claim = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 3), ev('operator_note', 1)] };
  const a = assessClaim(claim, { nowMs: NOW });
  const b = assessClaim(claim, { nowMs: NOW });
  assert.deepEqual(a, b);
});

test('beliefVector is a clamped, normalized distribution over the ladder', () => {
  const v = beliefVector(2, 1);
  assert.equal(v.length, LADDER.length);
  const sum = v.reduce((p, c) => p + c, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, 'belief sums to 1');
  assert.ok(v.every((p) => p > 0), 'no exact zeros — entropy/KL safe');
});

// ---------------------------------------------------------------------------
// cortexSnapshot — the computeU contract
// ---------------------------------------------------------------------------

test('snapshot emits every field computeU consumes, with equal-length distributions', () => {
  const claims = [
    { id: 'a', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] },
    { id: 'b', claimedStatus: 'trusted', evidence: [ev('test', 120)] },
  ];
  const { state } = cortexSnapshot(claims, { nowMs: NOW });
  // β KL requires equal-length claimed/verified — the snapshot must NEVER emit a mismatch.
  assert.equal(state.claimedDistribution.length, LADDER.length);
  assert.equal(state.verifiedDistribution.length, LADDER.length);
  assert.equal(state.priorState.length, LADDER.length);
  assert.equal(state.posteriorState.length, LADDER.length);
  assert.ok(state.claimPromotionDistribution && typeof state.claimPromotionDistribution === 'object');
  assert.ok(Array.isArray(state.evidence));
  // computeU must accept it and produce a finite U with the dark terms present.
  const res = computeU(state).result;
  assert.ok(Number.isFinite(res.U));
  // A fired component carries a `value`; a skipped one carries `skipped: true`.
  const fired = (c) => c.skipped !== true && Number.isFinite(c.value);
  assert.ok(fired(res.components.entropy), 'alpha fires');
  assert.ok(fired(res.components.klDivergence), 'beta fires');
  assert.ok(fired(res.components.informationGain), 'epsilon fires');
  assert.ok(fired(res.components.staleness), 'zeta fires');
});

test('empty ledger -> uniform distributions, finite U, no throw', () => {
  const { state, liveClaims } = cortexSnapshot([], { nowMs: NOW });
  assert.equal(liveClaims, 0);
  assert.ok(state.claimedDistribution.every((p) => Math.abs(p - 1 / LADDER.length) < 1e-9));
  assert.ok(Number.isFinite(computeU(state).result.U));
});

test('deprecated claims are excluded from the live distributions', () => {
  const claims = [
    { id: 'live', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] },
    { id: 'dead', claimedStatus: DEPRECATED, evidence: [ev('test', 1)] },
  ];
  const { liveClaims, assessments } = cortexSnapshot(claims, { nowMs: NOW });
  assert.equal(liveClaims, 1);
  assert.equal(assessments.length, 2, 'deprecated is still assessed, just not counted live');
});

test('promotionLadderInversions is the CONVEX (depth-squared) sum of per-claim inversions', () => {
  const claims = [
    { id: 'a', claimedStatus: 'trusted', evidence: [] },          // deltaRank 5 -> 25
    { id: 'b', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1)] }, // 1 -> 1
    { id: 'c', claimedStatus: 'research', evidence: [] },         // 0 (hypothesis)
  ];
  const { state, assessments } = cortexSnapshot(claims, { nowMs: NOW });
  const convex = assessments.reduce((p, a) => p + a.inversions * a.inversions, 0);
  assert.equal(state.promotionLadderInversions, convex);
  assert.equal(state.promotionLadderInversions, 26, '5² + 1² + 0²');
});

// ---------------------------------------------------------------------------
// Integration — the snapshot drives a real epistemic ΔU through the gate
// ---------------------------------------------------------------------------

test('gate ASCENDS when an over-claim is introduced into the ledger', () => {
  const before = cortexSnapshot([
    { id: 'a', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] },
  ], { nowMs: NOW }).state;
  const after = cortexSnapshot([
    { id: 'a', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] },
    { id: 'b', claimedStatus: 'trusted', evidence: [] }, // unsupported over-claim
  ], { nowMs: NOW }).state;
  const gate = gateProposal({ stateBefore: before, stateAfter: after });
  assert.ok(gate.result.deltaU > 0, 'adding an unsupported over-claim raises U');
  assert.equal(gate.result.accept, false);
});

test('gate DESCENDS when a claim gets the evidence it was missing', () => {
  const before = cortexSnapshot([
    { id: 'a', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1)] }, // 1-rung inversion
  ], { nowMs: NOW }).state;
  const after = cortexSnapshot([
    { id: 'a', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1), ev('test', 1)] }, // now earned
  ], { nowMs: NOW }).state;
  const gate = gateProposal({ stateBefore: before, stateAfter: after });
  assert.ok(gate.result.deltaU <= 0, 'supplying the missing evidence lowers U');
  assert.equal(gate.result.accept, true);
});

// ---------------------------------------------------------------------------
// RED-TEAM REGRESSIONS — every confirmed fail-open from the adversarial sweep.
// Each test reproduces the original attack and asserts the cortex now fails CLOSED.
// ---------------------------------------------------------------------------

// Cluster A — timestamp / clock fail-open
test('REGRESSION A1 — future-dated evidence cannot fake a trusted claim (gate rejects)', () => {
  const future = (kind) => ({ kind, capturedAt: NOW + 100 * DAY });
  const a = assess({ id: 'x', claimedStatus: 'trusted', evidence: [future('operator_note'), future('test'), future('runtime_trace')] });
  assert.equal(a.evidenceStatus, 'draft', 'future evidence supports nothing');
  assert.equal(a.verdict, VERDICTS.RETRACT);
  assert.equal(a.inversions, 5);
  const after = cortexSnapshot([{ id: 'x', claimedStatus: 'trusted', evidence: [future('operator_note'), future('test'), future('runtime_trace')] }], { nowMs: NOW }).state;
  const before = cortexSnapshot([], { nowMs: NOW }).state;
  assert.equal(gateProposal({ stateBefore: before, stateAfter: after }).result.accept, false);
});

test('REGRESSION A2 — missing / unparseable capturedAt is not fresh (no manufactured provenance)', () => {
  for (const ts of ['soon', {}, undefined, NaN, 'tomorrow']) {
    const a = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [{ kind: 'test', capturedAt: ts }] });
    assert.equal(a.verdict, VERDICTS.RETRACT, `capturedAt=${JSON.stringify(ts)} must not count as fresh`);
    assert.equal(a.freshCount, 0);
  }
});

test('REGRESSION A3 — a non-finite clock fails CLOSED (throws, never emits a freshness verdict)', () => {
  for (const bad of [undefined, NaN, null, 'abc', {}]) {
    assert.throws(() => assessClaim({ claimedStatus: 'trusted', evidence: [] }, { nowMs: bad }), /epoch-ms clock/);
    assert.throws(() => cortexSnapshot([], { nowMs: bad }), /epoch-ms clock/);
  }
});

test('REGRESSION A4 — an unbounded halfLifeDays override cannot make ancient evidence immortal', () => {
  const ancient = { kind: 'test', capturedAt: NOW - 5000 * DAY, halfLifeDays: 1e9 };
  assert.equal(normalizeEvidence(ancient, NOW).fresh, false, 'half-life is capped — a 5000-day-old test is stale');
  const a = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [ancient] });
  assert.equal(a.verdict, VERDICTS.RETRACT);
});

// Cluster B — recurrence dedup bypass
test('REGRESSION B1 — duplicate test records do not satisfy the trusted recurrence gate', () => {
  const dupTests = [ev('operator_note', 1), ev('test', 1, { reference: 'R1' }), ev('test', 1, { reference: 'R1' })];
  assert.equal(evidenceStatusRank(dupTests.map((e) => normalizeEvidence(e, NOW))), LADDER.indexOf('operator_validated'),
    'two COPIES of one test are one distinct check, not two');
  const a = assess({ id: 'x', claimedStatus: 'trusted', evidence: dupTests });
  assert.equal(a.verdict, VERDICTS.VERIFY_FIRST); // claimed trusted, evidence only operator_validated -> 1 rung over
  assert.ok(a.inversions >= 1);
});

test('REGRESSION B2 — duplicate runtime_trace records likewise cannot fake recurrence', () => {
  const dup = [ev('operator_note', 1), ev('runtime_trace', 1, { reference: 'T1' }), ev('runtime_trace', 1, { reference: 'T1' })];
  assert.equal(evidenceStatusRank(dup.map((e) => normalizeEvidence(e, NOW))), LADDER.indexOf('operator_validated'));
});

test('REGRESSION B3 — the literal same object pushed twice counts once', () => {
  const one = ev('test', 1, { reference: 'SAME' });
  const rank = evidenceStatusRank([ev('operator_note', 1), one, one].map((e) => normalizeEvidence(e, NOW)));
  assert.equal(rank, LADDER.indexOf('operator_validated'), 'object identity does not multiply distinct checks');
  // and the legit distinct path still reaches trusted (no false negative).
  const legit = [ev('operator_note', 1), ev('test', 1, { reference: 'A' }), ev('test', 1, { reference: 'B' })];
  assert.equal(evidenceStatusRank(legit.map((e) => normalizeEvidence(e, NOW))), LADDER.indexOf('trusted'));
});

test('REGRESSION B4 — empty-reference executable checks cannot satisfy trusted recurrence (red-team #10)', () => {
  const emptyRef = [ev('operator_note', 1), ev('test', 1), ev('runtime_trace', 1)];
  assert.equal(evidenceStatusRank(emptyRef.map((e) => normalizeEvidence(e, NOW))), LADDER.indexOf('operator_validated'),
    'runtime-grade evidence without non-empty references cannot prove distinct recurrence');
  const a = assess({ id: 'x', claimedStatus: 'trusted', evidence: emptyRef });
  assert.equal(a.verdict, VERDICTS.VERIFY_FIRST);
  assert.equal(a.inversions, 1);
});

// Cluster C — count-conserving severity laundering
test('REGRESSION C1 — a fabricated trusted over-claim cannot be laundered by a count-conserving swap', () => {
  // BEFORE: five 1-rung inversions (sum 5).  AFTER: one fabricated 5-rung trusted-no-evidence
  // RETRACT + eight honestly-verified claims. The raw COUNT is conserved at 5; the convex
  // (depth²) field rises 5 -> 25 so the structural floor sees the severity increase and vetoes.
  const oneRung = (id) => ({ id, claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1)] });
  const honest = (id) => ({ id, claimedStatus: 'runtime_tested', evidence: [ev('test', 1, { reference: id })] });
  const before = cortexSnapshot([oneRung('a'), oneRung('b'), oneRung('c'), oneRung('d'), oneRung('e')], { nowMs: NOW }).state;
  const after = cortexSnapshot([
    { id: 'fab', claimedStatus: 'trusted', evidence: [] },
    honest('h1'), honest('h2'), honest('h3'), honest('h4'), honest('h5'), honest('h6'), honest('h7'), honest('h8'),
  ], { nowMs: NOW }).state;
  const gate = gateProposal({ stateBefore: before, stateAfter: after });
  assert.equal(gate.result.accept, false, 'the fabricated trusted over-claim is vetoed, not accepted as a descent');
  assert.equal(gate.result.structuralFloorVeto, true);
});

// Cluster D — denial-of-sensor
test('REGRESSION D1 — a null/undefined claim entry is skipped, not fatal to the snapshot', () => {
  const claims = [{ id: 'ok', claimedStatus: 'research', evidence: [] }, null, undefined, { id: 'over', claimedStatus: 'trusted', evidence: [] }];
  let snap;
  assert.doesNotThrow(() => { snap = cortexSnapshot(claims, { nowMs: NOW }); });
  assert.equal(snap.liveClaims, 2, 'the two valid claims still count; the garbage is dropped');
  assert.ok(snap.state.promotionLadderInversions > 0, 'the real over-claim still registers');
});

// ---------------------------------------------------------------------------
// ROUND-2 REGRESSIONS — bypasses + fix-induced regressions found attacking the fixes.
// ---------------------------------------------------------------------------

// Cluster E — recurrence dedup must key on identity, not the attacker-controlled age bucket
test('REGRESSION E1 — re-stamping one test across different days cannot fake trusted recurrence', () => {
  const restamp = [ev('operator_note', 1), ev('test', 1, { reference: 'R' }), ev('test', 2, { reference: 'R' })];
  assert.equal(evidenceStatusRank(restamp.map((e) => normalizeEvidence(e, NOW))), LADDER.indexOf('operator_validated'),
    'same kind+reference is one check no matter how the timestamps are spaced');
  const a = assess({ id: 'x', claimedStatus: 'trusted', evidence: restamp });
  assert.ok(a.inversions >= 1, 'the over-claim survives — recurrence was not faked');
});

test('REGRESSION E2 — genuinely distinct cycles (distinct references) still reach trusted; same-ref does not', () => {
  const distinct = [ev('operator_note', 1), ev('test', 1, { reference: 'A' }), ev('test', 2, { reference: 'B' })];
  assert.equal(evidenceStatusRank(distinct.map((e) => normalizeEvidence(e, NOW))), LADDER.indexOf('trusted'),
    'distinct run-ids = distinct cycles -> trusted (no false-veto)');
  const sameRef = [ev('operator_note', 1), ev('test', 1, { reference: 'S' }), ev('test', 2, { reference: 'S' })];
  assert.equal(evidenceStatusRank(sameRef.map((e) => normalizeEvidence(e, NOW))), LADDER.indexOf('operator_validated'),
    'same-suite reruns must declare distinct run-ids to count as recurrence (fail-closed)');
});

// Cluster G — sub-second clock skew must not false-RETRACT honest work; day-ahead forgery must still fail
test('REGRESSION G1 — benign forward clock skew stays fresh; day-ahead forgery still rejected', () => {
  const skewed = normalizeEvidence({ kind: 'test', capturedAt: NOW + 2 }, NOW); // 2ms ahead (NTP jitter)
  assert.equal(skewed.fresh, true, 'a few ms of clock skew is jitter, not forgery');
  assert.equal(skewed.ageDays, 0, 'within-tolerance skew clamps to just-now, NOT epoch-0-stale');
  const honest = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [{ kind: 'test', capturedAt: NOW + 2 }] });
  assert.equal(honest.verdict, VERDICTS.ASSERT, 'skewed-but-honest verified work is not false-RETRACTed');
  // forgery boundary preserved:
  assert.equal(normalizeEvidence({ kind: 'test', capturedAt: NOW + 100 * DAY }, NOW).fresh, false);
});

// Cluster F — the injected clock must be epoch-MILLISECONDS scale
test('REGRESSION F1 — a wrong-scale (seconds/micros/tiny) clock fails CLOSED (throws)', () => {
  for (const bad of [Math.floor(NOW / 1000), NOW * 1000, 1, 1e9, 5e15]) {
    assert.throws(() => assessClaim({ claimedStatus: 'trusted', evidence: [] }, { nowMs: bad }), /epoch-MILLISECONDS/,
      `clock ${bad} must be rejected as a scale slip`);
    assert.throws(() => cortexSnapshot([], { nowMs: bad }), /epoch-MILLISECONDS/);
  }
  // a real ms clock still passes (boundary):
  assert.doesNotThrow(() => cortexSnapshot([], { nowMs: NOW }));
});

// Cluster D-residual — a throwing field-getter must not disappear from the snapshot
test('REGRESSION D2 — a claim whose getter throws is converted to fail-closed RETRACT (Codex L2)', () => {
  const poisonStatus = { id: 'p1', get claimedStatus() { throw new Error('poison status'); }, evidence: [] };
  const poisonEv = { id: 'p2', claimedStatus: 'research', evidence: [{ get kind() { throw new Error('poison ev'); } }] };
  const realOverclaim = { id: 'over', claimedStatus: 'trusted', evidence: [] };
  let snap;
  assert.doesNotThrow(() => { snap = cortexSnapshot([poisonStatus, poisonEv, realOverclaim], { nowMs: NOW }); });
  assert.equal(snap.assessments.length, 3);
  assert.equal(snap.liveClaims, 3);
  assert.equal(snap.retractCount, 3);
  assert.ok(snap.maxLadderInversion >= 5);
  assert.ok(snap.state.promotionLadderInversions >= 75, 'poisoned claims are maximal RETRACT signals, not skipped sensors');
});

test('snapshot exposes maxLadderInversion (L∞ groundwork for the owner-gated floor fix)', () => {
  const { maxLadderInversion } = cortexSnapshot([
    { id: 'a', claimedStatus: 'trusted', evidence: [] },         // deltaRank 5
    { id: 'b', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1)] }, // 1
  ], { nowMs: NOW });
  assert.equal(maxLadderInversion, 5);
});

// ---------------------------------------------------------------------------
// gateClaimTransition — the swap-immune, identity-aware claim-transition gate.
// Closes the round-2 C-residual the magnitude-only delta gate cannot.
// ---------------------------------------------------------------------------

const trustedEvidence = () => [ev('operator_note', 1), ev('test', 1, { reference: 'A' }), ev('runtime_trace', 1, { reference: 'B' })];

test('IDENTITY GATE — equal-magnitude swap is VETOED (the delta gate is fooled, identity catches it)', () => {
  const before = [
    { id: 'a', claimedStatus: 'research', evidence: [] },          // honest, 0 inv
    { id: 'b', claimedStatus: 'trusted', evidence: [] },           // fab RETRACT, depth 5 (25)
  ];
  const after = [
    { id: 'a', claimedStatus: 'research', evidence: [] },
    { id: 'b', claimedStatus: 'trusted', evidence: trustedEvidence() }, // 'b' honestly resolved -> ASSERT, 0
    { id: 'c', claimedStatus: 'trusted', evidence: [] },           // fresh fab RETRACT, depth 5 (25)
  ];
  const g = gateClaimTransition(before, after, { nowMs: NOW });
  assert.equal(g.identityVeto, true, "claim 'c' is a new RETRACT over-claim");
  assert.equal(g.accept, false, 'the swap is rejected');
  assert.equal(g.deltaGate.structuralFloorVeto, false, 'the magnitude floor was BLIND (sum conserved 25->25) — identity did the work');
  assert.equal(g.worsened[0].id, 'c');
});

test('IDENTITY GATE — Pythagorean partition (3²+4²=5²) is VETOED', () => {
  const before = [
    { id: 'a', claimedStatus: 'operator_validated', evidence: [ev('fixture', 1)] }, // claimed 4, ev 2 -> 2-rung RETRACT (4)...
    { id: 'b', claimedStatus: 'runtime_tested', evidence: [] },  // claimed 3, ev 0 -> 3-rung RETRACT (9)
  ];
  const after = [
    { id: 'c', claimedStatus: 'trusted', evidence: [] },         // fresh 5-rung fab RETRACT (25)
    { id: 'h', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] }, // honest ASSERT
  ];
  const g = gateClaimTransition(before, after, { nowMs: NOW });
  assert.equal(g.identityVeto, true, "the fabricated 'c' is a new RETRACT regardless of the conserved square-sum");
  assert.equal(g.accept, false);
});

test('IDENTITY GATE — a genuine descent (claim earns its evidence) is ACCEPTED', () => {
  const before = [{ id: 'a', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1)] }]; // 1-rung VERIFY-FIRST
  const after = [{ id: 'a', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1), ev('test', 1)] }]; // earned, ASSERT
  const g = gateClaimTransition(before, after, { nowMs: NOW });
  assert.equal(g.identityVeto, false);
  assert.equal(g.accept, true, 'supplying the missing evidence is the descent the gate exists to reward');
});

test('IDENTITY GATE — a new claim at its EARNED rank is ACCEPTED', () => {
  const g = gateClaimTransition([], [{ id: 'n', claimedStatus: 'fixture_ready', evidence: [ev('fixture', 1)] }], { nowMs: NOW });
  assert.equal(g.identityVeto, false);
  assert.equal(g.accept, true);
});

test('IDENTITY GATE — a persistent unchanged over-claim is NOT re-vetoed (flagged once, at introduction)', () => {
  const ledger = [{ id: 'a', claimedStatus: 'trusted', evidence: [] }];
  const g = gateClaimTransition(ledger, ledger, { nowMs: NOW });
  assert.equal(g.identityVeto, false, "'a' did not get deeper — same depth, not new laundering");
});

test('IDENTITY GATE — worsening an existing claim into a deeper RETRACT is VETOED', () => {
  const before = [{ id: 'a', claimedStatus: 'runtime_tested', evidence: [ev('fixture', 1)] }]; // 1-rung VERIFY-FIRST
  const after = [{ id: 'a', claimedStatus: 'trusted', evidence: [ev('fixture', 1)] }];          // now claimed trusted -> 3-rung RETRACT
  const g = gateClaimTransition(before, after, { nowMs: NOW });
  assert.equal(g.identityVeto, true);
  assert.equal(g.worsened[0].to > g.worsened[0].from, true);
});

test('IDENTITY GATE — a RETRACT over-claim with no stable id fails CLOSED', () => {
  const g = gateClaimTransition([], [{ claimedStatus: 'trusted', evidence: [] }], { nowMs: NOW });
  assert.equal(g.identityVeto, true);
  assert.equal(g.untrackedRetract, 1);
  assert.equal(g.accept, false);
});

// ---------------------------------------------------------------------------
// CARD 8 — evidenceNecessity (Pearl do-operator / counterfactual ablation).
// PURE additive readout: must not change any computeU-consumed field or aggregateU.
// ---------------------------------------------------------------------------

test('CARD8 — load-bearing vs decorative: the test is necessary, the advisory is decorative', () => {
  // claimed runtime_tested with [fresh test, fresh advisory]. The test earns the rung;
  // the advisory (ceiling research) is decorative. Remove the test -> ASSERT collapses
  // toward RETRACT (high necessity); remove the advisory -> verdict unchanged (necessity 0).
  const claim = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 1, { reference: 'T' }), ev('advisory', 1, { reference: 'A' })] };
  const n = evidenceNecessity(claim, { nowMs: NOW });
  assert.equal(n.baselineVerdict, VERDICTS.ASSERT);
  const testRec = n.perRecord.find((r) => r.kind === 'test');
  const advRec = n.perRecord.find((r) => r.kind === 'advisory');
  assert.ok(testRec.necessity > 0, 'the test is load-bearing');
  assert.equal(testRec.loadBearing, true);
  assert.equal(advRec.necessity, 0, 'the advisory is decorative — its removal changes nothing');
  assert.equal(advRec.loadBearing, false);
  assert.equal(n.singlePointOfFailure, true, 'removing the lone test forces a RETRACT');
});

test('CARD8 — no single point of failure when two distinct executable checks back the claim', () => {
  const claim = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 1, { reference: 'A' }), ev('runtime_trace', 1, { reference: 'B' })] };
  const n = evidenceNecessity(claim, { nowMs: NOW });
  assert.equal(n.baselineVerdict, VERDICTS.ASSERT);
  // removing either leaves the other at runtime_tested ceiling -> still ASSERT, necessity 0.
  assert.equal(n.singlePointOfFailure, false, 'redundant executable evidence removes the SPOF');
});

test('CARD8 — PURE: evidenceNecessity does not mutate the input claim', () => {
  const claim = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 1, { reference: 'T' })] };
  const snapshot = JSON.stringify(claim);
  evidenceNecessity(claim, { nowMs: NOW });
  assert.equal(JSON.stringify(claim), snapshot, 'the caller object is never observed-then-mutated');
});

test('CARD8 — PURE: it fails closed on a bad clock like every other cortex entry', () => {
  assert.throws(() => evidenceNecessity({ claimedStatus: 'trusted', evidence: [] }, { nowMs: NaN }), /epoch-ms clock/);
});

// ---------------------------------------------------------------------------
// CARD 28 / ENG-06 — MaxEnt belief replaces the magic beliefWidth constant.
// ---------------------------------------------------------------------------

test('CARD28 — the assessClaim posterior IS the MaxEnt belief at the evidenced rank', () => {
  // claimed runtime_tested, advisory only -> evidenceRank research(1). Posterior must equal
  // maxEntBelief(1, LADDER_N) clamped — proving the Gaussian beliefWidth constant is retired.
  const a = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('advisory', 1)] });
  const expected = maxEntBelief(1, LADDER.length).map((v) => Math.max(v, 1e-9));
  assert.equal(a.posterior.length, LADDER.length);
  for (let i = 0; i < LADDER.length; i += 1) {
    assert.ok(Math.abs(a.posterior[i] - expected[i]) < 1e-9, `posterior[${i}] ${a.posterior[i]} != maxEnt ${expected[i]}`);
  }
});

// ---------------------------------------------------------------------------
// CARD 34 — distinct-count (identity-keyed) + UCB1 global-effort HEDGE tiebreaker.
// ---------------------------------------------------------------------------

test('CARD34 — UCB tiebreaker is INERT by default (no totalSystemChecks) — boundary unchanged', () => {
  // a fresh single test at its earned rung is a plain ASSERT with the tiebreaker disabled.
  const a = assess({ id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 0)] });
  assert.equal(a.verdict, VERDICTS.ASSERT);
});

test('CARD34 — armed: one green pass while the system is barely checked stays a HEDGE; recovers as effort grows', () => {
  const claim = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 0, { reference: 'T' })] };
  const thin = assessClaim(claim, { nowMs: NOW, totalSystemChecks: 1 });
  assert.equal(thin.verdict, VERDICTS.HEDGE, 'thin global effort -> the lone green pass hedges');
  const broad = assessClaim(claim, { nowMs: NOW, totalSystemChecks: 100000 });
  assert.equal(broad.verdict, VERDICTS.ASSERT, 'as global verification effort grows the bonus decays -> ASSERT recovers');
});

test('CARD34 — armed: re-stamped COPIES of one check (same kind+ref) do NOT self-explore to ASSERT', () => {
  // Two copies of one test = one DISTINCT check. With thin global effort the UCB bonus over
  // n=1 distinct check holds it at HEDGE — copies cannot inflate the distinct count.
  const dup = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('test', 0, { reference: 'R' }), ev('test', 0, { reference: 'R' })] };
  const a = assessClaim(dup, { nowMs: NOW, totalSystemChecks: 2 });
  assert.equal(a.verdict, VERDICTS.HEDGE, 'distinct count is 1 (identity dedup) -> bonus large -> HEDGE');
});

// ---------------------------------------------------------------------------
// CARD 36 — Jeffrey conditioning (ADVISORY / flag-gated) + the MANDATORY
// epsilon-vs-zeta no-double-count canary.
// ---------------------------------------------------------------------------

test('CARD36 — Jeffrey is OFF by default: live posterior is the MaxEnt-at-evidenceRank baseline', () => {
  const claim = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('advisory', 0)] };
  const off = assessClaim(claim, { nowMs: NOW });
  const expected = maxEntBelief(off.evidenceRank, LADDER.length).map((v) => Math.max(v, 1e-9));
  for (let i = 0; i < LADDER.length; i += 1) {
    assert.ok(Math.abs(off.posterior[i] - expected[i]) < 1e-9, 'default posterior is MaxEnt-at-evidenceRank, not Jeffrey');
  }
});

test('CARD36 — within-kind reliability blindness is REAL under MaxEnt-only and CLOSED under Jeffrey', () => {
  // SAME KIND (advisory), claim ABOVE the ceiling so the posterior genuinely moves off the prior.
  const strong = { id: 'S', claimedStatus: 'runtime_tested', evidence: [ev('advisory', 0, { reference: 's' })] };  // decayed ~1.0
  const weak   = { id: 'W', claimedStatus: 'runtime_tested', evidence: [ev('advisory', 55, { reference: 'w' })] }; // decayed ~0.28, still fresh
  const ig = (claim, jeffrey) => {
    const a = assessClaim(claim, { nowMs: NOW, jeffrey });
    return computeU({ priorState: a.prior, posteriorState: a.posterior }).result.components.informationGain.value;
  };
  // MaxEnt-only (the hole): strong and weak earn IDENTICAL info-gain — reliability-blind.
  assert.equal(ig(strong, false), ig(weak, false), 'MaxEnt-only is within-kind reliability-blind (the verified hole)');
  // Jeffrey: the reliable record moves the posterior nearly fully; the weak one fractionally
  // -> strictly LESS info-gain credit for the weak-only case.
  assert.ok(ig(strong, true) > ig(weak, true), 'Jeffrey credits the reliable record strictly more than the weak one');
});

test('CANARY — epsilon FIRES under Jeffrey (not the silent evalInfoGain skip) AND zeta is not double-counted', () => {
  // The double-count risk: reliability uses decayed_strength, the SAME signal evalStaleness (zeta)
  // consumes. The canary asserts (1) epsilon FIRES — a real value, not the silent skip evalInfoGain
  // takes on a thrown/malformed posterior — and (2) turning Jeffrey ON changes epsilon (the posterior
  // shape) but NOT zeta (the base-minus-decayed staleness), so aging is not scored twice.
  const claim = { id: 'x', claimedStatus: 'runtime_tested', evidence: [ev('advisory', 55, { reference: 'w' })] };
  const stateOf = (jeffrey) => {
    const a = assessClaim(claim, { nowMs: NOW, jeffrey });
    return computeU({
      priorState: a.prior,
      posteriorState: a.posterior,
      // zeta reads this evidence array, independent of the belief vectors:
      evidence: [{ base: 1, age: 55, halfLife: 30 }],
    }).result.components;
  };
  const off = stateOf(false);
  const on = stateOf(true);

  // (1) epsilon FIRES in both modes — never the silent skip.
  assert.equal(off.informationGain.skipped === true, false, 'epsilon must FIRE with Jeffrey OFF');
  assert.equal(on.informationGain.skipped === true, false, 'epsilon must FIRE with Jeffrey ON (not the malformed-posterior skip)');
  assert.ok(Number.isFinite(off.informationGain.value) && Number.isFinite(on.informationGain.value));

  // (2) Jeffrey changes EPSILON (the within-kind reliability now lands in info-gain)...
  assert.notEqual(on.informationGain.value, off.informationGain.value, 'Jeffrey moves the epsilon term');
  // ...but does NOT change ZETA — the same decay signal is not scored a SECOND time through staleness.
  assert.equal(on.staleness.value, off.staleness.value, 'zeta/staleness is unchanged — aging is not double-counted across epsilon and zeta');
  assert.ok(on.staleness.value > 0, 'and zeta is genuinely live (a real aged record), not trivially equal at 0');
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

test('CLI --worked-example emits valid JSON with four verdicts', () => {
  const out = execFileSync('node', [SCRIPT, '--worked-example'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.liveClaims, 4);
  assert.equal(parsed.verdicts.length, 4);
  assert.ok(Number.isFinite(parsed.aggregateU));
});
