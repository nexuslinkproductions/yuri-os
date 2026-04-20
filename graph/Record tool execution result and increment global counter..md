---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/manager.py"
type: "rationale"
community: "Logger"
location: "L265"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Record tool execution result and increment global counter.

## Connections
- [[.record_execution()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[QualityStore]] - `uses` [INFERRED]
- [[ToolQualityRecord]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger