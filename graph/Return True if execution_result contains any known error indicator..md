---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/session.py"
type: "rationale"
community: "Logger"
location: "L677"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Return True if *execution_result* contains any known error indicator.

## Connections
- [[._has_execution_error()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[LocalShellConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[ShellConnector]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger