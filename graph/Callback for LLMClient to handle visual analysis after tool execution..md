---
source_file: "01_PROJECTS/openspace/openspace/agents/visual_analyzer.py"
type: "rationale"
community: "Logger"
location: "L38"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Callback for LLMClient to handle visual analysis after tool execution.

## Connections
- [[.analyze_tool_result()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[ScreenshotClient]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger