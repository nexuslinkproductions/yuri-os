# 🧠 Claude Code — 4-Layer Memory System

> A persistent memory setup for Claude Code that keeps context across sessions.
> Your `primer.md` lives here in Obsidian so you can read and edit it anytime.

---

## How It Works

Claude Code has no memory between sessions by default. This system gives it 4 persistent layers:

| Layer | File | Purpose |
|-------|------|---------|
| 1 | `~/.claude/CLAUDE.md` | Global rules + imports primer.md |
| 2 | `primer.md` *(this vault)* | Running state — what's active, what's next |
| 3 | `memory.sh` | Injects git context + primer into each session |
| 4 | `.claude-memory.md` *(per project)* | Auto-logged commit history via git hook |

---

## Setup (One Time)

Run this in Terminal:

```bash
bash ~/Documents/"Obsidian Vault"/"Claude Memory"/setup.sh
```

That's it. It creates `~/.claude/CLAUDE.md` and wires everything to this vault.

---

## Per-Project Setup

For each new project, do these two things:

### 1. Copy memory.sh into the project

```bash
cp ~/Documents/"Obsidian Vault"/"Claude Memory"/memory.sh /path/to/your/project/
```

### 2. Add the git hook (auto-logs every commit to `.claude-memory.md`)

```bash
nano /path/to/your/project/.git/hooks/post-commit
```

Paste this:

```bash
#!/bin/bash
echo "$(date '+%Y-%m-%d %H:%M') | $(git log -1 --oneline)" >> .claude-memory.md
```

Then make it executable:

```bash
chmod +x /path/to/your/project/.git/hooks/post-commit
```

### 3. Add a project-level CLAUDE.md

In your project root, create `CLAUDE.md`:

```markdown
@~/.claude/primer.md
@.claude-memory.md

## PROJECT CONTEXT
Client: [name]
Stack: [your stack]
```

---

## Starting a Session

```bash
cd /path/to/your/project
./memory.sh
```

Or with a specific prompt:

```bash
./memory.sh "review what we have and suggest the next task"
```

**First time only** — after `memory.sh` runs, tell Claude:

> write the primer now: current project, what we did, exact next step, any blockers

After that, Claude rewrites `primer.md` automatically at the end of every session.

---

## Files in This Folder

| File | Description |
|------|-------------|
| `primer.md` | ✏️ Live memory state — Claude rewrites this each session |
| `memory.sh` | Template script — copy into each project |
| `setup.sh` | One-time setup script — run once, then ignore |
| `README.md` | This file |

---

## Tips

- You can **edit `primer.md` directly** in Obsidian to correct or update Claude's context
- `primer.md` should stay under **100 lines** — Claude enforces this
- The `[UNCLEAR]` flag in responses means Claude hit something ambiguous — check primer.md
- Each project gets its own `.claude-memory.md` commit log in the project folder

---

*Setup based on the Claude Code 4-Layer Memory guide by @dailykeshav*
