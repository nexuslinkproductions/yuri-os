# YURI Public Release — Phase 8 Invite Repo Prep

**Date:** 2026-06-29  
**Label:** `08_INVITE_REPO_READY_X_PASS_COMMITTED`

---

## Owner checklist (before first invite)

- [ ] Review all phase reports `YURI_PUBLIC_RELEASE_0*.md`
- [ ] Confirm packaging-check green on fresh export
- [ ] Create **private** GitHub repo (e.g. `nexuslinkproductions/YURI-core-invite`)
- [ ] Push export artifact only:

```bash
node _SYSTEM/Scripts/yuri-export.mjs --out /tmp/yuri-core-export --apply
node _SYSTEM/Scripts/packaging-check.mjs --export-dir /tmp/yuri-core-export
cd /tmp/yuri-core-export && git init && git add . && git commit -m "YURI Core invite v1"
git remote add origin git@github.com:nexuslinkproductions/YURI-core-invite.git
git push -u origin main
```

- [ ] Invite adopters individually (GitHub invite list)
- [ ] Share `02_RESOURCES/GUIDES/yuri-first-30-minutes.md` as onboarding link

## First-adopter arm ceremony (owner-present)

1. Adopter runs DISARMED demo (`mure.mjs --demo`)
2. Owner confirms they understand cost surfaces
3. Adopter arms only the lanes they have keys for
4. Run one bounded task; disarm after
5. Optional: ingest + train router on their run

## Release tag suggestion

`v1.0.0-invite` — "YURI Core: deterministic exoskeleton + curated research DB"

## What stays private

This monorepo (`YURI-OS-MUSUBI`) — full operator workspace, NEXUS product, campaigns, memory, projects.

## Evidence chain complete

| Phase | Label |
|-------|-------|
| 0 | `00_SCOPE_LOCKED_X_PASS_COMMITTED` |
| 1 | `01_CENSUS_X_PASS_COMMITTED` |
| 2 | `02_DEHARDEN_X_PASS_COMMITTED` |
| 3 | `03_CARVE_HARNESS_X_PASS_COMMITTED` |
| 4 | `04_PUBLIC_SURFACE_X_PASS_COMMITTED` |
| 5 | `05_MLP_FLEET_ADOPT_X_PASS_COMMITTED` |
| 6 | `06_CURATED_DB_X_PASS_COMMITTED` |
| 7 | `07_VERIFIED_EXPORT_X_PASS_COMMITTED` |
| 8 | `08_INVITE_REPO_READY_X_PASS_COMMITTED` |

**Status:** Ready for owner to create invite repo and send first invites.
