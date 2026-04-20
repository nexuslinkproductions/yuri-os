---
source_file: "01_PROJECTS/openspace/openspace/dashboard_server.py"
type: "rationale"
community: "dashboard_server.py"
location: "L319"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/dashboard_server.py
---

# Strip tzinfo so naive/aware datetimes can be compared safely.

## Connections
- [[SkillRecord]] - `uses` [INFERRED]
- [[_naive_dt()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/EXTRACTED #community/dashboard_server.py