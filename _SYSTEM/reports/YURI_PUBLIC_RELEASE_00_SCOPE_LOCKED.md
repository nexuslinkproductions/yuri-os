# YURI Public Invite-Only Release — Scope Lock

**Status:** LOCKED  
**Date:** 2026-06-29  
**Authority:** Owner directive + master plan via MURE Company  
**Label:** `00_SCOPE_LOCKED_X_PASS_COMMITTED`

---

## Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Public surface | **Slim YURI Core** (exoskeleton + curated research DB) | Per `_SYSTEM/reports/YURI_RELEASE_SPEC_2026-06-09.md` — allowlist export, not full private tree |
| Distribution | **Private GitHub repo + explicit invite list** | No public GitHub initially; controlled adoption |
| MLP / fleet bar | **Advisory + DISARMED planning works on clone** | Router suggestions + dry-run MURE demo; live dispatch requires user keys + explicit arm; no auto lane override this release |
| Execution model | **Non-destructive carve on export branch/worktree** | Private monorepo stays intact; export harness materializes clean tree |
| Priority order | Census → Sanitize → Carve → Public docs → MLP docs → Curated DB → Verify → Invite | Evidence before export |

---

## Goal Tree

```
YURI Invite-Only User Repo Ready
├── Phase 1: Full census & leak inventory (read-only)
├── Phase 2: Sanitize & de-hardcode (private tree hygiene)
├── Phase 3: Export carve harness (allowlist + packaging-check)
├── Phase 4: Public onboarding surface (README, INSTALL, GEMINI, arming)
├── Phase 5: MLP / fleet adoption hardening
├── Phase 6: Curated research DB
├── Phase 7: Packaging + adversarial verification
└── Phase 8: Owner final + invite repo prep
```

---

## MURE Task Packets

| Phase | Task file | Primary roles |
|-------|-----------|---------------|
| 1 | `02_RESOURCES/TASKS/yuri-public-release-phase1-census.json` | sentinel, scout, artificer, adjudicator (+ ollama sidecar) |
| 2 | `02_RESOURCES/TASKS/yuri-public-release-phase2-sanitize.json` | engineer, mechanic, kernelsmith, sentinel |
| 3 | `02_RESOURCES/TASKS/yuri-public-release-phase3-carve.json` | architect, chronicler, engineer, artificer |
| 4 | `02_RESOURCES/TASKS/yuri-public-release-phase4-public-surface.json` | chronicler, envoy, architect, steward |
| 5 | `02_RESOURCES/TASKS/yuri-public-release-phase5-mlp-fleet.json` | kernelsmith, adjudicator, calibrator, chronicler |
| 6 | `02_RESOURCES/TASKS/yuri-public-release-phase6-curated-db.json` | archivist, synthesist, scout, chronicler |
| 7 | `02_RESOURCES/TASKS/yuri-public-release-phase7-verify.json` | adjudicator, oracle, sentinel, calibrator, quartermaster |
| 8 | `02_RESOURCES/TASKS/yuri-public-release-phase8-invite.json` | helmsman, steward, chronicler |

---

## Export Boundary (from release spec)

**INCLUDE:** hooks, core `_SYSTEM/Scripts/`, yuri-origin, scrubbed SOUL, persona.template, adapters, LICENSE, SECURITY, INSTALL, yuri-init, curated research DB.

**EXCLUDE:** `_SYSTEM/backend/`, `_SYSTEM/persona.md`, `.claude/memory/`, `_SYSTEM/campaigns/`, `01_PROJECTS/`, `00_COMMAND-CENTER/`, `03_NEXUS-LINK/` (except `Identity/`), bug-bounty, private DBs, most `_SYSTEM/reports/`, `04_ARCHIVE/`, Rick/Deadpool persona surfaces.

---

## Arming Policy for This Operation

- All census/verify lanes: **read-only**, no arm required for local execution
- GLM/Ollama live lanes: owner arm only after dry-run plan review
- No autonomous commit/push to invite repo without Phase 7 verdict + owner confirm

---

## Success Criteria (unchanged from master plan)

- Zero personal paths / secrets / IP in export artifact
- `03_NEXUS-LINK` → `Identity/` only in export
- Clone + `yuri-init.sh --dry` + `mure.mjs --demo` works for stranger
- Curated DB FTS5-indexed and leak-free
- Full evidence chain committed with RESULT_LABELs
