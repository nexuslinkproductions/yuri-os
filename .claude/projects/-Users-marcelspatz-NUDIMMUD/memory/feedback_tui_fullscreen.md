---
name: tui fullscreen kills pre-launch output
description: tui fullscreen in Claude settings wipes terminal on launch — shell HUD and splash are destroyed. Fix is to remove it.
type: feedback
originSessionId: 55d263c0-600f-49d5-8b8b-40ecdc289835
---
Never set `"tui": "fullscreen"` in `.claude/settings.json` when pre-launch terminal branding needs to survive.

**Why:** `tui: fullscreen` makes Claude Code clear the entire terminal and render its own fixed header (`Claude Code vX.X / Model / Workspace`) on startup. Any shell output before it — boot HUD, splash screens, custom prompts — is destroyed. The `statusLine` hook also fails to render reliably in this mode.

**How to apply:** If the NUDIMMUD boot HUD or the `◆ CLAUDE CODE` splash need to be visible when Claude starts, `tui` must be absent from settings.json. Inline mode (default) keeps the terminal history intact so the shell boot sequence and wrapper output persist above the conversation.

**Corollary:** The `statusLine` hook (`token-status.js`) does work in both modes, but it's more reliable without fullscreen. If fullscreen is ever re-added for UX reasons, test the statusLine explicitly.
