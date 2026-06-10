---
name: claude-dir-symlink-home-into-repo
description: ~/.claude is a SYMLINK into YURI-OS-MUSUBI/.claude — all Claude Code state physically lives inside the repo; the home-folder path is just an alias
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - .claude location
    - ~/.claude
    - symlink
    - users folder
    - memory location
    - settings.json doubled warning
    - MultiEdit
  refs: 
    - feedback-clean-structure-no-clutter
  originSessionId: 45e5ce70-e8d5-4833-add2-2883359ee4a1
---

FACTS
- `/Users/marcelspatz/.claude` —isSymlink→ `/Users/marcelspatz/YURI-OS-MUSUBI/.claude` (created 2026-05-17). The repo `.claude` is the REAL directory (inode 59124334, 287 git-tracked files); `~/.claude` only resolves through it.
- Claude Code —hardcodes— its config root as `$HOME/.claude` and writes there; the symlink redirects every write (config, skills, hooks, memory, session transcripts) physically INTO the YURI repo. Printed `~/.claude/...` paths are aliases — nothing is stored loose in home.
- Claude Code —loadsSettingsTwice— as project (`<cwd>/.claude/settings.json`) AND user (`$HOME/.claude/settings.json`); via the symlink both resolve to the SAME physical file → one orphaned permission rule prints its warning twice. (Corrects an earlier note that called this a per-file hardlink — it is the directory symlink.)
- gitTracked under .claude (287 files) = behavior-defining config: settings.json, agents/, skills/, commands/, hooks/, rules/, CLAUDE.md. gitIgnored = volatile state: projects/ (~1.1 GB, ALL machine sessions), state/, file-history/, shell-snapshots/, sessions/, worktrees/, plans/, eot/.
- stillTrackedButVolatile (probably should be gitignored): `.claude/history`, `.claude/telemetry`, `.claude/tasks` — these generate the recurring git-status churn.
- MultiEdit tool —removedIn— Claude Code 2.1.x → any `MultiEdit()` permission rule warns "matches no known tool"; the orphan rules were cleaned 2026-06-09.

IMPLICATION
- "Why is Claude state in my users folder?" → it is NOT; `~/.claude` is a doorway into YURI. The "everything inside YURI" plan has been satisfied since 2026-05-17. Don't try to "move memory into the repo" — it is already there.
- Side effect to weigh: because the GLOBAL config is symlinked into ONE repo, every project on the machine (NUDIMMUD, /Volumes/T7, …) pools its sessions into `YURI/.claude/projects/`. Gitignored (no commit), but it bloats the working tree and couples all-machine Claude continuity to this repo's path — move/rename YURI and every project's Claude state breaks.
- Real cleanup levers (not "relocation"): (a) decide whether whole-machine session pooling into YURI is intended; (b) gitignore the 3 leaking volatile dirs.

SEE [[feedback-clean-structure-no-clutter]]
