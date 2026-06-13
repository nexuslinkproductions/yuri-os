---
name: proj-parallel-session-hardening-2026-06-13
description: "Multi-lane contention hardening — gitnexus dup-registry footgun (worktree analyze) + skill-hash Session-Notes churn + env.sh sharing all fixed; pre-commit hang >15s→2.59s; UNCOMMITTED"
metadata:
  node_type: memory
  type: project
  originSessionId: 53a52603-b3b9-4334-aa4a-1d18e47af592
  tier: 2
  scope: project
---

GOAL: make parallel YURI Claude lanes non-problematic — worktrees isolate the checkout but the global gitnexus registry, env.sh, gitnexus index, and skill-hash semantics are single-instance and collide. Marcel chose prune+source-fix × full hardening.

WHO: Marcel (directive "1+2, get parallel sessions to not be problematic"; AskUserQuestion: Prune+source fix × Full hardening pass).

WHEN: 2026-06-13.

WHERE: master brief `02_RESOURCES/RESEARCH/parallel-session-hardening-2026-06-13/00-MASTER-BRIEF.md` (full root-cause map + per-WS specs + acceptance).

STATE: 5 workstreams SHIPPED + VERIFIED, **UNCOMMITTED** (awaiting owner commit decision). Root cause of the proven pre-commit hang: a worktree-cwd `gitnexus analyze` registers the worktree as a DUPLICATE same-named ("yuri-os") repo in `~/.gitnexus/registry.json` → every lane's MCP startup loads both → detect_changes >15s timeout (forced `--no-verify` last session). The hook's OWN PostToolUse advice ("run gitnexus analyze") was the recurrence loop. FIXES: WS1 `pruneRegistry()` in `gitnexus-mcp.mjs` (@capability gitnexus-registry-hygiene) self-heals the registry before serve (drops `/.claude/worktrees/` paths, idempotent, fail-open); WS2 `isWorktreeCwd()` guards in `gitnexus-hook.cjs` suppress the analyze advice for worktree-cwd lanes; WS3 `stableSkillBody()` in `yuri-skill-loader.mjs` (@capability skill-hash-volatile-exclusion) excises the auto-journaled `## Session Notes` from the skill integrity hash so session-hook churn (session-reflect.js/token-session-init.js) stops blocking unrelated commits — manifest rebased 240 entries, real-change detection PRESERVED (chosen over blanket --write-manifest which would gut tamper detection); WS4 worktree-root `.yuri-env.local.sh` override (gitignored) sourced after env.sh in `ai`+`llm-compat.sh` (anchored via git rev-parse = true per-lane); WS5 measured pre-commit, explicit non-action (secret-scan 1.45s left for security). Full pre-commit chain now 2.59s exit 0 (was the >15s hang). capabilities 43→45. Backup `~/.gitnexus/registry.json.bak-pre-dedup`.

NEXT: owner commit decision (8 tracked files — see brief). Then worth a Track-A promotion (other lanes need the gitnexus-footgun fact). Diagnostic if pre-commit ever hangs again: `node _SYSTEM/tools/gitnexus/gitnexus/dist/cli/index.js list` — >1 repo named yuri-os = re-pollution (WS1 should auto-heal it now).

SEE: [[proj-github-adoption-shipped-2026-06-13]] · [[ref-commit-gate-reconcile]] · [[feedback-master-brief-per-mission]] · [[feedback-nonoffsettable-is-per-claim-not-net-delta]]
