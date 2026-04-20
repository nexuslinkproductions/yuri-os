---
source_file: "01_PROJECTS/openspace/openspace/llm/client.py"
type: "rationale"
community: "Logger"
location: "L169"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Infer backend when tool_results would otherwise have no backend (name mismatch o

## Connections
- [[Logger]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolSchema]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[_infer_backend_from_tool_name()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger