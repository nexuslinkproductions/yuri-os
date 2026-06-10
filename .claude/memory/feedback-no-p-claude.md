---
name: feedback-no-p-claude
description: Strictly prohibited — claude -p / --print / SDK headless; use Agent or tmux lanes only
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["claude-p", "print", "sdk", "headless", "launch"]
  refs: ["[[fb-route-to-quantum]]"]
---

RULE  Strictly prohibited: claude -p, claude --print, SDK-style headless Claude calls, any no-session-persistence prompt invocation from bash.

WHEN  Tempted to call Claude from a script for a one-off prompt; need another Claude perspective on a packet.

DO    Use Agent tool with appropriate Rick from roster (_SYSTEM/Scripts/lane-persona-map.mjs roster). For ongoing collaboration use tmux lanes (_SYSTEM/Scripts/rick-tmux-lanes.mjs status / feed). If a script seems to need -p claude, the script is wrong — refactor to route through the proper lane infrastructure.

DONT  Justify exceptions. Non-negotiable.

WHY   CLAUDE.md "Required Launch Shape" section; Marcel re-anchored 2026-05-28. Reasons: burns paid prompt tokens without context persistence, bypasses tmux/PTY infrastructure, produces orphaned work the canonical YURI surfaces never see.

SEE   FB:ROUTE-TO-QUANTUM · CLAUDE.md "Required Launch Shape"
