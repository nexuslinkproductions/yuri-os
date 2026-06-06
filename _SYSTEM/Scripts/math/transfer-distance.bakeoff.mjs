#!/usr/bin/env node
/**
 * transfer-distance.bakeoff.mjs — run every candidate structural-distance metric through the
 * 36-card logbook proof and report which one SEPARATES near from far (P1 ≥ 0.05) where V1 failed.
 * Run: node _SYSTEM/Scripts/math/transfer-distance.bakeoff.mjs [logbook-truth.json]
 */
import { readFileSync } from 'node:fs';
import { transferScore, v1BlendMetric } from './transfer-distance.mjs';
import { CANDIDATES, fieldDistance, operatorSkeletonDistance, mechanismFrameDistance } from './transfer-distance-cores.mjs';

const TRUTH = process.argv[2] || '_SYSTEM/Scripts/math/logbook-truth.json';
const NEAR = new Set([1, 2, 4, 14, 16]);
const FAR_HOLDS = new Set([8, 13, 18, 30, 31, 33]);
const FAR_BROKEN = new Set([22, 23, 35]);
const FAR_ALL = new Set([...FAR_HOLDS, ...FAR_BROKEN]);

const cards = JSON.parse(readFileSync(TRUTH, 'utf8')).filter((c) => c.sourceTheory && c.yuriTarget && c.structuralNum != null);
const med = (xs) => { const a = [...xs].sort((p, q) => p - q); const m = a.length >> 1; return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : NaN; };
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
function spearman(a, b) { const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(arr.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; }; const ra = rank(a), rb = rank(b), n = a.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2; return 1 - (6 * d2) / (n * (n * n - 1)); }

function evalMetric(name, scoreOpts) {
  const scored = cards.map((c) => {
    const s = transferScore({
      sourceText: c.sourceTheory,
      targetText: `${c.yuriTarget} ${c.theTransfer || ''}`.trim(),
      mechanismText: c.borrowedMechanism || '',
      structuralConf: c.structuralNum,
      mismatchPresent: !!(c.mismatch && c.mismatch.length > 20),
    }, scoreOpts);
    return { n: c.n, juice: c.juice, ...s };
  });
  const dv = (set) => scored.filter((s) => set.has(s.n)).map((s) => s.distance);
  const vv = (set) => scored.filter((s) => set.has(s.n)).map((s) => s.value);
  // theater control: FAR_HOLDS source/target with a WRONG mechanism
  const fh = cards.filter((c) => FAR_HOLDS.has(c.n));
  const theater = fh.map((c, i) => {
    const wrong = fh[(i + 2) % fh.length];
    return transferScore({ sourceText: c.sourceTheory, targetText: `${c.yuriTarget} ${c.theTransfer || ''}`, mechanismText: wrong.borrowedMechanism || '', structuralConf: c.structuralNum, mismatchPresent: true }, scoreOpts).value;
  });
  const distNear = med(dv(NEAR)), distFar = med(dv(FAR_ALL));
  const vNear = med(vv(NEAR)), vFarH = med(vv(FAR_HOLDS)), vFarX = med(vv(FAR_BROKEN));
  const P1 = distFar - distNear;
  return {
    name,
    P1, distNear, distFar,
    P1pass: P1 >= 0.05,
    P2pass: vFarH > vNear, vFarH, vNear,
    P3pass: vFarH > vFarX, vFarX,
    P4pass: mean(theater) < vFarH, theater: mean(theater),
    rho: spearman(scored.map((s) => s.value), scored.map((s) => s.juice)),
  };
}

const metrics = [
  ['V1-gzip-blend', { distFn: v1BlendMetric }],
  ...Object.entries(CANDIDATES).map(([n, f]) => [n, { distFn: f }]),
  // V2 = field-distance on the DISTANCE axis + operator-skeleton on the BRIDGE axis (owner-chosen)
  ['V2-field+opBridge', { distFn: fieldDistance, reconFn: operatorSkeletonDistance }],
  // V2.1 = field-distance + Codex's strengthened mechanism-frame bridge (recovers P3 + theater)
  ['V2.1-field+mechFrame', { distFn: fieldDistance, reconFn: mechanismFrameDistance }],
];
const results = metrics.map(([n, o]) => { try { return evalMetric(n, o); } catch (e) { return { name: n, error: e.message }; } });

console.log('\n══ BAKE-OFF — structural distance candidates vs the logbook ══');
console.log('  metric              P1(far-near)  distN distF  P1 P2 P3 P4  rho     verdict');
for (const r of results) {
  if (r.error) { console.log(`  ${r.name.padEnd(18)} ERROR: ${r.error}`); continue; }
  const flag = (b) => (b ? '✓' : '·');
  const sep = r.P1 >= 0.05 ? 'SEPARATES' : r.P1 > 0 ? 'weak' : 'INVERTED';
  console.log(
    `  ${r.name.padEnd(18)} ${r.P1.toFixed(3).padStart(7)}      ${r.distNear.toFixed(2)}  ${r.distFar.toFixed(2)}  ${flag(r.P1pass)}  ${flag(r.P2pass)}  ${flag(r.P3pass)}  ${flag(r.P4pass)}  ${r.rho.toFixed(2).padStart(5)}   ${sep}`,
  );
}

// RED-TEAM fix: WINNER must clear ALL proof obligations (P1-P4), not just P1+P2; and among those
// that do, prefer the exported SHIP config (the V2.1 combo) over a partially-passing variant.
const qualified = results.filter((r) => !r.error && r.P1pass && r.P2pass && r.P3pass && r.P4pass);
const winner = qualified.find((r) => r.name.startsWith('V2.1')) || qualified.sort((a, b) => b.P1 - a.P1)[0];
console.log(winner
  ? `\n  WINNER: ${winner.name} (P1=${winner.P1.toFixed(3)}; P1/P2/P3/P4 all pass)${winner.name.startsWith('V2.1') ? ' — ship config' : ''}`
  : '\n  NO candidate clears all of P1-P4 — need a stronger signal or an ensemble.');
