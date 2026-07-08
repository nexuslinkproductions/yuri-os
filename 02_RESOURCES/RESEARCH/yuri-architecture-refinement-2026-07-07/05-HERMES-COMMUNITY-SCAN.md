# Hermes Community Aggregator Scan — 87,792 skills

**Date:** 2026-07-08 · **Enumeration:** `hermes-agent.nousresearch.com/docs/api/skills-index.json` (single 31.7MB static JSON, no auth). **87,792 skills / 8 registries** (clawhub 66,414 · skills.sh 19,963 · lobehub 505 · browse-sh 433 · github 374 · official 102). agentskills.io is a dead-end spec site.

## Method (deterministic-first, per the economy rule)
1. **Stage-1 keyword net** over all 87,792 (name+description) for YURI capability terms → **14,848** (16.9%).
2. **Stage-2 weighted scoring** (high-signal capability classes, minus overlaps with YURI's 122 skills, deduped) → **397**, took **top 300**.
3. **LLM vetting** — 300 chunked ×6, judged by 5 deepseek-flash + 1 composer lanes against a YURI-capability map. Result: **~135 ALREADY-HAVE · ~32 implementable-gap · ~133 skip.**

Most memory/continuity/swarm/verification skills are ALREADY-HAVE — YURI's Track-A/B memory, mcs consolidation, MURE swarm, claim-cortex, and energy gate already cover them. The genuine gaps, ranked:

## Ranked gaps

### Tier 1 — recommend (on-theme, genuine, self-invokable)
| Gap | Type | Why YURI lacks it |
|---|---|---|
| **Context-budget auditor** (Context Slimmer / Lobster Context Budget) | ability/workflow | YURI has `ccr-compress` (runtime compression) but NO tool that audits the token cost + redundancy of always-loaded static files (CLAUDE.md/SOUL.md/skills/MCP manifests) and proposes targeted trims. **Directly serves this project's skill-bleed goal (Q6).** |

### Tier 2 — genuine, fit YURI identity (backlog)
| Gap | Type | Why YURI lacks it |
|---|---|---|
| Agent reputation scoring (Governed Agents) | ability | calibration tracks *prediction accuracy*, not per-subagent pass/fail reliability used to gate future routing — a fleet-economy/MURE extension. |
| LLM eval-suite-as-code (LLM Eval Harness) | workflow | claim-level verification exists; no declarative eval-suite + cross-model regression gate — fits the P2 golden-path test need. |
| Bounded-loop discipline (Agentsop) | workflow | no reusable contract encoding retry budgets + termination guarantees + escalation thresholds for LM loops. |
| Dynamic source selector (Nm Conserve Smart Sourcing) | ability | fleet-economy cost-matches *models*; nothing cost-matches *data sources* (web vs corpus vs KG vs cache by accuracy×token-cost). |

### Tier 3 — novel but heavier (security/governance; P7.5-adjacent)
Per-agent least-privilege tool policy (Navil) · agent-config injection preflight (Deepsafe Scan) · MCP trust registry (Credence) · cryptographic audit-chain / signed agent-action provenance (Moses SHA-256, DAEMON Ed25519). These fit the "governance extension" identity + Fable's unowned multi-user/mortality gaps, but are features, not quick skills.

### Tier 4 — skip (niche/infra-heavy)
Vector/hybrid RAG (mnemo — YURI has partial `embed-backfill`), formal RDF/OWL ontology (Open Ontologies), game-theory engine, live event-stream ingestion (justinX), sandboxed multi-tool runtime (PaperPod).

## Recommendation
Per the writing-skills Iron Law, every candidate needs a RED baseline before creation — and the earlier native-catalog candidates (humanizer, spike) both PASSED baseline (already handled) → not created. **The one gap worth building is the Tier-1 context-budget auditor**: on-theme, genuinely absent, and exactly the kind of ability a model self-invokes. Tier 2–3 are a prioritized backlog for owner selection, NOT a bulk import (importing 32 would recreate the bleed this project reduces). **Import decision: build 1 (context-budget auditor, RED-tested), backlog the rest.**
