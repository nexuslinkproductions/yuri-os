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

This becomes "Nexus Guard with a thinking local lane," but the native name should reflect the mechanism, not the model. Candidate names: `yuri-scout`, `nexus-scout`, `originator-improvement-loop`, or `rapidfire-improvement-scout`.

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

2. Build `yuri-originator.mjs` as a read-only facade.
   Start with operations: `decode`, `xref`, `compile_state`, `energy_gate`, `synthesize_formula_candidates`, `run_improvement_scout`.

3. Add a strict semantic state compiler.
   Reject direct derived metric inputs such as `entropy`, `deltaU`, `staleness_index`, `risk_score`, unless the operation is explicitly recording a lane claim. Compile only into canonical executable fields.

4. Add contract tests for the Gemma failure.
   A fixture where a lane supplies `entropy: 0.42` must not count as valid energy evidence. The compiler must request or produce `claimPromotionDistribution` instead.

5. Add a Formula Foundry hypothesis schema.
   Store candidate formula sequences with operators, sources, invariants, blockers, proof plan, and promotion status.

6. Wire formula candidates to existing math gates.
   Use `math-proof-gate`, formula-bank schema, mechanism-pattern registry, and math-health. New formulas start as `hypothesis`, not `verified-baseline`.

7. Add read-only background scout dry-run.
   It should produce exactly three improvement potentials by default, each with xref evidence, proposed formula/mechanism, executable-state feasibility, energy preflight, and verification needs.

8. Add llm-compat text protocol for local SLM workers.
   Gemma should be able to receive a structured scout packet and return a structured candidate packet even before native tool-calling is added.

9. Add promotion ladder.
   `claim -> compiled -> simulated -> proof-gated -> real-data-bakeoff -> owner-approved`. No shortcut from model output to local truth.

10. Update circuitry die.
   Add nodes for Originator heartbeat, Formula Foundry, Semantic State Compiler, and Background Scout clock domain after the code/contracts exist.

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
