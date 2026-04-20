---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/grounding_client.py"
type: "rationale"
community: "Logger"
location: "L20"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Global Entry, Facing Agent/Application, only concerned with Provider & Session

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[ErrorCode]] - `uses` [INFERRED]
- [[GroundingClient]] - `rationale_for` [EXTRACTED]
- [[GroundingError]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Provider]] - `uses` [INFERRED]
- [[ProviderRegistry]] - `uses` [INFERRED]
- [[SearchCoordinator]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[SessionInfo]] - `uses` [INFERRED]
- [[SessionStatus]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger