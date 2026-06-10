---
name: fleet-findings-must-persist-durably
description: "Any dispatched fleet (Workflow/agents/lanes) that PRODUCES findings must WRITE them to a durable file as they land — never rely on the Workflow return value or agent transcript surviving. Learned 2026-06-09: a ~6-agent red-team Workflow ran to completion but its findings were lost — 0-byte capture file, return value eaten by compaction, subagent transcripts cleaned. Functionally the whole attack evaporated and had to be re-run."
metadata:
  node_type: memory
  type: feedback
  tier: high
  scope: nexus
  trig: "workflow, fleet, agents, findings, persist, durable, compaction, red-team, disclosure, lost output"
  refs:
    - feedback-deliver-dont-defer-and-checkpoint
    - feedback-substrate-cert-loop
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

RULE: When a Workflow/agent fleet produces findings, reports, or any durable output, WRITE it to a real file (repo report or /tmp jsonl) the moment it returns — before the turn can be compacted. The Workflow return value, the task capture file, and subagent transcripts are all EPHEMERAL and can vanish.

WHEN: Any background Workflow or agent fleet whose value is its OUTPUT (red-team findings, audit results, research synthesis, disclosure reports).

DO: (a) have each agent/stage write durable artifacts itself where possible; (b) the instant the Workflow tool returns its result object, persist it to disk (a report .md + the raw findings .json) as the first action; (c) only THEN narrate/synthesize. For long sequential lanes, append to a .jsonl as each item lands.

DONT: Don't treat "the Workflow completed" as "the findings are safe." A 0-byte task-output file + a return value that gets compacted = total loss. Don't rely on `subagents/*.jsonl` transcripts surviving — they get cleaned.

WHY: 2026-06-09 — dispatched a ~6-agent red-team of the 7 organs; it ran, but the capture file was 0 bytes, the return value was lost to context compaction, and the transcripts were gone. Zero findings survived; the entire attack had to be re-run. Cost: a full fleet's worth of work, evaporated.

SEE [[feedback-deliver-dont-defer-and-checkpoint]] · [[feedback-substrate-cert-loop]]
