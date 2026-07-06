---
name: feedback-simplicity-over-fanout
description: Default to simplest claude/codex usage; scrap fan-out/swarm/orchestration clutter; minimalism prevents mistakes
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["simplify", "scrap", "fanout", "swarm", "too complex", "clutter", "keep it simple"]
  refs: ["[[feedback-verify-maps-before-destructive]]"]
---

RULE: Default to the SIMPLEST claude/codex usage — fewer lanes, skills, features, and fan-out layers. Minimalism prevents mistakes.
WHEN: building or routing anything in YURI; tempted to add a lane/skill/orchestration layer; reviewing existing clutter.
DO: prefer direct single-lane dispatch + native Opus Workflow orchestration; remove fan-out/swarm/orchestration machinery on sight; when in doubt, delete rather than add.
DONT: rebuild parallel fan-out, "swarm" orchestration, or per-feature skills that Opus 4.8 + native Workflow already cover.
WHY: Marcel built extensive fan-out/swarm/skill clutter as workarounds for what Opus 4.8 (+ x20 Max) now does natively; it became a mental-load "cluster fuck." He explicitly wants claude/codex kept as simple as possible to avoid mistakes. Removing it is a relief, not a loss.
SEE: [[feedback-verify-maps-before-destructive]]
