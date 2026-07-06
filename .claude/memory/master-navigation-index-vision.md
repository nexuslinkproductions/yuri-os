---
name: master-navigation-index-vision
description: "HIGH-PRIORITY next-build (Marcel 2026-06-04): a master navigation/indexing layer that GUARANTEES retrieval completeness — no valuable artifact missed because a search was too shallow — unifying ai-search/GitNexus/memory/circuitry for any LLM to traverse the whole system reliably"
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - navigation
    - indexing
    - search completeness
    - master navigation
    - retrieval guarantee
    - shallow search
    - nothing overlooked
    - next priority
  refs: 
    - "[[cross-reference-engine]]"
    - "[[hold-big-picture-breadth-and-depth]]"
    - "[[feedback-research-local-db-first]]"
    - "[[feedback-circuitry-equipped-lane-dispatch]]"
    - "[[session-resume-2026-06-04-master-build-plan]]"
  originSessionId: 17414554-b41b-4c38-b0ff-b4247706def7
---

GOAL: build a **master navigation + indexing layer** over the whole YURI corpus + code + circuitry that *guarantees* nothing of value gets overlooked because a search was too shallow. The wiring (circuitry) is good; the missing piece is an enforcement-of-coverage retrieval layer that any LLM (Rick/Claude or another lane) can use to traverse the system reliably — breadth ENFORCED, not lucky. WHO: Marcel (owner, flagged it 2026-06-04 as HIGH priority). WHEN: after the red-team/moat landing settles ("later, once all of this is done"). WHERE: navigation spine likely sits with the cross-reference engine + the circuitry graph-state.

## THE PROBLEM (Marcel's framing)
Today's search surfaces are SEPARATE and individually shallow-able: `ai search` (FTS5/BM25 ~38k docs), GitNexus (call-graph), memory recall (trigger-based), the circuitry graph-state. A single query can miss a valuable artifact and nobody knows it was missed. There is no completeness guarantee — retrieval quality depends on the query being deep enough, which is fragile.

## THE VISION
A unified "master navigation system" that:
- **Unifies the surfaces** — one entry point that fans a query across lexical (FTS5), structural (GitNexus call-graph / semantic structure), memory, and the circuitry node-graph, not one-at-a-time.
- **Guarantees recall** — coverage scoring + a "what might I be missing?" completeness critic (modality not run, region not searched, sibling not surfaced) so a shallow search is DETECTED and widened, not silently trusted. Multi-modal sweep (by-container / by-content / by-entity / by-mechanism) as the default.
- **Is LLM-native + fast** — built so Rick/any lane invokes it as the FIRST navigation move and gets a bounded, exhaustive-enough map back, making the circuitry function better (reliable traversal of the whole system).

## CONNECTS TO (don't silo)
The cross-reference engine ([[cross-reference-engine]]) is the natural host — it already matches siblings on semantic structure. The circuitry self-model ([[feedback-circuitry-equipped-lane-dispatch]]) is the graph this navigates. The breadth-AND-depth law ([[hold-big-picture-breadth-and-depth]]) is WHY it matters (hold the whole picture, never tunnel). Local-DB-first ([[feedback-research-local-db-first]]) is the corpus it indexes.

NEXT: when picked up — scope the completeness-guarantee mechanism first (coverage scoring + the missing-modality critic), then the unified fan-out entry point. Decide whether it extends the cross-ref engine or is a new navigation organ. SEE: [[cross-reference-engine]] · [[session-resume-2026-06-04-master-build-plan]].
