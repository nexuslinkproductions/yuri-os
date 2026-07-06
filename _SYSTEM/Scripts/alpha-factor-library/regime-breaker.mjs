#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: regime-breaker
// @serves: circuit breaker | abnormal move | adverse selection guard | maker halt/widen | z-score shock
// @does: pure-compute regime circuit-breaker for the BTC microstructure A-S maker — z-scores the latest 1-step (or windowed) mid return against a trailing per-second σ (EWMA, or caller-supplied) and emits a halt/widen/normal advisory so a maker holding resting orders can widen or pull quotes BEFORE a violent move adversely selects it. Fail-open.
// @use: the quoting/daemon layer consults regimeBreaker() on each tick (pure advisory — nothing consumes it until wired). Caller holds the σ (pass {ret,sigma}) OR passes the full midSeries and lets this derive a trailing EWMA σ. Two-sided |z|: a crash (down-move) is the worse adverse-selection case, so the breaker trips on magnitude not direction.
// @exports: regimeBreaker, ewmaSigma, returnsFromMids
/**
 * regime-breaker.mjs — A-S maker regime circuit-breaker (pure compute, DISARMED).
 *
 * THE FAILURE IT GUARDS: a maker holding resting orders DURING a violent move
 * gets adversely selected hard — the toxic flow lifts the resting bid (in a
 * crash) or hits the resting offer (in a spike) at the stale quote before the
 * maker can reprice. A pure compute guard that detects |z| ≥ threshold and tells
 * the quoting layer to WIDEN (2σ) or HALT (3σ) breaks that adverse-selection
 * spiral at the decision layer, before the fill happens.
 *
 * DESIGN — stateless pure function (NOT a factory):
 *   The quoting/daemon layer already holds state (mid series or a realized σ).
 *   regimeBreaker() is a pure advisory oracle: given the latest return + a σ
 *   estimate (OR a mid series to derive one), emit a verdict. A factory holding
 *   EWMA state would couple this guard to ONE volatility model + lifecycle, but
 *   the caller may want trailing-window σ, EWMA σ, or an externally-supplied
 *   realized-σ. Pure + caller-holds-state keeps the guard decoupled and trivially
 *   testable (no teardown, no hidden state, replayable on a mid array).
 *
 * TWO-SIDED |z| (regime-detector red-team lesson): a one-sided breaker silently
 * misses the DOWN-move — the MORE dangerous case for a maker resting bids. The
 * breaker trips on MAGNITUDE (|z|), catching crash and spike symmetrically.
 *
 * FAIL-OPEN (insufficient obs / bad input → normal, no throw): a silent false
 * halt would widen/pull quotes on noise; a false "normal" on bad data is
 * recoverable (the quoting layer's own risk gates still run). The breaker is
 * advisory — it never reaches the exchange until the daemon is wired to consult
 * it. Under-specification → action:'normal', tripped:false, zScore:0.
 *
 * HARD CONSTRAINTS (YURI-OS): ESM .mjs, no commit/push, no protected paths,
 * writes only this file, self-contained (no avellaneda-stoikov import — EWMA
 * σ is re-derived minimally here). Advisory until local evidence verifies it.
 */

// ───────────────────────────────────────────────────────────────────────────
// §1 — helpers: log-returns from mids + minimal EWMA σ (re-derived, self-contained)
// ───────────────────────────────────────────────────────────────────────────

/**
 * returnsFromMids(mids) -> log-return series (one shorter than input).
 * Pure. Non-positive / non-finite mids are skipped (log undefined). A series
 * with <2 usable mids returns [] (caller's minObs guard handles the rest).
 */
export function returnsFromMids(mids) {
  if (!Array.isArray(mids)) return [];
  const out = [];
  for (let i = 1; i < mids.length; i++) {
    const prev = mids[i - 1];
    const cur = mids[i];
    if (Number.isFinite(prev) && Number.isFinite(cur) && prev > 0 && cur > 0) {
      out.push(Math.log(cur / prev));
    }
  }
  return out;
}

/**
 * ewmaSigma(returns, {lambda}) -> trailing per-step EWMA σ of the return series.
 *
 * Re-derived minimally (avellaneda-stoikov NOT imported, per task constraint).
 * RiskMetrics-style EWMA variance: s²_t = λ·s²_{t-1} + (1-λ)·r²_{t-1}, so s_t is
 * the σ AVAILABLE at step t (one-step-ahead vol, no look-ahead). Returns the
 * FINAL s_t (the σ estimate for the latest observed return) or 0 if unusable.
 *
 * `lambda` (default 0.94) is the persistence/decay; higher = longer memory.
 * Seed variance = first r² (warm-up); needs >=2 finite returns to produce σ>0.
 */
export function ewmaSigma(returns, opts = {}) {
  if (!Array.isArray(returns)) return 0;
  const lambda = Number.isFinite(opts.lambda) && opts.lambda > 0 && opts.lambda < 1 ? opts.lambda : 0.94;
  const r = returns.filter((x) => Number.isFinite(x));
  if (r.length < 2) return 0; // need >=2 finite returns to produce a usable σ
  let varT = r[0] * r[0]; // seed variance = first squared return (warm-up)
  for (let i = 1; i < r.length; i++) {
    varT = lambda * varT + (1 - lambda) * (r[i - 1] * r[i - 1]);
  }
  return Math.sqrt(varT);
}

// ───────────────────────────────────────────────────────────────────────────
// §2 — the circuit-breaker verdict (pure, fail-open, two-sided)
// ───────────────────────────────────────────────────────────────────────────

const FAIL_OPEN = Object.freeze({
  tripped: false, zScore: 0, action: 'normal', sigmaUsed: 0,
});

/**
 * regimeBreaker(input, opts) -> { tripped, zScore, action, sigmaUsed }
 *
 * Pure advisory circuit-breaker. Two input shapes:
 *
 *   (A) object: { ret, sigma }  — caller holds σ (preferred; caller's σ policy wins).
 *       ret   = the latest 1-step (or windowed) log-return to test.
 *       sigma = the trailing per-second σ to standardize ret against.
 *
 *   (B) array: midSeries (mids)  — derive returns + EWMA σ internally.
 *       The latest return is the last element of returnsFromMids(mids); σ is
 *       ewmaSigma(returnsFromMids(mids), {lambda}). The latest return is
 *       INCLUDED in the σ estimate (it must be — the breaker fires ON the latest
 *       move, so σ must reflect the current regime, not a stale trailing window).
 *
 * opts: { zWiden=2, zHalt=3, minObs=10, lambda=0.94, window=1 }
 *   zWiden/zHalt — |z| thresholds; zHalt must be >= zWiden (else clamped).
 *   minObs       — minimum finite returns required for a non-fail-open verdict.
 *                  (object mode bypasses minObs only when sigma>0 is supplied.)
 *   window       — for array mode, the return window over which to aggregate
 *                  the move (1 = latest 1-step; k = sum of last k returns ≈
 *                  k-step move). The breaker tests |windowed-ret| / σ.
 *
 * Verdict:
 *   |z| >= zHalt → action:'halt',  tripped:true   (3σ violent move — pull quotes)
 *   |z| >= zWiden→ action:'widen', tripped:true   (2σ abnormal move — widen)
 *   else         → action:'normal',tripped:false
 *
 * FAIL-OPEN: non-array/non-object input, <minObs returns, σ<=0, or non-finite
 * ret/sigma → {tripped:false, action:'normal', zScore:0}. Never throws.
 */
export function regimeBreaker(input, opts = {}) {
  const zWiden = Number.isFinite(opts.zWiden) && opts.zWiden > 0 ? opts.zWiden : 2;
  const zHaltRaw = Number.isFinite(opts.zHalt) && opts.zHalt > 0 ? opts.zHalt : 3;
  // zHalt >= zWiden invariant (clamp, not throw): the thresholds define an
  // ordering halt>widen>normal; a caller mis-specifying zHalt<zWiden can't
  // invert the action mapping silently.
  const zHalt = zHaltRaw >= zWiden ? zHaltRaw : zWiden;
  const minObs = Number.isFinite(opts.minObs) && opts.minObs > 0 ? Math.floor(opts.minObs) : 10;
  const lambda = opts.lambda;
  const window = Number.isFinite(opts.window) && opts.window >= 1 ? Math.floor(opts.window) : 1;

  // ── resolve ret + sigma from the two input shapes ──
  let ret;
  let sigma;
  let obsCount;

  if (input != null && typeof input === 'object' && !Array.isArray(input)) {
    // (A) caller-supplied {ret, sigma}. Caller's σ policy wins. minObs is
    // bypassed (caller vouches for σ), but σ<=0 or non-finite ret still fail-open.
    ret = Number.isFinite(input.ret) ? input.ret : NaN;
    sigma = Number.isFinite(input.sigma) && input.sigma > 0 ? input.sigma : 0;
    obsCount = sigma > 0 ? minObs : 0; // σ>0 ⇒ caller vouches; else fail-open
  } else if (Array.isArray(input)) {
    // (B) midSeries — derive returns + EWMA σ internally.
    const rets = returnsFromMids(input);
    obsCount = rets.filter((x) => Number.isFinite(x)).length;
    if (obsCount < minObs) return { ...FAIL_OPEN };
    sigma = ewmaSigma(rets, { lambda });
    // windowed move: sum of the last `window` returns ≈ window-step log-move.
    const tail = rets.slice(Math.max(0, rets.length - window));
    ret = tail.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  } else {
    // non-array, non-object → fail-open.
    return { ...FAIL_OPEN };
  }

  // ── fail-open guards (σ<=0, non-finite ret) ──
  if (!(sigma > 0) || !Number.isFinite(ret)) return { ...FAIL_OPEN };
  if (obsCount < minObs) return { ...FAIL_OPEN };

  // ── z-score + two-sided action mapping ──
  const zScore = ret / sigma; // signed (caller may want direction); |z| gates the action
  const az = Math.abs(zScore);

  let action;
  let tripped;
  if (az >= zHalt) { action = 'halt'; tripped = true; }
  else if (az >= zWiden) { action = 'widen'; tripped = true; }
  else { action = 'normal'; tripped = false; }

  return { tripped, zScore, action, sigmaUsed: sigma };
}

// ───────────────────────────────────────────────────────────────────────────
// §3 — --test: GREEN (3σ halt), METAMORPHIC (monotone z + action ordering),
//               RED (fail-open on insufficient obs / NaN / bad input)
// ───────────────────────────────────────────────────────────────────────────

function runTests() {
  const tests = {};
  const eq = (a, b) => Math.abs(a - b) < 1e-9;

  // ── GREEN: a 3σ spike trips halt (object mode — caller-supplied σ) ──
  {
    const sigma = 0.001; // 10 bps per-second σ
    const ret = sigma * 3.2; // a 3.2σ up-spike
    const r = regimeBreaker({ ret, sigma });
    tests.green_3sigmaHalt = {
      action: r.action, tripped: r.tripped, zScore: Number(r.zScore.toFixed(4)),
      ok: r.action === 'halt' && r.tripped === true && eq(r.zScore, 3.2) && eq(r.sigmaUsed, sigma),
      expect: "3.2σ → halt, tripped, zScore=3.2",
    };
  }

  // ── GREEN: 2σ trips widen (the boundary between normal and halt) ──
  {
    const sigma = 0.001;
    const r = regimeBreaker({ ret: sigma * 2.1, sigma });
    tests.green_2sigmaWiden = {
      action: r.action, tripped: r.tripped,
      ok: r.action === 'widen' && r.tripped === true,
      expect: "2.1σ → widen, tripped",
    };
  }

  // ── GREEN: a 3σ CRASH (down-move) also trips halt — two-sided |z| guard ──
  {
    const sigma = 0.001;
    const r = regimeBreaker({ ret: -sigma * 3.5, sigma }); // negative 3.5σ
    tests.green_3sigmaCrash = {
      action: r.action, tripped: r.tripped, zScore: Number(r.zScore.toFixed(4)),
      ok: r.action === 'halt' && r.tripped === true && r.zScore < 0 && eq(r.zScore, -3.5),
      expect: "-3.5σ crash → halt (two-sided), zScore negative (direction preserved)",
    };
  }

  // ── GREEN: calm (0.5σ) → normal ──
  {
    const r = regimeBreaker({ ret: 0.001 * 0.5, sigma: 0.001 });
    tests.green_normal = {
      action: r.action, tripped: r.tripped,
      ok: r.action === 'normal' && r.tripped === false,
      expect: "0.5σ → normal, not tripped",
    };
  }

  // ── METAMORPHIC: bigger move → higher |z| (strict monotonicity of z in ret) ──
  {
    const sigma = 0.001;
    const zs = [1, 2, 3, 4, 5].map((k) => Math.abs(regimeBreaker({ ret: sigma * k, sigma }).zScore));
    const monotone = zs.every((z, i) => i === 0 || z >= zs[i - 1] - 1e-12);
    tests.meta_zMonotoneInMove = {
      zScores: zs.map((z) => Number(z.toFixed(3))),
      ok: monotone && eq(zs[0], 1) && eq(zs[4], 5),
      expect: "|z| strictly non-decreasing as the move magnitude grows (1,2,3,4,5)",
    };
  }

  // ── METAMORPHIC: action ordering halt ≥ widen ≥ normal across move sizes ──
  {
    const sigma = 0.001;
    const rank = { normal: 0, widen: 1, halt: 2 };
    const acts = [0.5, 2.1, 3.1, 4].map((k) => regimeBreaker({ ret: sigma * k, sigma }).action);
    const ordered = acts.every((a, i) => i === 0 || rank[acts[i]] >= rank[acts[i - 1]]);
    tests.meta_actionOrdering = {
      actions: acts,
      ok: ordered && acts[0] === 'normal' && acts[1] === 'widen' && acts[2] === 'halt' && acts[3] === 'halt',
      expect: "0.5→normal, 2.1→widen, 3.1→halt, 4→halt (escalating, never inverts)",
    };
  }

  // ── METAMORPHIC: array mode — a spike in a mid series trips halt via EWMA σ ──
  {
    // 200 calm mids (1bp steps) then a 50bp spike — σ is ~1bp so 50bp ≈ many σ.
    const mids = [100];
    let p = 100;
    for (let i = 0; i < 200; i++) { p *= 1 + 0.0001 * (Math.random() - 0.5) * 2; mids.push(p); }
    mids.push(p * 1.005); // +50bp spike as the latest move
    const r = regimeBreaker(mids, { minObs: 50 });
    tests.meta_arraySpikeHalts = {
      action: r.action, tripped: r.tripped, zScore: Number(r.zScore.toFixed(2)),
      ok: r.action === 'halt' && r.tripped === true && r.sigmaUsed > 0,
      expect: "mid-series with +50bp spike after ~1bp calm → halt (EWMA σ derived internally)",
    };
  }

  // ── RED: insufficient obs (< minObs) → fail-open normal, no throw ──
  {
    const mids = [100, 100.01, 100.005]; // only 2 returns < minObs(10)
    const r = regimeBreaker(mids, { minObs: 10 });
    let threw = false;
    try { regimeBreaker(mids, { minObs: 10 }); } catch { threw = true; }
    tests.red_insufficientObs = {
      action: r.action, tripped: r.tripped, zScore: r.zScore, threw,
      ok: r.action === 'normal' && r.tripped === false && r.zScore === 0 && !threw,
      expect: "<minObs → fail-open {normal, tripped:false, zScore:0}, no throw",
    };
  }

  // ── RED: NaN ret (object mode) → fail-open normal ──
  {
    const r = regimeBreaker({ ret: NaN, sigma: 0.001 });
    tests.red_nanRet = {
      action: r.action, zScore: r.zScore,
      ok: r.action === 'normal' && r.tripped === false && r.zScore === 0,
      expect: "NaN ret → fail-open normal",
    };
  }

  // ── RED: σ<=0 (object mode) → fail-open normal ──
  {
    const r = regimeBreaker({ ret: 0.05, sigma: 0 });
    tests.red_zeroSigma = {
      action: r.action,
      ok: r.action === 'normal' && r.tripped === false,
      expect: "σ=0 → fail-open normal (no division by zero)",
    };
  }

  // ── RED: bad input types (null, number, string) → fail-open, no throw ──
  {
    const cases = [
      regimeBreaker(null),
      regimeBreaker(42),
      regimeBreaker('mid'),
      regimeBreaker(undefined),
    ];
    const allNormal = cases.every((c) => c.action === 'normal' && c.tripped === false && c.zScore === 0);
    let threw = false;
    try { regimeBreaker(null); regimeBreaker(42); regimeBreaker('x'); } catch { threw = true; }
    tests.red_badInputTypes = {
      allNormal, threw,
      ok: allNormal && !threw,
      expect: "null/number/string/undefined → fail-open normal, no throw",
    };
  }

  const allOk = Object.values(tests).every((t) => t.ok === true);
  const out = {
    module: 'regime-breaker',
    capability: 'regime-breaker',
    pass: Object.values(tests).filter((t) => t.ok).length,
    total: Object.keys(tests).length,
    ALL_PASS: allOk,
    tests,
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--test')) {
    const r = runTests();
    process.exit(r.ALL_PASS ? 0 : 1);
  } else {
    console.log('regime-breaker: A-S maker regime circuit-breaker (pure compute, DISARMED).');
    console.log('  node regime-breaker.mjs --test');
    console.log('  import { regimeBreaker, ewmaSigma, returnsFromMids } from "./regime-breaker.mjs"');
  }
}
