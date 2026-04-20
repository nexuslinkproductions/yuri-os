---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/store.py"
type: "rationale"
community: "EvolutionSuggestion"
location: "L262"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/EvolutionSuggestion
---

# Create tables if they don't exist (idempotent via IF NOT EXISTS).

## Connections
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