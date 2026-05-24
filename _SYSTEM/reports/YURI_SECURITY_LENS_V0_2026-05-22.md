# YURI Security Lens v0

Generated: 2026-05-24T10:01:15.236Z

## Scope

Security Lens v0 translates the YURI cyber intelligence matrix into four assessment modules. It is a proof planner and report surface for owned or explicitly authorized systems; it is not a SOC, SIEM, XDR, MDR, malware operation, or autonomous pentest product.

## Source

- Threat rows: 90
- Build rows: 65
- Watch rows: 25
- Source quality counts: B:73, A:122, D:3, C:11

## Modules

### Agent / Skill / MCP Scanner

First proof: Skill, MCP, browser-agent, and tool-route evidence review.

Rows: 40 total / 37 build / 3 watch

Scanner rules: agent-tool-connector-manifest-rule, memory-rag-provenance-rule, browser-session-isolation-rule, repo-supply-chain-rule, runtime-inventory-rule, secret-and-token-exposure-rule, data-flow-classification-rule
Guardrails: input-dialog-rail, browser-action-boundary-rail, retrieval-memory-provenance-rail, execution-output-trust-rail, runtime-guardrail, runtime-health-rail, tool-input-output-rail, privacy-and-data-route-rail
Labs: synthetic-prompt-injection-replay-lab, synthetic-agent-security-lab, owned-browser-agent-compromise-lab, toy-ot-ics-simulation-lab, local-supply-chain-ci-lab, local-mcp-tool-poisoning-lab

Priority queue:
- CY-028: Logs leaking sensitive AI prompts (saas-and-connector-risk)
- CY-048: Direct prompt injection (ai-agent-and-tool-risk)
- CY-049: Indirect prompt injection through docs/web (ai-agent-and-tool-risk)
- CY-055: Agent-to-agent instruction propagation (ai-agent-and-tool-risk)
- CY-056: Browser-agent form exfiltration (ai-agent-and-tool-risk)
- CY-057: Code-agent sabotage (ai-agent-and-tool-risk)
- CY-058: AI command injection through terminal output (ai-agent-and-tool-risk)
- CY-061: Context window trust collapse (memory-and-rag-risk)

### Repo / Supply-Chain Scanner

First proof: Repository, dependency, CI/CD, token, and web/API exposure review.

Rows: 49 total / 32 build / 17 watch

Scanner rules: agent-tool-connector-manifest-rule, repo-supply-chain-rule, memory-rag-provenance-rule, browser-session-isolation-rule, secret-and-token-exposure-rule
Guardrails: input-dialog-rail, retrieval-memory-provenance-rail, regional-governance-evidence-rail, browser-action-boundary-rail, execution-output-trust-rail, tool-input-output-rail, owned-lab-research-boundary-rail
Labs: toy-ot-ics-simulation-lab, synthetic-agent-security-lab, owned-browser-agent-compromise-lab, local-supply-chain-ci-lab, owned-vulnerable-web-api-lab, synthetic-rag-poisoning-lab, consent-only-social-engineering-simulation, local-mcp-tool-poisoning-lab, owned-vulnerability-research-benchmark-lab

Priority queue:
- CY-028: Logs leaking sensitive AI prompts (saas-and-connector-risk)
- CY-057: Code-agent sabotage (ai-agent-and-tool-risk)
- CY-062: Sensitive memory retention (memory-and-rag-risk)
- CY-067: NIS2 operational pressure (regional-governance-risk)
- CY-070: EU AI Act governance pressure (regional-governance-risk)
- CY-073: Japan industrial cyber/AI procurement controls (regional-governance-risk)
- CY-085: Browser profile/session bleed (runtime-monitoring-and-agent-ops-risk)
- CY-001: Ransomware-as-a-Service affiliate sprawl (resilience-and-extortion-risk)

### AI Memory / RAG Scanner

First proof: Memory, retrieval, context, provenance, and poisoning-resistance review.

Rows: 16 total / 15 build / 1 watch

Scanner rules: memory-rag-provenance-rule, repo-supply-chain-rule, model-supply-inventory-rule, model-route-trust-posture-rule, secret-and-token-exposure-rule, agent-tool-connector-manifest-rule
Guardrails: input-dialog-rail, retrieval-memory-provenance-rail, model-supply-guardrail, model-route-rail, execution-output-trust-rail, tool-input-output-rail
Labs: synthetic-prompt-injection-replay-lab, toy-ot-ics-simulation-lab, synthetic-memory-poisoning-lab, synthetic-rag-poisoning-lab, synthetic-agent-security-lab, local-supply-chain-ci-lab, local-mcp-tool-poisoning-lab

Priority queue:
- CY-048: Direct prompt injection (ai-agent-and-tool-risk)
- CY-049: Indirect prompt injection through docs/web (ai-agent-and-tool-risk)
- CY-057: Code-agent sabotage (ai-agent-and-tool-risk)
- CY-059: Memory poisoning gradual drift (memory-and-rag-risk)
- CY-060: RAG corpus poisoning (memory-and-rag-risk)
- CY-061: Context window trust collapse (memory-and-rag-risk)
- CY-062: Sensitive memory retention (memory-and-rag-risk)
- CY-063: Model artifact tampering (model-route-and-provenance-risk)

### Model Route / Trust Posture Inventory

First proof: Model/provider routing, regional governance, identity, and SaaS trust review.

Rows: 35 total / 26 build / 9 watch

Scanner rules: memory-rag-provenance-rule, model-supply-inventory-rule, repo-supply-chain-rule, regional-governance-mapping-rule, model-route-trust-posture-rule, runtime-inventory-rule, agent-tool-connector-manifest-rule, secret-and-token-exposure-rule, data-flow-classification-rule
Guardrails: input-dialog-rail, model-supply-guardrail, regional-governance-evidence-rail, retrieval-memory-provenance-rail, model-route-rail, runtime-guardrail, browser-action-boundary-rail, tool-input-output-rail, privacy-and-data-route-rail
Labs: synthetic-prompt-injection-replay-lab, local-supply-chain-ci-lab, toy-ot-ics-simulation-lab, synthetic-agent-security-lab, owned-browser-agent-compromise-lab, consent-only-social-engineering-simulation, local-mcp-tool-poisoning-lab

Priority queue:
- CY-048: Direct prompt injection (ai-agent-and-tool-risk)
- CY-063: Model artifact tampering (model-route-and-provenance-risk)
- CY-067: NIS2 operational pressure (regional-governance-risk)
- CY-070: EU AI Act governance pressure (regional-governance-risk)
- CY-071: Singapore AI assurance/testing (regional-governance-risk)
- CY-072: China GenAI security requirements divergence (regional-governance-risk)
- CY-073: Japan industrial cyber/AI procurement controls (regional-governance-risk)
- CY-080: Regional data sovereignty pressure (business-readiness-and-buyer-risk)

## Highest Proof Gaps

- CY-028 (SaaS): Logs leaking sensitive AI prompts - missing proof: Need log sanitizer tests
- CY-048 (AI Attack): Direct prompt injection - missing proof: Need benchmark corpus
- CY-049 (AI Attack): Indirect prompt injection through docs/web - missing proof: Need synthetic hostile docs
- CY-055 (AI Attack): Agent-to-agent instruction propagation - missing proof: Need multi-agent lab
- CY-056 (AI Attack): Browser-agent form exfiltration - missing proof: Need synthetic portal lab
- CY-057 (AI Attack): Code-agent sabotage - missing proof: Need malicious patch corpus
- CY-058 (AI Attack): AI command injection through terminal output - missing proof: Need replay test
- CY-059 (Memory): Memory poisoning gradual drift - missing proof: Need synthetic memory lab
- CY-060 (Memory): RAG corpus poisoning - missing proof: Need RAG poison corpus
- CY-061 (Memory): Context window trust collapse - missing proof: Need prompt assembly tests
- CY-062 (Memory): Sensitive memory retention - missing proof: Need memory audit ledger
- CY-063 (Model Supply): Model artifact tampering - missing proof: Need model registry design
- CY-067 (Regulation): NIS2 operational pressure - missing proof: No legal compliance engine
- CY-070 (Regulation): EU AI Act governance pressure - missing proof: Need claim discipline
- CY-071 (Regulation): Singapore AI assurance/testing - missing proof: Need AI Verify mapping
- CY-072 (Regulation): China GenAI security requirements divergence - missing proof: Need deeper China source corpus

## Boundaries

- owned-local-synthetic-or-explicitly-authorized-only
- assessment-and-reporting-only-unless-authorized
- no SOC/SIEM/XDR/MDR/autonomous-pentest claim in v0
- no external target scanning from this report generator
