#!/usr/bin/env node
/**
 * Tests for the Wave-3 decision instance (wave3-decision.mjs) — lock the R2-E honesty correction
 * surfaced by the Codex review (gpt-5.5 xhigh, via llm-compat, 2026-06-13):
 *   the LOCKED-vs-NULL margin is AFFINE in the weight simplex, so its worst case is at a VERTEX —
 *   a random Dirichlet search hits vertices with probability zero and FALSELY reported a positive
 *   joint worst. The deterministic vertex×scalar-corner scan must find the real flip.
 *
 * Run: node --test _SYSTEM/Scripts/wave3-decision.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROBLEM } from './wave3-decision.mjs';

const LOCKED = { firing: 'async-trailing', identity: 'anchor+node', foundry: 'unified', promote: 'async-bakeoff', aggGate: 'target-keyed', soakLen: 30, aggK: 3, lInfCap: 1 };
const margin = (p) => PROBLEM.value(LOCKED, p) - PROBLEM.nullValue(LOCKED, p);

test('margin is AFFINE in the weight simplex (so the extremum is a vertex)', () => {
  const sc = { Pemit: 0.05, kappa: 0.5, partRate: 0.6 };
  const a = margin({ ...sc, w: [1, 0, 0, 0, 0] });
  const b = margin({ ...sc, w: [0, 0, 0, 0, 1] });
  const mid = margin({ ...sc, w: [0.5, 0, 0, 0, 0.5] });
  assert.ok(Math.abs(mid - (a + b) / 2) < 1e-9, `affine: mid ${mid} == avg ${(a + b) / 2}`);
});

test('the build-cheapness vertex IS a flip — LOCKED loses to NULL there', () => {
  const m = margin({ w: [0, 0, 0, 0, 1], Pemit: 0.05, kappa: 0.5, partRate: 0.6 });
  assert.ok(m < 0, `vertex margin must be negative (the real residual), got ${m}`);
  assert.ok(Math.abs(m - (-0.026384)) < 1e-4, `reproduces the Codex-found margin, got ${m}`);
});

test('a random Dirichlet interior search MISSES the vertex flip (why the method was wrong)', () => {
  // emulate the old method: interior simplex draws never reach a pure vertex → worst stays positive.
  let a = 12345; const rng = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let interiorWorst = Infinity;
  for (let i = 0; i < 50000; i += 1) {
    let w = Array.from({ length: 5 }, () => -Math.log(1 - rng())); const s = w.reduce((x, y) => x + y, 0); w = w.map((x) => x / s);
    interiorWorst = Math.min(interiorWorst, margin({ w, Pemit: 0.05 + 0.4 * rng(), kappa: 0.5 + 3.5 * rng(), partRate: 0.1 + 0.5 * rng() }));
  }
  assert.ok(interiorWorst > 0, `interior sampling hides the flip (stays positive: ${interiorWorst.toFixed(4)})`);
});

test('deterministic vertex×scalar-corner scan FINDS the flip', () => {
  const verts = [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]];
  let worst = Infinity;
  for (const Pemit of [0.05, 0.45]) for (const kappa of [0.5, 4]) for (const partRate of [0.1, 0.6]) for (const w of verts) {
    worst = Math.min(worst, margin({ w, Pemit, kappa, partRate }));
  }
  assert.ok(worst < 0, `deterministic corner scan must catch the flip the random search missed, got ${worst}`);
});
