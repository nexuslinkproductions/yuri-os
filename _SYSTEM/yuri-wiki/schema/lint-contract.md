# Yuri LLM Wiki Lint Contract

Checks-only contract. This file defines future lint expectations; it does not implement code or run validation.

## Required Checks

- missing source_refs
- candidate promoted without review
- stale HEAD/date claims
- contradictory canonical pages
- duplicate canonical topics
- missing supersession links
- RAG eligibility mismatch
- forbidden content class
- oversized pages
- raw dump smell
- unsupported local_truth_claim
- missing review fields on accepted pages
- legacy/frozen routing leakage
- OpenRouter/Ollama/local-model proposal leakage
- raw/source copy leakage
- source registry missing reference
- Codex Spark/offload active-call leakage

## Failure Handling

Candidate pages with lint failures remain advisory and non-RAG. Accepted pages require review fields, current local evidence, and explicit approval before any future RAG eligibility.
