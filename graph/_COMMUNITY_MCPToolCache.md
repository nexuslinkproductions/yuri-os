---
type: community
cohesion: 0.07
members: 39
---

# MCPToolCache

**Cohesion:** 0.07 - loosely connected
**Members:** 39 nodes

## Members
- [[.__init__()_52]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[._ensure_dir()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[._reorder_servers()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.clear()_1]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.clear_sanitized()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.get_all_sanitized_tools()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.get_all_tools()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.get_failed_servers()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.get_server_tools()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.has_cache()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.has_sanitized_cache()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.load()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.load_sanitized()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.save()_1]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.save_failed_server()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.save_sanitized()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.save_server()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[.set_server_order()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Check if cache exists and has data.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Check if sanitized cache exists and has data.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Clear the sanitized cache.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Ensure cache directory exists.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Get all cached tools, grouped by server.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Get all sanitized cached tools, grouped by server.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Get cached tools for a specific server.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Get global tool cache instance.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Get list of failed servers from cache.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Load cache from disk. Returns empty dict if not exists.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Load sanitized cache from disk. Returns empty dict if not exists.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[MCPToolCache]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Record a failed server to cache.                  Args             server_name]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Reorder servers dict according to _server_order.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Save sanitized tool metadata to disk.                  Args             servers]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Save tool metadata to disk (overwrites existing cache).                  Args]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Saveupdate a single server's tools to cache (incremental append).]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Set expected server order (from config). Used when saving to disk.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[Simple file-based cache for MCP tool metadata.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[get_tool_cache()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py
- [[tool_cache.py]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/tool_cache.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/MCPToolCache
SORT file.name ASC
```

## Connections to other communities
- 19 edges to [[_COMMUNITY_Logger]]
- 1 edge to [[_COMMUNITY_MCPBaseConnector]]
- 1 edge to [[_COMMUNITY_MCPInstallerManager]]

## Top bridge nodes
- [[MCPToolCache]] - degree 23, connects to 2 communities
- [[tool_cache.py]] - degree 3, connects to 1 community
- [[Get cached tools for a specific server.]] - degree 2, connects to 1 community
- [[Get all cached tools, grouped by server.]] - degree 2, connects to 1 community
- [[Check if cache exists and has data.]] - degree 2, connects to 1 community