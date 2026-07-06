# GLM Upgrade Changelog — Yuri JARVIS Phase 2

**Date:** 2026-06-19
**Build lane:** GLM-5.2 (YURI NANO SWARM node)
**Verify lane:** Claude/Opus
**Scope:** `_SYSTEM/Scripts/voice/*` (voice subsystem)

---

## Files Touched

### 1. `yuri-z-brain.py` — the GLM voice brain (:8014)

**BUG 2 fix (UTF-8 mojibake):**
- Added `_fix_mojibake(s)` function (after `_strip_think`, line ~314). Repairs UTF-8-as-latin1 mojibake (em-dash `—` → `â€"`, arrow `→` → `â†'`, smart quotes) via `s.encode("latin-1").decode("utf-8")`. Clean text is unchanged (round-trip is identity for valid UTF-8); legitimate latin-1 accents survive; ASCII is a no-op.
- Applied `_fix_mojibake` to `write_file` content (line ~442): `content = _fix_mojibake(args.get("content") or "")`.
- Applied `_fix_mojibake` to `edit_file` old_string + new_string (line ~452): `old = _fix_mojibake(...)`, `new = _fix_mojibake(...)`.
- **Verification:** 64/64 regression checks pass, including a write→read round-trip with em-dash, arrow, smart quotes, and ellipsis — all bytes correct UTF-8 on disk, no mojibake.

**BUG 5 fix (dispatch wired into GLM brain):**
- Added `DISPATCH` and `WORKER_TARGET` env vars (line ~100-104): `DISPATCH = os.environ.get("YURI_DISPATCH", "0") == "1"`, `WORKER_TARGET = os.environ.get("YURI_WORKER_TARGET", "yuri-worker:0.0")`.
- Added `_DISPATCH_NOTE` appended to `SYSTEM` when `DISPATCH` is true (line ~113-122): instructs the model it can emit `DISPATCH:` lines to delegate to the watched worker terminal.
- Added `_handle_dispatch(reply)` function (after `_fix_mojibake`, line ~335): extracts `DISPATCH:` lines, injects them into the worker tmux pane via `tmux send-keys -l` + `Enter`, returns only the spoken remainder. Pass-through when dispatch is off.
- Wired `_handle_dispatch` into `_run_agent_loop` (line ~668): `reply = _handle_dispatch(reply)` applied to every final reply before history save.

### 2. `yuri-worker.sh` — worker terminal launcher

**BUG 1 fix (split worker spawn → unified on GLM):**
- Changed the tmux launch from `tmux send-keys ... -l "claude"` (the paid binary) to `tmux send-keys ... -l "export ZAI_MODEL=glm-5.2 && '$REPO/_SYSTEM/Scripts/ai' claude-zai"` — workers now land on GLM-5.2 (Z.ai Coding Plan), not the paid `claude` binary.
- Updated header docs to reflect GLM-5.2 default.
- **Verification:** `bash -n` syntax pass. The exact launch string verified against the `ai` script's `run_claude_zai()` which reads `ZAI_MODEL` at line 538.

### 3. `yuri-spawn-worker.sh` — worker window spawner

**BUG 1 + BUG 4 fix (GLM-5.2 default + hardened spawn):**
- Added `WORKER_MODEL="${YURI_WORKER_MODEL:-glm-5.2}"` env var for model override.
- Changed launch to `export ZAI_MODEL=${WORKER_MODEL} && '${REPO}/_SYSTEM/Scripts/ai' claude-zai` — consistent with `yuri-worker.sh`.
- Increased boot wait from 7s to 9s (GLM-5.2 cold boot in a fresh tmux is slightly slower).
- Updated echo to report GLM-5.2.
- **Verification:** `bash -n` syntax pass.

### 4. `voice-stop.sh` — NEW clean-stop helper

**BUG 3 fix (TTS degradation → clean process kill):**
- New file. Kills the ENTIRE voice process set: all brain variants (`yuri-z-brain.py`, `claude-p-brain.py`, `claude-brain-proxy.py`, `yuri-local-brain.py`), the voice bot (`bot.py`), orphan-prone MLX servers (`voice-mlx-server.py`, `voice-marvis-server.py`, `marvis_tts.py`, `voice-rick-server.py`), and stray kokoro/MLX processes. Sleeps 1s to let the OS reclaim Metal/GPU memory.
- Called by `yuri.sh` on start (clean slate before launch).
- **Verification:** `bash -n` syntax pass. Targets verified against `ps aux` showing PID 74333 (voice-mlx-server.py, running since Jun 17, 171 CPU min).

### 5. `yuri.sh` — primary voice launcher

**BUG 3 + BUG 5 fix:**
- Added `bash "$VOICE/voice-stop.sh"` call at the top (after venv check) — clean slate before every launch.
- Removed the `pkill -f claude-brain-proxy.py` / `claude-p-brain.py` / `yuri-local-brain.py` lines (now handled by `voice-stop.sh`).
- Updated header docs: removed mention of claude-p-brain.py and yuri-local-brain.py as "fallbacks" — the GLM brain (:8014) is the ONE brain.
- **Verification:** `bash -n` syntax pass.

### 6. `yuri-jarvis.sh` — JARVIS dispatch launcher

**BUG 5 fix (no more claude -p resurrection):**
- Removed `pkill -f claude-p-brain.py` (which targeted the claude -p brain).
- Changed `exec bash "$VOICE/run-yuri.sh"` (which started claude-p-brain) to `exec bash "$VOICE/yuri.sh"` (which starts the GLM brain :8014).
- Updated header docs to reflect GLM brain + never claude-p-brain.py.
- **Verification:** `bash -n` syntax pass.

### 7. `run-yuri.sh` — voice loop launcher

**BUG 5 fix (retired claude-p-brain entirely):**
- Changed `BRAIN_PORT` from `${CLAUDE_P_BRAIN_PORT:-8012}` to `"8014"` (GLM brain).
- Changed brain startup from `claude-p-brain.py` to `yuri-z-brain.py`.
- Changed `pgrep -f claude-p-brain.py` to `pgrep -f yuri-z-brain.py`.
- Changed log file from `claude-p-brain.log` to `yuri-z-brain.log`.
- Updated all docs + echo strings to reflect GLM brain, never claude -p.
- **Verification:** `bash -n` syntax pass.

### 8. `run-voice.sh` — legacy voice loop launcher

**BUG 5 fix (retired claude-brain-proxy):**
- Changed brain startup from `claude-brain-proxy.py` (:8011) to `yuri-z-brain.py` (:8014).
- Added `export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"`.
- Updated docs + echo strings.
- **Verification:** `bash -n` syntax pass.

### 9. `bot.py` — Pipecat voice pipeline

**BUG 5 fix (default brain → GLM):**
- Changed `PROXY` default from `"http://127.0.0.1:8012/v1"` (claude-p-brain) to `"http://127.0.0.1:8014/v1"` (GLM brain).
- Updated comment docs.
- **Verification:** `python3 -c "import py_compile; py_compile.compile(...)"` pass.

### 10. `kokoro_tts.py` — Kokoro TTS service

**BUG 3 fix (TTS degradation → MLX memory bound + GC):**
- Enhanced `_clear_mlx_cache()` (line ~25): now calls `mx.metal.clear_cache()` FIRST (the Metal-specific path), falls back to `mx.clear_cache()`. Added a `gc.collect()` pass so Python-side references to freed MLX arrays don't pin GPU memory.
- Added Metal memory limit in `_load()` (line ~150): `mx.metal.set_memory_limit(2048 * 1024 * 1024)` (2GB cap, override with `YURI_MLX_MEM_LIMIT_MB`). Forces the allocator to recycle pooled buffers instead of growing forever.
- **Verification:** `python3 -c "import py_compile; py_compile.compile(...)"` pass. The 2GB cap is well under M2 Pro 16GB unified memory; Kokoro-82M + Whisper-LARGE both fit.

### 11. `test_yuri_z_brain.py` — NEW regression suite

- New file. 64 checks covering: core infrastructure (13), safety floor (8), confirm-gate (12), pending action state (3), think stripping (3), **mojibake repair (7)**, **worker dispatch (7)**, tool execution with fancy punctuation (7), HTTP contract (5).
- Run: `python3 _SYSTEM/Scripts/voice/test_yuri_z_brain.py`
- **Result:** 64/64 PASS.

### 12. `yuri-local.sh` — local Ollama brain launcher

**Safety fix (avoid two brains running):**
- Added `pkill -f yuri-z-brain.py` to the brain-kill list (line 23) — ensures switching from `yuri` (GLM) to `yuri-local` (Ollama) doesn't leave both brains running.
- **Verification:** `bash -n` syntax pass.

---

## Summary of Bug Fixes

| Bug | Root Cause | Fix | Verified |
|-----|-----------|-----|----------|
| **1** (worker spawns plain claude) | `yuri-worker.sh:17` sent `"claude"` not `"ai claude-zai"` | Unified both worker scripts on `export ZAI_MODEL=glm-5.2 && ai claude-zai` | Launch string verified against `ai` script ZAI_MODEL read |
| **2** (UTF-8 mojibake) | GLM model double-encodes UTF-8 in tool_use content (emits UTF-8 bytes as latin-1 chars) | `_fix_mojibake()` sanitizer on write_file + edit_file content | Write→read round-trip: bytes correct UTF-8, no mojibake on disk |
| **3** (TTS degrades) | Orphan `voice-mlx-server.py` (PID 74333, 2 days old) holding GPU memory + no clean restart + unbounded MLX allocator | `voice-stop.sh` kills full process set; `yuri.sh` calls it on start; `kokoro_tts.py` bounds Metal memory + GC per turn | `voice-stop.sh` targets verified against live PID; memory limit code compiles |
| **4** (tmux unreliable) | Worker launch + dispatch split across two inconsistent scripts | Hardened spawn timing (9s boot wait), unified model default, consistent send-keys pattern | Syntax pass; launch string verified |
| **5** (claude -p path) | `bot.py:187` defaulted to :8012; `yuri-jarvis.sh`→`run-yuri.sh` started claude-p-brain; `run-voice.sh` started claude-brain-proxy | All 5 launchers retargeted to GLM brain (:8014); dispatch wired into GLM brain; bot.py default → :8014 | Full audit: no active path starts claude -p; dispatch verified with YURI_DISPATCH=1 |

---

## What Was NOT Changed (preserved by design)

- `claude-p-brain.py` and `claude-brain-proxy.py` remain ON DISK (not deleted) — they're neutralized (no launcher starts them), but deletion is Marcel's call. `voice-stop.sh` kills them if found running.
- `yuri-local-brain.py` + `yuri-local.sh` (local Ollama brain :8013) — untouched, intentionally separate.
- The bot.py HTTP contract (`/v1/chat/completions` + SSE + `/health`) — unchanged.
- The confirm-gate state machine — unchanged (extended with dispatch only).
- The 9 tools (bash, read_file, write_file, edit_file, spawn_worker, applescript, gui_script, open_app, screenshot) — unchanged.
- The safety floor (`.env`/secrets/catastrophe hard-refused) — unchanged.
- The model-driven design (she chooses tools) — unchanged.
