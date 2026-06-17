# VibeThinker-3B — local trade-analysis lane eval (2026-06-17)

## What

Wired **VibeThinker-3B** (WeiboAI, MIT, Qwen2.5-Coder-3B base) as a DISARMED/advisory local
trade-analysis reasoning lane. Model: `hf.co/prithivMLmods/VibeThinker-3B-GGUF:Q4_K_M` (1.9 GB).

- Lane: `vibethinker-local` in `.claude/config/models.json` → `llm_compat_lanes` (mirrors `qwen-local`
  pattern: `provider: ollama-local`, `protocol: ollama-local`, `localhost:11434`). Resolves by direct
  key lookup in `llm-lane.mjs` (line 774) — no llm-lane.mjs edit needed.
- `max_output` floored at 2560 (off) so the long CoT + answer fit; `num_ctx` 16384.
- Invoke: `node _SYSTEM/Scripts/llm-lane.mjs vibethinker-local --no-tools "<prompt>"` (local lanes
  auto-use the LIGHT system prompt — a 3B can't carry the full spine).

## DISARMED posture

Advisory only. The lane is referenced ONLY by models.json — nothing in `_SYSTEM/Scripts/` or
`~/Library/LaunchAgents/` invokes it. Not wired into any sizing / config-write / overseer path. It runs
only on an explicit call. (verified via `grep -rln vibethinker`.)

## Real test (live observatory trade-decision prompt)

Fed the real 2026-06-17 BTC-USD + SOL-USD state (live funding, recent closes, engine config, the
0/205-factor edge-audit result, the decision-sim FLAT verdict) and asked: enter or flat, which side, why.

| Metric | Result |
|---|---|
| Latency | **40 s** (incl. model load) on M2 Pro (~43 tok/s, overseer-measured) |
| Cost | $0 — on-device, private |
| Output | 7.2 KB (~110-line `<think>` CoT + a 6-line answer) |
| Verdict | **BTC-USD: FLAT · SOL-USD: FLAT** — matches the deterministic decision-sim independently |
| Reasoning quality | Sound: identified 0/205 factors → no edge → fees dominate → E[net/trade] ≈ −fee; did the fee-cost math; noted recent trades show no consistent profit |

### Strengths
- Reached the **correct, honest FLAT** conclusion from the evidence (no fabricated edge).
- The CoT is readable economic reasoning — useful as a narrative "why" beside the decision-sim's bare number.
- Fast, free, private, no cloud-usage burn (vs the ollama-cloud overseer lanes).

### Weaknesses (honest)
- **Hallucinated tool-grounding**: claimed `read_file('strategy_audit.txt')` / `fetch_url('decision_sim')`
  — files it never read; it dressed prompt-given data as tool-sourced evidence (the documented over-claim
  mode). Cosmetic here (it had `--no-tools` and reached the right answer), but risky if given real tools.
- CoT is **verbose** (110 lines for a 6-line answer) and cannot be told to skip — must strip `<think>`
  for the terse verdict. `llm-lane.mjs` returns the raw CoT (no auto-strip).
- It's a **3B**: it agreed here because the evidence was clear-cut. On ambiguous cases a small model can be
  confidently wrong — keep it advisory, a second-opinion narrator, never a sole decider.

## Recommendation

Keep as a DISARMED advisory **narrator / second opinion** on the decision-sim's numeric verdict — on-device,
free, private. Do NOT promote to a sizing input. For cleaner output, give it a prompt that does NOT instruct
tool-grounding (it can't ground with `--no-tools`, so it fabricates), and strip `<think>` downstream.

NOTE: `models.json` left UNCOMMITTED (it carries a parallel `glm-5.1→glm-5.2` change I won't sweep). The
lane works at runtime; commit models.json when ready or let it ride the parallel session's next commit.
