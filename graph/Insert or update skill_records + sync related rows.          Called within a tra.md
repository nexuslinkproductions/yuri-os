---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/store.py"
type: "rationale"
community: "EvolutionSuggestion"
location: "L1172"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/EvolutionSuggestion
---

# Insert or update skill_records + sync related rows.          Called within a tra

## Connections
- [[._upsert()]] - `rationale_for` [EXTRACTED]
- [[EvolutionSuggestion]] - `uses` [INFERRED]
- [[ExecutionAnalysis]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SkillCategory]] - `uses` [INFERRED]
- [[SkillJudgment]] - `uses` [INFERRED]
- [[SkillLineage]] - `uses` [INFERRED]
- [[SkillOrigin]] - `uses` [INFERRED]
- [[SkillRecord]] - `uses` [INFERRED]
- [[SkillVisibility]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/EvolutionSuggestion