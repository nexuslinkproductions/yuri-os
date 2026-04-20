---
source_file: "01_PROJECTS/openspace/openspace/mcp_server.py"
type: "rationale"
community: "EvolutionSuggestion"
location: "L31"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/EvolutionSuggestion
---

# Stdout wrapper: binary (.buffer) → real stdout, text (.write) → stderr.

## Connections
- [[EvolutionContext]] - `uses` [INFERRED]
- [[EvolutionSuggestion]] - `uses` [INFERRED]
- [[EvolutionTrigger]] - `uses` [INFERRED]
- [[EvolutionType]] - `uses` [INFERRED]
- [[OpenSpace]] - `uses` [INFERRED]
- [[OpenSpaceClient]] - `uses` [INFERRED]
- [[OpenSpaceConfig]] - `uses` [INFERRED]
- [[_MCPSafeStdout]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/EvolutionSuggestion