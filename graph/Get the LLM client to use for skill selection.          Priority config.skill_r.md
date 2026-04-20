---
source_file: "01_PROJECTS/openspace/openspace/tool_layer.py"
type: "rationale"
community: "Logger"
location: "L754"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Get the LLM client to use for skill selection.          Priority: config.skill_r

## Connections
- [[._get_skill_selection_llm()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SkillEvolver]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger