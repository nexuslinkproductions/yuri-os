---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py"
type: "rationale"
community: "FilteredStderrWrapper"
location: "L270"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/FilteredStderrWrapper
---

# Establish connection in a dedicated task to avoid cancel-scope issues.

## Connections
- [[._establish_connection()_4]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/FilteredStderrWrapper