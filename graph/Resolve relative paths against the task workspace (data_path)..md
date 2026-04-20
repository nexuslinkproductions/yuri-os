---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/productivity_tools.py"
type: "rationale"
community: "Logger"
location: "L273"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Resolve relative paths against the task workspace (data_path).

## Connections
- [[._resolve_path()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger