# gemma-4-12B-coder-fable5 — local trade-analysis lane eval (2026-06-18)

## What

Wired **gemma-4-12B-coder-fable5-composer2.5** as a DISARMED/advisory local trade-analysis lane and ran
the **same** observatory trade-decision test used for vibethinker-local (apples-to-apples).

- Source: `hf.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF:Q4_K_M` (7.38 GB). Apache-2.0,
  base `google/gemma-4-12B-it`, fine-tuned on verifiable Python coding data with CoT. Native thinking
  mode, 256K ctx (card). Card notes reduced safety guardrails (coding focus) — irrelevant for trade-data analysis.
- Lane: `gemma4-coder-local` in `.claude/config/models.json` → `llm_compat_lanes` (mirrors gemma-local /
  vibethinker-local; `ollama-local`, `localhost:11434`, resolves by direct key lookup). `num_ctx` capped
  16384 (Metal working-set policy; card's 256K won't fit 16GB). `llm-lane` forces temp 0 (deterministic).
- Invoke: `node _SYSTEM/Scripts/llm-lane.mjs gemma4-coder-local --no-tools "<prompt>"`.

## DISARMED posture

Advisory only — referenced ONLY by models.json, nothing in `_SYSTEM/Scripts/` or `~/Library/LaunchAgents/`
invokes it. Not wired into any sizing / config-write / overseer path. Runs only on an explicit call.

## Real test (same live observatory trade-decision prompt as vibethinker)

Same prompt: real 2026-06-17 BTC-USD + SOL-USD state, 0/205-factor edge audit, decision-sim FLAT.

| Metric | gemma4-coder-12B | vibethinker-3B (2026-06-17) |
|---|---|---|
| Size | 7.4 GB (Q4_K_M) | 1.9 GB (Q4_K_M) |
| Latency | **56 s** | 40 s |
| Output | **556 B** — clean 4-line answer | 7.2 KB (~110-line `<think>` + answer) |
| Verdict | **BTC FLAT · SOL FLAT** ✓ | BTC FLAT · SOL FLAT ✓ |
| Reasoning | tight + correct: cited FDR audit + fee-drag negative EV + crowded-funding insufficient | sound but verbose/meandering |
| Tool hallucination | **NONE** (used prompt data directly) | YES (faked `read_file('strategy_audit.txt')`) |
| CoT visible | no (`<think>` not surfaced on this prompt) | yes (needs `<think>`-strip) |
| Post-processing | none needed | strip `<think>` for terse verdict |

Verbatim verdict: *"zero factors survived FDR correction, meaning there is no measured statistical edge at
the 1-minute horizon... expected net per trade trending toward negative EV from fee drag alone... BTC-USD:
FLAT / SOL-USD: FLAT."*

## Assessment

**gemma4-coder-12B is the better trade-analysis lane of the two.** Same correct FLAT verdict, but tighter
reasoning, **no fabricated evidence**, and output that needs zero post-processing. The coding-CoT training
transfers well to quantitative trade reasoning (quant trading is algorithmic/mathematical).

Tradeoffs vs vibethinker-3B: 4× the disk (7.4 vs 1.9 GB), ~40% slower (56 vs 40 s), and it did **not**
surface a verbose chain-of-thought on this prompt (thinking mode not enabled by the ollama template / it
chose concision). If the long visible CoT is itself the asset, vibethinker shows more of its work; if a
clean actionable verdict is the goal, gemma4-coder wins.

## Recommendation

Promote `gemma4-coder-local` to the **preferred** DISARMED advisory local trade-analysis lane (narrator /
second opinion on the decision-sim's numeric verdict) — on-device, free, private, no hallucinated grounding.
Keep `vibethinker-local` as the lighter/faster option when disk or speed matters. Neither is a sizing input.

NOTE: `models.json` left UNCOMMITTED (carries a parallel `glm-5.1→glm-5.2` change + both new local lanes);
commit when ready or let it ride the parallel session's next commit. Both lanes work at runtime now.
