# MASTER PROMPT — YURI Structure Refactor
## For Claude Code (Opus 4.7) → DeepSeek Workhorse Swarm

---

## YOUR ROLE

You are Opus 4.7 at xhigh reasoning. Your job is EXACTLY three things:

1. **Plan** — read the context below, do one deep verification pass of the actual filesystem, refine the plan
2. **Prompt** — write the precise execution instructions for each task
3. **Delegate** — spawn a DeepSeek V4 workhorse for each independent task, then validate

**You do NOT touch files yourself.** Every file operation goes through a workhorse. You are the conductor, not the musician.

**Token discipline:** No preamble, no "Great question", no rephrasing. Start with the verification pass, output the plan, spawn workhorses, validate. Done.

---

## CONTEXT: Current State (from forensic analysis)

### Root Directory — 30+ items (target: 7):

```
YURI/
├── [NUMBERED CORE — the intended skeleton]
│   ├── 00_COMMAND-CENTER/
│   ├── 01_PROJECTS/          ← 18 mixed items
│   ├── 02_AREAS/
│   ├── 04_FINANCE/           ← gap: 03 missing
│   ├── 05_NEXUS-LINK/
│   ├── 06_KNOWLEDGE-BASE/
│   ├── 06_NETWORK-SYNC/     ← duplicate 06
│   └── 07_ARCHIVE/
│
├── YURI/                 ← FULL DUPLICATE (848 subdirs)
├── NABU/                     ← agent dir, status unclear
├── NISABA/                   ← agent dir, ingestion system
│
├── src/                      ← React/Vite app
├── backend/                  ← has own node_modules + dist
│
├── RESEARCH/                 ← knowledge artifacts at root
├── graph/                    ← 5,349 auto-generated .md files
├── graphify-out/             ← multiple stale report versions
│
├── [DEAD ARTIFACTS]
│   ├── backend.log / backend_path_check.log / backend_root_check.log / backend_startup.log / backend_final.log / backend_path_check_final.log / backend_root_check_2.log
│   ├── Claude Code URL Handler.app/
│   ├── DOMAIN EXPANSION - INFINITE VOID/
│   ├── GeneratedContent/
│   ├── _SYSTEM/Scripts/
│   ├── Volumes/
│   ├── bin/
│   └── backend.log (root level)
│
├── .gitignore, package.json, AGENTS.md, SOUL.md, etc.
└── FRAMER_MCP/               ← new, fine where it is
```

### Critical Numbers:
- **173** source files
- **5,349** auto-generated graph/ files (not gitignored)
- **848** subdirectories in the YURI/ mirror
- **30+** root-level items

### Git status: `.env` is gitignored. `graph/` is NOT gitignored. `dist/` and `node_modules/` at root need checking.

---

## THE GOAL

A YURI root that:
- Has **7±2 top-level items** (numbered core + config files + framework extensions)
- Has **no duplicate trees**
- Has **no dead artifacts**
- Has **auto-generated files gitignored**
- Is **ready to clone and use on another device** without manual cleanup
- Preserves **ALL content** — nothing lost, only moved/cleaned

---

## THE PLAN

### Phase 1 — Verifications (Opus only, 1 pass)

1. Check `.gitignore` — is `graph/` listed? `dist/`? `node_modules/`?
2. Check `NUDIMMOD/` nested — what extra content does it have that root doesn't? (`03_RESOURCES` is one)
3. Check `NABU/` and `NISABA/` — any unique content?
4. Check dead artifact dirs — any non-expendable content?
5. Read `package.json` — is there a `clean` or `build` script that needs updating?

### Phase 2 — Independent Tasks (DeepSeek workhorse swarm, parallel)

These are independent. Each gets its own workhorse.

| # | Task | Action | Risk |
|---|------|--------|------|
| 1 | **Gitignore `graph/`** | Add `graph/` to `.gitignore` | None — cache artifacts |
| 2 | **Merge NUDIMMOD/ mirror** | `cp -r` any unique content to root, `rm -rf NUDIMMOD/` | HIGH — verify unique content first |
| 3 | **Delete dead artifacts** | `rm` dead files listed above | MEDIUM — check each first |
| 4 | **Move RESEARCH/ under KB** | `mv RESEARCH/ 06_KNOWLEDGE-BASE/RESEARCH/` | LOW |
| 5 | **Clean graphify-out/** | Keep latest report, archive rest to `07_ARCHIVE/graph-reports/` | LOW |
| 6 | **Fix numbering** | Rename `06_NETWORK-SYNC` → `07_NETWORK-SYNC`, `07_ARCHIVE` → `08_ARCHIVE` | MEDIUM — update any cross-refs |
| 7 | **Structure 01_PROJECTS/** | Convert flat `.md` files into project dirs with READMEs | MEDIUM — needs judgment |

### Phase 3 — Consolidation (Opus validates, then final DeepSeek pass)

8. **Final .gitignore audit** — ensure it's comprehensive
9. **Root tree verification** — count root items, confirm ≤9

---

## EXECUTION INSTRUCTIONS

### How to spawn a workhorse

For each task, use:

```
/spawn /deepseek-workhorse
Task: [exact task description]
Paths: [exact paths, no ambiguity]
Commands: [exact shell commands to run]
Verification: [exact criteria to check after]
```

Each workhorse must:
1. Print a summary of what it will do
2. Execute the exact commands given
3. Verify the result
4. Report back success/failure with evidence

### Workhorse swarm independence

Tasks 1-7 above are fully independent. Spawn them all in parallel. Only Task 6 (renumbering) might affect Task 8 (final audit), so order those if needed.

### Critical constraints

- **NEVER delete user-created content** — only dead artifacts, cache files, and the NUDIMMOD/ mirror (once verified)
- **PRESERVE every file in 01_PROJECTS/** — only restructure, don't delete
- **PRESERVE every reference image** in RESEARCH/
- **If unsure about a file, flag it and skip** — better to leave a dead file than delete something meaningful
- **After the mirror is removed**, update AGENTS.md or any config that references the old path

---

## ACCEPTANCE CRITERIA

After all workhorses report success, run:

```bash
cd /Users/marcelspatz/YURI-OS-MUSUBI
echo "=== Root items ===" && ls -d */ 2>/dev/null | wc -l
echo "=== graph/ files ===" && find graph/ -type f 2>/dev/null | wc -l || echo "graph/ removed"
echo "=== NUDIMMOD/ exists? ===" && test -d NUDIMMOD && echo "STILL EXISTS — FAIL" || echo "REMOVED — OK"
echo "=== Dead files ===" && ls backend*.log Claude\ Code\ URL\ Handler.app/ DOMAIN\ EXPANSION\ -\ INFINITE\ VOID/ GeneratedContent/ _SYSTEM/Scripts/ Volumes/ bin/ 2>&1 | head -5
echo "=== RESEARCH under KB ===" && test -d 06_KNOWLEDGE-BASE/RESEARCH && echo "OK" || echo "NOT MOVED"
echo "=== Numbering ===" && ls -d [0-9]*/ 2>/dev/null | sort
```

**All checks must pass. If any fail, fix and retry.**

---

## FINAL WORDS

This is a structure refactor. The goal is not to redesign YURI — it's to clean, clarify, and compress the existing structure so it ships cleanly.

After this executes successfully:
- The repo is cloneable and functional on another Mac, zero manual cleanup
- Every file has a clear home
- Auto-generated chatter is gitignored
- The numbered skeleton (00-07/08) is the source of truth

**Execute with precision. No wasted motion.**
