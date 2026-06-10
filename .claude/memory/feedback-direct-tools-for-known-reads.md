---
name: feedback-direct-tools-for-known-reads
description: Direct tools for known/trivial reads; Agent+Workflow fan-out encouraged when justified; no ollama
metadata:
  type: feedback
  tier: working
  scope: all
  trig: ["agent", "file read", "explore", "grep", "subagent", "direct tools", "known path", "ollama", "workflow"]
  refs: ["[[feedback-fanout-self-size]]", "[[feedback-model-self-select]]", "[[project-native-only-migration]]"]
---

RULE  For known file paths and trivial lookups, use direct tools (Read / Grep / Bash, or GitNexus for code) — don't spawn a cloud Agent just to read a file. Agent and Workflow fan-out ARE encouraged when breadth, cross-file reasoning, or parallelism genuinely justify it (self-size the fan-out).

WHEN  Deciding whether to read/search directly vs delegate to a subagent or workflow.

DO  Known path → Read. Directory/symbol search → Bash grep/find or GitNexus. Broad multi-file sweep, cross-file reasoning, or parallel mutating work → Agent or Workflow, sized to the task. Keep trivial single-file reads on the direct tools (cost discipline).

DONT  Don't spawn an Agent/Explore for a single known-file read — that's wasteful. Don't route to ollama/local models — YURI is full-Claude-only; ollama-bridge is retired.

WHY  The cost discipline on trivial reads still holds, but the old hard "Agent forbidden / critical error" framing and the ollama-bridge recommendation are obsolete: ollama/local is scrapped (full-Claude-only) and Workflow/Agent fan-out is now embraced and self-sized (no cap). Supersedes the retired no-haiku-agents + no-agent-for-file-reads rules.

SEE  [[feedback-fanout-self-size]] - [[feedback-model-self-select]] - [[project-native-only-migration]]
