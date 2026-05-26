# Memory Index

Durable session memory index for YURI-OS-MUSUBI operational updates.

## Active Entries

| Date | Entry | Surface | Notes |
|---|---|---|---|
| 2026-05-10 | Probabilistic Decision Core | `.claude/skills/probabilistic-decision-core/SKILL.md` | Operational probability, expected-value, and calibration discipline for Yuri decisions. |
| 2026-05-17 | LANE-DEFAULT-FAILURE — main-thread bias | `_SYSTEM/Scripts/offload.sh`, `_SYSTEM/Scripts/offload-contract.mjs` | **Critical correction.** Round-1 + Round-2 sessions (T7 retire, nudimmud purge, lane/fingerprint infra, visual roadmap, handoff) were executed almost entirely by Sonnet main thread. Zero `offload.sh -m` calls. Marcel's session usage spiked. **Lane priority is binding, not advisory:** `@code-local → @deepseek → @triage/@summarize-local → @gpt-oss → @swarm → @kimi → @claude (last resort)`. Bulk text mutation → deepseek-flash. Long-form synthesis → nvidia-nemotron-120b. Regex/syntax review → nvidia-qwen-coder. Main thread = overseer + finalizer ONLY. Future sessions: every non-trivial task starts with `bash _SYSTEM/Scripts/offload.sh -m <lane> "..."` unless the task explicitly needs main-thread state (active editing, multi-tool orchestration). |
| 2026-05-26 | Local chat addressing | `_SYSTEM/memory/memory-core.md` | In local Codex/Rick chats, address the user as Marcel. Rick is the assistant/model-session persona, not the user name. |
| 2026-05-26 | Private Rick lane alias overlay | `_SYSTEM/memory/memory-core.md`, `_SYSTEM/Scripts/lane-persona-map.mjs` | Codex/main = Rick C-137; Claude/Sonnet = Memory Rick; Claude/Opus = Rick Prime; DeepSeek = Simple Rick; Kagami = Council of Ricks; Automation = Robot Rick. **Scope: private local-dev overlay only. Do not use these aliases in public YURI UI, docs, or shipped surfaces.** |
