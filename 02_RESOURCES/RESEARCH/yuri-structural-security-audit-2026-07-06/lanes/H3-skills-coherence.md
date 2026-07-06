# H3 — Skills Coherence Audit

**Yuri OS / YURI Skill Inventory Analysis** | 113 SKILL.md files | Fable-5 de-bloat assessment

---

## Executive Summary

**113 skills organized into 7 subsystems + scattered singles.** Healthy subsystems (GitNexus: 8, ORGAN/Oracle: 14). Moderate overlap in design (5), code quality (5), decision sims (4). **3 confirmed dead/retired,** 1 broken command alias. **Low to medium consolidation opportunity** (~5 merges), not a bloat crisis—but cleanup would sharpen discoverability.

---

## Inventory by Subsystem

### 1. GitNexus — Code Intelligence (8 skills)
**Well-structured subsystem:** 1 dispatcher + 6 specialists + 1 guide.

- **gitnexus** — dispatcher
- **gitnexus-cli** — CLI operations
- **gitnexus-debugging** — trace/debug symbol-aware
- **gitnexus-exploring** — architecture/execution flow
- **gitnexus-guide** — reference
- **gitnexus-impact-analysis** — safety/blast-radius
- **gitnexus-pr-review** — PR assessment
- **gitnexus-refactoring** — rename/extract/move

**Assessment:** Clean separation of concerns; each specialist is distinct and non-redundant.

### 2. ORGAN / Oracle Infrastructure (14 skills)
**Heavy distributed-state subsystem:** process management, memory, gates, filing, decoding.

- **oracle-adapters, oracle-memory, oracle-registry, oracle-router, oracle-voice** (5)
- **organ-discovery-precision-gate, organ-filing-assessor, organ-formula-foundry, organ-formula-foundry-bakeoff, organ-lane-telemetry-cockpit, organ-openprocess-pool, organ-yuri-decode, organ-yuri-nerve** (8)
  
**Assessment:** Proper division by function (routing, memory, formulas, telemetry, nerve). No obvious merges.

### 3. Design & Visualization (5 skills)
**Potential overlap zone:**

- **design-master** — YURI/Kagami/HUD surfaces (internal)
- **design-source-pack** — extract design system → portable skill
- **frontend-design** — external/public-facing (non-YURI)
- **design-assistant-inbox** — pending visual requests (Chrome integration)
- **viz-lab** — real-data visualizations (energy, graphs, telemetry)

**Assessment:** 
- **design-master vs design-source-pack** — both are interface design; source-pack is narrower (extraction pipeline). Minor overlap but distinct use cases.
- **frontend-design scope** — explicitly external, but line between "YURI UI" and "external product UI" could drift in practice.
- **viz-lab stands alone** — 3D/WebGL/D3 data visualization ≠ UI design.

**Flag:** frontend-design / design-master boundary should be documented (triggers, examples).

### 4. Decision & Simulation (4 skills)
**Disciplined domain separation:**

- **probabilistic-decision-core** — general EV/calibration/go-no-go
- **izanagi-simulator** — counterfactual 3-path branching
- **quantum-hypothesis-simulation** — order-aware hypothesis tracking
- **trade-decision-sim** — trading-specific signal/edge-aware decisions

**Assessment:** Each handles a distinct decision model (Bayes, counterfactual, quantum, trading). No functional overlap. Appropriate granularity.

### 5. Code Quality & Testing (5 skills)
**Moderate overlap, distinct use cases:**

- **test-driven-development** — TDD loop before implementation
- **tdd** — (appears to be a duplicate alias)
- **systematic-debugging** — general bug diagnosis
- **gitnexus-debugging** — symbol-aware trace/error path
- **verification-before-completion** — evidence before claiming done
- **yuri-code-intelligence** — passive code smell detection
- **improve-codebase-architecture** — refactoring opportunities

**Assessment:**
- **test-driven-development vs tdd** — **MERGE CANDIDATE.** Appear to be the same skill under two names. Check SKILL.md contents.
- **gitnexus-debugging vs systematic-debugging** — gitnexus leverages symbol graph; systematic is general. Distinct by dependency (lexical vs structural).
- **yuri-code-intelligence vs improve-codebase-architecture** — intelligence is read-only analysis; improve is refactor action. Non-overlapping.

**Action:** Confirm tdd and test-driven-development are identical; if so, retire one and update commands/ aliases.

### 6. Anime-DNA Persona Layer (6+ skills)
**High-context behavioral specialization:**

- **anime-dna-extensions** — orchestrator
- **bankai-manifest** — externalize cognitive state
- **pattern-mirror-core** — artifact reverse-engineering
- **haki-intent** — intent pre-cognition (5-path ranking)
- **nen-phase-detector** — phase-specialization mode switch
- **geass-lock** — inviolable constraint lock
- **yuri-shura** — 6-perspective review

**Assessment:** Anime-DNA skills are behavioral modes, not overlapping functions. Each maps to a distinct cognitive/decision pattern (externalize / reverse-engineer / intent-read / phase-switch / lock / review). No merges needed.

### 7. Research & Artifacts (4 skills)
**Evidence → output pipeline:**

- **research-artifact-factory** — mature notes → draft skills
- **extraction-sprint** — multi-site inventory → synthesized brief
- **codebase-to-course** — code → interactive HTML course
- **writing-skills** — skill scaffolding / quality

**Assessment:**
- **research-artifact-factory vs extraction-sprint** — factory is skill-promotion pipeline; extraction is inventory synthesis. Different outputs (draft skill vs brief). Distinct but related.
- **writing-skills** — covers skill creation/editing/verification; not an extraction tool. Should be in the skills subsystem (see #8).

### 8. Skill & Tool Management (4 skills)
- **writing-skills** — authoring/QA/verification
- **skill-creator** — scaffolding
- **skill-installer** — installation
- **plugin-creator** — plugin scaffolding

**Assessment:** Healthy subsystem. No overlap.

---

## Retired / Tombstone Skills

| Skill | Status | Note |
|-------|--------|------|
| **parallel-clone-orchestrator** | Retired | Explicit tombstone; redirects to native planning + llm-compat |
| **haki-intent** | ??? | Marked as part of anime-DNA but appears tombstone-adjacent in assessment |
| **hatch-pet** | ??? | Visible in skill list; unclear if active or deprecated |

**Action:** Verify haki-intent and hatch-pet current status. If retired, add explicit tombstone markers.

---

## Dead Aliases & Command File Mismatches

| Skill | Trigger | Commands File | Status |
|-------|---------|----------------|--------|
| **cgs-mold** | `/cgs-mold` | ❌ MISSING | Broken: declared triggers but no `.claude/commands/cgs-mold.md` |

**Commands dir:** 35 command files exist; `cgs-mold.md` is missing. Creates discoverability gap.

**Action:** Create `.claude/commands/cgs-mold.md` or remove trigger declaration.

---

## Overlap Clusters & Consolidation Candidates

### High Confidence Merges

| Cluster | Skills | Recommendation | Effort |
|---------|--------|-----------------|--------|
| TDD/Testing | `test-driven-development` + `tdd` | **MERGE** — verify identical, retire one | Low |
| Design Scope | `frontend-design` / `design-master` | Document boundary (triggers, examples) | Low |

### Medium Confidence Merges

| Cluster | Skills | Recommendation | Effort |
|---------|--------|-----------------|--------|
| Research Pipeline | `research-artifact-factory` + `extraction-sprint` | Review outputs; if truly distinct, add trigger clarifications | Medium |
| Code Quality | `yuri-code-intelligence` + `improve-codebase-architecture` | Distinct (read vs. refactor) but consider unified entry point | Low–Medium |

### Low Confidence (Keep Separate)

- **Decision sims (4)** — appropriate domain granularity
- **GitNexus subsystem (8)** — well-structured
- **ORGAN subsystem (14)** — no clear merges
- **Anime-DNA (6+)** — behavioral modes, not overlapping functions

---

## Discoverability & Navigation

### Navigation Challenges

1. **113 skills = 3–4 screens of /using-superpowers output.** Skill discovery is slow without domain knowledge.
2. **No skill taxonomy index** beyond .claude/skills/ filesystem. Users must know the exact skill name.
3. **Anime-DNA orchestrator (anime-dna-extensions)** doesn't appear in triggers; harder to discover than individual behaviors.

### Recommendations

1. **Add a `.claude/skills/INDEX.md`** — categorical reference map (design, code, decision, anime-DNA, research, infrastructure). Keep it stable and regenerated by capability-scan if possible.
2. **Unify TDD** — resolve test-driven-development / tdd duplication.
3. **Publish design scope** — document when to use frontend-design vs design-master (triggers / examples in SKILL.md frontmatter).
4. **Create cgs-mold.md** — fix the command alias.

---

## Summary Table: Subsystem Health

| Subsystem | Count | Structure | Health | Action |
|-----------|-------|-----------|--------|--------|
| GitNexus | 8 | Dispatcher + 6 specialists + guide | ✅ Healthy | None |
| ORGAN/Oracle | 14 | Functional division | ✅ Healthy | None |
| Design | 5 | Mixed hierarchy | ⚠️ Boundary drift | Clarify frontend-design scope |
| Decision/Sim | 4 | Domain-specific | ✅ Healthy | None |
| Code Quality | 5 | Overlapping entry points | ⚠️ TDD duplication | Merge test-driven-development + tdd |
| Anime-DNA | 6+ | Behavioral modes | ✅ Healthy | None |
| Research | 4 | Pipeline stages | ⚠️ Unclear boundaries | Review artifact-factory vs extraction-sprint |
| Skill/Tool Mgmt | 4 | Authoring tools | ✅ Healthy | None |
| **Scattered** | 36 | Singles/doubles | ⚠️ Low navigation | Create INDEX.md |
| **Retired** | 3 | Tombstones | ⚠️ Unclear status | Verify haki-intent, hatch-pet |

---

## Evidence Base

- **File count:** 113 SKILL.md files found via `find .claude/skills -name "SKILL.md"`
- **Command aliases:** 35 files in `.claude/commands/`; 1 mismatch (cgs-mold)
- **Duplicate checks:** No filesystem-level duplicates; one apparent code-level duplicate (test-driven-development / tdd)
- **Subsystem structure:** Hand-classified by file naming + description content
- **Retired markers:** Grep for "Retired", "tombstone", "Do not invoke"

---

## For Fable-5 De-bloat

**Keep:** All subsystem skills. Subsystems are coherent and serve distinct purposes.

**Merge:** `test-driven-development` + `tdd` (1 skill removal).

**Clarify:** Design scope (frontend-design vs design-master); research pipeline boundaries.

**Fix:** Add cgs-mold.md command file; verify haki-intent / hatch-pet status.

**Add:** INDEX.md for 113-skill navigation.

**Net impact:** Cleaner, not smaller. Index + deduplication + boundary documentation → better UX, no loss of capability.

---

## Uncertainty & Caveats

- **haki-intent status** — appears in anime-DNA cluster but not explicitly linked. Unclear if active or deprecated.
- **hatch-pet status** — visible but no recent usage signal. Need verification.
- **research-artifact-factory vs extraction-sprint** — descriptions suggest related but distinct outputs; would need to review actual execution to confirm merge-worthiness.
- **anime-dna-extensions orchestrator** — not triggered in standard flow; unclear if entry point is used or if users invoke individual behaviors directly.

**Confidence level:** Medium (file-system enumeration is deterministic; functional overlap assessment requires behavior traces).
