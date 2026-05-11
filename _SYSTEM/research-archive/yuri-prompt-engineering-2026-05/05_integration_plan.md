# Yuri Prompt Engineering Integration Plan

Date: 2026-05-11
Status: SKILL_CREATED
advisory_only: true
local_truth_claim: false

## Integrated Surface

Created skill:

- `.agents/skills/prompt-engineering/SKILL.md`
- `.agents/skills/prompt-engineering/REFERENCE.md`

Updated registry:

- `_SYSTEM/AGENTS/skills-registry.md`

## What Changes Immediately

Yuri agents now have a durable prompting skill that should trigger on:

- prompt writing
- prompt audit
- prompt optimization
- system instructions
- model behavior tuning
- RAG/tool-agent instructions
- roleplay/identity phrasing concerns

## Operating Change

Default prompt construction should move from:

```text
roleplay + vibe + broad command
```

to:

```text
task contract + evidence + tool policy + output schema + eval
```

## RAG Next Step

If RAG ingestion is desired later:

1. Add `06_rag_ingestion_approval.md`.
2. Review license/status for each source in `01_source_registry.md`.
3. Add a dedicated ingestion script or extend an existing one with a new stable notebook key.
4. Ingest only curated Markdown archive files, not raw external pages.
5. Verify retrieval with at least one query:

```text
What is Yuri's replacement for identity-simulation prompts, and what evidence/eval rules must a durable prompt include?
```

## Recommended Stable Notebook Key

```text
yuri-os/prompt-engineering-research-2026-05
```
