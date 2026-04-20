---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/provider.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L112"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPInstallerManager
---

# Return all configured MCP server names from MCPClient config.                  R

## Connections
- [[.list_servers()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[MCPClient]] - `uses` [INFERRED]
- [[MCPDependencyError]] - `uses` [INFERRED]
- [[MCPInstallerManager]] - `uses` [INFERRED]
- [[MCPSession]] - `uses` [INFERRED]
- [[Provider]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[ToolSchema]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/MCPInstallerManager