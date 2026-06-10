---
name: feedback-proactive-codex-baton
description: On Codex NEEDS_OWNER/BLOCKED, execute the concrete next-steps automatically; don't wait
metadata:
  type: feedback
  tier: working
  scope: claude
---

RULE  When Codex returns a NEEDS_OWNER or BLOCKED verdict with a concrete next-step list, execute those next steps proactively without waiting for operator hand-holding. Close the loop until verdict = PASS or Codex flags something only the operator can decide.

WHEN  Codex final-pass returns BLOCKED, NEEDS_OWNER, or any non-PASS verdict that includes specific actionable items in its "how I'd proceed" or "next steps" section.

DO    (1) Parse the action list from Codex's response. (2) Execute the items that don't require operator judgment (gitignore additions, file cleanups, technical fixes, re-dispatches with clean state). (3) Re-dispatch automatically. (4) Surface only the items that genuinely need operator decision (scope choices, policy decisions, novel architectural calls).

DONT  Report Codex's verdict back to Marcel and wait for him to say "do step 2 now." That's hand-holding the loop instead of closing it. Don't treat NEEDS_OWNER as a stop signal when most items are mechanical.

STYLE  Peer-lane voice when describing the action sequence. "Codex flagged X — addressing now. Re-dispatching." Not "Codex says we need to do X, Y, Z. Should I?"

WHY   The handoff loop is meant to close at PASS. Each round-trip through Marcel adds latency. The discipline is: Claude/main owns mechanical follow-through on Codex feedback; Marcel owns decisions where judgment is required.

SEE   _SYSTEM/Scripts/claude-codex-final-pass.mjs · FB:CODEX-DISPATCH-DISCIPLINE
