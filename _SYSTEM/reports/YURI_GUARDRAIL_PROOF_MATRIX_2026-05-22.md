# YURI Cyber Guardrail Proof Matrix v0

Generated: 2026-05-22T07:35:01.670Z

## Status

- Fixture-ready rails: 7
- Proven rails: 0

No rail in this matrix is marked proven until an executable deterministic test exists and passes. v0 is a fixture-readiness layer only.

## Proof Rows

### Prompt Injection Replay Lab

- Lab: prompt-injection-replay
- Rail: input-dialog-rail (input-dialog)
- State: fixture-ready
- Fixture: _SYSTEM/labs/cyber/fixtures/prompt-injection-replay.json
- Threats: CY-048, CY-049, CY-050
- Claim: Fixture exists; deterministic rail test still required.

### Malicious MCP Tool Schema Lab

- Lab: malicious-mcp-tool-schema
- Rail: tool-input-output-rail (tool-io)
- State: fixture-ready
- Fixture: _SYSTEM/labs/cyber/fixtures/malicious-mcp-tool-schema.json
- Threats: CY-013, CY-025, CY-053, CY-054
- Claim: Fixture exists; deterministic rail test still required.

### Browser Agent Fake Portal Lab

- Lab: browser-agent-fake-portal
- Rail: browser-action-boundary-rail (browser-action)
- State: fixture-ready
- Fixture: _SYSTEM/labs/cyber/fixtures/browser-agent-fake-portal.html
- Threats: CY-006, CY-011, CY-027, CY-056, CY-085, CY-087
- Claim: Fixture exists; deterministic rail test still required.

### Memory Poisoning Corpus Lab

- Lab: memory-poisoning-corpus
- Rail: retrieval-memory-provenance-rail (retrieval-memory)
- State: fixture-ready
- Fixture: _SYSTEM/labs/cyber/fixtures/memory-poisoning-corpus.json
- Threats: CY-059
- Claim: Fixture exists; deterministic rail test still required.

### RAG Poisoning Corpus Lab

- Lab: rag-poisoning-corpus
- Rail: retrieval-memory-provenance-rail (retrieval-memory)
- State: fixture-ready
- Fixture: _SYSTEM/labs/cyber/fixtures/rag-poisoning-corpus.json
- Threats: CY-008, CY-032, CY-060
- Claim: Fixture exists; deterministic rail test still required.

### Vulnerable Web/API Case Library

- Lab: vulnerable-api-cases
- Rail: owned-lab-research-boundary-rail (owned-lab-boundary)
- State: fixture-ready
- Fixture: _SYSTEM/labs/cyber/fixtures/vulnerable-api-cases.json
- Threats: CY-038, CY-039, CY-040
- Claim: Fixture exists; deterministic rail test still required.

### Local Availability Pressure Plan

- Lab: local-load-test-plan
- Rail: runtime-health-rail (health-runtime)
- State: fixture-ready
- Fixture: _SYSTEM/labs/cyber/fixtures/local-load-test-plan.json
- Threats: CY-041, CY-042, CY-043
- Claim: Fixture exists; deterministic rail test still required.
