---
source_file: "01_PROJECTS/openspace/openspace/grounding/backends/mcp/installer.py"
type: "code"
community: "MCPInstallerManager"
location: "L47"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/MCPInstallerManager
---

# MCPInstallerManager

## Connections
- [[.__init__()_53]] - `method` [EXTRACTED]
- [[._ask_user()_1]] - `method` [EXTRACTED]
- [[._check_command_available()]] - `method` [EXTRACTED]
- [[._check_npm_package()]] - `method` [EXTRACTED]
- [[._check_package_installed()]] - `method` [EXTRACTED]
- [[._check_python_package()]] - `method` [EXTRACTED]
- [[._check_uv_pip_package()]] - `method` [EXTRACTED]
- [[._default_cli_prompt()_1]] - `method` [EXTRACTED]
- [[._ensure_dependencies_impl()]] - `method` [EXTRACTED]
- [[._extract_npm_package()]] - `method` [EXTRACTED]
- [[._extract_python_package()]] - `method` [EXTRACTED]
- [[._extract_uv_package()]] - `method` [EXTRACTED]
- [[._get_install_command()]] - `method` [EXTRACTED]
- [[._install_package()]] - `method` [EXTRACTED]
- [[.ensure_dependencies()]] - `method` [EXTRACTED]
- [[Add a server configuration.          Args             name The name to identif]] - `uses` [INFERRED]
- [[Build BaseTool instances from cached tool metadata.]] - `uses` [INFERRED]
- [[Client for managing MCP servers and sessions.      This class provides a unified]] - `uses` [INFERRED]
- [[Close a session.          Args             server_name The name of the server]] - `uses` [INFERRED]
- [[Close all active sessions.          This method ensures all sessions are closed]] - `uses` [INFERRED]
- [[Close an MCP session by session name.                  Args             session]] - `uses` [INFERRED]
- [[Configuration loader for MCP session.  This module provides functionality to loa]] - `uses` [INFERRED]
- [[Create a MCPClient from a configuration file.          Args             filepat]] - `uses` [INFERRED]
- [[Create a MCPClient from a dictionary.          Args             config The con]] - `uses` [INFERRED]
- [[Create a connector based on server configuration.          Args         server_]] - `uses` [INFERRED]
- [[Create a new MCP session for a specific server.                  Args]] - `uses` [INFERRED]
- [[Create a session for the specified server with retry logic.          Args]] - `uses` [INFERRED]
- [[Create sessions for all configured servers.          Args             auto_init]] - `uses` [INFERRED]
- [[Ensure a server session exists, creating it if needed.                  This is]] - `uses` [INFERRED]
- [[Get all active sessions.          Returns             Dictionary mapping server]] - `uses` [INFERRED]
- [[Get an existing session.          Args             server_name The name of the]] - `uses` [INFERRED]
- [[Get the list of configured server names.          Returns             List of s]] - `uses` [INFERRED]
- [[Host-agent config auto-detection.  Public API consumed by other OpenSpace subsys]] - `uses` [INFERRED]
- [[Initialize MCP Provider.                  Args             config Configuratio]] - `uses` [INFERRED]
- [[Initialize a new MCP client.          Args             config Either a dict co]] - `uses` [INFERRED]
- [[Initialize the MCP provider.                  If configeager_sessions is Tru]] - `uses` [INFERRED]
- [[Internal helper for lazy session creation.                  Args             se]] - `uses` [INFERRED]
- [[Internal helper to get mcpServers configuration.                  Tries both 'mc]] - `uses` [INFERRED]
- [[List tools by starting all servers.                  Uses a semaphore to seriali]] - `uses` [INFERRED]
- [[List tools from MCP sessions.                  Args             session_name I]] - `uses` [INFERRED]
- [[Load tools from cache file without starting servers.                  Priority]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[MCP Provider implementation.  This module provides a provider for managing MCP s]] - `uses` [INFERRED]
- [[MCP Provider manages multiple MCP server sessions.          Each MCP server defi]] - `uses` [INFERRED]
- [[MCP dependencies package installer manager.          Responsible for detecting i]] - `rationale_for` [EXTRACTED]
- [[MCPClient]] - `uses` [INFERRED]
- [[MCPProvider]] - `uses` [INFERRED]
- [[OpenSpace cloud platform HTTP client.  All methods are synchronous (use ``ur]] - `uses` [INFERRED]
- [[Remove a server configuration.          Args             name The name of the]] - `uses` [INFERRED]
- [[Return all configured MCP server names from MCPClient config.                  R]] - `uses` [INFERRED]
- [[Sanitize raw cache and save to sanitized cache file.]] - `uses` [INFERRED]
- [[Save the current configuration to a file.          Args             filepath T]] - `uses` [INFERRED]
- [[Save tools metadata to cache file.]] - `uses` [INFERRED]
- [[get_global_installer()]] - `calls` [EXTRACTED]
- [[installer.js]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/MCPInstallerManager