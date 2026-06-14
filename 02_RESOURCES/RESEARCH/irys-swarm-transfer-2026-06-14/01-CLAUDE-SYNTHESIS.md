# CLAUDE SYNTHESIS — irys-stateful-swarms → YURI nano-swarm (verified spine)

> Claude (Opus) lane, grounded in the actual code at `/tmp/irys-ss` (not the README marketing). This is the Claude-verified spine; peer-lane findings (Mimo, DeepSeek, Nemotron) merge in `02-CROSS-LANE` as advisory-until-verified.
> Evidence basis: read README, docs/SWARM_INTELLIGENCE.md, src/swarm/{convergence,orchestrator,worker_dispatch,blackboard}.py in full; structure of {debt_sensors,survival_trace}.py; FAILURE_ANALYSIS.md section map.

## THE ONE THESIS THAT MAKES THIS WORTH RAIDING

"Performance comes from the architecture, not the model." (README §57) They hit 17.75% on Harvey LAB at $1.30/task with Gemini Flash models that score **0% in other agentic harnesses**. The intelligence is in coordination + structured state + convergence discipline — applied to WEAK workers. That is exactly YURI's nano-swarm situation: a set of cheap/varied cross-family peer lanes whose value comes from how well they're orchestrated, converged, and verified — not from any one lane's IQ. Everything below is in service of that transfer.

## RANKED TRANSFER (fit × gap-size × reversibility)

### TIER 1 — high-value, direct, reversible

**T1 · 3-layer convergence gate → replace the loop-until-dry counter.**
- Theirs (`convergence.py:check_convergence`): (a) DETERMINISTIC structural floor (per-doc extracted < expected×0.5 → not done), (b) DETERMINISTIC critical-signal block (any open `critical` signal → not done), (c) ADVERSARIAL LLM gate: *"The orchestrator says COMPLETE. Find reasons it is NOT"* — rejects re-inject as `convergence_gap` signals → next round. + `supervisor_review` (default-APPROVE; REVIEW only if gaps are material AND specific AND actionable) + `analytical_steering` every 4th iter (force extraction→analysis shift).
- YURI gap: Workflow loop-until-dry is a bare K-empty-rounds counter. We own the adversarial-verification *skill* but run it as a per-task habit, never as a loop gate with gap-reinjection.
- Transfer: source=bounded-doc convergence / target=nano-swarm loop / shared=measure-state-vs-requirements-then-decide-stop / mismatch=their floor needs a coverage denominator / **confidence HIGH**.
- Wiring: `_SYSTEM/Scripts/swarm-convergence.mjs` for Workflow scripts — floor (all sub-tasks returned non-empty + all RESULT_LABELs ∈ {X,P}), critical-block (any unresolved CRITICAL finding), adversarial pass (1 agent: "swarm says done — find the hole"; findings = next round). Drops into the canonical loop-until-dry shape.
- Reversibility HIGH (opt-in helper) · blast LOW.
- **WHERE IT BREAKS:** their cheapest, strongest signal — the structural coverage floor — relies on a GROUND-TRUTH denominator ("doc has N numbered items"). Open-ended YURI work (research/architecture/debug) has NO N. So we inherit the adversarial gate + critical-signal block cleanly, and must NOT fabricate a coverage % where none exists (their own §11b confidence-not-calibrated warning).

**T2 · Custody-break 12-type taxonomy → zenkai / failure-evolution diagnostic ontology.**
- Theirs (SWARM_INTELLIGENCE §8): absent-state, wrong-world, wrong-object, identity-continuity, wrong-relation, unpromoted-fact, lost-commitment, wrong-artifact, wrong-sufficiency, hidden-ambiguity, false-completion, build-process — + FAILURE_ANALYSIS.md is the 38-section worked example of applying it across 1,251 tasks.
- YURI gap: zenkai/failure-evolution captures failures with NO standing taxonomy for multi-agent / state-handoff loss classes. We classify ad hoc → [[feedback-green-red-grey-test-layering]] hungers for exactly this kind of named failure-mode set.
- Transfer: shared=information loses integrity across transformation steps / mismatch=a few types are doc-shaped / **confidence HIGH**.
- Wiring: add the taxonomy as a classification table in `failure-evolution-loop`/`zenkai`; tag every captured failure with a type; key the regression on it. `false-completion` = the literal justification for the energy gate; `lost-commitment`/`unpromoted-fact`/`identity-continuity` map straight onto lane-handoff + our content-hash paraphrase-dedup gap.
- Reversibility HIGH (skill/doc) · blast NONE (advisory).
- **WHERE IT BREAKS:** wrong-artifact / wrong-sufficiency are doc-analysis-shaped; recast for YURI (wrong-artifact → result landed in wrong lane/file; wrong-sufficiency → partial-claimed-as-complete). Adapt, don't adopt verbatim.

**T3 · Debt sensors / completeness-lens system → new "swarm work-completeness" organ.**
- Theirs (`debt_sensors.py`, env-gated default-OFF): relation / source-object / severity / authority / calculation debt; pipeline detect → `coordinate_debt_sensor_items` (prioritize under budget) → `debt_sensor_items_to_gap_entries` (materialize as BLOCKING gaps) → `execute_*_debt_items` (repair workers). Multiple independent sensors; if any flags, treat as real.
- YURI gap: zero completeness sensors over swarm output. The energy gate measures ΔU (progress/regress), NOT "what is structurally missing from the work product."
- Transfer: shared=independent detectors for specific incompleteness modes that become blocking work / mismatch=their types are legal-doc-shaped / **confidence MEDIUM-HIGH**.
- Wiring: `swarm-debt-sensors.mjs` with YURI-native sensors, DISARMED-first (our standing pattern): authority-debt = claim without file:line evidence (maps to the Evidence Contract Grammar — can be DETERMINISTIC), relation-debt = cross-file change not propagated (maps to `propagation-scan.mjs` — DETERMINISTIC), severity-debt = risk noted without mitigation, coverage-debt = referenced-but-unread.
- Reversibility HIGH (env-gated detect-only) · blast LOW.
- **WHERE IT BREAKS:** their sensors are LLM-judgment ("can the sensor identify debt?" = their deepest risk, §7). YURI advantage: prefer DETERMINISTIC sensors (grep for file:line, propagation diff) over LLM ones; never threshold on LLM confidence (§11b).

**T4 · Damping → harden Workflow loops against oscillation.**
- Theirs: signal dedup-on-add (`blackboard.add_signal`, trigram `signals_similar` → bump priority not duplicate), `expire_old_signals` (medium/low die after 3 iters; critical/high NEVER expire), + §11 action cooldowns / marginal-value thresholds / rejected-action memory / budget governor (≥85%).
- YURI gap: loop-until-dry has K-empty-rounds + loop-until-budget but no rejected-action memory, no cooldown, no priority-tiered expiry; the `seen` Set is hand-rolled per workflow.
- Transfer: shared=don't re-do dropped/rejected work; let stale low-value items die / mismatch=minimal / **confidence HIGH**.
- Wiring: bake `seen`+`rejected` finding-hash registries + priority-tiered expiry + marginal-value cutoff (stop when round-yield < threshold) into the canonical loop-until-dry pattern + a small helper.
- Reversibility HIGH · blast NONE.
- **WHERE IT BREAKS:** trigram dedup is lossy — safe for SIGNALS (questions), dangerous for FINDINGS (claims) where it could merge two distinct results. Keep dedup on questions; keep content-hash + semantic-care on claims.

### TIER 2 — strong, more wiring

**T5 · `epistemic_classification` + `epistemic_motivation` per finding → enrich claim-evidence ledger.** Theirs (`worker_dispatch.compose_worker_prompt`): every finding tagged fact|adversarial_claim|expert_opinion|inference|strategic + "whose interests does this serve?"; adversarial sources flagged downstream. YURI gap: claim-evidence ledger separates claim/evidence but not source-interest — gold for sales-intel + research + adversarial-verification. **confidence HIGH.** BREAKS: "whose interests" is N/A for pure-code findings — make it optional-but-encouraged.

**T6 · Contradiction → critical-signal → blocks-convergence (belief propagation).** Theirs (`blackboard._propagate_effects`): a `contradicts` link penalizes both entries, marks them `disputed`, spawns a CRITICAL resolution signal (which blocks convergence), ripples −0.05 to supporters; `supersedes` reopens previously-addressed signals. YURI gap: canonical store has retract/supersedes but contradiction doesn't auto-spawn a blocking task or reopen dependents; our JTMS sidecar (P5, DISARMED) is the home for this. **confidence MEDIUM-HIGH.** BREAKS: their +0.05/−0.12 confidence arithmetic is admitted magic numbers (§11b) — import the STRUCTURE (contradiction = blocking event + propagation), NOT the numbers; score via our effect-size discipline ([[feedback-effect-size-over-binary-threshold]]).

**T7 · Object permanence / cross-entry identity resolution → fix canonical paraphrase-dedup gap.** Theirs (SWARM_INTELLIGENCE §2 + Open-Research-Q#1): stable entity accreting fields across name variants. YURI gap: canonical dedups by content-hash → paraphrases diverge → no semantic identity (our convergence-design residual risk #3). **confidence MEDIUM.** BREAKS: UNSOLVED even for them — research-grade, park as Phase-2, not a quick win.

### TIER 3 — principles (adopt as discipline)

- **T8 · "Synthesis is the bottleneck" (FAILURE_ANALYSIS §16, H1 CONFIRMED).** Their failures cluster in synthesis/placement (matter custody), not extraction. → YURI: the nano-swarm's weak point is the CONVERGENCE/synthesis step, not the fan-out; spend verification budget there.
- **T9 · Three-tier cascade** (Read=cheap / Reason=mid / Construct=Opus). Formalize in llm-compat routing what we already do ad hoc via model-self-select.
- **T10 · Must-surface policy** (§10): exact values, contradictions, unresolved signals, dissent, zero-evidence requirements ALWAYS surface → synthesis-step checklist, maps to Evidence Contract + adversarial-verification.
- **T11 · Operational-vs-advisory gap** (§3, the meta-lesson): "open work must become a blocking work queue." This is the spine tying T1+T3+T6 together and the honest argument for ARMING gates per-class instead of leaving everything DISARMED.

## THE ADVERSARIAL META-BREAK (most important honesty)

Their whole system is a **closed-world, bounded-deliverable control system**: a task HAS a definable "complete" state (all doc items extracted, all criteria addressed, deliverable placed). YURI's nano-swarm does **open-ended** work where "complete" is often undefinable and the denominator unknown. Consequences:
- Their cheapest/strongest signal (deterministic coverage floor) **mostly does NOT transfer** — we lack the N.
- Transfers clean: adversarial convergence gate, failure taxonomy, debt-sensor PATTERN (made deterministic), damping, epistemic tagging, contradiction-as-blocking.
- Research-grade: object permanence.
- **Do NOT import:** their uncalibrated confidence arithmetic (they warn against it themselves).

## RECOMMENDED FIRST MOVE
T1 + T4 together as one `swarm-convergence.mjs` + damping helper for Workflow scripts (highest fit, both HIGH-reversible, immediately useful on the next nano-swarm), with T2 (taxonomy into zenkai) as a parallel zero-risk doc add. T3 debt-sensors as the next organ, DISARMED-first.

RESULT_LABEL: 08RX_IRYS_SWARM_TRANSFER_CLAUDE_SPINE_X_PASS_UNCOMMITTED
