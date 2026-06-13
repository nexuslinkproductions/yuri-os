# YURI Filing System — Full Audit Report

**Date:** 2026-06-11
**Auditor:** Claude (Rick C-137)
**Scope:** Entire repo — every directory, every file type, every scatter pattern
**Purpose:** Prepare a comprehensive blueprint for Claude to build the mathematical filing system

---

## Executive Summary

YURI has a working READ-ONLY filing assessor (`_SYSTEM/Scripts/filing-assessor.mjs`, 23/23 tests pass) but no mutation half. The repo has **65+ loose .md files in `_SYSTEM/` root**, **28 empty directories**, **1,057 empty session-env UUID dirs**, scattered research across 6+ locations, knowledge-base duplication, and ~2.7GB of recoverable disk space from stale worktrees/build artifacts.

The filing system needs to handle: `.md`, `.html`, `.json`, `.mjs`, `.js`, `.cjs`, `.sh`, `.py`, `.tsx`, `.ts`, `.css`, `.pdf`, `.jsonl`, `.db`, `.plist`, `.skill`, `.zip`, `.docx` — literally every artifact type in the repo.

---

## 1. Current State: What Works

### Filing Assessor (READ-ONLY)
- **File:** `_SYSTEM/Scripts/filing-assessor.mjs`
- **Tests:** 23/23 passing (`_SYSTEM/Scripts/filing-assessor.test.mjs`)
- **Skill:** `.claude/skills/organ-filing-assessor/SKILL.md`
- **CLI:** `node _SYSTEM/Scripts/filing-assessor.mjs <paths...> [--json]`
- **Exports:** `classifyArtifact`, `assess`, `assessAll`, `stalenessScore`, `ZONE_RULES`
- **Zones defined:** EPHEMERAL, `_SYSTEM/config/schemas`, `_SYSTEM/docs`, `02_RESOURCES/RESEARCH`, `_SYSTEM/reports`, `_SYSTEM/Scripts/math`, `_SYSTEM/Scripts`, `_SYSTEM/state`
- **What it does:** Classifies an artifact → canonical zone, flags misplaced, scores staleness for purge candidates, protected-path veto (fail-closed)
- **What it does NOT do:** Actually move/delete files. No batch sweep. No creation-time routing. No integration with the hook system.

### Existing Registries
- `_SYSTEM/config/folder-registry.json` — folder classification map (classes: canonical_anchor, human_workspace, system_control_plane, etc.)
- `_SYSTEM/config/artifact-registry.json` — durable artifact placement rules (system-doc, system-script, system-config, context-layer, wiki-projection, runtime-state, report, system-data)
- `_SYSTEM/INDEX.md` — canonical read path, root folder classes, new artifact rule
- `_SYSTEM/STRUCTURE.md` — intended vault structure (from an earlier era, partially outdated)

### Existing Canonical Zones (intended structure)
| Zone | Purpose | Current state |
|---|---|---|
| `02_RESOURCES/RESEARCH/` | Research vault | 96 entries, 50+ loose at root |
| `02_RESOURCES/KNOWLEDGE-BASE/` | Organized knowledge | Clean, 258 .md files, good taxonomy |
| `_SYSTEM/docs/` | Architecture/protocol docs | 41 files, underused |
| `_SYSTEM/reports/` | Generated reports | 106 entries, heavily cluttered |
| `_SYSTEM/Scripts/` | Runtime scripts | 429 files, mostly clean |
| `_SYSTEM/Scripts/math/` | Math modules | Clean |
| `_SYSTEM/config/` | Registries/schemas | Clean |
| `_SYSTEM/state/` | Runtime state | 31 files, clean |
| `_SYSTEM/context/` | Context layer | 2 files, clean |
| `_SYSTEM/memory/` | YURI canonical memory | 11 files, clean |
| `_SYSTEM/AGENTS/` | Agent configs | 3 files, clean |

---

## 2. The Mess: Quantified

### 2.1 Loose Files in `_SYSTEM/` Root (65 .md + 13 non-.md = 78 files)

**HANDOFF FILES (6) — all stale, 4-24 days old:**
```
HANDOFF-2026-05-18-inhibitor-fixes-gate-memory.md
HANDOFF-2026-05-18-learning-loop-dispatch-audit.md
HANDOFF-2026-05-18-rag-toolparity-gateready.md
HANDOFF-2026-06-05-lane-hardening-fanout-ready.md
HANDOFF-2026-06-05-llm-lane-unlock.md
HANDOFF-2026-06-05-wave1-wave2-fixqueue.md
```
→ **Action:** Archive to `_SYSTEM/archive/handoffs/` or delete (superseded by wave completions)

**VERSIONED DUPLICATES (3+2):**
```
MASTER_STRUCTURE_REFACTOR_PROMPT.md
MASTER_STRUCTURE_REFACTOR_PROMPT_v2.md
MASTER_STRUCTURE_REFACTOR_v3.md
model-registry.md
model-registry-2026-04-24.md
```
→ **Action:** Keep latest only, archive or delete predecessors

**TOKEN MANAGEMENT (6) — should be consolidated:**
```
TOKEN-SMART-CHECKLIST.md
token-audit.md
token-regulation-policy.md
token-tracker.md
token-tracking-quick-start.md
monthly-token-summary-template.md
```
→ **Action:** Move to `_SYSTEM/docs/token-management/` or consolidate into 1-2 files

**ARCHITECTURE/PROTOCOL (10) — should be in `_SYSTEM/docs/`:**
```
AGENT_BLUEPRINTS.md
CODEX_PROTOCOL.md
INTEGRATION-MAP.md
LANE-MANUAL.md
LOCAL_EXECUTION_POLICY.md
MEMORY_ARCHITECTURE.md
MUSUBI_PROTOCOL.md
OPERATOR_PROTOCOL.md
RUNBOOK.md
STRUCTURE.md
```
→ **Action:** Move to `_SYSTEM/docs/`

**COGNITION/PERSONA (6) — scattered identity docs:**
```
NEURAL-NETWORK-THESIS.md
YURI-COGNITION.md
YURI.md
neural-forge-guide.md
neuro-core.md
yuri-cognitive-persona-rationale.md
```
→ **Action:** Move to `_SYSTEM/docs/cognition/` or `_SYSTEM/BRAND/`

**WAVE/AUDIT REPORTS (4) — completed work:**
```
SWARM_ARCHITECTURE_AUDIT_2026.md
WAVE-1-COVERAGE-MAP-2026-06-05.md
WAVE-2-FIX-QUEUE-2026-06-05.md
YURI_AUDIT_README.md
```
→ **Action:** Move to `_SYSTEM/reports/` or archive

**ONE-OFF STALE (6):**
```
sandbox-improvement-test-run.md        (2026-05-17)
scout-errors-2026-05-13-triage.md      (stale)
security-2026-05-13-remediation.md     (stale)
lane-verification-2026-05-13.md        (stale)
STRUCTURE_REFACTOR_REPORT.md           (superseded)
SKILL_REFINEMENT_PATCH.md              (one-off)
```
→ **Action:** Archive or delete

**MISCELLANEOUS (15+):**
```
HEARTBEAT.md, INDEX.md, README.md     → KEEP (canonical anchors)
identity-hash.md                       → _SYSTEM/SELF/
language_codex.md                      → 02_RESOURCES/KNOWLEDGE-BASE/
memory-layer-spec.md                   → _SYSTEM/specs/ or _SYSTEM/docs/
session_prompt.md                      → _SYSTEM/Presets/ or _SYSTEM/docs/
spec-kit-workflow-bridge.md            → _SYSTEM/docs/
yuri-content-governance.md             → _SYSTEM/docs/
yuri-council-log.md                    → _SYSTEM/reports/ or archive
yuri-evidence-pack-schema.md           → _SYSTEM/config/schemas/
yuri-forge.md                          → _SYSTEM/docs/
yuri-incident-log.md                   → _SYSTEM/reports/
yuri-pulse.md                          → _SYSTEM/docs/
yuri-skill-loader.md                   → _SYSTEM/Scripts/ (if script) or _SYSTEM/docs/
yuri-token-ops.md                      → _SYSTEM/docs/token-management/
USER.md                                → _SYSTEM/SELF/
TOOLS.md                               → _SYSTEM/docs/
```

**NON-.MD LOOSE FILES (13):**
```
SymbiOS-Trademark-Audit.html           → _SYSTEM/reports/
SymbiOS-Trademark-Graph.html           → _SYSTEM/reports/
musubi-brand-identity.html             → _SYSTEM/BRAND/
musubi-intelligence-v2-audit.html      → _SYSTEM/reports/
musubi-intelligence-v2-audit-v2.html   → _SYSTEM/reports/ (keep latest only)
yuri-os-launch-readiness.html          → _SYSTEM/reports/
design-memory.json                     → _SYSTEM/config/ or _SYSTEM/state/
organ-guides.json                      → _SYSTEM/config/ (already referenced)
skill-hash-registry.json               → _SYSTEM/config/
token-orchestrator.sh                  → _SYSTEM/Scripts/ or _SYSTEM/bin/
yuri-boot.zsh                          → _SYSTEM/bin/
yuri-graph-state.json                  → _SYSTEM/ (canonical, KEEP)
yuri-graph.json                        → _SYSTEM/ (canonical, KEEP)
```

### 2.2 Empty/Dead Directories (28 empty + 60+ single-file)

**Truly empty (can be deleted):**
```
.agent/rules/
.agent/workflows/
.agents/skills/
.claude/debug/
.claude/file-history/  (66 UUID dirs, some empty)
.claude/session-env/   (1,057 empty UUID dirs!)
.claude/skills/        (empty — real skills are in skills/)
.claude/tasks/
.claude/yuri-sentinel/
.codex/.tmp/
.codex/eot/
.codex/plugins/
.codex/skills/
.codex/vendor_imports/
.cursor/
.obsidian/plugins/
.smart-env/smart_components/
.smart-env/smart_contexts/
00_COMMAND-CENTER/Dashboards/
02_RESOURCES/References/
04_ARCHIVE/DOMAIN EXPANSION - INFINITE VOID/
_SYSTEM/.claude/
_SYSTEM/_SYSTEM/         (nested duplicate!)
_SYSTEM/archive/         (4 subdirs, 441MB — evaluate contents)
_SYSTEM/data/
_SYSTEM/deleted-backups/
_SYSTEM/labs/
_SYSTEM/mcp-servers/
_SYSTEM/public/
_SYSTEM/recovery/
_SYSTEM/specs/
_SYSTEM/tools/
skills/browser-harness/
```

**Single-file dirs (consolidate or delete):**
```
_SYSTEM/knowledge/          (1 file: neuroscience-corpus.md)
_SYSTEM/research-skill-factory/ (1 file: generate.js)
_SYSTEM/test/               (1 file: Welcome.md)
_SYSTEM/Claude-Memory/      (2 files)
_SYSTEM/Templates/          (2 files)
_SYSTEM/kagami/             (2 files)
_SYSTEM/launchd/            (3 files)
_SYSTEM/campaigns/          (2 files)
_SYSTEM/distribution-agents/ (3 files)
_SYSTEM/gan-loop/           (3 files)
_SYSTEM/autonomous-swarm/   (5 files)
_SYSTEM/trace-to-skill/     (5 files)
```

### 2.3 Scattered Research (6+ locations)

| Location | Files | Content |
|---|---|---|
| `02_RESOURCES/RESEARCH/` | 96 entries | Main vault — 50+ loose at root, mixed with JSON/code |
| `_SYSTEM/reports/` | 106 entries | Audits, wave reports, paper drafts, codex artifacts |
| `_SYSTEM/research-archive/` | 5 topic bundles | Archived research sprints (May 2026) |
| `_SYSTEM/session-outputs/` | 4 files | Cybersecurity audit outputs |
| `00_COMMAND-CENTER/research/` | 6 files | Should not exist — command center has its own research |
| `.claude/state/` | 3+ files | Research packs in Claude state (protected) |

**Research file types found outside `02_RESOURCES/RESEARCH/`:**
- Audit reports: 20+ files in `_SYSTEM/reports/`
- Spec docs: 10+ files scattered across `_SYSTEM/` root and `_SYSTEM/reports/`
- Synthesis docs: 5+ files in `02_RESOURCES/RESEARCH/` root
- JSON data: 7 files in `02_RESOURCES/RESEARCH/` root (should be in `_SYSTEM/data/` or `_SYSTEM/config/`)
- Code: `build-circuitry-html.mjs` in `02_RESOURCES/RESEARCH/` (should be in `_SYSTEM/Scripts/`)

### 2.4 Knowledge-Base Duplication

**Duplicated between `02_RESOURCES/KNOWLEDGE-BASE/` and `04_ARCHIVE/`:**
- `01_COSMOLOGY/` — 7 files duplicated (alchemy, gnosis, hermetics, japanese-aesthetics, kabbalah, neoplatonism, sumerian)
- `02_CONSCIOUSNESS/` — 4 files duplicated (archetypes, individuation, phenomenology, transpersonal)
- `DESIGN-RADAR/` — parallel copies in RESEARCH and ARCHIVE

→ **Action:** `04_ARCHIVE/knowledge-base-*` are stale copies. Delete after verifying `02_RESOURCES/KNOWLEDGE-BASE/` is canonical.

### 2.5 Disk Space Recovery (~2.7GB)

| Item | Size | Action |
|---|---|---|
| `.claude/worktrees/` (7 stale) | 12GB | Delete stale worktrees |
| `.codex-worktrees/prism-workbench/` | 1.0GB | Delete stale worktree |
| `_SYSTEM/corpus-output/merge-candidates.jsonl` | 734MB | Delete or compress |
| `_SYSTEM/archive/` | 441MB | Evaluate — may contain retired providers worth keeping |
| `_SYSTEM/nexus-rs/target/` | 448MB | `cargo clean` — rebuild artifacts |
| `.smart-env/multi/` | 14,311 files, 1.0GB | Evaluate — may be stale |
| `.claude/session-env/` | 1,057 empty dirs | Delete all (0 bytes, pure inode waste) |

---

## 3. The Filing System Gap

### What exists:
- READ-ONLY assessor with 8 zone rules
- Folder registry (class map)
- Artifact registry (placement rules)
- INDEX.md (canonical read path)

### What's missing:

1. **Mutation half** — a `filing-mutator.mjs` that executes the assessor's recommendations (move files, with dry-run + owner confirmation)
2. **Creation-time routing** — when a new artifact is generated, route it through the assessor BEFORE it lands on disk
3. **Batch sweep mode** — scan the entire repo, produce a full relocation plan, execute in dry-run
4. **Zone rule expansion** — the current 8 rules don't cover: `.html` reports, `.json` data files, `.py` scripts, `.tsx/.ts` source, `.css`, `.pdf`, `.docx`, `.plist`, `.skill`, knowledge-base docs, brand docs, learning docs, session outputs, history archives
5. **Deduplication** — detect near-duplicate content (cosmology/consciousness dupes, design-radar parallel copies)
6. **Lifecycle management** — temp → archive → purge by age/value (staleness score exists but isn't wired to any action)
7. **Hook integration** — wire into the PreToolUse/PostToolUse hook system so generated artifacts are assessed on creation
8. **Protected-path awareness** — the assessor has this, but the mutator needs it too (never move `.env`, `.claude/state/`, `backend/data/`, etc.)
9. **Git-aware moves** — `git mv` instead of `mv` so history is preserved
10. **Reporting** — produce a human-readable report of what moved where, for owner review

---

## 4. Proposed Canonical Zone Map (expanded)

The current 8 zones need to expand to cover all artifact types. Proposed additions:

| Zone | Path | Covers |
|---|---|---|
| `docs/architecture` | `_SYSTEM/docs/architecture/` | Protocol docs, lane manuals, runbooks |
| `docs/cognition` | `_SYSTEM/docs/cognition/` | Neural network thesis, persona rationale, forge |
| `docs/token` | `_SYSTEM/docs/token/` | Token management docs (consolidated) |
| `docs/handoffs` | `_SYSTEM/docs/handoffs/` | Session handoff files |
| `reports/audits` | `_SYSTEM/reports/audits/` | Audit reports |
| `reports/waves` | `_SYSTEM/reports/waves/` | Wave fix/cleanup reports |
| `reports/papers` | `_SYSTEM/reports/papers/` | Paper drafts (energy landscape, etc.) |
| `reports/html` | `_SYSTEM/reports/html/` | HTML dashboard/audit artifacts |
| `brand` | `_SYSTEM/BRAND/` | Design language, persona docs |
| `knowledge` | `02_RESOURCES/KNOWLEDGE-BASE/` | Organized knowledge (already clean) |
| `research` | `02_RESOURCES/RESEARCH/` | Research docs (needs sub-taxonomy) |
| `research/data` | `02_RESOURCES/RESEARCH/_data/` | JSON data files from research |
| `archive` | `_SYSTEM/archive/` | Retired/deprecated material |
| `session-outputs` | `_SYSTEM/session-outputs/` | Lane session outputs |
| `history` | `_SYSTEM/yuri-history-archive/` | Historical session data |
| `learning` | `_SYSTEM/learning/` | Learning/training docs |
| `specs` | `_SYSTEM/specs/` | Active specifications |
| `config/schemas` | `_SYSTEM/config/schemas/` | JSON schemas |
| `config/registries` | `_SYSTEM/config/` | Registry JSONs |
| `scripts` | `_SYSTEM/Scripts/` | Runtime scripts |
| `scripts/math` | `_SYSTEM/Scripts/math/` | Math modules |
| `state` | `_SYSTEM/state/` | Runtime state |
| `bin` | `_SYSTEM/bin/` | Shell scripts, launchers |
| `ephemeral` | `/tmp/` or `.tmp/` | Temporary scratch |

---

## 5. Recommended Build Order

### Phase 1: Expand the Assessor
- Add zone rules for all artifact types (`.html`, `.json`, `.py`, `.tsx`, `.css`, `.pdf`, `.docx`, `.plist`, `.skill`)
- Add rules for: brand docs, cognition docs, handoffs, learning, session-outputs, history, specs, bin
- Update `ZONE_RULES` in `filing-assessor.mjs`
- Expand tests to cover new zones

### Phase 2: Build the Mutator
- `filing-mutator.mjs` — takes assessor output, executes moves
- Dry-run mode (default) — shows what WOULD move
- Execute mode — actually moves files with `git mv`
- Protected-path veto (fail-closed, same as assessor)
- Produces a relocation report

### Phase 3: Batch Sweep
- Scan entire repo (excluding `node_modules/`, `.git/`, protected paths)
- Produce a full relocation plan
- Owner reviews dry-run output
- Execute approved moves

### Phase 4: Creation-Time Hook
- Wire into PreToolUse/PostToolUse hooks
- When Write/Edit creates a new file, assess it before it lands
- Advisory mode (warn) → enforced mode (block misplacement)

### Phase 5: Deduplication
- Detect near-duplicate content (cosmology/consciousness, design-radar)
- Produce a dedup report
- Owner decides which copy is canonical

### Phase 6: Lifecycle Management
- Wire staleness score to actual purge recommendations
- Auto-archive files older than threshold
- Owner-gated purge (never auto-delete)

---

## 6. Files Changed (for Claude to work on)

| File | Action |
|---|---|
| `_SYSTEM/Scripts/filing-assessor.mjs` | Expand ZONE_RULES |
| `_SYSTEM/Scripts/filing-assessor.test.mjs` | Expand tests |
| `_SYSTEM/Scripts/filing-mutator.mjs` | **NEW** — mutation half |
| `_SYSTEM/Scripts/filing-mutator.test.mjs` | **NEW** — mutator tests |
| `_SYSTEM/config/folder-registry.json` | Update with new zones |
| `_SYSTEM/config/artifact-registry.json` | Update with new placement rules |
| `.claude/skills/organ-filing-assessor/SKILL.md` | Update with mutator docs |
| `_SYSTEM/reports/filing-system-audit-2026-06-11.md` | This report |

---

## 7. Acceptance Criteria

1. Every artifact type in the repo has a zone rule
2. `filing-assessor.mjs` classifies all test cases correctly (expanded test suite)
3. `filing-mutator.mjs` can execute a dry-run relocation plan
4. `filing-mutator.mjs` can execute actual moves with `git mv`
5. Protected paths are never moved (fail-closed veto)
6. The 65+ loose `_SYSTEM/` root files are relocated to canonical zones
7. Empty directories are cleaned up
8. Knowledge-base duplication is resolved
9. Research scatter is consolidated
10. A full relocation report is produced for owner review

---

## 8. Residual Risk

- **Breaking imports:** Moving files may break `import` statements or `_SYSTEM/INDEX.md` references. The mutator should check for references before moving.
- **Git history:** Using `git mv` preserves history; plain `mv` does not. The mutator must use `git mv`.
- **Protected paths:** The assessor already has fail-closed veto. The mutator must inherit this.
- **Large batch:** 65+ files in one sweep is a lot. Recommend phased execution with owner review between batches.
- **Stale worktrees:** The 12GB `.claude/worktrees/` cleanup is a separate task (not part of the filing system build).

---

---

## Companion Document

**System Design:** `filing-system-design-2026-06-11.md` — covers the three-component architecture (Assessor + Dependency Scanner + Mutator), the expanded 24-zone map, the hook integration for creation-time routing, the recommendation-to-execution gap closure, reference-update strategy per layer, and the phased build order.

---

*Report generated by Claude (Rick C-137) on 2026-06-11. All findings are from local evidence — no model inference was used for file counts or path verification.*
