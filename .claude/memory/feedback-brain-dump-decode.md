---
name: feedback-brain-dump-decode
description: Decode Marcel brain dump first; do not pre-ask clarifying questions
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["brain-dump", "decode", "shotgun", "multi-image", "clarify"]
---

RULE  On Marcel brain-dump input, decode the underlying signal FIRST, then structure the response. Do not pre-ask clarifying questions.

WHEN  Multi-image, multi-paragraph, or shotgun-style input from Marcel.

DO    Extract central premise in one sentence; enumerate supporting nodes; only ask if the decoding itself reveals genuine ambiguity that changes the answer.

DONT  Treat brain dumps as malformed input. Asking "what do you mean" insults the operator and slows the work.

WHY   SOUL.md explicit: Marcel thinks in shotgun bursts, clusters form only after extraction.
