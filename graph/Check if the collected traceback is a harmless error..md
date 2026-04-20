---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py"
type: "rationale"
community: "FilteredStderrWrapper"
location: "L182"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/FilteredStderrWrapper
---

# Check if the collected traceback is a harmless error.

## Connections
- [[._is_harmless_error()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/FilteredStderrWrapper