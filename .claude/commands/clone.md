---
description: RETIRED — use native planning + llm-compat advisory lanes instead
---

# /clone — RETIRED

The `parallel-clone-orchestrator` skill is retired (2026-06-07). Do not route work through clone orchestration.

**Replacement:** Use native planning for complex decomposition; route advisory model calls through the LLM compatibility lane (`ai llm <lane>` or `_SYSTEM/Scripts/llm-compat.sh`).

This command no longer dispatches a skill. If you encounter a reference to `/clone`, `/pco`, or `parallel-clone-orchestrator`, redirect to native planning plus explicit llm-compat advisory lanes.
