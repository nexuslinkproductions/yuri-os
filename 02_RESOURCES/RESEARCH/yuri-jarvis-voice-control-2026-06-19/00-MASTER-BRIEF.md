# MASTER BRIEF — Yuri JARVIS: full hands-free macOS voice control

Mission ground-truth (2026-06-19). Owner: Marcel. Build lane: GLM-5.2 (z.ai via llm-compat).
Verify lane: Claude/Opus. Process: GLM builds → Claude verifies → Marcel tests → Marcel confirms → Claude commits+pushes.

## THE VISION (what Yuri IS)

`yuri` (launcher `_SYSTEM/Scripts/voice/yuri.sh`, alias `yuri`) is Marcel's JARVIS — his voice and his hands
on the MacBook. The goal: **operate the entire computer hands-free, by voice.** Anything Marcel would do with
mouse + keyboard, Yuri does for him. She is his right-hand AI personal assistant, not a "main-session spawn".

Concrete examples (these are EXAMPLES of a general capability, NOT the feature list):
- "Launch Spotify" → she opens it → "what do you want to hear?" → "play <X>" → she plays it.
- "Check my mail" / "what's on my calendar today" → she reads it back.
- "Open the browser, go to <site>, search <term>" → she does it.
- "Delete <file>" / "push my changes" / "send an email to <person>" → critical → she VERIFIES first (below).

The requirement is GENERAL computer use by voice — full navigation + operation of any app/any UI. Do NOT
scope this to a fixed list of features; build the general primitives that let her drive ANY app.

## CONFIRM-GATE (the safety model — replaces blanket refusal)

Marcel's model: full execution authority, with a spoken human-in-the-loop confirm on critical actions.
- ROUTINE op (read, open an app, play music, navigate, query) → execute directly.
- CRITICAL op → she SPEAKS BACK her understanding and HOLDS, does NOT execute yet:
  "I'm about to <action> — that right? Confirm and I'll do it." Then on the NEXT voice turn, if Marcel
  affirms (yes / confirm / do it / go ahead / correct) → execute. If he negates/corrects → drop or adjust.
- CRITICAL = destructive (delete/rm/overwrite/move-over-existing), outward-facing (send email/message, post,
  `git push`, `git commit`, publish), OR anything Marcel explicitly says "verify / ask me first / double-check".
- This is a SUPERVISED bypass: she gets full permission ONLY through Marcel's spoken confirm. Not a blanket
  bypass. Requires CROSS-TURN STATE: a pending-action store that survives between voice turns.

## SAFETY FLOOR (keep — matches a real worker session)

Verified: a spawned worker (`ai claude-zai`) runs as the OWNER (`dev`) role and is EXEMPT from
`bash-security-guard.js` (it only restricts the `coworker` role, line 1012). A worker's ONLY hard floor is:
the always-on blocks (`.env` read/write/mutate/remove; sensitive `.claude` file read/write/remove;
download-execute `curl|sh`; decode-execute `base64|sh`) + the `.claude/settings.json` deny-list
(`.env*`, `backend/data/**`, `.claude/state|history|file-history|projects/**`, `node_modules/**`, `.amp/**`).
Generic destructive commands (`rm -rf`, `sudo`, `mkfs`, `git push --force`) are NOT blocked for the owner —
the interactive permission prompt is the worker's backstop. Yuri has no prompt, so the CONFIRM-GATE is her
equivalent backstop. KEEP `.env`/secrets/sensitive-`.claude` HARD-blocked (worker parity); everything else is
confirm-gated, never refused. Workers themselves are ALREADY main-session-grade — no change needed there.

## CURRENT STATE (the code you are extending)

`_SYSTEM/Scripts/voice/yuri-z-brain.py` — an OpenAI-compatible HTTP server on :8014 that bot.py (Pipecat
voice loop) calls. It drives Z.ai GLM (default glm-5-turbo) over the Anthropic Messages endpoint
(`api.z.ai/api/anthropic`, Bearer). Shape to preserve: POST /v1/chat/completions in, {choices:[{message}]} out
(+ SSE stream variant), GET /health. Key from keychain `yuri-zai-api-key`.

Already in place (model-driven, multi-step agent loop — KEEP this design, extend it):
- TOOLS (Anthropic tool schema, the model CHOOSES to call): `bash`, `read_file`, `write_file`, `edit_file`,
  `spawn_worker`. `run_brain()` loops up to MAX_TOOL_ITERS, executing chosen tools via `_exec_tool(name,args)`
  and feeding `tool_result` blocks back until the model emits a final spoken answer.
- Caps just raised to main-session-grade: MAX_TOOL_ITERS=50, BASH_TIMEOUT=600, OUTPUT_CAP=40000.
- Persona (`yuri-voice-brain.md`) + MEMORY.md injected as system prompt; rolling history persisted across
  restarts (`_SYSTEM/state/voice/yuri-z-history.json`); `<think>` stripped from replies.
- Replies must stay SHORT (1–2 spoken sentences); she SUMMARIZES tool output, never reads raw output aloud.

`_exec_tool` runs in the repo root (`REPO`). bash currently passes through a `_bash_block_reason` floor.
`spawn_worker` → `yuri-spawn-worker.sh` → opens a visible tmux Terminal running `ai claude-zai` (a GLM-backed
Claude Code MAIN session, normal permission prompts). That worker wiring is DONE and correct.

## DESIRED ARCHITECTURE (seed — refine it, this is the "HOW" Marcel asked you to propose)

Add GENERAL macOS-control primitives as new model-callable tools (she composes them per request; do NOT
hardcode per-app intent regex — keep her agency, Marcel's standing directive "don't treat an SLM as lesser").
Proposed primitive set (justify / refine / add):
- `applescript` — run arbitrary AppleScript via `osascript -e`. Unlocks app dictionaries: Spotify (play/pause/
  search), Mail (read/compose/send), Calendar (events), Music, Safari/Chrome (tabs/URLs), Finder, System.
  This is the high-level reliable path for most apps.
- `system_events` / `keystroke` / `click` / `menu` — GUI scripting via `tell application "System Events"` for
  apps WITHOUT a dictionary: keystrokes, key combos, menu-bar navigation, clicks. The universal fallback.
- `open_app` — launch/focus/quit an app (`open -a`, AppleScript activate).
- `screenshot` (+ optional vision read) — `screencapture`; optionally feed the image to a vision model so she
  can answer "what's on screen" / locate a UI element when scripting isn't enough. Propose whether v1 needs
  vision or scripting-first is sufficient.
- Keep existing `bash`, `read_file`, `write_file`, `edit_file`, `spawn_worker`.

Wire the CONFIRM-GATE as a state machine around `_exec_tool`/`run_brain`: classify each chosen tool-call as
routine vs critical; on critical, instead of executing, store a PENDING action + speak the confirmation and
return; on the next turn detect affirmation and execute the stored action. Persist pending state like history.

## PREREQUISITE — macOS permissions (document clearly; degrade gracefully)

GUI automation is gated by macOS. The process running osascript/System Events (the python host / its parent
Terminal) needs: **Accessibility** (System Settings → Privacy & Security → Accessibility), **Screen Recording**
(for screenshots), and per-app **Automation** approvals (first control of each app prompts once). The build
MUST detect a permission failure and tell Marcel exactly what to grant, not fail silently. Include the exact
setup steps. (Mic is already granted.)

## DELIVERABLES (from you, GLM-5.2)

1. The architecture / HOW writeup (primitive set + confirm-gate state machine + permission model), with any
   decisions you're making and any genuine forks you want Marcel to pick.
2. Concrete implementation: the new TOOLS entries + their `_exec_tool` executors + the confirm-gate code, as
   exact Python to drop into `yuri-z-brain.py` (and any helper scripts). Preserve the :8014 OpenAI-compat
   contract and the model-driven loop.
3. The macOS permission setup steps + graceful-degrade handling.
4. A test plan: how Marcel verifies each capability live (Spotify play, mail read, calendar, a confirm-gated
   delete, etc.).

## CONSTRAINTS

- Don't break the bot.py integration (same :8014 endpoint + response shape). Keep her snappy + replies short.
- Keep `.env`/secrets/sensitive-`.claude` hard-blocked; everything else confirm-gated, not refused.
- Model-driven (she decides which tools to compose); no agency-stripping intent hardcoding.
- This is Marcel's own owned MacBook. Owner-authorized. Protected paths still off-limits.
- Output the implementation as code blocks Claude can apply + verify; Claude verifies locally before Marcel tests.
