// @capability: strategy-registry
// @serves: unified trading strategy library | all factor signals one call | merge trend meanrev volume strategies | dozens of strategies per market
// @does: merges every strategy-family module (trend/momentum, mean-reversion, volume-volatility) into ONE computeAllStrategies(bars, market) call returning the union of their signals. Fail-soft PER FAMILY — a throwing family is skipped, never breaks the set. This is the single entry point the orchestrator uses to generate the live factor signals.
// @use: call computeAllStrategies(bars, market) in the cycle to get every strategy's directional signal at once. Add a new family = one import + one entry in FAMILIES.
//
// Each family exports computeSignals(bars, market) -> Signal[] where
//   Signal = { factorId:`<strat>-${market}`, value, side:'long'|'short', confidence, ts, archetype }.
// @exports: computeAllStrategies, FAMILY_NAMES

import * as trend from './strategies-trend.mjs';
import * as meanrev from './strategies-meanrev.mjs';
import * as volvol from './strategies-volume-vol.mjs';

const FAMILIES = [
  ['trend', trend],
  ['meanrev', meanrev],
  ['volvol', volvol],
];
export const FAMILY_NAMES = FAMILIES.map(([n]) => n);

/**
 * computeAllStrategies(bars, market) — union of every family's signals. Fail-soft per family
 * (one bad family never zeroes the rest) and de-dupes by factorId (last write wins) so a name
 * collision across families can't double-trade the same book. Returns Signal[].
 */
export function computeAllStrategies(bars, market) {
  if (!Array.isArray(bars) || bars.length < 5 || !market) return [];
  const byId = new Map();
  for (const [name, fam] of FAMILIES) {
    if (!fam || typeof fam.computeSignals !== 'function') continue;
    try {
      const sigs = fam.computeSignals(bars, market);
      if (!Array.isArray(sigs)) continue;
      for (const s of sigs) {
        if (s && s.factorId && (s.side === 'long' || s.side === 'short')) {
          byId.set(s.factorId, s.archetype ? s : { ...s, archetype: name });
        }
      }
    } catch (_e) { /* a throwing family is skipped — never breaks the union */ }
  }
  return [...byId.values()];
}

// ── main-guarded self-test ──────────────────────────────────────────────────
import { pathToFileURL } from 'node:url';
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  // deterministic synthetic bars (LCG): trend up then a spike + dump so all families can fire
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const bars = [];
  let px = 100;
  for (let i = 0; i < 120; i++) {
    const drift = i < 60 ? 0.4 : (i < 90 ? -0.6 : 0.5);
    px = Math.max(1, px + drift + (rnd() - 0.5) * 1.5);
    const o = px, c = px + (rnd() - 0.5);
    bars.push({ timestamp: 1000 + i * 60, open: o, high: Math.max(o, c) + rnd(), low: Math.min(o, c) - rnd(), close: c, volume: 500 + rnd() * 1000 });
  }
  const sigs = computeAllStrategies(bars, 'BTC-USD');
  ok(Array.isArray(sigs), 'returns an array');
  ok(sigs.length >= 8, `union fires many strategies (got ${sigs.length})`);
  ok(sigs.every((s) => s.side === 'long' || s.side === 'short'), 'all sides valid');
  ok(sigs.every((s) => typeof s.confidence === 'number' && s.confidence > 0 && s.confidence <= 1), 'confidence in (0,1]');
  ok(sigs.every((s) => Number.isFinite(s.value)), 'value finite (no NaN)');
  ok(sigs.every((s) => String(s.factorId).endsWith('-BTC-USD')), 'factorId market-scoped');
  ok(new Set(sigs.map((s) => s.factorId)).size === sigs.length, 'no duplicate factorIds');
  ok(computeAllStrategies([], 'BTC-USD').length === 0, 'empty bars → []');
  ok(computeAllStrategies(bars, '').length === 0, 'no market → []');
  const archetypes = new Set(sigs.map((s) => s.archetype));
  ok(archetypes.size >= 2, `multiple archetypes represented (${[...archetypes].join(',')})`);
  console.log(`strategy-registry --test: ${pass} pass, ${fail} fail (${sigs.length} strategies, archetypes: ${[...archetypes].join(',')})`);
  process.exit(fail ? 1 : 0);
}
