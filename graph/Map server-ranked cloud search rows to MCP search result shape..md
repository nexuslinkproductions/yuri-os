---
source_file: "01_PROJECTS/openspace/openspace/cloud/search.py"
type: "rationale"
community: "SkillRanker"
location: "L335"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# Map server-ranked cloud search rows to MCP search result shape.

## Connections
- [[OpenSpaceClient]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]
- [[build_cloud_results()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker