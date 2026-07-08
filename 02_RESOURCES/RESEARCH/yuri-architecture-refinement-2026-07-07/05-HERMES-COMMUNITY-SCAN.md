# Hermes Community Aggregator Scan — 87,792 skills

**Date:** 2026-07-08 · **Enumeration:** `hermes-agent.nousresearch.com/docs/api/skills-index.json` (single 31.7MB static JSON, no auth). **87,792 skills / 8 registries** (clawhub 66,414 · skills.sh 19,963 · lobehub 505 · browse-sh 433 · github 374 · official 102). agentskills.io is a dead-end spec site.

## Method (deterministic-first, per the economy rule)
1. **Stage-1 keyword net** over all 87,792 (name+description) for YURI capability terms → **14,848** (16.9%).
2. **Stage-2 weighted scoring** (high-signal capability classes, minus overlaps with YURI's 122 skills, deduped) → **397**, took **top 300**.
3. **LLM vetting** — 300 chunked ×6, judged by 5 deepseek-flash + 1 composer lanes against a YURI-capability map. Result: **~135 ALREADY-HAVE · ~32 implementable-gap · ~133 skip.**

Most memory/continuity/swarm/verification skills are ALREADY-HAVE — YURI's Track-A/B memory, mcs consolidation, MURE swarm, claim-cortex, and energy gate already cover them. The lane-proposed gaps, ranked:

## Ranked gaps

### Tier 1 — top candidate → RED-TESTED → **FAILED (do not create)**
| Gap | Type | RED verdict |
|---|---|---|
| **Context-budget auditor** (Context Slimmer / Lobster Context Budget) | ability/workflow | **FAILED baseline 2026-07-08.** A capable agent (no skill), given YURI's real always-loaded files cold, produced the full audit unaided: per-file token table (~14.5k, ground-truth-matched), cross-file redundancy with quoted lines + locations, and 9 ranked trim proposals (~2.7–3.4k tok savings). The skill adds nothing a capable model doesn't already do → **DO-NOT-CREATE**, same verdict as humanizer + spike. |

### Tier 2 — genuine, fit YURI identity (backlog — NOT RED-tested)
| Gap | Type | Why YURI lacks it |
|---|---|---|
| Agent reputation scoring (Governed Agents) | ability | calibration tracks *prediction accuracy*, not per-subagent pass/fail reliability used to gate future routing — a fleet-economy/MURE extension. |
| LLM eval-suite-as-code (LLM Eval Harness) | workflow | claim-level verification exists; no declarative eval-suite + cross-model regression gate — fits the P2 golden-path test need. |
| Bounded-loop discipline (Agentsop) | workflow | no reusable contract encoding retry budgets + termination guarantees + escalation thresholds for LM loops. |
| Dynamic source selector (Nm Conserve Smart Sourcing) | ability | fleet-economy cost-matches *models*; nothing cost-matches *data sources* (web vs corpus vs KG vs cache by accuracy×token-cost). |

Backlog is **unproven** — each still owes a RED baseline before creation. Given the pattern (context-auditor + humanizer + spike = 3/3 passed baseline → not created), expect most to clear too.

### Tier 3 — novel but heavier (security/governance; P7.5-adjacent)
Per-agent least-privilege tool policy (Navil) · agent-config injection preflight (Deepsafe Scan) · MCP trust registry (Credence) · cryptographic audit-chain / signed agent-action provenance (Moses SHA-256, DAEMON Ed25519). These fit the "governance extension" identity + Fable's unowned multi-user/mortality gaps, but are features, not quick skills.

### Tier 4 — skip (niche/infra-heavy)
Vector/hybrid RAG (mnemo — YURI has partial `embed-backfill`), formal RDF/OWL ontology (Open Ontologies), game-theory engine, live event-stream ingestion (justinX), sandboxed multi-tool runtime (PaperPod).

## RED baseline result (the gate, actually run)
The Tier-1 candidate was the only one worth testing, and the gate was run for real (not stamped). **It PASSED baseline → the skill is bloat by the writing-skills Iron Law.** Verdict artifact: `red-baseline-context-audit.md` (17KB). **Community import decision: ZERO** — consistent with the native-catalog finding. YURI's 122 skills + capable models cover the useful ground; importing anything recreates the bleed this project exists to reduce.

## Byproduct (the real prize)
Running the RED test produced a concrete, on-theme finding for the actual skill-bleed goal (Q6). The cold audit measured **~14.5k tokens always-loaded** across 4 files and found **~2.7–3.4k (≈20–25%) recoverable redundancy** — a *trim task*, not a skill:
- **SOUL.md ≈ persona.md** (SOUL declares persona its own replacement, carries 6 `See persona →` deferral pointers + verbatim dupes) → merge, drop `@SOUL.md` → **~2,100 tok** (60–75% of the win).
- **Mutation/commit contract triplicated** (yuri-origin ↔ CLAUDE.md ↔ persona.md; origin L19 forbids exactly this) → dedupe to origin → **~200 tok**.
- **5 named-skill "Core Truth" stubs** (Izanagi/Haki/Nen/Bankai/Geass) restate their own SKILL.md in always-loaded context → one-line index → **~370 tok**.
- **"advisory until verified"** stated ~9× across the set → one canonical + pointers.
- **CLAUDE.md protected-paths subset** (drift hazard vs origin's full list) → pointer.

This is a candidate for P1's doc-hygiene/adapter-thinning phase — it operationalizes Fable's "adapters must be thin, no restated policy" ruling with measured savings.
