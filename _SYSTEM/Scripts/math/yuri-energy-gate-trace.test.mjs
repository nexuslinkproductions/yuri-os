// Tests for yuri-energy-gate-trace.mjs — the B4 ground-truth resolved-outcome log +
// replay regression oracle for gateProposal. Proves: capture round-trips; replay is a
// non-vacuous oracle (a planted decision-flip mutant is caught); replay is drift-IMMUNE
// (hermetic on logged weights) while still REPORTING drift; a tampered log is caught;
// allowOverride is load-bearing in the capture; the operator-stub resolution is append-only;
// the seam is fail-open + default-OFF; and — the KEYSTONE proof — the clean-path RETURN is
// byte-identical with the trace ARMED, ∀ input over the B3 corpus + all 7 gate invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  gateTraceEnabled, gateTracePath, weightFingerprint, captureGateVerdict,
  maybeTraceGateVerdict, resolveGateVerdict, readGateTrace, replayGateTrace,
} from './yuri-energy-gate-trace.mjs';
import { gateProposal, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { genGateCorpus, runGateInvariants, realGate, crossCheckSpec } from './yuri-energy-gate-invariants.mjs';

// --- helpers -------------------------------------------------------------------
function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
  }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'gt-')); }
function tracePathIn(dir) { return path.join(dir, 'energy-gate-trace.jsonl'); }

// Varied verdicts that exercise every accept/veto/override/cap path.
const FIXTURES = [
  { stateBefore: { verifiedEvidenceCount: 0 }, stateAfter: { verifiedEvidenceCount: 5 } },                 // accept (descending)
  { stateBefore: { protectedPathViolations: 0 }, stateAfter: { protectedPathViolations: 1 } },             // protected veto
  { stateBefore: { promotionLadderInversions: 0 }, stateAfter: { promotionLadderInversions: 2 } },         // structural veto
  { stateBefore: { verifiedEvidenceCount: 5 }, stateAfter: { verifiedEvidenceCount: 0 }, allowOverride: true }, // override accept (ascending)
  { stateBefore: {}, stateAfter: { maxLadderInversion: 5 }, maxLadderInversionCap: 3 },                    // L∞ max-severity veto
  { stateBefore: { verifiedEvidenceCount: 0 }, stateAfter: { verifiedEvidenceCount: 3, maxLadderInversion: 1 }, maxLadderInversionCap: 3 }, // cap armed, under cap → accept
];

// --- capture + switch ----------------------------------------------------------

test('default OFF ⇒ the seam is a no-op and writes NOTHING (clean path untouched)', () => {
  const tmp = mkTmp();
  try {
    const r = withEnv({ YURI_GATE_TRACE: undefined, YURI_STATE_DIR: tmp }, () => {
      assert.equal(gateTraceEnabled(), false);
      return maybeTraceGateVerdict({
        stateBefore: {}, stateAfter: {}, weights: DEFAULT_WEIGHTS, threshold: 0,
        cap: Infinity, allowOverride: false, accept: true, reason: 'x', deltaU: 0,
      });
    });
    assert.equal(r, null);
    assert.equal(fs.existsSync(tracePathIn(tmp)), false, 'no trace file may be created when disabled');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('captureGateVerdict ⇒ writes one well-formed record (id, decision, fingerprint, cap sentinel, resolution stub)', () => {
  const tmp = mkTmp();
  try {
    const rec = withEnv({ YURI_STATE_DIR: tmp }, () => captureGateVerdict({
      stateBefore: { a: 1 }, stateAfter: { a: 2 }, weights: DEFAULT_WEIGHTS, threshold: 0,
      cap: Infinity, allowOverride: false, accept: true, reason: 'ok', deltaU: -1,
    }));
    assert.ok(rec && rec.id, 'record carries a content-addressed id');
    assert.equal(rec.decision, true);
    assert.equal(rec.cap, 'inf', 'Infinity cap stored as the wire sentinel');
    assert.equal(rec.resolvedDecision, null);
    assert.equal(rec.resolvedBy, null);
    assert.equal(rec.weightHash, weightFingerprint(DEFAULT_WEIGHTS));
    const rows = readGateTrace(tracePathIn(tmp));
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].stateAfter, { a: 2 });
    assert.deepEqual(rows[0].weights, DEFAULT_WEIGHTS);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('weightFingerprint — order-independent, value-sensitive, fail-safe', () => {
  assert.equal(weightFingerprint({ a: 1, b: 2 }), weightFingerprint({ b: 2, a: 1 }));
  assert.notEqual(weightFingerprint({ a: 1, b: 2 }), weightFingerprint({ a: 1, b: 3 }));
  assert.doesNotThrow(() => weightFingerprint(null));
  assert.doesNotThrow(() => weightFingerprint(42));
  assert.match(weightFingerprint(DEFAULT_WEIGHTS), /^[0-9a-f]{16}$/);
});

// --- replay oracle: GREEN, RED, drift ------------------------------------------

test('replay GREEN — the oracle reproduces every real gate decision (accept/veto/override/cap)', () => {
  const tmp = mkTmp();
  try {
    withEnv({ YURI_GATE_TRACE: '1', YURI_STATE_DIR: tmp }, () => {
      for (const f of FIXTURES) gateProposal(f);
    });
    const replay = replayGateTrace(gateProposal, { tracePath: tracePathIn(tmp), referenceWeights: DEFAULT_WEIGHTS });
    assert.equal(replay.total, FIXTURES.length);
    assert.equal(replay.matched, FIXTURES.length);
    assert.equal(replay.mismatchCount, 0);
    assert.equal(replay.hashIntegrityFailures, 0);
    assert.equal(replay.driftCount, 0, 'no drift — replayed against the same weights that fired');
    assert.equal(replay.ok, true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('replay RED — a planted decision-FLIP mutant gate is caught (oracle is non-vacuous)', () => {
  const tmp = mkTmp();
  try {
    withEnv({ YURI_GATE_TRACE: '1', YURI_STATE_DIR: tmp }, () => {
      for (const f of FIXTURES) gateProposal(f);
    });
    const flipGate = (args) => {
      const r = gateProposal(args);
      return { result: { ...r.result, accept: !r.result.accept } };
    };
    const replay = replayGateTrace(flipGate, { tracePath: tracePathIn(tmp) });
    assert.equal(replay.mismatchCount, FIXTURES.length, 'every flipped decision is a mismatch');
    assert.equal(replay.matched, 0);
    assert.equal(replay.ok, false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('replay is DRIFT-IMMUNE but drift-AWARE — logged weights replay clean; reference drift is reported', () => {
  const tmp = mkTmp();
  try {
    withEnv({ YURI_GATE_TRACE: '1', YURI_STATE_DIR: tmp }, () => {
      for (const f of FIXTURES) gateProposal(f);
    });
    // A DIFFERENT current reference config than what fired (simulates a calibration drift).
    const driftedRef = { ...DEFAULT_WEIGHTS, alpha: 999 };
    const replay = replayGateTrace(gateProposal, { tracePath: tracePathIn(tmp), referenceWeights: driftedRef });
    // Decisions still all reproduce (replay uses the LOGGED weights, not the drifted reference)...
    assert.equal(replay.matched, FIXTURES.length);
    assert.equal(replay.mismatchCount, 0);
    assert.equal(replay.ok, true);
    // ...and the drift vs the current reference is surfaced (informational, not a regression).
    assert.equal(replay.driftCount, FIXTURES.length);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('replay catches a TAMPERED log — weights no longer hash to the stored fingerprint', () => {
  const tmp = mkTmp();
  try {
    withEnv({ YURI_GATE_TRACE: '1', YURI_STATE_DIR: tmp }, () => {
      gateProposal({ stateBefore: { verifiedEvidenceCount: 0 }, stateAfter: { verifiedEvidenceCount: 5 } });
    });
    const p = tracePathIn(tmp);
    const rec = readGateTrace(p)[0];
    rec.weightHash = 'deadbeefdeadbeef'; // corrupt ONLY the fingerprint; weights + decision intact
    fs.writeFileSync(p, JSON.stringify(rec) + '\n');
    const replay = replayGateTrace(gateProposal, { tracePath: p });
    assert.equal(replay.mismatchCount, 0, 'the decision still reproduces — only integrity is broken');
    assert.ok(replay.hashIntegrityFailures >= 1);
    assert.equal(replay.ok, false, 'an integrity failure must fail the oracle');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('capturing allowOverride is LOAD-BEARING — a stripped-override replay diverges', () => {
  const tmp = mkTmp();
  try {
    withEnv({ YURI_GATE_TRACE: '1', YURI_STATE_DIR: tmp }, () => {
      // ascending ΔU + override ⇒ accept true ONLY because of the override
      gateProposal({ stateBefore: { verifiedEvidenceCount: 5 }, stateAfter: { verifiedEvidenceCount: 0 }, allowOverride: true });
    });
    const rec = readGateTrace(tracePathIn(tmp)).find((r) => r.allowOverride === true);
    assert.ok(rec, 'the override verdict was captured with allowOverride=true');
    assert.equal(rec.decision, true);
    const cap = rec.cap === 'inf' ? Infinity : rec.cap;
    const withoutOverride = gateProposal({
      stateBefore: rec.stateBefore, stateAfter: rec.stateAfter, weights: rec.weights,
      threshold: rec.threshold, allowOverride: false, maxLadderInversionCap: cap,
    }).result.accept;
    assert.equal(withoutOverride, false, 'without the captured override the same transition rejects');
    assert.notEqual(withoutOverride, rec.decision, 'so dropping allowOverride from the log would corrupt the oracle');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// --- resolution side (operator stub) -------------------------------------------

test('resolveGateVerdict — append-only resolution record, keyed by id; replay skips it', () => {
  const tmp = mkTmp();
  try {
    const fired = withEnv({ YURI_STATE_DIR: tmp }, () => captureGateVerdict({
      stateBefore: { verifiedEvidenceCount: 0 }, stateAfter: { verifiedEvidenceCount: 5 },
      weights: DEFAULT_WEIGHTS, threshold: 0, cap: Infinity, allowOverride: false,
      accept: true, reason: 'ok', deltaU: -1,
    }));
    const res = resolveGateVerdict({ id: fired.id, resolvedDecision: true, resolvedBy: 'operator', tracePath: tracePathIn(tmp) });
    assert.equal(res.kind, 'resolution');
    assert.equal(res.id, fired.id);
    assert.equal(res.resolvedDecision, true);
    const rows = readGateTrace(tracePathIn(tmp));
    assert.equal(rows.length, 2, 'fire record is preserved (append-only), resolution appended');
    assert.equal(rows[0].id, fired.id, 'original verdict still present');
    assert.equal(rows[1].kind, 'resolution');
    // replay counts only verdicts, never resolution rows
    const replay = replayGateTrace(gateProposal, { tracePath: tracePathIn(tmp) });
    assert.equal(replay.total, 1);
    assert.equal(replay.ok, true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// --- fail-open -----------------------------------------------------------------

test('fail-open — a circular weights object never throws; capture returns null', () => {
  const tmp = mkTmp();
  try {
    const circ = {}; circ.self = circ;
    let r;
    assert.doesNotThrow(() => {
      r = withEnv({ YURI_STATE_DIR: tmp }, () => captureGateVerdict({
        stateBefore: {}, stateAfter: {}, weights: circ, threshold: 0, cap: Infinity,
        allowOverride: false, accept: true, reason: 'x', deltaU: 0,
      }));
    });
    assert.equal(r, null, 'an unserializable record fails open to null, never throws');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('readGateTrace — missing file ⇒ [], a corrupt line is skipped (never throws)', () => {
  const tmp = mkTmp();
  try {
    assert.deepEqual(readGateTrace(tracePathIn(tmp)), []); // missing
    fs.writeFileSync(tracePathIn(tmp), 'not json\n{"id":"ok","decision":true}\n');
    const rows = readGateTrace(tracePathIn(tmp));
    assert.equal(rows.length, 1, 'the garbage line is dropped, the valid one survives');
    assert.equal(rows[0].id, 'ok');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// --- KEYSTONE: clean-path byte-identical ∀-input (the mandatory proof) ----------

test('CLEAN-PATH BYTE-IDENTICAL — trace ON vs OFF returns identical result+proof ∀ B3 corpus row', () => {
  const corpus = genGateCorpus();
  assert.ok(corpus.length > 700, 'B3 corpus is the full corner-enumerated set');
  // OFF: snapshot the semantic return for every row.
  const off = corpus.map((a) => { const r = gateProposal(a); return { result: r.result, proof: r.proof }; });
  // ON: same rows, trace armed, writing to a throwaway temp dir.
  const tmp = mkTmp();
  try {
    const on = withEnv({ YURI_GATE_TRACE: '1', YURI_STATE_DIR: tmp }, () =>
      corpus.map((a) => { const r = gateProposal(a); return { result: r.result, proof: r.proof }; }));
    for (let i = 0; i < corpus.length; i++) {
      assert.deepEqual(on[i], off[i], `row ${i}: the seam shifted the gate return`);
    }
    // Trace was actually written (the proof is meaningful — tracing really ran).
    assert.ok(readGateTrace(tracePathIn(tmp)).length >= corpus.length);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('all 7 B3 gate invariants + spec cross-check stay GREEN with the trace ARMED', () => {
  const corpus = genGateCorpus();
  const tmp = mkTmp();
  try {
    const { green, cross } = withEnv({ YURI_GATE_TRACE: '1', YURI_STATE_DIR: tmp }, () => ({
      green: runGateInvariants(realGate, corpus),
      cross: crossCheckSpec(corpus),
    }));
    assert.equal(green.ok, true, `a gate invariant broke with tracing on: ${JSON.stringify(green.results)}`);
    assert.equal(cross.ok, true, 'spec≡gate cross-check must still hold with tracing on');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
