---
source_file: "01_PROJECTS/openspace/openspace/utils/telemetry/telemetry.py"
type: "rationale"
community: "SessionManager"
location: "L24"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SessionManager
---

# A decorator that implements the singleton pattern for a class.

## Connections
- [[BaseTelemetryEvent]] - `uses` [INFERRED]
- [[MCPAgentExecutionEvent]] - `uses` [INFERRED]
- [[singleton()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/SessionManager