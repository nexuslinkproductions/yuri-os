# MURE role topology

This is the compact contract behind the provider route registry. A model is not a role, and a provider route is not proof that the route is usable. Every route begins disarmed and becomes eligible only after exact native completion evidence.

| Role | Job | May spawn | May execute worker work | Typical routes |
|---|---|---:|---:|---|
| Orchestrator | Hold the goal spine, plan, delegate, verify, synthesize | yes | no | Sol |
| Architect | Design decomposition and interfaces | no | no | GLM, Sonnet, MiniMax |
| Advisor | Consult at planning and commitment boundaries; annotate risk | no | no | Sonnet, Luna, Opus when escalated |
| Worker | Perform one bounded, self-contained leaf | no | yes | MiniMax, DeepSeek, Haiku, MiMo, Gemini |
| Verifier | Independently test or refute the producer result | no | no | Sonnet, Luna, Opus |

## Non-negotiable boundaries

- Sol remains the parent control plane. It is never compiled as a child worker.
- Workers receive a self-contained brief and task-scoped upstream evidence. They do not expand scope or spawn peers.
- Advisors annotate and recommend. They do not execute the requested work or become an implicit second orchestrator.
- Verifiers are downstream and independent. A producer cannot grade itself.
- Cheap routes may produce R0 semantics and evidence for higher-risk work, but they do not perform R2/R3 semantic work or final verification.
- Fable 5 is excluded. Any catalog entry is archival metadata, not a selectable route.
- Provider route identities remain separate: direct DeepSeek, Ollama, Cline, OpenCode, Cursor, and the OMP TaskTool route are different operational routes even when they expose the same model family.

## Route status vocabulary

- `canary-proven`: exact model, `jobId`/`ompSessionId`, exact `agentId`, and a completed `<task-result>` status with transcript evidence captured.
- `catalog-candidate`: described by the catalog but not yet proven in the active OMP runtime.
- `default-masked`: intentionally unavailable until canary evidence exists.
- `unresolved`: provider/model binding is incomplete; no spawn may be attempted.

The machine-readable source is [`provider-route-registry.json`](../config/provider-route-registry.json).
