---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/installer.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L327"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/MCPInstallerManager
---

# Check if a Python package is installed via uv pip.                  Args:

## Connections
- [[._check_uv_pip_package()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]

#graphify/rationale #graphify/EXTRACTED #community/MCPInstallerManager