---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/transport/task_managers/base.py"
type: "code"
community: "MCPBaseConnector"
location: "L17"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/MCPBaseConnector
---

# BaseConnectionManager

## Connections
- [[.__init__()_21]] - `method` [EXTRACTED]
- [[._connection_task()]] - `method` [EXTRACTED]
- [[.get_streams()]] - `method` [EXTRACTED]
- [[.start()]] - `method` [EXTRACTED]
- [[.stop()]] - `method` [EXTRACTED]
- [[A placeholder connection manager that does nothing.          This is used by con]] - `uses` [INFERRED]
- [[ABC]] - `inherits` [EXTRACTED]
- [[Abstract base class for connection managers.      This class defines the interfa]] - `rationale_for` [EXTRACTED]
- [[AsyncContextConnectionManager]] - `uses` [INFERRED]
- [[Call an MCP tool with the given arguments.]] - `uses` [INFERRED]
- [[Check if the connector is connected.]] - `uses` [INFERRED]
- [[Clean up WebSocket resources on connection failure.]] - `uses` [INFERRED]
- [[Clean up WebSocket-specific resources before disconnection.]] - `uses` [INFERRED]
- [[Clean up resources before disconnection.]] - `uses` [INFERRED]
- [[Close the connection (placeholder implementation).]] - `uses` [INFERRED]
- [[Close the sessionconnection and reset state.]] - `uses` [INFERRED]
- [[Connection manager that immediately reports 'ready' without     establishing any]] - `uses` [INFERRED]
- [[Connector for MCP implementations using HTTP transport.      This connector uses]] - `uses` [INFERRED]
- [[Connector for MCP implementations using WebSocket transport.      This connector]] - `uses` [INFERRED]
- [[Continuously receive and process messages from the WebSocket.]] - `uses` [INFERRED]
- [[Create ClientSession (or set up JSON-RPC client) and log success.]] - `uses` [INFERRED]
- [[Create the context manager and enter it.]] - `uses` [INFERRED]
- [[Create the underlying sessionconnection.                  For JSON-RPC mode, we]] - `uses` [INFERRED]
- [[Ensure the connector is connected.]] - `uses` [INFERRED]
- [[Establish the connection (placeholder implementation).]] - `uses` [INFERRED]
- [[Exit the context manager if it exists.                  Uses try-finally to ensu]] - `uses` [INFERRED]
- [[Generic connection manager based on an async context manager. Give it any fact]] - `uses` [INFERRED]
- [[Get a prompt by name.]] - `uses` [INFERRED]
- [[Get next JSON-RPC request ID.]] - `uses` [INFERRED]
- [[Get the identifier for the connector._1]] - `uses` [INFERRED]
- [[Get the identifier for the connector._3]] - `uses` [INFERRED]
- [[Get the list of available tools._1]] - `uses` [INFERRED]
- [[HTTP connector for MCP implementations.  This module provides a connector for co]] - `uses` [INFERRED]
- [[HttpConnector]] - `uses` [INFERRED]
- [[Initialize a new HTTP connector.          Args             base_url The base U]] - `uses` [INFERRED]
- [[Initialize a new WebSocket connector.          Args             url The WebSoc]] - `uses` [INFERRED]
- [[Initialize the MCP session and return session information._1]] - `uses` [INFERRED]
- [[Initialize the MCP session.]] - `uses` [INFERRED]
- [[Invoke a tool or special method.]] - `uses` [INFERRED]
- [[List all available prompts.]] - `uses` [INFERRED]
- [[List all available resources from the MCP implementation._1]] - `uses` [INFERRED]
- [[List all available resources.]] - `uses` [INFERRED]
- [[List all available tools from the MCP implementation._1]] - `uses` [INFERRED]
- [[List all available tools.]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Negotiate transport type and set up the appropriate connection manager.]] - `uses` [INFERRED]
- [[No-op connection manager for local (in-process) connectors.  Local connectors ex]] - `uses` [INFERRED]
- [[No-op nothing to close.]] - `uses` [INFERRED]
- [[No-op return a sentinel value.]] - `uses` [INFERRED]
- [[NoOpConnectionManager]] - `uses` [INFERRED]
- [[Parse prompt data into Prompt objects.]] - `uses` [INFERRED]
- [[Parse resource data into Resource objects.]] - `uses` [INFERRED]
- [[Parse tool data into Tool objects.]] - `uses` [INFERRED]
- [[PlaceholderConnectionManager]] - `uses` [INFERRED]
- [[Read a resource by URI.]] - `uses` [INFERRED]
- [[Read a resource by URI._2]] - `uses` [INFERRED]
- [[Send a JSON-RPC request and return the result.                  Args]] - `uses` [INFERRED]
- [[Send a raw request to the MCP implementation.]] - `uses` [INFERRED]
- [[Send a raw request to the MCP implementation._2]] - `uses` [INFERRED]
- [[Send a request and wait for a response.]] - `uses` [INFERRED]
- [[Set up WebSocket-specific resources after connection.                  WebSocket]] - `uses` [INFERRED]
- [[Test JSON-RPC HTTP connection by sending an initialize request.]] - `uses` [INFERRED]
- [[Try the common FastMCP `sse` endpoint before the raw base URL.]] - `uses` [INFERRED]
- [[WebSocket connection management for MCP implementations.  This module provides a]] - `uses` [INFERRED]
- [[WebSocket doesn't use streams, return None to skip ClientSession creation.]] - `uses` [INFERRED]
- [[WebSocketConnector]] - `uses` [INFERRED]
- [[_BaseExceptionGroup]] - `uses` [INFERRED]
- [[base.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/MCPBaseConnector