---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/session.py"
type: "rationale"
community: "Logger"
location: "L229"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# List directory contents via the Shell connector.

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[ListDirTool]] - `rationale_for` [EXTRACTED]
- [[LocalShellConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[ShellConnector]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger