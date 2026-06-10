---
name: feedback-harness-batch-and-headless
description: Don't bundle tool calls (batch cancels); heavy hook stack lags+denies; headless screenshots unreliable->use dump-dom+real browser
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["tool calls", "batch", "cancel", "parallel", "hook", "lag", "headless", "screenshot", "blank page", "verify html"]
  refs: ["[[feedback-agent-dispatch-contract]]"]
---

RULE  Three hard-won tooling lessons from a heavy session:
1. DO NOT bundle many tool calls in one message. Parallel batches are atomic — if ONE call errors, is denied by a hook, or the owner interrupts, the WHOLE batch CANCELS. Send fewer, clean, single-purpose calls. Never fire `echo PUMP` filler calls to "flush" lag — that just raises the cancel odds.
2. The PreToolUse hook stack is heavy (~14 node spawns per tool call: protocol-guard, bash-security-guard, tirith-url-guard, yuri-risk-lite, etc.). It causes the result LAG (delayed batched flushes, not a hang) AND occasional spurious DENIALS on benign reads (`head`, `ls -dt`). A denied call cancels its batch siblings. (Tunable next session: make more guards async / fire only on mutations.)
3. Headless Chrome SCREENSHOTS are an UNRELIABLE oracle for complex self-contained HTML — they render BLACK even when the DOM is correct. Verify HTML rendering with `--dump-dom` (DOM truth) + the OWNER's real browser, NOT screenshots.

WHEN  Any multi-tool turn; any HTML/visual verification; any "blank page" debug.

DO  Single clean calls. For "page is blank": dump-dom to confirm the content exists in the DOM, THEN suspect CSS-visibility (not JS). Trust the real browser over headless screenshots.

DONT  Bundle + pump. Trust a headless screenshot. Blind-edit minified files fast (it turns one bug into three).

WHY  This session burned hours on batch-cancels and a misleading all-black headless oracle while the DOM was correct the whole time.

SEE  [[feedback-agent-dispatch-contract]] · [[feedback-scroll-reveal-hide-trap]]
