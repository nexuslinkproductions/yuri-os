# Screen Awareness + Vision for Voice Assistants — Research Findings

> **Lane:** L4-ScreenVision · **Date:** 2026-07-07 · **Subject:** How a voice assistant on Marcel's M2 Pro (macOS 26.4.1 / Tahoe) gains reliable screen awareness — without the broken terminal-capture / echo-feedback mess that killed the old Pipecat+tmux build.
>
> **Scope:** screenshot capture, vision models, OCR, screen-context state, computer-use APIs, DeepSeek vision. Grounded in Marcel's subscriptions (Claude Max OAuth, Cursor Composer 2.5 Fast, z.ai GLM Coding Plan, Ollama Pro 3-concurrent) and budget (cost-effective; will top up DeepSeek for V4-Flash).
>
> **Verification note:** Pricing for Anthropic and DeepSeek is taken from the **official vendor docs** (read directly). Vision-capability claims for DeepSeek are flagged where they come from third-party hosts rather than the official API. GLM-4.6V hallucination is Marcel's reported empirical result, not a benchmark.

---

## TL;DR — The Architectural Verdict

**Don't build screen awareness around screenshot+vision as the default path.** That's the expensive, fragile, permission-heavy route. Build it around the **native macOS accessibility (AX) tree**, which is free, on-device, near-instant, and needs only *Accessibility* permission (not Screen Recording). Reserve **vision** for two cases: (1) the active app exposes no AX tree (~33% of macOS apps [1]), and (2) the user genuinely asks "what does this *image* show" (a screenshot of a photo, a design, a video frame).

The single most important correction for Marcel's plan:

> **DeepSeek V4-Flash has NO native vision on the official DeepSeek API.** The official pricing page lists only `deepseek-v4-flash` and `deepseek-v4-pro`, with features JSON / Tool Calls / Chat-Prefix / FIM — and **no image/vision input** for either [2]. Third-party hosts (Tencent CloudBase) claim `v4-pro` accepts `image_url` [3], but this is **not on `api.deepseek.com`** and is unverified for planning. So: V4-Flash is a superb *text* brain, but screen **vision must route to a different model** (Claude / Gemini / a local Ollama vision model). This is a Mixture-of-Experts at the orchestration layer — exactly Marcel's directive.

---

## 1. Screenshot Capture on macOS

### 1.1 The API landscape (three layers)

| Layer | API | Status on macOS 26 (Tahoe) | Use it when |
|---|---|---|---|
| **CLI** | `screencapture` | Works | Quick one-shots, scripting. `screencapture -l<windowID> -oCx out.png` captures a specific window [4]. |
| **CoreGraphics (legacy)** | `CGWindowListCreateImage`, `CGWindowListCopyWindowInfo` | `CreateImage` **deprecated since macOS 15.0**; `CopyWindowInfo` still alive [5][6] | Reading the *window list* (titles, bounds, PIDs) — still the canonical way to enumerate windows. |
| **ScreenCaptureKit (modern)** | `SCContentFilter`, `SCStream`, `SCShareableContent` | **Recommended for 2025/2026** [7][8] | Per-window or per-display filtering, streaming frames, permission-aware async capture. |

**Window targeting (the right way):**
- `screencapture -l<windowID>` — pass the CGWindowNumber. Rob Allen's QuickSS shows the pattern [4].
- ScreenCaptureKit: `SCContentFilter(desktopIndependentWindow: window)` captures exactly one window [8]. `SCShareableContent.excludingDesktopWindows(false,...)` lets you enumerate displays/windows/apps to pick a target.
- To find the *frontmost* window reliably: combine `NSWorkspace.shared.frontmostApplication` (gives PID) with `CGWindowListCopyWindowInfo`, and **match on `kCGWindowOwnerPID`, not the owner name** — names lie (iTerm's owner name is "iTerm" but `localizedName` is "iTerm2") [9][10].

### 1.2 Common pitfalls (ALL of these bite on Tahoe — Marcel's exact OS)

These are the failure modes that produced the old build's "terminal capture artifacts" and blank frames:

1. **TCC evaluates the *responsible process*, not the parent.** A `screencapture` child spawned by a Node/Terminal wrapper does **not** inherit the wrapper's Screen Recording permission — the child process needs its own grant [11][12]. *This is almost certainly part of what broke the tmux bridge.*
2. **Tahoe (26.x) effectively requires an app bundle** for Screen Recording to appear in System Settings → Privacy. Plain executables can still capture once granted, but never show in the UI list, so the permission is invisible/unmanageable [11][12].
3. **Every rebuild = new code-signature hash = permission reset.** Fix: sign with a stable certificate / `TeamIdentifier` so TCC persists across builds [12].
4. **`CGPreflightScreenCaptureAccess()` only checks; it never asks.** Calling it as a guard creates a chicken-and-egg where the app is never added to the permission list. Call `CGRequestScreenCaptureAccess()` at startup instead [12].
5. **Toggling the System Settings switch doesn't take effect until a full `Cmd+Q` quit + reopen.** Closing the window isn't enough [13].
6. **Revoked/expired permission → silent black frames, not an error.** The capture "succeeds" with null pixels [13][14].
7. **DRM content** (Netflix, Disney+, Apple TV+, Spotify video) renders as a clean black rectangle exactly where the video was — not a bug, content protection [13][14].
8. **DisplayLink / USB-C dock virtual displays** composite separately and capture as black — relevant if Marcel docks the MacBook [13].
9. **Stale TCC daemon cache** after an OS/app update → phantom-denied state. A reboot clears it; this is the #1 "it was working yesterday" cause [13].
10. **`tccutil reset ScreenCapture [com.bundle.id]`** is the official reset; reboot after [13].

**The escape hatch that never needs Screen Recording permission:** the built-in `Cmd+Shift+3/4/5` shortcuts are system-level and bypass TCC entirely [14]. Not scriptable for a daemon, but useful as a diagnostic — if the shortcut works and your script gets black frames, it's 100% a TCC/permission attribution problem, not a capture-API problem.

---

## 2. Vision Models for Screen Description

### 2.1 Which models actually work (and the GLM-4.6V failure)

- **Claude (Sonnet 4.6 / Sonnet 5 / Haiku 4.5 / Opus 4.8)** — native vision, the most reliable for screenshot *understanding* (UI semantics, "where do I click", layout reasoning). The Computer Use tooling is built on this [15][16].
- **GPT-4o** — strong general vision; competitive with Claude on screenshots, slightly behind on dense UI reasoning in some agent benchmarks but excellent scene/image understanding.
- **Gemini 2.5 Flash** — multimodal (text/image/audio/video in, text out) [17]; the **cheapest** cloud vision option by a wide margin (see cost table). Good enough for most "describe what's on screen" tasks.
- **GLM-4.6V — FAILED.** Marcel's empirical result: it hallucinated. ⚠️ **Do not use GLM vision for screen awareness.** Keep z.ai GLM on text/reasoning/adversarial tasks only. (This is consistent with GLM's text strength being its real value on the free plan.)

### 2.2 Cost per vision call (grounded in official pricing)

Image-token math differs per vendor. Normalized to a ~1024×1024 screenshot:

| Model | Image tokens (≈1024²) | Input $/M tok | **Cost / screenshot (input)** | Source |
|---|---|---|---|---|
| **Gemini 2.5 Flash** | ~1,290 | $0.30 | **~$0.00039** | [17][18] |
| **GPT-4o** (high detail) | ~765 (85 + 170×4 tiles) | $2.50 | **~$0.0019** (batch ~$0.00095) | [19][20] |
| **GPT-4o** (low detail) | 85 (fixed) | $2.50 | **~$0.00021** | [20] |
| **Claude Haiku 4.5** | ~1,600 (computer-use screenshot) | $1.00 | **~$0.0016** | [15][21] |
| **Claude Sonnet 4.6** | ~1,600 | $3.00 | **~$0.0048** | [21] |
| **Claude Sonnet 5** (intro thru Aug 31 2026) | ~1,600 | $2.00 | **~$0.0032** (→$0.0048 Sep 1) | [21] |
| **Claude Opus 4.8** | ~1,600 | $5.00 | **~$0.0080** | [21] |
| **DeepSeek V4-Flash** | — | $0.14 | **N/A — no vision on official API** | [2] |
| **DeepSeek V4-Pro** | — | $0.435 | **Unconfirmed (third-party claim only)** | [2][3] |
| **DeepSeek-VL2** (via Replicate/DeepInfra) | ~800–1,500 | ~$0.037/run | **~$0.037 / call** (3rd-party hosted) | [22] |
| **Local (Ollama: minicpm-v / qwen2-vl / llava)** | — | $0 | **$0** (latency + RAM only) | — |

**Key levers:**
- **Prompt caching** cuts Claude cache-hit input cost by **90%** (0.1× base) [21] — huge for an always-on assistant that re-sends the same system prompt + tool defs.
- **Batch API** gives **50% off** both input and output on Claude [21] — but batch is async (minutes), useless for real-time voice.
- **Downsample before sending.** Anthropic explicitly recommends downsampling screenshots to control token cost [16]; a 512×512 region often suffices for "read this dialog".

### 2.3 Monthly cost model for Marcel's "always-on" use case

Assume **50 screenshots/day** (a periodic context refresh + on-demand "what's on screen"). Input image cost only:

| Path | /day | /month (30d) | Notes |
|---|---|---|---|
| Gemini 2.5 Flash | $0.019 | **~$0.59** | Cheapest cloud. Add API key. |
| Claude Haiku 4.5 (with caching) | $0.08 → ~$0.02 cached | **~$0.59–$2.40** | Best Claude value for vision. |
| Claude Sonnet 4.6 | $0.24 | **~$7.20** | Best quality, priciest. |
| GPT-4o (high) | $0.096 | **~$2.87** | Solid middle. |
| **Local Ollama vision** | $0 | **$0** | Free; costs latency + ~4–8 GB RAM on the 16 GB machine. |
| Native AX tree (no vision) | $0 | **$0** | **The default.** See §4. |

> **Recommendation:** default to native AX tree ($0). For the vision fallback, run a **local Ollama model (MiniCPM-V or Qwen2-VL)** for free always-on context, and fall back to **Gemini 2.5 Flash (~$0.59/mo)** or **Claude Haiku 4.5** when local quality is insufficient. Avoid routing routine screenshots through Sonnet — reserve Sonnet for the moments its reasoning actually pays.

---

## 3. OCR as an Alternative (and Complement) to Vision

### 3.1 macOS Vision framework OCR — the default on-device choice

`VNRecognizeTextRequest` (Apple Vision framework) is on-device ML OCR:
- **Fast:** ~131 ms (fast mode) / ~207 ms (accurate mode) on an M3 Max — an M2 Pro is in the same ballpark [23].
- **Accurate mode** for precision, **fast mode** for latency-sensitive loops [24].
- **Free, private, on-device** — no API, no tokens, no network.
- Python wrapper: **`ocrmac`** [25] — drop-in for a Python voice loop.
- CLI tool: `bytefer/macos-vision-ocr` for batch/single-image with positional output [26].

### 3.2 Tesseract — only when you need cross-platform / custom training

Tesseract 5.x (LSTM-based, v5.5.2 late 2025) is still strong on **clean printed text (>95%)** but **struggles with noisy images, low-DPI, complex layouts, nested tables, and handwriting** [27][28]. It wants ≥300 DPI input [29]. For a macOS-only assistant, **VNRecognizeTextRequest is strictly better** (faster, native, no preprocessing). Tesseract earns its place only if Marcel later wants the same code on Linux.

### 3.3 When OCR beats vision models — and when it doesn't

| Need | Best tool | Why |
|---|---|---|
| "Read the text in this window/dialog/error" | **macOS Vision OCR** | Cheaper, faster, exact text + bounding boxes, free |
| "What app is this / where's the button / summarize the page" | **Vision model (Claude/Gemini)** | Semantic understanding, layout, intent — OCR gives raw text, not meaning |
| "Transcribe this code/terminal block" | **OCR**, then optionally a text model | OCR → text LLM is cheaper than image → vision LLM for verbatim text |
| "Describe this photo/design/video frame" | **Vision model only** | OCR has nothing to extract semantically |

**Hybrid pattern (recommended):** OCR the screenshot to get exact text + element positions cheaply, then feed that *text* (not the image) to the cheap text brain (DeepSeek V4-Flash). Send the actual image to a vision model only when OCR text is insufficient to answer. This keeps the always-on loop on $0/$0.14-per-M paths.

---

## 4. Screen-Context State (awareness without capturing every frame)

This is the section that determines whether the assistant feels "Jarvis-like aware" or "blind until asked". The goal: maintain a live mental model of the screen at near-zero cost.

### 4.1 The cheap, permission-light foundation: the native Accessibility tree

**Read the AX tree as text, not pixels.** This is the single biggest architectural lever:

- `AXUIElement` queries (`kAXTitleAttribute`, `kAXRoleAttribute`, `kAXChildrenAttribute`, `kAXFocusedWindowAttribute`) read window titles, roles, and hierarchy as **text** [30].
- **Requires only *Accessibility* permission — NOT *Screen Recording*.** Window titles via AX need no screen-recording grant [10]. (Screen Recording is the painful, TCC-attribution-prone permission; Accessibility is far more stable for a long-running daemon.)
- **MacPaw `macapptree`** [31] is a ready-made native AX parser that serializes the on-screen UI hierarchy to JSON — drop it in as the context source.
- **Cost: $0. Latency: milliseconds.** Replaces the screenshot+vision+OCR round-trip for 95% of "what's on screen" questions.

### 4.2 Active-app / window tracking (the event-driven spine)

Don't poll. Subscribe to the OS events:

- **`NSWorkspace` notifications** (`didActivateApplicationNotification`, `didDeactivateApplicationNotification`) → fire on app switches. This gives MRU order for free [9][32].
- **`AXObserver`** per app → fires on *intra-app* focused-window changes (switching tabs, windows within the same app) [9][32].
- **The 30 ms rule:** after an activation notification, wait ~30 ms before reading the frontmost window — otherwise you read the *previous* state (the window list lags one step) [32]. This is a documented gotcha; bake it in.
- Match windows by **`kCGWindowOwnerPID` == `frontmostApplication.processIdentifier`**, never by name [10].

### 4.3 Caching strategy (maintain awareness cheaply)

1. **Keep a rolling context object:** `{ frontmostApp, frontmostWindowTitle, axTreeSummary, lastChangeTs, changeKind }`. Update it *only* on the events above — not on a timer.
2. **Summarize, don't store raw.** A full AX tree can be large; store a compressed summary (app, window title, top-level roles, focused element) and expand on demand.
3. **Diff on change.** On each event, capture what changed (window title, focused element) so the brain gets "you switched from Cursor to Safari, now on the 'GitHub' tab" rather than a full re-description.
4. **Stale guard.** Discard context older than N seconds of inactivity; re-read lazily on next user utterance. Prevents answering from a stale mental model.
5. **Optional periodic vision refresh.** Only if true always-on scene awareness is wanted: screenshot + (local OCR | local Ollama vision) every M seconds, *outside* the voice-critical path, to keep a richer description fresh. Cost it carefully (§2.3).

### 4.4 Screen2AX — the fallback for apps with no AX tree

**~67% of macOS apps lack full accessibility support** [1], so the AX tree alone sometimes returns garbage. **Screen2AX** (MacPaw, open-source [33]) is the state-of-the-art fallback: it reconstructs a full hierarchical accessibility tree **from a single screenshot** using vision-language + object-detection models — **77% F1** on full-tree reconstruction, **2.2× better than native AX** on poorly-supported apps, and it **beats OmniParser V2** on the ScreenSpot benchmark [1][33]. Use it as the "this app has no AX, fall back to vision-derived tree" path. (Note: it still consumes a vision call — so only invoke when the AX tree is empty/malformed.)

---

## 5. Computer-Use APIs

### 5.1 Anthropic Computer Use — the production-ready, API-accessible option

- **Full API access** with standard token pricing — no separate "computer use subscription" [15][21].
- **Cost shape:** Computer Use adds **466–499 tokens** to the system prompt, and **each screenshot ≈ 1,600 tokens** [16][34]. Real-world: a single "find the blue button" ≈ 1¢; a multi-step "play this game" automation ≈ $0.30; a moderate 50-step automation ≈ **$0.10–$0.50** on Sonnet [34][35].
- **Marcel access:** Claude Max (OAuth) covers *claude.ai / Claude Code* usage, **not** direct API billing. A custom voice assistant hitting Computer Use pays **API rates on top of Max**. So budget Computer Use as API spend, not as "free with my sub".
- **Claude Code has its own computer-use mode** [36] — relevant if the assistant is built *on top of* Claude Code rather than a standalone loop.

### 5.2 OpenAI Operator / CUA — NOT usable for Marcel's build

- Locked behind **ChatGPT Pro ($200/mo)** for instant access; Plus ($20) is waitlisted and rate-limited to uselessness for production [37].
- **No programmatic API.** It lives only in the ChatGPT web UI; OpenAI promises a CUA API "soon" with no date [37].
- **Verdict for a voice assistant: unusable.** Marcel has no ChatGPT Pro and even if he did, there's no API to call. Anthropic wins this lane outright for developer integration [37].

### 5.3 Cost lever: caching + downsampling for any computer-use loop

Because each screenshot is ~1,600 tokens and computer-use loops are screenshot-heavy, the cost-control levers are: (a) **prompt caching** (90% off cache-hit input [21]) — cache the system prompt + tool definitions; (b) **downsample** screenshots before sending [16]; (c) prefer **Haiku 4.5** ($1/$5) for routine click-navigation and escalate to Sonnet only for ambiguous steps.

---

## 6. DeepSeek Vision — The Critical Correction

### 6.1 What the official API actually offers

From the **official DeepSeek pricing page** (read directly, 2026-07-07) [2]:

| Model | Input $/M (cache miss / hit) | Output $/M | Vision? | Context |
|---|---|---|---|---|
| `deepseek-v4-flash` | $0.14 / $0.0028 | $0.28 | **❌ No** | 1M |
| `deepseek-v4-pro` | $0.435 / $0.003625 | $0.87 | **❌ Not listed** (3rd-party claim only) | 1M |

The features table lists **JSON Output, Tool Calls, Chat Prefix Completion, FIM** for both — **no image/vision input** [2]. The widely-cited "DeepSeek V4 vision, 10× cheaper KV-cache" claim [38][39] refers to research/architecture efficiency and to third-party-hosted multimodal variants, **not to a vision endpoint on `api.deepseek.com`**.

### 6.2 What IS available (with caveats)

- **DeepSeek-VL2** — the dedicated open-source vision-language model (MoE, 4.5B activated params) [40]. Excellent on OCR, document/table/chart understanding, visual grounding. **But:** available via **Replicate (~$0.037/run)** [22], DeepInfra, or self-host — **not on the official DeepSeek API** pricing page. At ~$0.037/call it is *more expensive per screenshot than Gemini Flash or Haiku*, so it loses on cost for Marcel's use case.
- **Third-party `v4-pro` multimodal claim** (Tencent CloudBase [3]) — **unverified for direct API use.** Do not plan against it.

### 6.3 Quality vs Claude (for when a DeepSeek vision path IS used)

Independent comparisons put DeepSeek vision at **~90–95% of Claude/GPT-4o quality on OCR / document / screenshot tasks at ~10× lower cost** — but behind on complex multi-step visual reasoning [38][39]. The architectural efficiency (≈90 KV-cache entries/image vs Claude's ≈870) is real [38] — but Marcel can only capture it via a third-party host or self-hosting, which erodes the cost edge.

### 6.4 The bottom line for Marcel's plan

> **V4-Flash is a text/reasoning brain, not an eye.** Top up DeepSeek credit for the *brain* (V4-Flash at $0.14/M is unbeatable for text). For *vision*, route to: local Ollama (free) > Gemini 2.5 Flash (~$0.59/mo) > Claude Haiku 4.5. **Do not assume "top up DeepSeek" buys you screen vision.** This single correction prevents the most likely architecture failure in the rebuild.

---

## 7. Recommendation — The Screen-Awareness Stack for Marcel

Built for: M2 Pro / 16 GB / macOS Tahoe 26.4.1 / cost-effective / always-on.

```
                 ┌─────────────────────────────────────────────┐
  EVENT SPINE    │ NSWorkspace app-switch + AXObserver win-    │  ← $0, ms latency,
  (free)         │ change events → update rolling context obj  │    Accessibility perm only
                 └──────────────────────┬──────────────────────┘
                                      │
              ┌───────────────────────┼────────────────────────┐
              ▼                       ▼                        ▼
   NATIVE AX TREE            ON-DEMAND VISION            OCR (when text-only)
   macapptree / AXUIElement  ┌─ local: Ollama            macOS Vision OCR
   → text context (95%)      │   MiniCPM-V / Qwen2-VL    (VNRecognizeTextRequest,
   $0, ms                    │   ($0, latency cost)       ocrmac) — $0, ~130ms
                             ├─ cloud cheap: Gemini 2.5
                             │   Flash (~$0.00039/shot)
                             └─ cloud quality: Claude
                                 Haiku 4.5 (~$0.0016/shot)
                                      │
                                      ▼
                        TEXT BRAIN: DeepSeek V4-Flash ($0.14/M)
                        escalate → Claude Sonnet (Max sub) for hard reasoning
```

**The four rules:**
1. **AX tree is the default context source.** Free, fast, permission-light. Vision is the exception.
2. **V4-Flash is text-only.** Never send it an image. Route vision elsewhere (local Ollama → Gemini Flash → Haiku).
3. **GLM vision is dead** (hallucinated). z.ai GLM stays on text/adversarial.
4. **Tahoe TCC is the #1 breakage source.** Sign the daemon with a stable cert, call `CGRequestScreenCaptureAccess()` (not preflight), expect the responsible-process attribution gotcha, and `Cmd+Q`+reopen after any permission toggle.

### Integration with the voice orchestrator (cross-ref L7)

Per `07-claude-cursor-brain.md`, the voice brain runs as the **OMP SDK in-process inside a Bun/Node orchestrator** (`createAgentSession()` + `session.subscribe(text_delta)`) — there is **no HTTP router** and no separate Python loop to talk to. That constrains how the screen-awareness stack plugs in:

- **AX-tree + OCR are context *sources* for the OMP session**, not separate brains. The orchestrator reads the AX tree (via `macapptree`/AX) and injects a compact screen-context summary into the OMP session's context so V4-Flash "sees" the screen as text. This is the $0 path and it lives inside the orchestrator.
- **Native helpers (AX, `ocrmac`, ScreenCaptureKit) run as a small Swift/Python child process or Node native addon** spawned by the orchestrator — they are the *only* parts that need *Accessibility* / *Screen Recording* permission, and (per §1.2) on Tahoe the child needs its own TCC grant, so sign it with a stable `TeamIdentifier`.
- **Ollama vision** is called from the orchestrator via the Ollama JS SDK (local HTTP to `localhost:11434` — that's fine; the no-HTTP rule is about OMP, not Ollama).
- **Cloud vision fallbacks** (Gemini Flash / Claude Haiku) are plain HTTP `fetch` calls from the orchestrator; their text output is then handed to the V4-Flash brain.
- **The image never reaches V4-Flash.** Vision models return text descriptions; only that text enters the OMP session. This preserves the "V4-Flash is text-only" rule while still giving the brain eyes.

Net: screen awareness is a *sense organ* attached to the in-process OMP orchestrator, feeding text context into the session — not a parallel pipeline.

**Tooling shortlist (reuse, don't rebuild):**
- `macapptree` (MacPaw) [31] — native AX tree parser.
- `Screen2AX` (MacPaw) [33] — vision-derived AX fallback for unsupported apps.
- `ocrmac` [25] / `macos-vision-ocr` [26] — Vision-framework OCR.
- ScreenCaptureKit (`SCContentFilter`) for the rare true screenshot [8].
- Ollama: `minicpm-v` or `qwen2.5-vl` for free local vision.

---

## Sources

- [1] Screen2AX paper — arXiv:2507.16704 — only 33% of macOS apps have full AX support; 77% F1 tree reconstruction; 2.2× over native AX; beats OmniParser V2 on ScreenSpot — https://arxiv.org/abs/2507.16704
- [2] DeepSeek official Models & Pricing (read 2026-07-07) — V4-Flash $0.14/$0.28, V4-Pro $0.435/$0.87; features JSON/ToolCalls/ChatPrefix/FIM, no vision listed — https://api-docs.deepseek.com/quick_start/pricing
- [3] Tencent CloudBase — "deepseek-v4-pro supports image input (multimodal); pro series is the only model that accepts image_url" (third-party host, not official API) — https://docs.cloudbase.net/en/recipes/add-multimodal-image-cloudbase-deepseek-v4
- [4] Rob Allen — `screencapture -l<windowID>` window capture — https://akrabat.com/screenshot-of-the-active-window-on-mac/
- [5] Apple — `CGWindowListCopyWindowInfo` (still available) — https://developer.apple.com/documentation/coregraphics/1455137-cgwindowlistcopywindowinfo
- [6] Nonstrict — `CGWindowListCreateImage` deprecated in macOS 15, sibling funcs survive — https://nonstrict.eu/blog/2023/a-look-at-screencapturekit-on-macos-sonoma/
- [7] Fazm — ScreenCaptureKit Demo App (2026) — recommended modern API — https://fazm.ai/blog/screencapturekit-demo-app
- [8] Apple — Capturing screen content in macOS (`SCContentFilter(desktopIndependentWindow:)`) — https://developer.apple.com/documentation/ScreenCaptureKit/capturing-screen-content-in-macos
- [9] alttab-macos — MRU via NSWorkspace activation notifications + per-app AXObserver for intra-app window changes — https://github.com/sergio-farfan/alttab-macos
- [10] gist ljos/3040846 — match frontmost window by `kCGWindowOwnerPID` not name — https://gist.github.com/ljos/3040846
- [11] openclaw/openclaw#14138 — Tahoe TCC: permission attributed to responsible process, not parent — https://github.com/openclaw/openclaw/issues/14138
- [12] Apple Developer Forums / HackTricks — Tahoe app-bundle requirement; code-signature hash = permission reset; `CGRequestScreenCaptureAccess` vs preflight — https://developer.apple.com/forums/tags/screencapturekit · https://hacktricks.wiki/en/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-input-monitoring-screen-capture-accessibility.html
- [13] Rekort / Screenify — stale TCC cache; disk-space black frames; DRM; DisplayLink; `tccutil reset`; `Cmd+Q`+reopen — https://rekort.app/blog/screen-recording-black-screen-fix · https://www.screenify.studio/blog/2026-04-23-macos-screen-recording-permissions
- [14] LazyScreenshots — built-in shortcuts bypass TCC; DRM blank frames — https://www.lazyscreenshots.com/blog/mac-screenshot-screen-recording-permissions/
- [15] Anthropic — Computer use tool (standard tool-use pricing) — https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- [16] Anthropic Vision docs — ~1,600 tokens/screenshot; downsample to control cost — https://platform.claude.com/docs/en/build-with-claude/vision
- [17] Google — Gemini 2.5 Flash multimodal; 1024² ≈ 1,290 tokens — https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
- [18] pricepertoken — Gemini 2.5 Flash $0.30/$2.50 per M — https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash
- [19] OpenAI — GPT-4o $2.50/$10.00 per M — https://developers.openai.com/api/docs/pricing
- [20] OpenAI Images & Vision — high detail 85 + 170×tiles; low detail fixed 85 tokens — https://openai-hd4n6.mintlify.app/docs/guides/images
- [21] Anthropic official Pricing (read 2026-07-07) — Sonnet 5 $2/$10 intro→$3/$15; Sonnet 4.6 $3/$15; Haiku 4.5 $1/$5; Opus 4.8 $5/$25; cache hits 0.1×; Batch 50% off — https://platform.claude.com/docs/en/about-claude/pricing
- [22] Replicate — DeepSeek-VL2 ~$0.037/run — https://replicate.com/deepseek-ai/deepseek-vl2
- [23] ocrmac benchmarks — M3 Max: accurate 207ms / fast 131ms — https://github.com/straussmaximilian/ocrmac
- [24] CreateWithSwift — VNRecognizeTextRequest accurate vs fast mode — https://www.createwithswift.com/recognizing-text-with-the-vision-framework/
- [25] ocrmac — Python wrapper for macOS Vision OCR — https://github.com/straussmaximilian/ocrmac
- [26] bytefer/macos-vision-ocr — CLI Vision OCR with positions — https://github.com/bytefer/macos-vision-ocr
- [27] koncile / Klippa — Tesseract struggles with noise, complex layouts, tables, handwriting; >95% only on clean text — https://www.koncile.ai/en/ressources/is-tesseract-still-the-best-open-source-ocr · https://www.klippa.com/en/blog/information/tesseract-ocr/
- [28] aimultiple OCR Benchmark — Tesseract struggles with scanned docs — https://aimultiple.com/ocr-accuracy
- [29] Tesseract docs — wants ≥300 DPI input — https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html
- [30] Apple — AXUIElement (`kAXTitleAttribute`, etc.) — https://developer.apple.com/documentation/applicationservices/axuielement
- [31] MacPaw/macapptree — native macOS accessibility parser — https://github.com/MacPaw/macapptree
- [32] scriptide — tracking active window on macOS; the 30 ms frontmost-window delay — https://scriptide.tech/blog/tracking-active-window-macos-objective-c-electron
- [33] MacPaw/Screen2AX — open-source vision-derived AX tree — https://github.com/MacPaw/Screen2AX
- [34] DEV.to — Computer Use ~1,600 tokens/screenshot, 466–499 system overhead — https://dev.to/_53fb7c03dd741a6124e4e/claude-now-controls-your-desktop-computer-use-tool-deep-dive-p40
- [35] ui.vision — ~1¢ for "find button"; ~$0.30 for game automation — https://ui.vision/ai/computeruse
- [36] vanja.io — Claude Code Computer Use on Mac — https://vanja.io/claude-code-computer-use/
- [37] ucstrategies / pick-right — OpenAI Operator needs ChatGPT Pro $200/mo, no API; Claude wins for dev integration — https://ucstrategies.com/news/openai-operator-specs-pricing-real-world-performance-guide-2026/ · https://pick-right.com/tools/openai-operator/
- [38] MindStudio — DeepSeek V4 vision ≈90 KV-cache entries/image vs Claude ≈870 (10×); 90–95% of Claude quality at 10–14× lower cost — https://www.mindstudio.ai/blog/deepseek-v4-vision-cheaper-multimodal-ai-workflows
- [39] aimadetools — DeepSeek vision 10× cheaper than alternatives — https://www.aimadetools.com/blog/deepseek-vision-complete-guide/
- [40] deepseek-ai/DeepSeek-VL2 — MoE VLM, 4.5B activated params, OCR/doc/chart/grounding — https://github.com/deepseek-ai/deepseek-vl2
