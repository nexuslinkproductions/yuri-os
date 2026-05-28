# Section 5: Honest Limitations

The proposal as specified in Sections 3 and 4 carries five limitations worth naming honestly. Each is stated with the work that would be required to advance it.

The weights α through ζ are hand-tuned by the operator, not learned from transition data. The current `DEFAULT_WEIGHTS` reflects one operator's judgment about penalty severity — it is auditable and controllable, and those properties are the design's main virtue. A learned-weight variant would advance this: an adaptive-calibration loop that adjusts weights in response to operator-validated transitions, letting empirical feedback replace manual judgment over time while preserving the gate's structural form.

The strict-descent gate guarantees monotonic improvement toward a local minimum, not global convergence — established in Section 3 and carried here as continuity. A stochastic exploration variant — accepting ΔU > 0 transitions under controlled annealing conditions — would advance this toward global descent without abandoning the gate architecture.

The gate is not yet wired into the live dispatch infrastructure. `gateProposal()` is callable as a standalone function and passes its tests; it has not been bound as middleware to the agent-routing layer. A dispatcher wrapper that intercepts lane calls, evaluates `gateProposal()` pre-flight, and routes rejections back as structured signals would advance this — converting the gate from a tested library function to a runtime enforcement layer.

The gate has not been tested against state transitions engineered to evade it. A targeted update that minimizes one high-weight term while degrading lower-weight terms below detection could produce ΔU ≤ 0 while moving epistemic state in a direction that fails operator review. A red-team protocol would require generating adversarial state pairs against the live gate, measuring evasion rate, and hardening the weakest weight components.

YURI is one operator's substrate, and the proposal has not been evaluated under concurrent state changes, shared-state contention, or multi-operator deployments where agents with different trust levels submit competing transitions. The ICM/MWP architecture is inherently single-workspace; a multi-tenant extension would require partitioned U evaluations per tenant and a global non-interference invariant at the shared-state boundary.

Section 5 names what is known to be incomplete. What is not yet known — whether the Lyapunov property holds under adversarial pressure, whether the weight composition transfers across agent architectures, and whether the gate's guarantees compose with other safety layers — is the territory Section 6 maps.
