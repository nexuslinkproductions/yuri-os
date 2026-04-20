---
source_file: "01_PROJECTS/openspace/openspace/utils/ui_integration.py"
type: "rationale"
community: "OpenSpaceUI"
location: "L185"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/OpenSpaceUI
---

# Called when LLM is called                  Args:             model: Model name

## Connections
- [[.on_llm_call()]] - `rationale_for` [EXTRACTED]
- [[AgentStatus_1]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[OpenSpaceUI]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/OpenSpaceUI