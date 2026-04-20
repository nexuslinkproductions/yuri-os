---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/gui/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L1"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Local GUI Connector — execute GUI operations directly in-process.  This connecto

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]
- [[local_connector.py]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger