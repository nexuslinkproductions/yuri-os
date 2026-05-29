# RESUME ANCHOR — Backend Removal (2026-05-29)

Pick up here after a context clear. This is the ONE remaining flagged item from the control-plane cleanup.

## The task
Remove `_SYSTEM/backend/` entirely — it's **pre-ICM NUDIMMUD-era legacy** (TS Express server + vite + Conclave/deities/swarm-orchestrator/design-studio/oracle/neural-forge, ~308M incl. node_modules + the old `yuri.db`). The current yuri = the Scripts-based control plane; it does **not** need the backend. Owner gave full override to remove it.

## Already done (do NOT redo)
- **Offload routing decoupled** from the backend: `offload.sh` is local-only (no `/api/swarm/route` call, no 3-5s timeout); `BACKEND_URL`/`AUTH_HOOK`/`load_route_auth_headers`/`build_route_payload` removed.
- **12 backend-API scripts archived** → `_SYSTEM/archive/legacy-purge-2026-05/backend-scripts/` (auth.mjs, auth.test, backend-cors-hardening.test, backend-route-auth-matrix.test, backend-db-* ×8).
- **Deity cutover SUPERSEDED** — deities live in this backend → deleted with it, not migrated (`DEITY_CUTOVER_RUNBOOK_2026-05-29.md`).
- Verified: zero `BACKEND_URL`/`api/swarm/route`/`swarmOrchestrator` refs in live yuri code.

## Remaining steps
1. **Re-grep fresh** (count shifted after this session archived the semantic layer):
   `grep -rIln "from ['\"].*backend/\|require(.*backend/\|_SYSTEM/backend/src\|\.\./backend" _SYSTEM/Scripts .claude/hooks | grep -v /archive/`
   Last known ~13 refs: **8 tests** (backend-telemetry-truth.test, yuri-canonical-memory-import.test, design-assistant-routes.test, root-architecture.test, backend-gitnexus-status-truth.test, yuri-exeoflow-assimilation.test, token-ledger.test, generated-artifact-hygiene.test) + **5 functional** (wiki-rag-watch.mjs, embed-backfill.mjs, yuri-memory-map.mjs, ollama-router-canary.mjs, ollama-promotion-readiness.mjs).
2. **Classify each ref:** backend-feature tests → archive with the backend; functional refs → decouple (most are incidental `_SYSTEM/backend` path strings or RAG-ingestion for the dead backend). wiki-rag-watch + embed-backfill are backend-RAG-ingestion → archive (the NEW FTS5 search replaces corpus retrieval). Adversarially verify each caller degrades cleanly (same discipline that caught the skills/deity/semantic over-reaches this session).
3. **Then delete the dir.** `backend/data/` is a PROTECTED surface — the harness HARD-DENIES agent writes there, so the agent cannot `rm` it. **Owner runs:** `rm -rf _SYSTEM/backend` (optionally `cp` the old `yuri.db` aside first — it's the legacy command-center DB, NOT current memory, which is `_SYSTEM/OS_KERNEL/memory.db`).
4. Verify: full test sweep green, `ai route-plan`/`ai search` work, no dangling backend refs.

## Session context (all DONE + verified this session, uncommitted, no commits made)
comet full-retire · nexbox removal · swarm→native (DeepSeek doubling killed) · protected-path single-source + enforcement hook→ESM + negative tests · claim-integrity wired into yuri-closeout · backend offload-decouple · c2moviez tmp clone trashed · RAG/palace/semantic layer ripped out + archived (brain-inject curated-only, palace daemon disabled, 7 semantic scripts + semantic-memory.db archived, 6 core scripts Opus-decoupled) · **FTS5 corpus search built** (`ai search`/`ai reindex`, 34.8k docs indexed, separate `search-index.db`, zero deps).

Codex final-pass packets written + waiting (not dispatched): `CODEX_FINAL_PASS_control-plane-rework-2_2026-05-29.md`, `CODEX_FINAL_PASS_comet-retire-gate-fixes_2026-05-29.md`. Branch: `energy-landscape-sprint-2026-05-28`.

## Optional follow-ups (lower priority, flagged)
- `ai search` index: run `ai reindex` to finish the last sliver (build was paused ~34.8k docs).
- `.claude/skills` ↔ `/skills` parity (managed system — needs owner sign-off, do NOT manual-archive).
- swarm `ai` deep-surface (run_codex_swarm/run_ruflo_swarm fallbacks) — single-lane via shim, non-breaking, optional cleanup.
- `claude-protocol-guard.js` shim → archive after a session reload confirms the `.mjs` is live.
