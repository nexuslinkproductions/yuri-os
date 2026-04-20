---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/session.py"
type: "rationale"
community: "Logger"
location: "L18"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Parse a connector result dict into ``(stdout, stderr, returncode)``.

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[LocalShellConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[ShellConnector]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[_parse_shell_result()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger