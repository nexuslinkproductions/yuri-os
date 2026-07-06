#!/usr/bin/env node
// @capability: overlay-edge-validate
// @serves: overlay source validation | do the advisory overlays predict returns | funding carry basis sentiment cross-asset predictive | validate before wiring overlays to sizer | multi-source sizer gate
// @does: The VALIDATE-FIRST gate for wiring advisory overlay sources (funding-carry / perp-basis / carry-vol / cross-asset lead-lag / social sentiment) into the crypto position sizer. Reuses trade-edge-audit (recallFactors + factorEdgeStats) to pair every overlay forecast's directional call with the SAME-market realized forward return, then applies the honest multiple-testing penalty (deflated Sharpe, nTrials = fleet × rungs). A family VALIDATES iff t>2 AND n>=30 AND deflated-Sharpe survives — only validated families are candidates to wire into the sizer (orchestrator:904). OfI (order-flow) is out of scope here (needs real-tape R², not the forecast ledger).
// @use: run `node overlay-edge-validate.mjs` (or --ledger <path>) to score the LIVE forecast ledger and print the per-family verdict. Re-run as the daemon accrues overlay data (passive, cheap). DISARMED measurement only — changes what we KNOW, never what the system DOES (Class-A). Output is advisory_until_locally_verified.
// @exports: validateOverlays, OVERLAY_FAMILIES
//
// CONSTRAINTS: pure read of the forecast ledger (INV-1 — no order path), no key reads (INV-2),
// deterministic + offline-testable (INV-7). Capability-first: wraps trade-edge-audit, re-implements nothing.

import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recallFactors, factorEdgeStats } from './trade-edge-audit.mjs';
import { deflatedSharpe } from './factor-evaluator.mjs';
import { RUNGS } from './horizon-ladder.mjs';

// The 5 advisory overlay families persisted to the forecast ledger (orchestrator overlaySignals →
// recordForecasts). OFI is NOT here — it feeds λ-calc only, needs real-tape R² validation separately.
export const OVERLAY_FAMILIES = ['perp-funding-carry', 'perp-basis', 'carry-vol', 'xasset-lead', 'social-sentiment'];
const OVERLAY_RE = /^(perp-funding-carry|perp-basis|carry-vol|xasset-lead|social-sentiment)(?:-.*)?$/;
const FAMILY_OF = (id) => { const m = OVERLAY_RE.exec(id || ''); return m ? m[1] : null; };

/**
 * validateOverlays({ ledgerPath, minN }) → { recall, nTrials, families: [{family,bestHorizon,n,...,validated}] }
 * Scores every overlay family against realized forward returns across all rungs; keeps each family's
 * STRONGEST |tStat| horizon. validated = tStat>2 AND n>=minN AND deflated-Sharpe passes.
 */
export function validateOverlays({ ledgerPath, minN = 30 } = {}) {
  const recall = recallFactors(ledgerPath);
  const nTrials = Math.max(1, recall.factorIds.length * RUNGS.length); // honest multiple-testing penalty
  const all = {}; // family -> rows across ALL rungs (so the verdict isn't dominated by a tiny-n high-t horizon)
  for (const rung of RUNGS) {
    const stats = factorEdgeStats(recall, { horizonS: rung.horizonS, strideS: rung.strideS });
    for (const [id, s] of Object.entries(stats)) {
      const family = FAMILY_OF(id);
      if (!family) continue;
      let dsrPass = false;
      try { dsrPass = deflatedSharpe(s.sharpe, { nTrials, T: s.n }).passes; } catch { /* degenerate → no pass */ }
      const row = { family, factorId: id, horizon: rung.label, n: s.n, meanBps: +(s.mean * 1e4).toFixed(1),
        sharpe: +s.sharpe.toFixed(2), tStat: +s.tStat.toFixed(2), pValue: +s.pValue.toFixed(3),
        hitRate: +(s.hitRate * 100).toFixed(1), dsrPass };
      (all[family] ||= []).push(row);
    }
  }
  const families = OVERLAY_FAMILIES.map((f) => {
    const rows = all[f] || [];
    if (!rows.length) return { family: f, validated: false, verdict: 'NO_DATA' };
    // Only horizons with enough data count toward validation; report the strongest among those, else the
    // most-data horizon (to show why it's insufficient — never let a tiny-n high-t horizon misrepresent it).
    const qualifying = rows.filter((r) => r.n >= minN);
    const pick = qualifying.length
      ? qualifying.reduce((a, r) => Math.abs(r.tStat) > Math.abs(a.tStat) ? r : a, qualifying[0])
      : rows.reduce((a, r) => r.n > a.n ? r : a, rows[0]);
    const validated = qualifying.length > 0 && pick.tStat > 2 && pick.dsrPass;
    return { ...pick, validated, verdict: qualifying.length === 0 ? 'INSUFFICIENT_N' : validated ? 'VALIDATED' : 'NOT_PREDICTIVE' };
  });
  return { recall: { rows: recall.rows.length, factors: recall.factorIds.length, markets: recall.markets.length }, nTrials, families };
}

function printReport(res) {
  console.log(`recall: ${res.recall.rows} rows, ${res.recall.factors} factors, ${res.recall.markets} markets | nTrials(fleet×rungs)=${res.nTrials}\n`);
  console.log('FAMILY (best horizon)        n     mean    Sharpe  t      p      hit%  DSR-pass  VERDICT');
  console.log('-'.repeat(110));
  for (const r of res.families) {
    if (r.verdict === 'NO_DATA') { console.log(`${r.family.padEnd(28)} — NO DATA`); continue; }
    console.log(`${r.family.padEnd(28)} ${String(r.horizon).padEnd(6)} n=${String(r.n).padEnd(5)} ${String(r.meanBps).padEnd(7)} ${String(r.sharpe).padEnd(7)} ${String(r.tStat).padEnd(6)} ${String(r.pValue).padEnd(6)} ${String(r.hitRate).padEnd(5)} ${String(r.dsrPass).padEnd(9)} ${r.validated ? '✓ VALIDATED' : '✗ ' + r.verdict}`);
  }
  console.log('-'.repeat(110));
  const v = res.families.filter((f) => f.validated).length;
  console.log(`\nVALIDATE-FIRST VERDICT: ${v}/${res.families.length} overlay families survive (t>2, n>=30, deflated-Sharpe). ` +
    (v === 0 ? '→ none validate → do NOT wire (consistent with the honest no-edge verdict). Re-run as overlays accrue.' : `→ wire only: ${res.families.filter((f) => f.validated).map((f) => f.family).join(', ')}.`));
}

const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && (process.argv.includes('--test'))) {
  // Synthetic ledger: xasset-lead predictive (consistent +edge), social random, funding thin.
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  const dir = mkdtempSync(join(tmpdir(), 'ov-val-'));
  const ledger = join(dir, 'f.jsonl');
  const lines = [];
  // Deterministic LCG pseudo-noise (INV-7 — test must be reproducible, no Math.random).
  let _s = 12345; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
  // xasset-lead (BTC-USD): dir=1 predicts a consistent +drift WITH realistic noise → should VALIDATE.
  // 120 rows at 900s spacing = 30h span → the lowest-stride rung keeps n>=30 after non-overlapping filter.
  let ts = 1700000000, price = 100;
  for (let i = 0; i < 120; i++) { lines.push(JSON.stringify({ factorId: 'xasset-lead-BTC-USD', market: 'BTC-USD', dir: 1, ts, price })); price *= (1 + 0.003 + (rnd() - 0.5) * 0.002); ts += 900; }
  // social-sentiment (ETH-USD): random dir, decorrelated noisy random-walk → should NOT validate.
  let p2 = 100, t2 = 1700000000;
  for (let i = 0; i < 120; i++) { lines.push(JSON.stringify({ factorId: 'social-sentiment', market: 'ETH-USD', dir: rnd() > 0.5 ? 1 : -1, ts: t2, price: p2 })); p2 *= (1 + (rnd() - 0.5) * 0.004); t2 += 900; }
  writeFileSync(ledger, lines.join('\n'));
  const res = validateOverlays({ ledgerPath: ledger, minN: 30 });
  const xa = res.families.find((f) => f.family === 'xasset-lead');
  const so = res.families.find((f) => f.family === 'social-sentiment');
  ok(xa && xa.validated === true, `xasset-lead predictive synthetic → validated (got ${xa?.verdict}, t=${xa?.tStat})`);
  ok(so && so.validated === false, `social random synthetic → not validated (got ${so?.verdict})`);
  ok(res.nTrials > 0, 'nTrials computed');
  console.log(`overlay-edge-validate --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
} else if (_main) {
  const li = process.argv.indexOf('--ledger');
  const ledgerPath = li >= 0 && process.argv[li + 1]
    ? process.argv[li + 1]
    : join(process.cwd(), '_SYSTEM/state/strategy-forecasts.jsonl');
  if (!existsSync(ledgerPath)) { console.error(`No ledger at ${ledgerPath}`); process.exit(1); }
  printReport(validateOverlays({ ledgerPath }));
}
