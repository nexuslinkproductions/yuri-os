---
name: dedup-exact-regex
description: "Use regex with line anchor for dedup guards, never includes() on shared journal files"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2ab87dd8-f649-4816-bbd0-4565aab40a22
---

Never use `includes('## YYYY-MM-DD')` to check if a synthesis entry already exists in a journal file.

**Why:** Session hook entries are written as `## 2026-05-19 | Session Start — ...` which contains the date prefix. `includes()` matches these and causes the synthesizer to always skip synthesis, silently producing nothing. This was the root cause of kagami-session-synthesizer not firing since 2026-05-18.

**How to apply:** Use `match(new RegExp('^## YYYY-MM-DD$', 'm'))` — the `^...$` anchors match only exact date-as-header lines, not lines that contain the date as part of a longer title. The `m` flag makes `^` and `$` match line boundaries. Applies to any dedup guard that operates on a mixed-content markdown file.
