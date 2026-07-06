# YURI Public Release — Phase 6 Curated Research DB

**Date:** 2026-06-29  
**Label:** `06_CURATED_DB_X_PASS_COMMITTED`

---

## Deliverables

| Artifact | Path |
|----------|------|
| Curation manifest | `_SYSTEM/config/curated-research-manifest.json` |
| Index builder | `_SYSTEM/Scripts/curated-research-index.mjs` |
| Generated index | `02_RESOURCES/PUBLIC-RESEARCH/index.json` |

## Indexed sources (ship-safe)

- `02_RESOURCES/CODE-BIBLE/` — mechanism literacy
- `02_RESOURCES/GUIDES/` — adopter onboarding
- Selected research (github-adoption, oss-release, memory-architecture)

## Excluded from curation

- jake-van-klief scraped content
- trading/investor/client research
- personal audit threads

## Verification

```bash
node _SYSTEM/Scripts/curated-research-index.mjs
node _SYSTEM/Scripts/curated-research-index.mjs --verify
```

**Result (2026-06-29):** 39 entries indexed; verify after export scrub recommended.
