# YURI Design System Supercharge Plan — 2026-05-21

## Goal

Make YURI design work improve every time it fires by turning user taste, corrections, references, skill selection, motion decisions, and verification into a durable loop.

## Operating Model

1. **Intake before output**
   - Ask at least 10 design questions before producing new design output.
   - If the user already provided enough direction, map it into the design brief and ask only for missing categories.
   - Store reusable preferences in `_SYSTEM/design-memory.json`.

2. **Design Master as orchestrator**
   - `design-master` is the entry point.
   - It selects supporting skills based on the brief: `frontend-design`, `math-curve-loaders`, `pattern-mirror-core`, `sharingan`, `design-source-pack`, `prompt-engineering`, `parallel-clone-orchestrator`, and `swarm-coordination`.
   - It does not collapse the full design stack into one generic frontend pass.

3. **Surface-specific taste**
   - HUD remains operator-grade, dense, precise, and low-radius.
   - Kagami remains cinematic, editorial, reflective, motion-led, and structurally Japanese.
   - Cross-surface token or grammar leakage is a design failure.

4. **Preference memory**
   - User corrections become structured memory, not conversation-only context.
   - Current promoted Kagami preference: continuous HTML, no HUD, no slide deck, no logbook posture, fewer boxes/cards, more typography/path/mirror/motion.

5. **Reference selection**
   - Pick 3-7 references before implementation.
   - References must change an actual decision: typography posture, layout grammar, motion trigger, geometry, interaction, or density.

6. **Verification**
   - Browser/Playwright checks for local visual artifacts.
   - Desktop and mobile checks.
   - Reduced-motion behavior for motion-heavy work.
   - Explicit checks for repeated layouts, text overlap, card overuse, surface mismatch, and slide-deck drift.

## Next Implementation Wave

- Add a `design-brief` command or script that asks the 10+ questions and writes a dated brief artifact.
- Add a design-memory promotion helper that appends validated preferences without hand-editing JSON.
- Extend `playwright-visual-check.mjs` to detect card density, repeated section geometry, and fixed slide-deck snap behavior.
- Add a design regression test for Kagami presentations: no `data-surface="kagami-continuum"`, no visible HUD text, no repeated `open-note` dominance, motion present, mobile readable.
- Add a Rick `/design` or `/brief design` flow that invokes the intake gate before design generation.

## Acceptance Criteria

- Future major design tasks start with a 10-question brief or an explicit mapped equivalent.
- Design Master always loads YURI design memory and selects supporting skills from the migrated tree.
- Repeated user dislikes become durable memory entries.
- Local visual artifacts are checked in browser/Playwright before being called ready.

