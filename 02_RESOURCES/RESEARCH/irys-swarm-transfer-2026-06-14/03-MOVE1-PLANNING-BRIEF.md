# MOVE 1 PLANNING BRIEF — YURI nano-swarm convergence gate + damping

> Multi-lane peer planning swarm. Lanes: Claude/Opus (synthesis) + Mimo + DeepSeek + Nemotron-3-Ultra + Kimi-k2.7-code, all co-equal via llm-compat. Output advisory-until-verified.
> Read FIRST: `02_RESOURCES/RESEARCH/irys-swarm-transfer-2026-06-14/02-CROSS-LANE-SYNTHESIS.md` (the transfer verdict) + `01-CLAUDE-SYNTHESIS.md`.

## THE VERDICT THIS PLAN EXECUTES (locked, do NOT relitigate)
Take the convergence **GATE + damping + output quality-filter** from irys-stateful-swarms and **wrap them around YURI's existing native fan-out**. Do NOT import their LLM-as-controller (downgrade vs Claude native Workflow/Agent agency). Do NOT import their cheap→expensive cascade (our peers are co-equal). Nothing that downgrades YURI (owner-locked principle).

## MOVE 1 SCOPE (this plan only)
Build `swarm-convergence.mjs` (the 3-layer convergence gate, reified for open-ended work) + damping, additive + feature-flagged + DISARMED-first + reversible. NOT the typed blackboard, NOT debt sensors, NOT the custody taxonomy (those are later moves).

## THE 3 LAYERS — reify for YURI (their convergence.py → us)
1. **Deterministic floor.** Theirs = doc-coverage (extracted ≥ expected×0.5). Ours has NO coverage denominator → reify as an OBLIGATION-LEDGER from the task decomposition: every leaf sub-task must have ≥1 conforming RESULT_LABEL (∈ {X,P}, via contract-conformance.mjs) AND non-empty output. Treat the ledger as HYPOTHESIS not ground truth (their task-world principle).
2. **Critical-signal block.** Any unresolved CRITICAL signal (e.g. a detected contradiction, a security/data-loss flag) → NOT converged. Where do "signals" live for a YURI run? (open design Q for the plan.)
3. **Adversarial peer pass.** One peer lane (NOT the lane that did the work) prompted *"the swarm says done — find what's missing: verification / edge-case / test / integration"* (Nemotron's domain-shift). Rejects re-inject as next-round work. + a supervisor pass (default-APPROVE; gaps must be material∧specific∧actionable).

## DAMPING (their §11 → us)
seen/rejected finding-hash registries · priority-tiered signal expiry (crit/high persist, med/low die after N rounds) · action cooldown (don't re-dispatch same action+target within N) · marginal-value cutoff (stop when round-yield < threshold) · budget governor (reuse cost-reservation-pool.mjs).

## THE KEY OPEN DECISION FOR THE PLAN
**Where does the gate hook in?** Three real YURI surfaces (all verified to exist) — recommend ONE with reasoning:
- `yuri-workcell.mjs` (1539 lines) — DAG-based workcell run loop (run-level convergence).
- `lane-kernel.mjs` — per-lane loop (Nemotron suggested per-round termination here).
- `kagami-swarm-supervisor.mjs` — the swarm supervisor (natural home for a supervisor-review second gate).
Read them, decide the hook point(s), justify. The gate must compose with YURI's native Workflow loop-until-dry patterns too (it's a helper a Workflow script can call after each round).

## DELIVERABLE FROM EACH LANE (<=80 lines, dense, evidence-backed, file:symbol)
1. `swarm-convergence.mjs` module API (exported fns + signatures + return shapes).
2. The 3 layers reified — concrete predicates, esp. the obligation-ledger floor (how is the ledger built from a decomposition? what's "conforming"?).
3. Damping state shape + where it lives (ephemeral per-run path).
4. Integration-point recommendation (which of the 3 surfaces, why, exact hook location).
5. TDD plan: synthetic-loop tests proving (a) blocks on open critical signal, (b) blocks on empty leaf, (c) adversarial reject re-injects, (d) damping stops oscillation, (e) converges when all satisfied. DISARMED behind `YURI_SWARM_CONVERGENCE=1`.
6. Reversibility + blast-radius + where the analogy still BREAKS for open-ended work.
End with a RESULT_LABEL.
