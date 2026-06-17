#!/usr/bin/env node
// @capability: horizon-ladder
// @serves: multi-horizon scoring | horizon ladder | score forecasts at 3h 12h weekly | per-horizon ensemble weights
// @does: scores the same strategy-forecasts ledger at 6 horizons (15m→weekly) and derives per-horizon ensemble weights so short signals are scored short and carry/funding signals are scored long
// @use: scoreLadder({ledgerPath}) for runtime; writeLadderWeights({ledgerPath,outPath}) on a beat to persist per-rung weights; CLI --ladder for a compact summary, --test for self-tests
// @exports: RUNGS, scoreLadder, writeLadderWeights

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { scoreForecasts, deriveWeights } from './strategy-weights.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Canonical rung definitions — strideS = horizonS so survival counts use ~non-overlapping observations. */
// minN calibrated to NON-OVERLAPPING obs available per rung on a multi-hour ledger (verified live:
// 15m maxN≈24, 30m≈12, 60m≈6, 3h≈2 over ~6h). Long rungs stay empty until enough independent
// samples accrue (12h needs ~2d, weekly ~1mo) — that is correct honesty, not a bug.
export const RUNGS = [
  { label: '15m',    horizonS: 900,    feeHurdle: 0.0015, minN: 20, strideS: 900    },
  { label: '30m',    horizonS: 1800,   feeHurdle: 0.0015, minN: 10, strideS: 1800   },
  { label: '60m',    horizonS: 3600,   feeHurdle: 0.0015, minN: 6,  strideS: 3600   },
  { label: '3h',     horizonS: 10800,  feeHurdle: 0.002,  minN: 5,  strideS: 10800  },
  { label: '12h',    horizonS: 43200,  feeHurdle: 0.003,  minN: 4,  strideS: 43200  },
  { label: 'weekly', horizonS: 604800, feeHurdle: 0.004,  minN: 4,  strideS: 604800 },
];

/**
 * scoreLadder({ ledgerPath, rungs, maxW }) — score the ledger at every rung.
 * Fail-soft per rung: any throw or empty result → dataAvailable:false.
 * @returns {{ rungs: Object.<string, {horizonS, evaluated, dataAvailable, weights, stats}> }}
 */
export function scoreLadder({ ledgerPath, rungs = RUNGS, maxW = 3 } = {}) {
  const out = {};
  for (const rung of rungs) {
    const { label, horizonS, feeHurdle, minN, strideS } = rung;
    try {
      const stats = scoreForecasts({ ledgerPath, horizonS, strideS });
      const evaluated = Object.values(stats).filter((s) => s && isNum(s.n) && s.n >= minN).length;
      const dataAvailable = evaluated > 0;
      const weights = dataAvailable ? deriveWeights(stats, { minN, maxW, feeHurdle }) : {};
      out[label] = { horizonS, evaluated, dataAvailable, weights, stats };
    } catch {
      out[label] = { horizonS, evaluated: 0, dataAvailable: false, weights: {}, stats: {} };
    }
  }
  return { rungs: out };
}

/**
 * writeLadderWeights({ ledgerPath, outPath, rungs }) — score all rungs and write outPath.
 * generatedAt is kept as literal null for cache/determinism.
 * Fail-soft on write. Returns the full ladder object.
 */
export function writeLadderWeights({ ledgerPath, outPath, rungs = RUNGS } = {}) {
  const ladder = scoreLadder({ ledgerPath, rungs });
  // Slim output: strip stats (bulky), keep only weights + metadata
  const slimRungs = {};
  for (const [label, r] of Object.entries(ladder.rungs)) {
    slimRungs[label] = { horizonS: r.horizonS, evaluated: r.evaluated, dataAvailable: r.dataAvailable, weights: r.weights };
  }
  const payload = JSON.stringify({ rungs: slimRungs, generatedAt: null }, null, 0);
  if (outPath) {
    try { writeFileSync(outPath, payload); } catch { /* fail-soft */ }
  }
  return ladder;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--ladder')) {
  const pathMod = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = pathMod.dirname(fileURLToPath(import.meta.url));
  const STATE = pathMod.resolve(dir, '..', '..', 'state');
  const ledgerPath = pathMod.join(STATE, 'strategy-forecasts.jsonl');
  const outPath = pathMod.join(STATE, 'ensemble-weights-ladder.json');
  const ladder = writeLadderWeights({ ledgerPath, outPath });
  for (const [label, r] of Object.entries(ladder.rungs)) {
    const up = Object.values(r.weights).filter((w) => w > 1).length;
    const vetoed = Object.values(r.weights).filter((w) => w === 0).length;
    console.log(`${label} horizonS=${r.horizonS} evaluated=${r.evaluated} dataAvailable=${r.dataAvailable} up=${up} vetoed=${vetoed}`);
  }
  process.exit(0);
}

if (_main && process.argv.includes('--test')) {
  const fs = await import('node:fs');
  const pathMod = await import('node:path');
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  const tmp = `/tmp/horizon-ladder-test-${process.pid}.jsonl`;
  const tmpOut = `/tmp/horizon-ladder-weights-${process.pid}.json`;
  try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* noop */ }
  try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch { /* noop */ }

  // ── Build a synthetic ledger ─────────────────────────────────────────────
  // Two markets, two factors:
  //   good-CARRY: market=CARRY, long bias, price rises after weekly horizon → strong positive edge at long horizons
  //   bad-SHORT:  market=SHORT, long bias, price falls → negative edge → veto
  //
  // Seed 10 obs per factor so we get a MIX of populated/empty rungs keyed on each rung's minN.
  //
  // Approach: place 10 forecast rows per factor at t0 + i * 604800 (weekly stride), plus one forward
  // price per market well past the last forecast. The forward-price lookup just needs a price ≥ ts +
  // horizonS, which each weekly-spaced record satisfies — so all 10 resolve at EVERY horizon. Each rung
  // then subsamples by strideS, but 604800 >> every rung's strideS, so all 10 survive → n=10 per rung.
  // Evaluation then hinges purely on minN:
  //   15m minN=20 → n=10 < 20 → UNEVALUATED.   30m/60m/3h/12h/weekly minN≤10 → n=10 ≥ minN → EVALUATED.

  const WEEKLY = 604800;
  const BASE_TS = 1_700_000_000; // arbitrary epoch
  const GOOD_PRICE_ENTRY = 1000;
  const GOOD_PRICE_FWD   = 1050; // +5% → meanDirRet 0.05 clears weekly feeHurdle 0.004
  const BAD_PRICE_ENTRY  = 1000;
  const BAD_PRICE_FWD    = 950;  // -5% → meanDirRet -0.05, vetoed at all rungs

  const rows = [];
  for (let i = 0; i < 10; i++) {
    const ts = BASE_TS + i * WEEKLY;
    rows.push({ factorId: 'good-CARRY', market: 'CARRY', dir: 1, ts, price: GOOD_PRICE_ENTRY });
    rows.push({ factorId: 'bad-SHORT',  market: 'SHORT', dir: 1, ts, price: BAD_PRICE_ENTRY  });
  }
  // Forward prices: one record per market well past the last forecast (+ WEEKLY)
  rows.push({ factorId: 'good-CARRY', market: 'CARRY', dir: 1, ts: BASE_TS + 11 * WEEKLY, price: GOOD_PRICE_FWD });
  rows.push({ factorId: 'bad-SHORT',  market: 'SHORT', dir: 1, ts: BASE_TS + 11 * WEEKLY, price: BAD_PRICE_FWD  });

  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  // ── (a) scoreLadder returns a rung object for every RUNG ─────────────────
  const ladder = scoreLadder({ ledgerPath: tmp });
  for (const rung of RUNGS) {
    ok(typeof ladder.rungs[rung.label] === 'object', `rung '${rung.label}' present in ladder`);
  }

  // ── (b) rung with no forward data (none supplied for NODATA market) ───────
  const tmpNoData = `/tmp/horizon-ladder-nodata-${process.pid}.jsonl`;
  fs.writeFileSync(tmpNoData, JSON.stringify({ factorId: 'f', market: 'NODATA', dir: 1, ts: BASE_TS, price: 100 }) + '\n');
  const ladderNoData = scoreLadder({ ledgerPath: tmpNoData });
  for (const rung of RUNGS) {
    const r = ladderNoData.rungs[rung.label];
    ok(!r.dataAvailable, `nodata rung '${rung.label}' dataAvailable=false`);
    ok(Object.keys(r.weights).length === 0, `nodata rung '${rung.label}' weights={}`);
  }
  try { fs.unlinkSync(tmpNoData); } catch { /* noop */ }

  // ── (c) rung WITH data: good-CARRY up-weighted (>1), bad-SHORT vetoed (0) ─
  // 'weekly' rung should have evaluated >= 1 since n=10 >= minN=5
  const wk = ladder.rungs['weekly'];
  ok(wk.dataAvailable, `weekly rung has data`);
  ok(typeof wk.weights['good-CARRY'] === 'number', `weekly weights has good-CARRY`);
  ok(wk.weights['good-CARRY'] > 1, `good-CARRY up-weighted at weekly (${wk.weights['good-CARRY']})`);
  ok(wk.weights['bad-SHORT'] === 0, `bad-SHORT vetoed at weekly (${wk.weights['bad-SHORT']})`);

  // '15m' rung: n=10 < minN=20 → unevaluated → dataAvailable=false
  const m15 = ladder.rungs['15m'];
  ok(!m15.dataAvailable, `15m rung unevaluated (n<minN=20) → dataAvailable=false`);
  // '30m' rung: n=10 ≥ minN=10 → evaluated (locks the recalibrated minN; red-team coverage gap)
  const m30 = ladder.rungs['30m'];
  ok(m30.dataAvailable, `30m rung evaluated (n=10 ≥ minN=10) → dataAvailable=true`);

  // ── (d) writeLadderWeights writes valid JSON with generatedAt===null ───────
  writeLadderWeights({ ledgerPath: tmp, outPath: tmpOut });
  ok(fs.existsSync(tmpOut), `writeLadderWeights wrote outPath`);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(tmpOut, 'utf8')); } catch { parsed = null; }
  ok(parsed !== null, `outPath is valid JSON`);
  ok(parsed && parsed.generatedAt === null, `generatedAt === null`);
  ok(parsed && typeof parsed.rungs === 'object', `parsed has rungs object`);
  for (const rung of RUNGS) {
    ok(parsed.rungs && typeof parsed.rungs[rung.label] === 'object', `writeLadder rung '${rung.label}' in output`);
  }

  try { fs.unlinkSync(tmp); } catch { /* noop */ }
  try { fs.unlinkSync(tmpOut); } catch { /* noop */ }

  console.log(`horizon-ladder --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
