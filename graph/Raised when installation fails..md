---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/installer.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L31"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/MCPInstallerManager
---

# Raised when installation fails.

## Connections
- [[Logger]] - `uses` [INFERRED]
- [[MCPInstallationFailedError]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/EXTRACTED #community/MCPInstallerManager