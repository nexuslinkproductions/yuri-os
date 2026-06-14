// Tests for nexus-stats.mjs — the reversible DI accelerator seam.
// Proves: (1) DEFAULT routes to JS (source of truth); (2) the flag flips to Rust IF the .node loaded;
// (3) both backends agree with the math-kernel reference within 1e-9 (the Phase-1 W1 bar);
// (4) fail-safe — if the .node is absent, the flag is ignored and JS still answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ref from './math-kernel.mjs';
import * as accel from './nexus-stats.mjs';

const A = [3, 1, 2, 2, 9, 5, 5];
const W = [1, 2, 1, 0.5, 0.5, 1, 1];
const closeArr = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1e-9);

test('default backend is JS (source of truth)', () => {
  delete process.env.YURI_NEXUS_RUST;
  assert.equal(accel.rustActive(), false);
  assert.equal(accel.backend().active, 'js');
  assert.equal(accel.median(A), ref.median(A));
  assert.ok(closeArr(accel.rankWithTies(A), ref.rankWithTies(A)));
  assert.equal(accel.percentile(A, 50), ref.percentile(A, 50));
  assert.equal(accel.weightedVariance(A, W), ref.weightedVariance(A, W));
});

test('flag flips to Rust when the .node loaded, and Rust agrees with the JS reference (1e-9)', () => {
  const b = accel.backend();
  if (!b.rustLoaded) {
    // fail-safe: no .node here → flag is ignored, JS still answers (this IS the contract, not a skip)
    process.env.YURI_NEXUS_RUST = '1';
    assert.equal(accel.rustActive(), false, 'no .node → rustActive stays false even with the flag');
    assert.equal(accel.median(A), ref.median(A));
    delete process.env.YURI_NEXUS_RUST;
    return;
  }
  process.env.YURI_NEXUS_RUST = '1';
  try {
    assert.equal(accel.rustActive(), true);
    assert.equal(accel.backend().active, 'rust');
    assert.ok(Math.abs(accel.median(A) - ref.median(A)) <= 1e-9);
    assert.ok(closeArr(accel.rankWithTies(A), ref.rankWithTies(A)));
    for (const p of [1, 25, 50, 75, 100]) assert.ok(Math.abs(accel.percentile(A, p) - ref.percentile(A, p)) <= 1e-9);
    assert.ok(Math.abs(accel.weightedVariance(A, W) - ref.weightedVariance(A, W)) <= 1e-9);
  } finally {
    delete process.env.YURI_NEXUS_RUST;
  }
});

test('error parity — empty median throws on both paths', () => {
  delete process.env.YURI_NEXUS_RUST;
  assert.throws(() => accel.median([]));
  if (accel.backend().rustLoaded) {
    process.env.YURI_NEXUS_RUST = '1';
    try { assert.throws(() => accel.median([])); } finally { delete process.env.YURI_NEXUS_RUST; }
  }
});
