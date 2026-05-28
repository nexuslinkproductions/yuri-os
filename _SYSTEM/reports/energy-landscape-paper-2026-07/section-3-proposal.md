# Section 3: The Proposal

Section 2 closed on a precise open question: whether a scalar potential function transfers faithfully to the control-plane layer, and what a working composition rule looks like in practice. This paper proposes the following. Define a scalar potential U over the orchestration state of an ICM/MWP-compliant agent system, composed from a weighted sum of proven mathematical primitives. Gate every claim promotion and stage transition on a strict-descent condition: accept a transition only if it does not increase U. Reject all others. The proposed construction adds a dynamical layer to the structural foundation that ICM establishes — without replacing any part of that foundation.

The mechanism requires no modification to the underlying models it governs, and that fact marks the critical level shift. In the energy-based-models literature, scalar potentials are applied at the neural-network weight layer — they shape how a model's parameters move during training. This proposal is not that. It operates at the control-plane layer: the orchestration meta-level that governs which ICM stage executes, which claim advances, which agent dispatches. A practitioner implementing this mechanism works with the control plane they already own. No access to model internals is required, and no training loop is involved.

The composition rule defines U as a weighted sum of six measurement primitives:

```
ΔU = U(s′) − U(s), where
U(s) = α · entropy(claim_distribution)
     + β · KL_divergence(claimed, verified)
     + γ · log_loss(predictions, outcomes)
     + δ · Brier_score(forecasts, results)
     − ε · information_gain(prior, current)
     + ζ · confidence_decay(stale_evidence)
```

Entropy, KL divergence, log loss, and Brier score each rise with incoherence, claim-to-evidence mismatch, and predictive error: their positive weights push U upward when the system's epistemic state deteriorates.

The information gain term carries a negative weight — genuine epistemic progress decreases U. Confidence decay rises with evidence staleness, applying upward pressure when the system advances on unrefreshed claims. Weights α through ζ are operator-configured parameters encoding domain priorities, not mathematical axioms. Reasonable defaults exist. The mechanism does not require exhaustive tuning to become useful.

The gating rule is strict and applies before any transition takes effect: a proposed advancement is accepted only if ΔU ≤ 0. Any promotion, dispatch, or state change that would increase U is rejected at the gate. This is not a retrospective penalty — it is a precondition. Evaluated as a single forward pass over the six primitives, the gate is computationally inexpensive, deterministic, and fully auditable. Every accepted transition carries a proof of non-worsening that an external observer can verify without access to the model that generated the proposal.

The Lyapunov basis for this construction is direct. A Lyapunov function over a dynamical system is a scalar quantity that decreases monotonically along valid trajectories — its existence certifies that the system is converging rather than diverging. Applying that reasoning to orchestration state: U is the Lyapunov candidate, ΔU ≤ 0 is the descent criterion, and the gate is the enforcement mechanism. Every accepted step in the system's trajectory is a certified non-worsening move through orchestration state.

A precise limitation requires explicit statement. Strict-descent gating establishes a local Lyapunov property — it guarantees monotonic improvement along accepted transitions; it does not guarantee convergence to a global minimum. Energy surfaces have local minima. An agent system gated on ΔU ≤ 0 may stabilize at a locally coherent configuration that is not the globally optimal one. The trade-off is intentional: local descent is verifiable; global optimality is not. Accepting only provably non-worsening transitions is a tractable, auditable guarantee. Claiming global convergence would be neither tractable nor honest.

The proposal is an extension of ICM/MWP, not a replacement. The folder architecture, stage boundaries, credential scoping, and workspace isolation that ICM specifies remain unchanged. The scalar potential adds a dynamical layer on top of that structural foundation — a physics that governs how the system moves, not just where it is permitted to go. How this composition operates in a working implementation — which infrastructure evaluates U, how weights are set for a realistic deployment, and what the gate looks like in practice — is the subject of Section 4.
