#!/usr/bin/env node
/**
 * factor-return-vectors.mjs — Live factor return-vector builder (W4)
 *
 * Converts LIVE market bars + observatory signals into per-factor return vectors
 * that the quantum factor-circuit consumes. Pure compute — no network, no I/O.
 *
 * This is the Phase-3+ bridge: factor-circuit.mjs currently uses a synthetic
 * metadata embedding (factorVector) as a stand-in. This module produces the
 * REAL return-contribution series from live data. The circuitInputFromBars()
 * adapter feeds the current factor-circuit (metadata-based) while preserving
 * the honest return vectors for analysis and future circuit upgrades.
 *
 * @module alpha-factor-library/factor-return-vectors
 */
// @capability: factor-return-vectors
// @serves: real return vectors | factor circuit live-wire | bars to return vectors | quantum sequencing input | return-contribution series | replace metadata embeddings
// @does: Converts live OHLCV bars + observatory signals into honest per-factor RETURN-contribution vectors (sign(side) × real log-returns / vol-proxy × confidence), then feeds them into the quantum factor-circuit via its opts.vectors injection so commutativity + order-optimal sequencing run on REAL returns instead of the metadata one-hot embedding. Never fabricates orthogonality; degenerate/parallel inputs collapse to the classical order-blind path.
// @use: Reach for this to drive factor-circuit.optimizeFactorCircuit from live market data (the observatory crypto/poly cycles call circuitInputFromBars). Use buildReturnVectors when you only need the raw aligned vectors; circuitInputFromBars when you want the ready {factors, opts:{vectors}} circuit input.
// @exports: buildReturnVectors, circuitInputFromBars

import { pathToFileURL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// §1 — UTILITIES
// ───────────────────────────────────────────────────────────────────────────

/** Finite-guard: NaN/Inf → 0, otherwise passthrough. */
function finiteGuard(x) {
  return Number.isFinite(x) ? x : 0;
}

/** L2-normalize a vector (returns zero vector if norm < 1e-12). */
function normalize(v) {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm < 1e-12) return v.map(() => 0);
  return v.map((x) => x / norm);
}

/** Compute per-period log returns from bars (close-to-close). */
function computeReturns(bars) {
  const returns = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1]?.close;
    const b = bars[i]?.close;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      returns.push(Math.log(b / a));
    } else {
      returns.push(0);
    }
  }
  return returns;
}

/** Compute per-period volatility proxy (high-low range) from bars. */
function computeVolSeries(bars) {
  const vols = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i]?.high;
    const l = bars[i]?.low;
    if (Number.isFinite(h) && Number.isFinite(l) && h >= l) {
      vols.push(h - l);
    } else {
      vols.push(0);
    }
  }
  return vols;
}

/** Align/truncate/pad all vectors to the same length (dim). */
function alignVectors(vectors, dim) {
  return vectors.map((v) => {
    if (v.length >= dim) return v.slice(0, dim);
    return [...v, ...new Array(dim - v.length).fill(0)];
  });
}

/** Check if all vectors are degenerate (all-zero or constant). */
function isDegenerate(vectors) {
  if (vectors.length < 2) return true;
  // Check if all vectors are essentially identical (constant)
  const first = vectors[0];
  for (let i = 1; i < vectors.length; i++) {
    let diff = 0;
    for (let j = 0; j < first.length; j++) {
      diff += Math.abs(first[j] - vectors[i][j]);
    }
    if (diff > 1e-10) return false;
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// §2 — SIGNAL → RETURN VECTOR MAPPING
// ───────────────────────────────────────────────────────────────────────────

/**
 * Map a single observatory signal to its return-contribution series.
 *
 * Mappings (honest, derived from real returns only):
 * - momentum (obs-momentum-*): sign(side) × per-period returns.
 *   "long" → +returns, "short" → -returns, "flat" → 0.
 * - vol-regime (obs-vol-regime-*): per-period volatility contribution.
 *   "short" (high vol) → +vol, "long" (low vol) → -vol, "flat" → 0.
 *
 * @param {Object} signal - { factorId, side, confidence, ts }
 * @param {number[]} returns - per-period log returns (length = bars.length-1)
 * @param {number[]} volSeries - per-period vol proxy (length = bars.length-1)
 * @returns {number[]} return vector for this factor (same length as returns)
 */
function signalToReturnVector(signal, returns, volSeries) {
  const dim = returns.length;
  const vec = new Array(dim).fill(0);

  const fid = signal?.factorId ?? '';
  const side = signal?.side ?? 'flat';
  const confidence = finiteGuard(signal?.confidence ?? 0);

  if (fid.startsWith('obs-momentum-')) {
    const sgn = side === 'long' ? 1 : side === 'short' ? -1 : 0;
    for (let i = 0; i < dim; i++) {
      vec[i] = finiteGuard(sgn * returns[i] * confidence);
    }
  } else if (fid.startsWith('obs-vol-regime-')) {
    const sgn = side === 'short' ? 1 : side === 'long' ? -1 : 0; // high vol = short vol bias
    for (let i = 0; i < dim; i++) {
      vec[i] = finiteGuard(sgn * volSeries[i] * confidence);
    }
  } else {
    // Unknown signal type → zero vector (caller can filter or extend)
  }

  return vec;
}

// ───────────────────────────────────────────────────────────────────────────
// §3 — PUBLIC API: buildReturnVectors
// ───────────────────────────────────────────────────────────────────────────

/**
 * buildReturnVectors(bars, signals, opts?) → { vectors, factorIds, dim, degenerate }
 *
 * @param {Object[]} bars - OHLCV bars with { open, high, low, close, timestamp }
 * @param {Object[]} signals - from computeLiveSignals: [{ factorId, value, side, confidence, ts }, ...]
 * @param {Object} [opts] - { dim?: number } target dimension (default: bars.length-1)
 * @returns {Object} { vectors: number[][], factorIds: string[], dim: number, degenerate: boolean }
 */
export function buildReturnVectors(bars, signals, opts = {}) {
  const { dim: targetDim } = opts;

  if (!bars || bars.length < 2) {
    return { vectors: [], factorIds: [], dim: 0, degenerate: true };
  }

  const dim = targetDim ?? (bars.length - 1);
  const returns = computeReturns(bars);
  const volSeries = computeVolSeries(bars);

  // Map each signal to its return vector
  const rawVectors = (signals ?? []).map((sig) => signalToReturnVector(sig, returns, volSeries));
  const factorIds = (signals ?? []).map((sig) => sig?.factorId ?? '');

  // Align all vectors to the target dimension
  const vectors = alignVectors(rawVectors, dim).map((v) => v.map(finiteGuard));

  // Degenerate if <2 factors OR all vectors are constant/identical
  const degenerate = vectors.length < 2 || isDegenerate(vectors);

  return { vectors, factorIds, dim, degenerate };
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — SIGNAL → FACTOR METADATA (for factor-circuit consumption)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Convert an observatory signal into a factor metadata object that
 * factor-circuit.mjs's factorVector() can consume.
 *
 * The mapping uses the signal's factorId to infer category/cluster/inputs.
 * This is a pragmatic bridge — the real Phase-3+ upgrade will replace
 * factorVector() with direct return-vector projectors.
 */
function signalToFactorMeta(signal) {
  const fid = signal?.factorId ?? '';
  const side = signal?.side ?? 'flat';
  const confidence = finiteGuard(signal?.confidence ?? 0);

  // Infer category from factorId prefix
  let category = 'value';
  let correlation_cluster = 'OBS-GENERIC';
  let data_inputs = ['ohlcv'];
  let sharpe_tier = 'medium';

  if (fid.startsWith('obs-momentum-')) {
    category = 'momentum';
    correlation_cluster = `MOM-${fid.replace('obs-momentum-', '').toUpperCase()}`;
    data_inputs = ['close'];
    sharpe_tier = confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low';
  } else if (fid.startsWith('obs-vol-regime-')) {
    category = 'volatility';
    correlation_cluster = `VOL-${fid.replace('obs-vol-regime-', '').toUpperCase()}`;
    data_inputs = ['high', 'low'];
    sharpe_tier = confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low';
  }

  return {
    id: fid,
    category,
    correlation_cluster,
    data_inputs,
    sharpe_tier,
    // Preserve live signal info for debugging/extension
    _live: { side, confidence, value: signal?.value, ts: signal?.ts },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §5 — PUBLIC API: circuitInputFromBars
// ───────────────────────────────────────────────────────────────────────────

/**
 * circuitInputFromBars(bars, signals, opts?) → { factors, opts }
 *
 * Returns the exact input shape that optimizeFactorCircuit(factors, opts) expects.
 * The orchestrator can call this directly and pipe the result into the circuit.
 *
 * @param {Object[]} bars - OHLCV bars
 * @param {Object[]} signals - from computeLiveSignals
 * @param {Object} [opts] - passed through to optimizeFactorCircuit (tol, sampleCount, etc.)
 * @returns {Object} { factors: FactorMeta[], opts: Object }
 */
export function circuitInputFromBars(bars, signals, opts = {}) {
  const factors = (signals ?? []).map(signalToFactorMeta);
  const { vectors, degenerate } = buildReturnVectors(bars, signals, opts);
  // LIVE-WIRE: feed the REAL return-vectors into the circuit via the opts.vectors
  // injection (factor-circuit validates count+dim and falls back to the metadata
  // embedding on any mismatch). Inject ONLY when we have ≥2 well-formed,
  // non-degenerate vectors matching the factor count; otherwise let the circuit's
  // own metadata / degenerate path run. The factor metadata is still returned for
  // id labels — but the VECTORS (real returns) now drive commutativity + ordering.
  const canInject = !degenerate && factors.length >= 2 &&
    vectors.length === factors.length &&
    vectors.every((v) => Array.isArray(v) && v.length > 0 && v.length === vectors[0].length);
  const circuitOpts = canInject ? { ...opts, vectors } : { ...opts };
  return { factors, opts: circuitOpts, vectors, degenerate, injected: canInject };
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — SELF-TEST (node factor-return-vectors.mjs --test)
// ───────────────────────────────────────────────────────────────────────────

/** Generate synthetic bars with a known return pattern. */
function makeBars(n, baseClose = 100, drift = 0.001, vol = 0.02) {
  const bars = [];
  let close = baseClose;
  for (let i = 0; i < n; i++) {
    const ret = drift + vol * (Math.random() * 2 - 1);
    close *= Math.exp(ret);
    const high = close * (1 + Math.abs(vol * (Math.random() * 0.5)));
    const low = close * (1 - Math.abs(vol * (Math.random() * 0.5)));
    bars.push({
      timestamp: Date.now() / 1000 + i * 300,
      open: close * (1 + (Math.random() - 0.5) * 0.001),
      high,
      low,
      close,
      volume: 1000 + Math.random() * 500,
    });
  }
  return bars;
}

/** Run self-tests. */
async function runSelfTest() {
  const { optimizeFactorCircuit } = await import('./factor-circuit.mjs');

  let pass = 0, fail = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✓ ${msg}`);
      pass++;
    } else {
      console.error(`  ✗ ${msg}`);
      fail++;
    }
  }

  // ── Test 1: buildReturnVectors with 2 synthetic correlated factors ──
  console.log('\n[1] Two correlated factors (momentum + vol-regime) → equal length, finite');
  {
    const bars = makeBars(21); // 20 return periods
    const signals = [
      { factorId: 'obs-momentum-BTC-USD', side: 'long', confidence: 0.8, ts: Date.now() / 1000 },
      { factorId: 'obs-vol-regime-BTC-USD', side: 'short', confidence: 0.6, ts: Date.now() / 1000 },
    ];
    const { vectors, factorIds, dim, degenerate } = buildReturnVectors(bars, signals);
    assert(vectors.length === 2, 'vectors.length === 2');
    assert(factorIds.length === 2, 'factorIds.length === 2');
    assert(dim === 20, 'dim === 20 (bars.length-1)');
    assert(vectors.every((v) => v.length === dim), 'all vectors have length === dim');
    assert(vectors.every((v) => v.every(Number.isFinite)), 'all elements finite');
    assert(degenerate === false, 'degenerate === false (2 distinct factors)');
  }

  // ── Test 2: degenerate = true on single factor ──
  console.log('\n[2] Single factor → degenerate=true');
  {
    const bars = makeBars(11);
    const signals = [{ factorId: 'obs-momentum-ETH-USD', side: 'long', confidence: 0.9, ts: Date.now() / 1000 }];
    const { vectors, degenerate } = buildReturnVectors(bars, signals);
    assert(vectors.length === 1, 'vectors.length === 1');
    assert(degenerate === true, 'degenerate === true for single factor');
  }

  // ── Test 3: degenerate = true on all-constant input (flat signals) ──
  console.log('\n[3] All-flat signals → degenerate=true');
  {
    const bars = makeBars(11);
    const signals = [
      { factorId: 'obs-momentum-BTC-USD', side: 'flat', confidence: 0, ts: Date.now() / 1000 },
      { factorId: 'obs-vol-regime-BTC-USD', side: 'flat', confidence: 0, ts: Date.now() / 1000 },
    ];
    const { vectors, degenerate } = buildReturnVectors(bars, signals);
    assert(degenerate === true, 'degenerate === true for all-flat (zero vectors)');
  }

  // ── Test 4: circuitInputFromBars INJECTS real return-vectors (live-wire) ──
  // Two divergent factors (momentum-long + vol-regime-short) → non-parallel real
  // vectors → non-commuting. The honest ratio MAY be <1 (sequencing gives no
  // advantage) or >1 (advantage) — both are valid; we assert it is FINITE and that
  // the real vectors were actually injected, NOT that an advantage was fabricated.
  console.log('\n[4] circuitInputFromBars injects REAL vectors → finite ratio, injected=true');
  {
    const bars = makeBars(21);
    const signals = [
      { factorId: 'obs-momentum-BTC-USD', side: 'long', confidence: 0.8, ts: Date.now() / 1000 },
      { factorId: 'obs-vol-regime-BTC-USD', side: 'short', confidence: 0.6, ts: Date.now() / 1000 },
    ];
    const { factors, opts, injected } = circuitInputFromBars(bars, signals, { tol: 1e-9, recordEnergy: false, sampleCount: 50, draws: 30, iters: 2, seed: 42 });
    const result = optimizeFactorCircuit(factors, opts);
    assert(result !== null && result !== undefined, 'optimizeFactorCircuit returns result');
    assert(typeof result.quality?.ratio === 'number' && Number.isFinite(result.quality.ratio), 'quality.ratio is finite');
    assert(injected === true, 'real return-vectors were injected (live-wire active, not metadata)');
    assert(Array.isArray(result.bestOrdering) && result.bestOrdering.length === 2, 'bestOrdering present, length 2');
    console.log(`    ratio = ${result.quality.ratio.toFixed(6)} injected=${injected} allCommute=${result.allCommute}`);
  }

  // ── Test 5: COMMUTE case via PARALLEL real vectors (no fabrication) ──
  // Two momentum-LONG signals on the SAME bars → return-vectors differ only by the
  // confidence scalar → parallel → after L2-normalize the projectors are identical
  // → genuinely commuting → ratio EXACTLY 1 (the circuit refuses to fake an advantage).
  console.log('\n[5] Parallel real vectors (two momentum-long) → allCommute, ratio == 1');
  {
    const bars = makeBars(21);
    const signals = [
      { factorId: 'obs-momentum-BTC-USD', side: 'long', confidence: 0.8, ts: Date.now() / 1000 },
      { factorId: 'obs-momentum-ETH-USD', side: 'long', confidence: 0.6, ts: Date.now() / 1000 },
    ];
    const { factors, opts, injected } = circuitInputFromBars(bars, signals, { tol: 1e-9, recordEnergy: false, sampleCount: 50, draws: 30, iters: 2, seed: 42 });
    const result = optimizeFactorCircuit(factors, opts);
    assert(injected === true, 'real vectors injected');
    assert(result.allCommute === true, `parallel real vectors => allCommute (got ${result.allCommute})`);
    assert(result.quality.ratio === 1, `commute => ratio exactly 1 (got ${result.quality.ratio})`);
    console.log(`    ratio = ${result.quality.ratio} (allCommute=${result.allCommute}, injected=${injected})`);
  }

  // ── Test 6: Empty/insufficient bars ──
  console.log('\n[6] Insufficient bars → empty vectors, degenerate=true');
  {
    const bars = [makeBars(1)[0]]; // single bar
    const signals = [{ factorId: 'obs-momentum-BTC-USD', side: 'long', confidence: 0.8, ts: Date.now() / 1000 }];
    const { vectors, dim, degenerate } = buildReturnVectors(bars, signals);
    assert(vectors.length === 0, 'vectors.length === 0');
    assert(dim === 0, 'dim === 0');
    assert(degenerate === true, 'degenerate === true');
  }

  // ── Summary ──
  console.log(`\n=== ${pass} pass, ${fail} fail ===`);
  if (fail > 0) process.exitCode = 1;
}

const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  runSelfTest().catch((e) => { console.error('TEST ERROR:', e); process.exit(1); });
}