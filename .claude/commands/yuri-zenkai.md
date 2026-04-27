---
name: yuri-zenkai
description: Failure capture, root-cause analysis, regression creation, and improvement
trigger: /yuri zenkai
aliases: [/zenkai, /fel]
skill: failure-evolution-loop
agent: failure-evolution-loop-agent
model: claude-haiku-4-5-20251001
---

# /yuri zenkai

Invoke Failure Evolution Loop for post-failure analysis and improvement.

## Usage

```
/yuri zenkai [--failure-event FILE] [--mode analysis|regression|memory-proposal]
```

## Artifact types

Accepts:
- `failure_event` — Error message or stack trace
- `test_output` — Test failure or log
- `user_feedback` — Bug report or issue
- `diff` — Git diff or code change
- `session_log` — Claude session transcript or EOT output
- `domain_report` — Execution domain failure summary
- `clone_reports` — Multi-agent failure reports

## Examples

```
/yuri zenkai --failure-event error.txt --mode analysis
/yuri zenkai --failure-event test.log --mode regression
/yuri zenkai --failure-event session.md --mode memory-proposal
```

## Output

- Failure intake and classification
- Root-cause analysis with evidence mapping
- Failure pattern matching against history
- Safe improvement plan
- Regression test design
- Memory update proposal for NISABA
- EOT integration checklist
