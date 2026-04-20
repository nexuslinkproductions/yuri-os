---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/installer.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L118"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/MCPInstallerManager
---

# Check if the package is installed.                  Args:             command: T

## Connections
- [[._check_package_installed()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/MCPInstallerManager