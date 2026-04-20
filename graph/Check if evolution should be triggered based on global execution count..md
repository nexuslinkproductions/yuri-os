---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/manager.py"
type: "rationale"
community: "Logger"
location: "L848"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Check if evolution should be triggered based on global execution count.

## Connections
- [[.should_evolve()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[QualityStore]] - `uses` [INFERRED]
- [[ToolQualityRecord]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger