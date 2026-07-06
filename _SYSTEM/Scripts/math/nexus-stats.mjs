// nexus-stats.mjs — reversible DI accelerator seam for the Phase-1 W1 "clean stats" set.
//
// JS (math-kernel.mjs) is the SOURCE OF TRUTH and the DEFAULT. The bit-exact Rust delivery
// (`_SYSTEM/nexus-rs`, conformance-gated: napi 139/139) is opt-in behind a single flag, and the
// shim FAILS SAFE to JS if the .node is missing/unloadable. This is the "armed but inert" layer:
// flipping consumers from JS to Rust is a further, per-consumer, owner-gated step — importing this
// module changes nothing until `YURI_NEXUS_RUST=1` is set AND the .node loads.
//
// Reversibility: unset the flag (or delete the .node) → every call routes back to the JS reference.
// Transparency: the Rust path throws napi Errors whose `.message` is byte-identical to the JS
// `Error.message` strings (proven in conformance.test.mjs), so error behavior is identical too.
//
// Conformance bar for this set is 1e-9 (these kernels are NOT gate/prover-coupled per 01-PORT-SPECS).
// Do NOT route gate-coupled kernels (entropy/normalizeDistribution/…) through a 1e-9 seam — those
// need the 0-ULP wave + their own gate.

import { createRequire } from 'module';
import * as js from './math-kernel.mjs';

const require = createRequire(import.meta.url);

let rust = null;
let loadError = null;
try {
  // napi platform loader (CJS) → the .node binding. Absent on a machine without a built .node.
  rust = require('../../nexus-rs/index.js');
} catch (e) {
  rust = null;
  loadError = e;
}

/** True only when the operator opted in AND the Rust kernel actually loaded. Default: false → JS. */
export function rustActive() {
  return rust !== null && process.env.YURI_NEXUS_RUST === '1';
}

/** Diagnostic: which path is live and why (no secrets, safe to log). */
export function backend() {
  return {
    active: rustActive() ? 'rust' : 'js',
    rustLoaded: rust !== null,
    flag: process.env.YURI_NEXUS_RUST === '1',
    loadError: loadError ? String(loadError.message || loadError) : null,
  };
}

export function rankWithTies(arr) {
  return rustActive() ? rust.statsRankWithTies(arr) : js.rankWithTies(arr);
}

export function median(values) {
  return rustActive() ? rust.statsMedian(values) : js.median(values);
}

export function percentile(values, p) {
  return rustActive() ? rust.statsPercentile(values, p) : js.percentile(values, p);
}

export function weightedVariance(values, weights) {
  return rustActive() ? rust.statsWeightedVariance(values, weights) : js.weightedVariance(values, weights);
}
