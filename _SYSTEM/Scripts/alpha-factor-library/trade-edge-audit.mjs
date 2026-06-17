#!/usr/bin/env node
// @capability: trade-edge-audit
// @serves: factor edge audit | is there real edge | overfit and multiple-testing corrected factor screen | trade brain edge lens | recall every factor and score it
// @does: recalls EVERY factor running from the live forecast ledger and renders the whole pile through the edge arsenal off ONE call — multi-horizon scoring (the ladder) + deflated Sharpe (overfit) + Benjamini-Hochberg FDR (multiple-testing across the fleet) + spread-bounce + maker-fee falsification — then ranks only what survives ALL of it.
// @use: hand a trading peer the EDGE LENS — "does ANY running factor have real, overfit-corrected, multiple-testing-corrected, fee-surviving edge, and at which horizon" — without re-assembling 6 tools by hand.
// @exports: recallFactors, factorEdgeStats, auditEdge, RUNGS
//
// CONSTRAINTS: paper/analysis only (INV-1 — pure reads of the ledger, no order path), no key reads
// (INV-2). Deterministic, offline-testable, fail-soft (a broken sub-tool degrades that section, never
// the whole audit). Capability-first: wraps strategy-weights + horizon-ladder + factor-evaluator +
// spread-correction + maker-fill-sim; it ORCHESTRATES, it does not re-implement their math.

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RUNGS } from './horizon-ladder.mjs';
import { deflatedSharpe, benjaminiHochberg } from './factor-evaluator.mjs';
import { analyze as spreadAnalyze, classifyFamily } from './spread-correction.mjs';
import { analyze as makerAnalyze } from './maker-fill-sim.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Local standard-normal CDF (Abramowitz-Stegun 7.1.26) for the one-sided edge p-value.
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

export { RUNGS };

/**
 * recallFactors(ledgerPath) — THE RECOLLECTION. Reads the live forecast ledger and returns every
 * factor that has fired, plus a per-market price series for forward-return lookup. This is the
 * "recall everything running" layer — the peer never enumerates indicators.
 * @returns {{ rows, series: Map<market,[ts,price][]>, byFactor: Map<factorId,row[]>, factorIds, markets }}
 */
export function recallFactors(ledgerPath) {
  let rows = [];
  try {
    if (!ledgerPath || !existsSync(ledgerPath)) return { rows: [], series: new Map(), byFactor: new Map(), factorIds: [], markets: [] };
    rows = readFileSync(ledgerPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r) => r && r.factorId && isNum(r.ts) && isNum(r.price));
  } catch { return { rows: [], series: new Map(), byFactor: new Map(), factorIds: [], markets: [] }; }

  const series = new Map();
  const byFactor = new Map();
  for (const r of rows) {
    if (!series.has(r.market)) series.set(r.market, []);
    series.get(r.market).push([r.ts, r.price]);
    if (!byFactor.has(r.factorId)) byFactor.set(r.factorId, []);
    byFactor.get(r.factorId).push(r);
  }
  for (const arr of series.values()) arr.sort((a, b) => a[0] - b[0]);
  return {
    rows, series, byFactor,
    factorIds: [...byFactor.keys()],
    markets: [...series.keys()],
  };
}

/**
 * factorEdgeStats(recall, { horizonS, strideS }) — per-factor forward-return SERIES stats at one
 * horizon (the bit scoreForecasts aggregates away): mean, std, Sharpe (per-period mean/std), the
 * one-sided t p-value for positive edge, n (non-overlapping), hitRate. Leak-free: a forecast is paired
 * only with a SAME-market price strictly ≥ ts+horizonS. Non-overlapping by strideS (independent obs).
 * @returns {Object<factorId,{n,mean,std,sharpe,tStat,pValue,hitRate,market}>}
 */
export function factorEdgeStats(recall, { horizonS = 3600, strideS = 0 } = {}) {
  const out = {};
  if (!recall || !recall.byFactor) return out;
  const fwd = (market, ts) => {
    const arr = recall.series.get(market);
    if (!arr) return null;
    for (let i = 0; i < arr.length; i++) { if (arr[i][0] >= ts + horizonS) return arr[i][1]; }
    return null;
  };
  for (const [factorId, rowsRaw] of recall.byFactor) {
    const rows = [...rowsRaw].sort((a, b) => a.ts - b.ts);
    // non-overlapping subsample
    let kept = rows;
    if (isNum(strideS) && strideS > 0) {
      kept = []; let lastTs = -Infinity;
      for (const r of rows) { if (r.ts - lastTs >= strideS) { kept.push(r); lastTs = r.ts; } }
    }
    const rets = [];
    let market = null;
    for (const r of kept) {
      const p1 = fwd(r.market, r.ts);
      if (!isNum(p1) || !isNum(r.price) || r.price <= 0) continue;
      rets.push(r.dir * ((p1 - r.price) / r.price));
      market = r.market;
    }
    const n = rets.length;
    if (n < 2) continue;
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    const variance = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1);
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? mean / std : 0;            // per-period Sharpe
    const tStat = std > 0 ? mean / (std / Math.sqrt(n)) : 0;
    const pValue = 1 - normalCdf(tStat);                // one-sided H1: mean>0
    const hits = rets.filter((r) => r > 0).length;
    out[factorId] = { n, mean, std, sharpe, tStat, pValue, hitRate: hits / n, market };
  }
  return out;
}

/**
 * auditEdge({ ledgerPath, q, rungs, makerSchedule }) — the full edge battery off one call.
 * For EACH rung: per-factor edge stats → deflated Sharpe (overfit, nTrials = fleet size) → BH-FDR
 * across the fleet at that horizon → survivor = DSR-pass AND FDR-rejected AND mean>0 AND not a
 * bid-ask-bounce family. Plus ledger-level spread-bounce + maker-fee falsification. Fail-soft per
 * section. Returns a structured verdict (advisory — confidence-capped below a live run, as always).
 */
export function auditEdge({ ledgerPath, q = 0.1, rungs = RUNGS, makerSchedule = 'real-tier0' } = {}) {
  const recall = recallFactors(ledgerPath);
  const rungOut = {};
  // PASS 1 — score every rung first, so the deflated-Sharpe selection-bias count can be the FULL
  // (factor × rung) hypothesis universe, not just one rung's fleet. A survivor is chosen from ALL the
  // tests this audit ran (each factor screened at up to 6 horizons), so nTrials must reflect that whole
  // search or the DSR bar sits too low (under-penalizes the multiple comparisons) — red-team MED, fixed.
  const rungData = [];
  for (const rung of rungs) {
    try {
      const stats = factorEdgeStats(recall, { horizonS: rung.horizonS, strideS: rung.strideS });
      const ids = Object.keys(stats).filter((id) => isNum(stats[id].n) && stats[id].n >= rung.minN);
      rungData.push({ rung, stats, ids });
    } catch { rungData.push({ rung, stats: {}, ids: [], error: true }); }
  }
  const totalTrials = Math.max(1, rungData.reduce((a, rd) => a + rd.ids.length, 0));
  // PASS 2 — per-rung FDR + cross-rung-deflated Sharpe survivor screen.
  for (const { rung, stats, ids, error } of rungData) {
    if (error) { rungOut[rung.label] = { horizonS: rung.horizonS, evaluated: 0, survivors: [], error: true }; continue; }
    if (!ids.length) { rungOut[rung.label] = { horizonS: rung.horizonS, evaluated: 0, survivors: [] }; continue; }
    const pValues = ids.map((id) => stats[id].pValue);
    const fdr = benjaminiHochberg(pValues, q); // { rejected[], k } — rejected is in INPUT order
    const survivors = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]; const s = stats[id];
      let dsr = { dsr: 0, passes: false };
      try { dsr = deflatedSharpe(s.sharpe, { nTrials: totalTrials, T: s.n }); } catch { /* degenerate → no pass */ }
      const bounce = classifyFamily(id) === 'meanrev'; // bounce-prone family (classifier returns 'meanrev')
      const survived = s.mean > 0 && dsr.passes && fdr.rejected[i] && !bounce;
      if (survived) survivors.push({ factorId: id, market: s.market, n: s.n, sharpe: +s.sharpe.toFixed(4), dsr: +dsr.dsr.toFixed(4), pValue: +s.pValue.toFixed(4), hitRate: +s.hitRate.toFixed(3), meanBps: +(s.mean * 1e4).toFixed(2) });
    }
    survivors.sort((a, b) => b.dsr - a.dsr);
    rungOut[rung.label] = { horizonS: rung.horizonS, evaluated: ids.length, fdrDiscoveries: fdr.k, survivors };
  }
  // Ledger-level falsification (run once at a representative horizon).
  let spread = null, maker = null;
  // Falsification at the 15m rung (non-overlapping) — the shortest rung WITH enough per-factor data
  // (both tools need n≥20 per factor; longer rungs are too sparse on a multi-hour ledger).
  try { spread = spreadAnalyze({ ledgerPath, horizonS: 900, strideS: 900 }); } catch { /* fail-soft */ }
  try { maker = makerAnalyze({ ledgerPath, horizonS: 900, strideS: 900, schedule: makerSchedule, fillProb: 0.4 }); } catch { /* fail-soft */ }

  const totalSurvivors = Object.values(rungOut).reduce((a, r) => a + (r.survivors ? r.survivors.length : 0), 0);
  return {
    recall: { factors: recall.factorIds.length, markets: recall.markets.length, rows: recall.rows.length },
    selectionTrials: totalTrials, // (factor × rung) hypotheses tried — the deflated-Sharpe nTrials
    rungs: rungOut,
    falsification: { spread, maker, makerSchedule },
    verdict: {
      totalSurvivors,
      hasEdge: totalSurvivors > 0,
      summary: totalSurvivors > 0
        ? `${totalSurvivors} factor-rung(s) survive overfit+FDR+fee+bounce screening`
        : 'NO factor survives the full screen — no overfit/FDR/fee-robust edge yet',
    },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--audit')) {
  const pathMod = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = pathMod.dirname(fileURLToPath(import.meta.url));
  const ledgerPath = pathMod.resolve(dir, '..', '..', 'state', 'strategy-forecasts.jsonl');
  const audit = auditEdge({ ledgerPath });
  console.log(`recall: ${audit.recall.factors} factors / ${audit.recall.markets} markets / ${audit.recall.rows} rows`);
  for (const [label, r] of Object.entries(audit.rungs)) {
    const surv = (r.survivors || []).map((s) => `${s.factorId.replace(/-[A-Z0-9]+-USD$/, '')}(dsr${s.dsr})`).join(', ') || '—';
    console.log(`${label.padEnd(7)} eval=${String(r.evaluated).padStart(4)} fdr=${r.fdrDiscoveries ?? 0} survivors: ${surv}`);
  }
  const sv = audit.falsification.spread && audit.falsification.spread.verdict;
  if (sv) console.log(`spread-bounce: artifact=${sv.bounceArtifact} mr-spread-survival=${sv.meanrevSpreadSurvivalRate} negAutocorr=${sv.marketsNegativeAutocorr}`);
  const mk = audit.falsification.maker;
  if (mk && mk.n) console.log(`maker(${audit.falsification.makerSchedule}, n=${mk.n}): taker ${mk.meanTakerBps} / maker ${mk.meanMakerBps} bps · breakeven adverse-sel ${mk.adverseBreakEvenBps}bps`);
  console.log(`VERDICT: ${audit.verdict.summary}`);
  process.exit(0);
}

if (_main && process.argv.includes('--test')) {
  const fs = await import('node:fs');
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  const tmp = `/tmp/trade-edge-audit-test-${process.pid}.jsonl`;
  try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* noop */ }

  // Synthetic ledger: one GENUINE-edge factor (price rises strongly after its long forecasts) + noise
  // factors (random direction, no edge). Spaced 3600s so the 60m rung's non-overlap keeps every obs.
  const base = 1_700_000_000;
  const rows = [];
  const N = 40;
  // good-EDGE: dir=+1 each step, EDGE market trends UP → consistently positive dirRet
  for (let i = 0; i < N; i++) {
    const ts = base + i * 3600;
    rows.push({ factorId: 'good-EDGE-USD', market: 'EDGE-USD', dir: 1, ts, price: 100 + i * 1.0 }); // +1/step trend
  }
  // noise factors on a FLAT market (constant price) → forward return exactly 0 → genuine zero edge
  // (a deterministic price/dir wobble would manufacture fake systematic edge — keep it truly flat).
  for (let f = 0; f < 8; f++) {
    for (let i = 0; i < N; i++) {
      const ts = base + i * 3600;
      const dir = (i + f) % 2 === 0 ? 1 : -1;
      rows.push({ factorId: `noise${f}-NOISE-USD`, market: 'NOISE-USD', dir, ts, price: 100 });
    }
  }
  // forward prices beyond the last forecast so the 60m horizon resolves for both markets
  rows.push({ factorId: 'good-EDGE-USD', market: 'EDGE-USD', dir: 1, ts: base + (N + 2) * 3600, price: 100 + (N + 2) * 1.0 });
  rows.push({ factorId: 'noise0-NOISE-USD', market: 'NOISE-USD', dir: 1, ts: base + (N + 2) * 3600, price: 100 });
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  // recall
  const recall = recallFactors(tmp);
  ok(recall.factorIds.length === 9, `recall finds all 9 factors (got ${recall.factorIds.length})`);
  ok(recall.markets.length === 2, `recall finds 2 markets (got ${recall.markets.length})`);
  ok(recallFactors('/tmp/nope-xyz.jsonl').factorIds.length === 0, 'absent ledger → empty recall (fail-soft)');

  // edge stats: good factor has positive mean + high sharpe; a noise factor ~0 mean
  const stats = factorEdgeStats(recall, { horizonS: 3600, strideS: 3600 });
  ok(stats['good-EDGE-USD'] && stats['good-EDGE-USD'].mean > 0, 'good factor → positive mean edge');
  ok(stats['good-EDGE-USD'].sharpe > stats['noise0-NOISE-USD'].sharpe, 'good factor Sharpe > noise Sharpe');
  ok(stats['good-EDGE-USD'].pValue < 0.05, `good factor significant (p=${stats['good-EDGE-USD']?.pValue?.toFixed(3)})`);

  // full audit: the good factor SURVIVES DSR+FDR at 60m; noise does NOT
  const audit = auditEdge({ ledgerPath: tmp, q: 0.1 });
  ok(audit.recall.factors === 9, 'audit recall counts 9 factors');
  const surv60 = audit.rungs['60m'].survivors.map((s) => s.factorId);
  ok(surv60.includes('good-EDGE-USD'), `good factor survives the 60m screen (survivors: ${surv60.join(',') || 'none'})`);
  ok(!surv60.some((id) => id.startsWith('noise')), 'no noise factor survives the screen');
  ok(typeof audit.verdict.summary === 'string' && audit.verdict.hasEdge === true, 'verdict reports edge present');

  // honesty: an all-noise ledger → no survivors
  const tmp2 = `/tmp/trade-edge-audit-noise-${process.pid}.jsonl`;
  const noiseRows = [];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 30; i++) { const ts = base + i * 3600; noiseRows.push({ factorId: `n${f}-FLAT-USD`, market: 'FLAT-USD', dir: (i + f) % 2 ? 1 : -1, ts, price: 100 }); }
  noiseRows.push({ factorId: 'n0-FLAT-USD', market: 'FLAT-USD', dir: 1, ts: base + 40 * 3600, price: 100 });
  fs.writeFileSync(tmp2, noiseRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const auditNoise = auditEdge({ ledgerPath: tmp2 });
  ok(auditNoise.verdict.totalSurvivors === 0, `all-noise ledger → 0 survivors (honest; got ${auditNoise.verdict.totalSurvivors})`);

  try { fs.unlinkSync(tmp); fs.unlinkSync(tmp2); } catch { /* noop */ }
  console.log(`trade-edge-audit --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
