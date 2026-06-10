---
name: feedback-codex-dispatch-discipline
description: Codex = platform not model (gpt-5.5, xhigh not max); optional check, not final gate
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["codex", "final-pass", "reasoning", "gpt-5.5", "model codex", "xhigh", "codex verify", "codex check"]
  refs: ["[[feedback-codex-powerhouse-nim-scope]]"]
---

RULE  Codex is the OpenAI *codex platform*, NOT a model and NOT the main/final gate. The model is `gpt-5.5`; operator reasoning depth is `xhigh` (max depth), never `max`. Codex is an OPTIONAL external clarification check — invoke only when genuinely uncertain or a high-risk change wants an independent second opinion, never as a mandatory gate on every change.

WHEN  Invoking `claude-codex-final-pass.mjs` / any codex dispatch; deciding whether to consult Codex; writing dispatch commands or docs that cite Codex reasoning or model.

DO    `--model gpt-5.5 --reasoning xhigh` for substantive review (read-only spark for a light check). Finish and verify your OWN local evidence first; only reach for Codex when uncertain. Owner approval gates mutation, not a Codex verdict.

DONT  Use `--model codex` (codex = platform, not model) or `--reasoning max`/`maximum`. Don't auto-dispatch Codex on every source/config/security change. Don't call Codex "main", "final verifier", or "release gate". Don't block on Codex being unavailable — it is advisory.

STYLE  Codex is a peer second-opinion, not an authority to defer to. Report its verdict as advisory; the active session is verifier/finalizer.

WHY   Operator works with GPT-5.5 on the codex platform; `xhigh` is the real operator depth (`max` is not an operator level — the runner maps xhigh to codex's internal effort flag). Codex's role was demoted from mandatory gate to occasional clarification.

SEE   _SYSTEM/Scripts/claude-codex-final-pass.mjs · CLAUDE.md "Codex Final-Pass Bridge" · _SYSTEM/Scripts/codex-offload-runner.mjs ALIAS_MAP
