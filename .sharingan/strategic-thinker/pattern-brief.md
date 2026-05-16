# Sharingan Brief — strategic-thinker-claude-plugin
**Repo:** kolesar/strategic-thinker-claude-plugin (aka "istishraf")
**Date:** 2026-05-16
**License:** MIT — clean, permissive, commercial use OK
**Stars:** 2

---

## Core Pattern: 6-Persona Council Fan-Out

The `/istishraf:shura` command instantiates 6 distinct reviewer personas in parallel, each applying a unique analytical lens:

| Persona | Lens |
|---------|------|
| Architect | Structural soundness |
| Adversary | 7-vector attack protocol |
| Maintainer | Long-term sustainability |
| Operator | Deployment & debugging |
| Product Guardian | Requirement closure |
| Security Auditor | Policy / mechanism / assurance / incentives |

**Mechanism:** Synthetic diversity — same artifact reviewed through 6 non-overlapping frames rather than a single voice. Each persona has a fixed role definition and questions the artifact from that frame only.

**Prompt structure:** Markdown command files under `/plugins/istishraf/commands/`. Each command is self-contained with role context injected per invocation. A shared `CLAUDE.md` template feeds model routing, coding standards, and system invariants.

---

## Analytical Frameworks (Portable, Framework-Agnostic)

- De Bono's Six Thinking Hats
- Islamic epistemology levels (Al-Kindi, Ibn Tufayl, Al-Ghazali) — applied as certainty calibration
- Ibn Khaldun's organizational dynamics — applied as resilience/decay assessment
- Anderson's security framework — mechanism/assurance/incentives/policy

These are framework-agnostic and fully portable to any model or orchestration layer.

---

## Claude-Specific Dependencies (Needs Replacement)

- `/istishraf:` command syntax → Claude Code plugin SDK only
- `opusplan` model routing: Opus in plan mode, Sonnet elsewhere → replace with deepseek-v4-pro / amp.smart
- Claude Code plugin mount mechanism → adapt to NUDIMMUD skill system

---

## Yuri OS Applicability

**Strong match to `yuri-shura` skill.** The 6-persona pattern is architecturally identical to yuri-shura's current 6-lane fan-out (NVIDIA-nemotron as architect, DS-pro as adversary, codex-spark as maintainer, etc.). Key addition: the adversary's **7-vector attack protocol** is more structured than yuri-shura's current adversary frame — worth extracting as a sub-checklist.

**Reuse:** Framework patterns (De Bono, certainty calibration) = portable, no license concern. Command file structure = adapt to `.claude/skills/` pattern. Full code import: low risk (MIT), but file structure is Claude-SDK-specific and needs rework.

---

## Recommendation

Extract the 7-vector adversary checklist and the certainty-calibration framework into yuri-shura's adversary lane prompt. Do not import the plugin SDK scaffolding. Separate signed-off Codex packet required before any code extraction.
