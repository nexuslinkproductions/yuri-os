---
source_file: "01_PROJECTS/openspace/openspace/local_server/platform_adapters/linux_adapter.py"
type: "rationale"
community: "LinuxAdapter"
location: "L99"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/LinuxAdapter
---

# Close window (Linux uses wmctrl)                  Args:             window_name:

## Connections
- [[.close_window()_1]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[Xcursor]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/LinuxAdapter