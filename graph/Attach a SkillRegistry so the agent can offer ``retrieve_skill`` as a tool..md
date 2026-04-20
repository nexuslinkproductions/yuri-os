---
source_file: "01_PROJECTS/openspace/openspace/agents/grounding_agent.py"
type: "rationale"
community: "Logger"
location: "L127"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Attach a SkillRegistry so the agent can offer ``retrieve_skill`` as a tool.

## Connections
- [[.set_skill_registry()]] - `rationale_for` [EXTRACTED]
- [[BackendType]] - `uses` [INFERRED]
- [[BaseAgent_1]] - `uses` [INFERRED]
- [[GroundingClient]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[RetrieveSkillTool]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[VisualAnalyzer]] - `uses` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Logger