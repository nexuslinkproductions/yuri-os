# Yuri Assistant-Role Synthesis — Prep Package INDEX (2026-07-05)

Prepared by the main Claude/Opus session orchestrating a 4-substrate fan-out (native Haiku/Sonnet Agents + deepseek-v4-flash ollama-cloud fleet + z.ai GLM-5.2 peer sub-fleet + MURE 20-role governed dry-run). This package is the INPUT to a single Fable-5 mastermind pass. Nothing here is wired into live code — all drafts.

## What we're solving
Solidify **Yuri's ROLE** as Marcel's personal AI assistant and design a **solid-but-minimal setup WITHOUT over-engineering** (Marcel's explicit fear). Seeded by two deep questionnaires — Marcel's (Yuri) + René's 49-answer interview (Jeffrey, on `origin/rene`). René's CGS/holster business specifics are DROPPED; only the role architecture transfers. Both operators think alike → the overlap is the signal.

## Inputs in this package
### Source (read first)
- `../answers/marcel-yuri-questionnaire-2026-07-04.md` — Marcel's answers + distilled config seed
- `origin/rene:02_RESOURCES/GUIDES/rene-jeffrey-questionnaire-2026-07-05.md` — René's 49 answers (`git show`)
- `origin/rene:_SYSTEM/SELF/jeffrey-persona.md` + `jeffrey-confirm-gate.json` — the PROVEN externalized pattern to mirror

### Native mapping lanes (Haiku)
- `lanes/H1-capability-inventory.md` — current Yuri LIVE/PARTIAL/STUB (brain :8014 LIVE, voice LIVE, computer-use PARTIAL, memory LIVE, ~75% daily-driver-ready)
- `lanes/H2-gap-analysis.md` — 49+19 requirements vs capabilities; #1 gap = externalize persona/gate; ranked, over-engineering flagged
- `lanes/H3-tool-activation-map.md` — control-vs-read matrix; hotkey>wakeword MVP; read_doc (PDF/Word/Excel) gap; launchd owner-gated
- `lanes/H4-memory-policy.md` — 3-tier minimal policy (PERMANENT/CONVERSATION/TRANSIENT); defer power-law decay + embeddings
- `lanes/H5-dispatch-reference.md` — exact conductor dispatch commands across all substrates

### Native synthesis lanes (Sonnet)
- `lanes/S1-yuri-persona-DRAFT.md` + `lanes/S1-yuri-confirm-gate-DRAFT.json` — externalized persona + gate, mirroring Jeffrey, gate bound to the live 6-gate Self-Governance Charter, guest-register deferred
- `lanes/S2-role-and-setup-spec.md` — role statement, operating contract, daily loop, solid-minimal setup, CUT list, phased roadmap, north star

### deepseek-v4-flash research breadth (all `_X_PASS_COMMITTED`, advisory/model-recalled — verify before citing as fact)
- `lanes/deepseek/D1-role-scope.md` · `D2-autonomy-gate.md` · `D3-memory-continuity.md` · `D4-proactivity.md` · `D5-voice-ux.md` · `D6-anti-over-engineering.md` · `D7-provider-pacing.md` · `D8-data-routing-privacy.md`

### GLM-5.2 peer (BLIND independent divergence — the diversity signal)
- `lanes/glm/G1a-independent-role-synthesis.md` — read the actual code; diverges hard (see TENSIONS)
- `lanes/glm/G1c-over-engineering-scan.md` — anti-over-engineering auditor + "definition of done"
- `lanes/glm/G1b-*` — minimal-gap take (may be in-flight; G1a+G1c cover the divergence if absent)

### MURE governed decomposition
- `lanes/mure-plan.json` — 11 subtasks cast across the 20-role collective: 4 GLM leaves, 3 native, 2 inline, 2 owner-HELD (the charter held the arming/high-stakes items). The role-map of how the collective would build this.

### CLAUDE.md corpus (for Fable Pass-2, separate mandate)
- `claude-md-corpus/CORPUS-CATALOG.md` + `README.md` + 12 flattened load-bearing CLAUDE.md files. Symlink `~/.claude → YURI-OS-MUSUBI/.claude` confirmed.

## CONVERGENCE (what every lane agrees on)
1. Operating contract = **operator thinks+decides+speaks; assistant organizes, drafts, dispatches, summarizes.**
2. Morning ritual = **absence report ("what happened while I was gone") + 3 top points + urgent flags + carryover.**
3. **Confirm-gate on outward/irreversible/large-scale; draft-yes, execute-per-threshold.** Bind to the existing 6-gate charter, don't invent a new vocabulary.
4. Memory: **org/safety/security/quirks permanent; nothing important expires**; minimal 3-tier, defer the research-grade machinery.
5. **Anti-over-engineering CUT list is unanimous:** don't wire into every subsystem before the core loop is proven; autonomy before trust; elaborate memory/orchestration for its own sake; guest mode; vision before AX suffices; wakeword before hotkey; full-MURE-before-need.
6. Build-now core is SMALL: externalize persona/gate config · morning/absence report · secret/PII masking · read_doc · provider metering/pacing · hotkey activation.

## TENSIONS for Fable to resolve (the point of the diversity)
- **T1 — Role frame.** Native lanes (H2/S2) + René's model land on **COO / chief-of-staff**. GLM G1a diverges sharply: Marcel's pain (questionnaire #3) is *"I get lazy/frustrated thinking alone,"* so Yuri is a **cognitive sparring partner + dispatch mouth, NOT a secretary** — the COO frame is *René's* need, mis-applied to Marcel. → Fable: is Yuri COO, co-thinker+dispatcher, or a weighted blend? (Evidence tilts to co-thinker-primary with an executive dispatch arm.)
- **T2 — The "#1 gap."** Native lanes say persona/confirm-gate is **MISSING** (inline, un-externalized). GLM G1a, reading the code, says the confirm-gate is **already shipped + tested inline** (`yuri-z-brain.py:846`), conductor wired, FTS5 live (57KB) — so the real gap is **externalization + a trust/habituation loop, not building the gate.** → Fable: this SHRINKS scope. Confirm before Fable finalizes the build list.
- **T3 — Autonomy dial.** René = nothing autonomous till approved. Marcel = act-first on routine/reversible (charter). Yuri sits further toward autonomy than Jeffrey. → Fable: set the concrete threshold + highest-stakes classes.
- **T4 — Guest register.** S1 deferred it; is a second audience real for Marcel yet? (Likely no → keep deferred.)

## Fable mandate → `FABLE-MASTER-BRIEF.md` (single one-shot, two deliverables)
Outputs Fable writes: `FABLE-PASS-1-SYNTHESIS.md` (definitive role + solid-minimal setup + CUT list + roadmap) and `~/.claude/CLAUDE.md.fable-candidate` + `FABLE-PASS-2-RATIONALE.md` (global CLAUDE.md, candidate not overwrite).
