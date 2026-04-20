---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/registry.py"
type: "rationale"
community: "SkillRanker"
location: "L294"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SkillRanker
---

# Register a single skill directory (hot-reload).          Safety: applies ``check

## Connections
- [[.register_skill_dir()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[SkillCandidate]] - `uses` [INFERRED]
- [[SkillRanker]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/SkillRanker