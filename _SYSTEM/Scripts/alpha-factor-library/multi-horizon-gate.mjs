#!/usr/bin/env node
// @capability: multi-horizon-gate
// @serves: multi-horizon entry gate | which horizon beats the fee | 3-5 time horizon edge | horizon selection | trade-the-right-timeframe | fee-aware horizon
// @does: Picks the trading horizon whose expected price move actually clears the REALISTIC round-trip fee. At each candidate horizon the expected move = per-bar vol * sqrt(bars) * conviction; a horizon "clears" if that move >= the round-trip cost. Returns the SHORTEST clearing horizon (fastest edge realization, least time-at-risk) or null = stay flat. This is why realistic fees FORCE multi-horizon: at real fees a 1-min move can't beat the cost, but a 3h/12h move dwarfs it.
// @use: call selectHorizon({volPerBar, conviction, roundTripCost}) in the entry gate when oc.multiHorizon is armed — DISARMED by default, the legacy single-horizon (sqrt 5) path stays the floor. realisticRoundTripCost() derives the hurdle from the live fee model. The chosen horizon must ALSO drive the position hold-time (a 3h-horizon trade held 5min defeats the point).
// @exports: DEFAULT_HORIZONS, expectedMove, realisticRoundTripCost, selectHorizon
//
// CONSTRAINTS: pure + deterministic + offline-testable (no IO, no network, no orders — INV-1).
// No new npm dependency. The caller owns arming + the hold-time coupling.

import { pathToFileURL } from 'node:url';

// Candidate horizons on 1-min bars, ascending (so the FIRST clearing one is the shortest).
// bars = number of 1-min bars in the horizon. Marcel's "at least 3-5 time horizons".
export const DEFAULT_HORIZONS = Object.freeze([
  Object.freeze({ key: '5m',  bars: 5 }),
  Object.freeze({ key: '30m', bars: 30 }),
  Object.freeze({ key: '1h',  bars: 60 }),
  Object.freeze({ key: '3h',  bars: 180 }),
  Object.freeze({ key: '12h', bars: 720 }),
  Object.freeze({ key: '1w',  bars: 10080 }),
]);

/**
 * expectedMove(volPerBar, bars, conviction) -> fraction
 * Random-walk scaling: a per-bar vol fraction grows with sqrt(time). conviction in [0,1]
 * scales it down (a weak signal earns less of the move). Returns 0 on invalid input.
 */
export function expectedMove(volPerBar, bars, conviction = 1) {
  const v = Number(volPerBar);
  const b = Number(bars);
  if (!(v > 0) || !(b > 0)) return 0;
  const c = Math.max(0, Math.min(1, Number.isFinite(conviction) ? conviction : 1));
  return v * Math.sqrt(b) * c;
}

/**
 * realisticRoundTripCost({ takerRate, spreadFrac }) -> fraction
 * The hurdle a trade must clear to be worth taking: pay the taker fee on BOTH sides
 * plus cross the spread once. Defaults match the realistic Coinbase Advanced Trade entry
 * tier (taker 0.60%) + the engine's DEFAULT_SPREAD_FRAC (0.05%). rt ≈ 1.25%.
 */
export function realisticRoundTripCost({ takerRate = 0.006, spreadFrac = 0.0005 } = {}) {
  const t = Number.isFinite(takerRate) && takerRate >= 0 ? takerRate : 0.006;
  const s = Number.isFinite(spreadFrac) && spreadFrac >= 0 ? spreadFrac : 0.0005;
  return 2 * t + s;
}

/**
 * selectHorizon({ volPerBar, conviction, roundTripCost, horizons?, marginFactor? })
 *   -> { horizon, bars, holdSec, expMove, edgeAfterCost, clears: true } | null
 *
 * Returns the SHORTEST horizon whose expected move clears roundTripCost * marginFactor,
 * or null when no horizon clears (→ stay flat; realistic fees can't be beaten here).
 * holdSec = bars * 60 (1-min bars) — the caller MUST hold roughly this long for the
 * expected move to materialize (a horizon trade closed early loses to the fee).
 */
export function selectHorizon({
  volPerBar,
  conviction = 1,
  roundTripCost,
  horizons = DEFAULT_HORIZONS,
  marginFactor = 1.0,
} = {}) {
  const rt = Number(roundTripCost);
  if (!(rt > 0)) return null;
  const margin = Number.isFinite(marginFactor) && marginFactor > 0 ? marginFactor : 1.0;
  const hurdle = rt * margin;
  const list = Array.isArray(horizons) ? horizons : DEFAULT_HORIZONS;
  for (const h of list) {
    if (!h || !(h.bars > 0)) continue;
    const em = expectedMove(volPerBar, h.bars, conviction);
    if (em >= hurdle) {
      return {
        horizon: h.key,
        bars: h.bars,
        holdSec: h.bars * 60,
        expMove: em,
        edgeAfterCost: em - rt,
        clears: true,
      };
    }
  }
  return null; // no horizon clears → flat
}

// ── --test (offline, deterministic) ─────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // expectedMove
  ok(expectedMove(0.0015, 5, 1) > 0, 'expectedMove positive on valid input');
  ok(expectedMove(0.0015, 180, 1) > expectedMove(0.0015, 5, 1), 'longer horizon → bigger expected move');
  ok(Math.abs(expectedMove(0.001, 100, 1) - 0.01) < 1e-9, 'expectedMove: 0.001*sqrt(100)=0.01');
  ok(expectedMove(0.0015, 180, 0.5) < expectedMove(0.0015, 180, 1), 'lower conviction → smaller move');
  ok(expectedMove(0.0015, 180, 2) === expectedMove(0.0015, 180, 1), 'conviction clamped to 1');
  ok(expectedMove(0, 180, 1) === 0, 'zero vol → 0');
  ok(expectedMove(0.0015, 0, 1) === 0, 'zero bars → 0');
  ok(expectedMove(-1, 180, 1) === 0, 'negative vol → 0');

  // realisticRoundTripCost
  ok(Math.abs(realisticRoundTripCost() - 0.0125) < 1e-9, 'default rt = 2*0.006+0.0005 = 0.0125');
  ok(Math.abs(realisticRoundTripCost({ takerRate: 0.001, spreadFrac: 0 }) - 0.002) < 1e-9, 'in-code rt = 0.002');
  ok(realisticRoundTripCost({ takerRate: NaN }) === 0.0125, 'bad taker → default');

  // selectHorizon — THE KEY ASSERTION: realistic fees force long horizons.
  // vol 0.0015/bar, conviction 1, rt 0.0125:
  //  5m: 0.0015*sqrt(5)=0.00335   <0.0125  no
  //  30m:0.0015*sqrt(30)=0.00822  <0.0125  no
  //  1h: 0.0015*sqrt(60)=0.01162  <0.0125  no
  //  3h: 0.0015*sqrt(180)=0.02012 >=0.0125 YES → selects 3h (shortest clearing)
  {
    const sel = selectHorizon({ volPerBar: 0.0015, conviction: 1, roundTripCost: 0.0125 });
    ok(sel && sel.horizon === '3h', `realistic fee → shortest clearing horizon = 3h (got ${sel?.horizon})`);
    ok(sel && sel.holdSec === 180 * 60, '3h holdSec = 10800s');
    ok(sel && sel.edgeAfterCost > 0, 'edgeAfterCost positive');
  }
  // at the OLD optimistic fee (rt 0.002) even 5m clears → trades fire short (the old churn)
  {
    const sel = selectHorizon({ volPerBar: 0.0015, conviction: 1, roundTripCost: 0.002 });
    ok(sel && sel.horizon === '5m', `cheap fee → 5m clears (the old churn regime) (got ${sel?.horizon})`);
  }
  // no horizon clears (tiny vol + realistic fee) → null → flat
  {
    const sel = selectHorizon({ volPerBar: 0.00001, conviction: 1, roundTripCost: 0.0125 });
    ok(sel === null, 'tiny vol vs realistic fee → no horizon clears → flat');
  }
  // weak conviction pushes the clearing horizon LONGER
  {
    const strong = selectHorizon({ volPerBar: 0.0015, conviction: 1.0, roundTripCost: 0.0125 });
    const weak   = selectHorizon({ volPerBar: 0.0015, conviction: 0.4, roundTripCost: 0.0125 });
    ok(weak && strong && weak.bars >= strong.bars, 'weaker conviction → needs a longer horizon to clear');
  }
  // marginFactor raises the bar
  {
    const base = selectHorizon({ volPerBar: 0.0015, conviction: 1, roundTripCost: 0.0125, marginFactor: 1.0 });
    const safe = selectHorizon({ volPerBar: 0.0015, conviction: 1, roundTripCost: 0.0125, marginFactor: 1.5 });
    ok(safe && base && safe.bars >= base.bars, 'higher marginFactor → longer/again horizon');
  }
  // guards
  ok(selectHorizon({ volPerBar: 0.0015, roundTripCost: 0 }) === null, 'zero cost → null (guard)');
  ok(selectHorizon({}) === null, 'empty args → null');

  console.log(`multi-horizon-gate --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
