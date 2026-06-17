// @capability: maker-fill-sim
// @serves: does maker beat the fee | maker vs taker net P&L | beat the fee floor | limit-order fill simulation | maker-fill break-even | should we go maker
// @does: re-scores the strategy forecast ledger under MAKER (post-only limit) execution vs TAKER, to
// @exports: analyze, sweep, FEE_SCHEDULES, SPREAD_RT
// answer "does capturing the spread + a lower maker fee flip net-of-cost from negative to positive."
// A taker PAYS the half-spread each side + taker fee; a maker CAPTURES the spread but (a) only fills
// with probability p and (b) suffers adverse selection (filled preferentially when price moves against
// you). Pure analysis on {factorId,market,dir,ts,price} — no orders, no network. Sweeps fee schedule ×
// fillProb × adverse-selection and reports the break-even. Companion to spread-correction.mjs.
// @use: node maker-fill-sim.mjs [--horizon 300] [--stride N] | --sweep | --test

import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { scoreForecasts } from './strategy-weights.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.resolve(HERE, '..', '..', 'state');

// Full round-trip spread a taker PAYS / a maker CAPTURES (afl-paper DEFAULT_SPREAD_FRAC, both halves).
export const SPREAD_RT = 0.0005;

// Per-SIDE fee rates (round-trip = 2×). in-code = afl-paper cryptoFeeModel tier-1 (optimistic); the
// real-* tiers are the published Coinbase Advanced retail/volume schedule (the in-code model is ~4-6× low).
// Per-side fee rates (round-trip = 2×). 'real-*' are advisory training-prior tiers (minimax peer;
// Coinbase fee pages are auth/Cloudflare-gated → UNVERIFIED online, treat as advisory). A retail/paper
// account sits at the BOTTOM tier (real-tier0). No maker rebates below $300M/30d volume.
export const FEE_SCHEDULES = {
  'in-code':    { maker: 0.0010, taker: 0.0010 }, // what the paper engine currently charges (~6× too low)
  'real-tier0': { maker: 0.0060, taker: 0.0120 }, // Coinbase Advanced bottom tier (<$10k/30d) — where we'd actually be
  'real-tier1': { maker: 0.0040, taker: 0.0075 }, // ~$10k-50k/30d
  'real-tier2': { maker: 0.0025, taker: 0.0040 }, // ~$50k-100k/30d
  'real-tier4': { maker: 0.0010, taker: 0.0025 }, // ~$1M-10M/30d (high volume)
};

// Realistic post-only fill at the touch on 1-min bars (minimax): BTC ~0.3-0.5, SOL ~0.2-0.4 typical.
// 0.7-0.9 only on high-vol breakout minutes. fillProb is really queue/vol-conditioned, not free.
const FILL_PROBS = [0.3, 0.5, 0.7];
const ADVERSE_BPS = [0, 2, 5, 10]; // adverse-selection haircut, round-trip bps

// PEER CAVEATS (nemotron, verified against the arithmetic):
//  1. CONDITIONAL BIAS: maker fills are a non-random subset (you get filled when price moves against
//     you), so E[dirMove|fill] = E[dirMove] − LVR. We model LVR as `adverseSelRt` subtracted from gross.
//  2. COUPLING: fillProb and LVR are NOT independent (high fill ⇒ front-of-queue ⇒ low LVR; low fill ⇒
//     high LVR). Gridding them independently here is a SENSITIVITY SURFACE, not a joint estimate.
//  3. Realistic LVR ≈ 2–12bps (normal vol), 15–40bps (high vol); Coinbase book ~1.5–2× worse than Binance.
//  4. Opportunity cost of resting capital is omitted (paper, no margin lock) → maker EV here is OPTIMISTIC.
//  With E[dirMove]≈0 the break-even LVR is ~178–406bps (impossible) — maker cannot win without real gross edge.

/**
 * netPerTrade(meanDirRet, {schedule, fillProb, adverseSelRt}) — net-of-cost return per trade for
 * taker and maker. meanDirRet is the mid-to-mid directional return (the gross edge, leak-free).
 *   taker_net = gross − spread(paid) − takerFee_rt
 *   maker_net = fillProb × (gross + spread(captured) − makerFee_rt − adverseSel_rt)   (unfilled → 0)
 */
export function netPerTrade(gross, { schedule, fillProb, adverseSelRt }) {
  const f = FEE_SCHEDULES[schedule] || FEE_SCHEDULES['in-code'];
  const takerNet = gross - SPREAD_RT - 2 * f.taker;
  const makerNet = fillProb * (gross + SPREAD_RT - 2 * f.maker - adverseSelRt);
  return { takerNet, makerNet };
}

/**
 * analyze({ ledgerPath, horizonS, strideS, schedule, fillProb, adverseSelRt }) — score every strategy's
 * gross edge, then aggregate net-of-cost under taker vs maker. Returns means (in bps) + positive-rates.
 */
export function analyze(opts = {}) {
  const { ledgerPath, horizonS = 300, strideS = 0, schedule = 'in-code', fillProb = 0.7, adverseSelRt = 0.0002 } = opts;
  const stats = scoreForecasts({ ledgerPath, horizonS, strideS });
  const rows = Object.values(stats).filter((s) => s && isNum(s.meanDirRet) && isNum(s.n) && s.n >= 20);
  if (!rows.length) return { n: 0 };
  let sumGross = 0, sumTaker = 0, sumMaker = 0, takerPos = 0, makerPos = 0;
  for (const s of rows) {
    const { takerNet, makerNet } = netPerTrade(s.meanDirRet, { schedule, fillProb, adverseSelRt });
    sumGross += s.meanDirRet; sumTaker += takerNet; sumMaker += makerNet;
    if (takerNet > 0) takerPos++; if (makerNet > 0) makerPos++;
  }
  const n = rows.length;
  // adverse-selection break-even: makerNet mean = 0 ⇒ adverseSelRt = meanGross + SPREAD_RT − 2·makerFee
  const f = FEE_SCHEDULES[schedule];
  const adverseBE = (sumGross / n) + SPREAD_RT - 2 * f.maker;
  return {
    n, schedule, fillProb, adverseSelRt,
    meanGrossBps: +(1e4 * sumGross / n).toFixed(3),
    meanTakerBps: +(1e4 * sumTaker / n).toFixed(3),
    meanMakerBps: +(1e4 * sumMaker / n).toFixed(3),
    takerPositivePct: +(100 * takerPos / n).toFixed(0),
    makerPositivePct: +(100 * makerPos / n).toFixed(0),
    adverseBreakEvenBps: +(1e4 * adverseBE).toFixed(2), // maker net-positive only if real adverse-sel < this
  };
}

/** sweep — grid over fee schedule × fillProb (at a mid adverse-sel), the headline verdict table. */
export function sweep({ ledgerPath, horizonS = 300, strideS = 300, adverseSelRt = 0.0002 } = {}) {
  const out = [];
  for (const schedule of Object.keys(FEE_SCHEDULES)) {
    for (const fillProb of FILL_PROBS) {
      const r = analyze({ ledgerPath, horizonS, strideS, schedule, fillProb, adverseSelRt });
      if (r.n) out.push(r);
    }
  }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

if (_main && process.argv.includes('--sweep')) {
  const ledgerPath = path.join(STATE, 'strategy-forecasts.jsonl');
  if (!existsSync(ledgerPath)) { console.error('no forecast ledger'); process.exit(1); }
  const adverseSelRt = Number(arg('--adverse', '0.0002'));
  console.log(`MAKER-FILL SWEEP (spreadRT=${SPREAD_RT}, adverseSel=${(adverseSelRt * 1e4).toFixed(0)}bps, non-overlapping)`);
  console.log('positive = net-profitable per trade. meanMaker/Taker in bps.\n');
  console.log('schedule    | fillP | grossBps | takerBps | makerBps | maker+% | adverseSel break-even');
  for (const r of sweep({ ledgerPath, adverseSelRt })) {
    console.log(`${r.schedule.padEnd(11)} | ${String(r.fillProb).padEnd(5)} | ${String(r.meanGrossBps).padStart(8)} | ${String(r.meanTakerBps).padStart(8)} | ${String(r.meanMakerBps).padStart(8)} | ${String(r.makerPositivePct + '%').padStart(6)} | ${r.adverseBreakEvenBps}bps`);
  }
  // verdict from the most realistic cell: bottom tier (where a retail/paper account sits) + ~0.4 fill (BTC 1-min)
  const real = analyze({ ledgerPath, strideS: 300, schedule: 'real-tier0', fillProb: 0.4, adverseSelRt });
  console.log(`\nVERDICT (real-tier0 60/120bps, fillProb 0.4 — realistic retail): meanMaker=${real.meanMakerBps}bps vs meanTaker=${real.meanTakerBps}bps.`);
  console.log(real.meanMakerBps > 0
    ? `⇒ maker flips NET-POSITIVE at real retail fees (break-even adverse-sel ${real.adverseBreakEvenBps}bps).`
    : `⇒ maker is LESS NEGATIVE than taker but NOT net-positive at 1-min (gross edge ${real.meanGrossBps}bps too small vs cost). Needs lower fee tier OR bigger moves (longer holds).`);
  process.exit(0);
}

if (_main && !process.argv.includes('--test')) {
  const ledgerPath = path.join(STATE, 'strategy-forecasts.jsonl');
  if (!existsSync(ledgerPath)) { console.error('no forecast ledger'); process.exit(1); }
  const horizonS = Number(arg('--horizon', '300'));
  const strideS = Number(arg('--stride', '0'));
  const schedule = arg('--schedule', 'in-code');
  const fillProb = Number(arg('--fillProb', '0.7'));
  const adverseSelRt = Number(arg('--adverse', '0.0002'));
  const r = analyze({ ledgerPath, horizonS, strideS, schedule, fillProb, adverseSelRt });
  console.log(`MAKER-FILL (schedule=${schedule}, fillProb=${fillProb}, adverseSel=${(adverseSelRt * 1e4).toFixed(0)}bps, horizon=${horizonS}s, n=${r.n})`);
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  // maker captures spread → for the SAME gross, maker pre-fee/adverse edge beats taker by 2·spread.
  const g = 0.001;
  const inc = netPerTrade(g, { schedule: 'in-code', fillProb: 1, adverseSelRt: 0 });
  ok(inc.makerNet > inc.takerNet, `maker > taker on captured spread (maker ${inc.makerNet} vs taker ${inc.takerNet})`);
  ok(Math.abs((inc.makerNet - inc.takerNet) - 2 * SPREAD_RT) < 1e-9, 'maker−taker delta = 2·spread at equal in-code fees (fillProb1, adv0)');
  // fillProb scales maker net
  const half = netPerTrade(g, { schedule: 'in-code', fillProb: 0.5, adverseSelRt: 0 });
  ok(Math.abs(half.makerNet - 0.5 * inc.makerNet) < 1e-9, 'fillProb 0.5 halves maker net');
  // adverse selection monotonic ↓
  const a0 = netPerTrade(g, { schedule: 'real-tier1', fillProb: 1, adverseSelRt: 0 });
  const a5 = netPerTrade(g, { schedule: 'real-tier1', fillProb: 1, adverseSelRt: 0.0005 });
  ok(a5.makerNet < a0.makerNet, 'higher adverse-selection → lower maker net');
  // real-tier1 taker fee (0.60%/side) crushes a 10bps gross trade
  const rt = netPerTrade(0.001, { schedule: 'real-tier1', fillProb: 1, adverseSelRt: 0 });
  ok(rt.takerNet < -0.01, `real-tier1 taker deeply negative on 10bps gross (${(rt.takerNet * 100).toFixed(2)}%)`);
  // higher volume tier (lower fee) → less negative taker
  const t4 = netPerTrade(0.001, { schedule: 'real-tier4', fillProb: 1, adverseSelRt: 0 });
  ok(t4.takerNet > rt.takerNet, 'tier4 (lower fee) → taker less negative than tier1');
  console.log(`maker-fill-sim --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
