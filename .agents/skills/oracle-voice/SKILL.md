---
name: oracle-voice
description: "Build Oracle voice surfaces: STT, TTS, wakeword, call handoff, and voice-first routing. Use when the task touches speech input/output or assistant voice UX on this OS."
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

