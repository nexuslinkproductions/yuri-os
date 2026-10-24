---
name: cgs-head-office
description: CGS HEAD OFFICE — the single source of truth for company-wide facts about Spatz Custom Gear Solutions (brand CGS, custom-gear.ch): legal identity (UID, address, Registergericht), the organigram and the role-lane map, canonical documents (AGB, discount programme, copy rules, mail convention), suppliers, fixed overhead, infrastructure accounts and where each lives — every fact with its source path and verification date. Use when René says "cgs-head-office", "/cgs-head-office", "head office", "company facts", "Firmendaten", "UID", "Handelsregister", "Zefix", "organigram", "Organigramm", "who does what", "which lane", "where is the AGB", "supplier list", "Lieferanten", "overhead", "Fixkosten", "company policy", or asks any "where is the canonical X" question. Gives the registry, the provenance rule, the quarterly drift check, and the lane map.
triggers: ["cgs-head-office", "/cgs-head-office", "head office", "company facts", "firmendaten", "uid", "handelsregister", "zefix", "organigram", "organigramm", "who does what", "which lane", "supplier list", "lieferanten", "fixkosten", "company policy"]
---

# cgs-head-office — CGS company facts registry

Not a persona: a REGISTRY with provenance. Each row = value · source (absolute path / endpoint / URL)
· verified dd/mm/yyyy. It replaces the dead claude.ai Project "HEAD OFFICE" (two PDFs: organigram +
Zefix excerpt; no way to tell whether either was still current). The rule here is simple: **a fact
without a source row is not a Head Office fact.**

## LEGAL IDENTITY

| Fact | Value | Source | Verified |
|---|---|---|---|
| Legal name | **Spatz Custom Gear Solutions** (Einzelunternehmen) | `02_RESOURCES\CGS-LEGAL\AGB-v2-draft-2026-07-24.md` §1; live `https://custom-gear.ch/agb/` | 24/10/2026 |
| Brand | **CGS** — never "Custom Gear Switzerland"; legal name only in legal docs | memory `feedback-cgs-brand-name` | 24/10/2026 |
| UID | **CHE-442.561.192** | AGB §1; cgs-cfo skill; Zefix excerpt (`CHE442.561.1921.pdf`) was attached to the old Projects — **not on this disk**; re-fetch from `https://www.zefix.ch` by UID when needed (online, UNVERIFIED until fetched) | 24/10/2026 |
| Address | Oberwilerweg 32, CH-4852 Rothrist (AG); Registergericht Kanton Aargau | AGB §1 | 24/10/2026 |
| Owner | René Spatz — CEO, sole worker; all physical production | memory `rene-cgs-jeffrey-operating-profile`; organigram | 24/10/2026 |
| MWST | exempt until 31/12/2026; **steuerpflichtig from 01/01/2027**; method decision Treuhänder-pending | skill `cgs-cfo` + `02_RESOURCES\CGS-TAX\` | 24/10/2026 |
| Contact | `rene@` / `info@` / `sales@custom-gear.ch` (IMAP, hosttech) | memory `cgs-mail-autoreply-plesk` | 24/10/2026 |

## ORGANIGRAM → ROLE LANES (who does what, 24/10/2026)

Organigram **v3, 03/07/2026**: `C:\Users\rene\yuri-os\02_RESOURCES\CGS-HEAD-OFFICE\CGS_organigram_v3_2026-07-03.pdf`
(copied from René's Downloads; names there — Heidi, Lena, Nina — predate the Project names Hugo, Leon,
Nico; the lanes use the Project names). Export of the eight Projects: `02_RESOURCES\cgs-projects-export\`.

| Role | Project name | Lane today | Data it stands on |
|---|---|---|---|
| CEO | René | — | decides, executes, signs off everything |
| COO | Jeffrey | local voice assistant (`_SYSTEM\SELF\jeffrey-persona.md`, `jeffrey` command) — **do not rebuild** | file index, confirm-gate |
| Accounting | Hugo | `cgs-cfo` · `/cgs-cfo` | cgs-books + cockpit |
| Stock & Procurement | Stefan | `cgs-stock` · `/cgs-stock` | cockpit inventory/demand/purchasing |
| Production | Bruno | `cgs-production` · `/cgs-production` | cockpit molds/ready, shells, demand, job sheets |
| Customer Service | Leon | `cgs-frontdesk` · `/cgs-frontdesk` | cockpit sales/labels/coverage + **Front Desk** mail mirror (`/api/mail/*`, built 24/10/2026) |
| Web & SEO | Nico | folded into `cgs-seo` · `/cgs-seo` | GSC/Bing, WP/Woo REST, Plesk |
| Marketing | Max | `cgs-marketing` · `/cgs-marketing` | BOM/vocab/sales, Etsy scripts, render pipelines; **no newsletter tool** |
| Engineering / R&D | Yuri | `cgs-align` → `cgs-decimate` → `cgs-mold` + FreeCAD CAM memories | Blender, CNC share |
| Head Office | — | this skill | the registry below |

Shared contract for every lane: **propose → René clicks** (confirm-gate), **Rule B** (customer data stays
local), **cite-or-flag**, outputs ≤ 30 lines, dates dd/mm/yyyy, brand "CGS".

## CANONICAL DOCUMENTS & POLICIES

| Document / policy | Where | State |
|---|---|---|
| AGB v2 (B2C+B2B, Offerten §4, no return §7, warranty §10, liability §11, forum §13) | draft `02_RESOURCES\CGS-LEGAL\AGB-v2-draft-2026-07-24.md`; **live** `/agb/` since 28/07/2026 | lawyer sign-off on §§10–13 pending; §5 flips to "inkl. MWST" at 01/01/2027 (memory `cgs-agb-v2-legal`) |
| Discount programme (15 % pros, 20 % dealers from CHF 300; rates never public) | memory `cgs-discount-programme`; page `/behoerden-haendler/`; two Outlook templates | ~35 coupons without e-mail lock — clean-up open |
| Holster copy rules (legal + technical) | memory `cgs-holster-copy-rules` | BINDING, owner-corrected 07–08/09/2026 |
| Out-of-office convention | memory `cgs-mail-autoreply-plesk` (Plesk ids rene 333 / info 2086 / sales 2087) | last run 14/09–09/10/2026 |
| Shop closure mechanism | Store Vacation Lite + Elementor popup — end both on the same date | memory `cgs-shop-seo` |
| Quote (ANGEBOT) terms | 14-day validity, AGB footer | cockpit Quotes (`/api/quotes`), skill `cgs-cockpit` |
| Privacy / data routing | Rule B split-routing; Firefox passwords never in a prompt | memory `rene-cgs-jeffrey-operating-profile` |
| MWST 2027 readiness | `02_RESOURCES\CGS-TAX\12-mwst-2027-readiness-checklist.md` | skill `cgs-cfo` |
| Hosting security audit | memory `cgs-hosttech-security-audit` (21/10/2026) | 2 HIGH plugin vulns, no Plesk backups — open |

## SUPPLIERS (source: cockpit `GET /api/purchasing/meta` + `cgs-cogs/data/orders_*.csv`, 24/10/2026)

| Supplier | What | Landed factor | Ledger |
|---|---|---|---|
| HOLSTERSMITH (USA, UPS) | Kydex sheets, hardware | 1.0617 | `orders_holstersmith.csv` (23 orders since 01/2025) |
| BLADETECH (USA, FedEx) | Duty Drop, resale goods | 0.975 | `orders_bladetech.csv` |
| GUN&FLOWER | ROTOLOCK Level 2 hoods | — | `orders_gunflower.csv`; memory `cgs-rotolock-level2` |
| Swiss Post (labels, WebStamp) | shipping | — | cockpit Versand; `docs/swisspost/FINDINGS.md`; memory `cgs-webstamp-letters` |
| hosttech (Hosting XL, Plesk) | shop + mail + books hosting | CHF 238.80/yr | memory `cgs-shop-seo`, skill `cgs-books` |

Path root for the ledgers: `C:\Users\rene\Claude\Projects\STOCK\PROCUREMENT - STEFAN\landed-cost-cogs\cgs-cogs\data\`.

## FIXED OVERHEAD (source: `cgs-cogs/data/config.json → overhead_monthly_chf`, 24/10/2026)

Workshop rent 300 · electricity 66.67 · landline+internet 58.48 · cellular 25.90 · CNC depreciation 60.65 ·
SVA 145.83 · AXA KMU insurance 20 · hosting 19.90 · Shapr3D 17.36 · LightBurn 2.08 · Claude 92.95 (CHF/month).
Investment bills recognised by keyword: `investment_bills` in the same file. Authoritative actuals: cgs-books.

## INFRASTRUCTURE & ACCOUNTS (pointers only — never the secrets)

- Shop: WordPress/WooCommerce at hosttech, Plesk `https://149.hosttech.eu:8443` (domainId 331) — skill `cgs-seo`.
- Books: `https://books.custom-gear.ch` (cgs-books, own repo nested in yuri-os) — skill `cgs-books`.
- Cockpit: `http://127.0.0.1:8000`, Tailscale node `cgs` (`100.67.34.51`), repo `github.com/CGSSCHWEIZ/landed-cost-cogs` (private) — skill `cgs-cockpit`.
- Etsy: shop CGSCustomGear id 56952831, app "cgs-listing-optimizer" — memory `rene-etsy-api-integration`.
- LinkedIn: `www.linkedin.com/in/custom-gear-solutions`. Instagram: feed on the homepage.
- Logos: `G:\My Drive\CGS\CGS ADMIN\CGS_LOGOS` (G: often unmounted) — memory `cgs-logo-assets`.
- Equipment: Kydex vacuum press, Sorotec Aluline 1510 (Teknomotor 2 kW), Bambu Lab P2S, Commarker laser,
  Silhouette CAMEO 5 — memories `rene-cgs-jeffrey-operating-profile`, `cgs-cameo5-cricut-smart-ironon`.

## BINDING OPERATING RULES

1. **Provenance or nothing.** Answer a company-fact question with value + source + verified date. If
   the source is not on disk or reachable, say `UNVERIFIED` and name where it would be fetched (Zefix,
   Plesk, the cockpit) — never fill the gap from memory. <!-- @anchor: none | founding rule -->
2. **Read-only registry.** Head Office changes nothing in any system; a stale row is reported, and the
   owning lane (cgs-cfo, cgs-seo, cgs-cockpit…) or René updates the source. Then this file's row.
3. **Protected surfaces stay protected:** `02_RESOURCES\LEGAL-PRIVAT\`, Firefox passwords, `.env`,
   `cgs-books/config.php`, the cockpit's `.*_config.json`, `backend/data/`. Pointers, never contents.
4. **Drive paths are checked, not assumed** — `G:` is frequently unmounted; say so instead of failing silently.
5. Dates dd/mm/yyyy; brand "CGS"; English unless René writes German.

## ROUTINES (what the lane does unprompted when invoked)

- **Drift check (quarterly, or on invocation if > 90 days since the last):** AGB `Stand` on the live
  page vs the draft; UID/address vs Zefix (online); supplier list vs `purchasing/meta`; overhead rows vs
  the last cgs-books month (via cgs-cfo); organigram vs the lane table; memory handles still resolve.
  Report **only the rows that drifted** (≤ 30 lines) + who owns the fix.
- **"Where is X?"** → the row, the path, the verified date. Nothing else.
- **Yearly (January):** MWST status row, insurance/SVA figures, hosting renewal, lawyer sign-off state.

## NEVER

- Never state a legal fact (UID, Registereintrag, AGB clause) without the source row.
- Never read or quote the protected surfaces above.
- Never edit another lane's source document from here; report, hand over.
- Never present the organigram's 03/07/2026 names as the live lane names — the table above is current.

## Session Notes

### 2026-10-24 (created — role-lane build)
- Built as the HEAD OFFICE replacement in the role-lane programme. The old Project's two PDFs: the
  organigram was found in `Downloads` (two copies, 03/07/2026) and copied into
  `02_RESOURCES\CGS-HEAD-OFFICE\`; the Zefix excerpt (`CHE442.561.1921.pdf`) was NOT found on disk →
  UID row cites the AGB + cgs-cfo and marks Zefix as fetch-on-demand.
- Supplier/overhead rows read from `config.json` and the ledgers directly (file reads, not a live
  endpoint); the `purchasing/meta` cross-check needs René's Chrome session.
- Residual risk: this registry is hand-maintained — the quarterly drift check is what keeps it honest.
