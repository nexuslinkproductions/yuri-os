# C2MOVIEZ — Sync Status

**Last updated:** 2026-04-17
**Status:** LIVE — integrated & ready for bidirectional sync

## Partner
- **Company:** c2moviez GmbH
- **Contact:** Claudio Tinner
- **Location:** Wetzikon ZH, Switzerland
- **CHE:** CHE-158.073.494

## Sync Protocol
1. Claudio exports his project filesystem structure
2. Marcel creates _MAPPING.md (Claudio paths → NUDIMMUD paths)
3. Shared project files go in Database/ (read-only reference)
4. Active shared projects tracked in Shared-Projects/

## Active Projects (via C2MOVIEZ pipeline)
| Client | Status | Folder |
|--------|--------|--------|
| ANGELIKA | Active | 01_PROJECTS/C2MOVIEZ/ANGELIKA/ |
| MUDI | Active | 01_PROJECTS/C2MOVIEZ/MUDI/ |
| BOVIRO | Active | 01_PROJECTS/C2MOVIEZ/BOVIRO/ |
| CHEESE DOCTOR | Active | 01_PROJECTS/C2MOVIEZ/CHEESE-DOCTOR/ |
| SHIPSTER | Active | 01_PROJECTS/C2MOVIEZ/SHIPSTER/ |
| OREA | Active | 01_PROJECTS/C2MOVIEZ/OREA/ |
| SAMPLE | Active | 01_PROJECTS/C2MOVIEZ/SAMPLE/ |

## Sync Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-04-17 | Integration complete | Cloned c2moviez-vault (GitHub), created _MAPPING.md, 18 folders indexed |
| 2026-04-17 | Graphify indexed | Knowledge graph updated with c2moviez clients, projects, team, processes |
| 2026-04-13 | File created | Awaiting Claudio's export |
