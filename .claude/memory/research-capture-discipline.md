---
name: research-capture-discipline
description: Persist genuinely-relevant web/deep-research findings to 02_RESOURCES/research/ + ai reindex — never let research evaporate
metadata: 
  node_type: memory
  type: feedback
  tier: semantic
  scope: all
  trig: 
    - deep research
    - research this
    - look this up
    - find online
    - web research
    - save the research
    - disclosed reports
  refs: 
    - "[[research-local-db-first]]"
    - "[[memory-architecture-map]]"
  originSessionId: 09506d5f-46d8-4a63-ab5c-e3dff49f4a16
---

RULE: When a research task pulls genuinely useful info from the web (deep-research reports, prior-art, technical refs, disclosed reports, competitive/market intel), persist the synthesized CITED findings to `02_RESOURCES/research/<topic>-<YYYY-MM-DD>.md`, then `ai reindex`. The corpus is a compounding local "research center" / local-google; web findings otherwise live only in one session's context and evaporate.

WHEN: any research turn that surfaces keep-worthy online information. Marcel flagged 2026-06-02 that he'd asked for this repeatedly and it wasn't compounding — that's the leak this closes.

DO: write a cited findings doc (question · distilled answer · source URLs) to `02_RESOURCES/research/`; reindex; confirm searchable via `ai search`. Local-first still applies (search the corpus BEFORE going online).

DONT: don't leave valuable research only in chat context. Don't dump raw fetched pages — synthesize. Don't persist throwaway/low-signal lookups (relevance is a judgment call).

WHY: continuity is the product. A research center only compounds if findings land + index. Loading was never the problem; capture was.

SEE: .claude/rules/research_pipeline.md (step 4, now MANDATORY), _SYSTEM/MEMORY_ARCHITECTURE.md
