---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/transport/task_managers/aiohttp_connection_manager.py"
type: "rationale"
community: "MCPBaseConnector"
location: "L43"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/MCPBaseConnector
---

# Close the session and then call the parent cleanup.                  Ensures pro

## Connections
- [[._close_connection()_1]] - `rationale_for` [EXTRACTED]
- [[AsyncContextConnectionManager]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/MCPBaseConnector