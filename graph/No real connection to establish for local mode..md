---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L126"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# No real connection to establish for local mode.

## Connections
- [[.connect()_3]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger