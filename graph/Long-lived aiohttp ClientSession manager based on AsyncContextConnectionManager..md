---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/transport/task_managers/aiohttp_connection_manager.py"
type: "rationale"
community: "MCPBaseConnector"
location: "L1"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/MCPBaseConnector
---

# Long-lived aiohttp ClientSession manager based on AsyncContextConnectionManager.

## Connections
- [[AsyncContextConnectionManager]] - `uses` [INFERRED]
- [[aiohttp_connection_manager.py]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/EXTRACTED #community/MCPBaseConnector