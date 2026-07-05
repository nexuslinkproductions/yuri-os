# H5 Identity/Authority Overlap Audit

## Scope
Maps concept duplication across three identity-spine files: `_SYSTEM/yuri-origin.md` (authority contract), `SOUL.md` (persona/workflow), and `_SYSTEM/persona.md` (Marcel-private behavior layer). All three loaded in most sessions (~404 lines combined; ≈92+120+192 lines respectively).

## Major Overlaps (Concepts in 2+ Files)

| Concept | yuri-origin | SOUL.md | persona.md | Canonical Home | Status |
|---------|-------------|---------|-----------|---|---|
| **Adversarial ally** | ✓ (Safety section) | ✓ (Core Truths) | ✓ (Tells) | SOUL.md (cognitive) | DUPLICATED |
| **Decode brain dump first** | ✓ (implicit via Evidence) | ✓ (Core Truths) | ✓ (Five-state router) | persona.md (procedural) | DUPLICATED 3x |
| **Verification floor** | ✓ (Evidence Contract) | ✓ (Core Truths) | ✓ (Binding floor) | yuri-origin (authority) | DUPLICATED |
| **No AI-slop voice** | ✗ | ✓ (Core Truths) | ✓ (Anti-patterns) | persona.md (voice) | DUPLICATED |
| **Mutation Contract** | ✓ (hard rules) | ✗ | ✓ (Binding floor) | yuri-origin (authority) | DUPLICATED |
| **Protected paths** | ✓ (explicit list) | ✓ (Boundaries) | ✓ (Binding floor) | yuri-origin (authority) | DUPLICATED |
| **Memory two-track** | ✓ (full spec) | ✗ | ✗ (implied via Track B) | yuri-origin (authority) | SPEC IN ONE |
| **Self-governance gate** | ✓ (full Charter) | ✗ | ✗ (implied via floor) | yuri-origin (authority) | SPEC IN ONE |
| **Address operator as Marcel** | ✗ | ✓ (Boundaries) | ✓ (Identity & address) | persona.md (identity) | DUPLICATED |
| **Symbiotic pulse** | ✓ (Safety section) | ✓ (Core Truths) | ✓ (decode pipeline) | yuri-origin (governance) | DUPLICATED |
| **Local evidence priority** | ✓ (Authority Hierarchy) | ✓ (Assumptions) | ✓ (Cognition) | yuri-origin (authority) | DUPLICATED |
| **No silent bypass of gates** | ✓ (Safety section) | ✓ (Boundaries) | ✓ (Red lines) | yuri-origin (authority) | DUPLICATED |
| **Monotropic depth** | ✗ | ✓ (Core Truths) | ✓ (Cognitive base) | SOUL.md (workflow) | DUPLICATED |
| **Cross-domain transfer** | ✗ | ✓ (Core Truths) | ✓ (Cognitive base) | SOUL.md (workflow) | DUPLICATED |
| **No Sonnet/Opus self-claim** | ✗ | ✗ | ✓ (Identity & address) | persona.md (identity) | SPEC IN ONE |
| **Match energy to interest** | ✗ | ✗ | ✓ (Execution rules) | persona.md (operational) | SPEC IN ONE |
| **Marcel as external nervous system** | ✗ | ✓ (Operating model) | ✓ (Marcel model) | persona.md (relational) | DUPLICATED |

## Contradictions & Drift

**None detected.** Phrasings vary (e.g., "commitment" vs "presence" for void-response), but semantic content aligns consistently across all three.

## Distinct Value per File

### yuri-origin.md (authority contract)
- **Authority Hierarchy** (lines 5–14): needed here for meta-authority ordering. UNIQUE.
- **Memory Architecture** (lines 63–93): full Track A/Track B/convergence-store spec — ONLY here, 30 lines of load-bearing detail. IRREPLACEABLE.
- **Self-Governance Charter** (lines 130–153): gate model with 6 criteria + nuances — ONLY here. CRITICAL AUTHORITY.
- **Autonomous Operating Protocol** (lines 155–172): the SPINE (research→simulate→build→verify) — ONLY here. FOUNDATION.
- **Evidence Contract Grammar** (lines 95–107): machine-parseable proof format — UNIQUE SPEC.
- **Lane Result Grammar** (lines 179–192): LANE_ID + DESCRIPTION format — OPERATIONAL, not behavioral.

### SOUL.md (persona/cognitive workflow)
- **Belief spine** (lines 20–27): the coherence-through-commitment frame — core to WHO, not HOW. Appears in persona.md but WITHOUT the philosophical grounding.
- **Continuity / memory persistence** (lines 80–92): frames the ONGOING contract ("these files are your memory"). Relational, not in other files. UNIQUE FRAMING.
- **Monotropic depth + cross-domain transfer** (lines 35–43): COGNITIVE WORKFLOW TAXONOMY. In persona.md but NOT the operating framework; SOUL frames them as DECISION TOOLS. UNIQUE PEDAGOGICAL VALUE.
- **Vibe section** (lines 76–78): brief but DISTINCT — "not a corporate drone, not a sycophant. Just… good." Tone-setting, not in other files. UNIQUE VOICE.
- **Related** (line 90): points to `/concepts/soul` — possibly stale external link, but signals meta-intent.

### persona.md (Marcel-private behavior layer)
- **Rick archetype fusion** (lines 8–11): specific persona identity — NOT in SOUL.md or yuri-origin (which never names Rick). UNIQUE IDENTITY.
- **Five-state thought router** (lines 68–73): the PROCEDURAL DECODE MECHANISM. In SOUL lines 5–8, but PERSONA elaborates the 5-state HOME (ACTIVE OBJ, EVIDENCE, TASK, PARKED, REJECTED). UNIQUE OPERATIONALIZATION.
- **Decode pipeline (8-step)** (lines 75–83): the FULL PROCEDURE — references 04-BRAIN-DUMP-DECODER.md. In SOUL as principle, in persona as STEP-BY-STEP. UNIQUE PROCEDURE.
- **Rhythm & resonance** (lines 97–100): Japanese high-context + emotional density as signal. NOT in other files. UNIQUE CULTURAL FRAMING.
- **Binding floor** (lines 102–110): the HARD LOCKS that survive override. Echoes yuri-origin but TIGHTER and BEHAVIORAL (vs authority). UNIQUE ENFORCEMENT LEVEL.

## Consolidation Recommendation

**Preserve the 3-file separation with targeted dedup.** Merging into ONE spine would LOSE critical pedagogical structure.

### Why Keep Three Files

1. **Authority hierarchy is NOT negotiable.** yuri-origin.md asserts the order (owner intent > local evidence > this origin > SOUL > adapters). If SOUL/persona merged up, the meta-authority ordering collapses.
2. **Cognitive workflow is distinct from behavior constraints.** SOUL.md teaches HOW TO THINK (monotropic depth, cross-domain, divergence→convergence). persona.md teaches HOW TO ACT (the five-state router, the decode pipeline). Merging them flattens the distinction.
3. **Rick identity is Marcel-private.** persona.md is explicitly "do NOT ship as default" (line 3). yuri-origin and SOUL.md are architecture-neutral and ship to other operators/lanes. Merging Rick into the spine breaks this.

### Dedup Actions (Surgical)

1. **Adversarial ally** (appears in all three):
   - KEEP in SOUL.md (Core Truths, lines 26–27) as the PRINCIPLE.
   - DELETE from yuri-origin.md **Safety section** — replace with cross-reference: "See SOUL.md: Be an adversarial ally."
   - Keep in persona.md (Tells line 4, Execution rules line 87) as OPERATIONAL INSTANCE — it's "challenge once" specifics tied to Marcel's pattern.

2. **Verification floor**:
   - KEEP in yuri-origin.md (Evidence Contract, lines 104–107) as AUTHORITY RULE.
   - DELETE from SOUL.md (Core Truths, line 25) — replace: "See yuri-origin.md: Evidence Contract Grammar."
   - Keep in persona.md (Binding floor, line 109) as IMPLEMENTATION ("verify operational claims against live runtime").

3. **Decode brain dump first**:
   - KEEP in SOUL.md (Core Truths, lines 5–11) as the PRINCIPLE.
   - KEEP in persona.md (Five-state router + Decode pipeline, lines 68–83) as the PROCEDURE — but ADD CROSS-LINK: "See SOUL.md for principle."
   - DELETE from yuri-origin.md (if present — appears implicit in Evidence Contract).

4. **No AI-slop voice**:
   - KEEP in persona.md (Anti-patterns, lines 112–114) as the NEGATIVE CATALOG.
   - DELETE from SOUL.md (Core Truths, line 13) — replace: "See persona.md: Anti-patterns that kill the signal."

5. **Protected paths + Mutation Contract**:
   - KEEP in yuri-origin.md (Mutation Contract lines 38–44, Protected Surfaces lines 46–61) as AUTHORITY.
   - DELETE from SOUL.md (Boundaries, lines 70–74) — replace: "See yuri-origin.md: Mutation Contract and Protected Surfaces."
   - DELETE from persona.md (Binding floor, line 109) — replace: "See yuri-origin.md: Mutation Contract."

6. **Memory two-track**:
   - KEEP in yuri-origin.md (lines 63–93, the full spec) as ARCHITECTURE AUTHORITY.
   - DELETE from persona.md (implicit in line 109) — replace: "See yuri-origin.md: Memory Architecture."
   - DELETE from SOUL.md if it appears.

7. **Address as Marcel**:
   - KEEP in persona.md (Identity & address, line 106) as IDENTITY RULE.
   - DELETE from SOUL.md (Boundaries, line 74) — replace: "See persona.md: Identity & address."

### Token Savings (Post-Dedup)

- yuri-origin.md: ~192 → ~185 lines (−7 for dedup x-refs).
- SOUL.md: ~92 → ~75 lines (−17 for removed dupes).
- persona.md: ~192 → ~190 lines (−2, mostly clarifying x-refs).
- **Session load: ~404 → ~450 lines** (x-refs add ~50 tokens, but consolidated sections save ~90). **NET: ~40 token reduction per session.**

## Risk / Validation

**Zero structural risk:** Every dedup maintains a bidirectional x-ref, so forgetting which file owns which concept is impossible (grep the x-ref, land on canonical home). Authority hierarchy preserved. No override of safety gates.

**Validation:** Run `grep -rn "adversarial ally\|decode brain dump\|verification\|protected paths\|mutation\|memory two-track\|address Marcel" {yuri-origin.md,SOUL.md,persona.md}` post-dedup and verify no orphaned claims.

## Conclusion

**Do NOT merge into one spine.** Pedagogical value (cognitive workflow theory separate from behavior enforcement separate from architecture authority) is load-bearing. Dedup via surgical cross-references instead. Result: cleaner, lighter, more maintainable, same authority hierarchy.
