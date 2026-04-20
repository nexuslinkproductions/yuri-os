---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/provider.py"
type: "rationale"
community: "Logger"
location: "L35"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Internal helper.  Guarantee that `initialize()` has been executed

## Connections
- [[.ensure_initialized()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger