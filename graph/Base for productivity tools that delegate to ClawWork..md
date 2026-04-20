---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/productivity_tools.py"
type: "rationale"
community: "Logger"
location: "L87"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Base for productivity tools that delegate to ClawWork.

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[_ProductivityToolBase]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger