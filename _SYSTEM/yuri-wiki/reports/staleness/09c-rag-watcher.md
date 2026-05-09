# Yuri OS Fixture RAG Watcher

status: `RAG_WATCHER_CREATED`
checked_at: `2026-05-09T20:31:49+02:00`
head: `b5ac69333cf34915863f65fa6dcb4c6918a29107`
watch_command: `npm run wiki:rag:watch`
auto_command: `npm run wiki:rag:auto`
watcher_path: `Scripts/wiki-rag-watch.mjs`
runner_path: `backend/src/scripts/ingestWikiControlPlane.ts`
poll_interval_ms: `30000`

## Purpose

Provide a smart auto-refresh lane for the wiki control plane. The runner computes a digest over authoritative control-plane inputs and reruns the dedicated ingest only when the digest changes.

## Watched Inputs

- `_SYSTEM/yuri-wiki/source-registry.md`
- `_SYSTEM/yuri-wiki/index.md`
- `_SYSTEM/yuri-wiki/log.md`
- `_SYSTEM/yuri-wiki/wiki/concepts/09c-llm-wiki-compiled-memory.md`
- `_SYSTEM/yuri-wiki/reports/lint/09c-fixture-lint-report.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-deferred.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-gate-open.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-runner.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-watcher.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd-teardown.md`
- `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-health.md`
- `_SYSTEM/yuri-wiki/schema/page.schema.md`
- `_SYSTEM/yuri-wiki/schema/lint-contract.md`
- `Scripts/wiki-rag-launchd.mjs`
- `Scripts/wiki-rag-health.mjs`
- `backend/src/scripts/ingestWikiControlPlane.ts`
- `backend/package.json`
- `package.json`

## State

- stores the last successful digest in `backend/data/wiki-rag-auto-state.json`
- supports `WIKI_RAG_POLL_MS` for local tuning

## Non-Claims

- does not watch the generated output reports themselves
- does not touch unrelated vault content
- does not change the source registry mirror

## Use

Run `npm run wiki:rag:auto` for a one-shot check or `npm run wiki:rag:watch` to keep polling for future changes.
Use `npm run wiki:rag:launchd:install` to persist the watcher across logins and `npm run wiki:rag:launchd:status` to inspect the live agent.
