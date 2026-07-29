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
gotchas — before touching any file. **The cockpit repo is a SEPARATE git repo from yuri-os** (no
remote); never mix a cockpit-tree change into a yuri-os commit, and this skill never edits cockpit files
itself.

## WHERE (absolute paths)

- **Cockpit root**: `C:\Users\rene\Claude\Projects\STOCK\PROCUREMENT - STEFAN\landed-cost-cogs\cockpit\`
  — self-contained, its own git repo, NOT inside yuri-os. Remote (added 2026-07-28):
  `github.com/CGSSCHWEIZ/landed-cost-cogs`, **private**, branch `master`. The repo root also
  carries its own `CLAUDE.md` + `docs/cockpit-memory.md`, so a clone on any machine is workable
  without yuri-os or this skill — keep those two in sync when cockpit facts change.
- **Backend** (`backend/`): `app.py` (FastAPI app + route wiring), `db.py` (SQLite access), `woo.py`
  (WooCommerce REST sync), `engine_bridge.py` (reads the cgs-cogs engine), `auth.py` (password gate),
  `backup.py` (off-site SSH backup), `cam_index.py` (CNC drive scanner for "ready to build"),
  `cam_registry.py`, `export_molds.py` (Excel export).
- **Frontend** (`frontend/src/pages/`): `Overview.tsx`, `Sales.tsx`, `Products.tsx`, `Accessories.tsx`,
  `Purchasing.tsx`, `Molds.tsx`, `CamRegister.tsx`, `Settings.tsx`.
- **Costing engine** (co-located sibling, NOT inside `cockpit/`): `..\cgs-cogs\` — `scripts/engine.py`
  (stdlib) + `data/*.csv|json`. The cockpit reads this **READ-ONLY except for ONE path**: purchase
  orders. `backend/orders_store.py` is the single writer into `cgs-cogs/data/orders_*.csv` (atomic,
  keeps a `.bak`, validates hard). Part prices, BOMs and the dashboard still belong to the
  `/cgs_cogs` skill — never write those from here.
- **Purchasing write path** (built 2026-07-21): `orders_store.py` (ledger writes) ·
  `invoice_parse.py` (+`.test.py`, stdlib PDF/XLSX field extraction — a PROPOSAL that prefills a
  review dialog, never a write) · `documents.py` (invoice attachments under `cockpit/data/invoices/`,
  filename is the whole attack surface — basename-only + charset whitelist + `relative_to` check;
  no html/svg/js; only pdf/images served inline). Duty columns are `duty_chf`/`duty_covers` +
  `carrier` — **NOT** `ups_chf`/`ups_covers` (the import bill is not always UPS); the engine still
  reads the legacy headers.
- Verified on disk 2026-07-21: all paths above exist as listed.

## RUN

- **`start-lan.bat`** — the desktop-icon launcher. Binds `0.0.0.0:8000`. **Always use this one** — LAN
  and Tailscale peer access both depend on the 0.0.0.0 bind; a localhost-only relaunch silently cuts off
  remote access.
- `start.bat` — localhost-only (127.0.0.1:8000). Only relevant if Tailscale Serve is ever wired up
  (currently deferred — plain HTTP over the tailnet is live instead, see REMOTE ACCESS).
- `start-service.bat` — the unattended launcher (no pip, no browser, restart loop, 0.0.0.0). Since
  2026-07-29 it is started **as `rene` at logon** from `Startup\CGS Cockpit.lnk`, not by a task.
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

Fix: open Task Manager **as admin** → Details tab → find the `python.exe` PID listening on port 8000
(cross-check with `netstat -ano | grep :8000`) → End Task → relaunch via `start-lan.bat` (**never**
`start.bat` — see RUN above, binding matters).

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

## WORKFLOW discipline

- **Verify against the running app, not assumptions.** Hit the real HTTP endpoints / load the real page
  before claiming a fix works — this app has a documented history of confidently-wrong claims later
  found false under direct testing (see the memory file's 2026-07-19 adversarial-review entry).
- `tsc` clean + a real HTTP check (not just "it compiled") before calling frontend work done.
- Git commits inside `landed-cost-cogs/` (the cockpit's own repo) use scoped pathspecs, same
  discipline as yuri-os itself. **Never mix a cockpit-tree change into a yuri-os commit** — they are
  two separate repos with two separate histories and two different remotes.
- The cgs-cogs costing engine (`../cgs-cogs/`) is READ-ONLY from the cockpit's side by default — it's
  owned by a different skill; don't edit its `engine.py`/data files from a cockpit task without reason.

## Status

STATE (per memory file, 2026-07-19): LIVE with real data (~1,600+ orders), remote access live and
reboot-verified, password gate + mobile-responsive pass shipped and verified. Open items: AVG antivirus
occasionally blocked in-app Woo sync (never confirmed whitelisted); flat CHF 14 legacy COGS still
approximate for old gun-named products; two orders flagged "needs review" in Molds; a ~CHF 78k pending
cluster never confirmed real vs. artifact; Woo sync is manual-trigger only (only the backup runs on a
schedule). Full detail: the memory file's `NEXT / open` section.

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
