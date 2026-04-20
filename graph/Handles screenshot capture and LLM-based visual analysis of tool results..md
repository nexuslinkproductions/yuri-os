---
source_file: "01_PROJECTS/openspace/openspace/agents/visual_analyzer.py"
type: "rationale"
community: "Logger"
location: "L18"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Logger
---

# Handles screenshot capture and LLM-based visual analysis of tool results.

## Connections
- [[Logger]] - `uses` [INFERRED]
- [[ScreenshotClient]] - `uses` [INFERRED]
- [[ToolResult]] - `uses` [INFERRED]
- [[VisualAnalyzer]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/Logger