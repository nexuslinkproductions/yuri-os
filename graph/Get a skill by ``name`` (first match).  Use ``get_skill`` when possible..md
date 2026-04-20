---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/registry.py"
type: "rationale"
community: "SkillRanker"
location: "L190"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# Get a skill by ``name`` (first match).  Use ``get_skill`` when possible.

## Connections
- [[.get_skill_by_name()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker