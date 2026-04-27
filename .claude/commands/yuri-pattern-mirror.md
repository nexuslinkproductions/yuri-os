---
name: yuri-pattern-mirror
description: Artifact observation, pattern extraction, and Yuri-native reconstruction
trigger: /yuri pattern-mirror
aliases: [/pattern-mirror, /pmc]
skill: pattern-mirror-core
agent: pattern-mirror-core-agent
model: claude-sonnet-4-6
---

# /yuri pattern-mirror

Invoke Pattern Mirror Core for artifact analysis and clean-room reconstruction.

## Usage

```
/yuri pattern-mirror [--target PATH] [--artifact-type ARTIFACT_TYPE] [--goal TEXT]
```

## Artifact types

- `repo` — Git repository or codebase
- `document` — Markdown, text, or documentation
- `pdf` — PDF file
- `prompt` — Claude prompt or agent definition
- `codebase` — Directory of source code
- `system_spec` — Architecture or system specification
- `workflow` — Process or procedure definition
- `memory_log` — Session or episodic memory

## Examples

```
/yuri pattern-mirror --target ./external-repo --artifact-type repo
/yuri pattern-mirror --target ./research.pdf --artifact-type pdf --goal "rebuild as NUDIMMUD skill"
/yuri pattern-mirror --target ./prompt.md --artifact-type prompt
```

## Output

- Pattern extraction report
- Weakness and gap audit
- Clean-room blueprint (technique without property)
- Yuri-native reconstruction plan
- Memory update proposals
