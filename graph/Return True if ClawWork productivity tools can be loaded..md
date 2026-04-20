---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/productivity_tools.py"
type: "rationale"
community: "Logger"
location: "L425"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Return True if ClawWork productivity tools can be loaded.

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[is_productivity_available()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger