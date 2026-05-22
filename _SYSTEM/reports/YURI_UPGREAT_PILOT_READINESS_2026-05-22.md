# YURI Upgreat Pilot Readiness

Generated: 2026-05-22T21:00:57.644Z

## Objective

Show YURI as an AI-agent security assessment and hardening system for owned or explicitly authorized environments.

## Buyer Fit

- Upgreat gets a concrete AI security assessment surface without buying a fake black-box SOC story.
- The first pilot narrows to agent/tool/browser/memory/model-route risk because that is where YURI already has substrate.
- Cyber company direction remains larger, but the meeting should sell the first proof, not the entire future.

## Demo Flow

- Start with the threat matrix: why AI-agent, identity, SaaS, and memory/RAG risk are converging now.
- Show Security Lens modules and priority queues.
- Show lab harness fixtures and proof matrix, explicitly noting proven local fixture behavior versus production proof.
- Close with a pilot proposal: assess a bounded owned AI-agent/workflow surface and produce executive plus technical findings.

## Module Story

### Agent / Skill / MCP Scanner

First proof: Skill, MCP, browser-agent, and tool-route evidence review.

Priority: CY-028 Logs leaking sensitive AI prompts; CY-048 Direct prompt injection; CY-049 Indirect prompt injection through docs/web; CY-055 Agent-to-agent instruction propagation; CY-056 Browser-agent form exfiltration

Rules: agent-tool-connector-manifest-rule, memory-rag-provenance-rule, browser-session-isolation-rule, repo-supply-chain-rule, runtime-inventory-rule, secret-and-token-exposure-rule
Guardrails: input-dialog-rail, browser-action-boundary-rail, retrieval-memory-provenance-rail, execution-output-trust-rail, runtime-guardrail, runtime-health-rail

### Repo / Supply-Chain Scanner

First proof: Repository, dependency, CI/CD, token, and web/API exposure review.

Priority: CY-028 Logs leaking sensitive AI prompts; CY-057 Code-agent sabotage; CY-062 Sensitive memory retention; CY-067 NIS2 operational pressure; CY-070 EU AI Act governance pressure

Rules: agent-tool-connector-manifest-rule, repo-supply-chain-rule, memory-rag-provenance-rule, browser-session-isolation-rule, secret-and-token-exposure-rule
Guardrails: input-dialog-rail, retrieval-memory-provenance-rail, regional-governance-evidence-rail, browser-action-boundary-rail, execution-output-trust-rail, tool-input-output-rail

### AI Memory / RAG Scanner

First proof: Memory, retrieval, context, provenance, and poisoning-resistance review.

Priority: CY-048 Direct prompt injection; CY-049 Indirect prompt injection through docs/web; CY-057 Code-agent sabotage; CY-059 Memory poisoning gradual drift; CY-060 RAG corpus poisoning

Rules: memory-rag-provenance-rule, repo-supply-chain-rule, model-supply-inventory-rule, model-route-trust-posture-rule, secret-and-token-exposure-rule, agent-tool-connector-manifest-rule
Guardrails: input-dialog-rail, retrieval-memory-provenance-rail, model-supply-guardrail, model-route-rail, execution-output-trust-rail, tool-input-output-rail

### Model Route / Trust Posture Inventory

First proof: Model/provider routing, regional governance, identity, and SaaS trust review.

Priority: CY-048 Direct prompt injection; CY-063 Model artifact tampering; CY-067 NIS2 operational pressure; CY-070 EU AI Act governance pressure; CY-071 Singapore AI assurance/testing

Rules: memory-rag-provenance-rule, model-supply-inventory-rule, repo-supply-chain-rule, regional-governance-mapping-rule, model-route-trust-posture-rule, runtime-inventory-rule
Guardrails: input-dialog-rail, model-supply-guardrail, regional-governance-evidence-rail, retrieval-memory-provenance-rail, model-route-rail, runtime-guardrail

## Proof Status

- Threat rows: 90
- Build rows: 65
- Fixture-ready rails: 0
- Proven rails: 7

## Hard Boundaries

- No production penetration test claim yet.
- No malware execution.
- No DDoS beyond local owned load tests.
- No legal compliance guarantee.
- No SOC/SIEM/XDR/MDR maturity claim.
