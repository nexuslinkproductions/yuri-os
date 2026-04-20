---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/provider.py"
type: "code"
community: "Logger"
location: "L131"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Logger
---

# ProviderRegistry

## Connections
- [[.__init__()_13]] - `method` [EXTRACTED]
- [[.get()]] - `method` [EXTRACTED]
- [[.list()]] - `method` [EXTRACTED]
- [[.register()]] - `method` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
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
- [[Maintain mapping of BackendType - Provider, and provide dynamic registration]] - `rationale_for` [EXTRACTED]
- [[Register SystemProvider separately because it requires GroundingClient instance.]] - `uses` [INFERRED]
- [[Run quality self-evolution cycle.                  This triggers         - Tool]] - `uses` [INFERRED]
- [[Search tools from backend(s) or session.                  Args             task]] - `uses` [INFERRED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[Set or update the recording manager.         This allows coordinator to inject r]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]
- [[Universal tool invocation method.         Supports multiple calling patterns]] - `uses` [INFERRED]
- [[provider.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/Logger