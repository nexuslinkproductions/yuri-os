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

## Anti-patterns

- Do not list `/alias` triggers without the corresponding `commands/<alias>.md` file
- Do not claim a skill is "live" without verifying `ls .claude/skills/<name>/SKILL.md`
- Do not skip Session Notes — they are how the system learns from usage
