# QUANTUM SIM — recursive spawn_nano + EOT→canonical (order-effect analysis, pre-Move-1b)

> Tool: `quantum-hypothesis-tracker.mjs` (tier 3 of the sim arsenal; gate re-verified PASS 2026-06-14). Harness: `/tmp/spawn-quantum-sim.mjs` (throwaway, reproducible). Owner asked for this BEFORE building Move 1b.
> Honesty: ℝ^3 abstract model, hand-built projectors — the VALUES are geometry-dependent, the STRUCTURE is the finding. Validated two-sided: a commuting control shows NO effect (not laundering) + classical Bayes is blind (the effect is genuinely order-borne).

## THE QUESTION
The design has a non-commuting pair: **A = child writes EOT→canonical** vs **B = parent runs convergence gate**. Does order change the terminal truth-state? Hypotheses: H1 CONSISTENT · H2 CONTESTED-FLAGGED (handled) · H3 FALSE-COMPLETION (parent declared done before a child's contradiction landed → silent bad).

## RESULTS
| Run | order A→B (child settles, parent last) | order B→A (parent first, child settles last) | Δ false-completion |
|---|---|---|---|
| **Quantum (non-commuting, `<A\|B>`=0.5)** | P(H1,H2,H3) = [0.5, 0, **0.5**] | [0.5, **0.5**, 0] | **0.5** swing |
| **Classical Bayes (order-blind control)** | [0.818, 0.091, 0.091] | [0.818, 0.091, 0.091] | **0** (BLIND) |
| **Commuting control (barrier / idempotent re-read)** | [1, 0, 0] | [1, 0, 0] | **0** (fix) |

Schmidt coupling (depth ⊗ soundness): coupled model spectrum **[0.884, 0.468]** (two non-trivial → ENTANGLED); separable [1, 0]. QQ statistic = 0 (model quantum-consistent) with order-sensitive conditionals `p_AyBn=0.5 ≠ p_AnBy=0.167`.

## INTERPRETATION
1. **Real order effect, 0.5 magnitude.** Whichever measurement is LAST sets the terminal: parent-converges-last over a still-integrating child → 50% false-completion; child-integration-last → 0% (the contradiction becomes a flagged H2 instead of a silent H3).
2. **Classical reasoning misses it entirely** (Δ=0). A non-quantum design review would green-light the racy design.
3. **The fix is a barrier** — the commuting variant zeroes false-completion, order-independently.
4. **Depth couples to soundness** — deeper recursion = more parent-child race windows = the entanglement the Schmidt test shows. The depth cap bounds soundness risk, not just cost.

## BUILD RULES FOR MOVE 1b (derived)
- **RULE 1 — convergence barrier (the commuting fix).** A parent's convergence gate MUST NOT emit its terminal `converged` verdict while any spawned child's EOT→canonical write is still in flight. Concretely: after a child lands its EOT, the parent **re-runs Move-1 Layer-2** (re-reads `contestedClaims()` from the canonical store) — idempotent re-read = the commuting operator. A child's late contradiction then surfaces as a flagged H2 (blocking critical-signal), never a silent H3. This wires straight into the existing `swarm-convergence.mjs` gate (re-check on child-completion event).
- **RULE 2 — depth caps are soundness governors, not just cost.** Heavy lanes depth 5 / light lanes depth 10 (owner-set) bound the number of race windows. Frame + document them as truth-soundness bounds (deeper = more entanglement = more re-barrier cost). Each spawn level inherits the barrier.
- **RULE 3 — EOT-as-canonical-writer is SOUND under the barrier.** The "every spawned agent closes with an EOT that writes canonical claims" design is safe *iff* Rule 1 holds; without the barrier it carries the 0.5 false-completion amplitude.

## CAVEAT (do not overclaim)
The 0.5 is a function of the 45° projector geometry, NOT a measured probability. The finding is the EXISTENCE + DIRECTION of the order effect + that a barrier removes it + that depth couples to soundness. Advisory until a live logged-sequence test (the skill's promotion path). Build Rule 1 regardless — it's cheap, reversible, and the structural argument is sound.

RESULT_LABEL: 08RX_SPAWN_NANO_QUANTUM_ORDER_EFFECT_BARRIER_REQUIRED_X_PASS_UNCOMMITTED
