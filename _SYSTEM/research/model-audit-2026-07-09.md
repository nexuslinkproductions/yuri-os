# MURE Model Capability Audit — 2026-07-09

**Purpose:** Configure ~24 MURE agent roles against 2–4 model variants each.
**Scope:** Subscription-accessible models only. Sources cited per claim. Confidence tagged [VERIFIED]/[ESTIMATED]/[UNKNOWN].
**Generated:** 2026-07-09 | Auditor: read-only research subagent | Sources: vendor docs, VentureBeat, Friendli, vals.ai, Anthropic news, MiniMax blog, progressive robot, lushbinary

---

## ⚠️ CRITICAL FLAGS BEFORE READING

1. **Fable 5 export control risk:** Following a US government export control directive (issued ~June 9–16, 2026), Anthropic reportedly took Claude Fable 5 and Claude Mythos 5 offline for all users, including non-US access. As of the Anthropic docs page fetched today (July 9, 2026), Fable 5 is listed as "generally available." Status appears resolved but is a **known regulatory risk surface** for Austrian/European operator access. Verify actual API access before routing any agent to `claude-fable-5`. Source: [VentureBeat, Jun 16 2026] + [Anthropic models overview, fetched Jul 9 2026].

2. **OMP routes DeepSeek via `ollama-cloud/`** (see catalog): `ollama-cloud/deepseek-v4-flash` and `ollama-cloud/deepseek-v4-pro`. If the Ollama Cloud subscription drops (~$20/mo), these routes break. Direct API routing via `api.deepseek.com/v1` is the resilient path — recommend adding parallel direct-API provider entries.

3. **GLM coding-plan practical context throttle:** User reports (Reddit r/ZaiGLM) indicate auto-compact triggers at ~95K tokens in the coding plan, even for models with larger official context windows. This affects GLM-5 and GLM-5.1 more than GLM-5.2 (which has better KV efficiency via IndexShare).

---

## ANTHROPIC MODELS (Claude Pro ×5 subscription)

---

### `claude-fable-5`

- **Tier:** apex
- **Context window:** 1M tokens [VERIFIED — Anthropic docs + migration guide, Jul 9 2026]
- **Pricing:** $10/MTok input · $50/MTok output [VERIFIED — Anthropic models overview]
- **Strengths:**
  - SWE-bench Verified **95.0%** — current #1 on vals.ai leaderboard [VERIFIED — vals.ai, Jul 2026]
  - "Next-generation intelligence for long-running agents" per Anthropic positioning
  - Same Messages API and tool-use patterns as Opus 4.8 — zero migration friction
  - 1M context with no extended-thinking overhead (no separate thinking token cost)
  - Positioned by Anthropic above Opus 4.8 for complex agentic + enterprise work
- **Weaknesses:**
  - 2× price premium over Opus 4.8 — cost runaway risk on long agentic runs
  - No extended thinking (confirmed absent in the API table) [VERIFIED — Anthropic docs]
  - Export control history: US gov directive June 2026 caused temporary takedown [VERIFIED — VentureBeat Jun 16 2026] — access status for EU operators needs live verification
  - Mythos 5 (same specs, more capable) is invite-only (Project Glasswing) — effectively inaccessible without approval
  - Least cost-efficient for high-volume bulk tasks
- **Vision:** Yes — text + image input [VERIFIED — Anthropic docs: "all current Claude models support text and image input"]
- **Speed:** [ESTIMATED] Likely slower than Sonnet 5 due to model scale; no public tok/s figure
- **Reasoning depth:** #1 on SWE-bench Verified (95.0%) [VERIFIED]; top of class on long-horizon agentic work
- **Code specialty:** Long-horizon agentic engineering, complex multi-file refactors, large codebase reasoning; final synthesis and definitive judgment
- **Tendencies:** Expensive to run at scale; may over-engineer when a simpler answer suffices; flag for the anti-over-engineering rule
- **Tool/agent use:** Excellent — same API surface as Opus 4.8, designed for multi-step tool chains [VERIFIED — Anthropic news, Sonnet 5 launch context]
- **Cost access:** Claude Pro subscription; also via API at $10/$50 pricing
- **Sources:** [1] https://platform.claude.com/docs/en/about-claude/models/overview [2] https://vals.ai/benchmarks/swebench [3] https://venturebeat.com/technology/anthropic-blocks-all-public-access-to-claude-fable-5

---

### `claude-opus-4-8`

- **Tier:** heavy reasoning flagship
- **Context window:** 1M tokens [VERIFIED — Anthropic docs]
- **Pricing:** $5/MTok input · $25/MTok output [VERIFIED — Anthropic docs]
- **Strengths:**
  - SWE-bench Verified **88.6%** [VERIFIED — vals.ai]
  - FrontierSWE (Dominance): **75.1%** [VERIFIED — VentureBeat/z.ai comparison]
  - MCP-Atlas: **77.8%** [VERIFIED — VentureBeat, Jul 2026]
  - Humanity's Last Exam w/ tools: **57.9%** [VERIFIED — VentureBeat]
  - Solid extended thinking support (Opus 4.x series) [ESTIMATED — known from 4.7/4.8 series]
  - Best Anthropic model for adversarial reasoning, architecture decisions, final synthesis
- **Weaknesses:**
  - 5× more expensive than Haiku; 1.7× more than Sonnet 5 at standard pricing
  - Sonnet 5 now covers most of its agentic territory at 60% of the price [VERIFIED — Anthropic Sonnet 5 launch]
  - Fable 5 strictly outperforms on SWE-bench Verified (88.6% vs 95%)
  - No competitive edge on raw throughput for bulk tasks
- **Vision:** Yes [VERIFIED — Anthropic docs]
- **Speed:** [ESTIMATED] ~40–80 tok/s API; slower than Sonnet-class
- **Reasoning depth:** Near-apex; ranks 2nd on SWE-bench Verified (88.6%) behind Fable 5
- **Code specialty:** Complex agentic coding, enterprise-scale work, adversarial review, architecture
- **Tendencies:** Occasionally verbose on simple tasks; cost scales fast in long reasoning chains
- **Tool/agent use:** Excellent — reference model for MURE helmsman and adjudicator roles
- **Cost access:** Claude Pro subscription; API at $5/$25
- **Sources:** [1] https://platform.claude.com/docs/en/about-claude/models/overview [2] https://vals.ai/benchmarks/swebench [3] https://venturebeat.com (Z.ai GLM-5.2 comparison table)

---

### `claude-sonnet-5`

- **Tier:** medium (most agentic Sonnet to date)
- **Context window:** 1M tokens [ESTIMATED — same family; Anthropic docs confirm for the model table row]
- **Pricing:** $3/MTok input · $15/MTok output (intro pricing $2/$10 through Aug 31 2026) [VERIFIED — Anthropic Sonnet 5 launch]
- **Strengths:**
  - Performance close to Opus 4.8 at ~60% cost — best cost-performance ratio in Anthropic fleet right now [VERIFIED — Sonnet 5 launch blog]
  - SWE-bench Verified: ~83.4% [ESTIMATED — codingfleet.com, Jul 1 2026: "within 2.2 points of Opus 4.8 at 83.4%"]
  - SWE-bench Pro: ~80.4% [ESTIMATED — vellum.ai, Jun 30 2026]
  - Strong multi-step tool use, browser + terminal, completes complex tasks where Sonnet 4.6 stalled
  - Self-checks output without being asked (emergent verification behavior)
  - Default model for Free and Pro plans as of June 30, 2026
- **Weaknesses:**
  - Below Opus 4.8 on heavy adversarial reasoning and architecture synthesis
  - Extended thinking: [UNKNOWN — not confirmed for Sonnet 5]
  - Cybersecurity task ability explicitly noted as "much lower than Opus models" [VERIFIED — Sonnet 5 system card reference in launch blog]
  - Still less capable than Fable 5 or Opus 4.8 for highest-stakes final judgments
- **Vision:** Yes [VERIFIED — Anthropic family standard]
- **Speed:** [ESTIMATED] Faster than Opus 4.8; near Sonnet 4.6 latency
- **Reasoning depth:** Approaches Opus 4.8 on agentic tasks; 83.4% SWE-verified vs 88.6% [ESTIMATED]
- **Code specialty:** Sustained coding, debugging, integration work, multi-file refactors, PR review
- **Tendencies:** More likely to complete tasks end-to-end vs stop short (key upgrade over S4.6); lower security task capability is a SENTINEL disqualifier
- **Tool/agent use:** Excellent — "finishes complex tasks where previous Sonnet models would stop short" [VERIFIED — partner quote, Anthropic blog]
- **Cost access:** Claude Pro subscription; API at intro $2/$10 until Aug 31, then $3/$15
- **Sources:** [1] https://www.anthropic.com/news/claude-sonnet-5 [2] https://codingfleet.com/blog/claude-fable-5-vs-claude-sonnet-5/ [3] https://www.vellum.ai/blog/claude-sonnet-5-benchmarks-explained

---

### `claude-sonnet-4-6`

- **Tier:** medium workhorse
- **Context window:** 1M tokens [VERIFIED — search snippet: "Claude Fable 5, Opus 4.8, and Sonnet 4.6 all support 1 million token context windows"]
- **Pricing:** $3/MTok input · $15/MTok output [VERIFIED — Anthropic docs table]
- **Strengths:**
  - Proven workhorse — YURI's current primary model (this very session)
  - Reliable tool use, code generation, long-context synthesis
  - AI Analysis Intelligence Index: **47** at max reasoning effort [VERIFIED — Friendli: "comparable to Claude Sonnet 4.6 at maximum reasoning effort"]
  - Excellent instruction-following and multi-step reasoning
  - Extensive real-world testing — known failure modes are well-documented
- **Weaknesses:**
  - Strictly dominated by Sonnet 5 on agentic benchmarks (Sonnet 5 is the new minimum bar)
  - Lower agentic task completion rate vs Sonnet 5 — "stalls halfway" on complex tasks [VERIFIED — Anthropic partner quote]
  - Same price as Sonnet 5 but inferior performance; justify only for backward-compat or batch-stable setups
- **Vision:** Yes [VERIFIED — Anthropic docs]
- **Speed:** [ESTIMATED] ~50–100 tok/s API; good throughput
- **Reasoning depth:** Solid but behind Sonnet 5 on agentic benchmarks; good enough for orchestration scaffolding, not final synthesis
- **Code specialty:** Reliable mid-tier coding, reviews, synthesis, planning; not the best for new feature implementation
- **Tendencies:** Occasionally stops short on complex agentic tasks (documented gap vs Sonnet 5); otherwise reliable
- **Tool/agent use:** Good — solid multi-step tool use but less autonomous than Sonnet 5
- **Cost access:** Claude Pro subscription; API at $3/$15
- **Sources:** [1] https://www.anthropic.com/news/claude-sonnet-5 (comparison) [2] https://friendli.ai/blog/deepseek-v4-pro-flash (AI Index benchmark)

---

### `claude-haiku-4-5`

- **Tier:** cheap (fastest with near-frontier intelligence)
- **Context window:** 200K tokens [VERIFIED — search snippet: "Haiku 4.5 supports 200,000 tokens"]
- **Pricing:** $1/MTok input · $5/MTok output [VERIFIED — Anthropic docs table]
- **Strengths:**
  - Fastest Claude model; lowest cost
  - "Near-frontier intelligence" at budget price — suitable for read-only/census/light tasks
  - Vision supported
  - Well-suited for context-loading, scanning, and mechanical operations
- **Weaknesses:**
  - 200K context (5× less than the rest of the Anthropic fleet)
  - Not suitable for deep reasoning, architecture, or security review
  - Can't match Sonnet-class on multi-step tool chains
  - Will stub-out or shallow-pass complex reasoning tasks
- **Vision:** Yes [VERIFIED — Anthropic docs]
- **Speed:** Fastest in Anthropic fleet [VERIFIED — "fastest model" per docs]
- **Reasoning depth:** Weakest in current fleet; suitable for pattern-matching, filtering, routing, census
- **Code specialty:** Simple scaffolding, mechanical edits, test scaffolds, file reads; not deep implementation
- **Tendencies:** Superficial reasoning on hard problems; good at following explicit templates
- **Tool/agent use:** Basic — follows simple tool contracts; multi-hop chains degrade fast
- **Cost access:** Claude Pro subscription; API at $1/$5
- **Sources:** [1] https://platform.claude.com/docs/en/about-claude/models/overview [2] https://medium.com/@nareshkukkala/which-claude-model-should-you-actually-use-in-2026

---

## Z.AI MODELS (GLM Coding Plan ×20 quota)

---

### `zai/glm-5.2`

- **Tier:** apex (open weights, available via API and Coding Plan)
- **Context window:** 1M tokens — stable, via IndexShare architecture [VERIFIED — z.ai blog, VentureBeat]
- **Params:** 753 billion (open weights, MIT license) [VERIFIED — VentureBeat Jun 16 2026]
- **Pricing:** $12.60/mo Coding Plan entry; API pricing available on docs.z.ai [VERIFIED — VentureBeat]
- **Strengths:**
  - SWE-bench Pro: **62.1** — beats GPT-5.5 (58.6) and GLM-5.1 (58.4) [VERIFIED — VentureBeat/z.ai]
  - FrontierSWE (Dominance): **74.4%** — near-tie with Claude Opus 4.8 (75.1%) [VERIFIED]
  - MCP-Atlas: **77.0** — beats GPT-5.5 (75.3) [VERIFIED]
  - Humanity's Last Exam w/ tools: **54.7** — beats GPT-5.5 (52.2) [VERIFIED]
  - IndexShare reduces per-token compute by 2.9× at 1M context vs predecessor [VERIFIED — VentureBeat]
  - Selectable thinking modes: Max and High [VERIFIED — VentureBeat]
  - Open weights (MIT) — can self-host for full data sovereignty; no regulatory risk
  - Costs 1/6th of GPT-5.5 at API pricing [VERIFIED — VentureBeat headline]
- **Weaknesses:**
  - Practical context via Coding Plan: user reports of auto-compact at ~95K [ESTIMATED — Reddit r/ZaiGLM, applies more to older GLM-5]
  - Benchmarks are vendor-reported; independent third-party replication still limited [ESTIMATED]
  - No vision modality (text-only for GLM-5.x series) [VERIFIED — GitHub zai-org/GLM-V is separate]
  - Multi-token prediction layer adds inference complexity for some deployments
  - 753B params means self-hosting requires serious compute
- **Vision:** No — vision is a separate GLM-V track (see glm-4.6v) [VERIFIED — GitHub zai-org/GLM-V]
- **Speed:** [ESTIMATED] MTP speculative decoding boosts accepted token length by 20% — faster than base inference
- **Reasoning depth:** Near Opus 4.8 on agentic benchmarks; leads open-source field [VERIFIED]
- **Code specialty:** Long-horizon agentic coding, tool use, multi-step software engineering, synthesis
- **Tendencies:** Very strong for sustained agentic loops; less tested on security-critical review tasks
- **Tool/agent use:** Excellent — MCP-Atlas 77.0 confirms strong tool chain fidelity [VERIFIED]
- **Cost access:** Z.ai Coding Plan (×20 quota pool); also direct API. Open weights downloadable from HuggingFace.
- **Sources:** [1] https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5 [2] https://z.ai/blog/glm-5.2 [3] https://huggingface.co/zai-org/GLM-5.2

---

### `zai/glm-5.1`

- **Tier:** heavy (previous flagship, now secondary to 5.2)
- **Context window:** 200K tokens; 128K max output [VERIFIED — progressiverobot.com citing official Z.ai docs]
- **Params:** [UNKNOWN — not stated in available sources]
- **Strengths:**
  - SWE-bench Pro: **58.4** [VERIFIED — VentureBeat]
  - Can sustain autonomous work for up to 8 hours continuously [VERIFIED — official Z.ai claim via progressiverobot]
  - Long-horizon engineering — planning, execute, benchmark, revise, iterate
  - Open source (MIT license) [VERIFIED]
  - Available on Ollama and coding ecosystems
- **Weaknesses:**
  - Superseded by GLM-5.2 on all major benchmarks — route to 5.2 unless quota is constrained
  - 200K context is 5× less than GLM-5.2's 1M
  - No vision
- **Vision:** No [VERIFIED — text only per progressiverobot]
- **Speed:** [ESTIMATED] Faster than 5.2 due to smaller context handling; no public tok/s
- **Reasoning depth:** Below GLM-5.2; good for sustained engineering loops, lower on synthesis
- **Code specialty:** Long-horizon agentic coding, tool use; similar profile to 5.2 but lower ceiling
- **Tendencies:** Strong engineering executor; 8-hour autonomy claim suggests good long-session stability
- **Tool/agent use:** Good — agentic engineering focus [VERIFIED — official positioning]
- **Cost access:** Z.ai Coding Plan (×20 pool); Ollama; HuggingFace
- **Sources:** [1] https://www.progressiverobot.com/2026/04/15/what-is-glm-5-1/ [2] VentureBeat (benchmark table)

---

### `zai/glm-5`

- **Tier:** medium
- **Context window:** 128K [ESTIMATED — based on "128K sequence length" in training per GLM-5.2 blog note]; practical via coding plan: ~95–100K before auto-compact [VERIFIED — Reddit r/ZaiGLM]
- **Released:** February 2026 [VERIFIED — z.ai/blog/glm-5 published Feb 12 2026]
- **Strengths:**
  - "Vibe coding to agentic engineering" — early agentic coding model, proved concept
  - Strong enough for light-to-medium implementation tasks
  - Available on coding plan
- **Weaknesses:**
  - Context auto-compact triggers at ~95K via coding plan — practical limit is ~80K usable [VERIFIED — Reddit]
  - Strictly superseded by GLM-5.1 and 5.2 — use only when 5.x variants are quota-constrained
  - No vision
  - Benchmark data scarce for this specific version [UNKNOWN]
- **Vision:** No
- **Speed:** [ESTIMATED] Faster than 5.1/5.2 due to smaller model
- **Reasoning depth:** Below 5.1; suitable for mechanical coding tasks, scaffolding
- **Code specialty:** Light implementation, scaffolding, basic debugging
- **Tendencies:** Reliable for scoped tasks; degrades on long context sessions
- **Tool/agent use:** Adequate for simple tool contracts; not multi-hop
- **Cost access:** Z.ai Coding Plan
- **Sources:** [1] https://z.ai/blog/glm-5 [2] https://www.reddit.com/r/ZaiGLM/comments/1rxbmow/psa_autocompact_glm5_via_zai_plan_at_95k_context/

---

### `zai/glm-5-turbo`

- **Tier:** cheap/flash
- **Context window:** [UNKNOWN — threads.com post does not state; likely ≤128K]
- **Released:** ~March 2026 [VERIFIED — threads.com post, Mar 15 2026]
- **Strengths:**
  - Designed for "always-on agents" — low latency, high throughput [VERIFIED — threads.com description]
  - Cheapest Z.ai model; suitable for bulk tasks and high-frequency loops
- **Weaknesses:**
  - Context window [UNKNOWN] — assume 64–128K until confirmed
  - Quality below GLM-5; no benchmark data available [UNKNOWN]
  - Not suitable for reasoning-intensive or long-horizon work
- **Vision:** No [ESTIMATED]
- **Speed:** Fastest in Z.ai lineup [VERIFIED — "faster variant designed for always-on agents"]
- **Reasoning depth:** [UNKNOWN — assume shallow; optimized for throughput]
- **Code specialty:** Scaffolding, file census, mechanical edits, bulk formatting
- **Tendencies:** Speed-optimized; expect quality degradation on complex reasoning
- **Tool/agent use:** [UNKNOWN — likely basic]
- **Cost access:** Z.ai Coding Plan (cheapest tier)
- **Sources:** [1] https://www.threads.com/@testingcatalog/post/DV6ZZMtgInn/z-ai-announced-glm-turbo

---

### `zai/glm-4.6v`

- **Tier:** vision specialist
- **Context window:** 128K (trained with 128K sequence length) [VERIFIED — GitHub zai-org/GLM-V: "GLM-4.6V scales its context window to 128k tokens in training"]
- **Strengths:**
  - State-of-the-art visual understanding for its parameter scale [VERIFIED — GitHub description]
  - Handles image input for design, diagram, screenshot, and visual reasoning tasks
  - Part of the GLM-V track (separate from GLM-5.x text series)
- **Weaknesses:**
  - Vision specialist — not competitive with GLM-5.x for pure text/coding tasks
  - 128K context only
  - Benchmark data for this specific version sparse [ESTIMATED]
  - If MiniMax-M3 is in the stack (which also has vision), GLM-4.6V is redundant for most tasks
- **Vision:** Yes — image input, visual understanding focus [VERIFIED]
- **Speed:** [UNKNOWN]
- **Reasoning depth:** Below GLM-5.x series on text benchmarks [ESTIMATED]
- **Code specialty:** Visual layout reasoning, screenshot-to-code, diagram understanding
- **Tendencies:** Optimized for visual perception; text-only tasks will underperform GLM-5.x
- **Tool/agent use:** [UNKNOWN]
- **Cost access:** Z.ai API / Coding Plan [ESTIMATED]
- **Sources:** [1] https://github.com/zai-org/GLM-V

---

## DEEPSEEK MODELS (direct API, api.deepseek.com/v1)

> **Routing note:** OMP catalog currently routes these via `ollama-cloud/deepseek-v4-*`. If Ollama Cloud subscription drops, swap to direct `api.deepseek.com/v1` endpoints. Model names on direct API: `deepseek-ai/DeepSeek-V4-Pro` and `deepseek-ai/DeepSeek-V4-Flash`.

---

### `deepseek-v4-pro`

- **Tier:** heavy (leads open-weight agentic coding)
- **Context window:** 1M tokens [VERIFIED — Friendli blog, multiple sources]
- **Architecture:** Large MoE (exact active params not published) [VERIFIED — Friendli: "two MoE models"]
- **Thinking modes:** Non-think / Think High / Think Max (384K+ recommended for Think Max) [VERIFIED — Friendli]
- **Strengths:**
  - SWE-bench Verified: **80.6%** (w/ Think Max) [VERIFIED — Friendli May 2026]
  - LiveCodeBench: **93.5** [VERIFIED — Friendli]
  - Codeforces: **3206** [VERIFIED — Friendli] — elite competitive coding
  - **Leads all open-weight models on agentic coding** per Friendli [VERIFIED]
  - Text-only: no vision overhead, pure reasoning depth
  - Configurable reasoning effort (Non-think = cheap, Think Max = maximum depth)
  - Topped OpenRouter rankings immediately post-launch [VERIFIED — Friendli]
- **Weaknesses:**
  - Text-only — no vision input [VERIFIED — Friendli: "Text-in, text-out language models. No vision or audio."]
  - Think Max requires at least 384K context headroom [VERIFIED]
  - Long thinking chains = high latency for real-time pipelines
  - Agentic testing lighter than GLM-5.2 on tool-specific evals (MCP-Atlas not cited for V4-Pro)
  - DeepSeek V4 Flash is within 2 points on most evals at lower cost [VERIFIED — Friendli]
- **Vision:** No [VERIFIED]
- **Speed:** [ESTIMATED] Slower than Flash variant; Think Max adds significant latency
- **Reasoning depth:** Top-tier open-weight; competitive with Opus 4.8 on coding benchmarks [VERIFIED]
- **Code specialty:** Agentic coding, long-horizon debugging, algorithm design, competitive programming
- **Tendencies:** Excellent on pure reasoning; may need guidance on multi-file project context
- **Tool/agent use:** Good [ESTIMATED — strong agentic coding implies tool use; not explicitly MCP-Atlas benchmarked]
- **Cost access:** Direct API (api.deepseek.com/v1); also via Ollama Cloud (current OMP route)
- **Sources:** [1] https://friendli.ai/blog/deepseek-v4-pro-flash [2] https://medium.com/@leucopsis/deepseek-v4-review

---

### `deepseek-v4-flash`

- **Tier:** medium-cheap (near-frontier capability at fraction of compute)
- **Context window:** 1M tokens [VERIFIED — Friendli]
- **Params:** 284B total, 13B active per token (MoE) [VERIFIED — Friendli]
- **Thinking modes:** Non-think / Think High / Think Max [VERIFIED — Friendli]
- **Strengths:**
  - LiveCodeBench: **91.6** [VERIFIED — Friendli]
  - GPQA Diamond: **88.1** [VERIFIED — Friendli]
  - MMLU-Pro: **86.2** [VERIFIED — Friendli]
  - SWE-bench Verified: **79.0** [VERIFIED — Friendli]
  - AI Analysis Intelligence Index: **47** — comparable to Claude Sonnet 4.6 at max reasoning [VERIFIED — Friendli]
  - "Within two points of V4-Pro on most reasoning evals" [VERIFIED — Friendli]
  - Fraction of V4-Pro's compute footprint
  - Surged to top of OpenRouter usage rankings [VERIFIED]
  - Non-think mode: extremely low latency for bulk tasks
- **Weaknesses:**
  - Text-only — no vision [VERIFIED]
  - Below V4-Pro on Codeforces and extreme reasoning tasks
  - Same Think Max context recommendation (384K+) applies
  - No MCP-Atlas or FrontierSWE data published
- **Vision:** No [VERIFIED]
- **Speed:** [ESTIMATED] 2–3× faster than V4-Pro; Non-think mode is very fast
- **Reasoning depth:** Near V4-Pro; below GLM-5.2 on SWE-Bench Pro (79.0 vs 62.1 on different benchmarks — compare carefully)
- **Code specialty:** Agentic coding, bulk analysis, mechanical edits with reasoning, calibration tasks
- **Tendencies:** Highly efficient; good default for cost-constrained bulk work with occasional deep reasoning
- **Tool/agent use:** Good [ESTIMATED — same architecture as V4-Pro]
- **Cost access:** Direct API (api.deepseek.com); Ollama Cloud (current OMP route, fragile)
- **Sources:** [1] https://friendli.ai/blog/deepseek-v4-pro-flash

---

## MINIMAX MODELS (Ultra tier subscription)

---

### `minimax-portal/MiniMax-M3`

- **Tier:** heavy (coding specialist + multimodal, open weights)
- **Context window:** 1M tokens [VERIFIED — minimax.io blog]
- **Architecture:** MSA (MiniMax Sparse Attention) — 1/20 compute per token at 1M vs predecessor [VERIFIED — minimax.io]
- **Strengths:**
  - SWE-bench Pro: **59.0%** [VERIFIED — minimax.io]
  - Terminal-Bench 2.1: **66.0%** [VERIFIED]
  - MCP Atlas: **74.2%** [VERIFIED]
  - SWE-fficiency: **34.8%** [VERIFIED]
  - KernelBench Hard: **28.8%** [VERIFIED — notable for low-level perf work]
  - **Native multimodal: image + video input** [VERIFIED — minimax.io]
  - Desktop computer operation capability [VERIFIED — minimax.io]
  - First and only open-weight model with 1M context + multimodal + agentic per minimax [VERIFIED]
  - 9× faster prefilling, 15× faster decoding vs M2 at 1M context [VERIFIED]
  - "Approaches frontier closed-source models in bugfix, frontend/backend, perf optimization" [VERIFIED]
- **Weaknesses:**
  - SWE-bench Pro (59.0%) below GLM-5.2 (62.1%) and DeepSeek V4-Pro (80.6% Verified, different scale)
  - Sparse attention may underperform full attention on precision-critical narrow tasks (minimax acknowledges matched on "vast majority" — not all) [VERIFIED — minimax.io]
  - Video input processing latency [UNKNOWN]
  - Benchmark reporting is vendor-side; independent validation still sparse for this release
- **Vision:** Yes — image AND video input [VERIFIED]
- **Speed:** Dramatically faster than M2.7 at long context due to MSA [VERIFIED]; absolute tok/s [UNKNOWN]
- **Reasoning depth:** Near frontier on specialized coding; strong agentic performance
- **Code specialty:** Bug fixes, frontend/backend dev, performance optimization, agentic office workflows, interactive user simulation
- **Tendencies:** Optimized for sustained multi-turn collaboration (interactive user simulator training); good at feedback loops
- **Tool/agent use:** Strong — MCP Atlas 74.2%; office-domain agentic work tested [VERIFIED]
- **Cost access:** MiniMax Ultra tier subscription + minimax-portal API
- **Sources:** [1] https://www.minimax.io/blog/minimax-m3 [2] https://www.mindstudio.ai/blog/minimax-m3-coding-model-1m-context-swebench [3] https://lushbinary.com/blog/minimax-m3-vs-m2-7-whats-new-upgrade-guide/

---

### `minimax-portal/MiniMax-M2.7`

- **Tier:** medium (previous generation, pre-MSA)
- **Context window:** 200K [ESTIMATED — lushbinary: "M3 jumps the context window" from M2.7; standard pre-M3 range was 200K]
- **Strengths:**
  - Still available on minimax-portal [ESTIMATED — listed in OMP model aliases]
  - Cheaper/faster than M3 for tasks not requiring 1M context
  - Good baseline for mid-tier coding tasks
- **Weaknesses:**
  - **Strictly superseded by M3** on every published dimension
  - No MSA — quadratic attention complexity for long context; slow at 100K+
  - No video input; image input [UNKNOWN for M2.7 specifically]
  - 200K context vs M3's 1M
  - Availability: may be legacy-access only on Ultra tier [NEEDS VERIFICATION]
- **Vision:** [UNKNOWN — likely image-only at most, pre-M3 architecture]
- **Speed:** [ESTIMATED] Slower than M3 at long context due to full attention
- **Reasoning depth:** Below M3 on all published coding benchmarks [ESTIMATED]
- **Code specialty:** Basic coding, mechanical tasks; route to M3 for anything serious
- **Tendencies:** Well-tested pre-M3 baseline; predictable behavior
- **Tool/agent use:** [UNKNOWN]
- **Cost access:** minimax-portal (Ultra tier) — availability confirmation needed
- **Sources:** [1] https://lushbinary.com/blog/minimax-m3-vs-m2-7-whats-new-upgrade-guide/

---

### `minimax-portal/MiniMax-M2.7-highspeed`

- **Tier:** cheap/fast
- **Context window:** 200K [ESTIMATED — same base as M2.7]
- **Strengths:**
  - Fastest MiniMax option; useful for high-volume, latency-sensitive tasks
  - Lower cost than standard M2.7
- **Weaknesses:**
  - Quality tradeoff vs standard M2.7 [UNKNOWN — typical highspeed vs standard tradeoff]
  - Both M2.7 variants are superseded by M3
  - No unique capability over M3 except raw speed at short context [ESTIMATED]
  - Availability: [NEEDS VERIFICATION]
- **Vision:** [UNKNOWN]
- **Speed:** Fastest MiniMax variant [ESTIMATED]
- **Reasoning depth:** Below M2.7 base [ESTIMATED]
- **Code specialty:** Scaffolding, census, simple formatting; not deep reasoning
- **Tool/agent use:** [UNKNOWN]
- **Cost access:** minimax-portal (Ultra tier) — availability confirmation needed
- **Sources:** OMP model alias list; no dedicated docs found

---

## CODEX PRO (slim check — one paragraph)

OpenAI's **Codex** product is available across ChatGPT subscription tiers (Free through Enterprise) — it is not a standalone "Codex Pro" subscription but rather a Codex IDE/CLI surface bundled with ChatGPT plans. The current flagship model powering Codex is **GPT-5.3-Codex** (launched February 5, 2026 via OpenAI community announcement), with GPT-5.5 also accessible via Codex CLI surfaces including Cursor. The API surface follows the OpenAI Responses API (not the older Completions API), with tool/computer-use variants available. **Assessment:** If Marcel subscribes to ChatGPT Pro ($200/mo), Codex access is bundled. However, GPT-5.5 and GPT-5.3-Codex are already accessible via the Cursor subscription (gpt-5.5-high in the OMP catalog). Adding ChatGPT Pro primarily adds: (1) higher monthly token quota, (2) voice/Advanced Data Analysis, and (3) Sora video — neither of which are load-bearing for MURE. **Recommendation: defer unless Cursor drops or GPT-5.5 quota is exhausted.** Sources: [developers.openai.com/codex/pricing] [community.openai.com GPT-5.3-Codex announcement, Feb 5 2026]

---

## BENCHMARK SUMMARY TABLE

| Model | SWE-Bench | FrontierSWE | MCP-Atlas | LiveCodeBench | Context | Vision | Confidence |
|---|---|---|---|---|---|---|---|
| claude-fable-5 | 95.0% (Verified) | — | — | — | 1M | ✓ | VERIFIED |
| claude-opus-4-8 | 88.6% (Verified) | 75.1% | 77.8 | — | 1M | ✓ | VERIFIED |
| claude-sonnet-5 | ~83.4% (Verified est.) | — | — | — | 1M | ✓ | ESTIMATED |
| claude-sonnet-4-6 | — | — | — | — | 1M | ✓ | ESTIMATED |
| claude-haiku-4-5 | — | — | — | — | 200K | ✓ | VERIFIED |
| zai/glm-5.2 | 62.1 (Pro) | 74.4% | 77.0 | — | 1M | ✗ | VERIFIED |
| zai/glm-5.1 | 58.4 (Pro) | — | — | — | 200K | ✗ | VERIFIED |
| zai/glm-5 | — | — | — | — | ~100K (plan) | ✗ | ESTIMATED |
| zai/glm-5-turbo | — | — | — | — | UNKNOWN | ✗ | UNKNOWN |
| zai/glm-4.6v | — | — | — | — | 128K | ✓ | VERIFIED |
| deepseek-v4-pro | 80.6% (Verified+TM) | — | — | 93.5 | 1M | ✗ | VERIFIED |
| deepseek-v4-flash | 79.0% (Verified) | — | — | 91.6 | 1M | ✗ | VERIFIED |
| minimax-m3 | 59.0% (Pro) | — | 74.2 | — | 1M | ✓ (img+vid) | VERIFIED |
| minimax-m2.7 | — | — | — | — | ~200K | ? | ESTIMATED |
| minimax-m2.7-highspeed | — | — | — | — | ~200K | ? | UNKNOWN |

*SWE-Bench: "Pro" = SWE-bench Pro; "Verified" = SWE-bench Verified (different harnesses; Verified scores are generally higher). TM = Think Max mode.*

---

## MURE ROLE × MODEL RELEVANCE MATRIX

Legend: ★ = best fit | ● = workable | — = avoid | ? = untested

Column abbreviations:
- **F5** = claude-fable-5
- **O48** = claude-opus-4-8
- **S5** = claude-sonnet-5
- **S46** = claude-sonnet-4-6
- **H45** = claude-haiku-4-5
- **G52** = zai/glm-5.2
- **G51** = zai/glm-5.1
- **G5** = zai/glm-5
- **GT** = zai/glm-5-turbo
- **G4V** = zai/glm-4.6v
- **DVP** = deepseek-v4-pro
- **DVF** = deepseek-v4-flash
- **M3** = minimax-m3
- **M27** = minimax-m2.7
- **M27H** = minimax-m2.7-highspeed

| MURE Role | F5 | O48 | S5 | S46 | H45 | G52 | G51 | G5 | GT | G4V | DVP | DVF | M3 | M27 | M27H |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **mure-helmsman** | ★ | ★ | ● | ● | — | ★ | ● | — | — | — | ● | — | ● | — | — |
| **mure-helmsman-glm** | — | — | — | — | — | ★ | ● | — | — | — | — | — | — | — | — |
| **mure-envoy** | — | ● | ★ | ★ | ● | ● | ● | ● | ● | — | ● | ● | ★ | ● | — |
| **mure-scout** | — | ● | ★ | ★ | ● | ● | ● | ● | — | — | ● | ● | ● | — | — |
| **mure-engineer** | ★ | ★ | ★ | ● | — | ★ | ● | ● | — | — | ★ | ● | ★ | ● | — |
| **mure-mechanic** | ● | ★ | ★ | ★ | — | ★ | ★ | ● | — | — | ★ | ● | ★ | ● | — |
| **mure-artificer** | — | — | ● | ● | ★ | ● | ● | ● | ★ | — | ● | ★ | ● | ● | ★ |
| **mure-kernelsmith** | ★ | ★ | ● | ● | — | ★ | ● | — | — | — | ★ | ● | ● | — | — |
| **mure-sentinel** | — | ★ | ● | ● | — | ● | — | — | — | — | ★ | ● | — | — | — |
| **mure-ideator** | ★ | ★ | ● | ● | — | ● | — | — | — | — | ★ | ● | ● | — | — |
| **mure-deliberator** | ★ | ★ | ● | — | — | ★ | ● | — | — | — | ★ | ● | ● | — | — |
| **mure-synthesist** | ★ | ★ | ● | ● | — | ★ | ● | — | — | — | ● | — | ★ | — | — |
| **mure-chronicler** | — | ● | ★ | ★ | ● | ● | ● | ● | ● | — | — | ● | ★ | ● | — |
| **mure-archivist** | — | — | ● | ● | ★ | ● | ● | ★ | ★ | — | — | ★ | ● | ● | ● |
| **mure-adjudicator** | ★ | ★ | ● | — | — | ★ | — | — | — | — | ★ | — | ● | — | — |
| **mure-oracle** | ● | ★ | ★ | ● | — | ★ | ● | — | — | — | ★ | ★ | ★ | — | — |
| **mure-calibrator** | — | ● | ● | ★ | ● | ● | ● | ★ | ★ | — | ● | ★ | ● | ● | ● |
| **mure-steward** | ● | ★ | ● | ★ | — | ● | — | — | — | — | ● | ● | — | — | — |
| **mure-quartermaster** | — | — | ● | ★ | ★ | — | — | ● | ★ | — | — | ★ | — | ● | ★ |
| **mure-architect** | ★ | ★ | ● | ● | — | ★ | ● | — | — | — | ● | — | ● | — | — |
| **mure-evolver** | ★ | ★ | ● | — | — | ★ | — | — | — | — | ● | — | ● | — | — |
| **composer-fast** | — | — | ● | ● | ★ | ● | ● | ● | ★ | — | ● | ★ | ● | ● | ★ |
| **deepseek-flash** | — | — | — | — | — | — | — | — | ★ | — | ● | ★ | — | — | — |
| **fable-synth** | ★ | ● | — | — | — | ● | — | — | — | — | — | — | — | — | — |

---

## MATRIX JUSTIFICATIONS — KEY ★ and — DECISIONS

**mure-helmsman (★ = F5, O48, G52):** Helmsman needs maximum goal-spine reasoning + dispatch planning. Fable 5 leads on SWE-bench (95%); Opus 4.8 is the proven orchestrator; GLM-5.2 is the open-weight alternative near-equivalent. Haiku (—): insufficient reasoning depth for task decomposition at scale.

**mure-helmsman-glm (★ = G52 only):** Dedicated GLM variant of helmsman — G52 is the only model in the Z.ai fleet capable of orchestration-class reasoning. All Anthropic models (—): wrong provider pool for this quota-routing role.

**mure-sentinel (★ = O48, DVP | — = H45, G5, GT, G4V, M27, M27H):** Security review requires deep adversarial reasoning and knowledge of attack classes. Opus 4.8 and DeepSeek V4-Pro Think Max are best positioned. Small/fast models (—) surface attack patterns but cannot reason about chained exploits. Sonnet 5 explicitly noted as having lower cybersecurity task ability [VERIFIED].

**mure-adjudicator (★ = F5, O48, G52, DVP | — = H45, G5, GT, G4V, G51, S46, DVF, M27, M27H):** Adversarial critic needs maximum reasoning depth. Only apex-tier models with strong reasoning can reliably generate refutations that catch real gaps. All fast/cheap models (—): not capable of the adversarial reasoning quality required.

**mure-artificer (★ = H45, GT, M27H | — = F5, O48):** Cheap-fast scaffolding lane — expensive models (—) waste quota on mechanical edits. Haiku (★) is the native Anthropic mechanical-edit layer; GLM-5-turbo (★) for Z.ai bulk; M2.7-highspeed (★) for MiniMax bulk.

**mure-kernelsmith (★ = F5, O48, G52, DVP):** Hot-path perf optimization + Rust/Mojo consolidation requires deep code understanding and perf tradeoff reasoning. M3 KernelBench Hard score (28.8%) is notable here — M3 is a workable option (●). Flash/cheap models (—): cannot reason about assembly-level tradeoffs.

**mure-synthesist (★ = F5, O48, G52, M3):** Large-context lattice synthesis needs 1M context AND strong reasoning. G52 (★) for Z.ai 1M context; M3 (★) for cross-modal synthesis including visual artifacts. S46 (●) works but inferior to S5 for long-context synthesis.

**mure-deliberator (★ = F5, O48, G52, DVP):** Deep monotropic reasoning on one hard sub-problem. Think Max on DVP yields highest LiveCodeBench (93.5) and reasoning depth. Fable 5 tops SWE-Verified. GLM-5.2 Think Max for open-weight alternative.

**mure-quartermaster (★ = S46, H45, GT, DVF, M27H):** Cost accounting and budget routing is light reasoning + structured data work — cheap/fast models handle it well. Expensive apex models (F5, O48, G52): wasteful overkill.

**deepseek-flash role (★ = DVF, GT):** This role IS the DeepSeek Flash worker pattern. DVF is the native assignment; GLM-5-turbo (★) is the Z.ai equivalent for parallel bulk analysis.

**fable-synth role (★ = F5):** Final mastermind synthesizer explicitly expects Fable 5 per catalog definition. O48 is the fallback (●) if Fable 5 access is restricted. All others (—): Fable-synth is an apex-only seat.

---

## ROUTING RECOMMENDATIONS (SHORT FORM)

1. **Apex synthesis / final judgment:** F5 (primary) → O48 (Fable export-block fallback)
2. **Heavy engineering / adversarial:** O48 (primary), DVP Think Max (Z.ai-pool alternative), G52 Think Max
3. **Cost-performance sweet spot:** S5 (Anthropic) or G52 (Z.ai); M3 if vision needed
4. **Bulk / mechanical / always-on:** H45, DVF (non-think), GT, M27H — never apex models
5. **Vision tasks:** M3 (1M ctx + img + video), G4V (128K visual), S46/S5 (Anthropic vision)
6. **Open-weight / regulatory-safe path:** G52 (MIT, self-hostable) is the most capable option
7. **DeepSeek routing:** Add direct `api.deepseek.com/v1` provider entries to OMP NOW — Ollama Cloud route is fragile

---

## OPEN QUESTIONS / NEEDS VERIFICATION

- [ ] Is `claude-fable-5` currently accessible from Austrian/EU IP? (Export control flag — test live)
- [ ] GLM-5.2 practical context limit via Coding Plan at 1M tokens (vs GLM-5 at 95K)?
- [ ] GLM-5-turbo exact context window and benchmark data (no primary source found)
- [ ] MiniMax M2.7 and M2.7-highspeed still available on Ultra tier after M3 launch?
- [ ] DeepSeek V4-Pro/Flash on direct API — any EU data-residency concerns?
- [ ] GLM-5.1 parameter count (not published in available sources)?
- [ ] Sonnet 5 extended thinking support (not confirmed in launch materials)?

---

*Report path: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/research/model-audit-2026-07-09.md`*
*Sources: Anthropic platform docs (Jul 9 2026), VentureBeat (Jun 16 2026), Friendli.ai (May 2026), vals.ai, minimax.io (Jun 2026), progressiverobot.com (Apr 2026), anthropic.com/news (Jun 30 2026), threads.com (Mar 2026), GitHub zai-org/GLM-V*

01MA_MODEL_AUDIT_X_PASS_COMMITTED
