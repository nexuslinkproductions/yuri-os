#!/usr/bin/env node
/**
 * fleet-router-accel.mjs — reversible Rust forward-pass accelerator for the fleet router MLP.
 *
 * Mirrors the nexus-stats pattern: JS is SOURCE OF TRUTH and DEFAULT.
 * Rust (napi) is opt-in via YURI_FLEET_ROUTER_RUST=1 and fails safe to JS.
 *
 * Purpose: only relevant if routing ever becomes a measurable hot path
 * (hundreds of candidates per leaf, fused with capability scan, or batch replay of 100k+ rows).
 * Today the 12→8→1 net is microseconds; a Rust path saves negligible wall time vs LLM minutes.
 *
 * Contract:
 *   - weights schema identical to fleet-router-mlp.mjs (w1, b1, w2, b2, version)
 *   - forward(features: number[12], w) → { score: number, hidden: number[8] }
 *   - bit-exact or 1e-9 conformance required before arming
 *
 * Status: SKETCH / placeholder. Real crate would live at _SYSTEM/fleet-router-rs/
 * with napi binding exposing forward(). No crate exists yet; this file is the seam.
 */

import { createRequire } from 'module';
import * as js from './fleet-router-mlp.mjs';

const require = createRequire(import.meta.url);

let rust = null;
let loadError = null;
try {
  // Future: require('../../fleet-router-rs/index.js') after napi build
  rust = null; // placeholder — no .node yet
} catch (e) {
  rust = null;
  loadError = e;
}

/** True only when opted in AND the Rust forward actually loaded. */
export function rustActive() {
  return rust !== null && process.env.YURI_FLEET_ROUTER_RUST === '1';
}

export function backend() {
  return {
    active: rustActive() ? 'rust' : 'js',
    rustLoaded: rust !== null,
    flag: process.env.YURI_FLEET_ROUTER_RUST === '1',
    loadError: loadError ? String(loadError.message || loadError) : null,
  };
}

/**
 * forward(features, w) — delegates to Rust when armed, else JS.
 * Signature and return shape must stay identical to fleet-router-mlp forward.
 */
export function forward(features, w) {
  if (rustActive() && typeof rust.forward === 'function') {
    return rust.forward(features, w);
  }
  return js.forward(features, w);
}

// Re-export the rest so consumers can swap import without breakage
export {
  FEATURE_NAMES,
  NUM_FEATURES,
  extractFeatures,
  predictRoute,
  updateFromOutcome,
  saveWeights,
  loadWeights,
} from './fleet-router-mlp.mjs';
