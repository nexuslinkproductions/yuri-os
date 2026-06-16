// origin-hygiene.test.mjs — GREEN/RED/GREY for the trace-hygiene `origin` tag (2026-06-16).
//
// GREEN: the feature works — default 'session', explicit origin persists, independent of corrId.
// RED:   planted-regression guards — the explicit origin MUST win over a corrSources.origin (the
//        spread-order fix: origin spread LAST in maybeTraceGateVerdict); a corrSources WITHOUT an
//        origin (the claim path) must not clobber the tag. If the spread order regresses, RED fails.
// GREY:  the SOAK-POPULATION property — a mixed-origin batch, filtered to origin==='session', returns
//        EXACTLY the live firings with zero synthetic leakage (the whole point of the hygiene tag).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gateProposal } from './yuri-energy.mjs';

// gateTracePath()/gateTraceEnabled() read YURI_STATE_DIR / YURI_GATE_TRACE at call time, so set
// per-call. Each fire() uses an isolated tmp trace dir + restores env (hermetic, never touches the live trace).
function fire(calls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orig-hyg-'));
  const prevDir = process.env.YURI_STATE_DIR;
  const prevTrace = process.env.YURI_GATE_TRACE;
  process.env.YURI_STATE_DIR = dir;
  process.env.YURI_GATE_TRACE = '1';
  try {
    for (const c of calls) gateProposal(c);
    const raw = fs.readFileSync(path.join(dir, 'energy-gate-trace.jsonl'), 'utf8').trim();
    return raw ? raw.split('\n').filter(Boolean).map((l) => JSON.parse(l).origin) : [];
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
    if (prevTrace === undefined) delete process.env.YURI_GATE_TRACE; else process.env.YURI_GATE_TRACE = prevTrace;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const SB = { verifiedEvidenceCount: 2 };
const SA = { verifiedEvidenceCount: 5 };

test('GREEN: default origin is "session"; an explicit origin persists', () => {
  const o = fire([{ stateBefore: SB, stateAfter: SA }, { stateBefore: SB, stateAfter: SA, origin: 'experiment' }]);
  assert.deepEqual(o, ['session', 'experiment']);
});

test('GREEN: origin persists in the main record, independent of the corrId flag', () => {
  const o = fire([{ stateBefore: SB, stateAfter: SA, origin: 'best-of-n' }]);
  assert.equal(o[0], 'best-of-n'); // not gated by YURI_GATE_TRACE_CORRID
});

test('RED: explicit origin WINS over a corrSources.origin (spread-order fix regression guard)', () => {
  // If `origin` were spread BEFORE `...corrSources` (the dormant defect verify caught), this reads
  // 'session' (the corrSources value) and a synthetic firing masquerades as live. The fix puts origin LAST.
  const o = fire([{ stateBefore: SB, stateAfter: SA, origin: 'breaker', corrSources: { origin: 'session', claimIds: ['x'] } }]);
  assert.equal(o[0], 'breaker', 'explicit caller origin must override any corrSources.origin');
});

test('RED: corrSources without an origin (the live claim path) does not clobber the tag', () => {
  const o = fire([{ stateBefore: SB, stateAfter: SA, origin: 'claim', corrSources: { claimIds: ['a', 'b'], kind: 'claim-transition' } }]);
  assert.equal(o[0], 'claim');
});

test('GREY: a mixed-origin batch filters origin==="session" to EXACTLY the live firings (soak property)', () => {
  const o = fire([
    { stateBefore: SB, stateAfter: SA },                       // live (default session)
    { stateBefore: SB, stateAfter: SA, origin: 'simulate' },
    { stateBefore: SB, stateAfter: SA, origin: 'shadow' },
    { stateBefore: SB, stateAfter: SA },                       // live
    { stateBefore: SB, stateAfter: SA, origin: 'experiment' },
  ]);
  assert.equal(o.length, 5);
  assert.equal(o.filter((x) => x === 'session').length, 2, 'exactly 2 live firings survive the filter');
  assert.deepEqual([...new Set(o)].sort(), ['experiment', 'session', 'shadow', 'simulate'], 'no synthetic origin collapses into session');
});
