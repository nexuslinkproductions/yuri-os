# YURI Public Release — Phase 5 MLP / Fleet

**Date:** 2026-06-29  
**Label:** `05_MLP_FLEET_ADOPT_X_PASS_COMMITTED`

---

## Deliverables

| Change | Path |
|--------|------|
| Features persisted in ledger | `_SYSTEM/Scripts/prediction-ledger.mjs` |
| Multi-candidate conditioning | `_SYSTEM/Scripts/fleet-router-mlp.mjs` |
| Tri-substrate conductor | `_SYSTEM/Scripts/runFleet.mjs` |
| Generic job ingest | `_SYSTEM/Scripts/ingest-audit-trace.mjs --job-dir` |
| Adopter guide | `02_RESOURCES/GUIDES/fleet-router-adopter-guide.md` |
| Weights/ledger gitignored | `.gitignore` |

## Adopter posture

- **Default:** DISARMED; router advisory only
- **Advanced:** ingest → train → inspect weights locally
- **No auto lane override** this release

## Commands

```bash
node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run
node _SYSTEM/Scripts/fleet-router-mlp.mjs --demo
node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs --epochs=4
```
