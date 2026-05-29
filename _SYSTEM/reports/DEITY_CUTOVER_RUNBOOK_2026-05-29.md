# Deity / Conclave Cutover — Discovery + Atomic Runbook (2026-05-29)

**SUPERSEDED 2026-05-29:** Owner decided the entire `_SYSTEM/backend/` (the deities live there) is pre-ICM
NUDIMMUD-era legacy to be removed, not migrated. There is no deity rename to perform — the pantheon is
deleted with the backend. The yuri control plane has been DECOUPLED from the backend (offload.sh local-only;
12 backend-API scripts archived). Remaining before `rm -rf _SYSTEM/backend`: clear 13 active Script refs
(8 tests + 5 functional: wiki-rag-watch, embed-backfill, yuri-memory-map, ollama-router-canary,
ollama-promotion-readiness). See the session report. The discovery below is retained as the record.

---

**Status:** DISCOVERED + DE-RISKED. NOT executed (superseded by full backend removal).
**Authorization on file:** owner approved "back up then full migration" of the whole pantheon → yuri/musubi.

## The key de-risking finding (the feared monster does not exist)

The prior session reserved this as a "169MB FK-referenced PK migration" — **that fear was based on a wrong assumption.**
- `_SYSTEM/OS_KERNEL/memory.db` → `deities` table is **EMPTY (0 rows)**; PK is `id INTEGER AUTOINCREMENT`, `name` is just a UNIQUE TEXT column, **not** an FK-referenced PK. The 170MB is unrelated telemetry/memory/token-ledger data. **Nothing to migrate in memory.db.**
- The real pantheon lives in the **backend `yuri.db`** (seeded from `database.ts`) + TS source.

## Why it was NOT executed piecemeal from this session (both are blockers)

1. **Protected-path enforcement blocked it.** Raw `sqlite3 backend/data/yuri.db` was DENIED by the guard (the protected-surface boundary hardened this same session). Respecting it, not bypassing.
2. **Atomicity.** A source-only rename desyncs `database.ts` seeds ↔ existing `yuri.db` rows ↔ external `NISABA/` vault folder ↔ the running compiled backend. A partial cutover is *worse* than none. Must be done atomically with the backend coordinated (stopped → migrated → rebuilt → restarted).

→ This is a focused backend session, exactly as the prior session intuited — now backed by exact discovery.

## Exact rename surface (verified this session)

**Proposed name map** (owner to confirm/adjust):
| Old | New |
|-----|-----|
| ENLIL (ArchitectNode) | yuri-architect |
| NABU (ScribeNode) | yuri-scribe |
| ENKI (CraftsmanNode) | yuri-forge |
| INANNA (GuardianNode) | yuri-guardian |
| NISABA | yuri-deploy (+ external vault `NISABA/` → `YURI-VAULT/`) |
| OPENCLAW | yuri-sentinel (already absorbed as yuri-sentinel elsewhere) |
| NOESIS / OBLITERATUS | yuri-linter |

**Files (all backend/src — NOT protected, git-tracked, reversible):**
- `_SYSTEM/backend/src/conclave/nodes/ArchitectNode.ts` (ENLIL), `ScribeNode.ts` (NABU), `CraftsmanNode.ts` (ENKI), `GuardianNode.ts` (INANNA)
- `_SYSTEM/backend/src/models/database.ts` — `insertDeity.run('NISABA'...)` seeds (ENKI×3, NABU×2, NISABA, NOESIS, OBLITERATUS) + `swarm_messages` table (see swarm phase-2)
- `_SYSTEM/backend/src/routes/api.ts:571` — `GET /deities` → `getAllDeities(db)`
- services: `neuralForgeService.ts`, `oracleService.ts`, `designStudioService.ts`, `siteBuilderService.ts`
- `_SYSTEM/backend/src/scripts/ingestResearch.ts` — `NISABA/...` vault paths (→ `YURI-VAULT/...`)
- `_SYSTEM/backend/src/utils/pathResolver.ts` — `SystemConfig.ROOT` (external vault root)

**Protected DB:** `backend/data/yuri.db` `deities` rows — migrate via a backend migration script run with the backend stopped + the protected-path op explicitly approved (NOT raw sqlite3 from an agent session).

**External Obsidian vault:** `SystemConfig.ROOT/NISABA/` folder tree → `YURI-VAULT/` (filesystem rename, external to repo).

## Atomic execution order (focused session)

1. Fresh backup: `cp memory.db memory.db.bak-<ts>` (live DB is 170M now, > the 169M backup), `cp backend/data/yuri.db yuri.db.bak-<ts>`, and **back up the external Obsidian vault** before the folder rename.
2. Stop the backend service (it reads/writes yuri.db + re-seeds from database.ts on boot).
3. Rename TS source (node classes, database.ts seeds, api/services, ingestResearch paths) — git-tracked, one commit-candidate.
4. Migrate `yuri.db` deity rows (backend migration script, FK is trivial — `name` is UNIQUE text, autoincrement PK; simple `UPDATE deities SET name=... WHERE name=...`). Re-seed is idempotent after rename.
5. Rename external vault folder `NISABA/` → `YURI-VAULT/` + update `SystemConfig.ROOT` vault refs.
6. `npm run build` (TS) the backend; restart.
7. Verify: `GET /deities` returns new names; `ingestResearch` finds `YURI-VAULT/`; backend boots clean; memory.db deities still empty (no-op).

## Residual risk
- `swarm_messages` table + backend swarm routes/`SwarmOrchestrator` are flagged for swarm phase-2 (separate); the deity cutover touches `database.ts` which also defines `swarm_messages` — coordinate the two backend passes.
- External vault rename is outside the repo — confirm the exact `SystemConfig.ROOT` path + back it up first.
