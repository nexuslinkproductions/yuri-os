# A2 — Native macOS Computer-Use for Yuri (architecture map, synthesized)

> Synthesized from a 6-lane deepseek-flash research fan-out (`.claude/jobs/olf-mr7zlu98-2f21a6/`)
> + the Jeffrey 3-layer stack research. The "hey clicky" specific repo is TBD (operator to
> provide link) — this map covers the category it belongs to; hey-clicky folds in once confirmed.
> Constraint: cloud-only brain (GLM-5.2); local infra allowed (AX APIs, on-demand vision).

## The one insight that shapes everything

**Dual-path context acquisition** (the winning pattern from Microsoft UFO² + Sylinko Everywhere,
echoed by ghost-os, open-codex-computer-use, Open Interpreter):

> **Primary = OS-native accessibility (AXAPI on macOS) → structured element tree.**
> **Fallback = screenshot → vision grounding — ONLY when accessibility returns ∅ (Electron/canvas).**

Structured accessibility is faster, cheaper, more reliable than screenshots. Vision is the escape
hatch, not the default. This is the opposite of Anthropic's screenshot-first computer-use (which
the operator finds "sloppy and slow") — and it's why the best OSS setups beat it.

## The 5-layer YURI architecture

```
                        ┌─ GLM-5.2 brain (cloud) ─ reasons over structured context → emits action ─┐
                        │                                                                       │
   Layer 1 CONTEXT      │  ScreenContextProvider (dual-path)                                     │
   (what Yuri "sees")   ├─► Primary: AXAPI (AXUIElement) + AppleScript/System Events              │
                        │     → ActiveWindow{title, pid, app, element-tree[], text, focus}        │
                        │  Fallback: screencapture → OmniParser-v2 (on-demand) → [{bbox,caption}] │
                        │                                                                       │
   Layer 3 EXECUTOR ◄───┤  osascript + System Events (element-aware: open/click menu/type)        │
   (how Yuri acts)      │  + cliclick/pyautogui (coordinate fallback)                             │
                        │                                                                       │
   Layer 4 SAFETY ◄─────┤  Architectural confirm-gate (YURI PreToolUse hooks — ALREADY EXIST)     │
   (what's allowed)     │  allowlist→silent / denylist→confirm / unclassified→default-deny         │
                        │                                                                       │
   Layer 5 SANDBOX ◄────┘  sandbox-exec / cua-driver (background, no cursor steal) — advanced      │
```

## Layer-by-layer — the repos that inform each + what to reuse

### Layer 1 — ScreenContextProvider (context acquisition)
| source | what it proves | reuse for YURI |
|---|---|---|
| **Everywhere** (Sylinko, 6.1k★) — Windows UIA + macOS AXAPI | `VisualElementContext` wraps accessibility → focused element, element-from-point, bbox, control type, text | the `ScreenContextProvider` shape — a unified `ActiveWindow` object |
| **UFO²** (Microsoft, 9.2k★) — UIA + Win32 + WinCOM + vision fallback | dual-path pipeline: UIA for standard controls, vision for custom/unlabeled | the dual-path routing logic (AX → fallback → vision) |
| **ghost-os** (1.6k★) — macOS AX tree + ShowUI-2B fallback | structured AX with vision fallback; **self-learning recipes** (frontier learns, small replays) | the recipe-capture pattern → YURI's archivist/skill-capture |
| **open-codex-computer-use** (1.3k★) — Swift, macOS AX, MCP | clean lightweight AX→MCP adapter | the Swift MCP bridge reference |

### Layer 2 — the brain
**GLM-5.2 (cloud) reasons over the structured context, NOT over raw screenshots.** This is the key
departure from UI-TARS/Anthropic (full-agent VLMs). YURI's brain consumes the AX tree OR the
OmniParser parse (structured JSON), emits an action. One model, not two.

### Layer 3 — executor
**osascript + System Events is the best first-layer executor** (CU04, verified): deterministic
(zero inference), element-aware (coordinate-free), covers open-app/click-menu/type-field in one
call. `cliclick`/`pyautogui` as coordinate fallback. AppleScript already proven in YURI's JARVIS
with graceful degrade on TCC denial.

### Layer 4 — confirm-gate (the moat — already built)
**YURI's PreToolUse hooks ARE the architectural HITL pattern** (CU06, direct mapping):
- `settings.json` deny-list = allowlist/denylist classification
- `bash-security-guard.js` = policy engine outside the LLM
- `tirith-url-guard.js` = confirm-gate
- `operator-write-guard.js` = role-gated allowlist

The LLM cannot see/modify the hook decision. This is the propose→policy-classify→execute pattern
Cloudflare/Anthropic recommend — **YURI already has it.** Reuse, don't rebuild.

### Layer 5 — vision fallback (OmniParser v2, not UI-TARS)
**OmniParser v2 (Microsoft)** is the right grounding layer (CU05): stateless, returns structured
`[{bbox, caption, interactable}]` (YOLO icon_detect + Florence-2 caption), ~1-3s, zero VRAM
residency. GLM-5.2 reasons over the parse → action. **UI-TARS is rejected as a sub-layer** (it's a
full agent VLM — running two VLMs is wasteful); it stays available as a standalone fallback *agent
lane* if GLM is unavailable.

```
AX returns ∅ (Electron/canvas)
  → screencapture → OmniParser-v2 (load→parse→unload)
  → [{bbox,caption,interactable}, ...] → GLM-5.2 reasons → action
```

## Build plan (phased, DISARMED-first)

| phase | what | dependency |
|---|---|---|
| **A2.1** | `ScreenContextProvider` — macOS AXAPI reader (AXUIElement via osascript/JXA or a Swift helper) → `ActiveWindow` JSON. Hermetic tests with fixture AX output. | none (pure read) |
| **A2.2** | `osascript` executor — open-app/click-menu/type-field via System Events, element-aware. Wire the confirm-gate (Layer 4) from day 1. | A2.1 |
| **A2.3** | OmniParser-v2 on-demand fallback — `screencapture` → OmniParser (cloud or local-2GB) → structured parse → GLM-5.2. | A2.1 (the ∅ trigger) |
| **A2.4** | GLM-5.2 action loop — brain consumes `ActiveWindow` (AX or OmniParser) → emits action → executor → confirm-gate → verify (re-read AX/screen-diff). | A2.1-3 |
| **A2.5** | sandbox + background mode (cua-driver pattern, no cursor steal) — advanced. | A2.4 |

## Open decisions (operator)

1. **"hey clicky" link** — fold its code in as the spine once provided. (The map above is robust
   without it; hey-clicky may offer a cleaner reference implementation for one layer.)
2. **OmniParser hosting** — cloud endpoint (new external dep) vs local 2GB model (the M2 Pro can
   run it on-demand, load/unload — NOT resident, fits the cloud-only-model rule since it's a tiny
   specialist model, not a generative LLM). Recommend: local on-demand first (no new dep), cloud later if latency matters.
3. **AX reader implementation** — osascript/JXA (no new dep, slower) vs a small Swift helper
   (faster, native AXUIElement). Recommend: JXA first (zero-dep), Swift helper if perf demands.
4. **Sandbox scope (A2.5)** — sandbox-exec for shell actions only, or full cua-style VM isolation?

## What this beats

Anthropic's native computer-use (screenshot-first, single VLM, "sloppy and slow") → YURI's
AX-first dual-path is faster (no screenshot round-trip for 80% of cases), cheaper (no per-action
VLM), more reliable (structured elements > pixel-guessing), and safer (the architectural
confirm-gate, not a prompted plea). This is the "we can do better" the operator asked for.

## Sources (from the fan-out, cited)
- ghost-os: github.com/ghostwright/ghost-os · trycua/cua: github.com/trycua/cua (19.4k★)
- UI-TARS-desktop: github.com/bytedance/UI-TARS-desktop (37.7k★) · Agent-S: github.com/simular-ai/Agent-S (OSWorld 72.6%)
- Everywhere (Sylinko, 6.1k★) · UFO² (Microsoft, 9.2k★) · Open Interpreter (Rust, apache-2.0)
- OmniParser-v2: HF `microsoft/OmniParser-v2.0` · open-codex-computer-use: github.com/iFurySt/open-codex-computer-use
