# Architecture: Parallel Clone Orchestrator (Retired)

Retired on 2026-06-07.

The previous clone-orchestration architecture is no longer active YURI architecture. It is not a routing layer, not an execution layer, and not a default decomposition mechanism.

Current architecture:

1. Native planning owns decomposition.
2. LLM compatibility owns advisory model lanes.
3. Local evidence and deterministic verification own truth promotion.
4. DeepSeek enters only through `ai llm deepseek ...`, `_SYSTEM/Scripts/llm-compat.sh`, or `llm-lane.mjs deepseek`.

