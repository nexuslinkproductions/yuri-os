---
source_file: "01_PROJECTS/openspace/openspace/cloud/search.py"
type: "rationale"
community: "SkillRanker"
location: "L131"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# BM25 rough-rank to keep top candidates for embedding stage.

## Connections
- [[._bm25_phase()]] - `rationale_for` [EXTRACTED]
- [[OpenSpaceClient]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker