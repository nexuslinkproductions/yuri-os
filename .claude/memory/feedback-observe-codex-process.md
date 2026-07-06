---
name: feedback-observe-codex-process
description: Read the full Codex artifact directory after each dispatch; learn from its working process
metadata:
  type: feedback
  tier: working
  scope: claude
---

RULE  When dispatching Codex, observe its actual working process — what commands it ran, what files it inspected, what decisions it made, in what order. The artifact directory contains this trace. Learning from Codex's process compounds across sessions.

WHEN  After any Codex final-pass dispatch completes. Before re-dispatching or reporting findings.

DO    Check `_SYSTEM/reports/codex-final-pass/<latest>/` for: `last-message.txt` (the verdict), `prompt.txt` or `invocation.json` (what was sent), and any working artifacts (rollouts, intermediate outputs). Read the verdict in full, not just the summary. Note the command sequence Codex used — those are reusable patterns. When Codex screenshots my work or quotes my output back, that's a signal of how it parsed the input.

DONT  Treat Codex as a black box. Don't only read the verdict's bottom line. Don't skip the artifact directory between dispatches — that's where the working trace lives.

WHY   Codex's process is a teacher. Each dispatch shows specific patterns: how it sequences checks, how it constructs counter-arguments, how it cites evidence, when it refuses. Observing these patterns lets future dispatches be shaped to land cleaner verdicts.

SEE   _SYSTEM/reports/codex-final-pass/ · FB:PROACTIVE-CODEX-BATON
