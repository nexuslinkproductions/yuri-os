#!/usr/bin/env node
// gex-compute.test.mjs — red/grey/green for GEX + the BS kernel (MURE gap-3).
// Run: node --test _SYSTEM/Scripts/alpha-factor-library/gex-compute.test.mjs
// BS reference values are textbook-standard hand checks (S=K=100, σ=0.2, T=1, r=0:
// d1=0.1, call=7.9656, gamma=0.019848).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FLAG_DIR = mkdtempSync(path.join(tmpdir(), 'mure-gex-'));
const FLAG = path.join(FLAG_DIR, 'mure-gex.enabled');
process.env.MURE_FLAG_DIR = FLAG_DIR;
const arm = () => writeFileSync(FLAG, '1');
const disarm = () => { try { unlinkSync(FLAG); } catch { /* absent */ } };

const { bsPrice, bsGamma, impliedVol, computeStrikeGEX, computeGEX, gexRegime, gexSignals, gexPromotionGate } =
  await import('./gex-compute.mjs');

test.after(() => { rmSync(FLAG_DIR, { recursive: true, force: true }); });

// ═══ RED — DISARMED degrade ═══════════════════════════════════════════════════

test('DISARMED: zero/empty/NaN degrades, no throw', () => {
  disarm();
  assert.ok(Number.isNaN(bsPrice({ spot: 100, strike: 100, iv: 0.2, tYears: 1 })));
  assert.ok(Number.isNaN(bsGamma({ spot: 100, strike: 100, iv: 0.2, tYears: 1 })));
  assert.equal(impliedVol({ price: 8, spot: 100, strike: 100, tYears: 1 }).converged, false);
  assert.equal(computeStrikeGEX({ gamma: 0.02, openInterest: 1000, spot: 100 }), 0);
  assert.deepEqual(computeGEX([{ strike: 100, gamma: 0.02, openInterest: 10, type: 'call' }], { spot: 100 }), { strikes: [], totalGEX: 0, gammaFlip: null });
  assert.equal(gexRegime(1000, 99, 100), null);
  assert.deepEqual(gexSignals({ strikes: [{ strike: 1, gex: 1, cumulativeGEX: 1 }], totalGEX: -1, gammaFlip: 99 }, { spot: 100 }), []);
  assert.equal(gexPromotionGate([0.01, 0.01, 0.01, 0.01]).promote, false);
});

// ═══ GREEN — Black-Scholes kernel (hand-checked references) ═══════════════════

test('BS PRICE: textbook reference values + put-call parity', () => {
  arm();
  const call = bsPrice({ spot: 100, strike: 100, iv: 0.2, tYears: 1, type: 'call' });
  assert.ok(Math.abs(call - 7.9656) < 2e-3, `ATM call ≈ 7.9656 (got ${call.toFixed(4)})`);
  const put = bsPrice({ spot: 100, strike: 100, iv: 0.2, tYears: 1, type: 'put' });
  assert.ok(Math.abs(put - 7.9656) < 2e-3, 'r=0 ATM put = call by parity');
  // Put-call parity across moneyness: C − P = S − K·e^(−rT)
  for (const K of [80, 95, 110, 130]) {
    const c = bsPrice({ spot: 100, strike: K, iv: 0.35, tYears: 0.5, rate: 0.03, type: 'call' });
    const p = bsPrice({ spot: 100, strike: K, iv: 0.35, tYears: 0.5, rate: 0.03, type: 'put' });
    const parity = 100 - K * Math.exp(-0.03 * 0.5);
    assert.ok(Math.abs((c - p) - parity) < 1e-6, `parity holds at K=${K}`);
  }
  // Degenerate limits: T=0 → intrinsic; deep ITM call → S−K·disc; garbage → NaN
  assert.equal(bsPrice({ spot: 110, strike: 100, iv: 0.2, tYears: 0, type: 'call' }), 10);
  assert.equal(bsPrice({ spot: 90, strike: 100, iv: 0.2, tYears: 0, type: 'call' }), 0);
  assert.ok(Number.isNaN(bsPrice({ spot: -5, strike: 100, iv: 0.2, tYears: 1 })));
});

test('BS GAMMA: reference value, call≡put, ATM peak, degenerate NaN', () => {
  arm();
  const g = bsGamma({ spot: 100, strike: 100, iv: 0.2, tYears: 1 });
  assert.ok(Math.abs(g - 0.019848) < 1e-4, `ATM gamma ≈ 0.019848 (got ${g.toFixed(6)})`);
  // Gamma peaks near ATM, decays into the wings:
  const wing = bsGamma({ spot: 100, strike: 150, iv: 0.2, tYears: 1 });
  assert.ok(wing < g, 'wing gamma < ATM gamma');
  assert.ok(wing > 0, 'gamma always positive');
  assert.ok(Number.isNaN(bsGamma({ spot: 100, strike: 100, iv: 0, tYears: 1 })), 'σ=0 → NaN not Infinity');
  assert.ok(Number.isNaN(bsGamma({ spot: 100, strike: 100, iv: 0.2, tYears: 0 })));
});

test('IMPLIED VOL: round-trips bsPrice across moneyness/vol/type; refuses no-arb prices', () => {
  arm();
  for (const { K, iv, T: ty, type, r } of [
    { K: 100, iv: 0.20, T: 1, type: 'call', r: 0 },
    { K: 100, iv: 0.35, T: 0.5, type: 'put', r: 0.02 },
    { K: 80, iv: 0.55, T: 0.25, type: 'call', r: 0.05 },
    { K: 120, iv: 0.15, T: 2, type: 'put', r: 0.01 },
    { K: 5200, iv: 0.18, T: 0.08, type: 'call', r: 0.04 }, // SPX-ish short-dated
  ]) {
    const spot = K > 1000 ? 5000 : 100;
    const price = bsPrice({ spot, strike: K, iv, tYears: ty, rate: r, type });
    const sol = impliedVol({ price, spot, strike: K, tYears: ty, rate: r, type });
    assert.ok(sol.converged, `converged for K=${K} σ=${iv} ${type}`);
    assert.ok(Math.abs(sol.iv - iv) < 1e-4, `recovered σ=${iv} (got ${sol.iv.toFixed(6)}) K=${K} ${type}`);
  }
  // No-arbitrage refusals (fail closed, not garbage):
  assert.equal(impliedVol({ price: 0.0001, spot: 100, strike: 60, tYears: 0.5, type: 'call' }).converged, false, 'price below intrinsic refused');
  assert.equal(impliedVol({ price: 101, spot: 100, strike: 100, tYears: 1, type: 'call' }).converged, false, 'price above spot refused');
  assert.equal(impliedVol({ price: -1, spot: 100, strike: 100, tYears: 1 }).converged, false);
  assert.equal(impliedVol({ price: 5, spot: 100, strike: 100, tYears: 0 }).converged, false);
});

// ═══ GREEN — GEX arithmetic (hand-computed) ═══════════════════════════════════

test('computeStrikeGEX: hand-computed contribution + sign + garbage guards', () => {
  arm();
  // 0.02 × 1000 × 100 × 100² × 0.01 × (+1) = 200,000
  assert.equal(computeStrikeGEX({ gamma: 0.02, openInterest: 1000, spot: 100, multiplier: 100, sign: 1 }), 200_000);
  assert.equal(computeStrikeGEX({ gamma: 0.02, openInterest: 1000, spot: 100, multiplier: 100, sign: -1 }), -200_000);
  // Non-equity multiplier (Deribit BTC = 1 — the Lane-D unit-bug flag):
  assert.equal(computeStrikeGEX({ gamma: 0.02, openInterest: 1000, spot: 100, multiplier: 1, sign: 1 }), 2_000);
  assert.equal(computeStrikeGEX({ gamma: NaN, openInterest: 1000, spot: 100 }), 0);
  assert.equal(computeStrikeGEX({ gamma: -0.01, openInterest: 1000, spot: 100 }), 0, 'negative gamma input is corrupt → 0');
});

test('computeGEX: per-strike aggregation, cumulative profile, interpolated gamma flip', () => {
  arm();
  const g = (strike, type, gamma, oi) => ({ strike, type, gamma, openInterest: oi });
  // puts at 4900 (−), calls at 5000/5100 (+); spot 5000, mult 100. Unit = γ·OI·100·spot²·0.01.
  const unit = 100 * 5000 * 5000 * 0.01; // 25,000,000 per (γ·OI)
  const chain = [
    g(4900, 'put', 0.001, 10000),   // −0.001·10000·unit = −10·unit… careful: γ·OI = 10 → −10·unit? No:
    g(5000, 'call', 0.002, 15000),  // γ·OI = 30 → +30·unit-scaled
    g(5100, 'call', 0.001, 8000),   // γ·OI = 8
    g(5000, 'put', 0.0005, 4000),   // γ·OI = 2 → −2 at 5000 (nets against the call there)
  ];
  const res = computeGEX(chain, { spot: 5000, multiplier: 100 });
  const exp4900 = -0.001 * 10000 * unit;
  const exp5000 = (0.002 * 15000 - 0.0005 * 4000) * unit; // call + put NETTED at the same strike
  const exp5100 = 0.001 * 8000 * unit;
  assert.equal(res.strikes.length, 3, 'same-strike call+put netted into one row');
  assert.ok(Math.abs(res.strikes[0].gex - exp4900) < 1e-3, 'put strike negative');
  assert.ok(Math.abs(res.strikes[1].gex - exp5000) < 1e-3, 'netted strike');
  assert.ok(Math.abs(res.strikes[2].gex - exp5100) < 1e-3);
  assert.ok(Math.abs(res.totalGEX - (exp4900 + exp5000 + exp5100)) < 1e-3);
  // cumulative: 4900 → negative; crosses zero between 4900 and 5000 → interpolated flip in (4900,5000)
  assert.ok(res.strikes[0].cumulativeGEX < 0);
  assert.ok(res.strikes[1].cumulativeGEX > 0);
  assert.ok(res.gammaFlip > 4900 && res.gammaFlip < 5000, `flip interpolated between 4900 and 5000 (got ${res.gammaFlip})`);
  // Hand-check the interpolation: t = −cum_a/(cum_b−cum_a)
  const cumA = exp4900, cumB = exp4900 + exp5000;
  const expFlip = 4900 + (-cumA / (cumB - cumA)) * 100;
  assert.ok(Math.abs(res.gammaFlip - expFlip) < 1e-6, 'linear interpolation exact');
  // All-positive chain → no crossing → flip null
  const noFlip = computeGEX([g(5000, 'call', 0.001, 1000), g(5100, 'call', 0.001, 1000)], { spot: 5000 });
  assert.equal(noFlip.gammaFlip, null);
  // Garbage rows skipped, never invented:
  const dirty = computeGEX([g(5000, 'call', NaN, 1000), g(5100, 'wat', 0.001, 1000), { strike: 5200 }], { spot: 5000 });
  assert.deepEqual(dirty, { strikes: [], totalGEX: 0, gammaFlip: null }, 'all-garbage chain → degrade shape');
  assert.deepEqual(computeGEX([], { spot: 5000 }), { strikes: [], totalGEX: 0, gammaFlip: null });
  assert.deepEqual(computeGEX(null, { spot: 5000 }), { strikes: [], totalGEX: 0, gammaFlip: null });
});

test('END-TO-END: NBBO mid → impliedVol → bsGamma → computeGEX (the greeks-free OPRA path)', () => {
  arm();
  // Simulate the Databento reality: we get PRICES, not greeks. σ_true=0.25 both legs.
  // OI chosen so call γ·OI outweighs put γ·OI (γ_put(4800)≈0.000846·12000≈10.2 <
  // γ_call(5200)≈0.000924·14000≈12.9) → the cumulative profile genuinely crosses zero.
  const spot = 5000, tYears = 0.1, rate = 0.03;
  const legs = [
    { strike: 4800, type: 'put', oi: 12000 },
    { strike: 5200, type: 'call', oi: 14000 },
  ];
  const chain = legs.map((l) => {
    const mid = bsPrice({ spot, strike: l.strike, iv: 0.25, tYears, rate, type: l.type }); // "NBBO mid"
    const { iv, converged } = impliedVol({ price: mid, spot, strike: l.strike, tYears, rate, type: l.type });
    assert.ok(converged, `IV solve converged at ${l.strike}`);
    return { strike: l.strike, type: l.type, gamma: bsGamma({ spot, strike: l.strike, iv, tYears, rate }), openInterest: l.oi, iv };
  });
  const res = computeGEX(chain, { spot, multiplier: 100 });
  assert.equal(res.strikes.length, 2);
  assert.ok(res.strikes[0].gex < 0, 'put leg negative GEX');
  assert.ok(res.strikes[1].gex > 0, 'call leg positive GEX');
  assert.ok(Number.isFinite(res.totalGEX));
  assert.ok(res.gammaFlip > 4800 && res.gammaFlip < 5200, 'flip between the legs');
});

// ═══ GREEN — regime + signals + gate ══════════════════════════════════════════

test('gexRegime: classification + nearFlip band', () => {
  arm();
  assert.deepEqual(gexRegime(5e8, 4900, 5000), { regime: 'positive', nearFlip: false, distancePct: 2 });
  const neg = gexRegime(-5e8, 4995, 5000);
  assert.equal(neg.regime, 'negative');
  assert.equal(neg.nearFlip, true, 'within 1% of flip');
  assert.equal(gexRegime(1e8, null, 5000).distancePct, null, 'no flip → null distance, still classified');
  assert.equal(gexRegime(NaN, 1, 100), null);
});

test('gexSignals: negative regime emits capped directional; positive stays silent by default', () => {
  arm();
  const mk = (totalGEX, gammaFlip) => ({ strikes: [{ strike: 1, gex: totalGEX, cumulativeGEX: totalGEX }], totalGEX, gammaFlip });
  // negative + spot below flip → short (downside amplification)
  let s = gexSignals(mk(-8e8, 5050), { market: 'SPX-USD', ts: 1_750_000_000, spot: 5000 });
  assert.equal(s.length, 1);
  assert.equal(s[0].side, 'short');
  assert.equal(s[0].factorId, 'gex-regime-SPX-USD');
  assert.equal(s[0].source, 'gex');
  assert.ok(s[0].confidence <= 0.40, `hypothesis-grade cap 0.40 (got ${s[0].confidence})`);
  assert.equal(s[0].ts, 1_750_000_000);
  // negative + spot above flip → long
  s = gexSignals(mk(-8e8, 4950), { market: 'SPX-USD', ts: 1, spot: 5000 });
  assert.equal(s[0].side, 'long');
  // positive regime → silent by default; flat marker only when explicitly requested
  assert.deepEqual(gexSignals(mk(8e8, 4950), { market: 'SPX-USD', ts: 1, spot: 5000 }), []);
  const marker = gexSignals(mk(8e8, 4950), { market: 'SPX-USD', ts: 1, spot: 5000, emitPositiveRegime: true });
  assert.equal(marker[0].side, 'flat');
  assert.ok(marker[0].confidence <= 0.15);
  // garbage → []
  assert.deepEqual(gexSignals(mk(-8e8, 5050), { spot: NaN }), []);
  assert.deepEqual(gexSignals({ strikes: [] }, { spot: 5000 }), []);
});

test('gexPromotionGate: routes through the EXISTING DSR gate — edge promotes, noise does not', () => {
  arm();
  let seed = 77;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const edge = Array.from({ length: 500 }, () => 0.003 + 0.01 * gauss());
  const good = gexPromotionGate(edge, { nTrials: 5 });
  assert.equal(good.promote, true, `edge promotes (${good.reasons.join(' | ')})`);
  assert.ok(good.dsr > 0.95);
  const noise = Array.from({ length: 500 }, () => 0.01 * gauss());
  assert.equal(gexPromotionGate(noise, { nTrials: 5 }).promote, false, 'noise fails the reused gate');
  assert.equal(gexPromotionGate([0.01, 0.02]).promote, false, 'thin evidence refused');
});
