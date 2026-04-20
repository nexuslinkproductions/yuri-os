---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L199"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Run a shell command string (used for conda-wrapped scripts).

## Connections
- [[._run_shell_command()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger