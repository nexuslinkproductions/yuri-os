---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/quality/types.py"
type: "code"
community: "Logger"
location: "L20"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Logger
---

# DescriptionQuality

## Connections
- [[Adjust tool ranking using penalty-based approach.                     Args]] - `uses` [INFERRED]
- [[Check for tool changes (newupdatedunchanged).                  Returns dict {]] - `uses` [INFERRED]
- [[Check if a tool's description should be re-evaluated.                  Triggers]] - `uses` [INFERRED]
- [[Check if evolution should be triggered based on global execution count.]] - `uses` [INFERRED]
- [[Check if local server is available]] - `uses` [INFERRED]
- [[Clear all cached data.]] - `uses` [INFERRED]
- [[Close the database connection.]] - `uses` [INFERRED]
- [[Compute adaptive quality weight based on data confidence.                  Retur]] - `uses` [INFERRED]
- [[Compute hash of tool description for change detection.]] - `uses` [INFERRED]
- [[Delete all quality data.]] - `uses` [INFERRED]
- [[Evaluate tool description quality using LLM.]] - `uses` [INFERRED]
- [[Find a record by exact or partial tool key.          Tries in order           1]] - `uses` [INFERRED]
- [[Generate actionable recommendations based on quality data.]] - `uses` [INFERRED]
- [[Generate comprehensive quality report for upper layer.                  Returns]] - `uses` [INFERRED]
- [[Generate unique key for a tool.]] - `uses` [INFERRED]
- [[Get detailed insights for a specific tool (for debugginganalysis).]] - `uses` [INFERRED]
- [[Get or create a ToolQualityRecord by its canonical key.          Used by Executi]] - `uses` [INFERRED]
- [[Get or create quality record for a tool.]] - `uses` [INFERRED]
- [[Get penalty factor for a tool (0.2-1.0).]] - `uses` [INFERRED]
- [[Get quality score for a tool (0-1).]] - `uses` [INFERRED]
- [[Get quality tracking statistics.                  Note Query API for inspection]] - `uses` [INFERRED]
- [[Get the global quality manager instance.]] - `uses` [INFERRED]
- [[Get tools repeatedly flagged by the analysis LLM.          Useful for identifyin]] - `uses` [INFERRED]
- [[Get tools with low success rate (candidates for reviewremoval).]] - `uses` [INFERRED]
- [[Get top N tools by quality score.                  Args             n Number o]] - `uses` [INFERRED]
- [[LLM-evaluated description quality.]] - `rationale_for` [EXTRACTED]
- [[Load all quality records and global execution count.]] - `uses` [INFERRED]
- [[Manages tool quality tracking and quality-aware ranking.          Features]] - `uses` [INFERRED]
- [[Persist a single record (incremental — much cheaper than save_all).]] - `uses` [INFERRED]
- [[Persist all records (bulk).]] - `uses` [INFERRED]
- [[QualityStore]] - `uses` [INFERRED]
- [[Record LLM-identified tool issues into the quality tracking system.          Eac]] - `uses` [INFERRED]
- [[Record tool execution result and increment global counter.]] - `uses` [INFERRED]
- [[Run self-evolution cycle on given tools.                  This method         1]] - `uses` [INFERRED]
- [[SQLite-backed persistence for tool quality data.      By default uses the same `]] - `uses` [INFERRED]
- [[Set the global quality manager instance.]] - `uses` [INFERRED]
- [[Storage location project_root.openspaceopenspace.db Tables   skill_records]] - `uses` [INFERRED]
- [[Synchronous full save (used by async wrapper and migration).]] - `uses` [INFERRED]
- [[Tool Quality Manager  Core API (called by main flow) - record_execution() Call]] - `uses` [INFERRED]
- [[ToolQualityManager]] - `uses` [INFERRED]
- [[Upsert one tool_quality_records row + its execution history.          Caller MUS]] - `uses` [INFERRED]
- [[types.ts]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/Logger