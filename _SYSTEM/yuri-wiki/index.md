# Yuri OS Wiki Fixture Index

status: `PHASE_1_FIXTURE_SOURCE_REGISTRY_MIRRORED_RAG_VERIFIED`
current_head: `b5ac69333cf34915863f65fa6dcb4c6918a29107`
source_registry_status: `SOURCE_REGISTRY_MIRRORED`
rag_gate_status: `OPEN`
rag_ingestion_status: `VERIFIED`
rag_notebook: `Yuri Wiki Control Plane`
rag_notebook_id: `1`
rag_notebook_key: `yuri-os/wiki-control-plane`

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
- source registry entry count: 8
- RAG indexed count: 16
- RAG embedded chunk count: 23

## Navigation

- Accepted compiled-memory page: [09c-llm-wiki-compiled-memory.md](wiki/concepts/09c-llm-wiki-compiled-memory.md)
- Source registry mirror: [source-registry.md](source-registry.md)
- RAG gate open report: [09c-rag-gate-open.md](reports/staleness/09c-rag-gate-open.md)
- RAG gate deferred report: [09c-rag-gate-deferred.md](reports/staleness/09c-rag-gate-deferred.md)
- RAG ingestion report: [09c-rag-ingested.md](reports/staleness/09c-rag-ingested.md)
- RAG runner report: [09c-rag-runner.md](reports/staleness/09c-rag-runner.md)
- RAG watcher report: [09c-rag-watcher.md](reports/staleness/09c-rag-watcher.md)
- RAG launchd report: [09c-rag-launchd.md](reports/staleness/09c-rag-launchd.md)
- RAG launchd teardown report: [09c-rag-launchd-teardown.md](reports/staleness/09c-rag-launchd-teardown.md)
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
