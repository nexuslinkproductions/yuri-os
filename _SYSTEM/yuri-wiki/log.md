# Yuri OS Wiki Fixture Log

Append-only control log. New events append below existing events without rewriting historical entries.

## Head Semantics

The `head` field in each event records the HEAD commit at event-time (verification-time). It does not and cannot record the future persisting commit that will contain the event itself. The head field is evidence of the repo state at the moment the transition was verified, not a self-referential commit pointer.

## Events

### 09c-0001

- event_id: `09c-0001`
- timestamp: `2026-05-09T14:31:23Z`
- actor: `Codex`
- action: `wiki fixture created`
- page_path: `_SYSTEM/yuri-wiki/index.md`
- from_status: `absent`
- to_status: `PHASE_1_FIXTURE_NO_INGEST`
- source_refs_delta: `[]`
- head: `d1172d7c2`
- reviewer: `UNREVIEWED`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `Navigation spine created; no accepted wiki pages created.`

### 09c-0002

- event_id: `09c-0002`
- timestamp: `2026-05-09T14:31:23Z`
- actor: `Codex`
- action: `schema contract created`
- page_path: `_SYSTEM/yuri-wiki/schema/page.schema.md`
- from_status: `absent`
- to_status: `schema_defined`
- source_refs_delta: `[]`
- head: `d1172d7c2`
- reviewer: `UNREVIEWED`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `09B page, state, transition, and source_refs contract recorded.`

### 09c-0003

- event_id: `09c-0003`
- timestamp: `2026-05-09T14:31:23Z`
- actor: `Codex`
- action: `pending advisory candidate created`
- page_path: `_SYSTEM/yuri-wiki/pending/09c-fixture-llm-wiki-candidate.md`
- from_status: `absent`
- to_status: `candidate`
- source_refs_delta: `+8 local inspected files`
- head: `d1172d7c2`
- reviewer: `UNREVIEWED`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `Candidate remains advisory-only and non-RAG.`

### 09c-0004

- event_id: `09c-0004`
- timestamp: `2026-05-09T14:31:23Z`
- actor: `Codex`
- action: `lint report created`
- page_path: `_SYSTEM/yuri-wiki/reports/lint/09c-fixture-lint-report.md`
- from_status: `absent`
- to_status: `PASS_CANDIDATE_ADVISORY_NON_RAG`
- source_refs_delta: `[]`
- head: `d1172d7c2`
- reviewer: `UNREVIEWED`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `Fixture lint documented as checks-only report.`

### 09c-0005

- event_id: `09c-0005`
- timestamp: `2026-05-09T14:31:23Z`
- actor: `Codex`
- action: `RAG ingestion not run`
- page_path: `_SYSTEM/yuri-wiki/`
- from_status: `NOT_INGESTED`
- to_status: `NOT_INGESTED`
- source_refs_delta: `[]`
- head: `d1172d7c2`
- reviewer: `UNREVIEWED`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `No RAG indexing, mirror, export, or ingestion path created.`

### 09c-0006

- event_id: `09c-0006`
- timestamp: `2026-05-09T14:31:23Z`
- actor: `Codex`
- action: `DB not opened`
- page_path: `_SYSTEM/yuri-wiki/`
- from_status: `DB_UNTOUCHED`
- to_status: `DB_UNTOUCHED`
- source_refs_delta: `[]`
- head: `d1172d7c2`
- reviewer: `UNREVIEWED`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `No DB open, query, copy, dump, migration, or mutation performed.`

### 09c-0007

- event_id: `09c-0007`
- timestamp: `2026-05-09T14:31:23Z`
- actor: `Codex`
- action: `offload/model/API not run`
- page_path: `_SYSTEM/yuri-wiki/`
- from_status: `NOT_RUN`
- to_status: `NOT_RUN`
- source_refs_delta: `[]`
- head: `d1172d7c2`
- reviewer: `UNREVIEWED`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `No DeepSeek, Claude, Codex Spark, local model, OpenRouter, Ollama, Docker, Telegram, OpenClaw, MCP, plugin, subagent, or cloud thread execution.`

### 09d-0001

- event_id: `09d-0001`
- timestamp: `2026-05-09T15:05:25Z`
- actor: `Codex`
- action: `candidate_linted`
- page_path: `_SYSTEM/yuri-wiki/pending/09c-fixture-llm-wiki-candidate.md`
- from_status: `candidate`
- to_status: `linted`
- source_refs_delta: `0`
- head: `d6247ba9a`
- reviewer: `none`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `Manual lint passed; advisory only; no RAG; no source registry repair.`

### 09e-0001

- event_id: `09e-0001`
- timestamp: `2026-05-09T15:42:32Z`
- actor: `Codex`
- action: `candidate_review_pending`
- page_path: `_SYSTEM/yuri-wiki/pending/09c-fixture-llm-wiki-candidate.md`
- from_status: `linted`
- to_status: `review_pending`
- source_refs_delta: `0`
- head: `ed9515c9a`
- reviewer: `none`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `Owner provenance rule allows review_pending; advisory only; no RAG; no source registry repair.`

### 09g-0001

- event_id: `09g-0001`
- timestamp: `2026-05-09T16:18:26Z`
- actor: `owner:marcel-spatz`
- action: `candidate_reviewed`
- page_path: `_SYSTEM/yuri-wiki/pending/09c-fixture-llm-wiki-candidate.md`
- from_status: `review_pending`
- to_status: `reviewed`
- source_refs_delta: `0`
- head: `df6b9e331`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `Schema clarified (reviewed_by convention, log head semantics, current_head policy). All 8 source_refs verified. Advisory only; no acceptance; no RAG; no source registry repair.`

### 09i-0001

- event_id: `09i-0001`
- timestamp: `2026-05-09T16:33:56Z`
- actor: `Codex`
- action: `candidate_accepted`
- page_path: `_SYSTEM/yuri-wiki/wiki/concepts/09c-llm-wiki-compiled-memory.md`
- from_status: `reviewed`
- to_status: `accepted`
- source_refs_delta: `0`
- head: `ab5c8c8c5`
- reviewed_by: `owner:marcel-spatz`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `NOT_ELIGIBLE`
- ingestion_status: `NOT_INGESTED`
- notes: `Accepted with no RAG, no ingestion, and no source registry. Moved path from _SYSTEM/yuri-wiki/pending/09c-fixture-llm-wiki-candidate.md to _SYSTEM/yuri-wiki/wiki/concepts/09c-llm-wiki-compiled-memory.md.`

### 09j-0001

- event_id: `09j-0001`
- timestamp: `2026-05-09T17:49:00Z`
- actor: `Codex`
- action: `source_registry_mirrored`
- page_path: `_SYSTEM/yuri-wiki/source-registry.md`
- from_status: `SOURCE_REGISTRY_MISSING`
- to_status: `SOURCE_REGISTRY_MIRRORED`
- source_refs_delta: `8`
- head: `b5ac69333`
- reviewer: `none`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `Wiki control-plane mirror added from research archive source registry; advisory only; no RAG ingestion; no source registry repair.`

### 09k-0001

- event_id: `09k-0001`
- timestamp: `2026-05-09T17:49:00Z`
- actor: `Codex`
- action: `rag_gate_deferred_report_created`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-gate-deferred.md`
- from_status: `NOT_INGESTED`
- to_status: `RAG_GATE_DEFERRED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `none`
- rag_eligibility: `NOT_ELIGIBLE`
- notes: `RAG remains deferred because the wiki source registry is reference-only, the accepted page is advisory-only, and no explicit ingestion gate has been opened.`

### 09l-0001

- event_id: `09l-0001`
- timestamp: `2026-05-09T17:53:52Z`
- actor: `Codex`
- action: `rag_gate_opened`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-gate-open.md`
- from_status: `RAG_GATE_DEFERRED`
- to_status: `RAG_GATE_OPEN`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `READY_FOR_RAG_AFTER_APPROVAL`
- notes: `Owner approval granted in this session; gate opened for the fixture lane. No ingestion executed yet.`

### 09m-0001

- event_id: `09m-0001`
- timestamp: `2026-05-09T19:56:27+02:00`
- actor: `Codex`
- action: `rag_ingestion_verified`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md`
- from_status: `RAG_GATE_OPEN`
- to_status: `RAG_INGESTED_VERIFIED`
- source_refs_delta: `9`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Dedicated notebook Yuri Wiki Control Plane ingested 9 wiki control-plane sources, produced 11 embedded chunks, and answered a retrieval query successfully with local Ollama.`

### 09n-0001

- event_id: `09n-0001`
- timestamp: `2026-05-09T19:56:27+02:00`
- actor: `Codex`
- action: `rag_runner_created`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-runner.md`
- from_status: `RAG_INGESTED_VERIFIED`
- to_status: `RAG_RUNNER_CREATED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Repeatable runner added at backend/src/scripts/ingestWikiControlPlane.ts and wired to backend/package.json wiki:rag for future exact-path re-verification.`

### 09o-0001

- event_id: `09o-0001`
- timestamp: `2026-05-09T20:01:47+02:00`
- actor: `Codex`
- action: `rag_ingestion_rerun_verified`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md`
- from_status: `RAG_INGESTED_VERIFIED`
- to_status: `RAG_INGESTED_VERIFIED`
- source_refs_delta: `10`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Repeatable runner smoke test verified the live notebook state after adding the ingestion report itself as a source. Notebook now contains 10 wiki control-plane sources and 12 embedded chunks.`

### 09p-0001

- event_id: `09p-0001`
- timestamp: `2026-05-09T20:01:47+02:00`
- actor: `Codex`
- action: `rag_watcher_created`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-watcher.md`
- from_status: `RAG_RUNNER_CREATED`
- to_status: `RAG_WATCHER_CREATED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Added smart auto-refresh watcher at Scripts/wiki-rag-watch.mjs and npm run wiki:rag:watch to rerun the dedicated lane on authoritative control-plane input changes.`

### 09q-0001

- event_id: `09q-0001`
- timestamp: `2026-05-09T20:05:00+02:00`
- actor: `Codex`
- action: `rag_watcher_verified`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-watcher.md`
- from_status: `RAG_WATCHER_CREATED`
- to_status: `RAG_WATCHER_CREATED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Verified npm run wiki:rag:auto one-shot digest gating and npm run wiki:rag:watch polling mode; no rerun occurs when the digest is unchanged. Watcher now covers the full ingested source set, uses a fileURL-safe repo root resolver, and supports WIKI_RAG_POLL_MS override. Notebook state is 12 sources and 15 embedded chunks.`

### 09r-0001

- event_id: `09r-0001`
- timestamp: `2026-05-09T20:14:59+02:00`
- actor: `Codex`
- action: `rag_launchd_installed`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd.md`
- from_status: `RAG_WATCHER_CREATED`
- to_status: `RAG_LAUNCHD_RUNNING`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Installed com.nudimmud.wiki-rag launchd agent at /Users/marcelspatz/Library/LaunchAgents/com.nudimmud.wiki-rag.plist; launchctl print confirms the agent is running and will start the digest-gated watcher on login.`

### 09s-0001

- event_id: `09s-0001`
- timestamp: `2026-05-09T20:16:21+02:00`
- actor: `Codex`
- action: `rag_ingestion_rerun_verified`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md`
- from_status: `RAG_INGESTED_VERIFIED`
- to_status: `RAG_INGESTED_VERIFIED`
- source_refs_delta: `1`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Verified the launchd-backed source set after adding the launchd report and launchd wrapper to the ingest inputs. Notebook now contains 13 wiki control-plane sources and 16 embedded chunks, and the launchd agent remains running.`

### 09t-0001

- event_id: `09t-0001`
- timestamp: `2026-05-09T20:21:37+02:00`
- actor: `Codex`
- action: `rag_launchd_teardown_verified`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd-teardown.md`
- from_status: `RAG_LAUNCHD_RUNNING`
- to_status: `RAG_LAUNCHD_REMOVED_VERIFIED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Verified the clean removal path with launchctl remove com.nudimmud.wiki-rag; the label disappeared from gui/501, the plist was removed, and launchctl print no longer finds the job.`

### 09u-0001

- event_id: `09u-0001`
- timestamp: `2026-05-09T20:22:28+02:00`
- actor: `Codex`
- action: `rag_launchd_restored`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd.md`
- from_status: `RAG_LAUNCHD_REMOVED_VERIFIED`
- to_status: `RAG_LAUNCHD_RUNNING`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Restored the launchd agent with npm run wiki:rag:launchd:install after teardown verification. launchctl print confirms com.nudimmud.wiki-rag is running again and the label is enabled in gui/501.`

### 09v-0001

- event_id: `09v-0001`
- timestamp: `2026-05-09T20:31:49+02:00`
- actor: `Codex`
- action: `rag_health_automated`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-health.md`
- from_status: `RAG_LAUNCHD_RUNNING`
- to_status: `RAG_LAUNCHD_RUNNING`
- source_refs_delta: `2`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Added the read-only health probe and wired it into the watcher loop. The live notebook now contains 16 wiki control-plane sources and 21 embedded chunks, and the launchd-backed agent remains running.`

### 09w-0001

- event_id: `09w-0001`
- timestamp: `2026-05-09T20:31:49+02:00`
- actor: `Codex`
- action: `rag_notebook_identity_hardened`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md`
- from_status: `RAG_INGESTED_VERIFIED`
- to_status: `RAG_INGESTED_VERIFIED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `The wiki RAG lane now resolves the live notebook by stable key first, title second. The health probe reads the live notebook row and validates stable-key identity alongside counts.`

### 09x-0001

- event_id: `09x-0001`
- timestamp: `2026-05-09T20:40:47+02:00`
- actor: `Codex`
- action: `rag_identity_verified`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md`
- from_status: `RAG_INGESTED_VERIFIED`
- to_status: `RAG_INGESTED_VERIFIED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Latest health probe confirms the stable-keyed notebook identity yuri-os/wiki-control-plane with 16 wiki control-plane sources and 22 embedded chunks. launchd remains running and the digest watcher stays resident.`

### 09y-0001

- event_id: `09y-0001`
- timestamp: `2026-05-09T20:41:27+02:00`
- actor: `Codex`
- action: `rag_identity_finalized`
- page_path: `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-health.md`
- from_status: `RAG_INGESTED_VERIFIED`
- to_status: `RAG_INGESTED_VERIFIED`
- source_refs_delta: `0`
- head: `b5ac69333`
- reviewer: `owner:marcel-spatz`
- rag_eligibility: `ACTIVE`
- notes: `Final health probe confirms the stable-keyed notebook identity yuri-os/wiki-control-plane, the launchd watcher is running, and the live notebook holds 16 sources with 22 embedded chunks.`
