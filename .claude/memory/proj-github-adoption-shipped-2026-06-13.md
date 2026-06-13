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

STATE: 6 items in main's WORKING TREE, UNCOMMITTED (no commit/push per floor). 173 tests green, capability-scan --check OK (39), skill-hash drift=0 (240). Items + armed states: firmware-policy (skill-creation.md @anchor failure-anchors + anti-rationalization→writing-skills + 3 slop axes + design AI-tell catalog; docs); skill-security-gate (corpus-security-scan upgraded: 16-cat + JS-native AST + taint + OSV-snapshot + SARIF + install verdict; ADVISORY); staleness-extension (xref-drift-scan per-file content-hash + live banner in xref-query + heuristicEdge provenance; ACTIVE); ccr-compression (reversible compress/retrieve + cache-prefix-scan; ACTIVE lossless default); cost-admission-gate (cost-reservation-pool + exported token-ledger math; DISARMED); human-review-sublane (plan-review.mjs HITL, mutual-exclusion w/ plan_dispatch_gate; ADVISORY).

NEXT (owner-arming decisions, nothing blocks until decided): (1) cost cap USD + window + free-lane exemption → arm cost-admission; (2) human-review hard-block vs advisory (real R4?); (3) skill-security auto-block-on-ingest flip. Then commit (Marcel). 5 worktrees `.claude/worktrees/wf_ebf5e7d0-362-{1..5}` persist as rollback — `git worktree remove` after review.

METHOD LEARNED: parallel worktree-isolated builds → integrate to main sequentially. NEW/clean-on-main files = copy; main-DIRTY files = `git merge-file` 3-way (HEAD base) to preserve in-flight uncommitted work (xref-query's queryInvariant overlapped staleness → 4 union conflicts hand-resolved). Regenerate capabilities.json ONCE on main, never per-worktree (worktrees lag the full capability set, would clobber). Each item's tests re-run on main post-merge. Forward-wiring (no live caller) labeled in-code, never sold as live.

SEE: [[feedback-master-brief-per-mission]] · [[ref-commit-gate-reconcile]] · [[feedback-research-via-mimo-lane]]
