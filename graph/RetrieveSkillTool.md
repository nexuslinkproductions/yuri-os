---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/retrieve_tool.py"
type: "code"
community: "Logger"
location: "L26"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Logger
---

# RetrieveSkillTool

## Connections
- [[.__init__()_71]] - `method` [EXTRACTED]
- [[._arun()_24]] - `method` [EXTRACTED]
- [[._load_skill_quality()]] - `method` [EXTRACTED]
- [[Attach a SkillRegistry so the agent can offer ``retrieve_skill`` as a tool.]] - `uses` [INFERRED]
- [[BackendType]] - `uses` [INFERRED]
- [[Build feedback message to add to next iteration.]] - `uses` [INFERRED]
- [[Build final execution result.                  Args             instruction Or]] - `uses` [INFERRED]
- [[Check workspace directory for existing artifacts that might be relevant to the t]] - `uses` [INFERRED]
- [[Default system prompt tailored to the agent's actual backend scope.]] - `uses` [INFERRED]
- [[Fallback load all tools from all backends without search.]] - `uses` [INFERRED]
- [[Generate final summary across all iterations for reporting to upper layer.]] - `uses` [INFERRED]
- [[Get workspace directory path from context.]] - `uses` [INFERRED]
- [[GroundingAgent]] - `uses` [INFERRED]
- [[Initialize the Grounding Agent.                  Args             name Agent n]] - `uses` [INFERRED]
- [[Inject skill guidance into the agent's system prompt.          Called by ``OpenS]] - `uses` [INFERRED]
- [[Internal tool mid-iteration skill retrieval.      Reuses ``SkillRegistry.select]] - `rationale_for` [EXTRACTED]
- [[LocalTool]] - `inherits` [EXTRACTED]
- [[LocalTool_1]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Process a task execution request with multi-round iteration control.]] - `uses` [INFERRED]
- [[Record agent execution to recording manager.                  Args]] - `uses` [INFERRED]
- [[Remove guidance section from previous iteration feedback messages.]] - `uses` [INFERRED]
- [[Remove skill guidance (used before fallback execution).]] - `uses` [INFERRED]
- [[Retrieve tools for the current execution phase.          Both skill-augmented an]] - `uses` [INFERRED]
- [[Scan workspace directory and collect file information.                  Args]] - `uses` [INFERRED]
- [[SkillStore]] - `uses` [INFERRED]
- [[retrieve_tool.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/Logger