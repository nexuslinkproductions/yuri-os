// @capability: strategy-weights
// @serves: per-strategy forecast scoring | ensemble weight derivation | which strategies to trust | re-weight the ensemble | strategy hit-rate
// @does: the ensemble's RE-WEIGHTING brain. Records every strategy's directional forecast each cycle
// (leak-free), scores each forecast against the realized forward return, and derives a per-strategy
// WEIGHT (trust the ones that predict, veto the ones that don't) → writes ensemble-weights.json which
// the ensemble vote reads. The deterministic core of the hybrid's slower re-weighting beat; a Sonnet
// review can layer judgment on top by editing the same weights file.
// @use: recordForecasts(...) each cycle (cheap, no positions); reweight(...) on a slower beat (or CLI)
// to score the accrued forecasts and rewrite the weights. Ensemble stays uniform until weights exist.
// @exports: recordForecasts, scoreForecasts, deriveWeights, reweight

import { appendFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const sideDir = (s) => (s === 'long' ? 1 : s === 'short' ? -1 : 0);

/**
 * recordForecasts(market, signals, refPrice, ts, ledgerPath) — append one leak-free forecast row
 * per directional strategy signal: { factorId, market, dir, ts, price }. No outcome yet.
 * Idempotent-ish: caller throttles by cycle; cheap append. Never throws.
 */
export function recordForecasts(market, signals, refPrice, ts, ledgerPath) {
  if (!market || !Array.isArray(signals) || !isNum(refPrice) || !isNum(ts) || !ledgerPath) return 0;
  let n = 0;
  const lines = [];
  for (const s of signals) {
    if (!s || !s.factorId) continue;
    const dir = sideDir(s.side);
    if (dir === 0) continue;
    lines.push(JSON.stringify({ factorId: s.factorId, market, dir, ts, price: refPrice }));
    n++;
  }
  if (!lines.length) return 0;
  try { appendFileSync(ledgerPath, lines.join('\n') + '\n'); } catch { return 0; }
  return n;
}

/**
 * scoreForecasts({ ledgerPath, horizonS }) — pair each forecast with the SAME strategy's nearest
 * later record (≥ horizonS afterwards) as the realized forward move, and aggregate per strategy.
 * Leak-free: a forecast is scored only against a price strictly AFTER it. Returns
 * { [factorId]: { n, hitRate, meanDirRet } }. meanDirRet = mean(dir·forwardReturn). Fail-soft → {}.
 */
export function scoreForecasts({ ledgerPath, horizonS = 300 } = {}) {
  let rows = [];
  try {
    if (!ledgerPath || !existsSync(ledgerPath)) return {};
    rows = readFileSync(ledgerPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r) => r && r.factorId && isNum(r.ts) && isNum(r.price));
  } catch { return {}; }
  if (!rows.length) return {};

  // Index price series per market (sorted by ts) for forward-return lookup.
  const series = new Map();
  for (const r of rows) {
    if (!series.has(r.market)) series.set(r.market, []);
    series.get(r.market).push([r.ts, r.price]);
  }
  for (const arr of series.values()) arr.sort((a, b) => a[0] - b[0]);

  const fwd = (market, ts) => {
    const arr = series.get(market);
    if (!arr) return null;
    for (let i = 0; i < arr.length; i++) { if (arr[i][0] >= ts + horizonS) return arr[i][1]; }
    return null; // no realized price yet → exclude (leak-free)
  };

  const agg = new Map(); // factorId -> {n, hits, sumDirRet}
  for (const r of rows) {
    const p1 = fwd(r.market, r.ts);
    if (!isNum(p1) || !isNum(r.price) || r.price <= 0) continue;
    const ret = (p1 - r.price) / r.price;
    const dirRet = r.dir * ret;
    if (!agg.has(r.factorId)) agg.set(r.factorId, { n: 0, hits: 0, sumDirRet: 0 });
    const a = agg.get(r.factorId);
    a.n++; if (dirRet > 0) a.hits++; a.sumDirRet += dirRet;
  }
  const out = {};
  for (const [fid, a] of agg) {
    out[fid] = { n: a.n, hitRate: a.n ? a.hits / a.n : null, meanDirRet: a.n ? a.sumDirRet / a.n : null };
  }
  return out;
}

/**
 * deriveWeights(stats, opts) — map per-strategy scores → ensemble weights. A strategy with positive
 * mean directional return (beats costs) gets weight ∝ edge; a non-predictive/negative one is VETOED
 * (weight 0). Thin strategies (n < minN) stay at neutral weight 1 (uniform) until they have data.
 * @returns {Object<factorId, number>}
 */
export function deriveWeights(stats, opts = {}) {
  const minN = isNum(opts.minN) ? opts.minN : 20;
  const maxW = isNum(opts.maxW) ? opts.maxW : 3;
  // feeHurdle: a strategy must beat the round-trip COST, not merely break even. Veto when its mean
  // directional return ≤ the hurdle (default 0 = old "beats zero" behavior; ~0.002 = a taker round-trip).
  const feeHurdle = isNum(opts.feeHurdle) ? opts.feeHurdle : 0;
  const weights = {};
  for (const [fid, s] of Object.entries(stats || {})) {
    if (!s || !isNum(s.n) || s.n < minN || !isNum(s.meanDirRet)) { weights[fid] = 1; continue; } // neutral until enough data
    if (s.meanDirRet <= feeHurdle) { weights[fid] = 0; continue; }                                // no edge after costs → veto
    // positive edge ABOVE the hurdle → scale weight by edge (bounded). 0.001 dirRet ≈ weight ~1; bigger → up to maxW.
    weights[fid] = Math.max(0.1, Math.min(maxW, 1 + s.meanDirRet * 500));
  }
  return weights;
}

/**
 * reweight({ ledgerPath, weightsPath, horizonS, minN }) — score accrued forecasts → derive weights →
 * write weightsPath (the file the ensemble reads). Returns { weights, stats, evaluated }. Fail-soft.
 */
export function reweight({ ledgerPath, weightsPath, horizonS = 300, minN = 20, feeHurdle = 0 } = {}) {
  const stats = scoreForecasts({ ledgerPath, horizonS });
  const weights = deriveWeights(stats, { minN, feeHurdle });
  const evaluated = Object.values(stats).filter((s) => s && s.n >= minN).length;
  if (weightsPath) {
    try {
      writeFileSync(weightsPath, JSON.stringify({ weights, generatedAt: null, evaluated, strategies: Object.keys(weights).length }, null, 0));
    } catch { /* fail-soft — ensemble stays on prior/uniform weights */ }
  }
  return { weights, stats, evaluated };
}

// ── CLI: --reweight (the brain's beat) / --test ─────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--reweight')) {
  // Score accrued forecasts → derive + write ensemble weights. Run on a slower beat or on demand.
  const pathMod = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = pathMod.dirname(fileURLToPath(import.meta.url));
  const STATE = pathMod.resolve(dir, '..', '..', 'state');
  const ledgerPath = pathMod.join(STATE, 'strategy-forecasts.jsonl');
  const weightsPath = pathMod.join(STATE, 'ensemble-weights.json');
  // Fee hurdle comes from the overseer config (the team's steering surface) when present.
  let feeHurdle = 0;
  try {
    const ocPath = pathMod.join(STATE, 'overseer-config.json');
    if (existsSync(ocPath)) { const oc = JSON.parse(readFileSync(ocPath, 'utf8')); if (isNum(oc.feeHurdle)) feeHurdle = oc.feeHurdle; }
  } catch { /* default 0 */ }
  const r = reweight({ ledgerPath, weightsPath, horizonS: 300, minN: 20, feeHurdle });
  const ranked = Object.entries(r.weights).sort((a, b) => b[1] - a[1]);
  const up = ranked.filter(([, w]) => w > 1).length;
  const vetoed = ranked.filter(([, w]) => w === 0).length;
  console.log(`strategy-weights --reweight: evaluated=${r.evaluated} strategies=${ranked.length} up-weighted=${up} vetoed=${vetoed}`);
  console.log('top:', ranked.slice(0, 6).map(([id, w]) => `${id.replace(/-[A-Z0-9]+-USD$/, '')}=${w.toFixed(2)}`).join(' '));
  process.exit(0);
}

if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  const fs = await import('node:fs');
  const tmp = `/tmp/strat-weights-test-${process.pid}.jsonl`;
  try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* noop */ }

  // good strategy: predicts long, price rises (dir+ , ret+ → dirRet+). bad: predicts long, price falls.
  // build records: t0 forecasts at price 100, t0+300 a later record at higher/lower price.
  const rows = [];
  for (let i = 0; i < 25; i++) {
    rows.push({ factorId: 'good-BTC-USD', market: 'BTC-USD', dir: 1, ts: 1000 + i * 60, price: 100 });
    rows.push({ factorId: 'bad-BTC-USD', market: 'BTC-USD', dir: 1, ts: 1000 + i * 60, price: 100 });
  }
  // later prices: good market goes UP (so good's long wins); but both share the BTC market series...
  // use two markets so each strategy's market moves differently.
  const rows2 = [];
  for (let i = 0; i < 25; i++) {
    rows2.push({ factorId: 'good-X', market: 'X', dir: 1, ts: 1000 + i * 60, price: 100 });
    rows2.push({ factorId: 'bad-Y', market: 'Y', dir: 1, ts: 1000 + i * 60, price: 100 });
  }
  // forward prices: X rises to 101 (good long wins), Y falls to 99 (bad long loses)
  rows2.push({ factorId: 'good-X', market: 'X', dir: 1, ts: 1000 + 100 * 60, price: 101 });
  rows2.push({ factorId: 'bad-Y', market: 'Y', dir: 1, ts: 1000 + 100 * 60, price: 99 });
  fs.writeFileSync(tmp, rows2.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const stats = scoreForecasts({ ledgerPath: tmp, horizonS: 300 });
  ok(stats['good-X'] && stats['good-X'].meanDirRet > 0, 'good strategy → positive meanDirRet');
  ok(stats['bad-Y'] && stats['bad-Y'].meanDirRet < 0, 'bad strategy → negative meanDirRet');
  const w = deriveWeights(stats, { minN: 5 });
  ok(w['good-X'] > 1, `good strategy weighted up (${w['good-X']})`);
  ok(w['bad-Y'] === 0, 'bad strategy vetoed (weight 0)');
  // fee-hurdle: a small-positive-edge strategy is vetoed when it can't clear the round-trip cost,
  // but kept when it does. (Default hurdle 0 → old "beats zero" behavior, covered by bad-Y above.)
  ok(deriveWeights({ tiny: { n: 30, hitRate: 0.6, meanDirRet: 0.0005 } }, { minN: 20, feeHurdle: 0.002 }).tiny === 0,
    'fee-hurdle vetoes a strategy whose edge < round-trip cost');
  ok(deriveWeights({ real: { n: 30, hitRate: 0.6, meanDirRet: 0.004 } }, { minN: 20, feeHurdle: 0.002 }).real > 1,
    'fee-hurdle keeps a strategy whose edge clears the cost');
  // thin data → neutral
  const wThin = deriveWeights({ thin: { n: 2, hitRate: 1, meanDirRet: 0.01 } }, { minN: 20 });
  ok(wThin.thin === 1, 'thin strategy → neutral weight 1');
  // empty
  ok(Object.keys(scoreForecasts({ ledgerPath: '/tmp/nope-xyz.jsonl' })).length === 0, 'absent ledger → {}');
  ok(recordForecasts('BTC-USD', [{ factorId: 'a', side: 'long' }], 100, 1000, tmp) === 1, 'recordForecasts appends directional');

  try { fs.unlinkSync(tmp); } catch { /* noop */ }
  console.log(`strategy-weights --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
