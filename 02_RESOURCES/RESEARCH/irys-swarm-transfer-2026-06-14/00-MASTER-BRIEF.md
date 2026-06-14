# MASTER BRIEF — irys-stateful-swarms → YURI nano-swarm transfer raid

> Mission (Marcel, 2026-06-14): mine `dl1683/irys-stateful-swarms` for mechanisms that directly improve how YURI's NANO SWARM is **orchestrated, directed, converged, and verified**. Deep synthesis, very thorough. Three peer lanes look in parallel: Claude (Opus), Mimo (mimo-v2.5-pro), Nemotron-3-Ultra (ollama-cloud). Output is advisory until local evidence verifies it.
> Repo clone: `/tmp/irys-ss` (shallow, read-only). Their design bible: `/tmp/irys-ss/docs/SWARM_INTELLIGENCE.md`. Failure ledger: `/tmp/irys-ss/FAILURE_ANALYSIS.md` (2.4MB).

## WHAT THEY ARE (grounded in their code, not the README marketing)

A **Python blackboard-based iterative control-system swarm** for document analysis (legal/finance). Hit 17.75% strict-all-pass on Harvey LAB at $1.30/task using cheap Gemini Flash models that score 0% in other agentic harnesses → **"performance comes from the architecture, not the model."** That thesis is the whole reason this is worth raiding: it's an orchestration-quality moat built on weak workers — exactly YURI's nano-swarm situation (cheap/varied peer lanes coordinated well).

Core loop (`src/swarm/__init__.py:run_swarm`): seed-plan → parallel read → **orchestrator → workers → convergence-check** loop (≤max_iter) → direct analysis → supervisor review (≤2 rounds, gap-fill) → state-conversion/plan-coverage/custody enforcement → [optional debt sensors] → synthesis obligations → curate → artifact-commitment binding → synthesize.

## THEIR MECHANISMS (grounded — file:symbol)

1. **Blackboard = typed relational shared state** (`blackboard.py`). Entries typed `observation|analysis|calculation|strategy|gap|contradiction`, each with `source{document,section,evidence}`, `epistemic{classification,credibility}`, `confidence`, `supports/contradicts/supersedes` links, `status active|disputed|superseded`. Plus `signals` (open questions w/ priority+status). It's a graph, not a flat log.
2. **3-layer convergence gate** (`convergence.py:check_convergence`): (a) DETERMINISTIC structural-coverage floor — per doc, extracted < expected*0.5 → not converged; (b) DETERMINISTIC critical-signal block — any open `critical` signal → not converged; (c) ADVERSARIAL LLM check: *"The orchestrator says COMPLETE. Find reasons it is NOT."* — reject re-injects `convergence_gap` signals back onto the board. + `supervisor_review` (default APPROVE, REVIEW only on gaps that are material AND specific AND actionable) + `analytical_steering` every 4th iter (force shift extraction→analysis).
3. **State-driven controller** (`orchestrator.py`): computes per-doc coverage (actual/expected), emits EXTRACTION-GAP warnings, LLM picks 1-5 typed bounded workers OR `action:converge`; DETERMINISTIC FALLBACK if LLM returns neither (auto-dispatch readers for unread sections). Budget>70% → critical only.
4. **Worker contract + deterministic quality gate** (`worker_dispatch.py`): every finding carries `epistemic_classification (fact|adversarial_claim|expert_opinion|inference|strategic)` + `epistemic_motivation ("whose interests does this serve?")`. `passes_quality_gate` is DETERMINISTIC: observation must have a source.document; calculation must have ≥2 digits AND an operator. Robust bracket-count JSON recovery. ThreadPool fan-out, analytical workers routed to the smarter model.
5. **Debt sensors / lens system** (`debt_sensors.py`, 1476 lines, env-gated default OFF): relation-debt, source-object-debt, severity-debt, authority-debt, calculation-debt. Each detects a specific incompleteness failure-mode; can detect-only or execute-repair. Lens coordinator prioritizes under budget.
6. **Custody-break taxonomy (12 types)** (`SWARM_INTELLIGENCE.md` §8): absent-state, wrong-world, wrong-object, identity-continuity, wrong-relation, unpromoted-fact, lost-commitment, wrong-artifact, wrong-sufficiency, hidden-ambiguity, false-completion, build-process. A diagnostic ontology for how multi-agent state work loses information source→artifact.
7. **Operational vs advisory gaps** (§3): the central lesson — *"the system can identify material open work, but open work does not reliably become a blocking work queue."* Operational gap MUST block synthesis; advisory gap only logs.
8. **Commitment contracts tracked-through-placement** (`obligations.py`, `artifact_commitments.py`, `survival_trace.py`): function/evidence/satisfaction-conditions/target-deliverable/verification-mode; survival trace checks entries actually land in the deliverable.
9. **Damping** (§11): action cooldowns, marginal-value thresholds, rejected-action memory, budget governor (`budget_used_pct>=85`) — stops the find-gap→make-entry→new-gap oscillation.
10. **Three-tier cascade**: Read(Flash-Lite)→Reason(Flash)→Construct(Pro/Opus). Cheap read, mid reason, expensive construct.
11. **Object permanence / task-worlds** (§2,§4): persistent entity accumulating fields across mentions ("Borrower"="XYZ Corp"); treat the initial task-world as a HYPOTHESIS to test, not a plan to execute — sources can change the frame.
12. **Confidence-is-not-calibrated caveat** (§11b): confidence values are model heuristics, NOT probabilities; don't make reliability claims on them.

## YURI'S NANO-SWARM SPINE (what we have to map onto)

- **Canonical memory store** (`_SYSTEM/Scripts/memory-canonical-store.mjs`): per-lane shards → nano-lease drainer → `canonical.jsonl`, peer-open read. Event envelope `{assert|retract|update|link, subject,predicate,object, contentHash, supersedes, provenance{lane,session,agent,sourceRef}, vc}`. Ordering by append-offset + vector-clock. Dedup by content-hash (RESIDUAL RISK: paraphrases get different hashes → no semantic identity resolution — exactly their object-permanence gap).
- **Peer lanes**: Claude (native Workflow/Agent fan-out) + Mimo (`mimo.mjs`) + DeepSeek (`llm-lane.mjs deepseek`) + ollama-cloud (`llm-lane.mjs ollama-cloud --model X:cloud`) as co-equal workers ([[feedback-multilane-peer-swarms]]).
- **Orchestration today**: native Workflow tool (pipeline/parallel/loop-until-dry K-empty-rounds, loop-until-count, loop-until-budget). NO formal convergence criterion, NO debt sensors, NO deterministic quality gate on lane output, NO damping beyond budget. This is the biggest gap.
- **Energy gate** (`computeU` ΔU progress/regress): mostly advisory fail-open layer-2 conscience; enforce ARMs only on catastrophic non-offsettable verdicts.
- **Adversarial verification** (`skills/adversarial-verification`): attack-your-own-output discipline, but applied as a per-task habit, not as a LOOP GATE.
- **Contract-conformance** (`contract-conformance.mjs`): fail-closed parser of the Lane Result Grammar.
- **Zenkai / failure-evolution-loop**: failure capture → root-cause → regression spec. Hungry for a real failure taxonomy.
- **yuri-nerve** (event captured once under one deterministic id), **nano-lease** (mkdir-EXCL election + dead-owner reclaim), **nano-doc-assembler** (per-fragment files).

## THE QUESTION FOR EACH LANE

Given their mechanisms and our spine: **what are the highest-value, concrete, transferable upgrades to YURI's nano-swarm orchestration/direction/convergence/verification?** For each candidate, give: (a) their mechanism (file:symbol evidence), (b) the YURI mechanism it maps to / the gap it fills, (c) source/target/shared-mechanism/mismatch/confidence, (d) a concrete wiring sketch, (e) reversibility + blast-radius. Rank by (fit × gap-size × reversibility). Be adversarial: name where the analogy BREAKS (their domain = bounded doc-analysis with a fixed deliverable; ours = open-ended multi-lane software/research work — what doesn't transfer?).

## STATUS LOG
- Claude: cloned, read README + SWARM_INTELLIGENCE + convergence/orchestrator/worker_dispatch source. Dispatching Mimo + Nemotron now.
