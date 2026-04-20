---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/provider.py"
type: "code"
community: "Logger"
location: "L18"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Logger
---

# Provider

## Connections
- [[.__init__()_12]] - `method` [EXTRACTED]
- [[.__repr__()_1]] - `method` [EXTRACTED]
- [[._setup_security_policy()]] - `method` [EXTRACTED]
- [[.call_tool()]] - `method` [EXTRACTED]
- [[.close_all_sessions()]] - `method` [EXTRACTED]
- [[.ensure_initialized()]] - `method` [EXTRACTED]
- [[.get_session()]] - `method` [EXTRACTED]
- [[.list_sessions()_1]] - `method` [EXTRACTED]
- [[.list_tools()]] - `method` [EXTRACTED]
- [[ABC]] - `inherits` [EXTRACTED]
- [[Backend provider base class]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[Based on GroundingConfig.enabled_backends, register Provider instances to]] - `uses` [INFERRED]
- [[Build BaseTool instances from cached tool metadata.]] - `uses` [INFERRED]
- [[Close GUI session.                  Args             session_name Name of the]] - `uses` [INFERRED]
- [[Close an MCP session by session name.                  Args             session]] - `uses` [INFERRED]
- [[Create GUI session.                  Args             session_config Session c]] - `uses` [INFERRED]
- [[Create a new MCP session for a specific server.                  Args]] - `uses` [INFERRED]
- [[Ensure a server session exists, creating it if needed.                  This is]] - `uses` [INFERRED]
- [[Fetch tools from provider.                  Args             backend Backend t]] - `uses` [INFERRED]
- [[GUIProvider]] - `uses` [INFERRED]
- [[Get comprehensive tool quality report.]] - `uses` [INFERRED]
- [[Get debug info from the last tool search operation.                  Returns]] - `uses` [INFERRED]
- [[Get detailed quality insights for a specific tool.]] - `uses` [INFERRED]
- [[Get session monitoring info]] - `uses` [INFERRED]
- [[Get the recording manager.]] - `uses` [INFERRED]
- [[Get the tool quality manager.]] - `uses` [INFERRED]
- [[Global Entry, Facing AgentApplication, only concerned with Provider & Session]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Initialize GUI provider.                  Args             config Provider con]] - `uses` [INFERRED]
- [[Initialize MCP Provider.                  Args             config Configuratio]] - `uses` [INFERRED]
- [[Initialize Web Provider and create default session]] - `uses` [INFERRED]
- [[Initialize the MCP provider.                  If configeager_sessions is Tru]] - `uses` [INFERRED]
- [[Initialize the provider and create default session.]] - `uses` [INFERRED]
- [[Initialize tool quality manager based on config.]] - `uses` [INFERRED]
- [[Intelligent tool retrieval automatically decides whether to return all tools or]] - `uses` [INFERRED]
- [[Internal helper for lazy session creation.                  Args             se]] - `uses` [INFERRED]
- [[List static tools for every registered backend.]] - `uses` [INFERRED]
- [[List tools by starting all servers.                  Uses a semaphore to seriali]] - `uses` [INFERRED]
- [[List tools from MCP sessions.                  Args             session_name I]] - `uses` [INFERRED]
- [[List tools from backend(s) or session.                  1. session_name is provi]] - `uses` [INFERRED]
- [[Load tools from cache file without starting servers.                  Priority]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[MCP Provider implementation.  This module provides a provider for managing MCP s]] - `uses` [INFERRED]
- [[MCP Provider manages multiple MCP server sessions.          Each MCP server defi]] - `uses` [INFERRED]
- [[MCPProvider]] - `uses` [INFERRED]
- [[Provider for GUI desktop environment.     Manages communication with desktop_env]] - `uses` [INFERRED]
- [[Provider for system-level query tools]] - `uses` [INFERRED]
- [[Register SystemProvider separately because it requires GroundingClient instance.]] - `uses` [INFERRED]
- [[Return all configured MCP server names from MCPClient config.                  R]] - `uses` [INFERRED]
- [[Run quality self-evolution cycle.                  This triggers         - Tool]] - `uses` [INFERRED]
- [[Sanitize raw cache and save to sanitized cache file.]] - `uses` [INFERRED]
- [[Save tools metadata to cache file.]] - `uses` [INFERRED]
- [[Search tools from backend(s) or session.                  Args             task]] - `uses` [INFERRED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[Set or update the recording manager.         This allows coordinator to inject r]] - `uses` [INFERRED]
- [[ShellProvider]] - `uses` [INFERRED]
- [[SystemProvider]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[Universal tool invocation method.         Supports multiple calling patterns]] - `uses` [INFERRED]
- [[WebProvider]] - `uses` [INFERRED]
- [[provider.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/Logger