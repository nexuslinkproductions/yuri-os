---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/productivity_tools.py"
type: "rationale"
community: "Logger"
location: "L45"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Set ClawWork global state so productivity tools have data_path/date.

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[_set_global_state_for_productivity()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger