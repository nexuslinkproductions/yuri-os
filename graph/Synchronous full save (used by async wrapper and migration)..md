---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/store.py"
type: "rationale"
community: "Logger"
location: "L216"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Synchronous full save (used by async wrapper and migration).

## Connections
- [[._save_all_sync()]] - `rationale_for` [EXTRACTED]
- [[DescriptionQuality]] - `uses` [INFERRED]
- [[ExecutionRecord]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ToolQualityRecord]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger