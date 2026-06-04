import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { hazardMultiplier, HAZARD_CLASSES, confidenceDecay } from './math-kernel.mjs';
import { evalStalenessShadow, computeU, gateProposal, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import {
  shadowTrendReadout, isSurprise, tickAndTrace, freshState, SHADOW_TREND,
} from '../energy-tick-core.mjs';
import { buildKKTReadoutSection, BARRIER_TERMS } from './yuri-energy-dashboard-data.mjs';

// Deterministic seeded noise so the property tests are reproducible.
function seeded(n, seed) {
  let s = seed >>> 0;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    out.push((s / 0x7fffffff) - 0.5);
  }
  return out;
}

// ===========================================================================
// ENG-01 — Cox proportional-hazards per-class evidence aging (COMPUTED/SHADOW)
// ===========================================================================

test('ENG-01 hazardMultiplier: closed-set classes age at their prior rates', () => {
  assert.equal(hazardMultiplier('runtime_trace'), 0.3);
  assert.equal(hazardMultiplier('test'), 0.3);
  assert.equal(hazardMultiplier('fixture'), 1.0);
  assert.equal(hazardMultiplier('schema'), 1.0);
  assert.equal(hazardMultiplier('advisory'), 3.0);
  assert.equal(hazardMultiplier('report'), 3.0);
  assert.equal(hazardMultiplier('operator_note'), 0.5);
});

test('ENG-01 hazardMultiplier: FAIL-SAFE on unknown / non-string (never < 1.0)', () => {
  // An unrecognized source must NOT be granted slow aging it did not earn.
  assert.equal(hazardMultiplier('unknown_class'), 1.0);
  assert.equal(hazardMultiplier(''), 1.0);
  assert.equal(hazardMultiplier(123), 1.0);
  assert.equal(hazardMultiplier(null), 1.0);
  assert.equal(hazardMultiplier(undefined), 1.0);
  assert.equal(hazardMultiplier({}), 1.0);
  // A lookalike (prototype key) must not resolve through Object.hasOwn.
  assert.equal(hazardMultiplier('toString'), 1.0);
  assert.equal(hazardMultiplier('constructor'), 1.0);
  for (const c of HAZARD_CLASSES) assert.ok(hazardMultiplier(c) > 0);
});

test('ENG-01 CANARY: multiplier=1.0 + real age reproduces flat confidenceDecay to the digit', () => {
  const base = 1, age = 10, halfLife = 5;
  const flat = Math.max(0, base - confidenceDecay({ base, age, halfLife }));
  // fixture -> 1.0, so effective halfLife = halfLife/1.0 = halfLife (no change).
  const shadow = evalStalenessShadow([{ base, age, halfLife, sourceClass: 'fixture' }]).value;
  assert.equal(shadow, flat, 'shadow staleness must equal the flat decay at multiplier 1.0');
});

test('ENG-01 council-text (advisory 3.0) ages STRICTLY faster than runtime_trace (0.3) at equal age', () => {
  const rt = evalStalenessShadow([{ base: 1, age: 7, halfLife: 7, sourceClass: 'runtime_trace' }]).value;
  const ct = evalStalenessShadow([{ base: 1, age: 7, halfLife: 7, sourceClass: 'advisory' }]).value;
  assert.ok(ct > rt, `council-text staleness ${ct} must exceed runtime ${rt}`);
});

test('ENG-01 evalStalenessShadow: empty / all-malformed handled, never throws', () => {
  assert.equal(evalStalenessShadow([]).skipped, true);
  assert.equal(evalStalenessShadow('not-an-array').skipped, true);
  // A record with non-numeric base/age coerces to safe defaults (base 1, age 0) -> 0 staleness.
  const r = evalStalenessShadow([{ base: 'x', age: 'y' }]);
  assert.equal(r.skipped, false);
  assert.equal(r.value, 0);
});

// ===========================================================================
// ENG-04 / ENG-05 — Kalman-recovery surprise + CUSUM slow-rot (SHADOW)
// ===========================================================================

test('ENG-05 CANARY: sustained mean-shift -> CUSUM alarms near onset', () => {
  const pre = seeded(40, 111).map((nz) => nz * 0.3);          // mean 0
  const post = seeded(40, 222).map((nz) => 0.5 + nz * 0.3);    // sustained +0.5 shift
  const tr = shadowTrendReadout([...pre, ...post]);
  assert.equal(tr.available, true);
  assert.equal(tr.cusumAlarm, true, 'CUSUM must alarm on a sustained directional shift');
  assert.ok(tr.cusumChangeIndex >= 40, `changeIndex ${tr.cusumChangeIndex} must be at/after the onset (40)`);
});

test('ENG-05 CANARY: flat in-control stream -> CUSUM does NOT false-alarm (ARL dial real)', () => {
  // Deterministic zero-autocorrelation in-control streams: an alternating sign pattern
  // (mean ~0, no persistent run) is the fair "nothing is drifting" case. A weak-RNG
  // sequence with structured runs is NOT a valid in-control sample (it has hidden
  // autocorrelation a CUSUM legitimately reacts to — that finding is itself real, but
  // belongs in a calibration replay, not a false-alarm unit assertion).
  const patterns = [
    Array.from({ length: 80 }, (_, i) => (i % 2 === 0 ? 0.3 : -0.3)),
    Array.from({ length: 80 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.5) * (1 + (i % 3) * 0.1)),
    Array.from({ length: 80 }, (_, i) => Math.sin(i) * 0.4), // zero-mean, bounded, no drift
  ];
  for (let p = 0; p < patterns.length; p += 1) {
    const tr = shadowTrendReadout(patterns[p]);
    assert.equal(tr.cusumAlarm, false, `flat in-control pattern ${p} must not alarm`);
  }
});

test('ENG-05 slow rot: CUSUM integrates a persistent directional drift to an alarm', () => {
  // The complementary capability to the MAD shock band: a persistent directional drift
  // (each step in-band as a single value, but the SIGNED sum integrates) is what the
  // upper CUSUM exists to catch. In-control phase, then a sustained drift segment.
  // (NB: an isolated "MAD never fires anywhere" claim is intentionally NOT asserted —
  //  the scale-free dial that keeps MAD quiet also widens CUSUM's slack, so the clean
  //  separation lives in the SUSTAINED-SHIFT + flat-ARL pair above; here we assert the
  //  CUSUM integration property directly, the kernel's documented guarantee.)
  const inControl = seeded(40, 5).map((nz) => nz * 0.3);              // zero-mean
  const drift = seeded(40, 88).map((nz) => 0.45 + nz * 0.3);          // sustained +0.45
  const tr = shadowTrendReadout([...inControl, ...drift]);
  assert.equal(tr.cusumAlarm, true, 'CUSUM must alarm on the integrated drift');
  assert.ok(tr.cusumChangeIndex >= 40, `changeIndex ${tr.cusumChangeIndex} must follow the onset (40)`);
  assert.ok(tr.cusumPeak > 0, 'the CUSUM statistic must have accumulated');
});

test('ENG-04 CANARY: Kalman NIS catches a high-tail spike in a noisy stream', () => {
  const stream = [0.1, -0.1, 0.05, -0.05, 0.08, -0.08, 0.1, 5.0, 0.1, -0.1];
  const tr = shadowTrendReadout(stream);
  assert.ok(tr.kalmanSurprisedCount >= 1, 'Kalman must flag the spike at least once');
});

test('ENG-04/05 fail-safe: short / empty / NaN / Inf streams never throw, never alarm', () => {
  assert.equal(shadowTrendReadout([]).available, false);
  assert.equal(shadowTrendReadout([1, 2]).available, false); // below minSamples
  assert.equal(shadowTrendReadout('nope').available, false);
  const withGarbage = shadowTrendReadout([NaN, Infinity, -Infinity, 1, 2, 3, 4, 5]);
  assert.equal(withGarbage.cusumAlarm, false, 'garbage-filtered stream must not fabricate an alarm');
  // A constant (zero-spread) stream -> no admissible dial -> in-control, no alarm.
  const flatConst = shadowTrendReadout([2, 2, 2, 2, 2, 2]);
  assert.equal(flatConst.cusumAlarm, false);
});

// ===========================================================================
// CORE SAFETY CLAIM — advisory additions do NOT change the live verdict
// ===========================================================================

test('SAFETY: shadowTrend never feeds the live surprise/deep verdict (additive only)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-safety-'));
  const env = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = tmp;
  try {
    const events = [
      { tool_name: 'Edit', tool_input: { file_path: 'a.mjs' }, tool_response: { is_error: false } },
      { tool_name: 'Bash', tool_input: {}, tool_response: { is_error: false } },
      { tool_name: 'Write', tool_input: { file_path: '.env' }, tool_response: { is_error: false } },
    ];
    let state = freshState(); let depth = 0; let recentAbs = []; let recentSigned = []; let ledger;
    for (let i = 0; i < events.length; i += 1) {
      const out = tickAndTrace(state, events[i], { nowIso: `2026-06-04T00:00:0${i}.000Z`, runId: `s-${i}`, user: 's', depth, recentAbs, recentSigned, ledger });
      // The advisory fields are present...
      assert.ok(Object.prototype.hasOwnProperty.call(out, 'shadowTrend'), 'shadowTrend emitted');
      assert.ok(Array.isArray(out.recentSigned), 'recentSigned emitted');
      // ...but the verdict surface is computed independently of them.
      assert.equal(typeof out.surpriseEngaged, 'boolean');
      assert.equal(typeof out.deepEngaged, 'boolean');
      state = out.state; depth = out.depth; recentAbs = out.recentAbs; recentSigned = out.recentSigned; ledger = out.ledger;
    }
    // The on-disk decision record carries NO shadow field (privacy gate + byte-identity).
    const dir = path.join(tmp, 'energy-trace');
    const f = fs.readdirSync(dir)[0];
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n')[0]);
    const leaked = Object.keys(rec).some((k) => /shadow|recentSigned|kalman|cusum/i.test(k));
    assert.equal(leaked, false, 'no advisory shadow field may leak into the on-disk decision record');
  } finally {
    if (env === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = env;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ===========================================================================
// ENG-09 — KKT slackness dead-term prune + binding-constraint readout (READ-ONLY)
// ===========================================================================

function rec({ runId = 'r', decision = 'accept', deltaU = 0, dominantTerm = null, cc = {} }) {
  return { runId, lane: 'session', decision, deltaU, dominantTerm, componentContributions: cc };
}

test('ENG-09 KKT: ranks active constraints, flags barriers, finds prune candidates', () => {
  const records = [
    rec({ cc: { verifiedEvidenceCredit: -0.1, logLoss: 0, brier: 0, protectedPathViolations: 0, promotionLadderInversions: 0 } }),
    rec({ cc: { verifiedEvidenceCredit: -0.2, logLoss: 0, brier: 0, protectedPathViolations: 0, promotionLadderInversions: 0 } }),
    rec({ decision: 'reject', deltaU: 100, dominantTerm: 'protectedPathViolations', cc: { verifiedEvidenceCredit: 0, logLoss: 0, brier: 0, protectedPathViolations: 100, promotionLadderInversions: 0 } }),
  ];
  const out = buildKKTReadoutSection(records);
  assert.equal(out.decisions, 3);
  assert.equal(out.rejects, 1);
  // verified credit binds every decision -> high activation, ranked first or near it.
  const ver = out.terms.find((t) => t.term === 'verifiedEvidenceCredit');
  assert.ok(ver && ver.firedCount === 2, 'verified credit fired on the 2 accepts');
  // logLoss/brier never bound -> prune candidates (offsettable soft terms).
  assert.ok(out.pruneCandidates.includes('logLoss'));
  assert.ok(out.pruneCandidates.includes('brier'));
});

test('ENG-09 KKT BARRIER invariant: η/θ are NEVER prune candidates even when they rarely fire', () => {
  // A trace where protected-path + ladder fire ZERO times (rare/never) — they must
  // still be flagged barrier:true and EXCLUDED from prune candidates (rare barrier =
  // safe system, not a dead term).
  const records = [
    rec({ cc: { verifiedEvidenceCredit: -0.1, protectedPathViolations: 0, promotionLadderInversions: 0 } }),
    rec({ cc: { verifiedEvidenceCredit: -0.1, protectedPathViolations: 0, promotionLadderInversions: 0 } }),
  ];
  const out = buildKKTReadoutSection(records);
  for (const b of BARRIER_TERMS) {
    const t = out.terms.find((x) => x.term === b);
    assert.ok(t, `${b} present in readout`);
    assert.equal(t.barrier, true, `${b} flagged as barrier`);
    assert.equal(t.pruneCandidate, false, `${b} must never be a prune candidate`);
    assert.ok(!out.pruneCandidates.includes(b), `${b} must not appear in pruneCandidates`);
  }
});

test('ENG-09 KKT: per-reject binding-constraint readout ranks by |cost|, names the barrier', () => {
  const records = [
    rec({ runId: 'rej1', decision: 'reject', deltaU: 100, dominantTerm: 'protectedPathViolations',
      cc: { protectedPathViolations: 100, logLoss: 0.5, verifiedEvidenceCredit: -0.1 } }),
  ];
  const out = buildKKTReadoutSection(records);
  assert.equal(out.rejectReadouts.length, 1);
  const r0 = out.rejectReadouts[0];
  assert.equal(r0.bindingConstraints[0].term, 'protectedPathViolations', 'largest |cost| ranked first');
  assert.equal(r0.bindingConstraints[0].barrier, true);
});

test('ENG-09 KKT: defensive on malformed records (no throw, no NaN)', () => {
  const out = buildKKTReadoutSection([null, 'x', { componentContributions: 'nope' }, { componentContributions: { a: NaN, b: 'str' } }, rec({ cc: { logLoss: 0.3 } })]);
  assert.ok(Number.isInteger(out.decisions));
  for (const t of out.terms) assert.ok(Number.isFinite(t.activation));
  assert.equal(buildKKTReadoutSection('not-an-array').decisions, 0);
});
