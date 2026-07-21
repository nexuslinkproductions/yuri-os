---
name: cgs-books
description: René's Swiss bookkeeping PWA for custom-gear.ch — `cgs-books`, a PHP 8 + MariaDB zero-build app living at `C:\Users\rene\yuri-os\cgs-books` (its OWN git repo nested in the yuri-os tree) and deployed live at https://books.custom-gear.ch. Use when René says "cgs-books", "/cgs-books", "the books", "bookkeeping", "Buchhaltung", "Buchungen", "MwSt", "VAT", "Erfolgsrechnung", "Jahresabschluss", "Kontenplan", "Kontenrahmen", "Treuhänder", "milchbuechli", "books.custom-gear.ch", or references any path under `yuri-os/cgs-books`. Gives WHERE (paths, the nested-repo trap), the REAL deploy (subdomain — the README's /books+symlink variant was NOT taken), NO-LOCAL-PHP verdict, the route/schema map, the sw.js VERSION + manual-migration rules, the Alpine `:disabled` failure class, and never-touch secrets — so a fresh session is productive without re-discovering any of it.
triggers: ["cgs-books", "/cgs-books", "cgs books", "the books", "bookkeeping", "buchhaltung", "buchungen", "mwst", "erfolgsrechnung", "jahresabschluss", "kontenplan", "kontenrahmen", "treuhänder", "milchbuechli", "books.custom-gear.ch"]
---

# cgs-books — René's Swiss bookkeeping PWA (custom-gear.ch)

Context-loader skill, no processing pipeline of its own. READ-ONLY orientation for any session working on
cgs-books. Sibling of `cgs-cockpit` (the other CGS business app); unrelated to the Blender pipeline skills
`cgs-align` / `cgs-decimate` / `cgs-mold`.

**The durable deploy record lives in a SEPARATE project memory dir that a yuri-os session does NOT auto-load:**
`C:\Users\rene\.claude\projects\C--Users-rene-yuri-os-cgs-books\memory\cgs-books-deployment.md`
Read it before any deploy/infra work. Related: `cgs-cockpit.md`, `rene-cgs-jeffrey-operating-profile.md`
(both under `C--Users-rene-yuri-os\memory\`).

## WHAT IT IS

Swiss bookkeeping web app replacing milchbueechli.ch for **custom-gear.ch (René Spatz, sole proprietorship,
Kydex holster shop)**. Simplified income/expense ledger — **not double-entry** (OR 957 Abs. 2 "Milchbüechli-
rechnung", legal under CHF 500k turnover; records + receipts kept 10 years per OR 958f). Every booking is
coded to a **Schweizer Kontenrahmen KMU** account. VAT/MwSt (8.1 / 2.6 / 3.8 %) is fully built but **gated
OFF** until René registers (~Jan 2027) by setting `Einstellungen → MwSt-pflichtig ab`. Two VAT methods both
implemented: **Effektiv** (quarterly, output − Vorsteuer) and **Saldosteuersatz** (semi-annual flat rate).
Outputs CSV + PDF (Erfolgsrechnung, MwSt-Abrechnung) for the Treuhänder.

Stack: **PHP 8 + MariaDB + vanilla JS/Alpine PWA. Zero build step, no Composer, no Node.** Deploy = `git push`.

## WHERE (absolute paths, verified 2026-07-21)

- **Repo root**: `C:\Users\rene\yuri-os\cgs-books\` — **its own git repo** (remote
  `github.com/CGSSCHWEIZ/cgs-books`, branch `main`), physically nested inside the yuri-os working tree.
  **TRAP: never mix a cgs-books change into a yuri-os commit, or vice versa** — two repos, two histories,
  and yuri-os is on branch `rene` while this is on `main`.
- `public/` — **the only web-served dir**. `index.html` (PWA shell), `api.php` (JSON front controller),
  `js/{app.js,api.js}`, `css/app.css`, `sw.js`, `manifest.webmanifest`, `setup.php` (browser installer),
  `version.txt` (deploy marker, not read by the app).
- `src/` — backend, never web-served: `bootstrap.php`, `db.php`, `auth.php`, `helpers.php`, `vat.php`,
  `pdf.php` (hand-rolled zero-dep PDF writer), `accounts.php`, `migrate.php`, `controllers/*.php`.
- `db/migrations/` — `001_init.sql` (installer-owned), `002_accounts_vat.sql` (Kontenrahmen KMU + dual VAT),
  `003_recurring.sql`.
- `bin/` — `init-db.php`, `create-user.php` (CLI, only usable where PHP exists — not this box).
- `storage/receipts/`, `storage/logs/` — gitignored; the `.gitkeep`/`.htaccess` placeholders must survive.
- `config.php` — **does not exist in the working tree** and must not be created by hand; the installer
  writes it. `config.example.php` is the template.

## THE REAL DEPLOY (README §4 is NOT what was done)

Live at **https://books.custom-gear.ch** — a **subdomain**, not the `custom-gear.ch/books` path + symlink
variant the README documents at length. Trust the memory file over the README here.

- hosttech Plesk (`149.hosttech.eu:8443`), subscription custom-gear.ch. Repo cloned to server path
  `/cgs-books` (outside any docroot); subdomain **Document root = `/cgs-books/public`**.
- Git auth = SSH **deploy key** (read-only), `git@github.com:CGSSCHWEIZ/CGS-BOOKS.git` on the Plesk side.
- **GitHub → Plesk webhook is wired (2026-07-17): `git push` = live.** No manual Pull/Deploy click needed
  anymore (the memory file carries both the old manual line and the newer webhook line — the webhook one is
  current).
- PHP 8.3, Let's Encrypt + HTTP→HTTPS redirect. DB `custom_gear_books`, user `cgbooks`, `localhost:3306`,
  MariaDB 10.11. App login user `rene_spatz`. `config.php` at `/cgs-books/config.php`, `base_path=''`,
  `https_only=true`.
- **Host is PHP-only shared Plesk — zero Python, no Node, no Composer.** Do not propose a build step, a
  bundler, TypeScript, or a Node service. (Same infra fact as cgs-cockpit; do not re-litigate.)

## LOCAL DEV VERDICT — this box is EDIT-ONLY

`php -v` → **command not found**. `mysql --version` / `mariadb --version` → **command not found**
(verified 2026-07-21). There is no PHP interpreter and no MariaDB client on this Windows box, so
`php -S localhost:8000 -t public` from the README **cannot run today**. Consequences:

- You cannot execute or smoke-test the backend locally. **Do not claim a change "works" — say it is
  unverified-until-deployed**, or ask René to install PHP 8 + MariaDB if real local testing is wanted.
- Verification available locally: read the code, reason about SQL, and eyeball the frontend. Nothing more.
- Live verification path = push → webhook deploys → check `https://books.custom-gear.ch` in the browser.

## THE THREE DEPLOY RULES (each already cost a fix commit)

1. **Bump `VERSION` in `public/sw.js` on every frontend-asset change.** It is the cache name
   (`sw.js:2`, currently `cgs-books-v4`); `activate` deletes only non-matching caches. If `sw.js` bytes
   don't change, no install/activate cycle runs and René's phone silently keeps yesterday's UI against
   today's API. `public/.htaccess` no-cache/no-store headers help but do not replace the bump.
2. **Migrations do NOT auto-apply on deploy.** After adding `004_*.sql`, René must click
   `Einstellungen → Kontenplan → "Kontenplan einrichten"` (= `POST api.php?r=migrate`). `run_migrations()`
   skips any `001_*` file (installer-owned) and re-runs every other `*.sql` **on every call** — so a new
   migration MUST be idempotent (`IF NOT EXISTS` / `ON DUPLICATE KEY`) and named `004_`+ to sort correctly.
3. **Alpine.js binding bugs are THE recurring frontend failure class here.** `:disabled="undefined"`
   renders as *disabled* in Alpine 3.14 — it produced René's literal complaint **"This does not work, I
   cannot select anything"** repeatedly across 2026-07-17 and again 2026-07-20. Any new form object must
   explicitly set its boolean fields. When René reports "can't select / can't click", check Alpine
   reactive bindings FIRST.

## API + DATA MAP (verified against `public/api.php`)

Routing is `public/api.php?r=<route>`; JSON envelope `{ok:true,...}` / `{ok:false,error}`. Public routes:
`login`, `me`. Every other route requires auth; every non-GET/HEAD except `login` requires the
`X-CSRF-Token` header (token is session-scoped, returned by `me`, held only in JS memory).

`login · logout · me` · `entries · entry` · `categories` · `accounts · migrate` · `settings · password` ·
`receipt-upload · receipt · receipt-delete` · `report-pl · report-vat · export-csv · export-pdf` ·
`years · year-close · year-reopen · year-export` · `recurring · recurring-post`.

Tables: `users`, `login_attempts`, `settings` (KV), `categories`, `accounts` (002 — Kontenrahmen KMU, 22
seeded on live), `entries`, `receipts`, `fiscal_years`, `recurring_entries` (003).

UI tabs (German, as René sees them): **Buchungen · Wiederkehrend · Berichte · Jahresabschluss · Einstellungen**.

## SHARP EDGES (read before editing backend logic)

- **VAT is double-gated**: off unless `settings.vat_registered_from` is set AND the entry date is ≥ it
  (`src/vat.php`). Editing an old entry's date across that boundary silently flips its rate to 0.
- **`amount_net` / `vat_amount` / `amount_total` are STORED, not derived.** Changing `vat_compute()` does
  not retroactively fix existing rows — only re-saved entries recompute. Reports read the stored numbers.
- **Year close bulk-locks by date range** (`UPDATE entries SET locked=1 WHERE entry_date BETWEEN ...`). Any
  new write path must call `year_guard_writable()` for BOTH the old and the new date, or it can silently
  write into a closed Geschäftsjahr.
- **`accounts_ready()` is a try/catch probe**, not a flag — the app degrades to category-only mode if
  migration 002 hasn't run. Don't assume the `accounts` table exists.
- **Recurring entries have no cron** (shared hosting). They surface as a due-badge and are posted manually
  via `recurring-post`, which books on the template's `next_due_date` — not today's.
- **Alpine 3.14 is loaded from the jsDelivr CDN, not vendored** (`index.html`). First load offline = blank
  page; it only works offline after one successful online visit (the SW precaches the CDN URL).
- **`public/setup.php` self-disables by DB state, not by deleting itself** — step 1 is skipped once
  `config.php` exists, admin creation once a user row exists. It is safe to leave, safe to delete
  (README/memory both note deleting it + `version.txt` is harmless).
- `security.app_key` exists in config but is **consumed nowhere** in `src/` — CSRF is plain
  `$_SESSION['csrf']`. Don't assume it signs anything.

## NEVER TOUCH — secrets / private data

- `config.php` (server-side only: DB password) — never read, never create by hand, never commit.
- `storage/receipts/` — real scanned business receipts. Gitignored. Do not read, move, or commit.
- The live DB and anything containing real customer/order data — RULE B split-routing applies (see
  `rene-cgs-jeffrey-operating-profile.md`): real names/addresses/order details stay local or get anonymised.
- `cgs-books/.claude/state/` — protected path, do not read.

## WORKFLOW discipline

- Commit inside `cgs-books/` with an explicit pathspec, on branch `main`, from within that repo. Never
  `git add .`. Never stage cgs-books files from the yuri-os repo.
- A push is a **production deploy** (webhook → live). Treat every push as outward-facing: diff reviewed,
  `sw.js` VERSION bumped if frontend assets changed, and tell René if a new migration needs his click.
- Since nothing can be executed locally, state residual risk explicitly instead of claiming verification.
- Anything about VAT method choice, Saldosteuersatz rate, or the Treuhänder handoff format beyond the
  README's defaults is **unsettled → ask René**; no owner ruling exists in the record.

## Status

LIVE with real bookkeeping data since 2026-07-17. v2 (Kontenrahmen KMU + dual VAT method) shipped and its
migration already run on the live DB (22 accounts). Working tree clean, `main` in sync with origin, last
commit `a7ab2fc` (2026-07-20). Open: VAT stays off until registration (~Jan 2027, configure the method +
Saldosteuersatz with the Treuhänder then); René may delete `public/setup.php` + `public/version.txt`; the
"cannot select anything" Alpine class recurred after its first fix — treat as not fully closed.

## Session Notes

### 2026-07-21 (created)
- Built as a pure context/orientation skill, mirroring the `cgs-cockpit` pattern (no pipeline, no edits to
  the target app). Fleet: 3 parallel Sonnet Explore lanes (backend map / frontend+deploy+env / prior-
  knowledge hunt), Opus synthesized and re-verified the load-bearing claims directly.
- Independently re-verified before writing: `public/sw.js:2` VERSION string, the full `case '<route>'` list
  in `public/api.php`, the `001_` skip in `src/migrate.php`, and the existence + content of the separate
  `C--Users-rene-yuri-os-cgs-books` memory dir. The `php`/`mysql` "command not found" verdict came from a
  lane and matches this box's known PHP-free state — re-run `php -v` if it ever matters.
- Divergence surfaced and resolved in favour of the memory file: the repo README documents a
  `custom-gear.ch/books` + symlink deploy; the live deploy is the `books.custom-gear.ch` **subdomain**.
  Also noted: the local git remote is HTTPS `github.com/CGSSCHWEIZ/cgs-books` while Plesk uses the SSH
  deploy-key URL `git@github.com:CGSSCHWEIZ/CGS-BOOKS.git` — same repo, different auth path.
- House idiom followed: `.claude/skills/` only, no `skills/` mirror, no `.claude/memory/MEMORY.md` entry —
  consistent with cgs-align / cgs-decimate / cgs-mold / cgs-cockpit.
- `@anchor: none` for the skill as a whole (orientation, not a hardened procedure) — except the three
  deploy rules, which each trace to a real commit/complaint: sw.js caching → `8323186`/`2349752`, manual
  migration button → `a7ab2fc`, Alpine `:disabled` → `2349752` + the recurring "I cannot select anything"
  messages in the sentinel logs (2026-07-17, 2026-07-20).
- Tools: Agent ×3 (Explore/sonnet), Read, Bash (read-only), Write.
