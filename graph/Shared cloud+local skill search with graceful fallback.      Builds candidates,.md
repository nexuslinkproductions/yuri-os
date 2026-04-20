---
source_file: "01_PROJECTS/openspace/openspace/cloud/search.py"
type: "rationale"
community: "SkillRanker"
location: "L372"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# Shared cloud+local skill search with graceful fallback.      Builds candidates,

## Connections
- [[OpenSpaceClient]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]
- [[hybrid_search_skills()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker