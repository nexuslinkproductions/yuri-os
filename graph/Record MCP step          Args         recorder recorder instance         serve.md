---
source_file: "01_PROJECTS/openspace/openspace/recording/recorder.py"
type: "rationale"
community: "TrajectoryRecorder"
location: "L370"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/TrajectoryRecorder
---

# Record MCP step          Args:         recorder: recorder instance         serve

## Connections
- [[Logger]] - `uses` [INFERRED]
- [[VideoRecorder]] - `uses` [INFERRED]
- [[record_mcp_step()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/TrajectoryRecorder