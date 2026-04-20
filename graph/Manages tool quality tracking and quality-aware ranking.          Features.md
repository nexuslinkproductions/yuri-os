---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/manager.py"
type: "rationale"
community: "Logger"
location: "L31"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Manages tool quality tracking and quality-aware ranking.          Features:

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[QualityStore]] - `uses` [INFERRED]
- [[ToolQualityManager]] - `rationale_for` [EXTRACTED]
- [[ToolQualityRecord]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger