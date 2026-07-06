---
name: workflow-result-notification-cap
description: Workflow task-notifications embed the return value inline but CAP it (~78KB); the full result is in the .output file. Verbose agent structured-return prose is what overflows it.
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: main
  trig: 
    - workflow
    - truncated
    - notification
    - subagent return
    - output file
  refs: 
    - "[[fanout-self-size]]"
  originSessionId: 9687da2f-45ae-49c4-b0b5-1bc9fbdb6b73
---

RULE: a Workflow `<task-notification>` shows the return value inline but TRUNCATES it (~78KB, with a "truncated N chars" marker); the COMPLETE result is written to the `.output` file named in the notification. Truncation is a display cap, NOT data loss or an agent/workflow failure.

WHEN: reading Workflow results, especially fleets returning rich per-item objects with free-text `notes`/`evidence` fields.

DO: parse the `.output` file (it's `{summary, agentCount, logs, result}` — the array is under `.result`) rather than trusting the truncated inline preview. Keep agent structured-return schemas' prose fields bounded (cap `notes`/`evidence` to a few lines) so the inline notification stays readable — the overflow comes from skeptic agents writing essay-length `notes`.

DONT: read "truncated after item 1" as "the workflow failed at item 1" — items after the cap completed fine; the first item's verbose verdict just ate the budget.

WHY: caught 2026-06-04 on the wave-0 fleet — notification cut off mid-MATH-01 verdict; all 8 items were intact in the 93KB .output file. The VERDICT_SCHEMA `notes` field was unbounded and skeptics filled it.

SEE: [[wave0-foundations-done-2026-06-04]]
