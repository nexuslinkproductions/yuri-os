# Skill Creation Checklist

Applies when: creating or editing files under `.claude/skills/`, `.claude/commands/`, or `.agents/skills/`.

## Required Steps

### 1. SKILL.md frontmatter
- `name`, `description`, `triggers` array — all present
- `description` is one line, specific enough for the skills index to route correctly

### 2. CLI alias verification (Patch 001)
For every `/short-alias` listed in `triggers:`, verify `commands/<alias>.md` exists.

```bash
ls .claude/commands/ | grep <alias>
```

If it doesn't exist, create it before claiming the trigger works. The `triggers` frontmatter controls Skill-tool routing. The `commands/` file controls CLI slash command routing. They are **independent** — both must be populated.

### 3. Claim verification before publishing (Patch 002)
Before writing "also invokable as `/X`" in any response or doc, run:

```bash
ls .claude/commands/ | grep X
```

If the file doesn't exist, either create it or qualify the claim as "via Skill tool only."

### 4. Session Notes section
Every SKILL.md must have a `## Session Notes` section. Populate the first entry with at minimum:
- date, tools used, corrections, errors, notes

### 5. Memory index
If the skill is significant (new protocol, new routing behavior, new global command), add an entry to `memory/MEMORY.md`.

### 6. Failure-anchored rules (prompt-as-firmware)
A discipline-enforcing rule in a SKILL.md should trace to a documented failure, not stand as a bare assertion. A rule's authority is its failure provenance plus its regression pointer, the claim-vs-evidence doctrine applied to skill rules.

Mark a hardened rule with an inline anchor comment:

```html
<!-- @anchor: v1 | failure: <dated ledger handle, e.g. FB:MIMO-PEER-LANE 2026-06-13> | regression: <feedback-*.md handle | test path | zenkai spec id> -->
```

- `failure:` binds to an existing ledger entry: one of the `.claude/memory/feedback-*.md` files or a `failure-evolution-loop`/zenkai output. Do not invent anchors.
- `regression:` points at what re-catches the failure (a memory handle, a test path, or a zenkai spec id).
- Bump the version (`v1`→`v2`) when the rule is re-hardened after a NEW violation.
- A rule with no failure behind it is allowed; mark it `@anchor: none` honestly rather than fabricating provenance.
- Anchors are advisory today (no validator yet); they are greppable for audit: `grep -rn '@anchor:' .claude/skills/`.

### 7. Anti-rationalization table (discipline skills)
A discipline-enforcing skill must resist the agent talking itself out of the discipline. Do NOT reinvent the mechanics. [`skills/writing-skills/SKILL.md`](../../skills/writing-skills/SKILL.md) already owns the authoritative how-to: "Build Rationalization Table" (`| Excuse | Reality |`), "Create Red Flags List", and the RED-GREEN-REFACTOR baseline loop (watch it fail → document the exact rationalizations → plug → re-verify).

This checklist adds only the YURI delta: each `| Excuse |` row should carry its Step-6 failure-anchor (the dated baseline-test or production miss the excuse came from), so the table is failure-anchored rather than hypothetical.

## Anti-patterns

- Do not list `/alias` triggers without the corresponding `commands/<alias>.md` file
- Do not claim a skill is "live" without verifying `ls .claude/skills/<name>/SKILL.md`
- Do not skip Session Notes — they are how the system learns from usage
- Do not ship a discipline rule with neither a Step-6 failure anchor nor an honest `@anchor: none`
