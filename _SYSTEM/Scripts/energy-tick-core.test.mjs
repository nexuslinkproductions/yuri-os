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
