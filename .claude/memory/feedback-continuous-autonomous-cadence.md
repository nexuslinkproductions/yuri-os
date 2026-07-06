---
name: feedback-continuous-autonomous-cadence
description: "In an autonomous run, keep working sequentially at a tight cadence — no idle waiting; finding the next task is MY job, not Marcel's"
metadata: 
  node_type: memory
  tier: hot
  scope: claude-behavioral
  trig: 
    - autonomous
    - loop
    - heartbeat
    - keep working
    - cadence
    - tick
    - self-pace
    - background run
  refs: 
    - feedback-deliver-dont-defer-and-checkpoint
    - feedback-background-exit-code-masking
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: In an autonomous/loop run, default to CONTINUOUS sequential work at a tight cadence (~2 min between tasks), not a slow idle heartbeat. Finding the next worthwhile task is MY responsibility every tick — never park the loop waiting for Marcel to feed work.

WHEN: any autonomous building run / `/loop` / self-paced ScheduleWakeup loop where Marcel has handed over and gone (asleep/away).

DO: each tick, do one real unit (audit a fresh surface, verify/deepen a parked finding, build a safe in-envelope improvement, process an agent result) then immediately schedule the next ~120s out. Keep momentum; alternate discovery + verification so the backlog both grows AND hardens. Spawn bounded sonnet-pinned agents in parallel so they run across ticks.

DONT: don't drop to long idle heartbeats (3600s) "to conserve" when Marcel wants continuous output — he explicitly corrected that 2026-06-13: "we need sequential work, no break inbetween where you wait... it is your job to find work to do." Don't wait for a nod to keep WORKING (only to APPLY owner-gated/guarded edits).

STYLE: token-conservation is secondary to continuous useful output here — Marcel burns 40M+/mo and values momentum. Still bound by the safety envelope (no guarded-surface auto-edits without nod, no commits).

WHY: he's twice-exceptional, runs at research-lab speed; a worker that idles when it could be finding+doing work wastes the lane. Continuity + momentum IS the product.

SEE: [[feedback-deliver-dont-defer-and-checkpoint]].
