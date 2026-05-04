# .cline/ — Cline Repo-Local Control Folder

Repo-owned human-readable reference material for Cline behavior.

## What belongs here

- `.md` prompt templates and procedure references
- Compact rule mirrors adapted for Cline (no Claude skill runtime)
- Command contracts for repo scripts (closeout, workhorse, bridge)
- `.gitignore` excludes auto-generated content only

## What must NOT belong here

- Cline app runtime data, settings, state, session logs, history
- Secrets, API keys, `.env`, `.npmrc`
- Task logs, agent session state, generated worktrees (see `kanban/` — gitignored)
- Personal or per-developer configuration

## Authority

`.clinerules` is the compact behavioral authority.
`.cline/` is the reference library — detailed docs that `.clinerules` points to.
Do not duplicate long behavior rules in `.clinerules`; reference them here instead.
