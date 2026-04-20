---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/types.py"
type: "code"
community: "EvolutionSuggestion"
location: "L19"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/EvolutionSuggestion
---

# SkillVisibility

## Connections
- [[Aggregate statistics across skills.]] - `uses` [INFERRED]
- [[Atomic evolution insert new version + deactivate old version.          FIXED]] - `uses` [INFERRED]
- [[Atomic observation insert analysis + judgments + increment counters.          1]] - `uses` [INFERRED]
- [[Atomic insert new version + deactivate parents (for FIXED).]] - `uses` [INFERRED]
- [[Batch upsert in a single transaction.]] - `uses` [INFERRED]
- [[Build a JSON-friendly tree rooted at skill_id (downward).]] - `uses` [INFERRED]
- [[Close the persistent connection. Subsequent ops will raise.          Performs a]] - `uses` [INFERRED]
- [[Cloud visibility of a skill. (`Group` is managed by the cloud platform)]] - `rationale_for` [EXTRACTED]
- [[Compact the database file.]] - `uses` [INFERRED]
- [[Create a tuned SQLite connection.          Write connection ``check_same_thread]] - `uses` [INFERRED]
- [[Create tables if they don't exist (idempotent via IF NOT EXISTS).]] - `uses` [INFERRED]
- [[Delete a skill and all related data (CASCADE).]] - `uses` [INFERRED]
- [[Delete all data (keeps schema).]] - `uses` [INFERRED]
- [[Deserialize a skill_records row + related rows → SkillRecord.]] - `uses` [INFERRED]
- [[Deserialize an execution_analyses row + judgments → ExecutionAnalysis.]] - `uses` [INFERRED]
- [[Ensure every discovered skill has an initial DB record.          For each skill]] - `uses` [INFERRED]
- [[Enum]] - `inherits` [EXTRACTED]
- [[Find skill_ids derived from the given parent.]] - `uses` [INFERRED]
- [[Insert an execution_analyses row + its skill_judgments.          Called within a]] - `uses` [INFERRED]
- [[Insert or update skill_records + sync related rows.          Called within a tra]] - `uses` [INFERRED]
- [[Lightweight summary of skills (no analysesdeps loaded).          Default filter]] - `uses` [INFERRED]
- [[Load a single class`SkillRecord` by id.]] - `uses` [INFERRED]
- [[Load all versions of a named skill (active + inactive), sorted by generation.]] - `uses` [INFERRED]
- [[Load analyses marked as evolution candidates.]] - `uses` [INFERRED]
- [[Load only active skill records, keyed by ``skill_id``.          Convenience wrap]] - `uses` [INFERRED]
- [[Load recent analyses across all tasks.]] - `uses` [INFERRED]
- [[Load recent analyses.          Args             skill_id True ``skill_id`` (e.]] - `uses` [INFERRED]
- [[Load skill records filtered by category.          Args             active_only]] - `uses` [INFERRED]
- [[Load skill records, keyed by ``skill_id``.          Args             active_onl]] - `uses` [INFERRED]
- [[Load the analysis for a specific task, or None.]] - `uses` [INFERRED]
- [[Load the most recent active SkillRecord whose ``path`` is inside skill_dir.]] - `uses` [INFERRED]
- [[Only returns active records — deactivated (superseded) versions         are excl]] - `uses` [INFERRED]
- [[Open a temporary read-only connection.          WAL mode allows concurrent reade]] - `uses` [INFERRED]
- [[Per-task summary task-level fields + per-skill judgments.          Useful for u]] - `uses` [INFERRED]
- [[Persist an analysis and update skill quality counters.          ``SkillJudgment.]] - `uses` [INFERRED]
- [[Remove stale WALSHM left by unclean shutdown.          If the main DB file is e]] - `uses` [INFERRED]
- [[Retry on transient SQLite errors with exponential backoff.      Catches ``Operat]] - `uses` [INFERRED]
- [[SQLite persistence engine — Skill quality tracking and evolution ledger.      Ar]] - `uses` [INFERRED]
- [[Set a specific record's ``is_active`` to False.]] - `uses` [INFERRED]
- [[Set a specific record's ``is_active`` to True (revert  rollback).]] - `uses` [INFERRED]
- [[Skill count + newest ``last_updated`` for cheap change detection.]] - `uses` [INFERRED]
- [[SkillStore]] - `uses` [INFERRED]
- [[Storage location project_root.openspaceopenspace.db Tables   skill_records]] - `uses` [INFERRED]
- [[Top-N skills ranked by the chosen metric.          Metrics             ``effect]] - `uses` [INFERRED]
- [[Total number of skill records.]] - `uses` [INFERRED]
- [[Upsert a single class`SkillRecord`.]] - `uses` [INFERRED]
- [[Walk up the lineage tree; returns ancestors oldest-first.]] - `uses` [INFERRED]
- [[from_dict()]] - `calls` [EXTRACTED]
- [[str]] - `inherits` [EXTRACTED]
- [[types.ts]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/EvolutionSuggestion