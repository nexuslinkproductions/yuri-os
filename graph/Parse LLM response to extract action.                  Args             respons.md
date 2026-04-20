---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/gui/tool.py"
type: "rationale"
community: "Logger"
location: "L449"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Parse LLM response to extract action.                  Args:             respons

## Connections
- [[._parse_llm_response()]] - `rationale_for` [EXTRACTED]
- [[AnthropicGUIClient]] - `uses` [INFERRED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseTool_1]] - `uses` [INFERRED]
- [[GUIConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[RecordingManager]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger