---
source_file: "01_PROJECTS/openspace/openspace/host_detection/__init__.py"
type: "rationale"
community: "MCPInstallerManager"
location: "L1"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/MCPInstallerManager
---

# Host-agent config auto-detection.  Public API consumed by other OpenSpace subsys

## Connections
- [[HttpConnector]] - `uses` [INFERRED]
- [[MCPBaseConnector_1]] - `uses` [INFERRED]
- [[MCPClient]] - `uses` [INFERRED]
- [[MCPCommandNotFoundError]] - `uses` [INFERRED]
- [[MCPDependencyError]] - `uses` [INFERRED]
- [[MCPInstallationCancelledError]] - `uses` [INFERRED]
- [[MCPInstallationFailedError]] - `uses` [INFERRED]
- [[MCPInstallerManager]] - `uses` [INFERRED]
- [[MCPProvider]] - `uses` [INFERRED]
- [[MCPSession]] - `uses` [INFERRED]
- [[MCPToolCache]] - `uses` [INFERRED]
- [[OpenSpaceClient]] - `uses` [INFERRED]
- [[SandboxConnector]] - `uses` [INFERRED]
- [[SkillSearchEngine]] - `uses` [INFERRED]
- [[SseConnectionManager]] - `uses` [INFERRED]
- [[StdioConnectionManager]] - `uses` [INFERRED]
- [[StdioConnector]] - `uses` [INFERRED]
- [[StreamableHttpConnectionManager]] - `uses` [INFERRED]
- [[WebSocketConnectionManager]] - `uses` [INFERRED]
- [[WebSocketConnector]] - `uses` [INFERRED]
- [[__init__.py]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/MCPInstallerManager