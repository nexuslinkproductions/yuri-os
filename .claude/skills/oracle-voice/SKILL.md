---
name: oracle-voice
description: "Oracle audio-subsystem builder: STT, TTS, wakeword, call handoff, and audio routing for the Oracle shell. Invoke by name (oracle-voice) only when building the Oracle audio pipeline. NOTE: not the native dictation command — for Claude Code dictation use the built-in /voice."
triggers: ["oracle-voice"]
---

# Oracle Voice

Use this skill when the task is to add voice input/output without bloating the core shell.

## Focus

- Keep speech transport separate from command routing.
- Prefer local-first STT/TTS paths when available.
- Treat wakeword, push-to-talk, and call handoff as distinct surfaces.
- Reuse the corpus patterns from `mcp-use-voice-assistant`, `openclaw-openclaw`, and `ovos-core`.

## Output

- Voice path recommendation.
- Fallback plan.
- Minimal integration list.

## Rules

- Do not bind the assistant to one speech provider.
- Keep voice features optional and reversible.
- If a voice command needs a shell command, name the exact command surface explicitly.

## Session Notes

### 2026-06-16
- session: 190m | peak ctx: 0% | compacts: 0
- tools: Bash×87, Read×71, WebSearch×49, WebFetch×36, Edit×29, Agent×10, ToolSearch×6, Write×4, AskUserQuestion×2, TodoWrite×2, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-05
- session: patch | tools: Edit, Write | errors: none | notes: wired for CLI routing via triggers array and command alias
