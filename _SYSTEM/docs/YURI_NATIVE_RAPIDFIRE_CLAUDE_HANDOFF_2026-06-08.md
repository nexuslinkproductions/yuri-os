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

## Lane Rules

- DeepSeek only through llm-compat: `ai llm deepseek ...`, `_SYSTEM/Scripts/llm-compat.sh`, or `_SYSTEM/Scripts/llm-lane.mjs deepseek ...`.
- Do not use workhorse, parallel-clone, old offload, swarm, or ad hoc DeepSeek command surfaces.
- Local Gemma policy is `gemma4:12b-it-qat` through `ollama-lane.mjs`.
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
