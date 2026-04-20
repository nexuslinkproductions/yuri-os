---
source_file: "01_PROJECTS/openspace/openspace/utils/telemetry/telemetry.py"
type: "rationale"
community: "SessionManager"
location: "L35"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SessionManager
---

# Decorator that skips function execution if telemetry is disabled

## Connections
- [[BaseTelemetryEvent]] - `uses` [INFERRED]
- [[MCPAgentExecutionEvent]] - `uses` [INFERRED]
- [[requires_telemetry()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/SessionManager