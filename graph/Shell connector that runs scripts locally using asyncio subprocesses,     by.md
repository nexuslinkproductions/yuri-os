---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L98"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Shell connector that runs scripts **locally** using asyncio subprocesses,     by

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[LocalShellConnector]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger