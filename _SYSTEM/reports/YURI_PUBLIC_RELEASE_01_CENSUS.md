# YURI Public Release — Phase 1 Census

**Date:** 2026-06-29  
**Labels:** `01R1_IP_SECRET_CENSUS_X_PASS_COMMITTED`, `01R2_TELEMETRY_LEAK_X_PASS_COMMITTED`, `01V1_ADVERSARIAL_GAP_X_PASS_COMMITTED`, `01N1_CROSS_VERIFY_X_PASS_COMMITTED`, `01_CENSUS_X_PASS_COMMITTED`

---

## Summary

| Metric | Count |
|--------|-------|
| Tracked files (total) | 3,899 |
| Tracked `.claude/memory/` files | 293 |
| Tracked files with `marcelspatz` | 269 |
| Tracked `03_NEXUS-LINK/` (non-Identity product) | 48 of 56 |
| Tracked `_SYSTEM/persona.md` | 1 (Rick overlay — do not ship) |
| Tracked `_SYSTEM/monitoring/health.json` | 1 (absolute paths) |

**Verdict:** **NOT SAFE TO EXPORT AS-IS.** Blockers require carve + scrub + gitignore expansion.

---

## R1 — IP / Secret / PII Census

| Category | Sample paths | Classification |
|----------|--------------|----------------|
| Rick/Morty/Deadpool IP | `_SYSTEM/persona.md`, `_SYSTEM/Scripts/voice/yuri-voice-brain.md`, `skills/extraction-sprint/SKILL.md`, `.claude/memory/*rick*` | **BLOCKER** (export scrub) |
| Operator persona | `_SYSTEM/persona.md` | **BLOCKER** (exclude; ship `persona.template.md`) |
| Track B memory | `.claude/memory/` (293 files) | **BLOCKER** (exclude entire tree) |
| Backend personality refs | `_SYSTEM/backend/src/services/personalityService.ts` | **EXCLUDE** (product layer) |

---

## R2 — Telemetry / State Leak Census

| Path | Issue | Classification |
|------|-------|----------------|
| `_SYSTEM/monitoring/health.json` | Absolute `/Users/marcelspatz/...` paths | **BLOCKER** |
| `.claude/settings.json` | Hardcoded npx plugin path L365 | **BLOCKER** |
| `.claude/memory/` | Operator session memory tracked | **BLOCKER** |
| `_SYSTEM/campaigns/` | Acquisition playbooks (if tracked) | **BLOCKER** |
| `00_COMMAND-CENTER/` | Session reports, daily notes | **BLOCKER** |
| `01_PROJECTS/` | Client CAD, pitches, monetization | **BLOCKER** |
| `03_NEXUS-LINK/nexus-engine/` | Product scoring engine | **EXCLUDE** |
| `03_NEXUS-LINK/nexus-app/` | CRM product (if present) | **EXCLUDE** |
| `03_NEXUS-LINK/business/` | Confidential GTM | **EXCLUDE** (gitignored bug-bounty only) |

**Safe in export:** `03_NEXUS-LINK/Identity/` (neutral SVG wordmarks).

---

## V1 — Adversarial Gaps

| Gap | Risk | Remediation |
|-----|------|-------------|
| `.gitignore` missing `.claude/memory/` | Future commits leak memory | Phase 2: expand gitignore |
| 269 path-leak files in tracked tree | Broken clone on other machines | Export scrub + W1 de-hardcode priority files |
| No export harness shipped | Manual export error-prone | Phase 3: `yuri-export.mjs` + `packaging-check.mjs` |
| Git history may contain deleted secrets | History leak | Fresh export repo OR filter-repo before invite |
| `Bash(*)` in settings.json | Over-broad permissions for adopters | Document in SECURITY; export uses scrubbed template |
| MLP weights not in .gitignore | Local weights could leak | Add `fleet-router-weights.json` to gitignore |

---

## N1 — Cross-Verify Verdict Table

| ID | Finding | Verdict | Remediation |
|----|---------|---------|-------------|
| N1-01 | 293 tracked memory files | **BLOCKER** | gitignore + export exclude |
| N1-02 | persona.md Rick overlay | **BLOCKER** | export exclude; seed template only |
| N1-03 | health.json paths | **BLOCKER** | gitignore; regenerate locally |
| N1-04 | 03_NEXUS-LINK product trees | **BLOCKER** | export: Identity/ only |
| N1-05 | 01_PROJECTS client work | **BLOCKER** | export exclude |
| N1-06 | 269 marcelspatz path refs | **BLOCKER** | export scrub script |
| N1-07 | Rick IP in skills | **BLOCKER** | export name scrub |
| N1-08 | DISARMED defaults | **SAFE** | ship as-is |
| N1-09 | yuri-init + INSTALL | **SAFE** | ship with Phase 4 updates |
| N1-10 | LICENSE + SECURITY | **SAFE** | ship |

---

## Held Remediation List (owner-gated execution)

1. Expand `.gitignore` for memory, persona, health, campaigns, command-center, projects
2. Fix `.claude/settings.json` marketplace path → env-relative
3. Build export manifest + packaging-check (Phase 3)
4. Run export dry-run before any invite repo push
5. Consider `git filter-repo` if history contains secrets (manual owner decision)
