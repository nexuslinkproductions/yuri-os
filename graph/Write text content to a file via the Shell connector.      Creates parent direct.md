---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/session.py"
type: "rationale"
community: "Logger"
location: "L177"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Write text content to a file via the Shell connector.      Creates parent direct

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[LocalShellConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[ShellConnector]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[WriteFileTool]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger