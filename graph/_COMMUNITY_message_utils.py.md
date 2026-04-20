---
type: community
cohesion: 0.25
members: 9
---

# message_utils.py

**Cohesion:** 0.25 - loosely connected
**Members:** 9 nodes

## Members
- [[Build a system message describing the communication channel context.]] - rationale - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[Normalize external conversation history into ``{role, content}`` dicts.]] - rationale - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[Truncate conversation history to fit within token budget.      Preserves system]] - rationale - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[Truncate oversized individual message contents in-place.      Targets tool-resul]] - rationale - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[build_channel_context_message()]] - code - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[cap_message_content()]] - code - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[message_utils.py]] - code - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[normalize_external_history()]] - code - 01_PROJECTS/openspace/openspace/agents/message_utils.py
- [[truncate_messages()]] - code - 01_PROJECTS/openspace/openspace/agents/message_utils.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/message_utils.py
SORT file.name ASC
```

## Connections to other communities
- 4 edges to [[_COMMUNITY_Logger]]

## Top bridge nodes
- [[Normalize external conversation history into ``{role, content}`` dicts.]] - degree 2, connects to 1 community
- [[Build a system message describing the communication channel context.]] - degree 2, connects to 1 community
- [[Truncate oversized individual message contents in-place.      Targets tool-resul]] - degree 2, connects to 1 community
- [[Truncate conversation history to fit within token budget.      Preserves system]] - degree 2, connects to 1 community