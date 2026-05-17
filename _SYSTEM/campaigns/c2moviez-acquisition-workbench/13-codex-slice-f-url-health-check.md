## CODEX TASK SPEC — Slice F: Source URL Health Check

**Slice name:** Dead link prevention — validate source URLs before ingest
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/YURI-OS-MUSUBI/.codex-worktrees/prism-workbench`

---

**Goal:** No lead enters the database with a broken `source_url` or `company.website`. Fanny should never see a 404 link in the Dossier.

---

**Read before changing code:**
- `backend/src/services/coldAcquisitionService.ts` — `ingestZefixBulk()` (~line 532) and `ingestAustriaDirectory()` (~line 601)
- `ColdLeadEvidence` type and `ColdLeadComplianceRecord` type in the same file

---

**Target files:**

**`backend/src/services/coldAcquisitionService.ts`**

Add a private async helper `checkUrlLive(url: string | null | undefined): Promise<boolean>`:
- If url is null/undefined/empty: return false
- HEAD request to url with 5s timeout and `User-Agent: PRISM-Workbench/1.0`
- Return true if status 200–399, false otherwise
- Never throw — catch all errors, return false

In `ingestZefixBulk(records)`:
- Before creating each `ColdLeadRecord`, call `checkUrlLive(record.source_url)`
- If returns false: set `compliance.source_url = 'unavailable'` and clear `evidence[0].url` (set to undefined)
- Call `checkUrlLive(record.website)` — if returns false: set `company.website = undefined`
- Do NOT skip the lead — still ingest it, just without the broken URLs

In `ingestAustriaDirectory(records)`:
- Same treatment: check `source_url` and `website`, nullify if dead

Do NOT add URL checks anywhere else. No changes to routes, frontend, or other service methods.

---

**Constraints:**
- Do NOT modify the live feed script, routes, or frontend
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- Health check must be async/non-blocking — use `Promise.all` if checking multiple leads in batch would be faster, but don't block the entire ingest on one slow check
- A URL that is slow (>5s) counts as dead
- No `backend/node_modules` symlink in git status

---

**Acceptance criteria:**
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `PATH=... TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] Ingesting a record with a known-dead source_url produces a lead with `compliance.source_url === 'unavailable'`
- [ ] Ingesting a record with a live source_url keeps the URL intact

**Test commands:**
```bash
npx tsc -p acquisition/tsconfig.json --noEmit
PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs
```

**Staging commands:**
```bash
git add backend/src/services/coldAcquisitionService.ts
```

**Rollback boundary:** `git restore --staged .`

**Prohibited:**
- No auto-commit
- No git push
- No `git add .` or `git add -A`
