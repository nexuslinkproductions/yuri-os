#!/usr/bin/env node
// @capability: orderflow-confluence
// @serves: orderflow confluence | multi-signal agreement | OFI OBI CVD confluence | anti-overtrading gate | N-of-M orderflow signal
// @does: Composes computeOBI/obiToSignals (orderbook-imbalance.mjs), computeMultiLevelOFI (ofi.mjs), and computeCVD/amtSignals (footprint-amt.mjs) into ONE directional vote per lens, then emits a single canonical 'orderflow-confluence' signal only when >=2 of 3 lenses agree — the anti-overtrading gate for orderflow-paper.mjs's raw-OBI entry (which overtraded: 8 round-trips / -15.8bps in a 45s BTCUSDT smoke run on OBI alone).
// @use: Reach for this instead of wiring computeOrderBookImbalance directly into a paper/live entry loop when churn from a single noisy lens is the failure mode; call confluenceSignal(inputs) once per book update with the freshest trades window.
// @exports: confluenceSignal
//
// CONSTRAINTS: pure math over injected inputs (no network, no I/O, no Date.now() in core —
// ts comes from book.ts), fail-open (structurally insufficient input → null), no new npm deps.
//
// MECHANISM (N-of-M confluence):
//   Lens 1 — OBI:      computeOBI(bids,asks) -> obiToSignals(...) -> vote = side of the
//                       'crypto-obi-<market>' signal if emitted (obeys DEFAULT_THRESHOLD=0.2
//                       noise floor already built into obiToSignals), else neutral.
//   Lens 2 — OFI:      computeMultiLevelOFI(prevBook, currBook) -> vote = result.sign (1/-1/0),
//                       requires prevBook (first tick / no prior book -> neutral, not an error).
//   Lens 3 — CVD:      computeCVD(trades,{tsUnit}) -> vote = sign of the LAST cumulative delta
//                       point (a persistence-style vote across the whole trades window, cheap
//                       and robust vs. single-trade noise). NOTE: footprint-amt.mjs is
//                       DISARMED-by-default (_SYSTEM/state/mure-footprint.enabled) — computeCVD
//                       degrades to [] when disarmed, so this lens is honestly neutral (no
//                       vote) until that flag is armed. amtSignals (VA breach regime) is used
//                       ONLY as a confidence nudge when it happens to be available and agrees
//                       with the CVD vote — it is never required for the CVD lens to vote.
//
//   Agreement: count how many of the 3 lenses voted 'long' and how many voted 'short'
//   (neutral lenses vote for neither). If max(longVotes, shortVotes) >= 2 -> directional
//   signal on that side. If longVotes === shortVotes (including 0===0, i.e. all-neutral,
//   or a straight 1-vs-1 split with the third neutral) -> side:'flat' (closes any open
//   position — the honest "no confluence" state). Structurally insufficient input
//   (no book, empty bids/asks) -> null, distinct from a legitimate flat call.
//
//   Confidence: base 0.35 for 2-lens agreement, 0.60 for 3-lens agreement, plus a small
//   magnitude nudge from the mean |lens value| of the AGREEING lenses (each lens's value
//   is scale-different — OBI/CVD-delta-sign in [-1,1]-ish, OFI raw sum unbounded — so the
//   nudge uses each lens's own confidence/vote strength where available, not raw value,
//   to stay dimensionless). Hard-capped at 0.75 regardless of agreement count or magnitude.

import { computeOBI, computeMicroprice, obiToSignals, DEFAULT_THRESHOLD } from './orderbook-imbalance.mjs';
import { computeMultiLevelOFI } from './ofi.mjs';
import { computeCVD, amtSignals } from './footprint-amt.mjs';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

/** Hard confidence ceiling for the confluence signal — never exceeded regardless of agreement. */
export const CONFLUENCE_CONFIDENCE_CAP = 0.75;

/** Base confidence when exactly 2 of 3 lenses agree. */
const BASE_CONFIDENCE_2OF3 = 0.35;

/** Base confidence when all 3 lenses agree. */
const BASE_CONFIDENCE_3OF3 = 0.60;

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ── internal: per-lens vote extraction ─────────────────────────────────────────

/**
 * OBI lens vote. Reuses the module's own noise-floor gating (obiToSignals only emits
 * a directional crypto-obi-* signal when |OBI| >= threshold), so a sub-threshold book
 * votes neutral rather than forcing a raw sign.
 * @returns {{ side:'long'|'short'|'neutral', strength:number }}
 */
function obiVote(bids, asks, book, opts) {
  const obi = computeOBI(bids, asks, opts.levels);
  if (!Number.isFinite(obi)) return { side: 'neutral', strength: 0 };
  const micro = computeMicroprice(bids, asks);
  const signals = obiToSignals(obi, micro, book, {
    market: opts.market,
    ts: opts.ts,
    threshold: opts.threshold,
  });
  const obiSig = signals.find((s) => s.factorId === `crypto-obi-${opts.market || ''}`);
  if (!obiSig || obiSig.side !== 'long' && obiSig.side !== 'short') {
    return { side: 'neutral', strength: 0 };
  }
  return { side: obiSig.side, strength: Number.isFinite(obiSig.confidence) ? obiSig.confidence : 0 };
}

/**
 * OFI lens vote. computeMultiLevelOFI needs {bidPx,bidSz,askPx,askSz}[] level snapshots;
 * the confluence caller hands us {price,size}[] books (the same shape orderflow-paper.mjs's
 * onBook callback receives), so we adapt bids/asks -> level objects here.
 * No prevBook (first tick) -> neutral (not an error — ofi.mjs's own first-event convention is e=0).
 * @returns {{ side:'long'|'short'|'neutral', strength:number }}
 */
function toLevels(bids, asks, n) {
  const levels = [];
  const len = Math.min(n, Math.max(bids?.length ?? 0, asks?.length ?? 0));
  for (let i = 0; i < len; i++) {
    levels.push({
      bidPx: bids?.[i]?.price, bidSz: bids?.[i]?.size,
      askPx: asks?.[i]?.price, askSz: asks?.[i]?.size,
    });
  }
  return levels;
}

function ofiVote(prevBook, currBids, currAsks, opts) {
  if (!prevBook || !Array.isArray(prevBook.bids) || !Array.isArray(prevBook.asks)) {
    return { side: 'neutral', strength: 0 };
  }
  const levels = Number.isFinite(opts.levels) ? opts.levels : 10;
  const prevLevels = toLevels(prevBook.bids, prevBook.asks, levels);
  const currLevels = toLevels(currBids, currAsks, levels);
  if (prevLevels.length === 0 || currLevels.length === 0) return { side: 'neutral', strength: 0 };

  const result = computeMultiLevelOFI(prevLevels, currLevels, { levels });
  if (result.ofi === null || result.sign === 0) return { side: 'neutral', strength: 0 };
  const side = result.sign > 0 ? 'long' : 'short';
  // Strength: dimensionless — scale by avg per-level magnitude relative to book depth isn't
  // available generically here, so use a bounded logistic-ish squash of |ofi| so a huge raw
  // sum (unbounded by construction) never blows past a sane [0,1] contribution.
  const strength = Math.min(1, Math.abs(result.ofi) / (Math.abs(result.ofi) + 10));
  return { side, strength };
}

/**
 * CVD lens vote. computeCVD returns [] when footprint-amt's DISARMED flag is not set — that
 * is treated as an honest 'neutral' (no vote), not an error. When trades ARE available, the
 * vote is the sign of the LAST cumulative delta point (persistence across the whole window,
 * not a single last-trade flicker). amtSignals is consulted only as an optional confirmation
 * nudge when it independently agrees with the CVD sign — never required.
 * @returns {{ side:'long'|'short'|'neutral', strength:number }}
 */
function cvdVote(trades, opts) {
  if (!Array.isArray(trades) || trades.length === 0) return { side: 'neutral', strength: 0 };
  const series = computeCVD(trades, { tsUnit: opts.tsUnit || 's' });
  if (!Array.isArray(series) || series.length === 0) return { side: 'neutral', strength: 0 };
  const last = series[series.length - 1];
  if (!last || !Number.isFinite(last.cvd) || last.cvd === 0) return { side: 'neutral', strength: 0 };
  const side = last.cvd > 0 ? 'long' : 'short';

  // Strength: normalize by the sum of |delta| across the window so it's dimensionless in [0,1].
  const totalAbsDelta = series.reduce((a, p) => a + Math.abs(p.delta || 0), 0);
  let strength = totalAbsDelta > 0 ? Math.min(1, Math.abs(last.cvd) / totalAbsDelta) : 0;

  // Optional confirmation nudge from amtSignals, only if it agrees (never overrides/forces).
  if (Array.isArray(opts.footprintBars) && opts.valueArea) {
    try {
      const amt = amtSignals(opts.footprintBars, opts.valueArea, { market: opts.market || '' });
      const last2 = amt[amt.length - 1];
      if (last2 && last2.side === side && Number.isFinite(last2.confidence)) {
        strength = Math.min(1, strength + last2.confidence * 0.25);
      }
    } catch { /* advisory-only nudge; never let it break the CVD vote */ }
  }
  return { side, strength };
}

// ── confluenceSignal ────────────────────────────────────────────────────────────

/**
 * confluenceSignal(inputs, opts) -> signal | null
 *
 * @param {{
 *   book: { bids:{price:number,size:number}[], asks:{price:number,size:number}[], mid:number, spreadBps:number, ts:number },
 *   prevBook?: { bids:{price:number,size:number}[], asks:{price:number,size:number}[] } | null,
 *   trades?: object[],
 *   cvdState?: object,
 * }} inputs
 * @param {{ market?:string, levels?:number, threshold?:number, tsUnit?:'s'|'ms', footprintBars?:object[], valueArea?:object }} [opts]
 * @returns {{ factorId:'orderflow-confluence', value:number, side:'long'|'short'|'flat', confidence:number, ts:number } | null}
 */
export function confluenceSignal(inputs, opts = {}) {
  try {
    const book = inputs?.book;
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return null;
    if (book.bids.length === 0 || book.asks.length === 0) return null;

    const market = typeof opts.market === 'string' ? opts.market : '';
    const levels = Number.isFinite(opts.levels) && opts.levels > 0 ? Math.floor(opts.levels) : 10;
    const threshold = Number.isFinite(opts.threshold) ? Math.abs(opts.threshold) : DEFAULT_THRESHOLD;
    const ts = Number.isFinite(book.ts) && book.ts > 0 ? book.ts : Number.isFinite(opts.ts) ? opts.ts : 0;

    const v1 = obiVote(book.bids, book.asks, book, { market, levels, threshold, ts });
    const v2 = ofiVote(inputs.prevBook, book.bids, book.asks, { levels });
    const v3 = cvdVote(inputs.trades, {
      tsUnit: opts.tsUnit,
      market,
      footprintBars: opts.footprintBars,
      valueArea: opts.valueArea,
    });

    const votes = [v1, v2, v3];
    const longVotes = votes.filter((v) => v.side === 'long');
    const shortVotes = votes.filter((v) => v.side === 'short');
    const nLong = longVotes.length;
    const nShort = shortVotes.length;
    const agreeCount = Math.max(nLong, nShort);

    // ── flat: no side has >=2 agreeing votes (includes all-neutral and 1-vs-1 splits) ──
    if (agreeCount < 2) {
      return { factorId: 'orderflow-confluence', value: 0, side: 'flat', confidence: 0, ts };
    }

    const side = nLong > nShort ? 'long' : 'short';
    const agreeing = side === 'long' ? longVotes : shortVotes;
    const base = agreeCount === 3 ? BASE_CONFIDENCE_3OF3 : BASE_CONFIDENCE_2OF3;
    const meanStrength = agreeing.reduce((a, v) => a + v.strength, 0) / agreeing.length;
    // magnitude nudge: up to +0.15 spread between base and cap, scaled by mean lens strength
    const headroom = CONFLUENCE_CONFIDENCE_CAP - base;
    const confidence = Math.min(CONFLUENCE_CONFIDENCE_CAP, base + headroom * meanStrength);

    // value: signed agreement strength (agreeCount/3, signed by side) — a compact scalar
    // summarizing "how many lenses, how hard" without conflating incompatible lens units.
    const value = (side === 'long' ? 1 : -1) * (agreeCount / 3);

    return { factorId: 'orderflow-confluence', value, side, confidence, ts };
  } catch {
    return null;
  }
}

export default { confluenceSignal };
