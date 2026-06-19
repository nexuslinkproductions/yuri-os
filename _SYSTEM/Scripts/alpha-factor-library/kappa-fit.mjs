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
  // test-only imports (do not affect module-level API surface)
  const { writeFileSync, unlinkSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  let pass = 0, fail = 0;
  const assert = (c, l) => { if (c) pass++; else { fail++; console.error(`FAIL: ${l}`); } };
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  // ── pFillToLambda: invert P = 1 - exp(-lambda*T) ──
  const lam = pFillToLambda(1 - Math.exp(-0.5 * 10), 10); // P from lambda=0.5,T=10 → recover 0.5
  assert(lam !== null && near(lam, 0.5, 1e-9), `pFillToLambda inverts CDF (got ${lam})`);
  assert(pFillToLambda(0, 10) === null && pFillToLambda(1, 10) === null && pFillToLambda(0.5, 0) === null,
    'pFillToLambda: P outside (0,1) or bad T → null (saturation guard)');
  // sub-1s horizon must be valid (mutant <=1 would reject it)
  const lamSub = pFillToLambda(0.5, 0.5);
  assert(lamSub !== null && near(lamSub, -Math.log(0.5) / 0.5, 1e-9),
    `pFillToLambda: sub-second horizon 0.5s valid (got ${lamSub})`);
  // NaN / negative horizon → null
  assert(pFillToLambda(0.5, NaN) === null && pFillToLambda(0.5, -5) === null,
    'pFillToLambda: NaN/negative horizon → null');
  // saturated-cell boundary: P exactly at 0.85 should still compute (filter is pFill <= maxP)
  const lamAt85 = pFillToLambda(0.85, 10);
  assert(lamAt85 !== null && lamAt85 > 0, `pFillToLambda: P=0.85 still valid (got ${lamAt85})`);
  // scaling check: doubling T halves lambda (Poisson linearity)
  assert(near(pFillToLambda(0.5, 10) / pFillToLambda(0.5, 20), 2, 1e-9),
    'pFillToLambda: lambda inversely proportional to T');

  // ── ols: perfect line y = 3 - 2x → slope -2, intercept 3, r2 1 ──
  const f = ols([0, 1, 2, 3], [3, 1, -1, -3]);
  assert(f && near(f.slope, -2) && near(f.intercept, 3) && near(f.r2, 1), `ols recovers perfect line (got ${JSON.stringify(f)})`);
  // exactly 2 points → valid (mutant n<=2 would reject)
  const f2 = ols([0, 1], [5, 3]);
  assert(f2 && near(f2.slope, -2) && near(f2.intercept, 5), `ols: 2 points valid (got ${JSON.stringify(f2)})`);
  // <2 points → null
  assert(ols([1], [2]) === null && ols([], []) === null, 'ols: <2 points → null');
  // mismatched lengths → null
  assert(ols([1, 2, 3], [1, 2]) === null, 'ols: mismatched xs/ys → null');
  // zero-variance (all x equal) → null (sxx=0)
  assert(ols([5, 5, 5], [1, 2, 3]) === null, 'ols: zero-variance x → null (sxx guard)');
  // horizontal line → r2=1 special case (syy=0)
  const fh = ols([0, 1, 2], [7, 7, 7]);
  assert(fh && near(fh.slope, 0) && near(fh.intercept, 7) && near(fh.r2, 1),
    `ols: horizontal line r2=1 special case (got ${JSON.stringify(fh)})`);

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
  // usableCells counts filtered cells
  assert(fit.usableCells === 9, `fitKappa usableCells=${fit.usableCells} (expect 9 non-saturated)`);
  // per-regime fits exist
  assert(fit.regimes.med && near(fit.regimes.med.kappaTicks, kappaTrue, 1e-6),
    'fitKappa per-regime fit matches pooled (single regime)');

  // ── saturation exclusion: P>0.85 cell must be dropped ──
  const withSat = [...synth, { offset: 0, horizonSec: 600, regime: 'med', pFill: 0.999, n: 200 }];
  const fit2 = fitKappa(withSat, { mid: midT, tickSize: tick });
  assert(fit2.pooled && near(fit2.pooled.kappaTicks, kappaTrue, 1e-6),
    'saturated P>0.85 cell excluded → kappa unchanged');
  assert(fit2.usableCells === 9, `saturated cell excluded from count (got ${fit2.usableCells})`);
  // boundary: P exactly 0.85 (== maxP) is NOT saturated → included
  const atBoundary = [{ offset: 0, horizonSec: 5, regime: 'x', pFill: 0.85, n: 50 },
    { offset: 1, horizonSec: 5, regime: 'x', pFill: 0.5, n: 50 }];
  const fitBoundary = fitKappa(atBoundary, { mid: midT, tickSize: tick });
  assert(fitBoundary.usableCells === 2, `P==maxP (0.85) included, not saturated (got ${fitBoundary.usableCells})`);

  // ── fitKappa guard edges: tickSize=0 → kappaPrice null, no crash ──
  const fitT0 = fitKappa([{ offset: 0, horizonSec: 5, regime: 'x', pFill: 0.3, n: 50 },
    { offset: 1, horizonSec: 5, regime: 'x', pFill: 0.2, n: 50 }], { tickSize: 0, mid: midT });
  assert(fitT0.pooled && fitT0.pooled.kappaPrice === null,
    `fitKappa tickSize=0 → kappaPrice null (got ${fitT0.pooled?.kappaPrice})`);
  // mid=0 → kappaBps null (guard mid>0)
  const fitM0 = fitKappa([{ offset: 0, horizonSec: 5, regime: 'x', pFill: 0.3, n: 50 },
    { offset: 1, horizonSec: 5, regime: 'x', pFill: 0.2, n: 50 }], { tickSize: tick, mid: 0 });
  assert(fitM0.pooled && fitM0.pooled.kappaBps === null,
    `fitKappa mid=0 → kappaBps null (got ${fitM0.pooled?.kappaBps})`);
  // minN filter: cell with n<minN excluded
  const fitMinN = fitKappa([{ offset: 0, horizonSec: 5, regime: 'x', pFill: 0.3, n: 5 },
    { offset: 1, horizonSec: 5, regime: 'x', pFill: 0.2, n: 200 },
    { offset: 2, horizonSec: 5, regime: 'x', pFill: 0.15, n: 200 }],
    { minN: 30, mid: midT, tickSize: tick });
  assert(fitMinN.usableCells === 2, `minN=30 filters n=5 cell (got ${fitMinN.usableCells})`);

  // ── deltaStar = 1/kappa + breakeven ──
  const dsSmall = deltaStar(0.1, 2.08), dsLarge = deltaStar(1.0, 2.08);
  assert(dsSmall > dsLarge, `deltaStar: smaller kappa → wider delta* (${dsSmall} > ${dsLarge})`);
  // exact value: deltaStar(0.5, 2.0) = 1/0.5 + 2.0 = 4.0
  assert(near(deltaStar(0.5, 2.0), 4.0, 1e-9), 'deltaStar(0.5, 2.0) = 4.0 exact');
  // kappa=0 → null (guard kappaBps<=0)
  assert(deltaStar(0, 2.08) === null, 'deltaStar: kappa=0 → null (division guard)');
  // kappa<0 → null
  assert(deltaStar(-1, 2.08) === null, 'deltaStar: negative kappa → null');
  // NaN kappa → null
  assert(deltaStar(NaN, 2.08) === null, 'deltaStar: NaN kappa → null');
  // NaN breakeven → null
  assert(deltaStar(0.5, NaN) === null, 'deltaStar: NaN breakeven → null');
  // negative breakeven is valid (math doesn't forbid it)
  assert(deltaStar(0.5, -1.0) !== null && near(deltaStar(0.5, -1.0), 1.0, 1e-9),
    'deltaStar: negative breakeven valid (= 1/kappa + neg)');

  // ── feasibility: pFillAtDstar / fillsPerHour / netBpsPerHour with non-zero values ──
  // Use small kappa so lambda at delta* is non-trivially > 0.
  // kappaBps=0.01, kappaTicks=0.001, lnA=ln(0.5), mid=60000, tickSize=0.1, horizonSec=5
  // delta* = 1/0.01 + 2.08 = 102.08 bps
  // dStarTicks = 102.08*60000/(0.1*1e4) = 6124.8
  // lam = exp(ln(0.5) - 0.001*6124.8) = 0.5*exp(-6.1248) ≈ 0.001108
  // pFill = 1-exp(-0.001108*5) ≈ 0.005525
  const feasRef = feasibility(0.01, 0.001, Math.log(0.5), { feeRtBps: 4.0, adverseBps: 0.16, mid: 60000 });
  assert(feasRef && near(feasRef.breakevenHalfBps, 2.08, 1e-9), `feasibility breakeven = 2.08 (got ${feasRef?.breakevenHalfBps})`);
  assert(feasRef && near(feasRef.deltaStarBps, 102.08, 1e-6), `feasibility delta* = 102.08 (got ${feasRef?.deltaStarBps})`);
  assert(feasRef && near(feasRef.netPerFillBps, 2 * 102.08 - 4.16, 1e-6), `feasibility net/fill = 200 (got ${feasRef?.netPerFillBps})`);
  // Assert pFillAtDstar to tight tolerance — kills [-→+], [*→/] mutants on L107
  assert(feasRef && feasRef.pFillAtDstar !== null && near(feasRef.pFillAtDstar, 0.005525, 1e-4),
    `feasibility pFillAtDstar ≈ 0.005525 (got ${feasRef?.pFillAtDstar})`);
  // fillsPerHour = pFill * 2 * (3600/5) = pFill * 1440 — kills [*→/] on L105 (dStarTicks)
  assert(feasRef && feasRef.fillsPerHour !== null && near(feasRef.fillsPerHour, feasRef.pFillAtDstar * 2 * 720, 1e-6),
    `feasibility fillsPerHour = pFill*2*720 (got ${feasRef?.fillsPerHour})`);
  // netBpsPerHour = netPerFill * fillsPerHour — kills [*→/] on L110
  assert(feasRef && feasRef.netBpsPerHour !== null && near(feasRef.netBpsPerHour, feasRef.netPerFillBps * feasRef.fillsPerHour, 1e-6),
    `feasibility netBpsPerHour = netPerFill*fillsPerHour (got ${feasRef?.netBpsPerHour})`);
  // pFill must be in [0,1) — kills [-→+] mutant that produces >1 or negative
  assert(feasRef && feasRef.pFillAtDstar >= 0 && feasRef.pFillAtDstar < 1,
    `feasibility pFill in [0,1) (got ${feasRef?.pFillAtDstar})`);
  // feasibility with bad kappaBps → null
  assert(feasibility(0, 0.4, Math.log(0.5)) === null, 'feasibility kappaBps=0 → null');
  assert(feasibility(-1, 0.4, Math.log(0.5)) === null, 'feasibility kappaBps<0 → null');
  // feasibility with NaN kappaTicks → pFill/fills/net null but breakeven/delta* still computed
  const feasNaN = feasibility(0.5, NaN, Math.log(0.5));
  assert(feasNaN && feasNaN.pFillAtDstar === null && feasNaN.breakevenHalfBps !== null,
    'feasibility NaN kappaTicks → pFill null but breakeven computed');
  // custom horizonSec reflected in pFill
  const feasH10 = feasibility(0.01, 0.001, Math.log(0.5), { mid: 60000, horizonSec: 10 });
  assert(feasH10 && feasH10.pFillAtDstar > feasRef.pFillAtDstar,
    `feasibility: longer horizon → higher pFill (${feasH10?.pFillAtDstar} > ${feasRef.pFillAtDstar})`);

  // ── --run CLI smoke: structured output, exit 0, no crash ──
  const tmpFix = join(tmpdir(), `kf-test-${Date.now()}.json`);
  writeFileSync(tmpFix, JSON.stringify({
    span: { durationMs: 3600000 }, samples: 500,
    surface: offsets.map((o, i) => ({ offset: o, size: 1, horizonSec: 5, regime: 'low',
      pFill: 1 - Math.exp(-A * Math.exp(-kappaTrue * o) * 5), n: 100 })),
  }));
  const cliRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', tmpFix, '--mid', '60000'],
    { encoding: 'utf8', timeout: 10000 });
  try { unlinkSync(tmpFix); } catch { /* best-effort */ }
  assert(cliRun.status === 0, `--run exits 0 (got ${cliRun.status})`);
  assert(/KAPPA FITS/.test(cliRun.stdout), '--run outputs KAPPA FITS header');
  assert(/DATA-SUFFICIENCY/.test(cliRun.stdout), '--run outputs DATA-SUFFICIENCY banner');
  assert(/VERDICT:/.test(cliRun.stdout), '--run outputs VERDICT line');
  assert(/MECHANICS-ONLY/.test(cliRun.stdout), '--run short-span → MECHANICS-ONLY verdict');
  // span calc: 3600000ms → 1.00h (kills [/→*] on L132)
  assert(/tape span: 1\.00h/.test(cliRun.stdout), '--run span conversion 3600000ms → 1.00h');
  // span=1h < 230h → FAIL on span bar (kills [&&→||] on L169: mutant would PASS)
  assert(/\[FAIL\] span >= 230h/.test(cliRun.stdout), '--run 1h span → FAIL on span bar (below 230h)');
  // --run with missing file → exit 1
  const cliMissing = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', '/nonexistent/xyz.json'],
    { encoding: 'utf8', timeout: 10000 });
  assert(cliMissing.status === 1 && /FATAL/.test(cliMissing.stderr), '--run missing file → exit 1 + FATAL');

  // ── empty / degenerate → null fits, no throw ──
  assert(fitKappa([]).pooled === null, 'empty surface → null pooled fit');
  assert(fitKappa(null).pooled === null, 'null surface → null pooled fit (no throw)');
  // single cell → not enough for OLS (need >=2 delta points)
  assert(fitKappa([{ offset: 0, horizonSec: 5, regime: 'x', pFill: 0.3, n: 50 }]).pooled === null,
    'single cell → null pooled (insufficient for OLS)');

  // ── EQUIVALENT MUTANTS (noted, not forced — behaviorally identical for all valid inputs) ──
  // L61 [lam<=0→<0]: lambda=-ln(1-P)/T is strictly >0 for any valid pFill∈(0,1); lam=0 requires P=0 which is excluded upstream.
  // L54 [pFill>0→>=0]: pFill=0 yields null from pFillToLambda, so the cell is skipped downstream regardless of this filter.
  // L102 [comment -→+]: cosmetic comment text, zero behavioral impact.
  // L120 [getArg >=→>]: argv[0] is always the node binary path, never a flag; index-0 case unreachable.
  // L150:57 [r2<0.5→<=0.5]: boundary at r2 exactly 0.5 requires a specific noise pattern impractical to synthesize deterministically.

  // ── --run bad-kappa fixture: P increasing with offset → negative kappa → "NO USABLE" branch ──
  const tmpBad = join(tmpdir(), `kf-bad-${Date.now()}.json`);
  // Include a P=0.85 boundary cell with n=150 → maxObs filter (L166) must INCLUDE it (kills [<=→<])
  const badSurf = [0, 1, 2, 3].map((o) => ({ offset: o, size: 1, horizonSec: 5, regime: 'low',
    pFill: 0.3 + o * 0.05, n: 100 }));
  badSurf.push({ offset: 4, size: 1, horizonSec: 5, regime: 'low', pFill: 0.85, n: 150 }); // boundary P==0.85
  writeFileSync(tmpBad, JSON.stringify({ span: { durationMs: 230 * 3600000 }, samples: 1000, surface: badSurf }));
  const cliBad = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', tmpBad, '--mid', '60000'],
    { encoding: 'utf8', timeout: 10000 });
  try { unlinkSync(tmpBad); } catch { /* best-effort */ }
  assert(cliBad.status === 0, `--run bad-kappa exits 0 (got ${cliBad.status})`);
  assert(/NO USABLE kappa/.test(cliBad.stdout), '--run bad-kappa → "NO USABLE kappa" branch');
  assert(/non-positive/.test(cliBad.stdout), '--run bad-kappa → "non-positive" slope message');
  // span=230h → PASS on data-sufficiency span check (kills [&&→||] on L169)
  assert(/\[PASS\] span >= 230h/.test(cliBad.stdout), '--run span=230h → PASS on span bar');
  // n=150 cell with P==0.85 must count toward maxObs (kills [<=→<] on L166: mutant <0.85 would exclude it)
  assert(/max 150/.test(cliBad.stdout), '--run P=0.85 n=150 cell → max 150 in obs bar (boundary included)');

  // ── feasibility with mid in (0,1]: guard mid>0 (not mid>1) ──
  // mid=0.5 is a valid non-zero price; mid>1 mutant would null kappaBps incorrectly.
  const fitMid1 = fitKappa([{ offset: 0, horizonSec: 5, regime: 'x', pFill: 0.3, n: 50 },
    { offset: 1, horizonSec: 5, regime: 'x', pFill: 0.2, n: 50 }],
    { tickSize: 0.1, mid: 0.5 });
  assert(fitMid1.pooled && fitMid1.pooled.kappaBps !== null && fin(fitMid1.pooled.kappaBps),
    `fitKappa mid=0.5 → kappaBps computed (got ${fitMid1.pooled?.kappaBps})`);
  // feasibility with mid=0.5 → pFillAtDstar computed (kills [>→>=] on L104)
  const feasMid1 = feasibility(0.01, 0.001, Math.log(0.5), { mid: 0.5, horizonSec: 5 });
  assert(feasMid1 && feasMid1.pFillAtDstar !== null && feasMid1.pFillAtDstar > 0,
    `feasibility mid=0.5 → pFillAtDstar computed (got ${feasMid1?.pFillAtDstar})`);
  // feasibility with mid=0 → pFillAtDstar null (guard mid>0; kills [>→>=] on L104)
  const feasMid0 = feasibility(0.01, 0.001, Math.log(0.5), { mid: 0, horizonSec: 5 });
  assert(feasMid0 && feasMid0.pFillAtDstar === null,
    `feasibility mid=0 → pFillAtDstar null (degenerate guard, got ${feasMid0?.pFillAtDstar})`);

  // ── --run small-kappa (0<kappaBps<=1): must show FEASIBILITY not "NO USABLE" ──
  // Kills [0→1] on L150: kappaBps<=1 mutant would wrongly enter "NO USABLE" branch.
  const tmpSmallK = join(tmpdir(), `kf-small-${Date.now()}.json`);
  const smallKSurf = [0, 1, 2, 3].map((o) => ({ offset: o, size: 1, horizonSec: 5, regime: 'x',
    pFill: 0.4 - o * 0.001, n: 100 }));
  writeFileSync(tmpSmallK, JSON.stringify({ span: { durationMs: 3600000 }, samples: 500, surface: smallKSurf }));
  const cliSmallK = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', tmpSmallK, '--mid', '60000'],
    { encoding: 'utf8', timeout: 10000 });
  try { unlinkSync(tmpSmallK); } catch { /* best-effort */ }
  assert(cliSmallK.status === 0, `--run small-kappa exits 0 (got ${cliSmallK.status})`);
  assert(/breakeven half-spread/.test(cliSmallK.stdout), '--run small-kappa shows feasibility (kappaBps in (0,1])');
  assert(!/NO USABLE kappa/.test(cliSmallK.stdout), '--run small-kappa does NOT trigger "NO USABLE" (positive kappa)');

  // ── --run null-pooled (single cell): "(no pooled kappa" branch ──
  // Kills [&&→||] on L150:9 mutant (f || (...) would crash on null f.kappaBps).
  const tmpSingle = join(tmpdir(), `kf-single-${Date.now()}.json`);
  writeFileSync(tmpSingle, JSON.stringify({ span: { durationMs: 3600000 }, samples: 50,
    surface: [{ offset: 0, horizonSec: 5, regime: 'x', pFill: 0.3, n: 100 }] }));
  const cliSingle = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', tmpSingle, '--mid', '60000'],
    { encoding: 'utf8', timeout: 10000 });
  try { unlinkSync(tmpSingle); } catch { /* best-effort */ }
  assert(cliSingle.status === 0, `--run single-cell exits 0 (got ${cliSingle.status})`);
  assert(/no pooled kappa/.test(cliSingle.stdout), '--run single-cell → "(no pooled kappa" branch');
  assert(!/NO USABLE kappa/.test(cliSingle.stdout), '--run single-cell does NOT enter "NO USABLE" (f is null)');

  console.log(`kappa-fit --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
