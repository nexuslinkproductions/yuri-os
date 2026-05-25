# YURI Actual Capability Audit

Generated: 2026-05-25
Owner: Codex/main
Promotion state: research
Evidence boundary: advisory synthesis plus local file/test evidence; no external production claim.

## Accepted Identity

YURI is a governed local AI control plane for single-operator research, engineering, memory, audit, math, and creative operations.

This statement is the current external-safe identity. It describes the repository as a local control plane and operator workflow. It does not claim that YURI is a literal operating system, SOC, SIEM, XDR, cybersecurity company, production-ready infrastructure, autonomous pentest platform, or runtime protection product.

## Rejected Identity Claims

Rejected identity claim: YURI is not a literal OS or general-purpose operating system. `YURI OS` remains an internal project name only.

Rejected identity claim: YURI is not a SOC, SIEM, XDR, MDR, cybersecurity company, production-ready managed security service, autonomous pentest system, or runtime protection layer.

Rejected identity claim: fixture proof is not production proof. Existing cyber reports may use legacy terms like `proven` or `retest-proven`; those must be read as local fixture proof only unless a claim has `runtime_tested`, `operator_validated`, or `trusted` promotion evidence.

## Evidence Base

- Handoff packet: `_SYSTEM/reports/YURI_TRUTH_PROMOTION_NEXT_SESSION_2026-05-25.md`
- Primary council audit: `_SYSTEM/state/shintai-advisory/shintai-2026-05-25T11-10-31-941Z.json`
- Qwen sterile retry: `_SYSTEM/state/shintai-advisory/qwen-397b-sterile-retry-2026-05-25T11-19-40-244Z.md`
- Current implementation advisory: `_SYSTEM/state/shintai-advisory/shintai-2026-05-25T12-26-01-926Z.md`
- Local verification anchors: `_SYSTEM/Scripts/shintai-dispatch.test.mjs`, `_SYSTEM/Scripts/lane-session.test.mjs`, `_SYSTEM/Scripts/offload-runner-rails.test.mjs`, `_SYSTEM/Scripts/root-architecture.test.mjs`, `_SYSTEM/Scripts/math/math-proof-gate.mjs`

## Council Findings

DeepSeek gave the strongest implementation critique: the narrative layer can outrun executable truth, especially around cyber proof wording and runtime capability.

Nemotron framed YURI as a specialized AI-agent control plane, not a literal OS. It also flagged missing CI/CD, live cyber telemetry, and release management.

Mistral aligned with the boundary that the cyber company narrative is not current runtime truth.

GPT-OSS warned about overengineering and identity drift.

Qwen 397B and Qwen Coder were useful but uneven. Qwen 397B was too optimistic in one sterile retry; Qwen Coder was thin in the earlier council run.

Claude Opus was not used as a prompt-call lane. The route correctly refused non-persistent Claude usage and instructed a continuous CLI/tmux/PTY session instead.

Minimax degraded during the current implementation advisory: its health probe detached a queue process and stalled the first Shintai health preflight. The second dispatcher run proceeded through the YURI control plane with Minimax excluded.

## Codex Arbitration

YURI is not just random scripts. It has real control-plane machinery: context routing, lane dispatch, evidence gates, protected-surface rules, advisory artifacts, mathematical proof gates, and local verification commands.

YURI is also not a mature platform. The critical missing layer is promotion authority: a mechanism that decides which claims are draft, research, fixture_ready, runtime_tested, operator_validated, trusted, or deprecated.

The next correct move is not more cyber, math, or OS-sounding surface area. The correct move is a truth-promotion layer that makes claims mechanically accountable to local evidence.

## Domain Ratings

| Domain | Current rating | Promotion state | Notes |
| --- | --- | --- | --- |
| Shintai/model orchestration | Real but needs hardening | runtime_tested | Dispatcher, Rick persona anchor, Gate 0 evidence, and parallel fan-out exist. Minimax health hang shows reliability work remains. |
| Codex-led app development | Real workflow | operator_validated | Codex/main can implement, test, arbitrate, and preserve scope. No autonomous merge or push claim. |
| Governance | Highest priority | research | Policies exist, but promotion authority is new work in this sprint. |
| Memory/RAG | Real surfaces, weak authority | research | Memory kernels and research exist; provenance and promotion boundaries need enforcement. |
| Math substrate | Promising executable direction | fixture_ready | Formula banks and proof gates exist. Math expansion stays paused except governance integration. |
| Cybersecurity | Research and local fixture audit only | fixture_ready | Local guardrail fixtures and reports exist. No SOC, SIEM, XDR, runtime protection, or production-ready cyber platform claim. |
| Automation | Useful local scripts | research | No independent autonomous operation claim. Operator remains in control. |

## Promotion Ladder

Canonical promotion states:

- `draft`: created but not evidence-backed.
- `research`: grounded in sources or advisory synthesis, not executable trust.
- `fixture_ready`: supported by owned local fixtures or deterministic examples.
- `runtime_tested`: executable local test or runtime path has passed.
- `operator_validated`: runtime_tested plus explicit operator validation.
- `trusted`: operator_validated plus recurring health/release gate evidence.
- `deprecated`: no longer current truth.

Legacy mapping notes:

- `verified-baseline` in math formula banks maps to `runtime_tested` only when executable proof-gate evidence is present.
- `proven` and `retest-proven` in cyber reports map to `fixture_ready` unless a live runtime test reference is present.
- `usable` in skill maturity docs does not imply `trusted` without operator validation and recurring evidence.

## Research Anchors

- NIST AI RMF: use govern/map/measure/manage as the risk-governance frame for promotion decisions. https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
- W3C PROV-O: model claim provenance with entities, activities, and agents. https://www.w3.org/TR/prov-o/
- SLSA and in-toto: adapt subject, predicate, verifier, policy, and input attestation ideas for artifact evidence. https://slsa.dev/spec/v1.2/ and https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md
- NIST SSDF: keep trust claims tied to repeatable verification practice. https://csrc.nist.gov/pubs/sp/800/218/final
- OWASP SAMM: use maturity-model framing for domain ratings. https://owaspsamm.org/model/
- JSON Schema 2020-12: use machine-readable schema validation for promotion reports. https://json-schema.org/draft/2020-12
- OpenTelemetry semantic conventions: borrow stable naming patterns for future evidence events without adding telemetry scope in this sprint. https://opentelemetry.io/docs/concepts/semantic-conventions/

## Evidence Gaps

- Claim-integrity scanning did not exist before this sprint.
- Promotion ladder schema did not exist before this sprint.
- Shintai output quality was not degraded for PONG-style or schema-only output before this sprint.
- Cyber proof language still needs cleanup after the gate produces scoped findings.
- Memory/RAG provenance is not yet strong enough for trusted claims.

## Next Priorities

1. Implement and verify `_SYSTEM/Scripts/claim-integrity-gate.mjs`.
2. Register the promotion ladder schema and actual capability audit.
3. Add Shintai substance metadata and tests.
4. Run the gate against this audit and selected legacy reports.
5. Use findings to plan a later cleanup sprint; do not mass-rewrite existing docs in this sprint.
