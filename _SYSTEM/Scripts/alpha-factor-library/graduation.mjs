#!/usr/bin/env node
// @capability: graduation
// @serves: graduation protocol | reliability rung | R0 R1 R2 R3 ladder | real money gate | computed reliability verdict
// @does: AFL reliability verdict — computes the R0→R1→R2(real-money)→R3 graduation ladder per factor via deterministic, fail-closed gates; grades portfolios; assembles full graduation reports from store+ledger or pre-computed stats.
// @use: reach for this to gate real-money promotion (R2 requires computed-true math), rank factors by rung, or build a portfolio graduation report. gradeFactor is pure; assembleGraduation is the full assembly path.
// @exports: gradeFactor, gradePortfolio, assembleGraduation, GATES
/**
 * graduation.mjs — Alpha Factor Library: R0→R3 reliability ladder.
 *
 * The SPINE Marcel + his partner fund against. Nothing reaches R2 (real money)
 * without the math being computed-true. Every gate is fail-CLOSED: a missing,
 * undefined, null, or NaN field is treated as NOT meeting the gate, never as
 * passing by default.
 *
 * Ladder (sequential — must pass ALL lower rungs to reach a higher one):
 *
 *   R0 Shadow  ──► R1 Paper  : dataQuality >= 0.99 AND n >= minTRL (default 30)
 *   R1 Paper   ──► R2 Micro  : dsr > 1.5 AND fdrPass AND brier < 0.18
 *                              AND n >= 200 AND cusumBreak === false
 *   R2 Micro   ──► R3 Scaled : mddBps < 1000 AND energyDeltaU > 0
 *                              AND signAgreement === true
 *
 * (R2 is the real-money threshold — the guard that actually matters.)
 *
 * Related:
 *   - factor-evaluator.mjs  (deflatedSharpe / benjaminiHochberg / factorPromotionGate)
 *   - alpha-factor-store.mjs (getPerformance / listFactors / getFactor)
 *   - factor-scorer.mjs     (ranking instrument, NOT a gate)
 *   - AFL_LEDGER            (afl-prediction-ledger.jsonl, not the homeostat ledger)
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// GATES — single source of truth for every threshold.
// ---------------------------------------------------------------------------

/**
 * All ladder thresholds in one place. Import this const to avoid magic numbers
 * anywhere else in the AFL codebase.
 */
export const GATES = Object.freeze({
  // R0 → R1
  R0_TO_R1: Object.freeze({
    dataQuality: 0.99,   // >= 0.99
    minTRL: 30,          // n >= 30 paper trades
  }),
  // R1 → R2  (REAL MONEY — do not loosen without adversarial review)
  R1_TO_R2: Object.freeze({
    dsr: 1.5,            // dsr > 1.5  (deflated sharpe ratio, NOT the raw sharpe)
    fdrPass: true,       // must be boolean true (BH-FDR q<0.01 pass)
    brier: 0.18,         // brier < 0.18
    n: 200,              // n >= 200 observations
    cusumBreak: false,   // must be exactly false (no unhandled structural break)
  }),
  // R2 → R3
  R2_TO_R3: Object.freeze({
    mddBps: 1000,        // mddBps < 1000 (max drawdown < 10% over 60d)
    energyDeltaU: 0,     // energyDeltaU > 0
    signAgreement: true, // must be exactly true
  }),
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True iff x is a finite number (not NaN, not ±Infinity, not null/undefined). */
const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Produce a gate failure descriptor: { gate, need, have }.
 * `have` is the actual value (or the string 'missing' if absent/invalid).
 */
function failDesc(gate, need, have) {
  const haveStr = (have === null || have === undefined || (typeof have === 'number' && !Number.isFinite(have)))
    ? 'missing'
    : String(have);
  return { gate, need, have: haveStr };
}

// ---------------------------------------------------------------------------
// gradeFactor — pure, deterministic, fail-closed.
// ---------------------------------------------------------------------------

/**
 * Grade a single factor against the R0→R3 ladder.
 *
 * @param {object} stats  Pre-computed factor stats:
 *   {
 *     factorId     : string,
 *     dataQuality  : number,   // in [0,1]; fraction of valid records
 *     n            : number,   // total observation count
 *     dsr          : number,   // deflated sharpe ratio (from factor-evaluator)
 *     fdrPass      : boolean,  // BH-FDR at q<0.01
 *     brier        : number,   // Brier score; lower is better
 *     mddBps       : number,   // max drawdown in basis points over 60d
 *     energyDeltaU : number,   // energy-gate ΔU (positive = progress)
 *     signAgreement: boolean,  // forecast sign agrees with realized
 *     cusumBreak   : boolean,  // true = unhandled structural break detected
 *   }
 *
 * @returns {{
 *   factorId : string,
 *   rung     : 'R0'|'R1'|'R2'|'R3',
 *   met      : string[],         // names of gates that passed
 *   unmet    : Array<{gate:string, need:string, have:string}>,  // first blocking rung's failures
 * }}
 */
export function gradeFactor(stats) {
  // Defensive: accept any object; treat non-object as empty.
  const s = (stats && typeof stats === 'object') ? stats : {};
  const factorId = String(s.factorId ?? 'unknown');

  const met = [];
  const unmet = [];

  // ---- R0 → R1 --------------------------------------------------------
  const g01 = GATES.R0_TO_R1;

  const dqOk = isFiniteNum(s.dataQuality) && s.dataQuality >= g01.dataQuality;
  const nOk  = isFiniteNum(s.n) && s.n >= g01.minTRL;

  if (!dqOk) unmet.push(failDesc('dataQuality', `>=${g01.dataQuality}`, s.dataQuality));
  else        met.push('dataQuality');

  if (!nOk)  unmet.push(failDesc('n', `>=${g01.minTRL}`, s.n));
  else        met.push('n');

  if (unmet.length > 0) {
    return { factorId, rung: 'R0', met, unmet };
  }

  // ---- R1 → R2 --------------------------------------------------------
  const g12 = GATES.R1_TO_R2;

  const dsrOk    = isFiniteNum(s.dsr) && s.dsr > g12.dsr;
  const fdrOk    = s.fdrPass === true;
  const brierOk  = isFiniteNum(s.brier) && s.brier < g12.brier;
  const n200Ok   = isFiniteNum(s.n) && s.n >= g12.n;
  // cusumBreak must be EXACTLY false — anything else (true, null, undefined, 'unknown') fails.
  const cusumOk  = s.cusumBreak === false;

  if (!dsrOk)   unmet.push(failDesc('dsr',          `>${g12.dsr}`,              s.dsr));
  else           met.push('dsr');

  if (!fdrOk)   unmet.push(failDesc('fdrPass',      'true',                     s.fdrPass));
  else           met.push('fdrPass');

  if (!brierOk) unmet.push(failDesc('brier',        `<${g12.brier}`,            s.brier));
  else           met.push('brier');

  if (!n200Ok)  unmet.push(failDesc('n',            `>=${g12.n}`,               s.n));
  else           met.push('n_200');

  if (!cusumOk) unmet.push(failDesc('cusumBreak',   'false (no struct break)',   s.cusumBreak));
  else           met.push('cusumBreak');

  if (unmet.length > 0) {
    return { factorId, rung: 'R1', met, unmet };
  }

  // ---- R2 → R3 --------------------------------------------------------
  const g23 = GATES.R2_TO_R3;

  const mddOk   = isFiniteNum(s.mddBps) && s.mddBps < g23.mddBps;
  const energyOk = isFiniteNum(s.energyDeltaU) && s.energyDeltaU > g23.energyDeltaU;
  // signAgreement must be EXACTLY true.
  const signOk  = s.signAgreement === true;

  if (!mddOk)    unmet.push(failDesc('mddBps',        `<${g23.mddBps}`,         s.mddBps));
  else            met.push('mddBps');

  if (!energyOk) unmet.push(failDesc('energyDeltaU', `>${g23.energyDeltaU}`,    s.energyDeltaU));
  else            met.push('energyDeltaU');

  if (!signOk)   unmet.push(failDesc('signAgreement', 'true',                    s.signAgreement));
  else            met.push('signAgreement');

  if (unmet.length > 0) {
    return { factorId, rung: 'R2', met, unmet };
  }

  // All gates cleared.
  return { factorId, rung: 'R3', met, unmet: [] };
}

// ---------------------------------------------------------------------------
// gradePortfolio — aggregate factor grades into a portfolio verdict.
// ---------------------------------------------------------------------------

/**
 * Grade a portfolio from an array of individual factor grades.
 *
 * Portfolio rung rule (conservative):
 *   The portfolio rung = the highest rung where AT LEAST 1 factor sits.
 *   Rationale: if even one factor is at R2, the portfolio has real-money
 *   exposure. This is the worst-rung-that-matters framing, not average.
 *   Every factor below R3 contributes a blocker entry so the operator sees
 *   exactly what's holding back each factor from the next rung.
 *
 * @param {Array<ReturnType<gradeFactor>>} factorGrades
 * @returns {{
 *   rung         : 'R0'|'R1'|'R2'|'R3',
 *   byRung       : { R0: number, R1: number, R2: number, R3: number },
 *   factorCount  : number,
 *   blockers     : Array<{ factorId: string, nextRung: string, unmet: object[] }>,
 * }}
 */
export function gradePortfolio(factorGrades) {
  const grades = Array.isArray(factorGrades) ? factorGrades : [];

  const byRung = { R0: 0, R1: 0, R2: 0, R3: 0 };
  const blockers = [];

  for (const g of grades) {
    if (!g || typeof g !== 'object') continue;
    const rung = (['R0', 'R1', 'R2', 'R3'].includes(g.rung)) ? g.rung : 'R0';
    byRung[rung] += 1;

    // A factor below R3 has blockers for its NEXT rung transition.
    if (rung !== 'R3' && Array.isArray(g.unmet) && g.unmet.length > 0) {
      const NEXT = { R0: 'R1', R1: 'R2', R2: 'R3' };
      blockers.push({
        factorId: g.factorId ?? 'unknown',
        nextRung: NEXT[rung] ?? 'R1',
        unmet: g.unmet,
      });
    }
  }

  // Portfolio rung = highest rung with any factor; empty portfolio = R0.
  let rung = 'R0';
  if (byRung.R3 > 0) rung = 'R3';
  else if (byRung.R2 > 0) rung = 'R2';
  else if (byRung.R1 > 0) rung = 'R1';

  return {
    rung,
    byRung,
    factorCount: grades.length,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// assembleGraduation — full report from stats or store+ledger.
// ---------------------------------------------------------------------------

/**
 * Build a full graduation report.
 *
 * Accepts pre-computed stats (fastest, standalone) OR derives them from
 * store.getPerformance + AFL_LEDGER rows.
 *
 * NEVER throws — all IO errors are caught and surfaced in the result.
 *
 * @param {{
 *   aflLedgerPath? : string,          // override the default AFL_LEDGER path
 *   store?         : object,          // if provided, must expose getPerformance(factorId)
 *   paper?         : object,          // if provided, must expose getFactors()
 *   factorStats?   : object[],        // pre-computed stats array — preferred if present
 * }} opts
 *
 * @returns {{
 *   portfolio    : ReturnType<gradePortfolio>,
 *   factors      : Array<ReturnType<gradeFactor>>,
 *   generatedAt  : null,   // caller stamps — no Date.now() in pure paths
 *   errors       : string[],
 * }}
 */
export async function assembleGraduation({
  aflLedgerPath,
  store,
  paper,
  factorStats,
} = {}) {
  const errors = [];
  let statsArr = [];

  // Path 1: pre-computed stats supplied by the caller — cleanest, no IO needed.
  // An explicitly passed empty array [] means "grade nothing" — do NOT fall through
  // to the store. Only fall through when factorStats is null/undefined (not passed).
  if (Array.isArray(factorStats)) {
    statsArr = factorStats;
  } else {
    // Path 2: derive from store.getPerformance per factor.
    // We look for a store with listFactors + getPerformance.
    try {
      // Lazy-import the real store if no store injection provided.
      const storeApi = store ?? (await import('./alpha-factor-store.mjs').catch((e) => {
        errors.push(`store import failed: ${e.message}`);
        return null;
      }));

      if (storeApi) {
        // Get factor list — try listFactors (store) or getFactors (paper).
        let factors = [];
        try {
          if (typeof storeApi.listFactors === 'function') {
            factors = storeApi.listFactors();
          } else if (typeof paper?.getFactors === 'function') {
            factors = paper.getFactors();
          }
        } catch (e) {
          errors.push(`listFactors failed: ${e.message}`);
        }

        for (const f of factors) {
          const fid = f.id ?? f.factorId ?? 'unknown';
          try {
            // Gather performance metrics from the log rows.
            const perf = typeof storeApi.getPerformance === 'function'
              ? storeApi.getPerformance(fid)
              : [];

            // Convert log rows to the stats shape. Last recorded value wins per metric.
            const metricMap = {};
            for (const row of perf) {
              if (row.metric) metricMap[row.metric] = row.value;
            }

            statsArr.push({
              factorId: fid,
              dataQuality:   metricMap.dataQuality    ?? null,
              n:             metricMap.n              ?? null,
              dsr:           metricMap.dsr            ?? null,
              fdrPass:       metricMap.fdrPass === 1  ? true
                           : metricMap.fdrPass === 0  ? false
                           : metricMap.fdrPass        ?? null,
              brier:         metricMap.brier          ?? null,
              mddBps:        metricMap.mddBps         ?? null,
              energyDeltaU:  metricMap.energyDeltaU   ?? null,
              signAgreement: metricMap.signAgreement === 1 ? true
                           : metricMap.signAgreement === 0 ? false
                           : metricMap.signAgreement ?? null,
              cusumBreak:    metricMap.cusumBreak === 1 ? true
                           : metricMap.cusumBreak === 0 ? false
                           : metricMap.cusumBreak ?? null,
            });
          } catch (e) {
            errors.push(`getPerformance(${fid}) failed: ${e.message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`assembleGraduation store path failed: ${e.message}`);
    }
  }

  // Grade every factor.
  const factorGrades = [];
  for (const s of statsArr) {
    try {
      factorGrades.push(gradeFactor(s));
    } catch (e) {
      errors.push(`gradeFactor(${s?.factorId ?? '?'}) threw: ${e.message}`);
    }
  }

  const portfolio = gradePortfolio(factorGrades);

  return {
    portfolio,
    factors: factorGrades,
    generatedAt: null, // caller stamps — no Date.now() in pure paths
    errors,
  };
}

// ---------------------------------------------------------------------------
// Main-guarded --test suite
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--test')) {
  let pass = 0;
  let fail = 0;

  function check(label, got, expected) {
    const ok = JSON.stringify(got) === JSON.stringify(expected)
            || (typeof expected === 'function' && expected(got));
    if (ok) {
      pass++;
      // uncomment for verbose:  console.log(`  PASS  ${label}`);
    } else {
      fail++;
      console.error(`  FAIL  ${label}`);
      console.error(`        got:      ${JSON.stringify(got)}`);
      if (typeof expected !== 'function') {
        console.error(`        expected: ${JSON.stringify(expected)}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // 1. GATES const sanity
  // -----------------------------------------------------------------------
  check('GATES.R0_TO_R1.dataQuality is 0.99',  GATES.R0_TO_R1.dataQuality, 0.99);
  check('GATES.R1_TO_R2.dsr is 1.5',           GATES.R1_TO_R2.dsr, 1.5);
  check('GATES.R1_TO_R2.brier is 0.18',        GATES.R1_TO_R2.brier, 0.18);
  check('GATES.R1_TO_R2.n is 200',             GATES.R1_TO_R2.n, 200);
  check('GATES.R2_TO_R3.mddBps is 1000',       GATES.R2_TO_R3.mddBps, 1000);

  // -----------------------------------------------------------------------
  // 2. gradeFactor — R0 (missing dataQuality)
  // -----------------------------------------------------------------------
  {
    const g = gradeFactor({ factorId: 'f-missing-dq', n: 50 });
    check('missing dataQuality → R0', g.rung, 'R0');
    check('missing dataQuality in unmet', g.unmet.some(u => u.gate === 'dataQuality'), true);
    check('missing dataQuality have=missing', g.unmet.find(u => u.gate === 'dataQuality')?.have, 'missing');
  }

  // -----------------------------------------------------------------------
  // 3. gradeFactor — R0 (n too low, dataQuality ok)
  // -----------------------------------------------------------------------
  {
    const g = gradeFactor({ factorId: 'f-low-n', dataQuality: 0.99, n: 10 });
    check('low n → R0', g.rung, 'R0');
    check('low n gate in unmet', g.unmet.some(u => u.gate === 'n'), true);
    check('low n have=10', g.unmet.find(u => u.gate === 'n')?.have, '10');
  }

  // -----------------------------------------------------------------------
  // 4. gradeFactor — exactly at R0→R1 boundary (just-pass)
  // -----------------------------------------------------------------------
  {
    const g = gradeFactor({ factorId: 'f-r0-boundary', dataQuality: 0.99, n: 30 });
    // At boundary it passes R1, but will fail R2 gates → rung R1
    check('R0→R1 boundary just-passes → R1', g.rung, 'R1');
  }

  // -----------------------------------------------------------------------
  // 5. gradeFactor — all R1→R2 gates pass, R2→R3 gates missing → stuck at R2
  // -----------------------------------------------------------------------
  {
    // n=250 clears the R1→R2 n>=200 gate; dsr/fdrPass/brier/cusumBreak all pass.
    // R2→R3 gates (mddBps, energyDeltaU, signAgreement) are absent → fail-closed → R2.
    const g = gradeFactor({
      factorId: 'f-r2-stuck',
      dataQuality: 0.999,
      n: 250,
      dsr: 1.6,
      fdrPass: true,
      brier: 0.15,
      cusumBreak: false,
      // R2→R3 missing: mddBps, energyDeltaU, signAgreement absent
    });
    check('[5] all R1→R2 pass, R2→R3 missing → R2', g.rung, 'R2');
    check('[5] mddBps in unmet (R2→R3 blocker)', g.unmet.some(u => u.gate === 'mddBps'), true);
  }

  // -----------------------------------------------------------------------
  // 6. gradeFactor — FULL R2 qualifying factor (all gates true)
  // -----------------------------------------------------------------------
  {
    const r2stats = {
      factorId: 'f-r2-full',
      dataQuality: 0.999,
      n: 300,
      dsr: 2.1,
      fdrPass: true,
      brier: 0.10,
      cusumBreak: false,
      // R2→R3 intentionally failing
      mddBps: 1200,       // fails: >= 1000
      energyDeltaU: 0.5,
      signAgreement: true,
    };
    const g = gradeFactor(r2stats);
    check('[6] mddBps=1200 → blocked at R2', g.rung, 'R2');
    check('[6] mddBps gate in unmet', g.unmet.some(u => u.gate === 'mddBps'), true);
    check('[6] mddBps have=1200', g.unmet.find(u => u.gate === 'mddBps')?.have, '1200');
  }

  // -----------------------------------------------------------------------
  // 7. gradeFactor — brier boundary (just-fail at exactly 0.18)
  // -----------------------------------------------------------------------
  {
    // brier < 0.18 — exactly 0.18 must FAIL (strict less-than)
    const g = gradeFactor({
      factorId: 'f-brier-boundary',
      dataQuality: 0.999,
      n: 250,
      dsr: 1.6,
      fdrPass: true,
      brier: 0.18,        // exactly at threshold → fail (strict <)
      cusumBreak: false,
    });
    check('[7] brier=0.18 fails (strict <)', g.rung, 'R1');
    check('[7] brier gate in unmet', g.unmet.some(u => u.gate === 'brier'), true);
  }

  // -----------------------------------------------------------------------
  // 8. gradeFactor — dsr boundary (just-pass at 1.5001, just-fail at 1.5)
  // -----------------------------------------------------------------------
  {
    // dsr > 1.5 — exactly 1.5 must fail (strict greater-than)
    const gFail = gradeFactor({
      factorId: 'f-dsr-boundary-fail',
      dataQuality: 0.999, n: 250, dsr: 1.5,
      fdrPass: true, brier: 0.15, cusumBreak: false,
    });
    check('[8a] dsr=1.5 fails (strict >)', gFail.rung, 'R1');

    const gPass = gradeFactor({
      factorId: 'f-dsr-boundary-pass',
      dataQuality: 0.999, n: 250, dsr: 1.5001,
      fdrPass: true, brier: 0.10, cusumBreak: false,
      // R2→R3 absent → stuck R2
    });
    check('[8b] dsr=1.5001 passes dsr gate → stuck at R2', gPass.rung, 'R2');
  }

  // -----------------------------------------------------------------------
  // 9. gradeFactor — cusumBreak must be EXACTLY false
  // -----------------------------------------------------------------------
  {
    // null, undefined, true all fail
    for (const val of [null, undefined, true, 0, 'false']) {
      const g = gradeFactor({
        factorId: `f-cusum-${val}`,
        dataQuality: 0.999, n: 250,
        dsr: 2.0, fdrPass: true, brier: 0.10,
        cusumBreak: val,
      });
      check(`[9] cusumBreak=${JSON.stringify(val)} fails gate`, g.rung, 'R1');
    }
  }

  // -----------------------------------------------------------------------
  // 10. gradeFactor — fdrPass must be EXACTLY true
  // -----------------------------------------------------------------------
  {
    for (const val of [null, undefined, false, 1, 'true']) {
      const g = gradeFactor({
        factorId: `f-fdr-${val}`,
        dataQuality: 0.999, n: 250,
        dsr: 2.0, fdrPass: val, brier: 0.10,
        cusumBreak: false,
      });
      check(`[10] fdrPass=${JSON.stringify(val)} fails gate`, g.rung, 'R1');
    }
  }

  // -----------------------------------------------------------------------
  // 11. gradeFactor — R3 qualifying factor (all gates pass)
  // -----------------------------------------------------------------------
  {
    const r3stats = {
      factorId: 'f-r3',
      dataQuality: 0.9999,
      n: 500,
      dsr: 2.8,
      fdrPass: true,
      brier: 0.09,
      cusumBreak: false,
      mddBps: 800,
      energyDeltaU: 1.2,
      signAgreement: true,
    };
    const g = gradeFactor(r3stats);
    check('[11] all R3 gates pass → R3', g.rung, 'R3');
    check('[11] unmet is empty', g.unmet.length, 0);
    // met entries: dataQuality, n (R0→R1) + dsr, fdrPass, brier, n_200, cusumBreak (R1→R2)
    //            + mddBps, energyDeltaU, signAgreement (R2→R3) = 10 total
    check('[11] met has all 10 gate entries', g.met.length, 10);
  }

  // -----------------------------------------------------------------------
  // 12. gradeFactor — absent fields fail gracefully (no throw)
  // -----------------------------------------------------------------------
  {
    let threw = false;
    try {
      gradeFactor(null);
      gradeFactor(undefined);
      gradeFactor({});
      gradeFactor({ factorId: 'f-empty' });
    } catch (e) {
      threw = true;
    }
    check('[12] absent/null/empty stats does not throw', threw, false);
    const g = gradeFactor({});
    check('[12] empty stats → R0', g.rung, 'R0');
  }

  // -----------------------------------------------------------------------
  // 13. gradeFactor — NaN values treated as missing (fail-closed)
  // -----------------------------------------------------------------------
  {
    const g = gradeFactor({
      factorId: 'f-nan',
      dataQuality: NaN,
      n: NaN,
    });
    check('[13] NaN dataQuality → R0 fail-closed', g.rung, 'R0');
    check('[13] NaN dataQuality have=missing', g.unmet.find(u => u.gate === 'dataQuality')?.have, 'missing');
  }

  // -----------------------------------------------------------------------
  // 14. gradePortfolio — empty list
  // -----------------------------------------------------------------------
  {
    const p = gradePortfolio([]);
    check('[14] empty portfolio → R0', p.rung, 'R0');
    check('[14] empty factorCount=0', p.factorCount, 0);
    check('[14] byRung all zero', JSON.stringify(p.byRung), JSON.stringify({ R0: 0, R1: 0, R2: 0, R3: 0 }));
    check('[14] no blockers', p.blockers.length, 0);
  }

  // -----------------------------------------------------------------------
  // 15. gradePortfolio — null input (no crash)
  // -----------------------------------------------------------------------
  {
    let threw = false;
    try { gradePortfolio(null); } catch { threw = true; }
    check('[15] gradePortfolio(null) does not throw', threw, false);
  }

  // -----------------------------------------------------------------------
  // 16. gradePortfolio — mixed rungs → correct byRung + blockers
  // -----------------------------------------------------------------------
  {
    const grades = [
      gradeFactor({ factorId: 'fa', dataQuality: 0.98, n: 100 }),            // R0 (dq fail)
      gradeFactor({ factorId: 'fb', dataQuality: 0.999, n: 50 }),             // R1 (n<200 for R2)
      gradeFactor({
        factorId: 'fc',
        dataQuality: 0.999, n: 300,
        dsr: 2.0, fdrPass: true, brier: 0.10, cusumBreak: false,
        mddBps: 1200,  // R2→R3 fails
        energyDeltaU: 1.0, signAgreement: true,
      }),  // R2
      gradeFactor({
        factorId: 'fd',
        dataQuality: 0.9999, n: 500,
        dsr: 2.8, fdrPass: true, brier: 0.09, cusumBreak: false,
        mddBps: 800, energyDeltaU: 1.2, signAgreement: true,
      }),  // R3
    ];
    const p = gradePortfolio(grades);
    check('[16] mixed portfolio rung = R3 (highest with ≥1)', p.rung, 'R3');
    check('[16] byRung.R0=1', p.byRung.R0, 1);
    check('[16] byRung.R1=1', p.byRung.R1, 1);
    check('[16] byRung.R2=1', p.byRung.R2, 1);
    check('[16] byRung.R3=1', p.byRung.R3, 1);
    check('[16] factorCount=4', p.factorCount, 4);
    // Blockers: fa (R0→R1), fb (R1→R2), fc (R2→R3) — fd is R3, no blocker
    check('[16] blockers count=3', p.blockers.length, 3);
    check('[16] fc blocker nextRung=R3', p.blockers.find(b => b.factorId === 'fc')?.nextRung, 'R3');
  }

  // -----------------------------------------------------------------------
  // 17. gradePortfolio — all R0
  // -----------------------------------------------------------------------
  {
    const grades = [
      gradeFactor({ factorId: 'g1' }),
      gradeFactor({ factorId: 'g2', dataQuality: 0.5, n: 5 }),
    ];
    const p = gradePortfolio(grades);
    check('[17] all R0 portfolio → R0', p.rung, 'R0');
    check('[17] byRung.R0=2', p.byRung.R0, 2);
  }

  // -----------------------------------------------------------------------
  // 18. assembleGraduation — from pre-computed factorStats (pure path)
  // -----------------------------------------------------------------------
  {
    const factorStats = [
      {
        factorId: 'as-r3',
        dataQuality: 0.9999, n: 500,
        dsr: 3.0, fdrPass: true, brier: 0.08, cusumBreak: false,
        mddBps: 700, energyDeltaU: 2.0, signAgreement: true,
      },
      {
        factorId: 'as-r0',
        // all missing
      },
    ];
    let result;
    let threw = false;
    try {
      result = await assembleGraduation({ factorStats });
    } catch (e) {
      threw = true;
      console.error('[18] assembleGraduation threw:', e.message);
    }
    check('[18] assembleGraduation does not throw', threw, false);
    check('[18] factors length=2', result?.factors?.length, 2);
    check('[18] as-r3 grades R3', result?.factors?.find(f => f.factorId === 'as-r3')?.rung, 'R3');
    check('[18] as-r0 grades R0', result?.factors?.find(f => f.factorId === 'as-r0')?.rung, 'R0');
    check('[18] portfolio rung=R3', result?.portfolio?.rung, 'R3');
    check('[18] generatedAt=null', result?.generatedAt, null);
  }

  // -----------------------------------------------------------------------
  // 19. assembleGraduation — empty factorStats (no crash, portfolio R0)
  // -----------------------------------------------------------------------
  {
    let result;
    let threw = false;
    try {
      result = await assembleGraduation({ factorStats: [] });
    } catch (e) {
      threw = true;
    }
    check('[19] empty factorStats → no throw', threw, false);
    check('[19] empty factorStats → portfolio R0', result?.portfolio?.rung, 'R0');
    check('[19] empty factorStats → factors=[]', result?.factors?.length, 0);
  }

  // -----------------------------------------------------------------------
  // 20. assembleGraduation — no args (no crash)
  // -----------------------------------------------------------------------
  {
    let threw = false;
    try {
      await assembleGraduation();
    } catch (e) {
      threw = true;
    }
    check('[20] assembleGraduation() no args → no throw', threw, false);
  }

  // -----------------------------------------------------------------------
  // 21. gradeFactor — mddBps boundary (just-pass at 999, just-fail at 1000)
  // -----------------------------------------------------------------------
  {
    const base = {
      factorId: 'f-mdd',
      dataQuality: 0.999, n: 300,
      dsr: 2.0, fdrPass: true, brier: 0.10, cusumBreak: false,
      energyDeltaU: 1.0, signAgreement: true,
    };
    const gFail = gradeFactor({ ...base, mddBps: 1000 }); // exactly 1000 → fail (strict <)
    check('[21a] mddBps=1000 fails (strict <)', gFail.rung, 'R2');

    const gPass = gradeFactor({ ...base, mddBps: 999 });  // 999 → pass
    check('[21b] mddBps=999 passes → R3', gPass.rung, 'R3');
  }

  // -----------------------------------------------------------------------
  // 22. gradeFactor — energyDeltaU boundary (exactly 0 fails, positive passes)
  // -----------------------------------------------------------------------
  {
    const base = {
      factorId: 'f-energy',
      dataQuality: 0.999, n: 300,
      dsr: 2.0, fdrPass: true, brier: 0.10, cusumBreak: false,
      mddBps: 800, signAgreement: true,
    };
    const gFail = gradeFactor({ ...base, energyDeltaU: 0 }); // exactly 0 → fail (strict >)
    check('[22a] energyDeltaU=0 fails (strict >)', gFail.rung, 'R2');

    const gPass = gradeFactor({ ...base, energyDeltaU: 0.001 });
    check('[22b] energyDeltaU=0.001 passes → R3', gPass.rung, 'R3');
  }

  // -----------------------------------------------------------------------
  // 23. gradeFactor — signAgreement must be EXACTLY true
  // -----------------------------------------------------------------------
  {
    const base = {
      factorId: 'f-sign',
      dataQuality: 0.999, n: 300,
      dsr: 2.0, fdrPass: true, brier: 0.10, cusumBreak: false,
      mddBps: 800, energyDeltaU: 1.0,
    };
    for (const val of [null, undefined, false, 1, 'true']) {
      const g = gradeFactor({ ...base, signAgreement: val });
      check(`[23] signAgreement=${JSON.stringify(val)} fails`, g.rung, 'R2');
    }
  }

  // -----------------------------------------------------------------------
  // Print summary
  // -----------------------------------------------------------------------
  const total = pass + fail;
  console.log(`graduation --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}
