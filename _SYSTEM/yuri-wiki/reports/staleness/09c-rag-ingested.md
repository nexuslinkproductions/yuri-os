# 09C Fixture RAG Ingested and Verified

status: `RAG_INGESTED_VERIFIED`
checked_at: `2026-05-09T20:41:27+02:00`
head: `b5ac69333cf34915863f65fa6dcb4c6918a29107`
notebook_title: `Yuri Wiki Control Plane`
notebook_id: `4`
notebook_stable_key: `yuri-os/wiki-control-plane`
source_count: `16`
chunk_count: `22`
embedded_chunk_count: `22`
query_verification: `PASS`
query_model: `qwen-liberated:latest`

## Result

The wiki control-plane lane was ingested into a dedicated notebook and verified with an end-to-end retrieval query.

## Evidence

- 16 wiki control-plane sources ingested.
- 22 total chunks created.
- 22 chunks embedded successfully.
- Notebook identity is stable-keyed as `yuri-os/wiki-control-plane`.
- RAG query returned the expected control-plane state.

## Non-Claims

- No source registry rows were rewritten.
- No wiki source file content was altered during ingestion.
- No claim is made about unrelated vault content.

## Next Durable Step

Keep the dedicated notebook as the stable future retrieval target for this wiki lane. Re-run embedding/backfill only if the notebook identity key, local model runtime, or control-plane source set changes, or if the automation health probe reports drift.
