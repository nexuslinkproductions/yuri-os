---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/connectors/websocket.py"
type: "rationale"
community: "MCPBaseConnector"
location: "L61"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPBaseConnector
---

# WebSocket doesn't use streams, return None to skip ClientSession creation.

## Connections
- [[._get_streams_from_connection()_1]] - `rationale_for` [EXTRACTED]
- [[BaseConnectionManager]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[MCPBaseConnector_1]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/MCPBaseConnector