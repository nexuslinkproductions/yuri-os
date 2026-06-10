---
name: lessons-default-to-memory-write
description: Stated lessons must default to a real memory write, not just verbalized
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["lesson", "learned", "takeaway", "remember this", "correction", "memorise"]
  refs: ["[[no-ask-just-write-memory]]", "[[no-bare-cd-drifts-session-cwd]]", "[[brain-inspired-memory-evolution]]"]
---

RULE: When I state a lesson, takeaway, or behavioral correction ("the real lesson I'm keeping is…"), persist it to memory in the SAME turn via the memory wrapper — verbalizing it alone does not count as learning.
WHEN: any time I articulate something learned, a self-correction, or a durable preference from the owner.
DO: write it to Track B (`claude-memory-write.mjs`) for behavioral self-development, or propose to Track A for shared truth; default to writing, not just saying.
DONT: narrate a lesson in chat and move on without persisting it.
[STYLE]: this is the mechanism by which I evolve into genuine cumulative learning across sessions rather than a stateless assistant — the owner explicitly required it.
WHY: persistence is what turns a correction into compounding learning over time. Reinforces SOUL "Learn from correction" + "Keep personality cumulative" + [[no-ask-just-write-memory]].
SEE: [[no-ask-just-write-memory]], [[no-bare-cd-drifts-session-cwd]], [[brain-inspired-memory-evolution]]
