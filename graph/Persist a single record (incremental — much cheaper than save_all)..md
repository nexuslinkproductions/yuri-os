---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/store.py"
type: "rationale"
community: "Logger"
location: "L181"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Persist a single record (incremental — much cheaper than save_all).

## Connections
- [[.save_record()]] - `rationale_for` [EXTRACTED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolQualityRecord]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger