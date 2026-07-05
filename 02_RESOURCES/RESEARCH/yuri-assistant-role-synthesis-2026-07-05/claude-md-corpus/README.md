# CLAUDE.md Corpus Package — Fable 5 Input

## What This Is

A read-only evidence pack of 12 load-bearing CLAUDE.md files from Marcel's machine, prepared for a Fable-5 overseer that will analyze the corpus and forge an improved global CLAUDE.md. All files exist; symlink chains verified; no missing @-includes in load-bearing set.

## Contents

**12 CLAUDE.md files** (~1,787 lines total):
- 4 from YURI-OS-MUSUBI (main project + research/tools subdirs)
- 3 from YURI-BUSINESS (business sibling)
- 3 from Labs (standalone career-ops, impeccable design, dictionary-of-ai)
- 1 global (symlink target, session guard)
- 1 diagnostic catalog

**CORPUS-CATALOG.md** (314 lines):
- File inventory + line counts
- @-include chain resolution (all clean)
- 8 GOOD practices worth preserving
- 7 QUESTIONABLE practices (habit-baked red flags)
- Cross-file conflicts matrix
- Fable handoff brief (3 critical findings)

## Findings Summary

### Critical (Fable Must Resolve)
1. **Authorization Model Collision:** YURI-OS says "commit direct"; YURI-BUSINESS says "don't commit." Contradictory authority, no acknowledged divergence.
2. **200 Lines Systematic Redundancy:** Session guard, memory v3 architecture, read-order sequences copied across 4–6 files. Stale-drift risk.
3. **Tool Name Ambiguity:** `xref-query.mjs` vs `context-router.mjs` used interchangeably; unclear if same tool or different tools used in different phases.

### Medium (Cleanup Priority)
- Memory v3 architecture detail duplicated in 2 files (67 lines).
- "Read Order" context loading sequence diverged between YURI-OS and YURI-BUSINESS.
- Persona rules over-specified across 3 files + 3 external sources (fragile).
- Codex/Rick tmux references (project-specific; may be stale).

### Low (Design Choices, Not Bugs)
- Labs projects are isolated (no @-includes to YURI). By design or oversight?
- Stub CLAUDE.md files in 00_COMMAND-CENTER (same 10 lines, 2 instances).

## Recommended Fable Output

A **clean global CLAUDE.md** (~100 lines) that:
1. States session guard + @-includes SOUL.md + yuri-origin.md
2. Resolves authorization boundary (owner decision: self-governed or approval-gated?)
3. Clarifies tool routing (xref-query vs context-router, when each)
4. Removes all redundancy (session guard, memory detail, persona rules moved to dedicated .rules files)

**Satellite .claude/rules/** (~8 files, one canonical each):
- `session-guard.md`
- `research-protocol.md` (xref + capability-recall + read order)
- `memory-v3-architecture.md`
- `authorization-model.md` (owner choice)
- `protected-paths.md`
- `mutation-contract.md`
- `model-selection.md`
- `gitnexus-impact-protocol.md`

**Per-project adapters** (~20 lines each):
- Local `.claude/CLAUDE.md` @-includes global + project context registry.
- Labs projects clarified (standalone or YURI-integrated).

## Symlink Note

`~/.claude` is a symlink to `/Users/marcelspatz/YURI-OS-MUSUBI/.claude` (verified). This means:
- Global CLAUDE.md lives in YURI-OS-MUSUBI/.claude/
- All Claude Code sessions resolve it first
- Other projects have LOCAL .claude/CLAUDE.md adapters

The symlink is correct and intentional.

## How Fable Should Read This

1. **Start with CORPUS-CATALOG.md** (diagnostic summary).
2. **Spot-check the 3 critical findings** against the actual file pairs listed.
3. **Review the GOOD practices** (lines 8A–8H) and keep them in the improved version.
4. **Review the QUESTIONABLE practices** (lines 9A–9G) and decide what to consolidate.
5. **Output a specification** for the improved global CLAUDE.md structure (100 lines + 8 satellite files).

## Not Included (Read-Only Constraint)

- Actual content of `_SYSTEM/yuri-origin.md`, `SOUL.md`, `_SYSTEM/persona.md` (referenced, but loaded separately at session start)
- Git history, blame, or change logs (raw machine audit, not needed for spec work)
- Interactive testing (Fable should generate a specification, not run it)

---

**Package Date:** 2026-07-05  
**Machine:** /Users/marcelspatz/ (macOS)  
**Audit Depth:** Load-bearing files only; excluded worktree/backup/cache duplicates  
**Chain Verification:** All @-includes resolved; 0 missing files in load-bearing set
