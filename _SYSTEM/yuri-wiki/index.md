# Yuri LLM Wiki Fixture Index

status: `PHASE_1_FIXTURE_NO_INGEST`
current_head: `ab5c8c8c5`
source_registry_status: `SOURCE_REGISTRY_MISSING`

## current_head Policy

`current_head` reflects the HEAD commit at the latest verified lifecycle transition. It must be updated during each lifecycle transition (candidate, linted, review_pending, reviewed, accepted, etc.) to match the verification-time HEAD. It is not a static pointer — stale values indicate an unverified or unupdated transition.

## Authority

Current local repo truth outranks wiki pages, archives, handoffs, model output, boot anchors, historical continuity files, and generated candidates. Wiki pages are control-plane references until separately reviewed.

## No Raw Copies

Raw/source truth stays outside this wiki. This fixture does not store raw corpora, model dumps, backend mirrors, RAG exports, or source registry replacements.

## Counts

- pending candidate count: 0
- linted candidate count: 0
- review_pending candidate count: 0
- reviewed candidate count: 0
- accepted page count: 1
- RAG indexed count: 0

## Navigation

- Accepted compiled-memory page: [09c-llm-wiki-compiled-memory.md](wiki/concepts/09c-llm-wiki-compiled-memory.md)
- Lint report: [09c-fixture-lint-report.md](reports/lint/09c-fixture-lint-report.md)
- Page schema: [page.schema.md](schema/page.schema.md)
- Lint contract: [lint-contract.md](schema/lint-contract.md)

## Deferred Approved Subdirs

- `wiki/systems/`
- `wiki/concepts/`
- `wiki/entities/`
- `wiki/lanes/`
- `wiki/decisions/`
- `wiki/supersession/`
- `reports/contradictions/`
- `reports/staleness/`
- `reports/lint/`
