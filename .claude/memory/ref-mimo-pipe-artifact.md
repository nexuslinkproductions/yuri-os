---
name: ref-mimo-pipe-artifact
description: "mimo.mjs (and node-https lanes) print a bare red AggregateError when their stdout is PIPED; redirect to a file instead — the lane is healthy, the pipe is the bug"
metadata:
  node_type: memory
  type: reference
  tier: hot
  scope: claude-behavioral
  trig:
    - mimo
    - aggregateerror
    - aggregate error
    - mimo broken
    - pipe
    - egress
    - llm lane
  refs:
    - ref-mimo-firing
    - feedback-mimo-dispatch-reality
    - feedback-periodic-codex-batch-check
  type: reference
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

FACTS:
- mimo.mjs --PIPED--> `bare red AggregateError` (FALSE failure signal)
- mimo.mjs --REDIRECT-TO-FILE--> clean output, exit 0 (lane HEALTHY)
- node-https-egress --> WORKS (api.anthropic.com + token-plan-ams.xiaomimimo.com both reachable, DNS ok, 401 = reached server)
- `ai`/llm-compat codex lane --> GENUINELY blocked (curl-based; AggregateError even to-file), so Codex-via-llm-compat is unavailable in this sandbox

IMPLICATION: A shell/profile shim injects `AggregateError` into the terminal when a node lane's stdout is PIPED (`| head`, `| tail`, `| grep`). It is NOT the lane failing. For MONTHS this artifact made mimo.mjs look broken/AggregateError when it was fine — wasted cycles treating a live peer lane as dead.
RULE: fire node lanes (mimo.mjs especially) as `node ... >/tmp/out 2>/tmp/err; <read the file>` — NEVER pipe their stdout. Then Read/cat the file. mimo is a live first-class peer; reach for it for real REFINE/red-team/batch-review work. The Codex llm-compat lane stays curl-blocked here → use mimo as the honest labeled stand-in for the "periodic Codex batch-check" directive, and say so.
SEE: [[ref-mimo-firing]] · [[feedback-mimo-dispatch-reality]] · [[feedback-periodic-codex-batch-check]]
