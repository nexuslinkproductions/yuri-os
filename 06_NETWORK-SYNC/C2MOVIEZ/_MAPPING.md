# C2MOVIEZ Database Mapping
**Integrated:** 2026-04-17

Maps Claudio's vault structure → NUDIMMUD canonical paths for bidirectional project linking.

## Mapping Table

| Claudio's Path | Domain | NUDIMMUD Canonical | Purpose | Sync Mode |
|---|---|---|---|---|
| `02 - Clients/` | Client data | `01_PROJECTS/C2MOVIEZ/Clients/` | Client master records + Marcel context | Read-only reference |
| `03 - Projects/` | Active projects | `01_PROJECTS/C2MOVIEZ/[PROJECT_SLUG]/` | Project briefs, timelines, deliverables | Bidirectional (slug matching) |
| `04 - Team/` | Team / Roles | `02_AREAS/Network/C2MOVIEZ-TEAM.md` | Team roster, roles, assignments | Reference |
| `05 - Work Items/` | Tickets | Plane.so API (reference) | Work item tracking, status updates | API sync |
| `06 - Processes/` | SOPs / Workflows | `.claude/rules/` + `.claude/processes/` | Delivery checklist, client onboarding, campaign workflow | Reference |
| `07 - Resources/` | Shared assets | `03_RESOURCES/C2MOVIEZ/` | Service catalog, rates, pricing, templates | Read-only reference |
| `09 - Templates/` | Templates | `03_RESOURCES/C2MOVIEZ/Templates/` | Project templates, proposal formats | Read-only reference |
| `10 - MACL GmbH/` | Separate entity | `01_PROJECTS/MACL-ONE/` | MACL operational notes (separate company) | Read-only reference |
| `11 - ExeoFlow/` | Partnership | `02_AREAS/Partnerships/ExeoFlow/` | ExeoFlow integration strategy | Reference |
| `12 - SILASWIRTH/` | Motion partner | `02_AREAS/Partnerships/SILASWIRTH/` | Motion/VFX collaboration | Reference |
| `CI:CD/` | Automation | `_SYSTEM/C2MOVIEZ-CI-CD/` | Dashboard, scripts, deployment | Reference only (read Claudio's GH) |

## Project Linking Rule

**Slug-based bidirectional linking**: Projects shared between Claudio and Marcel use matching slugs.

Format: `[CLIENT]_[YYYY-MM]` (same in both vaults)

Example:
- Claudio: `03 - Projects/SHI - 3 Month Campaign Apr-Jun 2026/` → slug: `SHI_2026-04`
- Marcel: `01_PROJECTS/C2MOVIEZ/SHI_2026-04/` ← bidirectional reference via frontmatter
- Link in both: `[[06_NETWORK-SYNC/C2MOVIEZ/Database/03 - Projects/SHI - 3 Month Campaign Apr-Jun 2026|→ Claudio's project brief]]`

## Active Shared Projects (As of 2026-04-17)

| Slug | Client | Status | Claudio Lead | Marcel Role | Folder |
|---|---|---|---|---|---|
| `BOV_2026` | Boviro Security AG | Active | CTI | On-set capture liaison | `01_PROJECTS/C2MOVIEZ/BOV_2026/` |
| `SHI_2026-04` | SHIPSTER AG | 3-mo campaign | CTI + Fanny | On-set capture | `01_PROJECTS/C2MOVIEZ/SHI_2026-04/` |
| `GANZ_2026` | GANZ BOATS AG | Content series | CTI | On-set capture | `01_PROJECTS/C2MOVIEZ/GANZ_2026/` |

Additional projects tracked in Claudio's `03 - Projects/` but not yet requiring on-set work.

## File Locations

| Purpose | Location | Access |
|---|---|---|
| **Raw Claudio vault** | `/Volumes/T7/NUDIMMUD/06_NETWORK-SYNC/C2MOVIEZ/Database/` | Read-only (git-managed) |
| **Mapping** | `/Volumes/T7/NUDIMMUD/06_NETWORK-SYNC/C2MOVIEZ/_MAPPING.md` | This file |
| **Sync status** | `/Volumes/T7/NUDIMMUD/06_NETWORK-SYNC/C2MOVIEZ/_SYNC-STATUS.md` | Sync log |
| **Active projects** | `/Volumes/T7/NUDIMMUD/01_PROJECTS/C2MOVIEZ/` | Main vault (read-write) |

## Sync Protocol

### Push (Marcel → Claudio)
When Marcel completes on-set work for a shared project:
1. Update `01_PROJECTS/C2MOVIEZ/[SLUG]/` with shoot notes, metadata, file handoff
2. Link back: "See Claudio's project: [[06_NETWORK-SYNC/C2MOVIEZ/Database/03 - Projects/...|project name]]"
3. Notify Claudio via external comms (Slack/email) with deliverable location

### Pull (Claudio → Marcel)
When Claudio updates a shared project in his vault:
1. Changes in Database/ are auto-pulled via `git pull` (run weekly or on-demand)
2. Marcel reads Claudio's updates for context (new client notes, changed deadlines, scope updates)
3. No manual copying — Database/ is read-only reference

### Conflict Resolution
- **Marcel owns**: on-set capture details, shoot notes, technical metadata, file delivery status
- **Claudio owns**: client relationships, billing, project scope, timeline
- If conflict: ask before overwriting; sync via external communication first

## Notes

- Database/ is read-only: never edit files inside this folder directly
- All active project work happens in `01_PROJECTS/C2MOVIEZ/`
- Use Database/ as reference layer only
- Run `git pull origin main` in Database/ weekly to stay current with Claudio's updates
