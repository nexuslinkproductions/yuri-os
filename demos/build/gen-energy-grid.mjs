// Generates demos/data/energy-grid.js by evaluating YURI's REAL computeU over a
// (claim-vs-evidence drift × verified-evidence-count) grid. No reimplementation —
// the actual energy math from _SYSTEM/Scripts/math/yuri-energy.mjs.
import { computeU } from '../../_SYSTEM/Scripts/math/yuri-energy.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const OUT = join(DATA_DIR, 'energy-grid.js');

const NX = 64;        // x = claim↔evidence drift  (drives β·W₁ + μ overconfidence)
const NZ = 44;        // z = verifiedEvidenceCount (drives the −ι log credit)
const NBINS = 7;      // ordinal belief bins
const EVID_MAX = 50;  // credit saturates at VERIFIED_EVIDENCE_CREDIT_CAP

// fixed claim-status mix → a constant entropy baseline (α term)
const claimPromotion = { draft: 3, research: 3, verified: 3 };

// normalized gaussian bump centered at `center` over NBINS ordinal bins
function bump(center, n, width = 1.1) {
  const a = Array.from({ length: n }, (_, i) => Math.exp(-((i - center) ** 2) / (2 * width * width)));
  const s = a.reduce((x, y) => x + y, 0);
  return a.map(v => v / s);
}

const driftAxis = [], evidenceAxis = [];
for (let i = 0; i < NX; i++) driftAxis.push(i / (NX - 1));               // 0..1
for (let j = 0; j < NZ; j++) evidenceAxis.push((j / (NZ - 1)) * EVID_MAX); // 0..50

const verified = bump(0, NBINS);  // evidence concentrated at bin 0
const U = [], Uveto = [], dominant = [];
let uMin = Infinity, uMax = -Infinity;

for (let j = 0; j < NZ; j++) {
  const e = evidenceAxis[j];
  const rowU = [], rowV = [], rowD = [];
  for (let i = 0; i < NX; i++) {
    const d = driftAxis[i];
    const claimed = bump(d * (NBINS - 1), NBINS, 1.1); // claim drifts away from evidence as d→1
    const state = {
      claimPromotionDistribution: claimPromotion,
      claimedDistribution: claimed,
      verifiedDistribution: verified,
      verifiedEvidenceCount: e,
    };
    const r = computeU(state).result;          // <-- real YURI energy
    rowU.push(r.U);
    if (r.U < uMin) uMin = r.U;
    if (r.U > uMax) uMax = r.U;
    // dominant contribution term (for color/tooltip)
    let best = null, bestAbs = -1;
    for (const [k, v] of Object.entries(r.contributions)) {
      if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); best = k; }
    }
    rowD.push(best);
    // same cell WITH a protected-path violation → the η=100 non-offsettable veto cliff
    rowV.push(computeU({ ...state, protectedPathViolations: 1 }).result.U);
  }
  U.push(rowU); Uveto.push(rowV); dominant.push(rowD);
}

const payload = {
  meta: 'YURI energy gate U over (claim-evidence drift × verifiedEvidenceCount). Real computeU, β=2.2, η=100.',
  nx: NX, nz: NZ, driftAxis, evidenceAxis, U, Uveto, dominant, uMin, uMax,
};
mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(OUT, 'window.ENERGY_GRID = ' + JSON.stringify(payload) + ';\n');
console.log(`wrote ${OUT}\ncells=${NX * NZ} U_range=[${uMin.toFixed(3)}, ${uMax.toFixed(3)}] vetoMax=${Math.max(...Uveto.flat()).toFixed(2)}`);
