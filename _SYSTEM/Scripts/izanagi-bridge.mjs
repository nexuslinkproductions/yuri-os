#!/usr/bin/env node
// @capability: izanagi-decision-bridge
// @serves: turn measured/simulation outputs into a robust build-or-architecture decision | which option do I build | decide under uncertainty with a flip rule | quantitative izanagi | robust readout with a corner-law guard | commit a build choice
// @does: bridges MC/measured option values into decision-sim's robust methods (CVaR + minimax-regret + PGD) AND an izanagi-format ruling — with an AUTOMATIC corner-law guard (always enumerates the paramSpace vertices, where an affine/multilinear worst case hides from interior sampling) plus per-axis flip thresholds
// @use: after a sim/MC verdict, when you face "which option do we commit to" — instead of hand-scoring izanagi branches, run this for CVaR/regret/flip-rule + a vertex check the interior sampler cannot see. Pair upstream with decision-sim.mjs (the methods) and quantum-hypothesis-tracker.mjs (order-aware evidence)
// @exports: cornerAwareReadout, flipThresholds, izanagiRuling, demoProblem, runDemo
//
// The bridge that makes izanagi COMPUTATIONAL: measure (MC / quantum sim) -> robustify (this) -> commit (izanagi ruling) -> learn (postmortem).
// decision-sim.mjs supplies the robust-optimization methods; this wires measured option values into them, automates the corner law
// (memory: feedback-affine-objective-enumerate-corners — a multilinear objective's worst case sits at a VERTEX an interior
// Dirichlet/uniform sampler hits with probability 0), and emits the qualitative izanagi front from the quantitative verdict.

import { robustScore, minimaxRegret, pgdWitness, makeRng, clamp } from './decision-sim.mjs';
import { recordPrediction } from './prediction-ledger.mjs'; // learn-loop edge (opt-in): measure→robustify→commit→LEARN

// ---------------------------------------------------------------------------
// Vertex enumeration over the uncertainty box (the corner law, automated).
// ---------------------------------------------------------------------------
const MAX_EXACT_AXES = 16; // 2^16 = 65536 corners; beyond this we sample.

export function vertices(paramSpace) {
  const keys = Object.keys(paramSpace || {});
  if (keys.length > MAX_EXACT_AXES) return null; // caller falls back to sampled corners
  let out = [{}];
  for (const k of keys) {
    const [lo, hi] = paramSpace[k];
    const next = [];
    for (const partial of out) { next.push({ ...partial, [k]: lo }, { ...partial, [k]: hi }); }
    out = next;
  }
  return out; // 2^k corners
}

/**
 * For each config: robustScore + worst/best VERTEX (corner law) + interior worst, and a `cornerLawBite`
 * flag when the true worst vertex sits materially below what interior sampling saw (the silent-flip risk).
 */
export function cornerAwareReadout(problem, configs, { draws = 4000, seed = 2026, biteEps = 0.25 } = {}) {
  const rng = makeRng(seed);
  const corners = vertices(problem.paramSpace);
  const robust = configs.map((c) => ({ config: c, score: round(robustScore(problem, c, { draws, rng })) }))
    .sort((a, b) => b.score - a.score);

  const perConfig = configs.map((c) => {
    // interior worst over fresh draws (robustScore hides the raw min)
    const ir = makeRng(seed + 1);
    let interiorMin = Infinity;
    for (let i = 0; i < draws; i += 1) interiorMin = Math.min(interiorMin, problem.value(c, problem.sampleParams(ir)));
    // vertex worst/best (exact if enumerable, else sampled corners)
    let worst = Infinity, best = -Infinity, worstAt = null;
    const cornerSet = corners || sampledCorners(problem.paramSpace, 4096, makeRng(seed + 2));
    for (const v of cornerSet) {
      const val = problem.value(c, v);
      if (val < worst) { worst = val; worstAt = v; }
      if (val > best) best = val;
    }
    return {
      build: labelOf(c),
      worstVertex: round(worst),
      bestVertex: round(best),
      interiorMin: round(interiorMin),
      worstAt,
      // interior sampling UNDERSTATED the downside by > biteEps -> the corner law bit
      cornerLawBite: interiorMin - worst > biteEps,
      robustFloor: worst >= 0,
    };
  });

  const mr = minimaxRegret(problem, configs, { draws, seed: seed + 7 });
  return { robust, minimaxRegret: mr, perConfig, cornersExact: corners != null };
}

function sampledCorners(paramSpace, n, rng) {
  const keys = Object.keys(paramSpace || {});
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const v = {};
    for (const k of keys) { const [lo, hi] = paramSpace[k]; v[k] = rng() < 0.5 ? lo : hi; }
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-axis flip thresholds: holding the other axes at nominal, where along each axis
// does this config's margin (value - nullValue) cross zero? Gives clean "loses only when X </> t" rules.
// ---------------------------------------------------------------------------
export function flipThresholds(problem, config, { nominal, steps = 400 } = {}) {
  if (typeof problem.nullValue !== 'function') throw new Error('flipThresholds requires problem.nullValue');
  const keys = Object.keys(problem.paramSpace || {});
  const nom = nominal || Object.fromEntries(keys.map((k) => { const [lo, hi] = problem.paramSpace[k]; return [k, (lo + hi) / 2]; }));
  const margin = (pt) => problem.value(config, pt) - problem.nullValue(config, pt);
  const out = {};
  for (const k of keys) {
    const [lo, hi] = problem.paramSpace[k];
    let prev = null, found = null;
    for (let s = 0; s <= steps; s += 1) {
      const t = lo + (hi - lo) * (s / steps);
      const m = margin({ ...nom, [k]: t });
      if (prev && Math.sign(prev.m) !== Math.sign(m) && Math.sign(m) !== 0) {
        // linear interp the crossing
        const frac = prev.m / (prev.m - m);
        const thr = prev.t + (t - prev.t) * frac;
        found = { threshold: round(thr), losesWhen: m < 0 ? `${k} > ${round(thr)}` : `${k} < ${round(thr)}` };
        break;
      }
      prev = { t, m };
    }
    out[k] = found || { threshold: null, losesWhen: margin({ ...nom, [k]: lo }) >= 0 ? 'never (robust on this axis)' : 'always (loses on this axis at nominal)' };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The izanagi ruling: classify each option, surface robust-vs-upside disagreement, emit the ⬡ format.
// ---------------------------------------------------------------------------
export function izanagiRuling(problem, configs, opts = {}) {
  const ra = cornerAwareReadout(problem, configs, opts);
  const robustWinner = ra.robust[0];
  const regretWinner = ra.minimaxRegret.winner;
  const disagree = labelOf(robustWinner.config) !== labelOf(regretWinner.config.config ?? regretWinner.config);

  const classified = ra.perConfig.map((p) => {
    const cfg = configs.find((c) => labelOf(c) === p.build);
    const isNull = p.bestVertex === 0 && p.worstVertex === 0;
    let verdict, why;
    if (isNull) { verdict = 'BASELINE'; why = 'do-nothing reference'; }
    else if (p.robustFloor) { verdict = 'BUILD'; why = `positive floor at every vertex (worst ${p.worstVertex})`; }
    else if (p.bestVertex > 0) {
      const ft = flipThresholds(problem, cfg);
      const gate = Object.values(ft).find((f) => f.threshold != null);
      if (!gate && p.worstVertex < -10) {
        // upside exists only at a multi-axis corner (no single cheap test resolves it) over a catastrophic floor → dead
        verdict = 'REJECT'; why = `upside ${p.bestVertex} sits behind a multi-axis knife-edge over a ${p.worstVertex} floor — not cheaply resolvable`;
      } else {
        verdict = 'GATE'; why = `upside ${p.bestVertex} but floor ${p.worstVertex} — conditional on ${gate ? gate.losesWhen.replace(' > ', '≤').replace(' < ', '≥') : 'a resolving test'}`;
      }
    } else { verdict = p.worstVertex < -10 ? 'REJECT' : 'DEFER'; why = `no positive vertex (best ${p.bestVertex}, worst ${p.worstVertex})`; }
    return { ...p, verdict, why };
  });

  // learn-loop edge (opt-in via opts.record): a ruling is a PREDICTION ("these builds are the right calls"); record it so
  // izanagi-postmortem can later score it against the outcome. Advisory — never break a ruling on a ledger write. Off by
  // default so --demo/tests stay side-effect-free.
  if (opts.record) {
    try {
      recordPrediction({
        subject: problem.name,
        change: 'izanagi-ruling',
        predictedEffects: classified
          .filter((c) => c.verdict === 'BUILD' || c.verdict === 'GATE')
          .map((c) => ({ target: labelOf({ build: c.build }), confidence: c.verdict === 'BUILD' ? 0.7 : 0.4, verdict: c.verdict })),
        source: opts.recordSource || 'izanagi-bridge',
        ts: Date.now(),
      }, { file: opts.ledgerFile });
    } catch { /* learn edge is advisory; a ledger write must never break the decision */ }
  }
  return { readout: ra, robustWinner, regretWinner, disagree, classified, text: format(problem, classified, robustWinner, regretWinner, disagree) };
}

function format(problem, classified, rw, gw, disagree) {
  const L = [];
  L.push('⬡ IZANAGI — Counterfactual Simulation (decision-sim grounded)');
  L.push(`Decision: ${problem.name}`);
  L.push('');
  L.push('  build         verdict    floor→ceiling   note');
  for (const c of classified.sort((a, b) => b.bestVertex - a.bestVertex)) {
    L.push(`  ${c.build.padEnd(13)} ${c.verdict.padEnd(9)} ${String(c.worstVertex).padStart(6)}→${String(c.bestVertex).padEnd(5)}  ${c.cornerLawBite ? '⚠ corner-law bite ' : ''}${c.why}`);
  }
  L.push('');
  L.push(`  robustScore winner : ${labelOf(rw.config)} (${rw.score})`);
  const gwL = labelOf(gw.config.config ?? gw.config);
  L.push(`  minimax-regret     : ${gwL} (maxRegret ${gw.maxRegret})`);
  if (disagree) L.push('  → ROBUST vs UPSIDE split: regret-pick has the safer worst case; robust-pick has the better mean+tail. Resolve the gating axis, do not coin-flip.');
  return L.join('\n');
}

const labelOf = (c) => (c && typeof c === 'object' ? (c.build ?? c.label ?? Object.values(c)[0]) : String(c));
const round = (x) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------------------
// Demo: the live "which math extension to build" decision, grounded in the 16M-eval cap-sim verdict.
// Reproducible; doubles as a smoke test (node izanagi-bridge.mjs --demo).
// ---------------------------------------------------------------------------
export function demoProblem() {
  const COST = { calibration: 2.0, ltr: 2.5, idf: 3.0, centrality: 2.0, none: 0 };
  const valueOf = (build, p) => {
    const { holdout, corpus, reuseTC } = p;
    switch (build) {
      case 'calibration': return 8.0 * holdout - COST.calibration;          // #2 ECE 0.20→0 in-sample, gated on held-out survival (affine in holdout)
      case 'ltr':         return (3.2 + 1.0 * corpus) - COST.ltr;            // #5 +3.2 P@1, supervised, robust
      case 'idf':         return 6.0 * corpus - COST.idf;                    // #1 raw≈overlap, latent pays only at corpus scale
      case 'centrality':  return 4.0 * reuseTC * corpus - 40.0 * (1 - reuseTC) - COST.centrality; // #4 multilinear harm
      case 'none':        return 0;
      default: return 0;
    }
  };
  return {
    name: 'which-math-extension-to-build',
    discrete: { build: ['calibration', 'ltr', 'idf', 'centrality', 'none'] },
    paramSpace: { holdout: [0, 1], corpus: [0, 1], reuseTC: [0, 1] },
    sampleParams: (rng) => ({ holdout: rng(), corpus: rng(), reuseTC: rng() }),
    value: (config, params) => valueOf(config.build, params),
    nullValue: () => 0,
  };
}

export function runDemo() {
  const problem = demoProblem();
  const configs = problem.discrete.build.map((b) => ({ build: b }));
  const ruling = izanagiRuling(problem, configs, { draws: 4000 });
  console.log(ruling.text);
  return ruling;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--demo')) runDemo();
  else console.log('izanagi-bridge: measured-sim → robust decision → izanagi ruling.\n  node izanagi-bridge.mjs --demo\n  import { izanagiRuling, cornerAwareReadout, flipThresholds } from "./izanagi-bridge.mjs"');
}
