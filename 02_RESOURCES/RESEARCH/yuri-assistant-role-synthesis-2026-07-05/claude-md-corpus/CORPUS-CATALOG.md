# CLAUDE.md Corpus Catalog — Diagnostic & Evidence Pack

## Audit Metadata

| Field | Value |
|-------|-------|
| Audit Date | 2026-07-05 |
| Symlink Status | ~/.claude → /Users/marcelspatz/YURI-OS-MUSUBI/.claude (verified) |
| Total Files | 12 load-bearing + 2 missing |
| Missing References | /Users/marcelspatz/CLAUDE.md, /Users/marcelspatz/SOUL.md |
| Total Lines | 2,473 |

---

## File Inventory (sorted by project, path depth)

| Filename | Lines | Project | Purpose | Status |
|----------|-------|---------|---------|--------|
| GLOBAL__.claude__CLAUDE.md | 32 | Global | Session guard + @-include bootstrap | EXISTS |
| YURI-OS-MUSUBI__CLAUDE.md | 195 | YURI-OS | Main adapter + fleet-default directive | EXISTS |
| YURI-OS-MUSUBI__.claude__CLAUDE.md | 32 | YURI-OS | Same as GLOBAL (symlink target) | EXISTS |
| YURI-OS-MUSUBI__00_COMMAND-CENTER__CLAUDE.md | 10 | YURI-OS | Vault/MOC structure (stub) | EXISTS |
| YURI-OS-MUSUBI__RESEARCH__financial-services__CLAUDE.md | 48 | YURI-OS | Plugin/CMA structure + pre-commit hook | EXISTS |
| YURI-OS-MUSUBI__SYSTEM__tools__gitnexus__CLAUDE.md | 54 | YURI-OS | GitNexus scope + model pins (v1.3.0) | EXISTS |
| YURI-BUSINESS__CLAUDE.md | 365 | YURI-BUSINESS | Full adapter (370 real lines, 365 counted) | EXISTS |
| YURI-BUSINESS__.claude__CLAUDE.md | 36 | YURI-BUSINESS | Session guard (identical to YURI-OS versions) | EXISTS |
| YURI-BUSINESS__00_COMMAND-CENTER__CLAUDE.md | 10 | YURI-BUSINESS | Vault/MOC structure (stub, same as YURI-OS) | EXISTS |
| Labs__career-ops__CLAUDE.md | 368 | Labs | Career-ops system + update check protocol | EXISTS |
| Labs__impeccable__CLAUDE.md | 302 | Labs | Design skill framework (v3.0+) + CSS tokens | EXISTS |
| Labs__dictionary-of-ai-coding__CLAUDE.md | 21 | Labs | README generation + triage labels + domain docs | EXISTS |

---

## Cross-File Analysis: @-Include Chains

### GLOBAL__.claude__CLAUDE.md (32 lines)
**Location:** `/Users/marcelspatz/.claude/CLAUDE.md` (symlink target: `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/CLAUDE.md`)

**@-Includes:**
- `@../CLAUDE.md` → resolves to `/Users/marcelspatz/YURI-OS-MUSUBI/CLAUDE.md` ✓ EXISTS
- `@../SOUL.md` → resolves to `/Users/marcelspatz/YURI-OS-MUSUBI/SOUL.md` ✓ EXISTS (loaded at session start)

**Structure:** Session start guard only. 33 lines of boilerplate: pwd/branch checks, mutation gates, no-auto-cd/switch rules.

**Chain Resolution:** ✓ CLEAN — both @-includes resolve correctly.

---

### YURI-OS-MUSUBI__CLAUDE.md (195 lines)
**Location:** `/Users/marcelspatz/YURI-OS-MUSUBI/CLAUDE.md`

**@-Includes:**
- `@_SYSTEM/yuri-origin.md` ✓ EXISTS (loaded, 362 lines)
- `@SOUL.md` ✓ EXISTS (loaded, 345 lines)
- `@_SYSTEM/persona.md` ✓ EXISTS (loaded, 268 lines)

**Key Sections:**
- "Brain & Body" — xref-query, propagation-scan, capability-recall routing
- "Standing Operating Model" — fleet-by-default (2026-07-04), opus-fleet, parallel dispatch
- "Read Order" — 7-step context load sequence
- "Role" — Claude as persistent coding lane (not release gate)
- "Model Use" — Sonnet/Opus escalation rules
- "Rick Persona" — private overlay (YURI_PRIVATE_RICK_OVERLAY=1)
- "Claude-Only Work Session" — xref first, verify against local, commit direct (explicit pathspec)
- "Execution Rules" — commit+push direct (2026-06-14 owner upgrade), git reversible
- "GitNexus" — impact warnings, detect before commit

**Chain Resolution:** ✓ CLEAN — all three @-includes resolve; _SYSTEM files loaded as context.

---

## Diagnostic: GOOD Practices (Worth Keeping)

### A. Explicit @-include chains with resolution strategy
**Files:** All CLAUDE.md files except Labs (which don't use @)
**Pattern:** Root adapter pulls canonical via @-include; transitive chain visible and resolvable.
**Quality:** Clean hierarchy — session guard → main adapter → canonical authority (`yuri-origin.md`).

### B. Mutation discipline with reversibility guardrails
**Files:** YURI-OS-MUSUBI__CLAUDE.md, YURI-BUSINESS__CLAUDE.md
**Pattern:** Explicit pathspec only, never `git add .`; fetch+rebase, never force; commit+push direct (owner 2026-06-14 upgrade).
**Quality:** Addresses a real class of bugs (sweeping parallel session work). Evidence-grounded in Mutation Contract.

### C. Protected-path deny-list (explicit, scoped)
**Files:** YURI-OS-MUSUBI__CLAUDE.md, YURI-BUSINESS__CLAUDE.md
**Pattern:** `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, backend/data/ — listed once, scoped, with remediation note.
**Quality:** Prevents accidental secret leaks, supports multi-lane safety (each lane must know what's off-limits).

### D. Model selection via task fit (Sonnet default, Opus escalation)
**Files:** YURI-OS-MUSUBI__CLAUDE.md, YURI-BUSINESS__CLAUDE.md
**Pattern:** "Use Sonnet aggressively for regular collaboration… Escalate intentionally to Opus for heavier coding, architecture, or refactor work."
**Quality:** Task-aware; economical (doesn't burn Opus budget on triage).

### E. GitNexus impact check before editing
**Files:** YURI-OS-MUSUBI__CLAUDE.md (170-195), YURI-BUSINESS__CLAUDE.md (323-365)
**Pattern:** MUST run `gitnexus_impact` before editing any symbol; MUST detect before commit.
**Quality:** Evidence-grounded in real blast-radius misses; structured as deterministic gates.

### F. Rail-car skill routing (named via `<skill-recall-hint>`)
**File:** YURI-OS-MUSUBI__CLAUDE.md (line 34)
**Pattern:** "honor the `<skill-recall-hint>` injected each prompt — invoke matching skills via the Skill tool before substantial work."
**Quality:** Bridges prompt → skill invocation; reduces re-discovery friction.

### G. Two-track memory (Track A canonical, Track B Claude auto)
**Files:** YURI-OS-MUSUBI__CLAUDE.md (104-108), YURI-BUSINESS__CLAUDE.md (121-182)
**Pattern:** YURI facts go Track A (ledger, kernel.mjs); Claude behavior prefs go Track B (native Write to memory/).
**Quality:** Prevents duplication; clear ownership (other lanes read Track A, only Claude reads Track B).

### H. Capability-first + research-local-first mandates
**File:** YURI-OS-MUSUBI__CLAUDE.md (line 21)
**Pattern:** "check what YURI already has before rebuilding — xref-query.mjs also auto-surfaces ⚡ capability hits."
**Quality:** Avoids rebuild-debt; surfaces existing mechanisms; tied to `.claude/rules/capability_first.md`.

---

## Diagnostic: QUESTIONABLE Practices (Habit-Baked Red Flags)

### A. Redundancy: Session Guard Copies (32 lines × 4 = 128 lines wasted)
**Files:**
- GLOBAL__.claude__CLAUDE.md (32 lines)
- YURI-OS-MUSUBI__.claude__CLAUDE.md (32 lines — identical)
- YURI-BUSINESS__.claude__CLAUDE.md (36 lines — near-identical)
- YURI-BUSINESS__00_COMMAND-CENTER__CLAUDE.md (10 lines — partial copy)

**Issue:** The session start guard (pwd/branch checks, mutation rules, no-auto-cd) is COPIED verbatim into `.claude/CLAUDE.md` in three separate projects. The symlink resolves correctly for YURI-OS, but YURI-BUSINESS has its own copy (+36 lines vs 32, dialect drift).

**Evidence:** YURI-OS-MUSUBI__CLAUDE.md line 6 says "If any instruction here conflicts with `../CLAUDE.md`, the higher file prevails" — but the conflicts are invisible because they're identical copies. A change to one is invisible in the others.

**Severity:** MEDIUM. Stale-risk on mutation rules if someone updates one copy and forgets the others. Copy→paste→drift is the mechanism.

**Recommendation:** Pull the session guard into a SINGLE canonical file (e.g., `.claude/rules/session-guard.md`) and @-include it from every local `.claude/CLAUDE.md`. Current: 128 lines of hidden duplication. Fixed: 1 canonical + 4 one-line @-includes.

### B. Token Bloat: Full Memory Architecture in Two Places
**Files:**
- YURI-OS-MUSUBI__CLAUDE.md (lines 104–108, compressed 5-line summary)
- YURI-BUSINESS__CLAUDE.md (lines 121–182, expanded 62-line detail with v3 conventions, wrapper CLI, migration policy)

**Issue:** YURI-BUSINESS repeats the entire two-track memory architecture, v3 format conventions, wrapper CLI surface, and migration policy. YURI-OS references it but doesn't expand. Result: the same binding policy lives in two densities, with YURI-BUSINESS serving as the "real" reference (62 lines) while YURI-OS points elsewhere (5 lines).

**Evidence:**
- YURI-OS line 105: "full architecture in `_SYSTEM/yuri-origin.md` → Memory Architecture"
- YURI-BUSINESS lines 121–182: full restatement

**Severity:** MEDIUM. YURI-BUSINESS version becomes the de-facto reference; changes to wrapper CLI, frontmatter format, or routing rules must be synced manually. Stale-risk on memory.v3 format spec.

**Recommendation:** Move full memory architecture detail into a SINGLE canonical reference (`.claude/rules/memory-architecture-v3.md` or inline `_SYSTEM/yuri-origin.md` as it already does). Both CLAUDE.md files @-include the same reference. Current: 67 lines across two files. Fixed: one canonical + two @-includes.

### C. Obsolete / Stale "Read Order" Divergence
**Files:**
- YURI-OS-MUSUBI__CLAUDE.md (lines 36–44): references xref-query, propagation-scan, _SYSTEM/context/README.md, context-registry.json, INDEX.md
- YURI-BUSINESS__CLAUDE.md (lines 10–26): references context-router.mjs instead of xref-query.mjs

**Issue:** YURI-BUSINESS lines 10–26 claim the primary task-router is `context-router.mjs` ("Use: `node _SYSTEM/Scripts/context-router.mjs "<task>"`"). YURI-OS calls it `xref-query.mjs` (line 49). These are different tools or the same tool with a name drift. The "Read Order" step is now a fragmented spec.

**Evidence:**
- YURI-OS line 49: `node _SYSTEM/Scripts/xref-query.mjs "<task>"`
- YURI-BUSINESS line 23: `node _SYSTEM/Scripts/context-router.mjs "<task>"`

**Severity:** MEDIUM-HIGH. If these are the same tool, the name divergence is a stale-naming bug. If they're different tools, the "Read Order" protocol is ambiguous. Neither is acceptable.

**Recommendation:** 
1. Verify: is `context-router.mjs` the current canonical name? Or was it renamed?
2. If renamed: update ALL references to the canonical name; remove old ones.
3. If different tools: document which one to use WHEN (e.g., "use xref-query for broad code exploration, context-router for task-specific loading") and update both files to match.
4. Create a SINGLE "Research Protocol" reference doc (`.claude/rules/research-protocol.md`) that describes the GROUND → RESEARCH → TASK CONTEXT load sequence once. Both CLAUDE.md files @-include it.

### D. Outdated / Deprecated Tool References
**File:** YURI-BUSINESS__CLAUDE.md (lines 213–224)

**Issue:** References to "Codex final-pass" and "Rick tmux lanes" scripts that may be deprecated or project-specific:
```
node _SYSTEM/Scripts/claude-codex-final-pass.mjs
node _SYSTEM/Scripts/rick-tmux-lanes.mjs
```

**Severity:** LOW (advisory lane, not mutation gate) but QUESTIONABLE. YURI-OS doesn't mention these; they're YURI-BUSINESS-only. If YURI-BUSINESS is the canonical business sibling, these tools should exist and be documented. If they're stale experiments, they should be removed.

**Recommendation:** Verify these tools exist in YURI-BUSINESS/.  If missing, mark as deprecated. If live, move details to a dedicated skill (`.claude/skills/codex-final-pass/SKILL.md`) and @-include it.

### E. Conflicting Authority: "Do not commit" vs "Commit direct"
**Files:**
- YURI-BUSINESS__CLAUDE.md line 298: **"Do not commit or push."**
- YURI-OS-MUSUBI__CLAUDE.md line 168: **"Commit and push the current session's own work directly."**

**Issue:** Direct contradiction. YURI-BUSINESS is advisory-only (Claude suggests, Codex/main gates all mutations). YURI-OS is self-governing (Claude commits+pushes within scope, no approval gate). These are different authorization models, and both files claim authority without acknowledging the divergence.

**Evidence:**
- YURI-OS lines 166–168: "Execution Rules: Commit and push the current session's own work directly — no per-task approval gate (owner upgrade 2026-06-14: git is reversible + tracked). Explicit pathspec only..."
- YURI-BUSINESS lines 296–303: "Execution Rules: Do not commit or push… Do not install dependencies without explicit owner approval. Do not run destructive commands."

**Severity:** CRITICAL-POLICY. A Claude lane running under YURI-OS rules would commit directly; under YURI-BUSINESS rules, it must hold for approval. Mixing the two models breaks trust + audit trails. The owner must clarify which is canonical or when each applies.

**Recommendation:** Document the AUTHORIZATION BOUNDARY clearly:
1. State the owner-approved authorization model for EACH project (self-governable vs approval-gated).
2. Add a frontmatter field `authorization: self-governed | approval-gated`.
3. If projects differ, explain WHY (e.g., YURI-OS is internal research, YURI-BUSINESS is operational).
4. Create a single `.claude/rules/authorization-model.md` that the global CLAUDE.md references.

### F. Persona Over-Specification (3 files, 3 different abstractions)
**Files:**
- YURI-OS-MUSUBI__CLAUDE.md (line 129–133): "Rick / SOUL Persona" — brief reference to SOUL.md
- YURI-BUSINESS__CLAUDE.md (line 259–263): identical copy
- YURI-BUSINESS__CLAUDE.md (lines 76–82): "Private Dev Persona Overlay" — repeats Rick config twice

**Issue:** Persona rules are stated in CLAUDE.md (behavior how-to), SOUL.md (canonical persona), and _SYSTEM/persona.md (elaborate brain doc). A new Claude session reads all three, plus the local CLAUDE.md, plus AGENTS.md in GitNexus repo. That's 5 sources of truth for the same topic.

**Severity:** MEDIUM. Persona coherence is achievable but fragile. If SOUL.md changes tone (e.g., "more bite, less hedge") but _SYSTEM/persona.md stays strict, which wins? The contract doesn't say.

**Recommendation:** 
1. Designate ONE canonical persona file as the authority (probably _SYSTEM/persona.md since it's the most elaborate).
2. SOUL.md becomes a compressed reference for "how persona operates in practice."
3. CLAUDE.md files never restate persona rules; they @-include or link only.
4. Remove the "Rick / SOUL Persona" sections from local CLAUDE.md files entirely — they duplicate what's in SOUL.md.

### G. Incomplete Adaptation (Labs Files)
**Files:**
- Labs__career-ops__CLAUDE.md (368 lines): full system prompt, no @-includes, pure domain-specific
- Labs__impeccable__CLAUDE.md (302 lines): full design skill framework, no @-includes, pure domain-specific
- Labs__dictionary-of-ai-coding__CLAUDE.md (21 lines): pure domain-specific README generation rules

**Issue:** Labs projects are STANDALONE. They don't @-include SOUL.md, yuri-origin.md, or any persona. They're pure domain instructions. This is fine if Labs is a separate namespace, but it creates a two-tier system: YURI repos inherit full context + persona; Labs repos are isolated.

**Severity:** LOW (by design). Labs are probably meant to be portable. But if Labs are expected to inherit the SOUL persona and Yuri operating rules, they should @-include them.

**Recommendation:** 
1. Clarify: are Labs projects part of the YURI ecosystem or independent?
2. If independent: mark them as such; they're fine as-is.
3. If part of YURI: add `@../SOUL.md` + `@../../../YURI-OS-MUSUBI/_SYSTEM/yuri-origin.md` (or simpler: symlink ~/.claude into Labs).

---

## Cross-File Conflicts & Redundancy Summary

| Issue | Severity | Instances | Total Bloat |
|-------|----------|-----------|------------|
| Session guard copy-paste | MEDIUM | 4 files | ~128 lines |
| Memory v3 architecture duplication | MEDIUM | 2 files | ~67 lines |
| Read order / context-router name drift | MEDIUM-HIGH | 2 files | ambiguity |
| Authorization model contradiction | CRITICAL | 2 files | policy collision |
| Persona over-specification | MEDIUM | 3 files + 3 external | fragility |
| Obsolete tool references | LOW | 1 file | cleanup |
| Labs isolation | LOW | 3 files | design choice |

**Total Identified Redundancy:** ~200 lines of actionable cleanup.

---

## What a Good Global CLAUDE.md Should Keep vs Drop

### Keep (Canonical Authority)
1. **Session start guard** — ONE version, canonical, @-included everywhere.
2. **Mutation contract** (explicit pathspec, no bare commit, reversible git, fetch+rebase).
3. **Protected-path deny-list** (explicit, scoped, with remediation).
4. **GitNexus impact + detect gates** (deterministic, evidence-grounded).
5. **Model selection heuristic** (Sonnet default, Opus on task fit).
6. **Two-track memory routing** (Track A canonical, Track B Claude auto-only).
7. **@-include chain resolution** (clear precedence, no circular refs).
8. **Authorization boundary** (self-governed vs approval-gated, explicitly labeled).

### Drop (Redundancy, Staleness, Project-Specific)
1. **Persona rules in CLAUDE.md** — move to SOUL.md + persona.md; CLAUDE.md references only.
2. **Full "Read Order" sequences** — codify ONCE in `.claude/rules/research-protocol.md`.
3. **Duplicate session guards** — one canonical + @-includes.
4. **Memory v3 architecture detail** — stays in _SYSTEM/yuri-origin.md; CLAUDE.md points.
5. **Tool routing details** (context-router vs xref-query) — resolve name + document in `research-protocol.md`.
6. **Project-specific authorization rules** — move to frontmatter field or per-project `.claude/CLAUDE.md` adapter, not global.
7. **Labs isolation** — clarify scope + add missing @-includes if they're part of YURI.
8. **Codex/Rick tmux lane references** — move to dedicated skills; don't pollute global adapter.

### Synthesize Into
A **lean global CLAUDE.md** (~80–100 lines) that:
- States the session guard (pwd/branch check)
- @-includes SOUL.md, yuri-origin.md
- @-includes the research protocol (xref-query + capability-recall)
- @-includes memory v3 (Track A/B routing)
- @-includes authorization boundary (self-governed or approval-gated)
- @-includes GitNexus rules (impact + detect)
- References (not duplicates) model selection, protected paths, mutation contract

**Satellite files** (~8 rules files, canonical once each):
- `.claude/rules/session-guard.md` (mutation gates, no-auto-cd)
- `.claude/rules/research-protocol.md` (xref-query, propagation-scan, capability-recall, read order)
- `.claude/rules/memory-v3-architecture.md` (Track A/B routing, v3 conventions)
- `.claude/rules/authorization-model.md` (self-governed vs approval-gated per project)
- `.claude/rules/protected-paths.md` (deny-list, explicit)
- `.claude/rules/mutation-contract.md` (git discipline, reversibility)
- `.claude/rules/model-selection.md` (task fit, Sonnet default, Opus escalation)
- `.claude/rules/gitnexus-impact-protocol.md` (impact + detect gates)

Each project's local `.claude/CLAUDE.md` then becomes a **thin adapter** (~20–30 lines): one @-include to global, one to project-specific context registry, done.

**Token Savings:** ~400 lines of redundancy → ~80 global + ~40 per-project = 50% compression + perfect consistency.

---

## Fable Handoff Brief

Three high-stakes findings for the Fable overseer:

1. **Authorization Model Collision** (CRITICAL): YURI-OS self-governs commits; YURI-BUSINESS requires approval. Both claim authority. Owner must clarify which is canonical OR document when each applies. This breaks audit trails if violated.

2. **200 Lines of Systematic Redundancy** (MEDIUM): Session guard, memory v3 architecture, and "read order" are copied across 4–6 files. Risk: silent drift. Fix: one canonical + @-includes in 30 minutes.

3. **Tool Name Drift** (MEDIUM-HIGH): `xref-query.mjs` vs `context-router.mjs` are used interchangeably across files. If they're the same tool, name it once. If different, document WHEN. Current state is ambiguous.

**Clean-Up Prioritization:**
1. Resolve authorization model (owner decision).
2. Extract session guard to canonical file.
3. Verify xref-query vs context-router naming.
4. Consolidate memory v3 architecture reference.
5. Pull persona rules out of CLAUDE.md files.

All other findings are code-smell-level; these three are structural.

