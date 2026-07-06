// Move-1b architecture — COMBINATORICS + RELIABILITY (pure arithmetic, no deps).
// Sizes the spawn tree, exposes the depth-cap trap, and quantifies orphan inevitability.

const rj = (x) => (Number.isFinite(x) ? x.toLocaleString('en-US') : String(x));

// ── C1: worst-case tree size  N(F,D) = sum_{k=0}^{D} F^k  (full F-ary tree to depth D) ──
function fullTree(F, D) {
  if (F === 1) return D + 1;
  return (Math.pow(F, D + 1) - 1) / (F - 1);
}
console.log('=== C1: WORST-CASE TREE SIZE  N(fanout F, depth D) = Σ F^k ===');
console.log('depth D=5 (OWNER heavy cap):');
for (const F of [1, 2, 3, 4, 5]) console.log(`  F=${F}: ${rj(fullTree(F, 5))} nodes`);
console.log('depth D=10 (OWNER light cap):');
for (const F of [1, 2, 3, 4, 5]) console.log(`  F=${F}: ${rj(fullTree(F, 10))} nodes`);
console.log('FINDING: light(D=10) is the danger, not heavy. F=4@D10 = 1.4M nodes; F=3@D10 = 88k.');
console.log('Depth alone does NOT bound the tree. Width (fan-out) compounds geometrically and the');
console.log('DEEPER (light) tier amplifies it. Owner depth tiers are necessary, NOT sufficient.\n');

// ── C2: decaying fan-out + hard node budget (the proposed bound) ──
// F_eff(d) = max(1, ceil(F0 * decay^d)); BFS-grant spawns until total hits node budget B.
function realizedTree(F0, decay, D, B) {
  let total = 1;            // root
  let level = [1];         // nodes per depth
  for (let d = 0; d < D; d += 1) {
    const fEff = Math.max(1, Math.ceil(F0 * Math.pow(decay, d)));
    let next = level[level.length - 1] * fEff;
    if (total + next > B) { next = Math.max(0, B - total); } // node-budget cutoff
    total += next;
    level.push(next);
    if (total >= B || next === 0) break;
  }
  return { total, perDepth: level };
}
console.log('=== C2: DECAYING FAN-OUT + NODE BUDGET (proposed primary bound) ===');
for (const cfg of [
  { F0: 4, decay: 0.5, D: 10, B: 128, tag: 'light D10' },
  { F0: 3, decay: 0.5, D: 5, B: 64, tag: 'heavy D5' },
  { F0: 5, decay: 0.6, D: 10, B: 256, tag: 'light aggressive' },
]) {
  const r = realizedTree(cfg.F0, cfg.decay, cfg.D, cfg.B);
  console.log(`  ${cfg.tag} (F0=${cfg.F0} decay=${cfg.decay} D=${cfg.D} budget=${cfg.B}): ${r.total} nodes, perDepth=[${r.perDepth.join(',')}]`);
}
console.log('FINDING: decaying fan-out turns geometric blowup into ~linear-after-depth-2 growth.');
console.log('Belt+suspenders: hard node budget B is the SIZE backstop; decay is the SHAPE; depth is the RACE bound.\n');

// ── C3: barrier re-convergence cost = #edges = N-1 (each child landing → one parent Layer-2 re-read) ──
console.log('=== C3: BARRIER COST (Layer-2 re-runs) ===');
for (const N of [16, 64, 128, 256]) {
  console.log(`  N=${N} nodes → ${N - 1} re-convergence reads (1 per child landing). Each = 1 contestedClaims() read-view parse (cheap, O(view)).`);
}
console.log('FINDING: barrier is O(N) CHEAP deterministic reads, NOT O(N) LLM calls. Affordable at any sane N.\n');

// ── C4: orphan inevitability  P(>=1 orphan) = 1 - (1-p)^N ──
console.log('=== C4: ORPHAN PROBABILITY  P(>=1 mid-flight death) = 1-(1-p)^N ===');
for (const p of [0.005, 0.01, 0.03]) {
  const row = [16, 64, 128].map((N) => `N=${N}:${(100 * (1 - Math.pow(1 - p, N))).toFixed(0)}%`).join('  ');
  console.log(`  p=${p}: ${row}`);
}
console.log('FINDING: at N=64, p=1% → ~47% chance of >=1 orphan PER RUN. Orphans are EXPECTED, not exceptional.');
console.log('→ orphan handling must be a FIRST-CLASS path: dead-lease reclaim unblocks the barrier, but the lost');
console.log('  work must inject a CRITICAL "child-incomplete" signal (H2 flagged), never a silent converge (H3).\n');
