---
source_file: "01_PROJECTS/openspace/openspace/cloud/client.py"
type: "code"
community: "EvolutionSuggestion"
location: "L49"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/EvolutionSuggestion
---

# OpenSpaceClient

## Connections
- [[.__init__()_99]] - `method` [EXTRACTED]
- [[._compute_content_diff()]] - `method` [EXTRACTED]
- [[._get_json()]] - `method` [EXTRACTED]
- [[._handle_409()]] - `method` [EXTRACTED]
- [[._request()_1]] - `method` [EXTRACTED]
- [[.create_record()]] - `method` [EXTRACTED]
- [[.download_artifact()]] - `method` [EXTRACTED]
- [[.fetch_metadata()]] - `method` [EXTRACTED]
- [[.fetch_record()]] - `method` [EXTRACTED]
- [[.import_skill()]] - `method` [EXTRACTED]
- [[.search_record_embeddings()]] - `method` [EXTRACTED]
- [[.stage_artifact()]] - `method` [EXTRACTED]
- [[.upload_skill()]] - `method` [EXTRACTED]
- [[BM25 rough-rank to keep top candidates for embedding stage.]] - `uses` [INFERRED]
- [[Build a lightweight SkillRegistry for local-only skill search.      This avoids]] - `uses` [INFERRED]
- [[Build search candidate dicts from SkillRegistry skills.      Args         skill]] - `uses` [INFERRED]
- [[Build search candidate dicts from cloud metadatasearch items.      Args]] - `uses` [INFERRED]
- [[Compute hybrid score = vector_score + lexical_boost.]] - `uses` [INFERRED]
- [[Compute lexical boost score based on exactprefix token matching.]] - `uses` [INFERRED]
- [[Console-script entry point for ``openspace-mcp``.]] - `uses` [INFERRED]
- [[Deduplicate by name and apply limit.]] - `uses` [INFERRED]
- [[Download a cloud skill and register it locally.]] - `uses` [INFERRED]
- [[Execute a task with OpenSpace's full grounding engine.      OpenSpace will]] - `uses` [INFERRED]
- [[Format an OpenSpace execution result for MCP transport.]] - `uses` [INFERRED]
- [[Get SkillStore — reuses OpenSpace's internal instance when available.]] - `uses` [INFERRED]
- [[Get a OpenSpaceClient instance (raises CloudError if not configured).]] - `uses` [INFERRED]
- [[HTTP client for the OpenSpace cloud API.      Args         auth_headers Pre-re]] - `rationale_for` [EXTRACTED]
- [[Host-agent config auto-detection.  Public API consumed by other OpenSpace subsys]] - `uses` [INFERRED]
- [[Hybrid BM25 + embedding search engine for skills.      Usage          engine =]] - `uses` [INFERRED]
- [[Hybrid skill search engine (BM25 + embedding + lexical boost).  Implements the s]] - `uses` [INFERRED]
- [[Lazy wrapper — avoids importing skill_engine at module load time.]] - `uses` [INFERRED]
- [[Lazy-initialise the OpenSpace engine.]] - `uses` [INFERRED]
- [[Manually fix a broken skill.      This is the only manual evolution entry po]] - `uses` [INFERRED]
- [[Map server-ranked cloud search rows to MCP search result shape.]] - `uses` [INFERRED]
- [[OpenSpace MCP Server  Exposes the following tools to MCP clients   execute_task]] - `uses` [INFERRED]
- [[Read upload metadata with three-tier fallback.      Resolution order       1. `]] - `uses` [INFERRED]
- [[Register bot skill directories into OpenSpace's SkillRegistry + DB.      Called]] - `uses` [INFERRED]
- [[Run the full search pipeline on candidates.          Each candidate dict should]] - `uses` [INFERRED]
- [[Search cloud for skills relevant to task and auto-import top hits.      This i]] - `uses` [INFERRED]
- [[Search skills across local registry and cloud community.      Standalone search]] - `uses` [INFERRED]
- [[Shared cloud+local skill search with graceful fallback.      Builds candidates,]] - `uses` [INFERRED]
- [[SkillSearchEngine]] - `uses` [INFERRED]
- [[Stdout wrapper binary (.buffer) → real stdout, text (.write) → stderr.]] - `uses` [INFERRED]
- [[Upload a local skill to the cloud.      For evolved skills (from ``execute_task`]] - `uses` [INFERRED]
- [[Write ``.upload_meta.json`` so ``upload_skill`` can read pre-saved metadata.]] - `uses` [INFERRED]
- [[_MCPSafeStdout]] - `uses` [INFERRED]
- [[client.ts]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/EvolutionSuggestion