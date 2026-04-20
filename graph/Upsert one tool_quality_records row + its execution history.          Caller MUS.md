---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/store.py"
type: "rationale"
community: "Logger"
location: "L232"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Upsert one tool_quality_records row + its execution history.          Caller MUS

## Connections
- [[._upsert_record()]] - `rationale_for` [EXTRACTED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolQualityRecord]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger