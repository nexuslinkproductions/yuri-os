---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/registry.py"
type: "rationale"
community: "SkillRanker"
location: "L220"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# Register a newly-created skill (DERIVED / CAPTURED).          Does NOT overwrite

## Connections
- [[.add_skill()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker