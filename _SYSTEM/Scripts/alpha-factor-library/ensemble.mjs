// @capability: ensemble
// @serves: combine all strategies into one trade | ensemble vote | weighted strategy fusion | single combined decision per market | strategies working together
// @does: fuses ALL strategy signals for a market into ONE combined directional decision via a
// weighted confidence vote (net = Σ dir·confidence·weight / Σ weight). This is the DETERMINISTIC
// 10s execution brain — the strategies work TOGETHER on each trade instead of trading separate books.
// Per-strategy weights are supplied by the slower Sonnet/learn-loop re-weighting beat (default 1.0).
// @use: call combineSignals(signals, {weights}) each cycle to get the single ensemble decision the
// daemon trades. Re-weighting (which strategies to trust/veto) is a SEPARATE slower layer that writes
// the weights this reads.
// @exports: combineSignals, DEFAULT_THRESHOLD

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function sideDir(side) {
  if (side === 'long' || side === 'LONG' || side === 'buy') return 1;
  if (side === 'short' || side === 'SHORT' || side === 'sell') return -1;
  return 0;
}

export const DEFAULT_THRESHOLD = 0.05;

/**
 * combineSignals(signals, opts) — fuse every strategy signal for ONE market into a single decision.
 *
 * @param {Array} signals  - [{ factorId, side:'long'|'short'|'flat', confidence, value, ... }]
 * @param {object} opts
 *   weights   {Object<factorId, number>}  per-strategy weight (default 1.0; 0 = vetoed/ignored)
 *   threshold {number}  |net| below this → flat (no conviction). Default 0.05.
 *   baseWeight{number}  weight for a strategy absent from `weights` (default 1.0)
 * @returns {{
 *   side:'long'|'short'|'flat', net:number, strength:number, confidence:number,
 *   longVotes:number, shortVotes:number, weightSum:number, contributors:number,
 *   top:Array<{factorId,side,confidence,weight,contribution}>
 * }}
 *   net      = Σ(dir·conf·weight) / Σ(weight)  ∈ [-1, 1]  (signed conviction)
 *   strength = |net|  (0..1) — size the trade by this
 *   side     = sign(net) when |net| ≥ threshold, else 'flat'
 */
export function combineSignals(signals, opts = {}) {
  const weights = opts.weights && typeof opts.weights === 'object' ? opts.weights : {};
  const threshold = isNum(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
  const baseWeight = isNum(opts.baseWeight) ? opts.baseWeight : 1.0;

  const empty = {
    side: 'flat', net: 0, strength: 0, confidence: 0.5,
    longVotes: 0, shortVotes: 0, weightSum: 0, contributors: 0, top: [],
  };
  if (!Array.isArray(signals) || signals.length === 0) return empty;

  let weighted = 0;     // Σ dir·conf·weight
  let weightSum = 0;    // Σ weight (over directional, non-vetoed signals)
  let longVotes = 0, shortVotes = 0, contributors = 0;
  const contribs = [];

  for (const s of signals) {
    if (!s || !s.factorId) continue;
    const dir = sideDir(s.side);
    if (dir === 0) continue; // flat/neutral strategies don't vote
    const w = isNum(weights[s.factorId]) ? weights[s.factorId] : baseWeight;
    if (w <= 0) continue; // vetoed / zero-weight
    const conf = isNum(s.confidence) ? Math.max(0, Math.min(1, s.confidence)) : 0.5;
    const contribution = dir * conf * w;
    weighted += contribution;
    weightSum += w;
    if (dir > 0) longVotes++; else shortVotes++;
    contributors++;
    contribs.push({ factorId: s.factorId, side: dir > 0 ? 'long' : 'short', confidence: conf, weight: w, contribution });
  }

  if (weightSum <= 0 || contributors === 0) return empty;

  const net = weighted / weightSum; // ∈ [-1, 1]
  const strength = Math.abs(net);
  const side = strength >= threshold ? (net > 0 ? 'long' : 'short') : 'flat';
  // Combined confidence: 0.5 (coin flip) → 0.95 as conviction rises.
  const confidence = Math.min(0.95, 0.5 + strength / 2);

  contribs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    side, net, strength, confidence,
    longVotes, shortVotes, weightSum, contributors,
    top: contribs.slice(0, 8),
  };
}

// ── main-guarded self-test ──────────────────────────────────────────────────
import { pathToFileURL } from 'node:url';
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // empty / no-signal
  ok(combineSignals([]).side === 'flat', 'empty → flat');
  ok(combineSignals(null).side === 'flat', 'null → flat');
  ok(combineSignals([{ factorId: 'a', side: 'flat', confidence: 0.9 }]).side === 'flat', 'all-flat → flat');

  // unanimous long
  const longs = [
    { factorId: 'a', side: 'long', confidence: 0.8 },
    { factorId: 'b', side: 'long', confidence: 0.7 },
    { factorId: 'c', side: 'long', confidence: 0.9 },
  ];
  const rL = combineSignals(longs);
  ok(rL.side === 'long', 'unanimous long → long');
  ok(rL.net > 0 && rL.net <= 1, `net in (0,1] (${rL.net.toFixed(3)})`);
  ok(rL.longVotes === 3 && rL.shortVotes === 0, 'vote counts');
  ok(rL.confidence > 0.5, 'confidence > 0.5 on conviction');

  // conflicting → near flat (cancels)
  const mixed = [
    { factorId: 'a', side: 'long', confidence: 0.6 },
    { factorId: 'b', side: 'short', confidence: 0.6 },
  ];
  ok(combineSignals(mixed).side === 'flat', 'equal opposing → flat (cancels)');

  // weighted: a heavy short beats two light longs
  const wt = [
    { factorId: 'a', side: 'long', confidence: 0.6 },
    { factorId: 'b', side: 'long', confidence: 0.6 },
    { factorId: 'big', side: 'short', confidence: 0.9 },
  ];
  const rW = combineSignals(wt, { weights: { big: 10 } });
  ok(rW.side === 'short', 'heavy-weighted short wins the vote');

  // veto: weight 0 removes a strategy
  const veto = combineSignals(longs, { weights: { a: 0, b: 0, c: 0 } });
  ok(veto.side === 'flat' && veto.contributors === 0, 'all vetoed → flat, 0 contributors');

  // threshold: weak net → flat
  const weak = [
    { factorId: 'a', side: 'long', confidence: 0.51 },
    { factorId: 'b', side: 'short', confidence: 0.50 },
    { factorId: 'c', side: 'long', confidence: 0.50 },
  ];
  const rWeak = combineSignals(weak, { threshold: 0.2 });
  ok(rWeak.side === 'flat', 'sub-threshold net → flat');

  // no NaN ever
  const r = combineSignals(longs);
  ok(isNum(r.net) && isNum(r.strength) && isNum(r.confidence), 'no NaN in outputs');

  console.log(`ensemble --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
