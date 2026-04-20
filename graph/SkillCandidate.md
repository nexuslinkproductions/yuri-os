---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py"
type: "code"
community: "SkillRanker"
location: "L51"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/SkillRanker
---

# SkillCandidate

## Connections
- [[BM25 rough-rank to keep top candidates for embedding stage.]] - `uses` [INFERRED]
- [[Build a prompt fragment with the full content of skills.          Injected as]] - `uses` [INFERRED]
- [[Build search candidate dicts from SkillRegistry skills.      Args         skill]] - `uses` [INFERRED]
- [[Build search candidate dicts from cloud metadatasearch items.      Args]] - `uses` [INFERRED]
- [[Build the prompt for LLM skill selection.          Uses a plan-then-select patte]] - `uses` [INFERRED]
- [[Compute hybrid score = vector_score + lexical_boost.]] - `uses` [INFERRED]
- [[Compute lexical boost score based on exactprefix token matching.]] - `uses` [INFERRED]
- [[Deduplicate by name and apply limit.]] - `uses` [INFERRED]
- [[Discover skills from additional directories and add to the registry.          Un]] - `uses` [INFERRED]
- [[Discover, load, select, and inject skills into agent context.      Args]] - `uses` [INFERRED]
- [[Get a skill by ``name`` (first match).  Use ``get_skill`` when possible.]] - `uses` [INFERRED]
- [[Get a skill by ``skill_id``.]] - `uses` [INFERRED]
- [[Hybrid BM25 + embedding search engine for skills.      Usage          engine =]] - `uses` [INFERRED]
- [[Hybrid skill search engine (BM25 + embedding + lexical boost).  Implements the s]] - `uses` [INFERRED]
- [[Lazy wrapper — avoids importing skill_engine at module load time.]] - `uses` [INFERRED]
- [[Lazy-initialised class`SkillRanker` for hybrid pre-filtering.]] - `uses` [INFERRED]
- [[Lightweight skill representation for ranking.]] - `rationale_for` [EXTRACTED]
- [[List all discovered skills.]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Map server-ranked cloud search rows to MCP search result shape.]] - `uses` [INFERRED]
- [[Metadata for a discovered skill.      ``skill_id`` is the globally unique identi]] - `uses` [INFERRED]
- [[Narrow the candidate set using BM25 + embedding hybrid ranking.          Keeps a]] - `uses` [INFERRED]
- [[Parse a SKILL.md file into a SkillMeta.          Only ``name`` and ``description]] - `uses` [INFERRED]
- [[Parse the LLM response and extract selected skill IDs + plan.          Returns]] - `uses` [INFERRED]
- [[Read ``skill_id`` from ``.skill_id`` sidecar, or create one.      The sidecar fi]] - `uses` [INFERRED]
- [[Register a newly-created skill (DERIVED  CAPTURED).          Does NOT overwrite]] - `uses` [INFERRED]
- [[Register a single skill directory (hot-reload).          Safety applies ``check]] - `uses` [INFERRED]
- [[Replace a skill entry after FIX evolution.          Removes old_skill_id from]] - `uses` [INFERRED]
- [[Return the SKILL.md content (with frontmatter stripped) for skill_id.]] - `uses` [INFERRED]
- [[Run the full search pipeline on candidates.          Each candidate dict should]] - `uses` [INFERRED]
- [[Scan all skill_dirs and populate the registry.          Each skill is a sub-dire]] - `uses` [INFERRED]
- [[Shared cloud+local skill search with graceful fallback.      Builds candidates,]] - `uses` [INFERRED]
- [[SkillMeta]] - `uses` [INFERRED]
- [[SkillRegistry]] - `uses` [INFERRED]
- [[SkillRegistry — discover, load, match, and inject skills.  Skills follow the off]] - `uses` [INFERRED]
- [[SkillSearchEngine]] - `uses` [INFERRED]
- [[Use an LLM to select the most relevant skills.          When the local registry]] - `uses` [INFERRED]
- [[Write (or overwrite) the ``.skill_id`` sidecar in skill_dir.      Called by ``]] - `uses` [INFERRED]
- [[skill_ranker.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/SkillRanker