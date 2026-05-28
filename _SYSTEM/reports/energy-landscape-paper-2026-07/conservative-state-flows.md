# Conservative State Flows: Lyapunov-Gated Promotion as an Extension of ICM/MWP Containment

**Marcel Spatz** — Independent researcher, Vienna
**July 2026** · Draft

---

## 1. The Premise

Containment has been treated as a runtime problem — rate limits, permission scopes, manual review. Structure was incidental. ICM and MWP changed that: they made structure the contract.

Jake Van Clief's Interpretable Context Methodology (ICM) and Model Workspace Protocol (MWP), published as arXiv:2603.16021, reframe containment as an architectural discipline. The central proposition is to treat AI agents the way mature engineering teams treat code. Folder structure is the contract. Numbered stages define execution boundaries. Markdown files carry the context a model needs for each stage and nothing more. Credentials are scoped. Environments are sandboxed. Its guiding principle is explicit: *treat AI like code, not a colleague.*

ICM is effective because it eliminates a class of problems by construction. When folder layout is the architecture, misuse requires modifying the architecture — visible, auditable, and hard to do by accident. MWP extends this to workspace isolation: the agent's action surface is bounded by what the protocol grants, not by what the model could theoretically reach. Together, ICM and MWP make the static properties of an agent system legible — what stages exist, what each can access, which credentials are live at each boundary.

What these frameworks establish is structural coherence. Stage boundaries are explicit. Resource scope is defined. The system at rest is well-characterized.

But a system that is structurally coherent at rest can behave arbitrarily in motion. When structural containment is solved, what governs the dynamics inside it?

## 2. The Gap

No part of the current ICM/MWP framework governs those dynamics. This is not an oversight — it is a scope boundary. ICM and MWP solve *structural containment*. What the field has not yet formalized is *dynamical containment*: constraining how an agent system moves through its state space, not just which state space it is permitted to occupy.

The distinction matters. Structural containment answers questions about topology: which stages are defined, which resources are reachable at each stage, which credentials are in scope. These properties are static. They can be verified by inspection at rest. Dynamical containment asks a different class of question: which transitions are valid, which states are recoverable, which directions through state space represent genuine forward progress. These properties are behavioral. They cannot be verified by inspection at rest — they require a measure that applies during execution.

The absence of such a measure creates a specific class of failure that structural containment cannot prevent. An agent system can satisfy every ICM structural constraint — correct folder, correct credentials, correct scope — while its internal epistemic state moves in any direction. What makes this failure distinctive is not that it can happen, but that it is undetectable from the structural layer: two systems, one converging toward coherent verified claims and one cycling through contradictory ones, look identical from outside the stage boundary. Structural inspection cannot tell them apart.

The energy-based-models literature offers a useful analogue for the missing machinery. That work defines scalar potential functions over state, so configurations become points on an energy surface — a valid operation descends the surface; drift, incoherence, or spurious promotion does not. The Potential-Derived layer concept makes the idea concrete: a well-formed system admits a scalar potential whose gradient defines the legal direction of motion.

The gap in ICM/MWP is precisely the absence of this object. A Lyapunov-style function over orchestration state — a scalar that strictly decreases along any valid transition — would close it. Whether such a function transfers faithfully to the control-plane layer, and what a working composition rule looks like in practice, is the question this work answers.

## 3. The Proposal

The missing object is a scalar potential **U** over the orchestration state of an ICM/MWP-compliant agent system, composed from a weighted sum of proven primitives. Gate every claim promotion and stage transition on strict descent: accept a transition only if it does not increase U; reject all others. The construction adds a dynamical layer to the structural foundation ICM establishes — it replaces no part of that foundation.

The mechanism requires no modification to the models it governs, and that marks the critical level shift. In the energy-based-models literature, scalar potentials live at the neural-network weight layer — they shape how a model's parameters move during training. This proposal is not that. It operates at the control-plane layer: the orchestration meta-level that governs which ICM stage executes, which claim advances, which agent dispatches. A practitioner implementing it works with the control plane they already own. No access to model internals is required, and no training loop is involved.

The composition defines U as a weighted sum of six measurement primitives:

```
ΔU = U(s′) − U(s), where
U(s) = α · entropy(claim_distribution)
     + β · KL_divergence(claimed, verified)
     + γ · log_loss(predictions, outcomes)
     + δ · Brier_score(forecasts, results)
     − ε · information_gain(prior, current)
     + ζ · confidence_decay(stale_evidence)
```

Entropy, KL divergence, log loss, and Brier score each rise with incoherence, claim-to-evidence mismatch, and predictive error: their positive weights push U upward when the epistemic state deteriorates. Information gain carries a negative weight — genuine epistemic progress decreases U. Confidence decay rises with evidence staleness, applying upward pressure when the system advances on unrefreshed claims. Weights α through ζ are operator-configured parameters encoding domain priorities, not mathematical axioms. Defaults are provided; their adequacy on real workloads is itself an open question (§5).

The gating rule is strict and applies before any transition takes effect: accept only if ΔU ≤ 0. Any promotion, dispatch, or state change that would increase U is rejected at the gate. This is a precondition, not a retrospective penalty. Evaluated as a single forward pass over the six primitives, the gate is computationally inexpensive, deterministic, and auditable. Every accepted transition carries an auditable, recomputable certificate that ΔU ≤ 0 under the declared weights — a certificate of non-increase of the chosen potential, which an external observer can verify without access to the model that generated the proposal.

The Lyapunov basis is direct. A Lyapunov function over a dynamical system is a scalar that decreases monotonically along valid trajectories; its existence certifies that the system converges rather than diverges. U is the Lyapunov candidate, ΔU ≤ 0 is the descent criterion, the gate is the enforcement mechanism. This establishes a *local* guarantee — monotonic improvement along accepted transitions, not convergence to a global minimum. §5 treats the consequence.

## 4. Reference Implementation: YURI

The mechanism is implemented and runs. The implementation is YURI, a single-operator control plane built by the author as a working substrate for the author's own agent-orchestration workflows. YURI is not a published platform and not a multi-tenant product. It is one operator's working environment that instantiates the proposal in a form that runs, tests, and produces verifiable numeric output.

The energy core lives in one module, `yuri-energy.mjs`. It exports four surfaces: `computeU()`, which evaluates the scalar potential over a state snapshot; `computeDeltaU()`, the signed difference between two states; `gateProposal()`, which combines both into an accept/reject decision; and `DEFAULT_WEIGHTS`, the operator-tunable weight vector. (Source uses camelCase; §3's underscore notation was for readability.)

**What is built and tested.** The energy core, its telemetry layer, and an experiment runner are a tested function library — 28 tests on the core, with additional suites on the telemetry and experiment modules, all passing. Two numeric results come from the module's own worked example: a synthetic state pair with one protected-path violation yields ΔU = 100 — the η = 100 weight makes a protected-path violation catastrophic and dominates the gate decision — and a clean verification step yields ΔU = −0.26, accepted. Each accepted record is privacy-validated before serialization.

**What the controlled experiment shows.** A synthetic multi-step scenario drives a clean workflow — claims verified, evidence refreshed, claim-to-evidence drift falling — through fifteen transitions. U descends monotonically across all fifteen, from 0 to −2.925, every transition accepted, every step's ΔU negative. This is the controlled-descent demonstration: under a known-good sequence, the gate behaves exactly as the Lyapunov construction predicts. The scenario is synthetic, not drawn from production traffic.

**What is not yet done.** The gate is a tested library function. It is not yet bound as middleware to live dispatch. A passive observability bridge now logs one trace record per dispatch on three real surfaces — but by design those records use identical synthetic before/after state, so ΔU = 0; they establish that the telemetry pipeline runs on real traffic, not that the gate has measured or rejected anything in production. The function library is feature-complete and fully tested; live enforcement is not.

## 5. Honest Limitations

The proposal carries five limitations. Each is stated with the work required to advance it.

**The empirical gap is the first and largest.** Every numeric result in this work is produced by unit fixtures or by synthetic-state observations. The controlled-descent demonstration is real ΔU data, but on a hand-constructed scenario; the real-traffic telemetry is ΔU = 0 by design. The gate has not yet rejected a single real transition. Closing this requires binding `gateProposal()` to live dispatch and collecting a real-traffic distribution of ΔU — the price is the risk of disrupting a working operator workflow, which is why it is gated behind a passive observation window before any enforcement is switched on.

**The weights are hand-tuned, not learned.** `DEFAULT_WEIGHTS` reflects one operator's judgment about penalty severity. That makes the gate auditable and controllable — its main virtue — but unvalidated against empirical optimality. A learned-weight variant would calibrate the weights against operator-validated transitions, letting feedback replace manual judgment while preserving the gate's structural form. What that buys is empirical grounding; what it costs is the auditability of a fixed, inspectable weight vector.

**The guarantee is local.** Strict-descent gating reaches a local minimum, not global convergence. An agent gated on ΔU ≤ 0 can stabilize at a locally coherent configuration that is not globally optimal. The trade-off is intentional: local descent is verifiable and global optimality is not. A stochastic exploration variant — accepting ΔU > 0 transitions under controlled annealing — would trade some of that verifiability for a path toward global descent.

**Adversarial robustness is untested.** The gate has not faced transitions engineered to evade it — for instance, an update that minimizes one high-weight term while degrading several low-weight terms beneath the threshold's perception. Until a red-team protocol generates adversarial state pairs against the live gate and measures the evasion rate, the gate's resistance to a motivated attacker is unknown.

**Scope is single-operator and single-architecture.** YURI is one operator's substrate, evaluated under neither concurrent load nor multi-operator contention, and the composition assumes an ICM/MWP folder-as-architecture topology. A multi-tenant variant would need partitioned U evaluation per tenant with a global non-interference invariant; cross-architecture transfer would need prototype implementations on at least two non-ICM/MWP frameworks.

## 6. Open Questions

Three questions mark the boundary between what the current proposal establishes and what empirical investigation must decide.

The first is whether the Lyapunov property holds under adversarial pressure. The strict-descent guarantee is derived analytically from the gate rule; it does not account for an attacker who observes U's component weights and crafts transitions that satisfy ΔU ≤ 0 while degrading the epistemic state along an axis the composition does not measure. A productive investigation would frame this as a game-theoretic problem — what equilibrium exists between a gate with a fixed composition and an attacker with bounded knowledge of it.

The second is whether the weight composition transfers across agent architectures. The proposal was developed inside an ICM/MWP-compatible system, where folder structure defines the state-space topology. Architectures like LangGraph, AutoGen, and MCP-based agents carry different topologies. Whether U-composition under them needs the same primitives, different primitives, or a structurally different rule is open, and would benefit from prototype implementations across at least two non-ICM/MWP frameworks.

The third is whether the gate's guarantees compose with other safety layers. Real deployments carry rate limits, permission scopes, content filters, supervisor approvals, and guardrail systems. A gate that interacts with these redundantly adds auditable rigor. One that interacts with unexpected effect — suppressing a safety layer, or being suppressed by one — requires formal characterization before deployment. Whether the composition is additive, redundant, or structurally entangled remains to be established.

The architecture ICM and MWP gave the field describes where agents are permitted to go. The mechanism proposed here governs how they move — and the questions above determine how far that movement can be trusted.

---

## Acknowledgments

The foundational ICM and MWP frameworks are the work of Jake Van Clief (arXiv:2603.16021). This work would not exist without that contribution. Thanks to an engineering collaborator in enterprise software development, who cannot be named here due to employer policy, for careful reading, for stress-testing the proposal against real deployment scenarios, and for the enterprise-governance perspective that shaped the scope of the reference implementation.
