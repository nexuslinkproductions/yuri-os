---
source_file: "01_PROJECTS/openspace/openspace/cloud/search.py"
type: "rationale"
community: "SkillRanker"
location: "L25"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# Lazy wrapper — avoids importing skill_engine at module load time.

## Connections
- [[OpenSpaceClient]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]
- [[_check_safety()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker