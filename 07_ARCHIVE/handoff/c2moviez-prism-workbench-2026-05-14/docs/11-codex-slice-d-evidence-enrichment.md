## CODEX TASK SPEC — Slice D: Evidence Enrichment Engine

**Slice name:** Zefix RDF Contact Extraction + Website Deep Crawl
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/NUDIMMUD/.codex-worktrees/prism-workbench`

---

**Goal:** Make every lead have 3–6 evidence items instead of 1. Extract real contact names from Zefix RDF board data. Deep-crawl company websites for about/team/tech/news signals that Fanny can actually use.

---

**Read before changing code:**
- `Scripts/cold-acquisition-real-feed.mjs` — existing fetch logic (lines 271–370)
- `backend/src/services/coldAcquisitionService.ts` — `ColdLeadEvidence` type, `ingestZefixBulk()`, `ingestAustriaDirectory()`

---

**Target files:**

**`Scripts/cold-acquisition-real-feed.mjs`**

1. In the Zefix per-company RDF fetch (currently around lines 298–320):
   - After extracting `schema:description`, ALSO extract board member nodes:
     - Parse all triples matching `?s schema:member ?person` or `?s zefix:member ?person`
     - For each person node: extract `schema:name` or `rdfs:label` value
     - Take the first board member name found → set `contact.name` on the record
     - Set `contact.title = 'Board member (Zefix)'` when populated this way
   - Extract full `schema:description` without truncation (currently capped at 280 chars) → add as second evidence item with `kind: 'zefix_purpose'`, `label: 'Company purpose'`, `detail: <full description text>`
   - If `schema:url` is present in RDF and `record.website` is empty, populate `record.website`

2. Add a `deepCrawlWebsite(url)` async function that:
   - Tries these paths in order (with 6s timeout each, stop on first 200): `/`, `/about`, `/ueber-uns`, `/en/about`, `/services`, `/leistungen`, `/team`, `/blog`, `/news`
   - From the homepage (`/`): extract `<meta name="description" content="...">` and `<h1>` text → evidence item `kind: 'website_about'`, `label: 'Company description'`, `detail: <meta description or h1, max 200 chars>`
   - From `/about` or `/ueber-uns` (whichever 200s first): extract first `<p>` text ≥ 40 chars → evidence item `kind: 'website_about_page'`, `label: 'About page'`, `detail: <text, max 200 chars>`
   - From `/team` (if 200): extract all `<h2>`, `<h3>`, `<strong>` text that looks like a person name (2 words, both capitalised, no digit) → take first match → if `record.contact.name` is empty, set it; add evidence item `kind: 'website_team'`, `label: 'Team page contact'`, `detail: <name> (from /team page)`
   - From `/blog` or `/news` (whichever 200s first): extract first `<article>` or `<h2>` inside a post list → evidence item `kind: 'website_news'`, `label: 'Recent post'`, `detail: <post title, max 100 chars>`
   - Tech stack detection (on homepage HTML): check for presence of string patterns `shopify`, `woocommerce`, `react`, `next.js`, `webflow`, `hubspot`, `salesforce`, `sap` (case-insensitive) → for each found, add ONE evidence item `kind: 'website_tech_signal'`, `label: 'Technology signal'`, `detail: 'Uses <tech>'`
   - Only add each evidence kind once per lead (no duplicates)
   - If website is empty or all fetches time out/error: return empty array, do not crash
   - Respect robots: do not crawl `/wp-admin`, `/admin`, `/login`

3. Call `deepCrawlWebsite(record.website)` for EACH company in both CH and AT batches after the basic record is built. Merge returned evidence items into `record.evidence`.

4. Remove rate-limit: existing `await sleep(75)` between Zefix detail fetches is OK. Add `await sleep(150)` between website deep crawls to avoid hammering.

**`backend/src/services/coldAcquisitionService.ts`**

- Add these string literals to the `ColdLeadEvidence['kind']` union type (or wherever the kind is typed): `'zefix_purpose'`, `'website_about'`, `'website_about_page'`, `'website_team'`, `'website_tech_signal'`, `'website_news'`
- No other changes to this file

---

**Constraints:**
- Do NOT modify ingest routes or frontend
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- Do NOT add new npm dependencies — use built-in `fetch`, `URL`, HTML regex only (no cheerio/jsdom)
- `deepCrawlWebsite` must never throw — wrap in try/catch, return `[]` on any error
- Existing email detection logic must remain unchanged
- No `backend/node_modules` symlink in git status

---

**Acceptance criteria:**
- [ ] `node Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] Dry-run of live feed returns ≥1 CH record with `evidence` array length ≥ 2
- [ ] Dry-run returns ≥1 CH record where `contact.name` is non-empty (from RDF board data)
- [ ] Dry-run returns ≥1 record with `evidence[*].kind === 'website_about'`
- [ ] No crash when website is unreachable

**Test commands:**
```bash
node Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
# Dry-run live feed (inspect output manually)
API_KEY='local-dev-api-key-1234567890' node -e "
const r = await fetch('http://127.0.0.1:3911/acquisition/api/admin/live-feed', {
  method: 'POST',
  headers: {'Content-Type':'application/json','X-API-KEY':'local-dev-api-key-1234567890'},
  body: JSON.stringify({ch_limit:3, at_limit:2, apply:false})
});
console.log(JSON.stringify(await r.json(), null, 2));
" 2>&1 | head -100
```

**Staging commands (run after tests pass):**
```bash
git add Scripts/cold-acquisition-real-feed.mjs backend/src/services/coldAcquisitionService.ts
```

**Rollback boundary:** `git restore --staged .`

**Prohibited:**
- No auto-commit
- No git push
- No `git add .` or `git add -A`
- No new npm dependencies
