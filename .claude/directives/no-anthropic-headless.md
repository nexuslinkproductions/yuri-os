---
handle: no-anthropic-headless
tier: observe
description: "Forbidden by default: claude -p / --print / SDK headless against the ANTHROPIC lane (unsolicited no-session-persistence paid call). EXEMPT: (1) Mimo via ai claude-mimo or mimo.mjs; (2) owner-explicit request in active task (Marcel); (3) YURI_OWNER_HEADLESS=1 env prefix on the command."
conditions:
  - "bash:*claude -p*"
  - "bash:*claude --print*"
constraints:
  - kind: command_matches
    pattern: "^(?!.*(?:mimo|claude-mimo|YURI_OWNER_HEADLESS)).*claude\\s+(-p|--print)"
    message: "unsolicited claude -p/--print is forbidden. Allowed when Marcel explicitly requested it in the task, or prefix YURI_OWNER_HEADLESS=1, or use Mimo wrapper / mimo.mjs."
---
Launch-shape rule, SCOPED to the Anthropic lane (Marcel clarification 2026-06-13; owner carve-out 2026-07-01): the ban targets **unsolicited** expensive headless Anthropic prompt calls. Mimo through the claude wrapper or mimo.mjs is the intended one-shot pattern. Marcel may explicitly request headless `claude -p` in the active task — agents comply; Max subscription, no additional metered API cost. Source: CLAUDE.md Required Launch Shape, persona behavioral floor.
