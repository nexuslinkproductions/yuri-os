# S2 — formula-foundry + math substrate: SLM research -> SYSTEM upgrades

> Subsystem synthesist pass. The slm-build research was for YURI THE SYSTEM, not just a future 7B. This maps
> the EML single-operator paper + the verifier/RLVR/SR literature onto concrete zero-GPU upgrades to
> formula-foundry.mjs, math-kernel.mjs, the bakeoff ladder, and the corner-law machinery. SLM = downstream
> consumer only. Every claim ties to a real mechanism + real arXiv ID. EML claims re-verified locally.

## The seam (independently re-verified, not taken on faith)
EML = one operator eml(x,y)=exp(x)-ln(y) + const 1; grammar S->1|eml(S,S) -> every expression is a uniform
binary tree of identical nodes, gradient-trainable (Adam fit -> harden weights toward 0/1 -> round to the
nearest simplex vertex). Source: arXiv 2603.21852v2.

Re-ran locally before staking anything (/tmp throwaway, deleted):
- ln(y) reconstructs EXACTLY from the basis: ln(y) = 1 - eml(0,y) -> err 0.0.
- 1-D gradient descent recovers confidenceDecay's halfLife (true 7) -> 7.0000000000000115, abs err 1.07e-14.

So the EML<->YURI bridge is NOT cargo-cult resonance - it's a literal reusable function. EML training's final
step (round weights to the nearest simplex vertex) is the SAME op izanagi-bridge.mjs#vertices() already does:
exact 2^k-corner enumeration (MAX_EXACT_AXES=16), sampled fallback above. The corner-law memory
(feedback-affine-objective-enumerate-corners) is the PROOF an affine objective over a simplex is extremal at a
vertex - exactly why EML hardens toward vertices. We have the hardening machinery already.

## The honest depth-5 cliff (the load-bearing caveat everywhere)
EML-SR recovery: 100% @ depth 2, ~25% @ depth 3-4, <1% @ depth 5 (author's own 1000+ runs). Multiplication
alone is depth 8; deeper trees = worse float stability (composed exp overflow, complex->NaN). So EML-SR in the
foundry is a shallow-law discoverer (depth<=4) ONLY - a new generator class beside the existing
composeOperatorSequences (whole-card chaining), NOT a kernel replacement and NOT a bit-exactness tool (the
14-EML doc's explicit trap: an eml-tree for entropy has MORE float ops than the direct kernel -> bigger
cross-ISA divergence; keep the direct kernels).

## What the subsystem already has (extend, never rebuild - capability_first)
- formula-foundry.mjs: dimension type-algebra + composeOperatorSequences/synthesizeFormulaCandidates (discrete
  whole-card chain enumeration; candidates land research/inert).
- formula-foundry-bakeoff.mjs: PROMOTION_LADDER = hypothesis -> simulated -> counterexample-tested ->
  proof-gated -> real-data-bakeoff -> owner-approved; sequential canPromote (no rung-skip), demotion-reset.
- math-kernel.mjs: 36 exports, 16 UNBOUND primitives = a ready cards-to-author worklist for EML to target.
- izanagi-bridge.mjs#vertices() + wave3-decision.mjs: the corner-law vertex enumerator (the EML harden step).
- yuri-energy.mjs: 12 weights (beta=2.0 wasserstein1, energyFormulaVersion 3); confidenceDecay is a LIVE term.
- 46,854-record burn-in trace = the data EML-SR fits a candidate energy-term form against.

## buildIn (zero-GPU, now)
1. eml-tree.mjs - the EML primitive + depth<=4 tree + Adam fit (M, high). The substrate everything stands on.
2. synthesizeFormulaCandidates gains a SECOND generator: EML-SR discovery beside whole-card chaining (M, high).
3. Reuse izanagi-bridge#vertices() as the EML weight-hardening step (S, med). Cap <=16 leaf weights.
4. 'simulated' bakeoff rung := an EML-recovery proof (S, med). The rung exists; it just needed a meaning.

## simulate (before committing)
1. Depth-recovery curve on YURI's own 16 unbound kernels + confidenceDecay/wasserstein1 (M, high) - GATES #2.
2. Float-stability stress on composed depth-4 eml-trees (S, med) - run before any 'simulated' pass.
3. EML-SR on the 46k trace to PROPOSE an energy-term FORM, shadow-only (L, med) - eta/theta barriers off-limits.

## calculate
1. Per-kernel EML-expressibility + min-depth table over all 36 exports (M, high) - names what EML can ever author.
2. Corner-count budget: confirm depth-4 trees stay <=16 weights for exact vertex enumeration (S, med).
3. Derive the 'simulated'-rung epsilon as effect-size + RMSE rank, not a hand-picked cutoff (S, med).

## topMove
Build eml-tree.mjs and wire it as a SECOND generator in synthesizeFormulaCandidates, harden via
izanagi-bridge#vertices(). Turns a verified structural resonance into a live discovery capability with ZERO new
governance - the corner-law harden machinery exists, the 'simulated' rung is waiting, the kernel/barriers/
bit-exactness are untouched.

## Downstream (SLM as consumer, not driver)
Any soft energy-term form EML-SR discovers here, once proof-gated, becomes a deterministic verifier term - and
computeU is exactly the non-differentiable RLVR/ZO objective the SLM literature (MeZO 2305.17333, GRPO
2402.03300, rStar-Math 2501.04519, SLM-needs-strong-verifier 2404.17140) wants. The system discovers the law;
the 7B later trains against the gate that law sharpens. We build the substrate now; the SLM consumes it on go.

_resultLabel: 08FF_EML_SR_FORMULA_FOUNDRY_SYSTEM_INTEGRATION_X_PASS_COMMITTED_