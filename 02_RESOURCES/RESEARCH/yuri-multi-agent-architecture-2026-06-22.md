# YURI Multi-Agent Architecture — Audit + End-to-End Blueprint (2026-06-22)

Dogfood run of `/opus-fleet` on its own infrastructure. Fleet: GLM-5.2 (`glm-max`) + GLM-4.7 (`glm`) infra/loop audit via the armed `glm-fleet.mjs` (blackboard `glmf-mqphc0x5-a51697`), 4 native Sonnet lanes (Anthropic docs, LangGraph/OpenAI/AutoGen, CrewAI/MetaGPT+cross-cutting, our-code gap audit). All 6 cross-validated. GLM-5.2 ran the full agentic harness ~18min, 19.5k chars — Opus-peer confirmed.

## The verdict (unanimous across GLM + native)

**The primitives are excellent; the framework is UNWIRED.** The governed `decompose→dispatch→aggregate→verify→converge→finalize` loop is documented in `opus-fleet/SKILL.md` + `FLEET_PROTOCOL_PREAMBLE` as if it were a runtime, but **no script chains it** — it runs only because the Opus session hand-drives each step in conversation. The control-plane (convergence, barrier, adversarial, async pool) is a tested library with **no production caller**.

### CRITICAL findings (file:line, cross-validated)
1. **Barrier is dead code in serial mode** (GLM-5.2). `nano-dispatch.mjs:60` runs `await tick()` one child at a time; the async pool `dispatchPool` (`nano-dispatch-async.mjs:8-9,47`) has ZERO live callers → `inflightDescendants` (`nano-barrier.mjs:84`) always returns `[]` → INV-1 can never fire. The concurrency-soundness machinery is exercised only by the e2e test's simulated dispatch.
2. **`runAdversarialPass` has no wired runner** (GLM-5.2 + native). `swarm-convergence.mjs:88-100` needs an injected `runner`; grep = zero production callers; the "default production runner" was never written → the 3-layer convergence gate runs as 2 layers (obligation-floor + critical-signal) in any live path. The quality layer is inert.
3. **No top-level orchestrator** (all lanes). Grep `runSwarm|swarmRun|runFleet` = nothing. `converge()`/`canFinalize` callers = test-only. No `decompose(goal)→DAG`. The "is the swarm done?" decision is made by the model, not the barrier.

### HIGH findings
4. **No canonical pool aggregator** (GLM-4.7). `glm-fleet.mjs` writes `{laneId,role,task,resultLabel,status,text,...}`; `swarm-convergence.mjs` expects `poolOutputs = {[leafId]:{label,text}}`. No mapper → the orchestrator hand-rolls it (error surface: role→leafId mismatch, silent drop of malformed files).
5. **No verify-before-converge guard + no finalize guard** (GLM-4.7). Nothing enforces verification before `converge()`, and finalize is not gated on `converged===true && !forced && blocking==0` → can finalize on a damping force-stop with outstanding blockers.
6. **No inter-agent messaging beyond write-only shards** (GLM-5.2 + 4.7). Canonical-store (write-fold-read) + Kagami bus (append-poll, `kagami-event-bus.mjs:262`) — no push, no request/reply, no pub/sub. Reactivity bounded by tick interval.
7. **No quality eval** (GLM-5.2 + 4.7). The floor checks conformance (non-empty + parseable RESULT_LABEL, passType∈{X,P}) = format, not quality. A `_X_PASS_COMMITTED` label over 200 chars of wrong content passes. P-class trivial passes slip the floor.
8. **No distributed tracing** (GLM-5.2). No traceId/spanId propagation; Kagami events are a flat log, not a causal span tree.

### MEDIUM/other
- `glm-fleet` 4-attempt × 3-concurrency **429 amplification** (no shared rate-limit, no jitter) — up to 12 simultaneous retries at a throttled endpoint (GLM-5.2).
- Drain-lease **livelock window** under contention (no backoff/queue) (GLM-5.2).
- Lease-reclaim **TOCTOU** residual (acknowledged, unmitigated) (GLM-5.2).
- `nano-spawn.mjs:72` dispatch stub returns `ok:true` → marks un-dispatched children `dispatched:true` when dep not injected (native).
- INC-5 bash-guard deny patch still unmerged → `YURI_NANO_CLI_FIRE=1` bypass of governed spawn (native).
- Cost accounting admission-only, no per-lane reconciliation; no idempotency at dispatch (crash → re-spend); no HITL checkpoint in the loop; no role registry (`fleet-roles.json` absent).

## What external SOTA says (Anthropic + frameworks, all cited in the source lanes)

- **Anthropic** (building-effective-agents, multi-agent-research-system, context-engineering): orchestrator-worker is exactly our model. Hard numbers: multi-agent ≈**15×** tokens vs chat; **3-5** subagents/round (50 = failure); **model-tier upgrade beats more tokens** (80/20); subagent returns **1-2k token** summaries; embed **effort-scaling** (1 / 2-4 / 10+ agents) in the orchestrator prompt; treat tool results as **untrusted** (injection guard); **context rot** → proactive compaction + note-taking.
- **LangGraph**: typed **reducer state object** as the blackboard (workers write deltas, no locks) + **durable checkpoint/thread_id** + interrupt/resume/time-travel. The answer to "write-only file blackboard."
- **OpenAI Agents SDK**: **handoff vs agents-as-tools** duality; **parallel guardrails** (tripwire halts before slow validators finish).
- **AG2**: **`OnContextCondition`** — deterministic routing off structured state, zero LLM tokens; `ReplyResult` typed handoff contract.
- **MetaGPT**: SOP roles + **shared message pool with role-subscription** (pub/sub) — the dependency graph IS the subscriptions.
- **MAS-FIRE** (arXiv 2602.19843): **closed-loop topologies neutralize >40%** of faults that collapse linear pipelines; 41-86% MAS production failure without fault-tolerance. Compounding: 10 steps × 95% = 59.9% e2e.
- **The 8 must-haves**: role-scoped agents · pub/sub bus · hybrid memory · 4-layer token accounting · semantic checkpointing+sagas · multi-tier fault tolerance (circuit breaker + validation gate + closed loop) · OTel step tracing · HITL async approval gateway.

## Target end-to-end architecture (reuse primitives, wire the gaps)

`runSwarm(goal, opts)` is the missing orchestrator binary. Components — **[exists]** reuse · **[wire]** exists-but-unwired · **[new]** build:

| # | Component | Status | Maps to |
|---|-----------|--------|---------|
| 1 | **Decomposer** `decompose(goal)→DAG` (LLM call, schema-validated, topo-sorted) | new | `workcell.mjs` topologicalSort exists as the gate |
| 2 | **Dispatch planner** DAG→ordered batches (depth/fan-out/budget) | new (thin) | `nano-tree.mjs` fan-out math |
| 3 | **Role registry** `fleet-roles.json` {role,lanes[],promptTemplate,evalFn,maxIters,mode:tool\|handoff} | new | SKILL roadmap seam |
| 4 | **Execute pool** — promote `dispatchPool` from opt-in to the LIVE dispatcher | wire | `nano-dispatch-async.mjs` (makes the barrier load-bearing) |
| 5 | **Barrier** `canFinalize` (INV-1/INV-2) — load-bearing once #4 is concurrent | exists | `nano-barrier.mjs` |
| 6 | **Convergence + adversarial** — wire the `runAdversarialPass` runner (real glm-max non-work lane) | wire | `swarm-convergence.mjs` |
| 7 | **Pool aggregator** `aggregatePoolOutputs(runId)→{[leafId]:{label,text}}` + write-time schema validation | new | bridges `glm-fleet`↔`swarm-convergence` |
| 8 | **Verify+finalize guards** `verifyAndConverge` + finalize gate (`converged && !forced && blocking==0`) | new | `swarm-convergence.mjs` |
| 9 | **Shared memory + messaging** — canonical-store (truth) + Kagami bus wired for progress events + agent→agent queue | partial | `memory-canonical-store.mjs` + `kagami-event-bus.mjs` |
| 10 | **Eval** per-leaf quality gate {type:test\|rubric\|reference, threshold} — replaces conformance-only floor | new | extends floor |
| 11 | **Tracing** traceId@runSwarm, spanId@spawn, on every Kagami event + canonical claim → causal tree + per-branch cost | new (thin) | `ctxEnv` in `nano-dispatch.mjs:34` |

Cross-cutting hardening (from SOTA): per-agent **return-budget** (≤2k tok) + **injection-guard** block in every prompt; **effort-scaling** template; **circuit breaker + jitter** on `lane-dispatch` (kills 429 amplification); **idempotency key** `hash(run_id+step_id)` at dispatch; **4-layer token accounting** per span; **HITL gate** between aggregate and finalize for HIGH-risk; **OnContextCondition**-style deterministic routing for known states.

## Phased build plan

**Phase 1 — make it RUN (DISARMED, the GLM-5.2 minimal path):**
1. `_SYSTEM/Scripts/runSwarm.mjs` (or `opus-fleet-run.mjs`) — composes decompose→buildObligationLedger→dispatch→aggregate→verifyAndConverge→canFinalize→re-dispatch nextRoundWork (≤3 rounds)→finalize. ~200 LOC, reuses primitives.
2. `aggregatePoolOutputs(runId)` in `glm-fleet.mjs` (#7) + write-time schema validation.
3. Wire `runAdversarialPass` default runner = a real glm-max non-work lane (#6).
4. `traceId`/`spanId` propagation (#11, ~3 lines in `ctxEnv`).
All behind existing DISARMED flags; arming `dispatchPool`-as-live + recursion stays OWNER-GATED.

**Phase 2 — make it SOUND:** finalize guard + verify-before-converge (#8) · per-leaf eval (#10) · circuit-breaker+jitter on lane-dispatch · idempotency keys · `nano-spawn.mjs:72` stub fix · INC-5 bash-guard deny patch.

**Phase 3 — make it PRODUCTION:** role registry `fleet-roles.json` (#3) · Kagami-bus progress events + agent→agent queue (#9) · 4-layer token accounting + per-branch cost · HITL async approval gate · canonical-store promotion of fleet findings.

## Control packet (for the Phase-1 build)
- **Goal:** wire the existing primitives into a runnable `runSwarm()` orchestrator so the governed loop executes deterministically, DISARMED-first.
- **Target files:** `_SYSTEM/Scripts/runSwarm.mjs` (new), `_SYSTEM/Scripts/glm-fleet.mjs` (aggregator+schema), `_SYSTEM/Scripts/swarm-convergence.mjs` (adversarial runner + guards), `_SYSTEM/Scripts/nano-dispatch.mjs` (traceId).
- **Constraints:** DISARMED-first; arming `dispatchPool`-live + recursion owner-gated; capability-first (reuse, don't rebuild); pathspec-only commits; the barrier/convergence semantics already simulated-sound — do not re-derive, wire.
- **Acceptance:** `runSwarm` runs a 2-leaf goal end-to-end on the GLM substrate, writes a run manifest, calls `aggregatePoolOutputs`+`verifyAndConverge`+`canFinalize`, loops once on an injected gap, terminates converged; e2e test green.
- **Rollback:** delete `runSwarm.mjs` + revert the 3 edited files; no durable external state beyond spent z.ai tokens.

## Residual risk
Ledger is a hypothesis (no coverage denominator) — adversarial pass is the only backstop for out-of-decomposition work. P-class trivial passes need the eval gate (Phase 2). The barrier only becomes real once `dispatchPool` is armed live (owner-gated) — until then Phase-1 runs serial and the barrier stays advisory. GLM benchmark/latency figures and the framework-doc claims are cited-but-external (advisory until local-verified at build).

## Sources
Audit: blackboard `.claude/jobs/glmf-mqphc0x5-a51697/results/` (GLM-5.2 `01GL_INFRA_AUDIT`, GLM-4.7 `02GL_LOOP_REVIEW`) + 4 native Sonnet lanes. External (all cited in-lane): anthropic.com/engineering (building-effective-agents, multi-agent-research-system, effective-context-engineering); docs.claude.com subagents/SDK; LangGraph docs + checkpoint PyPI; openai.github.io/openai-agents-python; docs.ag2.ai; MetaGPT arXiv 2308.00352; MAS-FIRE arXiv 2602.19843; OTel GenAI conventions; arXiv 2605.09104 (token economics), 2511.21572 (BAMAS), 2510.01285 (blackboard MAS).
