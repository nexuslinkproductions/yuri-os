# YURI Upgreat Meeting Packet

Generated: 2026-05-24T10:03:53.549Z

## Objective

Position YURI as an evidence-first AI security assessment and hardening system for a bounded Upgreat pilot.

## Opening Frame

- YURI is not being sold as a finished SOC or autonomous pentest product.
- The first proof is narrower and stronger: AI-agent, MCP, browser, memory/RAG, model-route, and tool-use risk.
- Every claim shown here is tied to local fixture proof, source-backed threat rows, and a next proof step.

## Executive Version

- YURI currently has 7 deterministic local proof cards across AI-agent, MCP/tool, browser, memory/RAG, API, and availability boundaries.
- The cyber matrix tracks 90 source-backed threat rows, with 65 mapped to build actions.
- The first commercial surface should be a bounded AI security assessment, not a broad managed-security claim.
- The strongest buyer promise is evidence: threats -> local proof -> reportable risk -> scoped next proof.

## Technical Version

- The current proof surface covers input-dialog-rail, tool-input-output-rail, browser-action-boundary-rail, retrieval-memory-provenance-rail, owned-lab-research-boundary-rail, runtime-health-rail.
- Each card links executable fixture tests, source IDs, related threat rows, Security Lens modules, demo steps, and next proof requirements.
- The local harness proves classification and boundary behavior only; production client proof requires scoped authorized replay.
- The next technical upgrade is live demo orchestration: run selected fixture tests, show generated reports, then map a client-safe pilot scope.

## Live Demo Order

### 1. Prompt Injection Replay Lab

Claim: YURI can detect prompt-injection-shaped instructions before they become execution authority.
Evidence: _SYSTEM/labs/cyber/fixtures/prompt-injection-replay.json
Executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs
Sources: S13, S15, S23
Modules: Agent / Skill / MCP Scanner, AI Memory / RAG Scanner, Model Route / Trust Posture Inventory
Show: Replay direct and tool-output injection fixtures, then show the rail preserving non-executable user text.
Next proof: Expand the corpus with indirect web/doc injection and per-model regression history.
Boundary: Deterministic local fixture proof passed; fixture proof only, not deployment proof.

### 2. Malicious MCP Tool Schema Lab

Claim: YURI can separate tool descriptions and tool output from trusted operator instructions.
Evidence: _SYSTEM/labs/cyber/fixtures/malicious-mcp-tool-schema.json
Executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs
Sources: S1, S9, S13, S16, S14, S17
Modules: Agent / Skill / MCP Scanner, Model Route / Trust Posture Inventory, Repo / Supply-Chain Scanner, AI Memory / RAG Scanner
Show: Show a malicious MCP tool schema and the benign control case side by side.
Next proof: Add real MCP connector manifests and capability-attestation checks from authorized stacks.
Boundary: Deterministic local fixture proof passed; fixture proof only, not deployment proof.

### 3. Browser Agent Fake Portal Lab

Claim: YURI can treat hostile DOM content as page content, not instructions for the browser agent.
Evidence: _SYSTEM/labs/cyber/fixtures/browser-agent-fake-portal.html
Executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs
Sources: S1, S4, S8, S9, S6, S13, S14, S16, S15
Modules: Agent / Skill / MCP Scanner, Repo / Supply-Chain Scanner, Model Route / Trust Posture Inventory
Show: Open the owned fake portal fixture and show read-only inspection blocking form-exfiltration behavior.
Next proof: Add browser-harness replay over richer fake SaaS flows with isolated profiles.
Boundary: Deterministic local fixture proof passed; fixture proof only, not deployment proof.

### 4. Memory Poisoning Corpus Lab

Claim: YURI can flag memory and retrieval poisoning before unsafe content is promoted into durable context.
Evidence: _SYSTEM/labs/cyber/fixtures/memory-poisoning-corpus.json
Executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs
Sources: S11, S13
Modules: AI Memory / RAG Scanner
Show: Run memory/RAG poisoning fixtures and show benign notes passing while hostile authority claims are quarantined.
Next proof: Add provenance scores, rollback demonstrations, and multi-hop RAG conflict tests.
Boundary: Deterministic local fixture proof passed; fixture proof only, not deployment proof.

### 5. RAG Poisoning Corpus Lab

Claim: YURI can flag memory and retrieval poisoning before unsafe content is promoted into durable context.
Evidence: _SYSTEM/labs/cyber/fixtures/rag-poisoning-corpus.json
Executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs
Sources: S1, S4, S9, S26, S11, S13
Modules: Repo / Supply-Chain Scanner, AI Memory / RAG Scanner
Show: Run memory/RAG poisoning fixtures and show benign notes passing while hostile authority claims are quarantined.
Next proof: Add provenance scores, rollback demonstrations, and multi-hop RAG conflict tests.
Boundary: Deterministic local fixture proof passed; fixture proof only, not deployment proof.

### 6. Vulnerable Web/API Case Library

Claim: YURI can document vulnerable owned lab patterns without crossing into unauthorized target activity.
Evidence: _SYSTEM/labs/cyber/fixtures/vulnerable-api-cases.json
Executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs
Sources: S9, S12
Modules: Repo / Supply-Chain Scanner
Show: Show toy API authorization cases proving report-only behavior and no network execution.
Next proof: Attach a running local vulnerable API server and retest remediation evidence.
Boundary: Deterministic local fixture proof passed; fixture proof only, not deployment proof.

### 7. Local Availability Pressure Plan

Claim: YURI can distinguish safe local availability-pressure proof from external DDoS-like behavior.
Evidence: _SYSTEM/labs/cyber/fixtures/local-load-test-plan.json
Executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs
Sources: S5, S6
Modules: Repo / Supply-Chain Scanner
Show: Show local-only pressure fixtures and the external-target denial case.
Next proof: Wire bounded localhost load checks into AutomationKernel health reports.
Boundary: Deterministic local fixture proof passed; fixture proof only, not deployment proof.

## Pilot Scope

Surface: One owned or explicitly authorized AI-agent/workflow surface: tools, browser behavior, memory/RAG, model routing, and repo/supply-chain context.

Deliverables:
- Executive risk summary with evidence-backed priorities.
- Technical findings with reproduction scope, boundary, and remediation proposal.
- Model/tool/memory route inventory.
- Client-safe retest plan for remediated findings.
- Clear distinction between proven local behavior, authorized client proof, and future roadmap.

Out of scope:
- Unscoped external scanning.
- Malware execution.
- Uncontrolled phishing or social engineering.
- DDoS or availability pressure outside local owned systems.
- Legal compliance certification.

## Questions For Upgreat

- Which AI-agent, automation, browser, or SaaS workflows are already being tested internally?
- Where do current agent experiments break down: tool safety, memory, browser actions, identity, reporting, or governance?
- What client environments would be safe for a bounded, read-only assessment first?
- Which compliance or buyer language matters most for their cybersecurity customers: NIS2, GDPR/revFADP, EU AI Act, baseline security, or operational resilience?
- Who owns remediation after a finding: Upgreat, client IT, or a joint pilot team?

## Hard Boundaries

- No production penetration test claim.
- No malware execution.
- No DDoS or load testing outside local owned systems.
- No legal compliance guarantee.
- No SOC/SIEM/XDR/MDR maturity claim.
- No scanning client or third-party systems without explicit written authorization and scope.
