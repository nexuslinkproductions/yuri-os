# Yuri OS Fixture RAG Health

status: `RAG_HEALTH_CHECK_CREATED`
checked_at: `2026-05-09T20:41:27+02:00`
head: `b5ac69333cf34915863f65fa6dcb4c6918a29107`
health_command: `npm run wiki:rag:health`
launchd_label: `com.nudimmud.wiki-rag`
launchd_report: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd.md`
ingest_report: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md`
automated_by: `Scripts/wiki-rag-watch.mjs`
notebook_stable_key: `yuri-os/wiki-control-plane`

## Purpose

Provide a single health probe that confirms the launchd-backed watcher, the wiki spine, the notebook identity, and the ingest report stay in sync.

## Checks

- launchd job is running
- watcher process is present
- wiki index counts match the ingest report and the live notebook
- launchd report still points at the live agent
- notebook stable key resolves to the live notebook row

## Automation

The watcher calls the health probe after startup and after each successful ingest or no-change poll.

## Non-Claims

- does not run ingestion
- does not change the source registry mirror
- does not alter the wiki source set

## Use

Run `npm run wiki:rag:health` for a read-only health snapshot of the persistent lane.
