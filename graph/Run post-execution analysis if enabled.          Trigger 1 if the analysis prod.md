---
source_file: "01_PROJECTS/openspace/openspace/tool_layer.py"
type: "rationale"
community: "Logger"
location: "L780"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Run post-execution analysis if enabled.          Trigger 1: if the analysis prod

## Connections
- [[._maybe_analyze_execution()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SkillEvolver]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger