// @capability: spread-correction-falsification
// @serves: is the mean-reversion edge real or bid-ask bounce | spread correction test | falsify strategy edge | transaction-cost haircut | bounce artifact diagnostic
// @does: falsifies the apparent strategy edge against microstructure. (1) Re-scores every strategy's
// @exports: analyze, lag1Autocorr, classifyFamily
// leak-free directional forecasts and asks how many SURVIVE a round-trip spread haircut + taker fee —
// an "edge" that lives entirely inside the spread is a bid-ask-bounce artifact, not prediction.
// (2) Computes per-market lag-1 return autocorrelation: strongly NEGATIVE = the bounce signature that
// mechanically feeds "buy below VWAP" mean-reversion signals. Together they answer Mimo's challenge:
// real alpha or microstructure noise.
// @use: node spread-correction.mjs [--horizon 300]  (reads strategy-forecasts.jsonl) | --test

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { scoreForecasts } from './strategy-weights.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.resolve(HERE, '..', '..', 'state');

// Microstructure cost model (matches afl-paper): full round-trip spread + taker round-trip fee.
export const SPREAD_RT = 0.0005;   // DEFAULT_SPREAD_FRAC — full spread (entry half + exit half)
export const TAKER_RT = 0.0020;    // 0.10%/side × 2 at the <$1M tier

export function classifyFamily(factorId) {
  const f = String(factorId).toLowerCase();
  if (/meanrev|reversion|bollinger|zscore|z-score|rsi|stoch|vwap|keltner|pctb|deviation/.test(f)) return 'meanrev';
  if (/trend|momentum|ema|macd|trix|adx|sma|donchian|breakout|aroon/.test(f)) return 'trend';
  if (/volume|vwap-vol|obv|atr|vol-|volatility|mfi|cmf/.test(f)) return 'volume';
  return 'other';
}

/** lag1Autocorr(returns) — Pearson autocorrelation at lag 1. Negative ⇒ bid-ask bounce signature. */
export function lag1Autocorr(returns) {
  const r = returns.filter(isNum);
  if (r.length < 3) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  let num = 0, den = 0;
  for (let i = 0; i < r.length; i++) { den += (r[i] - mean) ** 2; if (i > 0) num += (r[i] - mean) * (r[i - 1] - mean); }
  return den > 0 ? num / den : null;
}

/** per-market lag-1 autocorrelation of close-to-close returns (deduped from the per-strategy ledger). */
function marketAutocorr(rows) {
  const series = new Map(); // market -> Map(ts->price)
  for (const r of rows) {
    if (!r || !r.market || !isNum(r.ts) || !isNum(r.price)) continue;
    if (!series.has(r.market)) series.set(r.market, new Map());
    series.get(r.market).set(r.ts, r.price);
  }
  const out = {};
  for (const [mkt, m] of series) {
    const pts = [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const rets = [];
    for (let i = 1; i < pts.length; i++) if (pts[i - 1] > 0) rets.push(pts[i] / pts[i - 1] - 1);
    out[mkt] = { n: rets.length, lag1: lag1Autocorr(rets) };
  }
  return out;
}

/**
 * analyze({ ledgerPath, horizonS }) — score every strategy, classify by family, and report how many
 * survive a spread haircut + taker fee. Returns { families, markets, verdict }.
 */
export function analyze({ ledgerPath, horizonS = 300, strideS = 0 } = {}) {
  const stats = scoreForecasts({ ledgerPath, horizonS, strideS });
  const fams = {};
  for (const [fid, s] of Object.entries(stats)) {
    if (!s || !isNum(s.meanDirRet) || !isNum(s.n) || s.n < 20) continue; // need data
    const fam = classifyFamily(fid);
    if (!fams[fam]) fams[fam] = { n: 0, rawPos: 0, spreadSurv: 0, allSurv: 0, sumEdge: 0, sumNetSpread: 0 };
    const F = fams[fam];
    F.n++;
    F.sumEdge += s.meanDirRet;
    F.sumNetSpread += s.meanDirRet - SPREAD_RT;
    if (s.meanDirRet > 0) F.rawPos++;
    if (s.meanDirRet > SPREAD_RT) F.spreadSurv++;
    if (s.meanDirRet > SPREAD_RT + TAKER_RT) F.allSurv++;
  }
  // read rows once for autocorr
  let rows = [];
  try {
    rows = readFileSync(ledgerPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* */ }
  const markets = marketAutocorr(rows);

  // Verdict: mean-rev edge is a BOUNCE ARTIFACT if most raw-positive strategies die under the spread
  // AND markets show negative lag-1 autocorrelation.
  const mr = fams.meanrev || { n: 0, rawPos: 0, spreadSurv: 0 };
  const survRate = mr.rawPos > 0 ? mr.spreadSurv / mr.rawPos : 0;
  const acs = Object.values(markets).map((m) => m.lag1).filter(isNum);
  const negAc = acs.filter((a) => a < -0.05).length;
  const verdict = {
    meanrevRawPositive: mr.rawPos,
    meanrevSurviveSpread: mr.spreadSurv,
    meanrevSpreadSurvivalRate: +survRate.toFixed(3),
    marketsNegativeAutocorr: `${negAc}/${acs.length}`,
    bounceArtifact: survRate < 0.34 && negAc >= Math.ceil(acs.length / 2),
  };
  return { families: fams, markets, verdict, spreadRt: SPREAD_RT, takerRt: TAKER_RT, horizonS };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--sweep')) {
  // HORIZON SWEEP (Minimax): does edge GROW with horizon (real drift) or DECAY (bounce artifact)?
  // Non-overlapping (strideS=horizonS) per Nemotron → ~independent samples. Bounce decays in minutes;
  // genuine trend/drift grows ~√time. If trend meanEdge rises with horizon, there's a real horizon to trade.
  const ledgerPath = path.join(STATE, 'strategy-forecasts.jsonl');
  if (!existsSync(ledgerPath)) { console.error('no forecast ledger at', ledgerPath); process.exit(1); }
  const horizons = [300, 600, 900, 1800];
  console.log('HORIZON SWEEP (non-overlapping; meanEdge% net of spread 0.05% — POSITIVE = survives spread):');
  console.log('family   | ' + horizons.map((h) => `${h / 60}min`.padStart(9)).join(' | '));
  const fams = ['trend', 'meanrev', 'volume', 'other'];
  const grid = {};
  for (const h of horizons) {
    const r = analyze({ ledgerPath, horizonS: h, strideS: h });
    grid[h] = r.families;
  }
  for (const fam of fams) {
    const cells = horizons.map((h) => {
      const F = grid[h][fam];
      if (!F || !F.n) return '—'.padStart(9);
      return `${(100 * F.sumNetSpread / F.n).toFixed(4)}`.padStart(9);
    });
    console.log(`${fam.padEnd(8)} | ${cells.join(' | ')}`);
  }
  console.log('\nn (non-overlapping strategies scored) per horizon:');
  for (const h of horizons) { const t = Object.values(grid[h]).reduce((a, F) => a + F.n, 0); console.log(`  ${h / 60}min: ${t}`); }
  // verdict: trend net-of-spread improving as horizon grows?
  const trendVals = horizons.map((h) => grid[h].trend ? grid[h].trend.sumNetSpread / grid[h].trend.n : null).filter(isNum);
  const grows = trendVals.length >= 2 && trendVals[trendVals.length - 1] > trendVals[0];
  console.log(`\nVERDICT: trend net-of-spread ${grows ? 'IMPROVES' : 'does NOT improve'} from shortest→longest horizon ⇒ ${grows ? 'a real horizon may exist — test maker fills + longer holds' : 'no edge emerges at longer horizons on this (short) ledger either'}.`);
  console.log('CAVEAT: ledger spans ~1.8h, so >=1800s horizons are thin; re-run after more data accrues.');
  process.exit(0);
}

if (_main && !process.argv.includes('--test')) {
  const hi = process.argv.indexOf('--horizon');
  const horizonS = hi >= 0 && process.argv[hi + 1] ? Number(process.argv[hi + 1]) : 300;
  const si = process.argv.indexOf('--stride');
  const strideS = si >= 0 && process.argv[si + 1] ? Number(process.argv[si + 1]) : 0;
  const ledgerPath = path.join(STATE, 'strategy-forecasts.jsonl');
  if (!existsSync(ledgerPath)) { console.error('no forecast ledger at', ledgerPath); process.exit(1); }
  const r = analyze({ ledgerPath, horizonS, strideS });
  console.log(`SPREAD-CORRECTION FALSIFICATION  (horizon=${horizonS}s, stride=${strideS || 'overlap'}, spreadRT=${SPREAD_RT}, takerRT=${TAKER_RT})`);
  console.log('family   |   n | raw+ | survSpread | survSpread+fee | meanEdge%  | meanEdge−spread%');
  for (const [fam, F] of Object.entries(r.families)) {
    const pct = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '—';
    console.log(`${fam.padEnd(8)} | ${String(F.n).padStart(3)} | ${pct(F.rawPos, F.n).padStart(4)} | ${pct(F.spreadSurv, F.n).padStart(10)} | ${pct(F.allSurv, F.n).padStart(14)} | ${(100 * F.sumEdge / F.n).toFixed(4).padStart(9)} | ${(100 * F.sumNetSpread / F.n).toFixed(4).padStart(15)}`);
  }
  console.log('\nper-market lag-1 autocorrelation (negative = bid-ask bounce signature):');
  for (const [mkt, m] of Object.entries(r.markets)) console.log(`  ${mkt.padEnd(10)} n=${String(m.n).padStart(4)}  lag1=${isNum(m.lag1) ? m.lag1.toFixed(3) : '—'}`);
  console.log('\nVERDICT:', JSON.stringify(r.verdict, null, 0));
  console.log(r.verdict.bounceArtifact
    ? '⇒ mean-reversion edge is LIKELY A BID-ASK BOUNCE ARTIFACT (dies under spread + markets bounce).'
    : '⇒ mean-reversion edge is NOT clearly a bounce artifact on this data (some survives spread).');
  process.exit(0);
}

if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  ok(classifyFamily('bollinger-meanrev-BTC-USD') === 'meanrev', 'classify meanrev');
  ok(classifyFamily('trix-trend-ETH-USD') === 'trend', 'classify trend');
  ok(classifyFamily('volume-weighted-momentum-SOL-USD') === 'trend', 'momentum→trend');
  ok(classifyFamily('vwap-deviation-AVAX-USD') === 'meanrev', 'vwap-deviation→meanrev');
  // perfect negative autocorrelation (alternating) → ~ -1
  const alt = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01];
  const ac = lag1Autocorr(alt);
  ok(ac !== null && ac < -0.5, `alternating returns → strong negative autocorr (${ac?.toFixed(2)})`);
  // trending (monotone) → positive autocorr
  const up = [0.01, 0.011, 0.012, 0.013, 0.014, 0.015];
  ok(lag1Autocorr(up) > 0, 'monotone returns → positive autocorr');
  ok(lag1Autocorr([0.01]) === null, 'too few → null');
  console.log(`spread-correction --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
