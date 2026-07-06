// Move-1b — STOCHASTIC TREE COST (tail-aware reservation sizing). Reuses decision-sim's seeded RNG
// (capability-first). The hard node budget B is the absolute cap; this finds where to set the cost
// RESERVATION so it isn't wastefully over-provisioned at B yet still covers the tail (CVaR).
import { makeRng } from '/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/decision-sim.mjs';

// per-node USD cost by tier (rough; local ollama ≈ free, heavy cloud ≈ a few cents/node @ xhigh)
const COST = { heavy: 0.05, light: 0.002, local: 0.0 };

// Sample ONE stochastic tree under decaying fan-out + node budget. Each node spawns each potential child
// with prob ps (so realized fan-out ≤ F_eff(d)). mix = fraction of nodes that are heavy vs light vs local.
function sampleTree(rng, { F0, decay, D, B, ps, mix }) {
  let nodes = 0, costUsd = 0;
  const pickTier = () => { const u = rng(); return u < mix.heavy ? 'heavy' : (u < mix.heavy + mix.light ? 'light' : 'local'); };
  // BFS queue of depths; root at depth 0
  const q = [0]; nodes = 1; costUsd += COST[pickTier()];
  while (q.length) {
    const d = q.shift();
    if (d >= D || nodes >= B) continue;
    const fEff = Math.max(1, Math.ceil(F0 * Math.pow(decay, d)));
    for (let k = 0; k < fEff; k += 1) {
      if (nodes >= B) break;
      if (rng() < ps) { nodes += 1; costUsd += COST[pickTier()]; q.push(d + 1); }
    }
  }
  return { nodes, costUsd };
}

function dist(samples, key) {
  const v = samples.map((s) => s[key]).sort((a, b) => a - b);
  const at = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const tailFrac = 0.05; const tailStart = Math.floor((1 - tailFrac) * v.length);
  const cvar = v.slice(tailStart).reduce((a, b) => a + b, 0) / Math.max(1, v.length - tailStart); // mean of worst 5%
  return { mean, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: v[v.length - 1], cvar };
}

const rng = makeRng(20260614);
const TRIALS = 50000;
const f2 = (x) => x.toFixed(2);
console.log('=== STOCHASTIC TREE COST + SIZE  (50k sampled trees) ===\n');
for (const cfg of [
  { tag: 'light-heavy mix, D10', F0: 4, decay: 0.5, D: 10, B: 128, ps: 0.7, mix: { heavy: 0.2, light: 0.6, local: 0.2 } },
  { tag: 'heavy-leaning, D5',    F0: 3, decay: 0.5, D: 5,  B: 64,  ps: 0.8, mix: { heavy: 0.5, light: 0.4, local: 0.1 } },
  { tag: 'local-mostly, D10',    F0: 4, decay: 0.6, D: 10, B: 128, ps: 0.8, mix: { heavy: 0.1, light: 0.3, local: 0.6 } },
]) {
  const samples = Array.from({ length: TRIALS }, () => sampleTree(rng, cfg));
  const nd = dist(samples, 'nodes');
  const cd = dist(samples, 'costUsd');
  console.log(`-- ${cfg.tag} (B=${cfg.B}, ps=${cfg.ps}) --`);
  console.log(`   nodes:  mean=${nd.mean.toFixed(1)}  p50=${nd.p50}  p95=${nd.p95}  p99=${nd.p99}  max=${nd.max}  (hard cap B=${cfg.B})`);
  console.log(`   costUsd: mean=$${f2(cd.mean)}  p95=$${f2(cd.p95)}  p99=$${f2(cd.p99)}  CVaR5%=$${f2(cd.cvar)}  max=$${f2(cd.max)}`);
  console.log(`   → reserve at CVaR5% ($${f2(cd.cvar)}) covers the tail; hard B caps the absolute worst at ~$${f2(cfg.B * 0.05)} (all-heavy).\n`);
}
console.log('FINDING: the hard node budget B makes worst-case cost DETERMINISTIC (B × max-per-node).');
console.log('Reserve once at the tree root for CVaR5% via cost-reservation-pool.admit({steps:B}); per-spawn');
console.log('admit() decrements from that single tree-scoped reservation. Free (local) lanes are $0 →');
console.log('cost ceiling governs WALL-CLOCK/concurrency, not USD, for a local-heavy tree → node budget is the');
console.log('real limiter there, not the USD cap. Both limits required; neither subsumes the other.');
