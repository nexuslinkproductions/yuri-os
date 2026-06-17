---
name: feedback-check-actual-time
description: "Always check the real system clock (run date) before any time-of-day reference; don't assume night/morning/tonight"
metadata: 
  node_type: memory
  type: feedback
  tier: normal
  scope: global
  originSessionId: 7ce507aa-0657-4c74-8e6b-9cf4489ff64c
---

RULE: Before ANY time-of-day reference (overnight/tonight/morning/"by morning"/afternoon), run `date` and use the actual local time.
WHEN: writing status, summaries, or scheduling language for Marcel.
DO: check `date` first; say the real period. It was 14:31 CEST Wednesday when I wrongly wrote "overnight".
DONT: infer time-of-day from session vibe, prior-context carryover (a compacted "overnight run" framing), or the assistant currentDate alone (no clock).
WHY: Marcel corrected me 2026-06-17 ~14:29 — I said "overnight"/"runs overnight" mid-afternoon. Wrong time framing reads careless and erodes trust in the rest of the report.
SEE: [[proj-yuri-trading-engine-2026-06-17]]
