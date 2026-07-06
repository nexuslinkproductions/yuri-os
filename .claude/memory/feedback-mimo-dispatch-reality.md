---
name: feedback-mimo-dispatch-reality
description: "Mimo's agentic claude-mimo lane throws AggregateError on nested launch; use mimo.mjs reasoning lane — it runs SLOW (10+ min) then dumps full output at once, don't declare it hung"
metadata: 
  node_type: memory
  type: feedback
  tier: 2
  scope: mimo-lane
  trig: 
    - mimo
    - dispatch
    - claude-mimo
    - AggregateError
    - hung
    - slow
  refs: 
    - ref-mimo-firing
    - feedback-mimo-peer-lane
    - ref-mimo-integration
  originSessionId: 25204091-facb-496b-bb55-e478a843aca2
---

RULE: Dispatch Mimo via the `mimo.mjs` reasoning lane and WAIT for it — it batches.
WHEN: Handing real heavy work to Mimo as a peer (Marcel wants it used, not sidelined).
DO: `node _SYSTEM/Scripts/mimo.mjs < prompt` (unsandboxed). It can run 10+ minutes silent
  (output is written only at stream end), then "pops up with a bunch of shit at once"
  (Marcel's words). Check the proc is alive (`ps … mimo.mjs`); if alive, keep waiting.
  Feed it full file contents in the prompt (it's a pure completion — no file access on this path).
DONT: Declare Mimo "hung" after a few minutes of empty output and take its work yourself —
  that's the drift Marcel corrected. Don't use the nested agentic `ai claude-mimo` session for
  unattended work: on this setup it boots the TUI through trust/MCP/bypass prompts and then
  throws `AggregateError` on the first model call and dies (same failure memory noted for llm-lane).
WHY: 2026-06-13 — I called the 10-min-silent mimo.mjs jobs hung and started redoing #4/#5 myself;
  Marcel: "sometimes mimo needs really long to do something but then it pops up with a bunch at once."
  Both jobs then completed exit 0 with full, high-quality module+test output.
SEE: [[ref-mimo-firing]] (firing mechanics), [[feedback-mimo-peer-lane]] (run as equal peer).
