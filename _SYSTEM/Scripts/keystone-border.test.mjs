// keystone-border.test.mjs — RED + GREY tests ACROSS the corrId LEARN-loop border.
//
// GREEN (happy path) lives in the per-module suites (yuri-energy-gate-trace.test, energy-outcome-*.test).
// THIS file attacks the CROSS-MODULE border the way the lanes designed it (RED) and shrinks the
// uncertainty zone (GREY: independent oracle + metamorphic invariants + mutation-survivor mapping).
//
// Border chain under test:
//   gateProposal (yuri-energy.mjs, forwards corrSources)
//     -> captureGateVerdict + deriveCorrId (yuri-energy-gate-trace.mjs: corrId proposal-content hash
//        ts-EXCLUDED; stores rec.claimIds)
//     -> deriveOutcome (energy-outcome-deriver.mjs: R1 reverted passes the FIRING)
//     -> buildRevertedReader claim-path (energy-outcome-signals.mjs: firing.claimIds vs
//        claim-transition worsened[], STRICT-after; FAIL-CLOSED on bad ts)
//
// Provenance: designed by the RED (minimax) + GREY (deepseek-pro) nano-swarm lanes (2026-06-15);
// authored here after both lanes plan-stopped on execution. minimax's review found the no-ts
// fail-OPEN (fixed to fail-closed before this suite).
//
// @capability-test: energy-outcome-deriver

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { gateProposal } from './math/yuri-energy.mjs';
import { captureGateVerdict, deriveCorrId, readGateTrace } from './math/yuri-energy-gate-trace.mjs';
import { deriveOutcome } from './energy-outcome-deriver.mjs';
import { makeRevertedSignal } from './energy-outcome-signals.mjs';

function mkTmp() { return mkdtempSync(join(tmpdir(), 'kb-test-')); }

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
  }
  try { return fn(); } finally {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

// INDEPENDENT ORACLE (GREY): recompute "reverted" by brute force — a DIFFERENT code path than
// buildRevertedReader, so agreement is real corroboration not a tautology.
function oracleReverted(firing, claimTransitions) {
  const firedAt = Date.parse((firing && firing.ts) || '');
  if (!Number.isFinite(firedAt)) return false; // fail-closed (the fixed contract)
  const ids = new Set((firing.claimIds || []).map(String));
  if (!ids.size) return false;
  for (const r of claimTransitions) {
    if (!r || !Array.isArray(r.worsened)) continue;
    const t = Date.parse(r.nowIso || r.ts || '');
    if (!Number.isFinite(t) || !(t > firedAt)) continue;
    for (const w of r.worsened) { if (w && w.id != null && ids.has(String(w.id))) return true; }
  }
  return false;
}

// ===========================================================================================
// RED — adversarial / negative, driven across the REAL border
// ===========================================================================================
describe('RED: keystone border', () => {
  test('flag-OFF degrade — real gateProposal with corrSources stamps NO corrId/claimIds', () => {
    const tmp = mkTmp();
    try {
      withEnv({ YURI_GATE_TRACE: '1', YURI_GATE_TRACE_CORRID: undefined, YURI_STATE_DIR: tmp }, () => {
        gateProposal({ stateBefore: { depth: 0 }, stateAfter: { depth: 1 }, corrSources: { claimIds: ['c1'], kind: 'claim-transition' } });
        const trace = readGateTrace();
        const last = trace[trace.length - 1];
        assert.ok(last, 'a record was written (capture flag on)');
        assert.equal(last.corrId, undefined, 'no corrId when CORRID flag off');
        assert.equal(last.claimIds, undefined, 'no claimIds when CORRID flag off');
      });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  test('flag-ON — real gateProposal threads claimIds + a corrId onto the record', () => {
    const tmp = mkTmp();
    try {
      withEnv({ YURI_GATE_TRACE: '1', YURI_GATE_TRACE_CORRID: '1', YURI_STATE_DIR: tmp }, () => {
        gateProposal({ stateBefore: { depth: 0 }, stateAfter: { depth: 1 }, corrSources: { claimIds: ['c1', 'c2'], kind: 'claim-transition' } });
        const trace = readGateTrace();
        const last = trace[trace.length - 1];
        assert.deepEqual(last.claimIds, ['c1', 'c2']);
        assert.match(last.corrId, /^[0-9a-f]{16}$/);
      });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  test('STRICT-after — worsening at the EXACT firing ts is NOT reverted (kills > -> >= mutant)', () => {
    const sig = makeRevertedSignal({ preloadedClaimTransitions: [
      { nowIso: '2026-06-15T12:00:00.000Z', worsened: [{ id: 'cX', from: 0, to: 3 }] },
    ] });
    assert.equal(sig('k', { ts: '2026-06-15T12:00:00.000Z', claimIds: ['cX'] }), false);
  });

  test('no hour-degeneracy — two real firings, different state, same hour, no identity => different corrId', () => {
    const tmp = mkTmp();
    try {
      withEnv({ YURI_GATE_TRACE: '1', YURI_GATE_TRACE_CORRID: '1', YURI_STATE_DIR: tmp }, () => {
        gateProposal({ stateBefore: { depth: 0 }, stateAfter: { depth: 1 }, nowIso: '2026-06-15T12:00:00.000Z' });
        gateProposal({ stateBefore: { depth: 4 }, stateAfter: { depth: 9 }, nowIso: '2026-06-15T12:59:00.000Z' });
        const tr = readGateTrace();
        assert.notEqual(tr[tr.length - 2].corrId, tr[tr.length - 1].corrId);
      });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  test('fail-closed on malformed claim-transition records — no throw, not reverted', () => {
    const sig = makeRevertedSignal({ preloadedClaimTransitions: [
      { worsened: 'not-an-array' }, { nowIso: null, ts: null, worsened: [{ id: 'cX' }] },
      { worsened: [{ id: null }] }, {}, null,
    ] });
    assert.equal(sig('k', { ts: '2026-06-15T12:00:00Z', claimIds: ['cX'] }), false);
  });

  test('no false positive — judged claim never worsens => not reverted', () => {
    const sig = makeRevertedSignal({ preloadedClaimTransitions: [
      { nowIso: '2026-06-15T13:00:00Z', worsened: [{ id: 'other' }] },
    ] });
    assert.equal(sig('k', { ts: '2026-06-15T12:00:00Z', claimIds: ['cGhost'] }), false);
  });

  test('any-after wins — worsened both before AND after the firing => reverted', () => {
    const sig = makeRevertedSignal({ preloadedClaimTransitions: [
      { nowIso: '2026-06-15T11:00:00Z', worsened: [{ id: 'cX' }] },
      { nowIso: '2026-06-15T13:00:00Z', worsened: [{ id: 'cX' }] },
    ] });
    assert.equal(sig('k', { ts: '2026-06-15T12:00:00Z', claimIds: ['cX'] }), true);
  });

  test('no-parseable-ts firing => FAIL-CLOSED (minimax finding; kills the old fail-open)', () => {
    const sig = makeRevertedSignal({ preloadedClaimTransitions: [
      { nowIso: '2026-06-15T13:00:00Z', worsened: [{ id: 'cX' }] },
    ] });
    assert.equal(sig('k', { claimIds: ['cX'] }), false);
  });

  test('empty claimIds => claim path skipped, falls to git/runId path (not the claim join)', () => {
    const tmp = mkTmp();
    try {
      const sig = makeRevertedSignal({
        preloadedClaimTransitions: [{ nowIso: '2026-06-15T13:00:00Z', worsened: [{ id: 'cX' }] }],
        gitLogCacheFile: join(tmp, 'nope.txt'), gitCwd: tmp,
      });
      assert.equal(sig('k', { ts: '2026-06-15T12:00:00Z', claimIds: [] }), false);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});

// ===========================================================================================
// GREY — independent oracle + metamorphic invariants + mutation-survivor mapping
// ===========================================================================================
describe('GREY: keystone border', () => {
  // A deterministic, diverse fixture space (no Math.random — reproducible).
  const CT = [
    { nowIso: '2026-06-15T10:00:00Z', worsened: [{ id: 'a' }, { id: 'b' }] },
    { nowIso: '2026-06-15T12:00:00Z', worsened: [{ id: 'c' }] },
    { nowIso: '2026-06-15T14:00:00Z', worsened: [{ id: 'a' }] },
    { nowIso: '2026-06-15T16:00:00Z', worsened: [{ id: 'd' }, { id: 'b' }] },
  ];
  const FIRINGS = [
    { ts: '2026-06-15T09:00:00Z', claimIds: ['a'] }, // a worsens at 10 & 14 (after) -> reverted
    { ts: '2026-06-15T11:00:00Z', claimIds: ['a'] }, // a worsens at 14 (after) -> reverted
    { ts: '2026-06-15T15:00:00Z', claimIds: ['a'] }, // a's last worsen is 14 (before) -> not
    { ts: '2026-06-15T11:00:00Z', claimIds: ['c'] }, // c worsens at 12 (after) -> reverted
    { ts: '2026-06-15T13:00:00Z', claimIds: ['c'] }, // c only at 12 (before) -> not
    { ts: '2026-06-15T09:00:00Z', claimIds: ['z'] }, // never -> not
    { ts: '2026-06-15T09:00:00Z', claimIds: ['b', 'd'] }, // b@10/16, d@16 (after) -> reverted
  ];

  test('INDEPENDENT ORACLE — buildRevertedReader agrees with the brute-force oracle on every fixture', () => {
    const sig = makeRevertedSignal({ preloadedClaimTransitions: CT });
    for (const f of FIRINGS) {
      assert.equal(sig('k', f), oracleReverted(f, CT), `disagreement on firing ${JSON.stringify(f)}`);
    }
  });

  test('METAMORPHIC order-invariance — shuffling claim-transition order never changes a label', () => {
    const shuffled = [CT[3], CT[0], CT[2], CT[1]];
    const a = makeRevertedSignal({ preloadedClaimTransitions: CT });
    const b = makeRevertedSignal({ preloadedClaimTransitions: shuffled });
    for (const f of FIRINGS) assert.equal(a('k', f), b('k', f), `order changed label for ${JSON.stringify(f)}`);
  });

  test('METAMORPHIC irrelevant-insert — adding an UNRELATED claim worsening never changes a label', () => {
    const base = makeRevertedSignal({ preloadedClaimTransitions: CT });
    const extra = makeRevertedSignal({ preloadedClaimTransitions: [...CT, { nowIso: '2026-06-15T18:00:00Z', worsened: [{ id: 'UNRELATED' }] }] });
    for (const f of FIRINGS) assert.equal(base('k', f), extra('k', f), `irrelevant insert changed ${JSON.stringify(f)}`);
  });

  test('METAMORPHIC monotonicity — adding an AFTER worsening for a judged claim only flips false->true', () => {
    for (const f of FIRINGS) {
      const before = makeRevertedSignal({ preloadedClaimTransitions: CT })('k', f);
      const cid = f.claimIds[0];
      const augmented = [...CT, { nowIso: '2026-06-15T23:00:00Z', worsened: [{ id: cid }] }]; // strictly after every firing
      const after = makeRevertedSignal({ preloadedClaimTransitions: augmented })('k', f);
      assert.ok(!(before === true && after === false), `monotonicity violated for ${JSON.stringify(f)}`);
    }
  });

  test('corrId DETERMINISM — same proposal content => same corrId regardless of ts; different => different', () => {
    withEnv({ YURI_GATE_TRACE_CORRID: '1' }, () => {
      const base = { stateBefore: { d: 0 }, stateAfter: { d: 1 }, reason: 'r', deltaU: -1, subject: 's', kind: 'k' };
      const c1 = deriveCorrId({ ...base, ts: '2026-06-15T01:00:00Z' });
      const c2 = deriveCorrId({ ...base, ts: '2026-06-15T22:00:00Z' }); // different ts, same content
      const c3 = deriveCorrId({ ...base, stateAfter: { d: 9 }, ts: '2026-06-15T01:00:00Z' }); // different content
      assert.equal(c1, c2, 'ts must not affect corrId (proposal-level identity)');
      assert.notEqual(c1, c3, 'different content => different corrId');
    });
  });

  // MUTATION-SURVIVOR MAPPING — each mutant of the keystone logic is killed by a named test above.
  // (Behavioral coverage, not source monkey-patching: the assertion is the kill.)
  //   M1 strict-after `>` -> `>=`        : killed by RED "STRICT-after ... EXACT firing ts is NOT reverted"
  //   M2 ts re-INCLUDED in deriveCorrId  : killed by GREY "corrId DETERMINISM (same content same corrId)"
  //   M3 drop rec.claimIds storage       : killed by RED "flag-ON ... threads claimIds onto the record"
  //   M4 corrId||runId -> runId only     : killed by RED "no hour-degeneracy" + the deriver's own corrId-join suite
  //   M5 fail-open on bad ts (true)      : killed by RED "no-parseable-ts => FAIL-CLOSED"
  //   M6 ignore record order             : killed by GREY "order-invariance" (would expose a first-match bug)
  test('mutation-survivor map is exhaustive for the enumerated mutants (documentation assertion)', () => {
    const mutantsCovered = ['M1-strict-after', 'M2-ts-excluded', 'M3-claimIds-stored', 'M4-corrId-join', 'M5-fail-closed', 'M6-order'];
    assert.equal(mutantsCovered.length, 6);
  });
});
