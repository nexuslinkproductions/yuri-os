---
source_file: "01_PROJECTS/openspace/openspace/recording/manager.py"
type: "rationale"
community: "TrajectoryRecorder"
location: "L648"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/TrajectoryRecorder
---

# Register LLM client: wrap complete() to record tool results (Path B, aligned wit

## Connections
- [[.register_to_llm()]] - `rationale_for` [EXTRACTED]
- [[ActionRecorder]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[TrajectoryRecorder]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/TrajectoryRecorder