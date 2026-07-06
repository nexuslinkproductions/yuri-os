# Jeffrey computer-control stack — voice-driven Windows automation (2026-07-04)

> Deep-research capture (Sonnet lane, online-verified). Requirement: "he just talks, nothing else" — launch apps, type, navigate, all by voice, fully local, sharing 16GB VRAM with the LLM stack.

## Recommended 3-layer stack

**Layer 1 — UIA-first, deterministic, ~zero VRAM.** Base the control loop on **CursorTouch/Windows-MCP** (+ Windows-Use): UIA-based screen reading ("no computer vision model required" by default), native Ollama support with schema-sanitization fixes for small-model tool calls, MCP server shape that plugs straight into an agent loop. Covers: launch app, type into fields, click menus, drive standard dialogs across Win32/WinForms/WPF/Office/Explorer.
**Layer 2 — vision fallback, ON-DEMAND, never resident.** For Electron/custom-rendered UI where UIA sees nothing: (a) UI-TARS-2B GGUF (~1-2GB) load/unload per fallback — CAVEAT: ByteDance officially downgraded GGUF support, accuracy unverified; or (b) OmniParser v2 (needs ~8GB — unload the 12B worker for the grounding pass, it isn't needed mid-vision anyway).
**Layer 3 — confirm-gate, ARCHITECTURAL not prompted.** Industry consensus: prompt-based "ask before destructive" is not real HITL — models skip it, injection strips it. Pattern: agent proposes → policy engine OUTSIDE the model classifies (allowlist: open/click-UIA-confirmed/type-UIA-confirmed = silent auto-execute; deny-pattern: delete/overwrite/registry/PowerShell/send/financial = spoken confirm + voice-yes gate) → only approved actions reach execution. Mirrors YURI's own deterministic PreToolUse-hook pattern.

## Key verdicts

- **UFO²** (Microsoft Desktop AgentOS): right architecture (HostAgent/AppAgent ≈ conveyor/worker), local-model path exists via OpenAI-compat config but is UNVERIFIED end-to-end with small models; heavyweight setup. Mine its ideas (speculative multi-action, Picture-in-Picture isolated desktop), don't adopt wholesale.
- **Grounding VLM residency**: impossible alongside conveyor+12B on 16GB — a 7B VLM alone wants 16GB FP16. On-demand load/unload is the only honest pattern. Nobody ships a validated "conveyor+worker+grounding on 16GB" config — needs local empirical testing.
- **Electron gap is structural**: Chrome/Edge/Electron apps need `--force-renderer-accessibility` for UIA; canvas/WebGL controls stay invisible → vision fallback or flag-provisioning per app. Inventory René's ACTUAL app list before committing to UIA-only MVP.
- **Talon Voice**: mature voice-control but grammar-driven, wrong fit for freeform "he just talks" — usable as a hardened-command fallback layer only.
- **Windows-MCP safety posture is thin by its own admission** (full user privileges, no sandbox, "operations cannot be undone") — Layer 3 IS the safety net and must be airtight for a non-technical user.
- Wrong-click recovery is an unsolved field-wide gap — plan post-action verification (screenshot-diff / UIA state re-read) rather than trusting retry loops.

Sources: github.com/microsoft/UFO · microsoft.com/en-us/research/publication/ufo2-the-desktop-agentos/ · arxiv.org/html/2504.14603v1 · github.com/microsoft/omniparser · github.com/bytedance/ui-tars (+README_v1 GGUF downgrade) · huggingface.co/ByteDance-Seed/UI-TARS-2B-SFT · github.com/CursorTouch/Windows-Use · github.com/CursorTouch/Windows-MCP (+SECURITY.md) · github.com/pywinauto/pywinauto (+issues #1402 #1375) · docs.openinterpreter.com/guides/os-mode · talonvoice.com/docs · developers.cloudflare.com/agents/concepts/agentic-patterns/human-in-the-loop/ · arxiv.org/html/2507.05445v1 · localaimaster.com/blog/ui-tars-desktop-automation · modelfit.io/gpu/rtx-5060-ti/
