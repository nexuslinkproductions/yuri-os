---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L257"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Execute a Python script locally.          Return format matches the server's ``/

## Connections
- [[.run_python_script()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger