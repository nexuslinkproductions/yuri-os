---
source_file: "01_PROJECTS/openspace/openspace/grounding/core/provider.py"
type: "rationale"
community: "Logger"
location: "L132"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Maintain mapping of BackendType -> Provider, and provide dynamic registration /

## Connections
- [[BackendType]] - `uses` [INFERRED]
- [[BaseSession]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[ProviderRegistry]] - `rationale_for` [EXTRACTED]
- [[SecurityPolicyManager]] - `uses` [INFERRED]
- [[SessionConfig]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[ToolStatus]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger