---
name: proj-irys-prs-2026-06-13
description: "Reworked 4 rejected/open PRs on external repo dl1683/irys-stateful-swarms to survive maintainer's multilingual/multi-domain/extensibility objection; pushed + commented; closed-PR reopen is API-blocked"
metadata: 
  node_type: memory
  type: project
  tier: 2
  scope: external-contribution
  trig: 
    - irys
    - dl1683
    - stateful-swarms
    - pull request
    - reopen
  refs: 
    - feedback-mimo-dispatch-reality
  originSessionId: 25204091-facb-496b-bb55-e478a843aca2
---

GOAL: Get all 4 of Marcel's PRs on `dl1683/irys-stateful-swarms` adopted (not rejected) by
  refining them to the maintainer's stated values: multilingual, multi-domain, extensible, not fragile.
WHO: Marcel = PR author (GitHub `nexuslinkproductions`, commits as Marcel Spatz <marcelspatz@icloud.com>).
  dl1683 = maintainer (closed #3/#5 as "fragile", asked #4 "did you test it"). Mimo co-engineered #4/#5.
WHEN: 2026-06-13. PRs originally opened 2026-06-11.
WHERE: work in /tmp worktrees off a fork clone (NOT the YURI tree). Branches: feat/deterministic-entity-
  resolution (#3), feat/blackboard-compression (#5), feat/optimal-convergence-detection (#4),
  feat/domain-adapter-pattern (#6). Adoptable innovations captured: 02_RESOURCES/research/irys-adoptable-innovations-2026-06-13.md.
STATE: DONE — 184 offline tests green (37/24/21/102), #3 validated on real legal+datadog blackboards
  (zero tokens, ~1s, real cross-doc resolutions). All 4 branches pushed; #4/#6 (open) show new commits live;
  4 maintainer comments posted. BLOCKER: `gh pr reopen` on closed cross-fork #3/#5 fails ("Could not open
  the pull request") — pushing new commits to a closed PR's branch doesn't update its frozen head, and the
  author can't reopen via API → RESOLVED by opening fresh continuation PRs (Marcel's call): #7 supersedes #3,
  #8 supersedes #5, each referencing+linking the closed original. All 4 reworks now in OPEN PRs: #4, #6, #7, #8.
NEXT: await dl1683 re-review on #4/#6/#7/#8.
SEE: [[feedback-mimo-dispatch-reality]]. Real bug found+fixed in #4: composite used (1 - gain_decel),
  penalizing convergence — sign of a derived term must be verified, not assumed.
