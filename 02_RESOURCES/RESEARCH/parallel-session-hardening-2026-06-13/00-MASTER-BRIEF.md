# 00 — MASTER BRIEF: Parallel-Session Hardening

> Ground-truth doc for the multi-lane contention hardening mission. Every workstream reads this first. Status log at the bottom is the live state.

## MISSION

Make parallel YURI sessions non-problematic. Marcel runs several Claude lanes concurrently (6 active worktrees observed). Shared single-instance state collides across lanes and silently breaks commits. Decode: worktrees isolate the *checkout* but NOT the global registry, env.sh, gitnexus shared index, or skill-hash semantics — those are single-instance and contended.

Owner directive (2026-06-13): "1 + 2, we have to get to the point where parallel sessions dont become problematic." → (1) operate conservatively + (2) coordinate. Chosen scope: **Prune + source fix** for the GitNexus footgun × **Full hardening pass** across all proven contention surfaces.

## ROOT-CAUSE MAP (grounded from session evidence, not theory)

| # | Surface | Isolated by worktree? | Bites because | WS |
|---|---|---|---|---|
| 1 | GitNexus global registry (`~/.gitnexus/registry.json`) | ❌ shared | worktree-cwd `gitnexus analyze` registers the worktree as a dup `yuri-os` → every lane's MCP startup doubles → pre-commit `detect_changes` >15s timeout | WS1+WS2 |
| 2 | skill-hash-registry.json | ❌ shared/tracked | two lanes touch skills → drift → skill-registry pre-commit gate blocks both | WS3 |
| 3 | `~/.config/yuri/env.sh` | ❌ shared | one lane's env write (e.g. `YURI_COST_ADMISSION_ENFORCE=1`) silently inherited by all lanes | WS4 |
| 4 | pre-commit battery | ❌ shared tree | secret-scan 3512 files + 5 gates run repo-wide on a 10k-file dirty tree, every commit, every lane | WS5 |
| 5 | `.git/index.lock` | ❌ shared | simultaneous commits collide | inherent git, retry survives — NOT in scope |
| 6 | capabilities.json | gitignored/per-lane | regenerated per-lane | low (no merge conflict) — NOT in scope |

The recurrence loop for #1: `gitnexus-hook.cjs` PostToolUse staleness notice tells the agent to run `npx gitnexus analyze --skip-agents-md`. A lane in a worktree cwd that follows it re-registers the worktree → re-pollutes the global registry for everyone. **The hook's own advice is the footgun.**

## WORKSTREAM SPECS

### WS0 — Acute fix (DONE, verified)
Deduped `~/.gitnexus/registry.json` to 1 repo; `detect_changes` 2.31s exit 0 (was >15s). Backup: `~/.gitnexus/registry.json.bak-pre-dedup`. Reversible via `gitnexus index <path>`.

### WS1 — GitNexus self-healing registry prune
- GOAL: registry can never serve a worktree-path or duplicate-name entry, regardless of how it got polluted.
- TARGET: `_SYSTEM/Scripts/gitnexus-mcp.mjs` (the wrapper both the MCP server AND `gitnexus-detect-changes.mjs` spawn through) — prune `~/.gitnexus/registry.json` before spawning the CLI.
- LOGIC: drop any entry whose `path` contains `/.claude/worktrees/`; for same-`name` duplicates keep the one whose path == repo root. Exact filter, no fuzzy match. Idempotent. Fail-open (never block serve on a prune error).
- ACCEPTANCE: after re-adding a fake worktree entry, one wrapper spawn restores 1 repo; detect_changes stays <15s.
- ROLLBACK: revert the wrapper edit; backup `.bak-pre-dedup` restores the registry.

### WS2 — GitNexus source fix (stop the re-pollution)
- GOAL: a worktree-cwd lane never gets advice that registers the worktree.
- TARGET: `.claude/hooks/gitnexus/gitnexus-hook.cjs` — `handlePostToolUse` + `handleEditStaleness`.
- LOGIC: if cwd is under `.claude/worktrees/`, suppress the `analyze` staleness notice (the shared graph is the main lane's responsibility; worktree lanes must not reindex it).
- ACCEPTANCE: simulate a PostToolUse with cwd under a worktree → no analyze advice emitted; main-cwd path unchanged.
- ROLLBACK: revert the hook edit.

### WS3 — skill-hash auto-reconcile
- GOAL: two lanes touching skills don't deadlock each other's commits on skill-hash drift.
- CAPABILITY-FIRST: use existing `yuri-skill-loader --write-manifest` (the reconcile already exists — do NOT rebuild).
- TARGET: TBD after reading the skill-registry pre-commit gate — wire the reconcile as a pre-gate step or document the one-liner. Decide least-invasive seam after evidence.
- ACCEPTANCE: induce drift → reconcile path clears it without manual intervention; gate still catches genuine unregistered skills.
- ROLLBACK: revert the wiring.

### WS4 — env.sh per-lane isolation
- GOAL: a lane's env write doesn't silently mutate every other lane's behavior.
- TARGET: `~/.config/yuri/env.sh` shape + how lanes source it. Decide after reading current shape: likely split durable-shared vs per-lane-overridable, or move volatile arming flags to a per-session file.
- ACCEPTANCE: a per-lane override does not leak into a second lane's env.
- ROLLBACK: restore env.sh from backup.

### WS5 — pre-commit cost review
- GOAL: pre-commit doesn't punish every lane for the shared dirty tree.
- TARGET: the pre-commit hook battery — measure each gate's cost on the current tree, target the worst (likely secret-scan over 3512 files + gitnexus, now fixed).
- ACCEPTANCE: measured per-gate timings; any safe speedup applied without weakening a security gate.
- ROLLBACK: revert per-gate edits.

## HARD CONSTRAINTS (all workstreams)

- NO `git add -A` (sweeps other lanes + protected `.claude/state`); explicit pathspecs only.
- No force-push/reset on main; `git fetch` + ff-check before any push.
- Hands OFF the 6 other lanes' worktrees (competent-kalam, ecstatic-diffie, inspiring-panini, strange-feistel, upbeat-chaum, vault-restructure) and their files.
- Protected paths off-limits (`backend/data`, `.claude/state|history|file-history`, `.env`, `node_modules`, `.amp`, secrets).
- No commit/push without explicit owner approval. Every change: scoped, acceptance-verified, reversible.
- Each new mechanism: capability-first checked, `@capability` tagged if reusable, attacked before claimed done.

## STATUS LOG — ALL WORKSTREAMS DONE + VERIFIED (UNCOMMITTED, awaiting owner commit decision)

- **WS0 acute dedup** — DONE. `~/.gitnexus/registry.json` 2→1; detect_changes 2.31s exit 0 (was >15s). Backup `~/.gitnexus/registry.json.bak-pre-dedup`.
- **WS1 self-healing prune** — DONE. `pruneRegistry()` in `gitnexus-mcp.mjs` (`@capability: gitnexus-registry-hygiene`), runs before serve. Verified: re-polluted 2→1 auto-pruned, visibility stderr line fires, idempotent. Conservative — drops only `/.claude/worktrees/` paths, warns-but-keeps other same-name dups.
- **WS2 source fix** — DONE. `isWorktreeCwd()` guards in `gitnexus-hook.cjs` (both staleness handlers). Verified: worktree-cwd events suppressed (empty), main-cwd path intact (fires). Parses.
- **WS3 skill-hash churn-immunity** — DONE (better than blanket --write-manifest, which would gut tamper detection). `stableSkillBody()` in `yuri-skill-loader.mjs` (`@capability: skill-hash-volatile-exclusion`) excises the auto-journaled `## Session Notes` from the integrity hash. Manifest rebased (240 entries, drift=0). Verified: churn-immune + real-change-caught + post-notes-preserved + no-notes-unchanged all PASS.
- **WS4 env.sh isolation** — DONE. Worktree-root `.yuri-env.local.sh` override (gitignored) sourced after env.sh in `ai` + `llm-compat.sh`, anchored via `git rev-parse --show-toplevel` (true per-lane). env.sh doc header added. Verified: both scripts parse, override loads, gitignored.
- **WS5 pre-commit cost** — DONE (explicit non-action). Per-gate timed: secret-scan 1.45s, gitnexus 0.85s (was the >15s hang), all else <0.2s. Full chain now **2.59s exit 0, `[pre-commit] pass`**. secret-scan left untouched — scoping a security gate to save 1.4s trades coverage for nothing. The gitnexus fix was the whole win.

**Final acceptance:** full pre-commit chain 2.59s exit 0 (no `--no-verify`); capabilities 43→45 (`--check` OK); skill manifest drift=0; all hot-path scripts parse; zero lane-file collisions.

**Files changed (uncommitted):** `_SYSTEM/Scripts/gitnexus-mcp.mjs`, `.claude/hooks/gitnexus/gitnexus-hook.cjs`, `_SYSTEM/Scripts/yuri-skill-loader.mjs`, `_SYSTEM/skill-hash-registry.json` (240-entry rehash), `_SYSTEM/Scripts/ai`, `_SYSTEM/Scripts/llm-compat.sh`, `.gitignore`, this brief. Outside repo (untracked): `~/.gitnexus/registry.json` (deduped), `~/.config/yuri/env.sh` (doc header).
