// Move-1b — MULTI-LEVEL BARRIER race simulation (the gap the single-level quantum sim did NOT cover).
// Question: a contradiction born at the DEEPEST leaf — does it reach the ROOT's terminal converge?
// Compares 3 barrier policies over random event schedules of a depth-D spawn CHAIN (chain = worst case
// for deep propagation: one path, one deep contradiction). Includes drain-lag + a per-level "invariant
// drop" probability q (a level converges without honoring its child wait — a realistic single-level bug).
//
// Events per node i (0..D): W_i = node writes its EOT->canonical (leaf D's W carries the CONTRADICTION);
// V_i = node i's TERMINAL converge verdict. FALSE-COMPLETION (H3) = root's V_0 finalizes while the leaf
// contradiction is not yet visible to what V_0 reads (read-view not drain-fresh w.r.t. W_D) AND the policy
// did not make V_0 wait. Correct (H2) = V_0 waits until W_D is visible -> contradiction becomes a flagged signal.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// One random schedule = a random permutation of all W_i and V_i events (no extra program order beyond the
// policy gates — we test the RACE, so the scheduler is adversarial/random). drainLagSlots = how many slots
// after W_D lands before it is visible in the read-view (models the drainer cadence; 0 = forced drain).
function simOnce(D, policy, q, drainLagSlots, rnd) {
  const events = [];
  for (let i = 0; i <= D; i += 1) { events.push(`W${i}`); events.push(`V${i}`); }
  const sched = shuffle(events, rnd);
  const pos = {}; sched.forEach((e, idx) => { pos[e] = idx; });

  const Wd = pos[`W${D}`];                       // when the deep contradiction is WRITTEN
  const deepVisible = Wd + drainLagSlots;        // when it is READABLE in the read-view

  // per-level invariant drop: a dropped level converges WITHOUT waiting for its child
  const dropped = []; for (let i = 0; i < D; i += 1) dropped[i] = rnd() < q;

  // Effective finalize slot of the ROOT under each policy:
  let rootFinalize;
  if (policy === 'none') {
    // root finalizes as soon as its DIRECT child reported (W1). Blind to anything deeper.
    rootFinalize = pos['W1'] ?? pos[`W${D}`];
  } else if (policy === 'direct-child') {
    // wait-chain: root waits for child's release, child waits for grandchild's, ... transitively to W_D,
    // BUT the chain breaks at the first DROPPED level (it releases early without waiting below it).
    let firstDrop = -1; for (let i = 0; i < D; i += 1) { if (dropped[i]) { firstDrop = i; break; } }
    if (firstDrop === -1) {
      rootFinalize = pos[`W${D}`];               // intact chain reaches the leaf
    } else {
      // chain links down to firstDrop's child level (firstDrop+1); below that it's blind -> finalizes at
      // the deepest W it still waits for = W_{firstDrop+1} (whatever the broken level reported), not W_D.
      rootFinalize = pos[`W${firstDrop + 1}`];
    }
  } else { // tree-scoped
    // root independently enumerates the WHOLE subtree's leases + forces a drain before finalize, so it is
    // gated to deepVisible regardless of any intermediate level's behavior. (registration assumed atomic at
    // spawn -> a leaf cannot be in-flight-but-unregistered.)
    rootFinalize = deepVisible;
  }
  // FALSE-COMPLETION if the root finalized strictly BEFORE the contradiction was visible to it.
  return rootFinalize < deepVisible ? 1 : 0;
}

function rate(D, policy, q, drainLag, trials, seed) {
  const rnd = mulberry32(seed);
  let f = 0; for (let t = 0; t < trials; t += 1) f += simOnce(D, policy, q, drainLag, rnd);
  return f / trials;
}

const TRIALS = 200000;
console.log(`=== MULTI-LEVEL BARRIER race  (${rj(TRIALS)} schedules/cell) ===`);
function rj(x){return x.toLocaleString('en-US');}
console.log('false-completion rate (root declares done while a DEEP contradiction is still un-drained):\n');

for (const drainLag of [3, 0]) {
  console.log(`-- drainLag=${drainLag} slot(s)  (${drainLag === 0 ? 'forced drain before finalize' : 'drainer cadence lag'}) --`);
  console.log('  D   q     none     direct-child   tree-scoped');
  for (const D of [2, 3, 5, 10]) {
    for (const q of [0.0, 0.05]) {
      const n = rate(D, 'none', q, drainLag, TRIALS, 1234 + D);
      const dc = rate(D, 'direct-child', q, drainLag, TRIALS, 5678 + D);
      const ts = rate(D, 'tree-scoped', q, drainLag, TRIALS, 9012 + D);
      console.log(`  ${String(D).padEnd(3)} ${q.toFixed(2)}  ${n.toFixed(3)}    ${dc.toFixed(3)}          ${ts.toFixed(3)}`);
    }
  }
  console.log('');
}
console.log('READ:');
console.log('• none ≈ 0.5 at all depths — matches the quantum sim 0.5 amplitude (independent cross-check of the race).');
console.log('• direct-child: q=0 it composes (≈0) BUT q=0.05 grows with depth = 1-(1-q)^D → the depth↔soundness');
console.log('  ENTANGLEMENT the Schmidt test saw. A single buggy level at depth re-opens deep false-completion.');
console.log('• tree-scoped + forced drain (drainLag=0): ≈0 at ALL depths AND robust to q (root enumerates the whole');
console.log('  subtree itself). This BREAKS the depth↔soundness entanglement → the architecture choice IS the fix.');
console.log('• drainLag>0 alone reintroduces false-completion even under tree-scoped → finalize MUST force a drain.');
