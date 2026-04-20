---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py"
type: "rationale"
community: "SkillRanker"
location: "L176"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/SkillRanker
---

# Remove a skill's cached embedding (e.g. after evolution).

## Connections
- [[.invalidate_cache()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/SkillRanker