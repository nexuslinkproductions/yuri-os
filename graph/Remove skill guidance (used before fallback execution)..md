---
source_file: "01_PROJECTS/openspace/openspace/agents/grounding_agent.py"
type: "rationale"
community: "Logger"
location: "L116"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Remove skill guidance (used before fallback execution).

## Connections
- [[.clear_skill_context()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseAgent_1]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[RetrieveSkillTool]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[VisualAnalyzer]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger