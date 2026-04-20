---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py"
type: "rationale"
community: "FilteredStderrWrapper"
location: "L207"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/FilteredStderrWrapper
---

# Flush any remaining buffered content and the underlying stream.

## Connections
- [[.flush()_1]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/FilteredStderrWrapper