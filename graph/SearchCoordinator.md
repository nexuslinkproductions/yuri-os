---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/search_tools.py"
type: "code"
community: "Logger"
location: "L553"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Logger
---

# SearchCoordinator

## Connections
- [[.__init__()_11]] - `method` [EXTRACTED]
- [[._arun()_1]] - `method` [EXTRACTED]
- [[._generate_search_query()]] - `method` [EXTRACTED]
- [[._llm_filter_with_planning()]] - `method` [EXTRACTED]
- [[._log_search_results()]] - `method` [EXTRACTED]
- [[._populate_selected_tools()]] - `method` [EXTRACTED]
- [[._record_tool_scores()]] - `method` [EXTRACTED]
- [[._run()]] - `method` [EXTRACTED]
- [[.clear_embedding_cache()]] - `method` [EXTRACTED]
- [[.get_embedding_cache_stats()]] - `method` [EXTRACTED]
- [[.get_last_search_debug_info()]] - `method` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseTool]] - `inherits` [EXTRACTED]
- [[BaseTool_1]] - `uses` [INFERRED]
- [[Based on GroundingConfig.enabled_backends, register Provider instances to]] - `uses` [INFERRED]
- [[Fetch tools from provider.                  Args             backend Backend t]] - `uses` [INFERRED]
- [[Get comprehensive tool quality report.]] - `uses` [INFERRED]
- [[Get debug info from the last tool search operation.                  Returns]] - `uses` [INFERRED]
- [[Get detailed quality insights for a specific tool.]] - `uses` [INFERRED]
- [[Get session monitoring info]] - `uses` [INFERRED]
- [[Get the recording manager.]] - `uses` [INFERRED]
- [[Get the tool quality manager.]] - `uses` [INFERRED]
- [[Global Entry, Facing AgentApplication, only concerned with Provider & Session]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Initialize tool quality manager based on config.]] - `uses` [INFERRED]
- [[Intelligent tool retrieval automatically decides whether to return all tools or]] - `uses` [INFERRED]
- [[List static tools for every registered backend.]] - `uses` [INFERRED]
- [[List tools from backend(s) or session.                  1. session_name is provi]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Register SystemProvider separately because it requires GroundingClient instance.]] - `uses` [INFERRED]
- [[Run quality self-evolution cycle.                  This triggers         - Tool]] - `uses` [INFERRED]
- [[Search tools from backend(s) or session.                  Args             task]] - `uses` [INFERRED]
- [[Set or update the recording manager.         This allows coordinator to inject r]] - `uses` [INFERRED]
- [[Universal tool invocation method.         Supports multiple calling patterns]] - `uses` [INFERRED]
- [[search_tools.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/Logger