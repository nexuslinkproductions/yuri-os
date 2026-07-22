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

## LOCAL DEV VERDICT — lint locally, run only in production

- **PHP CLI IS installed: `C:\php\php.exe` (8.3.32, NTS x64)** — matches the server's 8.3.31 line. Added
  2026-07-22 after an outage (below). No MariaDB client, so you still cannot *run* the app locally, but you
  **can and MUST lint it.**
- **HARD RULE — `php -l` every changed PHP file before every push.** A push webhook-deploys straight to
  production; a PHP parse error there returns a caught `ParseError` as a clean JSON 500 on **every route**
  (not an obvious fatal), taking the whole app down. `node --check` only covers the JS — it will not save
  you. <!-- @anchor: v1 | failure: cgs-books-parse-error-outage-2026-07-22 | regression: php -l gate in this skill -->
  ```bash
  for f in $(find src public bin -name '*.php'); do /c/Users/rene/php/php.exe -l "$f"; done
  ```
- Backend logic still cannot be executed locally (no DB) — for that, verify against the running app after
  deploy (hit the real endpoints), and **state residual risk** rather than claiming "works".
- Live verification path = `php -l` → push → webhook deploys → probe `https://books.custom-gear.ch` API +
  read data back. The server error log is reachable in **Plesk → books.custom-gear.ch → Protokolle**
  (filter to Apache-Fehler) — that one line names the failing file:line when a deploy breaks.

## THE THREE DEPLOY RULES (each already cost a fix commit)

1. **Bump `VERSION` in `public/sw.js` on every frontend-asset change.** It is the cache name
   (`sw.js:2`, currently `cgs-books-v18`); `activate` deletes only non-matching caches. Still good practice
   (clean cache rotation + it re-runs the install precache), but **as of v18 it is no longer load-bearing for
   freshness**: the app shell (navigations + `.html`/`.js`/`.css`) is now **network-first**, so a deploy lands
   on the FIRST online reload regardless of the VERSION bump. The old "silently keeps yesterday's UI / needs
   TWO reloads" gotcha is FIXED (2026-07-22, round 8). Statics (logo/icons/manifest) + the Alpine CDN stay
   cache-first (offline-critical); `api.php`/`?r=` stays network-only. Offline = cached shell fallback (incl.
   cached `index.html` for query-string navigations). <!-- @anchor: v1 | failure: cgs-books-sw-2reload-cachelag-2026-07-22 | regression: network-first shell in sw.js; cache-poison live test -->
   If a browser is still on a PRE-v18 SW and looks stale, it's the one-time transition (the old cache-first SW
   served that load): unregister SW + clear CacheStorage + reload, or just wait for the v18 SW to claim.
2. **Migrations do NOT auto-apply on deploy.** After adding `004_*.sql`, René must click
   `Einstellungen → Kontenplan → "Kontenplan einrichten"` (= `POST api.php?r=migrate`). `run_migrations()`
   skips any `001_*` file (installer-owned) and re-runs every other `*.sql` **on every call** — so a new
   migration MUST be idempotent (`IF NOT EXISTS` / `ON DUPLICATE KEY`) and named `004_`+ to sort correctly.
3. **Alpine.js binding bugs are THE recurring frontend failure class here.** Two confirmed forms:
   (a) `:disabled="undefined"` renders as *disabled* in Alpine 3.14 — René's "This does not work, I cannot
   select anything" (2026-07-17/20); every new form object must set its boolean fields explicitly.
   (b) **A `<template x-for>` must have exactly ONE root element** — Alpine renders only the first root and
   silently drops the rest. The Erfolgsrechnung expense loop had a class-header `<tr>` AND an inner
   `<template x-for>` as siblings, so account rows never rendered (headers showed, amounts didn't). Fixed
   2026-07-22 by flattening to a single-root nested loop. When rows/rendering go missing, check for a
   multi-root x-for template FIRST. <!-- @anchor: v1 | failure: cgs-books-alpine-xfor-tworoot-2026-07-22 | regression: php -l can't catch this — verify rendered DOM live after any report/list template change -->

4. **Every backend class/file must be explicitly `require`d — there is no autoloader.** `src/pdf.php`
   (the `Pdf` class) was referenced by the PDF export functions but `require`d nowhere, so every PDF export
   (Erfolgsrechnung / MwSt / Jahresabschluss) 500'd with `Class "Pdf" not found` from day one — only
   surfaced 2026-07-22 once there was data to export. Fixed by `require_once ../pdf.php` at the top of
   reports_controller.php. When adding a new class/helper file, wire its `require` into `api.php` or the
   consuming controller, and `php -l` proves syntax but NOT that a class is reachable — verify the route
   live.

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
- **Realisierungsdatum = `book_date_expr()` = `COALESCE(paid_date, entry_date)`** (Cash-Prinzip, round 10,
  2026-07-22). ALLE Jahres-/Perioden-Zuordnung läuft darüber, NICHT über `entry_date`: report-pl, year_totals,
  Jahresabschluss-Zahlen, Buchungsjournal, Kontoauszug, **Jahresabschluss-Sperren** und der Schreibschutz-Guard.
  Ein 2024-Rechnungsdatum mit Zahlungseingang 2025 realisiert in **2025**. Degradiert exakt auf `entry_date`
  ohne Migration 009 / ohne gesetztes `paid_date` (historische Zahlen stabil). Neues Query, das nach Jahr
  filtert/gruppiert, MUSS `book_date_expr($alias)` verwenden (`$alias=''` für UPDATE ohne Alias), sonst zählt
  es die Buchung ins falsche Jahr. <!-- @anchor: v1 | failure: cgs-books-realization-entrydate-only | regression: book_date_expr live before/after totals unchanged; E744077 moved 2024->2025 -->
- **Year close bulk-locks by date range** — jetzt `WHERE COALESCE(paid_date,entry_date) BETWEEN ...` (war
  `entry_date`). Der Guard prüft ebenfalls das Realisierungsdatum. Eine gesperrte Buchung editieren = **Jahr
  reopen → edit → close** (beide betroffenen Jahre, wenn die Buchung das Jahr wechselt).
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

## CSV import (milchbüechli migration) — built + used 2026-07-22

- Route `?r=import` ([src/controllers/import_controller.php](../../../cgs-books/src/controllers/import_controller.php)) +
  logic ([src/import.php](../../../cgs-books/src/import.php)). Multipart CSV upload → **Vorschau (dry-run,
  writes nothing) is the default**; writes only with `commit=1` and only if **zero** rows error
  (all-or-nothing). UI panel under Einstellungen.
- Migration **004** added `entries.beleg_nr`, `paid` (0=offen/ausstehend, default 1), `import_key`
  (UNIQUE — re-running the same CSV is a safe no-op), `import_src`, and Konto **6640** Reisespesen.
- **Cash-basis (Milchbüechli) is now enforced**: unpaid invoices (`paid=0`) are excluded from realized
  income in the Erfolgsrechnung, the ledger totals, and year-close, but stay visible in the ledger list;
  `report-pl` returns `outstanding_income` for the "ausstehende Einnahmen" line. Guard: `entries_paid_ready()`
  / `entries_paid_and()` in [src/accounts.php](../../../cgs-books/src/accounts.php).
- Category→Konto map + the hosttech/LightBurn/Shapr3D/Claude→6570 IT-override live in `import.php`
  (`import_category_map()` / `import_it_vendor_regex()`). iway/yallo stay on 6500 (telephony, not IT).
- **Migration DONE**: 2019–2026 imported and reconciled to the Rappen against the filed Jahresabschlüsse
  (2765 historical rows + 5 old-2025 open + 355 for 2026). Grand total 2019–2026 E 299'892.18 / A 204'713.48
  / offen 1'042.48 — matches milchbüechli exactly. Extraction method: scrape milchbüechli's Auswertungen
  (`?wpv-wpcf-datum_min=<unixts>…`) year by year in the logged-in browser → CSV; receipts are URL-addressable
  by Beleg-Nr (`/belege/YYYY/MM/…`) for a later bulk receipt import (not yet done).

## Status

LIVE with real bookkeeping data. Full milchbüechli history 2019→today imported + verified (2026-07-22).
Last commit `e07fec1` (round 6: **CGS logo** in the sidebar + top content spacing; `108539f` = dark theme,
PDF date dd/mm/yyyy, save-toast, F5-keeps-tab — all deployed + visually verified logged-in). Logo =
`public/cgs-logo.png` (copied from the cockpit's `frontend/public/cgs-logo.png`, white/transparent → shows
on the dark sidebar), added to the `sw.js` SHELL precache. **DEPLOY GOTCHA (new):** the GitHub→Plesk webhook
**silently missed** the `983302f` push (server stayed v15, `cgs-logo.png` 404'd for >90s while the commit was
confirmed on origin/main) — a **fresh push** (marker-bump commit `e07fec1`) re-triggered it and deployed both.
So a push is *usually* live in ~15s but can miss; verify the server (cache-busted fetch of `sw.js`/`version.txt`),
and if stuck, re-push a trivial commit rather than assuming it deployed. **Migrations 005–007 CONFIRMED APPLIED by René**
(306 TWINT sales tagged `twint_ecom`); **totals verified byte-identical before/after** (income 299'892.18 /
expense 204'713.48 / profit 95'178.70) — the 007 `amount_input` reconstruction changed only the hidden
Rechnungsbetrag, never `amount_total`. SW is at **v15** — needs TWO reloads / PWA reopen to pick up (new SW
serves fresh assets only on the 2nd load). STILL PENDING RENÉ: Jahresabschluss → „2019–2025 übernehmen"
(historical-years seed — not yet clicked). Open: **2026 keeps growing on milchbüechli** — re-pull on the actual cutover day
before cancelling; **cancel milchbüechli** once that's across; **receipt (Belege) bulk import** still to do
(ZIPs were generated on milchbüechli for all years). VAT stays off until registration (~Jan 2027 — configure
method + Saldosteuersatz with the Treuhänder then; the 8.1% on the seeded accounts is only a template and
does NOT touch historical rows). Treuhänder note: `AHV/IV/EO-Beiträge Inhaber (1. Säule)` was imported to
5700 as filed, but for a sole proprietor it's often a Privatentnahme — flag for review. The "cannot select
anything" Alpine `:disabled` class remains the recurring frontend gotcha.
**Round 7 (2026-07-22, commit `603d4b0`, live v17):** the **Jahresabschluss PDF was rebuilt to the
milchbüechli reference** — steuerfertige Erfolgsrechnung (Vorjahresvergleich + Aufwand nach ~8 Steuerzeilen +
Gewinn/Verlust + Unterschriftsblock) followed by the full Buchungsjournal; verified byte-identical to the
filed milchbüechli 2025 on every line (see round-7 Session Note). New editable Firma field **owner_name**
(migration **008**, seeds „René Spatz") — **STILL PENDING RENÉ: click „Kontenplan einrichten" (migrate 008)**
or type it under Einstellungen → Firma; until then the PDF just omits the owner line. **Open data question:**
booking `E744077` (CHF 128.00, 2024-12-10) makes cgs 2024 income 53'130.09 vs milchbüechli's filed 53'002.09
— his call which fiscal year it belongs to (do not silently re-date).
**Round 8 (2026-07-22, commit `107c542`, live v18):** the recurring **"2 reloads / stale UI after deploy"
gotcha is FIXED** — `sw.js` shell is now **network-first** (deploys land on the first online reload); verified
live by cache-poisoning through the SW. The migrate button label is **„Datenbank aktualisieren"** (not
„Kontenplan einrichten") once the Kontenplan exists. owner_name field confirmed rendering live; René still to
set it (type „René Spatz" + Speichern, or click „Datenbank aktualisieren" to seed via migration 008).
**Round 9 (2026-07-22, commits `5f8ba57`→`146c368`, live v20):** neues Feld **Zahlungseingang** (`paid_date`,
migration 009) beim Erfassen bezahlter Einnahmen — reine ERFASSUNG, Jahres-Realisierung folgt weiter dem
Rechnungsdatum (Umstellung auf Zahlungseingang = offener Owner-Entscheid, würde E744077 lösen). **PENDING RENÉ:
„Datenbank aktualisieren" klicken wendet 008 (owner_name) + 009 (paid_date) an** — bis dahin persistiert paid_date nicht.
**Round 10 (2026-07-22, commit `8bc2a0d`, live v21) — RESOLVED die offenen Punkte:** Realisierung folgt jetzt dem
**Zahlungseingang** (`book_date_expr`); **Migrationen 008/009/010 sind APPLIED** (von der Session ausgeführt);
**E744077 korrigiert** (jetzt 2025 → 2024 = 53'002.09 = milchbüechli, 2025 = 83'868.02 = milch +128, gewollt);
**SEPA-Zahlungsart** live (9 Zeilen getaggt); mehr Luft oben (64px); Logo→Buchungen. owner_name-Feld existiert;
008 seedet „René Spatz" — falls leer, unter Einstellungen → Firma setzen.

## Session Notes

### 2026-07-22 (round 10: Realisierung nach Zahlungseingang + SEPA + E744077-Korrektur + Layout)
- Owner-Batch, commit `8bc2a0d` (cgs-books), **deployed + live-verified (v21)**. Migrationen **008/009/010
  von mir via seiner Session angewendet** (`?r=migrate`, CSRF) — er hatte die abhängigen Features explizit
  autorisiert; idempotent/additiv/reversibel. Danach **Zahlen unverändert** (Beweis: Realisierungs-Refactor
  ist inert, solange kein paid_date gesetzt ist).
- **Realisierung nach Zahlungseingang (sein „YES"):** neuer Helfer `book_date_expr()` =
  `COALESCE(paid_date, entry_date)`, verdrahtet in report-pl, year_totals, year_statement_figures,
  year_journal_rows, report_account_data, beide year-close-Sperren + den entries-Guard. Rückwärtskompatibel
  (NULL→entry_date). Siehe SHARP EDGES.
- **E744077 korrigiert** (er: „2025-Order, empfangen 19.01.2025, bezahlt 26.01.2025"). War locked in 2024.
  Sequenz via App-Endpoints (his session): **reopen 2024 (id 6) + 2025 (id 7) → edit entry 1330
  (entry_date 2025-01-19, paid_date 2025-01-26) → close 2024 + 2025**. Ergebnis verifiziert:
  **2024 = 53'002.09 (jetzt exakt = milchbüechli!), 2025 = 83'868.02** (= milch 83'740.02 + 128, die 128
  gehört korrekt nach 2025). E744077 wieder gesperrt (in 2025). **cgs-2025 ist nun bewusst +128 vs milchbüechlis
  gefiltertem 2025 — cgs ist korrekter (die 128 waren im Altsystem falsch datiert).**
- **SEPA-Zahlungsart** (Auslandskunden, CHF-Gutschrift, KEINE Gebühr, kein EUR): `payment_method='sepa'`
  (twint_apply gebührenfrei), Dropdown-Option + violettes Badge (`.badge.sepa #a78bfa`). **Migration 010
  taggte 9 importierte SEPA-Buchungen** (nur Kennzeichnung, KEINE Betragsänderung; scoped `import_key IS NOT
  NULL`). Hinweis: es gab ~10 Zeilen mit „SEPA" im Text; die 10. hat kein import_key (manuell/recurring) →
  bewusst nicht getaggt, per Dropdown nachstellbar.
- **Layout:** `.main .app` padding-top 22→**64px** (mehr Luft oben, live = 64px bestätigt); **Logo (`​.side-brand`)
  klickbar → `go('ledger')`** (live getestet: tab reports→ledger). sw.js **v21**.
- **VERIFIED live** (claude-in-chrome): server v21; report-pl 2024/2025 vor+nach Migrate unverändert; nach
  E744077-Fix die neuen Totale; 9 SEPA-Badges gerendert; padding 64px; Logo-Klick springt auf Buchungen.
- Tools: Read/Edit/Write, Bash (`php -l` ×4, `node --check`, python tag-balance, git), claude-in-chrome
  (Migrate + E744077-Reopen/Edit/Close via authentifizierte POSTs mit CSRF, Vorher/Nachher-Verifikation,
  Screenshots). Residual: 2025 ≠ milchbüechli um +128 (gewollt/korrekt); top-spacing subjektiv (ggf. nachziehen).

### 2026-07-22 (round 9: Zahlungseingang / paid_date je Einnahme — erfassen + anzeigen)
- René: beim Erfassen einer bezahlten Einnahme fehlt das Datum des Geldeingangs (nur Rechnungsdatum
  vorhanden). Commits `5f8ba57` (Feld+Logik) → `146c368` (Layout: eigene Zeile). **Deployed + live-verified
  (v20).** Migration **009** = `entries.paid_date DATE NULL` (idempotent, `AFTER due_date`).
- **Wiring** (mirror von `due_date`): `entries_paid_date_ready()`-Sonde ([accounts.php]); `row_to_api` gibt
  `paid_date` zurück; create/update speichern es NUR bei `paid=1` (unbezahlt → NULL); `report_account_data`
  liefert es mit; migrate-Bestätigung meldet die neue Spalte. Form-Feld **nur bei `form.paid &&
  booking_type==='income'`** (eigene `.row`, gegenüber „Fällig am" bei offenen). Anzeige „ZAHLUNGSEINGANG
  <Datum>" in Buchungsliste + Kontoauszug **nur wenn gesetzt UND != Rechnungsdatum** (kein Rauschen bei
  Barzahlung am selben Tag). Degradiert sauber ohne die Spalte (kein 500).
- **SCOPE-Grenze bewusst gezogen:** dies ist REINE ERFASSUNG. Die Jahres-Realisierung (report-pl / year_totals
  / year-close-Sperren) filtert weiterhin nach `entry_date`, NICHT nach `paid_date`. Ob die Realisierung dem
  Zahlungseingang folgen soll (echtes Cash-Prinzip; würde das **E744077**-Cross-Year-Problem aus Runde 7 lösen)
  ist ein SEPARATER Owner-Entscheid — betrifft Abschluss-Sperren + verschiebt Zahlen, und historische Zeilen
  haben kein `paid_date` (Fallback `COALESCE(paid_date, entry_date)` hielte Altzahlen stabil). **Noch offen —
  René fragen, bevor die Realisierungs-Basis umgestellt wird.**
- **VERIFIED live** (claude-in-chrome, René eingeloggt): server v20, `location.reload()` (ein Reload, dank v18
  network-first) lud das v20-Dokument, Modal Typ=Einnahme + bezahlt → Feld rendert sauber in eigener Zeile.
  **GOTCHA bestätigt:** ein `navigate` auf nur eine **Hash-Änderung** (`#ledger`) lädt das Dokument NICHT neu →
  wirkt „stale"; ein echter `location.reload()`/F5 zieht frisch (v18 network-first ok). Pre-migration bleibt
  `paid_date` ungespeichert bis René **„Datenbank aktualisieren"** klickt (wendet 008 + 009 an).
- Tools: Read/Edit/Write, Bash (`php -l` ×4, `node --check`, python div-balance, git), claude-in-chrome
  (Modal öffnen, Typ setzen via form_input, Alpine-State prüfen, Screenshot). Residual: paid_date persistiert
  erst nach dem Migrate-Klick; Realisierungs-Basis-Umstellung nicht gebaut (owner-gated).

### 2026-07-22 (round 8: sw.js network-first — killed the recurring "2 reloads" cache lag)
- Commit `107c542` (cgs-books), **deployed + verified live (v18)**. Surfaced when René couldn't find the new
  owner_name field / the migrate button: his browser was serving the **old cached UI**, the classic
  cgs-books "needs 2 reloads" gotcha. Two things were going on: (a) the Kontenplan migrate button reads
  **„Datenbank aktualisieren"** once accounts exist (the „Kontenplan einrichten" label only shows on a fresh
  install — `x-show !accounts_ready`), so my earlier instruction named the wrong label; (b) stale assets.
- **Root cause of the 2-reload lag:** `sw.js` had `skipWaiting()` + `clients.claim()` already, but the shell
  fetch was **cache-first** (`return hit || net`) → a new deploy was served STALE on the first load and only
  cached for the next. **Fix:** shell (navigations + `.html`/`.js`/`.css`) → **network-first** (`net`, cache
  fallback); statics + Alpine-CDN stay cache-first; `api.php`/`?r=` stays network-only; offline falls back to
  the cached shell (incl. cached `index.html` for query-string navs). VERSION→v18. Deploy Rule 1 updated.
- **VERIFIED live by cache-poisoning** (no extra deploy needed): with the v18 SW active+controlling, put a
  `POISON_SENTINEL` Response into the `cgs-books-v18` cache for `/js/app.js` (shell) and `/manifest.webmanifest`
  (static), then fetched both through the SW → **shell ignored the poison and returned fresh network bytes**
  (26 344 B, contains `owner_name`), **static served the poison** (proves the cache-first split), and the
  network-first fetch **self-healed** the shell cache. Restored the poisoned manifest afterwards (valid JSON,
  no residue). This cache-poison-through-the-SW test is the reusable proof for SW strategy.
- **HOW to force a stale pre-v18 browser fresh** (one-time transition cost): in devtools/console
  `navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister()))` + `caches.keys().then(k=>k.forEach(caches.delete.bind(caches)))` + reload with a `?cachebust` query. Post-v18 it's automatic.
- Tools: claude-in-chrome (drove René's authenticated browser — DOM checks, SW unregister/cache purge,
  cache-busted reload, the cache-poison live test, screenshot of the now-visible owner field), Read/Edit,
  Bash (`node --check` sw.js, git). Residual: the v18 deploy itself was the last one to pay the 2-reload cost
  (old SW served its triggering load); every deploy after v18 is first-reload-fresh.

### 2026-07-22 (round 7: Jahresabschluss rebuilt to the milchbüechli reference + owner_name)
- René: „Der Jahresabschluss ist nicht ausreichend, nimm milchbueechli als Referenz, nicht raten." Commit
  `603d4b0` (cgs-books), **deployed + verified live (v17)**. The old year PDF (`pdf_year_statement`) was a
  5-line summary (Einnahmen/Ausgaben/Gewinn/MwSt/Anzahl) — **not tax-filing usable**.
- **Looked at the real reference** (claude-in-chrome, René logged in): `…/app/jahresabschluss/` →
  „Jahresabschluss herunterladen" = a **33-page** PDF. Page 1 = a proper Erfolgsrechnung nach Steuerschema
  (**Vorjahresvergleich**, income as one „Total Einnahmen" line, **Aufwand in ~8 benannten Steuerzeilen**,
  „Einkommen aus selbständiger Erwerbstätigkeit → Gewinn/**Verlust**", **Unterschriftsblock**, „generiert am
  …"). Pages 2-33 = the full **Buchungsjournal** (Datum/Einnahme/Ausgabe/Beleg-Nr/Buchungstext, „Seite N von M").
  2019 PDF confirmed the conditional rules: single column when no prior year, only non-zero groups printed,
  Gewinn↔Verlust by sign, historical address is point-in-time (2019 = Menzingen, now Rothrist — cgs stores only current).
- **Built** ([src/controllers/reports_controller.php](../../../cgs-books/src/controllers/reports_controller.php)):
  `year_expense_taxlines()` (the **inverse of `import_category_map()`** — 6500+6570 merge to „Büromaterial,
  EDV/IT…", catch-all „Alle übrigen Geschäftsaufwände" last), `year_taxline_for_number()`,
  `year_statement_figures()` (paid/net, cash-basis), `year_journal_rows()`, and a full rewrite of
  `pdf_year_statement($y)` (statement page + deterministic-pagination journal). **Always LIVE** from the
  (locked-after-close) entries — the fiscal_years snapshot has only aggregates, no breakdown. `ctrl_year_export`
  no longer passes `$t`.
- **Pdf class** ([src/pdf.php](../../../cgs-books/src/pdf.php)): added `fit()` (truncate+ellipsis) and `wrap()`
  (≤2-line word-wrap) — **mbstring-free (PCRE `/u`)**, same defensive reason as `cp1252()`; shared-hosting may
  lack mbstring and the local CLI does. <!-- @anchor: v1 | failure: none (defensive, mirrors cp1252 fallback) | regression: _cgs_pdftest.php harness -->
- **owner_name**: new editable Firma field (Einstellungen → Firma; [settings_controller.php] whitelists it,
  [index.html]/[app.js] input+sform, PDF header + „Geschäftsinhaber/in: …" + signature). **Migration 008**
  `INSERT IGNORE` seeds „René Spatz". Degrades cleanly to blank pre-migrate (PDF omits the owner lines, no 500).
- **VERIFIED — this is the strong bit.** Local: 41/41 assertions (taxline map, prior-period, fit/wrap no-overflow,
  and pagination consistency requested==/Count==endstream==footer-M across 0/1/30/200/400 rows) via a DB-free
  harness against the real Pdf class. **Live end-to-end**: fetched the *production* year-export PDF bytes via
  authenticated JS (`fetch('/api.php?r=year-export&id=…').arrayBuffer()`) and grepped the `(…)Tj` operators for
  the known milchbüechli reference numbers → **2025 statement is byte-identical to the filed milchbüechli
  Jahresabschluss on EVERY line** (income 83'740.02, expense 64'125.28, Gewinn 19'614.74, and all 8 taxlines:
  Direkter 22'443.34 / AHV 1'499.80 / Miete 5'561.00 / Büro 17'480.51 / Reise 80.00 / Werbung 799.80 / übrige
  16'260.83). Journal + „Seite N von M" present (25 pages — denser than milchbüechli's 33 because we truncate/
  wrap tighter, content-complete). **This PDF-bytes-vs-known-numbers method is the reusable live-verify for cgs
  PDFs** (no local DB needed).
- **DATA FINDING (surfaced, not a bug — flag for René/Treuhänder):** the new **prior-year column** shows cgs
  2024 income **53'130.09** vs milchbüechli's filed 2024 **53'002.09** → **exactly +128.00** (profit carries it;
  expense identical). 2025 matches to the Rappen and the grand total reconciles, so it's a pre-existing
  **cross-year attribution delta** the new column merely exposed. Pinpointed to **one booking: Beleg `E744077`,
  CHF 128.00, dated 2024-12-10** — whose Beleg-Nr sits in the **2025** invoice series (milchbüechli's E7441xx
  were Jan-2025) yet is dated Dec-2024 here. The PDF is correct (renders cgs's true 53'130.09); the question is
  which fiscal year E744077 belongs to — **owner/Treuhänder call, do not silently re-date real financial data.**
- Tools: claude-in-chrome (read the milchbüechli reference PDFs + authenticated live-verify against production),
  Read/Edit/Write, Bash (`php -l` all 4 PHP files + a local `C:\Users\rene\_cgs_pdftest.php` harness on
  `C:\Users\rene\php\php.exe`, `node --check`, git). Residual: owner_name blank until René clicks „Kontenplan
  einrichten" (migrate 008) or types+saves it; the 128.00 attribution is his to decide.

### 2026-07-22 (round 5: dark theme, PDF date format, save-toast, F5-keeps-tab; TWINT-totals proof)
- Commit `108539f`, deployed + visually verified logged-in (claude-in-chrome).
- **Dark theme** — re-skinned to the **CGS-Cockpit** palette (its tokens live at
  `…/landed-cost-cogs/cockpit/frontend/src/theme/tokens.css`, read-only ref): dark-first near-black layers
  (`--bg #0a0b0d`, `--surface #15171c`, `--sidebar-bg #101217`), gunmetal-blue accent `#4c7eff`, muted
  green/red `#34c77b`/`#e5484d`, Inter font. Removed the old `@media dark` override (dark is now base);
  sidebar/mobilebar use `--sidebar-bg` (not the old green brand); pie palette swapped to dark-friendly hues.
- **PDF dates dd/mm/yyyy** — `pdf_date()` applied to every period line + Kontoauszug row dates + footer
  (were ISO `2026-01-01` / `d.m.Y`). JSON/on-screen already used de-CH via `fmtDate`/Intl.
- **Save feedback** — René's "Speichern shows nothing": the global notice renders at the top of `.main`,
  so saving from the Firma card (scrolled to the bottom) fired it off-screen. Fixed by making the app-level
  notice a **fixed `.toast`** (bottom-centre, z-200) — visible at any scroll. All notify() feedback now floats.
- **F5 keeps the tab** — `tab` reset to `ledger` every reload. Now `go()` writes `location.hash` (`#reports`
  …) and `onAuthed` → `restoreTab()` reads it back. Ctrl-F5 stays on the current page instead of jumping to
  Buchungen. (`onAuthed` now calls `loadAccounts`+`loadRecurring`+`restoreTab`, not `loadEntries` directly.)
- **TWINT-totals proof (owner concern):** René warned the migrated BETRAG already has the fee deducted.
  Proven safe two ways — (1) grep: `amount_input` is read only by the edit form + request body, NEVER by any
  report/total/CSV; (2) live before/after: migrate ran, 306 rows → `twint_ecom`, and income/expense/profit
  came back **byte-identical** (299'892.18 / 204'713.48 / 95'178.70). The `amount_input` reconstruction
  (`amount_total/0.9865`) is self-inverse, so even editing a backfilled row re-books the exact same net.
- Tools: Read/Edit, Bash (php -l/node --check/sed/git), claude-in-chrome (theme screenshots + authenticated
  API reads for the totals proof).

### 2026-07-22 (round 3+4: left-sidebar UI redesign, cost pie, historical years, editable Firma, TWINT backfill)
- Big owner batch, commits `8b7ca50` (features) → `092a99e` (layout gap + mobile table scroll) →
  `8a21089` (pie fix). **Verified logged-in via claude-in-chrome** (René's Chrome) — every page screenshotted.
- **Left sidebar** replaces the top tab bar (`.shell`/`.sidebar`/`.main`); mobile = drawer via
  `sidebarOpen` + hamburger + backdrop. The Buchungen **filters live IN the sidebar** (owner ask) + a new
  **Offen/Bezahlt** status filter (`entries_filter` `paid_status`). The Einnahmen/Ausgaben/Gewinn totals bar
  was removed from the ledger. **GOTCHA fixed live:** `.app` has `margin:0 auto` → centered content left a
  huge gap next to the sidebar; `.main .app{margin:0;max-width:1180px}` left-aligns it.
- **Cost pie** (Berichte, „Kosten nach Konto", Aufwand by account). **LESSON:** Alpine `<template x-for>`
  inside `<svg>` generates `<path>` in the HTML namespace → **arcs never render** (only static `<circle>`/
  `<text>` do). Rebuilt as a CSS **`conic-gradient`** donut (`.pie` + `.pie-center` hole) — robust, no SVG.
  <!-- @anchor: v1 | failure: cgs-books-alpine-svg-xfor-2026-07-22 | regression: never x-for SVG children under Alpine; use conic-gradient/x-html -->
- **Historical years**: `?r=years-seed` (`ctrl_years_seed_historical`) closes+locks 2019–2025 as
  Geschäftsjahre (they were closed in milchbüechli but absent here); idempotent (skips existing), reversible
  via per-year „Öffnen". Button on the Jahresabschluss page. NOT a migration (a re-running migration would
  re-lock after a reopen). Closing write-protects those years by date-range (`year_guard_writable`).
- **Editable Firma**: `legal_name`/`business_name`/`address` moved from the untouchable server `config.php`
  into the `settings` table (`firma()` helper = setting → cfg fallback), editable in Einstellungen, used in
  app + PDF (`pdf_header`). Seeded „Spatz Custom Gear Solutions / Oberwilerweg 32 / 4852 Rothrist" via 007
  `INSERT IGNORE` (later edits survive). His own business address in git is acceptable (own company, needed on PDFs).
- **Old TWINT backfill** (migration 007): imported income with "TWINT" in the description → `twint_ecom`;
  `amount_input` reconstructed to the invoice total (`amount_total/0.9865`) so edits don't double-apply the fee.
  Idempotent via `payment_method IS NULL`. Overview badge is income-only BANKÜBERWEISUNG/TWINT (no ×-detail).
- **PDF number format** (`chf_num` = `1'000.00`, Swiss apostrophe) — applied ONLY to PDF render lines
  (`$p->`/`$line(`/`$amtStr`) via a scoped awk pass; JSON/CSV keep `money_str` ("1000.00") or parsing breaks.
- **RESIDUAL RISK:** migrations 005–007 + years-seed NOT yet run by René (need his authenticated clicks) →
  not verified end-to-end: the TWINT backfill row count, `due_date` round-trip, the 3000→NETTO relabel, the
  year-seed profit snapshots, and PDF apostrophes (unrendered). Firma save round-trip not clicked. Multi-
  statement `db()->exec()` for 006/007 relies on the mysqlnd behavior 004 proved.
- Tools: Read/Edit/Write, Bash (`php -l`, `node --check`, awk scoped replace, git, python tag-balance),
  claude-in-chrome (logged-in visual verification — screenshots of every page).

### 2026-07-22 (Buchungen UX batch — round 2: due date, Zahlungsart badge, Alle Konten, migrate confirm, 3000=net)
- Owner-feedback follow-up to the batch below, commit `43c7d8e` (deployed + live health/asset-probed:
  `me`=ok, sw=v11, all markers present). Migration **006** (`due_date` + relabel).
- **Due date** (`due_date`, migration 006): form field appears when a booking is marked offen; overview +
  Kontoauszug show `· FÄLLIG dd/mm/yyyy` next to AUSSTEHEND SEIT. Guarded by `entries_due_ready()`.
- **Zahlungsart in overview**: per-income badge **BANKÜBERWEISUNG / TWINT** (no ×-detail — details stay in
  the form only, owner's call). Form option labels renamed to `BANKÜBERWEISUNG` · `TWINT ECOM (−1.35%)` ·
  `TWINT DIREKT (−0.30 + 1.35%)`. Caveat logged: imported income has no stored method → all show
  BANKÜBERWEISUNG (the import never captured TWINT-vs-bank); only going-forward bookings are accurate.
- **Kontoauszug „Alle Konten"**: `report_account_data(?int)` — null = journal of ALL accounts with a Konto
  column, signed Betrag (Ertrag +, Aufwand −) and a running **net cashflow** Saldo; single-account stays
  positive cumulative (milchbüechli-style). `report-account`/`account-pdf` accept `account_id=all`; CSV
  (`export-csv`, non-digit id ignored → all) and Belege-ZIP (`receipt-zip`, empty account → all) already
  covered it. Table all-mode display keyed off `statement.all` (data), not the dropdown, to avoid a switch race.
- **Migrate confirmation** (his „I see no confirmation"): `ctrl_migrate` now returns `{migrated:[files],
  columns:{col:bool}}`; `runMigration()` shows a persistent notice in the Kontenplan card + a detailed toast.
- **3000 sales = NETTO**: import mislabeled Konto 3000 (Warenertrag) as BRUTTO; migration 006 flips
  **imported** 3000 income rows gross→net (`import_key IS NOT NULL`, never future manual). Zero € impact at
  0 % VAT (net=total=input) — pure label correctness for 2027. New income bookings now default to NETTO via
  the form's type-change handler. His invoices are net until MwSt registration (~Jan 2027).
- **RESIDUAL RISK:** same as round 1 — `php -l`/`node --check`/anonymous live probe only; NOT authenticated-
  tested. Specifically unverified live: the migrate confirmation actually rendering, the „Alle Konten" journal
  + its PDF (6-col layout, hand-laid), the due-date round-trip, and that 006's 3000-relabel matched rows (needs
  René to click migrate + eyeball 3000). Multi-statement `db()->exec()` for 006 (ALTER+UPDATE) relies on the
  same mysqlnd behavior 004 proved.

### 2026-07-22 (Buchungen UX batch: Beleg-Nr, AUSSTEHEND, TWINT, uniform names, Kontoauszug)
- Five owner-requested features shipped in commit `c761911` (cgs-books repo, deployed via webhook,
  live health-probed anonymously — `api.php?r=me` = `{ok:true}`, sw.js=v10, assets carry the new code).
  No new migration-click needed for 4 of 5 (beleg_nr/paid already in 004); only **migration 005
  (`payment_method`) awaits René's „Datenbank aktualisieren" click** — guarded by `entries_payment_ready()`
  so the pre-click app degrades (correct net still booked, just no TWINT badge / no lossless edit) with NO 500.
- **Beleg-Nr visible** per booking (`beleg_nr` was returned but never rendered). New manual bookings
  auto-generate `E-<year>-NNN` / `A-<year>-NNN` (`beleg_nr_generate()` — LIKE-scan max+1, deliberately
  dashed so it never collides with the old pure-numeric E669054 imports), editable field in the form.
- **AUSSTEHEND SEIT dd/mm/yyyy** red line + red amount for `paid=0`; added a Bezahlt/Offen checkbox to the
  booking form (paid was previously only settable via import). Owner-chosen (AskUserQuestion) over blank/manual.
- **TWINT fees** in +Buchung: Zahlungsart selector (income only) bank / twint_ecom (×0.9865) /
  twint_direkt ((−0.30)×0.9865); server `twint_apply()` books the net, live preview mirrors it. Design call:
  amount_input holds the **invoice total** (round-trips edit) ONLY when 005 is applied; else stores the net
  (no reversal footgun). TWINT recorded as a stored method + ledger badge, NOT by mutating the description.
- **Uniform display** `displayName()` — pure ANZEIGE transform (data untouched): fixed tokens stay ALLCAPS
  (SEPA/TWINT/FAPA/ALIBABA/ALIEXPRESS/DHL/UPS/FEDEX/CKK/PRIMEO/SVA/CULTS/OBI), digit-tokens verbatim, rest
  Title-Case. Applied in ledger + statement lists; the edit textarea still shows raw stored text.
- **Kontoauszug tab** (Auszug einzelne Konten) over the imported data — NOT a milchbüechli pull (WAF blocks
  the server). New `report-account` (JSON, running balance) + `account-pdf` (`pdf_account_statement`); CSV via
  existing `export-csv` (already account+period filtered), Belege via existing `receipt-zip`. Owner picked the
  full statement-view-with-running-balance option.
- **RESIDUAL RISK (stated, not hidden):** no local runtime (no DB) → verified by `php -l` (all files) +
  `node --check` + live anonymous health/asset probe only. NOT yet exercised authenticated: the rendered
  badge/red/statement, `report-account`/`account-pdf` output, the Kontoauszug **PDF column spacing**
  (hand-laid, unrendered), and that migration 005 applies cleanly. Next session or René: log in, click migrate,
  smoke-test the +Buchung TWINT calc + a Kontoauszug PDF. TWINT×VAT interaction is a 2027 Treuhänder question
  (VAT still off). Recurring-posted bookings still get no auto Beleg-Nr (out of scope, create-path only).
- Tools: Read/Edit/Write, Bash (`php -l`, `node --check`, git), Claude_Browser (anonymous live health+asset probe).

### 2026-07-22 (Belege migration + reports/PDF fixes — continuation)
- **Belege (receipts) migration built.** milchbüechli's `/belege/...` are PUBLIC (200 even without a
  cookie) BUT its WordPress WAF **403s the hosttech server IP** regardless of User-Agent/headers — so a
  server-side pull is impossible. Pivot: upload milchbüechli's Beleg-ZIP → route `receipt-zip-import`
  ([src/receipts_import.php](../../../cgs-books/src/receipts_import.php)) unzips + matches each file to a
  booking by the **Beleg-Nr that leads the filename** (`E669054-…pdf` → `entries.beleg_nr`). Idempotent
  (bookings with a receipt are skipped). Once attached, `ctrl_entry_get` returns them → clickable in the
  Buchung modal (no extra UI needed). Also `receipt-zip` (GET) builds a Kontoauszug-style Beleg-ZIP for a
  period/account — backend done, **not yet wired to a UI page** (the "auszug-einzelne-konten"-style
  download page René asked for is still a TODO).
- Collision rule: a Beleg-Nr shared across years (a naming reuse) routes to the **newest** booking
  (`ORDER BY entry_date DESC`) — fixed after one 2026 beleg landed on its 2025 twin.
- **STATE: 2026 belege DONE** — 354 fetched, 353/355 bookings clickable; one booking (PRIMEO, 30.04.2026,
  CHF 155) genuinely has no milchbüechli beleg; the one collision (POST, 04.03.2026) René corrected
  himself. Getting the 2026 ZIP: server can't fetch, and the shared browser (claude-in-chrome = René's
  Chrome) gets navigated by René mid-run — so the fetch was built **client-side with IndexedDB caching**
  (resumes across reloads), concurrency-2/3 + ~120ms throttle to dodge the WAF rate-limit, then a
  hand-rolled STORE-ZIP (CRC32) downloaded + uploaded. Verified valid via `unzip -t`.
- **OPEN for next session:** (1) **2019–2025 retention** — download milchbüechli's per-year Beleg-ZIPs
  (Jahresabschluss → „Belege ZIP herunterladen", ~146 MB each) to disk + off-site backup, THEN cancel
  milchbüechli (they die on cancel). These stay archive-only (not per-booking clickable) by René's choice.
  (2) Optional: wire a Beleg-download page onto `receipt-zip`. (3) Optional: add a Beleg-Nr edit field to
  the booking form (currently only import/display, not editable in UI).
- Reports/PDF fixes shipped + verified this day: cash-basis (unpaid excluded from realized income), import
  banner colour, **PDF export 500 (pdf.php never required → `Class "Pdf" not found`)**, Erfolgsrechnung HTML
  expense rows (Alpine single-root x-for) + Kontenklassen sub-headers via a flat `plRows()` helper.
- **René comms preference (honor it):** the Buchungen overview shows **NO booking numbers** — never
  reference a booking by internal DB id. Identify bookings by **date + amount + Beleg-Nr + description**.

### 2026-07-22 (milchbüechli migration + PHP-lint gate)
- Built the CSV importer and migrated all of 2019→2026 off milchbüechli.ch into cgs-books, reconciled to
  the Rappen against the filed Jahresabschlüsse. Extraction via logged-in-browser scrape of the Auswertungen
  view; import via a new dry-run-first `?r=import` route + migration 004 (paid/beleg_nr/import_key + Konto
  6640); cash-basis paid-flag correctness across report-pl / ledger totals / year-close.
- **OUTAGE + lesson (the reason the php -l rule above exists):** commit `814adaa` shipped a PHP parse error
  (a docblock left outside `/* */` in `import.php:162`, introduced by a later Edit). No PHP on the box meant
  `node --check` never saw it; it deployed and returned a caught `ParseError` as a clean JSON 500 on EVERY
  route → whole app down ~50 min. First diagnosis ("probably not my code", from a load-order argument) was
  confidently WRONG — the Plesk Apache-Fehler log named the exact file:line in one glance. Installed
  `C:\php\php.exe` (8.3.32) to lint; fix `2cf66f4` restored it. Never deploy PHP here again without `php -l`.
- Also fixed live: unpaid invoices inflating the Erfolgsrechnung (cash-basis paid filter, commit `b9bd3e4`)
  and the import banner showing red after a successful import (`3f0e2b6`). Both `php -l`'d before push.
- Tools: Agent (Explore/general-purpose sonnet ×4 — backend/frontend recon, adversarial PHP review, Node
  simulation of the importer against the real 2765-row CSV), claude-in-chrome (scrape milchbüechli, drive
  the import UI, read Plesk logs), Bash (`php -l`, git), Read/Edit/Write.

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
