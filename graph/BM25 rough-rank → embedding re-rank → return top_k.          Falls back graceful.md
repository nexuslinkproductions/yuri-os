---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py"
type: "rationale"
community: "SkillRanker"
location: "L105"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/SkillRanker
---

# BM25 rough-rank → embedding re-rank → return top_k.          Falls back graceful

## Connections
- [[.hybrid_rank()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/SkillRanker