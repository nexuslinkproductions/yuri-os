#!/usr/bin/env node
// @capability: kappa-fit
// @serves: kappa calibration | A-S order-arrival decay | fill intensity fit | optimal spread delta-star | maker spread calibration | kappa from fill surface | net per fill feasibility
// @does: Calibrates Avellaneda-Stoikov kappa (order-arrival decay) from a recorded fill-surface JSON. Converts P(fill|offset,horizon) to a Poisson arrival intensity lambda = -ln(1-P)/T (glm-5.2-endorsed estimator), OLS-fits ln(lambda) = lnA - kappa*delta over NON-SATURATED cells (P<=0.85) per regime + pooled, then derives the optimal half-spread delta* = 1/kappa + breakeven and the net-per-fill feasibility. Emits an honest data-sufficiency banner (kappa is UNTRUSTED-FOR-LIVE below glm's bar). Pure offline analysis — no orders, no network.
// @use: node kappa-fit.mjs --run <fill-surface.json> [--mid 62700] [--fee-rt 4.0] [--adverse 0.16]; or import { fitKappa, deltaStar, feasibility } for programmatic calibration. Estimator + data bar per glm-5.2 audit 2026-06-19.
// @exports: fitKappa, ols, pFillToLambda, deltaStar, feasibility
//
// glm-5.2 CALIBRATION REVIEW (2026-06-19) baked in:
//   - kappa estimator: lambda(delta) = -ln(1 - P(delta,T)) / T, then OLS ln(lambda) on delta. CONFIRMED.
//   - EXCLUDE saturated cells (P > 0.85) — the -ln(1-P) transform explodes near P=1.
//   - DATA BAR before kappa is trustworthy for LIVE sizing: >=10 trading days (~230h),
//     >=3 multi-day vol regimes, >=100 obs/cell after filtering, >=5 non-saturated delta
//     levels, walk-forward stable (<30% kappa shift). Below the bar = mechanics-only.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

// ── P(fill within T) → Poisson arrival intensity lambda (per second) ──────────
/** @returns {number|null} lambda, or null if P outside (0,1) (saturated/degenerate) */
export function pFillToLambda(pFill, horizonSec) {
  if (!fin(pFill) || pFill <= 0 || pFill >= 1) return null; // need 0<P<1; P→1 saturates the log
  if (!fin(horizonSec) || horizonSec <= 0) return null;
  return -Math.log(1 - pFill) / horizonSec;
}

// ── Ordinary least squares ────────────────────────────────────────────────────
/** @returns {{slope,intercept,r2,n}|null} */
export function ols(xs, ys) {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}

// ── fitKappa — delta in TICKS; per-regime + pooled ────────────────────────────
/**
 * @param {object[]} surface - [{offset,size,horizonSec,regime,pFill,n}]
 * @param {object} [opts] - {maxP=0.85, minN=30, tickSize=0.1, mid=null}
 * @returns {{pooled, regimes, usableCells}}
 */
export function fitKappa(surface, opts = {}) {
  const { maxP = 0.85, minN = 30, tickSize = 0.1, mid = null } = opts;
  const usable = (surface || []).filter((r) =>
    r && fin(r.pFill) && r.pFill > 0 && r.pFill <= maxP &&
    fin(r.offset) && fin(r.horizonSec) && (r.n == null || r.n >= minN));

  const fitOne = (cells) => {
    const xs = [], ys = [];
    for (const c of cells) {
      const lam = pFillToLambda(c.pFill, c.horizonSec);
      if (lam == null || lam <= 0) continue;
      xs.push(c.offset);          // delta in ticks
      ys.push(Math.log(lam));
    }
    const f = ols(xs, ys);
    if (!f) return null;
    const kappaTicks = -f.slope;  // ln lambda = lnA - kappa*delta_ticks → slope = -kappa
    const lnA = f.intercept;
    const kappaPrice = fin(tickSize) && tickSize > 0 ? kappaTicks / tickSize : null;          // per $
    const kappaBps = (fin(mid) && mid > 0 && fin(tickSize)) ? kappaTicks * mid / (tickSize * 1e4) : null; // per bps
    return { kappaTicks, kappaPrice, kappaBps, lnA, r2: f.r2, nCells: f.n,
      deltaLevels: [...new Set(cells.map((c) => c.offset))].length };
  };

  const byRegime = {};
  for (const r of usable) { (byRegime[r.regime] = byRegime[r.regime] || []).push(r); }
  const regimes = {};
  for (const [reg, cells] of Object.entries(byRegime)) regimes[reg] = fitOne(cells);
  return { pooled: fitOne(usable), regimes, usableCells: usable.length };
}

// ── deltaStar = 1/kappa + breakeven_halfspread (glm Q4) ───────────────────────
/** kappa and breakeven in the SAME unit (bps); returns delta* half-spread in that unit. */
export function deltaStar(kappaBps, breakevenHalfBps) {
  if (!fin(kappaBps) || kappaBps <= 0 || !fin(breakevenHalfBps)) return null;
  return 1 / kappaBps + breakevenHalfBps;
}

// ── feasibility — net per fill at delta*, rough fill-rate + hourly ────────────
/**
 * @param {number} kappaBps
 * @param {number} kappaTicks - for the rough lambda(delta*) intensity in consistent units
 * @param {number} lnA        - ticks-fit intercept
 * @param {object} [opts] - {feeRtBps,adverseBps,mid,tickSize,horizonSec,bookEur}
 */
export function feasibility(kappaBps, kappaTicks, lnA, opts = {}) {
  const { feeRtBps = 4.0, adverseBps = 0.16, mid = 62700, tickSize = 0.1, horizonSec = 5, bookEur = 300 } = opts;
  const breakevenHalfBps = (feeRtBps + adverseBps) / 2;
  const ds = deltaStar(kappaBps, breakevenHalfBps);
  if (ds == null) return null;
  const netPerFillBps = 2 * ds - (feeRtBps + adverseBps);
  // Rough fill-rate at delta*: convert delta*_bps→ticks, lambda = exp(lnA - kappaTicks*delta*_ticks)
  let pFillAtDstar = null, fillsPerHour = null, netBpsPerHour = null;
  if (fin(kappaTicks) && fin(lnA) && fin(mid) && mid > 0) {
    const dStarTicks = ds * mid / (tickSize * 1e4);
    const lam = Math.exp(lnA - kappaTicks * dStarTicks);        // per-second arrival intensity
    pFillAtDstar = 1 - Math.exp(-lam * horizonSec);             // P(fill within horizon) one side
    const cyclesPerHour = 3600 / horizonSec;
    fillsPerHour = pFillAtDstar * 2 * cyclesPerHour;            // both sides
    netBpsPerHour = netPerFillBps * fillsPerHour;
  }
  return { breakevenHalfBps, deltaStarBps: ds, netPerFillBps, pFillAtDstar, fillsPerHour, netBpsPerHour, bookEur };
}

// ── --run / --test ────────────────────────────────────────────────────────────
const _isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

function getArg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

if (_isMain && process.argv.includes('--run')) {
  const path = getArg('--run');
  const mid = Number(getArg('--mid', '62700'));
  const feeRtBps = Number(getArg('--fee-rt', '4.0'));
  const adverseBps = Number(getArg('--adverse', '0.16'));
  const tickSize = Number(getArg('--tick', '0.1'));
  let j;
  try { j = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`FATAL: cannot read ${path}: ${e.message}`); process.exit(1); }

  const spanH = j.span ? (j.span.durationMs / 3600000) : null;
  const fit = fitKappa(j.surface, { mid, tickSize });
  console.log(`-- KAPPA-FIT --run ${path} --`);
  console.log(`tape span: ${spanH ? spanH.toFixed(2) + 'h' : 'n/a'} | samples: ${j.samples} | usable non-saturated cells (P<=0.85, n>=30): ${fit.usableCells}\n`);

  const show = (label, f) => {
    if (!f) { console.log(`  ${label.padEnd(8)} : (no fit — too few cells)`); return; }
    console.log(`  ${label.padEnd(8)} : kappa=${f.kappaBps != null ? f.kappaBps.toFixed(4) + '/bps' : 'n/a'} (${f.kappaTicks.toFixed(4)}/tick) lnA=${f.lnA.toFixed(3)} R2=${f.r2.toFixed(3)} cells=${f.nCells} dLevels=${f.deltaLevels}`);
  };
  console.log('KAPPA FITS (ln lambda = lnA - kappa*delta; lambda = -ln(1-P)/T):');
  show('pooled', fit.pooled);
  for (const [reg, f] of Object.entries(fit.regimes)) show(reg, f);

  console.log('\nFEASIBILITY (glm Q4: delta* = 1/kappa + breakeven; net/fill = 2*delta* - fee - AS):');
  const f = fit.pooled;
  const feas = (f && fin(f.kappaBps) && f.kappaBps > 0)
    ? feasibility(f.kappaBps, f.kappaTicks, f.lnA, { feeRtBps, adverseBps, mid, tickSize })
    : null;
  if (f && (!fin(f.kappaBps) || f.kappaBps <= 0 || f.r2 < 0.5)) {
    console.log(`  NO USABLE kappa: slope is ${f.kappaBps <= 0 ? 'non-positive (fill rate does NOT decay with offset)' : 'positive but'} R2=${f.r2.toFixed(3)} (no exponential decay signal).`);
    console.log(`  => The offset grid likely does not span far enough to see kappa. Max offset here = ${Math.max(...(j.surface||[]).map(r=>r.offset||0))} ticks = ${(Math.max(...(j.surface||[]).map(r=>r.offset||0))*tickSize/mid*1e4).toFixed(3)} bps; glm's delta* ~ a few bps. Re-run fill-surface with DEEPER offsets.`);
  } else if (feas) {
    console.log(`  breakeven half-spread : ${feas.breakevenHalfBps.toFixed(3)} bps  (fee_rt ${feeRtBps} + AS ${adverseBps})`);
    console.log(`  delta* (half-spread)  : ${feas.deltaStarBps.toFixed(3)} bps`);
    console.log(`  NET per fill          : ${feas.netPerFillBps.toFixed(3)} bps  ${feas.netPerFillBps > 0 ? '(positive)' : '(negative)'}`);
    console.log(`  [ROUGH] P(fill@${'5s'}) at delta* : ${feas.pFillAtDstar != null ? (feas.pFillAtDstar * 100).toFixed(1) + '%' : 'n/a'}`);
    console.log(`  [ROUGH] fills/hour    : ${feas.fillsPerHour != null ? feas.fillsPerHour.toFixed(1) : 'n/a'}  | net bps/hour: ${feas.netBpsPerHour != null ? feas.netBpsPerHour.toFixed(1) : 'n/a'}`);
    console.log(`  [ROUGH] on EUR${feas.bookEur}: ~EUR ${feas.netBpsPerHour != null ? (feas.netBpsPerHour / 1e4 * feas.bookEur).toFixed(2) : 'n/a'}/hour  (extrapolated beyond measured surface — DO NOT TRUST)`);
  } else {
    console.log('  (no pooled kappa — cannot compute feasibility)');
  }

  // ── DATA-SUFFICIENCY BANNER (glm bar) ──
  const regimeCount = Object.keys(fit.regimes).length;
  const maxObs = Math.max(0, ...(j.surface || []).filter((r) => r.pFill != null && r.pFill <= 0.85).map((r) => r.n || 0));
  const dLevels = f ? f.deltaLevels : 0;
  const bar = [
    ['span >= 230h (10 trading days)', spanH != null && spanH >= 230, `${spanH ? spanH.toFixed(1) : '?'}h`],
    ['>= 3 multi-day vol regimes', false, `${regimeCount} intra-session terciles (NOT multi-day)`],
    ['>= 100 obs / cell', maxObs >= 100, `max ${maxObs}`],
    ['>= 5 non-saturated delta levels', dLevels >= 5, `${dLevels}`],
    ['walk-forward stable (<30% kappa shift)', false, 'not yet measured (needs multi-day)'],
  ];
  console.log('\nDATA-SUFFICIENCY (glm bar — kappa is UNTRUSTED-FOR-LIVE until ALL pass):');
  for (const [name, ok, detail] of bar) console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name.padEnd(40)} ${detail}`);
  const allPass = bar.every((b) => b[1]);
  console.log(`\nVERDICT: ${allPass ? 'kappa TRUSTWORTHY for live sizing' : 'kappa = MECHANICS-ONLY (below glm data bar) — fit runs, output not yet trustworthy for live sizing. Let the tape accumulate.'}`);
  process.exit(0);
}

if (_isMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (c, l) => { if (c) pass++; else { fail++; console.error(`FAIL: ${l}`); } };
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  // pFillToLambda: invert P = 1 - exp(-lambda*T)
  const lam = pFillToLambda(1 - Math.exp(-0.5 * 10), 10); // P from lambda=0.5,T=10 → recover 0.5
  assert(lam !== null && near(lam, 0.5, 1e-9), `pFillToLambda inverts CDF (got ${lam})`);
  assert(pFillToLambda(0, 10) === null && pFillToLambda(1, 10) === null && pFillToLambda(0.5, 0) === null,
    'pFillToLambda: P outside (0,1) or bad T → null (saturation guard)');

  // ols: perfect line y = 3 - 2x → slope -2, intercept 3, r2 1
  const f = ols([0, 1, 2, 3], [3, 1, -1, -3]);
  assert(f && near(f.slope, -2) && near(f.intercept, 3) && near(f.r2, 1), `ols recovers perfect line (got ${JSON.stringify(f)})`);

  // ── METAMORPHIC: synthesize a surface with KNOWN kappa, recover it ──
  const kappaTrue = 0.4, A = 0.5, tick = 0.1, midT = 60000;
  const offsets = [0, 1, 2, 3, 5, 10], horizons = [5, 10, 30];
  const synth = [];
  for (const off of offsets) for (const T of horizons) {
    const lambda = A * Math.exp(-kappaTrue * off);   // ticks-domain decay
    const P = 1 - Math.exp(-lambda * T);
    synth.push({ offset: off, horizonSec: T, regime: 'med', pFill: P, n: 200 });
  }
  const fit = fitKappa(synth, { mid: midT, tickSize: tick });
  assert(fit.pooled && near(fit.pooled.kappaTicks, kappaTrue, 1e-6),
    `fitKappa recovers known kappa_ticks=${kappaTrue} (got ${fit.pooled?.kappaTicks})`);
  assert(fit.pooled && near(fit.pooled.lnA, Math.log(A), 1e-6),
    `fitKappa recovers lnA=ln(${A}) (got ${fit.pooled?.lnA})`);
  assert(fit.pooled && fit.pooled.r2 > 0.9999, `fitKappa clean synthetic → R2≈1 (got ${fit.pooled?.r2})`);
  // kappaPrice = kappaTicks/tickSize ; kappaBps = kappaTicks*mid/(tick*1e4)
  assert(fit.pooled && near(fit.pooled.kappaPrice, kappaTrue / tick, 1e-9), 'kappaPrice = kappaTicks/tickSize');
  assert(fit.pooled && near(fit.pooled.kappaBps, kappaTrue * midT / (tick * 1e4), 1e-9), 'kappaBps conversion');

  // saturation exclusion: a P>0.85 cell must be dropped
  const withSat = [...synth, { offset: 0, horizonSec: 600, regime: 'med', pFill: 0.999, n: 200 }];
  const fit2 = fitKappa(withSat, { mid: midT, tickSize: tick });
  assert(fit2.pooled && near(fit2.pooled.kappaTicks, kappaTrue, 1e-6),
    'saturated P>0.85 cell excluded → kappa unchanged');

  // deltaStar + feasibility monotonic: smaller kappa → larger delta*
  const dsSmall = deltaStar(0.1, 2.08), dsLarge = deltaStar(1.0, 2.08);
  assert(dsSmall > dsLarge, `deltaStar: smaller kappa → wider delta* (${dsSmall} > ${dsLarge})`);
  const feas = feasibility(0.5, 0.4, Math.log(0.5), { feeRtBps: 4.0, adverseBps: 0.16, mid: 60000 });
  assert(feas && near(feas.breakevenHalfBps, 2.08), `feasibility breakeven = 2.08 (got ${feas?.breakevenHalfBps})`);
  assert(feas && feas.deltaStarBps > feas.breakevenHalfBps, 'feasibility: delta* > breakeven');

  // empty / degenerate → null fits, no throw
  assert(fitKappa([]).pooled === null, 'empty surface → null pooled fit');
  assert(fitKappa(null).pooled === null, 'null surface → null pooled fit (no throw)');

  console.log(`kappa-fit --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
