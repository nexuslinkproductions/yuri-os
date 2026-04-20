---
type: community
cohesion: 0.06
members: 56
---

# client.ts

**Cohesion:** 0.06 - loosely connected
**Members:** 56 nodes

## Members
- [[.__init__()_98]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.__init__()_99]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[._compute_content_diff()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[._get_json()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[._handle_409()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[._request()_1]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.complete()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[.create_record()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.download_artifact()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.fetch_metadata()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.fetch_record()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.import_skill()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.search_record_embeddings()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.stage_artifact()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[.upload_skill()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[CloudError]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[Compute content_diff for the upload.          - public + single parent → diff vs]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[Download a cloud skill and extract to a local directory.          Returns a resu]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[Execute HTTP request.  Returns ``(status_code, response_body)``.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[GET recordsmetadata — fetch all visible records with pagination.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[GET records{record_id} — fetch record metadata.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[GET records{record_id}download — download artifact zip bytes.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[Handle 409 conflict responses.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[POST artifactsstage — upload skill files.          Returns ``(artifact_id, fil]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[POST records — create skill record with 409 conflict handling.          Returns]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[POST recordsembeddingssearch — fetch server-ranked embedding rows.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[Raised when a cloud API call fails.]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[Upload a local skill to the cloud (stage → diff → create record).          Retur]] - rationale - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_collect_files()_1]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_collect_text_files()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_execute_tool_call()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_extract_zip()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_extract_zip_text_files()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_infer_backend_from_tool_name()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_is_minimax_model()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_merge_consecutive_system_messages()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_normalize_messages_for_model()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_normalize_record_payload()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_normalize_visibility_value()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_prepare_tools_for_llmclient()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_resolve_tool_call_target()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_rewrite_nonleading_system_messages_for_minimax()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_sanitize_schema()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_schema_to_openai()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_serialize_response_field()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_summarize_tool_result()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_tool_result_to_message_async()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[_unified_diff()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[_validate_origin_parents()]] - code - 01_PROJECTS/openspace/openspace/cloud/client.py
- [[client.ts]] - code - 01_PROJECTS/openspace/frontend/src/api/client.ts
- [[format_messages_to_text()]] - code - 01_PROJECTS/openspace/openspace/llm/client.py
- [[from_config_file()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/client.py
- [[from_dict()_1]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/client.py
- [[overview.ts]] - code - 01_PROJECTS/openspace/frontend/src/api/overview.ts
- [[skills.ts]] - code - 01_PROJECTS/openspace/frontend/src/api/skills.ts
- [[workflows.ts]] - code - 01_PROJECTS/openspace/frontend/src/api/workflows.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/client.ts
SORT file.name ASC
```

## Connections to other communities
- 14 edges to [[_COMMUNITY_Logger]]
- 14 edges to [[_COMMUNITY_EvolutionSuggestion]]
- 4 edges to [[_COMMUNITY_types.ts]]
- 3 edges to [[_COMMUNITY_MCPInstallerManager]]
- 2 edges to [[_COMMUNITY_MCPBaseConnector]]
- 1 edge to [[_COMMUNITY___main__.py]]
- 1 edge to [[_COMMUNITY_config.ts]]
- 1 edge to [[_COMMUNITY_logging.py]]

## Top bridge nodes
- [[client.ts]] - degree 39, connects to 8 communities
- [[CloudError]] - degree 12, connects to 1 community
- [[.complete()]] - degree 11, connects to 1 community
- [[._request()_1]] - degree 9, connects to 1 community
- [[._compute_content_diff()]] - degree 7, connects to 1 community