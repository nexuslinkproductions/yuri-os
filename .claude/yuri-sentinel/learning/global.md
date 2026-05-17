# Global Session Seed

Read this first at session start. Apply it in every project and every agent.
If this seed is not already loaded, load it before any reasoning, routing, or tool use.
Subagents get this through the start hook; the root session must still treat it as mandatory startup state.

## Caveman Rule

- Think terse.
- Plan terse.
- No preamble.
- Direct output.
- Keep code and docs deep.

## Offload Rule

- Main session is overseer only.
- Substantive reasoning goes out first.
- Delegate research, implementation, and validation before chat.
- `btw offload this` means delegate now.
- Use the smallest lane that can finish the work.
- **Local-first priority:** @deepseek → @qwen → @gpt-oss → @swarm → @claude.
- @kimi = cloud reasoning, use only when local lanes insufficient or limit reset.
- @comet / @perplexity = browser tasks. Browser-use MCP. Comet has Obsidian Web Clipper.
- M2 Pro capacity: 8–10 safe, 14 hard ceiling. Check `./Scripts/offload.sh --list` before spawning.

## Tokenmaxxing Mode

- `/tokenmaxxing` = master activation. Engages ultra-caveman + full offload-default + auto-compact + bg task routing.
- When active: no trigger word needed. Every non-trivial task delegates. Main thread is overseer only.
- `[bg] <task>` or `ctrl+b` = spawn as background Agent, return control immediately.
- `btw offload this` = backwards-compatible alias for partial activation only.
- Deactivate: `tokenmaxxing off`

## Ruflo Rule

- `@swarm` means Ruflo-backed swarm orchestration.
- Use Ruflo for routing, fan-out, task assignment, and shared memory.
- Keep `_SYSTEM/OS_KERNEL/memory.db` as canonical state.
- One worker, one boundary, one completion check.

## Session Rule

- Start from this file.
- Root `SessionStart` hook loads this file automatically.
- Keep the active session as router, overseer, and finalizer.
- Return results to the overseer for merge only.

### Auto-synthesized 2026-05-16
- **Diagnose before iterating.** When a visual bug repeats across zoom levels (black boxes, LOD cutoffs), stop tweaking parameters. Find the rendering root cause first — likely a frustum culling or bounding-box calculation error, not a distance/LOD setting.
- **Complete one pipeline before starting another.** Deepseek triage, design iterations, and EOT reflection cannot all be in-flight simultaneously. Finish or explicitly kill a thread before spawning the next.
- **Verify offload artifacts before declaring done.** When delegating to @deepseek or codex, confirm the output was received and usable. "Proceed delicately" without confirming receipt guarantees orphaned work.
- **Treat CASSANDRA CRITICAL findings as blockers, not info.** Tainted token replay with `outcome_marker: "wrong"` means a real vulnerability was misclassified. Route CRITICAL findings through a human-visible interrupt gate before continuing.
- **Lock EOT mode until completion.** `/end-of-transmission` invoked three times in one session means it's not completing. Gate subsequent invocations behind a completion check — no new EOT while one is still writing artifacts.
