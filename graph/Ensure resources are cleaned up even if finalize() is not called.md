---
source_file: "01_PROJECTS/openspace/openspace/recording/recorder.py"
type: "rationale"
community: "TrajectoryRecorder"
location: "L266"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/TrajectoryRecorder
---

# Ensure resources are cleaned up even if finalize() is not called

## Connections
- [[.__del__()]] - `rationale_for` [EXTRACTED]
- [[Logger]] - `uses` [INFERRED]
- [[VideoRecorder]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/TrajectoryRecorder