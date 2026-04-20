---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/connectors/http.py"
type: "rationale"
community: "MCPBaseConnector"
location: "L34"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPBaseConnector
---

# Try the common FastMCP `/sse` endpoint before the raw base URL.

## Connections
- [[BaseConnectionManager]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[MCPBaseConnector_1]] - `uses` [INFERRED]
- [[_build_sse_candidate_urls()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/MCPBaseConnector