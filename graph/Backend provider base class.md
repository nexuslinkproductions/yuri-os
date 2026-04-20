---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/provider.py"
type: "rationale"
community: "Logger"
location: "L19"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Backend provider base class

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Provider]] - `rationale_for` [EXTRACTED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger