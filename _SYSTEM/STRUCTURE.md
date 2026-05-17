# Vault Structure — NUDIMMUD

Complete directory map with explanations and cross-references.

---

## Root-Level Canon

These files sit at the vault root on purpose. Keep them there and use them as the top-level anchor set for navigation.

- Governance: [AGENTS.md](AGENTS.md), [AEONIC_PROTOCOL.md](AEONIC_PROTOCOL.md), [CODEX_PROTOCOL.md](CODEX_PROTOCOL.md), [LOCAL_EXECUTION_POLICY.md](LOCAL_EXECUTION_POLICY.md), [NEURAL_FORGE.md](NEURAL_FORGE.md), [YURI.md](YURI.md)
- Identity and memory: [identity.md](identity.md), [enki_state.md](enki_state.md), [memory-core.md](memory-core.md), [session_log.md](session_log.md), [session_prompt.md](session_prompt.md), [SOUL.md](SOUL.md), [USER.md](USER.md), [TOOLS.md](TOOLS.md)
- Doctrine and logs: [CLAUDE.md](CLAUDE.md), [CONCLAVE_COGNITIVE_LOG.md](CONCLAVE_COGNITIVE_LOG.md), [creative_codex.md](creative_codex.md), [DESIGN.md](DESIGN.md), [esoteric_codex.md](esoteric_codex.md), [GEMINI.md](GEMINI.md), [geopolitical_log.md](geopolitical_log.md), [HEARTBEAT.md](HEARTBEAT.md), [language_codex.md](language_codex.md), [nabu.md](nabu.md), [NUDIMMUD_AUDIT_README.md](NUDIMMUD_AUDIT_README.md)

---

## 00_COMMAND-CENTER/

**Daily operations, status, and navigation.**

- `HOME.md` — Current projects, blockers, next actions (read first each session)
- `session_log.md` — Session history with DRIFT/INSIGHT/DELTA entries
- `MEMORY.md` — Index of persistent knowledge (auto-generated)
- `Inbox/` — Capture zone for unsorted notes
- Daily notes by date (Obsidian daily notes plugin)

**Maps of Content (MOCs):**
- `MOC-Projects.md` — All active client projects
- `MOC-Areas.md` — Ongoing responsibilities
- `MOC-Network.md` — Collaborators, partners, contact info

---

## 01_PROJECTS/

**All active and past client work.**

Structure:
```
01_PROJECTS/
├── _TEMPLATE/          # Copy this for new projects
├── C2MOVIEZ/           # c2moviez GmbH pipeline
│   ├── ANGELIKA/       # [Client name — all caps]
│   ├── BOVIRO/
│   ├── CHEESE-DOCTOR/
│   ├── MUDI/
│   ├── OREA/
│   ├── SAMPLE/
│   └── SHIPSTER/
├── MACL-ONE/           # MACL ONE brand (second pipeline)
├── NEXUS-LINK-LANDING/ # Company landing page
└── [Other clients]
```

**Each project folder contains:**
- `brief.md` — Creative brief, deliverables, timeline
- `budget.md` — Costs, invoicing, payment schedule
- `crew.md` — Team, roles, contact info
- `timeline.md` — Shoot dates, milestones, deadlines
- `location-scout/` — Location photos, maps, access notes
- `shot-list/` — Scene breakdown, shot descriptions
- `footage/` — Raw captures (or links to storage)
- `deliverables/` — Final outputs, approvals
- `notes/` — Shoot logs, client feedback, revisions

**Naming convention:** `[ClientName]_[ProjectSlug]_[YYYY-MM]`
Example: `ANGELIKA_cosmetics-campaign_2026-02`

---

## 02_AREAS/

**Ongoing responsibilities (not projects).**

- `Network/` — Collaborators, partnerships, contact management
- `Health/` — Physical health, nutrition, sleep, exercise
- `Learning/` — Skills development, courses, research
- `Clients/` — Client profiles, contract templates, rates
- `Personal-Brand/` — Portfolio, website, social media
- `Tech-Setup/` — Hardware, software, tools, configuration

Each area evolves independently from projects.

---

## 03_RESOURCES/

**Assets, templates, presets, reference material.**

```
03_RESOURCES/
├── Templates/          # Project templates, shot lists, briefs
├── LUTs/               # Color lookup tables (DaVinci, Premiere)
├── Presets/            # After Effects, Lightroom, camera profiles
├── Stock/              # Music, sound effects, graphics libraries
├── Reference/          # Inspiration, case studies, competitor analysis
└── Legal/              # Contracts, terms, IP templates
```

All items should be:
- Named clearly: `[Type]-[Description]-[Version].ext`
- Versioned if critical
- Linked to projects that use them

---

## 04_FINANCE/

**Austrian EPU bookkeeping and financial tracking.**

```
04_FINANCE/
├── 2026/
│   ├── Invoices/       # INV-2026-001_ClientName.pdf
│   ├── Expenses/       # EXP-2026-01-15_Vendor.pdf
│   ├── Records/        # Bank statements, receipts (encrypted storage)
│   └── Summary/        # Monthly/quarterly reconciliation
├── Contracts/          # Client agreements, rate sheets
├── Taxes/              # EPU documentation
└── Assets/             # Depreciation, equipment registry
```

**Naming conventions:**
- Invoice: `INV-[YYYY]-[###]_[ClientName].pdf`
- Expense: `EXP-[YYYY-MM-DD]_[Vendor].pdf`

Files in this folder may be:
- **Encrypted** (sensitive financial data)
- **Private** (not synced publicly)
- **Archived annually** (after tax filing)

---

## 05_NEXUS-LINK/

**Company identity, brand, strategy.**

- `identity.md` — Company mission, values, positioning
- `brand-standards.md` — Visual identity, color palette, typography
- `services.md` — What Nexus Link offers, rates, positioning
- `legal/` — Company registration, contracts, IP policy
- `website/` — Landing page content, portfolio
- `social/` — Social media strategy, content calendar

This is the **public face** of the company. Everything here should be shareable.

---

## 06_NETWORK-SYNC/

**Cross-vault collaboration and external sync points.**

```
06_NETWORK-SYNC/
├── C2MOVIEZ/
│   ├── CLAUDE.md           # Partner profile + sync rules
│   ├── _SYNC-STATUS.md     # What's synced, when, status
│   ├── _MAPPING.md         # Claudio's paths → Marcel's paths
│   ├── Database/           # Read-only copy of Claudio's filesystem
│   ├── Shared-Projects/    # Active projects (bi-directional refs)
│   └── Shared-Assets/      # Shared media, templates
└── PLANZERFILMS/
    ├── CLAUDE.md
    ├── _SYNC-STATUS.md
    └── ...
```

### Sync Protocol

**For each partner:**

1. **Partner profile** — Who they are, what they do, contact info
2. **Database** — Raw export of their folder structure (read-only reference)
3. **Mapping** — How their paths map to Marcel's naming conventions
4. **Shared space** — Only actively synced projects go here
5. **Status log** — Date, what changed, what was synced

**Key rule:** Never modify files in `Database/`. It's a reference snapshot.

---

## 07_ARCHIVE/

**Completed and inactive work.**

```
07_ARCHIVE/
├── Completed-Projects/  # 2025, 2024 work
├── Deprecated-Skills/   # Old processes that no longer apply
├── Client-Archive/      # Past clients, one-off projects
└── Reference/           # Old notes, deprecated patterns
```

- Archive **after project completion + client approval**
- Keep for reference (portfolio, case studies, learning)
- Tag with completion date: `[Project]_COMPLETED-2026-04`

---

## _SYSTEM/

**Configuration, automation, meta-tools.**

```
_SYSTEM/
├── CLAUDE.md              # Rules for AI agents (Claude Code context)
├── MIGRATION-MAP.md       # Where things belong (for organizing)
├── Templates/
│   ├── Project-Brief.md
│   ├── Shoot-Checklist.md
│   ├── Invoice-Template.md
│   └── ...
├── Scripts/
│   ├── organize-footage.sh
│   ├── backup-vault.sh
│   └── sync-c2moviez.sh
├── Claude-Memory/         # Persistent memory for AI agents
├── SELF/                  # Self-analysis, reflections, growth tracking
└── Obsidian-Config/       # .obsidian settings export (for team collab)
```

### CLAUDE.md Explained

This file is **read by Claude Code** (AI agent) to understand:
- Project structure
- Naming conventions
- Collaboration protocols
- Safety rules (never delete without backup)
- Preferred working style

It's not meant for humans — it's configuration for automation.

---

## 06_KNOWLEDGE-BASE/

**Synthesis and cross-domain knowledge.**

Organized by domain:

```
06_KNOWLEDGE-BASE/
├── 01_COSMOLOGY/         # Sumerian, Kabbalistic, Hermetic systems
├── 02_CONSCIOUSNESS/     # Archetypes, individuation, phenomenology
├── 03_COMMUNICATION/     # Somatic, emotional, narrative, linguistic
├── 04_SYNTHESIS/         # Isomorphisms, cross-references, patterns
├── 05_OPERATIONAL/       # Mode triggers, response architecture
└── REPORT.md             # Summary of all 24 files + cross-refs
```

**Purpose:** A personal knowledge base that connects:
- Deep esoteric philosophy (cosmology, consciousness)
- Practical business frameworks (communication, influence, sales)
- Operational systems (this vault itself)

This is the **intellectual foundation** for how Marcel approaches problems.

---

## Key Navigation Patterns

### Finding a Project
1. Start: `00_COMMAND-CENTER/HOME.md` (status overview)
2. Reference: `00_COMMAND-CENTER/MOC-Projects.md` (all projects)
3. Navigate: `01_PROJECTS/[ClientName]/[Project]/`

### Finding a Process
1. Check: `_SYSTEM/MIGRATION-MAP.md` (where things belong)
2. Search: Obsidian search (Cmd+Shift+F) for keywords
3. Reference: `_SYSTEM/CLAUDE.md` for operational rules

### Understanding the Company
1. Read: `05_NEXUS-LINK/identity.md`
2. Reference: `05_NEXUS-LINK/brand-standards.md`
3. Check: `05_NEXUS-LINK/services.md` for positioning

### Cross-Vault Collaboration
1. Find: `06_NETWORK-SYNC/[PartnerName]/CLAUDE.md`
2. Reference: `_SYNC-STATUS.md` (sync state)
3. Access: `Database/` for partner's structure
4. Sync: `Shared-Projects/` for active collaboration

---

## Maintenance & Evolution

- **Weekly:** Update HOME.md with current status
- **Monthly:** Review and archive completed projects
- **Quarterly:** Update 02_AREAS for ongoing responsibilities
- **Annually:** Archive old projects, refresh financial records

Every file is evolvable. The structure is stable; the content grows.

---

## Ownership & Permissions

| Folder | Owner | Visibility |
|--------|-------|-----------|
| 00_COMMAND-CENTER | Marcel | Private |
| 01_PROJECTS | Marcel | Project-specific (some shared with clients) |
| 02_AREAS | Marcel | Private |
| 03_RESOURCES | Marcel | Some public (templates), some private |
| 04_FINANCE | Marcel | Encrypted/Private |
| 05_NEXUS-LINK | Marcel | Public (brand) |
| 06_NETWORK-SYNC | Shared | Bi-directional (partners) |
| 07_ARCHIVE | Marcel | Private unless documented otherwise |
| _SYSTEM | Marcel | Private (except CLAUDE.md snippets) |

---

**Last updated:** 2026-04-17
