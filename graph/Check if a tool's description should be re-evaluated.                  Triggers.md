---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/manager.py"
type: "rationale"
community: "Logger"
location: "L762"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Check if a tool's description should be re-evaluated.                  Triggers

## Connections
- [[.should_reevaluate_description()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[QualityStore]] - `uses` [INFERRED]
- [[ToolQualityRecord]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger