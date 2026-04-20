---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/client.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L296"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPInstallerManager
---

# Create sessions for all configured servers.          Args:             auto_init

## Connections
- [[.create_all_sessions()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[MCPDependencyError]] - `uses` [INFERRED]
- [[MCPInstallerManager]] - `uses` [INFERRED]
- [[MCPSession]] - `uses` [INFERRED]
- [[SandboxOptions]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/MCPInstallerManager