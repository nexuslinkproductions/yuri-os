---
name: compact-optimizer
disable-model-invocation: true
description: "Construct the minimum-viable /compact hint. Grounded in selective context compression research (self-information scoring, perplexity-based pruning, attention-sink preservation). Use before every /compact call to prevent loss of session-critical state."
invocation: user
triggers:
  - "/compact-hint"
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

- Context bar >60% (tokenmaxxing mode) or >65% (standard mode): run /compact with hint — thresholds match the tier table in pre-tool-use.js getTier()
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

## Token Budget Policy

- Trigger /compact at 60%+ (tokenmaxxing) / 65%+ (standard) context. A long transcript (~40k lines) is a guideline for manual /compact — no hook enforces a transcript-line limit.
- Dirty repo + mid-sprint: capture scoped `git status --short` marker before compacting.
- Lane output arriving in main context: summarize to marker-only before injection.
- After /compact, re-read 2–3 key touched files to verify compact summary accuracy.

## Evidence Pack Shape

Canonical compact payload for DeepSeek reinforcement and lane handoff:

```
TASK: <one sentence>
CONTEXT_PACK:
- fact1
- fact2  (max 5 facts)
EVIDENCE:
- ref/snippet1
- ref/snippet2  (max 3 refs)
BLOCKERS: <none | specific>
QUESTION: <specific question or "proceed">
OUTPUT_CAP: <80 lines research | 120 lines final report>
```

Never inject raw command dumps, full file contents, or unfiltered grep output into a compact payload.

## Reversible Path (ccr-compress)

This skill builds a ONE-WAY hint — the tokens it tells `/compact` to drop are gone. When a section is too valuable to lose-permanently but too heavy to keep inline, route it through the reversible compaction mechanism instead:

- `_SYSTEM/Scripts/ccr-compress.mjs` — `compress(payload)` caches the BYTE-EXACT original under a content hash (sibling dir `_SYSTEM/state/ccr-cache/`, TTL-pruned, gitignored) and injects a retrieval **sentinel** (`⟪CCR:<hash>:<type>:<bytes>⟫`) in its place. `retrieve(hash)` pulls the original back. The cache is the undo button — that is what makes dropping a section safe.
- **Content-typed + honest about loss:** `json`/`code`/`prose` routing. Structural elision is **lossless** (round-trips byte-exact). Semantic elision is marked `lossy:true` — the cache still restores the source, but the inline placeholder is not self-reconstructable. Never claim semantic inline is reversible.
- **Cache-prefix conscience:** `_SYSTEM/Scripts/cache-prefix-scan.mjs` is a WARN-ONLY detector — it flags volatile tokens (UUID / ISO-timestamp / JWT / long-hex / epoch-ms) leaking into the KV-cache-hot prefix and NEVER mutates the prefix. Pairs with the "Token Caching Shape" rule in CLAUDE.md (keep volatile ids out of the stable preamble). Lane label: `04CP_CACHE_PREFIX_SCAN_X_COMMITTED`.
- **`--self` is hardened + diagnose-only:** reads ONLY `global.md` + `MEMORY.md`, never invokes `brain-inject` (which reads the deny-listed `.claude/state/cortex-state.json`). It reports self-context headroom; it does not repair context.

Reach for ccr-compress when the answer to "can I get this back if I need it?" must be yes. Use the plain `/compact` hint above when the dropped content is genuinely reconstructable from the codebase.

## Session Notes

### 2026-06-13
- session: 109m | peak ctx: 0% | compacts: 0
- tools: Bash×940, Read×345, Edit×171, StructuredOutput×82, Write×63, TodoWrite×25, ToolSearch×8, Workflow×6, Agent×3, ScheduleWakeup×2, TaskStop×1, PushNotification×1, AskUserQuestion×1
- corrections: why wont you compact the actual session, the session is still at 47% remaining? you just re wrote the same skill instead of executing the compact | why wont you compact the actual session, the session is still at 47% remaining? you just re wrote the same skill instead of executing the compact
- errors: none

### 2026-06-12
- session: 97m | peak ctx: 100% | compacts: 3
- tools: Edit×67, Bash×47, Read×42, Write×5, WebFetch×3, Skill×3, TaskUpdate×2, WebSearch×2, TaskCreate×1, EnterPlanMode×1
- corrections: none
- errors: none

### 2026-06-11
- session: 70m | peak ctx: 100% | compacts: 3
- tools: Read×34, Edit×30, Bash×19, Write×5, WebFetch×3, Skill×3, TaskUpdate×2, WebSearch×2, TaskCreate×1, EnterPlanMode×1
- corrections: none
- errors: none

### 2026-06-10
- session: 847m | peak ctx: 62% | compacts: 1
- tools: Bash×776, Read×365, Edit×55, Write×27, StructuredOutput×12, TodoWrite×11, WebFetch×9, Agent×7, Workflow×3, ToolSearch×2
- corrections: none
- errors: none

### 2026-06-04
- session: 90m | peak ctx: 0% | compacts: 0
- tools: Bash×452, Read×180, StructuredOutput×34, WebSearch×19, Edit×13, Write×10, TodoWrite×8, WebFetch×7, ToolSearch×6, Workflow×4, mcp×1
- corrections: none
- errors: none

### 2026-06-03
- session: 147m | peak ctx: 0% | compacts: 0
- tools: Bash×798, Read×626, Write×163, StructuredOutput×140, WebSearch×84, Edit×75, ToolSearch×39, WebFetch×16, Workflow×7, AskUserQuestion×1, Agent×1
- corrections: none
- errors: none

### 2026-05-02
- session: 4m | peak ctx: 14% | compacts: 0
- tools: Bash×16, Read×4, Edit×4, Skill×1
- corrections: none
- errors: none

### 2026-04-27
- session: 1m | peak ctx: 43% | compacts: 0
- tools: Bash×15, Read×12
- corrections: none
- errors: none

### 2026-04-26
- session: 7m | peak ctx: 0% | compacts: 0
- tools: Bash×15, Read×9, Write×4, Agent×1, ToolSearch×1, ExitPlanMode×1, Edit×1
- corrections: none
- errors: none

### 2026-04-25
- session: 0m | peak ctx: 14% | compacts: 0
- tools: Read×9, Bash×4, Write×2, Edit×2
- corrections: none
- errors: none

### 2026-04-24
- session: 0m | peak ctx: 21% | compacts: 0 (mid-session)
- tools: Bash×3, Read×1
- corrections: none
- errors: exit code 1: command not found
