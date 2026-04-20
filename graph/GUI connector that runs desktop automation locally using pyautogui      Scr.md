---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/gui/transport/local_connector.py"
type: "rationale"
community: "Logger"
location: "L30"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# GUI connector that runs desktop automation **locally** using pyautogui /     Scr

## Connections
- [[BaseConnector]] - `uses` [INFERRED]
- [[LocalGUIConnector]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger