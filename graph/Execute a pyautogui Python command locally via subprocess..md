---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/gui/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L228"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Execute a pyautogui Python command locally via subprocess.

## Connections
- [[.execute_python_command()]] - `rationale_for` [EXTRACTED]
- [[BaseConnector]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger