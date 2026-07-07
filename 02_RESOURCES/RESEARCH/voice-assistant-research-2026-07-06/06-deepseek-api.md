# DeepSeek API as the Voice-Assistant Brain (2026-07-06)

> **Lane 6 — DeepSeek research.** Investigates whether Marcel should top up DeepSeek API credit to run `deepseek-v4-flash` as the brain of a clean, rebuilt always-on voice assistant.
> All pricing/feature facts are **verified against official DeepSeek API docs** (`api-docs.deepseek.com`), read 2026-07-06. Third-party claims are flagged `[unverified]` where they conflict.

---

## 0. TL;DR / Bottom line

**Yes — top up DeepSeek. It is the cheapest, lowest-friction reliable brain on Marcel's roster, and the cost is effectively free at his usage.**

- **v4-flash** is the right default voice brain: **$0.14 / $0.28 per 1M tokens** (in/out), **1.11s TTFT**, **83 tok/s** throughput, 1M context. Calculated cost for Marcel's profile: **~$0.01–0.02/day, ~$0.30–0.56/month**. A **$10 top-up lasts ~18 months**.
- **Dual API surface is the killer feature for Marcel**: same key works on an **OpenAI-compatible** endpoint (`api.deepseek.com`) AND an **Anthropic-compatible** endpoint (`api.deepseek.com/anthropic`, i.e. `/v1/messages`). Claude-model names auto-map (`claude-opus*→v4-pro`, `claude-sonnet*/haiku*→v4-flash`), so any Anthropic-SDK / Claude-Code / Pipecat Claude path swaps to DeepSeek by changing 2 env vars.
- **Use it as the conversational "mouth," not the sole "hands."** DeepSeek's multi-turn tool-calling is its weakest dimension (V3-era eval: 81.5% vs Qwen 96.5%; weak trust calibration). Route complex/agentic tool chains to Claude (Max plan, already paid) or GLM.
- **Two load-bearing gotchas** (see §4 and §9):
  1. **Vision ≠ Anthropic endpoint.** The `/anthropic` endpoint marks `type=image` content as **Not Supported**. Screen-vision only works via the **OpenAI-format** endpoint. You get Anthropic-SDK ergonomics **or** vision — not both on one endpoint.
  2. **Thinking mode defaults ON** → TTFT balloons. For voice turns you MUST disable it (`extra_body={"thinking":{"type":"disabled"}}`) or the assistant feels sluggish. A future SDK bump or copy-paste error silently re-enabling it is a real failure mode.

**Recommended architecture:** routed fleet, not a sole brain — DeepSeek v4-flash for fast spoken replies (cheap), Claude Sonnet via Max for agentic tool-heavy turns (reliable, already paid), local Ollama as always-on fallback. GLM stays a free secondary lane, not a dependency.

---

## 1. DeepSeek API — setup, pricing, rate limits

### 1.1 Models (current, post-July-24-2026 deprecation)

The legacy names `deepseek-chat` and `deepseek-reasoner` are **deprecated 2026-07-24 15:59 UTC** and temporarily map to v4-flash's non-thinking / thinking modes. Use the new canonical IDs:

| Model ID | Params (total/active) | Context | Max output | Modes |
|---|---|---|---|---|
| `deepseek-v4-flash` | 284B / 13B (MoE) | 1M | 384K | non-thinking (default-when-set) + thinking |
| `deepseek-v4-pro` | 1.6T / 49B (MoE) | 1M | 384K | non-thinking + thinking (default) |

Both support: **JSON output ✓, Tool Calls ✓, Chat Prefix Completion (beta) ✓, FIM (beta, non-thinking only) ✓.** Architecture: hybrid attention (Compressed Sparse Attention + Heavily Compressed Attention) for long-context efficiency.

### 1.2 Pricing — VERIFIED official docs (per 1M tokens, USD)

| | v4-flash | v4-pro |
|---|---|---|
| **Input (cache miss)** | **$0.14** | $0.435 |
| **Input (cache hit)** | **$0.0028** | $0.003625 |
| **Output** | **$0.28** | $0.87 |
| Concurrency limit | 2500 | 500 |

> ⚠️ **Evidence note:** Several third-party guides (e.g. aimadetools) cite v4-pro at **$1.74 / $3.48**. This **conflicts** with the official pricing page ($0.435 / $0.87) and likely reflects a reseller, a different region, or a conflated "Max" effort tier. **Trust the official number.** The $1.74 figure is `[unverified]` and ignored here.

Billing: `expense = tokens × price`. Granted balance is consumed before topped-up balance. DeepSeek reserves the right to adjust prices — top up based on actual usage, check the page periodically.

### 1.3 Setup (3 minutes)

1. Get a key at `platform.deepseek.com`. New accounts get **5M free tokens** (~enough for ~55k flash image analyses or ~weeks of voice turns).
2. Top up credit (USD; prepaid balance).
3. Pick an endpoint (see §6) — both share one key.

### 1.4 Rate limits — concurrency, not RPM

DeepSeek **does NOT publish RPM/TPM quotas.** The real constraint is **account-level concurrency**:

- v4-flash: **2500 concurrent** requests
- v4-pro: **500 concurrent**

A request holds one concurrent slot from send → final response token (streaming/long-context requests occupy it longer). Approx RPM ≈ `concurrency × 60 ÷ avg-request-seconds`. For voice (short turns, ~1–3s each), the flash ceiling is enormous — **Marcel will never hit it.**

Timeouts: connection closed if inference hasn't started in ~10 min, or request not complete in ~30 min. Peak demand can produce higher latency or 503s. **Capacity expansion is free on request** if ever needed.

### 1.5 Latency (v4-flash on DeepSeek's own infra)

| Metric | v4-flash | v4-pro (Max) |
|---|---|---|
| **Time to first token (TTFT)** | **1.11s** | 1.63s |
| **Output throughput** | **83.3 tok/s** | lower |
| 200-word reply after first token | ~1.5s | slower |

**Critical latency distinction:** for reasoning models, TTFT ≠ time-to-first-**answer**-token. TTFT measures the first token (often start of internal reasoning); the actual answer can lag far behind if thinking mode is on. For voice, **this is why thinking must be off** on normal turns (see §9.2).

Provider alternatives if DeepSeek-hosted latency isn't enough: Together.ai breaks sub-second (0.99s) on v4-pro; DeepInfra 1.19s at lowest blended price. But for Marcel's load, hosted API is fine and simplest.

---

## 2. Function calling — supported, but weakest dimension

### 2.1 Capabilities (verified)

- **Supported** on both v4-flash and v4-pro, in **both** thinking and non-thinking modes.
- **Up to 128 functions** in one call; **parallel function calls** supported.
- **Strict mode (beta):** `base_url="https://api.deepseek.com/beta"`, set `strict:true` on each function. Server validates the JSON schema. Supported schema types: `object, string, number, integer, boolean, array, enum, anyOf, $ref/$def`. Constraints: all object props must be `required` + `additionalProperties:false`; no `minLength/maxLength/minItems/maxItems`.
- Format is the standard OpenAI `tools=[...]` / `tool_choice` shape; on the Anthropic endpoint, the `tools` + `input_schema` shape.

### 2.2 Quality evidence — the honest read

**Positive signal:** V4-Pro scores **73.6 on MCPAtlas Public**, tied with Claude Opus 4.6, ships pre-tuned adapters for Claude Code / OpenCode / CodeBuddy. For single-shot tool selection it's competitive.

**Negative signal (the real concern for an agentic voice assistant):** A 29-case desktop-agent test suite (BFCL + OSWorld methodology, V3-era but architecture-level) found DeepSeek at **81.5% vs Qwen Plus 96.5%** — a 15-point gap. Documented, **non-prompt-fixable** weaknesses:
- **Weak multi-turn tool calling.** Best at single-user-message → one-or-more parallel calls. Degrades on chained tool sequences.
- **Poor trust calibration:** accepts tool results at face value instead of second-guessing — e.g. if a tool returns "file not found," DeepSeek may run 5 more investigation rounds instead of stopping.

**Fireworks' independent testing** corroborates: "the model is not great at multi-turn function calling."

**Verdict:** For a Jarvis-like assistant that **chains MCP tool calls** (computer-use, screen actions, multi-step workflows), DeepSeek is a **risk as the sole tool-caller**. It is fine for simple, single-shot tool use. Route complex agentic chains to Claude.

---

## 3. Vision — multimodal, with one critical endpoint caveat

### 3.1 Yes, V4 has vision

Both v4-pro and v4-flash are multimodal (text + images). Notable: a **"visual primitives"** architecture compresses images to **~90 KV-cache entries per 800×800 image** vs ~870 (Claude) / ~1,100 (Gemini). That efficiency → **~1/170th the per-image cost of Claude Opus** on flash.

**Strengths:** OCR, document/receipt extraction, screenshot analysis, chart/graph reading, UI description, table extraction, handwriting. **Weaker than GPT-4o/Gemini** on: complex multi-step visual reasoning, very fine detail, video (not supported).

### 3.2 ⚠️ THE GOTCHA (load-bearing for Marcel's screen-aware design)

Vision works **ONLY through the OpenAI-format endpoint.** The official Anthropic-compatibility table explicitly marks:

> `content → array, type="image"` → **Not Supported**
> `content → array, type="document"` → **Not Supported**

So if Marcel routes the brain through the Anthropic SDK / `/anthropic` base_url (the ergonomic path that mirrors Claude), **he cannot send screenshots.** Vision requires `api.deepseek.com` with `image_url` content blocks via the OpenAI SDK.

**Implication:** On DeepSeek, "Anthropic-SDK ergonomics" and "vision" are mutually exclusive endpoints. Three viable resolutions for a screen-aware assistant:
1. Use the **OpenAI-format** endpoint for everything (gives vision, loses Anthropic-SDK ergonomics).
2. Keep **Claude/GLM for vision turns**, DeepSeek for text-only turns (clean separation).
3. Hybrid: DeepSeek text via `/anthropic`, vision calls via OpenAI format — two clients, one key.

### 3.3 Vision cost

- v4-flash: ~**$0.000013 per 800×800 image** (~1/170th of Claude Opus).
- v4-pro: ~$0.000157/image.
- Multiple images per request OK; ~90 tokens each, 1M context → thousands theoretically per request.

---

## 4. Voice integration — streaming, TTFT, TTS chunking

### 4.1 The voice pipeline (DeepSeek is the middle, not the whole)

```
User speech → audio capture → STT → conversation manager
   → DeepSeek API (v4-flash, thinking OFF, stream ON)
   → optional tool calls
   → streaming TTS → audio playback → user hears reply
```

DeepSeek does **not** replace STT, TTS, VAD, echo cancellation, or barge-in. ~70% of voice-agent latency comes from LLM inference — so model choice + streaming dominates perceived speed.

### 4.2 Streaming is essential — and works on both endpoints

`stream: true` is **Fully Supported** on both the OpenAI and Anthropic endpoints. Stream the LLM deltas straight into a streaming TTS engine rather than waiting for the full reply — this is the single biggest latency win.

**Chunking rule:** buffer DeepSeek content deltas to a clause/sentence boundary (~one delta, or until punctuation), then hand the fragment to TTS. This lets the assistant start speaking before the full reply is generated.

### 4.3 Latency budget for a voice turn (honest accounting)

TTFT 1.11s is **only** the LLM's first token. End-to-end conversational delay:

| Stage | Estimate |
|---|---|
| STT (streaming, local or cloud) | 0.2–0.5s |
| DeepSeek TTFT (flash, thinking off) | ~1.1s |
| Network RTT to China infra | 0.1–0.4s variable |
| First TTS chunk | 0.2–0.5s |
| **End-to-end to first word heard** | **~1.6–2.5s** |

A 2s response feels "snappy assistant," not "instant Jarvis." To get under ~1.2s perceived, the leverage points are: **(a) disable thinking, (b) streaming TTS chunking, (c) a low-latency STT, (d) local-first audio loop with echo cancellation** (Marcel's current echo problem is an audio-loop bug, not an LLM problem).

---

## 5. Comparison vs GLM Coding Plan (Marcel's $0 lane)

### 5.1 GLM's reliability problem (evidence)

Marcel's GLM Coding Plan is "$0" (promo/free tier) but **flaky**, and the evidence is severe:
- **GLM-5.2 API near-total outage, ~3 consecutive days, June 2026.** On June 15 alone: **285× HTTP 429 errors, ~50% failure rate**, midnight through ~16:51 Beijing time. Production-blocking even for **paid** users.
- 400 "Internal Error" clusters around auth, malformed payloads, parameter validation — most frequent in **third-party IDE integrations** (exactly Marcel's use case).
- Recurring 429s across GLM-4.7, 4.7-Max, 5.2 — a pattern, not a one-off.

### 5.2 Cost comparison for daily voice use

| Lane | Cost model | Reliability |
|---|---|---|
| **GLM Coding Plan (free/promo)** | $0 flat | **Flaky** — multi-day outages, 50% fail days |
| **DeepSeek v4-flash (paid)** | ~$0.01/day, **~$0.30/month** | Stable, no RPM cap, 2500 concurrency |

For Marcel's profile (~150 voice turns/day), **DeepSeek costs less than $0.50/month**. GLM is "free" but costs him reliability. **The rational move: pay the ~$4–6/year for DeepSeek as the primary voice brain, keep GLM as a free secondary lane, never as a single point of failure.** A $10 top-up lasts ~18 months (computed below).

GLM's genuine edge: **1M context** and free adversarial-analysis capacity. Use it for offline batch reasoning, not latency-sensitive voice turns.

---

## 6. The dual API surface (Marcel's biggest integration lever)

DeepSeek exposes **two API formats under one key**:

### 6.1 OpenAI-compatible
- `base_url = https://api.deepseek.com` (or `…/v1` for clients needing the namespace)
- Drop-in for the OpenAI SDK. **Supports vision** via `image_url` content.
- Use this endpoint when you need: vision, the widest tool-call feature surface, `strict` beta mode.

### 6.2 Anthropic-compatible
- `base_url = https://api.deepseek.com/anthropic` → endpoint `/v1/messages`
- Drop-in for the Anthropic SDK, Claude Code, Pipecat's Claude provider.
- **Automatic model mapping:** `claude-opus*` → `deepseek-v4-pro`; `claude-sonnet*` / `claude-haiku*` → `deepseek-v4-flash`. Unsupported model names fall back to v4-flash.
- Env swap:
  ```bash
  export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
  export ANTHROPIC_API_KEY=$DEEPSEEK_API_KEY
  export ANTHROPIC_MODEL=deepseek-v4-pro   # optional; names auto-map
  ```
- **Supported:** `max_tokens, stop_sequences, system, temperature (0–2), top_p, stream, thinking (budget_tokens ignored), tools, tool_choice (none/auto/any/tool), text content, tool_use/tool_result, web_search/server_tool results.`
- **Ignored:** `anthropic-beta, anthropic-version, top_k, cache_control, service_tier, container, mcp_servers.`
- **Not supported:** `image`, `document`, `redacted_thinking`, `code_execution_tool_result`, `mcp_tool_use/result`, `container_upload`.

> **Relevance to L7's Claude/Cursor lane:** a Pipecat voice loop originally built on the Claude/Anthropic provider can hit DeepSeek for streaming tool-calling by changing 2 env vars. Same `/v1/messages` contract. The only loss is vision.

---

## 7. Integration patterns — Python code

### 7.1 OpenAI-compatible client (vision-capable, default for Marcel)

```python
# brain/deepseek_openai.py
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",     # vision-capable endpoint
)

SYSTEM = """You are a helpful voice assistant.
- Speak in short, natural sentences. No markdown.
- Ask only one question at a time.
- Never claim a tool action succeeded unless a tool result confirms it.
"""

def reply_stream(messages, model="deepseek-v4-flash"):
    """Yield content deltas. Feed these straight into a streaming TTS."""
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        # CRITICAL for voice: thinking defaults ON and balloons TTFT. Turn it off.
        extra_body={"thinking": {"type": "disabled"}},
    )
    for chunk in stream:
        tok = chunk.choices[0].delta.content
        if tok:
            yield tok
```

### 7.2 Tool call — single-shot (DeepSeek's strength)

```python
tools = [{
    "type": "function",
    "function": {
        "name": "set_timer",
        "description": "Set a countdown timer in seconds.",
        "parameters": {
            "type": "object",
            "properties": {"seconds": {"type": "integer", "minimum": 1}},
            "required": ["seconds"],
        },
    },
}]

resp = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "remind me in 5 minutes"}],
    tools=tools,
    extra_body={"thinking": {"type": "disabled"}},
)
call = resp.choices[0].message.tool_calls[0]
# call.function.name == "set_timer", call.function.arguments == '{"seconds": 300}'
```

### 7.3 Strict mode (beta) — schema-validated tool calls

```python
strict_client = OpenAI(api_key=KEY, base_url="https://api.deepseek.com/beta")
tools = [{
    "type": "function",
    "function": {
        "name": "switch_model",
        "strict": True,                       # server validates the schema
        "description": "Switch the active brain model.",
        "parameters": {
            "type": "object",
            "properties": {"model": {"type": "string",
                                     "enum": ["flash", "pro", "claude", "glm"]}},
            "required": ["model"],
            "additionalProperties": False,
        },
    },
}]
```

### 7.4 Vision (OpenAI endpoint only!)

```python
import base64
with open("screen.png", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

resp = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}},
        {"type": "text", "text": "What window is frontmost? List clickable UI elements."},
    ]}],
)
```

### 7.5 Anthropic-compatible (drop-in for Claude SDK / Pipecat Claude provider)

```python
import anthropic, os
client = anthropic.Anthropic()   # reads ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY from env
msg = client.messages.create(
    model="deepseek-v4-flash",   # or "claude-sonnet-..." — auto-mapped
    max_tokens=300,
    system=SYSTEM,
    messages=[{"role": "user", "content": [{"type": "text", "text": "hey jarvis"}]}],
)
print(msg.content)
```

### 7.6 Streaming TTS chunking (the latency win)

```python
def speak_stream(messages, tts_stream):
    buf = ""
    for tok in reply_stream(messages):          # DeepSeek content deltas
        buf += tok
        # flush at sentence/clause boundary -> TTS can start speaking early
        if buf.endswith((".", "!", "?", ",", ";", "—")) and len(buf) > 8:
            tts_stream.feed(buf)                # non-blocking; returns immediately
            buf = ""
    if buf.strip():
        tts_stream.feed(buf)
```

---

## 8. Cost model — how much DeepSeek actually costs Marcel

Assumptions per voice turn: **~1000 input tokens** (system prompt ~300 + recent 8-turn history ~600 + transcript ~40), **~80 output tokens** (short spoken reply). System prompt + history repeat across turns → high cache-hit fraction.

| Scenario | Model | Turns/day | Cache hit | Cost/day | Cost/month |
|---|---|---|---|---|---|
| Light | v4-flash | 50 | 60% | $0.004 | $0.12 |
| **Typical** | **v4-flash** | **150** | **70%** | **$0.010** | **$0.30** |
| Heavy | v4-flash | 400 | 75% | $0.024 | $0.71 |
| Complex routed | v4-pro | 30 | 50% | $0.009 | $0.26 |

**Realistic combined month (150 flash + 30 pro turns/day): ~$0.56/month.** A **$10 top-up lasts ~18 months.** A $5 top-up lasts ~9 months. DeepSeek is, for practical purposes, **free at Marcel's scale** — the question is reliability and ergonomics, not cost.

(Compare: routing those same turns through Claude API at Sonnet rates would be ~$15–40/month. Marcel's **Claude Max OAuth is not API-metered**, so for Claude he uses the subscription, not per-token — a different cost axis. See L7.)

---

## 9. Risks & recommendations

### 9.1 Biggest failure mode — pipeline backpressure, not the LLM

The thing most likely to break this architecture is **not** DeepSeek. It's the **audio pipeline** (this maps directly to Marcel's reported "echo feedback loops"): if a fast DeepSeek LLM is paired with a slow/local TTS that backpressures, frames drop, the mic input gets ignored, and barge-in detection fails — locking the assistant in a loop of listening to its own delayed audio. **Fix the audio loop first (echo cancellation, AEC, separate capture/playback threads); the brain swap is the easy part.** (L5/L8 STT-TTS lanes own this.)

### 9.2 Thinking-mode config drift
Thinking defaults ON and silently multiplies TTFT. A SDK update or copy-paste error re-enabling it won't error — the assistant just becomes sluggish. **Pin `thinking:disabled` in the client wrapper** and assert it in a smoke test.

### 9.3 Tool-calling reliability on agentic turns
DeepSeek's multi-turn tool trust calibration is weak. **Don't run chained MCP/computer-use workflows on DeepSeek alone.** Route those to Claude (Max, reliable, paid-for) and let DeepSeek speak the result.

### 9.4 Endpoint choice for screen-aware turns
The `/anthropic` endpoint can't do vision. If the assistant needs to "see the screen," either use the OpenAI endpoint for everything or split: DeepSeek text via `/anthropic`, vision via OpenAI format, Claude for high-stakes screen reasoning.

### 9.5 Data sovereignty
DeepSeek infra is in China (subject to China's National Intelligence Law). For Marcel's personal assistant this is a low-risk, high-convenience tradeoff. If a screen ever contains sensitive client/financial data, route that turn locally (Ollama) or to Claude. Open weights exist (MIT) for full self-host if ever needed.

### 9.6 Recommended fleet routing (MoE at the orchestration layer)

| Turn type | Brain | Why |
|---|---|---|
| Fast spoken reply, Q&A, status | **DeepSeek v4-flash** (thinking off) | cheapest, 1.1s TTFT, pennies |
| Complex reasoning / planning | **DeepSeek v4-pro** (thinking on) | stronger, still cheap |
| Chained tool calls / computer-use | **Claude Sonnet (Max OAuth)** | best tool trust calibration, already paid |
| Screen vision (cheap) | **DeepSeek v4-flash (OpenAI endpoint)** | 1/170th Claude cost |
| Screen vision (high-stakes) | **Claude / GLM** | better multi-step visual reasoning |
| Offline / always-on fallback | **Ollama Pro (local)** | survives API outage |
| Adversarial / 1M-context batch | **GLM-5.2 (free)** | free, large context — not latency-critical |

**DeepSeek is the primary voice brain. It is not the sole brain.**

---

## 10. Sources

**Official DeepSeek API docs (primary, verified 2026-07-06):**
- Models & Pricing — https://api-docs.deepseek.com/quick_start/pricing
- Anthropic API (compatibility table) — https://api-docs.deepseek.com/guides/anthropic_api
- Function Calling — https://api-docs.deepseek.com/guides/function_calling
- Tool Calls (incl. strict mode, thinking-mode tool use) — https://api-docs.deepseek.com/guides/tool_calls
- Rate Limit & Isolation — https://api-docs.deepseek.com/quick_start/rate_limit
- V4 Preview Release — https://api-docs.deepseek.com/news/news260424
- Thinking Mode — https://api-docs.deepseek.com/guides/thinking_mode
- First API Call / quickstart — https://api-docs.deepseek.com/

**Benchmarks / latency:**
- Artificial Analysis — DeepSeek provider performance — https://artificialanalysis.ai/providers/deepseek
- DeepInfra — V4 Pro (Max) latency/throughput — https://deepinfra.com/blog/deepseek-v4-pro-max-api-benchmarks-latency-throughput-cost
- V4-Flash TTFT/tok-s — https://deepseeksr1.com/v4-flash/

**Function-calling quality (adversarial evidence):**
- DeepSeek-V3 function-calling agent eval (81.5% vs Qwen 96.5%) — https://github.com/deepseek-ai/DeepSeek-V3/issues/1108
- Fireworks — multi-turn tool-calling weakness — https://fireworks.ai/blog/function-calling-deepseekv3
- V4 agents / MCP guide (MCPAtlas 73.6) — https://lushbinary.com/blog/deepseek-v4-ai-agents-function-calling-mcp-guide/

**Vision:**
- DeepSeek Vision complete guide (KV-cache efficiency, cost-per-image) — https://www.aimadetools.com/blog/deepseek-vision-complete-guide/  `[pricing figure $1.74/$3.48 conflicts with official — see §1.2]`

**Voice integration:**
- How to Build a Voice Agent with DeepSeek — https://chat-deep.ai/solutions/deepseek-voice-agent/
- Best LLMs for Voice Agents 2026 — https://softcery.com/lab/ai-voice-agents-choosing-the-right-llm
- Pipecat DeepSeek provider — https://docs.pipecat.ai/api-reference/server/services/llm/deepseek

**GLM reliability (comparison):**
- GLM-5.2 severe rate-limiting outage (285× 429, ~50% fail) — https://github.com/zai-org/GLM-5/issues/83
- GLM 4.6 Internal Error 400 — https://zoer.ai/posts/zoer/fix-zai-glm-4-6-internal-error-400
- GLM-4.7 / 4.7-Max 429 reports — https://github.com/continuedev/continue/issues/9800 , /10297
- GLM Coding Plan tiers — https://www.aipricing.guru/z-ai-subscription-pricing/

**Rate limits:**
- Requesty — LLM rate limits comparison — https://www.requesty.ai/blog/rate-limits-for-llm-providers-openai-anthropic-and-deepseek

---

*Cross-lane notes:* L7-ClaudeCursor owns the Claude/Cursor/OMP brain path — the Anthropic-compatible endpoint finding (§6) is the bridge between our lanes. L5/L8 own STT/TTS — the pipeline-backpressure risk (§9.1) is theirs to defuse. Cost figures in §8 are computed, not quoted; recompute if per-turn token assumptions change.
