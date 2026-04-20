---
type: community
cohesion: 0.04
members: 108
---

# SkillRanker

**Cohesion:** 0.04 - loosely connected
**Members:** 108 nodes

## Members
- [[.__init__()_75]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[._bm25_phase()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[._bm25_rank()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[._cache_file()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[._embedding_rank()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[._ensure_discovered()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[._load_cache()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[._prefilter_skills()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[._save_cache()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[._score_phase()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[.add_skill()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.bm25_only()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[.build_context_injection()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.clear_cache()_3]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[.discover()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.discover_from_dirs()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.embedding_only()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[.get_or_compute_embedding()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[.get_skill()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.get_skill_by_name()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.hybrid_rank()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[.invalidate_cache()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[.list_skills()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.load_skill_content()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.register_skill_dir()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.search()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[.select_skills_with_llm()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[.update_skill()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[BM25 rough-rank to keep top candidates for embedding stage.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[BM25 rough-rank → embedding re-rank → return top_k.          Falls back graceful]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[BM25-only ranking (for MCP search Phase 1).]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Build a prompt fragment with the full content of skills.          Injected as]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Build search candidate dicts from SkillRegistry skills.      Args         skill]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Build search candidate dicts from cloud metadatasearch items.      Args]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Build text for skill embedding ``name + description + SKILL.md body``.      Uni]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Build the prompt for LLM skill selection.          Uses a plan-then-select patte]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Clear all cached embeddings.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Compute cosine similarity between two vectors.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Compute hybrid score = vector_score + lexical_boost.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Compute lexical boost score based on exactprefix token matching.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Deduplicate by name and apply limit.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Discover skills from additional directories and add to the registry.          Un]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Discover, load, select, and inject skills into agent context.      Args]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Embedding-only ranking.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Get a skill by ``name`` (first match).  Use ``get_skill`` when possible.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Get a skill by ``skill_id``.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Get embedding from cache or compute it.          Returns None if embedding canno]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Hybrid BM25 + embedding ranker for skills.      Usage          ranker = SkillR]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Hybrid BM25 + embedding search engine for skills.      Usage          engine =]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Hybrid skill search engine (BM25 + embedding + lexical boost).  Implements the s]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Lazy wrapper — avoids importing skill_engine at module load time.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Lazy-initialised class`SkillRanker` for hybrid pre-filtering.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Lightweight skill representation for ranking.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[List all discovered skills.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Load embedding cache from disk.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Map server-ranked cloud search rows to MCP search result shape.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Metadata for a discovered skill.      ``skill_id`` is the globally unique identi]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Narrow the candidate set using BM25 + embedding hybrid ranking.          Keeps a]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Parse a SKILL.md file into a SkillMeta.          Only ``name`` and ``description]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Parse the LLM response and extract selected skill IDs + plan.          Returns]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Persist embedding cache to disk.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Rank candidates using BM25.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Rank candidates using embedding cosine similarity.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Read ``skill_id`` from ``.skill_id`` sidecar, or create one.      The sidecar fi]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Register a newly-created skill (DERIVED  CAPTURED).          Does NOT overwrite]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Register a single skill directory (hot-reload).          Safety applies ``check]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Remove a skill's cached embedding (e.g. after evolution).]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[Replace a skill entry after FIX evolution.          Removes old_skill_id from]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Return the SKILL.md content (with frontmatter stripped) for skill_id.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Run the full search pipeline on candidates.          Each candidate dict should]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Scan all skill_dirs and populate the registry.          Each skill is a sub-dire]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Search.ts]] - code - 01_PROJECTS/claude-mem/src/services/worker/Search.ts
- [[Shared cloud+local skill search with graceful fallback.      Builds candidates,]] - rationale - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[SkillCandidate]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[SkillRanker]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[SkillRanker — BM25 + embedding hybrid ranking for skills.  Provides a two-stage]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[SkillRegistry — discover, load, match, and inject skills.  Skills follow the off]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[SkillSearchEngine]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[Use an LLM to select the most relevant skills.          When the local registry]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[Write (or overwrite) the ``.skill_id`` sidecar in skill_dir.      Called by ``]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[_build_embedding_text()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[_build_skill_selection_prompt()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[_check_safety()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[_cosine_similarity()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[_dedup_and_limit()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[_generate_embedding()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[_get_openai_api_key()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[_is_safe()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[_lexical_boost()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[_parse_skill()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[_parse_skill_selection_response()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[_read_or_create_skill_id()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[_tokenize()_2]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[_tokenize()_1]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[build_cloud_candidates()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[build_cloud_results()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[build_local_candidates()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[build_skill_embedding_text()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[countSymbols()]] - code - 01_PROJECTS/claude-mem/src/services/smart-file-read/search.ts
- [[formatSearchResults()]] - code - 01_PROJECTS/claude-mem/src/services/smart-file-read/search.ts
- [[hybrid_search_skills()]] - code - 01_PROJECTS/openspace/openspace/cloud/search.py
- [[matchScore()]] - code - 01_PROJECTS/claude-mem/src/services/smart-file-read/search.ts
- [[ranker()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[registry.py]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py
- [[safeReadFile()]] - code - 01_PROJECTS/claude-mem/src/services/smart-file-read/search.ts
- [[searchCodebase()]] - code - 01_PROJECTS/claude-mem/src/services/smart-file-read/search.ts
- [[skill_ranker.py]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_ranker.py
- [[write_skill_id()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/registry.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SkillRanker
SORT file.name ASC
```

## Connections to other communities
- 38 edges to [[_COMMUNITY_Logger]]
- 37 edges to [[_COMMUNITY_EvolutionSuggestion]]
- 1 edge to [[_COMMUNITY_MCPInstallerManager]]
- 1 edge to [[_COMMUNITY_patch.py]]
- 1 edge to [[_COMMUNITY_logging.py]]

## Top bridge nodes
- [[SkillRanker]] - degree 51, connects to 2 communities
- [[SkillCandidate]] - degree 39, connects to 2 communities
- [[registry.py]] - degree 13, connects to 2 communities
- [[SkillSearchEngine]] - degree 10, connects to 2 communities
- [[Discover, load, select, and inject skills into agent context.      Args]] - degree 4, connects to 2 communities