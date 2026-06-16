---
name: write-a-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
---

# Writing Skills

## Process

1. **Gather requirements** - ask user about:
   - What task/domain does the skill cover?
   - What specific use cases should it handle?
   - Does it need executable scripts or just instructions?
   - Any reference materials to include?

2. **Draft the skill** - create:
   - SKILL.md with concise instructions
   - Additional reference files if content exceeds 500 lines
   - Utility scripts if deterministic operations needed

3. **Review with user** - present draft and ask:
   - Does this cover your use cases?
   - Anything missing or unclear?
   - Should any section be more/less detailed?

## Skill Structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if needed)
├── EXAMPLES.md        # Usage examples (if needed)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

## SKILL.md Template

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced features

[Link to separate files: See [REFERENCE.md](REFERENCE.md)]
```

## Description Requirements

The description is **the only thing your agent sees** when deciding which skill to load. It's surfaced in the system prompt alongside all other installed skills. Your agent reads these descriptions and picks the relevant skill based on the user's request.

**Goal**: Give your agent just enough info to know:

1. What capability this skill provides
2. When/why to trigger it (specific keywords, contexts, file types)

**Format**:

- Max 1024 chars
- Write in third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"

**Good example**:

```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad example**:

```
Helps with documents.
```

The bad example gives your agent no way to distinguish this from other document skills.

## When to Add Scripts

Add utility scripts when:

- Operation is deterministic (validation, formatting)
- Same code would be generated repeatedly
- Errors need explicit handling

Scripts save tokens and improve reliability vs generated code.

## When to Split Files

Split into separate files when:

- SKILL.md exceeds 100 lines
- Content has distinct domains (finance vs sales schemas)
- Advanced features are rarely needed

## Review Checklist

After drafting, verify:

- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md under 100 lines
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep

## Session Notes

### 2026-06-16
- session: 183m | peak ctx: 0% | compacts: 0
- tools: Bash×400, Read×122, Edit×62, Write×19, WebSearch×19, Agent×10, WebFetch×8, ToolSearch×5, TodoWrite×4, ExitPlanMode×3, AskUserQuestion×2, Workflow×1, Skill×1
- corrections: none
- errors: none

### 2026-06-15
- session: 136m | peak ctx: 0% | compacts: 0
- tools: Bash×272, Read×67, Edit×26, WebSearch×19, Write×9, WebFetch×8, Agent×7, ToolSearch×5, ExitPlanMode×2, TodoWrite×2, AskUserQuestion×1, Workflow×1
- corrections: Base directory for this skill: /Users/marcelspatz/.claude/skills/cross-reference-navigation

# Cross-Reference Navigation (XREF)

The GROUND step of the work loop, made reflexive. One question asked a | Base directory for this skill: /Users/marcelspatz/.claude/skills/quantum-hypothesis-simulation

# Quantum Hypothesis Simulation

The quantum-probability layer for YURI's claim/pulse machinery. It mode | Base directory for this skill: /Users/marcelspatz/.claude/skills/cross-reference-navigation

# Cross-Reference Navigation (XREF)

The GROUND step of the work loop, made reflexive. One question asked a
- errors: none
