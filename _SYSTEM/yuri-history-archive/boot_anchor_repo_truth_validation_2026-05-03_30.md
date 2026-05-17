# Boot Anchor Repo Truth Validation

- Input anchors: 9
- Output validations: 9
- Repo truth rule: current repo state outranks archive history
- No RAG ingestion
- No session boot mutation
- No raw archive body dumps
- No non-scoped file edits

## Result

- `verified_reference`: 3
- `needs_more_review`: 6
- `blocked`: 0
- `superseded`: 0

## Validations

1. `yuri_os_yuri_session_context_extract_2026-04-27 (1).md` -> `needs_more_review`
   - Evidence: timeline rank 3 latest candidate; manifest entry; archive header
   - Repo check: compare body scope with the dated 2026-04-27 extracts before any future use
2. `yuri_os_yuri_rag_ingest_r_3_handoff_2026_05_01.md` -> `needs_more_review`
   - Evidence: timeline rank 17 latest candidate; manifest entry; archive header
   - Repo check: confirm no R4+ ingest artifact exists in current repo history
3. `YURI_OS_YURI_SESSION_CONTINUATION_AFTER_07K_QUERY_HARDENING_AND_HERMES_2026-05-01.md` -> `needs_more_review`
   - Evidence: timeline rank 19 latest candidate; manifest entry; archive header
   - Repo check: confirm Hermes integration and query-hardening state in current repo and git log
4. `YURI_OS_YURI_GPT_SESSION_CONTINUITY_AFTER_07K_RAG_QUERY_SWARM_COMMITS_2026-05-01.md` -> `needs_more_review`
   - Evidence: timeline rank 20 latest candidate; manifest entry; archive header
   - Repo check: verify 07K RAG query and swarm commit state in git log
5. `YURI_OS_YURI_GPT_SESSION_ARCHIVE_2026-05-03_PART2_YURI_HUD_CONTINUATION.md` -> `needs_more_review`
   - Evidence: timeline rank 25 latest candidate; manifest entry; archive header
   - Repo check: compare body coverage with `PART_2` and verify HUD implementation state
6. `YURI_OS_YURI_SESSION_HANDOFF_2026-05-03_WEBSEARCH_DEEPSEEK_EXECUTOR_HUD.md` -> `verified_reference`
   - Evidence: timeline rank 26 latest candidate; manifest entry; archive header
   - Repo check: confirm current websearch executor and HUD implementation state
7. `YURI_OS_YURI_SESSION_HANDOFF_2026-05-03_LOCAL_CLAIM_VERIFIER_TO_COMPOSER.md` -> `verified_reference`
   - Evidence: timeline rank 27 latest candidate; manifest entry; archive header
   - Repo check: confirm current local claim verifier implementation state
8. `YURI_OS_YURI_SESSION_ARCHIVE_2026-05-03_HUD_DEEPSEEK_TOKENOPS.md` -> `verified_reference`
   - Evidence: timeline rank 28 latest candidate; manifest entry; archive header
   - Repo check: confirm current DeepSeek integration and TokenOps HUD state
9. `yuri_os_yuri_session_context_extract (1).md` -> `needs_more_review`
   - Evidence: timeline rank 30 latest candidate; classification needs-review entry; archive header
   - Repo check: verify extraction date from body and compare scope with the dated 2026-04-27 extracts

## Blocked

- None

## Current Use Policy

- Archive anchors stay historical reference only
- Do not promote any anchor into boot, memory, RAG, or session config
- Re-check body/date/state before any future use

## Next Recommended Lane

- `session_context_extract` review first, then `gpt_session_archive` body coverage review
