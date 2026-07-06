---
name: feedback-ollama-flash-primary-routing
description: "Marcel directive 2026-06-17 (STANDING, all sessions, planning AND building): ollama-cloud peer fan-out DEFAULTS to deepseek-v4-flash (best quality-per-usage); minimax-m3 / kimi-k2.7-code / glm-5.1 also efficient + welcome; AVOID deepseek-v4-pro for bulk (inefficient); glm-5.2 reserve (≈Opus-4.8 max-reasoning tier). Split load with native Sonnet lanes (separate weekly pool)."
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: project
  trig: 
    - ollama peer
    - nano swarm
    - which model
    - deepseek flash
    - lane routing
    - peer dispatch
    - model selection
    - cloud usage
  refs: 
    - "[[ref-ollama-cloud-peer-lane]]"
    - "[[feedback-peers-means-nano-swarm]]"
    - "[[feedback-deepseek-lanes-cheap-strong]]"
    - "[[feedback-sonnet-separate-weekly-quota]]"
  originSessionId: 51f7834d-cf40-4e99-b14a-c821aacd0189
---

RULE: ollama-cloud peer fan-out DEFAULTS to **`deepseek-v4-flash:cloud`** — the quality-per-usage king of the roster (do NOT underestimate it for being a "flash" model; output is excellent for the spend). Efficiency = USAGE PER REQUEST, not raw request count.
- **Efficient + welcome (use freely for breadth):** `deepseek-v4-flash` (primary) · `minimax-m3` · `kimi-k2.7-code` · `glm-5.1`.
- **Reserve (heavier per request — only when the capability is genuinely needed):** `glm-5.2` (≈ Opus-4.8 at max reasoning, top tier) · `deepseek-v4-pro` (inefficient, AVOID for bulk).
- **Split the pool with native Sonnet lanes** (separate weekly quota — see [[feedback-sonnet-separate-weekly-quota]] — run at max reasoning).

WHEN: EVERY session that spins up ollama peers — planning AND building, all lanes. Standing default, not per-task.

DO: reach for Flash first; fan out across minimax-m3 / kimi-k2.7 / glm-5.1 for breadth; pair with Sonnet to spread across the two cheap pools (ollama + Sonnet-weekly).

DONT: default to `deepseek-v4-pro` (≈2× minimax's usage for half the requests); don't reserve Flash to "small" jobs — it's the workhorse.

WHY: weekly Cloud-usage screenshot Marcel read off (2026-06-17), requests vs usage-bar footprint — `deepseek-v4-flash` 381 req = tiny bar (BEST); `minimax-m3` 625 req = <½ Pro's usage; `kimi-k2.7-code` 560 req = efficient; `glm-5.1` 164 req efficient; `deepseek-v4-pro` 325 req = bar ≈2× minimax's (COSTLY); `glm-5.2` 75 req = top-tier-heavy; nemotron-3-ultra 173, glm-5.2 75, kimi-k2.6 8 = low absolute. Weekly pool 37.9% used, session 26.1%. Refines/sharpens the ollama-cloud half of [[feedback-deepseek-lanes-cheap-strong]] (which already flagged deepseek-v4-pro as high-usage) with hard evidence.

SEE: [[ref-ollama-cloud-peer-lane]] (dispatch mechanism `ai llm ollama-cloud --model X:cloud`), [[feedback-peers-means-nano-swarm]], [[feedback-sonnet-separate-weekly-quota]].
