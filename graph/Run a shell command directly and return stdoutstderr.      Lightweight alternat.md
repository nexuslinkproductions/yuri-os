---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/session.py"
type: "rationale"
community: "Logger"
location: "L264"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Run a shell command directly and return stdout/stderr.      Lightweight alternat

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[LocalShellConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[RunShellTool]] - `rationale_for` [EXTRACTED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[ShellConnector]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger