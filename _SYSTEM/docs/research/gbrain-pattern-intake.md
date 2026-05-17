# GBrain Pattern Intake for Yuri OS / YURI

## Status

**Reference note only. Not an integration. Not a roadmap item. Not a sprint.**

Pipeline: `07J_GBRAIN_GEMINI_P_PASS` → `07J_GBRAIN_CODEX_P_PASS` → `07J_GBRAIN_GPT_SYNTH_PASS_DOC_ONLY_ADOPTION_READY`
Decision: Document conceptually (`ADOPT_SOON_AS_DOC_PATTERN`). Do not implement.

## Source

- Public reference: `garrytan/gbrain` (GitHub, public)
- Public reference: `garrytan/gbrain-evals` (GitHub, public)
- Gemini performed broad pattern extraction. Gemini's claim that the local repo was clean was **not independently verified**.
- Repo metrics (star counts, scale figures, production claim counts) are versioned and self-reported. Do not treat as independently verified truth.
- This document captures conceptual patterns only. No gbrain code is present in YURI.

## Executive Summary

GBrain is a personal knowledge-graph and memory system built around markdown wikis, typed links, compiled truth/timeline separation, and graph/vector hybrid retrieval. Its core value is the discipline it imposes on how facts are captured, attributed, and retrieved — not its runtime or stack.

Yuri OS / YURI can borrow the *conceptual patterns* without adopting the implementation. The stack (Bun, PGLite, Postgres, external enrichment APIs) is not relevant to the current Yuri architecture and should not be imported.

## Adopt As Yuri Documentation Patterns

These patterns are safe to document now and may inform future Yuri memory, skill, and retrieval design. None require code changes today.

### 1. Thin Harness, Fat Skills

The host system stays minimal. Domain knowledge lives in loadable skill artifacts. This aligns with Yuri OS: skills are `.claude/skills/`, the harness is the session hook layer. Reinforces not growing the harness beyond its routing/boot role.

### 2. Compiled Truth + Timeline Separation

Two distinct layers:
- **Compiled Truth** — stable, reconciled facts (what is known to be true)
- **Timeline** — event-ordered raw observations (what happened, when)

Yuri analogue: memory files hold compiled truth; session journals / `.claude/history.jsonl` hold timeline. These should not be merged. Future memory writes should route to the correct layer.

### 3. Source Attribution as First-Class Retrieval Rule

Every fact carries its source (session, file, agent, timestamp). Source is not metadata — it is a retrieval dimension. When two facts conflict, source seniority resolves the conflict.

Yuri implication: memory entries should eventually record `source:`, `observed_at:`, and `confidence:` fields. Not required now; document as a future memory-schema design principle.

### 4. MECE Resolver Discipline

Each concept has exactly one canonical placement in the knowledge structure. No duplicate entries for the same fact in different files. A resolver hierarchy determines where ambiguous content lives.

Yuri implication: MEMORY.md is the single index; memory files are the single source per topic. Reinforces the existing rule: check MEMORY.md before writing a new memory; update rather than duplicate.

### 5. Deterministic Typed-Link Extraction (Future Pattern)

GBrain extracts typed relationships from markdown links (`[[target|type]]` or similar). This enables graph traversal without a database schema change.

Yuri: this pattern is relevant to future Graphify / knowledge-graph work. Do not implement now. Capture as a design inspiration when the typed-link extractor sprint is opened.

### 6. BrainBench-Style Eval Inspiration

`garrytan/gbrain-evals` defines a benchmark suite (`BrainBench`) for evaluating memory retrieval quality. Key ideas:
- Evals are version-pinned to the memory state they test
- Retrieval quality is measured, not assumed
- Eval corpus is separate from the live memory store

Yuri implication: future memory retrieval systems should include a benchmark suite. This is an eval design philosophy, not an import.

## Defer To Graphify / RAG

These patterns require the Graphify / RAG layer before Yuri can use them. Do not implement until that sprint is open and independently planned.

- **Typed link extractor implementation** — requires markdown parser, graph schema, and Graphify integration
- **Graphify / RAG integration** — requires separate planning, security review, and data model decisions
- **Hybrid vector/graph retrieval** — depends on embedding layer Yuri does not currently have
- **Cathedral II / symbol graph traversal** — gbrain's code-symbol graph; relevant only after Graphify indexes code

## Defer To MLM / RLM

These patterns require a scheduled learning or memory-consolidation layer.

- **Dream Cycle / scheduled memory consolidation** — gbrain runs periodic jobs to reconcile and compress memories. Yuri's equivalent would be an MLM (Memory Lifecycle Manager) or RLM (Reflective Learning Module). Do not implement until that architecture is defined.
- **4-tier access policy** — gbrain restricts memory access by tier (read-only atoms, editable drafts, compiled truth, archive). Relevant to future Yuri memory governance. Defer to MLM design sprint.

## Eval Ideas To Reuse Later

When Yuri opens a memory-quality or retrieval benchmark sprint, revisit these gbrain-evals patterns:

- Version-pin evals to a fixed memory snapshot (prevents eval drift)
- Separate eval corpus from live memory
- Include retrieval precision metrics (not just "did it return something")
- Include source-attribution correctness as an eval dimension
- Include conflict-resolution correctness (does the system prefer compiled truth over stale timeline?)

## Explicit Non-Adoption Boundary

The following are **rejected for now**. Do not revisit without a separate decision:

| Item | Reason |
|------|--------|
| Direct gbrain code import | Not needed; patterns can be adopted without code |
| Bun / PGLite / Postgres stack | Not the Yuri stack; would require full infrastructure change |
| External enrichment APIs | Adds external dependencies, privacy surface, and cost |
| Always-on self-writing memory jobs | Requires careful governance; not safe without MLM framework |
| Remote MCP / autopilot memory loops | Security and auditability concerns; deferred indefinitely |
| Garry-specific workflow cloning | The patterns are general; cloning a personal workflow is not the goal |

**Critical boundary:** Yuri must not import gbrain code, gbrain dependencies, or reference gbrain runtime behavior in production paths. Any future implementation inspired by gbrain requires its own sprint, its own planning, and a separate security review.

## Risks To Preserve

These risks were surfaced during the Codex review and must remain visible in future planning:

1. **Scale claims are not verified.** Repo metrics in gbrain docs are versioned/self-reported. Do not cite them as evidence of production readiness.
2. **Gemini's cleanliness claim is unverified.** Gemini reported the local repo was clean. This was not independently confirmed. Treat it as Gemini's assertion only.
3. **Pattern drift risk.** Documenting gbrain patterns creates conceptual influence. Future sprints must not accidentally import gbrain assumptions (e.g., PGLite schema shape, Bun runtime, always-on jobs) without explicit decision.
4. **Eval corpus contamination.** If BrainBench-style evals are adopted, the eval corpus must be Yuri-native, not derived from gbrain's memory content.
5. **Typed-link syntax is not standardized.** GBrain's typed-link format is internal. Do not adopt the syntax without defining a Yuri-native equivalent.

## Future Sprint Ideas

These are candidate sprints, not commitments. None are scheduled.

- **Sprint: Yuri Memory Schema v2** — add `source:`, `observed_at:`, `confidence:` fields to memory file frontmatter; align MEMORY.md index discipline with MECE resolver rule
- **Sprint: Graphify Typed-Link Extractor** — implement typed markdown link extraction for Graphify; inspired by gbrain's relationship model
- **Sprint: MLM Architecture Design** — define the Memory Lifecycle Manager; include Dream-Cycle-style consolidation as a design option
- **Sprint: BrainBench-Inspired Eval Suite** — build a version-pinned benchmark for Yuri memory retrieval quality; separate from live memory
- **Sprint: 4-Tier Memory Access Policy** — define read/write/archive tiers for Yuri memory; informed by gbrain's access model

---

*This document is a Yuri OS reference note. It was produced by the 07J-GBRAIN-DOC-X sprint (2026-04-30) based on Gemini pattern extraction, Codex risk review, and GPT-5.5 synthesis. It does not grant implementation authority for any pattern listed here.*
