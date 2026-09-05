---
name: cgs-cockpit
description: René's local WooCommerce margin/sales/purchasing dashboard for the CGS holster business (custom-gear.ch) — a FastAPI+React app outside the yuri-os repo. Use when René says "cgs cockpit", "cgs-cockpit", "/cgs-cockpit", "the cockpit", "margin dashboard", "sales dashboard", "purchasing page", "molds to prepare", "woo sync", "WooCommerce sync", "the CGS app", "landed-cost-cogs", or references any path under `landed-cost-cogs/cockpit`. Gives WHERE (paths), RUN (launch scripts), the RESTART GOTCHA (stale uvicorn serving stale dist), ENV QUIRKS (pip/curl/no-PIL), NEVER-TOUCH secrets, REMOTE ACCESS (Tailscale, never funnel), and the hosttech-cannot-host-Python infra fact — so a fresh session is immediately productive without re-discovering any of it.
triggers: ["cgs-cockpit", "/cgs-cockpit", "cgs cockpit", "the cockpit", "margin dashboard", "sales dashboard", "purchasing page", "molds to prepare", "woo sync", "woocommerce sync", "landed-cost-cogs"]
---

# cgs-cockpit — René's local WooCommerce margin/sales/purchasing dashboard

Context-loader skill (no processing pipeline of its own). READ-ONLY orientation for any session working
on the CGS Cockpit. **Full history, calibration detail, and the long tail live in the memory file** —
this SKILL.md is the compressed operator manual, not a replacement for it:

`C:\Users\rene\.claude\projects\C--Users-rene-yuri-os\memory\cgs-cockpit.md`

Related memories: `rene-cgs-jeffrey-operating-profile.md` (business + confirm-gate context),
`cgs-mold-sweep-method.md`, `cgs-cam-naming-norm.md`, `cgs-freecad-cam-pipeline.md`.

## SCOPE — this skill informs, it does not build

This is a knowledge/orientation skill, not a build pipeline sibling of cgs-align/cgs-decimate/cgs-mold.
It exists so a fresh session immediately knows where the cockpit lives, how to run it, and its sharpest
gotchas — before touching any file. **The cockpit repo is a SEPARATE git repo from yuri-os** with its
own remote (see WHERE); never mix a cockpit-tree change into a yuri-os commit, and this skill never
edits cockpit files itself.

## WHERE (absolute paths)

- **Cockpit root**: `C:\Users\rene\Claude\Projects\STOCK\PROCUREMENT - STEFAN\landed-cost-cogs\cockpit\`
  — self-contained, its own git repo, NOT inside yuri-os. Remote (added 2026-07-28):
  `github.com/CGSSCHWEIZ/landed-cost-cogs`, **private**, branch `master`. The repo root also
  carries its own `CLAUDE.md` + `docs/cockpit-memory.md`, so a clone on any machine is workable
  without yuri-os or this skill — keep those two in sync when cockpit facts change.
- **Backend** (`backend/`): `app.py` (FastAPI app + route wiring), `db.py` (SQLite access), `woo.py`
  (WooCommerce REST sync), `engine_bridge.py` (reads the cgs-cogs engine), `auth.py` (password gate),
  `backup.py` (off-site SSH backup), `git_backup.py`, `cam_index.py` (CNC drive scanner for "ready to
  build"), `cam_registry.py` + `cam_vocab_sync.py` (re-mirror the dropdown vocabulary off a WCPA
  export — see CAM REGISTER VOCABULARY below), `export_molds.py` (Excel export),
  `inventory.py` (stock + BUILD),
  `build_cogs.py` (a build re-costs its sale — see below), `quotes_store.py`, `pl.py` (Erfolgsrechnung),
  `reconcile.py` + `books_client.py` (cgs-books), `twint_report.py`, `post_*.py` (Swiss Post labels),
  `geo_lookup.py`, plus the three cgs-cogs write stores.
- **Frontend** (`frontend/src/pages/`): `Overview.tsx`, `Sales.tsx`, `ProfitLoss.tsx`, `Quotes.tsx`,
  `Molds.tsx`, `CamRegister.tsx`, `Inventory.tsx`, `Demand.tsx`, `PartsCounter.tsx`, `Products.tsx`,
  `Bom.tsx`, `Accessories.tsx`, `Purchasing.tsx`, `Versand.tsx`, `Reconcile.tsx`, `EtsyPayouts.tsx`,
  `Settings.tsx`. `nav.tsx` is the single source of truth for sections + routing — `PAGES` and
  `PageId` must stay in step with `App.tsx`.
- **Costing engine** (co-located sibling, NOT inside `cockpit/`): `..\cgs-cogs\` — `scripts/engine.py`
  (stdlib) + `data/*.csv|json`. The cockpit reads this READ-ONLY **except through exactly THREE
  doors** — each the sole writer of its file, validating whole-and-rejecting-whole, atomic
  temp+replace, one `.bak`:
  | Store | Owns | Surface |
  |---|---|---|
  | `orders_store.py` | `orders_*.csv` supplier ledgers | Purchasing |
  | `parts_store.py` | `parts.csv` part catalogue | Purchasing → add from invoice |
  | `boms_store.py` | `boms.json` **master BOM** | Costing → BOM (2026-08-12) |
  `build_config.json` has **no** writer and is edited by hand — deliberate. `boms.json` decides what a
  model COSTS; `build_config.json` decides which parts come OFF THE SHELF on a BUILD. Swap a component
  in the BOM editor and the margin moves at once while the deduction keeps taking the old part until
  that file gets the same swap. Do not add a fourth door without asking René.
- **Purchasing write path** (built 2026-07-21): `orders_store.py` (ledger writes) ·
  `invoice_parse.py` (+`.test.py`, stdlib PDF/XLSX field extraction — a PROPOSAL that prefills a
  review dialog, never a write) · `documents.py` (invoice attachments under `cockpit/data/invoices/`,
  filename is the whole attack surface — basename-only + charset whitelist + `relative_to` check;
  no html/svg/js; only pdf/images served inline). Duty columns are `duty_chf`/`duty_covers` +
  `carrier` — **NOT** `ups_chf`/`ups_covers` (the import bill is not always UPS); the engine still
  reads the legacy headers.
- Verified on disk 2026-07-21: all paths above exist as listed.

## RUN

- **`start-hidden.vbs`** — the current default launcher (2026-08-04). Runs the cockpit with **no console
  window and no taskbar entry** — a `.bat` always gets a console, and `WindowStyle=minimized` still
  occupies the taskbar; only a wscript-hosted VBS is truly invisible. It delegates the server to
  `start-service.bat` with window style 0 (whole process tree hidden), then opens Chrome.
  - `start-hidden.vbs /nobrowser` — start only. This is what `Startup\CGS Cockpit.lnk` runs at logon.
  - Guards against a double start: probes `http://127.0.0.1:8000/api/health` first and skips launching
    if the cockpit already answers, so the Startup copy and a manual click cannot fight over port 8000
    (the loser would spin `start-service.bat`'s restart loop forever). **Any** HTTP status counts as up —
    the endpoint answers **401** to an unauthenticated caller (auth.py gate), so a `== 200` probe never
    succeeds.
  - Shortcuts (all `wscript.exe` + the vbs path): `Desktop\CGS Cockpit.lnk` (with browser),
    `Startup\CGS Cockpit.lnk` (`/nobrowser`), `Desktop\Stop CGS Cockpit.lnk` → `stop-cockpit.bat`.
- **`stop-cockpit.bat`** → `stop-cockpit.ps1` — the way to stop a hidden cockpit (there is no window to
  close). Kills the launcher `cmd.exe` FIRST (it is a restart loop — killing python first just respawns
  it 10s later), then the uvicorn pythons, then verifies port 8000 is actually free. The kill logic lives
  in the `.ps1` on purpose: cmd's `for /f` + backtick escaping silently mangles the WMI query.
- `start-lan.bat` — the old visible-console launcher. Binds `0.0.0.0:8000`, prints the LAN URLs, opens
  Chrome, keeps access logs on screen. Still the right one when you **want** to watch the log live.
- `start.bat` — localhost-only (127.0.0.1:8000). Only relevant if Tailscale Serve is ever wired up
  (currently deferred — plain HTTP over the tailnet is live instead, see REMOTE ACCESS).
- `start-service.bat` — the unattended engine (no pip, no browser, restart loop, 0.0.0.0, log to
  `logs\cockpit.log`). Since 2026-07-29 it runs **as `rene` at logon**, not as a task; since 2026-08-04
  it is invoked through `start-hidden.vbs` rather than directly.
- **The 0.0.0.0 bind is load-bearing**: LAN and Tailscale peer access both depend on it. A
  localhost-only relaunch silently cuts off remote access.
- `install-autostart.bat` — **DO NOT RUN AS-IS.** It registers the "CGS Cockpit" task with `/ru SYSTEM`,
  which is exactly what breaks the CAM scan (see THE SYSTEM/SMB FOOTGUN below). The SYSTEM task was
  deleted 2026-07-29.
- **Frontend build**: `cd frontend && npm run build` → outputs `dist/`, which the FastAPI backend
  serves directly (no separate frontend server in normal operation).

## BACKUPS — two systems, neither replaces the other (2026-07-28)

- **Code + costing ledgers → GitHub.** `auto-push.bat`, Scheduled Task **"CGS Cockpit Git Push"**,
  every 6 h, runs as user `rene` (Git Credential Manager stores the token per-user, so a SYSTEM-run
  task fails every push). Auto-commits ONLY `cgs-cogs/data/`, then pushes; source files are never
  swept, so in-flight edits are safe — and NOT backed up until committed. Log:
  `cockpit/logs/auto-push.log`.
- **The database → hosttech, over SSH.** `backend/backup.py`, Scheduled Task **"CGS Cockpit Backup"**,
  daily 09:00, keeps 14. **Git does NOT cover `cockpit.db`** (gitignored) — this is the only backup
  of the actual sales history. Health: `.backup_status.json` → `last_ok`/`last_run`/`last_size`.
- `docs/cockpit-memory.md` in the cockpit repo is a **hand-refreshed** snapshot of this skill's Track-B
  memory file (owner decision 2026-07-28: deliberately not automated). Refresh it after meaningful
  work here, or a remote session reads stale context.

## THE RESTART GOTCHA (high-value — this bites every session that touches the backend)

Backend route/logic changes require the **uvicorn process to be restarted**. `dist/` is shared on disk,
so a stale running process serves the **new** frontend page against its **old** routes — symptom: the
browser throws `Unexpected token '<'` (the SPA catch-all is returning `index.html` where JSON was
expected). The process may be **detached with a hidden console** (`MainWindowHandle = 0`) inside the
elevated scheduled-task context, so a normal `Stop-Process` returns **"Access is denied"** and there is
no window to close manually.

Normally **`restart-cockpit.bat`** handles it (verified on disk 2026-08-19): it kills the listener and
`start-service.bat`'s restart loop brings uvicorn back hidden within ~10 s. Doing it by hand is the
same shape — kill the uvicorn `python.exe` on port 8000 and let the loop respawn; **never kill the
loop's parent `cmd.exe` first if you want it back automatically.** Confirm the session is `rene`
(`Get-Process -Id <pid> | Select SessionId` → si=1) before blaming the network for anything.

Only if the process is ELEVATED (the old SYSTEM task) does the kill return "Access is denied" and
there is no window to close: Task Manager **as admin** → Details → the `python.exe` PID on port 8000
(`netstat -ano | grep :8000`) → End Task → relaunch via `start-hidden.vbs` (or `start-lan.bat` when
you want the log on screen — **never** `start.bat`, binding matters).

## THE SYSTEM/SMB FOOTGUN — "CAM drive not reachable" while Explorer works

Recurring false alarm on the Molds page. **Never a network fault.** When the backend runs as SYSTEM (the
old `/ru SYSTEM` scheduled task), it hits SMB as the **machine account** `HOST$`, which the CNC PC grants
nothing → `os.path.isdir()` in `cam_index.scan()` is False forever, no matter how healthy the network is.
Explorer works because Explorer is `rene`. Same class as the auto-push task needing `rene` for its
per-user git credentials.

- **Diagnose without admin**: `netstat -ano | grep :8000` → `Get-Process -Id <pid> | Select SessionId`.
  **si=0 = SYSTEM = broken. si=1 = rene = correct.**
- **Cross-check the path** from the app's own venv as rene — but build the UNC with `chr(92)`, because
  bash mangles backslashes and hands you a false negative that looks like a genuine failure.
- **Killing it takes two steps**: `start-service.bat` is a restart loop, so deleting the task and killing
  the python just respawns it with a new PID every 10 s. Kill the parent `cmd.exe` running
  `start-service.bat` FIRST, then the python — both need an elevated shell.
- **Accepted trade-off of the logon-Startup model**: after an unattended reboot with nobody logged in,
  the cockpit (and Tailscale remote access to it) stays down until René logs in.

## ENV QUIRKS (this Windows box specifically)

- `pip` needs `--trusted-host pypi.org files.pythonhosted.org` (cert-store TLS quirk).
- `curl` needs `--ssl-no-revoke` for the same underlying reason.
- **No PIL / numpy / ImageMagick** on this box. `convert.exe` in `System32` is the Windows filesystem
  tool, NOT ImageMagick — do not shell out to it expecting image conversion. PNG decode/composite/
  downscale has been done in pure stdlib (`zlib` + `struct`, including manual scanline un-filtering) —
  reusable if another image task comes up here.
- Dependencies are **fastapi + uvicorn ONLY** — everything else is stdlib by design (including the SSH
  backup, which shells to Windows' native `ssh.exe`/`scp.exe` rather than using paramiko). **Adding any
  new dependency is owner-gated** — don't `pip install` something new without asking René first.

## NEVER TOUCH — secrets (gitignored, do not read or commit)

- `.auth_config.json` — PBKDF2-SHA256 password hash + HMAC session secret.
- `.woo_config.json` — WooCommerce REST API credentials.
- `.backup_ssh_key` / `.backup_ssh_key.pub` — dedicated ed25519 key for the off-site backup push.
- `data/cockpit.db` — the live SQLite database (real sales/order data).

## REMOTE ACCESS — Tailscale (settled 2026-07-19, do not re-litigate)

- Tailnet `custom-gear.ch`, node `cgs` (`cgs.taila297f6.ts.net` / `100.67.34.51`). **Personal plan,
  FREE** (1 user, unlimited devices, no restriction on commercial use — only paid tiers add fleet
  management, which is irrelevant here). Node key expiry is **disabled** (verified via
  `tailscale status --json` → `KeyExpiry: none`).
- **Live and reboot-verified**: René's phone reaches `http://100.67.34.51:8000` over mobile data.
  Plain HTTP over the WireGuard-encrypted tailnet — **not** Tailscale Serve/HTTPS (deferred as
  cosmetic; WireGuard already encrypts end-to-end).
- If Serve is ever wired up: `tailscale serve --bg 8000`. **Use `serve`, NEVER `funnel`** — same
  command shape, one word difference, `funnel` publishes to the entire public internet.
- **Cloudflare Tunnel was evaluated and explicitly abandoned — do not re-propose it.** Reason: a
  partial/CNAME DNS setup (keeping authoritative DNS at hosttech) is **Business-plan-only** on
  Cloudflare; the free/Pro tiers require moving the **whole `custom-gear.ch` DNS zone** to Cloudflare,
  which would also move the live shop, `books.custom-gear.ch`, and **email MX** — too much blast radius
  for this problem. Verified against Cloudflare's own docs 2026-07-19.

## INFRA FACT — do not re-litigate

`custom-gear.ch` is hosted on **hosttech Hosting XL**: shared Plesk hosting, **PHP-only, zero Python
support anywhere** (confirmed by site-wide search). The FastAPI cockpit **categorically cannot be
hosted there** as a live app. SSH access exists (chrooted bash) but is used only for the off-site
backup file push, not for running the app. A live-hosted option would require a real VPS, a PHP
rewrite, or accepting the current local-box + Tailscale + backup model.

## COST FOLLOWS THE BUILD (2026-08-12)

`sales.unit_cogs` is a BOM snapshot taken at sync. A build that deviated used to leave it stale —
right stock, optimistic margin. `backend/build_cogs.py` now rewrites it from the material that
actually left the shelf (labour + tooling stay from the BOM; a build measures neither). It runs after
the stock write, is never fatal, and **DECLINES rather than guesses** — an unpriced part or a missing
BOM row leaves the COGS alone and says why, because a silent 0 would understate. `cogs_bom` /
`cogs_bom_source` hold the pre-build figure (written once); the Sales line carries an amber `*`;
clicking it reverts. Two things that look optional and are not: `ShellUse.sheet_offset` (a shell build
drops the sheet line, so without this the biggest line silently vanishes from the cost) and
`built_qty` (a build total ÷ units = per-unit `unit_cogs`).

## COMPANION SHELLS FOLLOW THE COLOUR (2026-09-05)

A SIDECAR books **1.5** sheets: its own body plus the amortised half of a MAGAZINHALTER molded
two-up. The colour swap moves exactly ONE whole sheet, so the carrier's 0.5 is left on the base —
and `companion_shells.sheet_part` is configured as `KYDEX_Black_8x8`.

- **A mag carrier is never light-bearing → it takes the colour's `no_light` sheet.** 8x8 for BLACK
  and STORM GREY, that colour's 8x12 for everything else (owner ruling 2026-08-04).
- `resolve_components` returns **`companion_sheets`** — the single place that decides. `build_preview`
  uses it for the shell offer AND for the `companions` notice; the notice filters on `sheet_part`, so
  a stale value prints "cut a fresh <black sheet>" next to an offer naming the olive one.
- A colour cut at a custom fraction (CARBON PURPLE, 12x24) converts **with a warning** — a carrier's
  share of it is not the 8x8's 0.5.
- **`own` vs companion in the deduction table**: an OWN shell replaces the whole sheet line; a
  COMPANION only offsets its share. The row must show `−<offset> from shell` and a reduced balance,
  never a free line.
- **⚠ `for/else` TRAP**: anything added near the `if slots: … else: …` chain in `resolve_components`
  must sit AFTER both branches. Dropped between them, Python binds it as a `for/else`, the
  single-sheet branch runs on every build, and every holster books one sheet too many — valid syntax,
  wrong totals. `companion_sheet.test.py`'s unchanged-models asserts are the net.
- Editing a BOM from a script: `boms_store.save(model, payload, rename_from=model)`. A plain `save`
  over an existing key is REFUSED on purpose (it would wipe it).

## UNDOING A BUILD — a build is an EVENT, not a row (2026-09-05)

A build writes one `stock_moves` consume row **per part**, plus a `shell_moves` `use` row when the
body came off the bench, plus a COGS re-cost and `build_status='built'` on the sale. The ledger has
**no batch id**, so a build is identified by `(ref, note, timestamp cluster)`.

- `consume()` stamps every line of one build with **one** `_now()`. It used to read the clock per
  part, so a write across a second boundary split the batch into two half-undos. `BUILD_WINDOW_S = 60`
  still re-joins rows written before that fix.
- **Both guards are load-bearing**: the *note* separates two models built in the same second; the
  *window* separates the same model built twice (a rebuild after an undo). Neither covers the other.
- `GET /api/inventory/builds?ref=&model=` lists batches · `POST /api/inventory/build/undo
  {ref,ts,note,sale_id}` reverses one. The batch is **re-derived server-side** — never trust a client
  row-id list. Repeat undo → 400, never a silent double-restore.
- UI: **Sales → expand the order → "Undo a build…"**. `build_status` has no other UI anywhere; before
  this it could only be cleared by a raw `PATCH /api/sales/{id} {"build_status":""}`.
- Nothing says which SALE LINE a batch belongs to (one ref covers every line of an order), so on a
  multi-built order the line to un-flag is an explicit pick. `matches_model` sorts, never decides.
- Regression net: `backend/build_undo.test.py`, four mutation guards.

## A SHELL'S IDENTITY INCLUDES ITS GUN (2026-09-05)

A WIP shell is keyed `(model, variant, guns, sheet_part)`. `guns` is the FITMENT — which gun
(holster) or which magazine (mag carrier) the cavity was pressed for, stored as
`"<MAKE>: <label> | <label>"` with the labels **sorted**, so the same ticks in any order compose
the same stock line. Empty = never recorded (every shell molded before 2026-09-05; they were all
PIEXON Guardian Angels, which have no gun — which is exactly why the hole survived so long).

- **The make is identity, not decoration**: `45` alone is a GLOCK 45 or an H&K 45.
- **One mag mold covers a FAMILY** (owner ruling 2026-08-21) so a mag carrier may tick several shop
  options; a holster cavity is one gun and `mold_shells` refuses more (`is_mag_carrier()`).
- The picker reads `cam_vocab.json` through `/api/cam/vocab` — **local, not the CNC drive**, so a
  molding run stays recordable when the network is down.
- **Build-time fit** comes from `cam_index.gun_tokens` (the ONE place gun identity is decided —
  never rebuild it) against the sale's `gun_make`/`gun_model`. **SUBSET, not intersection**: a
  carrier sold as `43x / 48 / 48 MOS` must fit all three, so a 48-only mold is the wrong body.
  Unknown on either side stays SILENT; a real mismatch blocks Confirm until acknowledged.
- The shell picker keys on `ShellOption.key`, never on `variant` — two fitments share a geometry.
- Regression net: `backend/shell_fitment.test.py`. Its three mutation guards (subset→intersection,
  dropped sort, identity ignoring `guns`) are the point; re-run them if you touch this.

## CAM REGISTER VOCABULARY — "I cannot edit the MODEL" (2026-08-19)

The HERSTELLER / MODEL / LAMPENMODUL fields on CAM REGISTER are `<select>`s fed by
`backend/cam_vocab.json`, a **mirror of the shop's WCPA option lists**. A gun René adds in
WooCommerce (Product Addons → form 812270) does not exist in the form until that mirror is patched.
That is what "I cannot edit the MODEL" always means — the field is not meant to be typed in.

Two surfaces, ONE code path (`review()` / `apply_export()` — the button cannot drift from the command):

- **CAM REGISTER page → "Vocabulary — sync from the shop"** (bottom of the page, route `/cam`).
  Choose the WCPA export → read the diff → Add. **No restart**: apply drops `cam_registry._LABELS`
  in place and `vocab()` re-reads the file per call.
- CLI — same output, but this one **does** need a restart (separate process):

```bash
python backend/cam_vocab_sync.py            # newest wcpa-*.json in ~/Downloads, report only
python backend/cam_vocab_sync.py --apply    # write the additions, then restart
```

A **single-form export covers only its own form** — "nothing new" from the holster form says nothing
about the magazine lists, which is why the report prints which lists the file carried. (The known
`PDP COMPACT - 5 ZOLL` / `'19'` store bug lives in the MAGAZINHALTER form, not the holster form.)

**The second half is the dangerous one.** `gun_tokens()` in `cam_index.py` decides which physical
cavity a name means and it matches by **substring**, so a new model whose name CONTAINS an older one
inherits the older one's key and gets handed a shell that does not fit — with no mismatch shown
anywhere. "SHADOW 2 COMPACT" ⊃ "SHADOW 2" (fixed 2026-08-19); "X-COMPACT" ⊃ "COMPACT" (P320, fixed
earlier). The sync tool reports every addition as `OWN KEY` / `COLLISION` / `GENERIC` / `UNREADABLE`;
a COLLISION is correct **only** if the two genuinely share one mold — an owner ruling, never the
tool's and never a session's guess. When a branch is needed: test the **longer** name **first**, and
match it **adjacently**, never as a loose substring (the legacy path parser feeds `gun_tokens()`
whole folder segments where COMPACT is a shell/reference word — `CZ_SHADOW-2_PANCAKE_RH_COMPACT_MOLD.nc`
is a FULL-SIZE mold). The tool never removes retired options and never edits `cam_index.py`.

## WORKFLOW discipline

- **Verify against the running app, not assumptions.** Hit the real HTTP endpoints / load the real page
  before claiming a fix works — this app has a documented history of confidently-wrong claims later
  found false under direct testing (see the memory file's 2026-07-19 adversarial-review entry).
- **To exercise a WRITE path against real data without touching it, run a second instance on copies.**
  Both data locations are env-overridable and the auth cookie is host-scoped, so the existing browser
  session works across ports and you get the real UI on real-shaped data at zero blast radius:
  `COCKPIT_DB=/tmp/sbx/cockpit.db CGS_DATA_DIR=/tmp/sbx/data python -m uvicorn app:app --app-dir backend --port 8010`.
  Kill it and delete the copies afterwards, and **prove** it stayed a sandbox (`git status` on
  `cgs-cogs/data/`, a count query on the live DB) rather than asserting it.
- `tsc` clean + a real HTTP check (not just "it compiled") before calling frontend work done.
- Git commits inside `landed-cost-cogs/` (the cockpit's own repo) use scoped pathspecs, same
  discipline as yuri-os itself. **Never mix a cockpit-tree change into a yuri-os commit** — they are
  two separate repos with two separate histories and two different remotes.
- The cgs-cogs costing engine (`../cgs-cogs/`) is READ-ONLY from the cockpit's side by default — it's
  owned by a different skill; don't edit its `engine.py`/data files from a cockpit task without reason.

## Status

STATE (2026-08-12): LIVE with real data (~1,600+ orders / 261 in 2026), remote access live and
reboot-verified, password gate + mobile-responsive pass shipped. Since 2026-07-19 the app has grown
Quotes, Inventory + BUILD deduction, Demand, Parts Counter, Net Profit, Versand (Swiss Post labels),
Etsy payouts, TWINT settlement, the master-BOM editor and build re-costing. Open items: AVG antivirus
occasionally blocked in-app Woo sync (never confirmed whitelisted); flat CHF 14 legacy COGS still
approximate for old gun-named products; two orders flagged "needs review" in Molds; a ~CHF 78k pending
cluster never confirmed real vs. artifact; 6 TWINT orders (CHF 647.97) with no evidence of payment —
check the bank statement before chasing, the cockpit cannot see it; Woo sync is manual-trigger only
(only the backup + git push run on a schedule). Full detail: the memory file's `NEXT / open` section.

## Session Notes

### 2026-07-21 (created)
- Built as a pure context/orientation skill — no processing pipeline, unlike its Blender-pipeline
  cgs-* siblings (cgs-align, cgs-decimate, cgs-mold). Distilled from the pre-existing, comprehensive
  `cgs-cockpit.md` Track-B memory file (do not duplicate it here — cross-reference by path instead).
- Verified every WHERE path against the live filesystem before writing it down (cockpit root, backend/
  file list, frontend/src/pages/ file list, and the sibling `cgs-cogs/` dir all confirmed to exist
  exactly as named, 2026-07-21).
- **House-idiom check**: `cgs-align`/`cgs-decimate`/`cgs-mold` exist ONLY in `.claude/skills/` — they
  are NOT mirrored into `skills/` (confirmed: no `skills/cgs-align` etc. on disk, and none of the three
  appear in `skills/domain-index.json`). `_SYSTEM/Scripts/skill-sync.mjs` publishes `skills/` →
  `.claude/skills/` for the *canonical* skill set, but these `cgs-*` skills were never canonicalized
  into `skills/` in the first place — they're harness-only by design. This skill follows the same
  pattern: `.claude/skills/cgs-cockpit/` only, no `skills/` mirror. None of the three siblings has an
  entry in `.claude/memory/MEMORY.md` either, so this skill deliberately omits one too (consistent with
  house practice — the durable knowledge lives in the Track-B memory file instead).
- `@anchor: none` — no discipline-enforcing rule in this skill traces to a documented failure; it's a
  pure orientation/context skill, not a hardened procedure.
- Tools: Read (memory file + sibling skills + live cockpit filesystem for path verification), Bash
  (directory listings only, read-only), Write (this file + the command alias).

### 2026-08-12 (master BOM editor, build re-costing, doc drift)
- Added: the THREE cgs-cogs write doors (boms_store joined orders_store + parts_store), the
  boms.json-vs-build_config split, COST FOLLOWS THE BUILD, the sandbox-on-copies verification recipe,
  the full current page list, and a refreshed Status.
- **Corrected a rule that had gone false**: this skill (and the repo's CLAUDE.md) both still said part
  prices and BOMs "belong to the /cgs_cogs skill — never write those from here". `parts_store.py`
  already wrote parts.csv and `boms_store.py` now writes boms.json. A stale prohibition is worse than
  no rule: it tells a session the safe path is the forbidden one. Rule of thumb this leaves behind —
  when a doc says "X is read-only", verify against `grep -rn` for writers before trusting it.
- **Found and fixed real doc drift in the cockpit repo**: TWO copies of the memory snapshot
  (`docs/cockpit-memory.md`, referenced by CLAUDE.md, 2 weeks stale — and
  `cockpit/docs/cockpit-memory.md`, newer but referenced by nothing). A session following the
  documented path got the older file. Refreshed the canonical one, removed the orphan.
- `@anchor: none` still holds for the orientation content; the CO-COST/`sheet_offset` and
  DECLINES-rather-than-guesses notes trace to failures caught in testing, recorded in the Track-B
  memory entry rather than as skill rules.
- Tools: Read/Edit (skill + repo CLAUDE.md + memory), Bash (git, sandbox instance on :8010 against
  copies, live-DB count checks to prove isolation), claude-in-chrome (live UI verification).

### 2026-08-19 (CAM REGISTER vocabulary, and a substring that hands over the wrong shell)
- René added CZ / SHADOW 2 COMPACT in the shop and could not pick it in CAM REGISTER. Root cause is
  structural, not a bug: the MODEL field is a `<select>` mirroring `cam_vocab.json`. Patched the
  vocabulary AND `gun_tokens()`, then built `cam_vocab_sync.py` (+ 23-assert test) so the next one is
  one command. Both committed to the cockpit repo (`f00b30b`, `ab60d05`), pushed.
- **The lesson worth keeping**: fixing the visible half (the dropdown) would have shipped a SILENT
  wrong-shell bug. `gun_tokens()` matches by substring, so "SHADOW 2 COMPACT" would have keyed onto
  "SHADOW 2" and matched a mold that does not fit, with nothing anywhere reading as a mismatch. When
  a request is "I can't select X", always ask what X's IDENTITY resolves to, not just where its label
  is missing.
- **Two adversarial checks that earned their keep**: (1) mutation test — restoring the pre-fix matcher
  makes the sync tool report COLLISION, proving the check discriminates rather than always passing;
  (2) reconciling against the real 01-08-2026 export produced ZERO additions and independently
  rediscovered both of René's own 2026-08-01 store findings — the extractor reproduces a hand-built
  file exactly. First-run green on a fresh tool means nothing without one of these.
- Corrected drift found while working: this skill's RESTART GOTCHA sent sessions to Task Manager when
  `restart-cockpit.bat` exists (verified on disk). Killed PIDs by hand before noticing.
- Tools: Read/Grep/Edit/Write, Bash (python, read-only SQLite `mode=ro` check, tempfile sandboxes for
  the write path, git), claude-in-chrome (live `/api/cam/vocab` + `/api/cam/preview` verification).

### 2026-08-26 (accepted quote → sales rows, and a live footgun the guard now blocks)
- Built quote→sale conversion (commit `8060dad`): "→ Verkauf" on an accepted quote books its lines
  into the sales ledger as `source='manual'` rows — no WooCommerce, sync-prune-proof, one-way
  `converted_at` stamp. Mapping lives in `backend/quote_convert.py`; spec + gotchas in the Track-B
  memory's QUOTE → SALE CONVERT entry.
- **The guard the live data demanded**: a quote prefilled from a Woo order SHARES that order's
  number, and quote 813189 already had 2 synced sale rows — converting would double-count. The
  endpoint now 409s when `db.count_for_order(order_nr)` is non-zero. When a convert flow reuses an
  identifier from another system, always check the destination ledger for that identifier first.
- Verified: money mapped exactly (Σ sales rows = quote Gesamt incl. line + doc discounts + Porto)
  on a temp-DB sandbox in the app's own venv; all three 409/400 guards exercised negative;
  `prune_woo_except` proven to leave manual rows; tsc + vite build clean; live UI + `/api/quotes`
  (new `converted_*` fields) checked through René's Chrome after `restart-cockpit.bat`.
- Converted sales start `status='pending'` with NO `paid_date` — cash-basis surfaces (P&L, TWINT
  reconcile) only see them once René marks payment by hand, same as any manual sale.

### 2026-09-05 (two screens telling the truth about different sheets)
- "The bench shows 2 carriers, the build says nothing on the bench." Both were right — the build was
  asking for a BLACK 8x8 while the carriers were OLIVE 8x12. Fixed so the companion follows the
  colour (commit `b2df6d3`, pushed); detail in the section above.
- **The habit that paid**: the visible complaint was a missing offer. Pulling the thread found a
  wrong COGS basis (olive carrier costed on black), a lying deduction row, and — via `git log -S` on
  the config key — a BOM regression worth CHF 3.30/sidecar that nothing in the app surfaced. Read the
  ORIGINAL design commit before deciding what "correct" means; `3afe119`'s message contained the
  ruling that settled the whole question.
- **Two self-inflicted bugs, both silent, both worth remembering**: a `for/else` created by inserting
  code between `if` and `else` (booked a second sheet on every build), and a test fixture pinned to a
  wall-clock hour that went red on its own once real time passed it. The first was caught only
  because I checked the numbers after the change rather than trusting a green import; the second by
  running the FULL suite rather than just the new file.
- Owner-gated correctly: the BOM restore and the carrier-sheet ruling were both money decisions, so
  they were put to René rather than assumed — and `boms.json` was left out of the commit because it
  also carried his in-flight edits.

### 2026-09-05 (undoing a build, and two mutants that survived)
- "How do I undo a BUILD HOLSTER for 813150?" — you couldn't, properly. Built the undo (commit
  `0d1c6b7`, pushed) and ran it on the real order: 11 parts restored, out of BUILT, COGS back on the
  BOM figure. Detail in the section above.
- **The finding worth keeping is about TESTING, not the feature.** The first suite was green, and
  then **two of four mutants survived it**: `len(stamps)==1` passes with the clock inside the loop
  because three fast inserts share a second *by luck*, and the time-window assert was actually being
  carried by the note. Both asserts were testing the machine, not the rule. Fixed by stubbing
  `inv._now` to tick on every call, and by adding two SAME-note builds five minutes apart. **A
  surviving mutant is not a weak mutant — it is a vacuous assert.** Run the mutants before believing
  a green suite, and when one survives, suspect the test first.
- Second lesson: a build that reads the clock per row is not just untidy, it destroys the only thing
  that makes the event addressable. Undo-ability is a property you have to design INTO the write.

### 2026-09-05 (a field that was missing, and the merge it was hiding)
- René could not say WHICH gun two molded Magazinhalter were for. Added a fitment dimension to the
  shell ledger (commit `7f1e026`, pushed). Detail in the section above and in the memory file.
- **The lesson, again in a new costume**: the visible complaint was "the dropdown has no Glock". The
  actual defect was that a Glock mag body and a SIG mag body **shared one stock line** — invisible,
  and it survived a year only because every prior shell was a gun-less Guardian Angel. When a
  request is "I can't specify X", ask what the record's IDENTITY is without X, not just where the
  field is missing. Same shape as the 2026-08-19 `gun_tokens` substring finding.
- **What made the verification worth anything**: three MUTANTS. First-run green proved nothing —
  flipping subset→intersection, removing the canonical sort, and dropping `guns` from the balance
  query each had to break a specific assert, and each did. Then the migration was run against a
  hand-built pre-`guns` database (the fresh-DB test never touches `ALTER TABLE`, which is the path
  the LIVE db takes) and the UI half was driven end-to-end on the :8010 sandbox-over-copies.
- Method note: the in-app Browser pane has no auth cookie; René's Chrome does. Driving React
  `<select>`s there needs the native value setter + a dispatched `change`, and a cross-port `fetch`
  needs the tab navigated to that port first.
- Tools: Read/Grep/Edit/Write, Bash (python, read-only `mode=ro` DB checks, sandbox on :8010, git),
  claude-in-chrome (live UI verification on both the live app and the sandbox).

### 2026-08-19 (same session — the button, and a rename that was not one)
- Built the UI for the sync (CAM REGISTER → Vocabulary panel). **Verifying a file-upload UI without a
  readable file**: `file_upload` refused a path outside the session's allowed dirs, so the working
  method was to build a `File` + `DataTransfer` in the page via `javascript_tool`, assign
  `input.files` and dispatch `change` — React's handler fires and the whole path runs for real.
- **Test writes went to the LIVE `cam_vocab.json` on purpose** (the only honest end-to-end for a write
  path), then `git checkout --` + delete the `.bak`, and PROVED the revert with `git status` + a
  content read. Do it that way or not at all; a write path verified only in a sandbox copy has not
  been verified where it runs.
- Three defects that only appeared by running it: the panel unmounted itself on success (a `loading`
  early-return), a duplicated clash list, and an LF writer against a CRLF working tree. None were
  visible in review.
- **Owner ruling: ARSENAL STRIKE ONE ≠ STRYK B.** The shop replaced one option with the other, which
  reads like a rename. It was not. Never infer "renamed" from a shop diff — ask; the wrong answer
  either orphans a mold or hands an order the wrong shell.
- Route note: the CAM Register page is `/cam`, not `/cam-register`.
- Tools: as above, plus `file_upload` (refused — see method), `browser_batch`.
