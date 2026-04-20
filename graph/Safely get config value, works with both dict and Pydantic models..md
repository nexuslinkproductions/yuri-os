---
source_file: "01_PROJECTS/openspace/openspace/config/grounding.py"
type: "rationale"
community: "Logger"
location: "L21"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Safely get config value, works with both dict and Pydantic models.

## Connections
- [[.get_value()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SecurityPolicy]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger