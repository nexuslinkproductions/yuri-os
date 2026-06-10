---
name: newest-first-doc-ordering-idea
description: "PARKED IDEA (Marcel 2026-06-05): evaluate a newest-first / top-loading ordering convention for living docs (plans, memories, handoffs, status logs) — freshest useful info at the TOP, older entries aging downward — to improve cross-session fluidity (next reader/lane sees current state first instead of digging past history)."
metadata:
  node_type: memory
  type: project
  tier: working
  scope: project
  trig:
    - newest first
    - top loading
    - doc ordering
    - fluidity across sessions
    - freshest at top
    - plan ordering
    - memory ordering
    - handoff structure
  refs:
    - keep-build-plan-synced
    - "[[offload-consolidation-and-rename]]"
  originSessionId: abb3b542-bc65-4d11-a095-be1c5ca218f0
---

GOAL: evaluate (and likely adopt) a **newest-first ordering convention** for living docs so cross-session continuity is more fluid. WHO: Marcel (idea, 2026-06-05). WHEN: parked 2026-06-05. WHERE: applies to plans, Track-A/B memories, HANDOFF-*.md, build-status logs, calibration logs, any doc that accumulates entries over time.

THE IDEA (Marcel's words, decoded): when we edit an existing file with information that should be seen first, the freshest/most-useful state should be written at the **TOP**, with older entries aging **downward** — instead of appending new info at the bottom where the reader has to dig past stale history. The next session / a dispatched lane then reads the current truth immediately. Marcel's hypothesis: top-loading certain doc types contributes to better fluidity across sessions.

STATE: parked idea, not yet a standing rule. We ALREADY do a version of this for build plans ([[keep-build-plan-synced]] = a live BUILD STATUS log at the top, updated each wave). Marcel is generalizing that pattern across more doc types. Open questions to resolve before adopting: (1) which doc types benefit (status/state docs = yes; append-only ledgers/audit-trails where chronological order is the contract = probably NO — newest-first would break provenance); (2) a consistent marker (e.g. a "CURRENT STATE" block pinned at top + a dated history below); (3) does MEMORY.md / the memory frontmatter already give "freshest" via recency, making this redundant for memories vs handoffs/plans.

NEXT: when revisited — pick the doc types where top-loading clearly helps (handoffs, plans, status logs), define the convention (pinned current-state header + aging history), and apply it; leave strictly-chronological ledgers append-only. SEE: [[keep-build-plan-synced]].
