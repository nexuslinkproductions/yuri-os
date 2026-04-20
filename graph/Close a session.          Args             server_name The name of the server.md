---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/client.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L351"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPInstallerManager
---

# Close a session.          Args:             server_name: The name of the server

## Connections
- [[.close_session()_5]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[MCPDependencyError]] - `uses` [INFERRED]
- [[MCPInstallerManager]] - `uses` [INFERRED]
- [[MCPSession]] - `uses` [INFERRED]
- [[SandboxOptions]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/MCPInstallerManager