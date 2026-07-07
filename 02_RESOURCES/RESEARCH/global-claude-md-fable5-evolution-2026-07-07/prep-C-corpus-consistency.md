# Prep C — Cross-Repo Consistency Census

Investigation method: direct `read` of all 8 target files (working-tree state), `grep`/`glob` existence checks against the LIVE filesystem (never `.claude/worktrees/`), `git log`/`git diff`/`git status` against both YURI-OS-MUSUBI and YURI-BUSINESS repos independently. Snapshot: 2026-07-07.

## Verdict summary

| # | Check | Verdict |
|---|-------|---------|
| 1 | Jul-5 fix holding (lean @-includes) | **PASS**, with one same-day near-miss (already fixed) and one residual scope gap |
| 2 | Wayfinding script paths exist | **PASS** — all confirmed live |
| 3 | YURI-BUSINESS commit posture claim | **DRIFT** — global-file claim is stale and self-contradictory |
| 4 | Labs CLAUDE.md files load standalone | **PASS** — all 3, zero YURI-OS leakage |
| 5 | yuri-origin.md vs `.claude/CLAUDE.md`/persona.md Binding floor | **DRIFT** — 2 concrete gaps, 1 clean PASS |
| 6 | Verification-floor thinness / no reasoning-methodology section | **CONFIRMED** — premise accurate |

## 1. Jul-5 fix holding — PASS (near-miss already caught + one residual gap)

**CONFIRMED.** `.claude/CLAUDE.md` lines 1-2: `@~/YURI-OS-MUSUBI/SOUL.md` / `@~/YURI-OS-MUSUBI/_SYSTEM/persona.md`. No third `@` line, no project spine pull. Workspace map explicitly denies Labs sessions `_SYSTEM/Scripts/*`.

**CONFIRMED — the fix was already exercised once, same day as this audit:** `4267d5b7` (2026-07-06 00:18) landed the lean rework using *relative* `@../`-style imports, which resolved against the symlink's literal path — every Labs/YURI-BUSINESS session loaded via `~/.claude` silently dropped SOUL.md + persona.md entirely for ~39 hours (worse than the contamination it replaced: no identity at all, no error surfaced). Fixed by `3d19e151` (2026-07-07 15:31, absolute `~/YURI-OS-MUSUBI/...` paths) plus a new runtime guard `enforce-claude-symlink.mjs` wired into `.claude/settings.json:101` SessionStart. `readlink ~/.claude` confirmed live-correct.

**DRIFT (minor, scope-discipline gap):** Unlike "Finding your way through YURI" and "GitNexus" headings, which explicitly self-scope "(YURI repos)", the "Memory (two tracks)" section (lines 70-79) carries no scope qualifier — its default-routing rule (line 78, "Ambiguous → Track A") points every session, Labs included, at `_SYSTEM/Scripts/memory-kernel.mjs`, a path that doesn't exist outside YURI-OS/YURI-BUSINESS per the file's own Workspace-map rule. Smaller leak than the pre-fix full-spine pull, but a citable regression against the file's own stated discipline.

## 2. Wayfinding script paths — PASS, all confirmed live today

Every path in the "Finding your way through YURI" section (xref-query.mjs, capability-recall.mjs, `ai search`, propagation-scan.mjs, INDEX.md, context-registry.json, yuri-knowledge-graph.json, MEMORY.md) exists at its stated path. Other referenced scripts (memory-kernel.mjs, claude-memory-write.mjs, llm-compat-contract.mjs, lane-persona-map.mjs, yuri-closeout.mjs) all resolve too. No broken paths.

## 3. YURI-BUSINESS commit posture claim — DRIFT (stale, internally self-contradictory)

The claim in `.claude/CLAUDE.md` is FALSE. Line 26-27 and line 41-44 together assert both "extended to YURI-BUSINESS 2026-07-05" AND "the YURI-BUSINESS adapter still reads as a stale approval-gated fork" — self-contradictory within the same file.

CONFIRMED by direct read of `/Users/marcelspatz/YURI-BUSINESS/CLAUDE.md`: its Execution Rules (line 168) is byte-identical to YURI-OS-MUSUBI's own direct-commit language. CONFIRMED by YURI-BUSINESS's own independent git history: `d7af8926` (2026-06-14 17:12) landed the direct-commit governance upgrade in YURI-BUSINESS itself — the very date the global file claims it was still missing. `git status --porcelain` in YURI-BUSINESS shows CLAUDE.md is not dirty (committed, live state).

The two adapters differ ONLY in the "Standing Operating Model" section (4 lines): YURI-OS-MUSUBI's local uncommitted copy has the v2 2026-07-06 three-substrate opus-fleet model; YURI-BUSINESS is still on the 2026-07-04 two-substrate version. Every other line — Execution Rules, Protected Paths, Launch Shape, Adversarial Verification, direct-commit clause — is identical.

**Net finding:** YURI-BUSINESS's adapter is not a "stale pre-06-14 fork" and is not "approval-gated" — that's stale prose from before 06-14. The one real, narrow staleness is the missing 07-06 opus-fleet v2 dispatch-substrate refresh (dispatch model only, NOT commit authority). The global file's Authority & mutation section needs its language corrected on this point.

## 4. Labs CLAUDE.md standalone load — PASS, all 3, zero leakage

Full read + targeted grep (`_SYSTEM|yuri-origin|xref-query|capability-recall|propagation-scan|SOUL\.md|gitnexus_|YURI-OS|yuri-knowledge-graph`) across all three: zero matches.
- career-ops (369 lines): all internal references confirmed present (DATA_CONTRACT.md, skill SKILL.md, update-system.mjs).
- dictionary-of-ai-coding (22 lines): references `internal/CONTEXT.md` and `internal/adr/`, which don't yet exist — CONFIRMED this is an intentional lazy-creation convention explicitly documented in `internal/domain.md:10`, not drift.
- impeccable (303 lines): all internal references confirmed present.
- Labs/codeburn/CLAUDE.md — confirmed absent.

## 5. yuri-origin.md cross-check — DRIFT (2 concrete gaps) + 1 clean PASS

**(a) Authority Hierarchy — soft compression, not hard contradiction.** yuri-origin.md's 8-rank hierarchy vs. `.claude/CLAUDE.md`'s 6-item cross-project compression describe different axes (content-category rank within YURI-OS vs. file-layer rank across all projects); "the project's CLAUDE.md" is ambiguous read literally but resolves correctly under the intended (loaded, @-inclusive) reading. Low-priority precision gap.

**(b) Protected Surfaces — genuine gap, DRIFT.** yuri-origin.md's canonical list (12 entries) is missing `.amp/`, which BOTH `.claude/CLAUDE.md:55-57` and root `CLAUDE.md` independently list and which is a real, deliberately-gitignored path (`.gitignore:185`). Per yuri-origin.md's own precedence rule ("keep it in the narrowest correct home"), yuri-origin.md is the authoritative home and is the one that's behind — the two adapters are silently correct, the canonical source needs the addition.
  - Bonus: root CLAUDE.md's own local Protected Paths section is narrower than canonical (missing `.claude/file-history/` + all four `.claude/projects/*/...` entries) — since it @-includes yuri-origin.md, the fuller list still governs in practice, but a session skimming only the local section would under-count.

**(c) Self-Governance Charter — PASS, correctly kept in narrowest home.** persona.md's Binding floor states only the behavioral consequence ("HIGH/CRITICAL risk → owner approval first"), not the full charter logic — correct DRY discipline, no drift.

**(d) Secondary DRY observation (not drift, no disagreement):** the git-mechanics rule (pathspec-only, never `git add .`, checks green + `git show --stat`, fetch+rebase never force) is restated verbatim in substance in all three files (yuri-origin.md, `.claude/CLAUDE.md`, persona.md) — a 3-way restatement yuri-origin.md's own Canonical Shape rule argues against. Low priority.

**(e) Minor precision gap:** yuri-origin.md:177 references `yuri_operating_dna.md` as a bare filename; actual path is `.claude/rules/yuri_operating_dna.md` (confirmed present, referenced correctly elsewhere).

## 6. Verification-floor thinness / no reasoning-methodology section — CONFIRMED

The assignment's premise is accurate. Scanning the full 115-line `.claude/CLAUDE.md`: Identity & persona, Workspace map, Authority & mutation, Protected paths, Launch shape, Model use, Memory, Wayfinding, GitNexus, Verification floor. None describe a reasoning *process* (decomposition, hypothesis generation, alternative-path comparison, confidence calibration). "Verification floor" is exclusively post-hoc output-checking.

`persona.md` DOES carry richer cognitive-methodology content ("Cognitive operating base," the 8-step "decode pipeline") but this is explicitly Marcel-input-decoding and persona-flavored (its own header: "Do NOT ship as default"), not a general-purpose reasoning-under-uncertainty discipline that travels cleanly to a non-Yuri-persona session. Genuine, currently-unfilled gap between "decode the user's brain dump" (rich) and "reason rigorously toward a correct answer, then verify it" (4 lines, output-checking only) — exactly the gap the Fable-5 pass should close. Which file is the right home (extend Verification floor in global vs. extend Cognitive operating base in persona) is a design call for that pass.

### Verbatim: current `.claude/CLAUDE.md` → "Verification floor" section

```
## Verification floor (every project)

First-run success is a hypothesis, not proof. Attack the result before calling it ready; run the
smallest meaningful checks including negative/mismatch ones; verify against live runtime, not
comments or happy-path output. End non-trivial work with: changed files, checks run, residual risk.
Model output (mine included) is advisory until local evidence verifies it.
```

## Consolidated action list for the Fable-5 pass

1. `.claude/CLAUDE.md:70-79` — scope-qualify the "Memory" section's Track A pointer the same way Wayfinding/GitNexus are scoped, or explicitly carve out Labs from the `_SYSTEM/Scripts/memory-kernel.mjs` default.
2. `.claude/CLAUDE.md:26-27,41-44` — correct the YURI-BUSINESS commit-posture claim: not a stale/approval-gated fork; if a staleness note is wanted, scope it to the missing 07-06 opus-fleet v2 dispatch-substrate refresh only.
3. `_SYSTEM/yuri-origin.md:46-61` — add `.amp/` to the canonical Protected Surfaces list.
4. Root `CLAUDE.md:155-162` (bonus, adjacent) — complete its local Protected Paths list or replace with a pointer.
5. `.claude/CLAUDE.md` "Verification floor" — the confirmed real target for the reasoning-methodology expansion.
6. No broken script/tool paths found anywhere in scope — nothing to repair there.
