---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/store.py"
type: "rationale"
community: "Logger"
location: "L103"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Load all quality records and global execution count.

## Connections
- [[.load_all()]] - `rationale_for` [EXTRACTED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolQualityRecord]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger