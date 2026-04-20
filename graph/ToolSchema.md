---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/types.py"
type: "code"
community: "Logger"
location: "L203"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Logger
---

# ToolSchema

## Connections
- [[- at least implement _run or _arun         - backend_type is NOT_SET, only give]] - `uses` [INFERRED]
- [[.is_allowed()]] - `method` [EXTRACTED]
- [[.validate_parameters()]] - `method` [EXTRACTED]
- [[Apply rate limiting by adding delay between API calls]] - `uses` [INFERRED]
- [[Args             model LLM model identifier             enable_thinking Wheth]] - `uses` [INFERRED]
- [[Auto-generate JSON-schema from _run() or _arun() signature.                  Ret]] - `uses` [INFERRED]
- [[Base connector for MCP implementations.  This module provides the base connector]] - `uses` [INFERRED]
- [[BaseEntity]] - `inherits` [EXTRACTED]
- [[BaseTool_1]] - `uses` [INFERRED]
- [[Build BaseTool instances from cached tool metadata.]] - `uses` [INFERRED]
- [[Call LLM with backoff retry on rate limit errors                  Timeout and re]] - `uses` [INFERRED]
- [[Call an MCP tool with automatic reconnection handling and retry logic.]] - `uses` [INFERRED]
- [[Check if tool has runtime information bound]] - `uses` [INFERRED]
- [[Close an MCP session by session name.                  Args             session]] - `uses` [INFERRED]
- [[Convert BaseTool list to LLMClient usable format, with deduplication.          A]] - `uses` [INFERRED]
- [[Convert ToolResult to LLMClient usable message format with LLM summarization for]] - `uses` [INFERRED]
- [[Convert ToolSchema to OpenAI ChatCompletion tool format]] - `uses` [INFERRED]
- [[Convert an MCP Tool to a BaseTool (RemoteTool) instance.          This function]] - `uses` [INFERRED]
- [[Convert provider response fields into plain Python containers.]] - `uses` [INFERRED]
- [[Create a new MCP session for a specific server.                  Args]] - `uses` [INFERRED]
- [[Ensure a server session exists, creating it if needed.                  This is]] - `uses` [INFERRED]
- [[Execute LLMClient returned tool_call      Args         tool BaseTool instance]] - `uses` [INFERRED]
- [[Get runtime information if bound]] - `uses` [INFERRED]
- [[Get the list of available tools.]] - `uses` [INFERRED]
- [[Get the recording manager._1]] - `uses` [INFERRED]
- [[Get tool name from schema (supports both class-defined and runtime-injected name]] - `uses` [INFERRED]
- [[Infer backend when tool_results would otherwise have no backend (name mismatch o]] - `uses` [INFERRED]
- [[Initialize MCP Provider.                  Args             config Configuratio]] - `uses` [INFERRED]
- [[Initialize the MCP provider.                  If configeager_sessions is Tru]] - `uses` [INFERRED]
- [[Internal helper for lazy session creation.                  Args             se]] - `uses` [INFERRED]
- [[Invoke this tool using bound runtime information.         Requires runtime info]] - `uses` [INFERRED]
- [[LLMClient]] - `uses` [INFERRED]
- [[LLMClient class for single round call]] - `uses` [INFERRED]
- [[List tools by starting all servers.                  Uses a semaphore to seriali]] - `uses` [INFERRED]
- [[List tools from MCP sessions.                  Args             session_name I]] - `uses` [INFERRED]
- [[Load tools from cache file without starting servers.                  Priority]] - `uses` [INFERRED]
- [[MCP Provider implementation.  This module provides a provider for managing MCP s]] - `uses` [INFERRED]
- [[MCP Provider manages multiple MCP server sessions.          Each MCP server defi]] - `uses` [INFERRED]
- [[MCPProvider]] - `uses` [INFERRED]
- [[Merge consecutive system messages into one.          Providers like MiniMax reje]] - `uses` [INFERRED]
- [[Normalize message history only when a provider requires it.]] - `uses` [INFERRED]
- [[Record execution result to quality manager for quality tracking.]] - `uses` [INFERRED]
- [[Recursively sanitize a JSON schema to conform to JSON Schema draft 2020-12.]] - `uses` [INFERRED]
- [[RemoteTool]] - `uses` [INFERRED]
- [[RemoteTool. Wrapper around a connector that calls a remote tool.]] - `uses` [INFERRED]
- [[Resolve a returned tool name to a concrete tool object.      The LLM is expected]] - `uses` [INFERRED]
- [[Return all configured MCP server names from MCPClient config.                  R]] - `uses` [INFERRED]
- [[Rewrite non-leading system messages into internal user notes for MiniMax.]] - `uses` [INFERRED]
- [[Runtime information for a tool instance]] - `uses` [INFERRED]
- [[Sanitize MCP tool schema to ensure Claude API compatibility (JSON Schema draft 2]] - `uses` [INFERRED]
- [[Sanitize raw cache and save to sanitized cache file.]] - `uses` [INFERRED]
- [[Sanitize tool parameter schema to comply with Claude API requirements.]] - `uses` [INFERRED]
- [[Save tools metadata to cache file.]] - `uses` [INFERRED]
- [[Single-round LLM call with optional tool execution.                  Args]] - `uses` [INFERRED]
- [[Tool converter for MCP.  This module provides utilities to convert MCP tools to]] - `uses` [INFERRED]
- [[ToolRuntimeInfo]] - `uses` [INFERRED]
- [[Use LLM to summarize large tool results.]] - `uses` [INFERRED]
- [[types.ts]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/Logger