## CODEX TASK SPEC — Slice E: WKO.at Live Scraper

**Slice name:** Real Austrian company records from WKO.at (replaces 9 hardcoded demos)
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/NUDIMMUD/.codex-worktrees/prism-workbench`

---

**Goal:** Replace the 9 hardcoded WKO demo records in `cold-acquisition-real-feed.mjs` with a live scraper that fetches 50–100 real Vienna software/IT/media companies from the public WKO.at firmen search.

---

**Read before changing code:**
- `Scripts/cold-acquisition-real-feed.mjs` — lines 22–150 (hardcoded `WKO_RECORDS` array) and lines 372–433 (AT ingest loop)
- `backend/src/services/coldAcquisitionService.ts` — `AustriaDirectoryRecord` type (the shape `ingestAustriaDirectory()` expects)

---

**Target files:**

**New file: `Scripts/cold-acquisition-wko-scraper.mjs`**

Implement an async function `scrapeWkoVienna(limit = 60)` that:

1. Targets these WKO industry search URLs in sequence (stop when `limit` records collected):
   ```
   https://firmen.wko.at/Web/SearchCompany.aspx?searchtyp=firma&searchValue=&sparte=IT&bundesland=Wien&bezirk=
   https://firmen.wko.at/Web/SearchCompany.aspx?searchtyp=firma&searchValue=&sparte=Werbung&bundesland=Wien&bezirk=
   https://firmen.wko.at/Web/SearchCompany.aspx?searchtyp=firma&searchValue=&sparte=Medien&bundesland=Wien&bezirk=
   ```
   If those URL patterns don't return results (WKO may have updated their URLs), fall back to:
   ```
   https://firmen.wko.at/?searchtyp=firma&q=software&bundesland=Wien
   https://firmen.wko.at/?searchtyp=firma&q=IT+Dienstleistung&bundesland=Wien
   ```

2. For each search results page:
   - Parse HTML with regex (no external parser) to extract company listing items
   - Each item typically contains: company name, address, postal code, city, WKO profile link
   - Follow the WKO profile link for each company → fetch profile page → extract:
     - `description` / `Firmenbeschreibung` paragraph (if present)
     - Contact person name (look for `Ansprechperson`, `Kontakt`, `Inhaber`)
     - Email (if published — look for `mailto:` links or visible email text)
     - Website URL (look for external link in profile)
     - Phone (if present — `tel:` links)
   - Filter: only keep records with postal code starting with `1` (Vienna only)
   - Skip records without a company name

3. Return array of `AustriaDirectoryRecord`-compatible objects:
   ```js
   {
     source: 'wko',
     name: <company name>,
     fn: null,                          // FN not available from search
     bezirk: 'Wien',
     postal_code: <postal code>,
     city: 'Wien',
     legal_form: null,                  // Not available from search
     date_of_entry: null,
     employee_count: null,
     industry: <inferred from search category: 'software / IT services' | 'media / advertising'>,
     website: <extracted website or null>,
     linkedin_url: null,
     contact_name: <extracted contact or null>,
     contact_title: null,
     contact_email: <extracted email or null>,
     contact_linkedin: null,
     source_url: <wko profile URL>,
     published_b2b_email: <true if email was visible on profile page, else false>,
     evidence_detail: <description text, max 200 chars, or 'WKO company listing — Wien'>
   }
   ```

4. Add `await sleep(300)` between each profile page fetch (be polite to WKO servers).

5. Export: `export { scrapeWkoVienna }`

6. If fetching fails (network error, unexpected HTML structure): log the error to stderr and return whatever partial results were collected — never throw.

**`Scripts/cold-acquisition-real-feed.mjs`**

1. Import `scrapeWkoVienna` from `./cold-acquisition-wko-scraper.mjs`
2. Replace the hardcoded `WKO_RECORDS` array (lines 22–150) with a call to `scrapeWkoVienna(at_limit)` — pass the `at_limit` argument from the feed script's config
3. Keep the existing website-inspection logic (email detection, English signals) — it runs AFTER the WKO scraper returns records, same as before
4. The `WKO_RECORDS` array block must be entirely removed — no partial retention

---

**Constraints:**
- Do NOT modify the backend ingest routes or frontend
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- Do NOT add external npm dependencies — built-in `fetch` and regex only
- Scraper must degrade gracefully (return partial results) on network errors
- `at_limit` default stays 9 for backward compat in tests; dry-run default in the feed is now 20
- No `backend/node_modules` symlink in git status

---

**Acceptance criteria:**
- [ ] `node Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `WKO_RECORDS` constant no longer exists in `cold-acquisition-real-feed.mjs`
- [ ] `cold-acquisition-wko-scraper.mjs` exists and exports `scrapeWkoVienna`
- [ ] Dry-run with `at_limit: 3` returns ≥1 AT record with `source: 'wko'` and `source_url` containing `wko.at`
- [ ] Script does not crash when WKO is unreachable (returns empty array)

**Test command:**
```bash
node Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
# Quick scraper smoke test
node -e "import('./Scripts/cold-acquisition-wko-scraper.mjs').then(m => m.scrapeWkoVienna(3)).then(r => console.log(JSON.stringify(r.slice(0,1), null, 2))).catch(console.error)"
```

**Staging commands:**
```bash
git add Scripts/cold-acquisition-wko-scraper.mjs Scripts/cold-acquisition-real-feed.mjs
```

**Rollback boundary:** `git restore --staged .`

**Prohibited:**
- No auto-commit
- No git push
- No `git add .` or `git add -A`
- No new npm dependencies
