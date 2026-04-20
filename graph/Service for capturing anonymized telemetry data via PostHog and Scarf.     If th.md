---
source_file: "01_PROJECTS/openspace/openspace/utils/telemetry/telemetry.py"
type: "rationale"
community: "SessionManager"
location: "L67"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SessionManager
---

# Service for capturing anonymized telemetry data via PostHog and Scarf.     If th

## Connections
- [[BaseTelemetryEvent]] - `uses` [INFERRED]
- [[MCPAgentExecutionEvent]] - `uses` [INFERRED]
- [[Telemetry]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/SessionManager