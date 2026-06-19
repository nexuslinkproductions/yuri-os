# Yuri JARVIS — macOS Permission Setup + Test Plan

> Setup and live test guide for hands-free macOS voice control. Marcel tests; Claude verifies the code first.

## 1. macOS Permissions (PREREQUISITE — GUI automation is gated by macOS)

The brain process (`yuri-z-brain.py`, started by `yuri.sh` from a Terminal) needs three permissions.
**Verified 2026-06-19: Accessibility and Screen Recording are ALREADY granted in the current Terminal
context.** Per-app Automation prompts fire once on first control.

### What to grant (only if a test fails with a permission error)

| Permission | Where | What it unlocks | Already granted? |
|---|---|---|---|
| **Accessibility** | System Settings → Privacy & Security → Accessibility | `gui_script` (System Events keystrokes/clicks/menu nav) | ✅ YES (verified) |
| **Screen Recording** | System Settings → Privacy & Security → Screen Recording | `screencapture` (the `screenshot` tool) | ✅ YES (verified) |
| **Automation** (per-app) | System Settings → Privacy & Security → Automation | `applescript` control of each named app (Spotify, Mail, Safari, etc.) | Prompts on first use — click "OK" |

### If a permission prompt doesn't appear automatically

Grant the app that runs the brain (Terminal, iTerm, or your launcher):
1. Open **System Settings → Privacy & Security → Accessibility**
2. Click **+** and add **Terminal** (or whichever app runs `yuri.sh`)
3. Ensure the toggle next to it is **ON**
4. Repeat under **Screen Recording** if screenshots fail
5. For Automation: the first time Yuri controls an app via AppleScript, macOS will prompt — click **OK**. If you clicked "Don't Allow", go to System Settings → Privacy & Security → Automation → Terminal and toggle the app back on.

### How Yuri reports permission failures (graceful degrade)

The `_run_osascript()` function detects permission errors and returns a spoken message like:
- *"⚠ macOS Automation permission needed: open System Settings → Privacy & Security → Automation, and allow this Terminal to control the target app."*
- *"⚠ macOS Accessibility permission needed: open System Settings → Privacy & Security → Accessibility, and add Terminal."*

She never fails silently — if a tool can't run, she tells Marcel exactly what to grant.

---

## 2. Test Plan (how Marcel verifies each capability live)

Start Yuri: `yuri` (or `bash _SYSTEM/Scripts/voice/yuri.sh`).
Wait for the health check confirmation: `brain -> Z.ai GLM-5-Turbo (:8014, GLM Coding Plan, $0)`.

### A. Routine macOS control (should execute directly — no confirm)

| Test | Say | Expected behavior |
|---|---|---|
| **Open app** | "Open Finder" | Finder activates. Yuri says "Opened Finder." |
| **Spotify play** | "Play Spotify" | Yuri activates/launches Spotify and hits play. (First time: macOS Automation prompt → click OK) |
| **Spotify status** | "What's playing on Spotify?" | Yuri uses `applescript` to read track name + artist, speaks it back. |
| **Check mail** | "Check my mail" | Yuri reads unread count / subjects from Mail.app via AppleScript. |
| **Calendar today** | "What's on my calendar today?" | Yuri reads today's events via Calendar AppleScript. |
| **Safari navigate** | "Open Safari and go to github.com" | Yuri opens Safari + navigates to the URL. |
| **Screenshot** | "What's on my screen?" | Yuri takes a screenshot, describes it (vision), speaks a summary. |
| **Window list** | "What apps are running?" | Yuri lists frontmost/background apps via System Events. |

### B. Confirm-gate (should HOLD and ask, NOT execute yet)

| Test | Say | Expected |
|---|---|---|
| **Write file** | "Create a file called test.txt with hello world in it" | Yuri says: "I'm about to write to test.txt — that right? Confirm and I'll do it." Does NOT write yet. |
| **Confirm path** | (next turn) "yes" | Yuri writes the file. Says "Done." |
| **Cancel path** | "Delete test.txt" → "no" | Yuri holds on delete → Marcel says "no" → Yuri says "Okay, cancelled." File untouched. |
| **Bash critical** | "Push my changes" | Yuri says: "I'm about to run the command: git push... — that right?" Holds. |
| **Send mail** | "Send an email to John saying hi" | Yuri says: "I'm about to send an email..." Holds. |

### C. General GUI control (the universal fallback)

| Test | Say | Expected |
|---|---|---|
| **Keystroke** | "Copy this" or "Select all" | Yuri uses `gui_script` to send Cmd+C / Cmd+A via System Events. |
| **Menu nav** | "Save this" | Yuri navigates the menu bar via System Events → File → Save. |
| **Type text** | "Type hello into the search box" | Yuri activates the app, clicks the field, types via keystroke. |

### D. Multi-step composition (she chains tools autonomously)

| Test | Say | Expected |
|---|---|---|
| **Browse + search** | "Open the browser, go to Wikipedia, search for black holes" | Yuri chains: open_app(Safari) → applescript(open URL) → gui_script(type in search box + enter). |
| **Work session** | "Open VS Code and pull the latest changes" | Yuri: open_app(VS Code) → bash(git pull) or gui_script. |
| **Delegate** | "Spawn a worker to run the tests" | Yuri uses spawn_worker → opens a visible terminal running the tests. |

---

## 3. Troubleshooting

| Symptom | Fix |
|---|---|
| Yuri says "osascript error: not allowed to send Apple Events" | System Settings → Privacy & Security → Automation → toggle the target app ON for Terminal |
| Yuri says "Accessibility permission needed" | System Settings → Privacy & Security → Accessibility → add Terminal |
| Screenshot returns "vision description failed" | GLM-4V may not be on the plan; she falls back to saving the PNG path. Set `YURI_Z_VISION_MODEL` if you have a vision model. |
| Spotify/Mail doesn't respond | Ensure the app is actually running. First AppleScript control to each app prompts for Automation permission — click OK. |
| Brain not answering on :8014 | Check `_SYSTEM/state/voice/yuri-z-brain.log`. Restart with `yuri`. |

---

## 4. Architecture summary (for Claude's verification)

```
bot.py (Pipecat voice loop)
  → OpenAILLMService(base_url=http://127.0.0.1:8014/v1)
    → yuri-z-brain.py (:8014)
        ├─ run_brain() — confirm-gate state machine
        │   ├─ pending action? + affirm → execute stored action
        │   ├─ pending action? + negate → cancel
        │   └─ normal turn → _run_agent_loop()
        ├─ _run_agent_loop() — model-driven tool loop (up to 50 iters)
        │   ├─ _messages_call() → Z.ai GLM (Anthropic Messages, Bearer)
        │   ├─ tool_use blocks → _is_critical_call() check
        │   │   ├─ critical → store pending + speak confirm + HOLD
        │   │   └─ routine → _exec_tool() + feed result back + loop
        │   ├─ _handle_dispatch() — extract DISPATCH: lines → tmux worker (JARVIS mode)
        │   └─ no tools → spoken answer
        ├─ _exec_tool() dispatch:
        │   bash, read_file, write_file (+_fix_mojibake), edit_file (+_fix_mojibake),
        │   spawn_worker, applescript (osascript), gui_script (System Events),
        │   open_app (open -a / activate / quit), screenshot (screencapture + vision)
        ├─ _fix_mojibake() — repairs UTF-8-as-latin1 double-encoding in model content
        ├─ _run_osascript() — permission-aware, degrades with helpful messages
        └─ HTTP contract preserved: {choices:[{message:{role,content},finish_reason,index}]}
```

---

## 5. GLM-5.2 Upgrade Tests (Phase 2 — verify the fixes)

### Regression suite (run before live testing)

```bash
python3 _SYSTEM/Scripts/voice/test_yuri_z_brain.py
```
Expected: `64/64 passed, 0 failed`. This covers the mojibake fix, dispatch wiring, confirm-gate, safety floor, and tool execution.

### E. Worker spawns on GLM-5.2 (BUG 1)

| Step | Action | Expected |
|---|---|---|
| 1 | `bash _SYSTEM/Scripts/voice/yuri-worker.sh` | Worker terminal opens in tmux |
| 2 | Watch the terminal | It runs `export ZAI_MODEL=glm-5.2 && ai claude-zai` — lands on GLM-5.2, NOT plain `claude` |
| 3 | Check the session header | Shows Z.ai GLM Coding Plan connection, model glm-5.2 |
| 4 | (Alternative) Ask Yuri: "spawn a worker to run the tests" | `yuri-spawn-worker.sh` opens a Terminal window; worker boots on GLM-5.2 |

### F. Markdown writes with fancy punctuation (BUG 2)

| Step | Say / Do | Expected |
|---|---|---|
| 1 | Ask Yuri: "create a file called test-utf8.md with: # Heading — with em-dash → arrow and "smart quotes" …" | Yuri confirms (write_file is critical) → say "yes" |
| 2 | `cat _SYSTEM/Scripts/voice/../../test-utf8.md` | Content has correct `—`, `→`, `"smart quotes"`, `…` |
| 3 | `hexdump -C test-utf8.md \| grep "e2 80"` | Bytes show `\xe2\x80\x94` (em-dash), `\xe2\x86\x92` (arrow) — NOT `\xc3\xa2\xc2\x80` (mojibake) |
| 4 | Ask Yuri to edit the file (add a line with →) | Edit succeeds, new content has correct UTF-8 |

### G. Long voice session does NOT degrade (BUG 3)

| Step | Action | Expected |
|---|---|---|
| 1 | `bash _SYSTEM/Scripts/voice/voice-stop.sh` | All voice processes killed (clean slate) |
| 2 | `yuri` | Brain + voice loop start clean |
| 3 | Talk to Yuri for 10+ minutes (many turns) | TTS stays clear, no broadcast_shapes crash storm, no memory growth |
| 4 | Watch Activity Monitor | Python (bot.py) memory stays bounded (~2GB MLX cap) |
| 5 | `Ctrl-C` to stop, then `yuri` again | Clean restart — no orphan processes from the previous session |

### H. Clean restart (BUG 3 + BUG 4)

| Step | Action | Expected |
|---|---|---|
| 1 | While Yuri is running, open another terminal | — |
| 2 | `ps aux \| grep voice-mlx-server` | Should be ZERO voice-mlx-server processes (orphan killed on yuri.sh start) |
| 3 | `ps aux \| grep -E "bot.py\|yuri-z-brain"` | Exactly one bot.py + one yuri-z-brain.py |
| 4 | Stop with Ctrl-C, then `voice-stop.sh`, then `yuri` | Full clean cycle works |

### I. JARVIS dispatch mode on GLM (BUG 5)

| Step | Action | Expected |
|---|---|---|
| 1 | Terminal 1: `bash _SYSTEM/Scripts/voice/yuri-worker.sh` | Worker opens on GLM-5.2 |
| 2 | Terminal 2: `YURI_DISPATCH=1 bash _SYSTEM/Scripts/voice/yuri-jarvis.sh` | GLM brain (:8014) starts, NOT claude-p-brain |
| 3 | Say: "Yuri, have the worker run the test suite" | Yuri says "Sent it to the worker" — the task appears in the worker terminal |
| 4 | Check no `claude -p` processes | `ps aux \| grep "claude.*-p"` returns nothing |

### J. No claude -p anywhere (BUG 5 audit)

| Step | Action | Expected |
|---|---|---|
| 1 | `ps aux \| grep "claude.*-p\|claude.*--print"` | Zero matches (forbidden launch shape) |
| 2 | `grep -rn "claude-p-brain\|claude-brain-proxy" _SYSTEM/Scripts/voice/*.sh \| grep -v pkill \| grep -v "#"` | Only comments + pkill lines — no active startup |
| 3 | Launch via `yuri`, `yuri-jarvis`, `run-yuri`, `run-voice` — check brain port | All start GLM brain on :8014 |
