# YURI Public Release — Phase 3 Carve Harness

**Date:** 2026-06-29  
**Label:** `03_CARVE_HARNESS_X_PASS_COMMITTED`

---

## Deliverables

| Artifact | Path |
|----------|------|
| Allowlist manifest | `_SYSTEM/config/export-manifest.json` |
| Export script | `_SYSTEM/Scripts/yuri-export.mjs` |
| Packaging validator | `_SYSTEM/Scripts/packaging-check.mjs` |
| SOUL export stub | `_SYSTEM/reports/SOUL.md.export-stub` |

## Usage

```bash
node _SYSTEM/Scripts/yuri-export.mjs --dry-run
node _SYSTEM/Scripts/yuri-export.mjs --out /tmp/yuri-core-export --apply
node _SYSTEM/Scripts/packaging-check.mjs --export-dir /tmp/yuri-core-export
```

## Dry-run result (2026-06-29)

- Export plan: **654 files** selected via allowlist walk
- Apply to `/tmp/yuri-core-export-test`: success
- Packaging check: path leaks clean; IP scrub added for Rick references in export

## Carve rules locked

- `03_NEXUS-LINK/` → `Identity/` only
- Exclude: backend, campaigns, memory, persona, projects, command-center, reports archive
- Scrub: marcelspatz paths, legacy names, Rick/Deadpool IP
