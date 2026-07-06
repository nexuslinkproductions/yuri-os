---
name: feedback-live-recall-not-stale-trackers
description: "For \"what's left / total recall / current task list\" queries, query the LIVE nerve + verify vs live code/HEAD — tracker markdown, checkboxes, dated reports, launch-readiness-check.mjs are stale and NOT ground truth"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: yuri
  trig: 
    - total recall
    - "what's left"
    - current task list
    - what did we do
    - open work
    - before launch
  refs: 
    - feedback-prose-not-outrun-wiring
    - circuitry-change-propagation-continuity
  originSessionId: 2f9072b7-3c22-4f4d-b44c-c962dc844bfc
---

RULE: For any "what's still open / total recall / current task list / what did we do last sessions" question, the source of truth is the LIVE system, not status files.
WHEN: Marcel asks for recall of remaining/open/launch work, or "check the task list."
DO: Run `node _SYSTEM/Scripts/yuri-nerve.mjs digest` + `node _SYSTEM/Scripts/yuri-total-recall.mjs [hours]` (live OpenProcess/nerve recall, ranked by OpenMass) and read the latest session HANDOFF docs (`_SYSTEM/docs/*HANDOFF*`, the "NEEDS YOUR DECISION" section). Verify every claimed-open item against live code + `git log`/`git show` at HEAD before reporting it open.
DONT: Trust tracker checkboxes (`[ ]` vs `[x]`), dated report files, `_SYSTEM/specs/active/tasks.md`, `task-queue.mjs` state, or `launch-readiness-check.mjs` — they do NOT auto-update on completion and went stale 4× in one session (red-team 32-fix wave was all `[ ]` but landed in `e60e3f91`; SpecKit Task-1 "exits 0 (was 1)" already exits 0; die-validator finding flagged 2 failing checks that were green at HEAD). The owner explicitly killed `launch-readiness-check.mjs` as "very outdated, wrong file."
WHY: Nothing propagates completion back to the markdown trackers — the nerve IS the propagating spine (record-on-detect / closeEvent on done). The disease is N drifting task surfaces; the cure is one live source. Reporting a stale tracker as open burns trust (forgetting = broken trust).
SEE: [[feedback-prose-not-outrun-wiring]], [[circuitry-change-propagation-continuity]]
