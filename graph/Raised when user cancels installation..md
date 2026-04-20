---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/installer.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L26"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/MCPInstallerManager
---

# Raised when user cancels installation.

## Connections
- [[Logger]] - `uses` [INFERRED]
- [[MCPInstallationCancelledError]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/EXTRACTED #community/MCPInstallerManager