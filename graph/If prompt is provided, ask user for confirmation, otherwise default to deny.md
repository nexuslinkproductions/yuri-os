---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/security/policies.py"
type: "rationale"
community: "Logger"
location: "L68"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# If prompt is provided, ask user for confirmation, otherwise default to deny

## Connections
- [[._ask_user()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[Box]] - `uses` [INFERRED]
- [[BoxStyle]] - `uses` [INFERRED]
- [[SecurityPolicy]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger