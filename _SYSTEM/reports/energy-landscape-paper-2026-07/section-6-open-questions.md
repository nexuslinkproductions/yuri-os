# Section 6: Open Questions

Three questions named at the close of Section 5 mark the boundary between what the current proposal establishes and what empirical investigation must decide.

The first is whether the Lyapunov property holds under adversarial pressure. The strict-descent guarantee is derived analytically from the gate rule; it does not account for an attacker who can observe U's component weights and craft transitions that satisfy ΔU ≤ 0 while degrading the epistemic state in ways not captured by the current composition. A productive investigation would frame this as a game-theoretic problem — what equilibrium exists between a gate with a fixed composition rule and an attacker with bounded knowledge of that rule?

The second is whether the weight composition transfers across agent architectures. The proposal was developed within an ICM/MWP-compatible system, where folder structure defines the state-space topology. Architectures like LangGraph, AutoGen, and MCP-based agents have different topology shapes. Whether U-composition under those topologies requires the same primitives, different primitives, or a structurally different composition rule is an open empirical question — one that would benefit from prototype implementations across at least two non-ICM/MWP frameworks.

The third is whether the gate's guarantees compose with other safety layers. Modern agent deployments carry multiple mechanisms: rate limits, permission scopes, content filters, supervisor approvals, and guardrail systems. A gate that interacts with these redundantly adds auditable rigor. One that interacts with unexpected effects — suppressing a safety layer or being suppressed — requires formal characterization before deployment. Whether the composition is additive, redundant, or structurally entangled remains to be established.

The architecture that ICM and MWP gave the field describes where agents are permitted to go. The mechanism this paper proposes governs how they move — and the questions above determine how far that movement can be trusted.

---

## Acknowledgments

The foundational ICM and MWP frameworks are the work of Jake Van Clief (arXiv:2603.16021). This paper would not exist without that contribution. The author thanks an anonymous engineering reviewer for careful reading, stress-testing the proposal against real deployment scenarios, and supplying the enterprise-governance perspective that shaped the scope of the reference implementation.
