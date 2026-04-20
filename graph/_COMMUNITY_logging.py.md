---
type: community
cohesion: 0.03
members: 92
---

# logging.py

**Cohesion:** 0.03 - loosely connected
**Members:** 92 nodes

## Members
- [[.emit()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[.format()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[Build litellm kwargs and resolve model for OpenSpace's LLM client.      Resoluti]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[Build text for skill embedding ``name + description + SKILL.md body``.      Uni_1]] - rationale - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[Check if a provider-native API key (e.g. OPENROUTER_API_KEY) exists.      When T]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[ColoredFormatter]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[Compute cosine similarity between two vectors._1]] - rationale - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[Download a single file from URL to dest path, with retries.      Strategy order]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Download reference files and return the augmented prompt.      First checks the]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Download using curl subprocess — bypasses Python SSL entirely.]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Download using requests library with retry adapter.]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Download using urllib with relaxed SSL context (last resort).]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Download using wget subprocess — bypasses Python SSL entirely.]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Embedding generation via OpenAI-compatible API.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[File handler that flushes after each emit for real-time logging]] - rationale - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[Find parquet file — handles both file path and directory.]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[FlushFileHandler]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[Generate embedding using OpenAI-compatible API.      When api_key is ``None``,]] - rationale - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[Get OpenAI API key for embedding generation.      Resolution       1. ``OPENAI_]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[Infer the provider name from a model string using PROVIDER_REGISTRY.]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[LLM credential and grounding config resolution.  Resolves the model name and lit]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[Load .env files once per process.      Search order (first-loaded wins for each]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[Load GDPVal tasks from the best available source.      Args         clawwork_ro]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Load and parse nanobot config.json.  Returns None on failure.]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[Load from ClawWork task_values.jsonl (summary only, no full prompt).]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Load from GDPVal parquet (has full prompts + reference files).]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Load from example_tasks.jsonl (demo tasks with full prompts).]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Load log_level from config_grounding.json and convert to OPENSPACE_DEBUG value.]] - rationale - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[Match a provider config dict from nanobot's ``providers`` section.      Resoluti]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[Merge pricing data from task_values.jsonl into tasks that lack it.]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Nanobot host-agent config reader.  Reads ``~.nanobotconfig.json`` to auto-dete]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[Pick N tasks per occupation for balanced coverage.      Groups tasks by ``occupa]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Pre-download ALL reference files for all tasks into a local cache.      Call thi]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Public wrapper for one-time runtime .env loading.]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[Read LLM credentials from ``~.nanobotconfig.json``.      Returns litellm kwarg]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[Read ``tools.mcpServers.openspace.env`` from nanobot config.      Returns the en]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[Resolve API key and base URL for embedding requests.      Priority       1. ``O]] - rationale - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[Resolve grounding config inline JSON  file path  None.      Supports]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[Resolve reference file paths relative to GDPVal dataset dir.]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Resolve the nanobot config path from env overrides or defaults.]] - rationale - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[Task Loader — load GDPVal tasks for benchmarking.  Data resolution order   1. G]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[Try to load from HuggingFace datasets library. Returns (tasks, source_desc) or (]] - rationale - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_download_file()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_download_via_curl()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_download_via_requests()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_download_via_urllib()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_download_via_wget()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_enrich_with_pricing()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_ensure_local_no_proxy()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[_find_parquet()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_get_default_log_file()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[_has_provider_native_env()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[_infer_provider_name()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[_load_env_once()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[_load_from_jsonl()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_load_from_parquet()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_load_from_task_values()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_load_log_level_from_config()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[_load_nanobot_config()]] - code - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[_pick_first_env()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[_resolve_level()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[_resolve_nanobot_config_path()]] - code - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[_resolve_references()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_stdout_supports_color()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[_stratified_sample()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_try_huggingface()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[_update_level()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[add_file_handler()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[build_grounding_config_path()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[build_llm_kwargs()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[build_skill_embedding_text()_1]] - code - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[configure()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[cosine_similarity()]] - code - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[embedding.py]] - code - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[generate_embedding()]] - code - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[get_logger()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[get_openai_api_key()]] - code - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[load_runtime_env()]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[load_tasks()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[logging.py]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[match_provider()]] - code - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[nanobot.py]] - code - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[prefetch_reference_files()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[prepare_task_workspace()]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[read_nanobot_mcp_env()]] - code - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py
- [[reset_configuration()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[resolve_embedding_api()]] - code - 01_PROJECTS/openspace/openspace/cloud/embedding.py
- [[resolver.py]] - code - 01_PROJECTS/openspace/openspace/host_detection/resolver.py
- [[set_debug()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[set_level()]] - code - 01_PROJECTS/openspace/openspace/utils/logging.py
- [[task_loader.py]] - code - 01_PROJECTS/openspace/gdpval_bench/task_loader.py
- [[try_read_nanobot_config()]] - code - 01_PROJECTS/openspace/openspace/host_detection/nanobot.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/logging.py
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_MCPBaseConnector]]
- 2 edges to [[_COMMUNITY_Logger]]
- 1 edge to [[_COMMUNITY___main__.py]]
- 1 edge to [[_COMMUNITY_EvolutionSuggestion]]
- 1 edge to [[_COMMUNITY_client.ts]]
- 1 edge to [[_COMMUNITY_SessionManager]]
- 1 edge to [[_COMMUNITY_cli.ts]]
- 1 edge to [[_COMMUNITY_SkillRanker]]
- 1 edge to [[_COMMUNITY_types.ts]]

## Top bridge nodes
- [[logging.py]] - degree 30, connects to 9 communities