# Claude / Cursor / OMP as Voice-Brain — Research 07

> **Lane:** L7-ClaudeCursor · **Date:** 2026-07-07 · **Subject:** Which "brain" should power Marcel's rebuilt voice assistant, and how to get *clean* text out of it for TTS.
>
> Provenance tags: **[P]** primary (vendor docs / official) · **[S]** secondary corroboration · **[L]** local / repo-verified (YURI codebase, OMP harness docs) · **[Sib]** cross-lane sibling finding (cited inline).

---

## 0. Marcel's constraints (the filter everything runs through)

| Resource | Status | Relevance here |
|---|---|---|
| **Claude Max** (OAuth, Pro/Max tier) | paid | Covers claude.ai app + **Claude Code** in one unified pool. Does **NOT** include Anthropic API access. [P] |
| **Cursor** (Composer 2.5 Fast) | paid | Account-locked SDK + IDE. `@cursor/sdk` (Python/TS) + `@cursor/cli` headless. Not a public API. [S] |
| **z.ai GLM Coding Plan** | free | GLM-5.2/5.1 via OMP `glm-fleet`. Out of scope here (L6/DeepSeek lane owns DeepSeek). |
| **OMP harness** (this process) | owned | The harness = `@oh-my-pi/pi-coding-agent`. In-process SDK, hooks, 6 model roles, MCP. **In-process only — no HTTP router.** [L, Sib-Main] |
| **Headless Claude** (`claude -p`, SDK headless) | **BANNED** | Marcel's global CLAUDE.md: *"Forbidden everywhere: `claude -p`, `claude --print`, SDK headless calls, fresh no-persistence prompt processes."* This is a load-bearing constraint — it kills two of the five "obvious" brain paths. [L] |

> **The single most important finding of this lane:** Marcel already owns a clean, sanctioned, in-process brain extractor — **the OMP SDK** (`createAgentSession()` + `session.subscribe(text_delta)`). The tmux-capture approach that failed was solving a problem the SDK already solves. Every other path is either forbidden (headless Claude), separately billed (Anthropic API), or account-locked (Cursor SDK).

---

## 1. Anthropic API — Claude Sonnet 4.5 as a voice brain

### 1.1 Does Claude Max include API access? **No.**

This is the question that gates everything else, and the answer is unambiguous across primary sources [P]:

- Max/Pro subscriptions cover **claude.ai (web/desktop/mobile) + Claude Code terminal** in *one unified usage pool* [P: support.claude.com/articles/11145838].
- **API access is a separate, per-token billing track**, independent of subscription tier [P, S: Novita, IntuitionLabs].
- **Feb 2026 OAuth policy** [S]: Anthropic formally restricted OAuth-token use to official clients. Third-party "Max-as-API" proxies (CLIProxyAPI, litellm's `claude_code_max`) exist but operate in the gray zone this policy targets — they can break on any token-rotation change.

> **Implication:** Marcel cannot use his Max subscription as a free Anthropic API for a voice loop. To call `api.anthropic.com` directly he needs a **separate API key with prepaid credit**. His Max value is realized *through Claude Code / OMP*, not via raw API calls.

### 1.2 Pricing (the clean numbers) [P: platform.claude.com/docs/en/about-claude/pricing]

| Model | Input $/M | Output $/M | Notes |
|---|---|---|---|
| **Sonnet 4.5** | **$3.00** | **$15.00** | Intro **$2/$10** through **Aug 31 2026** |
| Haiku 4.5 | $1.00 | $5.00 | Fast/cheap tier |
| Opus 4.7/4.8 | $5.00 | $25.00 | Heaviest reasoning |

Cost levers: **prompt caching** = cached input at **$0.30/M** (90% off; 5-min writes $3.75/M, 1-hr writes $6.00/M) · **batch** = 50% off all models (async, not voice-suitable) · **tool-use system prompt** auto-added ≈ **497 tokens/request** (Sonnet 4.6 measured) = **$0.0015/req** overhead [S: Metacto].

### 1.3 Cost per conversation (computed for Marcel's usage) [L, derived]

A "voice turn" ≈ 800 input tokens (system + short history) + 120 output tokens (1–2 spoken sentences). Numbers below from the eval cost-model (see lane artifact).

| Scenario | Per-turn | Notes |
|---|---|---|
| Sonnet 4.5 short turn, no cache | **$0.0042** | cold prefix |
| Sonnet 4.5 short turn, 88% cache hit | **$0.0023** | steady-state after turn 1 |
| Sonnet 4.5 **vision turn** (1 screenshot ≈1,600 tok), intro pricing | **$0.0073** | screen-aware turns |
| Sonnet 4.5 **20-turn conversation**, cached | **$0.063** | full session |
| **DeepSeek V4-Flash** short turn | **$0.00015** | [Sib-L6] — 15× cheaper |
| Haiku 4.5 short turn | **$0.0014** | cheap Anthropic option |

**Monthly burn @ 50 turns/day:** Sonnet 4.5 cached ≈ **$3.47/mo** · DeepSeek V4-Flash ≈ **$0.22/mo** · Haiku 4.5 ≈ **$2.10/mo**. Even heavy Sonnet usage stays pocket-change *if* Marcel has an API key. The blocker is billing access, not unit cost.

### 1.4 Streaming, vision, tool calling — all native [P: platform.claude.com/docs]

- **Streaming:** SSE `stream: true`; input/output billed separately, same rate as non-stream. Text deltas arrive incrementally — ideal for sentence-boundary TTS flushing.
- **Vision:** native multimodal. Screenshots ≈ **1,600 tokens/image** + **466–499 tokens** Computer-Use system-prompt overhead [Sib-L4]. A 50-step screen-automation run ≈ **$0.10–0.50** on Sonnet [Sib-L4].
- **Tool calling:** native function-calling. Tool args stream as `input_json_delta` (partial-JSON accumulation, see §5). `tools` + `tool_choice` (auto/any/tool/none) all supported.

### 1.5 Verdict on raw Anthropic API

The **cleanest possible voice brain** — first-class streaming, vision, tools, predictable NDJSON-ish events. The only blocker is that it requires a **separate prepaid API key** Marcel doesn't currently have. If he opens a ~$20 API credit balance, this is the no-compromises path and the cheapest-because-already-best-engineered one.

---

## 2. Cursor Composer — can it be a programmatic brain?

### 2.1 What Cursor actually ships [S: Composio, DeployHQ, DevelopersDigest, TokenMix]

- **`@cursor/sdk`** (Python + TypeScript) — turns Composer into **headless infrastructure** using the same harness as the desktop app. Shares MCP servers, rules, and auth with the IDE.
- **`@cursor/cli`** — headless CLI, stable on macOS/Linux/Windows as of 2026. `cursor auth` opens browser; `npm install -g @cursor/cli`. Suitable for cron/scripts.
- **Background Agents** — long-running tasks (8-hr refactors) on Anysphere cloud; survives laptop closure. **$200/mo Cursor Max tier.**
- **Composer 2.5** — ~**200 tok/s**, 61.3 CursorBench. Notably, **the harness beats the model**: GPT-5.5 scored 61.5% native but **87.2% inside Cursor's harness** (context-engine + tool-dispatch tuning) [S: Composio citing Endor Labs].

### 2.2 Is there a public API / OAuth token? **No — it's account-locked.** [S]

- Composer 2.5 is **exclusively inside the IDE + `@cursor/sdk`**. It is **not** a raw OpenAI-compatible endpoint [S: DigitalApplied].
- Auth = **`CURSOR_API_KEY` / session token** from Cursor's integration page — account-specific, tied to subscription. **Not** a standardized OAuth flow for third parties.
- **Community workarounds** (gray-zone, may break): `standardagents/composer-api` — local macOS app starting a `localhost /v1` OpenAI-compatible server storing the Cursor key locally. Cursor **asked them to take down the hosted path**; production release is the signed macOS app. A "Cursor Background Composer API Client" (TS, MCP server) also exists but needs a raw session token.

> **Verdict:** Cursor Composer is a **first-class brain *when driven through its own SDK or IDE*, but a dead end as a standalone HTTP brain.** Token extraction for a custom voice loop violates Cursor's posture and will break.

### 2.3 The clean path: Cursor as an **OMP provider** [L]

OMP ships a native **Cursor streaming provider** (`packages/ai/src/providers/cursor.ts`, confirmed in `provider-streaming-internals.md` [L]). That means:

- Inside the OMP harness, **Composer 2.5 Fast is already a selectable model** — Marcel switches to it with a model-role/pattern change, no OAuth hacking.
- The provider normalizes Cursor's native stream into the **unified `AssistantMessageEvent`** (see §5), so a voice loop consuming OMP events gets Composer output exactly like Claude output.
- **Recommendation:** *Don't* try to call Composer directly. Route voice turns through **OMP → Cursor provider** when you want Composer's speed; through **OMP → Anthropic provider** when you want Claude's depth. The brain-abstraction layer already exists.

---

## 3. Claude Code session via tmux — why it's fragile, and the real fix

### 3.1 Why tmux capture fails [Sib-Main, L]

Main's session confirmed the failure mode directly: OMP's rich TUI renders **borders, status bars, model names, spinner glyphs, and ANSI escapes** alongside the response. `tmux capture-pane` grabs all of it verbatim, and TTS then reads the chrome aloud ("model glm-5.2 ● streaming…"). This is intrinsic to TUI capture, not a bug to fix — you're scraping a *rendered UI*, not an *event stream*.

Additional fragility: pane-size wrapping mangles long lines, scrollback truncates long replies, streaming output is only partially written when you capture, and control sequences (`\x1b[…`) leak into the audio.

### 3.2 The two "obvious" fixes — both forbidden for Marcel

| Fix | Why it works | Why Marcel can't use it |
|---|---|---|
| **`claude -p --output-format stream-json --verbose`** | Emits clean **NDJSON** (one `{type, ...}` object per line) — `assistant`/`result`/`stream_event` messages, per-invocation cost reporting [P: code.claude.com/docs/en/headless, S: buildthisnow, buildwithaws] | **Banned by global CLAUDE.md** ("Forbidden everywhere: `claude -p`, `claude --print`, SDK headless calls") |
| **Claude Agent SDK** (`claude-agent-sdk`, Python/TS) | `query()` async iterator yields `StreamEvent` with raw API deltas; `ClaudeSDKClient` for multi-turn; `include_partial_messages=True` for token streaming [P: code.claude.com/docs/en/agent-sdk/python] | **Banned** — same clause ("SDK headless calls"). Also spawns `claude` as subprocess, i.e. headless. |

Both are the *industry-standard* clean-extraction paths — and both are explicitly off-limits in this workspace. **This is not an oversight to route around; it's Marcel's stated discipline** (one real interactive session, tmux/PTY continuity, no fresh no-persistence processes).

### 3.3 The sanctioned clean path: **OMP SDK in-process subscribe** [L]

OMP's SDK is the answer, and it's already running — it powers this very session. From `omp://sdk.md`:

```ts
import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),   // ephemeral, or file-backed for resume
  toolNames: ["read", "bash", /* … */],         // allowlist what the voice-brain can do
  model: "claude-sonnet-4.5",                   // or modelPattern for role-based selection
});

// THE clean extractor — fires on every streamed token:
session.subscribe((event) => {
  if (event.type === "message_update"
      && event.assistantMessageEvent.type === "text_delta") {
    ttsFeed(event.assistantMessageEvent.delta);   // clean UTF-8 text, no chrome, ever
  }
});

await session.prompt("What's on my screen right now?");
```

- **`text_delta` = exactly the spoken text**, no borders, no ANSI, no model labels. This is what the TUI *renders from*; subscribing upstream of the renderer gets the pristine source.
- `session.abort()` for barge-in; `session.steer()`/`followUp()` for streaming interrupts; `session.dispose()` for teardown.
- **This is not headless Claude** — it's the same in-process agent session the interactive TUI uses, just with your own event consumer instead of the renderer. It satisfies the "one real session, tmux/PTY continuity" rule.

> **The tmux-capture pain was a symptom of reaching *around* the harness. The fix is to reach *into* it.**

---

## 4. OMP as the brain — the load-bearing architecture

### 4.1 The in-process constraint [Sib-Main, L]

Main confirmed: **OMP exposes no HTTP model-router.** `task()` / `completion()` are **in-process function calls only.** Therefore a voice loop that wants OMP as brain **must itself be a Bun/Node process that embeds OMP via `createAgentSession()`** (or runs inside the harness as a hook/extension). A separate Python STT/TTS process cannot `POST /ask` to OMP — it must talk to an OMP-embedding bridge over a socket/pipe.

> **Architecture consequence:** the clean split is **one Bun/Node voice-orchestrator process** that (a) owns the OMP agent session, (b) subscribes to `text_delta` → pushes to TTS, (c) owns STT → calls `session.prompt()`. STT and TTS can be separate processes/devices talking over a local socket; the *brain* must be in-process with OMP.

### 4.2 Clean-text extraction patterns (the §4 core question)

Three layered options, best → most-coupled:

1. **SDK `subscribe(text_delta)`** (§3.3) — cleanest, real-time, streaming. **Recommended primary.**
2. **Hook on `agent_end` / `turn_end` → write file → TTS reads file.** The "file-drop" pattern Marcel asked about. From `omp://hooks.md` + `omp://skills/authoring-hooks.md` [L]:
   ```ts
   export default function voiceHook(pi) {
     pi.on("turn_end", async (event, ctx) => {
       const last = ctx.sessionManager?.getLastAssistantMessage?.();
       await fs.writeFile("/tmp/voice/reply.txt", last?.text ?? "");
       // TTS watcher picks up the file
     });
   }
   ```
   Note: OMP's event catalog has **`turn_end`** (end of user→agent turn) and **`agent_end`** (agent streaming ends) — these are the "Stop hook"-equivalent events Main was referring to. There is no event literally named "Stop."
3. **Hook on `context` / `before_agent_start`** to inject screen context (screenshot descriptions, frontmost app) per turn — this is how screen-awareness plugs in without touching the model-selection code.

### 4.3 Hooks subsystem summary [L: omp://hooks.md, omp://skills/authoring-hooks.md]

| Surface | Fires | Voice use |
|---|---|---|
| `tool_call` (pre) | before each tool | guard/allow computer-use actions; speak "let me check…" |
| `tool_result` (post) | after each tool | redact secrets before they reach TTS |
| `agent_start` / `agent_end` | streaming begin/end | `agent_end` = "reply ready" signal for TTS finalize |
| `turn_start` / `turn_end` | user→agent turn | `turn_end` = file-drop trigger |
| `context` | before each LLM call | inject screenshot/app context per turn |
| `before_agent_start` | before agent turn | inject a pre-spoken acknowledgment |
| `ttsr_triggered` | mid-stream rule-violation → abort+retry | **interrupt a bad reply mid-speech and re-synthesize** (see §5.4) |

Discovery: JS/TS factories under `.omp/hooks/pre/*.ts` (and `.omp/extensions/`), or `--hook`/`--extension` CLI flags (aliased). `HookAPI` is legacy; `ExtensionAPI` is the preferred superset. `ctx.hasUI === false` in headless/subagent mode — guard interactive calls.

### 4.4 Model switching (Jarvis changes brains) [L, Sib-L3]

OMP `~/.omp/agent/config.yml` defines **6 model roles**: `default` / `smol` / `slow` / `plan` / `commit` / `advisor` [Sib-L3]. A voice loop exploits this:

- `default` (e.g. Sonnet) → normal conversation
- `smol` (Haiku) → fast acknowledgments, intent classification, "did you say X?" confirmations
- `slow` (Opus / GLM-5.2) → deep reasoning on hard asks
- Switch via `modelPattern` in `createAgentSession()` or `session` model-restore. **No re-architecture** — role-based routing is already the harness's model-selection mechanism.

### 4.5 MCP (Marcel's "use the computer" requirement) [L: omp://mcp-config.md]

- **Config location (resolves Main/L3's open question):** OMP-native MCP config lives in **`.omp/mcp.json`** (project) or **`~/.omp/agent/mcp.json`** (user; `~/.omp/profiles/<name>/agent/mcp.json` under a profile). It is **NOT** in `config.yml` or `agent.db` — that's why Main/L3 couldn't find it. Discovery *also* reads third-party files: `.claude/`, `.cursor/`, `.vscode/`, `opencode.json`, root `mcp.json`/`.mcp.json`. The 14 servers at boot come from discovery merging all sources. `/mcp list` shows each server's source file.
- Transports: `stdio` (default), `http` (Streamable HTTP, preferred), `sse` (legacy). `${VAR}` expansion at discovery; `!cmd` shell-resolution for `env`/`headers` secrets.
- **For voice:** add filesystem / AppleScript / browser / screenshot MCP servers in `.omp/mcp.json`; the brain calls them as tools during a turn. A hook can pre-inject the *result* of a screenshot tool into `context` so the model "sees" without an explicit user ask.

### 4.6 OMP's own TTS tool (caveat — it's the wrong direction) [L: omp://tools/tts.md]

OMP has a built-in **`tts` tool** (Kokoro-82M local OR xAI Grok Voice cloud), injected when `speechgen.enabled` is set. **Important:** this is the *agent calling TTS* (generating an audio file on demand), **not** TTS consuming agent output. For an always-on voice assistant you want the **reverse** — agent `text_delta` → TTS — which is the SDK-subscribe pattern in §3.3, not the `tts` tool. The `tts` tool is useful for *on-demand* audio artifacts ("read this file aloud"), not for conversational voice-out.

---

## 5. Streaming + tool calling during voice conversations

### 5.1 OMP's unified stream contract [L: omp://provider-streaming-internals.md]

Every provider (Anthropic, OpenAI Responses, Gemini, Ollama, **Cursor**, Bedrock, pi-native) emits the **same** `AssistantMessageEvent` shape:

```
start → {text|thinking|toolcall}_start → *_delta* → *_end → done|error
```

- `text_delta` = spoken text (→ TTS)
- `thinking_delta` = reasoning (→ suppress for voice; never TTS this)
- `toolcall_delta` = partial JSON tool args (→ buffer, execute only on `toolcall_end`)
- **Events delivered immediately, in push order, no batching/merging. No backpressure** (in-memory queues; if consumer lags, queue grows).
- Tool-arg JSON is reparsed **throttled** (≥256 new bytes) to bound mid-stream parse cost; final `toolcall_end` parse is authoritative.

> **Voice-design win:** because the contract is provider-agnostic, **the same sentence-boundary → TTS flusher works whether the brain is Claude, Composer, GLM, or DeepSeek.** You write the TTS bridge once.

### 5.2 The text-vs-tool split (the reliable pattern) [Sib-L2, Sib-L1, Sib-L5]

Three independent lanes converged on the same architecture:

1. **Split the token stream into two parallel buffers:**
   - **Text deltas → sentence-boundary buffer → flush to TTS.** Detect `[.!?]+` + whitespace (exclude `Dr./Mr./PM.` and decimals), enforce a minimum (~10 chars / ~24 tokens) to avoid TTS fragments.
   - **Tool-call arg deltas → JSON buffer → execute only when `toolcall_end` delivers complete args.** Never act on partial args.
2. **Flush each complete sentence the instant it's ready** — do NOT wait for the full reply.
   - Pipecat `BufferedLLMService`: first segment capped at ~24 tokens (fast time-to-first-chunk), subsequent segments accumulate up to ~96 tokens waiting for a natural sentence end [Sib-L2].
   - Each sentence-boundary flush **saves 200–500 ms** vs waiting for the full response [Sib-L2].
3. **TTS adaptive mode:** first segment streaming (~**75–90 ms TTFB**, ElevenLabs Flash / Aura-2 [Sib-L5]), subsequent sentences batched for quality [Sib-L2].
4. **Latency budget:** full pipeline must land **<700 ms voice-to-voice** to feel human; **>1 s feels broken** [Sib-L2]. Waiting for the full text delta (Marcel's current slowness suspect) adds **1–3 s** of avoidable latency.

### 5.3 Tool-call latency implications

- **Most frameworks pause TTS during a tool round-trip** → dead-air gap proportional to tool latency [Sib-L1]. Speak a bridging phrase ("let me check…") *before* the tool call to fill the gap.
- **Non-blocking tool calls** (Gemini calls it `scheduling:"SILENT"`): assistant keeps talking while the tool executes in the background; result injected as a fresh turn [Sib-L2]. **Best for voice** — screenshot/bash run while the assistant continues.
- **OpenAI Realtime API** (`MultimodalAgent` path) handles tool-calls *within* the single audio session natively → least dead air, but it's a different transport (not text-delta → TTS) [Sib-L1].

### 5.4 TTSR — OMP's native mid-stream interruption (underused superpower) [L: omp://ttsr-injection-lifecycle.md]

OMP has **Time-Traveling Stream Rules (TTSR)**: streaming-content rules that can **abort a response mid-stream and retry with an injected correction** (`ttsr_triggered` event). For voice this means:

- A rule matching a forbidden phrase / hallucination / leaked secret can **interrupt the reply mid-speech** and force a clean regeneration *before* TTS finishes speaking the bad chunk.
- `contextMode: "discard"` drops the partial; `"keep"` leaves it. Interrupt vs non-interrupt modes; repeat policy (`once` / `after-gap` in turns).
- **Voice application:** define TTSR rules for "never reveal API keys," "never read raw JSON," "stop if uncertain" — the brain self-corrects before the mouth finishes the sentence. This is a feature Claude-API-as-brain does **not** give you out of the box.

### 5.5 TTFT / throughput comparison (for model choice) [Sib-L6, Sib-L4]

| Brain | TTFT | Output tok/s | Voice note |
|---|---|---|---|
| **Claude Sonnet 4.6** | ~0.8–1.2 s | 70–90 | solid baseline; disable extended-thinking for voice |
| **DeepSeek V4-Flash** | ~1.11 s | 83.3 | **disable thinking mode** (`extra_body={"thinking":{"type":"disabled"}}`) or TTFT balloons [Sib-L6] |
| **Cursor Composer 2.5** | fast (~200 tok/s sustain) | ~200 | via OMP Cursor provider; account-locked |
| **DeepSeek V4-Flash cost** | — | — | **~15× cheaper** than Sonnet per turn [Sib-L6] |

---

## 6. Cross-cutting: the Max-subscription constraint + the headless ban

Two constraints compound and **dictate the architecture**:

1. **Max ≠ API:** Marcel's Max subscription is *consumed through Claude Code / OMP*, not through `api.anthropic.com`. So "use Claude as brain" = "use Claude *through OMP*", because that's the only sanctioned surface his Max value flows through.
2. **Headless Claude banned:** `claude -p` / Agent SDK are off-limits. So even the clean NDJSON extraction path is closed.

**The convergence:** these two constraints point at the *same* answer — **OMP is the brain.** It's where Marcel's Max value is realized, it's the sanctioned in-process surface, it already normalizes Cursor/Anthropic/GLM/DeepSeek streams into one event shape, and it has the hooks + model-roles + MCP + TTSR for everything a Jarvis clone needs. The Anthropic API is the cleaner-but-separately-billed alternative; DeepSeek's anthropic-compat endpoint is the cheapest text-only fallback; Cursor SDK is a non-starter as a standalone brain but great as an OMP provider.

### 6.1 DeepSeek as a drop-in Claude (for cost-sensitive turns) [Sib-L6]

- Endpoint: `https://api.deepseek.com/anthropic` — same key, `/v1/messages`, **auto-maps** `claude-opus*→v4-pro`, `claude-sonnet*/haiku*→v4-flash`. `tools` + `tool_choice` + `stream` all supported.
- **2-env-var swap** turns any Anthropic-SDK path into DeepSeek. OMP can hit it as a custom provider.
- **Vision — verified: no V4-Flash vision on either endpoint.** DeepSeek **V4-Flash has NO image input on the official API** [Sib-L4, verified against official docs — authoritative] — this supersedes an earlier lane report that vision worked via the OpenAI-format `image_url` endpoint [Sib-L6, withdrawn]. The `/anthropic` endpoint marks `type:"image"` as NOT SUPPORTED, and the OpenAI-format endpoint is no help either for Flash. Only the **V4-Pro** series accepts images. So "DeepSeek-brain + screen-vision" routes vision to a *different* model (Claude-via-OMP, Gemini Flash, local Ollama MiniCPM-V, or DeepSeek V4-Pro). Per the L4 integration design, **the image never reaches V4-Flash** — screen-awareness attaches as *text* context (AX tree via macapptree + OCR via ocrmac) fed into the OMP session as a `context`-hook injection (§4.2).
- **Best role:** cheap text-turn brain for high-volume chitchat; keep Claude (via OMP) for screen-aware + tool-heavy turns.

---

## 7. Recommendation matrix

| Need | Best brain | Why | Cost to Marcel |
|---|---|---|---|
| **Always-on conversational core** | **OMP SDK → Anthropic provider (Sonnet via Max)** | Max value flows through OMP; `text_delta` subscribe is clean; native tools/vision; TTSR self-correction | $0 extra (Max covers it) |
| **Fast/cheap bulk turns** | **OMP → DeepSeek `/anthropic` endpoint** | 15× cheaper; 2-env-var swap; same event shape | ~$0.22/mo @ 50/day |
| **Screen-aware turns (vision)** | **OMP → Anthropic (Sonnet)** or GLM-5.2 | DeepSeek V4-Flash has **no vision** (only V4-Pro does) — L4-verified; Claude native multimodal | Max / free (GLM plan) |
| **Lightning-fast iteration** | **OMP → Cursor provider (Composer 2.5 Fast)** | ~200 tok/s; harness-beats-model effect | Cursor subscription |
| **Deep reasoning** | **OMP `slow` role → Opus or GLM-5.2** | role-based routing already wired | Max / free |
| **Direct `api.anthropic.com`** | Anthropic API key | cleanest engineering, but separately billed | ~$3.47/mo @ 50/day cached (needs credit) |
| **Cursor as standalone HTTP brain** | ❌ Don't | account-locked, no public API, OAuth extraction breaks | — |
| **`claude -p` / Agent SDK** | ❌ Don't | **banned by global CLAUDE.md** | — |
| **tmux capture-pane extraction** | ❌ Don't | TUI chrome pollutes TTS; SDK subscribe replaces it | — |

### 7.1 The one architecture to build

```
 ┌─────────────┐   text    ┌──────────────────────────┐  text_delta   ┌──────────┐
 │  STT (local │ ────────▶ │  Bun/Node voice-orch     │ ────────────▶ │   TTS    │
 │  Whisper/   │  prompt() │  ┌────────────────────┐  │ sentence-bdry │ (Kokoro/ │
 │  Parakeet)  │           │  │ OMP createAgent    │  │               │  cloud)  │
 └─────────────┘           │  │ Session()  ◀── MCP │  │               └──────────┘
        ▲                   │  │   hooks           │  │
        │ screenshot        │  │   model-roles     │  │  tool-call buffer
        │ (MCP tool)        │  │   text_delta → TTS│  │  → execute on toolcall_end
        │                   │  └────────────────────┘  │
        │                   │   brain swaps: Claude /  │
        │                   │   Composer / DeepSeek /  │
        │                   │   GLM via model-role     │
        │                   └──────────────────────────┘
        └──────────────────────────────────────────────┘
```

**Brain stays in-process with OMP. STT/TTS are peripheral. Model choice is a role-swap, not a re-architecture. Vision/tools/MCP all live inside the one session. No tmux, no headless Claude, no HTTP router to OMP.**

---

## 8. Open questions / residual risk

- **`task()`/`completion()` harness helpers vs. raw SDK:** the eval-cell `completion()`/`task()`/`agent()` helpers this lane used are in-process OMP calls — a voice loop could consume *those* instead of building a fresh `createAgentSession()`. Worth a spike: can a hook/extension register a `voiceTurn` slash-command that calls `completion()` and pipes the result to TTS? That reuses the live session's full context (memory, skills, MCP) rather than a fresh ephemeral one. [INFERENCE — needs verification]
- **DeepSeek thinking-default-on** [Sib-L6]: if not disabled, TTFT inflates and the first TTS chunk is delayed. Verify the OMP DeepSeek provider passes `thinking:disabled` for voice turns.
- **TTSR + TTS coordination:** if TTSR aborts mid-stream, the TTS bridge must stop speaking the partial chunk immediately and flush its own buffer. The hook `ttsr_triggered` event is the signal — but the TTS bridge must be wired to honor it. [INFERENCE]
- **MCP OAuth per-profile** [L]: if Marcel runs voice under a named OMP profile, MCP auth lives at `~/.omp/profiles/<voice>/agent/mcp.json` — isolated from his main dev profile. Good for safety, requires explicit `/mcp reauth` setup.

---

## Sources

**Primary [P]:** support.claude.com/articles/11145838 (Max + Claude Code) · platform.claude.com/docs/en/about-claude/pricing · code.claude.com/docs/en/headless · code.claude.com/docs/en/agent-sdk/python · code.claude.com/docs/en/build-with-claude/streaming · platform.claude.com/docs/en/agent-sdk/streaming-output

**Local / repo-verified [L]:** `omp://sdk.md` · `omp://hooks.md` · `omp://skills/authoring-hooks.md` · `omp://tools/tts.md` · `omp://ttsr-injection-lifecycle.md` · `omp://provider-streaming-internals.md` · `omp://mcp-config.md` · global CLAUDE.md (headless-Claude ban) · `02_RESOURCES/RESEARCH/anthropic-max20x-usage-limits-2026-06-23.md`

**Secondary [S]:** pricepertoken.com (Sonnet 4.5 pricing) · metacto.com / finout.io / cloudzero.com (API pricing, caching, batch) · Novita / IntuitionLabs / NxCode / Verdent (Max ≠ API) · lalatenduswain Medium (Feb-2026 OAuth policy) · Composio / DeployHQ / DevelopersDigest / TokenMix / DigitalApplied / codersera (Cursor SDK/CLI/Composer) · standardagents/composer-api (gray-zone proxy) · buildthisnow / buildwithaws / clauderun / thingsithinkithink (Claude headless + Agent SDK internals) · SamSaffron CLAUDE_AGENT_SDK_SPEC gist (NDJSON spec)

**Sibling-lane cross-refs [Sib]:** Main (OMP no HTTP router, tmux fails, hooks exist, MCP-config hunt) · L3-MCPMastery (config.yml modelRoles, agent.db schema) · L4-ScreenVision (Computer-Use ~1,600 tok/screenshot, DeepSeek vision caveat) · L5-STTTTS (DeepSeek text-only, streaming-TTS TTFB) · L6-DeepSeek (`api.deepseek.com/anthropic`, TTFT 1.11s, thinking-disable, vision-incompatible) · L1-Architectures (tool-call dead-air, Realtime native tools, split-buffer pattern) · L2-LLMIntegration (Pipecat BufferedLLMService, 24/96-token caps, <700ms target, SILENT scheduling) · L10-OpenSource (local-cloud split latency ceiling)

*Deliverable artifact: lane eval cost-model (cost-per-conversation table in §1.3).*
