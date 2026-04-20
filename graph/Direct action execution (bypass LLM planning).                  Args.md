---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/gui/tool.py"
type: "rationale"
community: "Logger"
location: "L536"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Direct action execution (bypass LLM planning).                  Args:

## Connections
- [[.execute_action()]] - `rationale_for` [EXTRACTED]
- [[AnthropicGUIClient]] - `uses` [INFERRED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseTool_1]] - `uses` [INFERRED]
- [[GUIConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[RecordingManager]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger