# Section 1: Premise

The operating question in AI agent architecture has shifted. For most of the field's short history, containment was a runtime problem — rate limits, permission scopes, manual review. Structure was incidental. Jake Van Clief changed that.

Van Clief's ICM (Interpretable Context Methodology) and MWP (Model Workspace Protocol), published as arXiv:2603.16021, reframe containment as an architectural discipline. The central proposition: treat AI agents the way mature engineering teams treat code. Folder structure is the contract. Numbered stages define execution boundaries. Markdown files carry the context a model needs for each stage and nothing more. Credentials are scoped. Environments are sandboxed. The methodology's guiding principle — "treat AI like code, not a colleague" — captures the paradigm shift in one phrase.

ICM is effective because it eliminates an entire class of problems by construction. When folder layout is the architecture, misuse requires modifying the architecture — visible, auditable, and difficult to execute accidentally. MWP extends this to workspace isolation: the agent's action surface is bounded by what the protocol grants, not by what the model could theoretically reach. Together, ICM and MWP make the static properties of an agent system legible — what stages exist, what each stage can access, what credentials are live at each boundary.

What these frameworks establish is structural coherence. Stage boundaries are explicit. Resource scope is defined. The system at rest is well-characterized.

But a system that is structurally coherent at rest can behave arbitrarily in motion. Within any ICM stage, state transitions are unconstrained. A stage can loop, drift, accumulate contradictory claims, and promote assertions without independent verification. The folder structure says nothing about which transitions are valid, which states are recoverable, or how a system distinguishes genuine progress from circular motion.

When structural containment is solved, what governs the dynamics inside it?
