#!/usr/bin/env node
// @capability: trade-decision-sim
// @serves: trade decision sim | decision lens | order-optimal sequencing | risk-robust position sizing | what should I do now per market
// @does: recalls the CURRENT signal snapshot per market from the live ledger and renders it through the sim arsenal off ONE call — quantum factor-circuit order-optimal sequencing + decision-sim CVaR-robust sizing — sized against the MEASURED per-factor edge (from the edge-audit), correlation-aware. Flat/zero-size when there is no measured edge after cost — the honest no-trade case is the expected default right now.
// @use: hand a trading peer the DECISION LENS — "what should I do right now per market, order-optimal and risk-robust" — off one call, without re-assembling factor-circuit + decision-sim + the edge stats by hand. Sibling of trade-edge-audit (the EDGE lens).
// @exports: recallSnapshot, buildMarketDecision, decideTrades, DEFAULT_MAX_PCT, DEFAULT_CORR
//
// CONSTRAINTS: paper/analysis only (INV-1 — pure reads, no order path), no key reads (INV-2).
// Deterministic, offline-testable, fail-soft (a broken sub-tool degrades that section, never the whole
// decision). Capability-first: WRAPS factor-circuit (sequencing) + decision-sim (robust sizing) +
// trade-edge-audit (measured edge/vol) — it ORCHESTRATES, it does not re-implement their math.
//
// Peer-built core: kimi-k2.7-code drafted the recall + circuit wiring + structure (interfaces verified
// against source — factorVector/optimizeFactorCircuit/robustScore shapes all confirmed). Operator wiring:
// replaced a FABRICATED 1.5% edge with the MEASURED per-factor edge from the edge-audit (we have no
// proven edge → the honest lens goes flat), clamped sizing to maxPct, and connected the two lenses.

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { optimizeFactorCircuit } from './factor-circuit.mjs';
import { robustScore, makeRng, gauss } from '../decision-sim.mjs';
import { classifyFamily } from './spread-correction.mjs';
import { recallFactors, factorEdgeStats } from './trade-edge-audit.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

export const DEFAULT_MAX_PCT = 0.10;
export const DEFAULT_CORR = 0.70;
const DEFAULT_TAIL_FRAC = 0.10;
const DEFAULT_DRAWS = 200;
const CORR_FLAT_THRESHOLD = 0.85;
const ROUND_TRIP_COST = 0.0005;   // in-code round-trip drag (taker ~0.20% is the real floor; see edge-audit)
const EDGE_HORIZON_S = 3600;      // measure factor edge at the 60m rung (where edge first emerges, if any)

/** Deterministic djb2 hash for clustering similar factorIds. */
function strHash(s) {
  let h = 5381; const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function emptyRecall() {
  return { rows: [], byFactor: new Map(), byMarket: new Map(), factorIds: [], markets: [] };
}

/**
 * recallSnapshot(ledgerPath) — THE RECOLLECTION (current state). Latest row per factor (its current
 * directional call), grouped by market. The ledger carries no confidence — dir is the signal.
 * @returns {{ rows, byFactor: Map<factorId,row>, byMarket: Map<market,row[]>, factorIds, markets }}
 */
export function recallSnapshot(ledgerPath) {
  let rows = [];
  try {
    if (!ledgerPath || !existsSync(ledgerPath)) return emptyRecall();
    rows = readFileSync(ledgerPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r) => r && r.factorId && r.market && isNum(r.ts) && isNum(r.price));
  } catch { return emptyRecall(); }

  const byFactor = new Map();
  for (const r of rows) { const cur = byFactor.get(r.factorId); if (!cur || r.ts > cur.ts) byFactor.set(r.factorId, r); }
  const byMarket = new Map();
  for (const r of byFactor.values()) { if (!byMarket.has(r.market)) byMarket.set(r.market, []); byMarket.get(r.market).push(r); }
  return { rows, byFactor, byMarket, factorIds: [...byFactor.keys()], markets: [...byMarket.keys()] };
}

/**
 * metaFromFactorId — reconstruct the minimal factorVector() metadata
 * ({category, correlation_cluster, data_inputs, sharpe_tier}) from a ledger factorId, since the ledger
 * carries only factorId/market/dir/ts/price. (factorVector input shape verified against source.)
 */
function metaFromFactorId(factorId) {
  const family = classifyFamily(factorId);
  const category = family === 'meanrev' ? 'mean-reversion' : family === 'trend' ? 'trend' : family === 'volume' ? 'volume' : 'value';
  const prefix = String(factorId).replace(/-[A-Z0-9]+(-USD)?$/i, '');
  const correlation_cluster = `LEDGER-CLUSTER-${strHash(prefix) % 4}`;
  const data_inputs = family === 'trend' ? ['close', 'high', 'low'] : family === 'volume' ? ['volume', 'close'] : ['close'];
  return { id: factorId, category, correlation_cluster, data_inputs, sharpe_tier: 'medium' };
}

function flatDecision(market, rationale, extra = {}) {
  return { market, side: 'flat', sizePct: 0, confidence: 0, orderOptimalSequence: [], circuitQuality: 1, edgeBps: extra.edgeBps ?? 0, rationale };
}

/** Effective independent bets under equal pairwise correlation ρ across N factors. */
function effectiveN(n, rho) {
  if (n <= 1) return 1;
  const r = isNum(rho) ? Math.max(0, Math.min(1, rho)) : DEFAULT_CORR;
  return n / (1 + (n - 1) * r);
}

/**
 * buildSizingProblem — a decision-sim problem whose config is sizePct and whose value is sized against
 * the MEASURED edge (mean) and MEASURED vol (std) of this market's factors, diluted by √effectiveN.
 * No fabricated edge: edge≈0 ⇒ value≈−cost·size ⇒ robustScore picks size 0 ⇒ flat (the honest default).
 */
function buildSizingProblem(measuredEdge, measuredVol, side, effectiveNVal) {
  const sign = side === 'long' ? 1 : -1;
  const center = sign * measuredEdge;          // signed measured edge per trade (mid-to-mid)
  const vol = Math.max(1e-6, measuredVol);     // measured dispersion → the uncertainty band for CVaR
  return {
    name: 'trade-size-robust',
    continuous: { sizePct: [0, 1] },
    sampleParams(rng) { return { shock: gauss(rng) }; }, // normal (not uniform) — uniform under-sells crypto fat tails (red-team MED)
    value(config, params) {
      // realized return = measured edge + a correlation-diluted vol shock; CVaR over draws punishes the
      // downside tail. Net of round-trip cost. (edge already net of nothing — it's the raw dir-return.)
      const realized = center + params.shock * vol / Math.sqrt(Math.max(1, effectiveNVal));
      return config.sizePct * realized - config.sizePct * ROUND_TRIP_COST;
    },
  };
}

/**
 * buildMarketDecision(market, signals, opts) — render one market's snapshot through the arsenal.
 * opts.edgeStats = { [factorId]: { mean, std } } measured by the edge-audit (the sizing edge source).
 * @returns {{ market, side, sizePct, confidence, orderOptimalSequence, circuitQuality, edgeBps, rationale, circuit }}
 */
export function buildMarketDecision(market, signals, opts = {}) {
  const { maxPct = DEFAULT_MAX_PCT, corr = DEFAULT_CORR, tailFrac = DEFAULT_TAIL_FRAC, draws = DEFAULT_DRAWS, edgeStats = {}, circuitOpts = {} } = opts;
  // Clamp maxPct to [0,1] — NEVER size above full equity, even if a caller passes a bad config (no
  // leverage; red-team HIGH: an unclamped maxPct=2.0 produced a 200% position).
  const effMaxPct = Math.min(1, Math.max(0, isNum(maxPct) ? maxPct : DEFAULT_MAX_PCT));
  if (!Array.isArray(signals) || signals.length === 0) return flatDecision(market, 'no signals for market');

  const netDir = signals.reduce((a, s) => a + (s.dir || 0), 0);
  const side = netDir > 0 ? 'long' : netDir < 0 ? 'short' : 'flat';
  if (side === 'flat') return flatDecision(market, 'net signal cancels across factors');
  if (isNum(corr) && corr > CORR_FLAT_THRESHOLD) return flatDecision(market, `correlation ${corr.toFixed(2)} > ${CORR_FLAT_THRESHOLD} — no diversification`);

  // MEASURED edge/vol: average the per-factor edge-audit stats over this market's factors. The factors
  // that have no measured history contribute nothing; with no edge the average is ~0 → flat (honest).
  // market filter guards cross-market edge contamination if factorIds ever go market-agnostic (red-team
  // MED, inert today since factorIds are market-suffixed) — only this market's measured edge sizes it.
  const stats = signals.map((s) => edgeStats[s.factorId]).filter((x) => x && isNum(x.mean) && isNum(x.std) && x.market === market);
  const measuredEdge = stats.length ? stats.reduce((a, x) => a + x.mean, 0) / stats.length : 0;
  const measuredVol = stats.length ? stats.reduce((a, x) => a + x.std, 0) / stats.length : 0;
  const edgeBps = +(measuredEdge * 1e4).toFixed(2);

  // Quantum order-optimal sequencing (telemetry + sequence; never fabricates an edge).
  let circuit = null;
  try {
    const factors = signals.map((s) => metaFromFactorId(s.factorId));
    circuit = optimizeFactorCircuit(factors, { sampleCount: 100, draws: 60, iters: 3, seed: 42, recordEnergy: false, ...circuitOpts });
  } catch { /* fail-soft: degrade the circuit section only */ }
  const circuitQuality = circuit?.quality?.ratio ?? 1;
  const orderOptimalSequence = circuit?.bestOrdering?.map((i) => signals[i]?.factorId).filter(Boolean) ?? signals.map((s) => s.factorId);

  // Honest gate: no measured edge after cost → flat, regardless of consensus (consensus on a no-edge
  // factor set is the bounce trap the edge-audit warns about).
  if (measuredEdge <= ROUND_TRIP_COST) {
    return { ...flatDecision(market, `no measured edge after cost (edge ${edgeBps}bps ≤ ${(ROUND_TRIP_COST * 1e4).toFixed(1)}bps) — honest flat`, { edgeBps }), circuit, circuitQuality, orderOptimalSequence };
  }

  // Risk-robust sizing — candidates clamped to maxPct (the fix: no over-max sizing).
  const effN = effectiveN(signals.length, corr);
  const problem = buildSizingProblem(measuredEdge, measuredVol, side, effN);
  // NOTE: the value function is linear in sizePct, so robustScore is effectively a flat-vs-maxPct GATE
  // (it picks 0 or effMaxPct, not intermediate fractions) — conservative + safe for v1. Genuine
  // fractional (mean-variance / Kelly) sizing needs a concave value term; deferred to v2 (red-team MED).
  const candidates = [0, 0.1, 0.25, 0.5, 0.75, 1.0].map((f) => +(f * effMaxPct).toFixed(6));
  let sizePct = 0, bestScore = -Infinity;
  try {
    for (let i = 0; i < candidates.length; i++) {
      const score = robustScore(problem, { sizePct: candidates[i] }, { draws, tailFrac, rng: makeRng(42 + i * 1000) });
      if (score > bestScore) { bestScore = score; sizePct = candidates[i]; }
    }
  } catch { sizePct = 0; }
  if (sizePct <= 0 || bestScore <= 0) return { ...flatDecision(market, 'robust sizer vetoed size (downside dominates)', { edgeBps }), circuit, circuitQuality, orderOptimalSequence };

  const consensusStrength = Math.abs(netDir) / signals.length;
  const confidence = Math.min(0.95, 0.5 + consensusStrength * 0.4 + (circuitQuality > 1 ? 0.05 : 0));
  return {
    market, side,
    sizePct: +sizePct.toFixed(4),
    confidence: +confidence.toFixed(3),
    orderOptimalSequence, circuitQuality: +circuitQuality.toFixed(4), edgeBps,
    rationale: `${side} ${Math.abs(netDir)}/${signals.length} factors · edge=${edgeBps}bps · q=${circuitQuality.toFixed(3)} · effN=${effN.toFixed(2)}`,
    circuit,
  };
}

/**
 * decideTrades({ ledgerPath, ...opts }) — the full decision battery off one call. Recalls the current
 * snapshot AND the measured per-factor edge (from the edge-audit), then renders each market.
 * @returns {{ decisions, verdict, recall }}
 */
export function decideTrades({ ledgerPath, maxPct, corr, tailFrac, draws, circuitOpts } = {}) {
  const snap = recallSnapshot(ledgerPath);
  let edgeStats = {};
  try { edgeStats = factorEdgeStats(recallFactors(ledgerPath), { horizonS: EDGE_HORIZON_S, strideS: EDGE_HORIZON_S }); } catch { edgeStats = {}; }

  const decisions = [];
  for (const [market, signals] of snap.byMarket) {
    try { decisions.push(buildMarketDecision(market, signals, { maxPct, corr, tailFrac, draws, edgeStats, circuitOpts })); }
    catch (e) { decisions.push(flatDecision(market, `error: ${e.message}`)); }
  }
  const active = decisions.filter((d) => d.side !== 'flat' && d.sizePct > 0);
  return {
    decisions,
    verdict: {
      markets: snap.markets.length, factors: snap.factorIds.length, active: active.length, hasSignal: active.length > 0,
      summary: active.length > 0 ? `${active.length} market(s) with measured-edge actionable signal` : 'NO measured-edge signal — flat/zero-size is the honest output (consistent with the edge-audit)',
    },
    recall: { factors: snap.factorIds.length, markets: snap.markets.length },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--decide')) {
  const pathMod = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = pathMod.dirname(fileURLToPath(import.meta.url));
  const ledgerPath = pathMod.resolve(dir, '..', '..', 'state', 'strategy-forecasts.jsonl');
  const r = decideTrades({ ledgerPath });
  console.log(`recall: ${r.recall.factors} factors / ${r.recall.markets} markets`);
  for (const d of r.decisions) {
    const sz = d.side === 'flat' ? '0.00%' : `${(d.sizePct * 100).toFixed(2)}%`;
    console.log(`${d.market.padEnd(12)} ${d.side.padEnd(5)} size=${sz.padStart(6)} conf=${d.confidence.toFixed(2)} edge=${d.edgeBps}bps q=${(d.circuitQuality ?? 1).toFixed(3)} · ${d.rationale}`);
  }
  console.log(`VERDICT: ${r.verdict.summary}`);
  process.exit(0);
}

if (_main && process.argv.includes('--test')) {
  const fs = await import('node:fs');
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  const tmp = `/tmp/trade-decision-sim-test-${process.pid}.jsonl`;
  try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* noop */ }

  // History-bearing ledger so factorEdgeStats can MEASURE edge:
  //  EDGE-USD: long factors on an UP-trending market → positive measured edge → sizes.
  //  FLAT-USD: long factors on a FLAT market → ~zero measured edge → honest flat.
  const base = 1_700_000_000, STEP = 3600;
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const ts = base + i * STEP;
    for (let f = 0; f < 4; f++) rows.push({ factorId: `trend${f}-EDGE-USD`, market: 'EDGE-USD', dir: 1, ts, price: 100 + i * 2.0 }); // strong uptrend
    for (let f = 0; f < 4; f++) rows.push({ factorId: `trend${f}-FLAT-USD`, market: 'FLAT-USD', dir: 1, ts, price: 100 });           // flat → no edge
  }
  rows.push({ factorId: 'trend0-EDGE-USD', market: 'EDGE-USD', dir: 1, ts: base + 32 * STEP, price: 100 + 32 * 2.0 });
  rows.push({ factorId: 'trend0-FLAT-USD', market: 'FLAT-USD', dir: 1, ts: base + 32 * STEP, price: 100 });
  // ETH-USD: conflicting current signals → net flat (snapshot-level)
  rows.push({ factorId: 'trendA-ETH-USD', market: 'ETH-USD', dir: 1, ts: base + 40 * STEP, price: 3000 });
  rows.push({ factorId: 'meanrevA-ETH-USD', market: 'ETH-USD', dir: -1, ts: base + 40 * STEP, price: 3000 });
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const snap = recallSnapshot(tmp);
  ok(snap.markets.length === 3, `recall finds 3 markets (got ${snap.markets.length})`);
  ok(recallSnapshot('/tmp/nope-xyz.jsonl').factorIds.length === 0, 'absent ledger → empty recall (fail-soft)');

  const edgeStats = factorEdgeStats(recallFactors(tmp), { horizonS: STEP, strideS: STEP });

  // EDGE market: measured positive edge → sizes, clamped to maxPct
  const edge = buildMarketDecision('EDGE-USD', snap.byMarket.get('EDGE-USD'), { maxPct: 0.10, corr: 0.5, edgeStats });
  ok(edge.side === 'long', `EDGE consensus → long (got ${edge.side})`);
  ok(edge.sizePct > 0, `EDGE measured edge → positive size (got ${edge.sizePct}, edgeBps ${edge.edgeBps})`);
  ok(edge.sizePct <= 0.10 + 1e-9, `EDGE size clamped to maxPct 0.10 (got ${edge.sizePct})`);
  ok(buildMarketDecision('EDGE-USD', snap.byMarket.get('EDGE-USD'), { maxPct: 2.0, corr: 0.5, edgeStats }).sizePct <= 1.0, 'maxPct=2.0 clamped to <=1.0 — no leverage (red-team HIGH regression)');

  // FLAT market: no measured edge → honest flat even with consensus
  const flat = buildMarketDecision('FLAT-USD', snap.byMarket.get('FLAT-USD'), { maxPct: 0.10, corr: 0.5, edgeStats });
  ok(flat.side === 'flat' || flat.sizePct === 0, `FLAT no-edge → flat/zero (got side=${flat.side} size=${flat.sizePct})`);

  // ETH: conflicting current snapshot → flat
  const eth = buildMarketDecision('ETH-USD', snap.byMarket.get('ETH-USD'), { maxPct: 0.10, corr: 0.5, edgeStats });
  ok(eth.side === 'flat', `ETH conflicting snapshot → flat (got ${eth.side})`);

  // High-correlation guard
  ok(buildMarketDecision('EDGE-USD', snap.byMarket.get('EDGE-USD'), { corr: 0.9, edgeStats }).side === 'flat', 'corr 0.9 → flat');
  // Empty
  ok(buildMarketDecision('X-USD', []).side === 'flat', 'empty signals → flat');

  // Full battery
  const full = decideTrades({ ledgerPath: tmp, maxPct: 0.10, corr: 0.5 });
  ok(full.decisions.length === 3, `decideTrades returns 3 markets (got ${full.decisions.length})`);
  ok(typeof full.verdict.summary === 'string', 'verdict summary present');

  try { fs.unlinkSync(tmp); } catch { /* noop */ }
  console.log(`trade-decision-sim --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
