---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/system/provider.py"
type: "rationale"
community: "Logger"
location: "L10"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Provider for system-level query tools

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[ErrorCode]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[GroundingError]] - `uses` [INFERRED]
- [[Provider]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[SystemProvider]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger