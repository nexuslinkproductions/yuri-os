---
name: oracle-memory
description: "Build Oracle memory surfaces: session logs, durable notes, local context, and retrieval. Use when the task touches historical context, research notes, or project memory on this OS."
---

# Oracle Memory

Use this skill when the task is to search, summarize, or persist assistant memory without leaking it into the live prompt.

## Focus

- Separate transient session history from durable notes.
- Treat `RESEARCH/`, `graphify-out/`, and `00_COMMAND-CENTER/` as source material, not runtime state.
- Use compact retrieval rules before adding new memory surfaces.
- Reuse the session and persona patterns from `openclaw-openclaw`, `ovos-persona`, and `leon`.

## Output

- Memory boundary map.
- Retrieval rule set.
- Storage and redaction notes.

## Rules

- Keep sensitive history local.
- Do not duplicate the same memory in multiple stores without a reason.
- Prefer narrow search and explicit references over broad transcript loading.

