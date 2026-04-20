---
source_file: "01_PROJECTS/openspace/openspace/tool_layer.py"
type: "code"
community: "OpenSpace"
location: "L78"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/OpenSpace
---

# OpenSpace

## Connections
- [[.__aenter__()]] - `method` [EXTRACTED]
- [[.__aexit__()]] - `method` [EXTRACTED]
- [[.__init__()]] - `method` [EXTRACTED]
- [[.__repr__()]] - `method` [EXTRACTED]
- [[._get_skill_selection_llm()]] - `method` [EXTRACTED]
- [[._init_skill_registry()]] - `method` [EXTRACTED]
- [[._maybe_analyze_execution()]] - `method` [EXTRACTED]
- [[._maybe_evolve_quality()]] - `method` [EXTRACTED]
- [[._select_and_inject_skills()]] - `method` [EXTRACTED]
- [[.cleanup()]] - `method` [EXTRACTED]
- [[.execute()]] - `method` [EXTRACTED]
- [[.get_config()]] - `method` [EXTRACTED]
- [[.initialize()]] - `method` [EXTRACTED]
- [[.is_initialized()]] - `method` [EXTRACTED]
- [[.is_running()]] - `method` [EXTRACTED]
- [[.list_backends()]] - `method` [EXTRACTED]
- [[.list_sessions()]] - `method` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[Build a lightweight SkillRegistry for local-only skill search.      This avoids]] - `uses` [INFERRED]
- [[Build a result record (called after cs.execute finishes).]] - `uses` [INFERRED]
- [[Build per-task comparison and aggregate summary from both phases.      Reports p]] - `uses` [INFERRED]
- [[CommunicationGateway]] - `uses` [INFERRED]
- [[Console-script entry point for ``openspace-mcp``.]] - `uses` [INFERRED]
- [[Copy the current .openspaceopenspace.db to dest.]] - `uses` [INFERRED]
- [[Create a OpenSpaceConfig for one worker.]] - `uses` [INFERRED]
- [[Create command-line argument parser]] - `uses` [INFERRED]
- [[Delete the shared .openspaceopenspace.db for a fresh start.]] - `uses` [INFERRED]
- [[Discover agent-created artifacts in the workspace.      Scans ``workspace_dir``]] - `uses` [INFERRED]
- [[Download a cloud skill and register it locally.]] - `uses` [INFERRED]
- [[Dump all active skills from the SkillStore.]] - `uses` [INFERRED]
- [[Dynamically import sub-modules on first attribute access.      This keeps the i]] - `uses` [INFERRED]
- [[Evaluate agent artifacts using ClawWork's LLMEvaluator.      Fully aligned with]] - `uses` [INFERRED]
- [[Execute a task with OpenSpace's full grounding engine.      OpenSpace will]] - `uses` [INFERRED]
- [[Execute one task on the given OpenSpace instance and persist the result.      In]] - `uses` [INFERRED]
- [[Format an OpenSpace execution result for MCP transport.]] - `uses` [INFERRED]
- [[Get SkillStore — reuses OpenSpace's internal instance when available.]] - `uses` [INFERRED]
- [[Get a OpenSpaceClient instance (raises CloudError if not configured).]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Lazily create and cache a ClawWork-compatible LLMEvaluator.      Uses the same i]] - `uses` [INFERRED]
- [[Lazy-initialise the OpenSpace engine.]] - `uses` [INFERRED]
- [[Load experiment config with sensible defaults.]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Manually fix a broken skill.      This is the only manual evolution entry po]] - `uses` [INFERRED]
- [[OpenSpace MCP Server  Exposes the following tools to MCP clients   execute_task]] - `uses` [INFERRED]
- [[Percentage savings (a - b)  a  100.  Positive = saved.]] - `uses` [INFERRED]
- [[Pre-flight checks API keys, dependencies, data availability.]] - `uses` [INFERRED]
- [[Read upload metadata with three-tier fallback.      Resolution order       1. `]] - `uses` [INFERRED]
- [[Refresh MCP tool cache by starting servers one by one and saving tool metadata.]] - `uses` [INFERRED]
- [[Register bot skill directories into OpenSpace's SkillRegistry + DB.      Called]] - `uses` [INFERRED]
- [[Return set of task_ids already completed (for resume).]] - `uses` [INFERRED]
- [[Run one phase (phase1 or phase2) over all tasks.      Args         concurrency]] - `uses` [INFERRED]
- [[Run one phase sequentially. A single OpenSpace instance is reused     so that sk]] - `uses` [INFERRED]
- [[Run one phase with N concurrent OpenSpace workers.      Trade-offs vs serial]] - `uses` [INFERRED]
- [[Search cloud for skills relevant to task and auto-import top hits.      This i]] - `uses` [INFERRED]
- [[Search skills across local registry and cloud community.      Standalone search]] - `uses` [INFERRED]
- [[SessionRuntime]] - `uses` [INFERRED]
- [[SessionRuntimeManager]] - `uses` [INFERRED]
- [[SkillEvolver]] - `uses` [INFERRED]
- [[Stdout wrapper binary (.buffer) → real stdout, text (.write) → stderr.]] - `uses` [INFERRED]
- [[UIManager]] - `uses` [INFERRED]
- [[Upload a local skill to the cloud.      For evolved skills (from ``execute_task`]] - `uses` [INFERRED]
- [[Write ``.upload_meta.json`` so ``upload_skill`` can read pre-saved metadata.]] - `uses` [INFERRED]
- [[_MCPSafeStdout]] - `uses` [INFERRED]
- [[tool_layer.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/OpenSpace