# CGS Claude.ai Projects — Instructions Export

Export of the 8 Custom Gear Solutions Claude.ai Projects, pulled from claude.ai on **2026-07-06** via the connected Chrome session. Scope: **project instructions / persona only** (no chats).

> Note: the Claude.ai **"Instructions"** field is *empty* on every one of these projects ("Add instructions to tailor Claude's responses"). The persona text lives in each project's **description** (the block under the title). That description is what's captured here — it's the text that defines each department agent.

| # | Project | Persona | Attached files |
|---|---------|---------|----------------|
| 1 | [ACCOUNTING - HUGO](01-accounting-hugo.md) | Hugo — Bookkeeper | CHE442.561.1921.pdf, CGS_organigram.pdf |
| 2 | [CUSTOMER SERVICE - LEON](02-customer-service-leon.md) | Leon — Front Desk / CS | — |
| 3 | [WEB/SEO - NICO](03-web-seo-nico.md) | Nico — Web & SEO | CHE442.561.1921.pdf |
| 4 | [PRODUCTION - BRUNO](04-production-bruno.md) | Bruno — Production Foreman | — |
| 5 | [HEAD OFFICE](05-head-office.md) | Reference / canonical docs | CHE442.561.1921.pdf, CGS_organigram.pdf |
| 6 | [MARKETING - MAX](06-marketing-max.md) | Max — Marketing | — |
| 7 | [STOCK/PROCUREMENT - STEFAN](07-stock-procurement-stefan.md) | Stefan — Stock & Procurement | CHE442.561.1921.pdf |
| 8 | [COO - JEFFREY](08-coo-jeffrey.md) | Jeffrey — COO / daily right hand | — |

## Status 24/10/2026 — Projects → Claude Code lanes

The eight Projects were passive prompt containers (persona text + a PDF or two, no data, no triggers,
no memory). Each role now either has a real lane (a skill naming its data sources, endpoints, binding
rules and unprompted routines) or an explicit gap note. House pattern: `.claude/skills/cgs-<role>/SKILL.md`
+ `.claude/commands/cgs-<role>.md`; `cgs-cfo` was the template.

| # | Project | Lane | Data it stands on | Gap |
|---|---------|------|-------------------|-----|
| 1 | ACCOUNTING – HUGO | `cgs-cfo` · `/cgs-cfo` (24/10/2026) | cgs-books + cockpit dashboard/sales/orders | method decision Treuhänder-pending |
| 2 | CUSTOMER SERVICE – LEON | `cgs-frontdesk` · `/cgs-frontdesk` | cockpit `/api/sales`, `/api/post/labels`, `/api/molds/coverage|ready`, `/api/cam/vocab`; AGB v2; discount programme | inbox wired 24/10/2026 (cockpit Front Desk, `/api/mail/*`) — credentials pending → [leon-mail-gap.md](leon-mail-gap.md) |
| 3 | WEB/SEO – NICO | folded into `cgs-seo` · `/cgs-seo` (Role section) | GSC/Bing (Chrome), WP/Woo REST, Plesk, `02_RESOURCES/CGS-SEO/` | — |
| 4 | PRODUCTION – BRUNO | `cgs-production` · `/cgs-production` | cockpit `/api/molds/ready` verdicts, `/api/molds`, `/api/shells`, `/api/finished`, `/api/inventory/demand`, job-sheet PDF | — |
| 5 | HEAD OFFICE | `cgs-head-office` · `/cgs-head-office` | sourced registry: AGB, memories, `config.json`, ledgers, organigram PDF in `02_RESOURCES/CGS-HEAD-OFFICE/` | Zefix excerpt not on disk (fetch on demand) |
| 6 | MARKETING – MAX | `cgs-marketing` · `/cgs-marketing` | cockpit `/api/boms`, `/api/cam/vocab`, `/api/dashboard/by-model`; Etsy scripts (DISARMED); render pipelines | **no newsletter tool** on the site |
| 7 | STOCK/PROCUREMENT – STEFAN | `cgs-stock` · `/cgs-stock` | cockpit `/api/inventory/demand`, `/api/inventory`, `/api/parts`, `/api/orders`, purchasing lines; `cgs-cogs/data/` ledgers | UPS "staircase" not in any data — owner-stated |
| 8 | COO – JEFFREY | existing local voice assistant (`_SYSTEM/SELF/jeffrey-persona.md`) — not rebuilt | file index, confirm-gate | — |

All lanes share the contract: propose → René clicks (confirm-gate), Rule B (customer data stays local),
cite-or-flag, ≤ 30-line routines. The one integration that unlocks the most at once — a **read-only IMAP pull into the cockpit** (Leon's
inbox, Jeffrey's "mail recap", supplier + customer mails) — was **built 24/10/2026** (cockpit Front Desk);
see `leon-mail-gap.md`.
