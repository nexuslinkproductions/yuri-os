---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/gui/provider.py"
type: "rationale"
community: "Logger"
location: "L17"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Provider for GUI desktop environment.     Manages communication with desktop_env

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[GUIConnector]] - `uses` [INFERRED]
- [[GUIProvider]] - `rationale_for` [EXTRACTED]
- [[GUISession]] - `uses` [INFERRED]
- [[LocalGUIConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Provider]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger