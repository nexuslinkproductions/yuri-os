---
title: YURI Native Rapidfire Claude Continuation Handoff
date: 2026-06-08
status: next-session-handoff
class: implementation-handoff
authority: local-evidence-first
context_packet: originator-bridge
---

# YURI Native Rapidfire Claude Continuation Handoff

This is the direct continuation packet for Claude work after the 2026-06-07/08 Codex/Gemma/DeepSeek exploration.

## Read First

1. `_SYSTEM/docs/YURI_NATIVE_RAPIDFIRE_MATH_ORIGINATOR_2026-06-08.md`
2. `_SYSTEM/docs/YURI_ORIGINATOR_BRIDGE_2026-06-07.md`
3. `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md`
4. `02_RESOURCES/RESEARCH/yuri-clockwork-northstar-2026-06-06.md`
5. `02_RESOURCES/RESEARCH/yuri-mainspring-synthesis-2026-06-07.md`
6. `_SYSTEM/LANE-MANUAL.md`
7. `_SYSTEM/Scripts/math/yuri-energy.mjs`
8. `_SYSTEM/Scripts/xref-query.mjs`
9. `_SYSTEM/Scripts/lane-core-hooks.mjs`

Use xref-first for navigation. Do not revive the context router as the active search path.

## Core Direction

YURI should expose one native Originator/NEXUS firing surface. The LLM should not manually orchestrate every internal step. The native process should run:

```text
decode -> xref -> formula/theorem synthesis -> semantic-to-executable compiler -> simulation/proof/energy gate -> revise -> handoff
```

This is native YURI. Gemma is only one possible worker. Claude, Codex, DeepSeek, Gemma, and future local SLMs should all dock onto the same deterministic substrate.

## Build Slice 0: Work Substrate, Not Bigger Packets

Critical correction from Marcel on 2026-06-08: better and larger packets are not the solution.

The native goal is not:

```text
front LLM manually gathers everything
  -> writes a huge packet
  -> worker model answers from the packet
```

The native goal is:

```text
front LLM states intent
  -> YURI compiles a compact WorkSubstrate
  -> lane receives an action handle + discovery tools + constraints
  -> lane finds relevant context itself through xref/tools
  -> lane proposes or performs scoped work
  -> YURI compiles/gates/verifies/revises
  -> Codex/main or Claude applies only verified mutation
```

The WorkSubstrate is a short executable manifest, not a knowledge dump. It should contain pointers and contracts:

```text
WorkSubstrate
  task_id
  objective
  mode: improve | build | verify | simulate | research | refactor | document
  allowed_actions
  allowed_paths
  denied_paths
  discovery_tools: xref_query | read_file | rg | propagation_scan | tests
  recall_policy: min_results, scan_budget, allow_more
  formula_policy: required_domains, candidate_count, proof_required
  action_contract: read_only | propose_patch | safe_write_dry_run
  telemetry_trace_id
  stop_conditions
```

This changes the architecture from "prompt engineering" to "capability launching." The first model lane should not need every relevant document pasted into its input. It should get a task handle that lets it discover, reason, simulate, propose, and report through YURI-owned tools. The packet is only the bootstrap key.

Implementation target:

```text
originator.run(objective)
  -> decode intent genome
  -> create WorkSubstrate
  -> register trace + action scope
  -> launch selected lane(s)
  -> lane uses YURI discovery tools under policy
  -> lane emits CandidateAction records
  -> Semantic State Compiler checks executable claims
  -> proof/simulation/energy gates score candidates
  -> SafeWrite dry-run when mutation is requested
  -> main LLM applies or rejects with telemetry
```

This must work the same from VSCode Codex, Claude Code, DeepSeek, Gemma, and future lanes. The front LLM should be able to generate the WorkSubstrate quickly because YURI supplies the schema, recall policy, formula policy, action scope, and telemetry defaults.

Local Gemma status after the Codex fix:

```text
launch_substrate backend=ollama
  -> compact WorkSubstrate prompt
  -> Gemma may return toolRequests JSON
  -> YURI executes allowed xref/read/grep/list/propagation tools
  -> ToolObservation records are fed back
  -> Gemma emits CandidateAction/proposedState/handoff
```

This is a YURI-controlled JSON tool loop, not unrestricted native Ollama function-calling. Keep mutation authority on YURI/main, but do not treat the local model as a toy. Tool budget is now an operator/runtime budget, not a tiny hidden ceiling. The first local read tool set is `xref_query`, `read_file`, `grep`, `list_dir`, and `propagation_scan`; writes/tests/shell should be added only through explicit ActionCapability contracts.

Current hardening from Codex 2026-06-08:

- `maxToolIters` default moved from a tiny exploratory cap to a larger worker budget.
- `YURI_SUBSTRATE_TOOL_ITERS` and `YURI_SUBSTRATE_TOOL_REQUESTS` can raise the loop budget; `unbounded` maps to a high runaway guard instead of the old top-4 behavior.
- `substrate.tool_iteration` telemetry records each tool batch and observation size.
- `substrate.tool_loop_exhausted` records when a lane is still asking for tools at the current budget edge.
- Ollama streaming telemetry is env-enabled through `LLM_COMPAT_OLLAMA_STREAM_TELEMETRY=true`.
- Worker child processes now emit `process_start`, `heartbeat`, `stdout_chunk`, `stderr_chunk`, lane stream events, and `process_exit` into Originator telemetry.

This means a local Gemma run should be visible while it works, not only after it returns final JSON.

## Build Slice 0B: Lane Telemetry Cockpit

JSONL is the storage layer, not the operator experience. Claude should build a clean telemetry view around the same events:

```text
Originator event stream
  -> lane heartbeat
  -> token/chunk counters
  -> tool iteration table
  -> compiler status
  -> energy/proof status
  -> open blockers
  -> compact human dashboard
```

Minimum events to show:

- `*.process_start`
- `*.heartbeat`
- `*.lane_ollama_stream_chunk`
- `substrate.tool_iteration`
- `substrate.tool_loop_exhausted`
- `*.model_call_complete`
- `*.verification_complete`
- `*.process_exit`

The UI can be CLI summary first, then HTML/cockpit later. The important rule: the operator should see what the lane is doing without opening ugly raw JSON unless they choose to inspect it.

## Build Slice 0C: Open Process Sum Pool

This is the memory upgrade Marcel described. Users and lanes start tasks, research paths, ideas, todos, design branches, skill work, and experiments over days or weeks; many remain open and disappear from human working memory. YURI should mathematically preserve them as open process objects.

Create an `OpenProcess` object for every detected started-but-not-closed thread:

```json
{
  "id": "OPEN::<type>::<stable_hash>",
  "type": "task|research|idea|todo|skill|bug|experiment|handoff",
  "title": "short operator-readable name",
  "anchors": ["xref/file/message/report references"],
  "state": "open|active|blocked|stale|closed",
  "evidence": [{ "base": 0.82, "age": 1, "halfLife": 14 }],
  "dependencies": ["other OpenProcess ids"],
  "latestGrounding": "most recent verified source",
  "nextCandidateAction": "what would reduce this mass",
  "closureCondition": "local evidence needed to mark closed"
}
```

Mathematical pool:

```text
OpenMass_i =
  w_status * status_open_i
+ w_age    * hazard_decay(age_i, halfLife_i)
+ w_dep    * dependency_centrality_i
+ w_risk   * unfinished_risk_i
+ w_value  * operator_value_i
- w_verify * verified_closure_evidence_i

OpenProcessPool = sum_i OpenMass_i
CategoryPool(type) = sum_i OpenMass_i where OpenProcess.type = type
```

Formula cards to compose:

- `hazard.evidence_decay`: stale-but-open threads rise back into attention instead of vanishing.
- `graph.impact_centrality`: unfinished high-dependency work gets priority.
- `bayes.evidence_update`: new evidence moves an item toward active, blocked, stale, or closed.
- `information.context_entropy`: select the minimum recall set that explains the open pool.
- `optimization.multi_objective`: rank next actions by value, risk, effort, dependency, and freshness.
- `schema.type_algebra`: keep OpenProcess objects closed-schema and machine-readable.

Optional symbolic/numerologic/alchemic layer:

Use symbolic phase tags only as sequencing heuristics, not truth authority. Example: map open items into phase classes such as seed, calcination, dissolution, conjunction, proof, closure. The phase label can help an LLM choose the next transformation style, but local evidence and gates decide truth.

Operational loop:

```text
session/handoff/docs/xref scan
  -> extract open process candidates
  -> assign stable ids
  -> compute OpenMass
  -> group into CategoryPools
  -> ground each item against latest xref evidence
  -> propose CandidateActions
  -> closure evidence reduces mass
```

User benefit:

The operator can return days later and ask YURI what is unfinished. YURI should answer from the pool, not memory vibes. This must work across Codex, Claude Code, Claude Desktop, OpenClaw, Hermes, local Gemma, DeepSeek, and future lanes because the pool is YURI-native, not UI-native.

## Critical Catch From Gemma Trial

Gemma produced a useful schema-mapping proposal but supplied invalid executable energy fields:

```json
{
  "entropy": 0.42,
  "staleness_index": "low",
  "energy_delta_estimate": -0.15
}
```

Those are derived or semantic claims, not canonical `computeU` inputs. YURI must not accept them as executable state.

Build rule:

```text
semantic metric claim -> Semantic State Compiler -> canonical executable state -> gateProposal computes metrics itself
```

Reject direct derived metric smuggling for `entropy`, `deltaU`, `staleness_index`, `risk_score`, and similar fields unless the operation is explicitly recording a lane claim, not evaluating a transition.

## Build Slice 1: Semantic State Compiler

Create a read-only compiler that receives lane/model claims and returns:

- `compiled`
- `partial`
- `unprovable`
- `rejected`

It should only emit canonical executable fields for current consumers:

- `claimPromotionDistribution`
- `claimedDistribution`
- `verifiedDistribution`
- `priorState`
- `posteriorState`
- `predictions` / `outcomes`
- `forecasts` / `results`
- `protectedPathViolations`
- `promotionLadderInversions`
- `verifiedEvidenceCount`
- compatible `evidence` records

Add a regression fixture from the Gemma failure: a lane packet with `entropy` and `energy_delta_estimate` must not pass as a valid energy state.

## Build Slice 2: Originator Facade

Create `_SYSTEM/Scripts/yuri-originator.mjs` as a read-only facade over existing mechanisms.

Initial operations:

- `decode`
- `xref`
- `compile_state`
- `energy_gate`
- `synthesize_formula_candidates`
- `run_improvement_scout`

Immediate extension:

- `create_work_substrate`
- `launch_substrate`
- `candidate_actions`

These should not make the worker prompt larger. They should let the worker discover through YURI-owned tools under a compact scope contract.

Shared envelope:

```json
{
  "op": "compile_state",
  "result": {},
  "completeness": {},
  "advisory_only": true,
  "local_truth_claim": false,
  "provenance": {},
  "verification": {}
}
```

Negative tests required:

- protected path input is refused
- unknown op is refused
- mutation attempt is refused in read-only mode
- derived metric fields are rejected as executable energy inputs
- advisory-only and local-truth flags are present

## Build Slice 3: Formula Foundry

Add a hypothesis schema for rapid formula/theorem synthesis.

Candidate sources include:

- information theory
- probability/calibration
- graph theory
- geometry/vector spaces
- calculus/optimization
- physics/dynamics
- control theory
- mechanism transfer
- numerology feature channels
- alchemy/hermetic mechanism vocabulary

Important: numerology, alchemy, and symbolic systems are candidate generators or feature channels, not truth sources. A candidate formula must compile into operators, inputs, outputs, invariants, blockers, proof plan, and promotion status.

Promotion ladder:

```text
hypothesis -> simulated -> counterexample-tested -> proof-gated -> real-data-bakeoff -> owner-approved
```

## Build Slice 4: Background Improvement Scout

Design a read-only scout loop:

```text
wake on interval
  -> yuri_originator.run(mode="improve", mutation="read_only")
  -> xref current surfaces
  -> find exactly 3 potentials
  -> compile each into executable feasibility
  -> energy/proof preflight
  -> revise invalid packets
  -> write advisory handoff
```

This is not bound to Gemma. Gemma can be an initial local worker, but the scout must be native YURI with optional llm-compat advisory lanes.

Finding types:

- stale docs/date drift
- semantic/executable contract mismatch
- missing proof traces
- formula bank candidates
- registry/context/index gaps
- xref recall blind spots
- graph/die nodes lacking current evidence
- low-risk improvements that lower energy without mutation

## Build Slice 5: Worker Revision Loop

Codex ran four `gemma4:12b-it-qat` Originator passes on 2026-06-08.

Implemented during the run:

- `yuri-originator.mjs` propagates long local-worker timeout budgets into the Ollama adapter environment.
- `ollama-adapter.mjs` exposes a testable timeout resolver instead of a hidden fixed constant.
- `semantic-state-compiler.mjs` normalizes canonical numeric fields and compiles `evidence` into exact `{ base, age, halfLife }` records.
- `worker_exoskeleton` parses fenced JSON output and automatically compiles `proposedState`.
- Compatibility aliases remain `llm_exoskeleton` and `gemma_exoskeleton`, but the native mechanism is model-agnostic.

Observed model behavior:

- Gemma can find useful hardening directions.
- Gemma still invents fields and object shapes even after explicit canonical-field prompting.
- The compiler now marks those outputs `unprovable` or `rejected` without manual inspection.

Next implementation:

```text
if postModelCompileStatus in ["rejected", "unprovable"]:
  feed rejectedFields/advisoryFields back to the same local model
  require exact stateBefore/stateAfter canonical packet
  compile revised output
  stop after one or two revisions
  never run energy_gate until compile status is compiled/partial
```

This should be native and model-agnostic. Gemma is only the first local worker.

## Build Slice 6: Math Before / During / After The LLM

This is the conceptual bridge Marcel was trying to pinpoint.

The energy gate is only the accept/reject membrane. The larger unlock is that formulas and theorems become active workflow operators before, during, and after the model call.

Target Originator flow:

```text
task
  -> decode intent into variables / states / constraints
  -> xref broad workspace
  -> choose formula/theorem cards
  -> build candidate mechanism slate
  -> ask LLM to propose inside that slate
  -> semantic compiler
  -> simulation / proof / graph / energy gates
  -> revision using exact failed terms
  -> verified handoff or implementation
```

Use math at these points:

- Before generation: select recall/context using graph centrality, entropy, recency decay, contradiction density, and coverage optimization.
- During planning: convert the task into formulas such as risk, mismatch rate, evidence confidence, graph impact, and transition cost.
- During building/code generation: use type theory, schema algebra, graph impact, control theory, and invariant checks to govern the allowed construction space.
- After generation: run semantic compiler, proof gates, regression checks, graph impact, simulation, and Lyapunov/energy gates.
- During revision: feed exact failed mathematical/structural terms back to the lane instead of generic "try again" prompts.

Required primitive:

```text
Formula Card Runtime
  formula_id
  theorem_family
  when_to_use
  inputs
  operator
  output_shape
  executable_hook
  failure_modes
  proof_test
  promotion_status
```

The model becomes a creative solver inside a mathematically governed workcell. YURI chooses the formula slate, the LLM proposes inside that slate, the compiler/gates judge the result, and revision uses the exact failed mathematical terms.

Initial Codex seed: `yuri-originator.mjs` now starts adding a deterministic `formulaSlate` to worker tasks and verifies cited formula card IDs through `formulaTrace`.

Pass 6 result:

- Gemma received a selected formula slate before generation.
- Gemma cited `schema.type_algebra` and `lyapunov.energy_descent` under `laneClaims.formulaUse`.
- Originator verified the formula citations with `formulaTrace=ok`.
- Semantic compiler returned `compiled`.
- Energy gate accepted the transition with `ΔU=-0.065539482`.

Claude continuation target:

```text
Expand Formula Card Runtime from seed registry into native YURI mechanism:
  - add durable formula card schema
  - connect cards to math kernel / proof gates / xref evidence
  - require formulaUse traces for local/remote advisory lanes
  - use failed formula traces as revision feedback
  - promote only cards with executable hook + proof test
```

## Build Slice 7: Worker Exoskeleton Telemetry And Backend Routing

Codex generalized the local Gemma surface into a model-agnostic worker procedure.

Important names:

- Primary op: `worker_exoskeleton`
- Compatibility aliases: `llm_exoskeleton`, `gemma_exoskeleton`
- Default current local worker: lane `gemma-local`, model `gemma4:12b-it-qat`
- Local backend: `ollama`
- DeepSeek/Kimi/Nemotron backend: `llm-lane`
- Telemetry op: `telemetry`
- Telemetry log: `_SYSTEM/state/originator-telemetry.jsonl`

Intent:

```text
Any model lane inside YURI, including VSCode Codex, Claude Code, DeepSeek, or local Ollama,
should eventually flow through the same Originator procedure:
  xref -> formulaSlate -> model output -> semantic compiler -> formulaTrace
  -> compiler-feedback revision -> energy/proof gates -> telemetry.
```

Operator command:

```bash
node _SYSTEM/Scripts/yuri-originator.mjs telemetry '{"limit": 20}'
```

Telemetry must preserve raw worker output by default so Marcel can inspect the actual model response, not just a Codex summary.

## Build Slice 8: ActionCapability And SafeWrite Bridge

Pass 7 found the core gap:

```text
worker lanes can discover and propose
  but cannot safely create files/code/simulations
  until YURI gives them a scoped action handle
```

Implement this as a native YURI primitive, not Gemma-specific:

```text
WorkSubstrate
  task_id
  objective
  mode
  discovery_tools
  recall_policy
  formula_policy
  action_contract
  telemetry_trace_id
  stop_conditions

ActionCapability
  task_id
  lane_id
  allowed_paths
  allowed_actions
  mutation_budget
  proof_requirements
  expires_at

SafeWriteSchema
  target_path
  intent
  before_hash
  proposed_patch_or_content
  formulaUse
  validation_commands
  rollback_plan

Atomic Write Handshake
  decode
  -> WorkSubstrate
  -> lane discovery through xref/tools
  -> CandidateAction records
  -> semantic compiler
  -> formula/proof/simulation gates
  -> scope gate
  -> dry-run patch
  -> validation commands
  -> Codex/main or Claude session applies
  -> telemetry + handoff
```

This is how a normal VSCode Codex/Claude task should eventually work with YURI: the operator writes the task once, the Originator compiles a WorkSubstrate, the lane discovers relevant evidence through xref/tools, and YURI compiles the resulting CandidateActions into executable contracts. The worker lane never silently writes. It proposes through a schema that YURI can prove, reject, revise, or apply.

## Build Slice 9: Tri-Lane Worker Test

First live run completed before ActionCapability/SafeWriteSchema so the current advisory boundary could be measured:

```text
Codex/main
  -> verify with local evidence and implement scoped hardening

Gemma local worker
  -> worker_exoskeleton lane=gemma-local backend=ollama model=gemma4:12b-it-qat

DeepSeek compat worker
  -> worker_exoskeleton lane=deepseek-v4-pro backend=llm-lane reasoning=xhigh
```

Every lane must produce inspectable telemetry:

```bash
node _SYSTEM/Scripts/yuri-originator.mjs telemetry '{"traceId":"<trace-id>","limit":50}'
```

Run artifacts from 2026-06-08:

- Gemma trace: `three-lane-gemma-2026-06-08`, full envelope at `/tmp/yuri-three-lane-gemma-2026-06-08.json`.
- DeepSeek trace: `three-lane-deepseek-2026-06-08`, full envelope at `/tmp/yuri-three-lane-deepseek-2026-06-08.json`.
- Both model lanes reached JSON parse, formula trace, compile, and energy gate.
- DeepSeek produced a false advisory claim: it said `worker_exoskeleton` did not compile/gate worker output. Local code disproved this; `yuri-originator.mjs` already calls `verifyWorkerModelOutput`, `compileSemanticStatePacket`, `tryGateCompiledModelOutput`, and revision handling before final telemetry/envelope.
- Gemma exposed a real compiler transparency gap: it placed `predictions` and `outcomes` beside `stateBefore/stateAfter` inside `proposedState`. Those fields were not executable and previously vanished from the compiler report. Codex fixed `semantic-state-compiler.mjs` so wrapper-level canonical fields now surface as `canonical_field_outside_executable_state` advisory leakage, and added a regression test.

The comparison should continue to score:

- xref use and context coverage
- formulaSlate relevance
- formulaTrace correctness
- schema compile status
- energy/proof gate status
- quality of proposed fix or file/code/simulation
- whether the ActionCapability scope was respected

Current limitation before Slice 8 remains: Gemma and DeepSeek can propose advisory work; Codex/main or the active Claude session still performs mutations after verification. Energy/schema gates are necessary but not sufficient: local evidence verification must still audit advisory truth claims.

## Lane Rules

- DeepSeek only through llm-compat: `_SYSTEM/Scripts/llm-lane.mjs deepseek ...`, `_SYSTEM/Scripts/llm-compat.sh --model deepseek-v4-pro ...`, or the `worker_exoskeleton` backend `llm-lane`.
- Do not use workhorse, parallel-clone, old offload, swarm, or ad hoc DeepSeek command surfaces.
- Local Gemma policy is `gemma4:12b-it-qat` through `ollama-lane.mjs` / backend `ollama`.
- Local SLM output is advisory until deterministic verification.

## Verification Requirements

Before claiming completion:

- parse/validate any JSON registry touched
- run targeted Node tests for new scripts
- run `git diff --check`
- run xref query for the new doc/tool names
- run at least one negative test for derived metric smuggling
- inspect staged scope before commit

## North Star

YURI should let any LLM touch one native Originator port and trigger the whole circuitry die: broad recall, rapid formula/theorem synthesis, semantic-to-executable compilation, energy/GVF gating, simulation, proof, revision, and verified handoff.
