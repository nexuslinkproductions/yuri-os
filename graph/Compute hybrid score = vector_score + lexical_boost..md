---
source_file: "01_PROJECTS/openspace/openspace/cloud/search.py"
type: "rationale"
community: "SkillRanker"
location: "L159"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# Compute hybrid score = vector_score + lexical_boost.

## Connections
- [[._score_phase()]] - `rationale_for` [EXTRACTED]
- [[OpenSpaceClient]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker