---
source_file: "01_PROJECTS/openspace/openspace/recording/manager.py"
type: "rationale"
community: "TrajectoryRecorder"
location: "L562"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/TrajectoryRecorder
---

# Persist task-level execution outcome into metadata.json.          Should be call

## Connections
- [[.save_execution_outcome()]] - `rationale_for` [EXTRACTED]
- [[ActionRecorder]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[TrajectoryRecorder]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/TrajectoryRecorder