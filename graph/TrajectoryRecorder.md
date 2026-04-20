---
source_file: "01_PROJECTS/openspace/openspace/recording/recorder.py"
type: "code"
community: "TrajectoryRecorder"
location: "L11"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/TrajectoryRecorder
---

# TrajectoryRecorder

## Connections
- [[.__aenter__()_8]] - `method` [EXTRACTED]
- [[.__aexit__()_8]] - `method` [EXTRACTED]
- [[.__del__()]] - `method` [EXTRACTED]
- [[.__init__()_80]] - `method` [EXTRACTED]
- [[._append_to_traj_file()]] - `method` [EXTRACTED]
- [[._capture_screenshot()]] - `method` [EXTRACTED]
- [[._cleanup_screenshot_client()]] - `method` [EXTRACTED]
- [[._save_metadata()]] - `method` [EXTRACTED]
- [[.add_metadata()_1]] - `method` [EXTRACTED]
- [[.finalize()]] - `method` [EXTRACTED]
- [[.get_trajectory_dir()]] - `method` [EXTRACTED]
- [[.record_step()]] - `method` [EXTRACTED]
- [[.save_init_screenshot()]] - `method` [EXTRACTED]
- [[.start_video_recording()]] - `method` [EXTRACTED]
- [[.stop_video_recording()]] - `method` [EXTRACTED]
- [[Check if local server is available]] - `uses` [INFERRED]
- [[Check if there is an active recording session                  Returns]] - `uses` [INFERRED]
- [[Generate a comprehensive summary of the recording session.]] - `uses` [INFERRED]
- [[Get current step count]] - `uses` [INFERRED]
- [[Infer backend from tool name when tool_results lack backend.]] - `uses` [INFERRED]
- [[Initialize automatic recording manager                  Args             enable]] - `uses` [INFERRED]
- [[Log agent decision with optional context.         This provides insight into age]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Persist task-level execution outcome into metadata.json.          Should be call]] - `uses` [INFERRED]
- [[Record a single iteration's delta messages to conversations.jsonl.          Only]] - `uses` [INFERRED]
- [[Record an agent's action and decision-making process.                  Args]] - `uses` [INFERRED]
- [[Record initial conversation context to conversations.jsonl (called once before i]] - `uses` [INFERRED]
- [[Record skill selection decision to metadata.json.                  This captures]] - `uses` [INFERRED]
- [[Record the tools retrieved for a task                  Args             task_in]] - `uses` [INFERRED]
- [[RecordingManager]] - `uses` [INFERRED]
- [[Register LLM client wrap complete() to record tool results (Path B, aligned wit]] - `uses` [INFERRED]
- [[Safely parse tool_call.function.arguments which may be JSON string.          Han]] - `uses` [INFERRED]
- [[Save agent plan to recording directory.         This integrates planning informa]] - `uses` [INFERRED]
- [[Start automatic recording         Args             task_id If provided, overri]] - `uses` [INFERRED]
- [[Stop automatic recording]] - `uses` [INFERRED]
- [[Truncate message content to avoid huge log files.]] - `uses` [INFERRED]
- [[VideoRecorder]] - `uses` [INFERRED]
- [[recorder.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/TrajectoryRecorder