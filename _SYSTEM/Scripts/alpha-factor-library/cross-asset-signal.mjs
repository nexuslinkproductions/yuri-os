#!/usr/bin/env node
// @capability: cross-asset-signal
// @serves: cross-asset lead lag | BTC leads alts | inter-market signal | lead-lag correlation tilt
// @does: Detects which market leads which via lag-shifted Pearson correlation, then emits an advisory directional signal for the lagging market in the direction of the leader's recent move.
// @use: Reach for this in the observatory crypto cycle when you want a BTC-leads-alts overlay on top of price/vol signals. Pure function over injected price series; never fetches data itself. LOW-confidence advisory only, never dominates.
// @exports: returnsFromSeries, leadLag, leadLagToSignal, computeCrossAssetSignals
//
// CONSTRAINTS: paper-only (INV-1 — no order path), no key reads (INV-2 — pure math on
// injected series), fail-open (computeCrossAssetSignals never throws). No new npm dep.

import { pathToFileURL } from 'node:url';

/**
 * returnsFromSeries(series) -> number[]
 * series = [[ts, price], ...] sorted ascending.
 * Returns array of simple returns (p[i]-p[i-1])/p[i-1].
 * Skips any step where either price is <= 0 or the result is non-finite.
 */
export function returnsFromSeries(series) {
  if (!Array.isArray(series) || series.length < 2) return [];
  const rets = [];
  for (let i = 1; i < series.length; i++) {
    const prev = Number(series[i - 1][1]);
    const curr = Number(series[i][1]);
    if (prev <= 0 || curr <= 0) continue;
    const r = (curr - prev) / prev;
    if (Number.isFinite(r)) rets.push(r);
  }
  return rets;
}

/**
 * pearson(xs, ys) -> number
 * Pearson correlation over matched arrays of equal length >= 2.
 * Returns 0 on zero-variance or insufficient data.
 */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx, ey = ys[i] - my;
    num += ex * ey; dx2 += ex * ex; dy2 += ey * ey;
  }
  // Guard near-zero variance: compare sum-of-squared-deviations to sum-of-squared-values.
  // If the variance is < 1e-14 of the total signal power, treat as zero-variance.
  const xPow = xs.reduce((s, v) => s + v * v, 0) || 1;
  const yPow = ys.reduce((s, v) => s + v * v, 0) || 1;
  if (dx2 / xPow < 1e-14 || dy2 / yPow < 1e-14) return 0;
  const r = num / Math.sqrt(dx2 * dy2);
  return Number.isFinite(r) ? r : 0;
}

/**
 * leadLag(leaderRets, laggerRets, maxLag = 5) -> { bestLag, corr }
 * For each lag k in 1..maxLag, computes Pearson corr between
 * leaderRets[0..n-k-1] (leader at t-k) and laggerRets[k..n-1] (lagger at t).
 * Returns the k with max |corr| and that corr (signed).
 * Returns { bestLag: 0, corr: 0 } when fewer than 10 paired points are available
 * at every lag.
 */
export function leadLag(leaderRets, laggerRets, maxLag = 5) {
  const n = Math.min(leaderRets.length, laggerRets.length);
  let bestLag = 0, bestCorr = 0;
  for (let k = 1; k <= maxLag; k++) {
    if (n - k < 10) continue; // insufficient overlap
    const xs = leaderRets.slice(0, n - k);   // leader at t-k
    const ys = laggerRets.slice(k, n);        // lagger at t
    const r = pearson(xs, ys);
    if (Math.abs(r) > Math.abs(bestCorr)) {
      bestCorr = r;
      bestLag = k;
    }
  }
  return { bestLag, corr: bestCorr };
}

/**
 * leadLagToSignal(laggerMarket, leaderRecentRet, corr, bestLag, ts, opts) -> signal | null
 * Converts a lead/lag result into an advisory signal for the lagger.
 * Suppressed when |corr| < corrThreshold (default 0.15), bestLag < 1,
 * or leaderRecentRet is non-finite.
 */
export function leadLagToSignal(laggerMarket, leaderRecentRet, corr, bestLag, ts, opts = {}) {
  const threshold = Number.isFinite(opts.corrThreshold) ? opts.corrThreshold : 0.15;
  if (Math.abs(corr) < threshold) return null;
  if (bestLag < 1) return null;
  if (!Number.isFinite(leaderRecentRet)) return null;

  // Direction: positive corr → lagger follows leader; negative → inverts.
  const aligned = corr > 0 ? leaderRecentRet : -leaderRecentRet;
  const side = aligned > 0 ? 'long' : 'short';

  // Confidence: starts at 0.35, scales with excess corr above threshold, capped 0.65.
  const confidence = Math.min(0.65, 0.35 + (Math.abs(corr) - threshold) * 0.6);

  return {
    factorId: `xasset-lead-${laggerMarket}`,
    value: corr,
    side,
    confidence,
    ts,
    source: 'xasset',
  };
}

/**
 * computeCrossAssetSignals(marketSeries, opts) -> signal[]
 * Pure, synchronous, fail-open. Accepts injected price series and emits
 * one advisory signal per non-leader market (the strongest-correlated leader wins).
 *
 * @param {{ [market: string]: [ts: number, price: number][] }} marketSeries
 * @param {object} [opts]
 *   - leaders: string[] — default ['BTC-USD','ETH-USD']
 *   - maxLag: number — default 5
 *   - corrThreshold: number — default 0.15
 */
export function computeCrossAssetSignals(marketSeries, opts = {}) {
  try {
    if (!marketSeries || typeof marketSeries !== 'object') return [];
    const leaders = Array.isArray(opts.leaders) ? opts.leaders : ['BTC-USD', 'ETH-USD'];
    const maxLag = Number.isFinite(opts.maxLag) ? opts.maxLag : 5;
    const markets = Object.keys(marketSeries);
    const signals = [];

    // Precompute leader returns.
    const leaderRetCache = {};
    for (const L of leaders) {
      if (marketSeries[L]) {
        leaderRetCache[L] = returnsFromSeries(marketSeries[L]);
      }
    }

    const availableLeaders = leaders.filter((L) => leaderRetCache[L]);
    if (availableLeaders.length === 0) return [];

    for (const G of markets) {
      // Leaders get no signal against themselves.
      if (leaders.includes(G)) continue;

      const gRets = returnsFromSeries(marketSeries[G]);
      if (gRets.length < 2) continue;

      // Last ts for this market.
      const series = marketSeries[G];
      const lastTs = Number(series[series.length - 1][0]);

      // Find the strongest leader.
      let bestSig = null;
      let bestAbsCorr = 0;

      for (const L of availableLeaders) {
        if (L === G) continue; // never self-compare (already guarded above but be safe)
        const { bestLag, corr } = leadLag(leaderRetCache[L], gRets, maxLag);
        if (Math.abs(corr) <= bestAbsCorr) continue;

        // Leader's most recent return.
        const lRets = leaderRetCache[L];
        const leaderRecentRet = lRets.length > 0 ? lRets[lRets.length - 1] : NaN;

        const sig = leadLagToSignal(G, leaderRecentRet, corr, bestLag, lastTs, opts);
        if (sig) {
          bestSig = sig;
          bestAbsCorr = Math.abs(corr);
        }
      }

      if (bestSig) signals.push(bestSig);
    }

    return signals;
  } catch (_e) {
    // fail-open
    return [];
  }
}

// ── --test self-test (deterministic, no network, no real files) ──────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (c, label) => {
    if (c) { pass++; }
    else { fail++; console.error(`FAIL: ${label}`); }
  };

  // ── returnsFromSeries ──────────────────────────────────────────────────────
  const r1 = returnsFromSeries([[0, 100], [1, 110], [2, 99]]);
  assert(r1.length === 2, 'returnsFromSeries: 3 prices -> 2 returns');
  assert(Math.abs(r1[0] - 0.1) < 1e-10, 'returnsFromSeries: first return = 0.1');
  assert(returnsFromSeries([]).length === 0, 'returnsFromSeries: empty -> []');
  assert(returnsFromSeries([[0, 0], [1, 100]]).length === 0, 'returnsFromSeries: price=0 skipped');
  assert(returnsFromSeries([[0, -1], [1, 100]]).length === 0, 'returnsFromSeries: negative price skipped');
  assert(returnsFromSeries([[0, 100]]).length === 0, 'returnsFromSeries: single point -> []');

  // ── leadLag ───────────────────────────────────────────────────────────────
  // Synthetic: lagger = leader shifted by 2, so corr at lag=2 should be ~1.
  const base = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.4) * 0.01 + 0.001);
  const lagged2 = base.slice(0, base.length); // same length
  // lagger at t = leader at t-2 (copy with offset): build leader and lagger
  const leaderR = base.slice(0);
  const laggerR = base.slice(0); // same values, but we shift via leadLag's index logic
  // Actually build a truly lagged set: leader = base[0..29]; lagger = base[0..29] shifted
  // leadLag checks leader[0..n-k-1] vs lagger[k..n-1].
  // So if we set laggerR = base but offset by 2: laggerR[i] = leaderR[i-2] for i>=2.
  // Construct explicitly:
  const leaderFull = Array.from({ length: 40 }, (_, i) => Math.sin(i * 0.5) * 0.02 + 0.001);
  const laggerFull = Array.from({ length: 40 }, (_, i) => (i >= 2 ? leaderFull[i - 2] : 0.001));
  const { bestLag: bl1, corr: c1 } = leadLag(leaderFull, laggerFull, 5);
  assert(bl1 === 2, `leadLag: detects bestLag=2 (got ${bl1})`);
  assert(c1 > 0.9, `leadLag: high positive corr at lag 2 (got ${c1.toFixed(4)})`);

  // insufficient data -> {bestLag:0, corr:0}
  const { bestLag: bl2, corr: c2 } = leadLag([0.01, 0.02], [0.01, 0.02], 5);
  assert(bl2 === 0 && c2 === 0, 'leadLag: insufficient data -> {0,0}');

  // zero-variance leader -> corr=0
  const flat = new Array(30).fill(0.005);
  const { corr: c3 } = leadLag(flat, leaderFull.slice(0, 30), 3);
  assert(c3 === 0, 'leadLag: zero-variance leader -> corr=0');

  // ── leadLagToSignal ───────────────────────────────────────────────────────
  // Strong positive corr + positive leader ret -> long
  const sigLong = leadLagToSignal('SOL-USD', 0.02, 0.8, 2, 1000);
  assert(sigLong !== null, 'leadLagToSignal: strong positive corr -> signal');
  assert(sigLong.side === 'long', 'leadLagToSignal: pos corr + pos leader -> long');
  assert(sigLong.factorId === 'xasset-lead-SOL-USD', 'leadLagToSignal: factorId correct');
  assert(sigLong.confidence <= 0.65, `leadLagToSignal: confidence capped <= 0.65 (got ${sigLong.confidence})`);
  assert(sigLong.source === 'xasset', 'leadLagToSignal: source=xasset');
  assert(sigLong.value === 0.8, 'leadLagToSignal: value = corr');

  // Anti-correlated: pos corr but neg leader ret -> short
  const sigShort = leadLagToSignal('SOL-USD', -0.02, 0.8, 2, 1000);
  assert(sigShort && sigShort.side === 'short', 'leadLagToSignal: pos corr + neg leader -> short');

  // Anti-lead (corr < 0): neg corr + pos leader -> short (inverted)
  const sigAnti = leadLagToSignal('SOL-USD', 0.02, -0.8, 2, 1000);
  assert(sigAnti && sigAnti.side === 'short', 'leadLagToSignal: neg corr (anti-lead) + pos leader -> short');

  // Anti-lead: neg corr + neg leader -> long (double inversion)
  const sigAnti2 = leadLagToSignal('SOL-USD', -0.02, -0.8, 2, 1000);
  assert(sigAnti2 && sigAnti2.side === 'long', 'leadLagToSignal: neg corr + neg leader -> long');

  // Sub-threshold -> null
  assert(leadLagToSignal('SOL-USD', 0.02, 0.05, 2, 1000) === null, 'leadLagToSignal: sub-threshold -> null');
  // bestLag < 1 -> null
  assert(leadLagToSignal('SOL-USD', 0.02, 0.8, 0, 1000) === null, 'leadLagToSignal: bestLag=0 -> null');
  // non-finite leader ret -> null
  assert(leadLagToSignal('SOL-USD', NaN, 0.8, 2, 1000) === null, 'leadLagToSignal: NaN leader ret -> null');

  // ── computeCrossAssetSignals end-to-end ───────────────────────────────────
  // Build synthetic market series: BTC leads SOL by 2 bars.
  // BTC prices ascend overall (last return positive).
  function buildSeries(baseVals, startTs = 1_000_000) {
    return baseVals.map((p, i) => [startTs + i * 60, p]);
  }

  // BTC: smooth uptrend with sine wobble.
  const N = 50;
  const btcPrices = Array.from({ length: N }, (_, i) => 60000 + i * 10 + Math.sin(i * 0.5) * 200);
  // SOL: lagged copy of BTC by 2, scaled.
  const solPrices = Array.from({ length: N }, (_, i) => {
    const src = i >= 2 ? btcPrices[i - 2] : btcPrices[0];
    return (src / 60000) * 120; // scale to ~SOL prices
  });
  // Flat/noise market (should yield no signal above threshold).
  const flatPrices = new Array(N).fill(10.0);

  const marketSeries = {
    'BTC-USD': buildSeries(btcPrices),
    'SOL-USD': buildSeries(solPrices),
    'FLAT-USD': buildSeries(flatPrices),
  };

  const sigs = computeCrossAssetSignals(marketSeries);

  // BTC is a leader -> no signal for BTC.
  assert(!sigs.find((s) => s.factorId.includes('BTC-USD')), 'computeCrossAssetSignals: BTC (leader) gets no signal');

  // SOL should get a signal with xasset-lead-SOL-USD.
  const solSig = sigs.find((s) => s.factorId === 'xasset-lead-SOL-USD');
  assert(solSig != null, 'computeCrossAssetSignals: SOL gets xasset-lead-SOL-USD signal');

  // BTC's last return: btcPrices is ascending -> last return positive -> SOL signal should be long.
  assert(solSig && solSig.side === 'long', `computeCrossAssetSignals: SOL signal side=long (matches BTC uptrend, got ${solSig?.side})`);
  assert(solSig && solSig.confidence <= 0.65, 'computeCrossAssetSignals: SOL signal confidence <= 0.65');
  assert(solSig && solSig.source === 'xasset', 'computeCrossAssetSignals: source=xasset');

  // Flat market should not generate a signal (zero-variance returns -> corr=0 -> sub-threshold).
  const flatSig = sigs.find((s) => s.factorId === 'xasset-lead-FLAT-USD');
  assert(!flatSig, 'computeCrossAssetSignals: flat/zero-variance market -> no signal');

  // Anti-correlated market: ETH-USD present as leader, ANTI-USD is anti-correlated to BTC.
  const antiPrices = Array.from({ length: N }, (_, i) => {
    const src = i >= 2 ? btcPrices[i - 2] : btcPrices[0];
    // Invert: when BTC goes up, ANTI goes down.
    return (1 / (src / 60000)) * 50;
  });
  const marketSeries2 = {
    'BTC-USD': buildSeries(btcPrices),
    'ANTI-USD': buildSeries(antiPrices),
  };
  const sigs2 = computeCrossAssetSignals(marketSeries2);
  const antiSig = sigs2.find((s) => s.factorId === 'xasset-lead-ANTI-USD');
  assert(antiSig != null, 'computeCrossAssetSignals: anti-correlated market gets a signal');
  // BTC ascending (last ret positive), anti-lead (corr < 0) -> side should be SHORT.
  assert(antiSig && antiSig.side === 'short', `computeCrossAssetSignals: anti-correlated side=short (got ${antiSig?.side})`);

  // Fail-open: garbage input -> [].
  assert(computeCrossAssetSignals(null).length === 0, 'computeCrossAssetSignals: null input -> []');
  assert(computeCrossAssetSignals({}).length === 0, 'computeCrossAssetSignals: no leaders in empty obj -> []');

  // Custom leaders opt.
  const marketSeries3 = {
    'ETH-USD': buildSeries(btcPrices), // use btcPrices as ETH stand-in for strong lag
    'SOL-USD': buildSeries(solPrices),
  };
  const sigs3 = computeCrossAssetSignals(marketSeries3, { leaders: ['ETH-USD'] });
  const solSig3 = sigs3.find((s) => s.factorId === 'xasset-lead-SOL-USD');
  assert(solSig3 != null, 'computeCrossAssetSignals: custom leader ETH-USD -> SOL signal');

  // Print example signal.
  if (solSig) {
    console.log('example signal:', JSON.stringify(solSig, null, 2));
  }

  console.log(`cross-asset-signal --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
