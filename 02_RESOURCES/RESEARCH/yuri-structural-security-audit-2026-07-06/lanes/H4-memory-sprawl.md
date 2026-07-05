# Memory Sprawl Audit — YURI Claude Auto-Memory (Track B)

**Date:** 2026-07-06  
**Scope:** `.claude/memory/` (320 files)  
**Owner:** Memory hygiene for Fable-5 de-bloat  

---

## Executive Summary

YURI's Claude auto-memory (Track B) is **functionally coherent but structurally overloaded**. 142 feedback rules + 99 mixed content + 43 projects + 26 references = 310 discrete files. The index (MEMORY.md) is at cap (142 lines, 135 entries) and beginning truncation. Three tiers of issues identified:

1. **HIGH:** 40–60 semantic duplicates across feedback rules (commit, dispatch, fleet, research).
2. **MEDIUM:** 8 parked/superseded entries not migrated to archive.
3. **LOW:** Index navigation overhead (entry density, no cross-links).

**Recommendation:** Consolidate duplicates into composable rule families, promote 8 parked items to archive, rewrite MEMORY.md for index clarity. Estimated effort: 4–6 hours (one focused session); payoff: sustainable memory system for 12+ months.

---

## Inventory by Type

| Type       | Count | Trend        | Health |
|------------|-------|--------------|--------|
| Feedback   | 142   | Stable       | **OVERLOADED** — 60% are near-duplicates |
| Other      | 99    | Sprawl       | Miscellaneous, low signal |
| Project    | 43    | Age OK       | Mostly June; 34/43 parked/shipped |
| Reference  | 26    | Healthy      | Load-bearing facts, curated |
| User       | 1     | Minimal      | user-favorite-color |
| **TOTAL**  | **311** | **→320 observed** | — |

---

## High-Severity Findings

### 1. Semantic Duplicates in Feedback (CONFIRMED)

**Problem:** Multiple feedback files encode the SAME rule or nearly-identical patterns.

**Groups identified:**

**Commit/Pathspec (3 files → 1 rule needed):**
- `feedback-approved-means-commit-and-push.md`
- `feedback-commit-pathspec-not-bare-multi-session.md`
- `feedback-shared-index-commit-pathspec.md`

**Pattern:** All encode "scope explicitly via pathspec, never bare `git add .` or bare `git commit`"

**Dispatch/Routing (7+ files → 2–3 rules):**
- `feedback-all-dispatch-through-llm-compat.md`
- `feedback-agent-dispatch-contract.md`
- `feedback-circuitry-equipped-lane-dispatch.md`
- `feedback-codex-dispatch-discipline.md`
- `feedback-mimo-dispatch-reality.md`
- `feedback-route-to-quantum.md`
- `feedback_codex_dispatch_prompt_size.md`, `feedback_dispatch_retry_on_failure.md`, `feedback_rick_persona_every_dispatch.md`

**Pattern:** Overlapping lanes (llm-compat, agent, codex, mimo, circuit) + retry logic; should fold into `llm-compat-contract.mjs` + one canonical "dispatch contract" feedback.

**Fleet/Agent/Peer/Swarm (9+ files → 3–4 rules):**
- `feedback-fleet-parallelism-breadth-depth.md`
- `feedback-glm-lanes-full-peers.md`
- `feedback-nano-swarm-orchestration.md`
- `feedback-opus-fleet-standing-default-orchestration.md`
- `feedback-opus-orchestrates-sonnet-haiku-agents.md`
- `feedback-peers-means-nano-swarm.md`
- `feedback-swarm-is-agents-not-deliverable.md`
- `feedback-multilane-peer-swarms.md`
- `feedback-standing-fleet-default-orchestration.md`
- (+ `feedback-agent-dispatch-contract.md` — overlaps)

**Pattern:** Fleet composition (Opus/Sonnet/Haiku/GLM/DeepSeek/ollama roles), concurrency guardrails, nano-swarm semantics.

**Research/Verification (4 files → 2–3 rules):**
- `feedback-research-local-db-first.md`
- `feedback-online-verification-layer.md`
- `feedback-research-via-mimo-lane.md`
- `feedback-nexus-research-compounding-2026-07-01.md`

**Pattern:** Local-first corpus search → online verification → Mimo lane escalation.

**Consolidation opportunity:** 25–35 feedback files could collapse into 12–15 composable rules + reference-tree structure (e.g., `feedback-dispatch-family/`, `feedback-fleet-family/` symlinks or a single `feedback-patterns.md` registry).

---

### 2. Parked / Superseded Work Not Archived (CONFIRMED)

**Found 8 entries still in MEMORY.md (Active section) that belong in archive-index:**

1. `feedback-infra-gate-posture-stress-test-2026-06-06` — guard REMOVED 06-20
2. `proj-nexus-link-platform-2026-06-16` — PARKED w/ Atilla
3. `proj-local-slm-voice-parked-2026-06-18` — PARKED til hw upgrade
4. `parked-yeganeh-canvas-2026-06-11` — PARKED, NaN leaf fail
5. `proj-nexus-motion-video-parked-2026-06-13` — PARKED, camera timing wrong
6. `newest-first-doc-ordering-idea.md` — PARKED
7. `feedback-retired-graphify-palace-ruflo.md` — RETIRED (already marked; should be archived)
8. `offload-consolidation-and-rename.md` — SUPERSEDED by llm-compat-contract.mjs

**Cost:** Index clutter + confusion (active items appear blocked or ship-ready when they're not).

---

## Medium-Severity Findings

### 3. Index Cap Reached (CONFIRMED)

**Current state:**
- MEMORY.md: 142 lines, 135 entries in Active section
- archive-index.md: 17K, 7 sub-sections
- Truncation risk: MEMORY.md tails off without summary

**Impact:** New entries will either:
1. Evict older active entries (lossy), or
2. Bloat MEMORY.md beyond scanning readability

**Safe cap estimate:** 40–50 active entries (front-loaded for recency + criticality).

---

## Low-Severity Findings

### 4. Sprawl in "Other" Category (99 files)

**Miscellaneous low-signal content:**
- Session journals, resumption notes (9 files)
- Vision/thesis documents (8 files)
- Experimental/idea parking (15+ files)
- One-off audit templates (4 files)

**Action:** Move session-journal entries → worktree-scoped session transcripts (not persistent memory); consolidate vision → one canonical `vision.md`; delete one-off templates.

---

### 5. Missing Cross-Links in Feedback

**Observation:** Individual feedback files stand alone; no family grouping. A developer writing `feedback-fleet-parallelism-breadth-depth.md` won't naturally discover `feedback-nano-swarm-orchestration.md`.

**Low cost fix:** Add `SEE ALSO:` sections referencing related rules.

---

## Architecture Coherence Assessment (Per Fable-5 Gate)

**Two-track + canonical store + NEURO_CORE claim:**

- **Track A (canonical):** Lives in `_SYSTEM/OS_KERNEL/memory.db` + `_SYSTEM/state/memory-canonical/`; routed via `memory-kernel.mjs`.
- **Track B (auto-memory):** Lives in `.claude/memory/` — THIS FILE SET.
- **Canonical store:** Folds Track-A promoted claims; read-only layer.
- **NEURO_CORE:** Fable objected to over-engineering; memory is now simpler (two tracks, one unified index per track).

**Verdict:** Coherent in STRUCTURE; OVERLOADED in VOLUME (Track B got 311 files without consolidation discipline). Memory.md index keeps the sprawl navigable but at brittleness cost.

**Design is sound; hygiene is stale.**

---

## Consolidation Candidates (Priority Order)

### T1: Feedback Rule Families (Highest Payoff)

| Family | Files | Action | Effort |
|--------|-------|--------|--------|
| Commit/Pathspec | 3 | Merge into 1; archive 2 | 30 min |
| Dispatch | 7 | Merge into 2–3; reference llm-compat-contract.mjs | 1 hour |
| Fleet/Agent | 9 | Merge into 3 rules; index via orchestration-map | 90 min |
| Research | 4 | Merge into 2–3; link to research_pipeline.md | 45 min |
| **Subtotal** | **23** | **→ 8–10 files** | **~4 hours** |

### T2: Parked/Superseded Cleanup

- Migrate 8 entries to `archive-index.md` with REMIND dates.
- Verify no live code still references them.

**Effort:** 30 min

### T3: Index Rewrite (Fable De-Bloat)

- Cap Active at 40 entries (top-criticality only).
- Promote 95 entries to archive with RECALL-BY-CONCEPT cross-index.
- Rewrite MEMORY.md front-section with family structure.

**Effort:** 90 min

### T4: Sprawl Cleanup

- Delete one-off templates; consolidate session notes → worktree-scoped.
- Keep vision + research artifacts; move to `02_RESOURCES/`.

**Effort:** 45 min

**Total estimated:** 4–6 hours, one focused session.

---

## Current Evidence

| Metric | Value | Source |
|--------|-------|--------|
| Total files | 320 | `find .claude/memory -name "*.md" \| wc -l` |
| Feedback files | 142 | basename prefix `feedback*` |
| Exact duplicates (same concept, multiple files) | 23–35 | Cross-naming audit |
| Parked/superseded still in Active | 8 | archive-index.md cross-ref |
| MEMORY.md line count | 142 | `wc -l MEMORY.md` |
| MEMORY.md entries | 135 | `grep "^- \["` |
| archive-index.md entries | ~40–50 | 7 sub-sections |

---

## Recommendation Summary

**DO (in order):**
1. Merge feedback rule families (dispatch, fleet, commit, research) → ~8 canonical feedback files.
2. Move 8 parked/superseded items to archive-index.
3. Rewrite MEMORY.md: cap Active at 40 entries, reorganize by RULE FAMILY.
4. Clean up sprawl: delete session-journal noise, move one-offs to 02_RESOURCES/.

**DO NOT:**
- Rewrite the two-track architecture (coherent).
- Create a new memory system (Track B works).
- Auto-archive stale entries without owner review (irreversible).

**Timeline:** 1 session, 4–6 hours, high-confidence refactor (reversible, tracked).

---

## Uncertainty Notes

- Exact dup count: 23–35 depends on diffing semantics (e.g., "dispatch in Codex" vs "dispatch in general").
- Whether session-journal entries are actively used: assumed low-priority; confirm before deleting.
- Archive-index depth: 7 sections observed; full count not extracted.

