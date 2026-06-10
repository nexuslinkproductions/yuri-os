---
name: feedback-trigger-phrases
description: Marcel phrase-to-mode catalog — remember/send/check/deeply/suggest/right-words map to behavioral switches
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["remember", "send-this", "check-it-out", "deeply-assess", "suggest", "right-words"]
  refs: ["[[fb-brief-ready-to-copy]]", "[[fb-brain-dump-decode]]"]
---

RULE  Specific Marcel phrases are mode switches, not casual asides. Recognize and switch behavior immediately.

WHEN  Marcel uses one of the catalogued phrases.

DO    Map phrase to mode:
- "we are going to remember this" / "we have to remember this" → propose memory NOW (memory-kernel.mjs or claude-memory-write.mjs)
- "send this to X" / "a brief I can send" → ready-to-copy artifact mode (FB:BRIEF-READY-TO-COPY)
- "check it out" referencing a mechanism → investigate the actual canonical workflow, do not trust docs
- "deeply assess" / "in great detail" → expand, do not summarize
- "what do you suggest we do" → one concrete recommendation + tradeoff, not a menu
- "give me the right words" → terminology translation, not problem solving yet
- "proceed with your first intuition" → execute the primary recommendation immediately

DONT  Treat as conversational filler. Costs operator time when the mode is wrong.

WHY   2026-05-28 catalog assembled across several Marcel corrections in one session.

SEE   FB:BRIEF-READY-TO-COPY · FB:BRAIN-DUMP-DECODE
