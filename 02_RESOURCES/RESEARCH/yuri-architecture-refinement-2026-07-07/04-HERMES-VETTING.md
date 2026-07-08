# Hermes Skill Library — Vetting Record (import decision: ZERO)

**Date:** 2026-07-08 · **Method:** scrape → cross-check vs YURI's 121 skills → RED-test the genuine-gap candidates.
**Decision:** import ZERO Hermes skills. **Adjudicated + affirmed by Fable-5 final pass (`03-FABLE-FINAL-PASS.md`).**

## Source
- `hermes-agent.nousresearch.com/docs/skills` = JS-gated facade over the **agentskills.io aggregator (88k+)** — NOT a curated Nous library. Not the target.
- Native curated catalog: `hermes-agent.nousresearch.com/docs/reference/skills-catalog` — **72 skills / 17 categories** (single-page markdown, scrapeable). This is what was vetted.

## Verdict summary (72 skills)
- **ALREADY-HAVE (overlap YURI's 121):** systematic-debugging, tdd, requesting-code-review, plan≈writing-plans, github-code-review≈gitnexus-pr-review, github-issues≈triage/to-issues, arxiv/nano-pdf/ocr≈agent-reach/mineru/cross-reference-navigation, claude-code/codex/opencode delegation≈opus-fleet+fleet-economy, design/sketch/architecture-diagram≈frontend-design+visual-plan.
- **SKIP (out of scope / platform-specific):** all mlops + most creative categories, computer-use, touchdesigner-mcp, yuanbao, petdex, xurl, imessage, apple-*, notion, maps, etc. (These are host-integration skills, not governance/orchestration.)
- **IMPLEMENTABLE-HIGH candidates (genuine-seeming gaps):** `humanizer`, `spike`. Both RED-tested below.

## RED tests (writing-skills Iron Law: no skill without a failing baseline)
A skill is only worth creating if a capable agent FAILS the task WITHOUT it. Both candidates PASSED their baseline → creating them would be bloat, not capability.

| Candidate | Baseline scenario (no skill) | Result | Ruling |
|---|---|---|---|
| **humanizer** (29-pattern AI-slop detector) | deepseek-flash given AI-slop marketing copy: "detect the tells + rewrite" | **PASSED** — caught 15+ tells (delve, seamlessly, leverage-synergy, "it's not just X—it's Y", "The result?", cutting-edge, empowers…) + solid rewrite, unaided | **DO NOT CREATE** — capable models already do this, AND YURI's persona binding-floor already encodes anti-AI-slop rules at the identity layer (stronger than a skill). Duplicate. |
| **spike** (empirical validate-before-build gate) | deepseek-flash given "build a pipeline that hinges on an unconfirmed 3rd-party API contract" | **PASSED** — led with "Phase 0: Contract Probe (HARD GATE — no pipeline code until confirmed)", validated the risky assumption first, unaided | **DO NOT CREATE** — covered by brainstorming/tdd/writing-plans + native competence. |

## Conclusion
The scrape's value was **vetting that confirms YURI's skill library is already comprehensive** for the governance/orchestration/dev surface. The two genuine-gap candidates are already handled by capable models + YURI's persona floor. Importing any of the 72 would add to the exact context-window skill-bloat this refinement project exists to reduce. **Import zero.** Re-run this vetting only if YURI's skill roster shrinks materially or a Hermes skill covers a NEW capability class YURI lacks.
