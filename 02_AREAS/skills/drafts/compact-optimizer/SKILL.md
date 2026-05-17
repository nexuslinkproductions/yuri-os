---
name: compact-optimizer
description: "Construct the minimum-viable /compact hint. Grounded in selective context compression research (self-information scoring, perplexity-based pruning, attention-sink preservation). Use before every /compact call to prevent loss of session-critical state."
triggers:
  - "/compact"
  - "context is getting long"
  - "running out of context"
  - "compact before"
  - "compress the context"
---

# Compact Optimizer

One job: build the smallest possible hint that tells /compact exactly what must survive.

## Research Grounding

| Paper | Core Rule |
|-------|-----------|
| Selective Context (EMNLP 2023) | Drop what is reconstructable from general knowledge. Preserve what is unique to this session. |
| LLMLingua (EMNLP 2023) | Compress reasoning/exploration 60–80%. Compress instructions/constraints ≤20%. |
| H2O MIT (NeurIPS 2023) | Always retain the last user correction + last known file state — they are attention sinks. |

---

## Survival Priority Hierarchy

Rank 1 — **Never drop** (session-unique, irreplaceable):
- Active branch name and working directory
- Files modified in this session (paths + what changed)
- User corrections, explicit rejections, aversion decisions
- Definition of done / success criteria
- Last error message or test failure state
- Approved plan steps and which are complete

Rank 2 — **Compress heavily** (preserve meaning, strip words):
- Current task description (1 sentence max)
- Key constraints stated by user
- Architecture decisions made

Rank 3 — **Drop entirely** (reconstructable, low self-information):
- Exploration text ("let me look at...", "I'll check...")
- Preambles and acknowledgments
- Reasoning narration that led to a decision already made
- Redundant tool call descriptions (keep results, drop scaffolding)
- Any content the model could reproduce from the codebase alone

---

## Compact Hint Template

```
/compact Preserve: [branch/dir] | Files touched: [path1, path2] | Last correction: [exact user correction] | Current task: [1 sentence] | Done criteria: [condition] | Status: [step N of M complete, next: X]
```

**Rules for the hint itself:**
- Max 3 sentences. No preamble.
- Lead with the file state — it is always the highest-attention-sink.
- Include the last user correction verbatim if one exists.
- Name the next concrete action.
- Never include reasoning or exploration in the hint.

---

## Per-Phase Templates

**Research phase**
```
/compact Preserve: research goal=[goal], key finding=[finding], next: [what to research next]
```

**Implementation phase** (most common)
```
/compact Preserve: branch=[branch], files=[paths], constraint=[constraint], last correction=[correction], next step=[action], done when=[criteria]
```

**Review / debug phase**
```
/compact Preserve: error=[error msg], file=[path:line], hypothesis=[current], last tried=[approach], next: [next attempt]
```

---

## When to Call /compact

- Context bar >65%: run /compact with hint
- Phase change (research→implement, implement→review): always /compact with phase-transition hint
- After a user correction: /compact immediately, include correction verbatim
- Never compact mid-tool-use or mid-plan without noting the interruption point

---

## Anti-patterns (never do these)

- `/compact` with no hint → generic summary, drops constraints
- Hint longer than 3 sentences → defeats compression purpose
- Including reasoning in the hint → low self-information, wastes hint budget
- Compacting after a failed approach without writing an Aversion Memory node first

---

## Aversion Memory Gate

Per the YURI Aversion Memory Protocol: if you are compacting after a **failed branch**, first write the failure reason to an Aversion Memory node, THEN compact. The compact hint should reference the aversion: `last aversion: [reason]`.
