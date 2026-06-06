#!/usr/bin/env node
/**
 * transfer-distance.proof.mjs — PROVE the Mechanism-Bridged Transfer Surprise metric
 * against the 36-card math-theory transfer logbook as labeled ground truth.
 *
 * INTEGRITY: the gate thresholds (transfer-distance.mjs GATE/TIER) and the ordinal
 * ground-truth labels below are committed A PRIORI — set before any score was computed —
 * so a PASS is reproduction, not a fit. (Codex's sharpest risk: the logbook is both muse
 * and test set → overfit to Marcel's writing style. Mitigation: frozen labels + a synthetic
 * theater control the labels can't have leaked into.)
 *
 * Run: node _SYSTEM/Scripts/math/transfer-distance.proof.mjs [path-to-logbook-truth.json]
 */
import { readFileSync } from 'node:fs';
import { transferScore } from './transfer-distance.mjs';
import { V2_CONFIG } from './transfer-distance-cores.mjs';

// RED-TEAM fix: the proof MUST validate the SHIP config (V2_CONFIG = field-distance × mechanism-
// frame), not the V1 blend default (which is "structurally blind" and fails A/B). V1 is now only
// a baseline comparison, not the asserted path.
const TRUTH_PATH = process.argv[2] || '_SYSTEM/Scripts/math/logbook-truth.json'; // in-repo (regen: node extract-logbook-truth.mjs > logbook-truth.json)

// ── A-PRIORI ordinal ground truth (by SOURCE-domain alienness to the target's native field) ──
const NEAR = new Set([1, 2, 4, 14, 16]);        // source ≈ target field (signals→salience, graph→graph, info-theory→memory)
const FAR_HOLDS = new Set([8, 13, 18, 30, 31, 33]); // alien source, mechanism reconstructs, structural real
const FAR_BROKEN = new Set([22, 23, 35]);        // alien source + prerequisite missing / literal LOW / blocked

const cards = JSON.parse(readFileSync(TRUTH_PATH, 'utf8'))
  .filter((c) => c.sourceText && c.targetText && c.structuralNum != null);

const scored = cards.map((c) => {
  const s = transferScore({
    sourceText: c.sourceTheory || c.sourceText,                 // A — foreign domain
    targetText: `${c.yuriTarget || ''} ${c.theTransfer || ''}`.trim() || c.targetText, // B — target organ + landing
    mechanismText: c.borrowedMechanism || '',                   // M — the shared mechanism (separate vertex)
    structuralConf: c.structuralNum,
    mismatchPresent: !!(c.mismatch && c.mismatch.length > 20),
  }, V2_CONFIG);
  return { n: c.n, title: c.title.slice(0, 46), juice: c.juice, struct: c.structuralConf, lit: c.literalConf, ...s };
});

const med = (xs) => { const a = [...xs].sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const valuesOf = (set, key = 'value') => scored.filter((s) => set.has(s.n)).map((s) => s[key]);

// Spearman rank correlation (value vs juice)
function spearman(a, b) {
  const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(arr.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const ra = rank(a), rb = rank(b); const n = a.length;
  let d2 = 0; for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

// ── THEATER CONTROL: synthetic mismatched triangles (real source+target, WRONG mechanism) ──
// Pair each FAR_HOLDS card's source/target with a DIFFERENT card's mechanism. A genuine metric
// must collapse the bridge (wrong M doesn't reconstruct both sides) → value gated to theater.
const farHoldsCards = cards.filter((c) => FAR_HOLDS.has(c.n));
const theater = farHoldsCards.map((c, i) => {
  const wrong = farHoldsCards[(i + 2) % farHoldsCards.length]; // a different card's mechanism
  return transferScore({
    sourceText: c.sourceTheory || c.sourceText,
    targetText: `${c.yuriTarget || ''} ${c.theTransfer || ''}`.trim() || c.targetText,
    mechanismText: wrong.borrowedMechanism || wrong.sourceText, // WRONG mechanism — theater control
    structuralConf: c.structuralNum,
    mismatchPresent: true,
  }, V2_CONFIG).value;
});

// ── REPORT ──
const ranked = [...scored].sort((a, b) => b.value - a.value);
console.log('\n══ RANKED BY TRANSFER VALUE (Mechanism-Bridged Transfer Surprise) ══');
console.log('  #   value  dist  bridge tier            juice s/l   title');
for (const s of ranked) {
  const lbl = NEAR.has(s.n) ? 'NEAR' : FAR_HOLDS.has(s.n) ? 'FARh' : FAR_BROKEN.has(s.n) ? 'FARx' : '·';
  console.log(
    `  ${String(s.n).padStart(2)} ${s.value.toFixed(3)} ${s.distance.toFixed(3)} ${s.bridge.toFixed(3)} ${s.tier.padEnd(15)} ${s.juice}  ${(s.struct[0]||'?')}/${(s.lit?s.lit[0]:'?')} ${lbl.padEnd(4)} ${s.title}`,
  );
}

// ── ASSERTIONS (a priori) ──
const A_distNear = med(valuesOf(NEAR, 'distance'));
const A_distFar = med([...valuesOf(FAR_HOLDS, 'distance'), ...valuesOf(FAR_BROKEN, 'distance')]);
const B_valNear = med(valuesOf(NEAR));
const B_valFarH = med(valuesOf(FAR_HOLDS));
const C_valFarX = med(valuesOf(FAR_BROKEN));
const D_theater = mean(theater);
const D_farHmin = Math.min(...valuesOf(FAR_HOLDS));
const E_rho = spearman(scored.map((s) => s.value), scored.map((s) => s.juice)); // reported, not asserted
const E_inBounds = scored.every((s) => Number.isFinite(s.value) && s.value >= 0 && s.value <= 1);

const checks = [
  ['A  distance separates: med(dist FAR) > med(dist NEAR)', A_distFar > A_distNear, `far=${A_distFar.toFixed(3)} near=${A_distNear.toFixed(3)}`],
  ['B  THESIS: med(value FAR_HOLDS) > med(value NEAR)', B_valFarH > B_valNear, `farH=${B_valFarH.toFixed(3)} near=${B_valNear.toFixed(3)}`],
  ['C  gate works: med(value FAR_HOLDS) > med(value FAR_BROKEN)', B_valFarH > C_valFarX, `farH=${B_valFarH.toFixed(3)} farX=${C_valFarX.toFixed(3)}`],
  ['D  theater killed: mean(synthetic wrong-M) < med(value FAR_HOLDS)', D_theater < B_valFarH, `theater=${D_theater.toFixed(3)} farH=${B_valFarH.toFixed(3)}`],
  // RED-TEAM fix: E was spearman(value,juice)≥0 — a STALE V1 check. V2 value measures FARNESS×coherence,
  // NOT juice (leverage), so they shouldn't correlate (rho reported below as info, not asserted).
  // The real E sanity is the value contract: every value finite + in [0,1].
  ['E  contract: every value ∈ [0,1] (finite)', E_inBounds, `bounds-ok=${E_inBounds} rho_info=${E_rho.toFixed(3)}`],
];

console.log('\n══ PROOF ASSERTIONS (thresholds + labels committed a priori) ══');
let pass = 0;
for (const [name, ok, detail] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}   [${detail}]`);
  if (ok) pass += 1;
}
console.log(`\n  ${pass}/${checks.length} assertions pass`);
process.exitCode = pass === checks.length ? 0 : 1;
