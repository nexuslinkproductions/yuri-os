---
name: yuri-mainspring-synthesis-2026-06-07
description: Mainspring wave (9 agents) synthesis — the yuri-match universal cross-reference service is BUILT (12/12) + surface adapters (46/46) + numerology mechanisms built/wired/registered (36/36). Empirically verified honest limit: within-surface recall works, naive cross-surface recall returns {} (length band + per-corpus vocab). The 2 architects' designs: federation = union-of-per-surface-complete (not one merged index); the STRUCTURAL fusion (similarity ⊕ circuitry-graph via id-bridge table) is the sound mainspring; navigation = deterministic personalized-PageRank (forward=consequences/reverse=causes); cross-surface comparable scores blocked on the GVF C-layer.
metadata: { node_type: synthesis, date: 2026-06-07, status: mainspring-built-cross-surface-blocked-on-calibration, source: mainspring-wave-9agents, tier: high }
tags: yuri_match, universal_cross_reference, navigation, personalized_pagerank, numerology, id_bridge_table, calibration_dependency
---

# Mainspring wave — yuri-match built; the honest path to navigate-everything

9 agents (2 native architects + 5 Codex + 2 DeepSeek). The universal cross-reference service is BUILT + verified;
the empirical test + the architects converge on what's sound NOW vs what's blocked on calibration.

## BUILT + VERIFIED (re-ran locally)
- **`yuri-match.mjs`** — universal service: `register / recall / recallAll / explain` + a completeness+provenance
  envelope per hit (`complete, totalAboveThreshold, threshold, corpusId, buildThreshold`). 12/12. Reuses corpus-match;
  memory-match migrates behind it.
- **`yuri-match-adapters.mjs`** — `{id,text}` adapters for code / graph-nodes / skills / memory(Track-A) / docs
  (protected-path skips). 46/46. Every surface is now registrable.
- **`nexus-numerology.mjs`** — the REAL numerology mechanisms (PRINCIPLES not mysticism): gematria = deterministic
  hash, digital-root = mod-9 ring homomorphism, harmonic-ratio signature → OPT-IN feature channels wired into
  token-expand (regression-safe: token-expand 62 / corpus-match 36 / memory-match 13 green), registered in
  MATH-SCIENCE-MANUAL + a graph-node proposal. 36/36. (Marcel's ask CLOSED: built + wired + registered.)

## EMPIRICAL HONEST LIMIT (verify-vs-live caught it)
`recallAll("energy lyapunov gate veto")` across 5 registered surfaces (1006 items) returned **`{}`** — zero
cross-surface hits. NOT a service bug: within-surface recall works perfectly (an energy module's text recalls
itself in the code corpus, complete:true). The `{}` is two real effects the architects predicted:
1. **Length band:** the prefix-filter's `|x| ∈ [⌈t·|q|⌉, ⌊|q|/t⌋]` excludes a 4-word cue from matching long
   module/doc texts at any meaningful threshold. Short-cue↔long-doc similarity is structurally weak.
2. **Per-corpus vocabulary:** `makeFeatureFn` learns its PPMI expansion PER corpus → a cue expanded under one
   surface's map isn't comparable to another surface's index.

## ARCHITECT N1 — universal cross-reference (the sound design)
- **Federation = union of per-surface-COMPLETE sets, NOT one merged index** (because featureFn is per-corpus).
  `recallAll` fans out, each surface returns its complete set + true count; the envelope sums them honestly.
  Completeness is preserved (each summand provably complete) — "complete within each surface's vocabulary."
- **The sound mainspring = STRUCTURAL fusion.** A typed multigraph: matcher SIMILARITY edges ⊕ circuitry-graph
  STRUCTURAL edges (source→target), NEVER blended into one scalar (pairing-law discipline on edges). The
  **id-bridge table** from `yuri-circuitry-graph nodes[].files[]` (a deterministic join) stitches structural
  node-ids ↔ code record-ids — the single load-bearing artifact. Build it first.
- **Cross-surface COMPARABLE SCORES are blocked on the GVF calibration C-layer** — federation-comparability =
  governance-comparability = the SAME problem. v1 ship = surface-stratified (within-surface scores comparable);
  v2 = rank-fusion (RRF); v3 = conformal-calibrated fusion (the C-layer keystone). Don't claim "comparable scores
  across all of YURI" until C lands.
- Honest gaps: similarity fuses PEERS (same scale), structure fuses SCALES (symbol↔doc); the multigraph is
  complete only over {graphed nodes} ∩ {indexed records} — the symmetric difference is a dead-zone (class-G).

## ARCHITECT N2 — navigation operation
- **`navigate(seed) → ranked cross-surface neighborhood`** = deterministic **personalized-PageRank / random-walk-
  with-restart** by power iteration over `M = αS + βR` (similarity block S + directed structural block R).
  Closed-form fixed point ⇒ determinism by construction; converges geometrically (~20-40 iters, any graph size).
- **Bidirectional = the autodiff duality:** forward walk (`M = αS + βR`) = consequences/what-flows-from; reverse
  walk (`M = αS + βRᵀ`, transpose only the structural block — similarity is symmetric) = causes/what-led-here.
  The graph's existing `is_return` edges are the pre-built reverse skeleton.
- **GPD self-triggers the walk:** `recall` becomes a multi-hop walk, each hop one `fireRule` tick, bounded by FOUR
  independent brakes — conserved budget B (autonomy is a conserved quantity), info-clock τ(x), relevance-decay
  (rising per-hop threshold), GVF veto. Chases anything-from-anything yet provably terminates at a quiescent attractor.
- **Sharpness (5 layers) beats the everything-connects-to-everything noise:** completeness is a THRESHOLD contract
  (sparse by math, not top-N truncation) · restart-decay (geometric distance penalty) · per-hop threshold escalation
  · knee-cut (reports `sharp:false` instead of faking a long list) · typed clamped fusion.
- Honest limits: nav-reverse = TOPOLOGICAL causes, NOT GPD-reverse's quantitative credit (complementary, not
  identical); navigation is complete-on-MEANING (39k+ proven) but partial-on-STRUCTURE (the graph is a 124-node
  curated map until the auto-registration vision lands); must use exact/prefix-filter S, never LSH, for determinism.

## THE PATH (sequenced, shadow-first, owner-gated)
1. ✅ yuri-match service + adapters + numerology (BUILT) → **build the id-bridge table** (`nodes[].files[]` join) +
   `yuri-navigate.mjs` (the structural multigraph walk, RWR, forward/reverse) — the sound mainspring, buildable today.
2. The GVF calibration C-layer (conformal over the matcher's complete set) → unlocks v3 cross-surface comparable
   scores → THEN recallAll speaks one probability across surfaces.
3. GPD navigates the fused substrate (recall = bounded multi-hop walk); confirm-or-kill on the 124-node graph
   (forward from a node ranks its flow-downstream; reverse ranks upstream feeders; agrees with gitnexus_impact).
4. Auto-registration so every node joins the wiring → the structural graph stops being 124-node-curated → navigation
   becomes complete-on-structure too.

**One line:** the universal recall ENGINE is built + proven within-surface; "navigate everything" cross-surface is
sound via the STRUCTURAL bridge (build now) and gains comparable SIMILARITY scores once the calibration C-layer lands
— the mainspring turns, the cross-surface gear meshes after calibration.

SEE: [[yuri-clockwork-northstar-2026-06-06]], [[yuri-breakthrough-GPD-2026-06-06]], [[yuri-governance-architecture-GVF-2026-06-06]], [[governance-gvf-gpd-breakthrough]].
