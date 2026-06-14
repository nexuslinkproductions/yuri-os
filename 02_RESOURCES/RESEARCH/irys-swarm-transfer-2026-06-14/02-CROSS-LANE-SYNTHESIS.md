# CROSS-LANE SYNTHESIS — irys-stateful-swarms → YURI nano-swarm

> Merge of 3 cross-family peer lanes + Claude spine. ✓ = Claude-verified against live code/repo. `[lane]` = peer-claimed, advisory-until-verified.
> Lanes: **Claude/Opus** (01-CLAUDE-SYNTHESIS, read the source), **Mimo** (mimo-v2.5-pro), **DeepSeek** (deepseek-v4-pro, live tool-traced YURI), **Nemotron-3-Ultra** (ollama-cloud; first pass wedged in the 65536 output-cap retry loop → stopped + re-dispatched tight, landed clean). **ALL FOUR lanes independently rank the 3-layer convergence gate #1.**
> Convergence is partly seeded (all lanes got the same brief) — but each added NET-NEW structure the brief did NOT contain (flagged below), which is genuine independent signal, not framing-artifact ([[blind-the-fleet-no-seeded-convergence]]).

## UNANIMOUS CONVERGENCE (all 3 lanes, independently ranked top)

**#1 · 3-layer convergence gate — the single biggest orchestration gap (unanimous #1).**
✓ Their `convergence.py:check_convergence`: deterministic structural floor + deterministic critical-signal block + adversarial LLM *"orchestrator says COMPLETE — find why it's NOT"* with gap-reinjection; + `supervisor_review` (default-APPROVE, gaps must be material∧specific∧actionable). ✓ YURI has NO formal convergence criterion — Workflow loop-until-dry is a bare K-empty-rounds counter; adversarial-verification is a per-task habit, never a loop gate; energy gate is advisory fail-open. Confidence ~0.85.

**#2 · Damping — most domain-agnostic, lowest-risk transfer (DeepSeek ranked it #2, conf 0.88).**
✓ Their signal dedup-on-add (trigram `signals_similar`), `expire_old_signals` (med/low die @3 iters, crit/high persist), + §11 cooldowns / marginal-value / rejected-action memory / budget governor. ✓ YURI has only budget + K-empty-rounds; nano-swarm fan-out can oscillate find-gap→fill→new-gap. "Damping is domain-agnostic control theory" — transfers near-verbatim.

**#3 · Deterministic quality gate on lane OUTPUT (Mimo + DeepSeek both elevated this to top-3 — net-new vs my brief).**
✓ Their `worker_dispatch.py:passes_quality_gate`: observation must have a source.document; calculation must have ≥2 digits AND an operator; content ≥20 chars; robust bracket-count JSON recovery. ✓ YURI gap (DeepSeek live-traced): `contract-conformance.mjs` checks the RESULT_LABEL *format* but NOTHING about content — a lane can emit a valid label with empty findings. Fill: deterministic per-lane-type content floor (code→must carry file:line or a diff hunk; research→must carry a source ref; analysis→claim/evidence separated).

## THE DECISIVE ADVERSARIAL REFINEMENT (DeepSeek's catch — Claude endorses)

**Take the convergence GATE, not the CONTROLLER.** ✓ Their orchestrator *is* an LLM call — a prompt decides what to dispatch. YURI's Claude lane has NATIVE tool-use agency (Workflow/Agent fan-out, real planning). Importing their orchestrator-as-prompt would be a **downgrade**. So the move is NOT "replace our orchestrator" — it's **wrap our existing native fan-out with their gate + damping + quality-filter.** This reframes the whole raid: additive guardrails around what we already do well, not a control-plane rewrite.

## TIER 2 — strong, more wiring

- **Operational-vs-advisory gap classification** (§3, "open work must become a blocking work queue"). Makes the gate *enforceable*: required-but-missing → operational (blocks); nice-to-have → advisory (logs). Default-to-operational safe bias. This is the honest argument for ARMING gates per-class vs leaving all DISARMED.
- **Typed/epistemic enrichment + task-local blackboard.** Mimo's net-new architecture (endorsed): a task-local EPHEMERAL blackboard distinct from the durable canonical store, one-way migration at run completion — avoids dual-truth. Add `entryType` + `epistemicClassification(fact|adversarial_claim|inference|strategic)` + `epistemic_motivation` + typed support/contradict links. ✓ DeepSeek's schema-v2 detail: additive fields, old readers map unknown→'finding'. Contradiction → critical-signal → blocks-convergence is the runtime trigger for our DISARMED JTMS sidecar.
- **Debt sensors / lens organ** (DISARMED-first, our standing pattern = their env-gated-OFF). YURI advantage: make sensors DETERMINISTIC where possible — authority-debt = claim w/o file:line (Evidence Contract), relation-debt = change w/o propagation (`propagation-scan.mjs` / GitNexus), test-debt, call-site-debt, commit-debt. LLM sensors only for the lens-coordinator (prioritize under budget).
- **Custody-break 12-type taxonomy → zenkai/failure-evolution.** Diagnostic ontology for how multi-agent state work loses info source→artifact. ~8/12 transfer directly (unpromoted-fact, lost-commitment, false-completion, identity-continuity); 4 need renaming (wrong-world→wrong-architecture, wrong-object→wrong-symbol). The whole 2.4MB FAILURE_ANALYSIS.md is the worked example (38 sections, "synthesis is the bottleneck" H1 confirmed) — a standalone zenkai mine.

## HONEST META-BREAKS (where the analogy fails — all lanes agree)

1. ✓ **No coverage denominator in open-ended work.** Their cheapest/strongest signal (structural floor: "doc has N items") needs a GROUND-TRUTH count we lack. Reify as an obligation-ledger from workcell decomposition — and treat that ledger as HYPOTHESIS, not truth (their own task-world principle).
2. ✓ **Don't import their confidence arithmetic.** +0.05/−0.12 are admitted uncalibrated magic numbers (§11b). Import the STRUCTURE (contradiction=blocking event), score via our effect-size discipline ([[feedback-effect-size-over-binary-threshold]]).
3. **Orchestrator-as-LLM is a downgrade** (DeepSeek) → gate not controller (above).
4. **Inverted tier economics** (DeepSeek, net-new) → their cheap-read→expensive-construct cascade does NOT cleanly map; our peers are CO-EQUAL (DeepSeek/Mimo/Ollama), no cheap/expensive gradient. Knocks down the "three-tier cascade" candidate — demote it.
5. ✓ **Object permanence / semantic entity resolution = UNSOLVED research** (their open-Q#1, our content-hash paraphrase-dedup gap). High value, but park as Phase-2 research, not a quick win.

## RECOMMENDED BUILD ORDER (convergent across lanes)

1. **MOVE 1 (build first):** `swarm-convergence.mjs` + damping (one module or two) — the 3-layer gate (deterministic obligation-floor + critical-signal block + adversarial peer pass with gap-reinjection) + cooldowns/rejected-memory/marginal-value. Wire into the `yuri-workcell.mjs` loop / `kagami-swarm-supervisor.mjs` (✓ the real swarm-supervisor surface; Mimo's "autonomy-runner.mjs" does NOT exist — `filing-autonomy.mjs`/`kagami-swarm-supervisor.mjs` are the real homes). HIGH-reversible, additive, budget-capped. **Minimum viable orchestration upgrade: one stops premature termination, the other stops infinite oscillation.**
2. **MOVE 2:** deterministic quality gate extending `contract-conformance.mjs` — content floor per lane-type, not just label format.
3. **MOVE 3 (parallel, zero-risk):** custody-break taxonomy into the zenkai/failure-evolution skill (doc/config add, advisory).
4. **LATER (Phase 2):** task-local typed blackboard (ephemeral) + canonical schema-v2 enrichment; debt-sensor organ (DISARMED-first); operational/advisory classification (depends on the obligation ledger from Move 1).

## NEMOTRON-3-ULTRA — 4th lane (net-new domain-translation refinements)

Confirmed the top-5 ranking (convergence gate #1, quality gate, typed blackboard, custody taxonomy, operational/advisory gaps). Net-new beyond the other three:
- **Layer-3 adversarial prompt must SHIFT domain:** not "missing doc items" but *"missing verification / edge-case / test / integration."* Concrete reframe of the convergence gate's adversarial pass for software/research work.
- **`epistemic_motivation` translation:** "whose interests does this serve?" (their legal-adversarial framing) → *"which constraint/goal does this serve?"* (owner intent / safety gate / performance / compatibility). The right YURI cast.
- **Extend the custody taxonomy with YURI-native break types** absent from their 12: `build-process-failure`, `integration-contract-violation`, `lane-divergence`, `semantic-drift`, `verification-gap`. (Directly addresses my T2 "adapt-don't-adopt" note.)
- **Alternate gate hook point:** `lane-kernel.mjs` loop termination (lane-level) in addition to the workcell/`kagami-swarm-supervisor.mjs` (run-level) — both are real surfaces; lane-kernel may be the tighter per-round home.
- **Object-permanence wiring sketch:** `entityId` + `entityRegistry` (alias→entityId), dedupe-on-write via embedding similarity ≥0.85 + LLM arbitration on borderline.
- **Hybridization caveat (echoes DeepSeek):** KEEP YURI's vector-clock causality + content-hash dedup; ADD their link types (supports/contradicts/supersedes) as *metadata* — do NOT replace our ordering model with their append+link graph.

Note: Nemotron + Mimo both stamped RESULT_LABELs with `_COMMITTED` — that's the grammar's pass-type suffix, NOT an actual git commit. Nothing is committed.

## VERIFICATION STATUS
✓ Cloned + read their source (convergence/orchestrator/worker_dispatch/blackboard full; debt_sensors/survival structure; SWARM_INTELLIGENCE full; FAILURE_ANALYSIS section map). ✓ Verified YURI wiring targets exist (lane-arbitration, yuri-workcell, worker-capture-once, nano-doc-assembler, nano-lease, yuri-nerve, memory-canonical-store, contract-conformance, propagation-scan, kagami-swarm-supervisor — all present; autonomy-runner.mjs absent). Nothing built, nothing mutated in YURI — this is a transfer SPEC, owner-gated. Codex second opinion: not consulted (3-lane cross-family convergence already strong; available if Marcel wants a 4th).

RESULT_LABEL: 08RX_IRYS_SWARM_TRANSFER_CROSS_LANE_SYNTHESIS_X_PASS_UNCOMMITTED
