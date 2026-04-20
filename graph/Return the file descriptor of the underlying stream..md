---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py"
type: "rationale"
community: "FilteredStderrWrapper"
location: "L221"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/FilteredStderrWrapper
---

# Return the file descriptor of the underlying stream.

## Connections
- [[.fileno()_1]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/FilteredStderrWrapper