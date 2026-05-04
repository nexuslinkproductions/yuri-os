# CLAUDE.md Alignment Report

**Audit Date**: 2026-05-04
**Lane**: YURI_CLAUDEMD_ORIGIN_ALIGNMENT_AUDIT
**Origin Source**: `_SYSTEM/yuri-origin.md` (canonical Yuri OS contract)
**advisory_only**: true
**local_truth_claim**: false

---

## Files Inspected

| Path | Lines | Role | Dirty |
|---|---|---|---|
| `./CLAUDE.md` | 113 | Repo-root CLAUDE.md — primary Claude session adapter | Yes (pre-existing) |
| `./.claude/CLAUDE.md` | 155 | Hidden Claude session guard (session-start, caveman, routing) | Unknown |
| `./_SYSTEM/yuri-origin.md` | 85 | Canonical Yuri OS origin | Clean |

## Origin Source Used

`_SYSTEM/yuri-origin.md` — sections: Authority Hierarchy, Output Contract, Mutation Contract, Protected Surfaces, Evidence Contract Grammar, Fused Swarm Timeout Doctrine, Safety/Gate Routing, Professional Operating Lenses, Lane Result Grammar.

## Primary Drift Findings — `./CLAUDE.md`

| # | Section | Status | Severity | Detail |
|---|---|---|---|---|
| 1 | INHERIT origin pointer | MISSING | CRITICAL | No `INHERIT: _SYSTEM/yuri-origin.md` line. Currently points to `CORE_PROTOCOL.md` (line 4-5). CLAUDE.md must inherit from origin per the architecture decision in 08CL_R1. |
| 2 | Authority hierarchy | MISSING | CRITICAL | No authority hierarchy exists. Origin defines: owner intent > local evidence > origin > tool adapters > rules > skills > model. CLAUDE.md has no equivalent. |
| 3 | Output contract | MISSING | MODERATE | Origin defines compact reports, no raw dumps, marker-only pass. CLAUDE.md has EOT output requirements but no general output contract. |
| 4 | Mutation contract | MISSING | CRITICAL | Origin defines no auto-commit, no silent escalation, scope writes, no broad git add. CLAUDE.md is silent on mutation policy. |
| 5 | Protected surfaces | MISSING | CRITICAL | Origin defines backend/data, .claude/state, .claude/history, .env as protected. CLAUDE.md is silent on protected surfaces. |
| 6 | Evidence contract grammar | MISSING | MODERATE | Origin defines TERM_COUNT/FILE_COUNT/MATCH grammar. CLAUDE.md is silent on evidence requirements. |
| 7 | Fused swarm timeout | MISSING | LOW | Origin defines 120s timeout, no GNU timeout. CLAUDE.md doesn't reference fused swarm. |
| 8 | EOT section (present) | ADDED | MODERATE | CLAUDE.md has an EOT section at lines 9-19. This is Claude-runtime-specific (references Haiku workers, `run_in_background`). It belongs in CLAUDE.md as a tool-specific section but conflicts with the Cline closeout mirror in .clinerules. |
| 9 | Agent coordination / Build loop / Adversarial loop | ADDED | MODERATE | Lines 21-58: parallel/sequential agent patterns, build loop, adversarial quality. These are Claude-runtime-specific (Agent() spawn, parallel tasks) and belong in CLAUDE.md as tool-specific doctrine. |
| 10 | Quality self-checks / GitNexus | ADDED | LOW | Lines 52-113: GitNexus impact analysis requirements. Claude-runtime-specific (MCP tools, Skill invocations). Belongs in CLAUDE.md as tool-specific. |
| 11 | CORE_PROTOCOL.md reference | DRIFTED | CRITICAL | Line 4-5: `Source of Truth: /Users/marcelspatz/nudimmud/CORE_PROTOCOL.md`. This path may not exist or may point to an external/esoteric file. Must be updated to reference `_SYSTEM/yuri-origin.md` instead. |

## Drift Findings — `./.claude/CLAUDE.md`

| # | Section | Status | Severity | Detail |
|---|---|---|---|---|
| 12 | INHERIT origin pointer | MISSING | MODERATE | No `INHERIT: _SYSTEM/yuri-origin.md` line. Should reference origin. |
| 13 | Authority hierarchy | MISSING | LOW | Has authority-related content (repo root, branch checks) but no formal hierarchy from origin. |
| 14 | Output contract (caveman) | ADDED | LOW | Caveman protocol (lines 47-53) is a compatible addition — it enforces compact output which aligns with origin's Output Contract. |
| 15 | Model routing (Sonnet/Haiku) | ADDED | LOW | Claude-runtime-specific model routing. Belongs in this adapter. |
| 16 | Tool routing discipline | ADDED | LOW | Local-first tool routing. Compatible addition. |
| 17 | Protected surfaces | MISSING | MODERATE | Missing explicit protected surface list from origin. |
| 18 | EOT section | ADDED | LOW | EOT with Haiku workers (line 143-155). Claude-runtime-specific. |

## Proposed Fixes

### CRITICAL (listed for approval before applying)

1. **`./CLAUDE.md`**: Replace `Source of Truth: /Users/marcelspatz/nudimmud/CORE_PROTOCOL.md` with `INHERIT: _SYSTEM/yuri-origin.md` at the top.
2. **`./CLAUDE.md`**: Add origin pointer line to authority chain. No deletion of existing content — only add the INHERIT line.
3. **`./CLAUDE.md`**: Add Protected Surfaces section (backend/data, .claude/state, .claude/history, .env) — 4 bullet points.
4. **`./CLAUDE.md`**: Add Mutation Contract section (no auto-commit, no silent escalation, scope writes) — 4 bullet points.
5. **`./CLAUDE.md`**: Remove CORE_PROTOCOL.md reference (it points to a potentially missing/external file) — replace with origin pointer.

### MODERATE (apply automatically)

6. **`./.claude/CLAUDE.md`**: Add `INHERIT: _SYSTEM/yuri-origin.md` line near top.

### LOW (apply automatically)

7. **`./CLAUDE.md`**: Add Output Contract hint (compact reports, no raw dumps).
8. **`./.claude/CLAUDE.md`**: Add Protected Surfaces section.

## Fixes Applied

| File | Fix | Severity | Status |
|---|---|---|---|
| `./CLAUDE.md` | Replace CORE_PROTOCOL.md ref with INHERIT pointer | CRITICAL | DEFERRED — listed for user approval |
| `./CLAUDE.md` | Add Protected Surfaces | CRITICAL | DEFERRED — listed for user approval |
| `./CLAUDE.md` | Add Mutation Contract | CRITICAL | DEFERRED — listed for user approval |
| `./CLAUDE.md` | Add Output Contract hint | MODERATE | DEFERRED — paired with CRITICAL |
| `./.claude/CLAUDE.md` | Add INHERIT pointer | MODERATE | PENDING — can apply |
| `./.claude/CLAUDE.md` | Add Protected Surfaces | LOW | PENDING — can apply |

## Fixes Deferred

All CRITICAL and MODERATE fixes for `./CLAUDE.md` are deferred pending user approval because:
- CLAUDE.md is pre-existing dirty (modified from committed state)
- The CORE_PROTOCOL.md reference must be resolved — is it an intentionally kept pointer or a broken experiment?
- Replacing content that references an external file requires user judgment
- Applying changes to a dirty file risks overwriting uncommitted local modifications

## Verification

```bash
git diff -- CLAUDE.md  # shows current dirty state
git diff --check       # no whitespace errors in existing changes
git status --short -- CLAUDE.md .claude/CLAUDE.md
```
