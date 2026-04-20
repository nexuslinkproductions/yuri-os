---
source_file: "01_PROJECTS/openspace/openspace/utils/ui_integration.py"
type: "rationale"
community: "OpenSpaceUI"
location: "L164"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/OpenSpaceUI
---

# Called when agent is thinking                  Args:             agent_name: Age

## Connections
- [[.on_agent_thinking()]] - `rationale_for` [EXTRACTED]
- [[AgentStatus_1]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[OpenSpaceUI]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/OpenSpaceUI