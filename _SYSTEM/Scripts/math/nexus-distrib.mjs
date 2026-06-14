// nexus-distrib.mjs — reversible DI accelerator seam for the Phase-2 deep-wave 0-ULP distribution set.
//
// Mirrors nexus-stats.mjs. JS (math-kernel.mjs) is the SOURCE OF TRUTH + DEFAULT; the bit-exact Rust
// delivery (`_SYSTEM/nexus-rs`, conformance-gated: napi 158/158, distrib asserted EXACT 0-ULP through FFI)
// is opt-in behind `YURI_NEXUS_RUST=1` and FAILS SAFE to JS if the .node is missing.
//
// ONLY the 6 PROVEN-0-ULP fns are routed here: normalizeDistribution, pNorm, weightedStdDev,
// cosineSimilarity, pearson, spearman. The 4 transcendentals (entropy/klDivergence/crossEntropy/softmax)
// are NOT here — libm != V8 at the last ULP, so they stay JS (not gate-safe to swap). Do not add them.
//
// These ARE gate-adjacent (normalizeDistribution feeds entropy/informationGain in computeU), which is why
// they were ported at 0-ULP: routing them through Rust is value-preserving to the bit. Still, flipping the
// live gate to Rust is a separate owner-gated step; importing this changes nothing until the flag is set.

import { createRequire } from 'module';
import * as js from './math-kernel.mjs';

const require = createRequire(import.meta.url);

let rust = null;
let loadError = null;
try {
  rust = require('../../nexus-rs/index.js');
} catch (e) {
  rust = null;
  loadError = e;
}

/** True only when the operator opted in AND the Rust kernel loaded. Default: false → JS. */
export function rustActive() {
  return rust !== null && process.env.YURI_NEXUS_RUST === '1';
}

export function backend() {
  return {
    active: rustActive() ? 'rust' : 'js',
    rustLoaded: rust !== null,
    flag: process.env.YURI_NEXUS_RUST === '1',
    loadError: loadError ? String(loadError.message || loadError) : null,
  };
}

export function normalizeDistribution(values) {
  return rustActive() ? rust.distribNormalize(values) : js.normalizeDistribution(values);
}

export function pNorm(values, p = 2) {
  // Rust binds the 0-ULP path (p=2 + general). JS handles any p identically.
  return rustActive() ? rust.distribPNorm(values, p) : js.pNorm(values, p);
}

export function weightedStdDev(values, weights) {
  return rustActive() ? rust.distribWeightedStdDev(values, weights) : js.weightedStdDev(values, weights);
}

export function cosineSimilarity(left, right) {
  return rustActive() ? rust.distribCosineSimilarity(left, right) : js.cosineSimilarity(left, right);
}

export function pearson(xs, ys) {
  return rustActive() ? rust.distribPearson(xs, ys) : js.pearson(xs, ys);
}

export function spearman(xs, ys) {
  return rustActive() ? rust.distribSpearman(xs, ys) : js.spearman(xs, ys);
}
