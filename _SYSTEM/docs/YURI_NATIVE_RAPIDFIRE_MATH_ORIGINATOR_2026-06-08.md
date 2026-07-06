---
title: YURI Native Rapidfire Math Originator
date: 2026-06-08
status: design-handoff-next-build
class: system-architecture
authority: local-evidence-first
related:
  - _SYSTEM/docs/YURI_ORIGINATOR_BRIDGE_2026-06-07.md
  - 02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md
  - 02_RESOURCES/RESEARCH/yuri-clockwork-northstar-2026-06-06.md
  - 02_RESOURCES/RESEARCH/yuri-mainspring-synthesis-2026-06-07.md
---

# YURI Native Rapidfire Math Originator

This handoff captures the 2026-06-08 design shift: YURI's math, recall, energy, formula, theorem, numerology, and mechanism layers must become a native rapidfire operating process. It is not Gemma-specific, Claude-specific, Codex-specific, or DeepSeek-specific. Local and frontier models are advisory front-ends. YURI owns the deterministic mechanism.

The goal is one native firing surface:

```text
yuri_originator.run(objective)
  -> decode
  -> xref / recall / propagation
  -> formula and mechanism synthesis
  -> semantic-to-executable compilation
  -> simulation / proof / energy gate
  -> revise
  -> verified handoff packet
```

The LLM should not manually ask for xref, then manually ask for a formula bank, then manually construct `stateBefore`, then manually run an energy gate. Those are internal gears. The LLM should provide intent, inspect the returned action map, and do work with the deterministic evidence YURI supplies.

## Work Substrate, Not Bigger Packets

Correction from the live Codex/Gemma/DeepSeek runs: the answer is not to keep making larger worker packets.

Large packets are useful probes, but they do not unlock the native mechanism. The native mechanism is a compact launch substrate that gives a lane enough authority to discover and act under YURI policy.

Wrong shape:

```text
build a giant context packet
  -> paste all known context into the lane
  -> hope the model keeps it coherent
```

Target shape:

```text
operator task / front-LLM intent
  -> decode intent genome
  -> compile WorkSubstrate
  -> launch lane with discovery tools and action scope
  -> lane finds context through xref and local tools
  -> lane emits CandidateAction records
  -> YURI compiles, gates, verifies, revises, and hands off
```

The WorkSubstrate is the short executable bootstrap:

```json
{
  "task_id": "originator-trace-id",
  "objective": "what the operator wants",
  "mode": "improve|build|verify|simulate|research|refactor|document",
  "allowed_actions": ["xref_query", "read_file", "rg", "run_tests", "propose_patch"],
  "allowed_paths": ["task-scoped paths"],
  "denied_paths": ["protected runtime/secrets"],
  "recall_policy": { "min_results": 200, "scan_budget": 8000, "allow_more": true },
  "formula_policy": { "candidate_count": 8, "proof_required": true },
  "action_contract": "read_only|propose_patch|safe_write_dry_run",
  "telemetry_trace_id": "trace-id",
  "stop_conditions": ["compile failure after revision budget", "protected path", "budget exceeded"]
}
```

That is the bridge Marcel is aiming at: Codex or Claude should be able to generate this substrate quickly, because YURI owns the schema and defaults. Gemma, DeepSeek, Claude, Codex, and future models then work from the same launch handle instead of depending on handcrafted prompt packets.

The model lane should be volatile and exploratory inside the allowed scope. The substrate should not overfit the answer. It should constrain authority, not imagination:

- constrain protected paths, mutation, proof requirements, telemetry, and executable state fields
- leave exploration open across xref, formula candidates, mechanisms, simulations, tests, and file evidence
- let the lane ask for more recall when the current recall set is insufficient
- make every action inspectable through telemetry and candidate records

### Local Gemma Tool Loop

Fix implemented 2026-06-08: `launch_substrate` now gives local Ollama/Gemma lanes a YURI-controlled JSON tool loop.

This is not unrestricted native Ollama tool-calling. It is a deterministic host loop:

```text
Gemma returns { toolRequests: [...] }
  -> YURI validates each request against WorkSubstrate
  -> YURI executes allowed xref/read/grep/list/propagation tools
  -> YURI returns ToolObservation records
  -> Gemma continues or emits CandidateAction/proposedState/handoff
```

Allowed first tools:

- `xref_query`
- `read_file`
- `grep`
- `list_dir`
- `propagation_scan`

No arbitrary shell, write, commit, push, delete, or protected path access is available to the local loop. This is the first bridge from "Gemma reasons over a packet" to "Gemma discovers under YURI policy."

Follow-up hardening implemented 2026-06-08:

- Local tool-loop budget is operator/runtime controlled, no longer a tiny fixed top-4 ceiling.
- `YURI_SUBSTRATE_TOOL_ITERS`, `YURI_SUBSTRATE_TOOL_REQUESTS`, and explicit payload fields can expand worker discovery.
- `substrate.tool_iteration` records each tool batch and observation size.
- `substrate.tool_loop_exhausted` records when a lane still wants tools at the current budget edge.
- Ollama local calls can stream lane telemetry through `LLM_COMPAT_OLLAMA_STREAM_TELEMETRY=true`.
- Originator child runners emit heartbeat/process/chunk events while the lane is alive.

Interpretation: context budget and action safety should govern the lane. Small arbitrary tool ceilings should not.

## Lane Observability

Raw JSONL remains the audit substrate, but the operator needs a readable cockpit:

```text
lane start
  -> heartbeat
  -> token/chunk counters
  -> tool iteration trace
  -> compile status
  -> energy/proof status
  -> blocker/open-task summary
```

Useful telemetry phases:

- `*.process_start`
- `*.heartbeat`
- `*.lane_ollama_stream_chunk`
- `substrate.tool_iteration`
- `substrate.tool_loop_exhausted`
- `*.process_exit`

The future UI should summarize these events without forcing the operator to read raw JSON.

## Open Process Sum Pool

Memory should track unfinished process mass, not only static notes. Any task, research path, idea, todo, skill build, bug, experiment, or handoff that starts but does not close becomes an `OpenProcess` object:

```text
OpenProcess_i = {id, type, anchors, state, evidence, dependencies, latestGrounding, nextCandidateAction, closureCondition}
```

Pool equation:

```text
OpenMass_i =
  w_status * status_open_i
+ w_age    * hazard_decay(age_i, halfLife_i)
+ w_dep    * dependency_centrality_i
+ w_risk   * unfinished_risk_i
+ w_value  * operator_value_i
- w_verify * verified_closure_evidence_i

OpenProcessPool = sum_i OpenMass_i
```

Formula composition:

- `hazard.evidence_decay` keeps stale-but-open items visible.
- `graph.impact_centrality` prioritizes unfinished work with many dependents.
- `bayes.evidence_update` moves items between open, active, blocked, stale, and closed.
- `information.context_entropy` retrieves the smallest evidence pack that explains the pool.
- `optimization.multi_objective` ranks next actions across value, risk, effort, and freshness.
- `schema.type_algebra` keeps the pool machine-readable across Codex, Claude, DeepSeek, Gemma, and future UIs.

This is the mathematical memory bridge for "what did we start but not finish?" YURI should answer that from indexed process mass and latest xref evidence, not from fragile session memory.

## Why This Exists

The Gemma schema-mapping trial exposed a critical gap.

Gemma wrote a meaningful human explanation:

```json
{
  "stateBefore": {
    "entropy": 0.85,
    "staleness_index": "high",
    "energy_delta_estimate": null
  },
  "stateAfter": {
    "entropy": 0.42,
    "staleness_index": "low",
    "energy_delta_estimate": -0.15
  }
}
```

That is semantically understandable, but it is not an executable YURI energy state. `computeU` does not consume `entropy`, `staleness_index`, or `energy_delta_estimate` as direct inputs. It computes entropy from `claimPromotionDistribution`, staleness from compatible `evidence` records, and `deltaU` from `stateBefore` and `stateAfter`.

If YURI accepts derived metrics as inputs, a model can smuggle conclusions into the measurement. That would turn the math layer into a rubber stamp.

The corrected rule:

```text
semantic metric claim
  -> executable state compiler
  -> canonical computeU fields
  -> gateProposal computes deltaU itself
  -> accept/reject/revise
```

No model lane, including Codex, may submit "entropy dropped" as proof. The system must compile that claim into runnable fields and compute the metric itself.

## Native, Not Lane-Bound

Gemma is useful as a probe because it makes the failure modes visible. It is not the architecture.

The native process must be available to:

- Codex main
- Claude through the owner-approved session route
- DeepSeek through llm-compat
- Gemma and future local SLMs through local llm-compat / Ollama
- background YURI scouts
- future UI and command surfaces

All lanes call the same Originator/NEXUS surface. All outputs are advisory until local verification promotes them.

## The Rapidfire Firing Equation

For any task, YURI should represent the work as a state-transition problem.

```text
S0 = current workspace/control state
I  = decoded intent genome
R  = xref / recall envelope
G  = graph and registry neighborhood
M  = candidate mechanisms
F  = candidate formula sequences
A  = candidate actions
C  = constraints and protected surfaces
U  = energy potential
P  = proof and verification gates

best_action =
  argmin_a [
    U(apply(S0, a))
    + risk(a, C)
    + complexity(a)
    + calibration_debt(a)
    - expected_information_gain(a)
    - expected_utility(a)
  ]

accept(a) =
  compile(a) succeeds
  AND proof_gates pass
  AND gateProposal(S0, apply(S0, a)) accepts
  AND protected-surface vetoes are false
  AND local verification is available for the claim class
```

This can apply to coding, debugging, research, writing, visual design, security, business analysis, docs, operations, and any other work domain because the outer shape is always the same: decode current state, generate candidate transitions, score and simulate them, reject bad transitions, execute or hand off the best verified path.

## Formula And Theorem Synthesis Engine

The current system already has math-kernel primitives, formula banks, numerology feature channels, mechanism pattern registry, transfer-distance logic, phi/Fibonacci primitives, graph search, matching, and energy/GVF. The next step is not merely selecting a known formula. The next step is creating and testing new formula sequences quickly.

Call the design target the Formula Foundry until implementation names settle.

### Candidate Sources

Formula Foundry should search and compose from:

- information theory: entropy, KL, cross entropy, information gain, MDL
- probability and calibration: Brier, log loss, Bayesian update, conformal bounds
- graph theory: Dijkstra, A*, PageRank/random walk, centrality, cuts, flow
- geometry and vector spaces: cosine, distances, projections, curvature, manifolds
- calculus and optimization: gradients where available, golden-section search, finite differences, Lagrange-style constrained optimization
- physics and dynamics: potential descent, Lyapunov functions, damping, resonance, phase, conservation, criticality
- control theory: supervisory control, vetoes, reachable-state bounds, stability
- category/mechanism transfer: source mechanism -> target organ reconstruction
- numerology and symbolic channels: digital root, gematria hash, harmonic buckets, cadence, resonance
- alchemy/hermetic vocabulary as mechanism language: decomposition, recomposition, transmutation, correspondence, fixation, dissolution, distillation

The last two categories are not truth claims. They are deterministic candidate generators, symbolic feature channels, or mechanism vocabularies. They may suggest sequences. They do not prove them.

### Candidate Representation

Each candidate mechanism must compile into a typed card:

```json
{
  "id": "candidate.unique.sequence",
  "source_domains": ["information_theory", "geometry", "numerology"],
  "operators": ["entropy", "containment", "digital_root_bucket"],
  "input_contract": ["query_text", "candidate_doc", "surface_id"],
  "output_contract": ["score", "rank", "explanation"],
  "invariants": ["deterministic", "bounded", "no_rng_at_query"],
  "risk_flags": [],
  "proof_plan": ["unit_fixture", "counterexample", "real_corpus_bakeoff"],
  "promotion_status": "hypothesis"
}
```

Then YURI can process it as an object, not as a poetic idea.

### Synthesis Loop

```text
1. Retrieve candidate laws/mechanisms with xref.
2. Normalize each mechanism into operator, input, output, invariant, blocker.
3. Compose compatible operators into candidate sequences.
4. Type-check the sequence against available data.
5. Run cheap synthetic fixtures.
6. Run adversarial counterexamples.
7. Run real-data bakeoff when labels or cold corpora exist.
8. Score by energy reduction, information gain, simplicity, transfer distance, and proof strength.
9. Promote only through formula/proof gates.
```

This is where speed appears. The model does not think through every combination in prose. YURI generates candidate operator graphs, kills invalid ones mechanically, and gives the LLM only the strongest candidates with proof context.

## Semantic-To-Executable Compiler

This compiler is the missing safety layer.

It receives model claims such as:

- "entropy dropped"
- "staleness improved"
- "the transition lowers energy"
- "recall coverage is broader"
- "this fix reduces risk"
- "this formula improves ranking"

It returns one of:

- `compiled`: canonical executable fields are available
- `partial`: some fields are executable, others are claims only
- `unprovable`: no valid executable mapping exists
- `rejected`: the claim attempts to smuggle a derived metric into an input slot

Example:

```json
{
  "claimedMetrics": {
    "entropy": "lower",
    "deltaU": "negative"
  },
  "compiledState": {
    "claimPromotionDistributionBefore": [0.25, 0.25, 0.25, 0.25],
    "claimPromotionDistributionAfter": [0.7, 0.1, 0.1, 0.1],
    "protectedPathViolationsBefore": 0,
    "protectedPathViolationsAfter": 0
  },
  "rejectedFields": ["deltaU"],
  "reason": "deltaU must be computed by gateProposal, not supplied by a lane"
}
```

This layer should sit before `computeU`, `computeDeltaU`, `gateProposal`, and any future formula bank promotion gate.

## One-Port Native Tool Shape

The future LLM-facing surface should look like one call, with mode controlling the internal firing pattern.

```json
{
  "op": "run",
  "objective": "find the three highest-value improvements in the current originator/math bridge",
  "mode": "improve",
  "domain": "auto",
  "mutation": "read_only",
  "recall": {
    "strategy": "xref_first",
    "minResults": 200,
    "allowMore": true
  },
  "math": {
    "synthesis": true,
    "formulaFoundry": "hypothesis_only",
    "semanticCompiler": "strict"
  },
  "energy": {
    "gate": "advisory",
    "rejectDerivedMetricInputs": true
  },
  "handoff": {
    "format": "verified_action_packet",
    "authority": "advisory_only"
  }
}
```

Internally:

```text
decode objective
  -> xref all relevant surfaces
  -> extract candidate mechanisms
  -> compose formula/theorem sequences
  -> compile candidate actions into executable state
  -> run energy/proof/simulation gates
  -> revise failed candidates
  -> emit top actions and blockers
```

## Background Improvement Scouts

The hourly Gemma idea generalizes to native YURI background scouts. Gemma can be one worker, but the architecture is model-agnostic.

Read-only scout cycle:

```text
every interval:
  wake with bounded budget
  run yuri_originator.run(mode="improve", mutation="read_only")
  xref current docs/code/tests/registries
  find 3 potentials
  compile each into candidate action packet
  run semantic compiler
  run energy/proof preflight
  revise invalid packets
  write advisory handoff
  notify Codex/Claude/main queue
```

Scout task classes:

- stale docs and date drift
- mismatched conceptual language vs executable contracts
- missing tests around promoted math claims
- registry/context/index gaps
- protected-surface risk in proposed workflows
- formula-bank candidates with no proof trace
- repeated low-value model-lane outputs
- xref recall blind spots
- graph/die nodes that lack current file evidence
- improvements that lower energy without mutation

Safety floor:

- default read-only
- no autonomous mutation at first
- no protected runtime or secrets
- no local truth claims
- no derived metrics accepted as executable inputs
- all findings become handoff packets
- Codex/main or Claude session verifies before implementation

This becomes "Nexus Guard with a thinking worker lane," but the native name should reflect the mechanism, not the model. Candidate names: `yuri-scout`, `nexus-scout`, `originator-improvement-loop`, or `rapidfire-improvement-scout`.

## Worker Rapidfire Hardening Runs

Date: 2026-06-08

Default local worker: `gemma4:12b-it-qat` through the llm-compat/Ollama lane.

Native mechanism: `worker_exoskeleton`. Compatibility aliases remain `llm_exoskeleton` and `gemma_exoskeleton`, but those aliases must not become the architecture name.

Pass results:

- Pass 1 exposed a hidden local-lane ceiling: the Originator accepted a 900s task budget, but the Ollama adapter still timed out at 300s. Hardened by propagating the Originator timeout into `LLM_COMPAT_OLLAMA_TIMEOUT_MS` and making the adapter timeout resolver testable.
- Pass 1 also pointed at "string polyglot" smuggling. The broad claim was wrong because `label`/`description` are not canonical executable energy fields, but it revealed a narrower real gap: canonical `evidence` accepted arbitrary objects. Hardened by compiling `evidence` into numeric `{ base, age, halfLife }` records only and stripping extra object content.
- Pass 2 proposed self-reported `u_cost` / `drift_index` telemetry. This must remain advisory because model-reported energy is not local truth. Hardened by adding post-model JSON parsing and automatic `proposedState` compilation to `worker_exoskeleton`.
- Pass 3 produced a plausible memory-governance proposal but invented `worker_context_buffer`; the new envelope marked it `unprovable` automatically.
- Pass 4 used more canonical words but still nested `priorState` / `posteriorState` as objects and emitted object distributions/prose outcomes. The compiler rejected the packet with explicit type mismatches.
- Pass 5 tested aggressive local-worker hardening with automatic revision enabled. Gemma produced canonical `stateBefore` / `stateAfter` on the first pass, the compiler returned `compiled`, and the energy gate accepted the transition with `ΔU=-0.076509159`.
- Pass 6 added deterministic `formulaSlate` selection before the model call. Gemma cited `schema.type_algebra` and `lyapunov.energy_descent`, the Originator verified the citations with `formulaTrace=ok`, compiled the state, and accepted the energy transition with `ΔU=-0.065539482`.
- Pass 7 tested the generalized worker surface and exposed the Execution Isolation Gap: a worker lane can recommend files, code, and simulations, but it has no scoped action handle or safe write packet yet. The correct next primitive is `ActionCapability` + `SafeWriteSchema` + Atomic Write Handshake, still advisory until Codex/main or Claude verifies and applies it.
- Pass 8 ran the requested tri-lane check: Gemma local through `worker_exoskeleton`/Ollama, DeepSeek through `worker_exoskeleton`/`llm-lane`, and Codex/main as local verifier. Both model lanes reached `modelJsonParse=ok`, `formulaTrace=ok`, executable compile/gate, and inspectable telemetry. The important lesson: schema/energy gates prove executable packet shape and ΔU, not advisory truth. DeepSeek passed the gates but incorrectly claimed `worker_exoskeleton` did not already compile/gate outputs; Codex verified the live code shows compile/gate at `_SYSTEM/Scripts/yuri-originator.mjs`. Gemma passed the gates but placed `predictions` and `outcomes` beside `stateBefore/stateAfter` inside `proposedState`. Codex hardened `semantic-state-compiler.mjs` so wrapper-level canonical fields now surface as advisory leakage (`canonical_field_outside_executable_state`) instead of silently vanishing.

Current lesson: worker lanes are useful as creative scouts, but still need the exoskeleton. Prompting alone does not reliably produce executable math state. The native loop must parse, compile, reject, revise, and only then gate.

Next hardening target:

```text
worker_exoskeleton
  -> parse model JSON
  -> compile proposedState
  -> if rejected/unprovable:
       build structured compiler feedback
       run one revision attempt with exact rejected fields
       compile again
  -> only run energy_gate on compiled/partial executable state
  -> emit advisory handoff with failure trace
```

This is the bridge from "model brainstorm" to "model worker inside YURI": the model is allowed to be creative, but the compiler owns the executable boundary.

## Formula Slate Runtime

The next layer is formula/theorem use before, during, and after the model call.

Current seed in `yuri-originator.mjs`:

- `FORMULA_CARDS`: deterministic card registry with theorem family, use terms, operator, executable hook, and output shape.
- `buildFormulaSlate(objective, recall)`: chooses a small formula slate before the local model call.
- `verifyFormulaUse(modelJson, formulaSlate)`: checks that model-cited formula IDs were actually selected by YURI.

Seed cards:

- `schema.type_algebra`: closed executable-state contracts before claims can influence action.
- `lyapunov.energy_descent`: transition acceptance through potential descent and structural vetoes.
- `bayes.evidence_update`: prior/posterior and structured evidence updates.
- `information.context_entropy`: high-coverage, low-redundancy context selection.
- `graph.impact_centrality`: graph/call-impact ranking for candidate work.
- `hazard.evidence_decay`: half-life evidence aging.
- `optimization.multi_objective`: ranked action candidates under risk/budget/latency constraints.
- `invariant.handoff_continuity`: preservation of required state across model-lane boundaries.

This is the first concrete step from "LLM thinks, YURI checks" toward "YURI chooses mathematical construction operators, then the LLM solves inside that governed space."

## Worker Telemetry And Model-Agnostic Procedure

The architecture is not Gemma-bound. Gemma is the current default local worker because `gemma4:12b-it-qat` is installed and fast enough to iterate, but the native procedure is `worker_exoskeleton`.

Primary procedure:

```text
worker_exoskeleton
  -> xref recall
  -> formulaSlate selection
  -> worker model call
  -> JSON extraction
  -> semantic compiler
  -> formulaTrace verification
  -> optional compiler-feedback revision
  -> energy gate when executable state exists
  -> telemetry event log
```

Telemetry is emitted to `_SYSTEM/state/originator-telemetry.jsonl` and can be inspected through:

```bash
node _SYSTEM/Scripts/yuri-originator.mjs telemetry '{"limit": 20}'
```

Telemetry events include the raw worker output by default, parse/compile status, formula trace, energy gate result, and final model JSON. This makes the lane inspectable instead of requiring trust in a summary.

Backend routing added by propagation pass 2026-06-08:

- Local worker lanes such as `gemma-local` route through backend `ollama`.
- DeepSeek/Kimi/Nemotron-style worker lanes route through backend `llm-lane`.
- Telemetry records the selected backend on start, model-call, revision, and completion events.
- Tests assert that `gemma-local` resolves to `ollama` and `deepseek-v4-pro` resolves to `llm-lane`.

The same procedure should eventually wrap:

- VSCode Codex plugin interactions
- Claude Code plugin interactions
- DeepSeek llm-compat lanes
- local Ollama workers
- future local/remote model lanes

The user-facing goal is that writing a normal task into Codex/Claude while working with YURI automatically triggers the Originator procedure: recall, formulas, compilation, gates, telemetry, and revision.

## Execution Isolation Gap

Pass 7 made the most important next gap explicit:

```text
worker lane can discover/propose
  but cannot safely apply file/code/simulation work
  unless YURI gives it a scoped action capability
```

Needed primitive:

```text
ActionCapability
  task_id
  allowed_paths
  allowed_actions
  mutation_budget
  proof_requirements

SafeWriteSchema
  target_path
  intent
  before_hash
  proposed_content_or_patch
  formulaUse
  validation_commands
  rollback_plan

Atomic Write Handshake
  decode -> xref -> formulaSlate -> propose -> compile
  -> scope gate -> dry-run patch -> verify -> Codex/Claude apply
  -> telemetry -> handoff
```

Until this exists, `worker_exoskeleton` stays advisory/read-only. That is intentional precision, not timidity: it prevents a model from confusing human-readable explanation state with executable action state.

## Propagation Law Update 2026-06-08

Affected surfaces updated:

- `_SYSTEM/Scripts/yuri-originator.mjs`: `worker_exoskeleton` now resolves backend `ollama` for local lanes and `llm-lane` for DeepSeek/Kimi/Nemotron-style lanes.
- `_SYSTEM/Scripts/yuri-originator.test.mjs`: backend resolution and invocation tests protect the route.
- `_SYSTEM/Scripts/semantic-state-compiler.mjs`: wrapper-level fields beside `stateBefore/stateAfter` now become advisory leakage instead of disappearing from compiler reports.
- `_SYSTEM/Scripts/semantic-state-compiler.test.mjs`: regression fixture replays the Gemma wrapper-drift shape with `predictions`/`outcomes` beside executable states.
- `_SYSTEM/INDEX.md`: Originator entry updated to model-agnostic worker exoskeleton, formula traces, and telemetry.
- `_SYSTEM/context/context-registry.json`: triggers now include `worker_exoskeleton`, `formulaSlate`, `formulaTrace`, telemetry, `ActionCapability`, `SafeWriteSchema`, and the Execution Isolation Gap.
- `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json`: promoted `yuri-originator` and `semantic-state-compiler` nodes into the circuitry die, with routes to xref, energy, Ollama, and llm-lane.
- `_SYSTEM/docs/YURI_NATIVE_RAPIDFIRE_CLAUDE_HANDOFF_2026-06-08.md`: Claude continuation should build the native ActionCapability/SafeWriteSchema bridge and run a tri-lane worker test.

Propagation evidence:

- `propagation-scan llm-compat-contract --dry-run` found no structural siblings.
- `propagation-scan ollama-lane --dry-run` surfaced `LANE_GEMMA`, `llm-compat-contract`, math proof/health, mechanism registry, and memory-kernel siblings through shared CLI/print witnesses.
- `propagation-scan yuri-originator --dry-run` now works after graph promotion and surfaces `LANE_GEMMA`, `llm-compat-contract`, math proof/health, mechanism registry, and memory-kernel siblings.
- `propagation-scan energy-fn --dry-run` and `propagation-scan XREF_QUERY --dry-run` had no extracted siblings.

Decision: do not mutate every surfaced sibling. The actual contract change is the Originator worker entry path, so the safe propagation set is originator code/tests, registry/index, circuitry graph, and continuation docs.

## Whole Circuitry Die Clockwork

The clockwork should be the whole YURI circuitry die, not only the math kernel. But it should not be one monolithic global clock. It should be hierarchical clock domains:

- Originator/NEXUS heartbeat: synchronizes one-port calls, proof envelopes, and promotion state
- xref/recall clock: broad workspace visibility and true-count recall
- formula-foundry clock: candidate mechanism generation and composition
- semantic-compiler clock: converts model language into executable state or rejects it
- energy/GVF/GPD clock: potential descent, vetoes, calibration, and action quality
- verification clock: tests, proof gates, local evidence, handoff status
- lane clock: optional advisory workers through llm-compat

The "entire die as clockwork" means every organ participates in deterministic firing. It does not mean every organ runs at the same frequency.

## Claude Task List For Tomorrow

1. Name and scope the native rapidfire mechanism.
   Recommended working name: `YURI Native Rapidfire Originator` for the system, `Formula Foundry` for formula/theorem synthesis, and `Semantic State Compiler` for the metric-to-executable gate.

2. Add `WorkSubstrate` as the launch primitive.
   This replaces the "bigger packet" direction. The substrate is a compact manifest with task id, objective, mode, allowed actions, allowed/denied paths, discovery tools, recall policy, formula policy, action contract, telemetry trace, and stop conditions.

3. Build `yuri-originator.mjs` toward `originator.run(objective)`.
   The front LLM should only need to provide intent. YURI should decode, create the substrate, launch lane discovery, collect CandidateActions, compile/gate/verify, and emit telemetry.

4. Add a strict semantic state compiler.
   Reject direct derived metric inputs such as `entropy`, `deltaU`, `staleness_index`, `risk_score`, unless the operation is explicitly recording a lane claim. Compile only into canonical executable fields.

5. Add contract tests for the Gemma failure.
   A fixture where a lane supplies `entropy: 0.42` must not count as valid energy evidence. The compiler must request or produce `claimPromotionDistribution` instead.

6. Add a Formula Foundry hypothesis schema.
   Store candidate formula sequences with operators, sources, invariants, blockers, proof plan, and promotion status.

7. Wire formula candidates to existing math gates.
   Use `math-proof-gate`, formula-bank schema, mechanism-pattern registry, and math-health. New formulas start as `hypothesis`, not `verified-baseline`.

8. Add read-only background scout dry-run on top of WorkSubstrate.
   It should launch with a compact substrate, discover with xref/tools, and produce exactly three improvement potentials by default, each with evidence, proposed formula/mechanism, executable-state feasibility, energy preflight, and verification needs.

9. Add llm-compat text protocol for local/remote workers.
   Gemma, DeepSeek, and future lanes should receive a WorkSubstrate handle plus tool policy, then return CandidateAction records. They should not depend on an all-context packet.

10. Add promotion ladder.
   `claim -> compiled -> simulated -> proof-gated -> real-data-bakeoff -> owner-approved`. No shortcut from model output to local truth.

11. Update circuitry die.
   Add nodes for Originator heartbeat, WorkSubstrate, Formula Foundry, Semantic State Compiler, and Background Scout clock domain after the code/contracts exist.

## Non-Negotiables

- Native YURI first. Model lanes are advisory surfaces.
- xref-first active navigation.
- No context-router revival for current search.
- No old workhorse, offload, clone, or swarm identities.
- No top-10 recall ceiling under the hood.
- No derived metric smuggling.
- No occult truth claims.
- Numerology, alchemy, and symbolic systems are valid candidate feature/mechanism generators only when deterministic and testable.
- Every promoted formula needs proof traces or a visible blocked status.
- Local verification outranks model fluency.

## One-Line North Star

YURI should let any LLM touch one native Originator port and trigger the whole circuitry die: broad recall, rapid formula/theorem synthesis, semantic-to-executable compilation, energy/GVF gating, simulation, proof, revision, and verified handoff.
