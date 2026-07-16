# YURI Codex Offload Policy

`yuri.offload_task` is disabled while the MCP attachment and lane boundary is under security review. Do not enable it or require it as a workflow dependency.

Self-execute only for small edits already in current context, deterministic shell inspection, single-file reads, and final synthesis from offload outputs.

Use native Codex subagents or explicitly launched Pi/OMP lanes for bounded work. Treat OS_KERNEL task memory and offload budgets as non-authoritative while `yuriOffload` is disabled.

Protected surfaces remain blocked per `_SYSTEM/yuri-origin.md`.
