---
name: Session Lifecycle System
description: Autonomous compact + learning extraction system built in Apr 2026 — tiers, journaling, skill notes, /reflect
type: project
originSessionId: 384c56e1-bbdb-42bd-a85e-d93752b40123
---
Implemented autonomous session lifecycle system across `.claude/hooks/`.

**Why:** Context% checks in pre-tool-use.js were silently failing (always 0). Three hooks existed but weren't wired in settings.json. Sessions had no learning loop.

**What was built:**
- `session-state.js` — shared atomic r/w module for `.claude/state/session-state.json`
- `session-reflect.js` — learning extraction: appends session notes to SKILL.md, writes `memory/session-journal.md`, updates MEMORY.md
- `token-session-init.js` — now wired in settings.json SessionStart; initializes session-state.json with git branch
- `token-status.js` — writes real context% to session-state.json on every statusLine tick (±1% threshold)
- `pre-tool-use.js` — 4-tier compact dispatch: Tier 0 (<55% silent), Tier 1 (55-65% log), Tier 2 (65-78% soft prompt), Tier 3 (78-88% hard), Tier 4 (≥88% critical + early extraction)
- `post-tool-use.js` — tracks all tools, errors, file writes, skill reads into session-state.json
- `nisaba-on-stop.js` — calls session-reflect.js after writeObservation()
- `.claude/commands/reflect.md` — `/reflect` slash command

**How to apply:** When debugging hooks or extending the lifecycle system, start from session-state.js and session-reflect.js. The tier thresholds are in pre-tool-use.js getTier(). Skill notes go to `.claude/skills/{name}/SKILL.md` under `## Session Notes`.
