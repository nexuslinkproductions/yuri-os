---
name: proj-github-adoption-shipped-2026-06-13
description: "GitHub competitive-intel adoption mission — 6 items SHIPPED to main (uncommitted), armed states + arming-pending owner decisions; worktree-build→3way-integrate method"
metadata: 
  node_type: memory
  type: project
  originSessionId: 53a52603-b3b9-4334-aa4a-1d18e47af592
---

GOAL: mine 16 trending GitHub repos clean-room → adopt what they do better as YURI-native, commercial-prep. Staged scan→plan→sim→build→integrate→verify.

WHO: Marcel (greenlit "1+2, go deep on all" then "go all out").

WHEN: 2026-06-13.

WHERE: mission docs `02_RESOURCES/RESEARCH/github-adoption-2026-06-13/` (00-MASTER-BRIEF, 01-SCAN-REPORT, 02-ADOPTION-BLUEPRINTS, 03-SIM-REDTEAM, 04-COMMERCIAL-ROADMAP). Scan runId wf_5e065364, plan wf_99cbe42d, build wf_ebf5e7d0.

STATE: 6 items COMMITTED to main + PUSHED to origin (commit 536b28f8 build/integration + 6eb0df06 arming). 173 tests green, capability-scan --check OK (39), skill-hash drift=0 (240). Items + FINAL armed states: firmware-policy (skill-creation.md @anchor failure-anchors + anti-rationalization→writing-skills + 3 slop axes + design AI-tell catalog; docs/policy LIVE); skill-security-gate (corpus-security-scan upgraded: 16-cat + JS-native AST + taint + OSV-snapshot + SARIF + install verdict; ADVISORY — auto-block-on-ingest still a future owner flip); staleness-extension (xref-drift-scan per-file content-hash + live banner in xref-query + heuristicEdge provenance forward-wired; ACTIVE); ccr-compression (reversible compress/retrieve + cache-prefix-scan; ACTIVE lossless default); cost-admission-gate (cost-reservation-pool + exported token-ledger math; ARMED ADVISORY — _SYSTEM/state/cost-admission.armed JSON capUsd=50/day PLACEHOLDER tunable, warn-only NO hardblock, activates via YURI_COST_ADMISSION_ENFORCE=1 added to ~/.config/yuri/env.sh); human-review-sublane (plan-review.mjs HITL, mutual-exclusion w/ plan_dispatch_gate; AUTO-BLOCK with reason via checkPlanReviewGate block:true → claude-protocol-guard emitBlock, opt-in review mode ONLY default OFF, requires CLAUDE_SESSION_ID else degrades WARN, TTL failsafe).

ALSO DONE this session: ai reindex (41,655 docs, the AggregateError was a PIPE artifact — redirect to file, never pipe `ai reindex` to head/tail — see [[ref-mimo-pipe-artifact]]); GitNexus refreshed (53,580 nodes / 80,481 edges / 300 flows); EOT closeout ran.

NEXT (all optional, owner's call): tune cost capUsd to real economics (currently $50/day advisory placeholder); flip skill-security to auto-block-on-ingest if/when wanted; `git worktree remove .claude/worktrees/wf_ebf5e7d0-362-{1..5}` (rollback worktrees, now redundant — work is committed+pushed). Mission COMPLETE.

METHOD LEARNED: parallel worktree-isolated builds → integrate to main sequentially. NEW/clean-on-main files = copy; main-DIRTY files = `git merge-file` 3-way (HEAD base) to preserve in-flight uncommitted work (xref-query's queryInvariant overlapped staleness → 4 union conflicts hand-resolved). Regenerate capabilities.json ONCE on main, never per-worktree (worktrees lag the full capability set, would clobber). Each item's tests re-run on main post-merge. Forward-wiring (no live caller) labeled in-code, never sold as live.

SEE: [[feedback-master-brief-per-mission]] · [[ref-commit-gate-reconcile]] · [[feedback-research-via-mimo-lane]]
