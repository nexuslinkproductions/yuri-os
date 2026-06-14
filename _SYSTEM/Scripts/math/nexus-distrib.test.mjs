// Tests for nexus-distrib.mjs — the reversible DI seam for the 6 0-ULP distribution fns.
// Proves: default→JS; flag→Rust (if .node loaded); both agree with the math-kernel reference
// (asserted EXACT since these are 0-ULP); fail-safe when the .node is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ref from './math-kernel.mjs';
import * as accel from './nexus-distrib.mjs';

const D = [0.2, 0.5, 0.3];
const V = [3, 1, 2, 4, 5];
const W = [1, 2, 1, 0.5, 0.5];
const A = [1, 2, 3, 4];
const B = [2, 4, 5, 8];
const exactArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test('default backend is JS (source of truth)', () => {
  delete process.env.YURI_NEXUS_RUST;
  assert.equal(accel.rustActive(), false);
  assert.ok(exactArr(accel.normalizeDistribution(D), ref.normalizeDistribution(D)));
  assert.equal(accel.cosineSimilarity(A, B), ref.cosineSimilarity(A, B));
  assert.equal(accel.pearson(A, B), ref.pearson(A, B));
});

test('flag flips to Rust when .node loaded, and Rust is EXACT vs the JS reference (0-ULP)', () => {
  const b = accel.backend();
  if (!b.rustLoaded) {
    process.env.YURI_NEXUS_RUST = '1';
    assert.equal(accel.rustActive(), false, 'no .node → flag ignored, JS answers');
    assert.equal(accel.cosineSimilarity(A, B), ref.cosineSimilarity(A, B));
    delete process.env.YURI_NEXUS_RUST;
    return;
  }
  process.env.YURI_NEXUS_RUST = '1';
  try {
    assert.equal(accel.rustActive(), true);
    assert.ok(exactArr(accel.normalizeDistribution(D), ref.normalizeDistribution(D)));
    assert.equal(accel.pNorm(V, 2), ref.pNorm(V, 2));
    assert.equal(accel.weightedStdDev(V, W), ref.weightedStdDev(V, W));
    assert.equal(accel.cosineSimilarity(A, B), ref.cosineSimilarity(A, B));
    assert.equal(accel.pearson(A, B), ref.pearson(A, B));
    assert.equal(accel.spearman(A, B), ref.spearman(A, B));
  } finally {
    delete process.env.YURI_NEXUS_RUST;
  }
});
