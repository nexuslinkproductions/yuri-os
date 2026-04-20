---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/client.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L388"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPInstallerManager
---

# Close all active sessions.          This method ensures all sessions are closed

## Connections
- [[.close_all_sessions()_2]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[MCPDependencyError]] - `uses` [INFERRED]
- [[MCPInstallerManager]] - `uses` [INFERRED]
- [[MCPSession]] - `uses` [INFERRED]
- [[SandboxOptions]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/MCPInstallerManager