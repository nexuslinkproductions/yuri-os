# RAG Health Check Created

**Date**: 2026-05-11
**status**: RAG_HEALTH_CHECK_CREATED
**notebook_title**: Yuri Enterprise AI OS Research 2026-05
**notebook_id**: 5
**notebook_stable_key**: yuri-os/enterprise-ai-os-research-2026-05
**source_count**: 13
**chunk_count**: 22
**embedded_chunk_count**: 22
**advisory_only**: true
**local_truth_claim**: false

## Command

Run:

`npm run research:rag:health`

The health probe is read-only. It verifies manifest and ingestion-report counts against the live notebook database, and verifies the notebook stable key and title.

## Expected Result

- `ok`: `true`
- notebook id: `5`
- notebook stable key: `yuri-os/enterprise-ai-os-research-2026-05`
- source count: `13`
- chunk count: `22`
- embedded chunk count: `22`

## Runner Scope

This report remains report-only and is not listed in `backend/src/scripts/ingestYuriEnterpriseResearch.ts`.

Reason: the research RAG lane has a verified operational count of 13 sources and 22 embedded chunks. Adding this health report to the runner would intentionally change the lane corpus and invalidate the current expected counts. Future corpus expansion should be separately approved before embedding.

## Non-Claims

- This health check does not run ingestion.
- This health check does not mutate files or databases.
- This does not promote advisory research above `_SYSTEM/yuri-origin.md`.
- This does not certify legal, regulatory, security, or supply-chain compliance.
