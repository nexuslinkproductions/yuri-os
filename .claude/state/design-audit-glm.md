⬡ MANUAL_OVERRIDE :: model=deepseek-v4-pro
⬡ ROUTING_TO_DEEPSEEK_V4...
[2m[cache] hit=22656 miss=73 ratio=1.00[0m
[2m[lane-session] persisted to /Users/marcelspatz/YURI-OS-MUSUBI/.claude/lane-sessions/deepseek-v4-pro__default.jsonl[0m
---

# YURI DESIGN SYSTEM — ADVERSARIAL AUDIT

**Auditor:** Rick Sanchez  
**Date:** 2026-05-20  
**Verdict:** Two systems pretending to be one. Three skills where one suffices. Zero extracted references from 695 bookmarks. Two orphaned backend services. Clean-slate not required — amputation is.

---

## I. FIVE ADVERSARIAL POSITIONS (verdict + evidence + fix)

### 1. "One unified token system serves both HUD and Kagami"
**Verdict: REJECT. Category error.**

Evidence: DESIGN.md mandates `JetBrains Mono`, `border-radius ≤ 2px`, `8px base grid`, monospace operator aesthetic. design-memory.json Kagami template locks `Inter Variable + system fallback`, `radius lg 22px`, `cubic-bezier pop/glide/snap`, variable sans-serif fonts. These are not overrides — they are fundamentally different design languages sharing the same memory file. Kagami is a PS2-era hologram cyberpunk report; HUD is a notebook-embedded operator dash. Forcing them into one token namespace produces the contradiction in evidence line 1.

**Fix:** Split token layers explicitly. `--yuri-hud-*` namespace for operator surfaces. `--yuri-kagami-*` namespace for report/atmospheric surfaces. Both can load from `index.css` but must never intermingle. design-memory.json gets `surface: "hud" | "kagami"` discriminator on every entry. No more silent overrides.

---

### 2. "Three skills can be rationalized by scope"
**Verdict: PARTIAL. frontend-design must die. design-source-pack should fold.**

Evidence:
- **design-master** — 38 triggers, memory persistence, dispatch-rule gate to external implementation lane. Does actual work.
- **frontend-design** — 10 triggers, 8 of which overlap design-master's (same YURI load order, same packs, same "design a landing page" trigger). Duplicate routing, no unique capability.
- **design-source-pack** — 7 triggers, mostly a selection matrix for ShaderGradient/liquid-glass/react-three-fiber. Session notes are cross-contaminated: the 2026-05-19 entry literally copies design-master's session notes verbatim ("corrections: Base directory for this skill: /Users/marcelspatz/.claude/skills/design-master"). This is corruption, not rationalization.

**Fix:** Kill frontend-design. Fold design-source-pack's selection matrix into design-master as a reference block (its only durable content). design-master becomes single entry point with a `_references/` subdir for the pack logic. Net: 3 → 1.

---

### 3. "Adding design agents solves the gap"
**Verdict: REJECT. Routing problem, not agent shortage.**

Evidence: The trigger lists for design-master and frontend-design both catch "design this," "landing page," "build a UI." The system already can't route to the right skill — adding agents to the same broken dispatch just multiplies wrong-answer surface area. Also: design-master already has a dispatch rule (spec in main thread → `ai auto` for implementation). That's the agent pattern. It's just fragmented across the wrong files.

**Fix:** Fix routing before adding agents. One design skill. One dispatch rule. If a task needs 3D/mograph/implementation sub-agents, design-master dispatches to them via `ai auto` with a structured spec. No new top-level skills.

---

### 4. "Reference packs are valuable"
**Verdict: PARTIAL — concept yes, current packs no.**

Evidence: frontier-design-intelligence = 72-source atlas, framer-university-resource-atlas = 623-resource archive, Design Radar = 69 getdesign.md references. Total: 695 references. Extracted component code: zero. Structured output templates: zero. Actual CSS/component fragments a skill can paste: zero. They are bookmark collections. design-master's load order says "select 3-7 references" — from what? Unstructured links?

**Fix:** Junk frontier and framer atlases as unusable. Replace with 8-12 extracted reference cards — each with: concrete CSS pattern, when-to-use rule, 5-line example, conflict note. Store in design-master `_references/extracted/`. One card = one implementable decision. If it can't be pasted, it doesn't belong.

---

### 5. "designStudioService.ts should be wired to skills"
**Verdict: REJECT. Wrong abstraction, orphaned, should die.**

Evidence: designStudioService.ts defines full CRUD for DesignProjectStatus, DesignArtifactType, DesignSelectionKind, DesignIntentMode, DesignOperation, DesignIntentStatus — Projects, Artifacts, Captures, Selections. designAssistantBridgeService.ts adds WebSocket capture/selection/request flow with status pipeline (pending → claimed → responded → applied → cancelled). Neither service is referenced in any skill, any SKILL.md, any design-memory.json entry, or any dispatch rule. They are backend infrastructure for a paradigm (agentic design studio with WebSocket capture pipeline) that does not exist in this codebase.

**Fix:** Delete both services. If an agentic design studio is the future, rebuild them when the paradigm exists. Currently they're dead code masquerading as infrastructure.

---

## II. WHAT SURVIVES (and why)

| Survivor | Rationale |
|----------|-----------|
| **design-master skill** | Only skill with memory persistence, dispatch gate, actual session output. Collapse frontend-design + design-source-pack into it. |
| **DESIGN.md** | Clean source of truth for HUD surfaces. Needs `--yuri-hud-*` namespace isolation (see rule below). |
| **design-memory.json** | Right pattern, wrong contents. Add `surface` discriminator. Purge Kagami tokens into their own layer. |
| **index.css** (token file) | Works. Add namespace prefixing. |
| **Reference pack concept** | Replace contents — keep the structured reference card format (8-12 extracted, not 695 bookmarked). |
| **Dispatch rule** (spec → `ai auto`) | Correct isolation pattern. Formalize as single gate in design-master. |

---

## III. WHAT DIES (and why)

| Corpse | Cause of death |
|--------|---------------|
| **frontend-design skill** | 80% trigger overlap with design-master. Identical YURI load order. Zero unique capability. Redundant. |
| **design-source-pack skill** | Cross-contaminated session notes. Selection matrix is 4 rows, can live inside design-master. No extraction workflow ever executed. |
| **frontier-design-intelligence atlas** | 72 bookmarks, zero extracted patterns. Read-never-extracted. |
| **framer-university-resource-atlas** | 623 bookmarks, zero extracted patterns. Same. |
| **designStudioService.ts** | Zero callers. Zero references. Built for paradigm that doesn't exist. |
| **designAssistantBridgeService.ts** | Same. WebSocket pipeline with no consumer. |
| **"Kagami as HUD override" model** | design-memory.json Kagami entries prove it's a separate design language. Stop pretending it's the same surface with different tokens. |

---

## IV. WHAT GETS BUILT NEW

1. **Dual-token namespace in index.css**  
   `--yuri-hud-*` (JetBrains Mono, 2px radius, 8px grid, operator dash) and `--yuri-kagami-*` (Inter Variable, 22px radius, atmospheric report). Never cross-reference.

2. **design-memory.json `surface` discriminator**  
   Every entry gets `"surface": "hud" | "kagami"`. Load order: DESIGN.md overrides nothing — it's HUD-only. Kagami surface reads its own token block from index.css.

3. **Extracted reference card deck (8-12 cards)**  
   Replace 695 bookmarks. Format: `{ name, css_snippet_5lines, when_to_use, conflict_with }`. Stored: `design-master/_references/extracted/`. Curated from actual Kagami .bak files and HUD working components, not external URLs.

4. **Single dispatch gate**  
   design-master SKILL.md gets one dispatch rule: "Spec in main thread → `node _SYSTEM/Scripts/ai auto '<full spec>'`. Implementation never inline." No exceptions. No 20-line edit loophole (that's how the Kagami divergence happened).

5. **Purge script**  
   `_SYSTEM/Scripts/purge-design.sh` — removes frontend-design/ and design-source-pack/ skill dirs, designStudioService.ts, designAssistantBridgeService.ts, and the two reference atlases. Outputs before/after directory listing as receipt.

---

## V. THE ONE ARCHITECTURAL RULE

> **"One surface, one token namespace. No silent overrides across surfaces."**

design-memory.json Kagami entries silently overrode DESIGN.md's canon (JetBrains Mono → Inter Variable, 2px → 22px radius) with zero documentation that a divergence occurred. This happened because the system allowed `templates.kagami-sprint-audit.designTokens` to live in the same JSON file as HUD tokens without a `surface` field.

Implementation: Every design-memory.json write must include `"surface": "hud" | "kagami"`. DESIGN.md gets a header: "SCOPE: YURI HUD OS surfaces only. Kagami surfaces use --yuri-kagami-* token namespace in index.css and are governed by their own lockedDecisions in design-memory.json under surface=kagami." No token crosses the boundary. Conflict = hard error, not silent override.

---

*Output: `/tmp/design-audit-glm.md`*  
*Lines: 100 (excluding this footer)*  
*Next action: Marcel reviews. If greenlit, purge script runs, skills collapse, namespaces split.*
