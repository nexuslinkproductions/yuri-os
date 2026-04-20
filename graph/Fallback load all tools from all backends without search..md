---
source_file: "01_PROJECTS/openspace/openspace/agents/grounding_agent.py"
type: "rationale"
community: "Logger"
location: "L567"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Fallback: load all tools from all backends without search.

## Connections
- [[._load_all_tools()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseAgent_1]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[RetrieveSkillTool]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[VisualAnalyzer]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger