---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/installer.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L21"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/MCPInstallerManager
---

# Raised when a required command is not available.

## Connections
- [[Logger]] - `uses` [INFERRED]
- [[MCPCommandNotFoundError]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/EXTRACTED #community/MCPInstallerManager