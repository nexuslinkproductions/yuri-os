# Yuri Prompt Engineering Research Archive

Date: 2026-05-11
Archive status: RAG_INGESTED_VERIFIED
RAG status: RAG_INGESTED_VERIFIED
rag_approval_status: READY_FOR_RAG_AFTER_APPROVAL
rag_ingestion_status: RAG_INGESTED_VERIFIED
rag_ingested_at: 2026-05-11T16:04:07Z
rag_notebook_id: 6
rag_notebook_stable_key: yuri-os/prompt-engineering-research-2026-05
advisory_only: true
local_truth_claim: false

## Purpose

Create a source-backed prompting doctrine for Yuri OS that improves prompt quality without relying on roleplay, persona imitation, brittle magic phrases, or unsupported claims.

The doctrine replaces identity-roleplay phrasing with explicit task contracts:

- objective
- context
- inputs
- constraints
- evidence requirements
- tools/actions
- output schema
- evaluation criteria
- failure behavior

## Governance

- Canonical origin: `_SYSTEM/yuri-origin.md`
- Evidence contract: `_SYSTEM/Scripts/yuri-evidence-contract.mjs`
- Skill output: `.agents/skills/prompt-engineering/`
- Source registry: `01_source_registry.md`

## RAG Decision

This archive is approved for curated RAG ingestion but has not been ingested in this lane.

Reason:

- The user requested RAG or integration.
- Integration as a skill is lower risk and immediately useful.
- Raw external pages remain linked sources, not ingested corpora.
- RAG ingestion uses a dedicated approval and runner, mirroring the existing enterprise archive pattern.

## Files

| File | Status | Content |
|---|---|---|
| `00_manifest.md` | CURRENT | Archive purpose and governance |
| `01_source_registry.md` | CURRENT | Prompting source registry |
| `02_prompting_synthesis.md` | CURRENT | Research-backed synthesis |
| `03_yuri_prompting_doctrine.md` | CURRENT | Yuri-native prompting rules |
| `04_prompt_security_and_evals.md` | CURRENT | Security, eval, and regression policy |
| `05_integration_plan.md` | CURRENT | How this is integrated into Yuri |
| `06_rag_ingestion_approval.md` | CURRENT | RAG approval and ingestion scope |
| `07_rag_ingested.md` | GENERATED_AFTER_RUN | RAG ingestion verification report |

## Non-Claims

- This is not a formal literature review.
- This is not legal, security, or compliance certification.
- This does not make external sources canonical Yuri doctrine.
- This does not guarantee a prompt will generalize across models without evaluation.
