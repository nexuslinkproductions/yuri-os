# YURI Public Release — Phase 2 Sanitize

**Date:** 2026-06-29  
**Label:** `02_DEHARDEN_X_PASS_COMMITTED`

---

## Changes Applied

| Item | Action |
|------|--------|
| `.gitignore` | Added `.claude/memory/`, `_SYSTEM/persona.md`, `health.json`, `campaigns/`, `00_COMMAND-CENTER/`, `01_PROJECTS/`, NEXUS product trees, MLP weights/ledger |
| `.claude/settings.json` | Marketplace path → `${HOME}/.npm/...` |
| `prediction-ledger.mjs` | Persist `features` on predictions |
| `ingest-audit-trace.mjs` | Generic `--job-dir` support |

## Remaining (export-time, not private-tree mass edit)

- 269 tracked files still contain `marcelspatz` — addressed by `yuri-export.mjs` scrub at export boundary
- `health.json` / `persona.md` still tracked historically — gitignore prevents new commits; export excludes them
- Owner optional: `git rm --cached` on memory/persona/health when ready

## Verification

```bash
git grep -l marcelspatz .claude/settings.json  # should be 0 after fix
grep '\.claude/memory' .gitignore             # present
```
