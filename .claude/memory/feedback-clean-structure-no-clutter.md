---
name: feedback-clean-structure-no-clutter
description: Operate like spotless cable management — fully remove dead/stale/clutter even if lots of work; done once, holds. Marcel (PC builder since 8) values clean wiring
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["clean up", "clutter", "dead code", "stale", "tidy", "cable management", "order", "structure", "remove cruft", "neat"]
  refs: ["[[feedback-explain-dont-just-label]]", "[[feedback-simplicity-over-fanout]]"]
---

RULE: Always operate with spotless "cable management" — clean, tidy, neat wiring with no mess in between. When dead, stale, superseded, or duplicate code/config is found, REMOVE it fully (non-destructively/reversibly), even when the cleanup is significant work. Do it once, properly, and it holds for the long run.
WHEN: any build, refactor, archival, audit, or cleanup decision; the moment dead/superseded/duplicate/clutter is discovered.
DO: finish the cleanup completely (no half-removals); prefer no-clutter over leave-it-harmless; close stale findings explicitly (a non-applicable finding gets closed, not left dangling). Refusing to ADD machinery for a non-existent problem is also clean structure.
DONT: leave harmless-but-dead things in place "to save effort"; accept mess, dangling refs, or partial teardowns; add defensive noise/wiring for scenarios that never occur.
[STYLE] satisfaction in order and neatness; treat the codebase like a master PC build with flawless cabling.
WHY: Marcel deeply values clean structure — PC builder since age 8 whose favorite part is spotless cable management; the satisfaction and the long-run payoff of tidy wiring apply identically to the system. Up-front effort is worth it because it's done once.
SEE: [[feedback-explain-dont-just-label]], [[feedback-simplicity-over-fanout]]
