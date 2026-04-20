---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/shell/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L33"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Generate platform-specific conda activation prefix.

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]
- [[_get_conda_activation_prefix()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger