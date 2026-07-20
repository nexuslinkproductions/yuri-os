import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyTransition, isProtectedPath, applyTransition, freshState,
  evaluateTransition, salience, shouldGate, tickAndTrace, TIER,
  DEFAULT_SALIENCE, isSurprise, surpriseEngaged,
} from './energy-tick-core.mjs';

const editOk = { tool_name: 'Edit', tool_input: { file_path: 'src/app.js' }, tool_response: { is_error: false } };
const bashFail = { tool_name: 'Bash', tool_input: {}, tool_response: { is_error: true } };
const bashOk = { tool_name: 'Bash', tool_input: {}, tool_response: { is_error: false } };
const protectedEdit = { tool_name: 'Write', tool_input: { file_path: '.env' }, tool_response: { is_error: false } };

test('WIRE — a poisoned persisted ledger does NOT throw or wedge the tick (fail-open)', () => {
  // Red-team: a corrupted/truncated snapshot ledger with a null element used to throw
  // out of tickAndTrace BEFORE the trace/persist, silently killing observability for the
  // session. It must now still trace + return a clean ledger.
  const r = tickAndTrace(freshState(), editOk, { nowIso: '2026-06-03T12:00:00.000Z', ledger: { claims: [null, { id: 'a', claimedStatus: 'fixture_ready', evidence: [] }], seq: 0 } });
  assert.equal(r.traced, true, 'the tick still traced despite the poisoned ledger');
  assert.ok(r.ledger && Array.isArray(r.ledger.claims) && r.ledger.claims.every((c) => c && typeof c === 'object'), 'returned ledger is clean (poison filtered)');
});

test('isProtectedPath flags protected surfaces, passes normal files', () => {
  assert.equal(isProtectedPath('.env'), true);
  assert.equal(isProtectedPath('backend/data/users.db'), true);
  assert.equal(isProtectedPath('.claude/state/x.json'), true);
  assert.equal(isProtectedPath('node_modules/foo/index.js'), true);
  assert.equal(isProtectedPath('src/app.js'), false);
  assert.equal(isProtectedPath('_SYSTEM/Scripts/yuri-user.mjs'), false);
});

test('classifyTransition extracts tool, success, and protected-path hit', () => {
  const t = classifyTransition(editOk);
  assert.equal(t.tool, 'Edit');
  assert.equal(t.success, true);
  assert.equal(t.isMutating, true);
  assert.equal(t.protectedHit, false);
  assert.equal(classifyTransition(protectedEdit).protectedHit, true);
  assert.equal(classifyTransition(bashFail).success, false);
});

test('applyTransition: success credits verified evidence, no calibration penalty', () => {
  const s = applyTransition(freshState(), classifyTransition(editOk), '2026-05-30T00:00:00Z');
  assert.equal(s.verifiedEvidenceCount, 1);
  assert.equal(s.evidence.length, 1);
  assert.deepEqual(s.predictions, []); // correct claims are not penalized
  assert.deepEqual(s.outcomes, []);
});

test('applyTransition: failure records the confidently-wrong pair, credits NO evidence', () => {
  const s = applyTransition(freshState(), classifyTransition(bashFail), '');
  assert.equal(s.verifiedEvidenceCount, 0);
  assert.deepEqual(s.predictions, [0.9]);
  assert.deepEqual(s.outcomes, [0]);
});

test('applyTransition: protected-path edit increments the violation count', () => {
  const s = applyTransition(freshState(), classifyTransition(protectedEdit), '');
  assert.equal(s.protectedPathViolations, 1);
});

test('applyTransition does not mutate the previous state', () => {
  const prev = freshState();
  applyTransition(prev, classifyTransition(editOk), '');
  assert.equal(prev.verifiedEvidenceCount, 0);
  assert.equal(prev.predictions.length, 0);
});

// --- the load-bearing proof: the gate descends on healthy work, ascends on bad ---

test('GATE: a successful edit produces descent (ΔU < 0, accepted)', () => {
  const r = evaluateTransition(freshState(), editOk, '');
  assert.ok(r.deltaU < 0, `expected descent, got ΔU=${r.deltaU}`);
  assert.equal(r.accept, true);
});

test('GATE: a failed verification produces ascent (ΔU > 0)', () => {
  // seed a little healthy history so the failure is a genuine reversal
  let s = applyTransition(freshState(), classifyTransition(bashOk), '');
  s = applyTransition(s, classifyTransition(bashOk), '');
  const r = evaluateTransition(s, bashFail, '');
  assert.ok(r.deltaU > 0, `expected ascent on failed verification, got ΔU=${r.deltaU}`);
});

test('GATE: a protected-path edit slams U up and the gate REJECTS', () => {
  const r = evaluateTransition(freshState(), protectedEdit, '');
  assert.ok(r.deltaU >= 100, `protected-path term (eta=100) must dominate, got ΔU=${r.deltaU}`);
  assert.equal(r.accept, false);
  assert.equal(r.dominantTerm, 'protectedPathViolations');
});

test('rolling arrays are capped (no unbounded snapshot growth)', () => {
  let f = freshState();
  for (let i = 0; i < 120; i++) f = applyTransition(f, classifyTransition(bashFail), '');
  assert.ok(f.predictions.length <= 50, `predictions capped, got ${f.predictions.length}`);
  assert.ok(f.outcomes.length <= 50);
  let e = freshState();
  for (let i = 0; i < 120; i++) e = applyTransition(e, classifyTransition(bashOk), '');
  assert.ok(e.evidence.length <= 50, `evidence capped, got ${e.evidence.length}`);
});

// --- salience: WHEN does the gate fire? (the front door) ---

const readEvent = { tool_name: 'Read', tool_input: { file_path: 'x.js' }, tool_response: {} };

test('salience: reads / navigation are SKIP (no math runs)', () => {
  assert.equal(salience(classifyTransition(readEvent)), TIER.SKIP);
  assert.equal(shouldGate(classifyTransition(readEvent)), false);
});

test('salience: real edits and passing commands are WORK', () => {
  assert.equal(salience(classifyTransition(editOk)), TIER.WORK);
  assert.equal(salience(classifyTransition(bashOk)), TIER.WORK);
  assert.equal(shouldGate(classifyTransition(editOk)), true);
});

test('salience: failures and protected-path hits are CRITICAL', () => {
  assert.equal(salience(classifyTransition(bashFail)), TIER.CRITICAL);
  assert.equal(salience(classifyTransition(protectedEdit)), TIER.CRITICAL);
});

test('tickAndTrace SKIPs a read — no trace, state unchanged', () => {
  const prev = freshState();
  const r = tickAndTrace(prev, readEvent, { nowIso: '2026-05-30T00:00:00Z' });
  assert.equal(r.traced, false);
  assert.equal(r.tier, TIER.SKIP);
  assert.equal(r.state, prev);
});

test('tickAndTrace WORK transition writes a regime=action, lane=session record', () => {
  const prevDir = process.env.YURI_STATE_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-'));
  process.env.YURI_STATE_DIR = dir;
  try {
    const r = tickAndTrace(freshState(), editOk, { nowIso: new Date().toISOString(), user: 'marcel' });
    assert.equal(r.traced, true);
    assert.equal(r.tier, TIER.WORK);
    const date = new Date().toISOString().slice(0, 10);
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'energy-trace', `${date}.jsonl`), 'utf8').trim().split('\n').pop());
    assert.equal(rec.lane, 'session');
    assert.equal(rec.regime, 'action');
    assert.equal(rec.user, 'marcel');
    assert.equal(rec.event, 'Proposal Accepted'); // descent → accepted
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
  }
});

// --- Layer C: depth-gated |ΔU| surprise ---

test('isSurprise needs a baseline band, then flags outliers', () => {
  assert.equal(isSurprise(10, [1, 1], DEFAULT_SALIENCE), false);       // band too small
  assert.equal(isSurprise(1, [1, 1, 1, 1], DEFAULT_SALIENCE), false);  // inside the band
  assert.equal(isSurprise(10, [1, 1, 1, 1], DEFAULT_SALIENCE), true);  // clear outlier
});

test('surpriseEngaged requires BOTH depth AND surprise (the depth gate)', () => {
  const band = [1, 1, 1, 1];
  assert.equal(surpriseEngaged({ depth: 3, deltaU: 10, recentAbs: band }), false); // surprising but shallow
  assert.equal(surpriseEngaged({ depth: 8, deltaU: 10, recentAbs: band }), true);  // deep + surprising
  assert.equal(surpriseEngaged({ depth: 8, deltaU: 1, recentAbs: band }), false);  // deep but routine
});

test('tickAndTrace threads depth + |ΔU| band; surprise stays off while shallow', () => {
  const prevDir = process.env.YURI_STATE_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tickC-'));
  process.env.YURI_STATE_DIR = dir;
  try {
    let st = freshState(); let depth = 0; let recentAbs = [];
    for (let i = 0; i < 3; i++) {
      const r = tickAndTrace(st, editOk, { nowIso: new Date().toISOString(), user: 'marcel', depth, recentAbs });
      st = r.state; depth = r.depth; recentAbs = r.recentAbs;
      assert.equal(r.surpriseEngaged, false, 'shallow depth must never engage surprise');
    }
    assert.equal(depth, 3);
    assert.equal(recentAbs.length, 3);
    // a SKIP (read) must not advance depth
    const rs = tickAndTrace(st, { tool_name: 'Read', tool_input: {}, tool_response: {} }, { depth, recentAbs });
    assert.equal(rs.depth, 3);
    assert.equal(rs.traced, false);
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
  }
});

test('CRITICAL auto-engages deep but does NOT pollute the WORK surprise band', () => {
  const prevDir = process.env.YURI_STATE_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tickD-'));
  process.env.YURI_STATE_DIR = dir;
  try {
    // seed a small WORK band, then a protected-path write (CRITICAL, ΔU=100)
    const seed = tickAndTrace(freshState(), editOk, { depth: 5, recentAbs: [0.1, 0.1, 0.1] });
    const crit = tickAndTrace(seed.state, protectedEdit, { depth: seed.depth, recentAbs: seed.recentAbs });
    assert.equal(crit.tier, TIER.CRITICAL);
    assert.equal(crit.deepEngaged, true, 'CRITICAL must auto-engage the deep path regardless of depth/surprise');
    assert.ok(!crit.recentAbs.includes(100), 'the CRITICAL ΔU=100 must not enter the WORK band');
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
  }
});

test('LIVE: energy-weights.json cannot disable the protected-path veto with eta=0 (red-team #1)', () => {
  const cfgFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')), 'energy-weights.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ weights: { eta: 0 } }));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgst-'));
  const prevDir = process.env.YURI_STATE_DIR; process.env.YURI_STATE_DIR = stateDir;
  try {
    // eta=0 is a veto-bearing weight → dropped by the config clamp, so the live hard veto stays
    // armed (the forgery is blocked). default eta=100 → protected ΔU=100, deep auto-engages.
    const r = tickAndTrace(freshState(), protectedEdit, { configFile: cfgFile });
    assert.equal(r.deltaU, 100);
    assert.equal(r.deepEngaged, true);
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
  }
});

// --- Phase-3 wire regressions (math-base fix wave 2026-06-10) ---

test('WIRE — claim-veto trace reject produces a catastrophic breaker verdict + trip + deny, same tick', async () => {
  const { isCatastrophic, transitionOnVerdict, evaluateGate, freshBreaker, DEFAULT_BREAKER_CFG, BREAKER_STATE } = await import('./energy-breaker.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire1-'));
  const prevDir = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = dir;
  try {
    const ledger = { claims: [{ id: 'x.mjs', claimedStatus: 'trusted', evidence: [], updatedSeq: 0 }], seq: 1 };
    const r = tickAndTrace(freshState(), editOk, { nowIso: '2026-06-10T00:00:00.000Z', ledger });
    assert.equal(r.traced, true);
    assert.equal(r.verdict.accept, false, 'breaker verdict must see the claim veto');
    assert.equal(r.verdict.maxSeverityVeto, true);
    assert.equal(r.verdict.deltaU, r.deltaU, 'ONE book: breaker ΔU === trace ΔU');
    assert.equal(isCatastrophic(r.verdict), true);
    const t0 = Date.parse('2026-06-10T00:00:00.000Z');
    const b = transitionOnVerdict(freshBreaker(), r.verdict, t0);
    assert.equal(b.state, BREAKER_STATE.OPEN, 'trip');
    assert.equal(evaluateGate(b, t0 + 1000, DEFAULT_BREAKER_CFG).decision, 'deny', 'enforce-armed deny');
    // Negative control: a clean ledger accepts and the breaker stays CLOSED.
    const clean = tickAndTrace(freshState(), editOk, { nowIso: '2026-06-10T00:00:01.000Z' });
    assert.equal(clean.verdict.accept, true);
    assert.equal(transitionOnVerdict(freshBreaker(), clean.verdict, t0).state, BREAKER_STATE.CLOSED);
    // cap=1 (owner decision D1): an honest 1-rung VERIFY-FIRST claim is workflow, not a veto.
    const oneRung = { claims: [{ id: 'y.mjs', claimedStatus: 'runtime_tested', evidence: [{ kind: 'fixture', capturedAt: Date.parse('2026-06-10T00:00:00.000Z'), reference: 'y.mjs' }], updatedSeq: 0 }], seq: 1 };
    const v1 = tickAndTrace(freshState(), editOk, { nowIso: '2026-06-10T00:00:02.000Z', ledger: oneRung });
    assert.equal(v1.verdict.accept, true, '1-rung VERIFY-FIRST passes under cap=1');
    assert.equal(v1.verdict.maxSeverityVeto, false);
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WIRE — verdict and trace share weights/threshold (no second book; tuned iota shifts both identically)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire2-'));
  const cfgFile = path.join(dir, 'cfg.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ weights: { iota: 1.0 } }));
  const prevDir = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = dir;
  try {
    let st = freshState();
    let ledger;
    for (let i = 0; i < 3; i += 1) {
      const r = tickAndTrace(st, editOk, { nowIso: `2026-06-10T00:00:0${i}.000Z`, ledger, configFile: cfgFile });
      assert.equal(r.verdict.deltaU, r.deltaU, 'per-tick: verdict ΔU === trace ΔU exactly');
      st = r.state;
      ledger = r.ledger;
    }
    // Discriminator: iota 1.0 shifts the clean-edit first-tick ΔU to -0.693…; the
    // old second-book verdictFromStates (default weights) would report -0.069….
    const fresh = tickAndTrace(freshState(), editOk, { nowIso: '2026-06-10T00:01:00.000Z', configFile: cfgFile });
    assert.equal(fresh.verdict.deltaU, -0.693147181);
    const noCfg = tickAndTrace(freshState(), editOk, { nowIso: '2026-06-10T00:01:01.000Z' });
    assert.equal(noCfg.verdict.deltaU, -0.069314718); // negative control: default weights
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('toGateState does not alias forecasts/results — one malformed entry costs exactly λ once', async () => {
  const { computeU } = await import('./math/yuri-energy.mjs');
  const { toGateState } = await import('./energy-tick-core.mjs');
  const s = toGateState({ predictions: [2], outcomes: [0] });
  assert.equal('forecasts' in s, false);
  assert.equal('results' in s, false);
  const r = computeU(s).result;
  assert.equal(r.components.malformedForecast.value, 1);
  assert.equal(r.contributions.malformedForecast, 50);
});

test('ζ staleness: config halfLifeDays sets the aging rate; default (live config) keeps ζ ENGAGED measuring real age (B4: no phantom fail-closed)', () => {
  // B4 FIX: ζ is now ALWAYS engaged — applyTransition records self-describe a halfLife and the live
  // energy-weights.json carries staleness.halfLifeDays, so there is no "dead" state. The per-tick
  // configFile OVERRIDES the halfLife (shorter halfLife → faster aging → MORE staleness for the same
  // age). The old "absent flag keeps it dead" behavior was the bug (bare records → fail-closed phantom
  // +0.5·N on healthy work); this asserts the engaged real-age behavior instead.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeta6-'));
  const cfgFile = path.join(dir, 'cfg.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ staleness: { halfLifeDays: 7 } }));
  const prevDir = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = dir;
  try {
    const prev = { ...freshState(), verifiedEvidenceCount: 1, evidence: [{ base: 1, age: 0, capturedAt: '2026-06-03T00:00:00.000Z' }] };
    tickAndTrace(prev, bashOk, { nowIso: '2026-06-10T00:00:00.000Z', configFile: cfgFile }); // halfLife 7
    tickAndTrace(prev, bashOk, { nowIso: '2026-06-10T00:00:01.000Z' });                       // default → live config halfLife 30
    const traceDir = path.join(dir, 'energy-trace');
    const file = fs.readdirSync(traceDir).find((x) => x.endsWith('.jsonl'));
    const recs = fs.readFileSync(path.join(traceDir, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    // Config halfLife 7: the 7-day-old prev record is at exactly one half-life → ζ0.5 × (1−0.5) = 0.25
    // (the tick's fresh age-0 record contributes 0).
    assert.equal(recs[0].componentContributions.staleness, 0.25);
    // Default (live config halfLife 30): ζ stays ENGAGED, measuring REAL age — the same 7-day record
    // ages more slowly, so 0 < staleness < 0.25, and crucially it is NOT the fail-closed phantom (0.5).
    const def = recs[1].componentContributions.staleness;
    assert.equal(typeof def, 'number', 'ζ must be engaged (present) under the default live config, not dead');
    assert.ok(def > 0 && def < 0.25, `default-halfLife staleness must measure real age (0 < x < 0.25), got ${def}`);
    assert.notEqual(def, 0.5, 'must NOT be the bare-record fail-closed phantom (0.5·N)');
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ζ staleness remains engaged when the canonical config is absent or only partially materialized', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeta-sparse-'));
  const missingConfig = path.join(dir, 'not-materialized.json');
  const previousStateDir = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = dir;
  try {
    const prev = {
      ...freshState(),
      verifiedEvidenceCount: 1,
      evidence: [{ base: 1, age: 0, capturedAt: '2026-06-03T00:00:00.000Z' }],
    };
    tickAndTrace(prev, bashOk, {
      nowIso: '2026-06-10T00:00:00.000Z',
      configFile: missingConfig,
    });
    const traceDir = path.join(dir, 'energy-trace');
    const file = fs.readdirSync(traceDir).find((name) => name.endsWith('.jsonl'));
    const record = JSON.parse(fs.readFileSync(path.join(traceDir, file), 'utf8').trim());
    assert.ok(
      record.componentContributions.staleness > 0,
      `sparse/absent config must retain real-age ζ via the in-code 30-day default, got ${record.componentContributions.staleness}`,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.YURI_STATE_DIR;
    else process.env.YURI_STATE_DIR = previousStateDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('WIRE — 3 consecutive claimGateFields failures trip gateErrorVeto (bounded fail-open); SKIP ticks neither reset nor extend', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cff7c-'));
  const prevDir = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = dir;
  try {
    const poisoned = { claims: [], seq: 0 };
    Object.defineProperty(poisoned.claims, 0, { get() { throw new Error('poison'); } });
    poisoned.claims.length = 1;
    let cff = 0;
    let st = freshState();
    const vetoes = [];
    for (let i = 0; i < 2; i += 1) {
      const r = tickAndTrace(st, editOk, { nowIso: `2026-06-10T00:00:0${i}.000Z`, ledger: poisoned, claimFieldFailures: cff });
      vetoes.push(r.verdict.gateErrorVeto);
      cff = r.claimFieldFailures;
      st = r.state;
    }
    // SKIP interleaving must not reset the 2-count (or the laundering window extends unboundedly).
    const skip = tickAndTrace(st, { tool_name: 'Read', tool_input: {}, tool_response: {} }, { claimFieldFailures: cff });
    assert.equal(skip.claimFieldFailures, 2, 'SKIP passthrough preserves the counter');
    assert.equal(skip.verdict, null);
    cff = skip.claimFieldFailures;
    const r3 = tickAndTrace(st, editOk, { nowIso: '2026-06-10T00:00:03.000Z', ledger: poisoned, claimFieldFailures: cff });
    vetoes.push(r3.verdict.gateErrorVeto);
    assert.deepEqual(vetoes, [false, false, true], 'fail-open for 2 ticks, veto on the 3rd');
    // Healthy ledger resets the counter.
    const healthy = tickAndTrace(st, editOk, { nowIso: '2026-06-10T00:00:04.000Z', claimFieldFailures: r3.claimFieldFailures });
    assert.equal(healthy.claimFieldFailures, 0);
    assert.equal(healthy.verdict.gateErrorVeto, false);
  } finally {
    if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyTransition deep-copies evidence records — mutating the output cannot reach back into prev', () => {
  const s1 = applyTransition(freshState(), classifyTransition(editOk), '2026-01-01'); // 1 evidence record
  assert.equal(s1.evidence.length, 1);
  const s2 = applyTransition(s1, classifyTransition(editOk), '2026-01-02'); // carries s1's record + appends
  assert.equal(s2.evidence.length, 2);
  assert.notEqual(s2.evidence[0], s1.evidence[0], 'carried evidence record is a copy, not the same reference');
  s2.evidence[0].base = 999;
  assert.equal(s1.evidence[0].base, 1.0, 'mutating the output did not corrupt prev — immutability contract holds');
});
