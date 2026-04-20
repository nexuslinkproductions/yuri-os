---
type: community
cohesion: 0.10
members: 25
---

# FilteredStderrWrapper

**Cohesion:** 0.10 - loosely connected
**Members:** 25 nodes

## Members
- [[.__init__()_61]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[.__init__()_62]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[._close_connection()_4]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[._establish_connection()_4]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[._is_harmless_error()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[._process_line()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[._restore_mcp_logging()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[._suppress_mcp_json_errors()]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[.fileno()_1]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[.flush()_1]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[.write()_1]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Check if the collected traceback is a harmless error.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Connection manager for stdio-based MCP connections.      This class handles the]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Establish connection in a dedicated task to avoid cancel-scope issues.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[FilteredStderrWrapper]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Flush any remaining buffered content and the underlying stream.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Initialize a new stdio connection manager.          Args             server_par]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Initialize the wrapper.                  Args             wrapped_stream The u]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Request the background task to exit its context and wait for it.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Restore MCP SDK logging to normal.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Return the file descriptor of the underlying stream.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[StdioConnectionManager]] - code - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Suppress MCP SDK's JSON parsing error logs.                  The MCP SDK logs er]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Wrapper for stderr that filters out harmless MCP server shutdown messages.]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py
- [[Write to stderr, filtering out harmless error messages.                  Args]] - rationale - 01_PROJECTS/openspace/openspace/grounding/backends/mcp/transport/task_managers/stdio.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/FilteredStderrWrapper
SORT file.name ASC
```

## Connections to other communities
- 14 edges to [[_COMMUNITY_Logger]]
- 3 edges to [[_COMMUNITY_MCPBaseConnector]]
- 1 edge to [[_COMMUNITY_MCPInstallerManager]]

## Top bridge nodes
- [[StdioConnectionManager]] - degree 9, connects to 3 communities
- [[FilteredStderrWrapper]] - degree 10, connects to 2 communities
- [[._process_line()]] - degree 5, connects to 1 community
- [[Check if the collected traceback is a harmless error.]] - degree 2, connects to 1 community
- [[Flush any remaining buffered content and the underlying stream.]] - degree 2, connects to 1 community