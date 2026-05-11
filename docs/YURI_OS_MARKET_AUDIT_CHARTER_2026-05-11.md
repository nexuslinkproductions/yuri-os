# Yuri OS Market Audit Charter

Date: 2026-05-11
Status: ADVISORY_ONLY
Scope owner: Marcel Spatz
Local truth: repository evidence only
External truth: official/public source evidence only

## Core Position

Yuri OS should not be audited as "another chatbot" or "another agent framework." The defensible market position is:

Yuri OS is a local-first agent operating layer that coordinates tools, memory, skills, evidence, governance, and human oversight across existing AI systems.

That means the relevant market is not one narrow category. The audit must compare Yuri against five adjacent markets:

1. Agent runtimes and SDKs
2. Enterprise agent orchestration platforms
3. Workflow automation and integration platforms
4. AI governance, observability, and control towers
5. Personal/team AI operating systems and coding agents

The goal is not to prove Yuri is already better. The goal is to identify the smallest hard proof needed for Yuri to become credible as an integration layer and future competitor.

## Non-Negotiable Audit Rules

- No market claim without a source.
- No Yuri capability claim without local evidence.
- No "production-grade" label until health, security, recovery, and observability gates pass.
- No RAG ingestion of external source packs without explicit approval.
- No persona/theatre language in audit verdicts. Brand language can exist separately; audit language stays sober.
- Every finding must map to one of: ship blocker, credibility blocker, integration blocker, market blocker, or deferred.

## Current Local Baseline

Known local evidence:

- `NUDIMMUD_AUDIT_README.md` shows the design audit HUD exists, but real document analysis is still mock data.
- `_SYSTEM/SWARM_ARCHITECTURE_AUDIT_2026.md` already identifies graph orchestration, MCP/A2A, tiered memory, dynamic model routing, and adversarial gates as gaps.
- `docs/YURI_OS_BACKEND_HARDENING_AUDIT_2026-05-09.md` says the backend is not production-grade and identifies critical blockers around SQLite integrity, unauthenticated routes, CORS leakage, weak observability, and unproven recovery.
- `_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/` already contains seed governance research mapped to NIST AI RMF, OWASP, SLSA, and EU AI Act, but the archive is reference-only and not approved for RAG ingestion.

Immediate implication: the audit must first separate "real runtime capability" from "prototype/UI/governance intent."

## Benchmark Companies And Sources

Use these as primary comparison anchors. Add more only when they expose a distinct capability Yuri intends to compete with or integrate.

| Category | Benchmark | Why It Matters | Evidence Anchor |
|---|---|---|---|
| Agent SDK/runtime | OpenAI Agents SDK / Responses / Agent Builder | Server-owned orchestration, tools, guardrails, tracing, evals, hosted builder path | https://developers.openai.com/api/docs/guides/agents |
| Agent skills/runtime | Anthropic Claude Skills / Agent Skills | Filesystem-based progressive disclosure, bundled scripts/resources, domain skills | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview |
| Managed enterprise agent platform | Google Gemini Enterprise Agent Platform | Managed runtime, memory, sessions, eval service, observability, sandbox execution | https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale |
| Enterprise multi-agent orchestration | Microsoft Copilot Studio / M365 Agents SDK / A2A | Multi-agent GA, Fabric integration, A2A delegation, governance controls | https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/new-and-improved-multi-agent-orchestration-connected-experiences-and-faster-prompt-iteration/ |
| Graph orchestration | LangGraph / LangSmith Deployment | Durable execution, HITL, persistence, MCP/A2A endpoints, deployment runtime | https://docs.langchain.com/langsmith/deployment |
| RAG/agent data framework | LlamaIndex | Agent + data/RAG framework, tool integrations, observability, MCP conversion | https://developers.llamaindex.ai/python/framework/use_cases/agents/ |
| Multi-agent framework | CrewAI | Role-based multi-agent automation, local framework plus enterprise positioning | https://www.crewai.dev/ |
| Cloud agent platform | AWS Bedrock Agents | Autonomous agents over FMs, APIs, knowledge bases, enterprise cloud integration | https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html |
| CRM digital labor | Salesforce Agentforce | Enterprise agent observability, MCP, command center, industry actions, trust boundary | https://investor.salesforce.com/news/news-details/2025/Salesforce-Launches-Agentforce-3-to-Solve-the-Biggest-Blockers-to-Scaling-AI-Agents-Visibility-and-Control/default.aspx |
| AI control tower | ServiceNow AI Control Tower | Discover/observe/govern/secure/measure across agents, models, workflows, infrastructure | https://newsroom.servicenow.com/press-releases/details/2026/ServiceNow-expands-AI-Control-Tower-to-discover-observe-govern-secure-and-measure-AI-deployed-across-any-system-in-the-enterprise/default.aspx |
| Governance standard | NIST AI RMF | Govern, map, measure, manage; trustworthiness and risk framing | https://www.nist.gov/itl/ai-risk-management-framework |
| Agent/LLM security | OWASP GenAI / LLM Top 10 | Prompt injection, insecure output handling, excessive agency, supply chain risk | https://genai.owasp.org/llm-top-10/ |
| Supply-chain standard | SLSA v1.0 | Build provenance and supply-chain integrity | https://slsa.dev/spec/v1.0/ |
| Regulatory baseline | EU AI Act | Record keeping, transparency, human oversight, data governance, risk management | https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation-on-artificial-intelligence |

## Comparison Dimensions

Score Yuri and each benchmark on a 0-4 scale.

0 = no evidence
1 = documented intent
2 = prototype or partial local implementation
3 = working implementation with tests/smoke proof
4 = production-grade proof with security, recovery, observability, and user evidence

Dimensions:

1. Orchestration: graph/state machine, branching, retries, parallelism, scheduling.
2. Tool integration: MCP, A2A, API wrappers, local shell, browser, filesystem, external apps.
3. Human oversight: approvals, edit/reject loops, risk gates, role accountability.
4. Memory/context: working memory, long-term memory, retrieval quality, compaction, provenance.
5. Governance: policy hierarchy, audit log, compliance mapping, role permissions.
6. Observability: traces, metrics, logs, agent health, cost, latency, failure reasons.
7. Security: auth, least privilege, sandboxing, prompt injection defense, data boundary.
8. Recovery: checkpointing, idempotence, backup/restore, crash resume, replay safety.
9. Evaluation: golden tasks, adversarial tests, regression gates, eval datasets.
10. Integration value: ability to connect existing systems rather than replace them.
11. Developer experience: install path, docs, examples, typed APIs, local dev loop.
12. Business proof: target use cases, buyer, adoption path, differentiation, pricing hypothesis.

## Audit Deliverables

1. Capability inventory
   - Every Yuri claim mapped to exact files, scripts, routes, tests, screenshots, or command outputs.

2. Market comparison matrix
   - Yuri vs OpenAI, Anthropic, Google, Microsoft, LangGraph, LlamaIndex, CrewAI, AWS, Salesforce, ServiceNow.

3. Gap register
   - Each gap gets severity, owner, local evidence, competitor evidence, remediation path, and exit test.

4. Integration thesis
   - What Yuri integrates with first, why it is useful, and what proof makes it believable.

5. Product wedge
   - One sharp starting wedge, not "the entire AI market."
   - Recommended wedge: local-first AI control plane for power users and small teams who use multiple AI tools and need memory, evidence, routing, governance, and repeatable workflows.

6. Trust and compliance pack
   - NIST AI RMF mapping, OWASP mitigation matrix, SLSA provenance plan, EU AI Act record-keeping map.

7. Demo proof pack
   - One end-to-end workflow that records: task intake, plan, tool calls, memory use, human approval, execution artifact, eval, audit log, cost/latency, and recovery test.

8. Partnership/person-role plan
   - If Jake Van Clief is part of the plan, the audit must define his role as one or more of: strategic advisor, operator, design partner, sales/distribution partner, integration target, investor relation, or governance reviewer.
   - The audit must document permissions, deliverables, access boundaries, and decision rights before he is placed "inside the system."

## Strict Operating Mode

Until this audit is complete, all Yuri work should route through these lanes only:

### Lane A: Truth Inventory

Question: What exists locally?

Exit criteria:

- Capability inventory complete.
- All prototype/mock/canned paths labeled.
- All production claims either proven or downgraded.

### Lane B: Critical Hardening

Question: What blocks credible external demo?

Exit criteria:

- Backend DB corruption resolved or isolated.
- File/read/control routes authenticated or allowlisted.
- CORS error handling fixed.
- Random/hardcoded telemetry removed.
- Health checks include DB integrity and migration status.

### Lane C: Integration Architecture

Question: How does Yuri plug into the market?

Exit criteria:

- MCP/A2A strategy chosen.
- First three integrations selected.
- Integration threat model complete.
- Minimal connector demo works locally.

Recommended first integrations:

1. Local filesystem/repo evidence engine.
2. MCP-compatible tool surface.
3. One external work system: GitHub, Slack, Google Drive, Notion, or Linear.

### Lane D: Evaluation And Proof

Question: Can Yuri repeatably do useful work?

Exit criteria:

- 10 golden workflows.
- 3 adversarial workflows.
- Run logs with pass/fail labels.
- Regression command.
- Cost/latency/task-success dashboard.

### Lane E: Market Narrative

Question: What do we say only after proof exists?

Exit criteria:

- One-sentence positioning.
- 3 buyer/user profiles.
- 3 integration use cases.
- Competitive comparison table.
- Demo script tied to evidence, not ambition.

## Recommended First Proof Workflow

Workflow: "Evidence-backed agent workbench for codebase audit and remediation."

Why this wedge:

- Yuri already has source registry, audit docs, governance rules, evidence contract, and local repo access.
- Competitors are strong in agent runtime, but many teams still lack local truth, provenance, and multi-tool operating discipline.
- This creates integration value without needing to beat OpenAI, Anthropic, or Microsoft at foundation models.

Required demo:

1. User asks for an audit.
2. Yuri inventories local evidence.
3. Yuri compares against an approved benchmark matrix.
4. Yuri opens a gap register.
5. Yuri proposes fixes.
6. Yuri executes one safe fix.
7. Yuri runs verification.
8. Yuri emits an audit artifact with source links, local file evidence, and pass/fail status.

## Kill Criteria

Stop or rescope if any of these remain true after the hardening lane:

- Yuri cannot distinguish mock/canned output from live execution.
- Health checks pass while core data is corrupt.
- Sensitive local files can be read through unauthenticated routes.
- Agent actions cannot be replayed or audited.
- Claims require personality framing instead of evidence.
- The first demo depends on one-off manual explanation rather than repeatable workflow proof.

## 30-Day Execution Plan

Week 1:

- Freeze market scope to the benchmark table above.
- Complete local capability inventory.
- Convert backend hardening blockers into tracked tasks.
- Pick the first proof workflow.

Week 2:

- Fix or isolate critical backend/data/security blockers.
- Build route inventory and health/integrity smoke tests.
- Draft comparison matrix with evidence links.

Week 3:

- Implement or expose first integration surface.
- Build golden workflow runner.
- Produce first demo proof pack.

Week 4:

- Run adversarial audit.
- Produce market narrative only from passed proof.
- Decide whether Yuri is ready for private design partners.

## Decision

The audit should become a gate, not a document collection. Yuri moves toward market competition only when the audit produces repeatable proof in the lanes above.
