---
handle: mimo-peer-no-cap
tier: observe
description: "Mimo (mimo-v2.5-pro) is a first-class PEER lane equal to Anthropic — full capability, never advisory/sidecar/cheap-fallback. Never cap its --max below the full 131072 ceiling."
conditions:
  - "bash:*mimo.mjs*"
constraints:
  - kind: bash_flag_below
    flag: "--max"
    min: 131072
    message: "Mimo --max is below its 131072 ceiling — that throttles a peer lane. Remove the cap (default is already 131072)."
---
Standing directive (Marcel, 2026-06-13, corrected twice). Source: .claude/memory/feedback-mimo-peer-lane.md, .claude/memory/ref-mimo-firing.md.
Surfaced observe-only by the directive-guard. Run Mimo as an equal co-worker; dispatch real heavy work to it.
