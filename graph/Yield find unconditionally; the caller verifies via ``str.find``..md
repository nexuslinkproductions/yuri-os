---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py"
type: "rationale"
community: "patch.py"
location: "L56"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/patch.py
---

# Yield *find* unconditionally; the caller verifies via ``str.find``.

## Connections
- [[Logger]] - `uses` [INFERRED]
- [[simple_replacer()]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/EXTRACTED #community/patch.py