---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/productivity_tools.py"
type: "rationale"
community: "Logger"
location: "L399"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Return ClawWork-compatible productivity tools if livebench is installed.      Ar

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[get_productivity_tools()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger