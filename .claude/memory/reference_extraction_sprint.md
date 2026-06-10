---
name: reference-extraction-sprint
description: "Reusable Shintai council extraction sprint template — multi-site catalog pull + adversarial synthesis + Codex final arbiter. Includes live model roster, shadcn registry extraction paths, lesson log from first run (2026-05-20 design revamp)."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 74775e0d-977a-4d89-a045-5fa1449d1178
---

Skill: `.claude/skills/extraction-sprint/SKILL.md` — invoke via `/extraction-sprint` or `Skill({ skill: "extraction-sprint" })`

Use when: cataloging N≥3 external sites into a structured reference + running adversarial synthesis across model lanes + Codex commit.

**First run:** Design system revamp 2026-05-20 — 8 design sites → 312+ component catalog + Shintai council → DESIGN.md v2.

## Key extraction paths (shadcn registry)
- Cult UI code: `curl https://cult-ui.com/r/<name>.json` (verbatim source)
- Aceternity/Componentry/DotMatrix: `npx shadcn@latest add @<scope>/<slug>` (post-install)
- JS-rendered sites (Skiper UI, Ali Imam): requires headless browser — WebFetch returns empty

## Live model roster (2026-05-20)
| Role | Token | Status |
|------|-------|--------|
| Adversarial audit | `--model deepseek-v4-pro` | ✅ live |
| Nemotron architect | `--model nvidia-nemotron-120b` | ✅ live |
| Qwen skill design | `--model nvidia-qwen` | ✅ live |
| Mistral doctrine | `--model nvidia-mistral-large` | ✅ live |
| GLM adversarial | `--model nvidia-glm` | ❌ dead (stream timeout) |

## Council rule
Lanes challenge each other — not parallel workers. Codex reads the debate and decides. No merging, only deciding.

## Related
[[feedback-shintai-team-sizing]] — Shintai sizing (1/2/3-5 by complexity)
[[feedback-rick-persona-every-dispatch]] — Rick anchor required in every brief
