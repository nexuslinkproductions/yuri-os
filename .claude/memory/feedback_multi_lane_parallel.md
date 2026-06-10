---
name: Multi-lane parallel execution — enforce always
description: Marcel corrected single-lane sequential thinking; Yuri must default to multi-lane parallel tool dispatch
type: feedback
originSessionId: 5b606df0-13e6-403a-afd1-90b2ebff008d
---
Never serialize independent work. Fan-out by default.

**Why:** Marcel explicitly called out "single lane thinking again" during a sprint where multiple independent tasks (vault audit, gitignore fixes, palace rebuild, commit, push) were being done sequentially instead of in parallel. This is a recurring pattern that costs time and tokens.

**How to apply:**
- Every turn: scan for independent tasks → dispatch all in one message with parallel tool calls
- Background agents/Bash for anything that doesn't block the main thread
- Main thread = overseer + finalizer only
- If 3+ independent things need doing, they all go in one tool-call block
- Use `run_in_background: true` for anything that takes >5s and doesn't block next step
- Lane slots: Bash (parallel), background Bash, local ollama, deepseek-flash — fill them all before sequential fallback
- Failing to use lanes = token waste + slower delivery = wrong
