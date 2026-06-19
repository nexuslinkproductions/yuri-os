[2m[tool] read_file[0m
[2m[tool] list_dir[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] edit_file[0m
[2m[tool] write_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
Clean. Everything is built, tested, and verified. Here's the full deliverable.

---

# Yuri JARVIS — Architecture + Implementation + Test Plan

## 1. ARCHITECTURE (the HOW)

### Primitive set — 4 new model-callable tools, she composes them

| Tool | What it does | When the model uses it |
|---|---|---|
| **`applescript`** | Run arbitrary AppleScript via `osascript -e` | HIGH-LEVEL path — any app with a scripting dictionary (Spotify, Mail, Calendar, Safari, Music, Finder, Notes, Reminders, Messages). PREFERRED. |
| **`gui_script`** | Drive the GUI via `System Events` (keystrokes, key codes, clicks, menu nav) | UNIVERSAL FALLBACK — apps without a dictionary, or when you need to click/type/navigate menus. |
| **`open_app`** | Launch/focus/quit any app (`open -a`, `activate`, `quit`) | Prerequisite before `gui_script` on most apps. |
| **`screenshot`** | `screencapture` + optional GLM-4V vision description | When scripting isn't enough — read a web page, locate a UI element, see a dialog, answer "what's on screen". |

Existing tools (`bash`, `read_file`, `write_file`, `edit_file`, `spawn_worker`) are unchanged.

**Key design decision: scripting-first, vision-second.** I verified live that Accessibility AND Screen Recording permissions are already granted in Marcel's Terminal context. But I made vision *optional* (`describe=true` by default, falls back to raw file path if the vision model isn't available). AppleScript is the reliable path for 90% of apps; GUI scripting covers the rest; vision is for when you genuinely need to *see* the screen (reading a rendered web page, finding a button with no scripting hook). GLM-4V is on the Z.ai Anthropic endpoint; if it's not on the plan, she degrades gracefully — saves the PNG and tells Marcel the path.

### Confirm-gate state machine

```
run_brain(req_messages)
  │
  ├─ pending action exists? + user affirms (yes/confirm/do it) + no negate
  │   → execute stored action → continue normal loop with result
  │
  ├─ pending action exists? + user negates (no/cancel/wait)
  │   → clear pending → "Okay, cancelled."
  │
  └─ normal turn → _run_agent_loop()
      │
      └─ model calls tools → for each tool_use:
          ├─ _is_critical_call(tool, args)?
          │   ├─ YES → store pending action + speak "I'm about to <action> — that right?" + HOLD
          │   └─ NO  → _exec_tool() + feed result back → loop
          └─ no tools → spoken answer
```

**Classification rules** (`_is_critical_call`):
- `write_file` / `edit_file` → ALWAYS critical (mutating)
- `bash` → critical if command matches `_CRITICAL_BASH` regex: `rm`, `mv -f`, output redirect (`>`), `git push`, `git commit`, `git tag`, `sendmail`, `mail -s`
- `applescript` / `gui_script` → critical if script matches `_CRITICAL_APPLESCRIPT`: `send`, `delete`, `empty trash`, `create new event/message`, `make new outgoing message`
- `read_file`, `open_app`, `screenshot`, `spawn_worker` → always routine

**Pending state persists** to `_SYSTEM/state/voice/yuri-pending-action.json` (same pattern as `yuri-z-history.json`). Survives across voice turns and brain restarts.

### Permissions (verified live 2026-06-19)

| Permission | Status | How Yuri handles failure |
|---|---|---|
| Accessibility | ✅ **Already granted** | `_run_osascript()` detects "not allowed" from System Events and returns a spoken message naming the exact System Settings path |
| Screen Recording | ✅ **Already granted** | `screencapture` works; vision description degrades gracefully if GLM-4V unavailable |
| Automation (per-app) | Prompts once on first control | macOS native prompt; if clicked "Don't Allow", Yuri's error message names the Automation settings path |

## 2. IMPLEMENTATION — what changed in the code

**`_SYSTEM/Scripts/voice/yuri-z-brain.py`** (363 → 656 lines):

| Section | Change |
|---|---|
| `TOOLS` list | +4 tools: `applescript`, `gui_script`, `open_app`, `screenshot` (full Anthropic schema) |
| `TOOL_NOTE` system prompt | Rewritten for JARVIS role: macOS-control tools documented, confirm-gate rules documented |
| Confirm-gate constants | `PENDING_FILE`, `_ROUTINE_TOOLS`, `_CRITICAL_BASH`, `_CRITICAL_APPLESCRIPT`, `_AFFIRM`, `_NEGATE` |
| `_is_critical_call()` | Classifies each tool call as routine vs critical |
| `_load_pending()` / `_save_pending()` / `_clear_pending()` | Pending-action store (JSON, atomic write) |
| `_describe_action()` | Human-spoken description of what a pending action will do |
| `_run_osascript()` | Executes AppleScript, detects permission failures, returns helpful guidance |
| `_describe_screenshot()` | Base64-encodes screenshot → GLM-4V vision → text description (graceful degrade) |
| `_exec_tool()` | +4 new dispatch branches (applescript, gui_script, open_app, screenshot) |
| `run_brain()` → `_run_agent_loop()` | **Restructured**: confirm-gate state machine at entry, agent loop extracted to `_run_agent_loop()`. **Bug fix**: eliminated the wasted double `_messages_call()` (first call was overwritten by loop's first iteration). |

**`_SYSTEM/Scripts/voice/yuri-voice-brain.md`**: Added JARVIS role section + confirm-gate behavior.

**`_SYSTEM/Scripts/voice/YURI_JARVIS_SETUP_AND_TEST.md`** (new): Permission setup, test plan, troubleshooting, architecture diagram.

## 3. VERIFIED (what I ran)

| Test | Result |
|---|---|
| Python syntax | ✅ Compiles clean |
| 9 tools registered | ✅ All present with valid schemas |
| Confirm-gate classification (11 checks) | ✅ rm→critical, ls→routine, write_file→critical, read_file→routine, send→critical, play→routine |
| Pending-action store roundtrip | ✅ Save/load/clear |
| Affirm/negate regex | ✅ yes/confirm/go ahead detected; no/cancel/wait detected |
| Protected-path checks | ✅ unchanged |
| **Live: GET /health** | ✅ `{ok:true, brain:"z.ai-glm", model:"glm-5-turbo", haskey:true}` |
| **Live: POST /v1/chat/completions** | ✅ GLM responded: "Hey Marcel..." — contract preserved |
| **Live: SSE stream** | ✅ `data: {choices:[{delta:...}]}...data: [DONE]` — contract preserved |
| **Live: list running apps** | ✅ GLM autonomously used `applescript` → "Finder, Comet, VS Code, WhatsApp..." |
| **Live: calendar check** | ✅ GLM autonomously used `applescript` → "Calendar came back empty — no events scheduled" |
| **Live: Spotify status** | ✅ GLM used `applescript` → "Spotify is running but paused" |
| **Live: confirm-gate write file** | ✅ Held → "I'm about to write to test-yuri-gate.txt — that right?" |
| **Live: confirm → execute** | ✅ "yes do it" → file written → "Done." |
| **Live: confirm → cancel** | ✅ "no never mind" → "Dropped it." → file NOT written |
| **Live: open_app Finder** | ✅ Activated |
| **Live: screenshot** | ✅ Real PNG captured |
| Self-verification suite (8 groups) | ✅ All pass |

## 4. FOR CLAUDE TO VERIFY

The implementation is in `_SYSTEM/Scripts/voice/yuri-z-brain.py` (656 lines). Claude should:
1. `python3 -c "import py_compile; py_compile.compile('_SYSTEM/Scripts/voice/yuri-z-brain.py', doraise=True)"` — syntax
2. Run the self-verification suite (the heredoc test above)
3. Start the brain on a test port and confirm the HTTP contract (health + chat completions + stream)
4. Confirm the confirm-gate cycle (trigger critical → hold → confirm → execute)
5. Check that `_run_osascript` handles permission errors gracefully
6. Verify no protected paths are newly exposed (the `_is_protected` floor is unchanged)

## 5. DECISIONS I MADE (forks Marcel should know about)

1. **Vision model**: I used `glm-4v` as the default (`YURI_Z_VISION_MODEL` env override). If it's not on the GLM Coding Plan, `screenshot` with `describe=true` will degrade to "screenshot saved to /tmp/... (vision description failed: ...)". Marcel can set `YURI_Z_VISION_MODEL` to any Z.ai vision model, or just use `describe=false` for raw file paths.

2. **Bug fix**: The original `run_brain()` called `_messages_call()` before the loop, then again at the top of the loop — the first call's response was immediately overwritten. I fixed this by restructuring into `_run_agent_loop()` which does one call per iteration. This saves one API call per turn.

3. **`spawn_worker` is routine (not critical)**: Spawning a watched worker terminal with its own permission prompts is not destructive. The worker itself has its own interactive prompts as the backstop.

4. **Confirm-gate only gates the FIRST critical call in a batch**: If the model emits multiple tool calls and one is critical, we store the first critical one and hold. The routine ones in the same batch are not executed (we break the loop). This is conservative — better to re-run the routine calls after confirmation than to execute some-but-not-all of a multi-step plan.

5. **`open_app` quit is routine**: Quitting an app (Cmd+Q equivalent) is treated as routine. If Marcel disagrees, I can move `action=quit` to critical — but apps can be re-opened, so I classified it as non-destructive.
