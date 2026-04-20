---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/provider.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L24"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPInstallerManager
---

# MCP Provider manages multiple MCP server sessions.          Each MCP server defi

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[MCPClient]] - `uses` [INFERRED]
- [[MCPDependencyError]] - `uses` [INFERRED]
- [[MCPInstallerManager]] - `uses` [INFERRED]
- [[MCPProvider]] - `rationale_for` [EXTRACTED]
- [[MCPSession]] - `uses` [INFERRED]
- [[Provider]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[ToolSchema]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/MCPInstallerManager