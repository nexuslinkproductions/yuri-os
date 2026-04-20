---
type: community
cohesion: 0.11
members: 23
---

# SystemInfoClient

**Cohesion:** 0.11 - loosely connected
**Members:** 23 nodes

## Members
- [[.__aenter__()_3]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[.__aexit__()_3]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[.__init__()_5]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[._get_session()_1]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[.clear_cache()]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[.close()_1]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[.get_cursor_position()]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[.get_screen_size()]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[.get_system_info()]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Clear cached system information.]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Close the HTTP session._1]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Context manager entry._1]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Context manager exit._1]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Get comprehensive system information.                  Returns information inclu]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Get current cursor position.                  Returns             Dict with 'x']] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Get or create aiohttp session._1]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Get screen size.                  Returns             Dict with 'width' and 'he]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[Initialize system info client.                  Args             base_url Base]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[SystemInfoClient]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[This client provides simple methods to get     - Platform info (OS, architectur]] - rationale - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[get_screen_size()]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[get_system_info()]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py
- [[system_info.py]] - code - 01_PROJECTS/openspace/openspace/platforms/system_info.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SystemInfoClient
SORT file.name ASC
```

## Connections to other communities
- 11 edges to [[_COMMUNITY_Logger]]
- 1 edge to [[_COMMUNITY_MCPBaseConnector]]
- 1 edge to [[_COMMUNITY_config.ts]]

## Top bridge nodes
- [[system_info.py]] - degree 5, connects to 2 communities
- [[SystemInfoClient]] - degree 14, connects to 1 community
- [[This client provides simple methods to get     - Platform info (OS, architectur]] - degree 2, connects to 1 community
- [[Get current cursor position.                  Returns             Dict with 'x']] - degree 2, connects to 1 community
- [[Clear cached system information.]] - degree 2, connects to 1 community