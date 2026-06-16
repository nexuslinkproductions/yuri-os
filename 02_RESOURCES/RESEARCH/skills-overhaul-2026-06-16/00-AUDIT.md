# WS4 Phase 0 — Skill-Architecture Audit (2026-06-16)

Evidence-grounded audit of YURI's skill system. **The owner's complaint ("we haven't been using skills much") has a mechanical root cause, and the approved plan's premise ("port missing daily-driver skills") is largely wrong — they're already imported but stranded.**

## The three-root reality (not two)

| Root | Count | Role (evidenced) |
|------|-------|------|
| `skills/` | 99 SKILL.md (+102 entries incl. README/json) | **Canonical source** — `yuri-skill-loader.mjs` DISCOVERY_PATHS lists it FIRST (precedence), sourceType `yuri_skill`. Holds `domain-index.json` + `skill-index.json`. |
| `.claude/skills/` | 64 | **The harness surface** — `startup-offload.js:5` loads `SKILLS_DIR = .claude/skills` ONLY; this is what the Skill tool lists at session start. A drifted SUBSET. |
| `.agents/skills/` | 55 | **Orphan/legacy** — NOT in the loader's DISCOVERY_PATHS. Referenced by `yuri-agent-index` / `regenerative-nexus-guard` (role to confirm). Drifted copy. |

Totals: 218 SKILL.md dirs across roots; 24 skills triplicated across all three; 40 are already multi-file kits.

## Root cause of "we don't use skills"
- The harness Skill tool surfaces **only `.claude/skills/`** (`startup-offload.js`).
- The good daily-driver skills live in **`skills/`** and were never mirrored into `.claude/skills/`.
- **Therefore they are mechanically un-invokable.** Not a discipline problem — a routing/location problem.

## Matt Pocock's skills are ALREADY imported (into `skills/`)
PRESENT in `skills/`: `diagnose`, `grill-me`, `grill-with-docs`, `improve-codebase-architecture`, `setup-matt-pocock-skills`, `tdd`, `to-issues`, `to-prd`, `triage`, `zoom-out`, `caveman`, `write-a-skill`, `skill-creator`, `skill-installer` (multi-file kits, <150 lines, Pocock structure). A prior session ran `skill-installer` / `setup-matt-pocock-skills`.
ABSENT (only 3): `prototype`, `handoff`, `teach`.
**None of the PRESENT ones are in `.claude/skills/`** → none are invokable. The plan's "port these" is moot; the work is **surface + consolidate**, not port.

## Drift is real (independent copies, not symlinks)
`sharingan` across roots: `skills/` 692 lines md5 `3310…`, `.claude/skills/` 679 lines md5 `edb2…`, `.agents/skills/` 692 lines md5 `ad7a…` — three divergent copies. 24 skills triplicated this way → 3× maintenance, silent drift.

## Other gaps
- **24 orphan commands** in `.claude/commands/` with no `skill:` frontmatter (no Skill-tool dispatch): incl. `xref`, `qsim`, `quantum-sim`, `spec-*`, `gitnexus-*`, `pdc`, `research`, `reflect`, `design`, `constitution`, `end-of-transmission`, `plan-review`, `probabilistic-decision-core`.
- **8 `organ-*` skills** unregistered in `skill-hash-registry.json` → health gate FAIL.
- Bloated skills (>150 lines): 82 instances (many are duplicates). Worst: `graphify` 1349, `end-of-transmission` 1119, `sharingan` 692, `writing-skills` 681/655.

## Corrected WS4 scope (vs approved plan)
1. **Phase 1 (was consolidation) is now the headline**: `skills/` = source of truth → generate/sync `.claude/skills/` (the harness root) from it, surfacing the stranded daily-drivers → kill 3-way drift with a generator → decide `.agents/skills/` fate.
2. **Phase 3 collapses**: only `prototype`, `handoff`, `teach` are genuinely missing; the rest is surfacing.
3. Phases 2 (kit patterns — partly already present) and 4 (dispatch/CSO + orphan commands) hold.
4. Capability-first: reuse `yuri-skill-loader.mjs` (`--write-manifest`, `--validate`) + `create-missing-commands.mjs`; do NOT build a new registry.

## Blast / safety note
The consolidation mutates `.claude/skills/` = what the harness loads EVERY session + parallel sessions share. Additive surfacing of new (non-colliding) daily-driver skills is low-blast/reversible. Drift-resolution of the 24 triplicated skills + deleting/retiring a whole root + the auto-sync generator are MEDIUM-blast → owner-gated design call.
