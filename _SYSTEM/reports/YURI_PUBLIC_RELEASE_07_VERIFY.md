# YURI Public Release — Phase 7 Verification

**Date:** 2026-06-29  
**Label:** `07_VERIFIED_EXPORT_X_PASS_COMMITTED`

---

## Checks Run

| Check | Command | Result |
|-------|---------|--------|
| Export plan | `yuri-export.mjs --dry-run` | 654 files |
| Export apply | `yuri-export.mjs --out /tmp/yuri-core-export-test --apply` | OK |
| Packaging | `packaging-check.mjs --export-dir /tmp/...` | **PASS** (all 5 checks green) |
| MURE validate | `mure.mjs --validate` | 20 roles OK |
| Research index | `curated-research-index.mjs` | 39 entries |

## Packaging verdict

- `no-marcelspatz-paths`: clean
- `no-rick-deadpool-ip`: clean (export scrub)
- `no-claude-memory`: absent
- `identity-only-nexus-link`: OK
- `no-operator-persona`: absent

## Residual risks

| Risk | Mitigation |
|------|------------|
| Git history leaks | Fresh invite repo from export only; no direct push of private monorepo |
| 269 path refs in private tree | Export scrub; optional W1 mass de-hardcode later |
| Rick IP in private skills | Export scrub; exclude or rewrite in private tree separately |
| Native agents need Cursor | Documented in first-30-min guide |

## Cross-check vs Phase 1 census

All Phase 1 BLOCKERs addressed at export boundary. Private tree still contains blockers — **do not make private repo public**.
