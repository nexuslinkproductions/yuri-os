---
source_file: "01_PROJECTS/openspace/openspace/utils/telemetry/telemetry.py"
type: "rationale"
community: "SessionManager"
location: "L47"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/SessionManager
---

# Get platform-appropriate cache directory.

## Connections
- [[BaseTelemetryEvent]] - `uses` [INFERRED]
- [[MCPAgentExecutionEvent]] - `uses` [INFERRED]
- [[get_cache_home()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/SessionManager