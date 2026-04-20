---
source_file: "01_PROJECTS/openspace/openspace/recording/manager.py"
type: "rationale"
community: "TrajectoryRecorder"
location: "L931"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/TrajectoryRecorder
---

# Save agent plan to recording directory.         This integrates planning informa

## Connections
- [[.save_plan()]] - `rationale_for` [EXTRACTED]
- [[ActionRecorder]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[TrajectoryRecorder]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/TrajectoryRecorder