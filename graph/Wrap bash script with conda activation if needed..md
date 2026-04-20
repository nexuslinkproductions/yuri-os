---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L62"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Wrap bash script with conda activation if needed.

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]
- [[_wrap_script_with_conda()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger