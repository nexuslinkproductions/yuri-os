# MASTER PROMPT v3 — NUDIMMUD Structure Refactor (Phase 2)
## For Claude Code (Opus 4.7 xhigh) → DeepSeek Workhorse Swarm

---

## YOUR ROLE

You are Opus 4.7 at xhigh reasoning. Your job is three things:

1. **Verify** — read the forensic report at `STRUCTURE_REFACTOR_REPORT.md` and the current filesystem state
2. **Plan** — produce a precise execution plan for the remaining work
3. **Delegate** — spawn DeepSeek V4 workhorses for each independent task, validate results

**You do NOT touch files yourself.** You plan, prompt, and validate. Every file operation runs through a workhorse.

**Token discipline:** No preamble, no rephrasing. Start with verification, output plan, spawn workhorses, validate.

---

## CONTEXT: Phase 1 Results

Phase 1 (Opus, May 7) completed:
- ✅ `.gitignore` hardened (`graph/`, `*.log`, `_QUARANTINE_*`)
- ✅ `03_RESOURCES/` created (numbering gap filled)
- ✅ Logs quarantined → `_QUARANTINE_2026-05-07/root-logs/`
- ✅ Refactor script written: `_SYSTEM/Scripts/structure-refactor-2026-05-07.sh` (dry-run default)
- ✅ Corrected v2 prompt written
- ✅ Forensic report written: `STRUCTURE_REFACTOR_REPORT.md`

**Phase 1 discovered:** The original master prompt misclassified live infrastructure as "dead artifacts":
- `_SYSTEM/Scripts/` = live launch + offload + trading-bot pipeline (NOT dead)
- `bin/` = claude wrapper + design-audit (NOT dead)
- `Volumes/` = T7 SSD sync mount (NOT dead)
- `GeneratedContent` = symlink to `/Users/marcelspatz/GeneratedContent` (rm -rf would follow the link on some platforms)
- `Claude Code URL Handler.app` = macOS claude:// deep-link handler (registered in Launch Services)
- `DOMAIN EXPANSION - INFINITE VOID/` = archived domain content tied to active skills

**Phase 1 also discovered:** The `NUDIMMD/` mirror is NOT a clean duplicate. It has 38 diverged files (same path, different content) and 50+ unique documents not present at root. Deletion requires manual diff review first.

---

## PHASE 2 PLAN — 5 Independent Tasks

### Task A: Untrack graph/ from git
`graph/` is now gitignored (line 114) but still tracked in git (6,655 files in history).
```bash
git rm -r --cached graph/
git commit -m "chore: stop tracking auto-generated graph/ artifacts"
```

### Task B: Generate mirror diff manifest
The mirror has 38 diverged files and ~50 unique documents. Before deletion can happen, produce a complete inventory:
```bash
# List all unique files in mirror not at root
cd /Users/marcelspatz/YURI-OS-MUSUBI
diff -rq NUDIMMUD/ . --exclude=node_modules --exclude=.git 2>/dev/null | grep "Only in NUDIMMUD" > _QUARANTINE_2026-05-07/mirror-unique-files.txt
# Show size + date for each diverged file
diff -rq NUDIMMUD/ . --exclude=node_modules --exclude=.git 2>/dev/null | grep "differ" > _QUARANTINE_2026-05-07/mirror-diverged-files.txt
wc -l _QUARANTINE_2026-05-07/mirror-diverged-files.txt
wc -l _QUARANTINE_2026-05-07/mirror-unique-files.txt
```

### Task C: Run the existing refactor script (safe operations only)
The script `_SYSTEM/Scripts/structure-refactor-2026-05-07.sh` handles non-destructive moves:
```bash
APPLY=1 bash _SYSTEM/Scripts/structure-refactor-2026-05-07.sh
```
This quarantines remaining logs, renumbers `06_NETWORK-SYNC` → `07_NETWORK-SYNC` if safe.

### Task D: Archive stale graphify-out/ reports
```bash
mkdir -p 07_ARCHIVE/graph-reports
find graphify-out/ -maxdepth 1 -name "*.md" ! -name "GRAPH_REPORT.md" -exec mv {} 07_ARCHIVE/graph-reports/ \;
```

### Task E: Clean ._ AppleDouble files from quarantine
If any remain:
```bash
find . -name "._*" -type f 2>/dev/null | grep -v ".git" | while read f; do mv "$f" _QUARANTINE_2026-05-07/macos-metadata/; done
```

---

## WHAT NOT TO TOUCH (corrected from v1)

These are LIVE INFRASTRUCTURE — do not move, delete, or touch:
- `_SYSTEM/Scripts/` — launch pipeline
- `bin/` — claude wrapper
- `Volumes/` — T7 SSD mount
- `GeneratedContent` — external symlink
- `Claude Code URL Handler.app` — macOS deep-link handler
- `DOMAIN EXPANSION - INFINITE VOID/` — archived domain content

These require HUMAN DECISION — do not touch:
- `NUDIMMD/` mirror (until diff manifest reviewed by user)
- `RESEARCH/` (cross-refs in CLAUDE.md block clean move)
- `01_PROJECTS/` flat files (4 .md files — user decides on wrapping)

---

## EXECUTION

Each task is independent. Spawn workhorses in parallel.

Workhorse instructions template:
```
/spawn /deepseek-workhorse
Task: [task name from above]
Working directory: /Users/marcelspatz/YURI-OS-MUSUBI
Commands:
  [exact commands to run]
Verification:
  [exact check to confirm success]
```

## ACCEPTANCE CRITERIA

After all workhorses report, verify:

```bash
echo "=== git untrack graph/ ===" && git ls-files graph/ | wc -l
echo "=== mirror manifest generated ===" && wc -l _QUARANTINE_2026-05-07/mirror-diverged-files.txt _QUARANTINE_2026-05-07/mirror-unique-files.txt 2>/dev/null
echo "=== renumbering executed ===" && ls -d 0*/ | sort
echo "=== graphify-out archived ===" && ls 07_ARCHIVE/graph-reports/ 2>/dev/null | wc -l
echo "=== AppleDouble cleaned ===" && find . -name "._*" -not -path "./.git/*" -not -path "./_QUARANTINE/*" 2>/dev/null | wc -l
```

---

## CRITICAL RULES

1. **NO destructive operations.** No `rm -rf` of any directory at root. Move to quarantine, don't delete.
2. **If a command would delete user data, SKIP and flag it.**
3. **After `APPLY=1 bash _SYSTEM/Scripts/structure-refactor-2026-05-07.sh`**, check that the script completed fully. If it was blocked by permissions, report what was blocked.
4. **Report back with evidence** — file counts before/after, verification check results.
